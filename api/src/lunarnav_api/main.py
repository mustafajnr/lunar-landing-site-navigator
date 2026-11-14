"""FastAPI app: time series, Moon state and site list (CONTRACTS.md sections 3-7).

Run (from api/):  uv run uvicorn lunarnav_api.main:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from importlib.metadata import version
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from lunarnav import spice
from lunarnav.core import utc_to_et
from lunarnav.moon import moon_state_et
from lunarnav.series import count_steps, evaluate_series, format_utc, time_grid
from lunarnav.spice import ensure_loaded

MAX_STEPS = 20_000
DEFAULT_CORS = "http://localhost:5173,http://127.0.0.1:5173"
CORS_ORIGINS = [
    o.strip() for o in os.environ.get("LUNARNAV_CORS_ORIGINS", DEFAULT_CORS).split(",") if o.strip()
]
SITES_PATH = Path(
    os.environ.get("LUNARNAV_SITES", Path(__file__).resolve().parents[3] / "data" / "sites.json")
)

# CSPICE is not thread-safe. FastAPI runs sync endpoints in a thread pool, so all
# SPICE work goes through this lock.
_spice_lock = threading.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_loaded()  # load the SPICE kernels once; fail fast if they are missing
    yield


app = FastAPI(title="Lunar Landing Site Navigator API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# --- models ---------------------------------------------------------------------

class HorizonMaskIn(BaseModel):
    """CONTRACTS.md section 6."""

    lat_deg: float | None = None
    lon_deg: float | None = None
    observer_height_m: float | None = None
    dem_source: str | None = None
    az_step_deg: float = Field(gt=0)
    elevation_deg: list[float]


class SpanIn(BaseModel):
    start_utc: datetime = Field(examples=["2026-11-14T00:00:00Z"])
    stop_utc: datetime = Field(examples=["2026-12-14T00:00:00Z"])
    step_minutes: float = Field(60.0, gt=0, description="sample step in minutes")


class SeriesIn(SpanIn):
    lat_deg: float = Field(gt=-90, lt=90, description="planetocentric latitude, MOON_ME")
    lon_deg: float = Field(ge=-180, le=180, description="east longitude")
    observer_height_m: float = Field(2.0, ge=0, description="above the terrain surface")
    surface_height_m: float = Field(
        0.0, description="terrain height above the 1,737,400 m sphere (from the terrain data)")
    mask: HorizonMaskIn | None = None


class Event(BaseModel):
    type: str  # sunrise | sunset | earthrise | earthset
    utc: str


class Summary(BaseModel):
    span_h: float
    n_steps: int
    sun_fraction_of_time: float
    mean_sun_visible_fraction: float
    earth_fraction_of_time: float
    both_fraction_of_time: float
    time_to_next_sunset_h: float | None
    time_to_next_earthset_h: float | None
    longest_sun_period_h: float
    longest_earth_period_h: float
    longest_both_period_h: float


class SeriesArrays(BaseModel):
    sun_az: list[float]
    sun_el: list[float]
    sun_horizon_el: list[float]
    sun_visible_fraction: list[float]
    earth_az: list[float]
    earth_el: list[float]
    earth_horizon_el: list[float]
    earth_visible: list[bool]
    earth_margin: list[float]


class SeriesOut(BaseModel):
    times_utc: list[str]
    series: SeriesArrays
    events: list[Event]
    summary: Summary


class MoonStateItem(BaseModel):
    utc: str
    sub_solar_lat_deg: float
    sub_solar_lon_deg: float
    sub_earth_lat_deg: float
    sub_earth_lon_deg: float
    earth_distance_km: float
    sun_distance_km: float
    sun_me_km: list[float] = Field(description="Moon centre -> Sun, MOON_ME, km (apparent)")
    earth_me_km: list[float] = Field(description="Moon centre -> Earth, MOON_ME, km (apparent)")
    sun_dir_me: list[float]
    earth_dir_me: list[float]
    sun_dir_j2000: list[float]
    earth_dir_j2000: list[float]
    me_to_j2000: list[float] = Field(
        description="3x3 row-major rotation: v_J2000 = M @ v_MOON_ME")


class MoonStateOut(BaseModel):
    frame: str = "MOON_ME"
    inertial_frame: str = "J2000"
    states: list[MoonStateItem]


# --- helpers ----------------------------------------------------------------------

def _check_steps(span: SpanIn) -> None:
    try:
        n = count_steps(span.start_utc, span.stop_utc, span.step_minutes)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    if n > MAX_STEPS:
        raise HTTPException(
            422,
            f"request has {n} time steps; the limit is {MAX_STEPS}. "
            "Use a larger step_minutes or a shorter span.",
        )


# --- endpoints --------------------------------------------------------------------

@app.get("/healthz")
def healthz() -> dict:
    with _spice_lock:
        loaded = spice.is_loaded()
    return {"status": "ok", "lunarnav": version("lunarnav"), "kernels_loaded": loaded}


@app.post("/v1/series", response_model=SeriesOut)
def series(req: SeriesIn) -> dict:
    _check_steps(req)
    mask = req.mask.model_dump() if req.mask else None
    try:
        with _spice_lock:
            r = evaluate_series(
                req.lat_deg, req.lon_deg, req.start_utc, req.stop_utc, req.step_minutes,
                req.observer_height_m, mask, surface_height_m=req.surface_height_m,
            )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return {
        "times_utc": r.times_utc,
        "series": {k: v.tolist() for k, v in r.arrays.items()},
        "events": r.events,
        "summary": r.summary,
    }


@app.post("/v1/moon-state", response_model=MoonStateOut)
def moon_state(req: SpanIn) -> dict:
    _check_steps(req)
    times = time_grid(req.start_utc, req.stop_utc, req.step_minutes)
    with _spice_lock:
        states = []
        for t in times:
            utc = format_utc(t)
            states.append({"utc": utc, **moon_state_et(utc_to_et(utc))})
    return {"states": states}


@app.get("/v1/sites")
def sites() -> list:
    """data/sites.json (CONTRACTS.md section 7), or [] until the terrain workstream adds it."""
    if not SITES_PATH.is_file():
        return []
    try:
        return json.loads(SITES_PATH.read_text())
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"{SITES_PATH.name} is not valid JSON: {e}") from e
