# Space Apps 2026 project submission: Team AKASHA7

Paste each section into the matching field on the team's **Project** tab (Edit → Submit).
Deadline: **Sunday 15 Nov 2026, 11:59 PM IST**.

---

## Project name
Agnikaal: Harmonized MODIS + VIIRS Fire Calendar

## Summary (≤ 1,500 characters)
Satellites have tracked fire for 25 years, but the record is split. MODIS (2000→) sees 1 km pixels; VIIRS (2012→) sees 375 m pixels and flags several pixels for every fire MODIS sees once. If you splice them, history breaks: over India, raw counts jump about 5× in 2012. Agnikaal ("agni" = fire, "kāl" = time) fixes that. Our pipeline filters NASA FIRMS hotspots to vegetation fires, snaps every detection from every satellite onto a common 1 km lattice and de-duplicates it per day into "Fire Cell-Days". Then, for any area a user draws, it computes month-specific MODIS→VIIRS calibration factors from 14 overlap years (2012–2025), shrinks them for stability, and cross-validates them live in the browser. The result is one sensor-agnostic monthly record from 2001 to today. The web app shows it as a burning-activity calendar (counts, anomalies, percentiles; CVD-safe color ramps), a fire-season clock with the critical window, a significance-tested trend, and a live 7-day early warning. That warning takes NOAA-20/21 near-real-time hotspots and rates the current pace as below normal, typical, elevated or extreme for this month. Emergency managers, firefighters, land managers and scientists can export CSVs, PNGs and an auto-written briefing. 69.8 million NASA detections from five fire-prone countries (India, Argentina, Australia, USA, Canada) are processed, and adding another takes one command.

## Project demonstration
<!-- Upload a 30-second video OR a ≤7-slide deck and paste its public link here -->
Live app: https://agnikaal.vercel.app
Demo deck (7 slides, press P to save as PDF): https://agnikaal.vercel.app/deck.html

## Project (link to final project)
https://github.com/abhinandaventus-max/agnikaal

## Project details
**What it does.** Agnikaal turns NASA FIRMS MODIS and VIIRS active-fire hotspots into one consistent burning-activity calendar for any area on Earth that we have processed. Users pick a region, draw a box or polygon, or type a latitude/longitude and radius. They then get:
- a **year × month fire calendar 2001–2025** on a single harmonized scale, viewable as counts, robust anomalies (σ from the monthly median) or percentiles, with accessible color ramps;
- a **fire-season clock** showing peak timing, how seasonal the area is, and the critical window: the fewest consecutive months that contain at least 80 % of activity;
- **trends** (Theil–Sen slope with Mann–Kendall significance) and top and bottom fire years;
- a **live early warning** that rates the last 7 days of VIIRS NOAA-20/21 hotspots against this month's 25-year record;
- a **harmonization tab** showing raw MODIS, raw VIIRS and the harmonized series, the overlap scatter, monthly calibration factors and cross-validation scores;
- a **"raw splice" toggle** that shows the broken record next to the fixed one;
- **exports**: monthly CSV, live hotspot CSV, calendar PNG, a printable auto-written briefing and shareable deep links.

**How harmonization works.**
1. *Quality filter*: MODIS confidence ≥ 30; VIIRS nominal/high; keep only `type = 0` vegetation fires (drops volcanoes, gas flares and industrial heat sources).
2. *Common 1 km lattice*: every detection is snapped to a 0.01° grid and de-duplicated per day into Fire Cell-Days. This removes pixel-size and repeat-overpass inflation.
3. *Adaptive overlap calibration*: for the selected area, k̂ₘ = (ΣV + λk̄)/(ΣM + λ) per calendar month over 2012–2025 (empirical-Bayes shrinkage, λ = 25). Pre-2012 MODIS becomes VIIRS-equivalent, with a ±σ uncertainty band.
4. *Validation*: leave-one-year-out cross-validation (R², MAPE, bias) runs live, alongside the bias of a naive splice.
5. *Inter-VIIRS bridge*: the S-NPP/NOAA-20 overlap (2018–2025) puts live NOAA-20/21 data on the same scale. This matters because the S-NPP near-real-time feed is no longer delivering.

**Benefits.** One trustworthy fire history per place lets a district fire officer see whether this week is unusual, plan crews before the critical window opens, and compare policy effects (e.g. Punjab stubble burning) across sensor generations.

**Tools.** Python (pandas, NumPy, PyArrow) for the pipeline; JavaScript, Vite, D3.js and Leaflet for the app; a Vercel serverless function for the live feed; node:test for unit tests. Hosted on Vercel; code on GitHub.

## Use of Artificial Intelligence (AI)
We used an AI coding assistant to speed up development: scaffolding the web app, writing chart and UI code, drafting documentation, and reviewing the statistics code. The team defined the problem framing, harmonization approach, design direction and case studies, and reviewed and tested all generated code (see `tests/`). No AI-generated images, video or audio are used. The app itself makes no AI or LLM calls: all analytics are transparent, deterministic statistics.

## NASA data
- NASA FIRMS (Fire Information for Resource Management System), LANCE / Earthdata: https://www.earthdata.nasa.gov/data/tools/firms
- MODIS Collection 6.1 active fire (Terra + Aqua) yearly country archives, 2000–2025
- VIIRS 375 m Collection 2 active fire, Suomi-NPP archive 2012–2025
- VIIRS 375 m Collection 2 active fire, NOAA-20 archive 2018–2025
- VIIRS NOAA-20 and NOAA-21 near-real-time 7-day and 24-hour feeds

## Space agency partner & other data
- OpenStreetMap contributors and CARTO basemap tiles
- Natural Earth land outlines (via the `world-atlas` package)

## References
- Giglio, L., Schroeder, W., Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. *Remote Sensing of Environment*, 178, 31–41.
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product. *Remote Sensing of Environment*, 143, 85–96.
- Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. *JASA*, 63, 1379–1389; Mann (1945) / Kendall (1975) trend test.
- Nuñez, J. R., Anderton, C. R., Renslow, R. S. (2018). Optimizing colormaps with consideration for color vision deficiency (cividis). *PLOS ONE*.
- Libraries: Leaflet (BSD-2), D3.js (ISC), topojson-client (ISC), world-atlas (ISC), Vite (MIT).
- Challenge photo credit noted by NASA: CONAE (Argentina).
