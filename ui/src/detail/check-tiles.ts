// Spike self-check (run in Node): `npx tsx src/detail/check-tiles.ts`
// Prints, for each test site and layer, the max-zoom tile URL at the site,
// then fetches it and reports the HTTP status and CORS header.
import { transform } from 'ol/proj.js';
import { LONLAT, SPS } from './moonproj';
import { EQ_GLOBAL, EQ_LOCAL, SP_LAYERS, makeLayer, nominalMpp, type TrekLayer } from './layers';

const sites: [string, number, number][] = [
  ['Shackleton rim', -89.45, -137.31],
  ['Apollo 11', 0.67416, 23.47314],
  ['Malapert Massif (Artemis III)', -85.9861, -0.255],
];

async function main() {
  for (const [name, lat, lon] of sites) {
    console.log(`\n== ${name} (${lat}, ${lon})`);
    const defs: TrekLayer[] = lat <= -75 ? [EQ_GLOBAL[0], ...SP_LAYERS, ...EQ_LOCAL] : [...EQ_GLOBAL, ...EQ_LOCAL];
    for (const d of defs) {
      const src = makeLayer(d).getSource()!;
      const grid = src.getTileGrid()!;
      const c = d.proj === 'EQ' ? [lon, lat] : transform([lon, lat], LONLAT, SPS);
      const [x0, y0, x1, y1] = d.bbox;
      if (c[0] < x0 || c[0] > x1 || c[1] < y0 || c[1] > y1) continue;
      const tc = grid.getTileCoordForCoordAndZ(c, d.maxZ);
      const url = src.getTileUrlFunction()(tc, 1, src.getProjection()!)!;
      const r = await fetch(url, { headers: { Origin: 'http://localhost:5173' } });
      const len = (await r.arrayBuffer()).byteLength;
      console.log(`${r.status} cors=${r.headers.get('access-control-allow-origin')} ${len}B ${nominalMpp(d).toFixed(2)} m/px ${d.id} ${url}`);
    }
  }
}
main();
