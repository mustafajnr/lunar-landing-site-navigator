# Imagery spike: detailed, zoomable lunar imagery for the site view

Date: 2026-11-14. Status: spike done, proof page works (`ui/detail.html`).

## 1. Result in short

- Use **NASA Moon Trek WMTS** tiles. They need no key, they send
  `Access-Control-Allow-Origin: *`, and Trek has **native south polar
  stereographic (SP) tiles**.
- Use **Option B**: keep the three.js globe, and add a 2D **OpenLayers** map for
  the site detail. The proof is `ui/detail.html` + `ui/src/detail/`.
- Best resolution at the test sites:
  - Shackleton connecting ridge (-89.45, -137.31): **4.18 m/px** (Trek SP NAC mosaic, zoom 11).
  - Malapert Massif (Artemis III): **2.60 m/px** (local NAC mosaic, EQ zoom 13), 4.18 m/px around it.
  - Apollo 11: **0.65 m/px** (local NAC mosaic, EQ zoom 15). The LM descent stage is visible.

## 2. Tile sources

### 2.1 NASA Moon Trek (https://trek.nasa.gov/moon/)

Capabilities: `https://trek.nasa.gov/tiles/Moon/{EQ|SP}/{LAYER}/1.0.0/WMTSCapabilities.xml`

Tile template (RESTful WMTS):
`https://trek.nasa.gov/tiles/Moon/{EQ|SP}/{LAYER}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.{png|jpg}`

Tile grids (from the capabilities, 256 px tiles, row 0 at the top):

| Grid | CRS in capabilities | Top-left | Level 0 | Resolution at level z |
|---|---|---|---|---|
| EQ | `EPSG::104903` = lunar lon/lat, sphere R = 1737.4 km | (-180, 90) | 2 x 1 tiles | 0.703125 / 2^z deg/px = 10 917 km / (512 * 2^z) m/px |
| SP | `EPSG::0` = south polar stereographic, lat0 -90, lon0 0, sphere R = 1737.4 km (IAU 2015:30120) | (-1 095 930, 1 095 930) m | 1 x 1 used (capabilities say 2 x 1, the 2nd column is empty) | 8561.953125 / 2^z m/px |

SP axes: x = rho sin(lon), y = rho cos(lon), rho = 2R tan((90 + lat)/2).
I confirmed this from tiles: Shackleton crater shows in the x > 0, y < 0 quadrant
(Shackleton centre is at 129.8 E).

EQ m/px is along latitude. Along longitude it is smaller by cos(lat). Near the
pole the EQ tiles are very stretched, so for the pole use the SP tiles.

Layers I checked with a real tile request (all HTTP 200, all `Access-Control-Allow-Origin: *`):

| Layer | Shows | Coverage | Proj | Max z | Best m/px (tiles) | Format |
|---|---|---|---|---|---|---|
| `LRO_WAC_Mosaic_Global_303ppd_v02` | LRO WAC global mosaic | global | EQ | 8 | 83.3 | jpg |
| `Kaguya_TCortho_Mosaic_Global_4096ppd` | Kaguya TC ortho mosaic | global (poor at the poles) | EQ | 10 | 20.8 | png |
| `CE2_GRAS_DOM_07m` | Chang'e 2 CCD 7 m mosaic | 90S to 83N | EQ | 11 | 10.4 | jpg |
| `LRO_LOLAKaguya_ClrHillshade_60N60S_512ppd` | LOLA + Kaguya colour hillshade | 60S to 60N | EQ | 10 | 20.8 | png |
| `LRO_LOLA_Shade_Global_256ppd_v06` | LOLA hillshade | global | EQ | 6 | 333 | png |
| `LRO_NAC_AvgMosaic_SPole855_1mp` | LRO NAC mosaic, S pole (source 1 m/px) | south of 85.5S (+-136 km) | **SP** | 11 | **4.18** | png |
| `LRO_NAC_AvgMosaic_SPole855_1mp_EQ` | same, EQ version | south of 83.6S | EQ | 12 | 5.2 | png |
| `LRO_LOLA_Shade_SPole875_5mp_v04` | LOLA hillshade, 5 m DEM | south of 87.5S (+-76 km) | SP | 9 | 16.7 | png |
| `LRO_LOLA_ClrShade_SPole875_5mp_v04` | LOLA colour hillshade (elevation colour), 5 m DEM | south of 87.5S | SP | 9 | 16.7 | png |
| `LRO_LOLA_Shade_SPole75_30mp_v04` | LOLA hillshade, 30 m DEM | south of about 75S (+-457 km) | SP | 6 | 134 | png |
| `LRO_LOLA_ClrShade_SPole75_30mp_v04` | LOLA colour hillshade, 30 m DEM | south of about 75S | SP | 6 | 134 | png |
| `NAC_POLE_PSR_SOUTH_STRETCH` | NAC PSR mosaic, stretched (shadowed floors) | south of 75.5S | SP | 8 | 33.4 | png |
| `LRO_LOLA_Illumination_SPole65S_240m` | LOLA PSR / illumination | south of 65S | SP | 3 | 1070 | png |
| `LRO_NAC_Mosaic_0_67mpp_Malapert_Massif` | NAC mosaic 0.67 m, Malapert Massif (Artemis III) | local, 86.05S..85.63S, 5.25W..4.78E | EQ | 13 | 2.60 | png |
| `A11_60x60km.eq` (also `A12_60x60km.0_3.eq`, `A14_60x60km.0_3.eq`, `A15_60x60km.0_2.eq`, `A16_60x60km.eq`, `A17_60x60km.eq`) | NAC mosaics, Apollo sites, 60 x 60 km | local | EQ | 15 | 0.65 | png |
| `LRO_NAC_Mosaic_50cmpp_VonKarman_v2` | NAC mosaic 0.5 m, Von Karman (Chang'e 4) | local | EQ | 15 | 0.65 | png |

Note: Trek tiles are capped below the source resolution (the SP NAC mosaic is
1 m/px, but the tiles stop at 4.18 m/px).

Catalogue search API (JSON, `Access-Control-Allow-Origin: *`):
`https://trek.nasa.gov/moon/TrekServices/ws/index/eq/searchItems?start=0&rows=1000&key=<text>`.
Each product has `productLabel` (= layer id), `title`, `bbox` (lon/lat) and
`description`. The `sp` index returns nothing; the SP layer ids are the EQ ids
without the `_EQ` suffix (I found them by trying the capabilities URL). There
are many more local products (Endurance-A sites, IM-1, SPA, Shioli, LROC
hazard maps). Search `key=pole`, `key=mosaic`, `key=hillshade`.

Licence / terms: Trek has no explicit licence text. NASA and LRO (LROC, LOLA)
data are US Government work and in general not copyrighted (NASA media usage
guidelines). Credit: "NASA Moon Trek; LROC: NASA/GSFC/Arizona State University;
LOLA: NASA/GSFC". Kaguya TC layers are JAXA/SELENE data (credit JAXA, check JAXA
terms before commercial use). Chang'e 2 layers are CNSA/CLEP data (terms not clear).

