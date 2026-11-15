// "Next landing window" in the Mission requirements box (Verdict tab).
// A landing time t is valid when, for the stay of L days (requirement b):
//   - the Sun is visible at all samples in [t, t + L], and
//   - Earth is visible at (requirement c) % or more of the samples in [t, t + L].
// Then requirement (a) also passes, because there is no darkness.
// One extra /v1/series call: from the period start to start + 60 days, step 30 min.
// The scan uses prefix sums, so it is O(n). The 30-minute step is the resolution.

import { ApiError, fetchSeries } from './api';
import type { LatLon } from './ephemeris';
import { dh, getLimits, type Limits } from './mission';

export const SEARCH_DAYS = 60;
export const SEARCH_STEP_MIN = 30;
const DAY_MS = 86400000;

export interface WindowRequest {
  point: LatLon;
  heightM: number;
  startMs: number;
}

interface Samples {
  times: number[];
  sun: boolean[];
  earth: boolean[];
}

export interface WindowResult {
  /** No valid landing time in the search span. */
  none: boolean;
  openMs: number;
  /** Last valid landing time. */
  closeMs: number;
  /** The start (first sample) is a valid landing time. */
  startValid: boolean;
  /** The window runs to the last landing time that the search can test. It can close later. */
  closeCut: boolean;
}

/**
 * Find the first landing window at or after the first sample. `stayD` = L days,
 * `earthPct` = minimum Earth visibility in percent.
 */
export function scanWindow(s: Samples, stayD: number, earthPct: number): WindowResult {
  const n = s.times.length;
  const none: WindowResult = { none: true, openMs: 0, closeMs: 0, startValid: false, closeCut: false };
  if (n < 2) return none;
  const stepMs = s.times[1] - s.times[0];
  const k = Math.ceil((stayD * DAY_MS) / stepMs - 1e-9);
  if (k > n - 1) return none;
  // Prefix sums: ps[i] = number of Sun-visible samples in 0..i-1.
  const ps = new Int32Array(n + 1);
  const pe = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    ps[i + 1] = ps[i] + (s.sun[i] ? 1 : 0);
    pe[i + 1] = pe[i] + (s.earth[i] ? 1 : 0);
  }
  const m = k + 1;
  const needEarth = (earthPct / 100) * m - 1e-9;
  const ok = (i: number) => ps[i + m] - ps[i] === m && pe[i + m] - pe[i] >= needEarth;
  const last = n - 1 - k;
  let i = 0;
  while (i <= last && !ok(i)) i++;
  if (i > last) return none;
  let j = i;
  while (j + 1 <= last && ok(j + 1)) j++;
  return { none: false, openMs: s.times[i], closeMs: s.times[j], startValid: i === 0, closeCut: j === last };
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

const cache = new Map<string, Samples>();
let req: WindowRequest | null = null;
let ctrl: AbortController | null = null;
let useHook: ((startMs: number, days: number) => void) | null = null;

const keyOf = (r: WindowRequest) => `${r.point.latDeg},${r.point.lonDeg},${r.heightM},${r.startMs}`;

/** main.ts gives the function that sets the period start and the duration. */
export function setUseStartHook(fn: (startMs: number, days: number) => void) {
  useHook = fn;
}

function show(text: string, opts: { busy?: boolean; error?: boolean; ok?: boolean; use?: { openMs: number; days: number } } = {}) {
  const res = $('mrWinRes');
  const btn = $<HTMLButtonElement>('mrWinUse');
  res.textContent = text;
  res.classList.toggle('error', !!opts.error);
  res.classList.toggle('busy', !!opts.busy);
  res.dataset.check = opts.ok ? 'pass' : '';
  const u = opts.use;
  btn.hidden = !u;
  btn.onclick = u ? () => useHook?.(u.openMs, u.days) : null;
}

function render(s: Samples, r: WindowRequest, l: Limits) {
  const w = scanWindow(s, l.sunD, l.earthPct);
  if (w.none) {
    show(`No landing window in the ${SEARCH_DAYS} days after the start.`);
    return;
  }
  const close = `${fmtUtc(w.closeMs)} UTC${w.closeCut ? ' or later' : ''}`;
  if (w.startValid) {
    show(`✓ This start is in a landing window. The window closes at ${close} (${dh((w.closeMs - r.startMs) / 3600000)} after the start).`, {
      ok: true,
    });
    return;
  }
  show(
    `Next landing window: ${fmtUtc(w.openMs)} to ${close}. It opens ${dh((w.openMs - r.startMs) / 3600000)} after the start.`,
    { use: { openMs: w.openMs, days: l.sunD } },
  );
}

/** Search for the window of a point, height and start. Null: no point or no data yet. */
export function requestWindow(r: WindowRequest | null) {
  ctrl?.abort();
  ctrl = null;
  req = r;
  if (!r) {
    show('–');
    return;
  }
  const key = keyOf(r);
  const hit = cache.get(key);
  if (hit) {
    render(hit, r, getLimits());
    return;
  }
  const c = new AbortController();
  ctrl = c;
  show('Searching for the next landing window…', { busy: true });
  fetchSeries(
    {
      latDeg: r.point.latDeg,
      lonDeg: r.point.lonDeg,
      observerHeightM: r.heightM,
      startMs: r.startMs,
      stopMs: r.startMs + SEARCH_DAYS * DAY_MS,
      stepMinutes: SEARCH_STEP_MIN,
      terrain: 'auto',
    },
    c.signal,
  )
    .then((d) => {
      if (c.signal.aborted) return;
      const s: Samples = {
        times: d.times_utc.map((t) => Date.parse(t)),
        sun: d.series.sun_visible_fraction.map((f) => f > 0),
        earth: d.series.earth_visible.slice(),
      };
      if (cache.size > 30) cache.clear();
      cache.set(key, s);
      if (req && keyOf(req) === key) render(s, req, getLimits());
    })
    .catch((e) => {
      if ((e as Error).name === 'AbortError') return;
      console.error(e);
      const msg = e instanceof ApiError && e.unreachable ? 'The API is not available.' : (e as Error).message;
      show(`Cannot search for a landing window: ${msg}`, { error: true });
    });
}

/** The limits changed: scan again (no new API call if the data is in the cache). */
export function limitsChanged() {
  if (!req) return;
  const hit = cache.get(keyOf(req));
  if (hit) render(hit, req, getLimits());
}
