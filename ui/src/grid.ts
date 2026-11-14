// Latitude/longitude grid on the Moon, in the Moon body frame (MOON_ME).
// Lines every 10°. Extra latitude rings at 85° and 88° S and N (80° is on the 10° grid,
// but drawn in the polar colour too). Text labels are sprites. updateGridLabels() limits
// their size on the screen when the camera is near the surface.

import * as THREE from 'three';
import { bodyVecOf } from './ephemeris';

const R_LINE = 1.0015;
const R_LABEL = 1.004;
const POLAR_RINGS = [80, 85, 88];

const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
const equatorMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
const polarMat = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.6, depthWrite: false });

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

function label(text: string, color: string, height: number, minPx = 0) {
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
  sprite.userData.gridLabel = { height, aspect: w / 56, minPx };
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

/** Call once per frame, before the render. viewHeightPx is the canvas height in CSS px. */
export function updateGridLabels(grid: THREE.Group, camera: THREE.PerspectiveCamera, viewHeightPx: number) {
  if (!grid.visible) return;
  // Pixels per world unit at distance 1 from the camera.
  const pxPerUnit = viewHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.zoom);
  for (const obj of grid.children) {
    const info = obj.userData.gridLabel as { height: number; aspect: number; minPx: number } | undefined;
    if (!info) continue;
    // The Moon centre is at the world origin. A label is visible if it is on the near side
    // of the horizon seen from the camera: p . (camera - p) > 0.
    obj.getWorldPosition(tmpPos);
    obj.visible = tmpPos.dot(camera.position) > tmpPos.lengthSq();
    if (!obj.visible) continue;
    const unitsPerPx = camera.position.distanceTo(tmpPos) / pxPerUnit;
    const hgt = Math.min(Math.max(info.height, info.minPx * unitsPerPx), LABEL_MAX_PX * unitsPerPx);
    obj.scale.set(hgt * info.aspect, hgt, 1);
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
  for (let lat = -70; lat <= 70; lat += 10) {
    if (lat === 0) continue; // the 0° longitude label marks the equator crossing
    const s = label(latText(lat), '#ffffff', 0.035, LABEL_MIN_PX);
    s.position.copy(pt(lat + 1.2, 2.5, R_LABEL));
    g.add(s);
  }
  for (const a of POLAR_RINGS) {
    const h = a === 88 ? 0.008 : a === 85 ? 0.012 : 0.016;
    for (const sign of [-1, 1]) {
      for (const lon of [0, 180]) {
        const s = label(latText(sign * a), '#ffc878', h);
        s.position.copy(pt(sign * a, lon, R_LABEL));
        g.add(s);
      }
    }
  }
  // Longitude labels every 30°: near the equator and near both poles (between 80° and 85°).
  for (let lon = -150; lon <= 180; lon += 30) {
    const eq = label(lonText(lon), '#ffffff', 0.035, LABEL_MIN_PX);
    eq.position.copy(pt(-2, lon + 2.5, R_LABEL));
    g.add(eq);
    for (const sign of [-1, 1]) {
      const s = label(lonText(lon), '#ffffff', 0.014);
      s.position.copy(pt(sign * 82.5, lon, R_LABEL));
      g.add(s);
    }
  }
  return g;
}
