// Saved searches: the inputs of one /v1/series request, with a name.
// The list is kept in localStorage. All storage access is in try/catch: without
// localStorage, the list works for this page only.

export interface SearchInputs {
  /** Curated site name, or the coordinates as text. */
  siteName: string;
  /** Curated site id, or null for a custom point. */
  siteId: string | null;
  latDeg: number;
  lonDeg: number;
  /** Site radius from sites.json, or null for a custom point. Kept for a later task. */
  radiusM: number | null;
  observerHeightM: number;
  startUtc: string;
  stopUtc: string;
  stepMinutes: number;
  terrain: 'auto' | 'none';
}

export interface SavedSearch extends SearchInputs {
  id: string;
  name: string;
  savedUtc: string;
}

const STORE_KEY = 'lunarnav.savedSearches.v1';
const FILE_FORMAT = 'lunarnav-saved-searches';
const MAX_ITEMS = 200;
const MAX_STEPS = 20000; // API limit (CONTRACTS.md section 5)

/** Same key for the same request inputs. Used for the result cache and duplicates. */
export function searchKey(s: SearchInputs): string {
  return JSON.stringify([
    s.latDeg,
    s.lonDeg,
    s.observerHeightM,
    Date.parse(s.startUtc),
    Date.parse(s.stopUtc),
    s.stepMinutes,
    s.terrain,
  ]);
}

const day = (iso: string) => iso.slice(0, 10);
export function defaultName(s: SearchInputs): string {
  return `${s.siteName}, ${day(s.startUtc)} to ${day(s.stopUtc)}`;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ---------- Storage ----------

function readStore(): { list: SavedSearch[]; ok: boolean } {
  try {
    const text = window.localStorage.getItem(STORE_KEY);
    if (!text) return { list: [], ok: true };
    const v = validateList(JSON.parse(text));
    return v.ok ? { list: v.list, ok: true } : { list: [], ok: true };
  } catch {
    return { list: [], ok: false };
  }
}

function writeStore(list: SavedSearch[]): boolean {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ---------- Validation (storage and import) ----------

type ListResult = { ok: true; list: SavedSearch[] } | { ok: false; error: string };

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isIso = (x: unknown): x is string => typeof x === 'string' && Number.isFinite(Date.parse(x));

function validateItem(x: unknown): { ok: true; s: SavedSearch } | { ok: false; error: string } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, error: 'It is not an object.' };
  const o = x as Record<string, unknown>;
  if (!isNum(o.latDeg) || o.latDeg <= -90 || o.latDeg >= 90) return { ok: false, error: 'latDeg must be a number between -90 and +90.' };
  if (!isNum(o.lonDeg) || o.lonDeg < -180 || o.lonDeg > 360) return { ok: false, error: 'lonDeg must be a number from -180 to +360.' };
  if (!isNum(o.observerHeightM) || o.observerHeightM < 0 || o.observerHeightM > 1000)
    return { ok: false, error: 'observerHeightM must be a number from 0 to 1000.' };
  if (!isIso(o.startUtc)) return { ok: false, error: 'startUtc must be an ISO 8601 date and time.' };
  if (!isIso(o.stopUtc)) return { ok: false, error: 'stopUtc must be an ISO 8601 date and time.' };
  const startMs = Date.parse(o.startUtc);
  const stopMs = Date.parse(o.stopUtc);
  if (stopMs < startMs) return { ok: false, error: 'stopUtc must not be before startUtc.' };
  if (!isNum(o.stepMinutes) || o.stepMinutes <= 0) return { ok: false, error: 'stepMinutes must be a number more than 0.' };
  if ((stopMs - startMs) / 60000 / o.stepMinutes + 1 > MAX_STEPS)
    return { ok: false, error: `The search has more than ${MAX_STEPS} steps.` };
  const terrain = o.terrain === undefined ? 'auto' : o.terrain;
  if (terrain !== 'auto' && terrain !== 'none') return { ok: false, error: 'terrain must be "auto" or "none".' };
  const radius = o.radiusM === undefined ? null : o.radiusM;
  if (radius !== null && (!isNum(radius) || radius <= 0)) return { ok: false, error: 'radiusM must be a number more than 0, or null.' };
  if (o.siteId !== undefined && o.siteId !== null && typeof o.siteId !== 'string')
    return { ok: false, error: 'siteId must be text or null.' };
  for (const f of ['name', 'siteName', 'id', 'savedUtc'] as const) {
    if (o[f] !== undefined && typeof o[f] !== 'string') return { ok: false, error: `${f} must be text.` };
  }
  const lon = o.lonDeg > 180 ? o.lonDeg - 360 : o.lonDeg;
  const inputs: SearchInputs = {
    siteName: ((o.siteName as string | undefined) ?? '').trim().slice(0, 120) || `${o.latDeg.toFixed(4)}°, ${lon.toFixed(4)}°`,
    siteId: (o.siteId as string | null | undefined) ?? null,
    latDeg: o.latDeg,
    lonDeg: lon,
    radiusM: radius,
    observerHeightM: o.observerHeightM,
    startUtc: new Date(startMs).toISOString(),
    stopUtc: new Date(stopMs).toISOString(),
    stepMinutes: o.stepMinutes,
    terrain,
  };
  return {
    ok: true,
    s: {
      ...inputs,
      id: (o.id as string | undefined) || newId(),
      name: ((o.name as string | undefined) ?? '').trim().slice(0, 160) || defaultName(inputs),
      savedUtc: isIso(o.savedUtc) ? (o.savedUtc as string) : new Date().toISOString(),
    },
  };
}

