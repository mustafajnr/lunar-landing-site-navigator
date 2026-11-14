// Comparison of 2 to 4 saved searches: one /v1/series call for each search, one at a
// time (the API has concurrency 1). A table with one column for each search, and
// timeline strips (Sun, Earth, both) on a shared calendar axis or from day 0.

import { ApiError, fetchSeries, type SeriesOut } from './api';
import { horizonOf } from './results';
import { searchKey, type SavedSearch } from './saved';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

/** Results by search inputs. Kept for the page session. */
const cache = new Map<string, SeriesOut>();

type Entry = {
  s: SavedSearch;
  state: 'wait' | 'load' | 'ok' | 'error';
  data?: SeriesOut;
  error?: string;
  times?: number[];
};

type Align = 'calendar' | 'start';

const fmtPct = (f: number) => `${(f * 100).toFixed(1)} %`;
const fmtH = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`);
const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const fmtLat = (d: number) => `${Math.abs(d).toFixed(4)}° ${d >= 0 ? 'N' : 'S'}`;
const fmtLon = (d: number) => `${Math.abs(d).toFixed(4)}° ${d >= 0 ? 'E' : 'W'}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

let panel: HTMLElement | null = null;
let ctrl: AbortController | null = null;
let observer: ResizeObserver | null = null;

export function closeCompare() {
  ctrl?.abort();
  ctrl = null;
  observer?.disconnect();
  observer = null;
  panel?.remove();
  panel = null;
  document.removeEventListener('keydown', onKey);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeCompare();
}

