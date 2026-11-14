// Research Lab: automated hypothesis testing ("AI Auto-Insights") + research exports.
// Every finding is a classical, reproducible test; p-values are corrected with
// Benjamini-Hochberg so that scanning many hypotheses does not create false discoveries.
import { MONTHS, quantile } from './harmonize.js';

const MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const Phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
const median = (a) => quantile([...a].sort((x, y) => x - y), 0.5);

/** Mann-Kendall + Theil-Sen on a series ys (x = years) */
export function mannKendall(xs, ys) {
  const n = ys.length; if (n < 6) return null;
  let S = 0; const slopes = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { S += Math.sign(ys[j] - ys[i]); slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i])); }
  const v = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = S > 0 ? (S - 1) / Math.sqrt(v) : S < 0 ? (S + 1) / Math.sqrt(v) : 0;
  return { slope: median(slopes), z, p: 2 * (1 - Phi(Math.abs(z))), tau: S / ((n * (n - 1)) / 2) };
}
/** Pettitt change-point test */
export function pettitt(ys) {
  const n = ys.length; let best = 0, k = -1;
  for (let t = 0; t < n - 1; t++) {
    let U = 0; for (let i = 0; i <= t; i++) for (let j = t + 1; j < n; j++) U += Math.sign(ys[i] - ys[j]);
    if (Math.abs(U) > Math.abs(best)) { best = U; k = t; }
  }
  const K = Math.abs(best);
  return { k, K, p: Math.min(1, 2 * Math.exp((-6 * K * K) / (n ** 3 + n ** 2))) };
}
/** Spearman rank correlation with a normal-approximation p-value */
export function spearman(a, b) {
  const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); o.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
  const ra = rank(a), rb = rank(b), n = a.length, ma = (n + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  const rho = num / Math.sqrt(da * db), t = rho * Math.sqrt((n - 2) / Math.max(1e-9, 1 - rho * rho));
  return { rho, p: 2 * (1 - Phi(Math.abs(t))) };
}
function bh(ps) { // Benjamini-Hochberg adjusted p-values
  const m = ps.length, o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), q = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) { const [p, i] = o[k]; prev = Math.min(prev, (p * m) / (k + 1)); q[i] = prev; }
  return q;
}
const pct = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;
const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1));

