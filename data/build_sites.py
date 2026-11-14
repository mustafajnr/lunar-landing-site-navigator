"""Build data/sites.json from curated, sourced coordinates.

Run:  uv run python build_sites.py

All coordinates are planetocentric (ME frame), longitude east-positive in
[-180, 180). Each entry has a `source` URL that states the coordinates.

Artemis III candidate regions are areas, not points. NASA has not published
region centres in text. The LROC team published controlled NAC mosaics
"over an Artemis III candidate landing site" (PDS RDR NAC_ROI products), and
each product page lists the mosaic's lat/lon bounding box. We take the centre
of that box (computed on the sphere) and a radius that covers the whole box.
The mosaic box is larger than the region (NASA: each region is about
15 km x 15 km), so the radius is an upper bound.
"""

import json
import math
from pathlib import Path

R_MOON = 1_737_400.0
DEFAULT_RADIUS_M = 500
DEFAULT_RADIUS_NOTE = "No published landing ellipse used; radius is the 500 m default."

LROC_RDR = "https://data.lroc.im-ldi.com/lroc/view_rdr/"
NSSDC_APOLLO = "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html"


def wrap_lon(lon):
    """Wrap a longitude to [-180, 180)."""
    return (lon + 180.0) % 360.0 - 180.0


def to_vec(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))


def box_centre_radius(lat_min, lat_max, lon_min, lon_max, n=60):
    """Centre (unit-vector mean of the box boundary and interior) and covering radius in m."""
    pts = []
    for i in range(n + 1):
        for j in range(n + 1):
            lat = lat_min + (lat_max - lat_min) * i / n
            lon = lon_min + (lon_max - lon_min) * j / n
            pts.append(to_vec(lat, lon))
    sx = sum(p[0] for p in pts)
    sy = sum(p[1] for p in pts)
    sz = sum(p[2] for p in pts)
    norm = math.sqrt(sx * sx + sy * sy + sz * sz)
    c = (sx / norm, sy / norm, sz / norm)
    clat = math.degrees(math.asin(c[2]))
    clon = math.degrees(math.atan2(c[1], c[0]))
    rmax = max(math.acos(max(-1.0, min(1.0, c[0] * p[0] + c[1] * p[1] + c[2] * p[2]))) for p in pts)
    return clat, clon, rmax * R_MOON


def past(id_, name, mission, agency, lat, lon, source, notes=DEFAULT_RADIUS_NOTE, radius_m=DEFAULT_RADIUS_M):
    return {
        "id": id_, "name": name, "mission": mission, "agency": agency, "status": "past",
        "lat_deg": round(lat, 5), "lon_deg": round(wrap_lon(lon), 5), "radius_m": radius_m,
        "source": source, "notes": notes,
    }


SITES = [
    # Apollo: Lunar Module positions from LROC (Wagner et al. 2017), via NSSDC.
    past("apollo-11", "Apollo 11 (Tranquility Base)", "Apollo 11", "NASA", 0.67416, 23.47314, NSSDC_APOLLO,
         "Lunar Module position (Wagner et al. 2017). " + DEFAULT_RADIUS_NOTE),
    past("apollo-12", "Apollo 12", "Apollo 12", "NASA", -3.0128, -23.4219, NSSDC_APOLLO,
         "Lunar Module position (Wagner et al. 2017). " + DEFAULT_RADIUS_NOTE),
    past("apollo-14", "Apollo 14", "Apollo 14", "NASA", -3.64589, -17.47194, NSSDC_APOLLO,
         "Lunar Module position (Wagner et al. 2017). " + DEFAULT_RADIUS_NOTE),
    past("apollo-15", "Apollo 15 (Hadley-Apennine)", "Apollo 15", "NASA", 26.13239, 3.63330, NSSDC_APOLLO,
         "Lunar Module position (Wagner et al. 2017). " + DEFAULT_RADIUS_NOTE),
    past("apollo-16", "Apollo 16 (Descartes)", "Apollo 16", "NASA", -8.9734, 15.5011, NSSDC_APOLLO,
         "Lunar Module position (Wagner et al. 2017). " + DEFAULT_RADIUS_NOTE),
    past("apollo-17", "Apollo 17 (Taurus-Littrow)", "Apollo 17", "NASA", 20.1911, 30.7723, NSSDC_APOLLO,
         "Lunar Module position (Wagner et al. 2017). " + DEFAULT_RADIUS_NOTE),
    # Later landings: positions measured by the LROC team from NAC images.
    past("change-3", "Chang'e 3", "Chang'e 3", "CNSA", 44.1214, 340.4884, "https://www.lroc.asu.edu/images/751",
         "Lander position from LROC NAC. " + DEFAULT_RADIUS_NOTE),
    past("change-4", "Chang'e 4 (Von Karman crater)", "Chang'e 4", "CNSA", -45.4562, 177.5885,
         "https://www.lroc.asu.edu/images/1168",
         "Refined lander position from LROC (13 m uncertainty). " + DEFAULT_RADIUS_NOTE),
    past("change-5", "Chang'e 5 (Mons Rumker)", "Chang'e 5", "CNSA", 43.0576, 308.0839,
         "https://www.lroc.asu.edu/posts/1172", "Lander position from LROC NAC. " + DEFAULT_RADIUS_NOTE),
    past("change-6", "Chang'e 6 (Apollo basin)", "Chang'e 6", "CNSA", -41.6385, 206.0148,
         "https://www.lroc.asu.edu/images/1374", "Lander position from LROC NAC. " + DEFAULT_RADIUS_NOTE),
    past("chandrayaan-3", "Chandrayaan-3 (Statio Shiv Shakti)", "Chandrayaan-3", "ISRO", -69.3741, 32.32,
         "https://www.lroc.asu.edu/images/1314", "Lander position from LROC NAC. " + DEFAULT_RADIUS_NOTE),
    past("slim", "SLIM (near Shioli crater)", "SLIM", "JAXA", -13.3160, 25.2510,
         "https://www.lroc.asu.edu/images/1358", "Lander position from LROC NAC. " + DEFAULT_RADIUS_NOTE),
    past("im-1", "IM-1 Odysseus (Malapert A)", "IM-1", "Intuitive Machines / NASA CLPS", -80.13, 1.44,
         "https://www.lroc.asu.edu/images/1360", "Lander position from LROC NAC. " + DEFAULT_RADIUS_NOTE),
    past("blue-ghost-1", "Blue Ghost Mission 1 (Mare Crisium)", "Blue Ghost Mission 1",
         "Firefly Aerospace / NASA CLPS", 18.5623, 61.8103, "https://www.lroc.asu.edu/images/1407",
         "Lander position from LROC NAC. " + DEFAULT_RADIUS_NOTE),
    past("im-2", "IM-2 Athena (Mons Mouton)", "IM-2", "Intuitive Machines / NASA CLPS", -84.7906, 29.1957,
         "https://www.lroc.asu.edu/images/1408",
         "Lander rest position (on its side in a 20 m crater) from LROC NAC. " + DEFAULT_RADIUS_NOTE),
]

