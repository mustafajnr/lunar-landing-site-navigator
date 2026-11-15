// "Mission requirements" box of the Verdict tab. NASA has no rating scale. NASA uses
// pass/fail requirements for each mission. The user can edit three limits. Each limit
// has a NASA default and a source. The values stay in localStorage.

import type { SeriesSummary } from './api';

export type Check = 'pass' | 'fail' | 'unknown';

export interface Source {
  short: string;
  title: string;
  url: string;
}

export const SOURCES = {
  viper: {
    short: 'VIPER',
    title: 'VIPER mission planning, SpaceOps 2022: a safe haven has 50 hours of darkness or less',
    url: 'https://ntrs.nasa.gov/api/citations/20220008301/downloads/2022-06-02-spaceops-viper-planning.pdf',
  },
  artemisStay: {
    short: 'Artemis',
    title: 'NASA Lunar Site Selection white paper, 2023: sunlight for about 6 to 6.5 days of surface stay',
    url: 'https://ntrs.nasa.gov/api/citations/20230016267/downloads/Lunar%20Site%20Selection.pdf',
  },
  artemisHls: {
    short: 'Artemis HLS',
    title: 'Artemis Human Landing System update, NASA LaRC 2024: areas with Earth visibility below 25 % are excluded',
    url: 'https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf',
  },
} satisfies Record<string, Source>;

export interface Limits {
  /** Longest darkness the hardware survives, hours. */
  darkH: number;
  /** Continuous sunlight needed from the start, days. */
  sunD: number;
  /** Minimum Earth visibility, percent. */
  earthPct: number;
}

export const NASA_DEFAULTS: Limits = { darkH: 50, sunD: 6.5, earthPct: 25 };

/** Input limits: [min, max] for each field. */
const RANGE: Record<keyof Limits, [number, number]> = {
  darkH: [0, 100000],
  sunD: [0, 5000],
  earthPct: [0, 100],
};

const KEY = 'lsn.missionLimits';

function loadLimits(): Limits {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...NASA_DEFAULTS };
    const o = JSON.parse(raw) as Partial<Limits>;
    const out = { ...NASA_DEFAULTS };
    for (const k of Object.keys(RANGE) as (keyof Limits)[]) {
      const v = o[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= RANGE[k][0] && v <= RANGE[k][1]) out[k] = v;
    }
    return out;
  } catch {
    return { ...NASA_DEFAULTS };
  }
}

function saveLimits(l: Limits) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* The browser does not keep data. */
  }
}

/** "4 d 12 h", "5 h 20 min" or "12 min". */
export function dh(h: number): string {
  const min = Math.round(h * 60);
  const d = Math.floor(min / 1440);
  const hh = Math.floor((min % 1440) / 60);
  const mm = min % 60;
  if (d > 0) return hh ? `${d} d ${hh} h` : `${d} d`;
  if (hh > 0) return mm ? `${hh} h ${mm} min` : `${hh} h`;
  return `${mm} min`;
}

export interface Result {
  check: Check;
  text: string;
}

/** (a) Longest continuous darkness compared with the limit in hours. */
export function checkDark(s: SeriesSummary, limitH: number): Result {
  const ns = s.longest_no_sun_period_h;
  if (ns === undefined) return { check: 'unknown', text: `No darkness data from the API.` };
  if (ns === 0) return { check: 'pass', text: `No darkness in this period.` };
  const cut = !!s.longest_no_sun_period_truncated;
  if (ns > limitH) return { check: 'fail', text: `Longest darkness ${cut ? 'at least ' : ''}${dh(ns)}.` };
  if (cut) {
    return { check: 'unknown', text: `Longest darkness at least ${dh(ns)}. Check a longer period.` };
  }
  return { check: 'pass', text: `Longest darkness ${dh(ns)}.` };
}

/** (b) Continuous sunlight from the start compared with the limit in days. */
export function checkSun(s: SeriesSummary, limitD: number): Result {
  const limitH = limitD * 24;
  if (s.sun_up_at_start === undefined || s.time_to_first_sunset_h === undefined) {
    return { check: 'unknown', text: `No sunset data from the API.` };
  }
  if (!s.sun_up_at_start) return { check: 'fail', text: `The Sun is down at the start.` };
  const t = s.time_to_first_sunset_h;
  if (t === null) {
    if (s.span_h >= limitH) return { check: 'pass', text: `Sunlight for all of the period (${dh(s.span_h)}).` };
    return {
      check: 'unknown',
      text: `Sunlight for all of the period, but the period is only ${dh(s.span_h)}. Check a longer period.`,
    };
  }
  if (t >= limitH) return { check: 'pass', text: `Sunlight for ${dh(t)} from the start.` };
  return { check: 'fail', text: `Sunlight for only ${dh(t)} from the start.` };
}

