"""Compare evaluate() with saved JPL Horizons apparent az/el (scripts/fetch_horizons.py)."""

import json
from pathlib import Path

import pytest

from conftest import needs_kernels
from lunarnav import evaluate

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "horizons.json").read_text())
TOL_DEG = 0.001  # contract target is 0.05 deg; observed agreement is ~1e-6 deg


def angle_diff(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


@needs_kernels
@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda c: f"{c['name']}@{c['utc']}")
def test_matches_horizons(case):
    r = evaluate(case["lat_deg"], case["lon_deg"], case["utc"], case["observer_height_m"])
    assert abs(angle_diff(r.sun_az, case["sun_az"])) < TOL_DEG
    assert abs(r.sun_el - case["sun_el"]) < TOL_DEG
    assert abs(angle_diff(r.earth_az, case["earth_az"])) < TOL_DEG
    assert abs(r.earth_el - case["earth_el"]) < TOL_DEG


def test_fixture_uses_mean_earth_frame():
    assert any("MEAN_ME" in line for line in FIXTURE["horizons_center_frame"])
