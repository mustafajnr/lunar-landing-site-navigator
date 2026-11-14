// Local sky plot: azimuth (x, clockwise from north) vs elevation (y, degrees).
// Shows the Sun and Earth tracks over the time window, the current positions and the
// horizon: the flat 0° line, and the terrain outline when the API sends one
// (CONTRACTS.md section 6: 720 elevations at a 0.5° azimuth step).
// The Sun and Earth are drawn as disks of their true angular size at the plot scale. The
// user can zoom the elevation axis and centre the azimuth axis on the Sun or Earth.

export type TrackPt = [az: number, el: number];

export type ElZoom = 'auto' | number;
export type AzMode = 'full' | 'sun' | 'earth';

export interface SkyPlotData {
  sunTrack: TrackPt[];
  earthTrack: TrackPt[];
  sunNow: TrackPt | null;
  earthNow: TrackPt | null;
  /** Angular radius of the disks, degrees (Sun about 0.27°, Earth about 0.95°). */
  sunRadiusDeg: number;
  earthRadiusDeg: number;
  /** Terrain horizon: elevation_deg from the mask, index i = azimuth i * azStepDeg. */
  mask?: { elevationDeg: number[]; azStepDeg: number } | null;
  /** Elevation half-range in degrees, or 'auto'. */
  elZoom: ElZoom;
  azMode: AzMode;
}

const C = {
  bg: '#05070a',
  ground: '#1a1208',
  grid: '#1f2630',
  axis: '#8a93a0',
  text: '#a8b0bb',
  horizon: '#c9c9c9',
  terrain: 'rgba(120, 95, 60, 0.75)',
  terrainSolid: 'rgb(96, 76, 49)',
  terrainLine: '#d7a65a',
  sun: 'rgba(255,213,74,0.6)',
  sunNow: '#ffd54a',
  earth: 'rgba(74,163,255,0.75)',
  earthNow: '#4aa3ff',
};

const FONT = '10px system-ui, sans-serif';
/** Elevation tick steps (degrees) and the minimum distance between two labels (px). */
const EL_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 45];
const EL_LABEL_GAP = 18;
/** Width of the column for the rotated "Elevation" title (centre at x = 10). */
const TITLE_W = 16;

const CARD: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
const mod360 = (a: number) => ((a % 360) + 360) % 360;

/** Elevation of the terrain mask at an azimuth (linear interpolation), or 0 without a mask. */
function maskEl(mask: SkyPlotData['mask'], az: number) {
  if (!mask || !mask.elevationDeg.length) return 0;
  const n = mask.elevationDeg.length;
  const f = mod360(az) / mask.azStepDeg;
  const i = Math.floor(f);
  const a = mask.elevationDeg[i % n];
  const b = mask.elevationDeg[(i + 1) % n];
  return a + (b - a) * (f - i);
}

