// Link to LROC QuickMap (https://quickmap.lroc.im-ldi.com/) centred on a point, with the
// TerrainSlope layer (slope in degrees, with a legend). URL format (checked 2026-11-15):
//   proj=27 south polar stereographic, proj=26 north polar stereographic, proj=16
//   equidistant cylindrical; center=LON,LAT (longitude first); resolution=metres per pixel;
//   stack=layer IDs, bottom to top.
// Layer IDs: 3314 WAC+NAC base, 3421 NAC 2 m south pole mosaic, 3388 TerrainSlope.

export const QUICKMAP_HOST = 'https://quickmap.lroc.im-ldi.com/';

/** Latitude (absolute value, degrees) from which the polar projections are used. */
const POLAR_LAT = 75;
/** The site circle (diameter 2 * radius) fills about 1 / 1.3 of an 800 px wide view. */
const FIT_FACTOR = 2.6;
const FIT_PX = 800;
const MIN_RES = 2;
const MAX_RES = 200;

export function quickmapUrl(latDeg: number, lonDeg: number, radiusM: number | null): string {
  const south = latDeg <= -POLAR_LAT;
  const north = latDeg >= POLAR_LAT;
  const proj = south ? 27 : north ? 26 : 16;
  const stack = south ? '3314,3421,3388' : '3314,3388';
  let res: number;
  if (radiusM != null && Number.isFinite(radiusM) && radiusM > 0) {
    res = Math.min(MAX_RES, Math.max(MIN_RES, (radiusM * FIT_FACTOR) / FIT_PX));
  } else {
    res = south ? 6 : 5;
  }
  // Longitude -180..180.
  let lon = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  if (lon === -180 && lonDeg > 0) lon = 180;
  const fmt = (x: number, d: number) => String(Number(x.toFixed(d)));
  const q = [
    'proj=' + proj,
    'center=' + fmt(lon, 5) + ',' + fmt(latDeg, 5),
    'resolution=' + fmt(res, 2),
    'stack=' + stack,
  ];
  return QUICKMAP_HOST + '?' + q.join('&');
}

export const QUICKMAP_LABEL = 'Open in LROC QuickMap (slope in degrees)';
export const QUICKMAP_TITLE =
  'LROC QuickMap (NASA LRO) at this point, with the TerrainSlope layer. The legend shows slope in degrees.';

/** Make or update an <a> element for the QuickMap link. */
export function setQuickmapLink(a: HTMLAnchorElement, latDeg: number, lonDeg: number, radiusM: number | null): void {
  a.href = quickmapUrl(latDeg, lonDeg, radiusM);
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = QUICKMAP_LABEL;
  a.title = QUICKMAP_TITLE;
}
