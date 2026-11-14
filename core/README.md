# lunarnav

`lunarnav` is a Python package. It calculates the direction of the Sun and of Earth from one point on the lunar surface at one instant. It also tells you if the Sun and Earth are above the local terrain horizon. You can use the results to estimate solar power and direct-to-Earth communication at a landing site.

One call to `evaluate` gives a `Result` with these fields:

| Field | Meaning | Unit |
|---|---|---|
| `sun_az`, `sun_el` | Azimuth and elevation of the Sun's centre | degrees |
| `sun_horizon_el` | Terrain horizon elevation at the Sun's azimuth | degrees |
| `sun_visible_fraction` | Part of the Sun's disk that is above the terrain horizon | 0 to 1 |
| `earth_az`, `earth_el` | Azimuth and elevation of Earth's centre | degrees |
| `earth_horizon_el` | Terrain horizon elevation at Earth's azimuth | degrees |
| `earth_visible` | `True` if Earth's centre is above the terrain horizon | boolean |
| `earth_margin` | `earth_el − earth_horizon_el` | degrees |

The package is part of the "Lunar Landing Site Navigator" project for the NASA Space Apps Challenge 2026. You can use it alone.

## Contents

1. [Requirements and installation](#requirements-and-installation)
2. [SPICE kernels](#spice-kernels)
3. [Command-line use](#command-line-use)
4. [Python use](#python-use)
5. [Conventions](#conventions)
6. [Definitions of the outputs](#definitions-of-the-outputs)
7. [Accuracy](#accuracy)
8. [Performance](#performance)
9. [Limitations](#limitations)
10. [Troubleshooting](#troubleshooting)
11. [Credits](#credits)
12. [License](#license)

## Requirements and installation

You need Python 3.14 or later. The package needs `numpy` and `spiceypy`. The installer gets them for you.

### In this repository, with uv

[uv](https://docs.astral.sh/uv/) is a Python project manager. Run these commands from the repository root:

```sh
cd core
uv sync
```

`uv sync` makes a virtual environment in `core/.venv`. It installs `lunarnav` and the development tools (`pytest` and `certifi`).

### As a dependency in another project

Install the package from the `core` subdirectory of the GitHub repository:

```sh
# with uv
uv add "lunarnav @ git+https://github.com/mustafajnr/lunar-landing-site-navigator#subdirectory=core"

# with pip
pip install "lunarnav @ git+https://github.com/mustafajnr/lunar-landing-site-navigator#subdirectory=core"
```

The repository is private at this time. You must have read access to it, and Git must have your GitHub credentials. This requirement stops when the repository becomes public.

An installed package does not include the kernel download script. Read [Kernels for an installed package](#kernels-for-an-installed-package).

## SPICE kernels

SPICE is a toolkit from the NASA Navigation and Ancillary Information Facility (NAIF). It calculates the positions and orientations of solar system bodies. A kernel is a SPICE data file. An ephemeris is a table of body positions over time. `lunarnav` needs five kernels:

| File | Contents | Size (bytes) |
|---|---|---|
| `naif0012.tls` | Leap seconds, for the conversion from UTC to the SPICE time scale | 5,257 |
| `pck00011.tpc` | Body constants, for example the radius of the Sun | 131,226 |
| `de440s.bsp` | JPL DE440 planetary ephemeris (short version) | 32,726,016 |
| `moon_pa_de440_200625.bpc` | High-accuracy lunar orientation from DE440 | 12,863,488 |
| `moon_de440_250416.tf` | Definitions of the lunar frames, for example `MOON_ME` | 19,478 |

The total size is approximately 46 MB (45,745,465 bytes).

### Get the kernels in this repository

Run this command in `core/`:

```sh
uv run python scripts/get_kernels.py
```

The script downloads the files from <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/> into `core/kernels/`. Git ignores this folder. The script also writes `core/kernels/lunarnav.tm`. This file is a meta-kernel: a list of kernels for other SPICE tools. `lunarnav` does not use it.

Output of the first run:

```text
get   https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls
get   https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc
get   https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp
get   https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc
get   https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf
wrote /home/user/lunar-landing-site-navigator/core/kernels/lunarnav.tm
```

If a file is already in the folder, the script does not download it again. It prints `have  <file name>`.

### The `LUNARNAV_KERNELS` variable

The environment variable `LUNARNAV_KERNELS` sets the kernel folder. The package and `get_kernels.py` both read it. If you do not set it, the package uses `core/kernels/` in this repository.

```sh
export LUNARNAV_KERNELS=/data/spice/lunarnav
uv run python scripts/get_kernels.py    # downloads into /data/spice/lunarnav
```

The package reads the variable one time, when Python imports `lunarnav`. Set it before the import.

### Kernels for an installed package

When you install `lunarnav` with `uv add` or `pip install`, the default folder is not useful. It is a `kernels` folder next to `site-packages`, for example `.venv/lib/python3.14/kernels`. Always set `LUNARNAV_KERNELS` for an installed package.

To get the files, use one of these two methods:

1. Clone this repository, run `uv sync` in `core/`, and then run `get_kernels.py` with `LUNARNAV_KERNELS` set to your folder.
2. Download the five files with `curl`:

```sh
mkdir -p "$LUNARNAV_KERNELS" && cd "$LUNARNAV_KERNELS"
BASE=https://naif.jpl.nasa.gov/pub/naif/generic_kernels
for f in lsk/naif0012.tls pck/pck00011.tpc spk/planets/de440s.bsp \
         pck/moon_pa_de440_200625.bpc fk/satellites/moon_de440_250416.tf; do
  curl -sSfO "$BASE/$f"
done
```

If `curl` gives a certificate error, read [Troubleshooting](#troubleshooting).

If a kernel is missing, `evaluate` raises `FileNotFoundError`. The message gives the folder and the missing files.

## Command-line use

Run the package as a module. In this repository, run the command in `core/`:

```sh
uv run python -m lunarnav --lat -89.45 --lon -137.3 --utc 2026-11-14T12:00:00Z --height 2
```

Output:

```json
{
  "sun_az": 257.8096166406794,
  "sun_el": 1.4405358515025681,
  "sun_horizon_el": 0.0,
  "sun_visible_fraction": 1.0,
  "earth_az": 135.34949004301365,
  "earth_el": -4.512653368519901,
  "earth_horizon_el": 0.0,
  "earth_visible": false,
  "earth_margin": -4.512653368519901
}
```

The point is near Shackleton crater at the lunar south pole. At this instant, the Sun is 1.44° above the flat horizon. Earth is 4.51° below it.

Outside this repository, use `python -m lunarnav` in the environment that has the package.

### Flags

| Flag | Required | Default | Meaning |
|---|---|---|---|
| `--lat` | yes | | Planetocentric latitude, degrees. Do not use exactly −90 or +90. |
| `--lon` | yes | | East-positive longitude, degrees, −180 to +180 |
| `--utc` | yes | | Instant in UTC, ISO 8601 text, for example `2026-11-14T12:00:00Z` |
| `--height` | no | `0` | Observer height above the terrain surface, metres. For example, the height of an antenna or a solar panel. |
| `--surface-height` | no | `0` | Terrain height above the reference sphere (radius 1,737,400 m), metres. A terrain model supplies this value. |
| `--mask` | no | none | Path to a horizon mask JSON file. Without this flag, the horizon is flat at 0° in all directions. |

The observer position is at a radius of 1,737,400 m + `--surface-height` + `--height` from the Moon's centre.

Example with a horizon mask file. The file `mask.json` has a horizon of 1.3° in all directions. The [Python use](#python-use) section shows how to make it.

```sh
uv run python -m lunarnav --lat -89.45 --lon -137.3 --utc 2026-11-14T12:00:00Z --height 2 --mask mask.json
```

```json
{
  "sun_az": 257.8096166406794,
  "sun_el": 1.4405358515025681,
  "sun_horizon_el": 1.3,
  "sun_visible_fraction": 0.8160410742482369,
  "earth_az": 135.34949004301365,
  "earth_el": -4.512653368519901,
  "earth_horizon_el": 1.3,
  "earth_visible": false,
  "earth_margin": -5.812653368519901
}
```

The Sun's centre is 0.14° above the 1.3° horizon. The Sun's disk has a radius of approximately 0.27°. Thus 82% of the disk is visible.

## Python use

### Flat horizon

If you do not give a horizon mask, the horizon is flat at 0° in all directions.

```python
from lunarnav import evaluate

# A point near Shackleton crater at the lunar south pole.
# The observer is 2 m above the ground.
r = evaluate(-89.45, -137.3, "2026-11-14T12:00:00Z", 2.0)

print(f"Sun:   az {r.sun_az:7.3f}  el {r.sun_el:6.3f}  visible fraction {r.sun_visible_fraction:.2f}")
print(f"Earth: az {r.earth_az:7.3f}  el {r.earth_el:6.3f}  visible {r.earth_visible}")
```

```text
Sun:   az 257.810  el  1.441  visible fraction 1.00
Earth: az 135.349  el -4.513  visible False
```

The signature is:

```python
evaluate(lat_deg, lon_deg, utc, observer_height_m, horizon_mask=None, *, surface_height_m=0.0) -> Result
```

`surface_height_m` is a keyword-only argument.

### Horizon mask

A horizon mask gives the elevation of the terrain horizon in each direction around one point. It is valid for one observer height only. `lunarnav` does not calculate masks. A terrain tool must supply them (see [Limitations](#limitations)).

The mask format is:

| Key | Type | Meaning |
|---|---|---|
| `az_step_deg` | number | Azimuth step between samples, degrees. 360 / `az_step_deg` must be a whole number. |
| `elevation_deg` | list of numbers | Horizon elevation, degrees, at azimuth 0, 1 × step, 2 × step, and so on. The length must be 360 / `az_step_deg`. |
| `lat_deg`, `lon_deg` | number | Point of the mask (for information only) |
| `observer_height_m` | number | Observer height of the mask, metres |
| `dem_source` | text | Name of the terrain data product (for information only) |

Between two samples, `lunarnav` uses linear interpolation. The interpolation goes across 360° to 0°.

#### From a dict

```python
from lunarnav import evaluate

# A synthetic mask: the terrain horizon is 1.3 deg high in all directions.
mask = {
    "lat_deg": -89.45,
    "lon_deg": -137.3,
    "observer_height_m": 2.0,
    "dem_source": "synthetic example",
    "az_step_deg": 0.5,
    "elevation_deg": [1.3] * 720,  # azimuth 0.0, 0.5, ... 359.5
}

r = evaluate(-89.45, -137.3, "2026-11-14T12:00:00Z", 2.0, mask)
print(f"sun_el {r.sun_el:.3f}  sun_horizon_el {r.sun_horizon_el:.3f}  "
      f"sun_visible_fraction {r.sun_visible_fraction:.3f}")
```

```text
sun_el 1.441  sun_horizon_el 1.300  sun_visible_fraction 0.816
```

#### From a JSON file

Use `HorizonMask.from_json` to read a file. This example writes the file first.

```python
import json

from lunarnav import HorizonMask, evaluate

# Write the synthetic mask to a file. Then read it back.
mask = {"lat_deg": -89.45, "lon_deg": -137.3, "observer_height_m": 2.0,
        "dem_source": "synthetic example", "az_step_deg": 0.5,
        "elevation_deg": [1.3] * 720}
with open("mask.json", "w") as f:
    json.dump(mask, f)

m = HorizonMask.from_json("mask.json")
print(m.elevation_at(257.8))  # horizon elevation at azimuth 257.8 deg

r = evaluate(-89.45, -137.3, "2026-11-14T12:00:00Z", 2.0, m)
print(f"{r.sun_visible_fraction:.3f}")
```

```text
1.3
0.816
```

`HorizonMask.from_dict(d)` makes a mask from a dict. If the length of `elevation_deg` is incorrect, the constructor raises `ValueError`.

### Result as a dict

`Result` is a frozen dataclass. `Result.to_dict()` gives a plain dict. You can write it as JSON.

```python
import json

from lunarnav import evaluate

# Apollo 11 landing site.
r = evaluate(0.674, 23.473, "2026-11-20T00:00:00Z", 2.0)
print(json.dumps(r.to_dict(), indent=2))
```

```json
{
  "sun_az": 94.2335905149181,
  "sun_el": 59.796914764672486,
  "sun_horizon_el": 0.0,
  "sun_visible_fraction": 1.0,
  "earth_az": 262.1892331373912,
  "earth_el": 58.89705100879854,
  "earth_horizon_el": 0.0,
  "earth_visible": true,
  "earth_margin": 58.89705100879854
}
```

### Time series: 30 days at 1-hour steps

`evaluate` calculates one instant. For a time series, call it in a loop. This example uses `datetime` objects.

```python
from datetime import datetime, timedelta, timezone

from lunarnav import evaluate

start = datetime(2026, 11, 14, tzinfo=timezone.utc)
hours = 30 * 24
sun_hours = 0.0
earth_hours = 0

for h in range(hours):
    t = start + timedelta(hours=h)
    r = evaluate(-89.45, -137.3, t, 2.0)
    sun_hours += r.sun_visible_fraction  # 1 hour x part of the disk that is visible
    earth_hours += r.earth_visible
    if h % 120 == 0:  # print one line for each 5 days
        print(f"{t:%Y-%m-%d %H:%M}  sun_el {r.sun_el:6.2f}  earth_el {r.earth_el:6.2f}")

print(f"Sun visible:   {sun_hours / hours:.1%} of the time")
print(f"Earth visible: {earth_hours / hours:.1%} of the time")
```

```text
2026-11-14 00:00  sun_el   1.50  earth_el  -5.04
2026-11-19 00:00  sun_el   1.04  earth_el   1.48
2026-11-24 00:00  sun_el   1.09  earth_el   5.87
2026-11-29 00:00  sun_el   1.56  earth_el   1.14
2026-12-04 00:00  sun_el   1.97  earth_el  -5.85
2026-12-09 00:00  sun_el   1.86  earth_el  -6.73
Sun visible:   100.0% of the time
Earth visible: 39.2% of the time
```

This example uses a flat horizon. Near the poles, the Sun stays a few degrees above or below the horizon. Thus real terrain has a large effect. Use a horizon mask for useful results.

A `series` module for time series is in development. It is not documented here.

## Conventions

| Item | Rule |
|---|---|
| Frame | `MOON_ME`: the Moon Mean Earth / Polar Axis frame, defined in `moon_de440_250416.tf`. The +Z axis is the mean rotation axis. The +X axis points to the mean direction of Earth. Lunar maps and LOLA data use this frame. |
| Latitude | Planetocentric, degrees: the angle between the equator plane and the line from the Moon's centre to the point |
| Longitude | East-positive, degrees, range −180 to +180 |
| Azimuth | Degrees clockwise from local north: 0 = north, 90 = east, 180 = south, 270 = west. Range 0 to 360. |
| Elevation | Degrees above the local horizontal plane. This plane is perpendicular to the line from the Moon's centre to the observer. |
| Distance, height | Metres. The reference sphere radius is 1,737,400 m. |
| Observer height | Metres above the terrain surface |
| Time input | UTC. Text: `2026-11-14T12:00:00Z`, `2026-11-14T12:00:00`, `2026-11-14 12:00:00` or `2026-11-14T12:00:00+00:00`. A Python `datetime`: an aware `datetime` in any time zone, or a naive `datetime`, which `lunarnav` reads as UTC. |
| Apparent direction | The Sun and Earth directions include light time and stellar aberration (SPICE correction `LT+S`). There is no atmosphere, thus no refraction. |

Local north is the direction along the surface toward the +Z (north) pole. Near the south pole, local north points away from the south pole.

### Exact-pole `ValueError`

At exactly −90° or +90° latitude, every direction along the surface points away from the pole. Thus "north" has no definition, and azimuth has no definition. At these points `evaluate` raises `ValueError`:

```python
from lunarnav import evaluate

try:
    evaluate(-90.0, 0.0, "2026-11-14T12:00:00Z", 2.0)
except ValueError as e:
    print("ValueError:", e)

r = evaluate(-89.999, 0.0, "2026-11-14T12:00:00Z", 2.0)
print(f"{r.sun_az:.3f}")
```

```text
ValueError: north is undefined at the exact pole
120.524
```

A point near the pole, for example −89.999°, is correct. Near the pole, azimuth changes quickly with longitude. Use the same longitude for the point and for its horizon mask.

## Definitions of the outputs

### `sun_visible_fraction`

The Sun is not a point. From the Moon, its disk has an angular radius of approximately 0.27°. `lunarnav` calculates the radius at each instant as `asin(R_sun / d)`. `R_sun` is 695,700 km (from `pck00011.tpc`). `d` is the distance from the observer to the Sun.

The model is a circular segment:

1. Find the horizon elevation `h_hz` at the azimuth of the Sun's centre.
2. Use the horizon as a straight horizontal line at `h_hz`.
3. Calculate the part of the disk area above this line.

With `h = sun_el − h_hz` and `r` = the Sun's angular radius:

- If `h ≥ r`, the fraction is 1.
- If `h ≤ −r`, the fraction is 0.
- In other cases, the fraction is `0.5 + (h·√(r² − h²) + r²·asin(h / r)) / (π·r²)`.

If the Sun's centre is on the horizon, the fraction is 0.5.

This model has a limit. It uses one horizon elevation for the full disk. The disk is approximately 0.53° wide. If the terrain horizon changes much over this width, for example at a sharp peak or a notch, the real fraction can be different. In that condition, use the result as an estimate.

### `earth_visible` and `earth_margin`

`earth_visible` is `True` if Earth's centre is above the terrain horizon at Earth's azimuth. `earth_margin` is `earth_el − earth_horizon_el`, in degrees.

A positive margin tells you how far Earth's centre is above the terrain. A negative margin tells you how far it is below the terrain. Use the margin to find marginal communication geometry. For example, a margin of +0.2° is less safe than a margin of +5°. Earth's angular radius from the Moon is approximately 0.95°. Thus part of Earth's disk can be visible when the margin is a small negative number.

## Accuracy

The tests compare `evaluate` with JPL Horizons. Horizons is the JPL online ephemeris service. The comparison uses a flat horizon and apparent azimuth and elevation of the Sun and Earth. Horizons uses the `MEAN_ME` frame, which is the same as `MOON_ME`.

The cases are:

| Case | Latitude | Longitude | Height above sphere | UTC instants |
|---|---|---|---|---|
| Shackleton | −89.45 | −137.3 | 0 m | 2026-11-14 12:00, 2026-11-21 06:00, 2026-12-01 18:00 |
| Shackleton, 10 m | −89.45 | −137.3 | 10 m | 2027-01-10 00:00 |
| Apollo 11 | 0.674 | 23.473 | 0 m | 2026-11-20 00:00, 2026-12-05 12:00 |

The largest difference over the six instants is 4.5 × 10⁻⁷ degrees (0.0016 arcseconds), in Earth's azimuth. The largest Sun difference is 8.2 × 10⁻⁹ degrees. The test tolerance is 0.001°. The project target is 0.05°.

The Horizons results are saved in `tests/fixtures/horizons.json`. Thus the tests do not need the network. The tests need the kernels. Without the kernels, pytest skips the tests that call `evaluate`.

Run all tests in `core/`:

```sh
uv run pytest
```

```text
....................                                                     [100%]
20 passed in 0.42s
```

Run only the Horizons comparison:

```sh
uv run pytest tests/test_horizons.py -v
```

To refresh the fixtures from Horizons, run this command. It needs the network.

```sh
uv run python scripts/fetch_horizons.py
```

```text
wrote /home/user/lunar-landing-site-navigator/core/tests/fixtures/horizons.json (6 cases); frame: ['Center pole/equ : MEAN_ME (high precision)        {East-longitude positive}']
```

To add a case, edit the `CASES` list in `scripts/fetch_horizons.py`.

## Performance

Run the benchmark in `core/`:

```sh
uv run python scripts/benchmark.py
```

Output on an Intel Core i7-9700K (Linux on WSL2, Python 3.14):

```text
kernel load      :    25.81 ms (once per process)
first call       :     1.47 ms
one call (warm)  :    0.273 ms
720 calls (ISO)  :    191.7 ms
```

The package loads the kernels one time in each process, at the first call. One call takes approximately 0.3 ms after that. A 30-day series at 1-hour steps (720 calls) takes approximately 0.2 s.

## Limitations

- **No terrain is built in.** `lunarnav` does not read terrain data and does not calculate horizon masks. Without a mask, the horizon is flat at 0°. Another tool must supply the mask and `surface_height_m`. A higher observer does not lower the flat horizon. Only a mask includes this effect.
- **The mask height is not checked.** A mask is valid for one observer height. The project contract says that `evaluate` must raise `ValueError` if `observer_height_m` is not equal to the mask's `observer_height_m`. Version 0.1.0 does not do this check. Make sure that the two values are the same. `evaluate` does not check the mask's `lat_deg` and `lon_deg` either.
- **Earth visibility uses Earth's centre only.** `earth_visible` does not include Earth's disk (radius approximately 0.95°). It does not include antenna beam width or link budget.
- **Time range.** `de440s.bsp` covers 1849-12-26 to 2150-01-22 (UTC, approximately). The lunar orientation kernel covers a longer range (1549 to 2650). Outside the `de440s.bsp` range, `evaluate` raises a SPICE error (`SpiceSPKINSUFFDATA`). For example, 2151-01-01 gives this error.
- **Time text with a time-zone offset other than zero.** Text such as `2026-11-14T14:00:00+02:00` raises `SpiceUNPARSEDTIME`. For other time zones, give an aware `datetime`.
- **Longitude range.** `evaluate` does not reject longitudes outside −180 to +180. For example, 180 and 540 give the same result as −180.
- **Reference sphere.** Heights are above a sphere of radius 1,737,400 m, not above a gravity surface.
- **No atmosphere.** There is no refraction model. The Moon has no important atmosphere.
- **One process, global state.** SPICE keeps the loaded kernels in global state. `lunarnav` loads them one time. Do not unload them (for example with `spiceypy.kclear()`) in the same process.

## Troubleshooting

### `CERTIFICATE_VERIFY_FAILED` when you download kernels

Some machines do not trust the root certificate authority (CA) of `naif.jpl.nasa.gov` (Sectigo R46). This occurs when the system CA store is old. The download then stops with an error such as:

```text
urllib.error.URLError: <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1007)>
```

`curl` gives a similar error:

```text
curl: (60) SSL certificate problem: unable to get local issuer certificate
```

The scripts `get_kernels.py` and `fetch_horizons.py` have a solution. If the `certifi` package is installed, they use its CA bundle. TLS verification stays on. In this repository, `uv sync` installs `certifi` as a development dependency. Thus `uv run python scripts/get_kernels.py` operates correctly.

For `curl`, give the `certifi` CA bundle:

```sh
curl -sSfO --cacert "$(uv run python -m certifi)" https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls
```

For the `curl` loop in [Kernels for an installed package](#kernels-for-an-installed-package), set `CURL_CA_BUNDLE` before the loop. Run this command in `core/`:

```sh
export CURL_CA_BUNDLE="$(uv run python -m certifi)"
```

In another environment, install `certifi` (`pip install certifi`) and use `python -m certifi`. Do not turn off certificate verification.

### `FileNotFoundError: SPICE kernels missing in ...`

The package cannot find the kernels. Run `get_kernels.py`, or set `LUNARNAV_KERNELS` to the folder that has the five files. Set the variable before Python imports `lunarnav`.

### `SpiceSPKINSUFFDATA`

The instant is outside the time range of `de440s.bsp`. Read [Limitations](#limitations).

## Credits

- [NASA NAIF SPICE toolkit](https://naif.jpl.nasa.gov/naif/) and the NAIF generic kernels.
- [JPL DE440](https://ssd.jpl.nasa.gov/planets/eph_export.html) planetary and lunar ephemeris (Park et al., 2021).
- [spiceypy](https://github.com/AndrewAnnex/SpiceyPy), the Python interface to SPICE (Annex et al., 2020).
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), for the validation data.

## License

To be decided.
