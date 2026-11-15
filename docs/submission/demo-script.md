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

Set up before each clip: close the welcome card (✕). In "Time and period (UTC)", click **1 week** once. To set the start, click the "Start (UTC)" field, type the date and 00:00, then press Enter or click outside the field.

| Time | Screen and actions | Narration |
|---|---|---|
| 0:00–0:03 | Title card: "lunarsite.select", "Lunar Landing Site Navigator challenge", "Mustafa Abdeltawwab, team lunarspot". | "I'm Mustafa Abdeltawwab, team lunarspot." |
| 0:03–0:08 | The default point (Shackleton–de Gerlache ridge). Start 2026-11-22 00:00, 1 week. Zoom on the results panel: "▲ SUN IS UP", "▲ EARTH IS UP". Scroll to "Result for the period": Sun 100 %, Earth 100 %. | "lunarsite dot select. Our south-pole mission lands November 22, for one week. Sun and Earth are up all week." |
| 0:08–0:14 | Change the start to 2026-12-06 00:00. The panel shows "▼ EARTH IS DOWN". "Result for the period": Earth 0.0 %, "Longest Earth outage: 7 d 0 h". Point at the sky plot: the blue Earth track is below the brown terrain outline. | "Launch slips two weeks. Now Earth is behind the terrain. No radio link to Earth for the whole week." |
| 0:14–0:19 | In "Site", select "de Gerlache Rim" (group "Artemis III candidate regions"). The panel shows "▼ SUN IS DOWN" and "Longest night: 7 d 0 h". | "Another site? At de Gerlache Rim, the terrain hides the Sun too." |
| 0:19–0:25 | Select the ridge again (the first item in the site list). Change the start to 2026-12-16 00:00. Sun 100 %, Earth 100 %. Click Play (1 day / s) and let the dots move on the sky plot. | "Move to December 16: Sun and Earth up all week." |
| 0:25–0:30 | Click "Full screen" on the site map: the Sun and Earth arrows on the NASA images. Then cut to the end card with the URL. | "NASA ephemeris and LOLA terrain. Any site, any date. Free at lunarsite dot select." |

## Values to show (check them in the recording)

All values are from the live site on 2026-11-15, observer height 2 m, period 1 week.

| Scene | Point | Start (UTC) | Cards | Result for the period |
|---|---|---|---|---|
| Plan | Ridge | 2026-11-22 00:00 | ▲ Sun is up, ▲ Earth is up. "No Earthset before the end of the period (7 d)". Next Earthset 2026-11-29 05:19. | Sun 100 %, Earth 100 %, both 100 %. |
| Slip | Ridge | 2026-12-06 00:00 | ▲ Sun is up, ▼ Earth is down. Next Earthrise 2026-12-15 15:10. | Sun 100 %, Earth 0.0 %. Longest Earth outage: 7 d 0 h, until the end of the period. |
| Compare | de Gerlache Rim | 2026-12-06 00:00 | ▼ Sun is down, ▼ Earth is down. Next sunrise 2026-12-14 07:02. | Sun 0.0 %, Earth 0.0 %. Longest night: 7 d 0 h. |
| New date | Ridge | 2026-12-16 00:00 | ▲ Sun is up, ▲ Earth is up. Next Earthset 2026-12-26 11:09. | Sun 100 %, Earth 100 %, both 100 %. |

Note: on 2026-12-16 00:00 the Earth margin at the ridge is only +0.52°. Do not say that the link is "strong".

## Alternative: 7-slide deck

Use this outline if you do not make a video. Slides must be in English. The deck must show the team name, the team member names and the challenge.

1. **Title.** "Lunar Landing Site Navigator". Team name, member name, challenge name. Screenshot `01-overview-ridge-2026-11-22.jpg`.
2. **The problem.** At the south pole, the Sun and Earth stay near the horizon. Terrain can hide them. A schedule slip can remove power or the link to Earth.
3. **The tool.** Select a site and a date. See if the Sun and Earth are up, and the time to the next sunset and Earthset. Link: https://lunarsite.select.
4. **The slip.** Screenshot `02-south-pole-sky-plot-2026-12-06.jpg`. Table: 7 days from 2026-11-22 gives 100 % Earth. 7 days from 2026-12-06 gives 0 % at three sites.
5. **The better date.** Screenshot `03-ridge-2026-12-16-sky-zoom.jpg`. Earthset in 10 d 11 h 09 min. Earth margin +0.52°.
6. **The data.** NASA NAIF SPICE, JPL DE440, LOLA (PGDA, Barker et al. 2023), NASA Moon Trek, JAXA Kaguya mosaic. Agreement with JPL Horizons at six test instants: 0.00000045°. Screenshot `04-site-map-malapert-2026-12-16.jpg`.
7. **Next steps.** Side-by-side comparison, results over a site area, an antenna and Earth-disk model. Use of SI: built with Claude Code under the developer's direction and review.
