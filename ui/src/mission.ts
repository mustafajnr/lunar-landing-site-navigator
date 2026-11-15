// Mission: evaluate the selected point for one mission (landing date and duration).
// One /v1/series call over the mission period. For a mission the worst gaps matter
// most: the longest night, the longest Earth outage and the longest time without both.

import { ApiError, fetchSeries, type SeriesOut } from './api';
import { cacheSeries } from './compare';
import { horizonOf } from './results';
import { searchKey, type SavedSearch, type SearchInputs } from './saved';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_DAYS = 1;
const MAX_DAYS = 400;

/** The point and the observer height of the selection now. */
export type MissionPoint = Pick<SearchInputs, 'siteName' | 'siteId' | 'latDeg' | 'lonDeg' | 'radiusM' | 'observerHeightM'>;

export interface MissionHooks {
  point(): MissionPoint;
  /** Time on the main clock, for the first landing date. */
  nowMs(): number;
  /** Add a saved search. Returns the message for the user. */
  save(inputs: SearchInputs, name: string): string;
}

export interface MissionApi {
  /** Show a saved mission in the form. */
  fill(s: SavedSearch): void;
}

/** Step that keeps the steps at 20,000 or less and still shows short gaps. */
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

const fmtPct = (f: number) => `${(f * 100).toFixed(1)} %`;
const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function setupMission(hooks: MissionHooks): MissionApi {
  const landIn = $<HTMLInputElement>('misLanding');
  const daysIn = $<HTMLInputElement>('misDays');
  const presets = [...document.querySelectorAll<HTMLButtonElement>('#missionSec [data-days]')];
  const stepEl = $<HTMLParagraphElement>('misStep');
  const errEl = $<HTMLParagraphElement>('misErr');
  const evalBtn = $<HTMLButtonElement>('misEval');
  const saveBtn = $<HTMLButtonElement>('misSave');
  const msgEl = $<HTMLParagraphElement>('misMsg');
  const out = $<HTMLDivElement>('misResult');

  let ctrl: AbortController | null = null;
  // Start at midnight UTC of the main clock day.
  landIn.value = toInput(Math.floor(hooks.nowMs() / DAY_MS) * DAY_MS);
  daysIn.value = '7';

  function setErr(text: string) {
    errEl.textContent = text;
    errEl.hidden = !text;
  }

  /** The form values, or an error text. */
  function read(): { landMs: number; days: number } | string {
    const landMs = Date.parse(`${landIn.value}:00Z`);
    if (!landIn.value || !Number.isFinite(landMs)) return 'Enter the landing date and time (UTC).';
    const days = Number(daysIn.value.trim());
    if (!daysIn.value.trim() || !Number.isFinite(days)) return 'Enter the duration in days.';
    if (days < MIN_DAYS || days > MAX_DAYS) return `The duration must be ${MIN_DAYS} to ${MAX_DAYS} days.`;
    return { landMs, days };
  }

  function inputs(landMs: number, days: number): SearchInputs {
    return {
      ...hooks.point(),
      startUtc: new Date(landMs).toISOString(),
      stopUtc: new Date(landMs + days * DAY_MS).toISOString(),
      stepMinutes: missionStepMinutes(days),
      terrain: 'auto',
      kind: 'mission',
      durationDays: days,
    };
  }

  function update() {
    const v = read();
    const days = Number(daysIn.value);
    for (const b of presets) b.classList.toggle('active', Number(b.dataset.days) === days);
    daysIn.classList.toggle('bad', typeof v === 'string' && v.includes('duration'));
    if (typeof v === 'string') {
      stepEl.textContent = '';
      return;
    }
    const step = missionStepMinutes(v.days);
    const n = Math.floor((v.days * 1440) / step) + 1;
    stepEl.textContent = `Period: ${fmtUtc(v.landMs)} to ${fmtUtc(v.landMs + v.days * DAY_MS)} UTC. Step: ${step} min (${n.toLocaleString('en-US')} steps).`;
  }

  for (const b of presets) {
    b.addEventListener('click', () => {
      daysIn.value = b.dataset.days!;
      setErr('');
      update();
    });
  }
  daysIn.addEventListener('input', update);
  landIn.addEventListener('input', update);
  landIn.addEventListener('change', update);

  const name = (i: SearchInputs, days: number) => `Mission: ${i.siteName}, ${i.startUtc.slice(0, 10)}, ${+days.toFixed(2)} d`;

  evalBtn.addEventListener('click', async () => {
    const v = read();
    if (typeof v === 'string') {
      setErr(v);
      return;
    }
    setErr('');
    msgEl.hidden = true;
    const inp = inputs(v.landMs, v.days);
    ctrl?.abort();
    const c = new AbortController();
    ctrl = c;
    evalBtn.disabled = true;
    out.replaceChildren(el('p', 'small', 'Evaluating the mission…'));
    out.hidden = false;
    try {
      const d = await fetchSeries(
        {
          latDeg: inp.latDeg,
          lonDeg: inp.lonDeg,
          observerHeightM: inp.observerHeightM,
          startMs: v.landMs,
          stopMs: v.landMs + v.days * DAY_MS,
          stepMinutes: inp.stepMinutes,
          terrain: 'auto',
        },
        c.signal,
      );
      if (c.signal.aborted) return;
      cacheSeries(searchKey(inp), d);
      render(inp, v.days, d);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || c.signal.aborted) return;
      console.error(err);
      out.replaceChildren(
        el('p', 'error', err instanceof ApiError && err.unreachable ? 'The API is not available.' : `The mission cannot be evaluated. ${(err as Error).message}`),
      );
    } finally {
      if (ctrl === c) evalBtn.disabled = false;
    }
  });

  saveBtn.addEventListener('click', () => {
    const v = read();
    if (typeof v === 'string') {
      setErr(v);
      return;
    }
    setErr('');
    const inp = inputs(v.landMs, v.days);
    msgEl.textContent = hooks.save(inp, name(inp, v.days));
    msgEl.hidden = false;
  });

  function render(inp: SearchInputs, days: number, d: SeriesOut) {
    const s = d.summary;
    const t0 = Date.parse(inp.startUtc);
    const box = el('div', 'mis-card');
    const head = el('div', 'mis-head');
    head.append(el('strong', '', 'Mission result'));
    const info = horizonOf(d, null);
    const tag = el('span', `tag ${info.kind}`, info.label);
    if (info.title) tag.title = info.title;
    head.append(tag);
    box.append(head);
    box.append(
      el('p', 'small', `${inp.siteName}, observer height ${inp.observerHeightM} m.`),
      el('p', 'small', `Period: ${fmtUtc(t0)} to ${fmtUtc(Date.parse(inp.stopUtc))} UTC (${+days.toFixed(2)} d). Step: ${inp.stepMinutes} min.`),
    );

    const tbl = el('table', 'mono');
    const row = (k: string, v: string, cls = '') => {
      const tr = el('tr', cls);
      tr.append(el('td', '', k), el('td', '', v));
      tbl.append(tr);
    };
    row('Sun, % of time', fmtPct(s.sun_fraction_of_time));
    row('Earth, % of time', fmtPct(s.earth_fraction_of_time));
    row('Sun and Earth, % of time', fmtPct(s.both_fraction_of_time));
    box.append(tbl);

    const list = el('ul', 'mis-lines');
    const line = (text: string, cls = '') => list.append(el('li', cls, text));
    const edge = (cut: boolean | undefined) => (cut ? ' This period touches the landing or the end of the mission. The real period can be longer.' : '');
    const old = s.longest_no_sun_period_h === undefined;
    if (old) {
      line('This API version does not give the gaps. Use a newer API for the longest night and the longest Earth outage.', 'warn');
    } else {
      const ns = s.longest_no_sun_period_h!;
      line(
        ns === 0
          ? 'Longest night: none. The Sun is visible all the time.'
          : `Longest night: ${fmtDH(ns)}. The lander must survive this without sunlight.${edge(s.longest_no_sun_period_truncated)}`,
        ns >= 24 ? 'bad' : '',
      );
      const ne = s.longest_no_earth_period_h!;
      line(
        ne === 0
          ? 'Longest Earth outage: none. Earth is visible all the time.'
          : `Longest Earth outage: ${fmtDH(ne)}. No direct radio link to Earth for this time.${edge(s.longest_no_earth_period_truncated)}`,
        ne >= 24 ? 'bad' : '',
      );
      const nb = s.longest_no_both_period_h!;
      line(
        nb === 0
          ? 'Longest time without Sun and Earth together: none.'
          : `Longest time without Sun and Earth together: ${fmtDH(nb)}.${edge(s.longest_no_both_period_truncated)}`,
      );
    }
    const sunUp = s.sun_up_at_start ?? d.series.sun_visible_fraction[0] > 0;
    const earthUp = s.earth_up_at_start ?? d.series.earth_visible[0];
    line(`At landing: the Sun is ${sunUp ? 'up' : 'down'}. Earth is ${earthUp ? 'up' : 'down'}.`, sunUp && earthUp ? '' : 'bad');
    let first: number | null | undefined = s.time_to_first_sunset_h;
    if (first === undefined) {
      const ev = d.events.find((e) => e.type === 'sunset');
      first = ev ? (Date.parse(ev.utc) - t0) / HOUR_MS : null;
    }
    line(
      first === null
        ? 'First sunset: none in the mission period.'
        : `First sunset: ${fmtDH(first)} after landing (${fmtUtc(t0 + first * HOUR_MS)} UTC).`,
    );
    box.append(list);
    out.replaceChildren(box);
    out.hidden = false;
  }

  update();

  return {
    fill(s: SavedSearch) {
      const a = Date.parse(s.startUtc);
      const b = Date.parse(s.stopUtc);
      landIn.value = toInput(a);
      daysIn.value = String(s.durationDays ?? +((b - a) / DAY_MS).toFixed(3));
      setErr('');
      update();
    },
  };
}