/** Accepts the export file object, or a plain array of searches. */
export function validateList(data: unknown): ListResult {
  let items: unknown = data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    if (o.format !== FILE_FORMAT) return { ok: false, error: `The file is not a saved-search file. "format" must be "${FILE_FORMAT}".` };
    items = o.searches;
  }
  if (!Array.isArray(items)) return { ok: false, error: 'The file must contain a list of searches.' };
  if (items.length > MAX_ITEMS) return { ok: false, error: `The file has more than ${MAX_ITEMS} searches.` };
  const list: SavedSearch[] = [];
  for (let i = 0; i < items.length; i++) {
    const v = validateItem(items[i]);
    if (!v.ok) return { ok: false, error: `Search ${i + 1}: ${v.error}` };
    list.push(v.s);
  }
  return { ok: true, list };
}

// ---------- UI ----------

export interface SavedUiHooks {
  /** Inputs of the search on screen now. */
  current(): SearchInputs;
  /** Restore a search in the main view. */
  load(s: SavedSearch): void;
  /** Open the comparison for 2 to 4 searches. */
  compare(list: SavedSearch[]): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function button(text: string, title?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (title) b.title = title;
  return b;
}

export function setupSaved(hooks: SavedUiHooks) {
  const stored = readStore();
  let list = stored.list;
  let storageOk = stored.ok;
  const checked = new Set<string>();

  const listEl = $<HTMLDivElement>('savedList');
  const status = $<HTMLParagraphElement>('savedStatus');
  const compareBtn = $<HTMLButtonElement>('compareBtn');
  const exportBtn = $<HTMLButtonElement>('exportBtn');
  const importBtn = $<HTMLButtonElement>('importBtn');
  const importFile = $<HTMLInputElement>('importFile');
  const storeNote = $<HTMLParagraphElement>('savedStoreNote');

  // Save box, near the results.
  const saveOpen = $<HTMLButtonElement>('saveOpen');
  const saveForm = $<HTMLFormElement>('saveForm');
  const saveName = $<HTMLInputElement>('saveName');
  const saveCancel = $<HTMLButtonElement>('saveCancel');
  const saveMsg = $<HTMLParagraphElement>('saveMsg');

  function setStatus(text: string, error = false) {
    status.textContent = text;
    status.hidden = text === '';
    status.className = error ? 'error' : 'small';
  }

  function persist() {
    if (!writeStore(list)) storageOk = false;
    storeNote.hidden = storageOk;
  }

  function render() {
    listEl.innerHTML = '';
    for (const id of [...checked]) if (!list.some((s) => s.id === id)) checked.delete(id);
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'small';
      p.textContent = 'No saved searches. Use "Save search" in the results panel.';
      listEl.append(p);
    }
    for (const s of list) {
      const row = document.createElement('div');
      row.className = 'saved-item';
      const lab = document.createElement('label');
      lab.className = 'saved-name';
      lab.title = 'Compare: select this search';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = checked.has(s.id);
      chk.setAttribute('aria-label', `Compare ${s.name}`);
      chk.addEventListener('change', () => {
        if (chk.checked) checked.add(s.id);
        else checked.delete(s.id);
        updateCompare();
      });
      const name = document.createElement('span');
      name.textContent = s.name;
      lab.append(chk, name);
      const load = button('Load', 'Show this search in the main view');
      load.addEventListener('click', () => {
        hooks.load(s);
        const span = Date.parse(s.stopUtc) - Date.parse(s.startUtc);
        setStatus(
          Math.abs(span - 60 * 86400000) > 60000 || s.stepMinutes !== 60
            ? `Loaded "${s.name}". The main view always shows ±30 days with a 60 min step. The comparison uses the saved period.`
            : `Loaded "${s.name}".`,
        );
      });
      const del = button('Delete', 'Delete this saved search');
      del.className = 'danger';
      del.addEventListener('click', () => {
        list = list.filter((x) => x.id !== s.id);
        checked.delete(s.id);
        persist();
        render();
        setStatus(`Deleted "${s.name}".`);
      });
      row.append(lab, load, del);
      listEl.append(row);
    }
    exportBtn.disabled = !list.length;
    updateCompare();
  }

