// Selected point: latitude/longitude input with validation, and the site picker.
// CONTRACTS.md: planetocentric lat/lon in degrees, MOON_ME frame. Longitude east-positive,
// -180..+180. Input may also use 0..360; it is converted. Latitude must not be exactly ±90 (north is not defined at the pole).

import type { LatLon } from './ephemeris';
import type { Site } from './api';
import { setQuickmapLink } from './quickmap';
import { bestContext, loadBestPoints, onBestLoaded, type BestContext } from './bestpoints';

export type Validation = { ok: true; ll: LatLon } | { ok: false; error: string; field: 'lat' | 'lon' };

export function validateLatLon(latText: string, lonText: string): Validation {
  const lat = Number(latText.trim().replace(',', '.'));
  const lon = Number(lonText.trim().replace(',', '.'));
  if (latText.trim() === '' || !Number.isFinite(lat)) {
    return { ok: false, field: 'lat', error: 'Latitude: enter a number in degrees, for example -89.45.' };
  }
  if (Math.abs(lat) === 90) {
    return {
      ok: false,
      field: 'lat',
      error: `Latitude ${lat > 0 ? '+' : '-'}90° is not allowed. At the exact pole, north is not defined, so azimuth has no meaning. Use for example ${lat > 0 ? '89.99' : '-89.99'}.`,
    };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, field: 'lat', error: 'Latitude must be between -90° and +90° (not exactly ±90°).' };
  }
  if (lonText.trim() === '' || !Number.isFinite(lon)) {
    return { ok: false, field: 'lon', error: 'Longitude: enter a number in degrees, for example -137.31.' };
  }
  if (lon < -180 || lon > 360) {
    return { ok: false, field: 'lon', error: 'Longitude must be between -180° and +360° (east is positive).' };
  }
  // 0 to 360 convention: (180, 360] becomes -180 to +180.
  return { ok: true, ll: { latDeg: lat, lonDeg: lon > 180 ? lon - 360 : lon } };
}

const STATUS_ORDER: Site['status'][] = ['candidate', 'planned', 'past'];
const STATUS_LABEL: Record<string, string> = {
  candidate: 'Candidate regions',
  planned: 'Planned missions',
  past: 'Past landings',
};

export const STATUS_COLOR: Record<string, number> = {
  candidate: 0x6be38a,
  planned: 0xc58cff,
  past: 0xd0d0d0,
};

export interface PointUi {
  /** Show a point in the inputs and the picker. `site` = the site it came from, if any. */
  show(ll: LatLon, site: Site | null): void;
  setSites(sites: Site[]): void;
  setSitesError(msg: string): void;
}

/** Value of the site list option for the default point (it is not a site in the API list). */
const DEFAULT_VALUE = '__default';

/** Group label: "Artemis III candidate regions" when all sites in the group have one mission. */
function groupLabel(status: string, group: Site[]) {
  const label = STATUS_LABEL[status] ?? status;
  const missions = new Set(group.map((s) => s.mission));
  return status === 'candidate' && missions.size === 1 ? `${group[0].mission} candidate regions` : label;
}

