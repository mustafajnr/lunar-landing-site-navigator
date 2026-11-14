import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ApiError, API_URL, fetchSites, type Site } from './api';
import {
  bodyVecOf,
  latLonOf,
  loadMoonStates,
  localSky,
  type LatLon,
  type MoonState,
  type MoonStateBatch,
  type Vec3,
} from './ephemeris';
import { createGrid, updateGridLabels } from './grid';
import { setupPointUi, STATUS_COLOR } from './point';
import { ResultsPanel } from './results';
import { setupMapPanel } from './mappanel';
import { drawSkyPlot, type AzMode, type ElZoom, type TrackPt } from './skyplot';

// ---------- Scene layout ----------
// Scene units: 1 = Moon radius. `inertial` group holds the J2000 frame. Its rotation puts
// the Moon's north pole at three.js +Y (screen up). With "True sky orientation" it puts
// J2000 +z (celestial north) at +Y instead, as seen from Earth. `moonBody` holds the
// Moon ME frame: body +x = lon 0, body +y = lon 90 E, body +z = north pole.
const EARTH_DIST = 8; // scaled, not true (true ~221 Moon radii)
const EARTH_RADIUS = 0.35; // scaled, not true (true ~3.67 Moon radii)
// "True scale Earth": Earth at its true distance and size, in Moon radii.
const MOON_R_KM = 1737.4;
const EARTH_TRUE_RADIUS = 6371 / MOON_R_KM;
const SUN_DIST = 14;
const DAY_S = 86400;
const WINDOW_S = 30 * DAY_S;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200); // far plane grows for true scale Earth
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 1.03;
controls.maxDistance = 60;

const inertial = new THREE.Group();
// J2000 +z -> three.js +Y.
const CELESTIAL_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
inertial.quaternion.copy(CELESTIAL_UP);
scene.add(inertial);

const moonBody = new THREE.Group();
inertial.add(moonBody);

// Moon mesh. SphereGeometry puts texture u=0.5 at +X and north at +Y; rotateX(+90deg)
// moves north to +Z and lon 90 E (u=0.75, geometry -Z) to +Y. With the LROC map
// (equirectangular, centred on lon 0, left edge = 180 W) this matches the body frame.
// The sphere stops at the south cap edge (CAP_LAT). The cap is a separate mesh with a
// polar (azimuthal equidistant) texture, so the south pole region is not smeared.
const CAP_LAT = -75;
const capRad = THREE.MathUtils.degToRad(90 + CAP_LAT);
const moonGeo = new THREE.SphereGeometry(1, 192, 88, 0, Math.PI * 2, 0, Math.PI - capRad);
moonGeo.rotateX(Math.PI / 2);
// SphereGeometry sets v from 1 to 0 over thetaLength, not over 180°. Here thetaLength
// stops at the cap edge, so the 180° map was squeezed onto 165° of sphere: the image was
// about 8° south of its true place at the equator, and near the cap edge the sphere showed
// the smeared rows of the map close to the pole (rings around the cap). Set v from the
// latitude, so the equirectangular map is in its true place: v = 0.5 + lat / 180°.
{
  const pos = moonGeo.getAttribute('position');
  const uv = moonGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setY(i, 0.5 + Math.asin(Math.max(-1, Math.min(1, pos.getZ(i)))) / Math.PI);
  }
  uv.needsUpdate = true;
}
// Vertex tangents for the normal maps. Without them three.js builds the tangent frame from
// screen-space derivatives per triangle, which shows rings on this mesh at high latitudes.
// tangent(lat, lon) = direction of +u on the surface; w = +1 (bitangent = normal x tangent).
function setTangents(geo: THREE.BufferGeometry, tangentOf: (lat: number, lon: number) => THREE.Vector3) {
  const pos = geo.getAttribute('position');
  const t = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const z = Math.max(-1, Math.min(1, pos.getZ(i)));
    const v = tangentOf(Math.asin(z), Math.atan2(pos.getY(i), pos.getX(i)));
    t.set([v.x, v.y, v.z, 1], i * 4);
  }
  geo.setAttribute('tangent', new THREE.BufferAttribute(t, 4));
}
const eastOf = (_lat: number, lon: number) => new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0);
const northOf = (lat: number, lon: number) =>
  new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat));
