# Demo video script (30 seconds)

The Space Apps rules permit a video of **30 seconds or less**, or a deck of 7 slides or fewer. A longer video makes the project not eligible for Global Judging (see `requirements.md`, section 4). Thus this file has no 2-minute version. A 7-slide outline is at the end, as an alternative.

## The story

NASA plans Artemis IV, the first crewed landing, for early 2028 at the lunar south pole. The crew stays about 6.5 days. NASA needs sunlight for the whole stay, and it excludes places with less than 25 % Earth visibility. These are the "Artemis" defaults in the tool's Mission requirements. NASA has not chosen a region or a day, so the landing days in the video are **examples**.

1. The plan: land on 2028-01-10 at the best point of the Malapert Massif region. Meets 3 of 3.
2. The launch slips 12 days to 2028-01-22. The same point is in darkness. Meets 1 of 3.
3. The tool shows two ways out:
   - **Wait:** best point 4 of the same region. The "Next landing window" opens on 2028-02-03 13:00. "Use this start" gives Meets 3 of 3.
   - **Move:** de Gerlache Rim, near the pole. Its best point 1 meets 3 of 3 on 2028-01-22.

All values come from the live site on 2026-11-15, with observer height 2 m ("Lander 2 m") and the NASA default requirements.

## Before you record

1. Open https://lunarsite.select in Chrome at 1920 × 1080, full screen (F11). Close the welcome card (✕).
2. **Warm up the API.** Do the full flow once before you record. The first load of a new point calculates its terrain horizon and can take up to 1 minute. After that, it loads in a few seconds.
3. Set "Custom duration" to **6.5** before the first clip. It stays for all scenes.
4. Record each scene as a separate clip, then cut the clips together.
5. Add English subtitles that repeat the narration.
6. Add the caption "Example landing days. NASA has not chosen a day or a region." in scene 2.
7. Do not show people under 18. Do not add NASA logos. If you use an AI voice or AI images, add an acknowledgement or a watermark.

## Scenes

The narration has about 75 words, about 2.5 words per second.

| Time | Screen and actions | Narration |
|---|---|---|
| 0:00–0:03 | Title card: "lunarsite.select", "Lunar Landing Site Navigator challenge", "Mustafa Abdeltawwab, team lunarspot". | "I'm Mustafa Abdeltawwab, team lunarspot. This is lunarsite dot select." |
| 0:03–0:09 | Site: "Malapert Massif". In "Best points in this site", click **1**. Start 2028-01-10 00:00. Verdict: "Meets 3 of 3 mission requirements." | "Artemis IV lands at the south pole for six and a half days. NASA needs sunlight and Earth in view. Malapert works." |
| 0:09–0:14 | Change the start to 2028-01-22 00:00. Verdict: "✕ Difficult: no sunlight…", "Meets 1 of 3". | "The launch slips twelve days. Now the site is in darkness." |
| 0:14–0:21 | Click best point **4**. The Mission requirements box shows "Next landing window: 2028-02-03 13:00 …". Click **Use this start**. "Meets 3 of 3". | "The tool finds the next landing window: wait twelve days at a nearby point." |
| 0:21–0:26 | Site map → "Sun and Earth" tab, zoomed out. Then site "de Gerlache Rim", best point **1**, start 2028-01-22: "Meets 3 of 3". | "Or move closer to the pole, where the Sun stays up." |
| 0:26–0:30 | End card: "lunarsite.select". | "NASA ephemeris, terrain and illumination data. Any site, any date." |

## Values to show (check them in the recording)

Duration 6.5 days, observer height 2 m, NASA default requirements.

| Scene | Point | Start (UTC) | Verdict |
|---|---|---|---|
| Plan | Malapert Massif, best point 1 (85.98° S, 1.85° W) | 2028-01-10 00:00 | Sun 100 %, Earth 99 %. Meets 3 of 3. |
| Slip | The same point | 2028-01-22 00:00 | Sun 10 %, the Sun is down at the start, longest darkness at least 5 d 14 h. Meets 1 of 3. |
| Wait | Malapert Massif, best point 4 (85.96° S, 2.32° W) | 2028-01-22 00:00, then "Use this start" | Next landing window 2028-02-03 13:00 to 2028-02-16 18:30. After "Use this start": Meets 3 of 3. |
| Move | de Gerlache Rim, best point 1 (88.66° S, 68.40° W) | 2028-01-22 00:00 | Sun 100 %, Earth 49 %. Meets 3 of 3. The headline says "Difficult: no direct link to Earth for at least 3 d 6 h", because Earth is below the horizon about half of the stay. |

**What not to say:**
- Do not say that NASA chose Malapert or de Gerlache Rim, or these days.
- At de Gerlache Rim, do not say "Earth is always in view". Earth is visible 49 % of the stay. The crew needs a relay satellite for the rest. The narration says only "where the Sun stays up".

Extra facts for the slides or the description:
- Near de Gerlache Rim, points 0.4 to 1.5 km apart gave 0 % to 100 % Sun for 22–29 Jan 2028.
- At the Shackleton–de Gerlache ridge, a 10 m mast changes the sunlight over 2027 from 72 % to 96 %, and the longest night from 14 days to 3 days.

## Alternative: 7-slide deck

The backup deck tells the same Artemis IV story in 7 slides: https://claude.ai/artifact/Gy2KAkQGkenaG3GzqjhB2e

It is private. To submit it, share it from its Share menu, or export it as PDF or PowerPoint and put the file on a public host. Test the link in a private browser window.
