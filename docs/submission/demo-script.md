# Demo video script (30 seconds)

The Space Apps rules permit a video of **30 seconds or less**, or a deck of 7 slides or fewer. A longer video makes the project not eligible for Global Judging (see `requirements.md`, section 4). Thus this file has no 2-minute version. A 7-slide outline is at the end, as an alternative.

## The story

NASA plans Artemis IV, the first crewed landing, for early 2028 at the lunar south pole. The crew stays about 6.5 days. NASA needs sunlight for the whole stay, and it excludes places with less than 25 % Earth visibility. These are the "Artemis" defaults in the tool's Mission requirements. NASA has not chosen a region or a day, so the landing days in the video are **examples**.

1. The plan: land on 2028-01-10 at the best point of the Malapert Massif region. Meets 3 of 3.
2. The launch slips 12 days to 2028-01-22. The same point is in darkness. Meets 1 of 3.
3. The tool shows two answers, as the challenge text asks ("alternative dates at the same site, or alternative sites in the same region"):
   - **Same point, new date:** the "Next landing window" at point 1 is 2028-02-03 20:30 to 2028-02-08 20:00. "Use this start" gives Meets 3 of 3.
   - **Same region, new point:** best point 4 has a longer window, 2028-02-03 13:00 to 2028-02-16 18:30. That gives 8 more days of margin for a new slip.

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

The structure follows the Space Apps guide: name and team, the challenge, the title and tagline, how it works with NASA data, and what it does for people. The narration has about 70 words, about 2.4 words per second.

**Before you record, make 3 saved searches** (duration 6.5 days, height 2 m). Use "Save search" with these names:
1. Malapert Massif, best point 1, start 2028-01-22 00:00: "Malapert point 1, 22 Jan (after slip)"
2. The same point, start 2028-02-03 20:30 (or "Use this start"): "Malapert point 1, 3 Feb (next window)"
3. de Gerlache Rim, best point 1, start 2028-01-22 00:00: "de Gerlache Rim point 1, 22 Jan"

| Time | Part | Screen and actions | Narration |
|---|---|---|---|
| 0:00–0:03 | Name and team | Title card: "lunarsite.select", "Lunar Landing Site Navigator challenge", "Mustafa Abdeltawwab, team lunarspot". | "I'm Mustafa Abdeltawwab, team lunarspot." |
| 0:03–0:08 | The challenge | Click **View south pole** on the globe. | "At the lunar south pole, terrain can hide the Sun and Earth: no power, no link." |
| 0:08–0:10 | Title and tagline | Text over the default view: **"lunarsite.select: solar power and a link to Earth, for any site and date."** | "lunarsite dot select checks any site and date." |
| 0:10–0:16 | How it works: the slip | Malapert best point 1, start 2028-01-10: **"Meets 3 of 3"**. Change the start to 2028-01-22: **"Meets 1 of 3"** and the **"Next landing window"** line. Caption: "Example landing days. NASA has not chosen a day or a region." | "Malapert works for Artemis IV. After a launch slip, it fails. The tool finds the next landing window." |
| 0:16–0:22 | How it works: the comparison | Select the 3 saved searches, click **Compare**. Show the site images and the ★ rows. | "Or compare sites and dates side by side, and pick the best." |
| 0:22–0:26 | NASA data | Close the comparison. Map → **Sun and Earth** tab (the two NASA PGDA maps). | "NASA ephemeris, terrain and illumination data, checked against JPL Horizons." |
| 0:26–0:30 | For people | End card: "lunarsite.select". Optional small line: "Built with AI assistance (Claude Code)". | "For mission planners, teachers and the public." |

## Values to show (check them in the recording)

Duration 6.5 days, observer height 2 m, NASA default requirements.

| Scene | Point | Start (UTC) | Verdict |
|---|---|---|---|
| Plan | Malapert Massif, best point 1 (85.98° S, 1.85° W) | 2028-01-10 00:00 | Sun 100 %, Earth 99 %. Meets 3 of 3. |
| Slip | The same point | 2028-01-22 00:00 | Sun 10 %, the Sun is down at the start, longest darkness at least 5 d 14 h. Meets 1 of 3. |
| Same point, new date | Malapert Massif, best point 1 | 2028-01-22 00:00, then "Use this start" | Next landing window 2028-02-03 20:30 to 2028-02-08 20:00. After "Use this start": Meets 3 of 3. |
| Same region, new point | Malapert Massif, best point 4 (85.96° S, 2.32° W) | 2028-01-22 00:00 | Next landing window 2028-02-03 13:00 to 2028-02-16 18:30. "Use this start": Meets 3 of 3. (Slides only.) |
| Comparison | The 3 saved searches above | – | Sun: 9.9 % / ★ 100 % / ★ 100 %. Earth: ★ 100 % / ★ 100 % / 49.4 %. Longest night: 5.6 d / ★ none / ★ none. |

**What not to say:**
- Do not say that NASA chose Malapert or de Gerlache Rim, or these days.
- Do not say that a point is "safe" for any later slip. Each window has an end date.

Extra facts for the slides or the description:
- Near de Gerlache Rim, points 0.4 to 1.5 km apart gave 0 % to 100 % Sun for 22–29 Jan 2028.
- At the Shackleton–de Gerlache ridge, a 10 m mast changes the sunlight over 2027 from 72 % to 96 %, and the longest night from 14 days to 3 days.

## Alternative: 7-slide deck

The backup deck tells the same Artemis IV story in 7 slides: https://claude.ai/artifact/Gy2KAkQGkenaG3GzqjhB2e

It is private. To submit it, share it from its Share menu, or export it as PDF or PowerPoint and put the file on a public host. Test the link in a private browser window.
