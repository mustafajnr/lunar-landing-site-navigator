import json
import math
import subprocess
import sys

import numpy as np
import pytest

from conftest import needs_kernels
from lunarnav import HorizonMask, evaluate
from lunarnav.core import disk_fraction_above, local_frame, site_position_km

SHACK = (-89.45, -137.3)
T = "2026-11-14T12:00:00Z"


# --- pure geometry -------------------------------------------------------------

def test_disk_fraction_limits_and_symmetry():
    r = 0.27
    assert disk_fraction_above(1.0, 0.0, r) == 1.0
    assert disk_fraction_above(-1.0, 0.0, r) == 0.0
    assert disk_fraction_above(0.0, 0.0, r) == pytest.approx(0.5)
    for h in (0.05, 0.1, 0.2):
        assert disk_fraction_above(h, 0, r) + disk_fraction_above(-h, 0, r) == pytest.approx(1.0)


def test_disk_fraction_segment_formula():
    # Centre 0.5 r below the line: segment area r^2 acos(d/r) - d sqrt(r^2 - d^2), d = r/2.
    r = 1.0
    seg = math.acos(0.5) - 0.5 * math.sqrt(0.75)
    assert disk_fraction_above(-0.5, 0.0, r) == pytest.approx(seg / math.pi)


def test_local_frame_orthonormal_and_north_points_to_pole():
    pos = site_position_km(10.0, 50.0, 0.0)
    e, n, u = local_frame(pos)
    m = np.array([e, n, u])
    assert np.allclose(m @ m.T, np.eye(3))
    assert np.allclose(np.cross(e, n), u)  # right-handed ENU
    assert n[2] > 0  # north has a component toward the +Z pole


def test_local_frame_rejects_exact_pole():
    with pytest.raises(ValueError):
        local_frame(site_position_km(-90.0, 0.0, 0.0))


def test_site_radius():
    pos = site_position_km(0.674, 23.473, 2.0)
    assert np.linalg.norm(pos) == pytest.approx(1737.402)


# --- horizon mask --------------------------------------------------------------

def make_mask(values, step):
    return {"lat_deg": -89.45, "lon_deg": -137.31, "observer_height_m": 2.0,
            "dem_source": "test", "az_step_deg": step, "elevation_deg": values}


def test_mask_interpolation_and_wrap():
    vals = [0.0] * 720
    vals[0] = 2.0
    vals[719] = 4.0
    m = HorizonMask.from_dict(make_mask(vals, 0.5))
    assert m.elevation_at(0.0) == 2.0
    assert m.elevation_at(0.25) == pytest.approx(1.0)
    assert m.elevation_at(359.75) == pytest.approx(3.0)  # between 359.5 (4) and 360=0 (2)
    assert m.elevation_at(360.0) == 2.0
    assert m.elevation_at(-0.25) == pytest.approx(3.0)


def test_mask_rejects_wrong_length():
    with pytest.raises(ValueError):
        HorizonMask.from_dict(make_mask([0.0] * 700, 0.5))


# --- evaluate ------------------------------------------------------------------

@needs_kernels
def test_none_mask_is_flat_zero():
    r = evaluate(*SHACK, T, 2.0)
    assert r.sun_horizon_el == 0.0 and r.earth_horizon_el == 0.0
    assert r.earth_margin == r.earth_el
    assert r.earth_visible == (r.earth_el > 0)


@needs_kernels
def test_mask_applies_to_sun_and_earth():
    flat = evaluate(*SHACK, T, 2.0)
    # Raise the horizon so the Sun centre sits exactly on it -> half disk.
    m = make_mask([flat.sun_el] * 720, 0.5)
    r = evaluate(*SHACK, T, 2.0, m)
    assert r.sun_horizon_el == pytest.approx(flat.sun_el)
    assert r.sun_visible_fraction == pytest.approx(0.5, abs=1e-9)
    assert r.earth_horizon_el == pytest.approx(flat.sun_el)
    assert r.earth_margin == pytest.approx(flat.earth_el - flat.sun_el)
    assert r.earth_visible is (flat.earth_el > flat.sun_el)
    # Dataclass and dict give the same answer.
    assert evaluate(*SHACK, T, 2.0, HorizonMask.from_dict(m)) == r


@needs_kernels
def test_mask_height_must_match_observer_height():
    m = make_mask([0.0] * 720, 0.5)  # observer_height_m = 2.0
    evaluate(*SHACK, T, 2.0, m)
    evaluate(*SHACK, T, 2.0 + 1e-7, m)  # inside tolerance
    with pytest.raises(ValueError, match="observer_height_m"):
        evaluate(*SHACK, T, 0.0, m)
    with pytest.raises(ValueError):
        evaluate(*SHACK, T, 2.001, HorizonMask.from_dict(m))
    # A mask without a height is accepted.
    m.pop("observer_height_m")
    evaluate(*SHACK, T, 0.0, m)


@needs_kernels
def test_sun_partial_near_horizon():
    flat = evaluate(*SHACK, T, 2.0)
    m = make_mask([flat.sun_el + 0.1] * 720, 0.5)  # 0.1 deg above centre, radius ~0.27
    f = evaluate(*SHACK, T, 2.0, m).sun_visible_fraction
    assert 0.0 < f < 0.5


@needs_kernels
def test_surface_height_adds_to_observer_height():
    a = evaluate(*SHACK, T, 10.0)
    b = evaluate(*SHACK, T, 0.0, surface_height_m=10.0)
    assert a == b


@needs_kernels
def test_datetime_input():
    from datetime import datetime, timezone

    a = evaluate(*SHACK, T, 2.0)
    b = evaluate(*SHACK, datetime(2026, 11, 14, 12, tzinfo=timezone.utc), 2.0)
    assert a == b


@needs_kernels
def test_cli_prints_json():
    out = subprocess.run(
        [sys.executable, "-m", "lunarnav", "--lat", "-89.45", "--lon", "-137.3",
         "--utc", T, "--height", "2"],
        check=True, capture_output=True, text=True,
    ).stdout
    d = json.loads(out)
    assert set(d) == {"sun_az", "sun_el", "sun_horizon_el", "sun_visible_fraction",
                      "earth_az", "earth_el", "earth_horizon_el", "earth_visible",
                      "earth_margin"}
