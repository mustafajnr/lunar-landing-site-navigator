# lunarnav-api

FastAPI app over the `lunarnav` core package (`../core`) and the `lunarterrain` terrain package (`../data`). Both are editable path dependencies.

## Run

```sh
export PATH=~/.local/bin:$PATH
(cd ../core && uv run python scripts/get_kernels.py)   # once: SPICE kernels -> core/kernels/
export LUNARNAV_DEM_DIR=/path/to/data/raw              # optional: the LOLA DEMs (3.5 GB)
uv run uvicorn lunarnav_api.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/docs for the interactive schema.
CONTRACTS.md section 5 gives the request and response fields.

Tests: `uv run pytest`. The terrain tests need the DEMs. Set `LUNARNAV_DEM_DIR`. If the DEMs are not present, pytest skips these tests.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness. Kernels are loaded at startup. `kernels_loaded` is the real SPICE state. |
| POST | `/v1/series` | Sun/Earth az/el and visibility at one point over a span, with rise/set events and a summary |
| POST | `/v1/moon-state` | Sub-solar and sub-Earth points, Sun/Earth vectors (MOON_ME and J2000), MOON_ME->J2000 rotation, per time step |
| GET | `/v1/mask` | Terrain horizon mask at one point, with `surface_height_m` |
| GET | `/v1/sites` | `data/sites.json`, or `[]` if the file does not exist |

Both POST endpoints accept at most 20,000 time steps (HTTP 422 above that).
`stop_utc` can be equal to `start_utc`. Then the result has one step.
All endpoints accept `lon_deg` from −180 to +360. The API changes (180, 360] to −180..+180.

```sh
curl -s localhost:8000/v1/series -H 'content-type: application/json' -d '{
  "lat_deg": 0.674, "lon_deg": 23.473, "observer_height_m": 2.0,
  "start_utc": "2026-11-14T00:00:00Z", "stop_utc": "2026-12-14T00:00:00Z",
  "step_minutes": 60}'
```

`/v1/series` also takes these fields:

- `terrain`: `"auto"` (default) or `"none"`. With `"auto"` and no `mask`, the API uses the terrain mask if the DEMs cover the point. If not, the horizon is flat.
- `mask`: a horizon mask (CONTRACTS.md section 6). It has priority over `terrain`. The mask `observer_height_m` must equal the request `observer_height_m`.
- `surface_height_m`: terrain height above the 1,737,400 m sphere. The API does not use it with a terrain mask. It uses the mask value.

The response has two more blocks. This example is the connecting ridge point (−89.45, −137.31, on the Shackleton–de Gerlache ridge), 2026-11-14 to 2026-12-14:

```json
"horizon": {"source": "terrain", "surface_height_m": 1955.01, "az_step_deg": 0.5,
            "elevation_deg": [0.104, 0.105, ...], "dem_source": "LDEM_80S_20MPP_ADJ + ..."},
"next_events": {"sunrise": "2027-01-24T11:57:15Z", "sunset": "2027-01-20T08:58:28Z",
                "earthrise": "2026-12-15T15:10:00Z", "earthset": "2026-12-26T11:09:54Z"}
