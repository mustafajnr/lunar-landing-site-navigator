// "Check this result" panel: the data that made the current result (the /v1/series
// `provenance` block), the Sun and Earth values at the time slider, and links to an
// independent check with JPL Horizons. The links only open the Horizons API in a new
// tab. This code does not call Horizons.
//
// The values come from the nearest calculated step of the series, not from an
// interpolation. Thus they are the exact API values for the Horizons instant.

import type { SeriesOut, SeriesProvenance } from './api';
import type { LatLon } from './ephemeris';

const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
/** Reference sphere radius, CONTRACTS.md section 3. */
const SPHERE_KM = 1737.4;

/** Horizons link with the same settings as core/scripts/fetch_horizons.py (format=text). */
export function horizonsUrl(target: 'sun' | 'earth', p: LatLon, heightM: number, utc: string): string {
  const t = utc.replace(/Z$/, '').replace('T', ' ');
  const q = new URLSearchParams({
    format: 'text',
    COMMAND: target === 'sun' ? "'10'" : "'399'",
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${p.lonDeg},${p.latDeg},${Number((heightM / 1000).toFixed(6))}'`,
    TLIST: `'${t}'`,
    TIME_TYPE: "'UT'",
    QUANTITIES: "'4'",
    ANG_FORMAT: "'DEG'",
    EXTRA_PREC: "'YES'",
  });
  return `${HORIZONS_API}?${q.toString()}`;
}

const MASK_ORIGIN: Record<SeriesProvenance['mask_origin'], string> = {
  memory_cache: 'Memory cache of the server',
  disk_cache: 'Disk cache of the server (precomputed mask)',
  computed: 'Calculated from the DEMs for this result',
  provided: 'Given in the request',
  none: 'No mask. The horizon is flat (0°).',
};

const TERRAIN_STATUS: Record<string, string> = {
  ok: 'Terrain is in use.',
  no_coverage: 'The DEMs do not cover this point.',
  unavailable: 'The DEMs cover this point, but this server cannot read them.',
  not_requested: 'Terrain was not requested.',
};

