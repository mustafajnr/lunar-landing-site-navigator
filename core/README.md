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

`evaluate_series` calls `evaluate` over a timespan. It also gives the sunrise, sunset, earthrise and earthset events and summary values. `lunarnav.moon.moon_state_et` gives the sub-solar and sub-Earth points of the full Moon at one instant.

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

The package installs the console script `lunarnav`. In this repository, run the command in `core/`:

```sh
uv run lunarnav --lat -89.45 --lon -137.3 --utc 2026-11-14T12:00:00Z --height 2
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

`python -m lunarnav` gives the same result. Outside this repository, use `lunarnav` or `python -m lunarnav` in the environment that has the package.

### Flags

| Flag | Required | Default | Meaning |
|---|---|---|---|
| `--lat` | yes | | Planetocentric latitude, degrees, −90 to +90. Do not use exactly −90 or +90. |
| `--lon` | yes | | East-positive longitude, degrees, −180 to +360. Read [Conventions](#conventions). |
| `--utc` | yes | | Instant, ISO 8601 text, for example `2026-11-14T12:00:00Z`. Text with an offset, for example `+02:00`, is converted to UTC. Text with no offset is UTC. |
| `--height` | no | `0` | Observer height above the terrain surface, metres. For example, the height of an antenna or a solar panel. |
| `--surface-height` | no | `0` | Terrain height above the reference sphere (radius 1,737,400 m), metres. A terrain model supplies this value. |
| `--mask` | no | none | Path to a horizon mask JSON file. Without this flag, the horizon is flat at 0° in all directions. |

The observer position is at a radius of 1,737,400 m + `--surface-height` + `--height` from the Moon's centre.

Example with a horizon mask file. The file `mask.json` has a horizon of 1.3° in all directions. The [Python use](#python-use) section shows how to make it.

```sh
uv run lunarnav --lat -89.45 --lon -137.3 --utc 2026-11-14T12:00:00Z --height 2 --mask mask.json
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

### Input errors

If an input is not correct, the command prints a usage message and an error. The exit status is 2.

```sh
uv run lunarnav --lat -89.45 --lon 540 --utc 2026-11-14T12:00:00Z
```

```text
usage: lunarnav [-h] --lat LAT --lon LON --utc UTC [--height HEIGHT]
                [--surface-height SURFACE_HEIGHT] [--mask MASK]
lunarnav: error: lon_deg must be in the range -180 to 360, got 540.0
```

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
| `observer_height_m` | number | Observer height of the mask, metres. Optional. |
| `dem_source` | text | Name of the terrain data product (for information only) |

Between two samples, `lunarnav` uses linear interpolation. The interpolation goes across 360° to 0°.

#### Mask height check

If the mask has `observer_height_m`, it must be equal to the `observer_height_m` argument of `evaluate`. The tolerance is 10⁻⁶ m. If the two values are different, `evaluate` raises `ValueError`:

```text
ValueError: horizon mask is for observer_height_m=2.0, but observer_height_m=0.0 was requested
```

A mask with no `observer_height_m` is accepted for all observer heights. This is intentional. It is for synthetic masks, for example a constant 5° wall in tests. A mask from real terrain data must have `observer_height_m`.

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

### Time series with a loop: 30 days at 1-hour steps

