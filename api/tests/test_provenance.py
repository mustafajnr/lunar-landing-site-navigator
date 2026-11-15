"""/v1/series provenance block (CONTRACTS.md section 5)."""

import json
import re
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path

import pytest

from conftest import needs_kernels
from lunarnav.series import EVENT_TOL_S
from lunarnav.spice import KERNELS
from lunarnav_api import main
from lunarnav_api.terrain import MaskCache
from lunarterrain import dems_available

pytestmark = needs_kernels
needs_dems = pytest.mark.skipif(not dems_available(),
                                reason="DEMs missing; set LUNARNAV_DEM_DIR")

MASKS = Path(__file__).resolve().parents[2] / "data" / "masks"
RIDGE = {"lat_deg": -89.45, "lon_deg": -137.31}
APOLLO = {"lat_deg": 0.674, "lon_deg": 23.473}
SPAN = {"start_utc": "2026-11-14T00:00:00Z", "stop_utc": "2026-11-15T00:00:00Z"}


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch, tmp_path):
    cache = MaskCache(tmp_path / "masks")
    monkeypatch.setattr(main, "masks", cache)
    return cache


def _ridge_mask() -> dict:
    return json.loads((MASKS / "connecting_ridge_-89.45_-137.31_h2.json").read_text())


def _put_in_disk_cache(cache: MaskCache, ref: dict) -> Path:
    cache.cache_dir.mkdir(parents=True, exist_ok=True)
    f = cache.cache_dir / "-89.45000_-137.31000_h2.00.json"
    f.write_text(json.dumps(ref))
    return f


def _series(client, body) -> dict:
    r = client.post("/v1/series", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_provenance_fields_flat(client):
    d = _series(client, {**APOLLO, **SPAN, "step_minutes": 30})
    p = d["provenance"]
    assert set(p) == {"software", "kernels", "ephemeris", "frame", "mask_origin",
                      "dem_source", "step_minutes", "event_tol_s", "generated_utc"}
    assert p["software"] == {"lunarnav": version("lunarnav"), "api": version("lunarnav-api")}
    assert p["ephemeris"] == "DE440" and p["frame"] == "MOON_ME"
    # All lunarnav kernels are in the list, as file names (no folder).
    assert {Path(k).name for k in KERNELS} <= set(p["kernels"])
    assert all("/" not in k for k in p["kernels"])
    assert p["mask_origin"] == "none"
    assert p["dem_source"] is None and d["horizon"]["dem_source"] is None
    assert p["step_minutes"] == 30
    assert p["event_tol_s"] == EVENT_TOL_S
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", p["generated_utc"])
    t = datetime.strptime(p["generated_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    assert abs((datetime.now(UTC) - t).total_seconds()) < 60


def test_provenance_terrain_none_and_provided(client):
    d = _series(client, {**RIDGE, **SPAN, "terrain": "none"})
    assert d["provenance"]["mask_origin"] == "none"
    mask = {"observer_height_m": 2.0, "az_step_deg": 0.5, "elevation_deg": [1.0] * 720,
            "dem_source": "synthetic"}
    d = _series(client, {**RIDGE, **SPAN, "mask": mask})
    assert d["provenance"]["mask_origin"] == "provided"
    assert d["provenance"]["dem_source"] == "synthetic"


def test_provenance_disk_then_memory_cache(client, fresh_cache, monkeypatch):
    # No DEMs: only the disk cache can give the mask (as for precomputed masks).
    monkeypatch.setenv("LUNARNAV_DEM_DIR", str(fresh_cache.cache_dir / "nothing"))
    ref = _ridge_mask()
    f = _put_in_disk_cache(fresh_cache, ref)
    d1 = _series(client, {**RIDGE, **SPAN})
    assert d1["horizon"]["source"] == "terrain"
    assert d1["provenance"]["mask_origin"] == "disk_cache"
    assert d1["provenance"]["dem_source"] == ref["dem_source"] == d1["horizon"]["dem_source"]
    d2 = _series(client, {**RIDGE, **SPAN})
    assert d2["provenance"]["mask_origin"] == "memory_cache"
    # The mask JSON format does not change: the file is the same as before.
    assert json.loads(f.read_text()) == ref


def test_get_with_origin_matches_get(fresh_cache):
    ref = _ridge_mask()
    _put_in_disk_cache(fresh_cache, ref)
    assert fresh_cache.get_with_origin(-89.45, -137.31, 2.0) == (ref, "disk_cache")
    assert fresh_cache.get(-89.45, -137.31, 2.0) == ref  # now from memory
    assert fresh_cache.get_with_origin(-89.45, 222.69, 2.0) == (ref, "memory_cache")


@needs_dems
def test_provenance_computed(client):
    d = _series(client, {**RIDGE, **SPAN})
    assert d["provenance"]["mask_origin"] == "computed"
    assert "LDEM_80S_20MPP_ADJ" in d["provenance"]["dem_source"]
    d2 = _series(client, {**RIDGE, **SPAN})
    assert d2["provenance"]["mask_origin"] == "memory_cache"
