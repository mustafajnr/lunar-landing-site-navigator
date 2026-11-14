# lunarnav-api

FastAPI app over the `lunarnav` core package (`../core`, editable path dependency).

## Run

```sh
export PATH=~/.local/bin:$PATH
(cd ../core && uv run python scripts/get_kernels.py)   # once: SPICE kernels -> core/kernels/
uv run uvicorn lunarnav_api.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/docs for the interactive schema.

Tests: `uv run pytest`

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness. Kernels are loaded at startup. |
| POST | `/v1/series` | Sun/Earth az/el and visibility at one point over a span, with rise/set events and a summary |
| POST | `/v1/moon-state` | Sub-solar and sub-Earth points, Sun/Earth vectors (MOON_ME and J2000), MOON_ME->J2000 rotation, per time step |
| GET | `/v1/sites` | `data/sites.json`, or `[]` if the file does not exist |

Both POST endpoints accept at most 20,000 time steps (HTTP 422 above that).

```sh
curl -s localhost:8000/v1/series -H 'content-type: application/json' -d '{
  "lat_deg": 0.674, "lon_deg": 23.473, "observer_height_m": 2.0,
  "start_utc": "2026-11-14T00:00:00Z", "stop_utc": "2026-12-14T00:00:00Z",
  "step_minutes": 60}'
```

`/v1/series` also takes `mask` (horizon mask JSON, CONTRACTS.md section 6) and
`surface_height_m` (terrain height above the 1,737,400 m sphere). The mask
`observer_height_m` must equal the request `observer_height_m`.

## Environment variables

| Name | Default | Meaning |
|---|---|---|
| `LUNARNAV_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed origins |
| `LUNARNAV_SITES` | `<repo>/data/sites.json` | Site list file |
| `LUNARNAV_KERNELS` | `core/kernels` | SPICE kernel folder (read by `lunarnav`) |
| `PORT` | `8080` | Listen port in the Docker image |

## Docker (Cloud Run)

Build context is the repository root:

```sh
docker build -f api/Dockerfile -t lunarnav-api .
docker run --rm -p 8080:8080 lunarnav-api
curl localhost:8080/healthz
```

## Notes

- CSPICE is not thread-safe. All SPICE work runs under one lock, so one
  process computes one request at a time. Scale with more processes/instances.
- `scripts/fetch_horizons_subpoints.py` refreshes the Horizons fixture used by
  `tests/test_moon_state.py`.
