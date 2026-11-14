# Contracts

This file gives the shared rules for all workstreams. It is short on purpose. Change it when an experiment shows a better choice, and record the change in the log at the end of this file.

## 1. Repository layout

| Folder | Owner workstream | Contents |
|---|---|---|
| `ui/` | UI | Vite + TypeScript + three.js web app |
| `core/` | Core algorithm | Python package `lunarnav` (Sun/Earth geometry, visibility) |
| `data/` | Terrain data | Package `lunarterrain` (horizon masks from LOLA DEMs), scripts and the site list |
| `api/` | API | FastAPI app that calls `core/` |
| `docs/` | All | Notes, findings, decisions |

Large data files go in `data/raw/` or `data/cache/`. Git ignores these folders.

## 2. Tech stack

- **UI:** Vite + TypeScript + three.js. Node 18 is installed, so use Vite 5 or 6 (Vite 7 needs Node 20).
- **Core, data and API:** Python 3.14 through `uv` (`~/.local/bin/uv`), with numpy, spiceypy and rasterio. Each folder is its own uv project.
- **API:** FastAPI, deployed on Google Cloud Run (later).

## 3. Conventions

| Item | Rule |
|---|---|
| Time | UTC, ISO 8601 text (`2026-11-14T12:00:00Z`). Outputs always use this form. Section 4 gives the input rules. |
| Lunar coordinates | Planetocentric latitude and longitude in degrees, Moon Mean Earth / Polar Axis (ME) frame |
| Longitude | East-positive, range −180 to +180. Section 4 gives the input rules. |
| Azimuth | Degrees clockwise from local north (0 = north, 90 = east), range 0 to 360 |
| Elevation | Degrees above the local horizontal plane. The local horizontal plane is perpendicular to the radius from the Moon centre. |
| Distance, height | Metres. The reference sphere radius is 1,737,400 m. |
| Observer height | Metres above the terrain surface |

At the exact pole, "north" is not defined. Do not use a point at exactly ±90° latitude.

## 4. Core algorithm

```
evaluate(lat_deg, lon_deg, utc, observer_height_m, horizon_mask=None, *, surface_height_m=0.0) -> Result
```

- `horizon_mask = None` means a flat horizon of 0° in all directions.
- `surface_height_m` is the terrain height above the 1,737,400 m sphere. The terrain workstream supplies it.
- A horizon mask is valid for one observer height only. If `horizon_mask.observer_height_m` is not equal to `observer_height_m`, `evaluate` must raise `ValueError`.
- A mask with no `observer_height_m` is accepted for all observer heights. This is for synthetic masks. A mask from terrain data must have `observer_height_m`.
- `evaluate` raises `ValueError` at exactly ±90° latitude.

Input rules (for `evaluate` and `evaluate_series`):

| Input | Rule |
|---|---|
| Time text | ISO 8601. Text with an offset (`Z`, `+02:00`, `-05:30`) is converted to UTC. Text with no offset is UTC. Text that cannot be parsed gives `ValueError`. |
| `datetime` | An aware `datetime` is converted to UTC. A naive `datetime` is UTC. |
| Latitude | Range −90 to +90. Outside this range: `ValueError`. |
| Longitude | Range −180 to +360. A value in (180, 360] is converted to −180 to +180. Thus the two common conventions both work. Outside this range: `ValueError`. |

`Result` fields:

| Field | Meaning | Unit |
|---|---|---|
| `sun_az`, `sun_el` | Direction and elevation of the Sun's centre | degrees |
| `sun_horizon_el` | Terrain horizon elevation in the direction of the Sun | degrees |
| `sun_visible_fraction` | Part of the Sun's disk above the terrain horizon | 0 to 1 |
| `earth_az`, `earth_el` | Direction and elevation of Earth's centre | degrees |
| `earth_horizon_el` | Terrain horizon elevation in the direction of Earth | degrees |
| `earth_visible` | Earth's centre is above the terrain horizon | boolean |
| `earth_margin` | `earth_el − earth_horizon_el` | degrees |

### Time series

```
evaluate_series(lat_deg, lon_deg, start_utc, stop_utc, step_minutes, observer_height_m,
                horizon_mask=None, *, surface_height_m=0.0, event_tol_s=1.0) -> SeriesResult
```

