#!/usr/bin/env python3
"""
Agnikaal data pipeline — Harmonized MODIS + VIIRS active-fire record.

Downloads NASA FIRMS yearly country archives (public, no key needed):
  MODIS C6.1 (Terra+Aqua)  2000-2025   https://firms.modaps.eosdis.nasa.gov/data/country/modis/
  VIIRS S-NPP 375 m        2012-2025   https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/
  VIIRS NOAA-20 375 m      2018-2025   https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/

Harmonization step 1 (done here, per detection):
  1. Quality filter   MODIS confidence >= 30, VIIRS confidence nominal/high,
                      type == 0 (presumed vegetation fire; drops volcanoes,
                      static industrial sources / gas flares, offshore).
  2. Common 1-km grid every detection is snapped to a 0.01 deg (~1.1 km) lattice
                      and de-duplicated per calendar day  ->  "Fire Cell-Days" (FCD).
                      This removes the two biggest sensor artefacts:
                        * VIIRS 375 m pixels => ~7 pixels per MODIS 1 km pixel
                        * MODIS Terra+Aqua (and day+night) repeat overpasses
  3. Aggregation      FCD and raw detection counts are summed per 0.25 deg cell
                      per calendar month and written to compact binary tiles.

Harmonization step 2 (overlap calibration, MODIS -> VIIRS-equivalent) runs
in the browser for the exact area the user draws (see src/harmonize.js), so the
correction is local, month-specific, and cross-validated live.

Usage:  python3 -I pipeline/build_dataset.py [--regions India,Argentina] [--workers 4]
"""
import argparse, io, json, os, struct, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"
SENSORS = {
    # key: (folder, file prefix, years, kind)
    "M": ("modis", "modis", range(2000, 2026), "modis"),
    "V": ("viirs-snpp", "viirs-snpp", range(2012, 2026), "viirs"),
    "J": ("viirs-jpss1", "viirs-jpss1", range(2018, 2026), "viirs"),
}
REGIONS = {
    "India": "India",
    "Argentina": "Argentina",
    "Australia": "Australia",
    "United_States": "United States",
    "Canada": "Canada",
}
RES = 0.25          # analysis cell (deg)
FINE = 0.01         # harmonization lattice (deg) ~1.1 km
Y0 = 2000           # month index 0 = Jan 2000
NM = (2025 - Y0 + 1) * 12

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.environ.get("AGNI_CACHE", os.path.join(HERE, ".cache"))
OUT = os.path.join(ROOT, "public", "data")


def curl(url, dest):
    # macOS system curl uses the system trust store; works behind TLS-inspecting proxies
    exe = "/usr/bin/curl" if os.path.exists("/usr/bin/curl") else "curl"  # noqa
    # abort stalled transfers (<20 KB/s for 45 s) and retry; FIRMS occasionally stalls
    for _ in range(4):
        r = subprocess.run([exe, "-sS", "-f", "-L", "--retry", "3", "--connect-timeout", "20",
                            "--speed-limit", "20000", "--speed-time", "45", "-o", dest, url])
        if r.returncode == 0:
            return True
        if r.returncode == 22:  # HTTP 404 etc: file genuinely missing
            return False
        time.sleep(3)
    return False


