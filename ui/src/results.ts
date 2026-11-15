// Site results panel: /v1/series for the selected point over the period (start and
// duration from the time box). Shows live Sun/Earth values, the time to the next
// sunset/Earthset, the period result (summary and mission lines) and the event list. The API uses the terrain horizon where it has terrain data
// (`terrain: "auto"`), else a flat horizon. Older APIs send no `horizon` block: then the
// horizon is flat, as before.

import { ApiError, fetchSeries, type HorizonMask, type SeriesEvent, type SeriesOut } from './api';
import type { LatLon } from './ephemeris';
import { CheckPanel } from './check';

const HOUR_MS = 3600000;

/** Series step for a period of `days`. Keeps the steps at 20,000 or less and still shows short gaps. */
export function missionStepMinutes(days: number): number {
  if (days <= 31) return 10;
  if (days <= 100) return 30;
  return 60;
}

/** "4 d 12 h", "5 h 20 min" or "12 min". */
export function fmtDH(h: number): string {
  const min = Math.round(h * 60);
  const d = Math.floor(min / 1440);
  const hh = Math.floor((min % 1440) / 60);
  const mm = min % 60;
  if (d > 0) return `${d} d ${hh} h`;
  if (hh > 0) return `${hh} h ${mm} min`;
  return `${mm} min`;
}

/** "7 d" or "1.5 d". */
const fmtDays = (days: number) => `${+days.toFixed(2)} d`;

export interface SkyNow {
  sunAz: number;
  sunEl: number;
  sunVisibleFraction: number;
  earthAz: number;
  earthEl: number;
  earthMargin: number;
  earthVisible: boolean;
}

/** The horizon in use for the loaded series. */
export interface HorizonInfo {
  kind: 'terrain' | 'flat' | 'provided' | 'unknown' | 'warn';
  label: string;
  /** Longer explanation for the tag tooltip. */
  title?: string;
  /** Terrain outline for the sky plot, or null for a flat horizon. */
  mask: { elevationDeg: number[]; azStepDeg: number } | null;
}

const FLAT: HorizonInfo = { kind: 'flat', label: 'Flat horizon (0°)', mask: null };

export function horizonOf(d: SeriesOut, sent: HorizonMask | null): HorizonInfo {
  const h = d.horizon;
  if (!h) {
    // Older API: no horizon block. It used the mask we sent, or a flat horizon.
    if (sent) return { kind: 'provided', label: 'Provided', mask: { elevationDeg: sent.elevation_deg, azStepDeg: sent.az_step_deg } };
    return FLAT;
  }
  const mask =
    h.elevation_deg && h.elevation_deg.length && h.az_step_deg
      ? { elevationDeg: h.elevation_deg, azStepDeg: h.az_step_deg }
      : null;
  if (h.source === 'terrain') {
    const mpp = h.dem_source?.match(/(\d+)\s*MPP/i)?.[1];
    return { kind: 'terrain', label: mpp ? `Terrain (LOLA ${mpp} m)` : 'Terrain (LOLA)', mask };
  }
  if (h.source === 'provided') return { kind: 'provided', label: 'Provided', mask };
  if (h.terrain_status === 'unavailable') {
    return {
      kind: 'warn',
      label: 'Flat horizon: terrain not available. Results can be wrong.',
      title:
        'This server has no terrain data for this point. The results use a flat horizon (0°). ' +
        'Near the pole, terrain can block the Sun or Earth, so the real values can be very different. ' +
        'Pick a curated site to get terrain.',
      mask: null,
    };
  }
  return { kind: 'flat', label: 'Flat horizon (no terrain data here)', mask: null };
}

// Development only: open the page with ?mockmask to send the two committed terrain masks
// (data/masks) as the `mask` field, for an API that has no terrain yet.
const MOCK_MASKS: (() => Promise<HorizonMask[]>) | null =
  import.meta.env.DEV && new URLSearchParams(location.search).has('mockmask')
    ? async () => {
        const mods = import.meta.glob('../../data/masks/*.json', { import: 'default' });
        return Promise.all(Object.values(mods).map((f) => f() as Promise<HorizonMask>));
      }
    : null;

async function mockMaskFor(lat: number, lon: number, h: number): Promise<HorizonMask | null> {
  if (!MOCK_MASKS) return null;
  const all = await MOCK_MASKS();
  return all.find((m) => Math.abs(m.lat_deg - lat) < 1e-3 && Math.abs(m.lon_deg - lon) < 1e-3 && m.observer_height_m === h) ?? null;
}