- The steps are `start_utc`, `start_utc` + `step_minutes`, and so on, to `stop_utc`. If `stop_utc` is not on a step, it is the last step.
- `stop_utc` must not be before `start_utc`. `step_minutes` must be more than 0. If not, the result is `ValueError`.
- If `stop_utc` is equal to `start_utc`, the result has one step. Then `span_h` is 0, there are no events, each `*_fraction_of_time` is 1 or 0 (the state at that instant), `mean_sun_visible_fraction` is the value at that instant, and the periods are 0.
- The other arguments are the same as for `evaluate`.
- `event_tol_s` is the accuracy of the event times, in seconds.

`SeriesResult` fields: `times_utc` (list of text), `arrays` (one array for each `Result` field), `events` and `summary`.

Each event is `{"type": ..., "utc": ...}`. The events are in time order. The `utc` text has whole seconds.

| Event type | Definition |
|---|---|
| `sunrise` | `sun_visible_fraction` changes from 0 to more than 0 |
| `sunset` | `sun_visible_fraction` changes from more than 0 to 0 |
| `earthrise` | `earth_visible` changes from false to true |
| `earthset` | `earth_visible` changes from true to false |

An event is a change between two adjacent steps. Bisection finds its time. Two changes in one step are not found. The state at `start_utc` is not an event.

| Summary field | Meaning | Unit |
|---|---|---|
| `span_h` | Time from `start_utc` to `stop_utc` | hours |
| `n_steps` | Number of steps | count |
| `sun_fraction_of_time` | Part of the span with `sun_visible_fraction` > 0 | 0 to 1 |
| `mean_sun_visible_fraction` | Time-weighted mean of `sun_visible_fraction` | 0 to 1 |
| `earth_fraction_of_time` | Part of the span with `earth_visible` | 0 to 1 |
| `both_fraction_of_time` | Part of the span with the Sun and Earth both visible | 0 to 1 |
| `time_to_next_sunset_h` | Time from `start_utc` to the first sunset. Null if the Sun is not visible at `start_utc`, or if there is no sunset. | hours |
| `time_to_next_earthset_h` | Time from `start_utc` to the first earthset. Null if Earth is not visible at `start_utc`, or if there is no earthset. | hours |
| `longest_sun_period_h` | Longest continuous period with the Sun visible | hours |
| `longest_earth_period_h` | Longest continuous period with Earth visible | hours |
| `longest_both_period_h` | Longest continuous period with the Sun and Earth both visible | hours |

The fractions and periods use the event times. A period that touches `start_utc` or `stop_utc` stops at that edge.

### Next events

```
next_events(lat_deg, lon_deg, after_utc, observer_height_m, horizon_mask=None, *,
            surface_height_m=0.0, max_days=400, step_hours=2, event_tol_s=1.0) -> dict
```

- The result is `{"sunrise": utc | None, "sunset": ..., "earthrise": ..., "earthset": ...}`. Each value is the first event of that type after `after_utc`.
- `None` means no event of that type in `max_days`.
- The search uses steps of `step_hours`. Then bisection finds the time. Two changes in one step are not found. The state at `after_utc` is not an event.

The core repeats `evaluate` over a timespan at one point (`evaluate_series`). The application layer repeats it over the points inside a site radius.

## 5. API

