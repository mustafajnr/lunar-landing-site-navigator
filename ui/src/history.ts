// View history: Back and Forward for the point and the period.
// A view goes into the browser history (pushState), so the browser Back and Forward
// buttons also work. The URL does not change.

export interface View {
  latDeg: number;
  lonDeg: number;
  siteId: string | null;
  /** The point name at record time (site, gazetteer feature or empty). */
  name: string;
  startMs: number;
  durationDays: number;
  heightM: number;
}

interface HistState {
  lnav: { i: number; view: View };
}

const COALESCE_MS = 800;
const MAX_ENTRIES = 50;

const same = (a: View, b: View) =>
  Math.abs(a.latDeg - b.latDeg) < 1e-9 &&
  Math.abs(a.lonDeg - b.lonDeg) < 1e-9 &&
  a.siteId === b.siteId &&
  a.startMs === b.startMs &&
  a.durationDays === b.durationDays &&
  a.heightM === b.heightM;

export interface ViewHistory {
  /** Call after each change that the user commits. Changes in one burst give one entry. */
  note(): void;
  /** True while a view is restored: changes then do not make entries. */
  readonly restoring: boolean;
}

export function setupHistory(opts: {
  current: () => View;
  restore: (v: View) => void;
  backBtn: HTMLButtonElement;
  fwdBtn: HTMLButtonElement;
  status: HTMLElement;
  describe: (v: View, back: boolean) => string;
}): ViewHistory {
  const st = (history.state as Partial<HistState> | null)?.lnav;
  let idx = st && Number.isInteger(st.i) ? st.i : 0;
  let top = idx; // the last entry that this page knows
  let cur = opts.current();
  let lastPushAt = 0;
  let timer = 0;
  let restoring = false;
  let statusTimer = 0;

  const write = (push: boolean) => {
    const s: HistState = { lnav: { i: idx, view: cur } };
    if (push) history.pushState({ ...(history.state ?? {}), ...s }, '');
    else history.replaceState({ ...(history.state ?? {}), ...s }, '');
  };
  write(false);

  const update = () => {
    opts.backBtn.disabled = idx <= Math.max(0, top - (MAX_ENTRIES - 1));
    opts.fwdBtn.disabled = idx >= top;
  };
  update();

  const commit = () => {
    timer = 0;
    const v = opts.current();
    if (same(v, cur)) return;
    cur = v;
    const now = performance.now();
    if (idx > 0 && now - lastPushAt < COALESCE_MS) {
      write(false); // the same burst: change the last entry
    } else {
      idx += 1;
      top = idx;
      write(true);
    }
    lastPushAt = now;
    update();
  };

  window.addEventListener('popstate', (e) => {
    const s = (e.state as Partial<HistState> | null)?.lnav;
    if (!s || !s.view) return;
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    const back = s.i < idx;
    idx = s.i;
    if (idx > top) top = idx;
    cur = s.view;
    lastPushAt = 0;
    restoring = true;
    try {
      opts.restore(s.view);
    } finally {
      restoring = false;
    }
    update();
    opts.status.textContent = opts.describe(s.view, back);
    opts.status.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => (opts.status.hidden = true), 3000);
  });

  opts.backBtn.addEventListener('click', () => {
    if (!opts.backBtn.disabled) history.back();
  });
  opts.fwdBtn.addEventListener('click', () => {
    if (!opts.fwdBtn.disabled) history.forward();
  });

  return {
    note() {
      if (restoring || timer) return;
      timer = window.setTimeout(commit, 0);
    },
    get restoring() {
      return restoring;
    },
  };
}
