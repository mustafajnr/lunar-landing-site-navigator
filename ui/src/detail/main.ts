// Standalone site-detail page. Uses the same DetailMap module as the side panel in index.html.
// Open: /detail.html?lat=-89.45&lon=-137.31
// Optional: name=<text>, radius=<m> (draws the site circle and fits the view to it).
import './detail.css';
import { DetailMap, loadTileCache } from './detailmap';

const q = new URLSearchParams(location.search);
const lat = Number(q.get('lat') ?? -89.45);
const lon = Number(q.get('lon') ?? -137.31);
const name = q.get('name') ?? (q.has('lat') ? '' : 'Shackleton–de Gerlache ridge');
const radiusM = q.has('radius') ? Number(q.get('radius')) : null;

const $ = (id: string) => document.getElementById(id)!;
const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
const showSite = (la: number, lo: number, n: string) => {
  $('site').textContent = `${n ? n + ': ' : ''}${fmt(la, 'N', 'S')}, ${fmt(lo, 'E', 'W')}`;
};

showSite(lat, lon, name);
// The tile cache manifest first (waits at most 2.5 s), so the first tiles use the cache.
void loadTileCache().then(() => {
  const dm = new DetailMap($('map'), { onPick: (ll) => showSite(ll.latDeg, ll.lonDeg, '') });
  dm.setPoint({ latDeg: lat, lonDeg: lon, name, radiusM });
  // For tests: tile counts.
  (window as unknown as Record<string, unknown>).__detailMap = dm;
});

// Preset sites for quick testing.
const presets: [string, number, number][] = [
  ['Shackleton–de Gerlache ridge', -89.45, -137.31],
  ['Apollo 11', 0.67416, 23.47314],
  ['Artemis III: Malapert Massif', -85.9861, -0.255],
  ['Artemis III: de Gerlache Rim', -88.4414, -62.245],
  ["Chang'e 4", -45.4562, 177.5885],
];
const pl = $('presets');
for (const [n, la, lo] of presets) {
  const a = document.createElement('a');
  a.href = `?lat=${la}&lon=${lo}&name=${encodeURIComponent(n)}`;
  a.textContent = n;
  pl.append(a, ' ');
}
