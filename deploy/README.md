# Deployment

Both parts run on Google Cloud Run in project `lunar-site-select`, region `europe-west1`. The images go to Artifact Registry repository `lunarsite`.

| Service | URL | Source |
|---|---|---|
| `lunarsite-api` | https://lunarsite-api-763981639147.europe-west1.run.app | `api/Dockerfile` (build context: repository root) |
| `lunarsite-ui` | https://lunarsite-ui-763981639147.europe-west1.run.app | `ui/Dockerfile` (build context: `ui/`) |

## Deploy the API

Run these commands from the repository root:

```bash
gcloud builds submit . --config deploy/cloudbuild-api.yaml --region europe-west1
gcloud run deploy lunarsite-api --image europe-west1-docker.pkg.dev/lunar-site-select/lunarsite/api:latest --region europe-west1
```

The service settings are: concurrency 1 (SPICE is not thread-safe), at most 3 instances, 0 minimum instances, 1 CPU and 1 GiB. `LUNARNAV_CORS_ORIGINS` lists the UI origins.

## Deploy the UI

Run these commands from `ui/`. `_API_URL` sets the API address that goes into the build.

```bash
gcloud builds submit . --config ../deploy/cloudbuild-ui.yaml --region europe-west1
gcloud run deploy lunarsite-ui --image europe-west1-docker.pkg.dev/lunar-site-select/lunarsite/ui:latest --region europe-west1
```

## Tile cache

The site map loads NASA Moon Trek tiles. Trek is slow (about 0.45 s for each tile, HTTP/1.1). The public bucket `gs://lunar-site-select-tiles` (`europe-west1`) holds copies of the Trek tiles around the curated sites and the default point. The bucket keeps the Trek path (`{EQ|SP}/{LAYER}/1.0.0/default/default028mm/{z}/{row}/{col}.{ext}`). `manifest.json` in the bucket gives the tile ranges for each layer and zoom, and the tiles that Trek does not have. The UI loads a tile from the bucket if the manifest has it, and from Trek if not.

- `VITE_TILE_CACHE_URL` sets the bucket URL. `ui/.env.production` sets it to `https://storage.googleapis.com/lunar-site-select-tiles` for production builds. If it is empty, the UI uses Trek only. `npm run dev` does not use the cache unless you set the variable, for example `VITE_TILE_CACHE_URL=https://storage.googleapis.com/lunar-site-select-tiles npm run dev`.
- Access: `allUsers` has `roles/storage.objectViewer` (NASA public-domain imagery). CORS allows GET and HEAD from `https://lunarsite.select`, the Cloud Run UI URL, `http://localhost:5173` and `http://127.0.0.1:5173`.

Seed (download from Trek to `ui/.tile-cache/`, not in git). Run these commands from `ui/`. The script uses the same layer rules as the map (`src/detail/stack.ts`), at most 6 requests at a time, retries with backoff, and resumes when you run it again. `--plan` prints the tile count and the size estimate and then stops. The script stops if the estimate is more than `--max-gb` (default 2).

```bash
NODE_EXTRA_CA_CERTS=scripts/sectigo-root-r46.pem npx tsx scripts/seed_tiles.ts --plan
NODE_EXTRA_CA_CERTS=scripts/sectigo-root-r46.pem npx tsx scripts/seed_tiles.ts
```

Upload (tiles first, then the manifest, so the UI never points to a tile that is not there yet):

```bash
gcloud storage rsync -r .tile-cache/tiles gs://lunar-site-select-tiles --cache-control="public, max-age=31536000"
gcloud storage cp .tile-cache/manifest.json gs://lunar-site-select-tiles/manifest.json --cache-control="public, max-age=300"
```

Bucket setup (done once):

```bash
gcloud storage buckets create gs://lunar-site-select-tiles --project lunar-site-select --location europe-west1 --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://lunar-site-select-tiles --member=allUsers --role=roles/storage.objectViewer
gcloud storage buckets update gs://lunar-site-select-tiles --cors-file=cors.json
```

`cors.json`:

```json
[{"origin": ["https://lunarsite.select", "https://lunarsite-ui-763981639147.europe-west1.run.app", "http://localhost:5173", "http://127.0.0.1:5173"],
  "method": ["GET", "HEAD"], "responseHeader": ["Content-Type", "Cache-Control", "ETag"], "maxAgeSeconds": 3600}]
```

## Notes

- Cloud Run blocks URL paths that end in "z". Use `/v1/health`, not `/healthz`.
- The API image has no DEM files. Only the precomputed masks give terrain. Other polar points get `terrain_status: "unavailable"`.
- A budget alert of £40 watches the project.
