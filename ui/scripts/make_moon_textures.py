"""Make the Moon textures for the UI from the NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720).

Inputs (download them first, they are large and not in git):
  lroc_color_poles_8k.tif  8192 x 4096 RGB, equirectangular, centred on 0° longitude
  ldem_16.tif              5760 x 2880 float32, km above the 1737.4 km sphere

Outputs (in --out):
  moon_color_8k.jpg        colour map, JPEG
  moon_normal_4k.jpg       tangent-space normal map from the elevation map (OpenGL convention:
                           R = east, G = north, B = up). Relief is exaggerated by --exaggeration.
  moon_south_color.jpg     south polar cap (pole to --cap-lat), azimuthal equidistant projection,
  moon_south_normal.jpg    pole at the image centre, 0° longitude up, 90° E right (as seen from
                           outside the Moon). Normal map: R = image right, G = image up, B = up.
                           The UI draws the cap as a separate mesh. This avoids the smearing of
                           an equirectangular map near the pole.

Run (from the repository root):
  PATH=~/.local/bin:$PATH uv run --no-project --with rasterio --with numpy --with pillow --with scipy \
    python -I ui/scripts/make_moon_textures.py \
      --color <dir>/lroc_color_poles_8k.tif --ldem <dir>/ldem_16.tif --out ui/public/textures
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

MOON_RADIUS_KM = 1737.4


def make_color(src: Path, out: Path, quality: int) -> None:
    with rasterio.open(src) as d:
        rgb = d.read([1, 2, 3])  # (3, h, w) uint8
    img = Image.fromarray(np.transpose(rgb, (1, 2, 0)), "RGB")
    img.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
    print(f"{out}: {img.width} x {img.height}, {out.stat().st_size / 1e6:.2f} MB")


def make_normal(src: Path, out: Path, width: int, exaggeration: float, quality: int) -> None:
    with rasterio.open(src) as d:
        h_km = d.read(1).astype(np.float64)
    rows, cols = h_km.shape
    dlat = math.pi / rows
    dlon = 2 * math.pi / cols
    # Pixel centre latitudes, row 0 = north edge.
    lat = (math.pi / 2) - (np.arange(rows) + 0.5) * dlat
    coslat = np.maximum(np.cos(lat), math.cos(math.radians(89.95)))[:, None]

    # East gradient: wrap around in longitude. North gradient: rows go south.
    dh_dcol = (np.roll(h_km, -1, axis=1) - np.roll(h_km, 1, axis=1)) / 2.0
    dh_drow = np.gradient(h_km, axis=0)
    dh_deast = dh_dcol / (MOON_RADIUS_KM * coslat * dlon)
    dh_dnorth = -dh_drow / (MOON_RADIUS_KM * dlat)

    nx = -exaggeration * dh_deast
    ny = -exaggeration * dh_dnorth
    nz = np.ones_like(nx)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    channels = [nx / n, ny / n, nz / n]

    height = width // 2
    resized = [
        np.asarray(Image.fromarray(c.astype(np.float32), "F").resize((width, height), Image.BILINEAR))
        for c in channels
    ]
    v = np.stack(resized, axis=-1)
    v /= np.linalg.norm(v, axis=-1, keepdims=True)
    rgb = np.clip(np.round((v * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    img = Image.fromarray(rgb, "RGB")
    img.save(out, "JPEG", quality=quality, optimize=True)
    print(f"{out}: {img.width} x {img.height}, {out.stat().st_size / 1e6:.2f} MB, "
          f"slope p99 {np.degrees(np.arctan(np.percentile(np.hypot(dh_deast, dh_dnorth), 99))):.1f} deg")


def polar_grid(size: int, cap_deg: float, rows: int, cols: int):
    """Source (row, col) coordinates for each pixel of a south polar azimuthal equidistant image."""
    c = (np.arange(size) + 0.5) / size * 2.0 - 1.0
    X, Y = np.meshgrid(c * cap_deg, -c * cap_deg)  # degrees from the pole; row 0 = top (+Y)
    rho = np.hypot(X, Y)
    lon = np.degrees(np.arctan2(X, Y))  # 0° up, 90° E right
    lat = -90.0 + rho  # corners go past the cap edge; the gradient stays smooth at the edge
    src_row = (90.0 - lat) / 180.0 * rows - 0.5
    src_col = (lon + 180.0) / 360.0 * cols - 0.5
    return src_row, src_col


def sample(a: np.ndarray, src_row: np.ndarray, src_col: np.ndarray, order: int = 1) -> np.ndarray:
    """Spline sample (order 1 = bilinear), longitude wraps (pad columns on each side)."""
    pad = 4
    padded = np.concatenate([a[:, -pad:], a, a[:, :pad]], axis=1)
    return map_coordinates(padded, [src_row, src_col + pad], order=order, mode="nearest")


def make_south_cap(color_src: Path, ldem_src: Path, out_dir: Path, size: int, cap_deg: float,
                   exaggeration: float) -> None:
    with rasterio.open(color_src) as d:
        rgb = d.read([1, 2, 3]).astype(np.float32)
    r, c = polar_grid(size, cap_deg, rgb.shape[1], rgb.shape[2])
    cap = np.stack([sample(rgb[i], r, c) for i in range(3)], axis=-1)
    img = Image.fromarray(np.clip(np.round(cap), 0, 255).astype(np.uint8), "RGB")
    out = out_dir / "moon_south_color.jpg"
    img.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{out}: {size} x {size}, {out.stat().st_size / 1e6:.2f} MB")

    with rasterio.open(ldem_src) as d:
        h_km = d.read(1).astype(np.float64)
    r, c = polar_grid(size, cap_deg, h_km.shape[0], h_km.shape[1])
    # Cubic sampling and a light blur: the DEM pixels (about 1.9 km) are larger than the
    # cap pixels, and bilinear steps would show as rings in the gradient.
    h = gaussian_filter(sample(h_km, r, c, order=3), sigma=2.5)
    px_km = MOON_RADIUS_KM * math.radians(2.0 * cap_deg / size)
    dh_drow, dh_dcol = np.gradient(h, px_km)
    nx = -exaggeration * dh_dcol           # image right
    ny = -exaggeration * (-dh_drow)        # image up (rows go down)
    nz = np.ones_like(nx)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    v = np.stack([nx / n, ny / n, nz / n], axis=-1)
    rgbn = np.clip(np.round((v * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    out = out_dir / "moon_south_normal.jpg"
    Image.fromarray(rgbn, "RGB").save(out, "JPEG", quality=90, optimize=True)
    print(f"{out}: {size} x {size}, {out.stat().st_size / 1e6:.2f} MB")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--color", type=Path, required=True)
    p.add_argument("--ldem", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--color-quality", type=int, default=85)
    p.add_argument("--normal-width", type=int, default=4096)
    p.add_argument("--exaggeration", type=float, default=1.5)
    p.add_argument("--cap-size", type=int, default=2048)
    p.add_argument("--cap-lat", type=float, default=-75.0, help="edge of the south polar cap")
    p.add_argument("--only-cap", action="store_true")
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    if not a.only_cap:
        make_color(a.color, a.out / "moon_color_8k.jpg", a.color_quality)
        make_normal(a.ldem, a.out / "moon_normal_4k.jpg", a.normal_width, a.exaggeration, 90)
    make_south_cap(a.color, a.ldem, a.out, a.cap_size, 90.0 + a.cap_lat, a.exaggeration)


if __name__ == "__main__":
    main()