# Artemis III candidate regions (NASA, October 2024 list of nine).
# (id, name, LROC NAC_ROI product, lat_min, lat_max, lon_min, lon_max, extra note)
ARTEMIS = [
    ("artemis3-peak-near-cabeus-b", "Peak near Cabeus B", "NAC_ROI_CABEUSPKLO1",
     -84.06, -83.21, -72.47, -64.80, ""),
    ("artemis3-haworth", "Haworth", "NAC_ROI_HAWORTH_LO1", -87.39, -86.11, -34.98, -12.36, ""),
    ("artemis3-malapert-massif", "Malapert Massif", "NAC_ROI_MALAPERTLO1", -86.33, -85.63, -5.66, 5.15, ""),
    ("artemis3-mons-mouton-plateau", "Mons Mouton Plateau", "NAC_ROI_MOUTNPLTLO1",
     -85.76, -82.85, 15.49, 46.61, "This mosaic is much larger than the region, so the radius is very generous."),
    ("artemis3-nobile-rim-1-mons-mouton", "Nobile Rim 1 and Mons Mouton", "NAC_ROI_MTMOUTONLO1",
     -86.07, -84.82, 27.29, 43.23,
     "Two NASA candidate regions (Nobile Rim 1 and Mons Mouton) share one LROC mosaic, so they share one entry."),
    ("artemis3-nobile-rim-2", "Nobile Rim 2", "NAC_ROI_NOBILE02LO1", -84.40, -83.50, 54.46, 63.02, ""),
    ("artemis3-de-gerlache-rim", "de Gerlache Rim (contains de Gerlache Rim 2)", "NAC_ROI_DEGERRIMLO1",
     -89.02, -87.79, -83.18, -41.31,
     "The LROC mosaic covers the whole de Gerlache rim area (2022 regions Rim 1 and Rim 2). "
     "Only Rim 2 stays in the 2024 candidate list."),
]

ARTEMIS_NOTE = (
    "Artemis III candidate region (NASA list of nine, October 2024: "
    "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/). "
    "NASA gives no centre coordinates in text. Centre and radius come from the lat/lon bounding box of the "
    "LROC controlled NAC mosaic {product}, made over this candidate region "
    "(box lat {lat_min}..{lat_max}, lon {lon_min}..{lon_max}). Centre = spherical centre of the box; "
    "radius = distance to the farthest box point. NASA says each region is about 15 km x 15 km, so the "
    "radius is an upper bound. {extra}"
)


def build():
    sites = list(SITES)
    for id_, name, product, la0, la1, lo0, lo1, extra in ARTEMIS:
        clat, clon, r = box_centre_radius(la0, la1, lo0, lo1)
        sites.append({
            "id": id_, "name": name, "mission": "Artemis III", "agency": "NASA", "status": "candidate",
            "lat_deg": round(clat, 4), "lon_deg": round(wrap_lon(clon), 4),
            "radius_m": int(math.ceil(r / 100.0) * 100),
            "source": LROC_RDR + product,
            "notes": ARTEMIS_NOTE.format(product=product, lat_min=la0, lat_max=la1, lon_min=lo0,
                                         lon_max=lo1, extra=extra).strip(),
        })
    for s in sites:
        assert -90 < s["lat_deg"] < 90 and -180 <= s["lon_deg"] < 180, s["id"]
        assert s["status"] in ("past", "planned", "candidate")
    assert len({s["id"] for s in sites}) == len(sites)
    out = Path(__file__).with_name("sites.json")
    out.write_text(json.dumps(sites, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(sites)} sites to {out}")


if __name__ == "__main__":
    build()
