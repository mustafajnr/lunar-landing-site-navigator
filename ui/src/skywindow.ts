// Time window of the sky plot, with a time strip ("brush") for the full period.
// The sky plot shows only the track points in the window. The default window is
// DEFAULT_DAYS from the period start. The user can drag the box on the strip, zoom it
// with the mouse wheel or the +/− buttons, or click the strip to centre the box there.
// When the clock time leaves the window, the window moves by its length (see follow()).

const DAY = 86400000;
const DEFAULT_DAYS = 30;
const MIN_MS = DAY;
const ZOOM_WHEEL = 1.25;
const ZOOM_BUTTON = 2;

const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmtMin = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const fmtLen = (ms: number) => {
  const d = ms / DAY;
  return d >= 2 ? `${Math.round(d)} d` : `${+(d * 24).toFixed(1)} h`;
};

/** Tick steps: days, or months (negative numbers). */
const TICK_STEPS = [1, 2, 7, 14, -1, -2, -3, -6];

export class SkyWindow {
  private p0 = 0;
  private p1 = DAY;
  private a = 0;
  private len = DAY;
  private lastNow = NaN;
  private dragging = false;
  private readonly root: HTMLElement;
  private readonly track: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly nowLine: HTMLDivElement;
  private readonly ticks: HTMLDivElement;
  private readonly label: HTMLSpanElement;
  /** Called when the window changes. */
  onChange: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="skywin-track" title="Drag the box to move the sky plot window. Mouse wheel: change the window length.">
        <div class="skywin-now"></div>
        <div class="skywin-box" tabindex="0" role="slider"
          aria-label="Sky plot time window. Arrow keys move it by 1 day. Plus and minus change its length."></div>
      </div>
      <div class="skywin-ticks" aria-hidden="true"></div>
      <div class="row small skywin-bar">
        <span class="skywin-label"></span>
        <span class="skywin-btns">
          <button type="button" data-z="out" title="Longer window" aria-label="Longer window">−</button><button
            type="button" data-z="in" title="Shorter window" aria-label="Shorter window">+</button><button
            type="button" data-z="default">30 days</button><button type="button" data-z="full">Full period</button>
        </span>
      </div>`;
    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
    this.track = q('.skywin-track');
    this.box = q('.skywin-box');
    this.nowLine = q('.skywin-now');
    this.ticks = q('.skywin-ticks');
    this.label = q('.skywin-label');

    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-z]')) {
      b.addEventListener('click', () => {
        const z = b.dataset.z;
        if (z === 'in') this.zoom(1 / ZOOM_BUTTON, this.a + this.len / 2);
        else if (z === 'out') this.zoom(ZOOM_BUTTON, this.a + this.len / 2);
        else if (z === 'full') this.set(this.p0, this.p1 - this.p0);
        else this.set(this.a, DEFAULT_DAYS * DAY);
      });
    }

    this.track.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? ZOOM_WHEEL : 1 / ZOOM_WHEEL, this.timeAt(e.clientX));
      },
      { passive: false },
    );

    // Drag the box. A press on the strip outside the box centres the box there first.
    let grabMs = 0;
    this.track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const t = this.timeAt(e.clientX);
      if (e.target !== this.box) this.set(t - this.len / 2, this.len);
      grabMs = t - this.a;
      this.dragging = true;
      this.track.setPointerCapture(e.pointerId);
      this.box.focus({ preventScroll: true });
    });
    this.track.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.set(this.timeAt(e.clientX) - grabMs, this.len);
    });
    const end = () => (this.dragging = false);
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);

    this.box.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowDown') this.set(this.a - DAY, this.len);
      else if (k === 'ArrowRight' || k === 'ArrowUp') this.set(this.a + DAY, this.len);
      else if (k === 'PageDown') this.set(this.a - this.len, this.len);
      else if (k === 'PageUp') this.set(this.a + this.len, this.len);
      else if (k === 'Home') this.set(this.p0, this.len);
      else if (k === 'End') this.set(this.p1, this.len);
      else if (k === '+' || k === '=') this.zoom(1 / ZOOM_BUTTON, this.a + this.len / 2);
      else if (k === '-' || k === '_') this.zoom(ZOOM_BUTTON, this.a + this.len / 2);
      else return;
      e.preventDefault();
    });

    new ResizeObserver(() => this.drawTicks()).observe(this.track);
  }

  /** The window [start, end] in ms. */
  get range(): [number, number] {
    return [this.a, this.a + this.len];
  }

  /** A new period: the window goes back to the default (30 days from the start). */
  setPeriod(startMs: number, stopMs: number) {
    this.p0 = startMs;
    this.p1 = Math.max(startMs + 1, stopMs);
    this.lastNow = NaN;
    this.root.hidden = this.p1 - this.p0 <= DEFAULT_DAYS * DAY + 60000;
    this.set(startMs, DEFAULT_DAYS * DAY);
    this.drawTicks();
  }

  /** Keep the clock time in the window. Call each frame. */
  follow(nowMs: number) {
    if (nowMs === this.lastNow) return;
    this.lastNow = nowMs;
    this.nowLine.style.left = `${this.pct(nowMs)}%`;
    if (this.dragging) return;
    const [a, b] = this.range;
    if (nowMs >= a && nowMs <= b) return;
    let s = a;
    if (nowMs > b) s += Math.ceil((nowMs - b) / this.len) * this.len;
    else s -= Math.ceil((a - nowMs) / this.len) * this.len;
    this.set(s, this.len);
  }

  private zoom(f: number, aroundMs: number) {
    const len = this.clampLen(this.len * f);
    const k = this.len > 0 ? (aroundMs - this.a) / this.len : 0.5;
    this.set(aroundMs - k * len, len);
  }

  private clampLen(len: number) {
    const full = this.p1 - this.p0;
    return Math.max(Math.min(MIN_MS, full), Math.min(full, len));
  }

  private set(a: number, len: number) {
    len = this.clampLen(len);
    a = Math.max(this.p0, Math.min(this.p1 - len, a));
    if (a === this.a && len === this.len) return;
    this.a = a;
    this.len = len;
    this.box.style.left = `${this.pct(a)}%`;
    this.box.style.width = `${(len / (this.p1 - this.p0)) * 100}%`;
    const b = a + len;
    const short = len < 3 * DAY;
    const txt = `Sky plot: ${short ? fmtMin(a) : fmtDate(a)} to ${short ? fmtMin(b) : fmtDate(b)} (${fmtLen(len)})`;
    this.label.textContent = txt;
    this.box.setAttribute('aria-valuetext', txt);
    this.onChange();
  }

  private pct(ms: number) {
    return Math.max(0, Math.min(100, ((ms - this.p0) / (this.p1 - this.p0)) * 100));
  }

  private timeAt(clientX: number) {
    const r = this.track.getBoundingClientRect();
    const f = r.width > 0 ? (clientX - r.left) / r.width : 0;
    return this.p0 + Math.max(0, Math.min(1, f)) * (this.p1 - this.p0);
  }

  /** Date labels under the strip: as many as fit, about 70 px apart. */
  private drawTicks() {
    const w = this.track.clientWidth;
    this.ticks.innerHTML = '';
    if (!w) return;
    const spanDays = (this.p1 - this.p0) / DAY;
    const maxN = Math.max(2, Math.floor(w / 70));
    const step = TICK_STEPS.find((s) => spanDays / (s > 0 ? s : -s * 30.44) <= maxN) ?? -12;
    const times: number[] = [];
    if (step > 0) {
      for (let t = Math.ceil(this.p0 / DAY) * DAY; t <= this.p1; t += step * DAY) times.push(t);
    } else {
      const d = new Date(this.p0);
      const y = d.getUTCFullYear();
      let mo = d.getUTCMonth() + 1; // the first month start after p0
      mo = Math.ceil(mo / -step) * -step;
      for (;;) {
        const t = Date.UTC(y + Math.floor(mo / 12), mo % 12, 1);
        if (t > this.p1) break;
        if (t >= this.p0) times.push(t);
        mo += -step;
        if (mo > 12 * 50) break;
      }
    }
    for (const t of times) {
      const s = document.createElement('span');
      s.style.left = `${this.pct(t)}%`;
      s.textContent = step > 0 ? fmtDate(t).slice(5) : fmtDate(t).slice(0, 7);
      this.ticks.append(s);
    }
  }
}
