"""CLI: lunarnav --lat -89.45 --lon -137.3 --utc 2026-11-14T12:00:00Z --height 2

The console script `lunarnav` and `python -m lunarnav` run the same main().
"""

import argparse
import json

from .core import evaluate
from .horizon import HorizonMask


def main(argv=None) -> None:
    p = argparse.ArgumentParser(
        prog="lunarnav",
        description="Sun and Earth azimuth/elevation and visibility at one lunar point and instant.",
    )
    p.add_argument("--lat", type=float, required=True, help="planetocentric latitude, deg")
    p.add_argument("--lon", type=float, required=True, help="east longitude, deg, -180 to 360")
    p.add_argument("--utc", required=True,
                   help="ISO 8601 time, e.g. 2026-11-14T12:00:00Z. "
                        "An offset such as +02:00 is converted to UTC. No offset means UTC.")
    p.add_argument("--height", type=float, default=0.0, help="observer height above terrain, m")
    p.add_argument("--surface-height", type=float, default=0.0,
                   help="terrain height above the 1737.4 km sphere, m")
    p.add_argument("--mask", help="horizon mask JSON file (CONTRACTS.md section 6)")
    a = p.parse_args(argv)
    mask = HorizonMask.from_json(a.mask) if a.mask else None
    try:
        r = evaluate(a.lat, a.lon, a.utc, a.height, mask, surface_height_m=a.surface_height)
    except ValueError as e:
        p.error(str(e))
    print(json.dumps(r.to_dict(), indent=2))


if __name__ == "__main__":
    main()
