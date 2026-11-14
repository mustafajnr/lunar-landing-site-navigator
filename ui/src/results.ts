// Site results panel: /v1/series for the selected point over the time window.
// Shows live Sun/Earth values, the time to the next sunset/Earthset, the summary and
// the event list. Flat horizon for now (no mask).

import { ApiError, fetchSeries, type SeriesEvent, type SeriesOut } from './api';
import type { LatLon } from './ephemeris';

export const SERIES_STEP_MIN = 60;

export interface SkyNow {
  sunAz: number;
  sunEl: number;
  sunVisibleFraction: number;
  earthAz: number;
  earthEl: number;
  earthMargin: number;
  earthVisible: boolean;
}

export interface SeriesRequestKey {
  point: LatLon;
  startMs: number;
  stopMs: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** "3 d 04 h 12 min", or "12 min 05 s" under one hour. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} d ${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m} min ${String(sec).padStart(2, '0')} s`;
}

const fmtHours = (h: number) => {
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  return `${h.toFixed(1)} h`;
};
const fmtPct = (f: number) => `${(f * 100).toFixed(1)} %`;
const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const signed = (x: number, digits = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(digits)}°`;

function lerpAngle(a: number, b: number, f: number) {
  let d = ((b - a + 540) % 360) - 180;
  if (!Number.isFinite(d)) d = 0;
  return (a + d * f + 360) % 360;
}

const EVENT_LABEL: Record<string, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  earthrise: 'Earthrise',
  earthset: 'Earthset',
};

export class ResultsPanel {
  data: SeriesOut | null = null;
  private times: number[] = [];
  private events: { type: SeriesEvent['type']; ms: number; row?: HTMLTableRowElement }[] = [];
  private key: SeriesRequestKey | null = null;
  private heightM = 2;
  private ctrl: AbortController | null = null;
  private timer = 0;
  private lastNowText = '';
  private readonly onData: () => void;

