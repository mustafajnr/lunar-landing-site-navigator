// Compare sub-Earth and sub-solar points from src/ephemeris.ts with JPL Horizons.
// Run: npm run validate   (or: npx tsx scripts/validate.ts)
//
// Horizons is called with curl. The local CA store on this machine lacks the
// "Sectigo Public Server Authentication Root R46" root that signs ssd.jpl.nasa.gov,
// so we pass that root explicitly (scripts/sectigo-root-r46.pem, SHA-256
// 7B:B6:47:A6:...:5A:06, from crt.sectigo.com). TLS verification stays on.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { moonState, wrapLon } from '../src/ephemeris.ts';

const here = dirname(fileURLToPath(import.meta.url));
const CA = join(here, 'sectigo-root-r46.pem');
const TOL_DEG = 1.0;

const DATES = [
  '2026-11-14T00:00:00Z',
  '2027-02-20T06:00:00Z',
  '2027-06-01T12:00:00Z',
  '2027-10-10T18:00:00Z',
];

function horizons(utc: string): number[] {
  const start = utc.replace('T', ' ').replace(':00Z', '');
  const stop = start.replace(/:00$/, ':01');
  const params: Record<string, string> = {
    format: 'text',
    COMMAND: "'301'",
    CENTER: "'500@399'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: "'1'",
    QUANTITIES: "'14,15'",
    CSV_FORMAT: "'YES'",
    ANG_FORMAT: "'DEG'",
  };
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${qs}`;
  const args = ['-s', '--fail', '--max-time', '60'];
  if (process.env.HORIZONS_NO_CA !== '1') args.push('--cacert', CA);
  const text = execFileSync('curl', [...args, url], { encoding: 'utf8' });
  if (!/MOON_ME/.test(text) || !/East-longitude positive/.test(text)) {
    throw new Error('Unexpected Horizons frame or longitude convention:\n' + text.slice(0, 2000));
  }
  const body = text.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!body) throw new Error('No ephemeris data:\n' + text.slice(0, 2000));
  const line = body.trim().split('\n')[0];
  // "date, , , ObsLon, ObsLat, SunLon, SunLat,"
  const nums = line.split(',').slice(3, 7).map((s) => parseFloat(s));
  if (nums.some((n) => !Number.isFinite(n))) throw new Error('Parse error: ' + line);
  return nums;
}

const f = (x: number) => x.toFixed(3).padStart(8);
const dLon = (a: number, b: number) => wrapLon(a - b);

let worst = 0;
console.log('Quantity  | UTC                  | Horizons lat, lon   | Ours lat, lon       | dLat    dLon    | angular');
console.log('-'.repeat(112));
for (const utc of DATES) {
  const [hObsLon, hObsLat, hSunLon, hSunLat] = horizons(utc);
  const s = moonState(new Date(utc));
  const rows: [string, number, number, number, number][] = [
    ['sub-Earth', hObsLat, wrapLon(hObsLon), s.subEarth.latDeg, s.subEarth.lonDeg],
    ['sub-solar', hSunLat, wrapLon(hSunLon), s.subSolar.latDeg, s.subSolar.lonDeg],
  ];
  for (const [name, hLat, hLon, oLat, oLon] of rows) {
    const dl = oLat - hLat;
    const dn = dLon(oLon, hLon);
    // Great-circle separation in degrees.
    const r = Math.PI / 180;
    const ang =
      Math.acos(
        Math.min(
          1,
          Math.sin(hLat * r) * Math.sin(oLat * r) +
            Math.cos(hLat * r) * Math.cos(oLat * r) * Math.cos(dn * r),
        ),
      ) / r;
    worst = Math.max(worst, Math.abs(dl), Math.abs(dn));
    console.log(
      `${name.padEnd(9)} | ${utc} | ${f(hLat)},${f(hLon)} | ${f(oLat)},${f(oLon)} | ${f(dl)}${f(dn)} | ${f(ang)}`,
    );
  }
}
console.log('-'.repeat(112));
console.log(`Largest |dLat| or |dLon|: ${worst.toFixed(3)} deg (tolerance ${TOL_DEG} deg)`);
if (worst > TOL_DEG) {
  console.log('FAIL');
  process.exit(1);
}
console.log('PASS');
