// Site-detail map panel in index.html. OpenLayers loads with a dynamic import(), so it is
// not in the first page load. The map follows every selected point. It is made, and its
// first tiles load, as soon as a point is selected, also when the panel is folded (the
// folded panel moves off screen but keeps its size, so OpenLayers still renders).
// The "Sun and Earth" tab shows two small maps side by side (average sunlight, average Earth
// visibility) with one synchronised view. They are made when the tab opens, and disposed
// when the panel folds or the point moves north of 75° S.

import type { DetailMap, MapSky } from './detail/detailmap';
import type { LatLon } from './ephemeris';
import type { Site } from './api';
import { setQuickmapLink } from './quickmap';
import { bestContext, onBestLoaded, type BestContext } from './bestpoints';

export interface MapPanel {
  setPoint(ll: LatLon, site: Site | null, name: string, recenter: boolean): void;
  setSky(s: MapSky | null): void;
  /** Height in px that the open panel covers at the bottom of the window (0 if folded). */
  coveredHeight(): number;
}

const FOLD_KEY = 'lunarnav.mapFolded';
/** Same width as the phone layout in style.css. */
const PHONE = '(max-width: 760px)';
/** The NASA PGDA average illumination tiles cover the area south of this latitude. */
const PGDA_LAT = -75;
const GROUP_HINT = 'To see both, open the Sun and Earth tab.';

