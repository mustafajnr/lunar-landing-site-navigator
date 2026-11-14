"""Input rules: time text, latitude and longitude range, mask without height,
console script, kernel reload, and section references."""

import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from importlib.metadata import entry_points
from pathlib import Path

import pytest
import spiceypy as sp

from conftest import needs_kernels
from lunarnav import evaluate, evaluate_series, spice
from lunarnav.core import check_lat_lon, to_utc_datetime, utc_to_et

SHACK = (-89.45, -137.3)
T = "2026-11-14T12:00:00Z"
SRC = Path(__file__).resolve().parents[1] / "src" / "lunarnav"


def flat_mask(el, height=None):
    m = {"az_step_deg": 1.0, "elevation_deg": [el] * 360}
    if height is not None:
        m["observer_height_m"] = height
    return m


# --- fix 1: time text with an offset ----------------------------------------------

@pytest.mark.parametrize("text", [
    "2026-11-14T12:00:00Z",
    "2026-11-14T12:00:00z",
    "2026-11-14T12:00:00",
    "2026-11-14 12:00:00",
    "2026-11-14T12:00:00+00:00",
    "2026-11-14T14:00:00+02:00",
    "2026-11-14T06:30:00-05:30",
    "2026-11-15T01:45:00+13:45",
    "  2026-11-14T12:00:00Z  ",
])
def test_to_utc_datetime_converts_offsets(text):
    assert to_utc_datetime(text) == datetime(2026, 11, 14, 12)


def test_to_utc_datetime_datetimes():
    assert to_utc_datetime(datetime(2026, 11, 14, 12)) == datetime(2026, 11, 14, 12)
    tz = timezone(timedelta(hours=2))
    assert to_utc_datetime(datetime(2026, 11, 14, 14, tzinfo=tz)) == datetime(2026, 11, 14, 12)


@pytest.mark.parametrize("text", ["", "yesterday", "2026-13-01T00:00:00Z",
                                  "2026-11-14T25:00:00Z", "2026-11-14T12:00:00+25:00"])
def test_to_utc_datetime_rejects_bad_text(text):
    with pytest.raises(ValueError, match="cannot parse time"):
        to_utc_datetime(text)


def test_to_utc_datetime_rejects_other_types():
    with pytest.raises(TypeError):
        to_utc_datetime(1234.5)


@needs_kernels
def test_evaluate_accepts_offset_text():
    ref = evaluate(*SHACK, T, 2.0)
    assert evaluate(*SHACK, "2026-11-14T14:00:00+02:00", 2.0) == ref
    assert evaluate(*SHACK, "2026-11-14T07:00:00-05:00", 2.0) == ref
    assert evaluate(*SHACK, "2026-11-14T12:00:00", 2.0) == ref


@needs_kernels
@pytest.mark.parametrize("text", ["yesterday", "2026-13-01T00:00:00Z",
                                  "2026-11-14T12:00:00+25:00"])
def test_evaluate_rejects_bad_time_with_value_error(text):
    with pytest.raises(ValueError, match="cannot parse time"):
        evaluate(*SHACK, text, 2.0)


@needs_kernels
def test_utc_to_et_leap_second_uses_spice():
    # Python cannot parse second 60. SPICE can. The leap second is 1 s long.
    a = utc_to_et("2016-12-31T23:59:59Z")
    b = utc_to_et("2016-12-31T23:59:60Z")
    c = utc_to_et("2017-01-01T00:00:00Z")
    assert b - a == pytest.approx(1.0, abs=1e-6)
    assert c - b == pytest.approx(1.0, abs=1e-6)


@needs_kernels
def test_series_accepts_offset_text():
    a = evaluate_series(*SHACK, "2026-11-14T00:00:00Z", "2026-11-14T06:00:00Z", 60, 2.0)
    b = evaluate_series(*SHACK, "2026-11-14T02:00:00+02:00", "2026-11-13T22:00:00-08:00",
                        60, 2.0)
    assert a.times_utc == b.times_utc
    assert a.summary == b.summary


@needs_kernels
def test_series_rejects_bad_time_with_value_error():
    with pytest.raises(ValueError, match="cannot parse time"):
        evaluate_series(*SHACK, "not a time", "2026-11-15T00:00:00Z", 60, 2.0)


# --- fix 2: latitude and longitude range ------------------------------------------

@pytest.mark.parametrize("lon, want", [
    (-180.0, -180.0), (-137.3, -137.3), (0.0, 0.0), (180.0, 180.0),
    (180.5, -179.5), (222.7, -137.3), (359.0, -1.0), (360.0, 0.0),
])
def test_check_lat_lon_normalizes_longitude(lon, want):
    assert check_lat_lon(10.0, lon) == (10.0, pytest.approx(want))


