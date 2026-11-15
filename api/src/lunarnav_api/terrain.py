"""Terrain horizon masks for the API: lunarterrain + an LRU cache + a disk cache.

The cache key is (lat rounded to 1e-5 deg, lon rounded to 1e-5 deg, observer
height rounded to 0.01 m). The mask is calculated at the rounded values, so a
cached mask is the same as a new one.

The disk cache is one JSON file per key. A point with no terrain is cached too
(a file with "no_terrain"). The disk cache also works with no DEMs: put
precomputed masks in the cache folder (see api/README.md, Deployment).

No SPICE here. The API calls this outside the SPICE lock. A separate lock
serializes the DEM reads, because rasterio datasets are not thread-safe.
"""

from __future__ import annotations

import json
import os
import threading
from collections import OrderedDict
from pathlib import Path

from lunarterrain import NoTerrain, Terrain, dem_dir, dems_available, make_mask_json

__all__ = ["MaskCache", "NoTerrain", "TerrainUnavailable", "mask_key", "normalize_lon"]

DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[3] / "data" / "cache" / "masks"
MIN_LAT_DEG = -60.0  # the coarse DEM ends at 60 S
LRU_SIZE = 512


class TerrainUnavailable(RuntimeError):
    """The DEM files are not present, and the cache does not have the mask."""


def normalize_lon(lon_deg: float) -> float:
    """[-180, 360] -> [-180, 180]. A value in (180, 360] is changed by -360."""
    return lon_deg - 360.0 if lon_deg > 180.0 else lon_deg


def mask_key(lat_deg: float, lon_deg: float, observer_height_m: float) -> tuple:
    lat = round(float(lat_deg), 5) + 0.0  # + 0.0 changes -0.0 to 0.0
    lon = round(normalize_lon(float(lon_deg)), 5) + 0.0
    h = round(float(observer_height_m), 2) + 0.0
    return lat, lon, h


class MaskCache:
    def __init__(self, cache_dir: Path | str | None = None, lru_size: int = LRU_SIZE):
        self.cache_dir = Path(cache_dir or os.environ.get("LUNARNAV_MASK_CACHE")
                              or DEFAULT_CACHE_DIR)
        self.lru_size = lru_size
        self._lru: OrderedDict[tuple, dict] = OrderedDict()
        self._lru_lock = threading.Lock()
        self._dem_lock = threading.Lock()
        self._terrain: Terrain | None = None

    # ---- public ----
    def get(self, lat_deg: float, lon_deg: float, observer_height_m: float) -> dict:
        """Mask JSON (CONTRACTS.md section 6) with surface_height_m.

        Raises NoTerrain if the DEMs do not cover the point or its horizon rays.
        Raises TerrainUnavailable if the DEM files are missing and no cache has the mask.
        """
        return self.get_with_origin(lat_deg, lon_deg, observer_height_m)[0]

    def get_with_origin(self, lat_deg: float, lon_deg: float,
                        observer_height_m: float) -> tuple[dict, str]:
        """(mask, origin). The same as get(), and also the origin of the mask.

        origin is "memory_cache", "disk_cache" or "computed". Precomputed masks are
        files in the disk cache, so their origin is "disk_cache".
        """
        key = mask_key(lat_deg, lon_deg, observer_height_m)
        lat, lon, h = key
        if lat > MIN_LAT_DEG:
            raise NoTerrain(f"the DEMs cover 60-90 S only; lat_deg={lat} is north of 60 S")
        origin = "memory_cache"
        entry = self._lru_get(key)
        if entry is None:
            origin = "disk_cache"
            entry = self._disk_get(key)
            if entry is None:
                with self._dem_lock:
                    entry = self._lru_get(key)
                    if entry is not None:
                        origin = "memory_cache"
                    else:
                        entry = self._disk_get(key)
                    if entry is None:
                        origin = "computed"
                        entry = self._compute(lat, lon, h)
                        self._disk_put(key, entry)
            self._lru_put(key, entry)
        if "no_terrain" in entry:
            raise NoTerrain(entry["no_terrain"])
        return entry, origin

    def clear_memory(self) -> None:
        with self._lru_lock:
            self._lru.clear()

    # ---- internals ----
    def _compute(self, lat, lon, h) -> dict:
        if self._terrain is None:
            if not dems_available():
                raise TerrainUnavailable(
                    f"DEM files are not in {dem_dir()}. Set LUNARNAV_DEM_DIR.")
            self._terrain = Terrain()
        try:
            mask, _h_site = make_mask_json(self._terrain, lat, lon, h)
        except NoTerrain as e:
            return {"no_terrain": str(e)}
        return mask

    def _path(self, key) -> Path:
        lat, lon, h = key
        return self.cache_dir / f"{lat:.5f}_{lon:.5f}_h{h:.2f}.json"

    def _disk_get(self, key) -> dict | None:
        try:
            return json.loads(self._path(key).read_text())
        except (OSError, ValueError):
            return None

    def _disk_put(self, key, entry: dict) -> None:
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            p = self._path(key)
            tmp = p.with_suffix(f".{os.getpid()}.{threading.get_ident()}.tmp")
            tmp.write_text(json.dumps(entry))
            tmp.replace(p)
        except OSError:
            pass  # a read-only cache folder is allowed

    def _lru_get(self, key) -> dict | None:
        with self._lru_lock:
            entry = self._lru.get(key)
            if entry is not None:
                self._lru.move_to_end(key)
            return entry

    def _lru_put(self, key, entry: dict) -> None:
        with self._lru_lock:
            self._lru[key] = entry
            self._lru.move_to_end(key)
            while len(self._lru) > self.lru_size:
                self._lru.popitem(last=False)