setTangents(moonGeo, eastOf);
const moonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
const moonMesh = new THREE.Mesh(moonGeo, moonMat);
moonBody.add(moonMesh);

const capGeo = new THREE.SphereGeometry(1, 192, 32, 0, Math.PI * 2, Math.PI - capRad, capRad);
capGeo.rotateX(Math.PI / 2);
{
  // UV: pole at (0.5, 0.5), lon 0 toward +v, lon 90 E toward +u (seen from outside).
  const pos = capGeo.getAttribute('position');
  const uv = capGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rho = (Math.PI / 2 + Math.asin(Math.max(-1, Math.min(1, z)))) / capRad; // 0 at pole, 1 at edge
    const lon = Math.atan2(y, x);
    uv.setXY(i, 0.5 + 0.5 * rho * Math.sin(lon), 0.5 + 0.5 * rho * Math.cos(lon));
  }
  uv.needsUpdate = true;
}
// Cap: +u is image right = sin(lon) * north + cos(lon) * east.
setTangents(capGeo, (lat, lon) =>
  northOf(lat, lon).multiplyScalar(Math.sin(lon)).add(eastOf(lat, lon).multiplyScalar(Math.cos(lon))),
);
const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
const capMesh = new THREE.Mesh(capGeo, capMat);
moonBody.add(capMesh);
// Moon textures (NASA SVS CGI Moon Kit). The 2k colour map loads first and stays as the
// fallback. The 8k map replaces it if the GPU supports 8192 px textures. The normal map
// (from the LOLA elevation map, relief x3) shows crater relief near the terminator.
const texLoader = new THREE.TextureLoader();
const TEX = `${import.meta.env.BASE_URL}textures/`;
function loadMoonColor(file: string, onFail: () => void) {
  texLoader.load(
    TEX + file,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      moonMat.map?.dispose();
      moonMat.map = tex;
      moonMat.color.set(0xffffff);
      moonMat.needsUpdate = true;
    },
    undefined,
    onFail,
  );
}
loadMoonColor('lroc_color_2k.jpg', () => {
  console.warn('Moon texture failed to load; using plain grey.');
  if (!moonMat.map) moonMat.color.set(0x999999);
});
if (renderer.capabilities.maxTextureSize >= 8192) {
  loadMoonColor('moon_color_8k.jpg', () => console.warn('8k Moon map failed to load; keeping the 2k map.'));
}
function loadInto(file: string, mat: THREE.MeshStandardMaterial, slot: 'map' | 'normalMap') {
  texLoader.load(
    TEX + file,
    (tex) => {
      tex.colorSpace = slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      mat[slot] = tex;
      mat.needsUpdate = true;
    },
    undefined,
    () => {
      console.warn(`${file} failed to load.`);
      if (slot === 'map' && !mat.map) mat.color.set(0x999999);
    },
  );
}
loadInto('moon_south_color.jpg', capMat, 'map');
loadInto('moon_south_normal.jpg', capMat, 'normalMap');
texLoader.load(
  TEX + 'moon_normal_4k.jpg',
  (tex) => {
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    moonMat.normalMap = tex;
    moonMat.normalScale.set(1, 1);
    moonMat.needsUpdate = true;
  },
  undefined,
  () => console.warn('Moon normal map failed to load; no relief shading.'),
);

// Latitude/longitude grid.
const grid = createGrid();
moonBody.add(grid);
const gridChk = $<HTMLInputElement>('showGrid');
grid.visible = gridChk.checked;
gridChk.addEventListener('change', () => (grid.visible = gridChk.checked));

// Spin axis (north = white end).
function line(points: THREE.Vector3[], color: number, parent: THREE.Object3D, dashed = false) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.2, gapSize: 0.15 })
    : new THREE.LineBasicMaterial({ color });
  const l = new THREE.Line(geo, mat);
  if (dashed) l.computeLineDistances();
  parent.add(l);
  return l;
}
line([new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1.4)], 0xffffff, moonBody);
line([new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1.4)], 0xff6060, moonBody);

