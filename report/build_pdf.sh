#!/bin/sh
# Build Agnikaal-Scientific-Report.pdf from report.html (needs Google Chrome + pypdf)
cd "$(dirname "$0")"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=15000 --print-to-pdf=report-raw.pdf "file://$PWD/report.html" 2>/dev/null
python3 - <<'PY'
from pypdf import PdfReader, PdfWriter
w = PdfWriter(clone_from=PdfReader('report-raw.pdf'))
w.add_metadata({'/Title': 'Agnikaal: Harmonizing 25 Years of MODIS and VIIRS Active-Fire Detections',
  '/Author': 'Team AKASHA7 (Abhinand K S, Abhijith K S, Annlia Lixon)',
  '/Subject': 'NASA Space Apps Challenge 2026: Harmonization of MODIS and VIIRS Hot Spots - technical report',
  '/Keywords': 'MODIS, VIIRS, FIRMS, active fire, harmonization', '/Creator': 'Team AKASHA7', '/Producer': 'Team AKASHA7'})
w.write('Agnikaal-Scientific-Report.pdf')
PY
rm -f report-raw.pdf
