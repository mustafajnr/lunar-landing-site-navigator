// Client for the Lunar Landing Site Navigator API (api/ folder).
// Base URL: VITE_API_URL, default http://127.0.0.1:8000.

export const API_URL: string = (
  (import.meta.env?.VITE_API_URL as string | undefined) || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

export class ApiError extends Error {
  /** true if the server did not answer at all (not running, CORS, network). */
  readonly unreachable: boolean;
  /** HTTP status, 0 if the server did not answer. */
  readonly status: number;
  constructor(message: string, unreachable: boolean, status = 0) {
    super(message);
    this.unreachable = unreachable;
    this.status = status;
  }
}

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(`Cannot reach the API at ${API_URL}.`, true);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* no JSON body */
    }
    throw new ApiError(`API error ${res.status} on ${path}${detail ? `: ${detail}` : ''}`, false, res.status);
  }
  return (await res.json()) as T;
}

export const isoUtc = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// ---------- /v1/moon-state ----------

export interface MoonStateItemRaw {
  utc: string;
  sub_solar_lat_deg: number;
  sub_solar_lon_deg: number;
  sub_earth_lat_deg: number;
  sub_earth_lon_deg: number;
  earth_distance_km: number;
  sun_distance_km: number;
  sun_me_km: number[];
  earth_me_km: number[];
  sun_dir_me: number[];
  earth_dir_me: number[];
  sun_dir_j2000: number[];
  earth_dir_j2000: number[];
  /** 3x3 row-major, v_J2000 = M * v_ME */
  me_to_j2000: number[];
}

export function fetchMoonStates(startMs: number, stopMs: number, stepMinutes: number, signal?: AbortSignal) {
  return call<{ states: MoonStateItemRaw[] }>(
    '/v1/moon-state',
    { start_utc: isoUtc(startMs), stop_utc: isoUtc(stopMs), step_minutes: stepMinutes },
    signal,
  ).then((r) => r.states);
}

// ---------- /v1/series ----------

export interface SeriesEvent {
  type: 'sunrise' | 'sunset' | 'earthrise' | 'earthset';
  utc: string;
}

export interface SeriesSummary {
  span_h: number;
  n_steps: number;
  sun_fraction_of_time: number;
  mean_sun_visible_fraction: number;
  earth_fraction_of_time: number;
  both_fraction_of_time: number;
  time_to_next_sunset_h: number | null;
  time_to_next_earthset_h: number | null;
  longest_sun_period_h: number;
  longest_earth_period_h: number;
  longest_both_period_h: number;
}

export interface SeriesOut {
  times_utc: string[];
  series: {
    sun_az: number[];
    sun_el: number[];
    sun_horizon_el: number[];
    sun_visible_fraction: number[];
    earth_az: number[];
    earth_el: number[];
    earth_horizon_el: number[];
    earth_visible: boolean[];
    earth_margin: number[];
  };
  events: SeriesEvent[];
  summary: SeriesSummary;
  /** New API field (increment 3). Missing in older API versions. */
  horizon?: SeriesHorizon | null;
  /** First events after stop_utc, searched over 400 days. Missing in older API versions. */
  next_events?: NextEvents | null;
  /** The data and settings that made the result. Missing in older API versions. */
  provenance?: SeriesProvenance | null;
}

/** CONTRACTS.md section 5, `provenance`. */
export interface SeriesProvenance {
  software: { lunarnav: string; api: string };
  /** File names of the loaded SPICE kernels. */
  kernels: string[];
  ephemeris: string;
  frame: string;
  mask_origin: 'memory_cache' | 'disk_cache' | 'computed' | 'provided' | 'none';
  dem_source: string | null;
  step_minutes: number;
  /** Accuracy of the event times, seconds. */
  event_tol_s: number;
  generated_utc: string;
}

export interface SeriesHorizon {
  source: 'terrain' | 'flat' | 'provided';
  surface_height_m: number | null;
  az_step_deg: number | null;
  elevation_deg: number[] | null;
  dem_source: string | null;
  /** Newer API only. "unavailable" means the flat horizon can be wrong. */
  terrain_status?: 'ok' | 'no_coverage' | 'unavailable' | 'not_requested';
}

export interface NextEvents {
  sunrise: string | null;
  sunset: string | null;
  earthrise: string | null;
  earthset: string | null;
}

/** Horizon mask, CONTRACTS.md section 6. */
export interface HorizonMask {
  lat_deg: number;
  lon_deg: number;
  observer_height_m?: number;
  dem_source?: string;
  az_step_deg: number;
  elevation_deg: number[];
}

export interface SeriesRequest {
  latDeg: number;
  lonDeg: number;
  observerHeightM: number;
  startMs: number;
  stopMs: number;
  stepMinutes: number;
  mask?: HorizonMask | null;
  /** "auto": the API uses terrain data if it has some for the point. Ignored by older APIs. */
  terrain?: 'auto' | 'none';
}

export function fetchSeries(r: SeriesRequest, signal?: AbortSignal) {
  return call<SeriesOut>(
    '/v1/series',
    {
      lat_deg: r.latDeg,
      lon_deg: r.lonDeg,
      observer_height_m: r.observerHeightM,
      start_utc: isoUtc(r.startMs),
      stop_utc: isoUtc(r.stopMs),
      step_minutes: r.stepMinutes,
      mask: r.mask ?? null,
      terrain: r.terrain ?? 'auto',
    },
    signal,
  );
}

// ---------- /v1/sites ----------

export interface Site {
  id: string;
  name: string;
  mission: string;
  agency: string;
  status: 'past' | 'planned' | 'candidate';
  lat_deg: number;
  lon_deg: number;
  radius_m: number;
  source: string;
  notes?: string;
}

export const fetchSites = () => call<Site[]>('/v1/sites');
