// Site-detail map: OpenLayers + NASA Moon Trek WMTS tiles. Used by the main app (side
// panel, loaded with a dynamic import()) and by the standalone page detail.html.
//
// Speed rules (Moon Trek tiles take about 0.45 s each, over HTTP/1.1 = 6 at a time):
// - One base layer only (WAC or Kaguya, never both).
// - Local mosaics only if the point is inside their bounding box.
// - Each layer has a view resolution range (maxViewMpp), so coarse views do not load it.
// - A layer that an opaque layer above it covers in the whole view is hidden, so it does
//   not load (for example the reprojected WAC layer under the polar NAC mosaic).
// - preload = 1 on opaque layers: a coarse image shows while the fine tiles load.
import 'ol/ol.css';
import './detailmap.css';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import TileLayer from 'ol/layer/Tile.js';
import type XYZ from 'ol/source/XYZ.js';
import type Projection from 'ol/proj/Projection.js';
import { Style, Circle, Fill, Stroke } from 'ol/style.js';
import { ScaleLine, Zoom, Attribution } from 'ol/control.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import { transform, getPointResolution } from 'ol/proj.js';
import type { Coordinate } from 'ol/coordinate.js';
import { LONLAT, SPS, R, siteStereo } from './moonproj';
import { makeLayer, nominalMpp, tileCacheOn, SLOPE_LAYER, type TrekLayer } from './layers';
import { POLAR_LAT, DEFAULT_START_MPP, RADIUS_VIEW_FACTOR, bestImageAt, hasDataAt, stackFor } from './stack';

export { POLAR_LAT, DEFAULT_START_MPP, RADIUS_VIEW_FACTOR, bestImageAt };
export { loadTileCache } from './layers';
const D2R = Math.PI / 180;

export interface MapPoint {
  latDeg: number;
  lonDeg: number;
  name?: string;
  /** Site radius in metres. Drawn as a circle. */
  radiusM?: number | null;
}

export interface MapSky {
  sunAz: number;
  sunEl: number;
  sunUp: boolean;
  earthAz: number;
  earthEl: number;
  earthUp: boolean;
}

export interface DetailMapOptions {
  /** Called when the user clicks the map. */
  onPick?: (ll: { latDeg: number; lonDeg: number }) => void;
  /** Start view resolution in m/px if the point has no radius. Default DEFAULT_START_MPP. */
  resolution?: number;
  /** Small map (comparison panel): no info box, no attribution control (the caller shows
   *  the credit), a short scale bar. Default false. */
  compact?: boolean;
  /** A click on the map moves the point. Default true. */
  pick?: boolean;
  /** Called after each view change with the top visible image layer and the view m/px. */
  onView?: (info: { title: string | null; mpp: number }) => void;
}

/** Point at angular distance `dist` (rad) along `bearing` (deg clockwise from north). */
function destination(lat: number, lon: number, bearingDeg: number, dist: number): Coordinate {
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const b = bearingDeg * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dist) + Math.cos(p1) * Math.sin(dist) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dist) * Math.cos(p1), Math.cos(dist) - Math.sin(p1) * Math.sin(p2));
  return [((((l2 / D2R + 180) % 360) + 360) % 360) - 180, p2 / D2R];
}

const normLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

const fmtCoord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
const fmtLL = (lon: number, lat: number) => `${fmtCoord(lat, 'N', 'S')}, ${fmtCoord(lon, 'E', 'W')}`;
const fmtMpp = (r: number) => `${r < 10 ? r.toFixed(2) : r.toFixed(0)} m/px`;

export class DetailMap {
  readonly map: OlMap;
  private readonly opts: DetailMapOptions;
  private readonly layerCache = new Map<string, TileLayer<XYZ>>();
  private stack: TrekLayer[] = [];
  private readonly userOn = new Set<string>();
  private point: MapPoint | null = null;
  private polar = false;
  private projCentre: [number, number] = [0, 0];
  private sky: MapSky | null = null;
  private readonly markerSrc = new VectorSource();
  private readonly marker = new Feature(new Point([0, 0]));
  private readonly circle = new Feature<Polygon>();
  private readonly el: Record<'map' | 'bar' | 'barText' | 'progress' | 'best' | 'showing' | 'cursor' | 'layers' | 'legend', HTMLElement>;
  private readonly svg: SVGSVGElement;
  private requested = 0;
  private loaded = 0;
  private hideBarTimer = 0;
  /** Tile requests since the map was made (for tests). */
  tileStats = { requested: 0, loaded: 0, failed: 0, byLayer: {} as Record<string, number> };
  /** Number of maps that are made and not disposed (for leak tests). */
  static live = 0;
  private disposed = false;

