"""Sun and Earth geometry for one lunar surface point at one instant (CONTRACTS.md section 4)."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

import numpy as np
import spiceypy as sp

from .horizon import HorizonMask, as_mask
from .spice import ensure_loaded

MOON_RADIUS_M = 1_737_400.0
FRAME = "MOON_ME"
ABCORR = "LT+S"
MASK_HEIGHT_TOL_M = 1e-6
_Z = np.array([0.0, 0.0, 1.0])
_sun_radius_km: float | None = None


@dataclass(frozen=True)
class Result:
    sun_az: float
    sun_el: float
    sun_horizon_el: float
    sun_visible_fraction: float
    earth_az: float
    earth_el: float
    earth_horizon_el: float
    earth_visible: bool
    earth_margin: float

    def to_dict(self) -> dict:
        return asdict(self)


TIME_HINT = "use ISO 8601 text, for example 2026-11-14T12:00:00Z or 2026-11-14T14:00:00+02:00"


def to_utc_datetime(utc) -> datetime:
    """ISO 8601 text or a datetime -> naive UTC datetime.

    Text with an offset (Z, +02:00, -05:30, ...) is converted to UTC.
    Text without an offset is UTC. A naive datetime is UTC.
    Text that cannot be parsed raises ValueError.
    """
    if isinstance(utc, datetime):
        d = utc
    elif isinstance(utc, str):
        s = utc.strip()
        if s.endswith("z"):
            s = s[:-1] + "Z"
        try:
            d = datetime.fromisoformat(s)
        except ValueError:
            raise ValueError(f"cannot parse time {utc!r}: {TIME_HINT}") from None
    else:
        raise TypeError(f"time must be ISO 8601 text or a datetime, not {type(utc).__name__}")
    if d.tzinfo is not None:
        d = d.astimezone(timezone.utc).replace(tzinfo=None)
    return d


def utc_to_et(utc) -> float:
    """ISO 8601 text or a datetime -> TDB seconds past J2000.

    The rules are those of to_utc_datetime(). If Python cannot parse the text, SPICE
    str2et tries it as UTC (for example the leap second 2016-12-31T23:59:60Z).
    If SPICE cannot parse it either, the result is ValueError.
    """
    ensure_loaded()
    try:
        d = to_utc_datetime(utc)
    except ValueError as e:
        s = utc.strip()
        if s.endswith(("Z", "z")):
            s = s[:-1]
        try:
            return sp.str2et(s)  # SPICE default time system is UTC
        except sp.utils.exceptions.SpiceyError:
            raise e from None
    return sp.str2et(d.isoformat())


def check_lat_lon(lat_deg, lon_deg) -> tuple[float, float]:
    """Validate latitude and longitude. Return (lat_deg, lon_deg) with lon in -180..+180.

    Latitude must be in [-90, 90]. Longitude must be in [-180, 360]. A longitude in
    (180, 360] is converted to the -180..+180 range, so both conventions work.
    """
    lat, lon = float(lat_deg), float(lon_deg)
    if not (math.isfinite(lat) and -90.0 <= lat <= 90.0):
        raise ValueError(f"lat_deg must be in the range -90 to 90, got {lat_deg}")
    if not (math.isfinite(lon) and -180.0 <= lon <= 360.0):
        raise ValueError(f"lon_deg must be in the range -180 to 360, got {lon_deg}")
    if lon > 180.0:
        lon -= 360.0
    return lat, lon


def site_position_km(lat_deg, lon_deg, height_m) -> np.ndarray:
    """Planetocentric lat/lon + height above the 1737.4 km sphere -> MOON_ME vector (km)."""
    r_km = (MOON_RADIUS_M + height_m) / 1000.0
    return np.array(sp.latrec(r_km, math.radians(lon_deg), math.radians(lat_deg)))


def local_frame(pos) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """East, north, up unit vectors. Up is radial; east = pole x up; north = up x east."""
    up = pos / np.linalg.norm(pos)
    east = np.cross(_Z, up)
    n = np.linalg.norm(east)
    if n < 1e-12:
        raise ValueError("north is undefined at the exact pole")
    east /= n
    north = np.cross(up, east)
    return east, north, up


def az_el(vec, enu) -> tuple[float, float]:
    east, north, up = enu
    v = vec / np.linalg.norm(vec)
    el = math.degrees(math.asin(max(-1.0, min(1.0, float(v @ up)))))
    az = math.degrees(math.atan2(float(v @ east), float(v @ north))) % 360.0
    return az, el


def disk_fraction_above(center_el, horizon_el, radius_deg) -> float:
    """Area fraction of a disk above a straight horizontal line (circular segment)."""
    h = center_el - horizon_el
    r = radius_deg
    if h >= r:
        return 1.0
    if h <= -r:
        return 0.0
    f = 0.5 + (h * math.sqrt(r * r - h * h) + r * r * math.asin(h / r)) / (math.pi * r * r)
    return min(1.0, max(0.0, f))


def _sun_radius() -> float:
    global _sun_radius_km
    if _sun_radius_km is None:
        _sun_radius_km = float(sp.bodvrd("SUN", "RADII", 3)[1][0])
    return _sun_radius_km


def apparent_vector_km(target: str, et: float, site_km) -> np.ndarray:
    """Apparent (LT+S) position of target from a fixed site on the Moon, in MOON_ME (km)."""
    state, _lt = sp.spkcpo(target, et, FRAME, "OBSERVER", ABCORR, site_km, "MOON", FRAME)
    return np.asarray(state[:3])


def check_mask_height(mask: HorizonMask | None, observer_height_m: float) -> None:
    """A mask is valid for one observer height only (CONTRACTS.md section 4).

    A mask without observer_height_m is accepted on purpose. This is for synthetic
    masks, for example a constant 5 deg wall. There is no height check for such a mask.
    """
    if mask is None or mask.observer_height_m is None:
        return
    if abs(float(mask.observer_height_m) - float(observer_height_m)) > MASK_HEIGHT_TOL_M:
        raise ValueError(
            f"horizon mask is for observer_height_m={mask.observer_height_m}, "
            f"but observer_height_m={observer_height_m} was requested"
        )


def evaluate(
    lat_deg: float,
    lon_deg: float,
    utc,
    observer_height_m: float,
    horizon_mask: HorizonMask | dict | None = None,
    *,
    surface_height_m: float = 0.0,
) -> Result:
    """Sun and Earth direction and visibility at one point and one instant.

    surface_height_m: terrain height above the 1,737,400 m sphere (extension to the
    contract; terrain workstream will supply it). observer_height_m is above the terrain.
    """
    ensure_loaded()
    mask = as_mask(horizon_mask)
    check_mask_height(mask, observer_height_m)
    site, enu = site_and_frame(lat_deg, lon_deg, observer_height_m, surface_height_m)
    return evaluate_at(site, enu, utc_to_et(utc), mask)


def site_and_frame(lat_deg, lon_deg, observer_height_m, surface_height_m=0.0):
    """Observer position (MOON_ME, km) and its east/north/up frame.

    Raises ValueError if latitude or longitude is out of range (check_lat_lon),
    and at exactly +-90 deg latitude (local_frame).
    """
    lat_deg, lon_deg = check_lat_lon(lat_deg, lon_deg)
    site = site_position_km(lat_deg, lon_deg, surface_height_m + observer_height_m)
    return site, local_frame(site)


def evaluate_at(site, enu, et: float, mask: HorizonMask | None) -> Result:
    """evaluate() for a precomputed site and frame at TDB seconds `et`.

    Used by the time-series layer to skip repeated parsing and checks.
    The caller must check the mask height (check_mask_height).
    """
    sun_vec = apparent_vector_km("SUN", et, site)
    earth_vec = apparent_vector_km("EARTH", et, site)
    sun_az, sun_el = az_el(sun_vec, enu)
    earth_az, earth_el = az_el(earth_vec, enu)

    sun_hz = mask.elevation_at(sun_az) if mask else 0.0
    earth_hz = mask.elevation_at(earth_az) if mask else 0.0

    sun_radius_deg = math.degrees(math.asin(_sun_radius() / np.linalg.norm(sun_vec)))
    frac = disk_fraction_above(sun_el, sun_hz, sun_radius_deg)

    return Result(
        sun_az=sun_az,
        sun_el=sun_el,
        sun_horizon_el=sun_hz,
        sun_visible_fraction=frac,
        earth_az=earth_az,
        earth_el=earth_el,
        earth_horizon_el=earth_hz,
        earth_visible=earth_el > earth_hz,
        earth_margin=earth_el - earth_hz,
    )
