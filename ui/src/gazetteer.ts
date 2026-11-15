// Place search: named lunar features from the IAU/USGS Gazetteer of Planetary Nomenclature.
// Data: public/gazetteer.json (data/scripts/make_gazetteer.py). It loads on the first focus of
// the search input. ARIA combobox pattern: input role=combobox, list role=listbox, items role=option.

import type { LatLon } from './ephemeris';
import type { Site } from './api';

export interface Feature {
  n: string; // name
  t: string; // feature type, for example "Crater"
  lat: number;
  lon: number; // -180..180, east positive
  d: number | null; // diameter, km
  a?: string; // English alias, for example "Sea of Tranquility"
}

type Row = [string, string, number, number, number | null, string?];

const MAX_MATCHES = 8;

/** Lower case, no accents, single spaces. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

let features: (Feature & { k: string; ka: string })[] | null = null;
let req: Promise<void> | null = null;

function load(): Promise<void> {
  req ??= fetch(`${import.meta.env.BASE_URL}gazetteer.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`gazetteer.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((j: { features: Row[] }) => {
      features = j.features
        .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && Number.isFinite(r[2]) && Number.isFinite(r[3]))
        .map((r) => ({
          n: r[0],
          t: String(r[1]),
          lat: r[2],
          lon: r[3],
          d: typeof r[4] === 'number' ? r[4] : null,
          a: typeof r[5] === 'string' ? r[5] : undefined,
          k: normalize(r[0]),
          ka: r[5] ? normalize(r[5]) : '',
        }));
    })
    .catch((e) => {
      req = null; // try again on the next focus
      throw e;
    });
  return req;
}

/** Up to 8 matches. Rank: exact, prefix of the name or alias, start of a word, then substring. */
export function search(text: string): Feature[] {
  const q = normalize(text);
  if (!features || !q) return [];
  const scored: { f: Feature; s: number }[] = [];
  for (const f of features) {
    let s: number;
    if (f.k === q || f.ka === q) s = 0;
    else if (f.k.startsWith(q) || f.ka.startsWith(q)) s = 1;
    else if (f.k.includes(' ' + q) || f.ka.includes(' ' + q)) s = 2;
    else if (f.k.includes(q) || f.ka.includes(q)) s = 3;
    else continue;
    // Main features before satellite craters ("Tycho" before "Tycho A").
    if (f.t === 'Satellite Feature') s += 0.5;
    scored.push({ f, s });
  }
  scored.sort((x, y) => x.s - y.s || x.f.n.length - y.f.n.length || x.f.n.localeCompare(y.f.n));
  return scored.slice(0, MAX_MATCHES).map((x) => x.f);
}

const fmtD = (d: number) => (d < 10 ? d.toFixed(1) : String(Math.round(d)));

/** "Mare Tranquillitatis (Sea of Tranquility)". */
export const featureName = (f: Feature) => (f.a ? `${f.n} (${f.a})` : f.n);

/** "Mare Tranquillitatis, Sea of Tranquility (Mare, 876 km)". */
const optionText = (f: Feature) =>
  `${f.a ? `${f.n}, ${f.a}` : f.n} (${f.t}${f.d ? `, ${fmtD(f.d)} km` : ''})`;

/** Feature diameter sentence for the site info, or '' when the diameter is not known. */
export const featureInfo = (f: Feature) =>
  f.d ? `Feature diameter ${fmtD(f.d)} km. The result is for the centre point.` : 'The result is for the centre point.';

let current: Feature | null = null;

/** The selected feature, when `ll` is still its centre point. */
export function featureAt(ll: LatLon): Feature | null {
  if (!current) return null;
  return Math.abs(ll.latDeg - current.lat) < 1e-6 && Math.abs(ll.lonDeg - current.lon) < 1e-6 ? current : null;
}

export function setupPlaceSearch(
  input: HTMLInputElement,
  list: HTMLUListElement,
  status: HTMLElement,
  getSites: () => Site[],
  onPick: (ll: LatLon, site: Site | null) => void,
) {
  let matches: Feature[] = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const setActive = (i: number) => {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', `placeOpt${i}`);
      list.children[i]?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const render = () => {
    matches = search(input.value);
    list.innerHTML = '';
    active = -1;
    input.removeAttribute('aria-activedescendant');
    if (!input.value.trim()) {
      status.textContent = '';
      close();
      return;
    }
    if (!features) {
      status.textContent = 'Loading names…';
      close();
      return;
    }
    matches.forEach((f, i) => {
      const li = document.createElement('li');
      li.id = `placeOpt${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.textContent = optionText(f);
      // mousedown, not click: the input must not lose focus first.
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(f);
      });
      list.append(li);
    });
    status.textContent = matches.length ? `${matches.length} matches.` : 'No match. Try a different name.';
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(!!matches.length));
  };

  const pick = (f: Feature) => {
    current = f;
    input.value = featureName(f);
    close();
    status.textContent = '';
    onPick({ latDeg: f.lat, lonDeg: f.lon }, null);
  };

  input.addEventListener('focus', () => {
    if (features) return;
    load()
      .then(render)
      .catch((e) => {
        console.warn(e);
        status.textContent = 'The list of names is not available.';
      });
  });
  input.addEventListener('input', render);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) render();
      if (!matches.length) return;
      const n = matches.length;
      setActive(e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && matches[active]) return pick(matches[active]);
      // An exact curated site name selects the curated site.
      const q = normalize(input.value);
      const site = q ? getSites().find((s) => normalize(s.name) === q) : undefined;
      if (site) {
        current = null;
        close();
        status.textContent = '';
        onPick({ latDeg: site.lat_deg, lonDeg: site.lon_deg }, site);
        return;
      }
      if (matches[0]) pick(matches[0]);
    } else if (e.key === 'Escape') {
      if (!list.hidden) {
        e.preventDefault();
        close();
      } else input.value = '';
    }
  });
}
