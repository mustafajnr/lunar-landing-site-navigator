"""Whole-Moon geometry at one instant: sub-solar and sub-Earth points, directions, rotation.

This gives the data that the UI globe needs (ui/src/ephemeris.ts, moonState()).
Vectors are apparent (LT+S) positions seen from the Moon centre.
"""

from __future__ import annotations

import math

import numpy as np
import spiceypy as sp

from .core import ABCORR, FRAME
from .spice import ensure_loaded

INERTIAL = "J2000"


def _lat_lon(v) -> tuple[float, float]:
    _r, lon, lat = sp.reclat(v)
    lon_deg = math.degrees(lon)
    if lon_deg <= -180.0:
        lon_deg += 360.0
    return math.degrees(lat), lon_deg


def moon_state_et(et: float) -> dict:
    """Moon state at TDB seconds past J2000."""
    ensure_loaded()
    sun, _ = sp.spkpos("SUN", et, FRAME, ABCORR, "MOON")
    earth, _ = sp.spkpos("EARTH", et, FRAME, ABCORR, "MOON")
    sun, earth = np.asarray(sun), np.asarray(earth)
    m = np.asarray(sp.pxform(FRAME, INERTIAL, et))  # v_J2000 = m @ v_ME
    sun_u = sun / np.linalg.norm(sun)
    earth_u = earth / np.linalg.norm(earth)
    ss_lat, ss_lon = _lat_lon(sun)
    se_lat, se_lon = _lat_lon(earth)
    return {
        "sub_solar_lat_deg": ss_lat,
        "sub_solar_lon_deg": ss_lon,
        "sub_earth_lat_deg": se_lat,
        "sub_earth_lon_deg": se_lon,
        "earth_distance_km": float(np.linalg.norm(earth)),
        "sun_distance_km": float(np.linalg.norm(sun)),
        "sun_me_km": sun.tolist(),
        "earth_me_km": earth.tolist(),
        "sun_dir_me": sun_u.tolist(),
        "earth_dir_me": earth_u.tolist(),
        "sun_dir_j2000": (m @ sun_u).tolist(),
        "earth_dir_j2000": (m @ earth_u).tolist(),
        "me_to_j2000": m.reshape(-1).tolist(),  # 3x3 row-major
    }
