// Ephemeris module. All Sun/Earth/Moon geometry is behind this interface.
// A later increment replaces this with calls to the Python API.
//
// Frames:
//   "inertial" = J2000 mean equator (EQJ, ~ICRF), origin at Moon centre.
//   "body"     = Moon body-fixed frame from the IAU rotation model
//                (astronomy-engine RotationAxis). This approximates the
//                Moon ME frame of CONTRACTS.md; values are approximate.
// Units: degrees, km for distances. Longitude east-positive, -180..+180.

import * as Astronomy from 'astronomy-engine';

// Vite uses the package's ESM build (named exports). Node/tsx loads it as CJS,
// where the exports sit on `default`. Accept both.
const DEFAULT_KEY = 'default';
const A: typeof Astronomy =
  (Astronomy as unknown as Record<string, typeof Astronomy | undefined>)[DEFAULT_KEY] ?? Astronomy;
const { Body, GeoMoon, GeoVector, MakeTime, RotationAxis } = A;

export type Vec3 = [number, number, number];

export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

export interface MoonState {
  utc: Date;
  /** 3x3 rotation, row-major. Maps body-frame vectors to inertial: v_in = M * v_body. */
  bodyToInertial: number[];
  /** Unit vector Moon -> Sun, inertial frame. */
  sunDirInertial: Vec3;
  /** Unit vector Moon -> Earth, inertial frame. */
  earthDirInertial: Vec3;
  /** Moon centre -> Sun / Earth centre, body frame, km. */
  sunBodyKm: Vec3;
  earthBodyKm: Vec3;
  earthDistanceKm: number;
  subSolar: LatLon;
  subEarth: LatLon;
}

export interface LocalSky {
  sunAzDeg: number;
  sunElDeg: number;
  earthAzDeg: number;
  earthElDeg: number;
}

export const MOON_RADIUS_KM = 1737.4;
const KM_PER_AU = 149597870.7;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return [a[0] / n, a[1] / n, a[2] / n];
};
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

/** Wrap longitude to -180..+180. */
export function wrapLon(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180) l = 180;
  return l;
}

export function latLonOf(v: Vec3): LatLon {
  const u = unit(v);
  return { latDeg: Math.asin(u[2]) * R2D, lonDeg: wrapLon(Math.atan2(u[1], u[0]) * R2D) };
}

export function bodyVecOf(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/** Body -> inertial rotation from the IAU pole (ra, dec) and prime meridian angle W. */
function bodyToInertialMatrix(raHours: number, decDeg: number, spinDeg: number): number[] {
  const a = raHours * 15 * D2R;
  const d = decDeg * D2R;
  const w = spinDeg * D2R;
  const pole: Vec3 = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  // Ascending node of the body equator on the J2000 equator.
  const node: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  const q = cross(pole, node);
  const xb: Vec3 = [
    Math.cos(w) * node[0] + Math.sin(w) * q[0],
    Math.cos(w) * node[1] + Math.sin(w) * q[1],
    Math.cos(w) * node[2] + Math.sin(w) * q[2],
  ];
  const yb = cross(pole, xb);
  // Columns are xb, yb, pole.
  return [xb[0], yb[0], pole[0], xb[1], yb[1], pole[1], xb[2], yb[2], pole[2]];
}

/** v_body = M^T * v_inertial */
function inertialToBody(m: number[], v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

export function moonState(utc: Date): MoonState {
  const t = MakeTime(utc);
  const axis = RotationAxis(Body.Moon, t);
  const m = bodyToInertialMatrix(axis.ra, axis.dec, axis.spin);

  const gm = GeoMoon(t); // Earth -> Moon, EQJ, AU
  const gs = GeoVector(Body.Sun, t, true); // Earth -> Sun, EQJ, AU
  const moonPos: Vec3 = [gm.x, gm.y, gm.z];
  const earthIn = scale(scale(moonPos, -1), KM_PER_AU);
  const sunIn = scale(sub([gs.x, gs.y, gs.z], moonPos), KM_PER_AU);

  const sunBodyKm = inertialToBody(m, sunIn);
  const earthBodyKm = inertialToBody(m, earthIn);
  return {
    utc,
    bodyToInertial: m,
    sunDirInertial: unit(sunIn),
    earthDirInertial: unit(earthIn),
    sunBodyKm,
    earthBodyKm,
    earthDistanceKm: norm(earthIn),
    subSolar: latLonOf(sunBodyKm),
    subEarth: latLonOf(earthBodyKm),
  };
}

/**
 * Sun and Earth azimuth/elevation seen from a surface point, flat 0 deg horizon,
 * observer on the reference sphere. Azimuth clockwise from local north (0..360).
 * Elevation above the plane perpendicular to the radius. Topocentric (includes parallax).
 */
export function localSky(latDeg: number, lonDeg: number, s: MoonState): LocalSky {
  const up = bodyVecOf(latDeg, lonDeg);
  const lo = lonDeg * D2R;
  const la = latDeg * D2R;
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0];
  const north: Vec3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const obs = scale(up, MOON_RADIUS_KM);
  const azEl = (target: Vec3): [number, number] => {
    const d = unit(sub(target, obs));
    const el = Math.asin(Math.max(-1, Math.min(1, dot(d, up)))) * R2D;
    let az = Math.atan2(dot(d, east), dot(d, north)) * R2D;
    if (az < 0) az += 360;
    return [az, el];
  };
  const [sunAzDeg, sunElDeg] = azEl(s.sunBodyKm);
  const [earthAzDeg, earthElDeg] = azEl(s.earthBodyKm);
  return { sunAzDeg, sunElDeg, earthAzDeg, earthElDeg };
}
