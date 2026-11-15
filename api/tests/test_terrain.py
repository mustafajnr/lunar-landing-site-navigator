import json
from datetime import timedelta
from pathlib import Path

import pytest

from conftest import needs_kernels
from lunarnav.series import parse_utc
from lunarnav_api import main
from lunarnav_api.terrain import MaskCache, mask_key
from lunarterrain import dems_available

pytestmark = needs_kernels
needs_dems = pytest.mark.skipif(not dems_available(),
                                reason="DEMs missing; set LUNARNAV_DEM_DIR")

MASKS = Path(__file__).resolve().parents[2] / "data" / "masks"
RIDGE = {"lat_deg": -89.45, "lon_deg": -137.31}
FLOOR = {"lat_deg": -89.67, "lon_deg": 129.78}
APOLLO = {"lat_deg": 0.674, "lon_deg": 23.473}
SPAN30 = {"start_utc": "2026-11-14T00:00:00Z", "stop_utc": "2026-12-14T00:00:00Z"}


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch, tmp_path):
    cache = MaskCache(tmp_path / "masks")
    monkeypatch.setattr(main, "masks", cache)
    return cache


def test_mask_key_rounding():
    assert mask_key(-89.450001, 222.69, 2.004) == (-89.45, -137.31, 2.0)
    assert mask_key(-89.45, -137.31, 2.0) == mask_key(-89.4500004, -137.3099996, 1.996)


def test_mask_north_of_60s_is_404(client):
    r = client.get("/v1/mask", params={**APOLLO, "observer_height_m": 2.0})
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "no_terrain"
    assert r.json()["detail"]["message"]


def test_mask_bad_lon_is_422(client):
    r = client.get("/v1/mask", params={"lat_deg": -89.0, "lon_deg": 361.0})
    assert r.status_code == 422


@needs_dems
def test_mask_ridge_matches_committed_file(client, fresh_cache):
    ref = json.loads((MASKS / "connecting_ridge_-89.45_-137.31_h2.json").read_text())
    r = client.get("/v1/mask", params={**RIDGE, "observer_height_m": 2.0})
    assert r.status_code == 200, r.text
    assert r.json() == ref
    # The disk cache has the mask, and a new process (new MaskCache) reads it.
    files = list(fresh_cache.cache_dir.glob("*.json"))
    assert len(files) == 1
    assert MaskCache(fresh_cache.cache_dir).get(-89.45, -137.31, 2.0) == ref
    # 0..360 longitude gives the same mask.
    r2 = client.get("/v1/mask", params={"lat_deg": -89.45, "lon_deg": 222.69})
    assert r2.json() == ref


@needs_dems
def test_mask_ray_leaves_dem_is_404(client):
    r = client.get("/v1/mask", params={"lat_deg": -62.0, "lon_deg": 0.0})
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "no_terrain"


def test_mask_without_dems_uses_disk_cache(client, fresh_cache, monkeypatch):
    monkeypatch.setenv("LUNARNAV_DEM_DIR", str(fresh_cache.cache_dir / "nothing"))
    r = client.get("/v1/mask", params={"lat_deg": -85.0, "lon_deg": 10.0})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "terrain_unavailable"
    ref = json.loads((MASKS / "connecting_ridge_-89.45_-137.31_h2.json").read_text())
    fresh_cache.cache_dir.mkdir(parents=True, exist_ok=True)
    (fresh_cache.cache_dir / "-89.45000_-137.31000_h2.00.json").write_text(json.dumps(ref))
    r = client.get("/v1/mask", params={**RIDGE})
    assert r.status_code == 200 and r.json() == ref
    # /v1/series with terrain auto falls back to flat when there is no mask.
    d = client.post("/v1/series", json={"lat_deg": -85.0, "lon_deg": 10.0, **SPAN30}).json()
    assert d["horizon"]["source"] == "flat"