function marker(color: number, r = 0.022) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 16, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  moonBody.add(m);
  return m;
}
const subSunMarker = marker(0xffd54a);
const subEarthMarker = marker(0x4aa3ff);
const selMarker = marker(0xff4a4a, 0.012);
// Selected point: a red dot plus a ring that keeps a fixed size on screen.
const selRing = new THREE.Mesh(
  new THREE.RingGeometry(0.8, 1, 48),
  new THREE.MeshBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }),
);
scene.add(selRing);

// Site markers (from /v1/sites), coloured by status.
const siteGroup = new THREE.Group();
moonBody.add(siteGroup);
const sitesChk = $<HTMLInputElement>('showSites');
siteGroup.visible = sitesChk.checked;
sitesChk.addEventListener('change', () => (siteGroup.visible = sitesChk.checked));

// Lights.
scene.add(new THREE.AmbientLight(0xffffff, 0.04));
const sunLight = new THREE.DirectionalLight(0xffffff, 3);
inertial.add(sunLight); // target defaults to origin = Moon centre

// Sun and Earth in the inertial frame.
// Sun: NASA SDO/HMI disk image on a sprite, with a soft glow behind it.
const SUN_RADIUS = 0.4; // scaled, not true
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,230,160,1)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.55)');
  g.addColorStop(0.6, 'rgba(255,160,40,0.12)');
  g.addColorStop(1, 'rgba(255,140,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const sunMarker = new THREE.Group();
const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false }),
);
sunGlow.scale.setScalar(SUN_RADIUS * 7);
const sunDiskMat = new THREE.SpriteMaterial({ color: 0xffe27a, transparent: true, depthWrite: false });
const sunDisk = new THREE.Sprite(sunDiskMat);
sunDisk.scale.setScalar(SUN_RADIUS * 2 * 1.02);
sunDisk.renderOrder = 1;
sunMarker.add(sunGlow, sunDisk);
inertial.add(sunMarker);
texLoader.load(TEX + 'sun_sdo_512.jpg', (jpg) => {
  // Cut the disk out (JPEG has no alpha), so the glow shows around it.
  const img = jpg.image as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(c.width / 2, c.height / 2, (c.width / 2) / 1.02, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  sunDiskMat.map = tex;
  sunDiskMat.color.set(0xffffff);
  sunDiskMat.needsUpdate = true;
});
const sunLine = line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], 0xffd54a, inertial, true);

// Earth: NASA Blue Marble. The mesh frame is Earth-fixed (+x Greenwich, +z north). It turns
// about J2000 +z by the Greenwich mean sidereal angle, so the correct side faces the Moon.
// Precession and nutation (< 0.5°) are ignored.
const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 32);
earthGeo.rotateX(Math.PI / 2);
const earthMat = new THREE.MeshStandardMaterial({ color: 0x3d7fd9, roughness: 0.85, metalness: 0 });
const earthMesh = new THREE.Mesh(earthGeo, earthMat);
inertial.add(earthMesh);
texLoader.load(TEX + 'earth_bluemarble_2k.jpg', (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  earthMat.map = tex;
  earthMat.color.set(0xffffff);
  earthMat.needsUpdate = true;
});

/** Greenwich mean sidereal angle in radians (IAU 1982 linear term, UT1 ~ UTC). */
function gmstRad(ms: number) {
  const d = (ms - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const deg = 280.46061837 + 360.98564736629 * d;
  return THREE.MathUtils.degToRad(((deg % 360) + 360) % 360);
}
const earthLine = line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], 0x4aa3ff, inertial);

function setLineEnd(l: THREE.Line, end: THREE.Vector3) {
  const pos = l.geometry.getAttribute('position') as THREE.BufferAttribute;
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  l.geometry.computeBoundingSphere();
  if (l.material instanceof THREE.LineDashedMaterial) l.computeLineDistances();
}

const v3 = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);
const onSurface = (lat: number, lon: number, r = 1.004) => v3(bodyVecOf(lat, lon)).multiplyScalar(r);

// Hidden until the first Moon state arrives from the API.
sunMarker.visible = earthMesh.visible = sunLine.visible = earthLine.visible = false;

