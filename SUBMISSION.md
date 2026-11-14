# Space Apps 2026 project submission: Team AKASHA7

Fields follow the official [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).
Paste each section into the matching field on the team's **Project** tab (Edit → Save Progress → Submit for Judging).
Deadline: **Sunday 15 Nov 2026, 11:59 PM IST** (local time of the team's Local Event).

---

## Project Name
Agnikaal: Harmonized MODIS + VIIRS Fire Calendar

## High-Level Project Summary
Satellites have tracked fire for 25 years, but the record is split: MODIS (2000→) sees 1 km pixels, VIIRS (2012→) sees 375 m pixels, so the same fire looks several times bigger. Joined naively, history breaks; over India raw counts jump 5.4× in 2012. Agnikaal ("agni" = fire, "kāl" = time) fixes this. It puts every NASA FIRMS hotspot on one 1 km grid, counts each place once per day, and calibrates MODIS to VIIRS month by month for any area a user draws, cross-validated live (R² 0.92–0.98, versus 70–82% error for a naive splice). The result is one consistent fire record from 2001 to today, built from 69.8 million detections in five countries. The web app shows it as a burning-activity calendar, fire-season clock, tested trends and a live 7-day early warning. Free in-browser AI adds a backtested 6-month outlook using El Niño, fire-weather risk, machine-learned fire regimes, the Ask Agni assistant and a Research Lab for scientists (tested insights, weather drivers, similar places, event finder, Colab and Google Earth exports). It gives fire managers and researchers one honest fire history to act on.

## Link to Project Demo
30-second video demo (English captions): https://drive.google.com/file/d/1WVxDybsetFUIStC6GJ7Qv4JM-XVInxsp/view

## Link to Final Project
https://agnikaal.vercel.app

## Detailed Project Description
**Links**
- Live web app: https://agnikaal.vercel.app
- Source code (MIT): https://github.com/abhinandaventus-max/agnikaal
- 7-slide presentation (PDF/PPTX): https://drive.google.com/file/d/1mYJH0oBNqOKTd9hbV5J4TKjh9CnWtPZd/view (PPTX: https://drive.google.com/file/d/1MTCFmaQIfX9Ko_-aE4gMWNqbT94RBYEI/view)
- 2-minute narrated walkthrough video: https://drive.google.com/file/d/1RgVSB50dkhinbHisOcHjPT_qcl-SUgba/view
- Google Drive folder with all files: https://drive.google.com/drive/folders/1bg_DsqYTLtsNw66qKwfVcNnXYPAA5nwB
- All files are also attached to the GitHub release: https://github.com/abhinandaventus-max/agnikaal/releases/tag/v1.0

**What it does.** Agnikaal turns NASA FIRMS MODIS and VIIRS active-fire hotspots into one consistent burning-activity calendar for any area in the five processed countries. Users pick a region, draw a box or polygon, or type a latitude/longitude and radius, and get:
- a year × month **fire calendar 2001–2025** on one harmonized scale (counts, robust anomalies or percentiles; colour-blind-safe ramps);
- a **fire-season clock** with peak timing and critical months, **trends** (Theil–Sen + Mann–Kendall) and the worst and best years;
- a **live early warning**: the last 7 days of VIIRS NOAA-20/21 hotspots (static industrial heat sources removed), rated Below normal / Typical / Elevated / Extreme against 25 years of the same month;
- a **raw-splice toggle** and a **harmonization tab** that show the broken record next to the fixed one, with the calibration factors and cross-validation scores;
- a 25-year **fire time-lapse** and exports (CSV, PNG, auto-written briefing, shareable links).

**AI features (free, running in the browser).**
- *6-month fire outlook*: ridge regression per area (this month's live activity, same month last year, NOAA El Niño index, trend). It is backtested by leaving out one year at a time and shrunk toward climatology where it has no proven skill, so it says "no clear signal" instead of guessing. Hit rates reach 64% vs 33% by chance.
- *Fire risk this week*: the 7-day Open-Meteo forecast becomes a Hot-Dry-Windy-style index, combined with season timing and live satellites.
- *Fire regimes*: unsupervised k-means groups grid cells by the shape of their fire calendar (e.g. two-season crop-residue burning vs dry-season forest fire).
- *Ask Agni*: instant answers grounded in the area's statistics, plus an optional on-device open-source LLM (Llama 3.2 1B via WebLLM) that only rephrases verified facts. A guard rejects any reply containing a number, month or risk level that is not in the data.
- *Research Lab* for researchers, scientists and students: Auto-Insights tests trends, regime shifts, season-timing shifts and El Niño links with Benjamini–Hochberg false-discovery control. Over Punjab it finds October burning −46%/decade, November +57%/decade and the season arriving 10 days later per decade. *Weather drivers* fits 25 years of ERA5 weather + El Niño: NSW fire years are 76% weather-explained, Punjab's about 0%, i.e. human-driven. *Similar places* searches 32,000 fire fingerprints. The *Event finder* catalogues extreme fire months and recovers Black Summer 2020, Canberra 2003, Canada 2023 and Uttarakhand 2021 on its own. Exports: a ready-to-run Colab notebook, a methods paragraph, BibTeX with NASA FIRMS DOIs, GeoJSON, and KML with 3D fire columns for Google Earth.

**How harmonization works.**
1. Quality filter: MODIS confidence ≥ 30, VIIRS nominal/high, vegetation fires only (type = 0; drops volcanoes, gas flares and industrial heat sources).
2. Common 1 km grid: every detection snapped to 0.01° and de-duplicated per day into Fire Cell-Days, which removes pixel-size and repeat-overpass inflation.
3. Adaptive overlap calibration: month-specific MODIS→VIIRS factors for the drawn area over 2012–2025, with empirical-Bayes shrinkage and an uncertainty band.
4. Validation: leave-one-year-out cross-validation runs live next to the bias of a naive splice.
5. Inter-VIIRS bridge: the S-NPP/NOAA-20 overlap puts live NOAA-20/21 data on the same scale (the S-NPP near-real-time feed is no longer delivering).

**Benefits and goals.** One trustworthy fire history per place: a district fire officer can see whether this week is unusual and position crews before the critical months; a researcher can test a hypothesis in minutes and export reproducible code; a student can explore 25 years of NASA data with no setup. Next we want global coverage, NOAA-21 calibration, fire-weather overlays and SMS alerts.

**Tools.** Python (pandas, NumPy, PyArrow) and Node.js for the data pipeline (GitHub Actions rebuilds it); JavaScript, Vite, D3.js, Leaflet and three.js (WebGL Earth) for the app; WebLLM for the on-device model; a Vercel serverless function for the live feed; 15 automated unit tests (node:test).

## Use of Super Intelligence (SI)
Yes.
- **Code:** we used an AI coding assistant to speed up writing and reviewing code, charts, the data pipeline and documentation. The team chose the challenge and defined the idea, harmonization approach, design and case studies, and reviewed and tested the code (15 unit tests). This is stated here and in the release notes.
- **Audio:** the narration in our demo and walkthrough videos is an AI-generated text-to-speech voice (Microsoft Edge neural TTS, voice "Neerja"). This is stated in the video descriptions and embedded in each MP4's metadata (title/comment fields).
- **Images/video:** all visuals are rendered by our own code from NASA data and NASA imagery; no AI image generation was used and no NASA logos are used.
- **Inside the app:** a ridge-regression outlook model, k-means clustering, statistical tests and an optional on-device open-source LLM (Llama 3.2 1B via WebLLM) whose answers are checked against the data. No paid AI services.

## NASA Data
- NASA FIRMS (Fire Information for Resource Management System), LANCE/Earthdata: https://www.earthdata.nasa.gov/data/tools/firms
  - MODIS Collection 6.1 active fire (Terra + Aqua) country archives 2000–2025 (doi:10.5067/FIRMS/MODIS/MCD14DL.NRT.0061)
  - VIIRS 375 m Collection 2 active fire, Suomi-NPP archive 2012–2025 (doi:10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002)
  - VIIRS 375 m Collection 2 active fire, NOAA-20 archive 2018–2025, and NOAA-20 / NOAA-21 near-real-time 24 h and 7-day feeds
- NASA EOSDIS GIBS imagery: VIIRS NOAA-20 Corrected Reflectance (true colour, daily), Blue Marble, Black Marble night lights: https://gibs.earthdata.nasa.gov
- NASA Visible Earth Blue Marble / Black Marble textures (3D Earth)

## Space Agency Partner Data and Other References
No Space Agency Partner datasets were used.

Other data and services:
- NOAA Climate Prediction Center Oceanic Niño Index (ONI): https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
- ERA5 reanalysis (Copernicus/ECMWF) and the 7-day forecast via the Open-Meteo API (CC BY 4.0): https://open-meteo.com
- Esri World Dark Gray and World Imagery basemaps; OpenStreetMap contributors; Natural Earth (world-atlas)
- BigDataCloud free reverse geocoding (place names)
- WebLLM (Apache-2.0) and Meta Llama 3.2 1B Instruct (Llama 3.2 Community License)
- Libraries: Leaflet (BSD-2), D3.js (ISC), three.js (MIT), topojson-client (ISC), Vite (MIT), pptxgenjs (MIT), puppeteer-core (Apache-2.0)
- Fonts: Space Grotesk, Inter, JetBrains Mono (SIL Open Font License, Google Fonts)

References:
- Giglio, L., Schroeder, W., Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment*, 178, 31–41.
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product. *Remote Sensing of Environment*, 143, 85–96.
- Sen, P. K. (1968), *JASA* 63; Mann (1945) / Kendall (1975) trend test; Pettitt, A. N. (1979), *Applied Statistics* 28; Benjamini, Y. & Hochberg, Y. (1995), *JRSS B* 57.
- Nuñez, J. R., Anderton, C. R., Renslow, R. S. (2018). Optimizing colormaps with consideration for color vision deficiency (cividis). *PLOS ONE*.