  constructor(root: HTMLElement, opts: DetailMapOptions = {}) {
    this.opts = opts;
    root.classList.add('dm');
    root.classList.toggle('dm-compact', !!opts.compact);
    root.innerHTML = `
      <div class="dm-map"></div>
      <svg class="dm-arrows" aria-hidden="true"></svg>
      <div class="dm-progress" hidden><div class="dm-bar"></div><span class="dm-bar-text"></span></div>
      <div class="dm-info">
        <div><span class="k">Best imagery here:</span> <span class="dm-best">–</span></div>
        <div><span class="k">Showing:</span> <span class="dm-showing">–</span></div>
        <div><span class="k">Cursor:</span> <span class="dm-cursor">–</span></div>
        <details class="dm-layers"><summary>Layers</summary><div class="dm-layer-list"></div></details>
        <div class="dm-legend" hidden></div>
      </div>`;
    const q = (c: string) => root.querySelector(c) as HTMLElement;
    this.el = {
      map: q('.dm-map'),
      bar: q('.dm-bar'),
      barText: q('.dm-bar-text'),
      progress: q('.dm-progress'),
      best: q('.dm-best'),
      showing: q('.dm-showing'),
      cursor: q('.dm-cursor'),
      layers: q('.dm-layer-list'),
      legend: q('.dm-legend'),
    };
    this.svg = root.querySelector('.dm-arrows') as SVGSVGElement;

    this.marker.setStyle([
      new Style({ image: new Circle({ radius: 9, stroke: new Stroke({ color: '#000', width: 4 }) }) }),
      new Style({
        image: new Circle({ radius: 9, stroke: new Stroke({ color: '#ffd400', width: 2 }), fill: new Fill({ color: 'rgba(255,212,0,0.15)' }) }),
      }),
    ]);
    this.circle.setStyle(
      new Style({ stroke: new Stroke({ color: '#ffd400', width: 2, lineDash: [6, 4] }), fill: new Fill({ color: 'rgba(255,212,0,0.06)' }) }),
    );
    this.markerSrc.addFeature(this.marker);

    this.map = new OlMap({
      target: this.el.map as HTMLElement,
      layers: [new VectorLayer({ source: this.markerSrc, zIndex: 100 })],
      controls: opts.compact
        ? [new Zoom(), new ScaleLine({ units: 'metric', bar: true, steps: 2, text: false, minWidth: 64 })]
        : [
            new Zoom(),
            new Attribution({ collapsible: true, collapsed: true }),
            new ScaleLine({ units: 'metric', bar: true, steps: 4, text: false, minWidth: 100 }),
          ],
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
      // Trek serves HTTP/1.1 (6 tiles at a time per host). The tile cache bucket serves
      // HTTP/2, so more tiles can load at the same time.
      maxTilesLoading: tileCacheOn() ? 32 : 12,
    });
    DetailMap.live++;
    if (opts.pick !== false) this.map.on('singleclick', (e) => {
      const [lon, lat] = transform(e.coordinate, this.map.getView().getProjection(), LONLAT);
      const ll = { latDeg: Math.max(-89.999, Math.min(89.999, lat)), lonDeg: normLon(lon) };
      this.setPoint({ ...ll }, { recenter: false });
      this.opts.onPick?.(ll);
    });
    this.map.on('pointermove', (e) => {
      const [lon, lat] = transform(e.coordinate, this.map.getView().getProjection(), LONLAT);
      this.el.cursor.textContent = fmtLL(lon, lat);
    });
    this.map.on('postrender', () => this.drawArrows());
    this.map.on('moveend', () => this.showInfo());
    // All tiles of the view are done. Aborted tiles send no end event, so reset here.
    this.map.on('loadend', () => this.resetProgress(true));
  }

