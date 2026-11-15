"""Make ui/public/gazetteer.json from the IAU/USGS Gazetteer of Planetary Nomenclature.

Source: MOON_nomenclature_center_pts.zip (ESRI shapefile, centre points of all Moon features).
Page:   https://planetarynames.wr.usgs.gov/GIS_Downloads
File:   https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip

Download (the folder is git-ignored):
    mkdir -p data/raw/gazetteer
    curl -sSL -o data/raw/gazetteer/MOON_nomenclature_center_pts.zip \\
        https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip
Run:
    python3 -I data/scripts/make_gazetteer.py data/raw/gazetteer/MOON_nomenclature_center_pts.zip ui/public/gazetteer.json

The zip is untrusted data. This script reads only the .dbf table (attribute records) from it,
with the standard library. It does not extract or run any file from the zip.

Source convention: planetocentric latitude, longitude 0..360 east positive (GCS_Moon_2000).
Output longitude: -180..180, east positive.
Output: {source, licence, downloaded, fields, features: [[n, t, lat, lon, d, a?], ...]}.
"""

import datetime
import json
import re
import struct
import sys
import zipfile

DBF_NAME = 'MOON_nomenclature_center_pts.dbf'
MAX_DBF_BYTES = 200 * 1024 * 1024

# Latin -> English for the maria, oceanus, sinus, lacus and palus names. Standard translations.
# Used only when the gazetteer "origin" field does not give a quoted English name.
ALIASES = {
    'Oceanus Procellarum': 'Ocean of Storms',
    'Mare Tranquillitatis': 'Sea of Tranquility',
    'Mare Serenitatis': 'Sea of Serenity',
    'Mare Imbrium': 'Sea of Showers',
    'Mare Crisium': 'Sea of Crises',
    'Mare Fecunditatis': 'Sea of Fertility',
    'Mare Nectaris': 'Sea of Nectar',
    'Mare Nubium': 'Sea of Clouds',
    'Mare Frigoris': 'Sea of Cold',
    'Mare Humorum': 'Sea of Moisture',
    'Mare Vaporum': 'Sea of Vapors',
    'Mare Cognitum': 'Sea that has become Known',
    'Mare Insularum': 'Sea of Islands',
    'Mare Spumans': 'Foaming Sea',
    'Mare Undarum': 'Sea of Waves',
    'Mare Anguis': 'Serpent Sea',
    'Mare Australe': 'Southern Sea',
    'Mare Marginis': 'Sea of the Edge',
    'Mare Smythii': "Smyth's Sea",
    'Mare Orientale': 'Eastern Sea',
    'Mare Humboldtianum': "Humboldt's Sea",
    'Mare Moscoviense': 'Sea of Moscow',
    'Mare Ingenii': 'Sea of Cleverness',
    'Sinus Iridum': 'Bay of Rainbows',
    'Sinus Medii': 'Central Bay',
    'Sinus Aestuum': 'Bay of Billows',
    'Sinus Roris': 'Bay of Dew',
    'Sinus Amoris': 'Bay of Love',
    'Sinus Asperitatis': 'Bay of Roughness',
    'Sinus Concordiae': 'Bay of Harmony',
    'Sinus Fidei': 'Bay of Trust',
    'Sinus Honoris': 'Bay of Honor',
    'Sinus Lunicus': 'Lunar Bay',
    'Sinus Successus': 'Bay of Success',
    'Lacus Somniorum': 'Lake of Dreams',
    'Lacus Mortis': 'Lake of Death',
    'Lacus Doloris': 'Lake of Sorrow',
    'Lacus Felicitatis': 'Lake of Happiness',
    'Lacus Gaudii': 'Lake of Joy',
    'Lacus Lenitatis': 'Lake of Tenderness',
    'Lacus Spei': 'Lake of Hope',
    'Lacus Temporis': 'Lake of Time',
    'Lacus Timoris': 'Lake of Fear',
    'Lacus Veris': 'Lake of Spring',
    'Lacus Autumni': 'Lake of Autumn',
    'Lacus Excellentiae': 'Lake of Excellence',
    'Lacus Bonitatis': 'Lake of Goodness',
    'Lacus Hiemalis': 'Winter Lake',
    'Lacus Odii': 'Lake of Hate',
    'Lacus Perseverantiae': 'Lake of Perseverance',
    'Lacus Solitudinis': 'Lake of Solitude',
    'Lacus Aestatis': 'Lake of Summer',
    'Lacus Oblivionis': 'Lake of Forgetfulness',
    'Lacus Luxuriae': 'Lake of Luxury',
    'Lacus Benignitatis': 'Lake of Kindness',
    'Palus Putredinis': 'Marsh of Decay',
    'Palus Epidemiarum': 'Marsh of Epidemics',
    'Palus Somni': 'Marsh of Sleep',
}
ALIAS_TYPES = ('Mare', 'Oceanus', 'Sinus', 'Lacus', 'Palus')