  constructor(onData: () => void) {
    this.onData = onData;
    const hIn = $<HTMLInputElement>('heightIn');
    const hErr = $<HTMLParagraphElement>('heightErr');
    hIn.value = String(this.heightM);
    const apply = (v: number) => {
      this.heightM = v;
      hIn.value = String(v);
      hErr.hidden = true;
      hIn.classList.remove('bad');
      for (const b of document.querySelectorAll<HTMLButtonElement>('[data-height]')) {
        b.classList.toggle('active', Number(b.dataset.height) === v);
      }
      this.schedule(250);
    };
    hIn.addEventListener('change', () => {
      const v = Number(hIn.value.replace(',', '.'));
      if (!Number.isFinite(v) || v < 0 || v > 1000) {
        hErr.textContent = 'Observer height must be a number from 0 to 1000 m.';
        hErr.hidden = false;
        hIn.classList.add('bad');
        return;
      }
      apply(v);
    });
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-height]')) {
      b.addEventListener('click', () => apply(Number(b.dataset.height)));
    }
    apply(this.heightM);
  }

  get observerHeightM() {
    return this.heightM;
  }

  /** Set the point and the time window. Loads a new series if anything changed. */
  setRequest(k: SeriesRequestKey) {
    const o = this.key;
    if (
      o &&
      o.point.latDeg === k.point.latDeg &&
      o.point.lonDeg === k.point.lonDeg &&
      o.startMs === k.startMs &&
      o.stopMs === k.stopMs
    )
      return;
    const pointChanged = !o || o.point.latDeg !== k.point.latDeg || o.point.lonDeg !== k.point.lonDeg;
    this.key = k;
    if (pointChanged) {
      // Old values belong to another point: clear them now.
      this.data = null;
      this.times = [];
      this.events = [];
      this.render();
      this.onData();
    }
    this.schedule(0);
  }

  private schedule(delay: number) {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.load(), delay);
  }

  private load() {
    const k = this.key;
    if (!k) return;
    this.ctrl?.abort();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.setStatus('Loading…', false);
    fetchSeries(
      {
        latDeg: k.point.latDeg,
        lonDeg: k.point.lonDeg,
        observerHeightM: this.heightM,
        startMs: k.startMs,
        stopMs: k.stopMs,
        stepMinutes: SERIES_STEP_MIN,
        mask: null, // flat horizon for now
      },
      ctrl.signal,
    )
      .then((d) => {
        if (ctrl.signal.aborted) return;
        this.data = d;
        this.times = d.times_utc.map((t) => Date.parse(t));
        this.events = d.events.map((e) => ({ type: e.type, ms: Date.parse(e.utc) }));
        this.setStatus('', false);
        this.render();
        this.onData();
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        console.error(e);
        const msg =
          e instanceof ApiError && e.unreachable
            ? 'The API is not available. No results.'
            : `Cannot load results: ${(e as Error).message}`;
        this.setStatus(msg, true);
      });
  }

  private setStatus(text: string, error: boolean) {
    const el = $('resStatus');
    el.textContent = text;
    el.hidden = text === '';
    el.classList.toggle('error', error);
  }

  /** Values at a time, interpolated linearly between series samples. Null outside the series. */
  at(ms: number): SkyNow | null {
    const d = this.data;
    const t = this.times;
    if (!d || t.length < 2 || ms < t[0] || ms > t[t.length - 1]) return null;
    let i = Math.floor(((ms - t[0]) / (t[t.length - 1] - t[0])) * (t.length - 1));
    i = Math.max(0, Math.min(t.length - 2, i));
    while (i > 0 && t[i] > ms) i--;
    while (i < t.length - 2 && t[i + 1] < ms) i++;
    const f = (ms - t[i]) / (t[i + 1] - t[i]);
    const s = d.series;
    const lin = (a: number[]) => a[i] + (a[i + 1] - a[i]) * f;
    const earthMargin = lin(s.earth_margin);
    return {
      sunAz: lerpAngle(s.sun_az[i], s.sun_az[i + 1], f),
      sunEl: lin(s.sun_el),
      sunVisibleFraction: Math.max(0, Math.min(1, lin(s.sun_visible_fraction))),
      earthAz: lerpAngle(s.earth_az[i], s.earth_az[i + 1], f),
      earthEl: lin(s.earth_el),
      earthMargin,
      earthVisible: earthMargin > 0,
    };
  }

  /** Static parts: summary and event list. */
  private render() {
    const d = this.data;
    const sum = $('summary');
    const list = $<HTMLTableSectionElement>('eventRows');
    list.innerHTML = '';
    if (!d) {
      sum.querySelectorAll('td[id]').forEach((td) => (td.textContent = '–'));
      return;
    }
    const s = d.summary;
    $('sumSpan').textContent = fmtHours(s.span_h);
    $('sumDates').textContent = `${fmtUtc(this.times[0])} to ${fmtUtc(this.times[this.times.length - 1])} UTC`;
    $('sumSun').textContent = fmtPct(s.sun_fraction_of_time);
    $('sumSunFrac').textContent = fmtPct(s.mean_sun_visible_fraction);
    $('sumEarth').textContent = fmtPct(s.earth_fraction_of_time);
    $('sumBoth').textContent = fmtPct(s.both_fraction_of_time);
    $('sumLongSun').textContent = fmtHours(s.longest_sun_period_h);
    $('sumLongEarth').textContent = fmtHours(s.longest_earth_period_h);
    $('sumLongBoth').textContent = fmtHours(s.longest_both_period_h);

    if (!this.events.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = 'No sunrise, sunset, Earthrise or Earthset in this window.';
      tr.append(td);
      list.append(tr);
    }
    for (const e of this.events) {
      const tr = document.createElement('tr');
      tr.className = `ev ev-${e.type}`;
      const a = document.createElement('td');
      a.textContent = EVENT_LABEL[e.type] ?? e.type;
      const b = document.createElement('td');
      b.textContent = `${new Date(e.ms).toISOString().replace('.000Z', 'Z').replace('T', ' ')}`;
      tr.append(a, b);
      list.append(tr);
      e.row = tr;
    }
    this.lastNowText = '';
  }

  /** Live parts: current values and countdowns. Call every frame. */
  tick(nowMs: number) {
    const now = this.at(nowMs);
    const set = (id: string, text: string) => {
      const el = $(id);
      if (el.textContent !== text) el.textContent = text;
    };
    if (!now) {
      for (const id of ['curSunEl', 'curSunFrac', 'curEarthEl', 'curEarthMargin']) set(id, '–');
      for (const id of ['cdSun', 'cdEarth']) set(id, this.data ? 'Time is outside the loaded window.' : '–');
      set('cdSunSub', '');
      set('cdEarthSub', '');
      set('cdSunState', '');
      set('cdEarthState', '');
      return;
    }
    set('curSunEl', signed(now.sunEl));
    set('curSunFrac', fmtPct(now.sunVisibleFraction));
    set('curEarthEl', signed(now.earthEl));
    set('curEarthMargin', signed(now.earthMargin));

    const stop = this.times[this.times.length - 1];
    const countdown = (body: 'sun' | 'earth', upNow: boolean) => {
      const next = this.events.find((e) => e.ms > nowMs && (body === 'sun' ? e.type.startsWith('sun') : e.type.startsWith('earth')));
      // The next event decides the state (avoids a mismatch from interpolation near a crossing).
      const up = next ? next.type.endsWith('set') : upNow;
      const stateEl = $(body === 'sun' ? 'cdSunState' : 'cdEarthState');
      const label = body === 'sun' ? 'Sun' : 'Earth';
      const st = up ? `${label} is up` : `${label} is down`;
      if (stateEl.textContent !== st) stateEl.textContent = st;
      stateEl.className = `state ${up ? 'up' : 'down'}`;
      if (!next) {
        const what = up ? (body === 'sun' ? 'sunset' : 'Earthset') : body === 'sun' ? 'sunrise' : 'Earthrise';
        return [
          `No ${what} for more than ${fmtDuration(stop - nowMs)}`,
          `None before the end of the loaded window (${fmtUtc(stop)} UTC).`,
        ];
      }
      return [`${EVENT_LABEL[next.type]} in ${fmtDuration(next.ms - nowMs)}`, `at ${fmtUtc(next.ms)} UTC`];
    };
    const [sunBig, sunSub] = countdown('sun', now.sunVisibleFraction > 0);
    const [earthBig, earthSub] = countdown('earth', now.earthVisible);
    set('cdSun', sunBig);
    set('cdSunSub', sunSub);
    set('cdEarth', earthBig);
    set('cdEarthSub', earthSub);

    // Mark past events and the next one of each kind.
    const key = String(this.events.findIndex((e) => e.ms > nowMs));
    if (key !== this.lastNowText) {
      this.lastNowText = key;
      let nextSun = false;
      let nextEarth = false;
      for (const e of this.events) {
        if (!e.row) continue;
        const past = e.ms <= nowMs;
        let next = false;
        if (!past && e.type.startsWith('sun') && !nextSun) next = nextSun = true;
        if (!past && e.type.startsWith('earth') && !nextEarth) next = nextEarth = true;
        e.row.classList.toggle('past', past);
        e.row.classList.toggle('next', next);
      }
    }
  }
}
