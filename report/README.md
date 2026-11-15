# Agnikaal scientific report (extended, 13 pages)

`Agnikaal-Scientific-Report.pdf` is built entirely from the app's own code and data:

1. `node report/analyze.mjs` runs the harmonization, validation, Research Lab tests, outlook backtests and ERA5 weather-driver models for the five countries and ten case-study areas, and writes `results.json`.
2. `python3 report/figures.py` draws the 12 figures into `report/fig/` (matplotlib).
3. `report/build_pdf.sh` prints `report.html` to PDF with headless Google Chrome and sets the document metadata (needs `pypdf`).

A shorter 11-page report is in `docs/`.