export function setupMapPanel(onPick: (ll: LatLon) => void, onLayout: () => void): MapPanel {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const panel = $<HTMLElement>('mapPanel');
  const body = $<HTMLDivElement>('mapBody');
  const foldBtn = $<HTMLButtonElement>('mapFold');
  const fullBtn = $<HTMLButtonElement>('mapFull');
  const title = $<HTMLSpanElement>('mapTitle');
  const status = $<HTMLParagraphElement>('mapStatus');
  const qm = $<HTMLAnchorElement>('mapQuickmap');

  let dm: DetailMap | null = null;
  let loading: Promise<void> | null = null;
  let pending: { ll: LatLon; site: Site | null; recenter: boolean } | null = null;
  let sky: MapSky | null = null;

  // ---------- Sun and Earth tab: state ----------
  const tabMain = $<HTMLButtonElement>('mapTabMain');
  const tabPair = $<HTMLButtonElement>('mapTabPair');
  const pairBox = $<HTMLDivElement>('mapPair');
  const pairNote = $<HTMLParagraphElement>('mapPairNote');
  const pairGrid = $<HTMLDivElement>('mapPairGrid');
  let tab: 'main' | 'pair' = 'main';
  let pair: DetailMap[] = [];
  /** Increments at each dispose, so an old async creation stops. */
  let pairGen = 0;
  let pairLoading = false;
  /** True while one pair map copies its view to the other. */
  let syncing = false;
  const synced = new WeakSet<object>();
  function disposePair() {
    pairGen++;
    pairLoading = false;
    for (const m of pair) m.dispose();
    pair = [];
    pairGrid.innerHTML = '';
  }

  const setFolded = (f: boolean) => {
    panel.classList.toggle('folded', f);
    foldBtn.setAttribute('aria-expanded', String(!f));
    foldBtn.textContent = f ? '▸ Map' : '▾ Map';
    try {
      // The phone layout always starts folded. Keep the desktop setting.
      if (!matchMedia(PHONE).matches) localStorage.setItem(FOLD_KEY, f ? '1' : '0');
    } catch {
      /* storage not available */
    }
    dm?.updateSize();
    // A folded panel keeps its size: dispose the pair maps, so they load no tiles.
    if (f) disposePair();
    else if (tab === 'pair') showPair();
    onLayout();
  };
  let folded = matchMedia(PHONE).matches;
  try {
    if (!folded) folded = localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    /* storage not available */
  }
  setFolded(folded);
  foldBtn.addEventListener('click', () => {
    const open = panel.classList.contains('folded');
    setFolded(!open);
    // Phone layout: scroll anchoring can move the opened map up. Show it from its header.
    if (open && matchMedia(PHONE).matches) panel.scrollIntoView({ block: 'start' });
  });

  // Full screen: the browser Fullscreen API, or a window-sized panel if it is not available.
  const isFull = () => document.fullscreenElement === panel || panel.classList.contains('max');
  const syncFull = () => {
    fullBtn.textContent = isFull() ? 'Exit full screen' : 'Full screen';
    requestAnimationFrame(() => {
      dm?.updateSize();
      for (const m of pair) m.updateSize();
    });
  };
  fullBtn.addEventListener('click', () => {
    if (document.fullscreenElement === panel) {
      void document.exitFullscreen();
    } else if (panel.classList.contains('max')) {
      panel.classList.remove('max');
      syncFull();
    } else {
      if (panel.classList.contains('folded')) setFolded(false);
      const req = panel.requestFullscreen?.bind(panel);
      const fallback = () => {
        panel.classList.add('max');
        syncFull();
      };
      if (req) req().catch(fallback);
      else fallback();
    }
  });
  document.addEventListener('fullscreenchange', syncFull);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('max')) {
      panel.classList.remove('max');
      syncFull();
    }
  });

  let ctx: BestContext | null = null;
  const marks = () =>
    ctx ? ctx.points.map((p, i) => ({ latDeg: p.lat_deg, lonDeg: p.lon_deg, label: String(i + 1) })) : [];
  /** Give the current point, site circle, best points and sky to one map. */
  function feed(m: DetailMap, recenter: boolean) {
    if (!last) return;
    const { ll, site } = last;
    // A best point of a site: keep the site circle and the view.
    const inSite = ctx && ctx.active >= 0 ? ctx.site : null;
    m.setMarks(marks());
    m.setPoint(
      {
        latDeg: ll.latDeg,
        lonDeg: ll.lonDeg,
        // A small site: the circle shows the best-points search area (at least 5 km).
        radiusM: Math.max((site ?? inSite)?.radius_m ?? 0, ctx?.searchRadiusM ?? 0) || null,
        circleCentre: inSite ? { latDeg: inSite.lat_deg, lonDeg: inSite.lon_deg } : null,
      },
      { recenter: recenter && !inSite },
    );
    m.setSky(sky);
  }
  const apply = () => {
    if (!dm || !pending) return;
    const { recenter } = pending;
    pending = null;
    feed(dm, recenter);
  };
  let last: { ll: LatLon; site: Site | null } | null = null;
  onBestLoaded(() => {
    if (!last) return;
    ctx = bestContext(last.ll, last.site);
    dm?.setMarks(marks());
    for (const m of pair) m.setMarks(marks());
  });

  const load = () => {
    if (loading) return;
    status.textContent = 'Loading map…';
    loading = import('./detail/detailmap')
      // The tile cache manifest first (waits at most 2.5 s), so the first tiles use the cache.
      .then(async ({ DetailMap, loadTileCache }) => {
        await loadTileCache();
        status.hidden = true;
        dm = new DetailMap(body, { onPick, groupHint: GROUP_HINT });
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__detailMap = dm;
        apply();
      })
      .catch((e) => {
        console.error(e);
        status.textContent = 'The map cannot load.';
        loading = null;
      });
  };

  // ---------- Sun and Earth tab ----------
  const setTab = (t: 'main' | 'pair', focus = false) => {
    tab = t;
    for (const [b, on] of [[tabMain, t === 'main'], [tabPair, t === 'pair']] as const) {
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (focus) (t === 'main' ? tabMain : tabPair).focus();
    body.hidden = t !== 'main';
    pairBox.hidden = t !== 'pair';
    panel.classList.toggle('pair-tab', t === 'pair');
    foldBtn.setAttribute('aria-controls', t === 'main' ? 'mapBody' : 'mapPair');
    if (panel.classList.contains('folded')) setFolded(false);
    if (t === 'main') requestAnimationFrame(() => dm?.updateSize());
    else showPair();
  };
  tabMain.addEventListener('click', () => setTab('main'));
  tabPair.addEventListener('click', () => setTab('pair'));
  $<HTMLDivElement>('mapTabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const t = e.key === 'Home' ? 'main' : e.key === 'End' ? 'pair' : tab === 'main' ? 'pair' : 'main';
    setTab(t, true);
  });

  /** Pan and zoom in one pair map: the other map gets the same centre and resolution. */
  function syncViews() {
    for (const m of pair) {
      const v = m.map.getView();
      if (synced.has(v)) continue;
      synced.add(v);
      v.on(['change:center', 'change:resolution'], () => {
        if (syncing || !pair.includes(m)) return;
        syncing = true;
        for (const o of pair) {
          const ov = o.map.getView();
          if (o === m || ov.getProjection() !== v.getProjection()) continue;
          ov.setCenter(v.getCenter());
          ov.setResolution(v.getResolution());
        }
        syncing = false;
      });
    }
  }

  /** Give the point to the pair maps. recenter = false keeps their view. */
  function feedPair(recenter: boolean) {
    syncing = true;
    for (const m of pair) feed(m, recenter);
    syncing = false;
    syncViews();
  }

  /** Show the Sun and Earth tab: a note, or the two maps (made at the first call). */
  function showPair() {
    const note = (text: string) => {
      disposePair();
      pairNote.textContent = text;
      pairNote.hidden = false;
      pairGrid.hidden = true;
    };
    if (!last) return note('Select a point to show the maps.');
    if (last.ll.latDeg > PGDA_LAT) return note('No NASA PGDA data north of 75° S.');
    pairNote.hidden = true;
    pairGrid.hidden = false;
    if (pair.length || pairLoading || panel.classList.contains('folded')) return;
    pairLoading = true;
    const gen = pairGen;
    void import('./detail/detailmap')
      .then(async (m) => {
        await m.loadTileCache();
        if (gen !== pairGen) return;
        pairLoading = false;
        if (!m.tileCacheOn()) return note('The Sun and Earth maps need the tile cache.');
        pairGrid.innerHTML = '';
        pair = [m.ILLUM_SUN_LAYER, m.ILLUM_EARTH_LAYER].map((d) => {
          const cell = document.createElement('figure');
          cell.className = 'pair-cell';
          const cap = document.createElement('figcaption');
          const t = document.createElement('b');
          t.textContent = d.title.replace(/ \(.*$/, '');
          const lg = document.createElement('span');
          lg.className = 'pair-legend';
          for (const c of d.legend ?? []) {
            const item = document.createElement('span');
            const chip = document.createElement('i');
            chip.style.background = c.colour;
            item.append(chip, c.label);
            lg.append(item);
          }
          cap.append(t, lg);
          const host = document.createElement('div');
          host.className = 'pair-map';
          cell.append(cap, host);
          pairGrid.append(cell);
          return new m.DetailMap(host, { compact: true, overlays: [d.id], onPick });
        });
        const credit = document.createElement('p');
        credit.className = 'pair-credit small';
        credit.textContent =
          'Percent of time that a part of the Sun or the Earth is visible, averaged over 18.6 years. ' +
          'Data: NASA PGDA, Mazarico et al. 2011. Imagery: NASA Moon Trek.';
        pairGrid.append(credit);
        feedPair(true);
        // Start at the same view as the site map. Phone layout: the site map can be made
        // while it is folded, so its view is not a good start. Keep the fit to the site.
        const mv = matchMedia(PHONE).matches ? undefined : dm?.map.getView();
        const pv = pair[0].map.getView();
        if (mv?.getCenter() && mv.getProjection() === pv.getProjection()) {
          pv.setCenter(mv.getCenter());
          pv.setResolution(mv.getResolution());
        }
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pairMaps = pair;
      })
      .catch((e) => {
        console.error(e);
        if (gen === pairGen) note('The maps cannot load.');
      });
  }

  return {
    setPoint(ll, site, name, recenter) {
      title.textContent = name;
      setQuickmapLink(qm, ll.latDeg, ll.lonDeg, site?.radius_m ?? null);
      qm.hidden = false;
      pending = { ll, site, recenter };
      last = { ll, site };
      ctx = bestContext(ll, site);
      if (dm) apply();
      else load();
      if (pair.length && ll.latDeg <= PGDA_LAT) feedPair(recenter);
      else if (pair.length || tab === 'pair') showPair();
    },
    setSky(s) {
      sky = s;
      dm?.setSky(s);
      for (const m of pair) m.setSky(s);
    },
    coveredHeight() {
      if (panel.classList.contains('folded') || isFull()) return 0;
      // Phone layout: the panel is in the page flow and covers nothing.
      if (getComputedStyle(panel).position !== 'fixed') return 0;
      const r = panel.getBoundingClientRect();
      return Math.max(0, window.innerHeight - r.top);
    },
  };
}