  /** Select a point. recenter = false keeps the view where it is (map clicks). */
  setPoint(p: MapPoint, { recenter = true }: { recenter?: boolean } = {}) {
    const old = this.point;
    this.point = { ...p, lonDeg: normLon(p.lonDeg) };
    const { latDeg: lat, lonDeg: lon } = this.point;
    const polar = lat <= POLAR_LAT;
    const view0 = this.map.getView();
    const hasView = !!old && !!view0.getCenter();
    // A non-polar view is a stereographic projection centred near the point. Make a new
    // one when the point moves far from the projection centre.
    const far =
      !polar && hasView && Math.hypot(lat - this.projCentre[0], (lon - this.projCentre[1]) * Math.cos(lat * D2R)) > 5;
    const size = this.map.getSize();
    const minPx = size ? Math.max(100, Math.min(size[0], size[1])) : 400;
    let res = hasView ? view0.getResolution()! : this.opts.resolution ?? DEFAULT_START_MPP;
    if (recenter && p.radiusM) res = (p.radiusM * RADIUS_VIEW_FACTOR) / minPx;
    if (!hasView || polar !== this.polar || (recenter && far)) {
      this.polar = polar;
      this.projCentre = [lat, lon];
      const proj = polar ? SPS : siteStereo(lat, lon);
      const view = new View({
        projection: proj,
        center: transform([lon, lat], LONLAT, proj),
        resolution: res,
        maxResolution: 9000,
        minResolution: 0.1,
      });
      view.on(['change:center', 'change:resolution'], () => this.updateVisibility());
      this.map.setView(view);
    } else if (recenter) {
      view0.setCenter(transform([lon, lat], LONLAT, view0.getProjection()));
      view0.setResolution(res);
    }
    this.setStack(stackFor(lat, lon));
    this.updateFeatures();
    const best = bestImageAt(lat, lon);
    this.el.best.textContent = `${fmtMpp(best.mpp)}, ${best.layer.title}`;
    this.updateVisibility();
    this.showInfo();
    this.map.render();
  }

  /** Sun and Earth directions at the current time, for the arrows. Null hides them. */
  setSky(s: MapSky | null) {
    const o = this.sky;
    if (
      o && s &&
      Math.abs(o.sunAz - s.sunAz) < 0.05 && Math.abs(o.earthAz - s.earthAz) < 0.05 &&
      Math.abs(o.sunEl - s.sunEl) < 0.05 && Math.abs(o.earthEl - s.earthEl) < 0.05 &&
      o.sunUp === s.sunUp && o.earthUp === s.earthUp
    )
      return;
    this.sky = s;
    this.drawArrows();
  }

  updateSize() {
    this.map.updateSize();
  }