`evaluate` calculates one instant. You can call it in a loop. This example uses `datetime` objects. For most time series, `evaluate_series` is better. Read [Time series with `evaluate_series`](#time-series-with-evaluate_series).

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

### Time series with `evaluate_series`

`evaluate_series` calls `evaluate` at each time step in a span. It also finds the rise and set events and calculates summary values. The signature is:

```python
evaluate_series(lat_deg, lon_deg, start_utc, stop_utc, step_minutes, observer_height_m,
                horizon_mask=None, *, surface_height_m=0.0, event_tol_s=1.0) -> SeriesResult
```

| Argument | Meaning |
|---|---|
| `lat_deg`, `lon_deg`, `observer_height_m`, `horizon_mask`, `surface_height_m` | The same as for `evaluate` |
| `start_utc`, `stop_utc` | First and last instant. ISO 8601 text or `datetime`, with the same rules as `evaluate`. `stop_utc` must be after `start_utc`. |
| `step_minutes` | Time step, minutes. It must be a positive number. |
| `event_tol_s` | Accuracy of the event times, seconds |

The time steps are `start_utc`, `start_utc` + 1 step, `start_utc` + 2 steps, and so on, to `stop_utc`. If `stop_utc` is not on a step, `evaluate_series` adds it as the last step. If an argument is not correct, `evaluate_series` raises `ValueError`.

`SeriesResult` has four fields:

| Field | Contents |
|---|---|
| `times_utc` | List of the step times, ISO 8601 text with whole seconds, for example `2026-11-14T00:00:00Z` |
| `arrays` | Dict of numpy arrays. There is one array for each `Result` field, with one value for each step. |
| `events` | List of events in time order. Each event is a dict `{"type": ..., "utc": ...}`. |
| `summary` | Dict of summary values |

`SeriesResult.to_dict()` gives a plain dict that you can write as JSON.

#### Events

| Type | Definition |
|---|---|
| `sunrise` | `sun_visible_fraction` changes from 0 to more than 0. The first part of the Sun's disk comes above the terrain horizon. |
| `sunset` | `sun_visible_fraction` changes from more than 0 to 0. The last part of the Sun's disk goes below the terrain horizon. |
| `earthrise` | `earth_visible` changes from `False` to `True`. Earth's centre comes above the terrain horizon. |
| `earthset` | `earth_visible` changes from `True` to `False`. Earth's centre goes below the terrain horizon. |

`evaluate_series` finds a change between two adjacent steps. Then it uses bisection to find the time of the change. The time is accurate to `event_tol_s`. The `utc` text has whole seconds. The state at `start_utc` is not an event.

If two changes occur in one step, `evaluate_series` does not see them. For example, a short sunrise behind a peak can occur inside one step. Use a smaller step to find such events.

#### Summary

| Key | Meaning | Unit |
|---|---|---|
| `span_h` | Time from `start_utc` to `stop_utc` | hours |
| `n_steps` | Number of time steps | count |
| `sun_fraction_of_time` | Part of the span with `sun_visible_fraction` > 0 | 0 to 1 |
| `mean_sun_visible_fraction` | Time-weighted mean of `sun_visible_fraction` (trapezoid rule over the steps) | 0 to 1 |
| `earth_fraction_of_time` | Part of the span with `earth_visible` | 0 to 1 |
| `both_fraction_of_time` | Part of the span with the Sun and Earth both visible | 0 to 1 |
| `time_to_next_sunset_h` | Time from `start_utc` to the first `sunset`. `None` if the Sun is not visible at `start_utc` or if there is no sunset in the span. | hours |
| `time_to_next_earthset_h` | Time from `start_utc` to the first `earthset`. `None` if Earth is not visible at `start_utc` or if there is no earthset in the span. | hours |
| `longest_sun_period_h` | Longest continuous period with the Sun visible | hours |
| `longest_earth_period_h` | Longest continuous period with Earth visible | hours |
| `longest_both_period_h` | Longest continuous period with the Sun and Earth both visible | hours |

The fractions and periods use the event times, not only the steps. Thus they do not change much with the step. A period that touches `start_utc` or `stop_utc` stops at that edge of the span.

#### Example: Apollo 11, 35 days

```python
from lunarnav import evaluate_series

# Apollo 11 landing site, 35 days at 1-hour steps, observer 2 m above the ground.
s = evaluate_series(0.674, 23.473, "2026-11-14T00:00:00Z", "2026-12-19T00:00:00Z", 60, 2.0)

print(len(s.times_utc), s.times_utc[0], s.times_utc[-1])
print(f"sun_el at the first step: {s.arrays['sun_el'][0]:.3f}")
for e in s.events:
    print(e["type"], e["utc"])
for k, v in s.summary.items():
    print(f"{k:26s} {v if v is None or isinstance(v, int) else round(v, 3)}")
```

```text
841 2026-11-14T00:00:00Z 2026-12-19T00:00:00Z
sun_el at the first step: -13.158
sunrise 2026-11-15T01:23:37Z
sunset 2026-11-29T22:01:16Z
sunrise 2026-12-14T15:41:31Z
span_h                     840.0
n_steps                    841
sun_fraction_of_time       0.549
mean_sun_visible_fraction  0.547
earth_fraction_of_time     1.0
both_fraction_of_time      0.549
time_to_next_sunset_h      None
time_to_next_earthset_h    None
longest_sun_period_h       356.627
longest_earth_period_h     840.0
longest_both_period_h      356.627
```

Apollo 11 is on the near side. Thus Earth is always visible, and there is no earthrise or earthset. The Sun is below the horizon at the start. Thus `time_to_next_sunset_h` is `None`.

#### Example: Shackleton with a horizon mask, 30 days

```python
from lunarnav import evaluate_series

# Shackleton, 30 days at 1-hour steps.
# A synthetic mask: the terrain horizon is 1.5 deg high in all directions.
mask = {"az_step_deg": 0.5, "elevation_deg": [1.5] * 720, "observer_height_m": 2.0}
s = evaluate_series(-89.45, -137.3, "2026-11-14T00:00:00Z", "2026-12-14T00:00:00Z", 60, 2.0,
                    mask)

for e in s.events:
    print(e["type"], e["utc"])
for k in ("sun_fraction_of_time", "mean_sun_visible_fraction", "earth_fraction_of_time",
          "both_fraction_of_time", "time_to_next_sunset_h", "longest_both_period_h"):
    print(f"{k:26s} {s.summary[k]:.3f}")
```

```text
sunset 2026-11-16T11:06:04Z
earthrise 2026-11-19T00:22:10Z
sunrise 2026-11-25T18:58:14Z
earthset 2026-11-28T18:29:38Z
sun_fraction_of_time       0.689
mean_sun_visible_fraction  0.478
earth_fraction_of_time     0.325
both_fraction_of_time      0.099
time_to_next_sunset_h      59.101
longest_both_period_h      71.523
```

With a 1.5° horizon, the Sun and Earth are both visible for 9.9% of the span. The longest such period is 71.5 hours, from sunrise on 25 November to earthset on 28 November.

### Moon state with `lunarnav.moon`

`lunarnav.moon.moon_state_et(et)` gives the geometry of the full Moon at one instant. It does not use a surface point. The UI globe uses these values. `et` is TDB seconds past J2000. Use `lunarnav.core.utc_to_et` to convert a UTC time to `et`.

The result is a dict:

| Key | Meaning | Unit |
|---|---|---|
| `sub_solar_lat_deg`, `sub_solar_lon_deg` | Point on the Moon where the Sun is at the zenith. Longitude range is −180 (not included) to +180. | degrees |
| `sub_earth_lat_deg`, `sub_earth_lon_deg` | Point on the Moon where Earth is at the zenith | degrees |
| `sun_distance_km`, `earth_distance_km` | Distance from the Moon's centre | km |
| `sun_me_km`, `earth_me_km` | Vector from the Moon's centre to the body, `MOON_ME` frame | km |
| `sun_dir_me`, `earth_dir_me` | Unit vector to the body, `MOON_ME` frame | none |
| `sun_dir_j2000`, `earth_dir_j2000` | Unit vector to the body, `J2000` frame | none |
| `me_to_j2000` | Rotation matrix from `MOON_ME` to `J2000`: 9 values, 3 × 3, row by row. `v_J2000 = M · v_ME`. | none |

The positions are apparent positions from the Moon's centre (SPICE correction `LT+S`).

```python
from lunarnav.core import utc_to_et
from lunarnav.moon import moon_state_et

st = moon_state_et(utc_to_et("2026-11-14T12:00:00Z"))
for k in ("sub_solar_lat_deg", "sub_solar_lon_deg", "sub_earth_lat_deg", "sub_earth_lon_deg",
          "earth_distance_km", "sun_distance_km"):
    print(f"{k:18s} {st[k]:.3f}")
print("sun_dir_me  ", [round(x, 5) for x in st["sun_dir_me"]])
print("me_to_j2000 ", len(st["me_to_j2000"]), "values")
```

```text
sub_solar_lat_deg  -1.557
sub_solar_lon_deg  120.524
sub_earth_lat_deg  3.876
sub_earth_lon_deg  -1.923
earth_distance_km  405275.378
sun_distance_km    147798092.671
sun_dir_me   [-0.50771, 0.8611, -0.02718]
me_to_j2000  9 values
```

## Conventions

| Item | Rule |
|---|---|
| Frame | `MOON_ME`: the Moon Mean Earth / Polar Axis frame, defined in `moon_de440_250416.tf`. The +Z axis is the mean rotation axis. The +X axis points to the mean direction of Earth. Lunar maps and LOLA data use this frame. |
| Latitude | Planetocentric, degrees: the angle between the equator plane and the line from the Moon's centre to the point. Range −90 to +90. Exactly −90 and +90 give `ValueError` (read [Exact-pole `ValueError`](#exact-pole-valueerror)). |
| Longitude | East-positive, degrees. Input range −180 to +360. `lunarnav` converts a value in the range (180, 360] to −180 to +180: for example, 222.7 becomes −137.3. Thus the −180 to +180 and 0 to 360 conventions both work. A value outside −180 to +360 gives `ValueError`. |
| Azimuth | Degrees clockwise from local north: 0 = north, 90 = east, 180 = south, 270 = west. Range 0 to 360. |
| Elevation | Degrees above the local horizontal plane. This plane is perpendicular to the line from the Moon's centre to the observer. |
| Distance, height | Metres. The reference sphere radius is 1,737,400 m. |
| Observer height | Metres above the terrain surface |
| Time input | ISO 8601 text or a Python `datetime`. Text with an offset is converted to UTC: `2026-11-14T14:00:00+02:00` is `2026-11-14T12:00:00Z`. Text with no offset is UTC, for example `2026-11-14T12:00:00` or `2026-11-14 12:00:00`. An aware `datetime` is converted to UTC. A naive `datetime` is UTC. Text that `lunarnav` cannot parse gives `ValueError`. |
| Apparent direction | The Sun and Earth directions include light time and stellar aberration (SPICE correction `LT+S`). There is no atmosphere, thus no refraction. |

Local north is the direction along the surface toward the +Z (north) pole. Near the south pole, local north points away from the south pole.

### Time and longitude input

```python
from lunarnav import evaluate

a = evaluate(-89.45, -137.3, "2026-11-14T12:00:00Z", 2.0)
b = evaluate(-89.45, -137.3, "2026-11-14T14:00:00+02:00", 2.0)  # the same instant
c = evaluate(-89.45, 222.7, "2026-11-14T12:00:00Z", 2.0)  # 222.7 = -137.3 + 360
print(a == b, a == c)

for args in [(-89.45, -137.3, "14 Nov 2026 noon", 2.0),
             (-89.45, 540.0, "2026-11-14T12:00:00Z", 2.0)]:
    try:
        evaluate(*args)
    except ValueError as e:
        print("ValueError:", e)
```

```text
True True
ValueError: cannot parse time '14 Nov 2026 noon': use ISO 8601 text, for example 2026-11-14T12:00:00Z or 2026-11-14T14:00:00+02:00
ValueError: lon_deg must be in the range -180 to 360, got 540.0
```

If Python cannot parse the text, `lunarnav` gives it to the SPICE function `str2et` as UTC. Thus a leap second, for example `2016-12-31T23:59:60Z`, is correct for `evaluate`. `evaluate_series` does not accept a leap second, because Python `datetime` cannot show it.

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

The last lines of the output are:

```text
tests/test_series.py ............                                        [100%]

============================== 82 passed in 2.63s ==============================
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
- **The mask position is not checked.** `evaluate` does not compare the mask's `lat_deg` and `lon_deg` with the point. Make sure that they are the same. A mask with no `observer_height_m` has no height check (read [Mask height check](#mask-height-check)).
- **Earth visibility uses Earth's centre only.** `earth_visible` does not include Earth's disk (radius approximately 0.95°). It does not include antenna beam width or link budget.
- **Time range.** `de440s.bsp` covers 1849-12-26 to 2150-01-22 (UTC, approximately). The lunar orientation kernel covers a longer range (1549 to 2650). Outside the `de440s.bsp` range, `evaluate` raises a SPICE error (`SpiceSPKINSUFFDATA`). For example, 2151-01-01 gives this error.
- **Reference sphere.** Heights are above a sphere of radius 1,737,400 m, not above a gravity surface.
- **No atmosphere.** There is no refraction model. The Moon has no important atmosphere.
- **One process, global state.** SPICE keeps the loaded kernels in global state. CSPICE is not thread-safe. Use one thread for SPICE work, or use a lock. If other code unloads the kernels, for example with `spiceypy.kclear()`, `lunarnav` loads them again at the next call. `lunarnav.spice.is_loaded()` tells you if the kernels are loaded. `lunarnav.spice.reload()` unloads the five `lunarnav` kernels and loads them again.

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

### `ValueError: cannot parse time ...`

The time text is not ISO 8601. Use the form `2026-11-14T12:00:00Z`. Read [Conventions](#conventions).

### `SpiceSPKINSUFFDATA`

The instant is outside the time range of `de440s.bsp`. Read [Limitations](#limitations).

## Credits

- [NASA NAIF SPICE toolkit](https://naif.jpl.nasa.gov/naif/) and the NAIF generic kernels.
- [JPL DE440](https://ssd.jpl.nasa.gov/planets/eph_export.html) planetary and lunar ephemeris (Park et al., 2021).
- [spiceypy](https://github.com/AndrewAnnex/SpiceyPy), the Python interface to SPICE (Annex et al., 2020).
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), for the validation data.

## License

To be decided.
