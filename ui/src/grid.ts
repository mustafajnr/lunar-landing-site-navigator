// Latitude/longitude grid on the Moon, in the Moon body frame (MOON_ME).
// Lines every 10°. Extra latitude rings at 85° and 88° S and N (80° is on the 10° grid,
// but drawn in the polar colour too). Text labels are sprites. updateGridLabels() limits
// their size on the screen when the camera is near the surface, and shows fewer labels
// when the globe is small on the screen.

import * as THREE from 'three';
import { bodyVecOf } from './ephemeris';

const R_LINE = 1.0015;
const R_LABEL = 1.004;
const POLAR_RINGS = [80, 85, 88];

const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
const equatorMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
const polarMat = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.6, depthWrite: false });

// SPIKE (?view=...): dim the grid on the night side, so the terminator stays clear.
// gridLight.sun is the Sun direction in the Moon body frame; night = brightness factor on
// the night side (1 = no dimming, the old look).
export const gridLight = { sun: { value: new THREE.Vector3(1, 0, 0) }, night: { value: 1 } };
for (const m of [lineMat, equatorMat, polarMat]) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSunBody = gridLight.sun;
    sh.uniforms.uNight = gridLight.night;
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec3 vBodyPos;\nvoid main() {\n  vBodyPos = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uSunBody;\nuniform float uNight;\nvarying vec3 vBodyPos;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.a *= mix(uNight, 1.0, smoothstep(-0.08, 0.08, dot(normalize(vBodyPos), uSunBody)));',
      );
  };
}

function pt(lat: number, lon: number, r = R_LINE) {
  const v = bodyVecOf(lat, lon);
  return new THREE.Vector3(v[0] * r, v[1] * r, v[2] * r);
}

function latRing(lat: number, mat: THREE.LineBasicMaterial) {
  const pts: THREE.Vector3[] = [];
  for (let lon = -180; lon <= 180; lon += 1) pts.push(pt(lat, lon));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

function meridian(lon: number, latMax: number, mat: THREE.LineBasicMaterial) {
  const pts: THREE.Vector3[] = [];
  for (let lat = -latMax; lat <= latMax + 1e-9; lat += 0.5) pts.push(pt(lat, lon));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

type LabelKind = 'lat' | 'latPolar' | 'lon' | 'lonPolar';
interface LabelInfo {
  height: number;
  aspect: number;
  minPx: number;
  kind: LabelKind;
  /** Latitude or longitude of the label, degrees. */
  deg: number;
}

function label(text: string, color: string, height: number, kind: LabelKind, deg: number, minPx = 0) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = 'bold 40px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w;
  c.height = 56;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, w / 2, 28);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, 28);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(
    // No depth test: a label can be larger than the gap to the curved surface, and the
    // sphere then hides part of it. updateGridLabels() hides labels on the far side.
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }),
  );
  sprite.renderOrder = 1;
  sprite.scale.set((height * w) / 56, height, 1);
  const info: LabelInfo = { height, aspect: w / 56, minPx, kind, deg };
  sprite.userData.gridLabel = info;
  return sprite;
}

/**
 * Label height limits on the screen, in CSS px (the text is about 60 % of the height).
 * Between the limits a label keeps its size on the globe. Near the surface the labels
 * stop growing at LABEL_MAX_PX, so they keep about the same size on the screen. The
 * main labels (10° grid) do not become smaller than LABEL_MIN_PX, so they stay readable
 * when the globe is small. The polar ring labels have no minimum: they are close together.
 */
const LABEL_MAX_PX = 24;
const LABEL_MIN_PX = 15;
const tmpPos = new THREE.Vector3();
/** A label is hidden when the gap to a neighbour label is less than MIN_GAP label heights. */
const MIN_GAP = 1.5;
/** Longitude labels are wide: the gap must be at least LON_MIN_GAP label widths. */
const LON_MIN_GAP = 1.2;
/** Polar labels smaller than this (CSS px) are hidden. */
const POLAR_MIN_PX = 8;

interface Placed {
  info: LabelInfo;
  obj: THREE.Object3D;
  /** Screen position, CSS px. */
  x: number;
  y: number;
  /** Label height on the screen, CSS px. */
  hPx: number;
}

/**
 * Screen distance (px) from `a` to the nearest main label at deg ± step. A neighbour on the
 * far side has no screen position: for it, use the gap at the disk centre (globe radius x
 * step in radians). Latitude neighbours outside ±LAT_LABEL_MAX do not exist.
 */
const LAT_LABEL_MAX = 70;
function gapTo(a: Placed, step: number, map: Map<number, Placed>, wrap: boolean, globeRadiusPx: number) {
  let g = Infinity;
  for (const s of [-step, step]) {
    let d = a.info.deg + s;
    if (wrap && d > 180) d -= 360;
    if (wrap && d <= -180) d += 360;
    if (!wrap && Math.abs(d) > LAT_LABEL_MAX) continue;
    const b = map.get(d);
    g = Math.min(g, b ? Math.hypot(b.x - a.x, b.y - a.y) : globeRadiusPx * THREE.MathUtils.degToRad(step));
  }
  return g;
}

/**
 * Call once per frame, before the render. viewHeightPx is the canvas height in CSS px.
 *
 * Label density depends on the gap between neighbour labels on the screen:
 * - Latitude: a label stays if the gap to the labels 10° away is at least MIN_GAP label
 *   heights. If not, it stays only if it is on the 20° grid (±20°, ±40°, ±60°) and the gap
 *   to the labels 20° away is large enough. ±60° stays while the globe radius is at least
 *   3 label heights. (The 0° latitude has no own label: the 0° longitude label marks it.)
 * - Longitude (equator): every 30° if the gap is large enough, else every 90°, else none.
 * - Polar ring and polar longitude labels: hidden when smaller than POLAR_MIN_PX.
 */