  function selected(): SavedSearch[] {
    return list.filter((s) => checked.has(s.id));
  }

  function updateCompare() {
    const n = selected().length;
    compareBtn.disabled = n < 2 || n > 4;
    compareBtn.textContent = n ? `Compare (${n})` : 'Compare';
    compareBtn.title = n > 4 ? 'Select not more than 4 searches.' : 'Select 2 to 4 saved searches.';
  }

  compareBtn.addEventListener('click', () => {
    const sel = selected();
    if (sel.length < 2 || sel.length > 4) {
      setStatus('Select 2 to 4 saved searches.', true);
      return;
    }
    setStatus('');
    hooks.compare(sel);
  });

  // ----- Save -----
  saveOpen.addEventListener('click', () => {
    saveName.value = defaultName(hooks.current());
    saveForm.hidden = false;
    saveOpen.hidden = true;
    saveMsg.hidden = true;
    saveName.focus();
    saveName.select();
  });
  saveCancel.addEventListener('click', () => {
    saveForm.hidden = true;
    saveOpen.hidden = false;
  });
  saveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputs = hooks.current();
    const name = saveName.value.trim().slice(0, 160) || defaultName(inputs);
    const s: SavedSearch = { ...inputs, id: newId(), name, savedUtc: new Date().toISOString() };
    list = [...list, s];
    persist();
    render();
    saveForm.hidden = true;
    saveOpen.hidden = false;
    const same = list.filter((x) => searchKey(x) === searchKey(s)).length;
    saveMsg.textContent =
      `Saved "${name}".` + (same > 1 ? ' A saved search with the same inputs exists.' : '') + (storageOk ? '' : ' It is kept for this page only.');
    saveMsg.hidden = false;
  });

  // ----- Export -----
  exportBtn.addEventListener('click', () => {
    const data = { format: FILE_FORMAT, version: 1, exported_utc: new Date().toISOString(), searches: list };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lunarnav-saved-searches-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus(`Exported ${list.length} searches.`);
  });

  // ----- Import -----
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const f = importFile.files?.[0];
    importFile.value = '';
    if (!f) return;
    if (f.size > 2_000_000) {
      setStatus('Import failed. The file is too large (more than 2 MB).', true);
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await f.text());
    } catch {
      setStatus('Import failed. The file is not valid JSON.', true);
      return;
    }
    const v = validateList(data);
    if (!v.ok) {
      setStatus(`Import failed. ${v.error}`, true);
      return;
    }
    const ids = new Set(list.map((s) => s.id));
    const keys = new Set(list.map((s) => `${searchKey(s)}|${s.name}`));
    let added = 0;
    let skipped = 0;
    for (const s of v.list) {
      if (keys.has(`${searchKey(s)}|${s.name}`)) {
        skipped++;
        continue;
      }
      const item = ids.has(s.id) ? { ...s, id: newId() } : s;
      ids.add(item.id);
      keys.add(`${searchKey(item)}|${item.name}`);
      list.push(item);
      added++;
    }
    if (list.length > MAX_ITEMS) {
      list = list.slice(0, MAX_ITEMS);
      setStatus(`Imported ${added} searches. The list is full (${MAX_ITEMS}). Some searches were not added.`, true);
    } else {
      setStatus(`Imported ${added} searches.` + (skipped ? ` ${skipped} were already in the list.` : ''));
    }
    persist();
    render();
  });

  storeNote.hidden = storageOk;
  render();
}