```

`next_events` gives the first event of each type after `stop_utc`. The search is 400 days long, with a 2 h step and then bisection. Null means no event of that type in 400 days. The search adds about 0.15 s.

### `GET /v1/mask`

```sh
curl -s 'localhost:8000/v1/mask?lat_deg=-89.45&lon_deg=-137.31&observer_height_m=2'
```

The response is the mask JSON (CONTRACTS.md section 6). The API rounds the latitude and longitude to 10⁻⁵° and the height to 0.01 m. These rounded values are the cache key.

| Status | `detail.code` | Cause |
|---|---|---|
| 404 | `no_terrain` | The point is north of 60° S, or a 150 km horizon ray leaves the DEMs (about north of 65° S) |
| 503 | `terrain_unavailable` | The DEM files are not present, and the cache does not have the mask |

Timings (WSL2 laptop): a new mask takes 0.6 s. A cached mask takes 3 ms. A 30-day `/v1/series` at 60 min with `terrain: auto` takes 0.66 s with a new mask and 0.23 s with a cached mask.

The API calculates masks outside the SPICE lock. A separate lock serializes the DEM reads.

## Environment variables

| Name | Default | Meaning |
|---|---|---|
| `LUNARNAV_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed origins |
| `LUNARNAV_SITES` | `<repo>/data/sites.json` | Site list file |
| `LUNARNAV_KERNELS` | `core/kernels` | SPICE kernel folder (read by `lunarnav`) |
| `LUNARNAV_DEM_DIR` | `<repo>/data/raw` | Folder with `LDEM_80S_20MPP_ADJ.TIF` and `LDEM_60S_120MPP_ADJ.TIF` (read by `lunarterrain`) |
| `LUNARNAV_MASK_CACHE` | `<repo>/data/cache/masks` | Disk cache of horizon masks. The folder can be read-only. |
| `PORT` | `8080` | Listen port in the Docker image |

## Docker (Cloud Run)

Build context is the repository root:

```sh
docker build -f api/Dockerfile -t lunarnav-api .
docker run --rm -p 8080:8080 lunarnav-api
curl localhost:8080/healthz
```

If `docker build` says buildx is missing, use the legacy builder:
`DOCKER_BUILDKIT=0 docker build -f api/Dockerfile -t lunarnav-api .`
The legacy builder ignores `api/Dockerfile.dockerignore`, so the context is
larger, but the image is the same (the Dockerfile copies named paths only).
The image contains `data/sites.json` at `/app/data/sites.json`. `LUNARNAV_SITES`
points to it, so `/v1/sites` returns the site list.
The image also contains the precomputed masks (`data/masks/precomputed`) at
`/app/data/cache/masks`. `LUNARNAV_MASK_CACHE` points to it. The image does not
contain the DEMs. `LUNARNAV_DEM_DIR` is `/dem`.

## Deployment of the terrain data

The DEMs are 3.5 GB. This is too large for the Docker image. These are the options:

| Option | Terrain at the curated sites | Terrain at other points | Cost and work |
|---|---|---|---|
| A. Precomputed masks in the image | Yes (0, 2 and 10 m) | No. Flat horizon, and `/v1/mask` gives 503. | 244 kB in the image. Done. |
| B. DEMs in Google Cloud Storage, mounted on Cloud Run at `/dem` | Yes | Yes, 0.6 s for each new mask | About 0.1 USD each month for storage. A Cloud Storage volume mount (gcsfuse) on the Cloud Run service. The first read of each DEM tile is slow (network). |
| C. A cropped and downsampled DEM in the image | Yes, but less accurate | Yes, with less accuracy | Work to make and to check a new DEM. A 40 m 80–90° S DEM is 685 MB. The masks change. |

Recommendation: use option A now. It is in the image and it works (36 masks: the 10
south-pole sites and the two Shackleton points, at 0, 2 and 10 m). The UI gets terrain
for all curated sites. Then add option B if the UI must show terrain at a point that
the user selects. Option B needs no code change. Mount the bucket at `/dem`. The
container user cannot write to `/app/data/cache/masks`, so new masks stay in the
memory cache only. Do not use option C, because it changes the results.

To make the precomputed masks again:

```sh
LUNARNAV_DEM_DIR=/path/to/data/raw uv run python scripts/precompute_masks.py
```

Option B, for later (not done):

```sh
gcloud storage buckets create gs://BUCKET --location=REGION
gcloud storage cp ../data/raw/LDEM_*.TIF gs://BUCKET/
gcloud run services update lunarnav-api --add-volume=name=dem,type=cloud-storage,bucket=BUCKET,readonly=true \
    --add-volume-mount=volume=dem,mount-path=/dem
```

## Notes

- CSPICE is not thread-safe. All SPICE work runs under one lock, so one
  process computes one request at a time. Scale with more processes/instances.
- The mask calculation does not use SPICE. It runs outside the SPICE lock.
- `scripts/fetch_horizons_subpoints.py` refreshes the Horizons fixture used by
  `tests/test_moon_state.py`.
