# Deployment

Both parts run on Google Cloud Run in project `lunar-site-select`, region `europe-west1`. The images go to Artifact Registry repository `lunarsite`.

| Service | URL | Source |
|---|---|---|
| `lunarsite-api` | https://api.lunarsite.select (also https://lunarsite-api-763981639147.europe-west1.run.app) | `api/Dockerfile` (build context: repository root) |
| `lunarsite-ui` | https://lunarsite.select (also https://lunarsite-ui-763981639147.europe-west1.run.app) | `ui/Dockerfile` (build context: `ui/`) |

## Deploy the API

Run these commands from the repository root:

```bash
gcloud builds submit . --config deploy/cloudbuild-api.yaml --region europe-west1
gcloud run deploy lunarsite-api --image europe-west1-docker.pkg.dev/lunar-site-select/lunarsite/api:latest --region europe-west1
```

The service settings are: concurrency 1 (SPICE is not thread-safe), at most 3 instances, 0 minimum instances, 1 CPU and 2 GiB. `LUNARNAV_CORS_ORIGINS` lists the UI origins.

## Deploy the UI

Run these commands from `ui/`. `_API_URL` sets the API address that goes into the build.

```bash
gcloud builds submit . --config ../deploy/cloudbuild-ui.yaml --region europe-west1
gcloud run deploy lunarsite-ui --image europe-west1-docker.pkg.dev/lunar-site-select/lunarsite/ui:latest --region europe-west1
```

## Notes

- Cloud Run blocks URL paths that end in "z". Use `/v1/health`, not `/healthz`.
- The API image has no DEM files. The private bucket `gs://lunar-site-select-dem` holds the two LOLA DEMs (3.3 GiB). Cloud Run mounts it read-only at `/dem` (`LUNARNAV_DEM_DIR`). The mount needs the gen2 execution environment. The compute service account has `roles/storage.objectViewer` on the bucket.
- A new mask takes about 3 to 4 s through the mount. A cached mask takes less than 0.1 s. The cache is local to each instance, and the precomputed masks in the image are always available.
- If the mount fails, polar points get `terrain_status: "unavailable"`, and the UI shows a warning.

To add the mount again on a new service:

```bash
gcloud run services update lunarsite-api --region europe-west1 \
  --execution-environment gen2 --memory 2Gi \
  --add-volume name=dem,type=cloud-storage,bucket=lunar-site-select-dem,readonly=true \
  --add-volume-mount volume=dem,mount-path=/dem
```
- A budget alert of £40 watches the project.
