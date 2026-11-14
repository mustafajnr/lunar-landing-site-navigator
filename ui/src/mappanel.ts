// Site-detail map panel in index.html. OpenLayers loads with a dynamic import(), so it is
// not in the first page load. The map follows every selected point. It is made, and its
// first tiles load, as soon as a point is selected, also when the panel is folded (the
// folded panel moves off screen but keeps its size, so OpenLayers still renders).

import type { DetailMap, MapSky } from './detail/detailmap';
import type { LatLon } from './ephemeris';
import type { Site } from './api';

export interface MapPanel {
  setPoint(ll: LatLon, site: Site | null, name: string, recenter: boolean): void;
  setSky(s: MapSky | null): void;
  /** Height in px that the open panel covers at the bottom of the window (0 if folded). */
  coveredHeight(): number;
}

const FOLD_KEY = 'lunarnav.mapFolded';

export function setupMapPanel(onPick: (ll: LatLon) => void, onLayout: () => void): MapPanel {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const panel = $<HTMLElement>('mapPanel');
  const body = $<HTMLDivElement>('mapBody');
  const foldBtn = $<HTMLButtonElement>('mapFold');
  const fullBtn = $<HTMLButtonElement>('mapFull');
  const title = $<HTMLSpanElement>('mapTitle');
  const status = $<HTMLParagraphElement>('mapStatus');

  let dm: DetailMap | null = null;
  let loading: Promise<void> | null = null;
  let pending: { ll: LatLon; site: Site | null; recenter: boolean } | null = null;
  let sky: MapSky | null = null;

  const setFolded = (f: boolean) => {
    panel.classList.toggle('folded', f);
    foldBtn.setAttribute('aria-expanded', String(!f));
    foldBtn.textContent = f ? '▸ Site map' : '▾ Site map';
    try {
      localStorage.setItem(FOLD_KEY, f ? '1' : '0');
    } catch {
      /* storage not available */
    }
    dm?.updateSize();
    onLayout();
  };
  let folded = false;
  try {
    folded = localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    /* storage not available */
  }
  setFolded(folded);
  foldBtn.addEventListener('click', () => setFolded(!panel.classList.contains('folded')));

  // Full screen: the browser Fullscreen API, or a window-sized panel if it is not available.
  const isFull = () => document.fullscreenElement === panel || panel.classList.contains('max');
  const syncFull = () => {
    fullBtn.textContent = isFull() ? 'Exit full screen' : 'Full screen';
    requestAnimationFrame(() => dm?.updateSize());
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

  const apply = () => {
    if (!dm || !pending) return;
    const { ll, site, recenter } = pending;
    pending = null;
    dm.setPoint({ latDeg: ll.latDeg, lonDeg: ll.lonDeg, radiusM: site?.radius_m ?? null }, { recenter });
    dm.setSky(sky);
  };

  const load = () => {
    if (loading) return;
    status.textContent = 'Loading map…';
    loading = import('./detail/detailmap')
      // The tile cache manifest first (waits at most 2.5 s), so the first tiles use the cache.
      .then(async ({ DetailMap, loadTileCache }) => {
        await loadTileCache();
        status.hidden = true;
        dm = new DetailMap(body, { onPick });
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__detailMap = dm;
        apply();
      })
      .catch((e) => {
        console.error(e);
        status.textContent = 'The map cannot load.';
        loading = null;
      });
  };

  return {
    setPoint(ll, site, name, recenter) {
      title.textContent = name;
      pending = { ll, site, recenter };
      if (dm) apply();
      else load();
    },
    setSky(s) {
      sky = s;
      dm?.setSky(s);
    },
    coveredHeight() {
      if (panel.classList.contains('folded') || isFull()) return 0;
      const r = panel.getBoundingClientRect();
      return Math.max(0, window.innerHeight - r.top);
    },
  };
}