### 2.2 USGS Astrogeology WMS (planetarymaps.usgs.gov)

- Global, simple cylindrical: `https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/earth/moon_simp_cyl.map&service=WMS&request=GetCapabilities`
  Layers: `LROC_WAC`, `LOLA_color`, `LOLA_bw`, `LOLA_steel`, `LOLA_Kaguya_Shade`,
  `KaguyaTC_Ortho`, `LO`, `uv_v2`, `uv_lo`, quad charts. CRS EPSG:4326, IAU_2015:30100.
- South pole: `...map=/maps/earth/moon_spole.map...`. Layers: `LRO_WAC_south`,
  `LOLA_south`, `lo_south`, `uv_south_v2`. CRS `EPSG:32761`, `IAU_2015:30120`.
- WMS (server renders any bbox), not WMTS. GetMap tested: HTTP 200, PNG,
  `access-control-allow-origin: *`.
- Resolution is the WAC/LOLA class (about 100 m/px for WAC). No NAC data. Good
  fallback, not good for site detail.
- Licence: USGS = US Government, public domain. Credit USGS Astrogeology.

### 2.3 LROC QuickMap (https://quickmap.lroc.im-ldi.com/, old quickmap.lroc.asu.edu redirects)

- The app uses internal tile hosts (`lroc-tiles.actgate.com/tiles`,
  `dem-tiles.b-cdn.net/lunar/...`). No public API docs and no terms for reuse
  found. Not used. LROC WMS `wms.lroc.asu.edu` redirects to an HTML page at
  `data.lroc.im-ldi.com/lroc` (not a WMS document).

### 2.4 OpenPlanetaryMap Moon basemap (Carto)

- `https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-moon-basemap-v0-1/all/{z}/{x}/{y}.png`
  HTTP 200, CORS `*`. Web-Mercator-style XYZ, a styled basemap (no poles,
  low detail). Attribution required (OpenPlanetary, licence not confirmed). Not useful here.

## 3. Option A (CesiumJS) vs Option B (three.js + OpenLayers)

Option A was not built. These points come from the CesiumJS API docs and the npm data.

