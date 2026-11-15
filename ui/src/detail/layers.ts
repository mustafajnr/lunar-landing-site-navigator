// NASA Moon Trek WMTS layers (https://trek.nasa.gov/moon/). All checked with
// curl on 2026-11-14: HTTP 200 and "Access-Control-Allow-Origin: *".
// See docs/imagery-spike.md for the full table.
import TileGrid from 'ol/tilegrid/TileGrid.js';
import XYZ from 'ol/source/XYZ.js';
import TileLayer from 'ol/layer/Tile.js';
import type { Extent } from 'ol/extent.js';
import { R, LONLAT, SPS } from './moonproj';

export type TrekLayer = {
  id: string;
  title: string;
  proj: 'EQ' | 'SP';
  ext: 'png' | 'jpg';
  maxZ: number;
  /** Data extent in source CRS units (deg for EQ, m for SP). */
  bbox: Extent;
  /** 'data' = a derived map (slope), not imagery: never the "best imagery". */
  kind: 'image' | 'hillshade' | 'data';
  on: boolean;
  /** Role in the map: 'base' = one global image layer, 'detail' = drawn where it has data,
   *  'overlay' = only when the user turns it on. */
  role: 'base' | 'detail' | 'overlay';
  /** The tiles have no transparent holes inside the data area. Opaque layers hide the
   *  layers below them when they cover the whole view, so those do not load. */
  opaque: boolean;
  /** Show only when the view is finer than this (m/px). Coarser views do not load it. */
  maxViewMpp?: number;
  /** SP layers: the data is a disk around the pole with this radius (m), not the full bbox. */
  rhoMax?: number;
  /** Tiles that we make (not Trek): {url}/{z}/{row}/{col}.{ext}. No Trek fallback, no manifest. */
  url?: string;
  /** Short legend, shown when the layer is on. */
  legend?: { colour: string; label: string }[];
  legendNote?: string;
  /** Own tiles: the credit line. */
  attribution?: string;
  /** Overlays with the same group are mutually exclusive in the layer list. */
  group?: string;
};

const TREK = 'https://trek.nasa.gov/tiles/Moon';

// ---------- Tile cache ----------
// A public Cloud Storage bucket holds copies of the Trek tiles around the curated sites
// (scripts/seed_tiles.ts). It serves HTTP/2 and is much faster than Trek. The bucket keeps
// the Trek path: {base}/{EQ|SP}/{LAYER}/1.0.0/default/default028mm/{z}/{row}/{col}.{ext}.
// {base}/manifest.json gives, for each layer and zoom, the tile ranges in the bucket and the
// tiles that have no data. Tiles outside the ranges come from Trek.
// VITE_TILE_CACHE_URL empty: no cache, all tiles come from Trek.

/** One tile range: [minCol, maxCol, minRow, maxRow], inclusive. */
type TileRange = [number, number, number, number];
export interface TileManifest {
  version: 1;
  /** "{EQ|SP}/{LAYER}" -> zoom -> ranges in the bucket. */
  layers: Record<string, Record<string, TileRange[]>>;
  /** "{EQ|SP}/{LAYER}" -> zoom -> row runs [row, firstCol, lastCol] of tiles inside the
   *  ranges that have no data (Trek gives 404 or a fully transparent tile). No request. */
  skip?: Record<string, Record<string, [number, number, number][]>>;
}

const CACHE_BASE = ((import.meta.env?.VITE_TILE_CACHE_URL as string | undefined) ?? '').replace(/\/+$/, '');
let manifest: TileManifest | null = null;
let missingSets: Record<string, Record<string, Set<number>>> = {};
let manifestReq: Promise<void> | null = null;

/** True if a tile cache URL is set. */
export function tileCacheOn(): boolean {
  return CACHE_BASE !== '';
}

/** Use a manifest (exported for tests; the UI calls loadTileCache). */
export function setTileManifest(m: TileManifest | null) {
  manifest = m;
  missingSets = {};
  for (const [key, zs] of Object.entries(m?.skip ?? {})) {
    missingSets[key] = {};
    for (const [z, runs] of Object.entries(zs)) {
      const set = new Set<number>();
      for (const [r, c0, c1] of runs) for (let c = c0; c <= c1; c++) set.add(r * 2 ** 21 + c);
      missingSets[key][z] = set;
    }
  }
}

/** Load the tile cache manifest. Resolves after at most `timeoutMs`; if the manifest is not
 *  there by then, tiles come from Trek until it arrives. Never rejects. */
