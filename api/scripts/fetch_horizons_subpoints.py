"""Fetch sub-Earth and sub-solar points on the Moon from JPL Horizons.

Usage (from api/):  uv run python scripts/fetch_horizons_subpoints.py
Writes tests/fixtures/horizons_subpoints.json, used offline by tests/test_moon_state.py.

Same query as ui/scripts/validate.ts: target Moon (301), observer Earth geocentre
(500@399), quantities 14 (observer sub-lon/lat) and 15 (Sun sub-lon/lat), MOON_ME frame,
east longitude positive. The certifi CA bundle is used; TLS checks stay on.
"""

from __future__ import annotations

import json
import ssl
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import certifi

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "horizons_subpoints.json"
DATES = [  # the four UI validation dates plus two more
    "2026-11-14T00:00:00Z",
    "2027-02-20T06:00:00Z",
    "2027-06-01T12:00:00Z",
    "2027-10-10T18:00:00Z",
    "2026-11-15T23:59:00Z",
    "2028-03-03T03:03:00Z",
]


def wrap(lon: float) -> float:
    return (lon + 180.0) % 360.0 - 180.0


def main() -> None:
    tlist = " ".join(f"'{d.rstrip('Z').replace('T', ' ')}'" for d in DATES)
    params = {
        "format": "json",
        "COMMAND": "'301'",
        "CENTER": "'500@399'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "TLIST": tlist,
        "TIME_TYPE": "'UT'",
        "QUANTITIES": "'14,15'",
        "ANG_FORMAT": "'DEG'",
        "EXTRA_PREC": "'YES'",
        "CSV_FORMAT": "'YES'",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    ctx = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(url, context=ctx, timeout=60) as r:
        text = json.load(r)["result"]
    header = text.split("$$SOE")[0]
    if "MOON_ME" not in header or "East-longitude positive" not in header:
        raise SystemExit("Unexpected Horizons frame or longitude convention:\n" + header)
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    cases = []
    for line in body.strip().splitlines():  # Horizons sorts TLIST, so read the date back
        f = [x.strip() for x in line.split(",")]
        utc = datetime.strptime(f[0], "%Y-%b-%d %H:%M:%S.%f").strftime("%Y-%m-%dT%H:%M:%SZ")
        obs_lon, obs_lat, sun_lon, sun_lat = map(float, f[3:7])
        cases.append({
            "utc": utc, "horizons_row": line.strip(),
            "sub_earth_lat_deg": obs_lat, "sub_earth_lon_deg": wrap(obs_lon),
            "sub_solar_lat_deg": sun_lat, "sub_solar_lon_deg": wrap(sun_lon),
        })
    if sorted(c["utc"] for c in cases) != sorted(DATES):
        raise SystemExit(f"Horizons returned other dates: {[c['utc'] for c in cases]}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": API,
        "query": {k: v for k, v in params.items() if k != "TLIST"},
        "header_lines": [ln for ln in header.splitlines()
                         if any(s in ln for s in ("MOON_ME", "East-longitude", "Target body"))],
        "cases": cases,
    }, indent=2) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
