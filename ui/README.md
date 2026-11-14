# UI: 3D Moon globe (spike)

Vite + TypeScript + three.js. It shows the Moon orientation, Sun lighting (terminator),
Earth direction, the sub-solar and sub-Earth points, and the local Sun/Earth azimuth and
elevation for a clicked point (flat 0° horizon).

```
cd ui
npm install
npm run dev        # http://localhost:5173
npm run build      # type check + production build into dist/
npm run validate   # compare sub-points with JPL Horizons (needs network + curl)
```

## Layout

- `src/ephemeris.ts`: all ephemeris code (astronomy-engine). Small interface:
  `moonState(utc)` and `localSky(lat, lon, state)`. A later increment replaces it with API calls.
- `src/main.ts`: scene, controls, readouts, local-sky plot.
- `scripts/validate.ts`: Horizons comparison. `scripts/sectigo-root-r46.pem` is the public
  root CA for `ssd.jpl.nasa.gov`. The local CA store lacks it, so curl gets it with `--cacert`.
  Set `HORIZONS_NO_CA=1` to use the system store only.

## Frames and accuracy

- The scene uses the J2000 equatorial frame (celestial north = screen up by default).
- The Moon orientation comes from the IAU rotation model (`Astronomy.RotationAxis`). This
  approximates the Moon ME frame of `CONTRACTS.md`. Values in the UI are labelled approximate.
  Sub-points agree with JPL Horizons (MOON_ME) to about 0.01°.
- Azimuth and elevation follow `CONTRACTS.md`. They are topocentric: the observer is on the
  1737.4 km sphere, so Earth parallax (up to about 0.26°) is included.
- Earth size and distance in the scene are not to scale.

## Credits

Moon colour map: NASA's Scientific Visualization Studio, "CGI Moon Kit"
(https://svs.gsfc.nasa.gov/4720), LRO LROC WAC colour mosaic, public domain.
File: `public/textures/lroc_color_2k.jpg` (2048 × 1024, equirectangular, centred on 0° longitude).

Ephemeris: [astronomy-engine](https://github.com/cosinekitty/astronomy) by Don Cross, MIT license.
