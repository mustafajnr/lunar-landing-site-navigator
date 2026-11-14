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
  kind: 'image' | 'hillshade';
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
};

const TREK = 'https://trek.nasa.gov/tiles/Moon';
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
    url: `${TREK}/${l.proj}/${l.id}/1.0.0/default/default028mm/{z}/{y}/{x}.${l.ext}`,
    crossOrigin: 'anonymous',
    attributions: 'Imagery: NASA Moon Trek (NASA/GSFC/ASU LROC, LOLA; JAXA SELENE)',
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
