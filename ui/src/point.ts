// Selected point: latitude/longitude input with validation, and the site picker.
// CONTRACTS.md: planetocentric lat/lon in degrees, MOON_ME frame. Longitude east-positive,
// -180..+180. Latitude must not be exactly ±90 (north is not defined at the pole).

import type { LatLon } from './ephemeris';
import type { Site } from './api';

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
  if (lon < -180 || lon > 180) {
    return { ok: false, field: 'lon', error: 'Longitude must be between -180° and +180° (east is positive).' };
  }
  return { ok: true, ll: { latDeg: lat, lonDeg: lon } };
}

const STATUS_ORDER: Site['status'][] = ['candidate', 'planned', 'past'];
const STATUS_LABEL: Record<string, string> = {
  candidate: 'Candidate sites',
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

export function setupPointUi(onSelect: (ll: LatLon, site: Site | null) => void): PointUi {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const form = $<HTMLFormElement>('pointForm');
  const latIn = $<HTMLInputElement>('latIn');
  const lonIn = $<HTMLInputElement>('lonIn');
  const err = $<HTMLParagraphElement>('pointErr');
  const siteSel = $<HTMLSelectElement>('siteSel');
  const siteInfo = $<HTMLDivElement>('siteInfo');
  let sites: Site[] = [];

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

  siteSel.addEventListener('change', () => {
    const s = sites.find((x) => x.id === siteSel.value);
    if (s) {
      clearErr();
      onSelect({ latDeg: s.lat_deg, lonDeg: s.lon_deg }, s);
    }
  });

  function showSiteInfo(site: Site | null) {
    siteInfo.innerHTML = '';
    if (!site) return;
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
  }

  return {
    show(ll, site) {
      latIn.value = ll.latDeg.toFixed(4);
      lonIn.value = ll.lonDeg.toFixed(4);
      siteSel.value = site ? site.id : '';
      showSiteInfo(site);
    },
    setSites(list) {
      sites = list;
      const keep = siteSel.value;
      siteSel.innerHTML = '';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '— Custom point —';
      siteSel.append(none);
      const statuses = [...STATUS_ORDER, ...new Set(list.map((s) => s.status).filter((x) => !STATUS_ORDER.includes(x)))];
      for (const status of statuses) {
        const group = list.filter((s) => s.status === status);
        if (!group.length) continue;
        const og = document.createElement('optgroup');
        og.label = STATUS_LABEL[status] ?? status;
        for (const s of group) {
          const o = document.createElement('option');
          o.value = s.id;
          o.textContent = `${s.name} (${s.lat_deg.toFixed(2)}°, ${s.lon_deg.toFixed(2)}°)`;
          og.append(o);
        }
        siteSel.append(og);
      }
      siteSel.value = keep;
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
