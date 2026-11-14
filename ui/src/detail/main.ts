// Site-detail map spike: OpenLayers + NASA Moon Trek WMTS tiles.
// Open: /detail.html?lat=-89.45&lon=-137.31&name=Shackleton%20rim
import 'ol/ol.css';
import './detail.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Style, Circle, Fill, Stroke } from 'ol/style.js';
import { ScaleLine, defaults as defaultControls } from 'ol/control.js';
import { transform, getPointResolution } from 'ol/proj.js';
import { LONLAT, SPS, siteStereo } from './moonproj';
import { EQ_GLOBAL, EQ_LOCAL, SP_LAYERS, makeLayer, nominalMpp, type TrekLayer } from './layers';

const POLAR_LAT = -75; // south of this, use the native Trek south polar stereographic tiles

const q = new URLSearchParams(location.search);
const lat = Number(q.get('lat') ?? -89.45);
const lon = Number(q.get('lon') ?? -137.31);
const name = q.get('name') ?? '';
const polar = lat <= POLAR_LAT;

const viewProj = polar ? SPS : siteStereo(lat, lon);
const center = transform([lon, lat], LONLAT, viewProj);

// Layer stack, bottom to top. EQ tiles are reprojected on the fly by OpenLayers.
const defs: TrekLayer[] = polar
  ? [EQ_GLOBAL[0], ...SP_LAYERS, ...EQ_LOCAL]
  : [...EQ_GLOBAL, ...EQ_LOCAL];
const layers = defs.map(makeLayer);

const marker = new Feature(new Point(center));
const markerLayer = new VectorLayer({
  source: new VectorSource({ features: [marker] }),
  style: [
    new Style({ image: new Circle({ radius: 9, stroke: new Stroke({ color: '#000', width: 4 }) }) }),
    new Style({ image: new Circle({ radius: 9, stroke: new Stroke({ color: '#ffd400', width: 2 }), fill: new Fill({ color: 'rgba(255,212,0,0.15)' }) }) }),
  ],
});

const map = new Map({
  target: 'map',
  layers: [...layers, markerLayer],
  controls: defaultControls().extend([new ScaleLine({ units: 'metric', bar: true, steps: 4, text: true, minWidth: 140 })]),
  view: new View({
    projection: viewProj,
    center,
    resolution: 30, // m/px, about 30 km across the screen
    maxResolution: 9000,
    minResolution: 0.1,
  }),
});

// ---- panel ----
const $ = (id: string) => document.getElementById(id)!;
const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
const fmtLL = (lo: number, la: number) => `${fmt(la, 'N', 'S')}, ${fmt(lo, 'E', 'W')}`;

$('site').textContent = `${name ? name + ': ' : ''}${fmtLL(lon, lat)}`;
$('mode').textContent = polar ? 'South polar stereographic (native Trek SP tiles)' : 'Stereographic centred on site (Trek EQ tiles, reprojected)';

const list = $('layers');
layers.forEach((layer) => {
  const l = layer.get('trek') as TrekLayer;
  const row = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = layer.getVisible();
  cb.onchange = () => layer.setVisible(cb.checked);
  const [x0, y0, x1, y1] = l.bbox;
  const inside = l.proj === 'EQ' ? lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1
    : center[0] >= x0 && center[0] <= x1 && center[1] >= y0 && center[1] <= y1;
  row.append(cb, ` ${l.title} `);
  const s = document.createElement('small');
  s.textContent = `${nominalMpp(l).toFixed(2)} m/px${inside ? '' : ' (no data at site)'}`;
  row.append(s);
  if (!inside) row.classList.add('dim');
  list.append(row);
});

map.on('pointermove', (e) => {
  const [lo, la] = transform(e.coordinate, viewProj, LONLAT);
  $('cursor').textContent = fmtLL(lo, la);
});

const showRes = () => {
  const v = map.getView();
  const r = getPointResolution(viewProj, v.getResolution() ?? 0, v.getCenter() ?? center, 'm');
  $('res').textContent = `${r < 10 ? r.toFixed(2) : r.toFixed(0)} m/px`;
};
map.on('moveend', showRes);
showRes();

// Preset sites for quick testing.
const presets: [string, number, number][] = [
  ['Shackleton rim', -89.45, -137.31],
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
