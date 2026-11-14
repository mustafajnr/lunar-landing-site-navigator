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
- **Core and data:** Python 3.10 or later, with numpy, spiceypy and rasterio.
- **API:** FastAPI, deployed on Google Cloud Run (later).

## 3. Conventions

| Item | Rule |
|---|---|
| Time | UTC, ISO 8601 text (`2026-11-14T12:00:00Z`) |
| Lunar coordinates | Planetocentric latitude and longitude in degrees, Moon Mean Earth / Polar Axis (ME) frame |
| Longitude | East-positive, range −180 to +180 |
| Azimuth | Degrees clockwise from local north (0 = north, 90 = east), range 0 to 360 |
| Elevation | Degrees above the local horizontal plane. The local horizontal plane is perpendicular to the radius from the Moon centre. |
| Distance, height | Metres. The reference sphere radius is 1,737,400 m. |
| Observer height | Metres above the terrain surface |

At the exact pole, "north" is not defined. Do not use a point at exactly ±90° latitude.

## 4. Core algorithm

```
evaluate(lat_deg, lon_deg, utc, observer_height_m, horizon_mask=None) -> Result
```

`horizon_mask = None` means a flat horizon of 0° in all directions.

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

The application layer, not the core, repeats `evaluate` over a timespan and over the points inside a site radius.

## 5. Horizon mask format

A JSON file for each (point, observer height) pair:

```json
{
  "lat_deg": -89.45, "lon_deg": -137.31, "observer_height_m": 2.0,
  "dem_source": "<LOLA product name>",
  "az_step_deg": 0.5,
  "elevation_deg": [/* 720 values: azimuth 0.0, 0.5, ... 359.5 */]
}
```

## 6. Site list format

`data/sites.json` is a list of objects:

```json
{ "id": "apollo-11", "name": "Apollo 11", "mission": "Apollo 11", "agency": "NASA",
  "status": "past", "lat_deg": 0.674, "lon_deg": 23.473, "radius_m": 500,
  "source": "<URL of the coordinate source>" }
```

`status` is one of `past`, `planned` or `candidate`.

## 7. Change log

- 2026-11-14: First version.
