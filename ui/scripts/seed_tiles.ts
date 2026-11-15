// Seed the site-map tile cache: download the NASA Moon Trek tiles that the site-detail map
// shows around each curated site, keep the Trek path, and write the manifest that the UI
// reads (src/detail/layers.ts). Upload: see deploy/README.md, "Tile cache".
//
// Run from ui/ (Node; the system CA store may be old, so give the Trek root CA):
//   NODE_EXTRA_CA_CERTS=scripts/sectigo-root-r46.pem npx tsx scripts/seed_tiles.ts --plan
//   NODE_EXTRA_CA_CERTS=scripts/sectigo-root-r46.pem npx tsx scripts/seed_tiles.ts
// Options:
//   --plan          print the tile count and the size estimate, then stop
//   --count         like --plan, but no size samples (no network)
//   --out DIR       output folder (default .tile-cache)
//   --max-gb N      stop if the size estimate is more than N GB (default 2)
//   --cap-km N      area half-width cap at the fine zoom levels (default 15)
//
// Output:
//   DIR/tiles/{EQ|SP}/{LAYER}/1.0.0/default/default028mm/{z}/{row}/{col}.{ext}
//   DIR/manifest.json  tile ranges per layer and zoom, and the tiles that the UI must not load
//                      (404 or fully transparent)
//   DIR/missing.json   the tiles that gave HTTP 404 (kept for resume)
//
// Rules (the same as the map, from src/detail/stack.ts):
// - Layers: stackFor(lat, lon), so the base, the local mosaics and the SP layers incl. overlays.
// - Zoom levels: all levels of each layer up to its maximum zoom.
// - Area: a square around the site in the map projection. Levels at or coarser than half the
//   start-view resolution get the full start view (all common map sizes) plus a margin.
//   Finer levels get the same square, but with a half-width of at most --cap-km.
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { transform } from 'ol/proj.js';
import type { Extent } from 'ol/extent.js';
import type TileGrid from 'ol/tilegrid/TileGrid.js';
import { LONLAT, SPS, siteStereo } from '../src/detail/moonproj';
import { makeLayer, type TrekLayer } from '../src/detail/layers';
import { DEFAULT_START_MPP, POLAR_LAT, RADIUS_VIEW_FACTOR, stackFor } from '../src/detail/stack';

const TREK = 'https://trek.nasa.gov/tiles/Moon';
const CONCURRENCY = 6; // be polite to Trek
const RETRIES = 5;
const MARGIN = 1.25;
const SAMPLES_PER_LEVEL = 5;

// Map sizes (px) used for the start view: the side panel at 1920 x 1080 and 1366 x 768,
// and full screen at the same window sizes (see src/style.css #mapPanel).
const MAP_SIZES: [number, number][] = [
  [1188, 430],
  [634, 323],
  [1920, 1050],
  [1366, 738],
];

// The main UI opens at this point (src/main.ts DEFAULT_POINT); it has no site radius.
const EXTRA_POINTS = [{ id: 'default-point', name: 'Shackleton–de Gerlache ridge', lat_deg: -89.45, lon_deg: -137.31, radius_m: null }];

type Site = { id: string; name: string; lat_deg: number; lon_deg: number; radius_m: number | null };
type Tile = { key: string; z: number; col: number; row: number; ext: string };
type Range = [number, number, number, number]; // minCol, maxCol, minRow, maxRow

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const PLAN_ONLY = args.includes('--plan');
const OUT = opt('--out', '.tile-cache');
const MAX_BYTES = Number(opt('--max-gb', '2')) * 1e9;
const CAP_M = Number(opt('--cap-km', '15')) * 1000;

const EQ_RES0 = 180 / 256;
const SP_RES0 = 30578404.017857101 * 0.00028;
const M_PER_DEG = (2 * Math.PI * 1737400) / 360;
/** Ground m/px of a zoom level (EQ: along latitude). */
const levelMpp = (l: TrekLayer, z: number) => (l.proj === 'EQ' ? (EQ_RES0 / 2 ** z) * M_PER_DEG : SP_RES0 / 2 ** z);

