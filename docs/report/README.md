# Reproducing the scientific report

The numbers, tables and figures in `docs/Agnikaal-Scientific-Report.pdf` come from the published data tiles in `public/data/`.

```bash
cd docs/report
node analyze.mjs   # validation, ablation and case-study results -> results.json, loyo_*.json
python3 figs.py    # figures -> fig/*.png (needs numpy and matplotlib)
```
