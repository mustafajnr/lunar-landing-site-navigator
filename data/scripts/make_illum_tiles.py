"""Make south-pole tiles of the NASA PGDA average Sun and Earth visibility maps, in the NASA
Moon Trek SP tile grid (the same z/row/col layout as make_slope_tiles.py).

Usage (from data/):
    uv run python scripts/make_illum_tiles.py [--src DIR] [--out DIR] [--max-z 7] [--workers N]

Input: NASA PGDA product 69 (https://pgda.gsfc.nasa.gov/products/69, Mazarico et al. 2011,
Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030), GeoTIFF, south polar stereographic,
sphere R = 1737400 m:
    AVGVISIB_85S_060M_201608.TIF        Sun,   60 m, +/-151740 m (85 S and south)
    AVGVISIB_85S_060M_201608_EARTH.TIF  Earth, 60 m
    AVGVISIB_75S_120M_201608.TIF        Sun,   120 m, +/-457440 m (75 S and south)
    AVGVISIB_75S_120M_201608_EARTH.TIF  Earth, 120 m
Default folder: $LUNARNAV_PGDA_DIR, else /home/mustafajnr/hackathon/data/raw/pgda. Read only.

Values: int16 DN, nodata -32768. The PDS labels (imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/*.LBL)
and the GeoTIFF band scale give AVERAGE_VISIBILITY = DN * 0.00004 + 0, so DN 25000 = 1 (100 %).
The value is the fraction of hourly time steps (18.6 years) with any part of the disc visible.

Method:
1. Each tile pixel is the MEAN of the source pixels inside it (GDAL "average" resampling).
   The 60 m map is used where it has data, the 120 m map elsewhere. Pixels north of 75 S
   (rho > 457440 m) are transparent.
2. Max zoom 7 (66.9 m/px): the first Trek level that is not much finer than 60 m. The UI
   overzooms above it.
3. Indexed PNG: index 0 = no data (fully transparent), index 1 + round(pct) for 0-100 %, inferno
   colour scale, alpha 160 of 255. Tiles with no data are not written.

Output: DIR/illum_sun/{z}/{row}/{col}.png, DIR/illum_earth/{z}/{row}/{col}.png, and an
index.json in each folder.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import time
import zlib
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject

from make_slope_tiles import SP_HALF, SP_RES0, TILE, R_MOON, _png_chunk, tile_bounds

import struct

RHO_75S = 457440.0  # 2 R tan(7.5 deg) = 457437 m; the 120 m map half-width
DN_SCALE = 0.00004  # PDS label SCALING_FACTOR (also the GeoTIFF band scale)
NODATA = -32768
ALPHA = 160
# Inferno at 0, 0.1, ... 1.0 (matplotlib). Dark = little light, yellow = much light.
INFERNO = ["#000004", "#160b39", "#420a68", "#6a176e", "#932667", "#bc3754",
           "#dd513a", "#f37819", "#fca50a", "#f6d746", "#fcffa4"]
SETS = {
    "illum_sun": ("AVGVISIB_85S_060M_201608.TIF", "AVGVISIB_75S_120M_201608.TIF"),
    "illum_earth": ("AVGVISIB_85S_060M_201608_EARTH.TIF", "AVGVISIB_75S_120M_201608_EARTH.TIF"),
}


def default_src() -> Path:
    d = os.environ.get("LUNARNAV_PGDA_DIR")
    return Path(d) if d else Path("/home/mustafajnr/hackathon/data/raw/pgda")


def inferno(f: float) -> tuple[int, int, int]:
    """Inferno colour at f in [0, 1], linear between the 11 anchors."""
    f = min(1.0, max(0.0, f)) * 10
    i = min(9, int(f))
    t = f - i
    a, b = bytes.fromhex(INFERNO[i][1:]), bytes.fromhex(INFERNO[i + 1][1:])
    return tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))


def palette() -> tuple[bytes, bytes]:
    plte = bytes([0, 0, 0]) + b"".join(bytes(inferno(p / 100)) for p in range(101))
    trns = bytes([0] + [ALPHA] * 101)
    return plte, trns


PLTE, TRNS = palette()


def png_bytes(idx: np.ndarray) -> bytes:
    raw = b"".join(b"\x00" + idx[r].tobytes() for r in range(idx.shape[0]))
    ihdr = struct.pack(">IIBBBBB", idx.shape[1], idx.shape[0], 8, 3, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"PLTE", PLTE)
            + _png_chunk(b"tRNS", TRNS) + _png_chunk(b"IDAT", zlib.compress(raw, 9)) + _png_chunk(b"IEND", b""))


def read_pct(ds, x0: float, y1: float, res: float) -> np.ndarray:
    """Mean visibility (%) of ds in a 256 x 256 tile grid; NaN where no data."""
    dst = np.full((TILE, TILE), np.nan, np.float32)
    reproject(
        source=rasterio.band(ds, 1), destination=dst,
        src_transform=ds.transform, src_crs=ds.crs, src_nodata=NODATA,
        dst_transform=Affine(res, 0, x0, 0, -res, y1), dst_crs=ds.crs, dst_nodata=np.nan,
        resampling=Resampling.average,
    )
    return dst * (DN_SCALE * 100)


def overlaps(ds, x0, y0, x1, y1) -> bool:
    b = ds.bounds
    return x0 < b.right and x1 > b.left and y0 < b.top and y1 > b.bottom


_G: dict = {}


def _init(src: str, out: str):
    _G["ds"] = {k: [rasterio.open(Path(src) / f) for f in fs] for k, fs in SETS.items()}
    _G["out"] = Path(out)


def _job(ztc):
    z, row, col = ztc
    x0, y0, x1, y1, res = tile_bounds(z, row, col)
    xs = x0 + (np.arange(TILE) + 0.5) * res
    ys = y1 - (np.arange(TILE) + 0.5) * res
    outside = (xs[None, :] ** 2 + ys[:, None] ** 2) > RHO_75S**2
    sizes = {}
    for name, (fine, coarse) in _G["ds"].items():
        v = read_pct(coarse, x0, y1, res)
        if overlaps(fine, x0, y0, x1, y1):
            f = read_pct(fine, x0, y1, res)
            v = np.where(np.isfinite(f), f, v)
        v[outside] = np.nan
        ok = np.isfinite(v)
        if not ok.any():
            sizes[name] = 0
            continue
        idx = np.zeros((TILE, TILE), np.uint8)
        idx[ok] = 1 + np.clip(np.rint(v[ok]), 0, 100).astype(np.uint8)
        p = _G["out"] / name / str(z) / str(row) / f"{col}.png"
        p.parent.mkdir(parents=True, exist_ok=True)
        b = png_bytes(idx)
        p.write_bytes(b)
        sizes[name] = len(b)
    return ztc, sizes


def tiles_for(max_z: int) -> list[tuple[int, int, int]]:
    out = []
    for z in range(max_z + 1):
        span = SP_RES0 / 2**z * TILE
        c0, c1 = int((-RHO_75S + SP_HALF) // span), int((RHO_75S + SP_HALF) // span)
        for r in range(c0, c1 + 1):
            for c in range(c0, c1 + 1):
                x0, y0, x1, y1, _ = tile_bounds(z, r, c)
                nx, ny = min(max(0.0, x0), x1), min(max(0.0, y0), y1)
                if nx * nx + ny * ny <= RHO_75S**2:
                    out.append((z, r, c))
    return out


def main(argv=None):
    here = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", type=Path, default=default_src())
    ap.add_argument("--out", type=Path, default=here / "cache" / "illum_tiles")
    ap.add_argument("--max-z", type=int, default=7, help="7 = 66.9 m/px, about the 60 m source")
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 4)
    a = ap.parse_args(argv)
    for fs in SETS.values():
        for f in fs:
            with rasterio.open(a.src / f) as d:
                assert d.dtypes[0] == "int16" and d.nodata == NODATA, f
                assert abs(d.scales[0] - DN_SCALE) < 1e-12 and d.offsets[0] == 0, f"{f}: scale {d.scales}"
                assert "1737400" in d.crs.to_wkt(), f
    t0 = time.time()
    jobs = tiles_for(a.max_z)
    print(f"tiles to render: {len(jobs)} per set (z 0-{a.max_z})", flush=True)
    index = {k: {} for k in SETS}
    total = {k: 0 for k in SETS}
    with Pool(a.workers, _init, (str(a.src), str(a.out))) as p:
        for k, ((z, r, c), sizes) in enumerate(p.imap_unordered(_job, jobs, chunksize=4)):
            for name, s in sizes.items():
                if s:
                    index[name].setdefault(str(z), []).append([r, c])
                    total[name] += s
            if (k + 1) % 500 == 0:
                print(f"  tiles {k + 1}/{len(jobs)}, {time.time() - t0:.0f} s", flush=True)
    for name, fs in SETS.items():
        for v in index[name].values():
            v.sort()
        meta = {
            "version": 1,
            "source": f"NASA PGDA product 69 (Mazarico et al. 2011): {fs[0]} (60 m) and {fs[1]} (120 m), "
                      "mean per tile pixel, value = DN * 0.00004 (fraction of time steps)",
            "grid": "NASA Moon Trek SP (z/row/col), 256 px, 8561.953125 m/px at z 0",
            "palette": "index 0 = no data, index 1 + pct (0-100 %), inferno",
            "alpha": ALPHA,
            "tiles": index[name],
        }
        (a.out / name).mkdir(parents=True, exist_ok=True)
        (a.out / name / "index.json").write_text(json.dumps(meta, separators=(",", ":")))
        n = sum(len(v) for v in index[name].values())
        print(f"{name}: {n} tiles, {total[name] / 1e6:.1f} MB")
    print(f"done in {time.time() - t0:.0f} s -> {a.out}")


if __name__ == "__main__":
    main()