def process(region, skey, year):
    folder, prefix, _, kind = SENSORS[skey]
    agg_path = os.path.join(CACHE, f"{region}_{skey}_{year}.parquet")
    if os.path.exists(agg_path):
        return agg_path, "cached"
    url = f"{BASE}/{folder}/{year}/{prefix}_{year}_{region}.csv"
    raw = os.path.join(CACHE, f"{region}_{skey}_{year}.csv")
    if not curl(url, raw):
        if os.path.exists(raw):
            os.remove(raw)
        return None, f"missing {url}"
    usecols = ["latitude", "longitude", "acq_date", "confidence", "type"]
    df = pd.read_csv(raw, usecols=lambda c: c in usecols,
                     dtype={"confidence": str}, low_memory=False)
    os.remove(raw)
    n0 = len(df)
    if kind == "modis":
        conf = pd.to_numeric(df["confidence"], errors="coerce")
        df = df[conf >= 30]
    else:
        df = df[df["confidence"].str[0].str.lower().isin(["n", "h"])]
    if "type" in df.columns:
        df = df[df["type"] == 0]
    d = pd.to_datetime(df["acq_date"])
    lat = df["latitude"].to_numpy(); lon = df["longitude"].to_numpy()
    out = pd.DataFrame({
        "fy": np.floor((lat + 90) / FINE).astype(np.int32),
        "fx": np.floor((lon + 180) / FINE).astype(np.int32),
        "day": d.dt.dayofyear.to_numpy().astype(np.int16),
        "mi": ((d.dt.year - Y0) * 12 + d.dt.month - 1).to_numpy().astype(np.int16),
        "cy": np.floor((lat + 90) / RES).astype(np.int16),
        "cx": np.floor((lon + 180) / RES).astype(np.int16),
    })
    rawc = out.groupby(["cy", "cx", "mi"]).size().rename("raw")
    fcd = (out.drop_duplicates(["fy", "fx", "day"])
              .groupby(["cy", "cx", "mi"]).size().rename("fcd"))
    agg = pd.concat([rawc, fcd], axis=1).fillna(0).astype(np.int32).reset_index()
    agg.to_parquet(agg_path) if _has_pq() else agg.to_pickle(agg_path)
    return agg_path, f"{n0:>8} det -> {int(agg.raw.sum()):>8} kept -> {int(agg.fcd.sum()):>8} FCD"


_PQ = None
def _has_pq():
    global _PQ
    if _PQ is None:
        try:
            import pyarrow  # noqa
            _PQ = True
        except Exception:
            _PQ = False
    return _PQ


def load(p):
    return pd.read_parquet(p) if _has_pq() else pd.read_pickle(p)


