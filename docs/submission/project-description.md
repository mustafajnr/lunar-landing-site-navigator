# Project page text

This file gives the text for each field of the Space Apps project page. The field names come from the Project Submission Guide (see `requirements.md`). The guide gives no length limits. The site scripts have a general default of 1,500 characters for a text area, but this was not confirmed for these fields. Thus each field below has a character count. The High-Level Project Summary is under 1,500 characters. If a field is too long for the form, use the short version.

Items marked `TODO(developer)` need an answer from the developer.

---

## Project Name

lunarsite.select

(Challenge: Lunar Landing Site Navigator. The web app title is the challenge name. The project name is the site address.)

---

## High-Level Project Summary

(About 1,000 characters.)

Lunar Landing Site Navigator is a web tool that compares lunar landing sites and dates. For a point on the Moon, it shows where the Sun and Earth are relative to the local terrain horizon. It tells you the time to the next sunset and the next Earthset. Thus a planner can estimate solar power and direct-to-Earth communication in seconds.

The tool addresses the challenge directly. It uses NASA SPICE with the JPL DE440 ephemeris, and LOLA elevation data for the terrain horizon at the south pole. At six test instants, its Sun and Earth directions agree with JPL Horizons to better than 0.000001°.

This is important because missions slip. In our example, a 2-week slip moves a 7-day south-pole mission from 100 % Earth visibility to 0 % at three candidate sites. The tool shows this at once, and it shows the next Earthrise. Thus the planner can find a better date.

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

(About 3,600 characters. A short version follows.)

