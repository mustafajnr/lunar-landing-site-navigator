"""Make the Earth and Sun textures for the UI.

Inputs (download first, not in git):
  Earth: NASA Blue Marble Next Generation, January 2004, 5400 x 2700, equirectangular,
         centred on 0° longitude (left edge 180° W). Public domain.
         https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x5400x2700.jpg
  Sun:   NASA SDO/HMI quick-look continuum (colourised intensitygram), 1024 x 1024.
         https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIC.jpg
         ("latest" changes every few minutes; the committed file is from 2026-11-14 16:00 UTC.)

Outputs (in --out): earth_bluemarble_2k.jpg (2048 x 1024), sun_sdo_512.jpg (512 x 512, disk only,
black outside the disk, so the caption text is removed).

Run (from the repository root):
  PATH=~/.local/bin:$PATH uv run --no-project --with numpy --with pillow \
    python -I ui/scripts/make_body_textures.py --earth <file> --sun <file> --out ui/public/textures
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--earth", type=Path, required=True)
    p.add_argument("--sun", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)

    earth = Image.open(a.earth).convert("RGB").resize((2048, 1024), Image.LANCZOS)
    out = a.out / "earth_bluemarble_2k.jpg"
    earth.save(out, "JPEG", quality=85, optimize=True, progressive=True)
    print(f"{out}: {earth.width} x {earth.height}, {out.stat().st_size / 1e6:.2f} MB")

    sun = np.asarray(Image.open(a.sun).convert("RGB")).astype(np.float32)
    # Disk: pixels clearly brighter than the black sky. Use its extent for centre and radius.
    bright = sun.max(axis=2) > 60
    ys, xs = np.nonzero(bright[: int(sun.shape[0] * 0.97)])  # skip the caption row at the bottom
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2
    # Crop a square around the disk with a small black border, mask outside the disk.
    half = r * 1.02
    box = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
    img = Image.fromarray(sun.astype(np.uint8)).crop(box).resize((512, 512), Image.LANCZOS)
    arr = np.asarray(img).astype(np.float32)
    yy, xx = np.mgrid[0:512, 0:512]
    rr = np.hypot(xx - 255.5, yy - 255.5) / (256 / 1.02)
    edge = np.clip((1.0 - rr) / 0.01 + 0.5, 0, 1)[..., None]  # soft 1 % edge
    arr *= edge
    out = a.out / "sun_sdo_512.jpg"
    Image.fromarray(arr.astype(np.uint8)).save(out, "JPEG", quality=88, optimize=True)
    print(f"{out}: 512 x 512, {out.stat().st_size / 1e6:.2f} MB, disk centre ({cx:.0f}, {cy:.0f}) r {r:.0f}")


if __name__ == "__main__":
    main()