export function setupPointUi(
  onSelect: (ll: LatLon, site: Site | null) => void,
  defaultPoint?: LatLon & { name: string },
): PointUi {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const form = $<HTMLFormElement>('pointForm');
  const latIn = $<HTMLInputElement>('latIn');
  const lonIn = $<HTMLInputElement>('lonIn');
  const err = $<HTMLParagraphElement>('pointErr');
  const siteSel = $<HTMLSelectElement>('siteSel');
  const siteInfo = $<HTMLDivElement>('siteInfo');
  let sites: Site[] = [];
  let shown: LatLon | null = null;
  let shownSite: Site | null = null;
  let bestOpen = true;

  const clearErr = () => {
    err.hidden = true;
    latIn.classList.remove('bad');
    lonIn.classList.remove('bad');
  };
  latIn.addEventListener('input', clearErr);
  lonIn.addEventListener('input', clearErr);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = validateLatLon(latIn.value, lonIn.value);
    if (!v.ok) {
      err.textContent = v.error;
      err.hidden = false;
      (v.field === 'lat' ? latIn : lonIn).classList.add('bad');
      return;
    }
    clearErr();
    onSelect(v.ll, null);
  });

  const isDefault = (ll: LatLon) =>
    !!defaultPoint && Math.abs(ll.latDeg - defaultPoint.latDeg) < 1e-6 && Math.abs(ll.lonDeg - defaultPoint.lonDeg) < 1e-6;

  siteSel.addEventListener('change', () => {
    if (defaultPoint && siteSel.value === DEFAULT_VALUE) {
      clearErr();
      onSelect({ latDeg: defaultPoint.latDeg, lonDeg: defaultPoint.lonDeg }, null);
      return;
    }
    const s = sites.find((x) => x.id === siteSel.value);
    if (s) {
      clearErr();
      onSelect({ latDeg: s.lat_deg, lonDeg: s.lon_deg }, s);
    }
  });

  /** "Best points in this site" list. A click selects the point as a custom point. */
  function bestList(ctx: BestContext): HTMLElement {
    const d = document.createElement('details');
    d.className = 'best-points';
    d.open = bestOpen;
    d.addEventListener('toggle', () => (bestOpen = d.open));
    const sum = document.createElement('summary');
    const wider = ctx.searchRadiusM > ctx.site.radius_m;
    sum.textContent = wider
      ? `Best points within ${Math.round(ctx.searchRadiusM / 1000)} km (NASA PGDA long-term average)`
      : 'Best points in this site (NASA PGDA long-term average)';
    const ol = document.createElement('ol');
    ctx.points.forEach((p, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'best-point' + (i === ctx.active ? ' active' : '');
      const slope = p.slope_deg === null ? 'slope not known' : `slope ${Math.round(p.slope_deg)}°`;
      b.textContent = `${i + 1}. Sun ${Math.round(p.sun_pct)} %, Earth ${Math.round(p.earth_pct)} %, ${slope}`;
      b.title = `${p.lat_deg.toFixed(4)}°, ${p.lon_deg.toFixed(4)}°. Click to select this point.`;
      if (i === ctx.active) b.setAttribute('aria-current', 'true');
      b.onclick = () => {
        clearErr();
        onSelect({ latDeg: p.lat_deg, lonDeg: p.lon_deg }, null);
      };
      li.append(b);
      ol.append(li);
    });
    const rule = document.createElement('p');
    rule.className = 'best-note';
    rule.textContent =
      'Rank: mean of average sunlight % and average Earth visibility %. Slope less than 15° (LOLA 20 m). Points at least 500 m apart.' +
      (wider ? ` The site is small. Thus, the search area is ${Math.round(ctx.searchRadiusM / 1000)} km around the site centre.` : '');
    const note = document.createElement('p');
    note.className = 'best-note';
    note.textContent =
      'Long-term averages over 18.6 years at ground level. Select a point to see the result for your period and height.';
    const src = document.createElement('a');
    src.href = 'https://pgda.gsfc.nasa.gov/products/69';
    src.target = '_blank';
    src.rel = 'noopener';
    src.textContent = 'Source: NASA PGDA, Mazarico et al. (2011)';
    d.append(sum, ol, rule, note, src);
    return d;
  }

  function showSiteInfo(ll: LatLon, site: Site | null) {
    siteInfo.innerHTML = '';
    const qm = document.createElement('a');
    qm.className = 'quickmap';
    setQuickmapLink(qm, ll.latDeg, ll.lonDeg, site?.radius_m ?? null);
    const qmP = document.createElement('p');
    qmP.append(qm);
    const ctx = bestContext(ll, site);
    if (!site) {
      if (ctx) {
        const p = document.createElement('p');
        p.textContent = `Best point ${ctx.active + 1} of ${ctx.site.name}.`;
        siteInfo.append(p, bestList(ctx));
      }
      siteInfo.append(qmP);
      return;
    }
    const p = document.createElement('p');
    p.textContent = `${site.mission} (${site.agency}), ${site.status}. Site radius ${site.radius_m} m.`;
    siteInfo.append(p);
    if (site.notes) {
      const d = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = 'Notes';
      const n = document.createElement('p');
      n.textContent = site.notes;
      d.append(sum, n);
      siteInfo.append(d);
    }
    if (site.source) {
      const a = document.createElement('a');
      a.href = site.source;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Coordinate source';
      siteInfo.append(a);
    }
    if (ctx) siteInfo.append(bestList(ctx));
    siteInfo.append(qmP);
  }

  onBestLoaded(() => {
    if (shown) showSiteInfo(shown, shownSite);
  });
  void loadBestPoints();

  return {
    show(ll, site) {
      shown = ll;
      shownSite = site;
      latIn.value = ll.latDeg.toFixed(4);
      lonIn.value = ll.lonDeg.toFixed(4);
      siteSel.value = site ? site.id : isDefault(ll) && siteSel.querySelector(`option[value="${DEFAULT_VALUE}"]`) ? DEFAULT_VALUE : '';
      showSiteInfo(ll, site);
    },
    setSites(list) {
      sites = list;
      const keep = siteSel.value;
      siteSel.innerHTML = '';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '— Custom point —';
      siteSel.append(none);
      if (defaultPoint) {
        const d = document.createElement('option');
        d.value = DEFAULT_VALUE;
        d.textContent = `${defaultPoint.name} (default, ${defaultPoint.latDeg.toFixed(2)}°, ${defaultPoint.lonDeg.toFixed(2)}°)`;
        siteSel.append(d);
      }
      const statuses = [...STATUS_ORDER, ...new Set(list.map((s) => s.status).filter((x) => !STATUS_ORDER.includes(x)))];
      for (const status of statuses) {
        const group = list.filter((s) => s.status === status);
        if (!group.length) continue;
        const og = document.createElement('optgroup');
        og.label = groupLabel(status, group);
        for (const s of group) {
          const o = document.createElement('option');
          o.value = s.id;
          o.textContent = `${s.name} (${s.lat_deg.toFixed(2)}°, ${s.lon_deg.toFixed(2)}°)`;
          og.append(o);
        }
        siteSel.append(og);
      }
      siteSel.value = keep || (shown && isDefault(shown) ? DEFAULT_VALUE : '');
    },
    setSitesError(msg) {
      siteSel.innerHTML = '';
      const o = document.createElement('option');
      o.value = '';
      o.textContent = msg;
      siteSel.append(o);
    },
  };
}
