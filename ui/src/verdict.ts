// Verdict tab of the results panel: a short answer in plain words for the period.
// The rating rules are in RATING (one place). The "How we rate" note in index.html
// is filled from RATING_TEXT, so the note and the code always agree.
// The tabs (Verdict and Details) are also set up here.

import type { SeriesOut } from './api';
import type { HorizonInfo } from './results';
import { dh, renderMission, setupMission } from './mission';

export type Rating = 'good' | 'limited' | 'poor';

/** Rating rules. Fraction = part of the period with the body up. Gap = longest time without it. */
export const RATING = {
  goodFraction: 0.9,
  goodGapH: 24,
  limitedFraction: 0.5,
  limitedGapH: 7 * 24,
  /** NASA exclusion floors (Artemis HLS update, NASA LaRC 2024). Below the floor: Poor. */
  sunFloor: 0.05,
  earthFloor: 0.25,
} as const;

/** South of this latitude, the Talk to Earth block tells about the two weeks without Earth. */
const POLE_LAT = -80;
const POLE_EARTH = 'Near the south pole, Earth is below the horizon about 2 weeks of each month, even at the best sites.';

export const RATING_TEXT = [
  `Good: up for ${RATING.goodFraction * 100} % of the period or more, and the longest gap is shorter than 1 day.`,
  `Limited: not good, but up for ${RATING.limitedFraction * 100} % of the period or more, or it is up for some time and the longest gap is shorter than 7 days.`,
  'Poor: all other cases.',
  `Poor also when the Sun is up less than ${RATING.sunFloor * 100} % of the period, or Earth is up less than ${RATING.earthFloor * 100} % of the period. NASA excludes such areas (Artemis Human Landing System update, NASA LaRC 2024).`,
  POLE_EARTH,
  'A gap that touches the start or the end of the period can be longer than the tool sees. Such a gap does not count as a short gap.',
  'The headline uses the lowest rating of the three blocks.',
];

/**
 * Rating for one body. `gapH` undefined = an older API without gap data: then only the
 * fraction counts. A truncated gap is a lower limit, so it never counts as short.
 */
export function rate(fraction: number, gapH: number | undefined, truncated: boolean | undefined, floor = 0): Rating {
  if (fraction < floor) return 'poor';
  const gapKnown = gapH !== undefined && !truncated;
  const shortGap = (limit: number) => (gapH === undefined ? true : gapKnown && gapH < limit);
  if (fraction >= RATING.goodFraction && shortGap(RATING.goodGapH)) return 'good';
  if (fraction >= RATING.limitedFraction || (gapH !== undefined && gapKnown && gapH < RATING.limitedGapH && fraction > 0)) {
    return 'limited';
  }
  return 'poor';
}