const tilePath = (t: Tile) => `${t.key}/1.0.0/default/default028mm/${t.z}/${t.row}/${t.col}.${t.ext}`;
const tileId = (t: Tile) => `${t.key}/${t.z}/${t.row}/${t.col}`;

/** Start view: finest resolution over the map sizes, and the largest half-width/height. */
function startView(radiusM: number | null) {
  let minRes = Infinity;
  let half = 0;
  for (const [w, h] of MAP_SIZES) {
    const res = radiusM ? (radiusM * RADIUS_VIEW_FACTOR) / Math.max(100, Math.min(w, h)) : DEFAULT_START_MPP;
    minRes = Math.min(minRes, res);
    half = Math.max(half, (res * Math.max(w, h)) / 2);
  }
  return { minRes, half: half * MARGIN };
}

/** Extent in the layer's source CRS that covers a square (half-width `half` m) around the
 *  site in the map projection. */
function sourceExtent(l: TrekLayer, lat: number, lon: number, half: number): Extent | null {
  const polar = lat <= POLAR_LAT;
  const view = polar ? SPS : siteStereo(lat, lon);
  const [cx, cy] = transform([lon, lat], LONLAT, view);
  const sq: Extent = [cx - half, cy - half, cx + half, cy + half];
  let ext: Extent;
  if (l.proj === 'SP' && polar) {
    ext = sq;
  } else {
    const src = l.proj === 'EQ' ? LONLAT : SPS;
    const xs: number[] = [];
    const ys: number[] = [];
    const n = 32;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const p = transform([sq[0] + ((sq[2] - sq[0]) * i) / n, sq[1] + ((sq[3] - sq[1]) * j) / n], view, src);
        xs.push(p[0]);
        ys.push(p[1]);
      }
    ext = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (l.proj === 'EQ') {
      // The square holds a pole, or crosses lon 180: take all longitudes.
      const [px, py] = transform([0, lat < 0 ? -90 : 90], LONLAT, view);
      const hasPole = px >= sq[0] && px <= sq[2] && py >= sq[1] && py <= sq[3];
      if (hasPole) ext = [-180, lat < 0 ? -90 : ext[1], 180, lat < 0 ? ext[3] : 90];
      else if (ext[2] - ext[0] > 180) ext = [-180, ext[1], 180, ext[3]];
    }
  }
  const [b0, b1, b2, b3] = l.bbox;
  const out: Extent = [Math.max(ext[0], b0), Math.max(ext[1], b1), Math.min(ext[2], b2), Math.min(ext[3], b3)];
  return out[0] < out[2] && out[1] < out[3] ? out : null;
}

function planSite(s: Site) {
  const { minRes, half } = startView(s.radius_m);
  const out: { l: TrekLayer; z: number; range: Range }[] = [];
  // Layers with their own tile URL (slope, made by data/scripts/make_slope_tiles.py) are not Trek tiles.
  for (const l of stackFor(s.lat_deg, s.lon_deg).filter((x) => !x.url)) {
    const grid = makeLayer(l).getSource()!.getTileGrid() as TileGrid;
    for (let z = 0; z <= l.maxZ; z++) {
      const h = levelMpp(l, z) >= minRes / 2 ? half : Math.min(half, CAP_M);
      const ext = sourceExtent(l, s.lat_deg, s.lon_deg, h);
      if (!ext) continue;
      // Shrink by a tiny amount so an extent on a tile edge does not take the next tile.
      const e = 1e-9 * (l.proj === 'EQ' ? 1 : 1e5);
      const r = grid.getTileRangeForExtentAndZ([ext[0] + e, ext[1] + e, ext[2] - e, ext[3] - e], z);
      out.push({ l, z, range: [r.minX, r.maxX, r.minY, r.maxY] });
    }
  }
  return out;
}

// ---------- download ----------

