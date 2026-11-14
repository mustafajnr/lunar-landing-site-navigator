# Contracts

This file gives the shared rules for all workstreams. It is short on purpose. Change it when an experiment shows a better choice, and record the change in the log at the end of this file.

## 1. Repository layout

| Folder | Owner workstream | Contents |
|---|---|---|
| `ui/` | UI | Vite + TypeScript + three.js web app |
| `core/` | Core algorithm | Python package `lunarnav` (Sun/Earth geometry, visibility) |
| `data/` | Terrain data | Scripts that get and process LOLA terrain data and the site list |
| `api/` | API (later) | FastAPI app that calls `core/` |
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
- `stop_utc` must be after `start_utc`. `step_minutes` must be more than 0. If not, the result is `ValueError`.
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

The core repeats `evaluate` over a timespan at one point (`evaluate_series`). The application layer repeats it over the points inside a site radius.

## 5. API

The API returns a full timespan in one call, not one instant per request. The source is `api/src/lunarnav_api/main.py`. The interactive schema is at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Status |
| POST | `/v1/series` | `evaluate_series` at one point |
| POST | `/v1/moon-state` | Moon state at each step |
| GET | `/v1/sites` | Site list (section 7) |

Errors: an incorrect request gives HTTP 422. A request with more than 20,000 steps gives HTTP 422. A `ValueError` from the core, for example a mask height mismatch, gives HTTP 422.

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
| `lon_deg` | number | required | −180 to +180. The API does not accept the 0 to 360 convention. |
| `start_utc`, `stop_utc` | ISO 8601 text | required | An offset is converted to UTC. No offset is UTC. |
| `step_minutes` | number | 60 | More than 0 |
| `observer_height_m` | number | 2.0 | 0 or more. Above the terrain. |
| `surface_height_m` | number | 0.0 | Terrain height above the 1,737,400 m sphere |
| `mask` | object or null | null | Horizon mask (section 6). `az_step_deg` and `elevation_deg` are required. |

Response:

| Field | Type | Meaning |
|---|---|---|
| `times_utc` | list of text | The steps |
| `series` | object | One list for each `Result` field (section 4), with one value for each step |
| `events` | list of `{type, utc}` | Events (section 4) |
| `summary` | object | Summary fields (section 4) |

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
  "dem_source": "<LOLA product name>",
  "az_step_deg": 0.5,
  "elevation_deg": [/* 720 values: azimuth 0.0, 0.5, ... 359.5 */]
}
```

`observer_height_m` is optional only for synthetic masks (section 4).

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
