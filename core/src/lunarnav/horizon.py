"""Horizon mask (CONTRACTS.md section 5)."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class HorizonMask:
    """Terrain horizon elevation (deg) sampled at regular azimuth steps from 0 deg."""

    az_step_deg: float
    elevation_deg: np.ndarray
    lat_deg: float | None = None
    lon_deg: float | None = None
    observer_height_m: float | None = None
    dem_source: str | None = None
    meta: dict = field(default_factory=dict, compare=False)

    def __post_init__(self):
        el = np.asarray(self.elevation_deg, dtype=float)
        n = round(360.0 / self.az_step_deg)
        if el.ndim != 1 or len(el) != n or not math.isclose(n * self.az_step_deg, 360.0):
            raise ValueError(
                f"elevation_deg must have 360/az_step_deg = {360.0 / self.az_step_deg} values, "
                f"got {el.shape}"
            )
        object.__setattr__(self, "elevation_deg", el)

    @classmethod
    def from_dict(cls, d: dict) -> "HorizonMask":
        known = {"az_step_deg", "elevation_deg", "lat_deg", "lon_deg",
                 "observer_height_m", "dem_source"}
        return cls(
            az_step_deg=float(d["az_step_deg"]),
            elevation_deg=d["elevation_deg"],
            lat_deg=d.get("lat_deg"),
            lon_deg=d.get("lon_deg"),
            observer_height_m=d.get("observer_height_m"),
            dem_source=d.get("dem_source"),
            meta={k: v for k, v in d.items() if k not in known},
        )

    @classmethod
    def from_json(cls, path: str | Path) -> "HorizonMask":
        return cls.from_dict(json.loads(Path(path).read_text()))

    def elevation_at(self, az_deg: float) -> float:
        """Linear interpolation in azimuth, wrapping at 360 deg."""
        el = self.elevation_deg
        x = (az_deg % 360.0) / self.az_step_deg
        i = int(math.floor(x))
        t = x - i
        i %= len(el)
        j = (i + 1) % len(el)
        return float(el[i] * (1.0 - t) + el[j] * t)


def as_mask(mask) -> HorizonMask | None:
    if mask is None or isinstance(mask, HorizonMask):
        return mask
    if isinstance(mask, dict):
        return HorizonMask.from_dict(mask)
    raise TypeError(f"horizon_mask must be None, dict or HorizonMask, not {type(mask)}")