  /** Remove the map from the page and release its layers and sources. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    DetailMap.live--;
    clearTimeout(this.hideBarTimer);
    this.map.setTarget(undefined);
    this.map.getLayers().clear();
    for (const l of this.layerCache.values()) {
      l.getSource()?.dispose();
      l.dispose();
    }
    this.layerCache.clear();
    this.map.dispose();
  }

  // ---------- layers ----------

  private layerOf(l: TrekLayer) {
    const key = `${l.id}:${l.maxZ}`;
    let layer = this.layerCache.get(key);
    if (!layer) {
      layer = makeLayer(l);
      const src = layer.getSource()!;
      src.on('tileloadstart', () => {
        this.requested++;
        this.tileStats.requested++;
        this.tileStats.byLayer[key] = (this.tileStats.byLayer[key] ?? 0) + 1;
        this.showProgress();
      });
      src.on(['tileloadend', 'tileloaderror'], (e) => {
        this.loaded++;
        if (e.type === 'tileloaderror') this.tileStats.failed++;
        else this.tileStats.loaded++;
        this.showProgress();
      });
      this.layerCache.set(key, layer);
    }
    return layer;
  }

  private setStack(defs: TrekLayer[]) {
    this.stack = defs;
    const layers = this.map.getLayers();
    const vector = layers.item(layers.getLength() - 1);
    const tiles = defs.map((d, i) => {
      const t = this.layerOf(d);
      t.setZIndex(i);
      return t;
    });
    layers.clear();
    layers.extend([...tiles, vector]);
    // Layer list with toggles for the overlays.
    const list = this.el.layers;
    list.innerHTML = '';
    for (const d of [...defs].reverse()) {
      const row = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      if (d.role === 'overlay') {
        cb.checked = this.userOn.has(d.id);
        cb.onchange = () => {
          if (cb.checked) this.userOn.add(d.id);
          else this.userOn.delete(d.id);
          this.updateVisibility();
          this.showInfo();
          this.showLegend();
        };
      } else {
        cb.checked = true;
        cb.disabled = true;
        cb.title = 'Shown automatically where it has data';
      }
      const s = document.createElement('small');
      s.textContent = ` ${fmtMpp(nominalMpp(d))}`;
      row.append(cb, ` ${d.title}`, s);
      list.append(row);
    }
    // The slope tiles stop at 80° S. North of it, say where to find slope.
    const p = this.point;
    if (tileCacheOn() && p && !defs.includes(SLOPE_LAYER)) {
      const note = document.createElement('div');
      note.className = 'dm-note';
      note.textContent = 'Slope layer: only south of 80° S. For slope at this point, use the QuickMap link.';
      list.append(note);
    }
    this.showLegend();
  }

  /** Legend of each overlay that is on and has a legend. */
  private showLegend() {
    const box = this.el.legend;
    box.innerHTML = '';
    for (const d of this.stack) {
      if (!d.legend || !this.userOn.has(d.id)) continue;
      const t = document.createElement('div');
      t.className = 'dm-legend-title';
      t.textContent = d.title;
      const sw = document.createElement('div');
      sw.className = 'dm-legend-classes';
      for (const c of d.legend) {
        const item = document.createElement('span');
        const chip = document.createElement('i');
        chip.style.background = c.colour;
        item.append(chip, c.label);
        sw.append(item);
      }
      box.append(t, sw);
      if (d.legendNote) {
        const n = document.createElement('div');
        n.className = 'dm-note';
        n.textContent = d.legendNote;
        box.append(n);
      }
    }
    box.hidden = !box.childElementCount;
  }

