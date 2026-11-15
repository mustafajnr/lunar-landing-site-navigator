import json
from datetime import timedelta
from pathlib import Path

import numpy as np
import pytest

from conftest import needs_kernels
from lunarnav import evaluate, evaluate_series, next_events
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


def test_time_grid_single_instant():
    assert len(time_grid(START, START, 60)) == 1
    assert count_steps(START, START, 60) == 1


@needs_kernels
def test_series_single_instant():
    r = evaluate_series(*APOLLO11, "2026-11-25T00:00:00Z", "2026-11-25T00:00:00Z", 60, 2.0)
    ref = evaluate(*APOLLO11, "2026-11-25T00:00:00Z", 2.0)
    assert r.times_utc == ["2026-11-25T00:00:00Z"]
    assert r.arrays["sun_el"][0] == pytest.approx(ref.sun_el, abs=1e-12)
    assert r.events == []
    s = r.summary
    assert s["span_h"] == 0.0 and s["n_steps"] == 1
    assert s["sun_fraction_of_time"] == (1.0 if ref.sun_visible_fraction > 0 else 0.0)
    assert s["earth_fraction_of_time"] == 1.0
    assert s["mean_sun_visible_fraction"] == ref.sun_visible_fraction


@needs_kernels
def test_next_events_match_series_events():
    stop = "2027-01-14T00:00:00Z"
    ref = evaluate_series(*APOLLO11, START, stop, 30, 2.0)
    first = {}
    for e in ref.events:
        first.setdefault(e["type"], e["utc"])
    nxt = next_events(*APOLLO11, START, 2.0)
    assert nxt["earthrise"] is None and nxt["earthset"] is None  # near side
    for kind in ("sunrise", "sunset"):
        dt = abs((parse_utc(nxt[kind]) - parse_utc(first[kind])).total_seconds())
        assert dt <= 2.0


@needs_kernels
def test_next_events_none_behind_a_wall():
    nxt = next_events(*SHACK, START, 2.0, flat_mask(30.0))
    assert nxt == {"sunrise": None, "sunset": None, "earthrise": None, "earthset": None}


@needs_kernels
def test_next_events_south_pole_earth():
    # Earth rises and sets with libration at the pole. With a flat horizon the scan
    # finds the same first earthset as a fine series.
    ref = evaluate_series(*SHACK, START, "2027-01-14T00:00:00Z", 30, 2.0)
    nxt = next_events(*SHACK, START, 2.0)
    first = next((e["utc"] for e in ref.events if e["type"] == "earthset"), None)
    if first is not None:
        dt = abs((parse_utc(nxt["earthset"]) - parse_utc(first)).total_seconds())
        assert dt <= 2.0


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


# --- gaps: longest night, longest Earth outage, longest time without both ---------

MASKS = Path(__file__).resolve().parents[2] / "data" / "masks"


def test_gaps_of_intervals():
    from lunarnav.series import _gaps, _longest_gap

    assert _gaps([], 0.0, 10.0) == [(0.0, 10.0)]
    assert _gaps([(0.0, 10.0)], 0.0, 10.0) == []
    assert _gaps([(2.0, 3.0), (5.0, 9.0)], 0.0, 10.0) == [(0.0, 2.0), (3.0, 5.0), (9.0, 10.0)]
    assert _longest_gap([(2.0, 3.0), (5.0, 9.0)], 0.0, 10.0) == (2.0, True)  # first gap wins a tie
    assert _longest_gap([(1.0, 3.0), (7.0, 9.0)], 0.0, 10.0) == (4.0, False)
    assert _longest_gap([(0.0, 10.0)], 0.0, 10.0) == (0.0, False)


@needs_kernels
def test_apollo11_longest_night(apollo):
    s = apollo.summary
    # Night at the start, then sunrise, sunset, sunrise: one full night of about 14.8 d.
    assert s["sun_up_at_start"] is False and s["earth_up_at_start"] is True
    ev = [(parse_utc(e["utc"]), e["type"]) for e in apollo.events]
    sunset = next(t for t, k in ev if k == "sunset")
    rise2 = [t for t, k in ev if k == "sunrise"][1]
    full_night_h = (rise2 - sunset).total_seconds() / 3600
    assert s["longest_no_sun_period_h"] == pytest.approx(full_night_h, abs=2 / 3600)
    assert 14.5 * 24 < s["longest_no_sun_period_h"] < 15.1 * 24
    assert s["longest_no_sun_period_truncated"] is False
    # Earth is always up, so there is no Earth outage. "Not both" is the night.
    assert s["longest_no_earth_period_h"] == 0.0
    assert s["longest_no_earth_period_truncated"] is False
    assert s["longest_no_both_period_h"] == pytest.approx(s["longest_no_sun_period_h"])
    expect_h = (sunset - parse_utc(START)).total_seconds() / 3600
    assert s["time_to_first_sunset_h"] == pytest.approx(expect_h, abs=2 / 3600)
    assert s["time_to_next_sunset_h"] is None  # the old field: null, the Sun is down at start


@needs_kernels
def test_far_side_earth_outage_is_full_span():
    s = evaluate_series(*FAR_SIDE, START, "2026-12-19T00:00:00Z", 60, 2.0).summary
    assert s["earth_up_at_start"] is False
    assert s["longest_no_earth_period_h"] == pytest.approx(s["span_h"])
    assert s["longest_no_earth_period_truncated"] is True
    assert s["longest_no_both_period_h"] == pytest.approx(s["span_h"])


@needs_kernels
def test_shackleton_floor_night_is_full_span():
    mask = json.loads((MASKS / "shackleton_floor_-89.67_129.78_h2.json").read_text())
    s = evaluate_series(-89.67, 129.78, START, "2026-12-14T00:00:00Z", 60, 2.0, mask,
                        surface_height_m=mask.get("surface_height_m", 0.0)).summary
    assert s["sun_fraction_of_time"] == 0.0
    assert s["sun_up_at_start"] is False
    assert s["longest_no_sun_period_h"] == pytest.approx(s["span_h"])
    assert s["longest_no_sun_period_truncated"] is True
    assert s["longest_no_both_period_h"] == pytest.approx(s["span_h"])
    assert s["time_to_first_sunset_h"] is None


@needs_kernels
def test_gaps_and_periods_fill_the_span():
    # The longest gap and the total of each state agree with the intervals.
    r = evaluate_series(*SHACK, START, "2026-12-14T00:00:00Z", 30, 2.0)
    s = r.summary
    span = s["span_h"]
    for body in ("sun", "earth", "both"):
        lit = s[f"{body}_fraction_of_time"] * span
        assert s[f"longest_no_{body}_period_h"] <= span - lit + 1e-6
        if s[f"{body}_fraction_of_time"] < 1.0:
            assert s[f"longest_no_{body}_period_h"] > 0.0
    assert s["longest_no_both_period_h"] >= max(s["longest_no_sun_period_h"],
                                                s["longest_no_earth_period_h"]) - 1e-9


@needs_kernels
def test_single_instant_gaps():
    s = evaluate_series(*APOLLO11, "2026-11-25T00:00:00Z", "2026-11-25T00:00:00Z", 60, 2.0).summary
    assert s["longest_no_sun_period_h"] == 0.0
    assert s["longest_no_earth_period_h"] == 0.0
    assert s["longest_no_both_period_h"] == 0.0
    assert s["longest_no_sun_period_truncated"] is False
    assert s["time_to_first_sunset_h"] is None
    assert isinstance(s["sun_up_at_start"], bool)
