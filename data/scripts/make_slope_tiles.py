"""Make south-pole slope tiles from the LOLA 20 m DEM, in the NASA Moon Trek SP tile grid.

Usage (from data/):
    uv run python scripts/make_slope_tiles.py [--dem PATH] [--out DIR] [--area sites|disk]
                                              [--sites FILE] [--margin-km 15] [--max-z 9]
                                              [--workers N] [--reuse]

Input: LDEM_80S_20MPP_ADJ.TIF (south polar stereographic, sphere R = 1737400 m, 20 m pixels,
heights in m). Default path: $LUNARNAV_DEM_DIR/LDEM_80S_20MPP_ADJ.TIF, else
../data/raw/LDEM_80S_20MPP_ADJ.TIF of the main checkout. The DEM is read only.

Method:
1. Slope at the native 20 m grid with the Horn (1981) 3 x 3 method. The ground pixel size is
   20 m / k, with k = 1 + rho^2 / (4 R^2) the stereographic scale factor (k = 1.0077 at 80 S).
   Each pixel gets one of 6 fixed classes (deg): <5, 5-10, 10-15, 15-20, 20-30, >=30.
   Class 0 = no data (DEM gap, or north of 80 S, rho > 304000 m).
2. Tiles: the same z/row/col as Trek SP (origin -1095930, +1095930; 8561.953125 m/px at z 0;
   256 px). Each tile pixel shows the MAXIMUM class of the 20 m DEM pixels that it touches.
   Why the maximum: a steep spot never disappears at a coarse zoom. A pixel that shows
   "<5 deg" is flat everywhere inside it. At zoom 9 (16.7 m/px) the tile pixel is smaller than
   the DEM pixel, so it shows the class of the DEM pixel (or of the steeper one of two).
3. Indexed PNG (8 bit palette + tRNS): classes 1-6 partly transparent (viridis steps,
   colour-blind safe), class 0 fully transparent. Tiles with no data are not written.

Output: DIR/{z}/{row}/{col}.png, DIR/index.json (zoom -> list of [row, col] written, and the
legend). Work file: DIR/../slope_classes_20m.u8 (raw uint8 30400 x 30400, about 0.9 GB; kept
for --reuse).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import time
import zlib
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

R_MOON = 1737400.0
SP_HALF = 1095930.0
SP_RES0 = 8561.953125
TILE = 256
RHO_MAX = 2 * R_MOON * math.tan(math.radians(10) / 2)  # 80 S: colatitude 10 deg -> 304000 m
EDGES = [5.0, 10.0, 15.0, 20.0, 30.0]
LABELS = ["<5", "5-10", "10-15", "15-20", "20-30", ">=30"]
# Viridis at 0, 0.2, 0.4, 0.6, 0.8, 1.0 (low slope = dark blue/purple, steep = yellow).
COLOURS = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"]
ALPHA = 150  # of 255: the imagery shows through

DEFAULT_DEM_NAME = "LDEM_80S_20MPP_ADJ.TIF"


def default_dem() -> Path:
    d = os.environ.get("LUNARNAV_DEM_DIR")
    if d:
        return Path(d) / DEFAULT_DEM_NAME
    return Path("/home/mustafajnr/hackathon/data/raw") / DEFAULT_DEM_NAME


# ---------- phase 1: slope classes at 20 m ----------

_G: dict = {}


def _init_slope(dem: str, work: str, shape: tuple[int, int]):
    _G["dem"] = rasterio.open(dem)
    _G["cls"] = np.memmap(work, dtype=np.uint8, mode="r+", shape=shape)


def slope_classes(h: np.ndarray, x: np.ndarray, y: np.ndarray, px: float) -> np.ndarray:
    """Slope classes (1-6, 0 = no data) of the inner pixels of h (shape (n+2, m+2)).
    x (m,), y (n,): projected coordinates of the inner pixel centres (m)."""
    a, b, c = h[:-2, :-2], h[:-2, 1:-1], h[:-2, 2:]
    d, f = h[1:-1, :-2], h[1:-1, 2:]
    g, hh, i = h[2:, :-2], h[2:, 1:-1], h[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * px)
    dzdy = ((g + 2 * hh + i) - (a + 2 * b + c)) / (8 * px)
    rho2 = x[None, :] ** 2 + y[:, None] ** 2
    k = 1 + rho2 / (4 * R_MOON**2)  # map metres per ground metre
    s = np.degrees(np.arctan(np.hypot(dzdx, dzdy) * k))
    out = (np.digitize(s, EDGES) + 1).astype(np.uint8)
    out[~np.isfinite(s) | (rho2 > RHO_MAX**2)] = 0
    return out


def _slope_strip(r0: int) -> int:
    d, cls = _G["dem"], _G["cls"]
    n, m = cls.shape
    r1 = min(n, r0 + 256)
    # Strip with a 1 px halo; NaN outside the DEM.
    a0, a1 = max(0, r0 - 1), min(n, r1 + 1)
    h = np.full((r1 - r0 + 2, m + 2), np.nan, np.float32)
    h[a0 - (r0 - 1) : a1 - (r0 - 1), 1:-1] = d.read(1, window=Window(0, a0, m, a1 - a0))
    t = d.transform
    x = t.c + (np.arange(m) + 0.5) * t.a
    y = t.f + (np.arange(r0, r1) + 0.5) * t.e
    cls[r0:r1] = slope_classes(h, x, y, t.a)
    return r1 - r0


def build_classes(dem: str, work: Path, workers: int, reuse: bool) -> tuple[np.memmap, rasterio.Affine]:
    with rasterio.open(dem) as d:
        shape, t = (d.height, d.width), d.transform
        assert abs(t.a - 20) < 1e-9 and abs(t.e + 20) < 1e-9, "expects 20 m pixels"
        assert abs(d.crs.to_dict().get("R", R_MOON) - R_MOON) < 1 or "1737400" in d.crs.to_wkt()
    if not (reuse and work.exists() and work.stat().st_size == shape[0] * shape[1]):
        work.parent.mkdir(parents=True, exist_ok=True)
        np.memmap(work, dtype=np.uint8, mode="w+", shape=shape).flush()
        t0 = time.time()
        rows = list(range(0, shape[0], 256))
        with Pool(workers, _init_slope, (dem, str(work), shape)) as p:
            done = 0
            for k in p.imap_unordered(_slope_strip, rows):
                done += k
                if done % (256 * 20) == 0:
                    print(f"  slope {done}/{shape[0]} rows, {time.time() - t0:.0f} s", flush=True)
        print(f"slope classes: {time.time() - t0:.0f} s", flush=True)
    else:
        print(f"slope classes: reuse {work}")
    return np.memmap(work, dtype=np.uint8, mode="r", shape=shape), t


# ---------- phase 2: tiles ----------


def tile_bounds(z: int, row: int, col: int) -> tuple[float, float, float, float, float]:
    res = SP_RES0 / 2**z
    x0 = -SP_HALF + col * TILE * res
    y1 = SP_HALF - row * TILE * res
    return x0, y1 - TILE * res, x0 + TILE * res, y1, res


def windows_1d(start: float, res: float, origin: float, step: float, n: int) -> tuple[np.ndarray, np.ndarray]:
    """For 256 output pixels from `start` (step res, along +axis), the DEM index range
    [lo, hi) of the DEM pixels that each one touches. DEM pixel i covers origin + i*step
    ... origin + (i+1)*step (step may be negative)."""
    e0 = start + np.arange(TILE) * res
    e1 = e0 + res
    a = (e0 - origin) / step
    b = (e1 - origin) / step
    lo = np.floor(np.minimum(a, b) + 1e-6).astype(np.int64)
    hi = np.ceil(np.maximum(a, b) - 1e-6).astype(np.int64)
    return np.clip(lo, 0, n), np.clip(hi, 0, n)


def render_tile(cls: np.ndarray, t, z: int, row: int, col: int) -> np.ndarray:
    x0, _, _, y1, res = tile_bounds(z, row, col)
    n, m = cls.shape
    clo, chi = windows_1d(x0, res, t.c, t.a, m)
    # Output rows go down from y1: use -res along y.
    rlo, rhi = windows_1d(y1, -res, t.f, t.e, n)
    out = np.zeros((TILE, TILE), np.uint8)
    vc = np.nonzero(chi > clo)[0]
    vr = np.nonzero(rhi > rlo)[0]
    if not len(vc) or not len(vr):
        return out
    c0, c1 = clo[vc[0]], chi[vc[-1]]
    tmp = np.zeros((len(vr), c1 - c0), np.uint8)
    for k, j in enumerate(vr):
        tmp[k] = cls[rlo[j] : rhi[j], c0:c1].max(axis=0)
    for j in vc:
        out[vr, j] = tmp[:, clo[j] - c0 : chi[j] - c0].max(axis=1)
    return out


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def png_bytes(idx: np.ndarray) -> bytes:
    plte = bytes([0, 0, 0]) + b"".join(bytes.fromhex(c[1:]) for c in COLOURS)
    trns = bytes([0] + [ALPHA] * len(COLOURS))
    raw = b"".join(b"\x00" + idx[r].tobytes() for r in range(idx.shape[0]))
    ihdr = struct.pack(">IIBBBBB", idx.shape[1], idx.shape[0], 8, 3, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"PLTE", plte)
            + _png_chunk(b"tRNS", trns) + _png_chunk(b"IDAT", zlib.compress(raw, 9)) + _png_chunk(b"IEND", b""))


def _init_tiles(work: str, shape, t, out: str):
    _G["cls"] = np.memmap(work, dtype=np.uint8, mode="r", shape=shape)
    _G["t"] = t
    _G["out"] = Path(out)


def _tile_job(ztc: tuple[int, int, int]):
    z, row, col = ztc
    idx = render_tile(_G["cls"], _G["t"], z, row, col)
    if not idx.any():
        return ztc, 0
    p = _G["out"] / str(z) / str(row) / f"{col}.png"
    p.parent.mkdir(parents=True, exist_ok=True)
    b = png_bytes(idx)
    p.write_bytes(b)
    return ztc, len(b)


def boxes_for(area: str, sites_file: Path, margin_m: float) -> list[tuple[float, float, float, float]]:
    if area == "disk":
        return [(-RHO_MAX, -RHO_MAX, RHO_MAX, RHO_MAX)]
    sites = json.loads(sites_file.read_text())
    out = []
    for s in sites:
        if s["lat_deg"] > -80:
            continue
        colat = math.radians(90 + s["lat_deg"])
        rho = 2 * R_MOON * math.tan(colat / 2)
        lon = math.radians(s["lon_deg"])
        # Trek SP / DEM axes: x = rho sin(lon), y = rho cos(lon) (lon 0 points up).
        x, y = rho * math.sin(lon), rho * math.cos(lon)
        h = (s.get("radius_m") or 500) + margin_m
        out.append((x - h, y - h, x + h, y + h))
        print(f"  site {s['id']}: half-width {h / 1000:.1f} km")
    return out


def tiles_for(boxes, max_z: int) -> list[tuple[int, int, int]]:
    seen = set()
    for z in range(max_z + 1):
        span = SP_RES0 / 2**z * TILE
        for bx0, by0, bx1, by1 in boxes:
            c0, c1 = int((bx0 + SP_HALF) // span), int((bx1 + SP_HALF) // span)
            r0, r1 = int((SP_HALF - by1) // span), int((SP_HALF - by0) // span)
            for r in range(r0, r1 + 1):
                for c in range(c0, c1 + 1):
                    x0, y0, x1, y1, _ = tile_bounds(z, r, c)
                    # Nearest point of the tile to the pole: skip tiles outside the 80 S disk.
                    nx = min(max(0.0, x0), x1)
                    ny = min(max(0.0, y0), y1)
                    if nx * nx + ny * ny <= RHO_MAX**2:
                        seen.add((z, r, c))
    # Coarse levels first (big windows), so the pool balances well.
    return sorted(seen)


def main(argv=None):
    here = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dem", type=Path, default=default_dem())
    ap.add_argument("--out", type=Path, default=here / "cache" / "slope_tiles")
    ap.add_argument("--area", choices=["sites", "disk"], default="sites")
    ap.add_argument("--sites", type=Path, default=here / "sites.json")
    ap.add_argument("--margin-km", type=float, default=15.0)
    ap.add_argument("--max-z", type=int, default=9, help="9 = 16.7 m/px, the first level finer than 20 m")
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--reuse", action="store_true", help="reuse the slope class work file")
    a = ap.parse_args(argv)
    if not a.dem.exists():
        sys.exit(f"DEM not found: {a.dem} (set LUNARNAV_DEM_DIR or --dem)")
    work = a.out.parent / "slope_classes_20m.u8"
    t0 = time.time()
    cls, t = build_classes(str(a.dem), work, a.workers, a.reuse)
    jobs = tiles_for(boxes_for(a.area, a.sites, a.margin_km * 1000), a.max_z)
    print(f"tiles to render: {len(jobs)} (z 0-{a.max_z}, area {a.area})", flush=True)
    index: dict[str, list] = {}
    total = 0
    with Pool(a.workers, _init_tiles, (str(work), cls.shape, t, str(a.out))) as p:
        for k, ((z, r, c), size) in enumerate(p.imap_unordered(_tile_job, jobs, chunksize=8)):
            if size:
                index.setdefault(str(z), []).append([r, c])
                total += size
            if (k + 1) % 2000 == 0:
                print(f"  tiles {k + 1}/{len(jobs)}, {time.time() - t0:.0f} s", flush=True)
    for v in index.values():
        v.sort()
    meta = {
        "version": 1,
        "source": "LOLA LDEM_80S_20MPP_ADJ (20 m), slope by Horn method, max per tile pixel",
        "grid": "NASA Moon Trek SP (z/row/col), 256 px, 8561.953125 m/px at z 0",
        "classes_deg": LABELS,
        "colours": COLOURS,
        "alpha": ALPHA,
        "area": a.area,
        "tiles": index,
    }
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "index.json").write_text(json.dumps(meta, separators=(",", ":")))
    n = sum(len(v) for v in index.values())
    print(f"done: {n} tiles, {total / 1e6:.1f} MB, {time.time() - t0:.0f} s -> {a.out}")


if __name__ == "__main__":
    main()