// ---------- State ----------
let baseMs = Math.round(Date.now() / 60000) * 60000;
let offsetS = 0;
let playing = false;
// Default point (CONTRACTS.md example): on the ridge between Shackleton and de Gerlache,
// about 20 km from the Shackleton centre.
const DEFAULT_POINT = { latDeg: -89.45, lonDeg: -137.31, name: 'Shackleton–de Gerlache ridge' };
let selected: LatLon = { latDeg: DEFAULT_POINT.latDeg, lonDeg: DEFAULT_POINT.lonDeg };
let state: MoonState | null = null;
let batch: MoonStateBatch | null = null;
let batchReq: AbortController | null = null;
let batchFor = NaN; // baseMs of the batch being loaded or loaded
const prevMoonQuat = new THREE.Quaternion();
let havePrevQuat = false;

// ---------- UI elements ----------
const dtInput = $<HTMLInputElement>('dt');
const playBtn = $<HTMLButtonElement>('play');
const speedSel = $<HTMLSelectElement>('speed');
const offsetInput = $<HTMLInputElement>('offset');
const followChk = $<HTMLInputElement>('follow');
const trueSkyChk = $<HTMLInputElement>('trueSky');
const skyCanvas = $<HTMLCanvasElement>('sky');

const fmtLat = (d: number) => `${Math.abs(d).toFixed(2)}° ${d >= 0 ? 'N' : 'S'}`;
const fmtLon = (d: number) => `${Math.abs(d).toFixed(2)}° ${d >= 0 ? 'E' : 'W'}`;
const fmtLL = (ll: { latDeg: number; lonDeg: number }) => `${fmtLat(ll.latDeg)}, ${fmtLon(ll.lonDeg)}`;
const fmtAzEl = (az: number, el: number) => `${az.toFixed(1)}° / ${el >= 0 ? '+' : ''}${el.toFixed(2)}°`;

function toInputValue(ms: number) {
  return new Date(ms).toISOString().slice(0, 16);
}

function setBase(ms: number) {
  baseMs = ms;
  offsetS = 0;
  offsetInput.value = '0';
  dtInput.value = toInputValue(baseMs);
  requestBatch();
  requestSeries();
}

// ---------- API: series for the selected point (results panel) ----------
const results = new ResultsPanel(() => computeTracks());
function requestSeries() {
  results.setRequest({ point: selected, startMs: baseMs - WINDOW_S * 1000, stopMs: baseMs + WINDOW_S * 1000 });
}

// ---------- API: Moon-state batch for the time window ----------
const BATCH_STEP_MIN = 60;
const apiMsg = $<HTMLDivElement>('apiMsg');

function showApiError(e: unknown) {
  const unreachable = e instanceof ApiError && e.unreachable;
  apiMsg.hidden = false;
  apiMsg.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = unreachable
    ? `The API is not available at ${API_URL}. Sun and Earth positions cannot load.`
    : `The API returned an error: ${(e as Error).message}`;
  apiMsg.append(p);
  if (unreachable) {
    const code = document.createElement('code');
    code.textContent = 'cd api && uv run uvicorn lunarnav_api.main:app --port 8000';
    const p2 = document.createElement('p');
    p2.append('Start it with: ', code);
    apiMsg.append(p2);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Try again';
  btn.addEventListener('click', () => {
    batchFor = NaN;
    requestBatch();
  });
  apiMsg.append(btn);
}

function requestBatch() {
  if (batchFor === baseMs) return;
  batchFor = baseMs;
  batchReq?.abort();
  const ctrl = new AbortController();
  batchReq = ctrl;
  const pad = 3600 * 1000;
  loadMoonStates(baseMs - WINDOW_S * 1000 - pad, baseMs + WINDOW_S * 1000 + pad, BATCH_STEP_MIN, ctrl.signal)
    .then((b) => {
      if (ctrl.signal.aborted) return;
      batch = b;
      apiMsg.hidden = true;
      computeTracks();
      requestSeries(); // retry after an API outage
      loadSites();
    })
    .catch((e) => {
      if ((e as Error).name === 'AbortError') return;
      batchFor = NaN;
      console.error(e);
      showApiError(e);
    });
}

dtInput.addEventListener('change', () => {
  const ms = Date.parse(`${dtInput.value}:00Z`);
  if (Number.isFinite(ms)) setBase(ms);
});
$('now').addEventListener('click', () => setBase(Math.round(Date.now() / 60000) * 60000));
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? 'Pause' : 'Play';
});
offsetInput.addEventListener('input', () => {
  offsetS = Number(offsetInput.value) * 60;
});

