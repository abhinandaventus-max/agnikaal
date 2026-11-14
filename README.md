# Agnikaal: Harmonized MODIS + VIIRS Fire Calendar

**Live app: https://agnikaal.vercel.app · Deck: https://agnikaal.vercel.app/deck.html · [90-second intro video](https://agnikaal.vercel.app/video/agnikaal-intro-web.mp4) · [Presentation (.pptx)](promo/Agnikaal-Presentation.pptx)**

**Team AKASHA7:** [Abhinand](https://www.linkedin.com/in/abhinandks12) · Abhijith K S · [Annlia Lixon](https://www.linkedin.com/in/annlia-lixon/)

**NASA Space Apps Challenge 2026 · Challenge: [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/) · Team AKASHA7 (Thrissur, Kerala)**

> *Agni* (fire) + *kāl* (time): a calendar of fire.

Agnikaal fuses 25 years of **MODIS** (Terra + Aqua, 1 km) active-fire hotspots with the sharper **VIIRS** record (S-NPP, NOAA-20, NOAA-21, 375 m) into **one sensor-agnostic monthly time series**. You can draw any area on a map and get its burning-activity calendar, anomalies, critical periods, trend and a live 7-day early warning, then download everything as CSV, PNG or a printable briefing.

---

## Why it matters

MODIS has observed fires since 2000 but is near end of life; VIIRS has replaced it since 2012. The two can't be compared directly. A VIIRS pixel is about 7× smaller, so one fire front lights up several VIIRS pixels where MODIS flags one. Splice the raw counts and every chart shows a fake "fire explosion" in 2012. Over India the raw count jumps about 5× at that seam. Emergency managers comparing this season with history get the wrong answer.

## What Agnikaal does

| Feature | What you get |
|---|---|
| **Burning-activity calendar** | Year × month heatmap 2001–2025 on one harmonized scale. Three views: counts, robust anomaly (σ vs median) and percentile. Accessible color ramps (cividis and viridis are CVD-safe). |
| **Any area of interest** | Whole region, draw a box, draw a polygon, or enter lat/lon + radius (or *use my location*). |
| **Adaptive overlap calibration** | MODIS→VIIRS factors are computed **for the exact area you draw**, per calendar month, from 14 overlap years. |
| **Live cross-validation** | Leave-one-year-out CV (R², MAPE, bias) is computed in the browser and compared against a naive raw splice. |
| **Fire-season fingerprint** | Radial season clock: peak timing, seasonality concentration, and the *critical window* (fewest months holding ≥80 % of activity). |
| **Trend** | Theil–Sen slope + Mann–Kendall significance on annual totals, with uncertainty bars for the MODIS-derived years. |
| **Live early warning** | NOAA-20 / NOAA-21 NRT hotspots (last 7 days) via a serverless proxy, de-duplicated, bridged to the S-NPP scale and ranked against the harmonized record for this month: *Below normal / Typical / Elevated / Extreme*. |
| **Fire-pulse time-lapse** | 300 months of harmonized fire activity animated on the map. |
| **Raw-splice toggle** | Shows the broken record next to the harmonized one, so you can see what the method fixes. |
| **Exports** | Monthly CSV (harmonized + raw + source + k), live hotspots CSV, calendar PNG, printable briefing, shareable deep link. |
| **Auto-briefing** | Plain-language summary: season, top and bottom years, ≥3σ extreme months, trend, current conditions and method confidence. |

## Harmonization method

1. **Quality filter.** MODIS confidence ≥ 30; VIIRS nominal/high. Keep `type = 0` (presumed vegetation fire), which drops volcanoes, static industrial sources / gas flares, and offshore detections.
2. **Common 1 km lattice → Fire Cell-Days (FCD).** Every detection is snapped to a 0.01° grid and de-duplicated per calendar day. This removes pixel-size inflation (VIIRS) and repeat-overpass inflation (Terra + Aqua, day + night) at the source.
3. **Aggregation.** FCD and raw counts per 0.25° cell per month go into compact binary tiles (`public/data/*.bin`).
4. **Adaptive Overlap Calibration (in browser).** For the selected cells, over 2012–2025:
   `k̂ₘ = (Σ_y V[y,m] + λ·k̄) / (Σ_y M[y,m] + λ)`, with λ = 25 (empirical-Bayes shrinkage toward the pooled ratio k̄).
   Harmonized series: `H = FCD_VIIRS` for y ≥ 2012, `k̂ₘ · FCD_MODIS` for y < 2012, with a ±σ band from the year-to-year ratio spread.
5. **Validation.** Leave-one-year-out CV over the overlap, reported live.
6. **Inter-VIIRS bridge.** S-NPP / NOAA-20 FCD ratio (2018–2025 overlap) scales live NOAA-20/21 detections onto the S-NPP reference.

The output unit is **VIIRS-equivalent Fire Cell-Days**: the number of unique ~1 km cells with fire on a given day, summed over the month.

## Data

All data is public NASA FIRMS (LANCE / Earthdata):

* MODIS C6.1 yearly country archives 2000–2025: `firms.modaps.eosdis.nasa.gov/data/country/modis/`
* VIIRS S-NPP C2 375 m 2012–2025: `…/data/country/viirs-snpp/`
* VIIRS NOAA-20 C2 375 m 2018–2025: `…/data/country/viirs-jpss1/`
* NRT (live) NOAA-20 / NOAA-21 regional 7-day CSV: `…/data/active_fire/noaa-20-viirs-c2/csv/`

Regions included: India, Argentina, Australia, United States, Canada.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173 (includes /api/nrt locally)
npm test             # unit tests for the harmonization maths
```

Rebuild or extend the dataset (Python 3, pandas, pyarrow):

```bash
python3 -I pipeline/build_dataset.py --regions India,Argentina,Australia,United_States,Canada --workers 6
```

Add any FIRMS country name (e.g. `Brazil`, `Indonesia`) to `REGIONS` in the script and re-run.

## Project structure

```
api/nrt.js              Vercel serverless function: live FIRMS NRT hotspots for a bbox
pipeline/build_dataset.py  FIRMS archive → quality filter → 1 km FCD → 0.25° monthly tiles
public/data/            Harmonization-ready tiles (*.bin + *.json), index, live globe sample
src/harmonize.js        Calibration, validation, climatology, season, trend, warning (pure JS)
src/charts.js           D3 calendar, season clock, trend, harmonization and gauge charts
src/map.js              Leaflet map, canvas cell layer, draw tools, live hotspots
src/globe.js            Hero globe (live fires + MODIS/VIIRS satellite relay)
src/main.js             App state, UI, exports, deep links
tests/                  node:test unit tests
```

## Limitations

* FCD counts fire activity, not burned area or emissions.
* Calibration assumes the MODIS→VIIRS relation for a place and month was stable over 2001–2025. Terra/Aqua orbit drift since about 2020 is partly absorbed because the overlap covers it.
* The live warning projects a 7-day pace across the whole month. Treat it as a screening signal, not a forecast.

## Credits

NASA FIRMS / LANCE / Earthdata; Giglio et al. 2016 (MODIS C6); Schroeder et al. 2014 (VIIRS 375 m); basemap © OpenStreetMap contributors © CARTO; Natural Earth via world-atlas; Leaflet; D3. NASA does not endorse this project.

MIT License.

## Intro video & presentation

`promo/` holds the reproducible pipeline for the intro video and slide deck:
`voiceover.py` (narration + word timings), `intro-video.html` + `video.js` (deterministic animated stage that uses the real tiles), `render.mjs` (frame-by-frame capture via headless Chrome), `mux.py` (voice + ambient bed, YouTube/web encodes, SRT captions) and `build-pptx.cjs` (7-slide deck).
