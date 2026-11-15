// Small checks for src/quickmap.ts (the UI has no test runner).
// Run: npx tsx scripts/check_quickmap.ts
import { quickmapUrl } from '../src/quickmap.ts';

let fail = 0;
function eq(got: string, want: string, what: string) {
  if (got !== want) {
    fail++;
    console.error(`FAIL ${what}\n  got  ${got}\n  want ${want}`);
  } else console.log(`ok   ${what}`);
}
const H = 'https://quickmap.lroc.im-ldi.com/?';

eq(quickmapUrl(-89.45, -137.31, null), H + 'proj=27&center=-137.31,-89.45&resolution=6&stack=3314,3421,3388', 'ridge, no radius');
eq(quickmapUrl(-89.45, -137.31, 1000), H + 'proj=27&center=-137.31,-89.45&resolution=3.25&stack=3314,3421,3388', 'ridge, radius 1000 m');
eq(quickmapUrl(-86.7717, 23.67, 100), H + 'proj=27&center=23.67,-86.7717&resolution=2&stack=3314,3421,3388', 'clamp to 2 m/px');
eq(quickmapUrl(0.6742, 23.4731, null), H + 'proj=16&center=23.4731,0.6742&resolution=5&stack=3314,3388', 'Apollo 11, no radius');
eq(quickmapUrl(0.6742, 23.4731, 1e6), H + 'proj=16&center=23.4731,0.6742&resolution=200&stack=3314,3388', 'clamp to 200 m/px');
eq(quickmapUrl(-75, 300, null), H + 'proj=27&center=-60,-75&resolution=6&stack=3314,3421,3388', 'lat -75 is polar, lon 300 -> -60');
eq(quickmapUrl(-74.99, 10, null), H + 'proj=16&center=10,-74.99&resolution=5&stack=3314,3388', 'lat -74.99 is not polar');
eq(quickmapUrl(80, 180, 5000), H + 'proj=26&center=180,80&resolution=16.25&stack=3314,3388', 'north polar, lon 180');

if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log('all checks passed');