// ---------- Local sky plot (az vs el, ±30 days) ----------
let sunTrack: TrackPt[] = [];
let earthTrack: TrackPt[] = [];

function computeTracks() {
  sunTrack = [];
  earthTrack = [];
  const d = results.data;
  if (d) {
    // API values (observer height included).
    for (let i = 0; i < d.times_utc.length; i++) {
      sunTrack.push([d.series.sun_az[i], d.series.sun_el[i]]);
      earthTrack.push([d.series.earth_az[i], d.series.earth_el[i]]);
    }
    return;
  }
  // Preview from the Moon-state batch until /v1/series arrives.
  if (!batch) return;
  const step = 2 * 3600;
  for (let t = -WINDOW_S; t <= WINDOW_S; t += step) {
    const s = batch.at(baseMs + t * 1000);
    const sky = localSky(selected.latDeg, selected.lonDeg, s);
    sunTrack.push([sky.sunAzDeg, sky.sunElDeg]);
    earthTrack.push([sky.earthAzDeg, sky.earthElDeg]);
  }
}

// Sun angular radius from the true Sun distance (it changes by about ±1.7 % over the year).
const SUN_RADIUS_KM = 695700;
const SUN_RADIUS_DEG_1AU = 0.2666;
const EARTH_RADIUS_KM = 6371;
let elZoom: ElZoom = 'auto';
let azMode: AzMode = 'full';

function drawSky(nowSun: TrackPt | null, nowEarth: TrackPt | null) {
  const earthKm = state?.earthDistanceKm ?? 384400;
  const sunKm = state ? Math.hypot(...state.sunBodyKm) : 0;
  drawSkyPlot(skyCanvas, {
    sunTrack,
    earthTrack,
    sunNow: nowSun,
    earthNow: nowEarth,
    sunRadiusDeg: sunKm > 0 ? THREE.MathUtils.radToDeg(Math.asin(SUN_RADIUS_KM / sunKm)) : SUN_RADIUS_DEG_1AU,
    earthRadiusDeg: THREE.MathUtils.radToDeg(Math.asin(EARTH_RADIUS_KM / earthKm)),
    mask: results.horizon?.mask ?? null,
    elZoom,
    azMode,
  });
}

const EL_STEPS = [1, 2, 5, 10, 15, 30, 90];
function setElZoom(z: ElZoom) {
  elZoom = z;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-el]')) {
    b.classList.toggle('active', b.dataset.el === String(z));
  }
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-el]')) {
  b.addEventListener('click', () => setElZoom(b.dataset.el === 'auto' ? 'auto' : Number(b.dataset.el)));
}
skyCanvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const cur = elZoom === 'auto' ? 15 : elZoom;
    let i = EL_STEPS.findIndex((v) => v >= cur);
    if (i < 0) i = EL_STEPS.length - 1;
    i = Math.max(0, Math.min(EL_STEPS.length - 1, i + (e.deltaY > 0 ? 1 : -1)));
    setElZoom(EL_STEPS[i]);
  },
  { passive: false },
);
const skyAz = $<HTMLSelectElement>('skyAz');
skyAz.addEventListener('change', () => (azMode = skyAz.value as AzMode));

const skyHelpBtn = $<HTMLButtonElement>('skyHelpBtn');
skyHelpBtn.addEventListener('click', () => {
  const help = $('skyHelp');
  help.hidden = !help.hidden;
  skyHelpBtn.setAttribute('aria-expanded', String(!help.hidden));
});

// ---------- Picking ----------
const raycaster = new THREE.Raycaster();
let downX = 0;
let downY = 0;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
});
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return; // a drag, not a click
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects([moonMesh, capMesh], false)[0];
  if (!hit) return;
  const p = moonBody.worldToLocal(hit.point.clone());
  const ll = latLonOf([p.x, p.y, p.z]);
  ll.latDeg = Math.max(-89.999, Math.min(89.999, ll.latDeg)); // never exactly ±90
  selectPoint(ll, null, false);
});

// ---------- Selected point: inputs, site picker, globe click ----------
const pointUi = setupPointUi((ll, site) => selectPoint(ll, site, true));
// Site-detail map panel. A click on the map selects the point; the globe follows.
let layoutDirty = true;
const mapPanel = setupMapPanel(
  (ll) => selectPoint(ll, null, true, true),
  () => (layoutDirty = true),
);