export function drawSkyPlot(canvas: HTMLCanvasElement, d: SkyPlotData) {
  // Match the canvas pixels to its CSS size for sharp text.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 300;
  const cssH = canvas.clientHeight || 200;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const m = { l: 38, r: 18, t: 8, b: 32 };
  const h = cssH - m.t - m.b;

  // Elevation range. Auto: zoom in near the poles, where the Sun and Earth stay low.
  let elRange: number;
  if (d.elZoom === 'auto') {
    const all = [...d.sunTrack, ...d.earthTrack].map((p) => Math.abs(p[1]));
    if (d.sunNow) all.push(Math.abs(d.sunNow[1]));
    if (d.earthNow) all.push(Math.abs(d.earthNow[1]));
    if (d.mask) all.push(...d.mask.elevationDeg.map(Math.abs));
    const maxAbs = Math.max(5, ...all);
    elRange = maxAbs <= 10 ? 10 : maxAbs <= 15 ? 15 : maxAbs <= 30 ? 30 : 90;
  } else {
    elRange = d.elZoom;
  }
  const pxEl = h / (2 * elRange); // px per degree of elevation
  // Tick step from the pixel scale: labels are at least EL_LABEL_GAP px apart at all zooms.
  const elStep = EL_STEPS.find((s) => s * pxEl >= EL_LABEL_GAP) ?? 90;
  const elTicks: number[] = [];
  for (let i = Math.ceil(-elRange / elStep - 1e-9); i * elStep <= elRange + 1e-9; i++) {
    elTicks.push(Math.round(i * elStep * 100) / 100);
  }
  const elText = (v: number) => `${v > 0 ? '+' : ''}${v}°`;
  // Left margin from the widest label, so the labels do not touch the axis title.
  ctx.font = FONT;
  const labelW = Math.max(...elTicks.map((v) => ctx.measureText(elText(v)).width));
  m.l = Math.max(m.l, Math.ceil(TITLE_W + labelW + 6));
  const w = cssW - m.l - m.r;

  // Azimuth window. Around a body: same degrees per pixel on both axes, so disks are round.
  const body = d.azMode === 'sun' ? d.sunNow : d.azMode === 'earth' ? d.earthNow : null;
  let azSpan = 360;
  let az0 = 0;
  if (body) {
    azSpan = Math.min(360, (2 * elRange * w) / h);
    az0 = body[0] - azSpan / 2;
  }
  const pxAz = w / azSpan; // px per degree of azimuth

  const x = (az: number) => {
    let a = mod360(az - az0);
    if (azSpan >= 360 && a === 0 && az >= 360) a = 360;
    return m.l + a * pxAz;
  };
  const y = (el: number) => m.t + h / 2 - el * pxEl;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  // Plot area: ground below the flat horizon.
  ctx.fillStyle = C.ground;
  ctx.fillRect(m.l, y(0), w, h / 2);

  // Grid and ticks.
  ctx.font = FONT;
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const azStep = azSpan >= 360 ? 45 : [0.5, 1, 2, 5, 10, 15, 30, 45].find((s) => azSpan / s <= 7) ?? 45;
  for (let az = Math.ceil(az0 / azStep) * azStep; az <= az0 + azSpan + 1e-9; az += azStep) {
    const px = Math.round(m.l + (az - az0) * pxAz) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, m.t);
    ctx.lineTo(px, m.t + h);
    ctx.stroke();
    const a = Math.round(mod360(az) * 10) / 10;
    const shown = azSpan >= 360 && az >= 360 ? 360 : a;
    const card = CARD[shown % 360];
    // 6 px below the plot: clear of the lowest elevation label (centred on the bottom edge).
    ctx.fillText(card ? `${shown}° ${card}` : `${shown}°`, px, m.t + h + 6);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const el of elTicks) {
    const py = Math.round(y(el)) + 0.5;
    if (el !== 0) {
      ctx.beginPath();
      ctx.moveTo(m.l, py);
      ctx.lineTo(m.l + w, py);
      ctx.stroke();
    }
    ctx.fillText(elText(el), m.l - 4, py);
  }

  // Axis titles.
  ctx.fillStyle = C.axis;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Azimuth (clockwise from north)', m.l + w / 2, cssH - 1);
  ctx.save();
  ctx.translate(10, m.t + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'middle';
  ctx.fillText('Elevation', 0, 0);
  ctx.restore();

  // Clip the data to the plot area.
  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t, w, h);
  ctx.clip();

  const terrain = (fill: string, outline: boolean) =>
    drawHorizonMask(ctx, d.mask ?? null, az0, azSpan, pxAz, x, y, m.t + h, fill, outline);
  terrain(C.terrain, true);

  // Flat horizon line (0°).
  ctx.strokeStyle = C.horizon;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(m.l, Math.round(y(0)) + 0.5);
  ctx.lineTo(m.l + w, Math.round(y(0)) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  const dots = (pts: TrackPt[], color: string) => {
    ctx.fillStyle = color;
    for (const [az, el] of pts) ctx.fillRect(x(az) - 0.8, y(el) - 0.8, 1.6, 1.6);
  };
  dots(d.sunTrack, C.sun);
  dots(d.earthTrack, C.earth);

  // Current Sun and Earth. A disk of true angular size if it is big enough to see,
  // else a fixed-size marker.
  const disk = (p: TrackPt | null, rDeg: number, color: string) => {
    if (!p) return;
    const px = x(p[0]);
    const cosEl = Math.max(0.05, Math.cos((p[1] * Math.PI) / 180));
    const rx = (rDeg / cosEl) * pxAz;
    const ry = rDeg * pxEl;
    if (ry < 4 || rx < 2) {
      const py = Math.max(m.t + 4, Math.min(m.t + h - 4, y(p[1])));
      ctx.fillStyle = color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }
    const py = y(p[1]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // The terrain hides the part of the disk below the horizon outline.
    if (d.mask) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(px - rx - 2, py - ry - 2, 2 * rx + 4, 2 * ry + 4);
      ctx.clip();
      terrain(C.terrainSolid, true);
      ctx.restore();
    }
    // Outline of the whole disk, so the hidden part still shows.
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  disk(d.sunNow, d.sunRadiusDeg, C.sunNow);
  disk(d.earthNow, d.earthRadiusDeg, C.earthNow);
  ctx.restore();

  // Frame.
  ctx.strokeStyle = C.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(m.l + 0.5, m.t + 0.5, w - 1, h - 1);
}

/**
 * Terrain horizon outline (from the API `horizon` block, or a provided mask).
 * The area below the outline is filled as terrain, and the outline is drawn on top.
 * Draws the azimuth window [az0, az0 + span].
 */
function drawHorizonMask(
  ctx: CanvasRenderingContext2D,
  mask: SkyPlotData['mask'],
  az0: number,
  span: number,
  pxAz: number,
  x: (az: number) => number,
  y: (el: number) => number,
  bottom: number,
  fill: string,
  outline: boolean,
) {
  if (!mask || mask.elevationDeg.length === 0) return;
  // Sample at the mask step, or finer when zoomed in (2 samples per pixel at most).
  const step = Math.max(0.5 / pxAz, Math.min(mask.azStepDeg, span / 400));
  const n = Math.ceil(span / step);
  const xs: number[] = [];
  const ys: number[] = [];
  const xl = x(az0);
  for (let i = 0; i <= n; i++) {
    const az = az0 + Math.min(span, i * step);
    xs.push(xl + (az - az0) * pxAz);
    ys.push(y(maskEl(mask, az)));
  }
  ctx.beginPath();
  ctx.moveTo(xs[0], bottom);
  for (let i = 0; i <= n; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.lineTo(xs[n], bottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (!outline) return;
  ctx.strokeStyle = C.terrainLine;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    if (i === 0) ctx.moveTo(xs[i], ys[i]);
    else ctx.lineTo(xs[i], ys[i]);
  }
  ctx.stroke();
}
