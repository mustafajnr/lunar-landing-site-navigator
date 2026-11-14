// Lunar projections for OpenLayers, on a sphere of radius R (IAU 2015 Moon).
// No proj4: OpenLayers would link a proj4 "longlat" def to EPSG:4326 and then
// measure distances with the Earth radius (wrong scale bar). We register
// our own projections and transforms instead.
import Projection from 'ol/proj/Projection.js';
import { addCoordinateTransforms, addProjection, get as getProj } from 'ol/proj.js';
import type { Coordinate } from 'ol/coordinate.js';

export const R = 1737400;
const D2R = Math.PI / 180;

// Lunar geographic lon/lat in degrees. This is the "EQ" tile CRS of NASA Moon
// Trek (urn:ogc:def:crs:EPSG::104903 in its capabilities).
export const LONLAT = new Projection({
  code: 'MOON:LONLAT',
  units: 'degrees',
  extent: [-180, -90, 180, 90],
  worldExtent: [-180, -90, 180, 90],
  global: true,
  metersPerUnit: (2 * Math.PI * R) / 360,
});
addProjection(LONLAT);

// Spherical stereographic, true scale (k = 1) at the centre (lat0, lon0).
// With lat0 = -90, lon0 = 0 this is the Moon Trek "SP" tile CRS
// (IAU 2015:30120, x = rho sin(lon), y = rho cos(lon)).
function stereo(code: string, lat0: number, lon0: number, half: number): Projection {
  const p0 = lat0 * D2R;
  const l0 = lon0 * D2R;
  const sp0 = Math.sin(p0);
  const cp0 = Math.cos(p0);

  const fwd = (c: Coordinate): Coordinate => {
    const p = c[1] * D2R;
    const dl = c[0] * D2R - l0;
    const sp = Math.sin(p);
    const cp = Math.cos(p);
    const cdl = Math.cos(dl);
    const denom = 1 + sp0 * sp + cp0 * cp * cdl;
    if (denom < 1e-12) return [Infinity, Infinity];
    const k = 2 / denom;
    return [R * k * cp * Math.sin(dl), R * k * (cp0 * sp - sp0 * cp * cdl)];
  };

  const inv = (c: Coordinate): Coordinate => {
    const [x, y] = c;
    const rho = Math.hypot(x, y);
    if (rho < 1e-9) return [lon0, lat0];
    const cc = 2 * Math.atan(rho / (2 * R));
    const sc = Math.sin(cc);
    const ccc = Math.cos(cc);
    const lat = Math.asin(Math.max(-1, Math.min(1, ccc * sp0 + (y * sc * cp0) / rho)));
    let lon = (l0 + Math.atan2(x * sc, rho * cp0 * ccc - y * sp0 * sc)) / D2R;
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    return [lon, lat / D2R];
  };

  const existing = getProj(code);
  if (existing) return existing;
  const proj = new Projection({
    code,
    units: 'm',
    extent: [-half, -half, half, half],
    // Ground resolution: divide by the point scale factor k = 1 + rho^2 / 4R^2.
    getPointResolution: (res: number, pt: Coordinate) =>
      res / (1 + (pt[0] * pt[0] + pt[1] * pt[1]) / (4 * R * R)),
  });
  addProjection(proj);
  addCoordinateTransforms(LONLAT, proj, fwd, inv);
  return proj;
}

// Moon Trek SP tile grid extent is +-1095930 m (down to about -55 deg lat).
export const SPS = stereo('MOON:SPS', -90, 0, 1095930);

/** A stereographic projection centred on a site (for non-polar sites). */
export function siteStereo(lat: number, lon: number): Projection {
  return stereo(`MOON:STERE:${lat.toFixed(5)}:${lon.toFixed(5)}`, lat, lon, 2 * R);
}