  /** Show each layer only if it is in its zoom range and no opaque layer above covers the view. */
  private updateVisibility() {
    const view = this.map.getView();
    const size = this.map.getSize();
    const res = view.getResolution();
    if (!size || !size[0] || !res || !view.getCenter()) return;
    const proj = view.getProjection();
    const [x0, y0, x1, y1] = view.calculateExtent(size);
    // 5 x 5 samples of the view, as lunar lon/lat.
    const samples: Coordinate[] = [];
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) samples.push(transform([x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * j) / 4], proj, LONLAT));
    let covered = false;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const d = this.stack[i];
      const wanted = d.role !== 'overlay' || this.userOn.has(d.id);
      const inRange = d.maxViewMpp === undefined || res < d.maxViewMpp;
      const show = wanted && inRange && !covered;
      const layer = this.layerOf(d);
      if (layer.getVisible() !== show) layer.setVisible(show);
      if (show && d.opaque && samples.every(([lo, la]) => hasDataAt(d, lo, la))) covered = true;
    }
  }

  // ---------- marker, circle, arrows ----------

  private updateFeatures() {
    const p = this.point;
    if (!p) return;
    const proj = this.map.getView().getProjection();
    this.marker.setGeometry(new Point(transform([p.lonDeg, p.latDeg], LONLAT, proj)));
    if (this.markerSrc.hasFeature(this.circle)) this.markerSrc.removeFeature(this.circle);
    if (p.radiusM && p.radiusM > 0) {
      const ring: Coordinate[] = [];
      for (let b = 0; b <= 360; b += 5) ring.push(transform(destination(p.latDeg, p.lonDeg, b, p.radiusM / R), LONLAT, proj));
      this.circle.setGeometry(new Polygon([ring]));
      this.markerSrc.addFeature(this.circle);
    }
  }

  /** Screen direction (unit vector, y down) of a bearing at the point. */
  private screenDir(proj: Projection, bearingDeg: number): [number, number] | null {
    const p = this.point!;
    const a = transform([p.lonDeg, p.latDeg], LONLAT, proj);
    const b = transform(destination(p.latDeg, p.lonDeg, bearingDeg, 50 / R), LONLAT, proj);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = Math.hypot(dx, dy);
    return n > 0 ? [dx / n, -dy / n] : null;
  }

  private drawArrows() {
    const svg = this.svg;
    const p = this.point;
    const view = this.map.getView();
    if (!p || !view.getCenter()) {
      svg.innerHTML = '';
      return;
    }
    const proj = view.getProjection();
    const px = this.map.getPixelFromCoordinate(transform([p.lonDeg, p.latDeg], LONLAT, proj));
    if (!px) {
      svg.innerHTML = '';
      return;
    }
    const arrows: { bearing: number; len: number; color: string; label: string; dim: boolean; cls: string }[] = [
      { bearing: 0, len: 46, color: '#ffffff', label: 'N', dim: false, cls: 'n' },
    ];
    const s = this.sky;
    if (s) {
      arrows.push({ bearing: s.sunAz, len: 78, color: '#ffd54a', label: `Sun ${s.sunAz.toFixed(0)}°`, dim: !s.sunUp, cls: 'sun' });
      arrows.push({ bearing: s.earthAz, len: 78, color: '#4aa3ff', label: `Earth ${s.earthAz.toFixed(0)}°`, dim: !s.earthUp, cls: 'earth' });
    }
    let out = '';
    for (const a of arrows) {
      const d = this.screenDir(proj, a.bearing);
      if (!d) continue;
      const [ux, uy] = d;
      const x0 = px[0] + ux * 12;
      const y0 = px[1] + uy * 12;
      const x1 = px[0] + ux * a.len;
      const y1 = px[1] + uy * a.len;
      // Arrow head.
      const hx = -uy;
      const hy = ux;
      const head = `${x1},${y1} ${x1 - ux * 9 + hx * 5},${y1 - uy * 9 + hy * 5} ${x1 - ux * 9 - hx * 5},${y1 - uy * 9 - hy * 5}`;
      const dash = a.dim ? ' stroke-dasharray="4 3"' : '';
      const op = a.dim ? 0.6 : 1;
      const lx = x1 + ux * 12;
      const ly = y1 + uy * 12;
      const anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
      out += `<g class="dm-arrow ${a.cls}" opacity="${op}">
        <line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#000" stroke-width="5" stroke-linecap="round"/>
        <line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${a.color}" stroke-width="2.5"${dash}/>
        <polygon points="${head}" fill="${a.color}" stroke="#000" stroke-width="1"/>
        <text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" fill="${a.color}">${a.label}</text>
      </g>`;
    }
    svg.innerHTML = out;
  }

  // ---------- info and progress ----------

  private showInfo() {
    const view = this.map.getView();
    const c = view.getCenter();
    const r = view.getResolution();
    if (!c || !r) return;
    const mpp = getPointResolution(view.getProjection(), r, c, 'm');
    const top = [...this.stack].reverse().find((d) => d.kind !== 'data' && this.layerOf(d).getVisible() && this.layerOf(d).isVisible(view));
    this.el.showing.textContent = `${top ? top.title : '–'} (view ${fmtMpp(mpp)})`;
    this.opts.onView?.({ title: top ? top.title : null, mpp });
  }

  private showProgress() {
    clearTimeout(this.hideBarTimer);
    const bar = this.el.progress;
    bar.hidden = false;
    const f = this.requested ? this.loaded / this.requested : 1;
    this.el.bar.style.width = `${(f * 100).toFixed(1)}%`;
    this.el.barText.textContent = `Tiles ${this.loaded} / ${this.requested}`;
    if (this.loaded >= this.requested) this.hideBarTimer = window.setTimeout(() => this.resetProgress(), 600);
  }

  private resetProgress(force = false) {
    if (!force && this.loaded < this.requested) return;
    this.requested = this.loaded = 0;
    this.el.progress.hidden = true;
  }
}
