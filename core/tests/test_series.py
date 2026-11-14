from datetime import timedelta

import numpy as np
import pytest

from conftest import needs_kernels
from lunarnav import evaluate, evaluate_series
from lunarnav.series import RESULT_FIELDS, count_steps, parse_utc, time_grid

APOLLO11 = (0.674, 23.473)
SHACK = (-89.45, -137.3)
FAR_SIDE = (0.0, 180.0)
START = "2026-11-14T00:00:00Z"
SYNODIC_D = 29.53


def test_time_grid_adds_stop_when_off_grid():
    g = time_grid("2026-11-14T00:00:00Z", "2026-11-14T02:30:00Z", 60)
    assert [t.strftime("%H:%M") for t in g] == ["00:00", "01:00", "02:00", "02:30"]
    assert count_steps("2026-11-14T00:00:00Z", "2026-11-14T02:30:00Z", 60) == 4
    assert len(time_grid("2026-11-14T00:00:00Z", "2026-11-14T02:00:00Z", 60)) == 3
    assert count_steps("2026-11-14T00:00:00Z", "2026-11-14T02:00:00Z", 60) == 3


def test_time_grid_rejects_bad_span():
    with pytest.raises(ValueError):
        time_grid("2026-11-14T00:00:00Z", "2026-11-13T00:00:00Z", 60)
    with pytest.raises(ValueError):
        time_grid("2026-11-14T00:00:00Z", "2026-11-15T00:00:00Z", 0)


@pytest.fixture(scope="module")
def apollo():
    return evaluate_series(*APOLLO11, START, "2026-12-19T00:00:00Z", 60, 2.0)


@needs_kernels
def test_arrays_match_evaluate(apollo):
    assert len(apollo.times_utc) == 35 * 24 + 1
    for k in RESULT_FIELDS:
        assert len(apollo.arrays[k]) == len(apollo.times_utc)
    i = 100
    r = evaluate(*APOLLO11, apollo.times_utc[i], 2.0)
    for k in RESULT_FIELDS:
        assert apollo.arrays[k][i] == getattr(r, k)


@needs_kernels
def test_apollo11_one_sunrise_and_sunset_per_lunar_day(apollo):
    ev = [(parse_utc(e["utc"]), e["type"]) for e in apollo.events]
    kinds = [k for _, k in ev]
    assert set(kinds) <= {"sunrise", "sunset"}  # Earth is always up at Apollo 11
    # Types alternate.
    assert all(a != b for a, b in zip(kinds, kinds[1:]))
    # Any window of one synodic month holds exactly one sunrise and one sunset.
    t0 = parse_utc(START)
    for off_d in range(0, 35 - 30 + 1):
        a = t0 + timedelta(days=off_d)
        b = a + timedelta(days=SYNODIC_D)
        inside = [k for t, k in ev if a <= t < b]
        assert sorted(inside) == ["sunrise", "sunset"], (a, inside)
    rises = [t for t, k in ev if k == "sunrise"]
    gap_d = (rises[1] - rises[0]).total_seconds() / 86400
    assert 29.2 < gap_d < 29.9


@needs_kernels
def test_apollo11_earth_always_visible(apollo):
    s = apollo.summary
    assert apollo.arrays["earth_visible"].all()
    assert s["earth_fraction_of_time"] == 1.0
    assert s["both_fraction_of_time"] == pytest.approx(s["sun_fraction_of_time"])
    assert s["longest_earth_period_h"] == pytest.approx(s["span_h"])
    assert s["time_to_next_earthset_h"] is None
    # About half a lunar day of sunlight.
    assert 0.45 < s["sun_fraction_of_time"] < 0.6
    assert 340 < s["longest_sun_period_h"] < 365
    assert s["mean_sun_visible_fraction"] == pytest.approx(s["sun_fraction_of_time"], abs=0.01)


@needs_kernels
def test_events_are_refined_below_one_minute(apollo):
    for e in apollo.events:
        before = evaluate(*APOLLO11, parse_utc(e["utc"]) - timedelta(seconds=30), 2.0)
        after = evaluate(*APOLLO11, parse_utc(e["utc"]) + timedelta(seconds=30), 2.0)
        lit = (before.sun_visible_fraction > 0, after.sun_visible_fraction > 0)
        assert lit == ((False, True) if e["type"] == "sunrise" else (True, False))


