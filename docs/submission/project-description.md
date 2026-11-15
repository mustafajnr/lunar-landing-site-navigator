# Project page text

This file gives the text for each field of the Space Apps project page. The field names come from the Project Submission Guide (see `requirements.md`). The guide gives no length limits. The site scripts have a general default of 1,500 characters for a text area, but this was not confirmed for these fields. Thus each field below has a character count. The High-Level Project Summary is under 1,500 characters. If a field is too long for the form, use the short version.

Items marked `TODO(developer)` need an answer from the developer.

---

## Project Name

lunarsite.select

(Challenge: Lunar Landing Site Navigator. The web app title is the challenge name. The project name is the site address.)

---

## High-Level Project Summary

(About 1,424 characters.)

Lunar Landing Site Navigator is a web tool that compares lunar landing sites over a mission period. For a point on the Moon, it shows when the Sun and Earth are above the local terrain horizon. Thus a planner can estimate solar power and direct-to-Earth communication.

You select a site, a start and a duration (up to 400 days). The Verdict tab gives a plain-language result and checks three NASA mission requirements: the VIPER darkness limit of 50 hours, 6.5 days of sunlight for Artemis, and 25 % Earth visibility. A site map shows NASA Moon Trek images, slope and NASA PGDA average sunlight, and lists the best points in a site. You can compare up to 4 saved searches side by side.

The tool uses NASA SPICE with the JPL DE440 ephemeris, and LOLA elevation data for the terrain horizon at the south pole. At six test instants, its Sun and Earth directions agree with JPL Horizons to better than 0.000001°.

Example: NASA plans Artemis IV, the first crewed landing, for early 2028 at the south pole, with a stay of about 6.5 days. At a Malapert Massif best point, an example landing on 2028-01-10 meets 3 of 3 requirements. If the launch slips 12 days, the Sun is down at the landing and the point meets 1 of 3. The tool then finds the next landing window, or a point at de Gerlache Rim that meets 3 of 3.

The tool is for mission planners, educators and the public. It runs in a web browser at https://lunarsite.select.

---

## Link to Project Demo

TODO(developer): upload the 30-second video (script: `demo-script.md`) to a public host, for example YouTube. Paste the link here. Test the link in a private browser window.

---

## Link to Final Project

https://lunarsite.select

TODO(developer): the code repository is private now. Make it public and add its link here, or give only the live site. The judges must not need a password, permission or registration.

---

## Detailed Project Description

(About 7,100 characters. A short version follows.)