export function openCompare(searches: SavedSearch[]) {
  closeCompare();
  const entries: Entry[] = searches.map((s) => ({ s, state: 'wait' }));
  let align: Align = 'calendar';

  const root = el('section');
  root.id = 'comparePanel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Compare saved searches');
  panel = root;

  const head = el('header');
  const title = el('h2', '', `Compare ${entries.length} saved searches`);
  const progress = el('span', 'small');
  progress.setAttribute('aria-live', 'polite');
  const close = el('button', '', 'Close');
  close.type = 'button';
  close.addEventListener('click', closeCompare);
  head.append(title, progress, close);

  const body = el('div', 'cmp-body');
  const note = el('p', 'cmp-note');
  note.hidden = true;
  const tableWrap = el('div', 'cmp-table');
  const tlHead = el('div', 'row cmp-tlhead');
  const tlTitle = el('h2', '', 'Timeline');
  const alignBox = el('div', 'cmp-align');
  alignBox.setAttribute('role', 'radiogroup');
  alignBox.setAttribute('aria-label', 'Time axis');
  const alignBtns: Record<Align, HTMLButtonElement> = {
    calendar: el('button', 'active', 'Calendar date'),
    start: el('button', '', 'Days from start'),
  };
  alignBtns.calendar.title = 'One shared time axis (UTC).';
  alignBtns.start.title = 'Each search starts at day 0. Use this to compare dates, for example a launch slip.';
  for (const k of ['calendar', 'start'] as Align[]) {
    const b = alignBtns[k];
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(k === align));
    b.addEventListener('click', () => {
      align = k;
      for (const j of ['calendar', 'start'] as Align[]) {
        alignBtns[j].classList.toggle('active', j === k);
        alignBtns[j].setAttribute('aria-checked', String(j === k));
      }
      drawTimeline();
    });
    alignBox.append(b);
  }
  tlHead.append(tlTitle, alignBox);
  const tlWrap = el('div', 'cmp-tl');
  const canvas = el('canvas');
  const tip = el('div', 'cmp-tip');
  tip.hidden = true;
  tlWrap.append(canvas, tip);
  const legend = el('div', 'legend small');
  legend.innerHTML =
    '<span><span class="swatch sun"></span>Sun visible (part of the disk above the horizon)</span>' +
    '<span><span class="swatch earth"></span>Earth visible (centre above the horizon)</span>' +
    '<span><span class="swatch both"></span>Sun and Earth</span>';
  body.append(note, tableWrap, tlHead, tlWrap, legend);
  root.append(head, body);
  document.body.append(root);
  document.addEventListener('keydown', onKey);
  close.focus();

  // ---------- Loading, one request at a time ----------
  const c = new AbortController();
  ctrl = c;
  const loadAll = async () => {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const key = searchKey(e.s);
      const hit = cache.get(key);
      if (hit) {
        setData(e, hit);
        continue;
      }
      e.state = 'load';
      progress.textContent = `Loading search ${i + 1} of ${entries.length}…`;
      renderTable();
      try {
        const d = await fetchSeries(
          {
            latDeg: e.s.latDeg,
            lonDeg: e.s.lonDeg,
            observerHeightM: e.s.observerHeightM,
            startMs: Date.parse(e.s.startUtc),
            stopMs: Date.parse(e.s.stopUtc),
            stepMinutes: e.s.stepMinutes,
            terrain: e.s.terrain,
          },
          c.signal,
        );
        if (c.signal.aborted) return;
        cache.set(key, d);
        setData(e, d);
      } catch (err) {
        if ((err as Error).name === 'AbortError' || c.signal.aborted) return;
        console.error(err);
        e.state = 'error';
        e.error =
          err instanceof ApiError && err.unreachable ? 'The API is not available.' : `Cannot load: ${(err as Error).message}`;
      }
      renderTable();
      drawTimeline();
    }
    const bad = entries.filter((e) => e.state === 'error').length;
    progress.textContent = bad ? `${bad} of ${entries.length} searches failed.` : '';
    progress.classList.toggle('bad', bad > 0);
    renderTable();
    drawTimeline();
  };

  function setData(e: Entry, d: SeriesOut) {
    e.state = 'ok';
    e.data = d;
    e.times = d.times_utc.map((t) => Date.parse(t));
  }

  // ---------- Table ----------
  type Cell = { text: string; sub?: string; value?: number; tag?: { text: string; cls: string; title?: string } };
  type Row = { label: string; title?: string; cell: (e: Entry) => Cell; numeric?: boolean };

  /** Time from the start to the first sunset/earthset. -Infinity: the body is down at the start. */
  function toNextSet(e: Entry, body: 'sun' | 'earth'): Cell {
    const d = e.data!;
    const t0 = e.times![0];
    const upAtStart = body === 'sun' ? d.series.sun_visible_fraction[0] > 0 : d.series.earth_visible[0];
    const label = body === 'sun' ? 'Sun' : 'Earth';
    if (!upAtStart) return { text: `${label} is down at the start.`, value: -Infinity };
    const type = body === 'sun' ? 'sunset' : 'earthset';
    const ev = d.events.find((x) => x.type === type);
    let ms = ev ? Date.parse(ev.utc) : NaN;
    if (!ev && d.next_events) {
      const after = d.next_events[type];
      if (after === null) return { text: 'None in 400 days after the period.', value: Infinity };
      ms = Date.parse(after);
    }
    if (!Number.isFinite(ms)) return { text: 'None in the period.', value: Infinity };
    return { text: `${fmtH((ms - t0) / HOUR_MS)} after the start`, sub: `${fmtUtc(ms)} UTC`, value: ms - t0 };
  }

  const rows: Row[] = [
    { label: 'Site', cell: (e) => ({ text: e.s.siteName, sub: e.s.radiusM ? `Site radius ${e.s.radiusM} m` : 'Custom point' }) },
    { label: 'Point', cell: (e) => ({ text: `${fmtLat(e.s.latDeg)}, ${fmtLon(e.s.lonDeg)}` }) },
    { label: 'Observer height', cell: (e) => ({ text: `${e.s.observerHeightM} m` }) },
    {
      label: 'Period (UTC)',
      cell: (e) => {
        const a = Date.parse(e.s.startUtc);
        const b = Date.parse(e.s.stopUtc);
        return { text: `${fmtUtc(a)} to ${fmtUtc(b)}`, sub: `${fmtH((b - a) / HOUR_MS)}, step ${e.s.stepMinutes} min` };
      },
    },
    {
      label: 'Terrain status',
      cell: (e) => {
        const h = e.data!.horizon;
        const status = h?.terrain_status;
        const info = horizonOf(e.data!, null);
        // A polar point without terrain: the flat horizon can be very wrong.
        if (status && status !== 'ok' && status !== 'not_requested' && e.s.latDeg <= -60) {
          return {
            text: status,
            tag: {
              text: 'Flat horizon: terrain not available. Results can be wrong.',
              cls: 'warn',
              title: info.title ?? 'This server has no terrain data for this point. The results use a flat horizon (0°).',
            },
          };
        }
        return { text: status ?? 'unknown (older API)', tag: { text: info.label, cls: info.kind, title: info.title } };
      },
    },
    { label: 'Sun, % of time', numeric: true, cell: (e) => pct(e.data!.summary.sun_fraction_of_time) },
    { label: 'Mean visible Sun disk', title: 'Time-weighted mean of the visible part of the Sun disk', numeric: true, cell: (e) => pct(e.data!.summary.mean_sun_visible_fraction) },
    { label: 'Earth, % of time', numeric: true, cell: (e) => pct(e.data!.summary.earth_fraction_of_time) },
    { label: 'Sun and Earth, % of time', numeric: true, cell: (e) => pct(e.data!.summary.both_fraction_of_time) },
    { label: 'Longest Sun period', numeric: true, cell: (e) => hours(e.data!.summary.longest_sun_period_h) },
    { label: 'Longest Earth period', numeric: true, cell: (e) => hours(e.data!.summary.longest_earth_period_h) },
    { label: 'Longest Sun and Earth period', numeric: true, cell: (e) => hours(e.data!.summary.longest_both_period_h) },
    { label: 'Next sunset', title: 'First sunset after the start of the period. Later is better.', numeric: true, cell: (e) => toNextSet(e, 'sun') },
    { label: 'Next Earthset', title: 'First Earthset after the start of the period. Later is better.', numeric: true, cell: (e) => toNextSet(e, 'earth') },
  ];
  const INPUT_ROWS = 4; // site, point, height, period: no API data needed

  function pct(f: number): Cell {
    return { text: fmtPct(f), value: f };
  }
  function hours(h: number): Cell {
    return { text: fmtH(h), value: h };
  }

  function renderTable() {
    const t = el('table', 'mono');
    const thead = el('thead');
    const hr = el('tr');
    hr.append(el('th', '', ''));
    for (const e of entries) {
      const th = el('th', '', e.s.name);
      th.title = e.s.name;
      hr.append(th);
    }
    thead.append(hr);
    const tb = el('tbody');
    rows.forEach((r, ri) => {
      const tr = el('tr');
      const th = el('th', '', r.label);
      th.scope = 'row';
      if (r.title) th.title = r.title;
      tr.append(th);
      const cells = entries.map((e) => (ri < INPUT_ROWS || e.state === 'ok' ? r.cell(e) : null));
      // Best value: the highest. Mark it only if the values are not all the same.
      let best = NaN;
      if (r.numeric) {
        const vals = cells.map((c) => c?.value).filter((v): v is number => v !== undefined && !Number.isNaN(v));
        const max = Math.max(...vals);
        const min = Math.min(...vals);
        if (vals.length >= 2 && max - min > 1e-9 && max > -Infinity) best = max;
      }
      entries.forEach((e, i) => {
        const c = cells[i];
        const td = el('td');
        if (!c) {
          td.textContent = e.state === 'error' ? '' : e.state === 'load' ? 'Loading…' : 'Waiting…';
          if (e.state === 'error' && ri === INPUT_ROWS) {
            const p = el('span', 'cmp-err', e.error ?? 'Error');
            td.append(p);
          }
          td.className = 'muted';
        } else {
          td.append(el('div', '', c.text));
          if (c.sub) td.append(el('div', 'small', c.sub));
          if (c.tag) {
            const tg = el('span', `tag ${c.tag.cls}`, c.tag.text);
            if (c.tag.title) tg.title = c.tag.title;
            td.append(tg);
          }
          if (c.value !== undefined && c.value === best) {
            td.classList.add('best');
            td.title = 'Best value in this row';
          }
        }
        tr.append(td);
      });
      tb.append(tr);
    });
    t.append(thead, tb);
    tableWrap.replaceChildren(t);
    const mark = el('p', 'small');
    mark.innerHTML = '<span class="best-key">★</span> Best value in the row (the highest, or the latest sunset or Earthset).';
    tableWrap.append(mark);
    updateNote();
  }

  function updateNote() {
    const spans = new Set(entries.map((e) => Date.parse(e.s.stopUtc) - Date.parse(e.s.startUtc)));
    const steps = new Set(entries.map((e) => e.s.stepMinutes));
    const msgs: string[] = [];
    if (spans.size > 1 || steps.size > 1)
      msgs.push(
        `The searches have different ${spans.size > 1 ? 'period lengths' : ''}${spans.size > 1 && steps.size > 1 ? ' and ' : ''}${steps.size > 1 ? 'steps' : ''}. The percentages cover different periods.`,
      );
    note.textContent = msgs.join(' ');
    note.hidden = !msgs.length;
  }

  // ---------- Timeline strips ----------
  const LABEL_W = 150;
  const PAD_R = 16;
  const NAME_H = 18;
  const BAR_H = 11;
  const BAR_GAP = 3;
  const GROUP_GAP = 10;
  const AXIS_H = 24;
  const groupH = NAME_H + 3 * (BAR_H + BAR_GAP) + GROUP_GAP;
  const COLORS = { sun: '#ffd54a', earth: '#4aa3ff', both: '#7ee08f' };
  const BAR_NAMES = ['Sun', 'Earth', 'Sun and Earth'];

  /** The x scale, in "axis ms": calendar ms, or ms from the start. */
  function axisRange(): [number, number] | null {
    const all = entries.map((e) => [Date.parse(e.s.startUtc), Date.parse(e.s.stopUtc)]);
    if (!all.length) return null;
    if (align === 'calendar') return [Math.min(...all.map((a) => a[0])), Math.max(...all.map((a) => a[1]))];
    return [0, Math.max(...all.map((a) => a[1] - a[0]))];
  }
  const offsetOf = (e: Entry) => (align === 'calendar' ? 0 : Date.parse(e.s.startUtc));

  let hoverX: number | null = null;

  function drawTimeline() {
    const w = Math.max(300, tlWrap.clientWidth);
    const h = entries.length * groupH + AXIS_H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const range = axisRange();
    if (!range) return;
    const [a0, a1] = range;
    const span = Math.max(1, a1 - a0);
    const x0 = LABEL_W;
    const x1 = w - PAD_R;
    const xOf = (t: number) => x0 + ((t - a0) / span) * (x1 - x0);

    // Day grid.
    const ticks = axisTicks(a0, a1, x1 - x0);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    for (const t of ticks) {
      const x = Math.round(xOf(t.t)) + 0.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h - AXIS_H);
      g.stroke();
    }

    entries.forEach((e, i) => {
      const y = i * groupH;
      g.fillStyle = '#ddd';
      g.font = '12px system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.fillText(clip(g, e.s.name, w - 8), 4, y + NAME_H / 2);
      const off = offsetOf(e);
      const s0 = Date.parse(e.s.startUtc) - off;
      const s1 = Date.parse(e.s.stopUtc) - off;
      for (let b = 0; b < 3; b++) {
        const by = y + NAME_H + b * (BAR_H + BAR_GAP);
        g.fillStyle = '#9aa3ad';
        g.font = '11px system-ui, sans-serif';
        g.fillText(BAR_NAMES[b], 12, by + BAR_H / 2);
        // Period background.
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(xOf(s0), by, Math.max(1, xOf(s1) - xOf(s0)), BAR_H);
      }
      if (e.state !== 'ok') {
        g.fillStyle = e.state === 'error' ? '#ff9a9a' : '#888';
        g.font = '11px system-ui, sans-serif';
        g.fillText(
          e.state === 'error' ? 'No data. The request failed.' : e.state === 'load' ? 'Loading…' : 'Waiting…',
          xOf(s0) + 6,
          y + NAME_H + 1.5 * (BAR_H + BAR_GAP),
        );
        return;
      }
      const d = e.data!;
      const t = e.times!;
      const stepMs = e.s.stepMinutes * 60000;
      const states = [
        (k: number) => d.series.sun_visible_fraction[k] > 0,
        (k: number) => d.series.earth_visible[k],
        (k: number) => d.series.sun_visible_fraction[k] > 0 && d.series.earth_visible[k],
      ];
      const colors = [COLORS.sun, COLORS.earth, COLORS.both];
      for (let b = 0; b < 3; b++) {
        const by = y + NAME_H + b * (BAR_H + BAR_GAP);
        g.fillStyle = colors[b];
        let runStart = -1;
        for (let k = 0; k <= t.length; k++) {
          const on = k < t.length && states[b](k);
          if (on && runStart < 0) runStart = k;
          if (!on && runStart >= 0) {
            // Each sample covers half a step on each side, clipped to the period.
            const ta = Math.max(t[0], t[runStart] - stepMs / 2) - off;
            const tb = Math.min(t[t.length - 1], t[k - 1] + stepMs / 2) - off;
            const xa = xOf(ta);
            g.fillRect(xa, by, Math.max(1, xOf(tb) - xa), BAR_H);
            runStart = -1;
          }
        }
      }
    });

    // Axis.
    const ay = h - AXIS_H;
    g.strokeStyle = '#555';
    g.beginPath();
    g.moveTo(x0, ay + 0.5);
    g.lineTo(x1, ay + 0.5);
    g.stroke();
    g.fillStyle = '#9aa3ad';
    g.font = '11px system-ui, sans-serif';
    g.textBaseline = 'top';
    g.textAlign = 'center';
    for (const tk of ticks) {
      const x = xOf(tk.t);
      g.fillRect(Math.round(x), ay, 1, 4);
      g.fillText(tk.label, x, ay + 6);
    }
    g.textAlign = 'left';
    g.fillText(align === 'calendar' ? 'UTC' : 'Days', 4, ay + 6);

    // Cursor.
    if (hoverX !== null && hoverX >= x0 && hoverX <= x1) {
      g.strokeStyle = '#fff';
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(Math.round(hoverX) + 0.5, 0);
      g.lineTo(Math.round(hoverX) + 0.5, ay);
      g.stroke();
      g.setLineDash([]);
    }
  }

  function clip(g: CanvasRenderingContext2D, text: string, maxW: number) {
    if (g.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && g.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s}…`;
  }

  function axisTicks(a0: number, a1: number, px: number): { t: number; label: string }[] {
    const spanD = (a1 - a0) / DAY_MS;
    const maxTicks = Math.max(2, Math.floor(px / 70));
    const steps = [0.25, 0.5, 1, 2, 5, 7, 10, 14, 30, 60, 90, 180, 365];
    const stepD = steps.find((s) => spanD / s <= maxTicks) ?? 730;
    const stepMs = stepD * DAY_MS;
    const out: { t: number; label: string }[] = [];
    if (align === 'calendar') {
      // Align ticks to UTC midnight (or to the hour for short steps).
      const first = Math.ceil(a0 / stepMs) * stepMs;
      for (let t = first; t <= a1 + 1; t += stepMs) {
        const iso = new Date(t).toISOString();
        out.push({ t, label: stepD < 1 ? iso.slice(5, 16).replace('T', ' ') : iso.slice(5, 10) });
      }
    } else {
      for (let t = 0; t <= a1 + 1; t += stepMs) out.push({ t, label: `${+(t / DAY_MS).toFixed(2)}` });
    }
    return out;
  }

  // ---------- Hover: cursor and tooltip ----------
  canvas.addEventListener('pointermove', (ev) => {
    const r = canvas.getBoundingClientRect();
    hoverX = ev.clientX - r.left;
    drawTimeline();
    updateTip(ev.clientX - r.left, ev.clientY - r.top, r.width);
  });
  canvas.addEventListener('pointerleave', () => {
    hoverX = null;
    tip.hidden = true;
    drawTimeline();
  });

  function updateTip(x: number, y: number, w: number) {
    const range = axisRange();
    const x0 = LABEL_W;
    const x1 = w - PAD_R;
    if (!range || x < x0 || x > x1) {
      tip.hidden = true;
      return;
    }
    const at = range[0] + ((x - x0) / (x1 - x0)) * (range[1] - range[0]);
    tip.replaceChildren();
    tip.append(
      el('div', 'tip-head', align === 'calendar' ? `${fmtUtc(at)} UTC` : `Day ${(at / DAY_MS).toFixed(2)} from the start`),
    );
    for (const e of entries) {
      const row = el('div', 'tip-row');
      row.append(el('div', 'tip-name', e.s.name));
      const ms = at + offsetOf(e);
      if (e.state !== 'ok') {
        row.append(el('div', 'small', e.state === 'error' ? 'No data.' : 'Loading…'));
      } else {
        const t = e.times!;
        if (ms < t[0] - 1 || ms > t[t.length - 1] + 1) {
          row.append(el('div', 'small', 'Outside the period.'));
        } else {
          const k = nearest(t, ms);
          const sf = e.data!.series.sun_visible_fraction[k];
          const ev = e.data!.series.earth_visible[k];
          const line = el('div');
          const sun = el('span', sf > 0 ? 'on sun' : 'off', sf > 0 ? `Sun ${fmtPct(sf)}` : 'No Sun');
          const earth = el('span', ev ? 'on earth' : 'off', ev ? 'Earth up' : 'No Earth');
          line.append(sun, ' · ', earth);
          row.append(line);
          if (align === 'start') row.append(el('div', 'small', `${fmtUtc(t[k])} UTC`));
        }
      }
      tip.append(row);
    }
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = x + 14;
    if (left + tw > w) left = Math.max(0, x - tw - 14);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, Math.min(y + 10, canvas.clientHeight - th))}px`;
  }

  function nearest(t: number[], ms: number) {
    let lo = 0;
    let hi = t.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= ms) lo = mid;
      else hi = mid;
    }
    return Math.abs(t[hi] - ms) < Math.abs(ms - t[lo]) ? hi : lo;
  }

  observer = new ResizeObserver(() => drawTimeline());
  observer.observe(tlWrap);

  renderTable();
  drawTimeline();
  void loadAll();
}