const RANK: Record<Rating, number> = { good: 2, limited: 1, poor: 0 };
const WORD: Record<Rating, string> = { good: 'Good', limited: 'Limited', poor: 'Poor' };
/** A symbol for each rating, so that colour is not the only cue. */
const SYMBOL: Record<Rating, string> = { good: '✓', limited: '◐', poor: '✕' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const pct = (f: number) => {
  const p = f * 100;
  // Do not show "100 %" for 99.96 % or "0 %" for 0.04 %.
  if (p > 99.5 && p < 100) return '99.5 %';
  if (p > 0 && p < 0.5) return '0.5 %';
  return `${Math.round(p)} %`;
};
const pct1 = (f: number) => `${(f * 100).toFixed(1)} %`;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ').replace(/ 00:00$/, '');

export interface VerdictInput {
  /** Null: no data yet (loading, error or no point). */
  data: SeriesOut | null;
  horizon: HorizonInfo | null;
  /** Text to show when there is no data: "Loading…", an error, or "Select a point". */
  status: string;
  error: boolean;
  siteName: string;
  startMs: number;
  stopMs: number;
  /** Latitude of the point, degrees. Null: no point. */
  latDeg: number | null;
}

interface Block {
  rating: Rating;
  plain: string;
  planner: string;
}

function gapPart(h: number, cut: boolean | undefined) {
  return `${cut ? 'at least ' : ''}${dh(h)}`;
}

function blocks(d: SeriesOut, latDeg: number | null) {
  const s = d.summary;
  const ns = s.longest_no_sun_period_h;
  const ne = s.longest_no_earth_period_h;
  const nb = s.longest_no_both_period_h;
  const noGaps = ns === undefined;
  const sun: Block = {
    rating: rate(s.sun_fraction_of_time, ns, s.longest_no_sun_period_truncated, RATING.sunFloor),
    plain:
      noGaps
        ? `The Sun is up ${pct(s.sun_fraction_of_time)} of the time.`
        : ns === 0
          ? 'Sunlight all the time.'
          : s.sun_fraction_of_time === 0
            ? `No sunlight in this period. The battery must last ${gapPart(ns, s.longest_no_sun_period_truncated)}.`
            : `The Sun is up ${pct(s.sun_fraction_of_time)} of the time. The battery must last ${gapPart(ns, s.longest_no_sun_period_truncated)}.`,
    planner:
      `Average illumination ${pct1(s.sun_fraction_of_time)} | mean disk visible ${pct1(s.mean_sun_visible_fraction)}` +
      (noGaps ? '' : ` | longest continuous darkness ${gapPart(ns, s.longest_no_sun_period_truncated)}`),
  };
  const earth: Block = {
    rating: rate(s.earth_fraction_of_time, ne, s.longest_no_earth_period_truncated, RATING.earthFloor),
    plain:
      ne === undefined
        ? `Earth is up ${pct(s.earth_fraction_of_time)} of the time.`
        : ne === 0
          ? 'Direct link to Earth all the time.'
          : (() => {
              const g = gapPart(ne, s.longest_no_earth_period_truncated);
              const first = s.earth_fraction_of_time === 0 ? 'Earth is not up in this period.' : `Earth is up ${pct(s.earth_fraction_of_time)} of the time.`;
              return `${first} No direct link for ${g}. Use a relay satellite or plan for ${g} without contact.`;
            })(),
    planner:
      `Earth visibility ${pct1(s.earth_fraction_of_time)}` +
      (ne === undefined ? '' : ` | longest outage ${gapPart(ne, s.longest_no_earth_period_truncated)}`) +
      ` | longest link ${dh(s.longest_earth_period_h)}`,
  };
  const both: Block = {
    rating: rate(s.both_fraction_of_time, nb, s.longest_no_both_period_truncated),
    plain:
      nb === undefined
        ? `The Sun and Earth are up together ${pct(s.both_fraction_of_time)} of the time.`
        : nb === 0
          ? 'Sunlight and a link to Earth together all the time.'
          : s.both_fraction_of_time === 0
            ? 'The Sun and Earth are never up together in this period.'
            : `The Sun and Earth are up together ${pct(s.both_fraction_of_time)} of the time. The longest time without both is ${gapPart(nb, s.longest_no_both_period_truncated)}.`,
    planner:
      `Both up ${pct1(s.both_fraction_of_time)}` +
      (nb === undefined ? '' : ` | longest without both ${gapPart(nb, s.longest_no_both_period_truncated)}`) +
      ` | longest with both ${dh(s.longest_both_period_h)}`,
  };
  if (latDeg !== null && latDeg < POLE_LAT && s.earth_fraction_of_time < 0.9995) earth.plain += ` ${POLE_EARTH}`;
  return { sun, earth, both };
}

function headline(d: SeriesOut, b: ReturnType<typeof blocks>): { rating: Rating; text: string } {
  const s = d.summary;
  const worst = [b.sun, b.earth, b.both].reduce((a, x) => (RANK[x.rating] < RANK[a.rating] ? x : a)).rating;
  if (worst === 'good') {
    const all = s.both_fraction_of_time >= 0.9995;
    return { rating: worst, text: `Good site for this period: sunlight and a direct link to Earth ${all ? 'all the time' : 'most of the time'}.` };
  }
  const sunGap = s.longest_no_sun_period_h;
  const earthGap = s.longest_no_earth_period_h;
  const sunBad = b.sun.rating === 'poor';
  const earthBad = b.earth.rating === 'poor';
  if (worst === 'poor' && (sunBad || earthBad)) {
    const parts: string[] = [];
    const advice: string[] = [];
    if (sunBad) {
      parts.push(sunGap !== undefined ? `no sunlight for ${gapPart(sunGap, s.longest_no_sun_period_truncated)}` : `sunlight only ${pct(s.sun_fraction_of_time)} of the time`);
      advice.push('The lander needs a large battery or another power source.');
    }
    if (earthBad) {
      parts.push(
        earthGap !== undefined
          ? `no direct link to Earth for ${gapPart(earthGap, s.longest_no_earth_period_truncated)}`
          : `a direct link to Earth only ${pct(s.earth_fraction_of_time)} of the time`,
      );
      advice.push('The lander needs a relay satellite.');
    }
    return { rating: worst, text: `Difficult: ${parts.join(' and ')}. ${advice.join(' ')}` };
  }
  if (worst === 'poor') {
    return { rating: worst, text: 'Difficult: the Sun and Earth are seldom up together. Plan for long times without power or contact.' };
  }
  const lim: string[] = [];
  if (b.sun.rating !== 'good') lim.push(`sunlight ${pct(s.sun_fraction_of_time)} of the time`);
  if (b.earth.rating !== 'good') lim.push(`a direct link to Earth ${pct(s.earth_fraction_of_time)} of the time`);
  if (!lim.length) lim.push(`the Sun and Earth up together ${pct(s.both_fraction_of_time)} of the time`);
  return { rating: worst, text: `Possible with limits: ${lim.join(' and ')}. Plan for the gaps below.` };
}

function setBlock(id: string, b: Block | null, loadingText: string) {
  const root = $(id);
  const r = root.querySelector<HTMLElement>('.v-rate')!;
  const plain = root.querySelector<HTMLElement>('.v-plain')!;
  const planner = root.querySelector<HTMLElement>('.v-planner')!;
  root.dataset.rating = b ? b.rating : '';
  r.textContent = b ? `${SYMBOL[b.rating]} ${WORD[b.rating]}` : '';
  plain.textContent = b ? b.plain : loadingText;
  planner.textContent = b ? b.planner : '';
}

/** Fill the Verdict tab. */
export function renderVerdict(v: VerdictInput) {
  const where = $('vWhere');
  const head = $('vHead');
  const caveat = $('vCaveat');
  const d = v.data;
  const period = v.stopMs > v.startMs ? `${utcDay(v.startMs)} to ${utcDay(v.stopMs)} UTC` : '';
  const name = v.siteName.trim();
  where.textContent = name || period ? [name, period].filter(Boolean).join(', ') : 'No point selected.';
  if (!d) {
    head.textContent = v.status;
    head.dataset.rating = '';
    head.classList.toggle('error', v.error);
    for (const id of ['vSun', 'vEarth', 'vBoth']) setBlock(id, null, v.error ? '' : v.status ? '…' : '–');
    caveat.textContent = '';
    renderMission(null);
    return;
  }
  head.classList.remove('error');
  const b = blocks(d, v.latDeg);
  const h = headline(d, b);
  head.textContent = `${SYMBOL[h.rating]} ${h.text}`;
  head.dataset.rating = h.rating;
  setBlock('vSun', b.sun, '');
  setBlock('vEarth', b.earth, '');
  setBlock('vBoth', b.both, '');
  renderMission(d.summary);
  const k = v.horizon?.kind;
  const base = 'Earth up uses Earth\'s centre only. The result is for one point, not the whole site area.';
  if (k === 'terrain') caveat.textContent = `${base} Based on NASA SPICE ephemeris and LOLA terrain.`;
  else if (k === 'provided') caveat.textContent = `${base} Based on NASA SPICE ephemeris and a provided horizon mask.`;
  else if (k === 'warn') caveat.textContent = `${base} Based on NASA SPICE ephemeris. ${v.horizon!.label}`;
  else caveat.textContent = `${base} Based on NASA SPICE ephemeris. Flat horizon: no terrain data here.`;
}

/** Fill the "How we rate" note from RATING_TEXT. */
export function fillRatingNote() {
  setupMission();
  const ul = $('vRules');
  ul.replaceChildren(
    ...RATING_TEXT.map((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      return li;
    }),
  );
}

const TAB_KEY = 'lsn.resultsTab';

/** Set up the Verdict and Details tabs. `onShow` runs after each tab change. */
export function setupResultTabs(onShow: (tab: 'verdict' | 'details') => void) {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('#resTabs [role="tab"]')];
  const show = (tab: HTMLButtonElement, focus: boolean, store: boolean) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')!).hidden = !on;
    }
    if (focus) tab.focus();
    const name = tab.dataset.tab as 'verdict' | 'details';
    if (store) {
      try {
        localStorage.setItem(TAB_KEY, name);
      } catch {
        /* The browser does not keep data. */
      }
    }
    onShow(name);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t, false, true));
    t.addEventListener('keydown', (e) => {
      let j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      show(tabs[j], true, true);
    });
  });
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch {
    saved = null;
  }
  show(tabs.find((t) => t.dataset.tab === saved) ?? tabs[0], false, false);
}
