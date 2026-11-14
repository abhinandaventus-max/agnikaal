"""NOAA CPC Oceanic Nino Index (ONI) -> public/data/oni.json  (monthly, keyed 'YYYY-MM').
Each 3-month season value is assigned to its centre month (DJF -> Jan, ..., NDJ -> Dec)."""
import json, os, subprocess
URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
SEAS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]
exe = "/usr/bin/curl" if os.path.exists("/usr/bin/curl") else "curl"
txt = subprocess.run([exe, "-sS", "-f", URL], capture_output=True, text=True, check=True).stdout
out = {}
for line in txt.splitlines()[1:]:
    p = line.split()
    if len(p) == 4 and p[0] in SEAS:
        y, m = int(p[1]), SEAS.index(p[0]) + 1
        if y >= 1999:
            out[f"{y}-{m:02d}"] = float(p[3])
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data", "oni.json")
json.dump({"source": URL, "values": out}, open(dst, "w"), separators=(",", ":"))
print(len(out), "months, latest", max(out), out[max(out)])