const deg = (x: number, digits = 5) => `${x.toFixed(digits)}°`;
const fmtLat = (x: number) => `${Math.abs(x).toFixed(5)}° ${x < 0 ? 'S' : 'N'}`;
const fmtLon = (x: number) => `${Math.abs(x).toFixed(5)}° ${x < 0 ? 'W' : 'E'}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

export interface CheckInput {
  data: SeriesOut;
  /** The point of the request. */
  point: LatLon;
  /** The observer height of the request, metres above the terrain. */
  observerHeightM: number;
  /** The horizon tag text of the results panel. */
  horizonLabel: string;
}

export class CheckPanel {
  private readonly details: HTMLDetailsElement;
  private readonly prov: HTMLTableSectionElement;
  private readonly now: HTMLTableSectionElement;
  private readonly status: HTMLParagraphElement;
  private readonly sunLink: HTMLAnchorElement;
  private readonly earthLink: HTMLAnchorElement;
  private input: CheckInput | null = null;
  private times: number[] = [];
  private shownIndex = -2;

  constructor(host: HTMLElement) {
    this.prov = el('tbody');
    this.now = el('tbody');
    this.status = el('p', { className: 'small' });
    const link = (text: string) =>
      el('a', { target: '_blank', rel: 'noopener', textContent: text, className: 'check-link' });
    this.sunLink = link('Check the Sun in JPL Horizons');
    this.earthLink = link('Check the Earth in JPL Horizons');
    this.details = el(
      'details',
      { id: 'checkResult' },
      el('summary', {}, el('h2', { textContent: 'Check this result' })),
      el('p', { className: 'small', textContent: 'This part shows the data that made the result. Use the links to check the Sun and Earth positions with JPL Horizons. JPL Horizons is independent of this tool.' }),
      el('h3', { textContent: 'Data and settings' }),
      el('table', { className: 'mono check-table' }, this.prov),
      el('h3', { textContent: 'Values at the time slider' }),
      this.status,
      el('table', { className: 'mono check-table' }, this.now),
      el('div', { className: 'check-links' }, this.sunLink, this.earthLink),
      el(
        'div',
        { className: 'help' },
        el('p', { textContent: 'Horizons does not know the terrain. Compare only the azimuth and the elevation. Do not compare the visibility.' }),
        el('p', { textContent: 'In the Horizons text, find the line between $$SOE and $$EOE. The last two numbers are the azimuth and the elevation, in degrees.' }),
        el('p', { textContent: 'The difference must be less than 0.001°.' }),
      ),
    );
    host.append(el('section', { id: 'checkSection' }, this.details));
    this.set(null);
  }

  /** Set the loaded result, or null if there is no result. */
  set(input: CheckInput | null) {
    this.input = input;
    this.times = input ? input.data.times_utc.map((t) => Date.parse(t)) : [];
    this.shownIndex = -2;
    this.renderProvenance();
    this.setLinks(null);
  }

  private renderProvenance() {
    const rows: [string, string][] = [];
    const inp = this.input;
    if (!inp) {
      this.prov.replaceChildren(row('Result', 'No result is loaded.'));
      return;
    }
    const p = inp.data.provenance;
    const h = inp.data.horizon;
    rows.push(['Horizon', inp.horizonLabel]);
    if (h?.terrain_status) rows.push(['Terrain status', TERRAIN_STATUS[h.terrain_status] ?? h.terrain_status]);
    if (!p) {
      rows.push(['Provenance', 'This API version does not send provenance data.']);
    } else {
      rows.push(
        ['Software', `lunarnav ${p.software.lunarnav}, API ${p.software.api}`],
        ['Ephemeris', p.ephemeris],
        ['Frame', p.frame],
        ['SPICE kernels', p.kernels.join('\n')],
        ['Mask origin', MASK_ORIGIN[p.mask_origin] ?? p.mask_origin],
        ['DEM', p.dem_source ?? 'None'],
        ['Step', `${p.step_minutes} min`],
        ['Event time accuracy', `${p.event_tol_s} s`],
        ['Result made at', `${p.generated_utc.replace('T', ' ')}`],
      );
    }
    this.prov.replaceChildren(...rows.map(([k, v]) => row(k, v)));
  }

  private setLinks(urls: { sun: string; earth: string } | null) {
    for (const [a, u] of [
      [this.sunLink, urls?.sun],
      [this.earthLink, urls?.earth],
    ] as const) {
      if (u) {
        a.href = u;
        a.removeAttribute('aria-disabled');
      } else {
        a.removeAttribute('href');
        a.setAttribute('aria-disabled', 'true');
      }
    }
  }

  /** Update the values for the time slider. Call every frame. Cheap if nothing changed. */
  tick(nowMs: number) {
    const inp = this.input;
    const t = this.times;
    let i = -1;
    if (inp && t.length && nowMs >= t[0] - 1 && nowMs <= t[t.length - 1] + 1) {
      // Nearest calculated step (binary search).
      let lo = 0;
      let hi = t.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (t[mid] <= nowMs) lo = mid;
        else hi = mid;
      }
      i = Math.abs(t[hi] - nowMs) < Math.abs(nowMs - t[lo]) ? hi : lo;
    }
    if (i === this.shownIndex) return;
    this.shownIndex = i;
    if (!inp || i < 0) {
      this.status.textContent = inp ? 'The time slider is outside the loaded window.' : '';
      this.now.replaceChildren();
      this.setLinks(null);
      return;
    }
    const d = inp.data;
    const s = d.series;
    const utc = d.times_utc[i];
    const surfaceM = d.horizon?.surface_height_m ?? 0;
    const heightM = surfaceM + inp.observerHeightM;
    this.status.textContent =
      `The values are for the nearest calculated step. The tool calculates a step each ${d.provenance?.step_minutes ?? '–'} min.`;
    this.now.replaceChildren(
      row('Time (UTC)', utc.replace('T', ' ')),
      row('Sun azimuth', deg(s.sun_az[i])),
      row('Sun elevation', deg(s.sun_el[i])),
      row('Earth azimuth', deg(s.earth_az[i])),
      row('Earth elevation', deg(s.earth_el[i])),
      row('Latitude', fmtLat(inp.point.latDeg)),
      row('Longitude', fmtLon(inp.point.lonDeg)),
      row(
        'Height above the 1737.4 km sphere',
        `${heightM.toFixed(2)} m`,
        `Surface height ${surfaceM.toFixed(2)} m + observer height ${inp.observerHeightM} m. The sphere radius is ${SPHERE_KM} km.`,
      ),
    );
    this.setLinks({
      sun: horizonsUrl('sun', inp.point, heightM, utc),
      earth: horizonsUrl('earth', inp.point, heightM, utc),
    });
  }
}

function row(k: string, v: string, title = '') {
  const tr = el('tr', {}, el('td', { textContent: k }), el('td', { textContent: v }));
  if (title) tr.title = title;
  return tr;
}
