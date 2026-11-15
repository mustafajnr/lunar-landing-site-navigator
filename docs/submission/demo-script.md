# Demo video script (30 seconds)

The Space Apps rules permit a video of **30 seconds or less**, or a deck of 7 slides or fewer. A longer video makes the project not eligible for Global Judging (see `requirements.md`, section 4). Thus this file has no 2-minute version. A 7-slide outline is at the end, as an alternative.

## The story

A south-pole mission plans to land on 2026-11-22. Then the launch slips by 2 weeks. The planner uses the tool and finds that Earth is behind the terrain after the slip. The planner compares another site, and then finds a better date.

All values below come from the deployed tool on 2026-11-14. The observer height is 2 m (the default, "Lander 2 m"). The horizon is the LOLA terrain horizon. The values do not change between runs, because they come from the ephemeris and fixed terrain data.

## Before you record

1. Open https://lunarsite.select (or the run.app address) in a desktop browser at 1920 × 1080. Wait until the globe shows its texture.
2. Record each scene as a separate clip. Then cut the clips together. There is not enough time to type and click live in 30 seconds.
3. To set a date, click the date field under "Time (UTC)". Type the date and the time 00:00. Then press Enter or click outside the field.
4. Add English subtitles that repeat the narration. They are required if you speak another language. They also help viewers with no sound.
5. Do not show people under 18. Do not add NASA logos. If you use an SI voice or SI images, add an acknowledgement or a watermark (see `requirements.md`, section 6).

## Scenes

The narration has about 75 words. That is about 2.5 words per second.

| Time | Screen and actions | Narration |
|---|---|---|
| 0:00–0:03 | Title card: "lunarsite.select", "Lunar Landing Site Navigator challenge", "Mustafa Abdeltawwab, team lunarspot". | "I'm Mustafa Abdeltawwab, team lunarspot." |
| 0:03–0:07 | The overview, with the default point (Shackleton–de Gerlache ridge, 89.45° S, 137.31° W). Date 2026-11-22 00:00. Zoom on the results panel: "SUN IS UP" and "EARTH IS UP, Earthset in 7 d 05 h 19 min". | "Lunar Landing Site Navigator. Our south-pole mission lands November 22. Sun and Earth are up." |
| 0:07–0:14 | Change the date to 2026-12-06 00:00. Click "View south pole". The panel shows "EARTH IS DOWN, Earthrise in 9 d 15 h 10 min". Point at the sky plot: the blue Earth dot is below the brown terrain outline. | "Launch slips two weeks. Now Earth is behind the terrain. No direct link to Earth for nine days." |
| 0:14–0:19 | In "Site", select "de Gerlache Rim". The panel shows "SUN IS DOWN, Sunrise in 8 d 07 h 02 min". Point at the sky plot: the Sun is above 0° but below the terrain outline. | "Another site? At de Gerlache Rim, the terrain hides the Sun too." |
| 0:19–0:25 | Type Lat −89.45, Lon −137.31, click "Go". Change the date to 2026-12-16 00:00. The panel shows "SUN IS UP" and "EARTH IS UP, Earthset in 10 d 11 h 09 min". Click "±2°" on the sky plot. | "Move to December 16: Sun and Earth both up for ten days." |
| 0:25–0:30 | Click "Full screen" on the site map: the Sun and Earth arrows on the NASA images. Then cut to the title card with the URL. | "NASA SPICE ephemeris, LOLA terrain, any site, any date. Free at lunarsite dot select." |

## Values to show (check them in the recording)

| Scene | Point | UTC | Sun | Earth |
|---|---|---|---|---|
| Plan | Ridge | 2026-11-22 00:00 | Up, +1.00°, 100 % of the disk visible. Sunset in 59 d 08 h 58 min (2027-01-20 08:58, after the window). | Up, +4.98°, margin +4.14°. Earthset in 7 d 05 h 19 min (2026-11-29 05:19). |
| Slip | Ridge | 2026-12-06 00:00 | Up, +2.00°. | Down, −7.10°, margin −7.88°. Earthrise in 9 d 15 h 10 min (2026-12-15 15:10). |
| Compare | de Gerlache Rim | 2026-12-06 00:00 | Down. Sun at +1.76°, terrain at +5.04° in that direction. Sunrise in 8 d 07 h 02 min (2026-12-14 07:02). | Down, −6.06°, margin −5.71°. Earthrise in 7 d 15 h 05 min (2026-12-13 15:05). |
| New date | Ridge | 2026-12-16 00:00 | Up, +1.04°. | Up, +1.34°, margin +0.52°. Earthset in 10 d 11 h 09 min (2026-12-26 11:09). |

7-day totals from the API (`POST /v1/series`, 30-minute steps) support the narration:

| 7 days from | Ridge: Sun / Earth / both | de Gerlache Rim: Sun / Earth / both |
|---|---|---|
| 2026-11-22 | 100 % / 100 % / 100 % | 100 % / 100 % / 100 % |
| 2026-12-06 | 100 % / 0 % / 0 % | 0 % / 0 % / 0 % |
| 2026-12-16 | 100 % / 100 % / 100 % | 100 % / 100 % / 100 % |

Note for the narration "both up for ten days": at the ridge, Earth is up from 2026-12-15 15:10 to 2026-12-26 11:09. The Sun is up for the full period. The Earth margin on 2026-12-16 at 00:00 is only +0.52°. Do not say that the link is "strong".

## Alternative: 7-slide deck

Use this outline if you do not make a video. Slides must be in English. The deck must show the team name, the team member names and the challenge.

1. **Title.** "Lunar Landing Site Navigator". Team name, member name, challenge name. Screenshot `01-overview-ridge-2026-11-22.jpg`.
2. **The problem.** At the south pole, the Sun and Earth stay near the horizon. Terrain can hide them. A schedule slip can remove power or the link to Earth.
3. **The tool.** Select a site and a date. See if the Sun and Earth are up, and the time to the next sunset and Earthset. Link: https://lunarsite.select.
4. **The slip.** Screenshot `02-south-pole-sky-plot-2026-12-06.jpg`. Table: 7 days from 2026-11-22 gives 100 % Earth. 7 days from 2026-12-06 gives 0 % at three sites.
5. **The better date.** Screenshot `03-ridge-2026-12-16-sky-zoom.jpg`. Earthset in 10 d 11 h 09 min. Earth margin +0.52°.
6. **The data.** NASA NAIF SPICE, JPL DE440, LOLA (PGDA, Barker et al. 2023), NASA Moon Trek, JAXA Kaguya mosaic. Agreement with JPL Horizons at six test instants: 0.00000045°. Screenshot `04-site-map-malapert-2026-12-16.jpg`.
7. **Next steps.** Side-by-side comparison, results over a site area, an antenna and Earth-disk model. Use of SI: built with Claude Code under the developer's direction and review.
