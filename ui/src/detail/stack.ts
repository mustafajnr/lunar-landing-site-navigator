// Layer selection rules of the site-detail map. No DOM and no CSS here, so the tile seed
// script (scripts/seed_tiles.ts, runs in Node) uses the same rules as the map.
import { transform } from 'ol/proj.js';
import { LONLAT, SPS } from './moonproj';
import { EQ_GLOBAL, EQ_LOCAL, SP_LAYERS, nominalMpp, type TrekLayer } from './layers';

/** South of this latitude the view uses the native Trek south polar stereographic tiles. */
export const POLAR_LAT = -75;

/** Start view: the site circle (radius r) fits in RADIUS_VIEW_FACTOR * r across the smaller
 *  side of the map. Without a radius the start view is DEFAULT_START_MPP m/px. */
export const RADIUS_VIEW_FACTOR = 2.6;
export const DEFAULT_START_MPP = 30;

export const WAC = EQ_GLOBAL[0];
// WAC in polar views: EQ tiles near the pole are very narrow in longitude, so a fine zoom
// level needs hundreds of reprojected tiles. Zoom 5 (333 m/px along latitude, about 23 m/px
// along longitude at 86° S) is enough for the area outside the NAC mosaic.
export const WAC_POLAR: TrekLayer = { ...WAC, maxZ: 5, title: `${WAC.title} (zoom 5 in polar view)` };
export const KAGUYA = EQ_GLOBAL[1];
export const NAC_SP = SP_LAYERS.find((l) => l.id === 'LRO_NAC_AvgMosaic_SPole855_1mp')!;

/** True if the layer has data at a lunar lon/lat. */
export function hasDataAt(l: TrekLayer, lon: number, lat: number): boolean {
  if (l.proj === 'EQ') {
    const [x0, y0, x1, y1] = l.bbox;
    return lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1;
  }
  const [x, y] = transform([lon, lat], LONLAT, SPS);
  if (l.rhoMax !== undefined) return Math.hypot(x, y) <= l.rhoMax;
  const [x0, y0, x1, y1] = l.bbox;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/** The finest image layer with data at a point, and its m/px. */
export function bestImageAt(lat: number, lon: number): { layer: TrekLayer; mpp: number } {
  const all = [...EQ_GLOBAL, ...EQ_LOCAL, ...SP_LAYERS].filter((l) => l.kind === 'image' && hasDataAt(l, lon, lat));
  // Kaguya is poor near the poles; do not call it the best there.
  const usable = all.filter((l) => l !== KAGUYA || Math.abs(lat) < 60);
  let best = usable[0] ?? WAC;
  for (const l of usable) if (nominalMpp(l) < nominalMpp(best)) best = l;
  return { layer: best, mpp: nominalMpp(best) };
}

/** Layer stack (bottom to top) for a point. */
export function stackFor(lat: number, lon: number): TrekLayer[] {
  const polar = lat <= POLAR_LAT;
  const base = polar ? WAC_POLAR : Math.abs(lat) >= 60 ? WAC : KAGUYA;
  const local = EQ_LOCAL.filter((l) => hasDataAt(l, lon, lat));
  if (!polar) return [base, ...local];
  const sp = SP_LAYERS.filter((l) => l.role === 'overlay' || hasDataAt(l, lon, lat));
  // NAC mosaic below the overlays, so a hillshade shows on top when the user turns it on.
  sp.sort((a, b) => (a === NAC_SP ? -1 : b === NAC_SP ? 1 : 0));
  return [base, ...sp, ...local];
}
