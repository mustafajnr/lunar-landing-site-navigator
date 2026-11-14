"""Compare /v1/moon-state with JPL Horizons (scripts/fetch_horizons_subpoints.py)."""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from conftest import needs_kernels
from lunarnav import evaluate

pytestmark = needs_kernels

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "horizons_subpoints.json").read_text())
TOL_DEG = 0.01


def dlon(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


def one_state(client, utc):
    stop = utc[:-1] + ".5Z"  # half a second later: one sample plus none appended
    r = client.post("/v1/moon-state", json={"start_utc": utc, "stop_utc": stop,
                                            "step_minutes": 60})
    assert r.status_code == 200, r.text
    states = r.json()["states"]
    assert len(states) == 1 and states[0]["utc"] == utc
    return states[0]


def test_fixture_frame():
    assert any("MOON_ME" in ln for ln in FIXTURE["header_lines"])


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda c: c["utc"])
def test_sub_points_match_horizons(client, case):
    s = one_state(client, case["utc"])
    for p in ("sub_earth", "sub_solar"):
        assert abs(s[f"{p}_lat_deg"] - case[f"{p}_lat_deg"]) < TOL_DEG
        assert abs(dlon(s[f"{p}_lon_deg"], case[f"{p}_lon_deg"])) < TOL_DEG


def test_vectors_and_rotation_are_consistent(client):
    s = one_state(client, "2026-11-14T12:00:00Z")
    m = np.array(s["me_to_j2000"]).reshape(3, 3)
    assert np.allclose(m @ m.T, np.eye(3), atol=1e-12)
    assert np.linalg.det(m) == pytest.approx(1.0)
    for body in ("sun", "earth"):
        u = np.array(s[f"{body}_dir_me"])
        km = np.array(s[f"{body}_me_km"])
        assert np.linalg.norm(u) == pytest.approx(1.0)
        assert np.allclose(km / np.linalg.norm(km), u)
        assert np.allclose(m @ u, s[f"{body}_dir_j2000"])
    assert np.linalg.norm(s["earth_me_km"]) == pytest.approx(s["earth_distance_km"])
    assert 356_000 < s["earth_distance_km"] < 407_000
    lat, lon = math.radians(s["sub_earth_lat_deg"]), math.radians(s["sub_earth_lon_deg"])
    assert np.allclose(s["earth_dir_me"],
                       [math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon),
                        math.sin(lat)])


def local_sky(lat_deg, lon_deg, target_km):
    """Same maths as localSky() in ui/src/ephemeris.ts."""
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    up = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    east = np.array([-math.sin(lo), math.cos(lo), 0.0])
    north = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    d = np.asarray(target_km) - up * 1737.4
    d /= np.linalg.norm(d)
    return math.degrees(math.atan2(d @ east, d @ north)) % 360, math.degrees(math.asin(d @ up))


def test_ui_local_sky_from_api_state_matches_evaluate(client):
    """The UI can keep localSky() and feed it the API vectors (flat horizon, topocentric)."""
    utc = "2026-11-20T00:00:00Z"
    s = one_state(client, utc)
    for lat, lon in [(0.674, 23.473), (-89.45, -137.3), (45.0, -60.0)]:
        ref = evaluate(lat, lon, utc, 0.0)
        for body, (az, el) in (("sun", (ref.sun_az, ref.sun_el)),
                               ("earth", (ref.earth_az, ref.earth_el))):
            a, e = local_sky(lat, lon, s[f"{body}_me_km"])
            # Light time and aberration differ a little between Moon centre and surface.
            assert abs(e - el) < 0.01
            assert abs(dlon(a, az)) < 0.01
