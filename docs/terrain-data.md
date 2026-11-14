# Terrain data

Owner: terrain-data workstream. Date: 2026-11-14.

## Candidate LOLA south-pole DEMs

All products below use south polar stereographic projection on the 1,737,400 m sphere
(origin −90°, central meridian 0°), MOON_ME frame (DE421). Heights are metres relative to
the 1,737,400 m sphere. Sizes are the elevation file only.

### NASA PGDA

| Product | Resolution (m/px) | Area | Format | File size | URL |
|---|---|---|---|---|---|
| **LDEM_80S_20MPP_ADJ** (Barker et al. 2023) | 20 | 80–90° S | COG GeoTIFF, float32 | 2.6 GB | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF |
| LDEM_80S_40MPP_ADJ | 40 | 80–90° S | COG GeoTIFF | 685 MB | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_40MPP_ADJ.TIF |
| LDEM_80S_80MPP_ADJ | 80 | 80–90° S | COG GeoTIFF | 181 MB | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF |
| LDEM_83S_10MPP_ADJ | 10 | 83–90° S | COG GeoTIFF | 4.8 GB | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_83S_10MPP_ADJ.TIF |
| LDEM_75S_30MPP_ADJ | 30 | 75–90° S | COG GeoTIFF | 2.7 GB | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_75S_30MPP_ADJ.TIF |
| LDEM_60S_60MPP_ADJ | 60 | 60–90° S | COG GeoTIFF | 2.9 GB | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_60MPP_ADJ.TIF |
| **LDEM_60S_120MPP_ADJ** | 120 | 60–90° S | COG GeoTIFF, float32 | 785 MB (821,504,895 B) | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_120MPP_ADJ.TIF |
| LDEM_60S_240MPP_ADJ | 240 | 60–90° S | COG GeoTIFF | 210 MB | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF |
| ldem_87s_5mpp (South Pole LOLA DEM Mosaic, Barker et al. 2021) | 5 | 87–90° S | GeoTIFF | 3.3 GB | https://pgda.gsfc.nasa.gov/products/81 |
| Site DEMs (Barker et al. 2021): Connecting ridge, Shackleton rim, Peak near Shackleton, de Gerlache rim, Leibnitz beta, Malapert, Haworth, Shoemaker, Nobile rims | 5 | ~20 × 20 km tiles | GeoTIFF | not checked | https://pgda.gsfc.nasa.gov/products/78 |
| SfS DEMs for the 13 original Artemis III regions (Bertone et al. 2026) | 5 | 13 regions | GeoTIFF (Zenodo) | not checked | https://pgda.gsfc.nasa.gov/products/104 |

Product page for the `LOLA_20mpp` family: https://pgda.gsfc.nasa.gov/products/90
("A New View of the Lunar South Pole from LOLA", Barker et al. 2023).

### PDS LOLA archive (GDR, 2017)

Directory: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/
(`img/` = 16-bit integer, `float_img/` = 32-bit float, same grids).

| Product | Resolution (m/px) | Area | File size (int16 / float) |
|---|---|---|---|
| LDEM_875S_5M | 5 | 87.5–90° S | 1.84 GB / 3.68 GB |
| LDEM_875S_10M | 10 | 87.5–90° S | 460 MB / 920 MB |
| LDEM_875S_20M | 20 | 87.5–90° S | 115 MB / 230 MB |
| LDEM_85S_10M | 10 | 85–90° S | 1.84 GB / 3.68 GB |
| LDEM_85S_20M | 20 | 85–90° S | 460 MB / 920 MB |
| LDEM_85S_40M | 40 | 85–90° S | 115 MB / 230 MB |
| LDEM_80S_20M | 20 | 80–90° S | 1.85 GB / 3.70 GB |
| LDEM_80S_40M | 40 | 80–90° S | 462 MB / 924 MB |
| LDEM_80S_80M | 80 | 80–90° S | 116 MB / 231 MB |
| LDEM_75S_30M | 30 | 75–90° S | 1.86 GB / 3.72 GB |
| LDEM_75S_60M | 60 | 75–90° S | 465 MB / 930 MB |
| LDEM_75S_120M | 120 | 75–90° S | 116 MB / 233 MB |
| LDEM_75S_240M | 240 | 75–90° S | 29 MB / 58 MB |
| LDEM_60S_60M / 120M / 240M | 60 / 120 / 240 | 60–90° S | 1.93 GB / 482 MB / 120 MB (int16) |
| LDEM_45S_100M / 200M / 400M | 100 / 200 / 400 | 45–90° S | 1.66 GB / 415 MB / 104 MB (int16) |

