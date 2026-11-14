# UI: 3D Moon globe

Vite + TypeScript + three.js. It shows the Moon orientation, Sun lighting (terminator),
Earth direction, the sub-solar and sub-Earth points, and the local Sun/Earth azimuth and
elevation for a clicked point (flat 0° horizon).

The UI needs the API (`api/`). Start both:

```
# terminal 1: API on http://127.0.0.1:8000
cd api && PATH=~/.local/bin:$PATH uv run uvicorn lunarnav_api.main:app --port 8000
# (in a git worktree without core/kernels: export LUNARNAV_KERNELS=<main checkout>/core/kernels)

# terminal 2: UI on http://localhost:5173
cd ui
npm install
npm run dev
npm run build      # type check + production build into dist/
npm run validate   # API sub-points vs JPL Horizons, and interpolation check (needs API + network)
```

Set `VITE_API_URL` to use another API address (default `http://127.0.0.1:8000`), for example
`VITE_API_URL=https://example.run.app npm run build`.

## Layout

- `src/api.ts`: API client (`/v1/moon-state`, `/v1/series`, `/v1/sites`).
- `src/ephemeris.ts`: `MoonStateBatch` holds one `/v1/moon-state` batch (60 min step) for the
  time window and interpolates between samples: quaternion slerp for the MOON_ME → J2000
  rotation, linear interpolation for vectors. When time leaves the middle of the window,
  the UI loads a new batch.
- `src/main.ts`: scene, controls, readouts, local-sky plot.
- `scripts/validate.ts`: Horizons comparison. `scripts/sectigo-root-r46.pem` is the public
  root CA for `ssd.jpl.nasa.gov`. The local CA store lacks it, so curl gets it with `--cacert`.
  Set `HORIZONS_NO_CA=1` to use the system store only.

## Frames and accuracy

- The scene uses the J2000 equatorial frame (celestial north = screen up by default).
- All geometry comes from the API (SPICE, DE440, MOON_ME frame). Sub-points agree with
  JPL Horizons (MOON_ME) to about 0.005°.
- Azimuth and elevation follow `CONTRACTS.md`. They are topocentric: the observer is on the
  1737.4 km sphere, so Earth parallax (up to about 0.26°) is included.
- Earth size and distance in the scene are not to scale.

## Credits

Moon colour map: NASA's Scientific Visualization Studio, "CGI Moon Kit"
(https://svs.gsfc.nasa.gov/4720), LRO LROC WAC colour mosaic, public domain.
File: `public/textures/lroc_color_2k.jpg` (2048 × 1024, equirectangular, centred on 0° longitude).