export interface SeriesRequestKey {
  point: LatLon;
  startMs: number;
  stopMs: number;
  stepMinutes: number;
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
  horizon: HorizonInfo | null = null;
  private nextAfter: Partial<Record<SeriesEvent['type'], number | null>> | null = null;
  private times: number[] = [];
  private events: { type: SeriesEvent['type']; ms: number; row?: HTMLTableRowElement }[] = [];
  private key: SeriesRequestKey | null = null;
  private heightM = 2;
  private ctrl: AbortController | null = null;
  private timer = 0;
  private lastNowText = '';
  private readonly onData: () => void;
  private applyHeight: (v: number) => void = () => {};
  /** "Check this result" section (check.ts). */
  private readonly check = new CheckPanel($('results'));
  /** The point and observer height of the loaded data. */
  private dataReq: { point: LatLon; heightM: number } | null = null;

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
      if (this.key) {
        // A mask is valid for one observer height only: drop the old one now.
        this.horizon = null;
        this.renderHorizon();
        this.onData();
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
    this.applyHeight = apply;
    apply(this.heightM);
  }

  get observerHeightM() {
    return this.heightM;
  }

  /** Set the observer height (for example from a saved search). 0 to 1000 m. */
  setObserverHeight(v: number) {
    if (Number.isFinite(v) && v >= 0 && v <= 1000 && v !== this.heightM) this.applyHeight(v);
  }