/** Run the full hypothesis scan for the current area */
export function autoInsights(h, oni) {
  const years = []; for (let y = 2001; y <= 2025; y++) years.push(y);
  const at = (y, m) => h.H[(y - h.y0) * 12 + m];
  const annual = years.map((y) => MONTHS.reduce((a, _, m) => a + at(y, m), 0));
  const medAnnual = median(annual) || 1;
  const monthMed = MONTHS.map((_, m) => median(years.map((y) => at(y, m))));
  const share = monthMed.map((v) => v / (monthMed.reduce((a, b) => a + b, 0) || 1));
  const tests = [];

  const tr = mannKendall(years, annual);
  if (tr) tests.push({ id: 'trend', p: tr.p, effect: (tr.slope * 10) / medAnnual, kind: 'Trend',
    title: tr.slope >= 0 ? `Fire activity is rising: ${pct((tr.slope * 10) / medAnnual)} per decade` : `Fire activity is falling: ${pct((tr.slope * 10) / medAnnual)} per decade`,
    stat: `Mann–Kendall τ = ${tr.tau.toFixed(2)}, Theil–Sen ${fmt(tr.slope)} FCD/yr`, why: 'Long-term change in total burning; check against land-use or policy changes.' });

  MONTHS.forEach((_, m) => {
    if (share[m] < 0.03) return;
    const r = mannKendall(years, years.map((y) => at(y, m)));
    if (!r) return;
    const eff = monthMed[m] > 0 ? (r.slope * 10) / monthMed[m] : 0;
    tests.push({ id: `m${m}`, p: r.p, effect: eff, kind: 'Monthly trend',
      title: `${MON_FULL[m]} burning is ${r.slope >= 0 ? 'increasing' : 'decreasing'} (${pct(eff)} per decade)`,
      stat: `Mann–Kendall τ = ${r.tau.toFixed(2)}; ${MON_FULL[m]} holds ${Math.round(share[m] * 100)}% of the year's fires`, why: 'Shows which part of the season is changing, not just the total.' });
  });

  const pt = pettitt(annual);
  if (pt.k >= 2 && pt.k <= annual.length - 4) {
    const before = annual.slice(0, pt.k + 1), after = annual.slice(pt.k + 1);
    const ratio = median(after) / (median(before) || 1);
    tests.push({ id: 'cp', p: pt.p, effect: ratio - 1, kind: 'Regime shift',
      title: `A shift around ${years[pt.k + 1]}: typical activity ${ratio >= 1 ? 'rose' : 'fell'} ${pct(ratio - 1)} afterwards`,
      stat: `Pettitt K = ${pt.K}, medians ${fmt(median(before))} → ${fmt(median(after))} FCD/yr`, why: 'Abrupt changes often line up with policy, land-clearing or climate events worth investigating.' });
  }

  const cent = years.map((y) => {
    let sx = 0, sy = 0, tot = 0;
    MONTHS.forEach((_, m) => { const v = at(y, m), a = ((m + 0.5) / 12) * 2 * Math.PI; sx += v * Math.cos(a); sy += v * Math.sin(a); tot += v; });
    return tot > 0 ? (((Math.atan2(sy, sx) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 365 : null;
  });
  const ok = cent.map((c, i) => [years[i], c]).filter((x) => x[1] != null);
  if (ok.length >= 10) {
    const mean = ok.reduce((a, [, c]) => a + c, 0) / ok.length;
    const un = ok.map(([y, c]) => [y, c - mean > 182 ? c - 365 : mean - c > 182 ? c + 365 : c]);
    const r = mannKendall(un.map((x) => x[0]), un.map((x) => x[1]));
    if (r) tests.push({ id: 'timing', p: r.p, effect: (r.slope * 10) / 30, kind: 'Season timing',
      title: `The fire season is arriving ${r.slope < 0 ? 'earlier' : 'later'}: ${Math.abs(r.slope * 10).toFixed(0)} days per decade`,
      stat: `Circular centre of activity, Mann–Kendall τ = ${r.tau.toFixed(2)}`, why: 'A shifting season changes when crews and campaigns are needed.' });
  }

  if (oni) {
    const top = share.map((s, m) => [m, s]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
    const pairs = years.map((y) => {
      const o = top.map((m) => oni[`${y}-${String(m + 1).padStart(2, '0')}`]).filter((v) => v != null);
      return [top.reduce((a, m) => a + at(y, m), 0), o.length ? o.reduce((a, b) => a + b, 0) / o.length : null];
    }).filter((x) => x[1] != null);
    if (pairs.length >= 15) {
      const r = spearman(pairs.map((x) => x[0]), pairs.map((x) => x[1]));
      tests.push({ id: 'enso', p: r.p, effect: r.rho, kind: 'Climate link',
        title: `${r.rho >= 0 ? 'El Niño years burn more' : 'La Niña years burn more'} here (Spearman ρ = ${r.rho.toFixed(2)})`,
        stat: `Fires in ${top.map((m) => MONTHS[m]).join('/')} vs NOAA ONI of the same months, n = ${pairs.length} years`, why: 'A climate driver makes seasons predictable months ahead.' });
    }
  }

  const pre = annual.slice(2009 - 2001, 2012 - 2001), post = annual.slice(2012 - 2001, 2015 - 2001);
  const diffs = annual.slice(1).map((v, i) => Math.abs(Math.log1p(v) - Math.log1p(annual[i])));
  const seam = Math.abs(Math.log1p(median(post)) - Math.log1p(median(pre)));
  const seamP = diffs.filter((d) => d >= seam).length / diffs.length;
  tests.push({ id: 'seam', p: 1, effect: 0, kind: 'Data check', info: true,
    title: seamP > 0.1 ? 'No sensor seam detected at 2012 (harmonization holds)' : 'Possible residual step at 2012: treat pre-2012 values with care',
    stat: `2009–11 → 2012–14 change is larger than ${Math.round((1 - seamP) * 100)}% of normal year-to-year changes`, why: 'Confirms MODIS-era and VIIRS-era values are comparable for this area.' });

  const mad = median(annual.map((v) => Math.abs(v - medAnnual))) * 1.4826 || 1;
  const extremes = years.map((y, i) => ({ y, z: (annual[i] - medAnnual) / mad })).filter((e) => e.z >= 2.5).sort((a, b) => b.z - a.z);
  if (extremes.length) tests.push({ id: 'ext', p: 1, effect: 0, kind: 'Extreme years', info: true,
    title: `Exceptional fire years: ${extremes.slice(0, 4).map((e) => e.y).join(', ')}`, stat: extremes.slice(0, 4).map((e) => `${e.y}: +${e.z.toFixed(1)} robust σ`).join(' · '), why: 'Candidate case studies for drought, policy or land-use analysis.' });

  const hyp = tests.filter((t) => !t.info);
  const q = bh(hyp.map((t) => t.p));
  hyp.forEach((t, i) => { t.q = q[i]; t.strength = t.q < 0.01 ? 'Strong' : t.q < 0.05 ? 'Significant' : t.q < 0.15 ? 'Suggestive' : 'Not significant'; });
  tests.filter((t) => t.info).forEach((t) => { t.strength = t.kind === 'Data check' ? 'Check' : 'Notable'; });
  const order = { Strong: 0, Significant: 1, Notable: 2, Check: 3, Suggestive: 4, 'Not significant': 5 };
  tests.sort((a, b) => order[a.strength] - order[b.strength] || (a.q ?? 1) - (b.q ?? 1));
  return { tests, nHyp: hyp.length, nSig: hyp.filter((t) => t.q < 0.05).length, annual, years };
}

// ------------------------------------------------------------------ exports
export function methodsText(S, ins) {
  const h = S.h, v = h.validation, name = S.aoi ? S.aoi.label : S.region.name;
  const sig = ins.tests.filter((t) => t.q != null && t.q < 0.05).slice(0, 3).map((t) => `${t.title.replace(/\.$/, '')} (BH-adjusted q = ${t.q.toFixed(3)})`);
  return `Fire activity for ${name} was derived from NASA FIRMS active-fire detections: MODIS Collection 6.1 (Terra and Aqua, 2001–2025) and VIIRS 375 m Collection 2 (Suomi-NPP, 2012–2025), processed with Agnikaal (https://agnikaal.vercel.app). Detections were filtered to presumed vegetation fires (type = 0; MODIS confidence ≥ 30%, VIIRS nominal/high), snapped to a 0.01° grid and de-duplicated per day into fire cell-days (FCD). MODIS FCD were calibrated to the VIIRS scale with month-specific ratio factors estimated over the 2012–2025 overlap and shrunk toward the pooled ratio (empirical Bayes, λ = 25); leave-one-year-out cross-validation gave R² = ${v.r2.toFixed(2)} and a total bias of ${v.bias.toFixed(1)}%, compared with ${v.naiveBias.toFixed(0)}% for a naive splice of raw counts. Trends were assessed with the Mann–Kendall test and Theil–Sen slopes, change points with the Pettitt test, and ENSO associations with Spearman correlation against the NOAA Oceanic Niño Index; p-values from ${ins.nHyp} tests were controlled with the Benjamini–Hochberg procedure.${sig.length ? ` Significant findings: ${sig.join('; ')}.` : ' No test was significant after false-discovery-rate correction.'}`;
}

export const BIBTEX = `@misc{agnikaal2026,
  title  = {Agnikaal: a harmonized MODIS--VIIRS burning-activity calendar},
  author = {{Team AKASHA7}},
  year   = {2026},
  note   = {NASA Space Apps Challenge 2026},
  url    = {https://agnikaal.vercel.app},
  howpublished = {\\url{https://github.com/abhinandaventus-max/agnikaal}}
}
@misc{firms_modis_c61,
  title  = {MODIS Collection 61 NRT Hotspot / Active Fire Detections MCD14DL},
  author = {{NASA FIRMS}},
  doi    = {10.5067/FIRMS/MODIS/MCD14DL.NRT.0061},
  url    = {https://earthdata.nasa.gov/firms}
}
@misc{firms_viirs_snpp,
  title  = {VIIRS 375 m Active Fire Product VNP14IMGT},
  author = {{NASA FIRMS}},
  doi    = {10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002},
  url    = {https://earthdata.nasa.gov/firms}
}
@article{giglio2016,
  title   = {The collection 6 MODIS active fire detection algorithm and fire products},
  author  = {Giglio, Louis and Schroeder, Wilfrid and Justice, Christopher O.},
  journal = {Remote Sensing of Environment}, volume = {178}, pages = {31--41}, year = {2016}
}
@article{schroeder2014,
  title   = {The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment},
  author  = {Schroeder, Wilfrid and Oliva, Patricia and Giglio, Louis and Csiszar, Ivan A.},
  journal = {Remote Sensing of Environment}, volume = {143}, pages = {85--96}, year = {2014}
}`;

/** Build a self-contained Jupyter notebook with the area's data embedded */
export function notebook(S, csvText, ins) {
  const name = S.aoi ? S.aoi.label : S.region.name;
  const lines = (t) => t.split('\n').map((l, i, a) => l + (i < a.length - 1 ? '\n' : ''));
  const md = (t) => ({ cell_type: 'markdown', metadata: {}, source: lines(t) });
  const code = (t) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: lines(t) });
  const safe = name.replace(/['"\\]/g, '');
  const cells = [
    md(`# Agnikaal fire analysis: ${name}\nHarmonized MODIS + VIIRS monthly fire activity (fire cell-days, VIIRS-equivalent), exported from [Agnikaal](https://agnikaal.vercel.app) on ${new Date().toISOString().slice(0, 10)}.\n\nRuns as-is in Jupyter or Google Colab (File → Upload notebook). Requires pandas, numpy, matplotlib and scipy.`),
    md('## 1 · Data\nThe monthly table is embedded so the notebook is reproducible offline: harmonized FCD with calibration range, source sensor, raw MODIS/VIIRS FCD and detections, and the month-specific MODIS→VIIRS factor k.'),
    code(`import io, numpy as np, pandas as pd, matplotlib.pyplot as plt\nfrom scipy import stats\n\nCSV = """${csvText}"""\ndf = pd.read_csv(io.StringIO(CSV))\ndf['date'] = pd.to_datetime(dict(year=df.year, month=df.month, day=15))\ndf.head()`),
    md('## 2 · Burning-activity calendar'),
    code(`cal = df.pivot(index='year', columns='month', values='harmonized_fcd')\nfig, ax = plt.subplots(figsize=(9, 8))\nim = ax.imshow(np.sqrt(cal), cmap='inferno', aspect='auto')\nax.set_xticks(range(12)); ax.set_xticklabels(list('JFMAMJJASOND'))\nax.set_yticks(range(len(cal))); ax.set_yticklabels(cal.index)\nif 2012 in cal.index: ax.axhline(cal.index.get_loc(2012) - 0.5, color='w', lw=0.8, ls='--')\nplt.colorbar(im, label='sqrt(fire cell-days)'); ax.set_title('${safe}: harmonized fire calendar'); plt.show()`),
    md('## 3 · Raw splice vs harmonized record\nThe raw series jumps when VIIRS starts in 2012; the harmonized series does not.'),
    code(`annual = df.groupby('year').agg(harm=('harmonized_fcd', 'sum'), modis=('modis_raw_detections', 'sum'),\n                                viirs=('viirs_raw_detections', lambda s: pd.to_numeric(s, errors='coerce').sum()))\nannual['raw_splice'] = np.where(annual.index < 2012, annual.modis, annual.viirs)\nannual[['harm', 'raw_splice']].plot(marker='o', figsize=(9, 4), logy=True); plt.axvline(2011.5, ls='--', c='grey'); plt.title('Annual totals'); plt.show()`),
    md('## 4 · Trend tests'),
    code(`tau, p = stats.kendalltau(annual.index, annual.harm)\nslope = stats.theilslopes(annual.harm, annual.index)[0]\nprint(f"Kendall tau = {tau:.2f}, p = {p:.3g}, Theil-Sen slope = {slope:.1f} FCD/yr ({100*10*slope/annual.harm.median():+.0f}% per decade)")\nfor m in range(1, 13):\n    s = df[df.month == m].set_index('year').harmonized_fcd\n    t, pm = stats.kendalltau(s.index, s.values)\n    print(f"month {m:2d}: tau = {t:+.2f}, p = {pm:.3f}")`),
    md(`## 5 · Agnikaal Auto-Insights (computed in the app)\n${ins.tests.map((t) => `- **${t.strength}** · ${t.title}. _${t.stat}_${t.q != null ? ` (BH q = ${t.q.toFixed(3)})` : ''}`).join('\n')}`),
    md(`## 6 · How to cite\n${methodsText(S, ins)}\n\n\`\`\`bibtex\n${BIBTEX}\n\`\`\``),
  ];
  return JSON.stringify({ cells, metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } }, nbformat: 4, nbformat_minor: 5 }, null, 1);
}

// ------------------------------------------------------------------ GIS exports (ported from the fork-4 session)
export function aoiGeoJSON(aoi, bbox, props) {
  let coords;
  if (aoi && aoi.type === 'polygon') coords = [[...aoi.coords, aoi.coords[0]]];
  else { const [w, s, e, n] = bbox; coords = [[[w, s], [e, s], [e, n], [w, n], [w, s]]]; }
  return JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: coords } }] }, null, 1);
}