function selectPoint(ll: LatLon, site: Site | null, fly: boolean, fromMap = false) {
  selected = { latDeg: ll.latDeg, lonDeg: ll.lonDeg };
  pointUi.show(selected, site);
  const name = pointName(selected, site);
  $('selName').textContent = name;
  mapPanel.setPoint(selected, site, name || fmtLL(selected), !fromMap);
  requestSeries();
  computeTracks();
  if (fly) flyTo(selected);
}

function pointName(ll: LatLon, site: Site | null) {
  if (site) return site.name;
  if (Math.abs(ll.latDeg - DEFAULT_POINT.latDeg) < 1e-6 && Math.abs(ll.lonDeg - DEFAULT_POINT.lonDeg) < 1e-6) return DEFAULT_POINT.name;
  return '';
}

let sitesLoaded = false;
function loadSites() {
  if (sitesLoaded) return;
  fetchSites()
    .then((sites) => {
      if (sitesLoaded) return;
      sitesLoaded = true;
      pointUi.setSites(sites);
      for (const s of sites) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.006, 10, 6),
          new THREE.MeshBasicMaterial({ color: STATUS_COLOR[s.status] ?? 0xffffff }),
        );
        m.position.copy(onSurface(s.lat_deg, s.lon_deg, 1.002));
        m.userData.site = s;
        siteGroup.add(m);
      }
    })
    .catch((e) => {
      console.error(e);
      pointUi.setSitesError('Site list not available (API)');
    });
}
loadSites();

// Camera flight to a point: the camera ends above the point, looking at the Moon centre.
let flight: { from: THREE.Vector3; to: THREE.Vector3; fromD: number; toD: number; t0: number } | null = null;
const FLIGHT_MS = 900;
function flyTo(ll: LatLon) {
  const fromD = camera.position.length();
  flight = {
    from: camera.position.clone().normalize(),
    to: worldDir(bodyVecOf(ll.latDeg, ll.lonDeg), moonBody),
    fromD,
    toD: Math.min(fromD, 1.8),
    t0: performance.now(),
  };
}
function stepFlight(now: number) {
  if (!flight) return;
  const f = Math.min(1, (now - flight.t0) / FLIGHT_MS);
  const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; // ease in-out
  const q = new THREE.Quaternion().setFromUnitVectors(flight.from, flight.to);
  const dir = flight.from.clone().applyQuaternion(new THREE.Quaternion().slerp(q, e));
  camera.position.copy(dir.multiplyScalar(flight.fromD + (flight.toD - flight.fromD) * e));
  controls.target.set(0, 0, 0);
  if (f >= 1) flight = null;
}
controls.addEventListener('start', () => (flight = null)); // user drag stops the flight

// ---------- Camera presets ----------
function worldDir(v: Vec3, parent: THREE.Object3D) {
  return v3(v).applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion())).normalize();
}
function viewFrom(dir: THREE.Vector3, dist: number) {
  camera.position.copy(dir).multiplyScalar(dist);
  controls.target.set(0, 0, 0);
  controls.update();
}
function viewEarth() {
  viewFrom(state ? worldDir(state.earthDirInertial, inertial) : new THREE.Vector3(0, 0, 1), Math.max(3, fitDist()));
}
$('viewEarth').addEventListener('click', viewEarth);
// From below the south pole. The camera is 0.5° off the axis toward lon 0, so lon 0 is
// at the top of the screen.
$('viewSouth').addEventListener('click', () => viewFrom(worldDir(bodyVecOf(-89.5, 0), moonBody), Math.max(2.5, fitDist() * 0.8)));
// True scale Earth. The Sun stays at its reduced distance and size.
let trueEarth = false;
const trueEarthChk = $<HTMLInputElement>('trueEarth');
function setTrueEarth(on: boolean) {
  trueEarth = on;
  trueEarthChk.checked = on;
  camera.far = on ? 2000 : 200;
  camera.updateProjectionMatrix();
  controls.maxDistance = on ? 900 : 60;
  if (!on && camera.position.distanceTo(controls.target) > 60) viewEarth();
  $('scaleNote').textContent = on
    ? 'Earth: true distance and size. Not to scale: the Sun distance and size are reduced (true distance about 86,000 Moon radii).'
    : 'Not to scale: Earth and Sun distances and sizes are reduced.';
}
trueEarthChk.addEventListener('change', () => setTrueEarth(trueEarthChk.checked));
// Camera preset: Earth and the Moon side by side at true scale. The camera looks at the
// middle of the Earth-Moon line from the side.
$('viewTrueScale').addEventListener('click', () => {
  setTrueEarth(true);
  if (!state) return;
  flight = null;
  const eDir = worldDir(state.earthDirInertial, inertial);
  const mid = eDir.clone().multiplyScalar(state.earthDistanceKm / MOON_R_KM / 2);
  // Side direction: perpendicular to the Earth line, toward the Sun side if possible.
  const side = worldDir(state.sunDirInertial, inertial).projectOnPlane(eDir);
  if (side.lengthSq() < 1e-6) side.set(0, 1, 0).projectOnPlane(eDir);
  side.normalize();
  const half = mid.length() * 1.25;
  // Fit the Earth-Moon line in the free screen width (between the panels).
  const f = freeArea();
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = half / (t * Math.min(f.w / window.innerHeight, f.h / window.innerHeight * 2) * 0.9);
  controls.target.copy(mid);
  camera.position.copy(mid).addScaledVector(side, dist);
  controls.update();
});