def read_dbf(data: bytes):
    """Yield each record of a dBASE III table as a dict of stripped strings."""
    n, header_len, rec_len = struct.unpack('<IHH', data[4:12])
    fields = []
    off = 32
    while off < header_len and data[off] != 0x0D:
        name = data[off:off + 11].split(b'\0')[0].decode('ascii')
        fields.append((name, data[off + 16]))
        off += 32
    for i in range(n):
        rec = data[header_len + i * rec_len: header_len + (i + 1) * rec_len]
        if len(rec) < rec_len:
            break
        if rec[0:1] == b'*':  # deleted record
            continue
        out = {}
        p = 1
        for name, length in fields:
            out[name] = rec[p:p + length].decode('utf-8', 'replace').strip()
            p += length
        yield out


def short_type(t: str) -> str:
    """'Crater, craters' -> 'Crater'."""
    return t.split(',')[0].strip()


def origin_alias(origin: str):
    """'"Sea of Tranquility."' -> 'Sea of Tranquility'. Only a fully quoted origin counts."""
    m = re.fullmatch(r'\s*["“]([^"”]{3,60}?)\.?["”]\.?\s*', origin)
    return m.group(1).strip() if m else None


def main(src: str, dst: str) -> None:
    with zipfile.ZipFile(src) as z:
        info = z.getinfo(DBF_NAME)
        if info.file_size > MAX_DBF_BYTES:
            raise SystemExit(f'{DBF_NAME} is too large ({info.file_size} bytes)')
        data = z.read(info)
        stamp = datetime.datetime(*info.date_time).date().isoformat()

    feats = []
    skipped = 0
    for r in read_dbf(data):
        if not r['approval'].startswith('Adopted by IAU'):
            skipped += 1
            continue
        try:
            lat = float(r['center_lat'])
            lon = float(r['center_lon'])
            d = float(r['diameter']) if r['diameter'] else 0.0
        except ValueError:
            skipped += 1
            continue
        if not (-90 <= lat <= 90) or not (-360 <= lon <= 360):
            skipped += 1
            continue
        lon = ((lon + 180) % 360) - 180
        name = r['clean_name'] or r['name']
        t = short_type(r['type'])
        f = {'n': name, 't': t, 'lat': round(lat, 4), 'lon': round(lon, 4)}
        if d > 0:
            f['d'] = round(d, 1) if d < 100 else round(d)
        if t in ALIAS_TYPES or name.split(' ')[0] in ALIAS_TYPES:
            a = origin_alias(r['origin']) or ALIASES.get(name)
            if a and a.lower() != name.lower():
                f['a'] = a
        feats.append(f)

    feats.sort(key=lambda f: f['n'])
    # Rows, not objects: the key names would add about 200 kB.
    rows = []
    for f in feats:
        row = [f['n'], f['t'], f['lat'], f['lon'], f.get('d')]
        if 'a' in f:
            row.append(f['a'])
        rows.append(row)
    out = {
        'source': 'IAU/USGS Gazetteer of Planetary Nomenclature, MOON_nomenclature_center_pts '
                  '(https://planetarynames.wr.usgs.gov/GIS_Downloads)',
        'licence': 'Public domain (USGS, U.S. Government work). Names approved by the IAU.',
        'downloaded': datetime.date.today().isoformat(),
        'source_file_date': stamp,
        'convention': 'Planetocentric lat, lon -180..180 east positive, degrees. d = diameter in km.',
        'fields': ['n', 't', 'lat', 'lon', 'd', 'a'],
        'fields_note': 'n name, t feature type, d diameter km (null if not known), a English alias (optional).',
        'features': rows,
    }
    with open(dst, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    with_alias = sum(1 for f in feats if 'a' in f)
    print(f'{len(feats)} features ({with_alias} with an English alias), {skipped} skipped -> {dst}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: make_gazetteer.py SOURCE.zip OUT.json')
    main(sys.argv[1], sys.argv[2])