## Choice

| Layer | Product | Use |
|---|---|---|
| Fine (near field) | `LDEM_80S_20MPP_ADJ`, 20 m/px, 80–90° S, 2.6 GB | Terrain within 25 km of the site |
| Coarse (far field) | `LDEM_60S_120MPP_ADJ`, 120 m/px, 60–90° S, 785 MB | Terrain from 25 km to 150 km, and fallback where the fine DEM has no data |

Total download: about 3.5 GB (limit 5 GB).

Reasons:

- **Newest LOLA processing.** The PGDA 2023 products (Barker et al. 2023) use
  co-adjusted LOLA tracks. Orbit errors are much smaller than in the 2017 PDS grids, so
  there are fewer track artefacts. Fine and coarse layers come from the same solution, so
  they agree where they overlap.
- **Fine layer covers every south-pole site in `sites.json`.** 80° S includes IM-1
  (80.13° S), IM-2 and all Artemis III candidate regions (83.2–89° S). The 10 m and 5 m
  products cover only 83° S or 87° S, and the 10 m file alone is 4.8 GB.
- **20 m is enough for the near field.** LOLA's true (effective) resolution away from
  the pole is coarser than 20 m, because tracks are sparse. A 5 m grid there is mostly
  interpolation.
- **Coarse layer reaches 60° S.** A 150 km ray from a site at 80° S reaches about
  75.5° S. The 60° S grid also gives heights for Chandrayaan-3 (69.4° S). 120 m is small
  compared with the ray step at long range (up to 500 m), so it does not limit accuracy.
- **Cloud-optimized GeoTIFF.** Files are tiled (512 × 512) and compressed. `horizon.py`
  reads only a window around each site, so memory use stays near 50 MB.

Not covered: sites north of 60° S (Apollo, Chang'e 3/5, SLIM, Blue Ghost, Chang'e 4/6).
For these, the app must use a flat horizon (`horizon_mask = None`) or a global DEM later.

## Files

- `data/download_dem.sh` — downloads both files into `data/raw/` (resumable, checks sizes).
- `data/src/lunarterrain/horizon.py` (package `lunarterrain`) — `Terrain.surface_height(lat, lon)`, `Terrain.horizon_mask(...)` and `make_mask_json(...)`. `data/horizon.py` is the CLI. `LUNARNAV_DEM_DIR` sets the DEM folder (default `data/raw/`).
- `data/masks/` — committed example masks.

## Horizon method (summary)

For each of 720 azimuths (0.5° step), points are placed along the great circle from the
site. Steps are 10 m near the site and grow as 0.5 % of distance, up to 500 m, out to
150 km (about 1,050 samples per ray). Each point's height comes from bilinear interpolation
of the fine DEM (≤ 25 km) or the coarse DEM. The observer is at `R + h_site + h_obs` along
the site radius. Elevation is the angle of the 3D vector from observer to terrain point
above the plane perpendicular to the site radius. The mask is the maximum along each ray.
Curvature is included because all points are true 3D positions.

## Usage

```
bash data/download_dem.sh                     # once, ~3.5 GB into data/raw/
cd data
export LUNARNAV_DEM_DIR=$PWD/raw          # optional. This is the default.
uv run python horizon.py -89.45 -137.31 --height 2 -o masks/out.json
```

```python
from lunarterrain import Terrain
with Terrain() as t:
    h = t.surface_height(-89.45, -137.31)           # m above 1737.4 km sphere (scalar or arrays)
    elev_deg, h_site = t.horizon_mask(-89.45, -137.31, observer_height_m=2.0)
```

## Test masks (observer height 2 m, about 0.6 s each)

| File | Point | Site height | Horizon min / mean / max |
|---|---|---|---|
| `masks/connecting_ridge_-89.45_-137.31_h2.json` | Shackleton–de Gerlache connecting ridge, about 9–10 km from the Shackleton rim (−89.45, −137.31) | 1955 m | −2.85° / −0.62° / +0.90° (max at az 134°, towards Malapert) |
| `masks/shackleton_floor_-89.67_129.78_h2.json` | Shackleton crater centre, floor (−89.67, 129.78) | −2789 m | +19.8° / +21.3° / +23.6° |

The Sun never rises more than about 1.6° above the horizontal plane near the pole, so
the floor is in permanent shadow, as expected. The ridge point has a horizon below the
Sun's path in most directions, which agrees with the high average illumination (roughly 80–90 %)
published for this area (Mazarico et al. 2011). This was checked from memory of the paper, not re-read.

The Shackleton centre is from the IAU Gazetteer (feature 5450): 89.67° S, 129.78° E.
