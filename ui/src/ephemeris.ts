// Ephemeris module. Moon states come from the API (/v1/moon-state, SPICE, MOON_ME frame)
// in batches. Between batch samples we interpolate in time.
//
// Frames:
//   "inertial" = J2000, origin at Moon centre.
//   "body"     = Moon ME frame (MOON_ME).
// Units: degrees, km for distances. Longitude east-positive, -180..+180.

import { Matrix4, Quaternion } from 'three';
import { fetchMoonStates, type MoonStateItemRaw } from './api';

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

export const MOON_RADIUS_KM = 1737.4;
const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return [a[0] / n, a[1] / n, a[2] / n];
};
const lerp3 = (a: Vec3, b: Vec3, f: number): Vec3 => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];
const v3of = (a: number[]): Vec3 => [a[0], a[1], a[2]];

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

function quatOfRowMajor(m: number[]): Quaternion {
  const m4 = new Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  return new Quaternion().setFromRotationMatrix(m4);
}

function rowMajorOfQuat(q: Quaternion): number[] {
  const e = new Matrix4().makeRotationFromQuaternion(q).elements; // column-major
  return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
}

interface Sample {
  ms: number;
  q: Quaternion;
  raw: MoonStateItemRaw;
}

/**
 * A batch of Moon states on a regular time grid. `at(ms)` interpolates:
 * rotation by quaternion slerp, vectors linearly (directions are renormalised).
 * Sub-points are recomputed from the interpolated body-frame vectors.
 */
export class MoonStateBatch {
  readonly startMs: number;
  readonly stopMs: number;
  private readonly samples: Sample[];

  constructor(raw: MoonStateItemRaw[]) {
    if (raw.length < 2) throw new Error('Moon-state batch needs at least 2 samples.');
    this.samples = raw.map((r) => ({ ms: Date.parse(r.utc), q: quatOfRowMajor(r.me_to_j2000), raw: r }));
    this.startMs = this.samples[0].ms;
    this.stopMs = this.samples[this.samples.length - 1].ms;
  }

  covers(ms: number) {
    return ms >= this.startMs && ms <= this.stopMs;
  }

  /** Interpolated state. Times outside the batch are clamped to its ends. */
  at(ms: number): MoonState {
    const s = this.samples;
    const t = Math.min(this.stopMs, Math.max(this.startMs, ms));
    // Regular grid: direct index, then fix up.
    let i = Math.floor(((t - this.startMs) / (this.stopMs - this.startMs)) * (s.length - 1));
    i = Math.max(0, Math.min(s.length - 2, i));
    while (i > 0 && s[i].ms > t) i--;
    while (i < s.length - 2 && s[i + 1].ms < t) i++;
    const a = s[i];
    const b = s[i + 1];
    const f = b.ms === a.ms ? 0 : (t - a.ms) / (b.ms - a.ms);

    const q = new Quaternion().slerpQuaternions(a.q, b.q, f);
    const sunBodyKm = lerp3(v3of(a.raw.sun_me_km), v3of(b.raw.sun_me_km), f);
    const earthBodyKm = lerp3(v3of(a.raw.earth_me_km), v3of(b.raw.earth_me_km), f);
    return {
      utc: new Date(ms),
      bodyToInertial: rowMajorOfQuat(q),
      sunDirInertial: unit(lerp3(v3of(a.raw.sun_dir_j2000), v3of(b.raw.sun_dir_j2000), f)),
      earthDirInertial: unit(lerp3(v3of(a.raw.earth_dir_j2000), v3of(b.raw.earth_dir_j2000), f)),
      sunBodyKm,
      earthBodyKm,
      earthDistanceKm: a.raw.earth_distance_km + (b.raw.earth_distance_km - a.raw.earth_distance_km) * f,
      subSolar: latLonOf(sunBodyKm),
      subEarth: latLonOf(earthBodyKm),
    };
  }
}

/** Load a batch from the API for [startMs, stopMs]. */
export async function loadMoonStates(startMs: number, stopMs: number, stepMinutes: number, signal?: AbortSignal) {
  return new MoonStateBatch(await fetchMoonStates(startMs, stopMs, stepMinutes, signal));
}

export interface LocalSky {
  sunAzDeg: number;
  sunElDeg: number;
  earthAzDeg: number;
  earthElDeg: number;
}

/**
 * Sun and Earth azimuth/elevation of the body centres from a surface point on the
 * reference sphere (flat horizon, no observer height). Used only as an instant
 * preview while /v1/series loads. The results panel uses the API values.
 */
export function localSky(latDeg: number, lonDeg: number, s: MoonState): LocalSky {
  const up = bodyVecOf(latDeg, lonDeg);
  const lo = lonDeg * D2R;
  const la = latDeg * D2R;
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0];
  const north: Vec3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const azEl = (target: Vec3): [number, number] => {
    const d = unit([
      target[0] - up[0] * MOON_RADIUS_KM,
      target[1] - up[1] * MOON_RADIUS_KM,
      target[2] - up[2] * MOON_RADIUS_KM,
    ]);
    const el = Math.asin(Math.max(-1, Math.min(1, dot(d, up)))) * R2D;
    let az = Math.atan2(dot(d, east), dot(d, north)) * R2D;
    if (az < 0) az += 360;
    return [az, el];
  };
  const [sunAzDeg, sunElDeg] = azEl(s.sunBodyKm);
  const [earthAzDeg, earthElDeg] = azEl(s.earthBodyKm);
  return { sunAzDeg, sunElDeg, earthAzDeg, earthElDeg };
}

/** Map a raw API state (no interpolation) to MoonState, using the API's own sub-points. */
export function moonStateOfRaw(r: MoonStateItemRaw): MoonState {
  return {
    utc: new Date(r.utc),
    bodyToInertial: r.me_to_j2000.slice(0, 9),
    sunDirInertial: v3of(r.sun_dir_j2000),
    earthDirInertial: v3of(r.earth_dir_j2000),
    sunBodyKm: v3of(r.sun_me_km),
    earthBodyKm: v3of(r.earth_me_km),
    earthDistanceKm: r.earth_distance_km,
    subSolar: { latDeg: r.sub_solar_lat_deg, lonDeg: r.sub_solar_lon_deg },
    subEarth: { latDeg: r.sub_earth_lat_deg, lonDeg: r.sub_earth_lon_deg },
  };
}
