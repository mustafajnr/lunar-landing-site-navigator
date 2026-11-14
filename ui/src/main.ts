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
import { createGrid } from './grid';
import { setupPointUi, STATUS_COLOR } from './point';
import { ResultsPanel } from './results';
import { drawSkyPlot, type TrackPt } from './skyplot';

// ---------- Scene layout ----------
// Scene units: 1 = Moon radius. `inertial` group holds the J2000 frame. Its rotation puts
// the Moon's north pole at three.js +Y (screen up). With "True sky orientation" it puts
// J2000 +z (celestial north) at +Y instead, as seen from Earth. `moonBody` holds the
// Moon ME frame: body +x = lon 0, body +y = lon 90 E, body +z = north pole.
const EARTH_DIST = 8; // scaled, not true (true ~221 Moon radii)
const EARTH_RADIUS = 0.35; // scaled, not true (true ~3.67 Moon radii)
const SUN_DIST = 14;
const DAY_S = 86400;
const WINDOW_S = 30 * DAY_S;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
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

// Sun and Earth markers in the inertial frame.
const sunMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.4, 24, 12),
  new THREE.MeshBasicMaterial({ color: 0xffe27a }),
);
inertial.add(sunMarker);
const sunLine = line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], 0xffd54a, inertial, true);

const earthMesh = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0x3d7fd9, roughness: 0.8 }),
);
inertial.add(earthMesh);
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

// ---------- State ----------
let baseMs = Math.round(Date.now() / 60000) * 60000;
let offsetS = 0;
let playing = false;
let selected: LatLon = { latDeg: -89.45, lonDeg: -137.31 }; // example point from CONTRACTS.md
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

function drawSky(nowSun: TrackPt | null, nowEarth: TrackPt | null) {
  drawSkyPlot(skyCanvas, { sunTrack, earthTrack, sunNow: nowSun, earthNow: nowEarth, mask: null });
}

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

function selectPoint(ll: LatLon, site: Site | null, fly: boolean) {
  selected = { latDeg: ll.latDeg, lonDeg: ll.lonDeg };
  pointUi.show(selected, site);
  $('selName').textContent = site ? site.name : '';
  requestSeries();
  computeTracks();
  if (fly) flyTo(selected);
}

fetchSites()
  .then((sites) => {
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
  viewFrom(state ? worldDir(state.earthDirInertial, inertial) : new THREE.Vector3(0, 0, 1), 4.5);
}
$('viewEarth').addEventListener('click', viewEarth);
// From below the south pole. The camera is 0.5° off the axis toward lon 0, so lon 0 is
// at the top of the screen.
$('viewSouth').addEventListener('click', () => viewFrom(worldDir(bodyVecOf(-89.5, 0), moonBody), 3.5));
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
  $('utc').textContent = utc.toISOString().replace('.000', '');
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

  const sunDir = v3(state.sunDirInertial);
  const earthDir = v3(state.earthDirInertial);
  sunLight.position.copy(sunDir).multiplyScalar(20);
  sunMarker.position.copy(sunDir).multiplyScalar(SUN_DIST);
  setLineEnd(sunLine, sunMarker.position);
  earthMesh.position.copy(earthDir).multiplyScalar(EARTH_DIST);
  setLineEnd(earthLine, earthDir.clone().multiplyScalar(EARTH_DIST - EARTH_RADIUS));

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
  if (first) viewEarth();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

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
  stepFlight(now);
  update();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- Start ----------
resize();
dtInput.value = toInputValue(baseMs);
requestBatch();
pointUi.show(selected, null);
requestSeries();
viewEarth();
requestAnimationFrame(frame);