**What it does.** The tool answers two questions for a landing site and a mission period. Can a solar array see the Sun? Can an antenna see Earth? You select one of 22 curated sites or type coordinates. The curated sites are 15 past landings (Apollo, Chang'e, Chandrayaan-3, SLIM, IM-1, IM-2 and Blue Ghost Mission 1) and the 7 Artemis III candidate regions. You set a UTC start and a duration (presets from 1 week to 1 year, or 1 to 400 days). You set the observer height: ground 0 m, lander 2 m, mast 10 m or a custom value. Play moves the time through the period. The results panel has two tabs.

- **Verdict:** a plain-language headline, and three blocks: "Solar power", "Talk to Earth" and "Both together". Each block has a rating: Good, Limited or Poor. The rating is our rule of thumb, not a NASA standard. It uses the NASA exclusion floors: a site with the Sun up less than 5 % or Earth up less than 25 % of the period is Poor. "Mission requirements" gives a pass or fail line for each limit. The NASA defaults are 50 h of darkness or less (VIPER mission planning), 6.5 days of sunlight from the start (NASA Lunar Site Selection white paper) and 25 % Earth visibility (Artemis HLS update). You can change the limits.
- **Next landing window:** the tool searches the 60 days after the start and gives the next time when a landing meets all three mission requirements. One click sets this landing time as the start.
- **Details:** the Sun and Earth now, and the time to the next sunset, sunrise, Earthset or Earthrise. The period result: the time with the Sun, with Earth and with both, and the longest periods. The full list of events, with filters. A local sky plot with the Sun and Earth tracks and the terrain horizon, with a time strip for long periods. "Check this result" gives JPL Horizons links for an independent check.

You can save searches and compare up to 4 of them side by side. The comparison shows a site image for each search, and a ★ marks the best value in each row.

The site map shows NASA Moon Trek images and arrows to the Sun and Earth. Its layers include slope (LOLA 20 m) and the NASA PGDA "Average sunlight" and "Average Earth visibility" maps (18.6-year averages). "Best points in this site" lists the points with the highest mean of average sunlight and average Earth visibility, with slope less than 15° and at least 500 m apart. For a small site, it searches a circle of 5 km radius. A link opens the point in LROC QuickMap. A 3D globe shows the true Moon orientation, the lit half, and the sub-solar and sub-Earth points.

The tool has a phone layout, a welcome card, a user guide and accessibility labels.

**How it works.** A Python API on Google Cloud Run calculates the geometry. It uses NASA NAIF SPICE, the JPL DE440 ephemeris and the DE440 lunar orientation. Thus libration is included. For points south of about 65° S, the API calculates a terrain horizon mask. It uses two LOLA elevation models (20 m and 120 m per pixel). For each 0.5° of azimuth, it samples the terrain along a 150 km line and includes the curvature of the Moon. The API compares the Sun and Earth directions with this horizon. It finds each event by bisection. Each period result from the API has a provenance block: the kernels, the frame (MOON_ME), the ephemeris and the origin of the horizon mask. The web app (TypeScript, three.js and OpenLayers) gets all values from the API.

**Validation.** At six test instants, the Sun and Earth directions agree with JPL Horizons. The largest difference is 0.00000045°. The sub-solar and sub-Earth points agree with Horizons to about 0.005°. The terrain horizon is not validated against independent illumination data.

**Example.** NASA plans Artemis IV, the first crewed landing, for early 2028 at the south pole. The surface stay is about 6.5 days. NASA has not chosen a region or a day. Thus the landing days below are examples. We use a duration of 6.5 days, an observer height of 2 m and the NASA default requirements.

- **Plan.** In the Malapert Massif region, "Best points in this site" gives point 1 (85.98° S, 1.85° W). For a landing on 2028-01-10 00:00 UTC, the Sun is up 100 % and Earth is up 99 % of the stay. The point meets 3 of 3 requirements.
- **Slip.** The launch slips 12 days to 2028-01-22. At the same point, the Sun is up only 10 % of the stay. The Sun is down at the landing. The longest darkness is at least 5 d 14 h. The point meets 1 of 3 requirements.
- **Wait.** We select Malapert best point 4 (85.96° S, 2.32° W). "Next landing window" finds a window from 2028-02-03 13:00 to 2028-02-16 18:30 UTC. "Use this start" sets this start, and the point meets 3 of 3 requirements.
- **Move.** We keep the landing on 2028-01-22 and select de Gerlache Rim best point 1 (88.66° S, 68.40° W). The Sun is up 100 % and Earth is up 49 % of the stay. The point meets 3 of 3 requirements. But Earth is below the horizon for about half of the stay. Thus the crew needs a relay satellite for that time. Our rating shows "Talk to Earth" as Poor.

Small distances have a large effect. Near de Gerlache Rim, points 0.4 to 1.5 km apart gave 0 % to 100 % Sun for 22–29 January 2028. For this reason, the tool uses the best-points list from the NASA PGDA maps and then calculates each point.

Height also has an effect. At the Shackleton–de Gerlache ridge in 2027, a 2 m observer has sunlight 72 % of the time and a longest night of 14 days. A 10 m mast has 96 % and 3 days.

**Benefits.** Tools such as QuickMap, Moon Trek and JPL Horizons are built for detailed analysis. Our tool puts the answers for a site and a period on one screen, in a few seconds. It checks NASA mission requirements and compares sites side by side. It shows the effect of the terrain and of the observer height, which a flat horizon does not show. It is free and runs in a web browser.

**Limitations.** "Earth up" uses Earth's centre only, with no antenna or link model. There is terrain only south of about 65° S. Elsewhere the horizon is flat. The result is for one point, not for the area of a site. The best-points list uses long-term averages at ground level, not the selected period. The Good, Limited and Poor rating is our rule of thumb. At 0 m height, small errors in the terrain data can change the result. The tool does not search automatically for the best point in a site for a given period.

**What we hope to achieve.** We hope that planners use the tool for a first check of a site and a period. We hope that teachers use it to show why the lunar south pole is difficult. Next steps: an automatic search for the best point in a site for a given period and height, an Earth disk and antenna model, export (iCalendar, CSV and JSON), and more NASA mission requirement presets.

**Tools and languages.** TypeScript, three.js, OpenLayers and Vite for the web app. Python, FastAPI, spiceypy, numpy and rasterio for the API and the calculations. Google Cloud Run, Cloud Build and nginx for hosting. uv and npm for packages. pytest for tests. Claude Code for SI-assisted development (see the SI field).

### Short version (about 1,118 characters)

For a lunar site and a mission period (up to 400 days), the tool shows when the Sun and Earth are above the local terrain horizon. You select one of 22 curated sites (15 past landings and the 7 Artemis III candidate regions) or type coordinates. The Verdict tab gives a plain-language result and checks NASA mission requirements: 50 h of darkness (VIPER), 6.5 days of sunlight and 25 % Earth visibility (Artemis). It finds the next landing window that meets all three. The Details tab has a sky plot, events and Horizons links. A site map shows Moon Trek images, slope, PGDA average sunlight and the best points in a site. You can compare up to 4 saved searches. A Python API on Google Cloud Run uses NASA SPICE, JPL DE440 and LOLA terrain south of about 65° S. Its Sun and Earth directions agree with JPL Horizons to 0.00000045°. Example: an Artemis IV point at Malapert Massif meets 3 of 3 requirements on 2028-01-10, and 1 of 3 after a 12-day slip. Limitations: "Earth up" uses Earth's centre only, and results are for one point. Tools: TypeScript, three.js, OpenLayers, Python, FastAPI, spiceypy, Google Cloud Run.

---

## Use of Super Intelligence (SI)

(About 1,140 characters.)

Yes. The developer built the project with Claude Code (Anthropic), an SI coding assistant. Several Claude Code agents worked in parallel on separate workstreams. The workstreams were the web app, the core calculations, the terrain horizon, the API, the deployment and the documentation. The developer directed the work, set the requirements, and reviewed the results. SI wrote most of the code, the tests and the documentation, including this text, under that direction and review.

Where to see it: the web app shows the note "Built with AI assistance" in its left panel and has the same note in its HTML metadata. The package metadata (`package.json`, `pyproject.toml`) has the note too. Each commit in the repository has a "Co-Authored-By: Claude" line in its metadata. The README has a "Use of AI" section.

The project logo is the only SI-generated image. It has a visible "AI-generated image" mark, and only the README and the slide deck use it. The web app has no logo and no favicon. The project has no other SI-generated images, and no SI-generated video or audio. The screenshots are browser captures of the tool. The textures and map images are NASA data.

TODO(developer): confirm that the idea of how to solve the challenge came from you, not from SI. The guide says that SI should not be used to come up with the idea. If the demo video uses an SI voice or SI images, add a visible watermark or an acknowledgement as the guide requires.

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

(About 2,220 characters.)

Space Agency Partner data:

- **JAXA:** the Kaguya (SELENE) Terrain Camera ortho mosaic, through NASA Moon Trek, is a base layer of the site map.

Other data and references:

- IAU/USGS Gazetteer of Planetary Nomenclature (USGS Astrogeology Science Center): names, centres and diameters of the lunar features for the place search. Public domain. https://planetarynames.wr.usgs.gov/
- LROC (Arizona State University): coordinates of the post-Apollo landings and the image boxes for the Artemis III candidate regions. Each site in `data/sites.json` has its source URL.
- Barker, M. K., et al. (2023). LOLA south pole elevation models, NASA PGDA product 90. https://pgda.gsfc.nasa.gov/products/90
- Park, R. S., et al. (2021). The JPL planetary and lunar ephemerides DE440 and DE441.
- Annex, A. M., et al. (2020). SpiceyPy: a Pythonic wrapper for the SPICE toolkit.
- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030. NASA PGDA product 69, https://pgda.gsfc.nasa.gov/products/69
- NASA LaRC (2024). Artemis Human Landing System update: areas with Earth visibility below 25 % or solar visibility below 5 % are excluded. https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf
- NASA (2023). Lunar Site Selection white paper: the first landing site has sunlight for the full surface stay of about 6 to 6.5 days. https://ntrs.nasa.gov/api/citations/20230016267/downloads/Lunar%20Site%20Selection.pdf
- VIPER mission planning, SpaceOps 2022: a safe haven has 50 hours of darkness or less. https://ntrs.nasa.gov/api/citations/20220008301/downloads/2022-06-02-spaceops-viper-planning.pdf
- JPL IPN Progress Report 42-176 (2009) and Gläser, P., et al. (2014): illumination and Earth visibility at the lunar south pole.

Open-source software: three.js (MIT), OpenLayers (BSD-2-Clause), Vite (MIT), TypeScript (Apache 2.0), FastAPI (MIT), uvicorn (BSD-3-Clause), spiceypy (MIT), numpy (BSD-3-Clause), rasterio (BSD-3-Clause), nginx (BSD-2-Clause).

Tools: Claude Code (Anthropic), Google Cloud Run and Cloud Build, uv, npm, pytest, Playwright (screenshots).

TODO(developer): check that this list is complete. The guide asks for all code, text and images, also open-source ones.

---

## Other TODO items for the developer

- Project name: lunarsite.select.
- Team name: lunarspot.
- Team member: Mustafa Abdeltawwab.
- Local Event: London. A team of one is eligible for global judging only in a Local Event. TODO(developer): make sure that your registration for the London event is not "waitlisted" (check the event page and the registration email).
- TODO(developer): upload the demo video and add its link (see "Link to Project Demo").
- TODO(developer): make the repository public, or give only the live site (see "Link to Final Project").
- TODO(developer): confirm that the idea came from you, not from SI (see the SI field).
- TODO(developer): check that the reference list is complete (see the references field).
- TODO(developer): optional FortiGuard Web Filter Classification request for https://lunarsite.select (recommended for a new website, not required).
- TODO(developer): images for the project page (JPG or PNG, up to 10 MB). The files in `screenshots/` are suitable. Add a new screenshot of the Artemis IV example (Verdict tab, best points and next landing window).