async function exists(p: string) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Download one tile. Returns its size, 0 for 404, or throws after the retries. */
async function fetchTile(t: Tile, missing: Set<string>): Promise<number> {
  const file = join(OUT, 'tiles', tilePath(t));
  if (missing.has(tileId(t))) return 0;
  try {
    return (await stat(file)).size;
  } catch {
    /* not there yet */
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${TREK}/${tilePath(t)}`, { signal: AbortSignal.timeout(60000) });
      if (r.status === 404) {
        await r.arrayBuffer().catch(() => undefined);
        missing.add(tileId(t));
        return 0;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) throw new Error('empty body');
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file + '.part', buf);
      await rename(file + '.part', file);
      return buf.length;
    } catch (e) {
      if (attempt >= RETRIES) throw new Error(`${tilePath(t)}: ${(e as Error).message}`);
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
    }
  }
}

async function runPool<T>(items: T[], fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/** True if the PNG is 8-bit grey+alpha or RGBA and all its image data bytes are 0 (fully
 *  transparent). Any other PNG gives false. */
function isTransparentPng(buf: Buffer): boolean {
  if (buf.readUInt32BE(0) !== 0x89504e47) return false;
  let p = 8;
  let colorType = -1;
  let depth = 0;
  let width = 0;
  const idat: Buffer[] = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      depth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  if (depth !== 8 || (colorType !== 4 && colorType !== 6)) return false;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * (colorType === 4 ? 2 : 4) + 1;
  for (let i = 0; i < raw.length; i++) if (i % stride !== 0 && raw[i] !== 0) return false;
  return raw.length > 0;
}

const fmtMB = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

async function main() {
  const sitesFile = new URL('../../data/sites.json', import.meta.url);
  const sites: Site[] = [...EXTRA_POINTS, ...JSON.parse(await readFile(sitesFile, 'utf8'))];
  const missingFile = join(OUT, 'missing.json');
  const missing = new Set<string>(
    (await exists(missingFile)) ? (JSON.parse(await readFile(missingFile, 'utf8')) as string[]) : [],
  );
  const saveMissing = () => writeFile(missingFile, JSON.stringify([...missing].sort()));
  await mkdir(OUT, { recursive: true });

  // Plan: unique tiles, ranges per layer and zoom, tiles per site.
  const tiles = new Map<string, Tile>();
  const ranges = new Map<string, Map<number, Range[]>>();
  const levels = new Map<string, Tile[]>(); // "key z" -> tiles (for the size samples)
  const perSite = new Map<string, Set<string>>();
  for (const s of sites) {
    const ids = new Set<string>();
    for (const { l, z, range } of planSite(s)) {
      const key = `${l.proj}/${l.id}`;
      const zr = ranges.get(key) ?? new Map<number, Range[]>();
      ranges.set(key, zr);
      const list = zr.get(z) ?? [];
      zr.set(z, list);
      const inside = (a: Range, b: Range) => a[0] >= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] <= b[3];
      if (!list.some((r) => inside(range, r))) {
        for (let k = list.length - 1; k >= 0; k--) if (inside(list[k], range)) list.splice(k, 1);
        list.push(range);
      }
      for (let row = range[2]; row <= range[3]; row++)
        for (let col = range[0]; col <= range[1]; col++) {
          const t: Tile = { key, z, col, row, ext: l.ext };
          const id = tileId(t);
          ids.add(id);
          if (!tiles.has(id)) {
            tiles.set(id, t);
            const lk = `${key} ${z}`;
            levels.set(lk, [...(levels.get(lk) ?? []), t]);
          }
        }
    }
    perSite.set(s.id, ids);
  }

  // Size estimate: a few sample tiles per layer and zoom (they stay in the cache).
  if (!args.includes('--count')) console.log(`Sampling tile sizes (${levels.size} layer/zoom levels)...`);
  const sampleJobs: Tile[] = [];
  for (const list of args.includes('--count') ? [] : levels.values()) {
    const n = Math.min(SAMPLES_PER_LEVEL, list.length);
    for (let k = 0; k < n; k++) sampleJobs.push(list[Math.floor(((k + 0.5) * list.length) / n)]);
  }
  const sizeOf = new Map<string, number>();
  await runPool(sampleJobs, async (t) => {
    sizeOf.set(tileId(t), await fetchTile(t, missing));
  });
  await saveMissing();
  const meanSize = new Map<string, number>();
  for (const [lk, list] of levels) {
    const s = list.map((t) => sizeOf.get(tileId(t))).filter((v): v is number => v !== undefined);
    meanSize.set(lk, s.reduce((a, b) => a + b, 0) / Math.max(1, s.length));
  }
  const est = (t: Tile) => meanSize.get(`${t.key} ${t.z}`) ?? 0;

  console.log('\nPer site (a tile shared by sites counts for each):');
  for (const s of sites) {
    const ids = perSite.get(s.id)!;
    let b = 0;
    for (const id of ids) b += est(tiles.get(id)!);
    console.log(`  ${s.id.padEnd(40)} ${String(ids.size).padStart(7)} tiles  ~${fmtMB(b)}`);
  }
  console.log('\nPer layer:');
  const perLayer = new Map<string, [number, number]>();
  for (const t of tiles.values()) {
    const v = perLayer.get(t.key) ?? [0, 0];
    perLayer.set(t.key, [v[0] + 1, v[1] + est(t)]);
  }
  for (const [k, [n, b]] of perLayer) console.log(`  ${k.padEnd(50)} ${String(n).padStart(7)} tiles  ~${fmtMB(b)}`);
  let total = 0;
  for (const t of tiles.values()) total += est(t);
  console.log(`\nTotal (unique): ${tiles.size} tiles, estimated ${fmtMB(total)}. Limit ${fmtMB(MAX_BYTES)}.`);
  if (total > MAX_BYTES) {
    console.error('The plan is larger than the limit. Use a smaller --cap-km.');
    process.exit(2);
  }
  if (PLAN_ONLY || args.includes('--count')) return;

  // Download all.
  const all = [...tiles.values()];
  let done = 0;
  let bytes = 0;
  const errors: string[] = [];
  const t0 = Date.now();
  const timer = setInterval(() => {
    const rate = done / ((Date.now() - t0) / 1000);
    console.log(`  ${done}/${all.length} tiles, ${fmtMB(bytes)}, ${missing.size} missing, ${rate.toFixed(1)}/s`);
    void saveMissing();
  }, 15000);
  await runPool(all, async (t) => {
    try {
      const n = await fetchTile(t, missing);
      bytes += n;
    } catch (e) {
      errors.push((e as Error).message);
    }
    done++;
  });
  clearInterval(timer);
  await saveMissing();
  console.log(`Done: ${done} tiles, ${fmtMB(bytes)} on disk, ${missing.size} not on Trek (404), ${errors.length} errors.`);
  if (errors.length) {
    console.error(errors.slice(0, 20).join('\n'));
    console.error('Some tiles failed. Run the script again (it resumes). No manifest written.');
    process.exit(1);
  }

  // Trek sends HTTP 200 with a fully transparent PNG for many tiles without data. The UI
  // does not need to load those either.
  const empty: Tile[] = [];
  await runPool(all, async (t) => {
    const file = join(OUT, 'tiles', tilePath(t));
    if (!missing.has(tileId(t)) && t.ext === 'png' && (await stat(file)).size < 4096 && isTransparentPng(await readFile(file)))
      empty.push(t);
  });
  console.log(`${empty.length} tiles are fully transparent.`);

  // Manifest: ranges per layer and zoom; the tiles inside the ranges that the UI must not
  // load (404 or fully transparent), as row runs [row, firstCol, lastCol].
  const manifest = { version: 1, created: new Date().toISOString(), layers: {} as Record<string, Record<string, Range[]>>, skip: {} as Record<string, Record<string, [number, number, number][]>> };
  for (const [key, zr] of ranges) {
    manifest.layers[key] = {};
    for (const [z, list] of [...zr].sort((a, b) => a[0] - b[0])) manifest.layers[key][z] = list;
  }
  const skip = [...[...missing].map((id) => tiles.get(id)).filter((t): t is Tile => !!t), ...empty];
  skip.sort((a, b) => a.key.localeCompare(b.key) || a.z - b.z || a.row - b.row || a.col - b.col);
  for (const t of skip) {
    const runs = ((manifest.skip[t.key] ??= {})[t.z] ??= []);
    const last = runs[runs.length - 1];
    if (last && last[0] === t.row && last[2] === t.col - 1) last[2] = t.col;
    else runs.push([t.row, t.col, t.col]);
  }
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Wrote ${join(OUT, 'manifest.json')}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