**What it does.** The tool answers two questions for a landing site and a date. Can a solar array see the Sun? Can an antenna see Earth? You select one of 22 curated sites or type coordinates. The curated sites are 15 past landings (Apollo, Chang'e, Chandrayaan-3, SLIM, IM-1, IM-2 and Blue Ghost Mission 1) and the 7 Artemis III candidate regions. Then you select a UTC date and time. The tool shows:

- If the Sun and Earth are up, and the time to the next sunset, sunrise, Earthset or Earthrise.
- The Sun elevation, the visible part of the Sun's disk, the Earth elevation and the Earth margin above the terrain.
- For ±30 days: the time with the Sun, with Earth and with both, the longest periods, and all events.
- A local sky plot with the Sun and Earth tracks and the terrain horizon outline.
- A site map with NASA Moon Trek images and arrows to the Sun and Earth.
- A 3D globe with the true Moon orientation, the lit half, and the sub-solar and sub-Earth points.

**How it works.** A Python API on Google Cloud Run calculates the geometry. It uses NASA NAIF SPICE, the JPL DE440 ephemeris and the DE440 lunar orientation. Thus libration is included. For points south of about 65° S, the API calculates a terrain horizon mask. It uses two LOLA elevation models (20 m and 120 m per pixel). For each 0.5° of azimuth, it samples the terrain along a 150 km line and includes the curvature of the Moon. The API compares the Sun and Earth directions with this horizon. It finds each event by bisection. The web app (TypeScript, three.js and OpenLayers) gets all values from the API.

**Validation.** At six test instants, the Sun and Earth directions agree with JPL Horizons. The largest difference is 0.00000045°. The sub-solar and sub-Earth points agree with Horizons to about 0.005°. The terrain horizon is not validated against independent illumination data.

**Example.** A mission plans 7 days of operations from 2026-11-22 at the south pole. At the Shackleton–de Gerlache ridge, Malapert Massif and de Gerlache Rim, the Sun and Earth are both up for 100 % of that time. The launch slips by 2 weeks, to 2026-12-06. Now Earth is up for 0 % of the 7 days at all three sites. At de Gerlache Rim, the terrain also hides the Sun. The tool shows "Earthrise in 9 d 15 h 10 min" at the ridge. The planner moves the landing to 2026-12-16. Then the Sun and Earth are both up for all 7 days at the ridge and at de Gerlache Rim.

**Benefits.** Tools such as Quickmap, Moon Trek and JPL Horizons are built for detailed analysis. Our tool puts the answers for one site and date on one screen, in a few seconds. It shows the effect of the terrain, which a flat horizon does not show. It is free and runs in a web browser.

**Limitations.** "Earth up" uses Earth's centre only, with no antenna or link model. There is terrain only south of about 65° S. Elsewhere the horizon is flat. The results are for one point, not for the area of a site. You compare sites one after the other, not side by side.

**What we hope to achieve.** We hope that planners use the tool for a first check when a schedule changes. We hope that teachers use it to show why the lunar south pole is difficult. Next steps: a side-by-side comparison of sites and dates, results over the area of a site, and an Earth disk and antenna model.

**Tools and languages.** TypeScript, three.js, OpenLayers and Vite for the web app. Python, FastAPI, spiceypy, numpy and rasterio for the API and the calculations. Google Cloud Run, Cloud Build and nginx for hosting. uv and npm for packages. pytest for tests. Claude Code for SI-assisted development (see the SI field).

### Short version (about 1,000 characters)

For a lunar site and a date, the tool shows if the Sun and Earth are above the local terrain horizon. It gives the time to the next sunset and Earthset. You select one of 22 curated sites (15 past landings and the 7 Artemis III candidate regions) or type coordinates. The tool shows a sky plot with the terrain horizon and a 3D globe. A site map shows NASA Moon Trek images with Sun and Earth arrows. A summary covers ±30 days. A Python API on Google Cloud Run calculates the geometry with NASA SPICE and JPL DE440. It calculates the terrain horizon from LOLA data south of about 65° S. At six test instants, the Sun and Earth directions agree with JPL Horizons to 0.00000045°. Example: a 2-week slip moves a 7-day south-pole mission from 100 % to 0 % Earth visibility at three sites. The tool shows the next Earthrise, so the planner finds a better date. Limitations: "Earth up" uses Earth's centre only, and there is terrain only near the south pole. Tools: TypeScript, three.js, OpenLayers, Python, FastAPI, spiceypy, Google Cloud Run.

---

## Use of Super Intelligence (SI)

(About 1,000 characters.)

Yes. The developer built the project with Claude Code (Anthropic), an SI coding assistant. Several Claude Code agents worked in parallel on separate workstreams. The workstreams were the web app, the core calculations, the terrain horizon, the API, the deployment and the documentation. The developer directed the work, set the requirements, and reviewed the results. SI wrote most of the code, the tests and the documentation, including this text, under that direction and review.

Where to see it: the web app shows the note "Built with AI assistance" in its left panel and has the same note in its HTML metadata. The package metadata (`package.json`, `pyproject.toml`) has the note too. Each commit in the repository has a "Co-Authored-By: Claude" line in its metadata. The README has a "Use of AI" section.

The project logo is the only SI-generated image. It has a visible "AI-generated" mark, as the guide requires (the 16 px favicon is too small for a mark). The project has no other SI-generated images, and no SI-generated video or audio. The screenshots are browser captures of the tool. The textures and map images are NASA data.

TODO(developer): confirm that the idea of how to solve the challenge came from you, not from SI. The guide says that SI should not be used to come up with the idea. If the demo video uses an SI voice or SI images, add a visible watermark or an acknowledgement as the guide requires.

---

## NASA Data

(About 1,000 characters.)

From the challenge Resources tab, the tool uses three NASA resources:

- **NASA Moon Trek:** all site map images (WMTS tiles, see below).
- **JPL Horizons System:** the independent reference for the validation tests, and the "Check the Sun/Earth in JPL Horizons" links in the tool's "Check this result" panel. The tool agrees with Horizons to within 4.5 × 10⁻⁷°.
- **LROC QuickMap:** the "Open in LROC QuickMap (slope in degrees)" link opens the selected point in QuickMap with the TerrainSlope layer. The legend shows the slope in degrees.

Other NASA data:

- **NASA NAIF SPICE toolkit and generic kernels:** leap seconds, body constants and lunar frames.
- **JPL DE440 planetary ephemeris and DE440 lunar orientation:** positions of the Sun, Earth and Moon, and the Moon's orientation. All Sun and Earth directions come from these data.
- **LRO LOLA elevation models** (NASA GSFC PGDA product 90, Barker et al. 2023): `LDEM_80S_20MPP_ADJ` (20 m/pixel) and `LDEM_60S_120MPP_ADJ` (120 m/pixel). They give the terrain horizon and the surface height.
- **LOLA average Sun and Earth visibility maps** (NASA GSFC PGDA product 69, https://pgda.gsfc.nasa.gov/products/69; Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030): 60 m/pixel (85–90° S) and 120 m/pixel (75–90° S). They give the site map layers "Average sunlight" and "Average Earth visibility" (18.6 years), and the "Best points in this site" list.
- **NASA Moon Trek** map tiles: LRO WAC global mosaic, LRO NAC mosaics (south pole, Malapert Massif, Apollo sites, Von Kármán), LOLA hillshades and the NAC PSR mosaic. LROC: NASA/GSFC/Arizona State University.
- **NASA SVS CGI Moon Kit:** LROC WAC colour mosaic and LOLA elevation map for the globe.
- **NASA Earth Observatory Blue Marble Next Generation:** Earth texture.
- **NASA SDO/HMI** image: Sun texture.
- **NASA NSSDC lunar landing site list:** Apollo site coordinates.

---

## Space Agency Partner Data and Other References

(About 1,200 characters.)

Space Agency Partner data:

- **JAXA:** the Kaguya (SELENE) Terrain Camera ortho mosaic, through NASA Moon Trek, is a base layer of the site map.

Other data and references:

- LROC (Arizona State University): coordinates of the post-Apollo landings and the image boxes for the Artemis III candidate regions. Each site in `data/sites.json` has its source URL.
- Barker, M. K., et al. (2023). LOLA south pole elevation models, NASA PGDA product 90. https://pgda.gsfc.nasa.gov/products/90
- Park, R. S., et al. (2021). The JPL planetary and lunar ephemerides DE440 and DE441.
- Annex, A. M., et al. (2020). SpiceyPy: a Pythonic wrapper for the SPICE toolkit.
- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030. NASA PGDA product 69, https://pgda.gsfc.nasa.gov/products/69

Open-source software: three.js (MIT), OpenLayers (BSD-2-Clause), Vite (MIT), TypeScript (Apache 2.0), FastAPI (MIT), uvicorn (BSD-3-Clause), spiceypy (MIT), numpy (BSD-3-Clause), rasterio (BSD-3-Clause), nginx (BSD-2-Clause).

Tools: Claude Code (Anthropic), Google Cloud Run and Cloud Build, uv, npm, pytest, Playwright (screenshots).

TODO(developer): check that this list is complete. The guide asks for all code, text and images, also open-source ones.

---

## Other TODO items for the developer

- Team name: lunarspot.
- Team member: Mustafa Abdeltawwab.
- Local Event: London. A team of one is eligible for global judging only in a Local Event. TODO(developer): make sure that your registration for the London event is not "waitlisted" (check the event page and the registration email).
- TODO(developer): optional FortiGuard Web Filter Classification request for https://lunarsite.select (recommended for a new website, not required).
- TODO(developer): images for the project page (JPG or PNG, up to 10 MB). The files in `screenshots/` are suitable.
