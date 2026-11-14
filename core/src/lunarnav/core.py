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


def utc_to_et(utc) -> float:
    """ISO 8601 UTC text (with or without a trailing Z) or a datetime -> TDB seconds past J2000."""
    ensure_loaded()
    if isinstance(utc, datetime):
        if utc.tzinfo is not None:
            utc = utc.astimezone(timezone.utc).replace(tzinfo=None)
        utc = utc.isoformat()
    s = str(utc).strip()
    if s.endswith(("Z", "z")):
        s = s[:-1]
    elif s.endswith("+00:00"):
        s = s[:-6]
    return sp.str2et(s)  # SPICE default time system is UTC


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

    A mask without observer_height_m is accepted (synthetic or legacy masks).
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
    et = utc_to_et(utc)
    site = site_position_km(lat_deg, lon_deg, surface_height_m + observer_height_m)
    enu = local_frame(site)

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