export function updateGridLabels(grid: THREE.Group, camera: THREE.PerspectiveCamera, viewHeightPx: number) {
  if (!grid.visible) return;
  // Pixels per world unit at distance 1 from the camera.
  const pxPerUnit = viewHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.zoom);
  const dc = Math.max(1.0001, camera.position.length());
  const globeRadiusPx = pxPerUnit / Math.sqrt(dc * dc - 1);
  const halfH = viewHeightPx / 2;
  const halfW = halfH * camera.aspect;
  const lat = new Map<number, Placed>();
  const lon = new Map<number, Placed>();
  camera.updateMatrixWorld();
  // Pass 1: horizon test, size, screen position.
  for (const obj of grid.children) {
    const info = obj.userData.gridLabel as LabelInfo | undefined;
    if (!info) continue;
    // The Moon centre is at the world origin. A label is visible if it is on the near side
    // of the horizon seen from the camera: p . (camera - p) > 0.
    obj.getWorldPosition(tmpPos);
    obj.visible = tmpPos.dot(camera.position) > tmpPos.lengthSq();
    if (!obj.visible) continue;
    const unitsPerPx = camera.position.distanceTo(tmpPos) / pxPerUnit;
    const hgt = Math.min(Math.max(info.height, info.minPx * unitsPerPx), LABEL_MAX_PX * unitsPerPx);
    obj.scale.set(hgt * info.aspect, hgt, 1);
    if (gridLight.night.value < 1) {
      const lit = obj.position.clone().normalize().dot(gridLight.sun.value);
      ((obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = lit > 0 ? 1 : Math.max(gridLight.night.value * 1.5, 0.35);
    }
    const hPx = hgt / unitsPerPx;
    if (info.kind === 'latPolar' || info.kind === 'lonPolar') {
      obj.visible = hPx >= POLAR_MIN_PX;
      continue;
    }
    tmpPos.project(camera);
    const p: Placed = { info, obj, x: tmpPos.x * halfW, y: tmpPos.y * halfH, hPx };
    (info.kind === 'lat' ? lat : lon).set(info.deg, p);
  }
  // The 0° longitude label at the equator is also the neighbour of the ±10° latitude labels.
  const lon0 = lon.get(0);
  if (lon0) lat.set(0, lon0);
  // Pass 2: density. The gaps use the positions of all near-side labels of the 10° (30°) grid.
  for (const p of lat.values()) {
    if (p.info.kind !== 'lat') continue;
    const need = MIN_GAP * p.hPx;
    const d = p.info.deg;
    p.obj.visible =
      globeRadiusPx >= 3 * p.hPx &&
      (gapTo(p, 10, lat, false, globeRadiusPx) >= need ||
        (d % 20 === 0 && gapTo(p, 20, lat, false, globeRadiusPx) >= need) ||
        Math.abs(d) === 60);
  }
  for (const p of lon.values()) {
    const need = LON_MIN_GAP * p.hPx * p.info.aspect;
    p.obj.visible =
      globeRadiusPx >= need &&
      (gapTo(p, 30, lon, true, globeRadiusPx) >= need || (p.info.deg % 90 === 0 && gapTo(p, 90, lon, true, globeRadiusPx) >= need));
  }
}

const latText = (lat: number) => (lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`);
const lonText = (lon: number) =>
  lon === 0 || lon === 180 ? `${lon}°` : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;

export function createGrid(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'latLonGrid';

  // Latitude rings every 10°, plus the polar rings.
  for (let lat = -80; lat <= 80; lat += 10) {
    if (POLAR_RINGS.includes(Math.abs(lat))) continue;
    g.add(latRing(lat, lat === 0 ? equatorMat : lineMat));
  }
  for (const a of POLAR_RINGS) {
    g.add(latRing(a, polarMat));
    g.add(latRing(-a, polarMat));
  }
  // Meridians every 10°. Only every 30° continues inside the 88° rings, to keep the pole clear.
  for (let lon = -170; lon <= 180; lon += 10) {
    g.add(meridian(lon, lon % 30 === 0 ? 90 : 88, lon === 0 ? equatorMat : lineMat));
  }

  // Latitude labels along the 0° meridian (and 180° for the polar rings, which are small).
  for (let lat = -LAT_LABEL_MAX; lat <= LAT_LABEL_MAX; lat += 10) {
    if (lat === 0) continue; // the 0° longitude label marks the equator crossing
    const s = label(latText(lat), '#ffffff', 0.035, 'lat', lat, LABEL_MIN_PX);
    s.position.copy(pt(lat + 1.2, 2.5, R_LABEL));
    g.add(s);
  }
  for (const a of POLAR_RINGS) {
    const h = a === 88 ? 0.008 : a === 85 ? 0.012 : 0.016;
    for (const sign of [-1, 1]) {
      for (const lon of [0, 180]) {
        const s = label(latText(sign * a), '#ffc878', h, 'latPolar', sign * a);
        s.position.copy(pt(sign * a, lon, R_LABEL));
        g.add(s);
      }
    }
  }
  // Longitude labels every 30°: near the equator and near both poles (between 80° and 85°).
  for (let lon = -150; lon <= 180; lon += 30) {
    const eq = label(lonText(lon), '#ffffff', 0.035, 'lon', lon, LABEL_MIN_PX);
    eq.position.copy(pt(-2, lon + 2.5, R_LABEL));
    g.add(eq);
    for (const sign of [-1, 1]) {
      const s = label(lonText(lon), '#ffffff', 0.014, 'lonPolar', lon);
      s.position.copy(pt(sign * 82.5, lon, R_LABEL));
      g.add(s);
    }
  }
  return g;
}