@needs_kernels
def test_events_do_not_depend_on_step(apollo):
    fine = evaluate_series(*APOLLO11, START, "2026-12-19T00:00:00Z", 10, 2.0)
    assert [e["type"] for e in fine.events] == [e["type"] for e in apollo.events]
    for a, b in zip(fine.events, apollo.events):
        assert abs((parse_utc(a["utc"]) - parse_utc(b["utc"])).total_seconds()) < 60
    assert fine.summary["sun_fraction_of_time"] == pytest.approx(
        apollo.summary["sun_fraction_of_time"], abs=1e-4)


@needs_kernels
def test_time_to_next_sunset_when_lit_at_start():
    s = evaluate_series(*APOLLO11, "2026-11-20T00:00:00Z", "2026-12-10T00:00:00Z", 60, 2.0)
    assert s.arrays["sun_visible_fraction"][0] > 0
    sunset = next(e for e in s.events if e["type"] == "sunset")
    expect_h = (parse_utc(sunset["utc"]) - parse_utc("2026-11-20T00:00:00Z")).total_seconds() / 3600
    assert s.summary["time_to_next_sunset_h"] == pytest.approx(expect_h, abs=1e-3)


@needs_kernels
def test_far_side_never_sees_earth():
    s = evaluate_series(*FAR_SIDE, START, "2026-12-19T00:00:00Z", 60, 2.0)
    assert not s.arrays["earth_visible"].any()
    assert not any(e["type"].startswith("earth") for e in s.events)
    assert s.summary["earth_fraction_of_time"] == 0.0
    assert s.summary["both_fraction_of_time"] == 0.0
    assert s.summary["longest_earth_period_h"] == 0.0
    assert s.summary["longest_both_period_h"] == 0.0
    assert s.summary["time_to_next_earthset_h"] is None
    assert 0.45 < s.summary["sun_fraction_of_time"] < 0.6


def flat_mask(el_deg, height_m=2.0):
    return {"lat_deg": SHACK[0], "lon_deg": SHACK[1], "observer_height_m": height_m,
            "dem_source": "synthetic", "az_step_deg": 0.5, "elevation_deg": [el_deg] * 720}


@needs_kernels
def test_high_horizon_removes_sunlight_at_south_pole():
    stop = "2026-12-14T00:00:00Z"
    flat = evaluate_series(*SHACK, START, stop, 60, 2.0)
    walled = evaluate_series(*SHACK, START, stop, 60, 2.0, flat_mask(5.0))
    assert flat.summary["sun_fraction_of_time"] > 0.5
    assert np.all(flat.arrays["sun_el"] < 5.0)  # the Sun never rises above 5 deg here
    assert walled.summary["sun_fraction_of_time"] == 0.0
    assert walled.summary["mean_sun_visible_fraction"] == 0.0
    assert walled.summary["longest_sun_period_h"] == 0.0
    assert not any(e["type"].startswith("sun") for e in walled.events)
    assert np.all(walled.arrays["sun_horizon_el"] == 5.0)


@needs_kernels
def test_series_checks_mask_height():
    with pytest.raises(ValueError):
        evaluate_series(*SHACK, START, "2026-11-15T00:00:00Z", 60, 0.0, flat_mask(0.0, 2.0))


@needs_kernels
def test_moon_state_basic():
    from lunarnav.core import utc_to_et
    from lunarnav.moon import moon_state_et

    s = moon_state_et(utc_to_et(START))
    m = np.array(s["me_to_j2000"]).reshape(3, 3)
    assert np.allclose(m @ m.T, np.eye(3))
    assert abs(s["sub_earth_lat_deg"]) < 8 and abs(s["sub_earth_lon_deg"]) < 9  # libration
    assert abs(s["sub_solar_lat_deg"]) < 1.6
    assert np.allclose(m @ np.array(s["sun_dir_me"]), s["sun_dir_j2000"])
