"""Precompute terrain masks for the curated sites, in the API disk-cache format.

The API reads these files when the DEMs are not present (for example in the
Docker image). See api/README.md, Deployment.

    LUNARNAV_DEM_DIR=/path/to/raw uv run python scripts/precompute_masks.py \
        [--out ../data/masks/precomputed] [--heights 0 2 10]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from lunarnav_api.terrain import MaskCache, NoTerrain

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--sites", default=ROOT / "data" / "sites.json", type=Path)
    p.add_argument("--out", default=ROOT / "data" / "masks" / "precomputed", type=Path)
    p.add_argument("--heights", nargs="+", type=float, default=[0.0, 2.0, 10.0])
    a = p.parse_args()

    cache = MaskCache(a.out)
    for site in json.loads(a.sites.read_text()):
        for h in a.heights:
            t0 = time.perf_counter()
            try:
                m = cache.get(site["lat_deg"], site["lon_deg"], h)
                note = f"surface {m['surface_height_m']:.1f} m"
            except NoTerrain:
                note = "no terrain"
            print(f"{site['id']:40s} h={h:5.2f}  {note}  {time.perf_counter() - t0:.2f} s")


if __name__ == "__main__":
    main()
