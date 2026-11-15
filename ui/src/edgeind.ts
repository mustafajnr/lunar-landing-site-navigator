// Edge indicators for the Sun and the Earth on the globe view.
// - The body is in the free screen area: a small label next to it ("Sun", "Earth").
// - The body is off the screen: an arrow and a label ("To the Sun") at the edge of the free
//   area, where the line from the Moon centre to the body leaves it.
// An indicator is hidden when the body is behind the camera and almost on the view axis
// (for example the Earth in "View from Earth"): then the screen direction has no meaning.
// It is also hidden when a panel covers it.

import * as THREE from 'three';

export interface ScreenBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Body {
  /** World position of the body centre. */
  pos: THREE.Vector3;
  /** Body radius in world units (for the on-screen label offset and the overlap test). */
  radius: number;
}

/** Edge margin, CSS px. */
const MARGIN = 30;
/** Hide the indicator of a body behind the camera if its direction is less than this from the view axis. */
const AXIS_MIN = THREE.MathUtils.degToRad(12);

interface Indicator {
  el: HTMLDivElement;
  arrow: HTMLSpanElement;
  label: HTMLSpanElement;
  onText: string;
  offText: string;
}

function make(parent: HTMLElement, cls: string, onText: string, offText: string): Indicator {
  const el = document.createElement('div');
  el.className = `edge-ind ${cls}`;
  el.hidden = true;
  const arrow = document.createElement('span');
  arrow.className = 'arr';
  arrow.textContent = '➤'; // ➤, points right at 0 rad
  const label = document.createElement('span');
  label.className = 'lbl';
  el.append(arrow, label);
  parent.append(el);
  return { el, arrow, label, onText, offText };
}