def build_region(region, parts):
    """parts: {skey: [agg dataframes]} -> binary tile + meta"""
    frames = {k: pd.concat(v) if v else None for k, v in parts.items()}
    cells = pd.concat([f[["cy", "cx"]] for k, f in frames.items() if f is not None and k in ("M", "V")]) \
              .drop_duplicates().sort_values(["cy", "cx"]).reset_index(drop=True)
    cells["ci"] = np.arange(len(cells), dtype=np.int32)
    blobs, meta_series = [], {}
    offset = 0
    for skey in ("M", "V"):
        f = frames[skey].groupby(["cy", "cx", "mi"], as_index=False)[["raw", "fcd"]].sum()
        f = f.merge(cells, on=["cy", "cx"]).sort_values(["ci", "mi"])
        packed = (f["ci"].to_numpy().astype(np.uint32) << 9) | f["mi"].to_numpy().astype(np.uint32)
        for metric in ("fcd", "raw"):
            vals = f[metric].to_numpy().astype(np.uint32)
            nz = vals > 0
            k = packed[nz]; v = vals[nz]
            buf = k.astype("<u4").tobytes() + v.astype("<u4").tobytes()
            meta_series[f"{skey}_{metric}"] = {"offset": offset, "n": int(nz.sum())}
            blobs.append(buf); offset += len(buf)
    # NOAA-20: region-level monthly totals only (inter-VIIRS bridge for live NRT)
    j = frames.get("J")
    jser = {"fcd": [0] * NM, "raw": [0] * NM}
    sser = {"fcd": [0] * NM, "raw": [0] * NM}
    if j is not None:
        jm = j.groupby("mi")[["raw", "fcd"]].sum()
        for mi, r in jm.iterrows():
            if 0 <= mi < NM:
                jser["fcd"][mi] = int(r.fcd); jser["raw"][mi] = int(r.raw)
    vm = frames["V"].groupby("mi")[["raw", "fcd"]].sum()
    for mi, r in vm.iterrows():
        if 0 <= mi < NM:
            sser["fcd"][mi] = int(r.fcd); sser["raw"][mi] = int(r.raw)

    rid = region.lower()
    with open(os.path.join(OUT, f"{rid}.bin"), "wb") as fh:
        fh.write(b"".join(blobs))
    cy = cells["cy"].to_numpy(); cx = cells["cx"].to_numpy()
    meta = {
        "id": rid, "name": REGIONS[region], "res": RES, "y0": Y0, "nm": NM,
        "bbox": [float(cx.min() * RES - 180), float(cy.min() * RES - 90),
                 float((cx.max() + 1) * RES - 180), float((cy.max() + 1) * RES - 90)],
        "cells": np.column_stack([cy, cx]).astype(int).ravel().tolist(),
        "series": meta_series,
        "noaa20": jser, "snpp": sser,
        "sources": {
            "M": "MODIS C6.1 Terra+Aqua (1 km) FIRMS archive",
            "V": "VIIRS S-NPP C2 (375 m) FIRMS archive",
            "J": "VIIRS NOAA-20 C2 (375 m) FIRMS archive",
        },
        "built": time.strftime("%Y-%m-%d"),
        "detections": int(sum(int(f["raw"].sum()) for f in frames.values() if f is not None)),
        # naive splice jump: raw VIIRS 2012-14 vs raw MODIS 2009-11 (annual means)
        "seamJump": float(sum(sser["raw"][(2012 - Y0) * 12:(2015 - Y0) * 12]) /
                          max(1, int(frames["M"][(frames["M"].mi >= (2009 - Y0) * 12) & (frames["M"].mi < (2012 - Y0) * 12)].raw.sum()))),
    }
    with open(os.path.join(OUT, f"{rid}.json"), "w") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    return rid, len(cells), offset


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regions", default=",".join(REGIONS))
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    regions = [r for r in a.regions.split(",") if r]
    for region in regions:
        jobs = [(region, s, y) for s, spec in SENSORS.items() for y in spec[2]]
        parts = {k: [] for k in SENSORS}
        t = time.time()
        with ThreadPoolExecutor(a.workers) as ex:
            futs = {ex.submit(process, *j): j for j in jobs}
            for fu in as_completed(futs):
                r, s, y = futs[fu]
                try:
                    p, msg = fu.result()
                except Exception as e:  # keep going, report
                    p, msg = None, f"ERROR {e}"
                print(f"[{region} {s} {y}] {msg}", flush=True)
                if p:
                    parts[s].append(load(p))
        rid, nc, nb = build_region(region, parts)
        print(f"== {rid}: {nc} cells, {nb/1e6:.2f} MB binary, {time.time()-t:.0f}s", flush=True)
    idx = []
    for f in sorted(os.listdir(OUT)):
        if f.endswith(".json") and f != "index.json":
            m = json.load(open(os.path.join(OUT, f)))
            idx.append({"id": m["id"], "name": m["name"], "bbox": m["bbox"],
                        "detections": m.get("detections", 0), "seamJump": m.get("seamJump")})
    json.dump(idx, open(os.path.join(OUT, "index.json"), "w"), indent=1)


def live_sample(n=2600):
    """Small sample of the last 24 h of global VIIRS NOAA-20 hotspots for the hero globe."""
    url = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv"
    tmp = os.path.join(CACHE, "live24.csv")
    if not curl(url, tmp):
        return
    df = pd.read_csv(tmp, usecols=["latitude", "longitude", "frp", "confidence"])
    os.remove(tmp)
    df = df[df.confidence.astype(str).str[0].isin(["n", "h"])]
    df = df.sample(min(n, len(df)), random_state=7)
    pts = [[round(a, 2), round(b, 2), round(min(3.0, float(np.log10(1 + f))), 2)]
           for b, a, f in zip(df.latitude, df.longitude, df.frp)]
    json.dump({"source": url, "built": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), "points": pts},
              open(os.path.join(OUT, "live_sample.json"), "w"), separators=(",", ":"))


if __name__ == "__main__":
    main()
    live_sample()
