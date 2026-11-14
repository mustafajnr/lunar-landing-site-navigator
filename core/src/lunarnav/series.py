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
from datetime import datetime, timedelta, timezone

import numpy as np
import spiceypy as sp

from .core import (
    HorizonMask,
    Result,
    check_mask_height,
    evaluate_at,
    site_and_frame,
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
    """ISO 8601 text or datetime -> naive UTC datetime."""
    if isinstance(utc, datetime):
        d = utc
    else:
        s = str(utc).strip()
        if s.endswith(("Z", "z")):
            s = s[:-1] + "+00:00"
        d = datetime.fromisoformat(s)
    if d.tzinfo is not None:
        d = d.astimezone(timezone.utc).replace(tzinfo=None)
    return d


def format_utc(d: datetime) -> str:
    return d.replace(microsecond=0).isoformat() + "Z"


def et_to_utc(et: float) -> str:
    return sp.et2utc(et, "ISOC", 0) + "Z"


def time_grid(start_utc, stop_utc, step_minutes: float) -> list[datetime]:
    """start, start+step, ... up to stop. stop is added if it is not on the grid."""
    t0, t1 = parse_utc(start_utc), parse_utc(stop_utc)
    if not t1 > t0:
        raise ValueError("stop_utc must be after start_utc")
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
    if not t1 > t0:
        raise ValueError("stop_utc must be after start_utc")
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

    def total(iv):
        return float(sum(b - a for a, b in iv))

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
    mean_frac = float(np.sum(0.5 * (f[1:] + f[:-1]) * dt) / span)

    summary = {
        "span_h": _hours(span),
        "n_steps": len(times),
        "sun_fraction_of_time": total(intervals["sun"]) / span,
        "mean_sun_visible_fraction": mean_frac,
        "earth_fraction_of_time": total(intervals["earth"]) / span,
        "both_fraction_of_time": total(intervals["both"]) / span,
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
