# Project page text

This file gives the text for each field of the Space Apps project page. The field names come from the Project Submission Guide (see `requirements.md`). The guide gives no length limits. The site scripts have a general default of 1,500 characters for a text area, but this was not confirmed for these fields. Thus each field below has a character count. The High-Level Project Summary is under 1,500 characters. If a field is too long for the form, use the short version.

Items marked `TODO(developer)` need an answer from the developer.

---

## Project Name

lunarsite.select

(Challenge: Lunar Landing Site Navigator. The web app title is the challenge name. The project name is the site address.)

---

## High-Level Project Summary

(188 words. The form suggests 50 to 200 words. Paragraphs: what we developed, how it addresses the challenge, why it is important.)

We developed lunarsite.select, a free web tool that tells if a lunar landing site will have solar power and a direct radio link to Earth for the whole mission. You pick a site, a landing date and a mission duration. The tool calculates where the Sun and Earth are relative to the local terrain horizon, with NASA SPICE (JPL DE440) and LRO LOLA terrain data.

It addresses the challenge with a plain-language verdict and a check against NASA mission requirements. When a launch slips, it finds the next landing window, ranks the best points in a site from NASA illumination maps, and compares sites and dates side by side. Example: in our assumed Artemis IV plan, a 12-day slip makes a Malapert Massif point fail. The tool finds a new date and a new site in a few clicks.

This is important because missions slip, and at the lunar south pole a small change in date or place can remove power or communication. Today, each new check needs several detailed tools and raw data. Our tool gives the answer in seconds, for mission planners, teachers and the public.

---

## Link to Project Demo

Slide deck (7 slides, PDF): https://github.com/mustafajnr/lunar-landing-site-navigator/blob/main/docs/submission/lunarsite-select-slides.pdf

---

## Link to Final Project

https://lunarsite.select

Code repository (public, Apache 2.0): https://github.com/mustafajnr/lunar-landing-site-navigator

---

## Detailed Project Description

(About 890 words. The answers follow the questions of the form.)

**What does it do, and how does it work?**

lunarsite.select answers two questions for a point on the Moon and a mission period: can a solar array see the Sun, and can an antenna see Earth?

1. **Pick a point.** Select one of 24 curated sites (15 past landings, the 7 Artemis III candidate regions and 2 planned NASA CLPS sites), search 9,087 official lunar feature names, type coordinates, or click the 3D globe. For each south-pole site, "Best points in this site" lists the 5 points with the most long-term sunlight and Earth visibility (NASA PGDA maps), with a slope under 15°.
2. **Set the period.** A UTC start, a duration of up to 400 days, and the height of the solar panel or antenna.
3. **Read the Verdict.** Plain-language ratings for solar power, the radio link to Earth, and both together, and pass/fail checks against NASA mission requirements: at most 50 h of darkness (VIPER planning), sunlight for 6.5 days from landing (Artemis), and at least 25 % Earth visibility (Artemis HLS). The user can change the limits. If the date fails, "Next landing window" searches the next 60 days, and one click sets the new start.
4. **Look deeper and compare.** The Details tab has the Sun and Earth positions now, countdowns to sunset and Earthset, a sky plot with the terrain horizon, and all events. Saved searches compare side by side, with the verdicts, site images and Sun and Earth arrows.

A Python API calculates the geometry with NASA NAIF SPICE and the JPL DE440 ephemeris, which includes libration. South of about 65° S, it calculates the terrain horizon of the point from LRO LOLA elevation data (20 m and 120 m per pixel): every 0.5° of azimuth, along 150 km, with the curvature of the Moon. It finds each sunrise, sunset, Earthrise and Earthset to 1 second. At six test times, our Sun and Earth directions agree with JPL Horizons to within 4.5 × 10⁻⁷°.

**Example.** We assume an Artemis IV landing at Malapert Massif best point 1 on 10 January 2028, for 6.5 days (NASA has not chosen a region or a date). It meets 3 of 3 requirements. The launch slips 12 days: now the Sun is down at the landing, and the point meets 1 of 3. The tool suggests the next landing window at the same point, 3 to 8 February. In the comparison, de Gerlache Rim, nearer the pole, also meets 3 of 3 on the new date, but Earth is visible only 49 % of the stay, so the crew may need a relay satellite.

**What benefits does it have?**

- Answers in seconds that today need several detailed tools (QuickMap, Moon Trek, JPL Horizons) and raw data.
- The real terrain horizon, not a flat one. Near the pole, a move of about 1 km can change a week from full sunlight to full darkness.
- NASA requirements and the next landing window, not only numbers.
- One screen for experts and the public: the Verdict for everyone, the Details for planners.
- Free, in any browser, also on a phone. No account, no cookies.

**What is the intended impact?**

Mission teams can make a fast first check when a launch slips or a site changes, and see at once which dates and points still work. Teachers and students can see why the lunar south pole is difficult: the Sun and Earth skim the horizon, and a ridge or a few days change everything. Next, the tool can analyse a whole region for a period, and help to plan rover routes between "safe havens" with short nights, for missions such as NASA's VIPER rover.

