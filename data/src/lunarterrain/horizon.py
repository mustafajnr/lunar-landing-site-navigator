"""Terrain horizon masks and surface heights from LOLA south-pole DEMs.

Conventions follow CONTRACTS.md section 3: planetocentric lat/lon (ME frame),
longitude east-positive, azimuth clockwise from local north, elevation above
the plane perpendicular to the Moon-centre radius, reference sphere radius
1,737,400 m. DEM heights are relative to that sphere.

Two DEM layers (see docs/terrain-data.md):
  fine   LDEM_80S_20MPP_ADJ   20 m/px, 80-90 S  (near field)
  coarse LDEM_60S_120MPP_ADJ 120 m/px, 60-90 S  (far field, and fallback)
Both are south polar stereographic GeoTIFFs on the 1737.4 km sphere.

Library use:
    from lunarterrain import Terrain
    t = Terrain()                       # opens $LUNARNAV_DEM_DIR/*.TIF (default data/raw/)
    t.surface_height(-89.45, -137.3)    # metres above the 1737.4 km sphere
    mask = t.horizon_mask(-89.45, -137.3, observer_height_m=2.0)

CLI:
    uv run python horizon.py LAT LON [--height 2.0] [-o out.json]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

R_MOON = 1_737_400.0
# data/src/lunarterrain/horizon.py -> data/raw
RAW = Path(__file__).resolve().parents[2] / "raw"

FINE_NAME = "LDEM_80S_20MPP_ADJ"
COARSE_NAME = "LDEM_60S_120MPP_ADJ"
DEM_SOURCE = f"{FINE_NAME} + {COARSE_NAME} (LOLA, Barker et al. 2023, PGDA product 90)"

AZ_STEP_DEG = 0.5
MAX_DIST_M = 150_000.0     # ray length
FINE_MAX_DIST_M = 25_000.0  # use the fine DEM out to this distance from the site




class NoTerrain(ValueError):
    """The DEMs do not cover the point, or a ray leaves the DEMs."""


def dem_dir() -> Path:
    """DEM folder: $LUNARNAV_DEM_DIR, else data/raw/ next to this package."""
    return Path(os.environ.get("LUNARNAV_DEM_DIR") or RAW)


def dem_paths() -> tuple[Path, Path]:
    d = dem_dir()
    return d / f"{FINE_NAME}.TIF", d / f"{COARSE_NAME}.TIF"


def dems_available() -> bool:
    return all(p.is_file() for p in dem_paths())


# ---------------------------------------------------------------- geometry ---

def unit_vector(lat_deg, lon_deg):
    """Unit vector(s) from the Moon centre, shape (..., 3)."""
    la = np.radians(lat_deg)
    lo = np.radians(lon_deg)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def stereo_xy(u):
    """South polar stereographic x, y (m) of unit vectors u (..., 3).

    Same projection as the DEMs: sphere R = 1737.4 km, origin at -90,
    central meridian 0, scale 1 at the pole.
      rho = 2R cos(lat) / (1 - sin(lat)),  x = rho sin(lon),  y = rho cos(lon)
    """
    f = 2.0 * R_MOON / (1.0 - u[..., 2])
    return f * u[..., 1], f * u[..., 0]


def ray_distances(max_dist=MAX_DIST_M):
    """Sample distances (m) along a ray: 10 m steps near the site, growing to 500 m."""
    d = [10.0]
    while d[-1] < max_dist:
        d.append(d[-1] + min(500.0, max(10.0, d[-1] / 200.0)))
    return np.array(d)


# ------------------------------------------------------------------- DEMs ---

class _DemWindow:
    """A block of one DEM held in memory, with bilinear interpolation in x/y."""

    def __init__(self, ds, x_min, x_max, y_min, y_max):
        inv = ~ds.transform
        c0, r0 = inv @ (x_min, y_max)
        c1, r1 = inv @ (x_max, y_min)
        col0, row0 = int(math.floor(c0)) - 1, int(math.floor(r0)) - 1
        col1, row1 = int(math.ceil(c1)) + 1, int(math.ceil(r1)) + 1
        win = Window(col0, row0, col1 - col0, row1 - row0)
        self.data = ds.read(1, window=win, boundless=True, fill_value=np.nan).astype(np.float32)
        self.col0, self.row0 = col0, row0
        self.inv = inv

    def sample(self, x, y):
        """Bilinear height at map coords x, y (arrays). NaN outside or on no-data."""
        a, b, c, d, e, f = self.inv.a, self.inv.b, self.inv.c, self.inv.d, self.inv.e, self.inv.f
        # pixel-centre coordinates: subtract 0.5 so that integer = pixel centre
        col = a * x + b * y + c - 0.5 - self.col0
        row = d * x + e * y + f - 0.5 - self.row0
        h, w = self.data.shape
        c0 = np.floor(col).astype(np.int64)
        r0 = np.floor(row).astype(np.int64)
        ok = (c0 >= 0) & (r0 >= 0) & (c0 < w - 1) & (r0 < h - 1)
        c0c = np.clip(c0, 0, w - 2)
        r0c = np.clip(r0, 0, h - 2)
        fc = (col - c0c).astype(np.float32)
        fr = (row - r0c).astype(np.float32)
        z = self.data
        v = (z[r0c, c0c] * (1 - fc) * (1 - fr) + z[r0c, c0c + 1] * fc * (1 - fr)
             + z[r0c + 1, c0c] * (1 - fc) * fr + z[r0c + 1, c0c + 1] * fc * fr)
        return np.where(ok, v, np.nan)


class Terrain:
    """Fine + coarse LOLA DEM pair."""

    def __init__(self, fine_path=None, coarse_path=None):
        fine_default, coarse_default = dem_paths()
        self.fine = rasterio.open(fine_path or fine_default)
        self.coarse = rasterio.open(coarse_path or coarse_default)

    def close(self):
        self.fine.close()
        self.coarse.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # ---- surface height ----
    def surface_height(self, lat_deg, lon_deg):
        """Terrain height (m above the 1737.4 km sphere) at lat/lon.

        Accepts scalars or arrays. Uses the fine DEM where it has data and the
        coarse DEM elsewhere. Returns NaN outside both DEMs (north of 60 S).
        """
        scalar = np.isscalar(lat_deg) and np.isscalar(lon_deg)
        u = unit_vector(np.atleast_1d(np.asarray(lat_deg, float)), np.atleast_1d(np.asarray(lon_deg, float)))
        x, y = stereo_xy(u)
        h = self._heights_xy(x, y, use_fine=np.ones(x.shape, bool))
        return float(h[0]) if scalar else h

    def _heights_xy(self, x, y, use_fine):
        out = np.full(x.shape, np.nan, dtype=np.float64)
        for ds, mask in ((self.fine, use_fine), (self.coarse, np.ones(x.shape, bool))):
            todo = mask & np.isnan(out)
            if not todo.any():
                continue
            xs, ys = x[todo], y[todo]
            b = ds.bounds
            inside = (xs > b.left) & (xs < b.right) & (ys > b.bottom) & (ys < b.top)
            if not inside.any():
                continue
            win = _DemWindow(ds, xs[inside].min(), xs[inside].max(), ys[inside].min(), ys[inside].max())
            vals = np.full(xs.shape, np.nan)
            vals[inside] = win.sample(xs[inside], ys[inside])
            out[todo] = vals
        return out

    # ---- horizon mask ----
    def horizon_mask(self, lat_deg, lon_deg, observer_height_m=2.0, az_step_deg=AZ_STEP_DEG,
                     max_dist_m=MAX_DIST_M, fine_max_dist_m=FINE_MAX_DIST_M):
        """Horizon elevation (deg) for each azimuth 0, step, ..., 360-step.

        For each azimuth, march along the great circle from the site out to
        max_dist_m. At each sample, take the DEM height, build the exact 3D
        vector from the observer to the terrain point, and compute its
        elevation above the observer's local horizontal plane. The mask value
        is the maximum along the ray. Lunar curvature is included because all
        points are true 3D positions on the sphere + DEM height.

        Returns (elevation_deg array, site surface height in m).
        Raises NoTerrain if the site or any ray sample has no DEM height.
        """
        if abs(lat_deg) >= 90.0:
            raise ValueError("latitude must not be exactly +/-90 (north is undefined)")
        u0 = unit_vector(lat_deg, lon_deg)
        la, lo = math.radians(lat_deg), math.radians(lon_deg)
        north = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
        east = np.array([-math.sin(lo), math.cos(lo), 0.0])

        h_site = self.surface_height(lat_deg, lon_deg)
        if not np.isfinite(h_site):
            raise NoTerrain(f"no DEM height at ({lat_deg}, {lon_deg}). The DEMs cover 60-90 S.")
        p_obs = (R_MOON + h_site + observer_height_m) * u0

        az = np.radians(np.arange(0.0, 360.0, az_step_deg))       # (A,)
        dist = ray_distances(max_dist_m)                           # (D,)
        theta = dist / R_MOON
        dirs = np.cos(az)[:, None] * north + np.sin(az)[:, None] * east       # (A, 3)
        # great-circle points: u = cos(theta) u0 + sin(theta) dir  -> (A, D, 3)
        u = np.cos(theta)[None, :, None] * u0 + np.sin(theta)[None, :, None] * dirs[:, None, :]
        x, y = stereo_xy(u)
        use_fine = np.broadcast_to(dist <= fine_max_dist_m, x.shape)
        hgt = self._heights_xy(x.ravel(), y.ravel(), use_fine.ravel()).reshape(x.shape)
        if np.isnan(hgt).any():
            raise NoTerrain(
                f"the horizon rays from ({lat_deg}, {lon_deg}) leave the DEMs "
                f"(ray length {max_dist_m / 1000:.0f} km, DEM coverage 60-90 S)")

        q = (R_MOON + hgt)[..., None] * u                          # terrain points (A, D, 3)
        v = q - p_obs
        up = v @ u0
        horiz = np.sqrt(np.maximum(np.einsum("adk,adk->ad", v, v) - up * up, 0.0))
        elev = np.degrees(np.arctan2(up, horiz))
        return elev.max(axis=1), h_site


def make_mask_json(terrain, lat_deg, lon_deg, observer_height_m=2.0):
    """Horizon mask as the CONTRACTS.md section 6 dict, and the site height (m).

    Raises NoTerrain if the DEMs do not cover the point and its rays.
    """
    elev, h_site = terrain.horizon_mask(lat_deg, lon_deg, observer_height_m)
    return {
        "lat_deg": lat_deg,
        "lon_deg": lon_deg,
        "observer_height_m": observer_height_m,
        "surface_height_m": round(float(h_site), 2),
        "dem_source": DEM_SOURCE,
        "az_step_deg": AZ_STEP_DEG,
        "elevation_deg": [round(float(e), 3) for e in elev],
    }, h_site


def main(argv=None):
    p = argparse.ArgumentParser(description="Compute a terrain horizon mask (CONTRACTS.md section 6).")
    p.add_argument("lat", type=float, help="latitude, deg (planetocentric)")
    p.add_argument("lon", type=float, help="longitude, deg east (-180..180)")
    p.add_argument("--height", type=float, default=2.0, help="observer height above terrain, m (default 2)")
    p.add_argument("-o", "--output", help="output JSON path (default: stdout)")
    a = p.parse_args(argv)

    t0 = time.perf_counter()
    try:
        with Terrain() as t:
            mask, h_site = make_mask_json(t, a.lat, a.lon, a.height)
    except NoTerrain as e:
        sys.exit(f"no terrain: {e}")
    dt = time.perf_counter() - t0
    e = np.array(mask["elevation_deg"])
    print(f"site height {h_site:.1f} m; horizon min {e.min():.2f}, mean {e.mean():.2f}, "
          f"max {e.max():.2f} deg at az {np.argmax(e) * AZ_STEP_DEG:.1f}; {dt:.2f} s", file=sys.stderr)
    text = json.dumps(mask, indent=1)
    if a.output:
        Path(a.output).parent.mkdir(parents=True, exist_ok=True)
        Path(a.output).write_text(text + "\n")
    else:
        print(text)


if __name__ == "__main__":
    main()