const xml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** KML for Google Earth: AOI outline, top harmonized fire cells (extruded by activity), and live hotspots */
export function buildKML({ name, aoi, bbox, cells, hotspots }) {
  const ring = aoi && aoi.type === 'polygon' ? [...aoi.coords, aoi.coords[0]] : (() => { const [w, s, e, n] = bbox; return [[w, s], [e, s], [e, n], [w, n], [w, s]]; })();
  const col = (t) => { // inferno-ish ramp → KML aabbggrr
    const r = Math.round(255 * Math.min(1, 0.4 + t)), g = Math.round(255 * Math.min(1, t * 0.9)), b = Math.round(40 * (1 - t));
    const h = (x) => x.toString(16).padStart(2, '0');
    return `cc${h(b)}${h(g)}${h(r)}`;
  };
  const max = Math.max(1, ...cells.map((c) => c.v));
  const cellPm = cells.map((c) => {
    const t = Math.sqrt(c.v / max), z = Math.round(2000 + 60000 * t);
    const [w, s] = [c.lon, c.lat], e = w + c.res, n = s + c.res;
    return `<Placemark><name>${Math.round(c.v).toLocaleString()} FCD</name><description>Harmonized fire cell-days ${c.yA}–${c.yB}</description><Style><PolyStyle><color>${col(t)}</color><outline>0</outline></PolyStyle></Style><Polygon><extrude>1</extrude><altitudeMode>relativeToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${[[w, s], [e, s], [e, n], [w, n], [w, s]].map(([x, y]) => `${x},${y},${z}`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
  }).join('\n');
  const hsPm = (hotspots || []).slice(0, 3000).map((h) => `<Placemark><styleUrl>#hs</styleUrl><name>${xml(h.date)} ${xml(h.time)}</name><description>FRP ${h.frp} MW · ${h.dn === 'N' ? 'night' : 'day'} · confidence ${xml(h.conf)}</description><Point><coordinates>${h.lon},${h.lat},0</coordinates></Point></Placemark>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Agnikaal · ${xml(name)}</name>
<description>Harmonized MODIS+VIIRS fire activity from Agnikaal (NASA Space Apps 2026, Team AKASHA7). Column height = fire activity.</description>
<Style id="aoi"><LineStyle><color>ff47b3ff</color><width>3</width></LineStyle><PolyStyle><color>1a47b3ff</color></PolyStyle></Style>
<Style id="hs"><IconStyle><color>ff5c3bff</color><scale>0.6</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/firedept.png</href></Icon></IconStyle></Style>
<Placemark><name>Area of interest</name><styleUrl>#aoi</styleUrl><Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${ring.map(([x, y]) => `${x},${y},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Folder><name>Harmonized fire activity (3D columns)</name>
${cellPm}
</Folder>
<Folder><name>Live hotspots (last 7 days)</name>
${hsPm}
</Folder>
</Document></kml>`;
}

export function googleEarthUrl(bbox) {
  const [w, s, e, n] = bbox;
  const lat = (s + n) / 2, lon = (w + e) / 2;
  const spanKm = Math.max((n - s) * 111, (e - w) * 111 * Math.cos((lat * Math.PI) / 180));
  const dist = Math.round(Math.min(6e6, Math.max(20000, spanKm * 1800)));
  return `https://earth.google.com/web/@${lat.toFixed(4)},${lon.toFixed(4)},0a,${dist}d,35y,0h,40t,0r`;
}

/** Mean annual harmonized fire cell-days per 0.25 deg cell inside the mask (VIIRS era + calibrated MODIS era) */
export function cellTotals(R, h, mask, yA = 2001, yB = 2025) {
  const vals = new Float64Array(R.nc), k = h.cal.k;
  for (const [key, arrName] of [['V', 'V_fcd'], ['M', 'M_fcd']]) {
    const { k: kk, v } = R.series[arrName];
    for (let i = 0; i < kk.length; i++) {
      const c = kk[i] >>> 9, mi = kk[i] & 511, y = R.y0 + Math.floor(mi / 12);
      if ((mask && !mask[c]) || y < yA || y > yB) continue;
      if (key === 'V' && y >= 2012) vals[c] += v[i];
      if (key === 'M' && y < 2012) vals[c] += v[i] * k[mi % 12];
    }
  }
  const yrs = yB - yA + 1, out = [];
  for (let c = 0; c < R.nc; c++) if (vals[c] > 0) out.push({ lon: R.cellLon[c], lat: R.cellLat[c], res: R.res, v: vals[c] / yrs, yA, yB });
  return out.sort((a, b) => b.v - a.v).slice(0, 2500);
}