trueSkyChk.addEventListener('change', () => {
  update();
  viewEarth();
});

// ---------- Update loop ----------
const m4 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();

function update() {
  const nowMs = baseMs + offsetS * 1000;
  const utc = new Date(nowMs);
  $('utc').textContent = utc.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const days = Math.trunc(offsetS / DAY_S);
  const hours = Math.trunc(Math.abs(offsetS % DAY_S) / 3600);
  $('offsetLabel').textContent = `${offsetS < 0 ? '-' : '+'}${Math.abs(days)} d ${String(hours).padStart(2, '0')} h`;
  $('selLatLon').textContent = fmtLL(selected);
  selMarker.position.copy(onSurface(selected.latDeg, selected.lonDeg));
  moonBody.updateMatrixWorld(true);
  const selWorld = selMarker.getWorldPosition(new THREE.Vector3());
  selRing.position.copy(selWorld);
  selRing.lookAt(camera.position);
  selRing.scale.setScalar(camera.position.distanceTo(selWorld) * 0.012);
  // Markers keep about the same size on screen when the camera zooms in.
  const k = Math.max(0.01, Math.min(1, (camera.position.length() - 1) / 3.5));
  for (const m of [selMarker, subSunMarker, subEarthMarker, ...siteGroup.children]) m.scale.setScalar(k);
  if (!batch) {
    drawSky(null, null);
    return;
  }
  const first = state === null;
  state = batch.at(nowMs);
  const m = state.bodyToInertial;
  m4.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  moonBody.quaternion.setFromRotationMatrix(m4);
  // Screen up: Moon north pole (default) or celestial north (true sky orientation).
  if (trueSkyChk.checked) {
    inertial.quaternion.copy(CELESTIAL_UP);
  } else {
    const pole = new THREE.Vector3(m[2], m[5], m[8]).applyQuaternion(CELESTIAL_UP);
    inertial.quaternion.setFromUnitVectors(pole, new THREE.Vector3(0, 1, 0)).multiply(CELESTIAL_UP);
  }
  moonBody.updateMatrixWorld(true);

  // Keep the camera fixed relative to the Moon surface, if asked.
  const q = moonBody.getWorldQuaternion(tmpQ);
  if (followChk.checked && havePrevQuat) {
    const delta = q.clone().multiply(prevMoonQuat.clone().invert());
    camera.position.applyQuaternion(delta);
  }
  prevMoonQuat.copy(q);
  havePrevQuat = true;

  sunMarker.visible = earthMesh.visible = sunLine.visible = earthLine.visible = true;
  const sunDir = v3(state.sunDirInertial);
  const earthDir = v3(state.earthDirInertial);
  sunLight.position.copy(sunDir).multiplyScalar(20);
  sunMarker.position.copy(sunDir).multiplyScalar(SUN_DIST);
  setLineEnd(sunLine, sunMarker.position);
  const eDist = trueEarth ? state.earthDistanceKm / MOON_R_KM : EARTH_DIST;
  const eRad = trueEarth ? EARTH_TRUE_RADIUS : EARTH_RADIUS;
  earthMesh.position.copy(earthDir).multiplyScalar(eDist);
  earthMesh.scale.setScalar(eRad / EARTH_RADIUS);
  earthMesh.rotation.set(0, 0, gmstRad(nowMs));
  setLineEnd(earthLine, earthDir.clone().multiplyScalar(eDist - eRad));

  subSunMarker.position.copy(onSurface(state.subSolar.latDeg, state.subSolar.lonDeg));
  subEarthMarker.position.copy(onSurface(state.subEarth.latDeg, state.subEarth.lonDeg));

  // Text readouts.
  $('subSun').textContent = fmtLL(state.subSolar);
  $('subEarth').textContent = fmtLL(state.subEarth);
  $('earthDist').textContent = `${Math.round(state.earthDistanceKm).toLocaleString('en-US')} km`;
  results.tick(nowMs);
  const api = results.at(nowMs);
  const sky = api
    ? { sunAzDeg: api.sunAz, sunElDeg: api.sunEl, earthAzDeg: api.earthAz, earthElDeg: api.earthEl }
    : localSky(selected.latDeg, selected.lonDeg, state);
  $('selSun').textContent = fmtAzEl(sky.sunAzDeg, sky.sunElDeg);
  $('selEarth').textContent = fmtAzEl(sky.earthAzDeg, sky.earthElDeg);
  drawSky([sky.sunAzDeg, sky.sunElDeg], [sky.earthAzDeg, sky.earthElDeg]);
  mapPanel.setSky({
    sunAz: sky.sunAzDeg,
    sunEl: sky.sunElDeg,
    sunUp: api ? api.sunVisibleFraction > 0 : sky.sunElDeg > 0,
    earthAz: sky.earthAzDeg,
    earthEl: sky.earthElDeg,
    earthUp: api ? api.earthVisible : sky.earthElDeg > 0,
  });
  if (first) viewEarth();
}

