# UI: 3D Moon globe

Vite + TypeScript + three.js. It shows the Moon orientation, Sun lighting (terminator),
Earth direction, the sub-solar and sub-Earth points, a latitude/longitude grid and the
curated sites. For a selected point (site picker, typed lat/lon or a click on the globe) it
shows Sun and Earth visibility from `/v1/series`: the time to the next sunset and Earthset,
current values, a summary, the event list and a local sky plot. The API uses the LOLA terrain
horizon where it has terrain data (`terrain: "auto"`), else a flat 0° horizon. The panel says
which one is in use. A site-detail map (NASA Moon Trek tiles, OpenLayers) at the bottom follows
the selected point.

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
- `src/main.ts`: scene, camera, time controls, readouts.
- `src/grid.ts`: latitude/longitude grid (10°, plus rings at 80°, 85°, 88° S and N).
- `src/point.ts`: lat/lon input validation and the site picker.
- `src/results.ts`: results panel (`/v1/series`), countdowns, summary, events, observer height.
- `src/skyplot.ts`: local sky plot: terrain outline, true Sun and Earth disk sizes, zoom.
- `src/mappanel.ts`: map panel (fold, full screen). Loads `src/detail/detailmap.ts` with
  `import()`, so OpenLayers is not in the main chunk.
- `src/detail/detailmap.ts`: the map (layers, coverage rules, progress bar, arrows). Also used by
  the standalone page `detail.html` (`/detail.html?lat=-89.45&lon=-137.31&radius=500`).
- `src/detail/layers.ts`, `src/detail/moonproj.ts`: Moon Trek layers and lunar projections
  (see `docs/imagery-spike.md`).
- Dev only: `/?mockmask` sends the two committed masks in `data/masks/` as the `mask` field,
  for an API without terrain.
- `scripts/validate.ts`: Horizons comparison. `scripts/sectigo-root-r46.pem` is the public
  root CA for `ssd.jpl.nasa.gov`. The local CA store lacks it, so curl gets it with `--cacert`.
  Set `HORIZONS_NO_CA=1` to use the system store only.

## Frames and accuracy

- The scene uses the J2000 frame, turned so that the Moon's north pole is screen up. The
  "True sky orientation" checkbox puts celestial north (J2000 +z) up instead, as seen from Earth.
- All geometry comes from the API (SPICE, DE440, MOON_ME frame). Sub-points agree with
  JPL Horizons (MOON_ME) to about 0.005°.
- Azimuth and elevation follow `CONTRACTS.md`. They are topocentric: the observer is on the
  1737.4 km sphere, so Earth parallax (up to about 0.26°) is included.
- Earth and Sun size and distance in the scene are not to scale. "True scale Earth" puts Earth
  at its true distance and size; the Sun stays reduced.

## Credits

Moon textures: NASA's Scientific Visualization Studio, "CGI Moon Kit"
(https://svs.gsfc.nasa.gov/4720), public domain. Colour: LRO LROC WAC colour mosaic with
polar fill (`lroc_color_poles_8k.tif`). Relief: LRO LOLA elevation map (`ldem_16.tif`).

| File | Size | Made from |
|---|---|---|
| `public/textures/lroc_color_2k.jpg` | 2048 × 1024 | kit JPEG, unchanged. Loads first; fallback. |
| `public/textures/moon_color_8k.jpg` | 8192 × 4096 | `lroc_color_poles_8k.tif`. Used if the GPU allows 8192 px textures. |
| `public/textures/moon_normal_4k.jpg` | 4096 × 2048 | normal map from `ldem_16.tif`, relief × 1.5 |
| `public/textures/moon_south_color.jpg` | 2048 × 2048 | south polar cap (pole to 75° S), azimuthal equidistant, from the 8k colour map |
| `public/textures/moon_south_normal.jpg` | 2048 × 2048 | south polar cap normal map from `ldem_16.tif`, relief × 1.5 |

`scripts/make_moon_textures.py` makes all files except the 2k map (see the run line at the top
of the script). The south polar cap is a separate mesh. An equirectangular map smears near the
pole; the cap does not. The normal maps give crater relief near the terminator. They do not
cast shadows, so do not use the globe shading to judge if a point is lit. Use the results panel.

Earth texture: NASA Earth Observatory, Blue Marble Next Generation, January 2004
(Reto Stöckli, NASA GSFC), public domain.
Source: `world.200401.3x5400x2700.jpg` from assets.science.nasa.gov (BMNG base, January).
File: `public/textures/earth_bluemarble_2k.jpg` (2048 × 1024, 0.25 MB). The Earth turns about
the J2000 pole by the Greenwich mean sidereal angle, so the side that faces the Moon is correct
(precession and nutation are ignored, less than 0.5°).

Sun texture: NASA SDO/HMI quick-look continuum image, 2026-11-14 16:00 UTC
(`latest_1024_HMIIC.jpg` from sdo.gsfc.nasa.gov). Courtesy of NASA/SDO and the AIA, EVE and HMI
science teams. File: `public/textures/sun_sdo_512.jpg` (512 × 512, disk only, 0.03 MB).
The glow around it is drawn in code.

`scripts/make_body_textures.py` makes the Earth and Sun files from the downloads.