export function loadTileCache(timeoutMs = 2500): Promise<void> {
  if (!tileCacheOn()) return Promise.resolve();
  manifestReq ??= fetch(`${CACHE_BASE}/manifest.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`tile cache manifest: HTTP ${r.status}`);
      return r.json() as Promise<TileManifest>;
    })
    .then((m) => setTileManifest(m))
    .catch((e) => console.warn('Tile cache not used:', e));
  return Promise.race([manifestReq, new Promise<void>((ok) => setTimeout(ok, timeoutMs))]);
}

/** Where a tile comes from: 'cache', 'none' (Trek does not have it) or 'trek'. */
export function tileSource(key: string, z: number, col: number, row: number): 'cache' | 'none' | 'trek' {
  const ranges = manifest?.layers[key]?.[z];
  if (!ranges) return 'trek';
  for (const [c0, c1, r0, r1] of ranges) {
    if (col >= c0 && col <= c1 && row >= r0 && row <= r1) {
      return missingSets[key]?.[z]?.has(row * 2 ** 21 + col) ? 'none' : 'cache';
    }
  }
  return 'trek';
}
const EQ_RES0 = 180 / 256; // deg/px at level 0 (2 x 1 tiles of 256 px)
const SP_RES0 = 30578404.017857101 * 0.00028; // = 8561.953125 m/px at level 0
const SP_HALF = 1095930;

/** Nominal ground resolution (m/px) at the maximum zoom level. */
export function nominalMpp(l: TrekLayer): number {
  return l.proj === 'EQ'
    ? (EQ_RES0 / 2 ** l.maxZ) * ((2 * Math.PI * R) / 360)
    : SP_RES0 / 2 ** l.maxZ;
}

const GLOBAL: Extent = [-180, -90, 180, 90];

export const EQ_GLOBAL: TrekLayer[] = [
  { id: 'LRO_WAC_Mosaic_Global_303ppd_v02', title: 'LRO WAC global mosaic', proj: 'EQ', ext: 'jpg', maxZ: 8, bbox: GLOBAL, kind: 'image', on: true, role: 'base', opaque: true },
  { id: 'Kaguya_TCortho_Mosaic_Global_4096ppd', title: 'Kaguya TC ortho mosaic', proj: 'EQ', ext: 'png', maxZ: 10, bbox: GLOBAL, kind: 'image', on: true, role: 'base', opaque: true },
];

// Local LRO NAC mosaics (EQ). Only drawn where they have data.
export const EQ_LOCAL: TrekLayer[] = [
  { id: 'A11_60x60km.eq', title: 'LRO NAC mosaic, Apollo 11', proj: 'EQ', ext: 'png', maxZ: 15, bbox: [22.4806483, -0.3193414, 24.459338, 1.6593483], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 300 },
  { id: 'A12_60x60km.0_3.eq', title: 'LRO NAC mosaic, Apollo 12', proj: 'EQ', ext: 'png', maxZ: 15, bbox: [-24.4093366, -3.9993366, -22.4306634, -2.0206634], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 300 },
  { id: 'A14_60x60km.0_3.eq', title: 'LRO NAC mosaic, Apollo 14', proj: 'EQ', ext: 'png', maxZ: 15, bbox: [-18.4593366, -4.6393366, -16.4806634, -2.6606634], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 300 },
  { id: 'A15_60x60km.0_2.eq', title: 'LRO NAC mosaic, Apollo 15', proj: 'EQ', ext: 'png', maxZ: 15, bbox: [2.6406573, 25.1406586, 4.619347, 27.1193482], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 300 },
  { id: 'A16_60x60km.eq', title: 'LRO NAC mosaic, Apollo 16', proj: 'EQ', ext: 'png', maxZ: 15, bbox: [14.5106517, -9.9593381, 16.4893414, -7.9806485], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 300 },
  { id: 'A17_60x60km.eq', title: 'LRO NAC mosaic, Apollo 17', proj: 'EQ', ext: 'png', maxZ: 15, bbox: [29.7806497, 19.2006487, 31.7593393, 21.1793384], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 300 },
  { id: 'LRO_NAC_Mosaic_50cmpp_VonKarman_v2', title: "LRO NAC mosaic, Von Karman (Chang'e 4)", proj: 'EQ', ext: 'png', maxZ: 15, bbox: [171.4493162, -48.9293994, 179.9242867, -42.0188174], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 300 },
  { id: 'LRO_NAC_Mosaic_0_67mpp_Malapert_Massif', title: 'LRO NAC mosaic 0.67 m, Malapert Massif', proj: 'EQ', ext: 'png', maxZ: 13, bbox: [-5.2505902, -86.0541388, 4.7757903, -85.633938], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 300 },
];

// South polar stereographic layers (native SP tiles, no reprojection in polar mode).
export const SP_LAYERS: TrekLayer[] = [
  { id: 'LRO_LOLA_Shade_SPole75_30mp_v04', title: 'LOLA hillshade, S pole 75 deg', proj: 'SP', ext: 'png', maxZ: 6, bbox: [-457440, -457440, 457440, 457440], kind: 'hillshade', on: false, role: 'overlay', opaque: true },
  { id: 'LRO_NAC_AvgMosaic_SPole855_1mp', title: 'LRO NAC mosaic, S pole (avg merge)', proj: 'SP', ext: 'png', maxZ: 11, bbox: [-136526, -136525, 136525, 136526], kind: 'image', on: true, role: 'detail', opaque: true, maxViewMpp: 2000, rhoMax: 136000 },
  { id: 'NAC_POLE_PSR_SOUTH_STRETCH', title: 'LRO NAC PSR mosaic (stretched, shows shadowed floors)', proj: 'SP', ext: 'png', maxZ: 8, bbox: [-304010, -320470, 304010, 304010], kind: 'image', on: false, role: 'overlay', opaque: false, maxViewMpp: 4000 },
  { id: 'LRO_LOLA_Shade_SPole875_5mp_v04', title: 'LOLA hillshade 5 m DEM, S pole 87.5 deg', proj: 'SP', ext: 'png', maxZ: 9, bbox: [-75840, -75840, 75840, 75840], kind: 'hillshade', on: false, role: 'overlay', opaque: true, maxViewMpp: 1000 },
];

// ---------- Own slope tiles ----------
// Made by data/scripts/make_slope_tiles.py from the LOLA 20 m DEM (LDEM_80S_20MPP_ADJ) in the
// Trek SP grid, uploaded to {tile cache}/slope/{z}/{row}/{col}.png. Only with a tile cache URL.
/** Slope classes (deg) and colours: the same as make_slope_tiles.py (viridis steps). The tile
 *  alpha is 150/255, so the legend shows the colours at that opacity. */
export const SLOPE_LEGEND = [
  { colour: '#440154', label: '< 5°' },
  { colour: '#414487', label: '5–10°' },
  { colour: '#2a788e', label: '10–15°' },
  { colour: '#22a884', label: '15–20°' },
  { colour: '#7ad151', label: '20–30°' },
  { colour: '#fde725', label: '≥ 30°' },
];
/** 80° S in the SP projection: 2 R tan(5°). The DEM has no data north of it in our tiles. */
export const SLOPE_RHO_MAX = 304006;
export const SLOPE_LAYER: TrekLayer = {
  id: 'slope_lola20m',
  title: 'Slope (LOLA 20 m, degrees)',
  proj: 'SP',
  ext: 'png',
  maxZ: 9,
  bbox: [-SLOPE_RHO_MAX, -SLOPE_RHO_MAX, SLOPE_RHO_MAX, SLOPE_RHO_MAX],
  kind: 'data',
  on: false,
  role: 'overlay',
  opaque: false,
  rhoMax: SLOPE_RHO_MAX,
  url: `${CACHE_BASE}/slope`,
  legend: SLOPE_LEGEND,
  legendNote:
    'Slope from LOLA 20 m elevation data. Small rocks are not included. ' +
    'Each pixel shows the steepest slope inside it, so a coarse view never hides a steep spot.',
  attribution: 'Slope: made from NASA LRO LOLA 20 m DEM (LDEM_80S_20MPP_ADJ)',
};
if (tileCacheOn()) SP_LAYERS.push(SLOPE_LAYER);

// ---------- Own average illumination tiles (NASA PGDA) ----------
// Made by data/scripts/make_illum_tiles.py from NASA PGDA product 69 (Mazarico et al. 2011):
// the 60 m maps south of 85° S, the 120 m maps for 75-85° S. Uploaded to
// {tile cache}/illum_sun/{z}/{row}/{col}.png and {tile cache}/illum_earth/... Max zoom 7
// (66.9 m/px); the map overzooms above it.
/** Inferno at 0, 20, ... 100 % (the same colour scale as make_illum_tiles.py, alpha 160/255). */
export const ILLUM_LEGEND = [
  { colour: '#000004', label: '0 %' },
  { colour: '#420a68', label: '20 %' },
  { colour: '#932667', label: '40 %' },
  { colour: '#dd513a', label: '60 %' },
  { colour: '#fca50a', label: '80 %' },
  { colour: '#fcffa4', label: '100 %' },
];
/** 75° S in the SP projection (the half-width of the 120 m PGDA maps). */
export const ILLUM_RHO_MAX = 457440;
const PGDA_CREDIT = 'Average illumination: NASA Planetary Geodesy Data Archive, Lunar Polar Illumination maps (LOLA)';
const illumLayer = (id: string, title: string, what: string): TrekLayer => ({
  id,
  title,
  proj: 'SP',
  ext: 'png',
  maxZ: 7,
  bbox: [-ILLUM_RHO_MAX, -ILLUM_RHO_MAX, ILLUM_RHO_MAX, ILLUM_RHO_MAX],
  kind: 'data',
  on: false,
  role: 'overlay',
  opaque: false,
  rhoMax: ILLUM_RHO_MAX,
  url: `${CACHE_BASE}/${id}`,
  legend: ILLUM_LEGEND,
  legendNote:
    `Percent of time that ${what} is visible, averaged over 18.6 years in hourly steps (NASA PGDA). ` +
    'Each pixel shows the mean value inside it. Map pixel 60 m south of 85° S, 120 m for 75–85° S.',
  attribution: PGDA_CREDIT,
  group: 'illum',
});
export const ILLUM_SUN_LAYER = illumLayer('illum_sun', 'Average sunlight (NASA PGDA, 18.6 years)', 'a part of the Sun');
export const ILLUM_EARTH_LAYER = illumLayer('illum_earth', 'Average Earth visibility (NASA PGDA, 18.6 years)', 'a part of the Earth');
if (tileCacheOn()) SP_LAYERS.push(ILLUM_SUN_LAYER, ILLUM_EARTH_LAYER);

export function makeLayer(l: TrekLayer): TileLayer<XYZ> {
  const isEq = l.proj === 'EQ';
  const res0 = isEq ? EQ_RES0 : SP_RES0;
  const resolutions = Array.from({ length: l.maxZ + 1 }, (_, z) => res0 / 2 ** z);
  const tileGrid = new TileGrid({
    origin: isEq ? [-180, 90] : [-SP_HALF, SP_HALF],
    extent: l.bbox,
    resolutions,
    tileSize: 256,
  });
  const source = new XYZ({
    projection: isEq ? LONLAT : SPS,
    tileGrid,
    // Trek REST pattern: {TileMatrix}/{TileRow}/{TileCol}; OL y counts from the top.
    tileUrlFunction: ([z, x, y]) => {
      if (l.url !== undefined) {
        // Own tiles: no request for tiles outside the data disk.
        if (l.rhoMax !== undefined) {
          const span = (res0 / 2 ** z) * 256;
          const x0 = -SP_HALF + x * span;
          const y1 = SP_HALF - y * span;
          const nx = Math.min(Math.max(0, x0), x0 + span);
          const ny = Math.min(Math.max(0, y1 - span), y1);
          if (Math.hypot(nx, ny) > l.rhoMax) return undefined;
        }
        return `${l.url}/${z}/${y}/${x}.${l.ext}`;
      }
      const path = `${l.proj}/${l.id}/1.0.0/default/default028mm/${z}/${y}/${x}.${l.ext}`;
      const from = tileSource(`${l.proj}/${l.id}`, z, x, y);
      // undefined = empty tile, no request.
      if (from === 'none') return undefined;
      return from === 'cache' ? `${CACHE_BASE}/${path}` : `${TREK}/${path}`;
    },
    crossOrigin: 'anonymous',
    attributions: l.url
      ? l.attribution ?? ''
      : 'Imagery: NASA Moon Trek (NASA/GSFC/ASU LROC, LOLA; JAXA SELENE)',
    wrapX: false,
  });
  const layer = new TileLayer({
    source,
    visible: l.on,
    // Load one lower zoom level too, so a coarse image shows while the fine tiles load.
    preload: l.opaque ? 1 : 0,
    maxResolution: l.maxViewMpp,
  });
  layer.set('trek', l);
  return layer;
}