/** (c) Earth visibility compared with the limit in percent. */
export function checkEarth(s: SeriesSummary, limitPct: number): Result {
  const p = s.earth_fraction_of_time * 100;
  const shown = p > 0 && p < 0.5 ? '0.5' : p > 99.5 && p < 100 ? '99.5' : String(Math.round(p));
  const ok = p >= limitPct;
  return { check: ok ? 'pass' : 'fail', text: `Earth visibility ${shown} %.` };
}

const SYMBOL: Record<Check, string> = { pass: '✓', fail: '✕', unknown: '?' };
const WORD: Record<Check, string> = { pass: 'Meets', fail: 'Does not meet', unknown: 'Not known' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const FIELDS: { key: keyof Limits; input: string; err: string; name: string; unit: string }[] = [
  { key: 'darkH', input: 'mrDark', err: 'mrDarkErr', name: 'Longest darkness', unit: 'hours' },
  { key: 'sunD', input: 'mrSun', err: 'mrSunErr', name: 'Continuous sunlight', unit: 'days' },
  { key: 'earthPct', input: 'mrEarth', err: 'mrEarthErr', name: 'Earth visibility', unit: '%' },
];

let limits: Limits = loadLimits();
let last: SeriesSummary | null = null;
let ready = false;

function setLine(id: string, r: Result | null) {
  const li = $(id);
  const sym = li.querySelector<HTMLElement>('.mr-sym')!;
  const txt = li.querySelector<HTMLElement>('.mr-text')!;
  li.dataset.check = r ? r.check : '';
  sym.textContent = r ? SYMBOL[r.check] : '';
  sym.title = r ? WORD[r.check] : '';
  sym.setAttribute('aria-label', r ? WORD[r.check] : '');
  txt.textContent = r ? r.text : '–';
}

function render() {
  const s = last;
  const sum = $('mrSummary');
  if (!s) {
    sum.textContent = 'Select a point and wait for the result.';
    for (const id of ['mrDarkRes', 'mrSunRes', 'mrEarthRes']) setLine(id, null);
    return;
  }
  const res = [checkDark(s, limits.darkH), checkSun(s, limits.sunD), checkEarth(s, limits.earthPct)];
  setLine('mrDarkRes', res[0]);
  setLine('mrSunRes', res[1]);
  setLine('mrEarthRes', res[2]);
  const n = res.filter((r) => r.check === 'pass').length;
  const u = res.filter((r) => r.check === 'unknown').length;
  sum.textContent = `Meets ${n} of 3 mission requirements.${u ? ` ${u} not known.` : ''}`;
}

function fillInputs() {
  for (const f of FIELDS) {
    const inp = $<HTMLInputElement>(f.input);
    inp.value = String(limits[f.key]);
    inp.classList.remove('bad');
    inp.removeAttribute('aria-invalid');
    $(f.err).hidden = true;
  }
}

/** Set up the inputs and the reset button. Call one time. */
export function setupMission() {
  if (ready) return;
  ready = true;
  for (const [id, src] of [
    ['mrDarkSrc', SOURCES.viper],
    ['mrSunSrc', SOURCES.artemisStay],
    ['mrEarthSrc', SOURCES.artemisHls],
  ] as const) {
    const a = $<HTMLAnchorElement>(id);
    a.href = src.url;
    a.textContent = src.short;
    a.title = src.title;
  }
  fillInputs();
  for (const f of FIELDS) {
    const inp = $<HTMLInputElement>(f.input);
    const err = $(f.err);
    inp.addEventListener('change', () => {
      const t = inp.value.trim().replace(',', '.');
      const v = Number(t);
      const [lo, hi] = RANGE[f.key];
      if (t === '' || !/^\d*\.?\d+$/.test(t) || !Number.isFinite(v) || v < lo || v > hi) {
        err.textContent = `${f.name} must be a number from ${lo} to ${hi} ${f.unit}.`;
        err.hidden = false;
        inp.classList.add('bad');
        inp.setAttribute('aria-invalid', 'true');
        return;
      }
      err.hidden = true;
      inp.classList.remove('bad');
      inp.removeAttribute('aria-invalid');
      limits = { ...limits, [f.key]: v };
      saveLimits(limits);
      render();
    });
  }
  $('mrReset').addEventListener('click', () => {
    limits = { ...NASA_DEFAULTS };
    saveLimits(limits);
    fillInputs();
    render();
  });
  render();
}

/** Show the checks for a summary. Null: no data yet. */
export function renderMission(s: SeriesSummary | null) {
  last = s;
  if (ready) render();
}