export function createEdgeIndicators(canvas: HTMLCanvasElement) {
  // The layer is just after the canvas in the DOM, so the panels paint on top of it.
  const layer = document.createElement('div');
  layer.className = 'edge-layer';
  canvas.after(layer);
  const sun = make(layer, 'sun', 'Sun', 'To the Sun');
  const earth = make(layer, 'earth', 'Earth', 'To the Earth');
  const tmp = new THREE.Vector3();

  /** Screen position (CSS px) of a view-space point. */
  function toPx(v: THREE.Vector3, camera: THREE.PerspectiveCamera) {
    tmp.copy(v).applyMatrix4(camera.projectionMatrix);
    return { x: ((tmp.x + 1) / 2) * canvas.clientWidth, y: ((1 - tmp.y) / 2) * canvas.clientHeight };
  }

  function place(ind: Indicator, body: Body | null, camera: THREE.PerspectiveCamera, box: ScreenBox, avoid: DOMRect | null) {
    const { el } = ind;
    if (!body) {
      el.hidden = true;
      return;
    }
    const inv = camera.matrixWorldInverse;
    const c0 = new THREE.Vector3().applyMatrix4(inv); // Moon centre, view space
    const pv = body.pos.clone().applyMatrix4(inv);
    const nearZ = -camera.near * 5;
    // Body direction from the Moon centre, compared with the view axis (view -z).
    const dir = pv.clone().sub(c0);
    const axisAng = Math.acos(Math.min(1, Math.abs(dir.z) / Math.max(1e-9, dir.length())));
    if (c0.z > nearZ || (pv.z > nearZ && axisAng < AXIS_MIN)) {
      el.hidden = true;
      return;
    }
    const a = toPx(c0, camera);
    // Clip the line Moon centre -> body to the space in front of the camera.
    const p1 = pv.clone();
    if (p1.z > nearZ) p1.copy(c0).lerp(pv, ((nearZ - c0.z) / (pv.z - c0.z)) * 0.999);
    const b = toPx(p1, camera);
    const x0 = box.left + MARGIN;
    const x1 = box.right - MARGIN;
    const y0 = box.top + MARGIN;
    const y1 = box.bottom - MARGIN;
    el.hidden = false;
    // Body disk radius on the screen, CSS px (0 if the body is behind the camera).
    const rPx = pv.z < nearZ ? (body.radius / -pv.z) * (canvas.clientHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) : 0;
    // A part of the disk is in the free area: "on the screen".
    const m = Math.min(rPx, 40) * 0.7;
    if (pv.z < nearZ && b.x + m > x0 && b.x - m < x1 && b.y + m > y0 && b.y - m < y1) {
      // Label at the lower right of the disk, kept inside the free area.
      ind.arrow.hidden = true;
      ind.label.textContent = ind.onText;
      el.classList.remove('flip');
      const k = Math.min(rPx, 60);
      const x = THREE.MathUtils.clamp(b.x + k * 0.7 + 6, x0, x1 - el.offsetWidth);
      const y = THREE.MathUtils.clamp(b.y + k * 0.5, y0, y1 - el.offsetHeight);
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    } else {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      let t = Infinity;
      if (dx > 1e-9) t = Math.min(t, (x1 - a.x) / dx);
      if (dx < -1e-9) t = Math.min(t, (x0 - a.x) / dx);
      if (dy > 1e-9) t = Math.min(t, (y1 - a.y) / dy);
      if (dy < -1e-9) t = Math.min(t, (y0 - a.y) / dy);
      if (!Number.isFinite(t)) t = 0;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      ind.arrow.hidden = false;
      ind.arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      ind.label.textContent = ind.offText;
      // The arrow is at the edge point; the label is on the inner side of it.
      el.classList.toggle('flip', dx >= 0);
      const w = el.offsetWidth;
      el.style.transform = `translate(${Math.round(dx >= 0 ? x - w + 9 : x - 9)}px, ${Math.round(y - 10)}px)`;
    }
    // Move the indicator up, out of the way of another rectangle (the Earth disk or the
    // other indicator).
    if (avoid) {
      const r = el.getBoundingClientRect();
      if (r.left < avoid.right && avoid.left < r.right && r.top < avoid.bottom && avoid.top < r.bottom) {
        el.style.transform += ` translateY(${Math.round(avoid.top - r.bottom - 4)}px)`;
      }
    }
    // Hide it if a panel covers its centre.
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && top !== canvas) el.hidden = true;
  }

  /** Earth disk on the screen (CSS px), or null if it is not in front of the camera. */
  function diskRect(body: Body, camera: THREE.PerspectiveCamera): DOMRect | null {
    const pv = body.pos.clone().applyMatrix4(camera.matrixWorldInverse);
    if (pv.z > -camera.near) return null;
    const c = toPx(pv, camera);
    const rPx = (body.radius / -pv.z) * (canvas.clientHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return new DOMRect(c.x - rPx, c.y - rPx, 2 * rPx, 2 * rPx);
  }

  return {
    /** Call once per frame, after the camera update. A null body hides its indicator. */
    update(camera: THREE.PerspectiveCamera, box: ScreenBox, sunBody: Body | null, earthBody: Body | null) {
      camera.updateMatrixWorld();
      // Phone layout: the canvas is in the page flow, so the layer follows its box.
      if (getComputedStyle(canvas).position !== 'fixed') {
        layer.style.top = `${canvas.offsetTop}px`;
        layer.style.left = `${canvas.offsetLeft}px`;
        layer.style.width = `${canvas.clientWidth}px`;
        layer.style.height = `${canvas.clientHeight}px`;
      } else if (layer.style.top) {
        layer.style.top = layer.style.left = layer.style.width = layer.style.height = '';
      }
      place(earth, earthBody, camera, box, null);
      // The Sun indicator keeps off the Earth disk and off the Earth indicator.
      let avoid = earthBody ? diskRect(earthBody, camera) : null;
      place(sun, sunBody, camera, box, avoid);
      if (!earth.el.hidden && !sun.el.hidden) {
        avoid = earth.el.getBoundingClientRect();
        const r = sun.el.getBoundingClientRect();
        if (r.left < avoid.right && avoid.left < r.right && r.top < avoid.bottom && avoid.top < r.bottom) {
          sun.el.style.transform += ` translateY(${Math.round(avoid.top - r.bottom - 4)}px)`;
        }
      }
    },
  };
}
