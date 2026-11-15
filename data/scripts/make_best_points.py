"""Find the 5 best points inside each curated south-polar site from the NASA PGDA average
Sun and Earth visibility maps. Output: ui/public/bestpoints.json.

Usage (from data/):
    uv run python scripts/make_best_points.py [--pgda DIR] [--dem PATH] [--sites FILE] [--out FILE]

Inputs (read only):
- NASA PGDA product 69 (Mazarico et al. 2011), see make_illum_tiles.py. The 60 m maps
  (85 S and south) if the whole site circle is inside them, else the 120 m maps (75 S and south).
  Value = DN * 0.00004 (fraction of hourly time steps over 18.6 years), shown here in %.
- LOLA LDEM_80S_20MPP_ADJ (20 m), for slope. Default: $LUNARNAV_DEM_DIR, else the main
  checkout data/raw.

Rule, per site (all sites.json entries south of 75 S with radius_m, candidates and past landings):
1. Candidates = PGDA map pixels with the pixel centre inside the search circle. The search
   circle is the site circle, but at least 5 km in radius (a 500 m landing site gets a 5 km
   circle).
2. Slope of a candidate = the MAXIMUM Horn slope of the 20 m DEM pixels inside the map pixel
   (3 x 3 at 60 m, 6 x 6 at 120 m). Keep only slope < 15 deg. North of 80 S the 20 m DEM has
   no data: there the slope filter is skipped and slope_deg is null (no curated site is there now).
3. Score = (sun % + earth %) / 2. Highest score first.
4. Greedy: keep a candidate only if it is at least 500 m (ground) from each kept point.
   Stop at 5 points.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

R = 1737400.0
DN_SCALE = 0.00004
NODATA = -32768
MAX_SLOPE = 15.0
MIN_SEP = 500.0
N_BEST = 5
MIN_SEARCH_R = 5000.0  # search circle = max(site radius, 5 km), so small landing sites get a list
RHO_80S = 2 * R * math.tan(math.radians(10) / 2)
MAPS = {
    60: ("AVGVISIB_85S_060M_201608.TIF", "AVGVISIB_85S_060M_201608_EARTH.TIF"),
    120: ("AVGVISIB_75S_120M_201608.TIF", "AVGVISIB_75S_120M_201608_EARTH.TIF"),
}
CITATION = (
    "NASA PGDA product 69, LOLA average Sun and Earth visibility (https://pgda.gsfc.nasa.gov/products/69). "
    "Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), Illumination "
    "conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066-1081, "
    "doi:10.1016/j.icarus.2010.10.030. Slope: LOLA LDEM_80S_20MPP_ADJ (20 m)."
)
RULE = (
    "Rank by the mean of average sunlight % and average Earth visibility %. "
    "Keep only points with slope < 15° (steepest 20 m DEM slope in the map pixel). "
    "Keep points at least 500 m apart. Search inside the site circle, but at least 5 km from the site centre."
)


def ll_to_xy(lat: float, lon: float) -> tuple[float, float]:
    rho = 2 * R * math.tan(math.radians(90 + lat) / 2)
    return rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))


def xy_to_ll(x: float, y: float) -> tuple[float, float]:
    rho = math.hypot(x, y)
    lat = -90 + math.degrees(2 * math.atan(rho / (2 * R)))
    return lat, math.degrees(math.atan2(x, y))


def kscale(x, y):
    """Stereographic scale (map m per ground m)."""
    return 1 + (x * x + y * y) / (4 * R * R)


def horn_slope(h: np.ndarray, x: np.ndarray, y: np.ndarray, px: float) -> np.ndarray:
    """Slope (deg) of the inner pixels of h (n+2, m+2); same method as make_slope_tiles.py."""
    a, b, c = h[:-2, :-2], h[:-2, 1:-1], h[:-2, 2:]
    d, f = h[1:-1, :-2], h[1:-1, 2:]
    g, hh, i = h[2:, :-2], h[2:, 1:-1], h[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * px)
    dzdy = ((g + 2 * hh + i) - (a + 2 * b + c)) / (8 * px)
    k = kscale(x[None, :], y[:, None])
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy) * k))


def best_for_site(s: dict, pgda: Path, dem: rasterio.DatasetReader) -> dict:
    x, y = ll_to_xy(s["lat_deg"], s["lon_deg"])
    search_r = max(float(s["radius_m"]), MIN_SEARCH_R)
    r_map = search_r * kscale(x, y)  # circle radius in map metres (good enough at site scale)
    with rasterio.open(pgda / MAPS[60][0]) as f:
        b = f.bounds
        res = 60 if (x - r_map > b.left and x + r_map < b.right and y - r_map > b.bottom and y + r_map < b.top) else 120
    sun_ds, earth_ds = (rasterio.open(pgda / n) for n in MAPS[res])
    t = sun_ds.transform
    c0 = max(0, int((x - r_map - t.c) // res))
    c1 = min(sun_ds.width, int((x + r_map - t.c) // res) + 1)
    r0 = max(0, int((t.f - (y + r_map)) // res))
    r1 = min(sun_ds.height, int((t.f - (y - r_map)) // res) + 1)
    win = Window(c0, r0, c1 - c0, r1 - r0)
    sun = sun_ds.read(1, window=win).astype(np.float64)
    earth = earth_ds.read(1, window=win).astype(np.float64)
    valid = (sun != NODATA) & (earth != NODATA)
    sun *= DN_SCALE * 100
    earth *= DN_SCALE * 100
    xs = t.c + (np.arange(c0, c1) + 0.5) * res
    ys = t.f - (np.arange(r0, r1) + 0.5) * res
    inside = ((xs[None, :] - x) ** 2 + (ys[:, None] - y) ** 2) <= r_map**2
    # Slope: max of the 20 m slope inside each map pixel.
    slope = np.full(sun.shape, np.nan)
    td = dem.transform
    q = res // 20
    dc0 = round((t.c + c0 * res - td.c) / 20)
    dr0 = round((td.f - (t.f - r0 * res)) / 20)
    nr, nc = (r1 - r0) * q, (c1 - c0) * q
    a0, a1 = max(0, dr0 - 1), min(dem.height, dr0 + nr + 1)
    b0, b1 = max(0, dc0 - 1), min(dem.width, dc0 + nc + 1)
    if a1 > a0 and b1 > b0:
        h = np.full((nr + 2, nc + 2), np.nan, np.float32)
        h[a0 - (dr0 - 1): a1 - (dr0 - 1), b0 - (dc0 - 1): b1 - (dc0 - 1)] = dem.read(1, window=Window(b0, a0, b1 - b0, a1 - a0))
        if dem.nodata is not None:
            h[h == dem.nodata] = np.nan
        dx = td.c + (np.arange(dc0, dc0 + nc) + 0.5) * 20
        dy = td.f - (np.arange(dr0, dr0 + nr) + 0.5) * 20
        s20 = horn_slope(h, dx, dy, 20.0)
        s20 = np.where(np.isfinite(s20), s20, np.inf)  # a gap never passes the filter
        slope = s20.reshape(r1 - r0, q, c1 - c0, q).max(axis=(1, 3))
        slope[~np.isfinite(slope)] = np.nan
    in_dem = (xs[None, :] ** 2 + ys[:, None] ** 2) <= RHO_80S**2
    score = (sun + earth) / 2
    ok = valid & inside & (~in_dem | (np.nan_to_num(slope, nan=99) < MAX_SLOPE))
    rr, cc = np.nonzero(ok)
    order = np.argsort(-score[rr, cc], kind="stable")
    kept: list[tuple[float, float]] = []
    points = []
    for j in order:
        i, k = rr[j], cc[j]
        px, py = xs[k], ys[i]
        sep = MIN_SEP * kscale(px, py)
        if any((px - u) ** 2 + (py - v) ** 2 < sep * sep for u, v in kept):
            continue
        kept.append((px, py))
        lat, lon = xy_to_ll(px, py)
        points.append({
            "lat_deg": round(lat, 5),
            "lon_deg": round(lon, 5),
            "sun_pct": round(float(sun[i, k]), 1),
            "earth_pct": round(float(earth[i, k]), 1),
            "slope_deg": round(float(slope[i, k]), 1) if in_dem[i, k] and np.isfinite(slope[i, k]) else None,
        })
        if len(points) == N_BEST:
            break
    sun_ds.close()
    earth_ds.close()
    return {"map_m": res, "candidates": int(ok.sum()), "points": points, "search_radius_m": search_r}


def main(argv=None):
    here = Path(__file__).resolve().parent.parent
    d = os.environ.get("LUNARNAV_DEM_DIR")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pgda", type=Path, default=Path(os.environ.get("LUNARNAV_PGDA_DIR", "/home/mustafajnr/hackathon/data/raw/pgda")))
    ap.add_argument("--dem", type=Path, default=(Path(d) if d else Path("/home/mustafajnr/hackathon/data/raw")) / "LDEM_80S_20MPP_ADJ.TIF")
    ap.add_argument("--sites", type=Path, default=here / "sites.json")
    ap.add_argument("--out", type=Path, default=here.parent / "ui" / "public" / "bestpoints.json")
    a = ap.parse_args(argv)
    sites = [s for s in json.loads(a.sites.read_text()) if s["lat_deg"] < -75 and s.get("radius_m")]
    out = {"version": 1, "source": CITATION, "rule": RULE, "sites": {}}
    with rasterio.open(a.dem) as dem:
        assert abs(dem.transform.a - 20) < 1e-9, "expects the 20 m DEM"
        for s in sites:
            r = best_for_site(s, a.pgda, dem)
            out["sites"][s["id"]] = {"search_radius_m": r["search_radius_m"], "points": r["points"]}
            print(f"{s['id']}: {r['map_m']} m map, {r['candidates']} candidates")
            for n, p in enumerate(r["points"], 1):
                print(f"   {n}. sun {p['sun_pct']} %, earth {p['earth_pct']} %, slope {p['slope_deg']}°  ({p['lat_deg']}, {p['lon_deg']})")
    a.out.write_text(json.dumps(out, indent=1) + "\n")
    print(f"-> {a.out}")


if __name__ == "__main__":
    main()
