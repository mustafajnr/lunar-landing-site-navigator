"""Time series of evaluate() over a span, with rise/set events and summary values.

CONTRACTS.md section 4 says the application layer repeats evaluate() over a span.
This module is that layer for one point.

Events come from sign changes between consecutive samples, refined by bisection.
Two crossings inside one step (for example a short grazing sunrise behind a peak)
are not seen. Use a smaller step to catch them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, fields
from datetime import datetime, timedelta

import numpy as np
import spiceypy as sp

from .core import (
    ABCORR,
    FRAME,
    HorizonMask,
    Result,
    check_mask_height,
    evaluate_at,
    _sun_radius,
    site_and_frame,
    to_utc_datetime,
    utc_to_et,
)
from .horizon import as_mask
from .spice import ensure_loaded

RESULT_FIELDS = [f.name for f in fields(Result)]
EVENT_TOL_S = 1.0  # bisection stops when the bracket is shorter than this

EVENT_NAMES = {
    "sun": ("sunrise", "sunset"),
    "earth": ("earthrise", "earthset"),
}


@dataclass
class SeriesResult:
    times_utc: list[str]
    arrays: dict[str, np.ndarray]  # one array per Result field
    events: list[dict]  # {"type": "sunrise", "utc": "..."} in time order
    summary: dict

    def to_dict(self) -> dict:
        return {
            "times_utc": self.times_utc,
            **{k: v.tolist() for k, v in self.arrays.items()},
            "events": self.events,
            "summary": self.summary,
        }


def parse_utc(utc) -> datetime:
    """ISO 8601 text or datetime -> naive UTC datetime (rules of core.to_utc_datetime)."""
    return to_utc_datetime(utc)


def format_utc(d: datetime) -> str:
    return d.replace(microsecond=0).isoformat() + "Z"


def et_to_utc(et: float) -> str:
    return sp.et2utc(et, "ISOC", 0) + "Z"


def time_grid(start_utc, stop_utc, step_minutes: float) -> list[datetime]:
    """start, start+step, ... up to stop. stop is added if it is not on the grid.

    stop == start gives one step (a single instant).
    """
    t0, t1 = parse_utc(start_utc), parse_utc(stop_utc)
    if t1 < t0:
        raise ValueError("stop_utc must not be before start_utc")
    if not (step_minutes > 0 and math.isfinite(step_minutes)):
        raise ValueError("step_minutes must be a positive number")
    step = timedelta(minutes=step_minutes)
    n = int((t1 - t0) / step)
    times = [t0 + k * step for k in range(n + 1)]
    if t1 - times[-1] > timedelta(seconds=0.5):
        times.append(t1)
    return times


def count_steps(start_utc, stop_utc, step_minutes: float) -> int:
    """Number of samples time_grid() would make, without making it."""
    t0, t1 = parse_utc(start_utc), parse_utc(stop_utc)
    if t1 < t0:
        raise ValueError("stop_utc must not be before start_utc")
    if not (step_minutes > 0 and math.isfinite(step_minutes)):
        raise ValueError("step_minutes must be a positive number")
    span_min = (t1 - t0).total_seconds() / 60.0
    n = int(span_min // step_minutes) + 1
    return n + (1 if span_min - (n - 1) * step_minutes > 0.5 / 60 else 0)


def _bisect(pred, a: float, b: float, pa: bool, tol_s: float) -> float:
    """Crossing time of pred between ET a and b, where pred(a) == pa != pred(b)."""
    while b - a > tol_s:
        m = 0.5 * (a + b)
        if pred(m) == pa:
            a = m
        else:
            b = m
    return 0.5 * (a + b)


def _intervals(state: np.ndarray, ets: np.ndarray, crossings: list[float]) -> list[tuple]:
    """True intervals (ET) of a boolean state, using refined crossing times."""
    out = []
    t_on = ets[0] if state[0] else None
    ci = 0
    for i in range(1, len(state)):
        if state[i] != state[i - 1]:
            tc = crossings[ci]
            ci += 1
            if state[i]:
                t_on = tc
            else:
                out.append((t_on, tc))
                t_on = None
    if t_on is not None:
        out.append((t_on, ets[-1]))
    return [(float(a), float(b)) for a, b in out]


def _intersect(a: list[tuple], b: list[tuple]) -> list[tuple]:
    out, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        lo, hi = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if hi > lo:
            out.append((lo, hi))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


def _hours(s: float) -> float:
    return s / 3600.0


def evaluate_series(
    lat_deg: float,
    lon_deg: float,
    start_utc,
    stop_utc,
    step_minutes: float,
    observer_height_m: float,
    horizon_mask: HorizonMask | dict | None = None,
    *,
    surface_height_m: float = 0.0,
    event_tol_s: float = EVENT_TOL_S,
) -> SeriesResult:
    """evaluate() at each step from start_utc to stop_utc, plus events and summary.

    Summary durations use the refined event times, so they do not depend much on the
    step. Periods that touch start_utc or stop_utc are cut at the span edges.
    """
    ensure_loaded()
    mask = as_mask(horizon_mask)
    check_mask_height(mask, observer_height_m)
    site, enu = site_and_frame(lat_deg, lon_deg, observer_height_m, surface_height_m)

    times = time_grid(start_utc, stop_utc, step_minutes)
    ets = np.array([utc_to_et(format_utc(t)) for t in times])
    results = [evaluate_at(site, enu, et, mask) for et in ets]
    arrays = {
        name: np.array([getattr(r, name) for r in results],
                       dtype=bool if name == "earth_visible" else float)
        for name in RESULT_FIELDS
    }

    preds = {
        "sun": lambda et: evaluate_at(site, enu, et, mask).sun_visible_fraction > 0.0,
        "earth": lambda et: evaluate_at(site, enu, et, mask).earth_visible,
    }
    states = {
        "sun": arrays["sun_visible_fraction"] > 0.0,
        "earth": arrays["earth_visible"].copy(),
    }

    events: list[tuple[float, str]] = []
    intervals = {}
    for body, state in states.items():
        rise, set_ = EVENT_NAMES[body]
        crossings = []
        for i in np.flatnonzero(state[1:] != state[:-1]):
            tc = _bisect(preds[body], ets[i], ets[i + 1], bool(state[i]), event_tol_s)
            crossings.append(tc)
            events.append((float(tc), set_ if state[i] else rise))
        intervals[body] = _intervals(state, ets, crossings)
    intervals["both"] = _intersect(intervals["sun"], intervals["earth"])
    events.sort()

    span = float(ets[-1] - ets[0])

    def total(iv, body):
        if span == 0.0:  # single instant: the state at that instant
            return 1.0 if (states[body][0] if body != "both" else
                           states["sun"][0] and states["earth"][0]) else 0.0
        return float(sum(b - a for a, b in iv)) / span

    def longest(iv):
        return _hours(float(max((b - a for a, b in iv), default=0.0)))

    def time_to(event_type, body):
        if not states[body][0]:
            return None
        t = next((et for et, kind in events if kind == event_type), None)
        return None if t is None else _hours(float(t - ets[0]))

    # Time-weighted mean (trapezoid rule over the samples).
    f = arrays["sun_visible_fraction"]
    dt = np.diff(ets)
    mean_frac = float(np.sum(0.5 * (f[1:] + f[:-1]) * dt) / span) if span > 0 else float(f[0])

    summary = {
        "span_h": _hours(span),
        "n_steps": len(times),
        "sun_fraction_of_time": total(intervals["sun"], "sun"),
        "mean_sun_visible_fraction": mean_frac,
        "earth_fraction_of_time": total(intervals["earth"], "earth"),
        "both_fraction_of_time": total(intervals["both"], "both"),
        "time_to_next_sunset_h": time_to("sunset", "sun"),
        "time_to_next_earthset_h": time_to("earthset", "earth"),
        "longest_sun_period_h": longest(intervals["sun"]),
        "longest_earth_period_h": longest(intervals["earth"]),
        "longest_both_period_h": longest(intervals["both"]),
    }

    return SeriesResult(
        times_utc=[format_utc(t) for t in times],
        arrays=arrays,
        events=[{"type": kind, "utc": et_to_utc(et)} for et, kind in events],
        summary=summary,
    )


# --- next events after a span ----------------------------------------------------

NEXT_EVENTS_MAX_DAYS = 400.0
NEXT_EVENTS_STEP_H = 2.0
_CHUNK_DAYS = 30.0


def _scan_states(site, enu, ets: np.ndarray, mask: HorizonMask | None) -> dict:
    """Fast vectorized Sun and Earth visibility at many instants.

    Uses apparent (LT+S) vectors from the Moon centre minus the site vector. This
    is within a few metres of the exact topocentric vectors of evaluate_at. It is
    for the coarse scan only. The exact predicate refines each event.
    """
    east, north, up = enu
    out = {}
    for body in ("SUN", "EARTH"):
        pos, _lt = sp.spkpos(body, ets, FRAME, ABCORR, "MOON")
        v = np.asarray(pos) - site
        d = np.linalg.norm(v, axis=1)
        u = v / d[:, None]
        el = np.degrees(np.arcsin(np.clip(u @ up, -1.0, 1.0)))
        az = np.degrees(np.arctan2(u @ east, u @ north)) % 360.0
        if mask is None:
            hz = np.zeros_like(el)
        else:
            e = mask.elevation_deg
            grid = np.arange(len(e) + 1) * mask.az_step_deg
            hz = np.interp(az, grid, np.append(e, e[0]))
        if body == "SUN":
            r = np.degrees(np.arcsin(_sun_radius() / d))
            out["sun"] = el - hz > -r
        else:
            out["earth"] = el > hz
    return out


def next_events(
    lat_deg: float,
    lon_deg: float,
    after_utc,
    observer_height_m: float,
    horizon_mask: HorizonMask | dict | None = None,
    *,
    surface_height_m: float = 0.0,
    max_days: float = NEXT_EVENTS_MAX_DAYS,
    step_hours: float = NEXT_EVENTS_STEP_H,
    event_tol_s: float = EVENT_TOL_S,
) -> dict:
    """First sunrise, sunset, earthrise and earthset after `after_utc`.

    Returns {"sunrise": utc | None, "sunset": ..., "earthrise": ..., "earthset": ...}.
    None means no event of that type within max_days. The search uses a coarse
    step (step_hours) and then bisection. Two changes inside one coarse step are
    not found. The state at after_utc is not an event.
    """
    ensure_loaded()
    if not (step_hours > 0 and max_days > 0):
        raise ValueError("step_hours and max_days must be positive")
    mask = as_mask(horizon_mask)
    check_mask_height(mask, observer_height_m)
    site, enu = site_and_frame(lat_deg, lon_deg, observer_height_m, surface_height_m)

    preds = {
        "sun": lambda et: evaluate_at(site, enu, et, mask).sun_visible_fraction > 0.0,
        "earth": lambda et: evaluate_at(site, enu, et, mask).earth_visible,
    }
    found: dict[str, float | None] = {k: None for pair in EVENT_NAMES.values() for k in pair}
    et0 = utc_to_et(after_utc)
    et_end = et0 + max_days * 86400.0
    step = step_hours * 3600.0
    chunk = max(1, round(_CHUNK_DAYS * 24.0 / step_hours)) * step
    # Exact state at after_utc, so that a scan error at the start cannot make an event.
    last_state = {b: preds[b](et0) for b in preds}
    last_et = et0
    todo = set(preds)

    while todo and last_et < et_end:
        ets = np.arange(1, round(chunk / step) + 1) * step + last_et
        ets = ets[ets <= et_end + 1e-6]
        if ets.size == 0:
            break
        states = _scan_states(site, enu, ets, mask)
        for body in list(todo):
            rise, set_ = EVENT_NAMES[body]
            st = np.concatenate([[last_state[body]], states[body]])
            et_all = np.concatenate([[last_et], ets])
            for i in np.flatnonzero(st[1:] != st[:-1]):
                a, b = float(et_all[i]), float(et_all[i + 1])
                pa = preds[body](a)
                if pa == preds[body](b):  # the fast scan was wrong at an edge
                    continue
                kind = set_ if pa else rise
                if found[kind] is None:
                    found[kind] = _bisect(preds[body], a, b, pa, event_tol_s)
                if found[rise] is not None and found[set_] is not None:
                    todo.discard(body)
                    break
            last_state[body] = bool(st[-1])
        last_et = float(ets[-1])

    return {k: (None if v is None else et_to_utc(v)) for k, v in found.items()}
