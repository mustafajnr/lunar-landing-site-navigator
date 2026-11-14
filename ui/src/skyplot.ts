// Local sky plot: azimuth (x, 0-360°, clockwise from north) vs elevation (y, degrees).
// Shows the Sun and Earth tracks over the time window, the current positions and the
// horizon. The horizon is flat (0°) for now. drawHorizonMask() is the place to draw the
// terrain horizon later (CONTRACTS.md section 6: 720 elevations at a 0.5° azimuth step).

export type TrackPt = [az: number, el: number];

export interface SkyPlotData {
  sunTrack: TrackPt[];
  earthTrack: TrackPt[];
  sunNow: TrackPt | null;
  earthNow: TrackPt | null;
  /** Terrain horizon: elevation_deg from the mask file, index i = azimuth i * azStepDeg. */
  mask?: { elevationDeg: number[]; azStepDeg: number } | null;
}

const C = {
  bg: '#05070a',
  ground: '#1a1208',
  grid: '#1f2630',
  axis: '#8a93a0',
  text: '#a8b0bb',
  horizon: '#c9c9c9',
  terrain: 'rgba(120, 95, 60, 0.75)',
  terrainLine: '#d7a65a',
  sun: 'rgba(255,213,74,0.6)',
  sunNow: '#ffd54a',
  earth: 'rgba(74,163,255,0.75)',
  earthNow: '#4aa3ff',
};

const AZ_LABELS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 360: 'N' };

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
  const w = cssW - m.l - m.r;
  const h = cssH - m.t - m.b;

  // Elevation range: zoom in near the poles, where the Sun and Earth stay low.
  const all = [...d.sunTrack, ...d.earthTrack].map((p) => Math.abs(p[1]));
  if (d.sunNow) all.push(Math.abs(d.sunNow[1]));
  if (d.earthNow) all.push(Math.abs(d.earthNow[1]));
  if (d.mask) all.push(...d.mask.elevationDeg.map(Math.abs));
  const maxAbs = Math.max(5, ...all);
  const elRange = maxAbs <= 10 ? 10 : maxAbs <= 15 ? 15 : maxAbs <= 30 ? 30 : 90;
  const elStep = elRange <= 15 ? 5 : elRange <= 30 ? 10 : 30;

  const x = (az: number) => m.l + (az / 360) * w;
  const y = (el: number) => m.t + h / 2 - (el / elRange) * (h / 2);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  // Plot area: sky and ground below the flat horizon.
  ctx.fillStyle = C.ground;
  ctx.fillRect(m.l, y(0), w, h / 2);

  // Grid and ticks.
  ctx.font = '10px system-ui, sans-serif';
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.grid;
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let az = 0; az <= 360; az += 45) {
    const px = Math.round(x(az)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, m.t);
    ctx.lineTo(px, m.t + h);
    ctx.stroke();
    const card = AZ_LABELS[az];
    ctx.fillText(card ? `${az}° ${card}` : `${az}°`, px, m.t + h + 3);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let el = -elRange; el <= elRange; el += elStep) {
    const py = Math.round(y(el)) + 0.5;
    if (el !== 0) {
      ctx.beginPath();
      ctx.moveTo(m.l, py);
      ctx.lineTo(m.l + w, py);
      ctx.stroke();
    }
    ctx.fillText(`${el > 0 ? '+' : ''}${el}°`, m.l - 4, py);
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

  drawHorizonMask(ctx, d.mask ?? null, x, y, m.t + h);

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

  const big = (p: TrackPt | null, color: string) => {
    if (!p) return;
    const px = x(p[0]);
    const py = Math.max(m.t + 4, Math.min(m.t + h - 4, y(p[1])));
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  big(d.sunNow, C.sunNow);
  big(d.earthNow, C.earthNow);
  ctx.restore();

  // Frame.
  ctx.strokeStyle = C.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(m.l + 0.5, m.t + 0.5, w - 1, h - 1);
}

/**
 * Terrain horizon outline (from the API `horizon` block, or a provided mask).
 * The area
 * below the outline is filled as terrain, and the outline is drawn on top.
 */
function drawHorizonMask(
  ctx: CanvasRenderingContext2D,
  mask: SkyPlotData['mask'],
  x: (az: number) => number,
  y: (el: number) => number,
  bottom: number,
) {
  if (!mask || mask.elevationDeg.length === 0) return;
  const n = mask.elevationDeg.length;
  const at = (i: number) => mask.elevationDeg[((i % n) + n) % n];
  ctx.beginPath();
  ctx.moveTo(x(0), bottom);
  for (let i = 0; i <= n; i++) ctx.lineTo(x(i * mask.azStepDeg), y(at(i)));
  ctx.lineTo(x(360), bottom);
  ctx.closePath();
  ctx.fillStyle = C.terrain;
  ctx.fill();
  ctx.strokeStyle = C.terrainLine;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const px = x(i * mask.azStepDeg);
    const py = y(at(i));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}
