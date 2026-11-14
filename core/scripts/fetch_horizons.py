"""Fetch JPL Horizons apparent az/el of the Sun and Earth for lunar surface sites.

Usage (from core/):  uv run python scripts/fetch_horizons.py
Writes tests/fixtures/horizons.json, used offline by tests/test_horizons.py.

Horizons settings (confirmed from the output header):
  Center pole/equ : MEAN_ME (high precision)  -> same frame as SPICE MOON_ME
  Center radii    : 1737.4 km sphere          -> GEODETIC == planetocentric here
  Azimuth         : clockwise from north (N=0, E=90)
  Elevation       : from plane perpendicular to the local zenith, airless
  Apparent        : light time, stellar aberration, gravitational light bending
"""

from __future__ import annotations

import json
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "horizons.json"

# name, lat, E-lon, observer height above the 1737.4 km sphere (m), UTC times
CASES = [
    ("shackleton", -89.45, -137.3, 0.0,
     ["2026-11-14T12:00:00Z", "2026-11-21T06:00:00Z", "2026-12-01T18:00:00Z"]),
    ("shackleton_10m", -89.45, -137.3, 10.0, ["2027-01-10T00:00:00Z"]),
    ("apollo11", 0.674, 23.473, 0.0, ["2026-11-20T00:00:00Z", "2026-12-05T12:00:00Z"]),
]
TARGETS = {"sun": "10", "earth": "399"}


def ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def query(target: str, lat: float, lon: float, height_m: float, times: list[str]) -> tuple[list, str]:
    tlist = " ".join(f"'{t.rstrip('Z').replace('T', ' ')}'" for t in times)
    params = {
        "format": "json",
        "COMMAND": f"'{target}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},{height_m / 1000.0}'",
        "TLIST": tlist,
        "TIME_TYPE": "'UT'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "EXTRA_PREC": "'YES'",
        "CSV_FORMAT": "'YES'",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, context=ssl_context()) as r:
        text = json.load(r)["result"]
    header = text.split("$$SOE")[0]
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in body.strip().splitlines():
        f = [x.strip() for x in line.split(",")]
        # date, solar presence, interferer presence, az, el
        rows.append((float(f[3]), float(f[4])))
    if len(rows) != len(times):
        raise RuntimeError(f"expected {len(times)} rows, got {len(rows)}:\n{text}")
    return rows, header


def main() -> None:
    out = {"source": API, "notes": __doc__.strip(), "cases": []}
    frame_lines = set()
    for name, lat, lon, h, times in CASES:
        results = {}
        for key, tgt in TARGETS.items():
            rows, header = query(tgt, lat, lon, h, times)
            results[key] = rows
            frame_lines |= {ln.strip() for ln in header.splitlines() if "Center pole/equ" in ln}
        for i, t in enumerate(times):
            out["cases"].append({
                "name": name, "lat_deg": lat, "lon_deg": lon, "observer_height_m": h, "utc": t,
                "sun_az": results["sun"][i][0], "sun_el": results["sun"][i][1],
                "earth_az": results["earth"][i][0], "earth_el": results["earth"][i][1],
            })
    out["horizons_center_frame"] = sorted(frame_lines)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {OUT} ({len(out['cases'])} cases); frame: {out['horizons_center_frame']}")


if __name__ == "__main__":
    main()