@pytest.mark.parametrize("lat, lon", [
    (0.0, -180.001), (0.0, 360.001), (0.0, 540.0), (0.0, -360.0),
    (90.001, 0.0), (-90.5, 0.0), (float("nan"), 0.0), (0.0, float("nan")),
    (0.0, float("inf")),
])
def test_check_lat_lon_rejects_out_of_range(lat, lon):
    with pytest.raises(ValueError, match="lat_deg|lon_deg"):
        check_lat_lon(lat, lon)


@needs_kernels
def test_evaluate_longitude_conventions_agree():
    assert evaluate(SHACK[0], 360.0 + SHACK[1], T, 2.0) == evaluate(*SHACK, T, 2.0)
    with pytest.raises(ValueError, match="lon_deg"):
        evaluate(SHACK[0], 540.0, T, 2.0)
    with pytest.raises(ValueError, match="lat_deg"):
        evaluate(-91.0, 0.0, T, 2.0)
    with pytest.raises(ValueError, match="pole"):
        evaluate(-90.0, 0.0, T, 2.0)


@needs_kernels
def test_series_checks_longitude():
    with pytest.raises(ValueError, match="lon_deg"):
        evaluate_series(0.0, 400.0, "2026-11-14T00:00:00Z", "2026-11-15T00:00:00Z", 60, 2.0)
    a = evaluate_series(*SHACK, "2026-11-14T00:00:00Z", "2026-11-15T00:00:00Z", 60, 2.0)
    b = evaluate_series(SHACK[0], 360.0 + SHACK[1],
                        "2026-11-14T00:00:00Z", "2026-11-15T00:00:00Z", 60, 2.0)
    assert a.summary == b.summary


# --- fix 3: section references ------------------------------------------------------

def test_mask_references_point_to_section_6():
    contracts = (Path(__file__).resolve().parents[2] / "CONTRACTS.md").read_text()
    assert "## 6. Horizon mask format" in contracts
    for name in ("horizon.py", "__main__.py"):
        text = (SRC / name).read_text()
        assert "CONTRACTS.md section 6" in text
        assert "section 5" not in text
    help_text = subprocess.run(
        [sys.executable, "-m", "lunarnav", "--help"], check=True, capture_output=True, text=True
    ).stdout
    assert re.search(r"section\s+6", help_text)


# --- fix 4: console script ------------------------------------------------------------

def test_console_script_entry_point():
    eps = entry_points(group="console_scripts", name="lunarnav")
    assert [ep.value for ep in eps] == ["lunarnav.__main__:main"]


@needs_kernels
def test_console_script_runs():
    exe = Path(sys.executable).with_name("lunarnav")
    assert exe.exists(), f"{exe} is missing; run uv sync"
    out = subprocess.run([str(exe), "--lat", "-89.45", "--lon", "-137.3", "--utc", T,
                          "--height", "2"], check=True, capture_output=True, text=True).stdout
    assert json.loads(out) == evaluate(*SHACK, T, 2.0).to_dict()


@needs_kernels
def test_cli_bad_input_is_a_usage_error():
    p = subprocess.run([sys.executable, "-m", "lunarnav", "--lat", "0", "--lon", "540",
                        "--utc", T], capture_output=True, text=True)
    assert p.returncode == 2
    assert "lon_deg" in p.stderr
    assert "Traceback" not in p.stderr


# --- fix 5: kernel reload ---------------------------------------------------------------

@needs_kernels
def test_kernels_load_again_after_kclear():
    ref = evaluate(*SHACK, T, 2.0)
    assert spice.is_loaded()
    sp.kclear()
    assert not spice.is_loaded()
    assert evaluate(*SHACK, T, 2.0) == ref  # ensure_loaded() sees the kclear
    assert spice.is_loaded()


@needs_kernels
def test_reload_keeps_one_copy_of_each_kernel():
    spice.ensure_loaded()
    n = sp.ktotal("ALL")
    spice.reload()
    assert spice.is_loaded()
    assert sp.ktotal("ALL") == n
    assert evaluate(*SHACK, T, 2.0).sun_el == pytest.approx(1.4405358515025681)


# --- fix 6: mask without observer_height_m ---------------------------------------------

@needs_kernels
def test_mask_without_height_is_accepted_for_any_height():
    for h in (0.0, 2.0, 10.0):
        r = evaluate(*SHACK, T, h, flat_mask(5.0))
        assert r.sun_horizon_el == 5.0
    s = evaluate_series(*SHACK, "2026-11-14T00:00:00Z", "2026-11-14T06:00:00Z", 60, 7.0,
                        flat_mask(5.0))
    assert s.summary["sun_fraction_of_time"] == 0.0
    with pytest.raises(ValueError, match="observer_height_m"):
        evaluate(*SHACK, T, 7.0, flat_mask(5.0, height=2.0))