  /** Set the point and the time window. Loads a new series if anything changed. */
  setRequest(k: SeriesRequestKey) {
    const o = this.key;
    if (
      o &&
      o.point.latDeg === k.point.latDeg &&
      o.point.lonDeg === k.point.lonDeg &&
      o.startMs === k.startMs &&
      o.stopMs === k.stopMs &&
      o.stepMinutes === k.stepMinutes
    )
      return;
    const pointChanged = !o || o.point.latDeg !== k.point.latDeg || o.point.lonDeg !== k.point.lonDeg;
    this.key = k;
    if (pointChanged) {
      // Old values belong to another point: clear them now.
      this.data = null;
      this.horizon = null;
      this.nextAfter = null;
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
    const heightM = this.heightM;
    let sent: HorizonMask | null = null;
    mockMaskFor(k.point.latDeg, k.point.lonDeg, heightM)
      .then((mock) => {
        sent = mock;
        return fetchSeries(
          {
            latDeg: k.point.latDeg,
            lonDeg: k.point.lonDeg,
            observerHeightM: heightM,
            startMs: k.startMs,
            stopMs: k.stopMs,
            stepMinutes: k.stepMinutes,
            mask: mock,
            terrain: 'auto',
          },
          ctrl.signal,
        );
      })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        this.data = d;
        this.dataReq = { point: k.point, heightM };
        this.horizon = horizonOf(d, sent);
        const ne = d.next_events;
        this.nextAfter = ne
          ? {
              sunrise: ne.sunrise ? Date.parse(ne.sunrise) : null,
              sunset: ne.sunset ? Date.parse(ne.sunset) : null,
              earthrise: ne.earthrise ? Date.parse(ne.earthrise) : null,
              earthset: ne.earthset ? Date.parse(ne.earthset) : null,
            }
          : null;
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

  private renderHorizon() {
    const h = this.horizon;
    const tag = $('horizonTag');
    const text = h ? h.label : this.key ? 'Horizon: loading…' : '–';
    if (tag.textContent !== text) tag.textContent = text;
    tag.className = `tag ${h ? h.kind : ''}`;
    tag.title = h?.title ?? '';
    $('legendTerrain').hidden = !h?.mask;
  }

  /** Static parts: summary and event list. */
  private render() {
    this.renderHorizon();
    const d = this.data;
    const sum = $('summary');
    const list = $<HTMLTableSectionElement>('eventRows');
    list.innerHTML = '';
    const req = this.dataReq;
    this.check.set(
      d && req ? { data: d, point: req.point, observerHeightM: req.heightM, horizonLabel: this.horizon?.label ?? '–' } : null,
    );
    const lines = $<HTMLUListElement>('sumLines');
    lines.replaceChildren();
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
    this.renderLines(lines, d);

    if (!this.events.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = 'No sunrise, sunset, Earthrise or Earthset in this period.';
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

  /** Mission lines: the worst gaps, the state at the start and the first sunset. */
  private renderLines(list: HTMLUListElement, d: SeriesOut) {
    const s = d.summary;
    const t = this.times;
    const t0 = t[0];
    const tEnd = t[t.length - 1];
    const line = (text: string, cls = '') => {
      const li = document.createElement('li');
      li.textContent = text;
      if (cls) li.className = cls;
      list.append(li);
    };
    const sunOn = (i: number) => d.series.sun_visible_fraction[i] > 0;
    const earthOn = (i: number) => d.series.earth_visible[i];
    /** End of the sentence for a gap. A cut gap touches an edge of the period. */
    const edge = (h: number, cut: boolean | undefined, on: (i: number) => boolean) => {
      if (!cut) return '.';
      // Length of the gap at the end of the period, from the samples.
      let i = t.length - 1;
      while (i >= 0 && !on(i)) i--;
      const tail = i === t.length - 1 ? 0 : (tEnd - t[Math.max(0, i)]) / HOUR_MS;
      const stepH = (t.length > 1 ? t[1] - t[0] : 0) / HOUR_MS;
      const where = tail > 0 && Math.abs(tail - h) <= 1.5 * stepH + 1e-9 ? 'until the end of the period' : 'from the start of the period';
      return `, ${where}. The real time can be longer.`;
    };
    if (s.longest_no_sun_period_h === undefined) {
      line('This API version does not give the gaps. Use a newer API for the longest night and the longest Earth outage.', 'warn');
    } else {
      const ns = s.longest_no_sun_period_h;
      line(
        ns === 0
          ? 'Longest night: none. The Sun is visible all the time.'
          : `Longest night: ${fmtDH(ns)}${edge(ns, s.longest_no_sun_period_truncated, sunOn)} The lander must survive this without sunlight.`,
        ns >= 24 ? 'bad' : '',
      );
      const ne = s.longest_no_earth_period_h!;
      line(
        ne === 0
          ? 'Longest Earth outage: none. Earth is visible all the time.'
          : `Longest Earth outage: ${fmtDH(ne)}${edge(ne, s.longest_no_earth_period_truncated, earthOn)} No direct radio link to Earth for this time.`,
        ne >= 24 ? 'bad' : '',
      );
      const nb = s.longest_no_both_period_h!;
      line(
        nb === 0
          ? 'Longest time without Sun and Earth together: none.'
          : `Longest time without Sun and Earth together: ${fmtDH(nb)}${edge(nb, s.longest_no_both_period_truncated, (i) => sunOn(i) && earthOn(i))}`,
      );
    }
    const sunUp = s.sun_up_at_start ?? sunOn(0);
    const earthUp = s.earth_up_at_start ?? earthOn(0);
    line(`At the start: the Sun is ${sunUp ? 'up' : 'down'}. Earth is ${earthUp ? 'up' : 'down'}.`, sunUp && earthUp ? '' : 'bad');
    let first: number | null | undefined = s.time_to_first_sunset_h;
    if (first === undefined) {
      const ev = this.events.find((e) => e.type === 'sunset');
      first = ev ? (ev.ms - t0) / HOUR_MS : null;
    }
    line(
      first === null
        ? `First sunset: none in the period (${fmtDays((tEnd - t0) / 86400000)}).`
        : `First sunset: ${fmtDH(first)} after the start (${fmtUtc(t0 + first * HOUR_MS)} UTC).`,
    );
  }

  /** Live parts: current values and countdowns. Call every frame. */
  tick(nowMs: number) {
    this.check.tick(nowMs);
    const now = this.at(nowMs);
    const set = (id: string, text: string) => {
      const el = $(id);
      if (el.textContent !== text) el.textContent = text;
    };
    if (!now) {
      for (const id of ['curSunEl', 'curSunFrac', 'curEarthEl', 'curEarthMargin']) set(id, '–');
      for (const id of ['cdSun', 'cdEarth']) set(id, this.data ? 'The time is outside the period.' : '–');
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
        const big = `No ${what} before the end of the period (${fmtDays((stop - this.times[0]) / 86400000)})`;
        // The API gives the first event after the period (it searches up to 400 days).
        const type = (up ? (body === 'sun' ? 'sunset' : 'earthset') : body === 'sun' ? 'sunrise' : 'earthrise') as SeriesEvent['type'];
        const after = this.nextAfter?.[type];
        if (after != null && after > nowMs) {
          return [big, `Next ${what}: ${fmtUtc(after)} UTC, ${fmtDuration(after - stop)} after the end.`];
        }
        if (this.nextAfter && after === null) {
          return [big, `No ${what} in the 400 days after the end (${fmtUtc(stop + 400 * 86400000)} UTC).`];
        }
        return [big, `The period ends at ${fmtUtc(stop)} UTC.`];
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
