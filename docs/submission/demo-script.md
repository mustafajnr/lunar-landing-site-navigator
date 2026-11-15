# Demo video script (30 seconds)

The Space Apps rules permit a video of **30 seconds or less**, or a deck of 7 slides or fewer. A longer video makes the project not eligible for Global Judging (see `requirements.md`, section 4). Thus this file has no 2-minute version. A 7-slide outline is at the end, as an alternative.

## The story

NASA's VIPER rover will work for about 100 days at Mons Mouton, near the lunar south pole. NASA plans it for 2027 on a Blue Origin lander. NASA has not published a landing day or a landing point. Thus the demo uses:

- the published landing point of IM-2 "Athena" on Mons Mouton (84.79° S, 29.20° E, LROC), which is in the site list as "IM-2 Athena (Mons Mouton)",
- an **example** start date of 2027-09-01 and a period of 100 days,
- the NASA default mission requirements in the tool: VIPER survives 50 hours of darkness, Artemis needs 6.5 days of sunlight from the start, and Artemis HLS needs 25 % Earth visibility.

The tool shows that the night at the IM-2 point lasts about 14 days. Then the NASA PGDA sunlight layer and the "Best points in this site" list find a point about 27 km away, in the Artemis III region "Nobile Rim 1 and Mons Mouton", where the longest night is 2.9 times shorter and Earth is always in view.

All values below come from the live site on 2026-11-15, with observer height 2 m ("Lander 2 m").

## Before you record

1. Open https://lunarsite.select in Chrome at 1920 × 1080, full screen (F11). Close the welcome card (✕).
2. **Warm up the API.** Do the full flow once before you record. The first load of a new point calculates its terrain horizon and can take up to 1 minute. After that, it loads in a few seconds.
3. Record each scene as a separate clip, then cut the clips together. There is not enough time to type and click live in 30 seconds.
4. Add English subtitles that repeat the narration.
5. Add the caption "Example start date. NASA has not set the landing day." in scene 2.
6. Do not show people under 18. Do not add NASA logos. If you use an AI voice or AI images, add an acknowledgement or a watermark.

## Scenes

The narration has about 75 words. That is about 2.5 words per second.

| Time | Screen and actions | Narration |
|---|---|---|
| 0:00–0:03 | Title card: "lunarsite.select", "Lunar Landing Site Navigator challenge", "Mustafa Abdeltawwab, team lunarspot". | "I'm Mustafa Abdeltawwab, team lunarspot. This is lunarsite dot select." |
| 0:03–0:11 | Site: "IM-2 Athena (Mons Mouton)". Start 2027-09-01 00:00. Custom duration 100. Verdict tab: zoom on "Meets 1 of 3 mission requirements" and "✕ Longest darkness 13 d 22 h. The limit is 50 h (VIPER)." | "NASA's VIPER rover will work 100 days at Mons Mouton. At the IM-2 landing point, the night lasts 14 days. VIPER survives only 50 hours." |
| 0:11–0:16 | Site map → Layers → "Average sunlight (NASA PGDA, 18.6 years)". Zoom out a little to show the brighter ground. | "NASA's long-term sunlight map shows brighter ground nearby." |
| 0:16–0:24 | Site: "Nobile Rim 1 and Mons Mouton". Open "Best points in this site". Click point 1. Verdict: Sun 86 %, Earth 100 %, "longest continuous darkness 4 d 18 h", "Meets 2 of 3". | "The tool finds a point with Earth always in view and nights three times shorter." |
| 0:24–0:30 | Details tab: the sky plot. Click Play for 2 seconds. Then the end card: "lunarsite.select". | "NASA ephemeris, terrain and illumination data. Any site, any date. Free at lunarsite dot select." |

## Values to show (check them in the recording)

Period: 2027-09-01 00:00 UTC, 100 days. Observer height 2 m.

| | IM-2 Athena (Mons Mouton) | Best point 1, Nobile Rim 1 and Mons Mouton (84.769° S, 38.986° E) |
|---|---|---|
| Headline | ◐ Possible with limits: sunlight 52 %, Earth 81 % | ◐ Possible with limits: sunlight 86 % |
| Average illumination | 52.4 % | 86.0 % |
| Longest continuous darkness | 13 d 22 h | 4 d 18 h |
| Earth visibility | 81 % (longest outage 5 d 6 h) | 100 % |
| Mission requirements | Meets 1 of 3: ✕ darkness, ✕ Sun down at the start, ✓ Earth | Meets 2 of 3: ✕ darkness (4 d 18 h > 50 h), ✓ sunlight 21 d 8 h from the start, ✓ Earth 100 % |
| PGDA list value | – | Sun 67 %, Earth 99 %, slope 4° (18.6-year average at ground level) |

Do not say that the new point meets the VIPER limit. It does not: 4 d 18 h is more than 50 h. Say "three times shorter" (13 d 22 h ÷ 4 d 18 h = 2.9).

The new point is about 27 km from the IM-2 point. Do not say "next to" or "a few hundred metres".

Extra fact for the slides or the description: at the Shackleton–de Gerlache ridge, a 10 m mast changes the sunlight over 2027 from 72 % to 96 %, and the longest night from 14 days to 3 days.

## Alternative: 7-slide deck

Use this outline if you do not make a video. Slides must be in English. The deck must show the team name, the team member names and the challenge.

1. **Title.** "Lunar Landing Site Navigator". Team name, member name, challenge name. Screenshot `01-overview-ridge-2026-11-22.jpg`.
2. **The problem.** At the south pole, the Sun and Earth stay near the horizon. Terrain can hide them. A schedule slip can remove power or the link to Earth.
3. **The tool.** Select a site and a date. See if the Sun and Earth are up, and the time to the next sunset and Earthset. Link: https://lunarsite.select.
4. **The slip.** Screenshot `02-south-pole-sky-plot-2026-12-06.jpg`. Table: 7 days from 2026-11-22 gives 100 % Earth. 7 days from 2026-12-06 gives 0 % at three sites.
5. **The better date.** Screenshot `03-ridge-2026-12-16-sky-zoom.jpg`. Earthset in 10 d 11 h 09 min. Earth margin +0.52°.
6. **The data.** NASA NAIF SPICE, JPL DE440, LOLA (PGDA, Barker et al. 2023), NASA Moon Trek, JAXA Kaguya mosaic. Agreement with JPL Horizons at six test instants: 0.00000045°. Screenshot `04-site-map-malapert-2026-12-16.jpg`.
7. **Next steps.** Side-by-side comparison, results over a site area, an antenna and Earth-disk model. Use of SI: built with Claude Code under the developer's direction and review.
