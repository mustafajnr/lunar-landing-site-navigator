import json

import pytest

from conftest import needs_kernels
from lunarnav import evaluate
from lunarnav_api import main

pytestmark = needs_kernels

APOLLO = {"lat_deg": 0.674, "lon_deg": 23.473}
SPAN = {"start_utc": "2026-11-14T00:00:00Z", "stop_utc": "2026-12-19T00:00:00Z"}


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["kernels_loaded"] is True


def test_series_apollo11(client):
    r = client.post("/v1/series", json={**APOLLO, **SPAN})  # defaults: 2 m, 60 min
    assert r.status_code == 200, r.text
    d = r.json()
    n = 35 * 24 + 1
    assert len(d["times_utc"]) == n
    assert d["times_utc"][0] == "2026-11-14T00:00:00Z"
    assert set(d["series"]) == {"sun_az", "sun_el", "sun_horizon_el", "sun_visible_fraction",
                                "earth_az", "earth_el", "earth_horizon_el", "earth_visible",
                                "earth_margin"}
    assert all(len(v) == n for v in d["series"].values())
    assert [e["type"] for e in d["events"]] == ["sunrise", "sunset", "sunrise"]
    s = d["summary"]
    assert s["earth_fraction_of_time"] == 1.0
    assert s["time_to_next_sunset_h"] is None  # night at the start
    # Same numbers as the core.
    i = 200
    ref = evaluate(APOLLO["lat_deg"], APOLLO["lon_deg"], d["times_utc"][i], 2.0)
    assert d["series"]["sun_el"][i] == pytest.approx(ref.sun_el, abs=1e-12)
    assert d["series"]["earth_visible"][i] is ref.earth_visible


def test_series_with_mask(client):
    mask = {"lat_deg": -89.45, "lon_deg": -137.31, "observer_height_m": 2.0,
            "dem_source": "synthetic", "az_step_deg": 0.5, "elevation_deg": [5.0] * 720}
    body = {"lat_deg": -89.45, "lon_deg": -137.31, **SPAN, "mask": mask}
    d = client.post("/v1/series", json=body).json()
    assert d["summary"]["sun_fraction_of_time"] == 0.0
    assert d["series"]["sun_horizon_el"][0] == 5.0


def test_series_mask_height_mismatch_is_422(client):
    mask = {"observer_height_m": 2.0, "az_step_deg": 0.5, "elevation_deg": [0.0] * 720}
    r = client.post("/v1/series", json={**APOLLO, **SPAN, "observer_height_m": 10.0,
                                        "mask": mask})
    assert r.status_code == 422
    assert "observer_height_m" in r.json()["detail"]


def test_series_bad_mask_length_is_422(client):
    mask = {"az_step_deg": 0.5, "elevation_deg": [0.0] * 10}
    r = client.post("/v1/series", json={**APOLLO, **SPAN, "mask": mask})
    assert r.status_code == 422


def test_series_step_limit(client):
    # 20,000 steps is allowed; 20,001 is not.
    ok = {**APOLLO, "start_utc": "2026-11-14T00:00:00Z", "stop_utc": "2026-11-27T21:19:00Z",
          "step_minutes": 1}
    assert client.post("/v1/series", json=ok).status_code == 200
    big = {**APOLLO, "start_utc": "2026-11-14T00:00:00Z", "stop_utc": "2026-11-27T21:20:00Z",
           "step_minutes": 1}
    r = client.post("/v1/series", json=big)
    assert r.status_code == 422
    assert "20001 time steps" in r.json()["detail"]
    assert "limit is 20000" in r.json()["detail"]


@pytest.mark.parametrize("bad", [
    {"lat_deg": 90.0},
    {"lon_deg": 200.0},
    {"step_minutes": 0},
    {"stop_utc": "2026-11-01T00:00:00Z"},
    {"start_utc": "not a date"},
])
def test_series_rejects_bad_input(client, bad):
    r = client.post("/v1/series", json={**APOLLO, **SPAN, **bad})
    assert r.status_code == 422


def test_moon_state_step_limit(client):
    r = client.post("/v1/moon-state", json={"start_utc": "2026-01-01T00:00:00Z",
                                            "stop_utc": "2028-01-01T00:00:00Z",
                                            "step_minutes": 10})
    assert r.status_code == 422


def test_sites_empty_when_file_missing(client, monkeypatch, tmp_path):
    monkeypatch.setattr(main, "SITES_PATH", tmp_path / "sites.json")
    r = client.get("/v1/sites")
    assert r.status_code == 200 and r.json() == []


def test_sites_returns_file(client, monkeypatch, tmp_path):
    site = {"id": "apollo-11", "name": "Apollo 11", "mission": "Apollo 11", "agency": "NASA",
            "status": "past", "lat_deg": 0.674, "lon_deg": 23.473, "radius_m": 500,
            "source": "https://example.org"}
    p = tmp_path / "sites.json"
    p.write_text(json.dumps([site]))
    monkeypatch.setattr(main, "SITES_PATH", p)
    assert client.get("/v1/sites").json() == [site]


def test_cors_allows_vite_dev_server(client):
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        r = client.options("/v1/series", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"})
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == origin
    r = client.get("/healthz", headers={"Origin": "http://other.example"})
    assert "access-control-allow-origin" not in r.headers


def test_healthz_and_series_after_kclear(client):
    import spiceypy as sp

    sp.kclear()
    assert client.get("/healthz").json()["kernels_loaded"] is False
    r = client.post("/v1/series", json={**APOLLO, "start_utc": "2026-11-14T00:00:00Z",
                                        "stop_utc": "2026-11-14T06:00:00Z"})
    assert r.status_code == 200, r.text  # the core loads the kernels again
    assert client.get("/healthz").json()["kernels_loaded"] is True


def test_series_accepts_offset_times(client):
    base = {**APOLLO, "step_minutes": 60}
    a = client.post("/v1/series", json={**base, "start_utc": "2026-11-14T00:00:00Z",
                                        "stop_utc": "2026-11-14T06:00:00Z"}).json()
    b = client.post("/v1/series", json={**base, "start_utc": "2026-11-14T02:00:00+02:00",
                                        "stop_utc": "2026-11-13T22:00:00-08:00"}).json()
    assert a["times_utc"] == b["times_utc"]
    assert a["series"] == b["series"]