| | A: CesiumJS globe | B: three.js globe + OpenLayers detail map |
|---|---|---|
| Moon body | `Ellipsoid.MOON` (R 1 737 400 m), `new Globe(Ellipsoid.MOON)`, `baseLayer: false` | three.js sphere stays as it is |
| Trek EQ tiles | `WebMapTileServiceImageryProvider` + `GeographicTilingScheme({ellipsoid: MOON, numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1})` matches Trek EQ | `XYZ` source + custom tile grid (done) |
| Trek SP tiles | **Not supported**: Cesium imagery tiling schemes are Geographic or Web Mercator only | **Native** (custom projection, done) |
| Pole detail | Only EQ tiles. At 89.45S one EQ z12 tile is about 13 m wide in longitude and 1.3 km tall; Cesium loads low levels there. High risk of blurry pole imagery and pinching | 4.18 m/px native SP tiles, verified in the browser |
| Sun direction | `scene.light = new DirectionalLight({ direction })` + `globe.enableLighting = true`; we must give the Sun vector in the Moon-fixed frame (astronomy-engine) | three.js already does this on the globe |
| Picking | `camera.pickEllipsoid(pos, Ellipsoid.MOON)` then `Cartographic.fromCartesian(c, Ellipsoid.MOON)` (radians) | `transform(e.coordinate, viewProj, LONLAT)` (done) |
| Terrain | Moon terrain is a Cesium ion asset, needs an ion token | none (hillshade layers only) |
| Bundle | npm package 80 MB unpacked; built Cesium.js is several MB plus Workers/Assets/Widgets that must be copied and served (`CESIUM_BASE_URL`, needs a Vite plugin or `vite.config` change) | `ol` 10.11: detail page bundle 318 kB min, 98 kB gzip (esbuild measure) |
| Work | replaces the existing globe (another agent is working on it now) | new page, no change to the globe |

**Choice: B.** The south pole is the focus, and only B uses the native polar
tiles. B adds about 100 kB gzip, needs no build config, and does not touch the
globe code. Risks of A: blurry/pinched pole imagery from EQ tiles, a large
bundle with static asset copying, a rewrite of the working globe two days before
the deadline. Risks of B: two views (globe and map) instead of one; EQ local
mosaics are reprojected by OpenLayers in the browser (CPU cost, slight blur at
the joins); no 3D terrain.

## 4. Proof page

Files: `ui/detail.html`, `ui/src/detail/{main.ts,layers.ts,moonproj.ts,detail.css,check-tiles.ts}`.

Open (dev): `cd ui && npm run dev`, then
- http://localhost:5173/detail.html?lat=-89.45&lon=-137.31&name=Shackleton%20rim
- http://localhost:5173/detail.html?lat=0.67416&lon=23.47314&name=Apollo%2011
- http://localhost:5173/detail.html?lat=-85.9861&lon=-0.255&name=Malapert%20Massif

What it does:
- Reads `lat`, `lon`, `name` from the URL.
- lat <= -75: the view is the Trek SP projection; SP tiles draw with no
  reprojection; EQ tiles (WAC base, Malapert NAC) are reprojected.
- Other sites: the view is a stereographic projection centred on the site;
  all EQ tiles are reprojected (low distortion at any latitude).
- Layer stack (bottom to top), toggles in the panel with m/px per layer and
  "(no data at site)" when the site is outside the layer bbox:
  WAC global -> (Kaguya TC) -> SP layers (LOLA hillshades, NAC mosaic, PSR stretch) -> local NAC mosaics.
- Yellow ring marker at the site, OpenLayers scale bar (metric, correct for the
  Moon: own `getPointResolution`, scale factor k = 1 + rho^2/4R^2), cursor lat/lon,
  current ground m/px, preset links.
- No proj4: OpenLayers + proj4 "longlat" links to EPSG:4326 and measures with
  the Earth radius. The projections are a few lines of spherical math in `moonproj.ts`.

Checks done:
- `npx tsx src/detail/check-tiles.ts` (Node) builds each layer's source, takes
  the max-zoom tile at each test site and fetches it: all HTTP 200, CORS `*`.
  (Needs `NODE_EXTRA_CA_CERTS=<certifi cacert.pem>` here because the system CA store is old.)
- Dev server: `detail.html` and all modules return HTTP 200.
- Headless Chromium (Playwright) screenshots: tiles load (0 failed tile
  requests), no console errors. Shackleton: the marker sits on the connecting
  ridge about 9 km from Shackleton's rim, Shackleton visible. Apollo 11 at
  0.14 m/px view: LM descent stage visible about 10 m from the marker.
  Malapert: 0.67 m NAC detail over the 4 m SP mosaic.
- `npm run build` passes. **Vite does not put `detail.html` in the production
  build** without a `vite.config` (`build.rollupOptions.input`). Only `index.html` is built.

Note: the connecting ridge test point (-89.45, -137.31 = 222.69 E) is on the
Shackleton - de Gerlache connecting ridge, about 9-10 km from Shackleton's rim.

## 5. Integration plan

1. Add `detail.html` to the build: `vite.config.ts` with
   `build.rollupOptions.input = { main: 'index.html', detail: 'detail.html' }`,
   or (better) mount the map as a panel inside `index.html`.
2. In the main UI: when the user selects a site, open the detail map in a side
   panel (or split view) at that site; keep the globe for context. Lazy-load
   OpenLayers with `import()` so the globe page does not grow.
3. Use the site radius from `data/sites.json` to set the start zoom, and draw
   the region circle / bbox as a vector feature.
4. Optional: query the Trek catalogue API at runtime for local mosaics whose
   bbox contains the site, instead of the hard-coded list.
5. Optional: add a "sunlit now" overlay: the sun azimuth/elevation from the
   API, drawn as an arrow on the map; the LOLA hillshades help to read relief
   where the NAC image is in shadow.