@needs_dems
def test_series_auto_shackleton_floor(client):
    r = client.post("/v1/series", json={**FLOOR, **SPAN30, "terrain": "auto"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["summary"]["sun_fraction_of_time"] == 0.0
    hz = d["horizon"]
    assert hz["source"] == "terrain"
    assert hz["surface_height_m"] == pytest.approx(-2788.94)
    assert hz["az_step_deg"] == 0.5 and len(hz["elevation_deg"]) == 720
    assert "LDEM_80S_20MPP_ADJ" in hz["dem_source"]
    assert min(d["series"]["sun_horizon_el"]) > 15.0


@needs_dems
def test_series_terrain_none_and_provided_mask(client):
    flat = client.post("/v1/series", json={**FLOOR, **SPAN30, "terrain": "none"}).json()
    assert flat["horizon"] == {"source": "flat", "surface_height_m": None,
                               "az_step_deg": None, "elevation_deg": None, "dem_source": None,
                               "terrain_status": "not_requested"}
    assert flat["summary"]["sun_fraction_of_time"] > 0.0
    mask = {"observer_height_m": 2.0, "az_step_deg": 0.5, "elevation_deg": [1.0] * 720,
            "surface_height_m": 100.0}
    d = client.post("/v1/series", json={**FLOOR, **SPAN30, "mask": mask}).json()
    assert d["horizon"]["source"] == "provided"
    assert d["horizon"]["surface_height_m"] == 100.0
    assert d["series"]["sun_horizon_el"][0] == 1.0


def test_series_apollo_is_flat_with_next_events(client):
    r = client.post("/v1/series", json={**APOLLO, **SPAN30})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["horizon"]["source"] == "flat"
    nxt = d["next_events"]
    stop = parse_utc(SPAN30["stop_utc"])
    for kind in ("sunrise", "sunset"):
        t = parse_utc(nxt[kind])
        assert stop < t < stop + timedelta(days=30)
    assert nxt["earthrise"] is None and nxt["earthset"] is None  # near side


def test_next_events_match_a_longer_series(client):
    long = client.post("/v1/series", json={**APOLLO, "start_utc": SPAN30["start_utc"],
                                           "stop_utc": "2027-01-20T00:00:00Z",
                                           "step_minutes": 30}).json()
    after = [e for e in long["events"] if parse_utc(e["utc"]) > parse_utc(SPAN30["stop_utc"])]
    nxt = client.post("/v1/series", json={**APOLLO, **SPAN30}).json()["next_events"]
    for kind in ("sunrise", "sunset"):
        ref = next(e["utc"] for e in after if e["type"] == kind)
        assert abs((parse_utc(nxt[kind]) - parse_utc(ref)).total_seconds()) <= 2


@pytest.mark.parametrize("terrain", ["auto", "none"])
def test_lon_0_360_same_as_minus_180_180(client, terrain):
    if terrain == "auto" and not dems_available():
        pytest.skip("DEMs missing")
    a = client.post("/v1/series", json={**RIDGE, **SPAN30, "terrain": terrain}).json()
    b = client.post("/v1/series", json={"lat_deg": -89.45, "lon_deg": 222.69, **SPAN30,
                                        "terrain": terrain}).json()
    # The provenance has the response time and the mask origin (computed, then cache).
    a.pop("provenance"), b.pop("provenance")
    assert a == b


def test_single_instant(client):
    t = "2026-11-20T12:00:00Z"
    r = client.post("/v1/series", json={**APOLLO, "start_utc": t, "stop_utc": t})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["times_utc"] == [t]
    assert all(len(v) == 1 for v in d["series"].values())
    assert d["summary"]["n_steps"] == 1 and d["summary"]["span_h"] == 0.0
    assert d["next_events"]["sunset"] is not None
    m = client.post("/v1/moon-state", json={"start_utc": t, "stop_utc": t})
    assert m.status_code == 200 and len(m.json()["states"]) == 1


def test_terrain_status_no_coverage(client):
    r = client.post("/v1/series", json={"lat_deg": 0.674, "lon_deg": 23.473, **SPAN30}).json()
    assert r["horizon"]["source"] == "flat"
    assert r["horizon"]["terrain_status"] == "no_coverage"


@needs_dems
def test_terrain_status_ok(client):
    r = client.post("/v1/series", json={**FLOOR, **SPAN30}).json()
    assert r["horizon"]["terrain_status"] == "ok"


def test_health_alias(client):
    assert client.get("/v1/health").json()["status"] == "ok"