// The globe centre is the centre of the free screen area: between the side panels and
// above the map panel.
function freeArea() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const l = $('panel').getBoundingClientRect();
  const r = $('results').getBoundingClientRect();
  const left = l.width && l.right < w / 2 ? l.right : 0;
  const right = r.width && r.left > w / 2 ? r.left : w;
  const bottom = h - mapPanel.coveredHeight();
  return { cx: (left + right) / 2, cy: bottom / 2, w: right - left, h: bottom };
}
function resize() {
  layoutDirty = false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const f = freeArea();
  camera.setViewOffset(w, h, w / 2 - f.cx, h / 2 - f.cy, w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => (layoutDirty = true));
/** Camera distance at which the Moon fills about 85 % of the free area. */
function fitDist() {
  const f = freeArea();
  const frac = Math.max(0.2, Math.min(f.w / window.innerWidth, f.h / window.innerHeight));
  const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * frac * 0.85);
  // The view across the free area may be narrower than its height.
  const halfW = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (f.w / window.innerHeight) * 0.85);
  return 1 / Math.sin(Math.min(half, halfW));
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) {
    offsetS += dt * Number(speedSel.value);
    if (offsetS > WINDOW_S / 2) {
      // Time leaves the middle of the window: move the window forward and load a new
      // batch. The old batch still covers 15 more days, so it stays in use until the
      // new one arrives.
      const nowMs = baseMs + offsetS * 1000;
      baseMs = Math.round(nowMs / 60000) * 60000;
      offsetS = (nowMs - baseMs) / 1000;
      dtInput.value = toInputValue(baseMs);
      requestBatch();
      requestSeries();
    }
    offsetInput.value = String(Math.round(offsetS / 60));
  }
  if (layoutDirty) resize();
  stepFlight(now);
  update();
  controls.update();
  updateGridLabels(grid, camera, window.innerHeight);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- Start ----------
resize();
dtInput.value = toInputValue(baseMs);
requestBatch();
selectPoint(selected, null, false);
viewEarth();
requestAnimationFrame(frame);

// Dev builds only: handles for debugging in the browser console.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__lunarnav = { camera, controls, earthMesh, sunMarker, moonBody };
}