**What tools, languages, hardware or software did we use?**

TypeScript, three.js, OpenLayers and Vite for the web app. Python, FastAPI, spiceypy (NASA NAIF CSPICE), numpy and rasterio for the API and the calculations. Google Cloud Run, Cloud Build and Cloud Storage for hosting. pytest and Playwright for tests. Claude Code (Anthropic) for AI-assisted development, under the developer's direction and review. No special hardware.

**How is the project creative?**

- It turns ephemeris and terrain data into a decision: a verdict, pass/fail requirements, and a suggested next landing window with a "Use this start" button.
- It joins NASA's long-term illumination maps with an exact calculation: the maps propose the best points in a site, and the tool then checks each point for the real dates.
- It shows the problem visually: two linked maps of sunlight and Earth visibility, Sun and Earth arrows on NASA images, and a sky plot with the terrain horizon.

**What factors did we consider?**

- **Accuracy:** the JPL DE440 ephemeris with libration, the real LOLA terrain, independent checks against JPL Horizons, and the data sources of each result.
- **Honesty:** the rating is labelled as our rule of thumb, the NASA requirements have their sources, and the limits are listed (Earth's centre only with no antenna model, terrain only south of about 65° S, one point and not a whole area).
- **Users:** plain language for the public, the numbers for planners, a user guide, a phone layout, and accessibility labels.
- **Rules and openness:** NASA data only, an Apache 2.0 licence, a public repository, no cookies or tracking, and AI use stated in the tool, the metadata and the documents.

### Short version (about 1,118 characters)

For a lunar site and a mission period (up to 400 days), the tool shows when the Sun and Earth are above the local terrain horizon. You select one of 24 curated sites (15 past landings, 2 planned CLPS sites and the 7 Artemis III candidate regions) or type coordinates. The Verdict tab gives a plain-language result and checks NASA mission requirements: 50 h of darkness (VIPER), 6.5 days of sunlight and 25 % Earth visibility (Artemis). It finds the next landing window that meets all three. The Details tab has a sky plot, events and Horizons links. A site map shows Moon Trek images, slope, PGDA average sunlight and the best points in a site. You can compare up to 4 saved searches. A Python API on Google Cloud Run uses NASA SPICE, JPL DE440 and LOLA terrain south of about 65° S. Its Sun and Earth directions agree with JPL Horizons to 0.00000045°. Example: an Artemis IV point at Malapert Massif meets 3 of 3 requirements on 2028-01-10, and 1 of 3 after a 12-day slip. Limitations: "Earth up" uses Earth's centre only, and results are for one point. Tools: TypeScript, three.js, OpenLayers, Python, FastAPI, spiceypy, Google Cloud Run.

---

## Use of Super Intelligence (SI)

(About 1,140 characters.)

Yes. The developer built the project with Claude Code (Anthropic), an SI coding assistant. Several Claude Code agents worked in parallel on separate workstreams. The workstreams were the web app, the core calculations, the terrain horizon, the API, the deployment and the documentation. The developer directed the work, set the requirements, and reviewed the results. SI wrote most of the code, the tests and the documentation, including this text, under that direction and review.

Where to see it: the web app shows the note "Built with AI assistance" in its left panel and has the same note in its HTML metadata. The package metadata (`package.json`, `pyproject.toml`) has the note too. Each commit in the repository has a "Co-Authored-By: Claude" line in its metadata. The README has a "Use of AI" section.

The project logo is the only SI-generated image. It has a visible "AI-generated image" mark, and only the README and the slide deck use it. The web app uses the logo only as its browser tab icon (favicon). At 32 px a mark cannot be read, so the app says in text (left panel and HTML metadata) that the icon is an AI-generated image. The project has no other SI-generated images, and no SI-generated video or audio. The screenshots are browser captures of the tool. The textures and map images are NASA data.

The developer confirmed that the idea of how to solve the challenge is the developer's own. SI did not come up with the idea. SI helped to build it under the developer's direction.

---

## NASA Data

(About 2,330 characters.)

From the challenge Resources tab, the tool uses three NASA resources:

- **NASA Moon Trek:** all site map images (WMTS tiles, see below).
- **JPL Horizons System:** the independent reference for the validation tests, and the "Check the Sun/Earth in JPL Horizons" links in the tool's "Check this result" panel. The tool agrees with Horizons to within 4.5 × 10⁻⁷°.
- **LROC QuickMap:** the "Open in LROC QuickMap (slope in degrees)" link opens the selected point in QuickMap with the TerrainSlope layer. The legend shows the slope in degrees.

Other NASA data:

- **NASA NAIF SPICE toolkit and generic kernels:** leap seconds, body constants and lunar frames.
- **JPL DE440 planetary ephemeris and DE440 lunar orientation:** positions of the Sun, Earth and Moon, and the Moon's orientation. All Sun and Earth directions come from these data.
- **LRO LOLA elevation models** (NASA GSFC PGDA product 90, Barker et al. 2023): `LDEM_80S_20MPP_ADJ` (20 m/pixel) and `LDEM_60S_120MPP_ADJ` (120 m/pixel). They give the terrain horizon and the surface height. The 20 m model also gives the slope layer of the site map and the slope filter of the best-points list.
- **LOLA average Sun and Earth visibility maps** (NASA GSFC PGDA product 69, https://pgda.gsfc.nasa.gov/products/69; Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030): 60 m/pixel (85–90° S) and 120 m/pixel (75–90° S). They give the site map layers "Average sunlight" and "Average Earth visibility" (18.6 years), and the "Best points in this site" list.
- **NASA Moon Trek** map tiles: LRO WAC global mosaic, LRO NAC mosaics (south pole, Malapert Massif, Apollo sites, Von Kármán), LOLA hillshades and the NAC PSR mosaic. LROC: NASA/GSFC/Arizona State University.
- **NASA SVS CGI Moon Kit:** LROC WAC colour mosaic and LOLA elevation map for the globe.
- **NASA Earth Observatory Blue Marble Next Generation:** Earth texture.
- **NASA SDO/HMI** image: Sun texture.
- **NASA NSSDC lunar landing site list:** Apollo site coordinates.
- **NASA technical reports (NTRS):** the default mission requirements (VIPER mission planning, the Lunar Site Selection white paper and the Artemis HLS update; see the references).

---

## Space Agency Partner Data and Other References

(About 2,803 characters.)

Space Agency Partner data:

- **JAXA:** the Kaguya (SELENE) Terrain Camera ortho mosaic, through NASA Moon Trek, is a base layer of the site map.

Other data and references:

- IAU/USGS Gazetteer of Planetary Nomenclature (USGS Astrogeology Science Center): names, centres and diameters of the lunar features for the place search. Public domain. https://planetarynames.wr.usgs.gov/
- LROC (Arizona State University): coordinates of the post-Apollo landings and the image boxes for the Artemis III candidate regions. NASA CLPS mission pages: the two planned landing sites. Each site in `data/sites.json` has its source URL.
- Barker, M. K., et al. (2023). LOLA south pole elevation models, NASA PGDA product 90. https://pgda.gsfc.nasa.gov/products/90
- Park, R. S., et al. (2021). The JPL planetary and lunar ephemerides DE440 and DE441.
- Annex, A. M., et al. (2020). SpiceyPy: a Pythonic wrapper for the SPICE toolkit.
- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030. NASA PGDA product 69, https://pgda.gsfc.nasa.gov/products/69
- NASA LaRC (2024). Artemis Human Landing System update: areas with Earth visibility below 25 % or solar visibility below 5 % are excluded. https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf
- NASA (2023). Lunar Site Selection white paper: the first landing site has sunlight for the full surface stay of about 6 to 6.5 days. https://ntrs.nasa.gov/api/citations/20230016267/downloads/Lunar%20Site%20Selection.pdf
- VIPER mission planning, SpaceOps 2022: a safe haven has 50 hours of darkness or less. https://ntrs.nasa.gov/api/citations/20220008301/downloads/2022-06-02-spaceops-viper-planning.pdf
- Bryant, S. (2009). Lunar pole illumination and communications maps computed from GSSR elevation data. JPL IPN Progress Report 42-176. https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.html
- Gläser, P., et al. (2014). Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA. Icarus 243, 78–90, doi:10.1016/j.icarus.2014.08.013

Open-source software: three.js (MIT), OpenLayers (BSD-2-Clause), Vite (MIT), TypeScript (Apache 2.0), tsx (MIT), FastAPI (MIT), pydantic (MIT), uvicorn (BSD-3-Clause), spiceypy (MIT), NASA NAIF CSPICE (public), numpy (BSD-3-Clause), rasterio (BSD-3-Clause) with GDAL (MIT), nginx (BSD-2-Clause), Python (PSF License), Node.js (MIT).

Fonts (slide deck only): Space Grotesk and Inter (SIL Open Font License), from Google Fonts.

Tools: Claude Code (Anthropic), Google Cloud Run, Cloud Build and Cloud Storage, uv, npm, pytest, Playwright (tests and screenshots), axe-core (accessibility tests, MPL-2.0), Pillow (screenshot images, HPND License).


---

## Other TODO items for the developer

- Project name: lunarsite.select.
- Team name: lunarspot.
- Team member: Mustafa Abdeltawwab.
- Local Event: London (registration confirmed, not waitlisted).
- TODO(developer): FortiGuard Web Filter classification request for https://lunarsite.select (the developer will do it; recommended, not required).
- TODO(developer): images for the project page (JPG or PNG, up to 10 MB). Use the files in `screenshots/`. Files 09 to 12 show the Artemis IV example.