The API returns a full timespan in one call, not one instant per request. The source is `api/src/lunarnav_api/main.py`. The interactive schema is at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz`, `/v1/health` | Status. Cloud Run blocks paths that end in "z", so deployed clients must use `/v1/health`. |
| POST | `/v1/series` | `evaluate_series` at one point, with the terrain horizon and the next events |
| POST | `/v1/moon-state` | Moon state at each step |
| GET | `/v1/mask` | Terrain horizon mask at one point (section 6) |
| GET | `/v1/sites` | Site list (section 7) |

Errors: an incorrect request gives HTTP 422. A request with more than 20,000 steps gives HTTP 422. A `ValueError` from the core, for example a mask height mismatch, gives HTTP 422.

Longitude: all endpoints accept `lon_deg` from −180 to +360. The API changes a value in (180, 360] to the range −180 to +180. Outputs always use −180 to +180.

Single instant: in `/v1/series` and `/v1/moon-state`, `stop_utc` can be equal to `start_utc`. The result has one step.

### `GET /healthz`

| Field | Type | Meaning |
|---|---|---|
| `status` | text | `"ok"` |
| `lunarnav` | text | Version of the core package |
| `kernels_loaded` | boolean | The SPICE kernels are loaded |

### `POST /v1/series`

Request:

| Field | Type | Default | Rule |
|---|---|---|---|
| `lat_deg` | number | required | More than −90 and less than +90 |
| `lon_deg` | number | required | −180 to +360 |
| `start_utc`, `stop_utc` | ISO 8601 text | required | An offset is converted to UTC. No offset is UTC. `stop_utc` must not be before `start_utc`. |
| `step_minutes` | number | 60 | More than 0 |
| `observer_height_m` | number | 2.0 | 0 or more. Above the terrain. |
| `surface_height_m` | number | 0.0 | Terrain height above the 1,737,400 m sphere. The API does not use it when `horizon.source` is `"terrain"`. |
| `mask` | object or null | null | Horizon mask (section 6). `az_step_deg` and `elevation_deg` are required. |
| `terrain` | `"auto"` or `"none"` | `"auto"` | `"auto"`: if there is no `mask` and the DEMs cover the point, use the terrain mask. `"none"`: no terrain mask. |

The horizon rules, in order:

1. If the request has a `mask`, the API uses it (`source` is `"provided"`). The surface height is the request `surface_height_m` if the request gives it. If not, it is the mask `surface_height_m` if the mask has it. If not, it is 0.
2. If `terrain` is `"auto"` and the DEMs cover the point, the API uses the terrain mask for the observer height (`source` is `"terrain"`). The surface height is the mask `surface_height_m`. The API rounds the observer height to 0.01 m (the mask cache key).
3. If not, the horizon is flat at 0° (`source` is `"flat"`). The surface height is the request `surface_height_m`.

Response:

| Field | Type | Meaning |
|---|---|---|
| `times_utc` | list of text | The steps |
| `series` | object | One list for each `Result` field (section 4), with one value for each step |
| `events` | list of `{type, utc}` | Events (section 4) |
| `summary` | object | Summary fields (section 4) |
| `horizon` | object | The horizon that the API used (see below) |
| `next_events` | object | First event of each type after `stop_utc` (see below) |

Fields of `horizon`:

| Field | Type | Meaning |
|---|---|---|
| `source` | text | `"terrain"`, `"flat"` or `"provided"` |
| `surface_height_m` | number or null | The surface height that the API used. Null for `"flat"` if the request does not give `surface_height_m`. |
| `az_step_deg` | number or null | Mask azimuth step. Null for `"flat"`. |
| `elevation_deg` | list or null | Mask elevations (section 6). Null for `"flat"`. |
| `dem_source` | text or null | DEM products of the mask. Null for `"flat"`. |
| `terrain_status` | text | `ok`: terrain is in use. `no_coverage`: the DEMs do not cover the point. `unavailable`: the DEMs cover the point, but this server has no DEM files and no cached mask, so the flat horizon can be wrong. `not_requested`: a mask was provided, or `terrain` is `"none"`. |

Fields of `next_events`: `sunrise`, `sunset`, `earthrise` and `earthset`. Each value is UTC text with whole seconds, or null. The API uses `next_events` (section 4) with the same horizon and surface height as the series. It searches for 400 days after `stop_utc` with a 2 h step. Null means no event of that type in 400 days.

### `GET /v1/mask`

Query parameters:

| Parameter | Type | Default | Rule |
|---|---|---|---|
| `lat_deg` | number | required | More than −90 and less than +90 |
| `lon_deg` | number | required | −180 to +360 |
| `observer_height_m` | number | 2.0 | 0 or more |

Response: the mask JSON (section 6), with `surface_height_m`. The API rounds `lat_deg` and `lon_deg` to 10⁻⁵° and `observer_height_m` to 0.01 m. It calculates the mask at the rounded values. The response gives the rounded values.

| Status | `detail.code` | Cause |
|---|---|---|
| 404 | `no_terrain` | The DEMs do not cover the point (north of 60° S), or a horizon ray leaves the DEMs |
| 503 | `terrain_unavailable` | The DEM files are not present, and the cache does not have the mask |

The error body is `{"detail": {"code": "...", "message": "..."}}`.

Cache: the API keeps masks in memory (LRU, 512 masks) and on disk (`LUNARNAV_MASK_CACHE`, default `data/cache/masks/`). A point with no terrain is also cached. A cold mask takes about 0.6 s. A cached mask takes about 3 ms.

### `POST /v1/moon-state`

Request: `start_utc`, `stop_utc` and `step_minutes`, with the same rules as `/v1/series`.

Response:

| Field | Type | Meaning |
|---|---|---|
| `frame` | text | `"MOON_ME"` |
| `inertial_frame` | text | `"J2000"` |
| `states` | list | One object for each step |

Fields of each object in `states`. All positions are apparent (`LT+S`) from the Moon's centre.

| Field | Type | Meaning |
|---|---|---|
| `utc` | text | The step |
| `sub_solar_lat_deg`, `sub_solar_lon_deg` | number | Point where the Sun is at the zenith, degrees |
| `sub_earth_lat_deg`, `sub_earth_lon_deg` | number | Point where Earth is at the zenith, degrees |
| `sun_distance_km`, `earth_distance_km` | number | Distance from the Moon's centre, km |
| `sun_me_km`, `earth_me_km` | 3 numbers | Vector from the Moon's centre, `MOON_ME`, km |
| `sun_dir_me`, `earth_dir_me` | 3 numbers | Unit vector, `MOON_ME` |
| `sun_dir_j2000`, `earth_dir_j2000` | 3 numbers | Unit vector, `J2000` |
| `me_to_j2000` | 9 numbers | 3 × 3 rotation, row by row: `v_J2000 = M · v_ME` |

### `GET /v1/sites`

Response: the contents of `data/sites.json` (section 7). The variable `LUNARNAV_SITES` sets the file path. If the file does not exist, the response is `[]`. If the file is not valid JSON, the response is HTTP 500.

## 6. Horizon mask format

A JSON file for each (point, observer height) pair:

```json
{
  "lat_deg": -89.45, "lon_deg": -137.31, "observer_height_m": 2.0,
  "surface_height_m": 1955.01,
  "dem_source": "<LOLA product name>",
  "az_step_deg": 0.5,
  "elevation_deg": [/* 720 values: azimuth 0.0, 0.5, ... 359.5 */]
}
```

| Field | Meaning |
|---|---|
| `lat_deg`, `lon_deg` | The point. `lon_deg` is in the range −180 to +180. |
| `observer_height_m` | Observer height above the terrain, metres. Optional only for synthetic masks (section 4). |
| `surface_height_m` | Terrain height at the point above the 1,737,400 m sphere, metres, rounded to 0.01 m. Use this value as `surface_height_m` in `evaluate`. Optional. The terrain tool always writes it. |
| `dem_source` | The DEM products that the tool used |
| `az_step_deg` | Azimuth step, degrees |
| `elevation_deg` | Horizon elevation at each azimuth step, degrees, rounded to 0.001° |

The terrain tool is the package `lunarterrain` in `data/` (`data/src/lunarterrain/horizon.py`). The CLI is `data/horizon.py`. The variable `LUNARNAV_DEM_DIR` sets the DEM folder. The default is `data/raw/`. The tool makes no mask if the point or a horizon ray (150 km) is outside the DEMs. Thus there are masks only south of about 65° S.

## 7. Site list format

`data/sites.json` is a list of objects:

```json
{ "id": "apollo-11", "name": "Apollo 11", "mission": "Apollo 11", "agency": "NASA",
  "status": "past", "lat_deg": 0.674, "lon_deg": 23.473, "radius_m": 500,
  "source": "<URL of the coordinate source>" }
```

`status` is one of `past`, `planned` or `candidate`.

## 8. Change log

- 2026-11-14: First version.
- 2026-11-14: Python 3.14 through uv. `surface_height_m` added to `evaluate`. Mask height check added. API timespan rule added.
- 2026-11-14: `evaluate_series` added to section 4. Time offset, latitude and longitude input rules added. A mask with no `observer_height_m` is accepted. Section 5 now gives the real API endpoints.
- 2026-11-14: `surface_height_m` added to the mask format. `GET /v1/mask` added. `/v1/series` has `terrain`, `horizon` and `next_events`. The API accepts `lon_deg` up to 360. `stop_utc` can be equal to `start_utc`. `next_events` added to section 4.
- 2026-11-14: `horizon.terrain_status` added. `/v1/health` added for Cloud Run.
