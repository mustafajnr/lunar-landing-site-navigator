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

## Notes

- Cloud Run blocks URL paths that end in "z". Use `/v1/health`, not `/healthz`.
- The API image has no DEM files. Only the precomputed masks give terrain. Other polar points get `terrain_status: "unavailable"`.
- A budget alert of £40 watches the project.
