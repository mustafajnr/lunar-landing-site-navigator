// "Best points in this site": the points with the most long-term Sun and Earth visibility
// inside each curated south-polar site, from public/bestpoints.json
// (data/scripts/make_best_points.py, NASA PGDA product 69 and the LOLA 20 m DEM).
//
// A click on a best point selects it as a custom point. The site context (the circle, the
// list and the markers) stays while the selected point is one of the best points of the
// last selected site.

import type { LatLon } from './ephemeris';
import type { Site } from './api';

export interface BestPoint {
  lat_deg: number;
  lon_deg: number;
  sun_pct: number;
  earth_pct: number;
  /** Null where the 20 m DEM has no data (north of 80° S): no slope filter there. */
  slope_deg: number | null;
}

interface BestFile {
  version: 1;
  source: string;
  rule: string;
  /** Search circle radius: the site radius, but at least 5 km. */
  sites: Record<string, { search_radius_m: number; points: BestPoint[] }>;
}

export interface BestContext {
  site: Site;
  points: BestPoint[];
  /** Radius of the search circle (m). Larger than the site radius for small sites. */
  searchRadiusM: number;
  /** Index of the selected best point, or -1 if the site itself is selected. */
  active: number;
}

let data: BestFile | null = null;
let req: Promise<void> | null = null;
let lastSite: Site | null = null;
const listeners: (() => void)[] = [];

/** Load bestpoints.json once. Calls each onBestLoaded listener when it arrives. */
export function loadBestPoints(): Promise<void> {
  req ??= fetch(`${import.meta.env.BASE_URL}bestpoints.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`bestpoints.json: HTTP ${r.status}`);
      return r.json() as Promise<BestFile>;
    })
    .then((d) => {
      data = d;
      for (const f of listeners) f();
    })
    .catch((e) => console.warn('Best points not available:', e));
  return req;
}

export function onBestLoaded(f: () => void) {
  listeners.push(f);
}

export const bestSource = () => data?.source ?? '';
export const bestRule = () => data?.rule ?? '';

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** The best-points context of a selected point, or null. A selected site becomes the
 *  "last site". A custom point keeps the context of the last site if it is one of its best points. */
export function bestContext(ll: LatLon, site: Site | null): BestContext | null {
  if (site) lastSite = site;
  const s = site ?? lastSite;
  const entry = s ? data?.sites[s.id] : undefined;
  if (!s || !entry?.points.length) return null;
  const { points, search_radius_m: searchRadiusM } = entry;
  if (site) return { site, points, searchRadiusM, active: -1 };
  const active = points.findIndex((p) => same(p.lat_deg, ll.latDeg) && same(p.lon_deg, ll.lonDeg));
  return active >= 0 ? { site: s, points, searchRadiusM, active } : null;
}
