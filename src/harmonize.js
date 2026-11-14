// Agnikaal harmonization + analytics core (pure functions, no DOM).
// Units: "Fire Cell-Days" (FCD) = unique ~1 km grid cells with >=1 vegetation-fire
// detection on a calendar day. Harmonized output is expressed in
// VIIRS-equivalent FCD, so 2001-2011 (MODIS only) and 2012+ (VIIRS) share one scale.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const VIIRS_START_YEAR = 2012;

/** Decode a region binary tile into sparse series { M_fcd: {k,v}, ... } */
export function decodeRegion(meta, buffer) {
  const series = {};
  for (const [name, s] of Object.entries(meta.series)) {
    const k = new Uint32Array(buffer, s.offset, s.n);
    const v = new Uint32Array(buffer, s.offset + s.n * 4, s.n);
    series[name] = { k, v };
  }
  const nc = meta.cells.length / 2;
  const cellLat = new Float32Array(nc), cellLon = new Float32Array(nc);
  for (let i = 0; i < nc; i++) {
    cellLat[i] = meta.cells[2 * i] * meta.res - 90;
    cellLon[i] = meta.cells[2 * i + 1] * meta.res - 180;
  }
  return { ...meta, series, nc, cellLat, cellLon };
}

/** Sum a sparse series over a cell mask -> Float64Array(nm) */
export function sumSeries(region, name, mask) {
  const out = new Float64Array(region.nm);
  const { k, v } = region.series[name];
  for (let i = 0; i < k.length; i++) {
    const c = k[i] >>> 9;
    if (!mask || mask[c]) out[k[i] & 511] += v[i];
  }
  return out;
}

/** Cell mask for an AOI. aoi = {type:'bbox', bbox:[w,s,e,n]} | {type:'polygon', coords:[[lon,lat],...]} | null */
export function cellMask(region, aoi) {
  const m = new Uint8Array(region.nc);
  const h = region.res / 2;
  let any = 0;
  for (let i = 0; i < region.nc; i++) {
    const lat = region.cellLat[i] + h, lon = region.cellLon[i] + h;
    let inside = true;
    if (aoi && aoi.type === 'bbox') {
      const [w, s, e, n] = aoi.bbox;
      inside = lon >= w && lon <= e && lat >= s && lat <= n;
    } else if (aoi && aoi.type === 'polygon') {
      inside = pointInPolygon(lon, lat, aoi.coords);
    }
    if (inside) { m[i] = 1; any++; }
  }
  return { mask: m, count: any };
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const idx = (y0, y, m) => (y - y0) * 12 + m;

/**
 * Adaptive Overlap Calibration (AOC).
 * k_m = sum_y V[y,m] / sum_y M[y,m] over the overlap years, shrunk toward the
 * pooled ratio k_all with empirical-Bayes weight lambda (stabilises sparse months).
 */
export function calibrate(M, V, y0, years, opts = {}) {
  const lambda = opts.lambda ?? 25;
  const fallback = opts.fallback ?? 1.6;
  let SM = 0, SV = 0;
  const sm = new Float64Array(12), sv = new Float64Array(12);
  for (const y of years) for (let m = 0; m < 12; m++) {
    const i = idx(y0, y, m);
    sm[m] += M[i]; sv[m] += V[i]; SM += M[i]; SV += V[i];
  }
  const kAll = SM >= 10 ? SV / SM : fallback;
  const k = new Float64Array(12), sd = new Float64Array(12);
  for (let m = 0; m < 12; m++) {
    k[m] = (sv[m] + lambda * kAll) / (sm[m] + lambda);
    // spread of the per-year ratios -> uncertainty band
    const r = [];
    for (const y of years) {
      const i = idx(y0, y, m);
      if (M[i] >= 3) r.push(V[i] / M[i]);
    }
    sd[m] = r.length > 2 ? Math.min(std(r), k[m]) : k[m] * 0.35;
  }
  return { k, sd, kAll, overlapMODIS: SM, overlapVIIRS: SV };
}

/** Build harmonized monthly series (VIIRS-equivalent FCD) */
export function harmonize(region, mask, opts = {}) {
  const y0 = region.y0, nm = region.nm, yEnd = y0 + nm / 12 - 1;
  const M = sumSeries(region, 'M_fcd', mask);
  const V = sumSeries(region, 'V_fcd', mask);
  const Mr = sumSeries(region, 'M_raw', mask);
  const Vr = sumSeries(region, 'V_raw', mask);
  // a VIIRS year with no data at all while MODIS saw fires = archive gap, not "no fire":
  // exclude it from calibration and fill it from calibrated MODIS instead
  const yearSum = (A, y) => { let s = 0; for (let m = 0; m < 12; m++) s += A[idx(y0, y, m)]; return s; };
  const viirsGap = new Set(range(VIIRS_START_YEAR, yEnd).filter((y) => yearSum(V, y) === 0 && yearSum(M, y) >= 20));
  const overlap = range(VIIRS_START_YEAR, yEnd).filter((y) => !viirsGap.has(y));
  const cal = calibrate(M, V, y0, overlap, opts);
  const H = new Float64Array(nm), lo = new Float64Array(nm), hi = new Float64Array(nm);
  const src = new Uint8Array(nm); // 0 none, 1 MODIS-derived, 2 VIIRS
  for (let i = 0; i < nm; i++) {
    const y = y0 + Math.floor(i / 12), m = i % 12;
    if (y >= VIIRS_START_YEAR && !viirsGap.has(y)) { H[i] = V[i]; lo[i] = hi[i] = V[i]; src[i] = 2; }
    else if (y > 2000 || m >= 10) {
      H[i] = cal.k[m] * M[i];
      lo[i] = Math.max(0, (cal.k[m] - cal.sd[m]) * M[i]);
      hi[i] = (cal.k[m] + cal.sd[m]) * M[i];
      src[i] = 1;
    }
  }
  const validation = validate(M, V, Mr, Vr, y0, overlap, opts);
  return { y0, yEnd, nm, M, V, Mr, Vr, H, lo, hi, src, cal, validation, firstYear: 2001 };
}

/** Leave-one-year-out cross-validation of the calibration over the overlap period */
export function validate(M, V, Mr, Vr, y0, years, opts = {}) {
  const obs = [], pred = [], naive = [];
  for (const y of years) {
    const train = years.filter((t) => t !== y);
    const { k } = calibrate(M, V, y0, train, opts);
    for (let m = 0; m < 12; m++) {
      const i = idx(y0, y, m);
      obs.push(V[i]); pred.push(k[m] * M[i]);
      naive.push(Mr[i]); // "just splice raw MODIS onto VIIRS" baseline (raw counts)
    }
  }
  // naive is compared against raw VIIRS, which is what a naive splice would show
  const obsRaw = [];
  for (const y of years) for (let m = 0; m < 12; m++) obsRaw.push(Vr[idx(y0, y, m)]);
  return {
    n: obs.length,
    r2: r2(obs, pred), mape: mape(obs, pred), bias: bias(obs, pred),
    naiveR2: r2(obsRaw, naive), naiveBias: bias(obsRaw, naive), naiveMape: mape(obsRaw, naive),
    pairs: obs.map((o, j) => [M[idx(y0, years[Math.floor(j / 12)], j % 12)], o]),
  };
}

/** Year x month matrix of the harmonized series within [yA, yB] */
export function calendar(h, yA, yB) {
  const rows = [];
  for (let y = yA; y <= yB; y++) {
    const vals = [];
    for (let m = 0; m < 12; m++) {
      const i = idx(h.y0, y, m);
      vals.push(h.src[i] ? h.H[i] : null);
    }
    rows.push({ year: y, vals, total: vals.reduce((a, b) => a + (b || 0), 0) });
  }
  return rows;
}

/** Monthly climatology: median, MAD, percentiles across baseline years */
export function climatology(h, yA, yB) {
  const per = Array.from({ length: 12 }, () => []);
  for (let y = yA; y <= yB; y++) for (let m = 0; m < 12; m++) {
    const i = idx(h.y0, y, m);
    if (h.src[i]) per[m].push(h.H[i]);
  }
  return per.map((arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const med = quantile(s, 0.5);
    const mad = quantile([...s.map((x) => Math.abs(x - med))].sort((a, b) => a - b), 0.5) * 1.4826;
    return { med, mad, p10: quantile(s, 0.1), p25: quantile(s, 0.25), p75: quantile(s, 0.75), p90: quantile(s, 0.9), max: s[s.length - 1] ?? 0, mean: mean(s), values: s };
  });
}

export function anomaly(value, clim) {
  if (value == null) return null;
  const scale = Math.max(clim.mad, 0.25 * clim.med, 1);
  return (value - clim.med) / scale;
}

export function percentileRank(value, sorted) {
  if (!sorted.length) return null;
  let below = 0, eq = 0;
  for (const v of sorted) { if (v < value) below++; else if (v === value) eq++; }
  return (100 * (below + 0.5 * eq)) / sorted.length;
}

/** Fire-season fingerprint: circular timing, concentration, critical window */
export function season(clim) {
  const med = clim.map((c) => c.med);
  const total = med.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let sx = 0, sy = 0;
  med.forEach((v, m) => { const a = ((m + 0.5) / 12) * 2 * Math.PI; sx += v * Math.cos(a); sy += v * Math.sin(a); });
  const ang = (Math.atan2(sy, sx) + 2 * Math.PI) % (2 * Math.PI);
  const peakMonthFloat = (ang / (2 * Math.PI)) * 12 - 0.5;
  const concentration = Math.hypot(sx, sy) / total; // 0 = year-round, 1 = single month
  // critical window: smallest contiguous (circular) set of months holding >= 80% of activity
  let best = null;
  for (let len = 1; len <= 12 && !best; len++) {
    let top = null;
    for (let s = 0; s < 12; s++) {
      let acc = 0;
      for (let j = 0; j < len; j++) acc += med[(s + j) % 12];
      if (acc / total >= 0.8 && (!top || acc > top.acc)) top = { start: s, len, acc };
    }
    best = top;
  }
  const peak = med.indexOf(Math.max(...med));
  // critical months: fewest months (any order) that together hold >= 80% of activity
  const order = med.map((v, m) => [m, v]).sort((x, y) => y[1] - x[1]);
  const critical = []; let acc = 0;
  for (const [m, v] of order) { if (acc / total >= 0.8) break; critical.push(m); acc += v; }
  critical.sort((x, y) => x - y);
  return { peak, peakMonthFloat, concentration, window: best, share: best ? best.acc / total : 1, critical, criticalShare: acc / total };
}

/** Theil-Sen slope + Mann-Kendall test on annual totals */
export function trend(rows) {
  const xs = rows.map((r) => r.year), ys = rows.map((r) => r.total);
  const n = ys.length;
  if (n < 4) return null;
  const slopes = [];
  let S = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    S += Math.sign(ys[j] - ys[i]);
  }
  slopes.sort((a, b) => a - b);
  const slope = quantile(slopes, 0.5);
  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  const med = quantile([...ys].sort((a, b) => a - b), 0.5);
  return { slope, z, p, pctPerDecade: med > 0 ? (slope * 10 * 100) / med : 0, intercept: quantile(ys.map((y, i) => y - slope * xs[i]).sort((a, b) => a - b), 0.5) };
}

/** Early-warning level for a current daily pace vs the climatology of a month */
export function warningLevel(pacePerDay, clim, month, year = 2026) {
  const days = new Date(year, month + 1, 0).getDate();
  const est = pacePerDay * days;
  const c = clim[month];
  const pr = percentileRank(est, c.values);
  const z = anomaly(est, c);
  let level = 'Normal', code = 1;
  if (pr >= 90 || z >= 3) { level = 'Extreme'; code = 4; }
  else if (pr >= 75 || z >= 1.5) { level = 'Elevated'; code = 3; }
  else if (pr >= 40) { level = 'Typical'; code = 2; }
  else { level = 'Below normal'; code = 1; }
  return { est, pr, z, level, code, median: c.med };
}

/** Rows for CSV export */
export function monthlyRows(h, yA, yB) {
  const out = [];
  for (let y = Math.max(yA, 2000); y <= yB; y++) for (let m = 0; m < 12; m++) {
    const i = idx(h.y0, y, m);
    if (!h.src[i]) continue;
    out.push({
      year: y, month: m + 1,
      harmonized_fcd: +h.H[i].toFixed(1), lower: +h.lo[i].toFixed(1), upper: +h.hi[i].toFixed(1),
      source: h.src[i] === 2 ? 'VIIRS S-NPP' : 'MODIS (calibrated)',
      modis_fcd: h.M[i], viirs_fcd: y >= VIIRS_START_YEAR ? h.V[i] : '',
      modis_raw_detections: h.Mr[i], viirs_raw_detections: y >= VIIRS_START_YEAR ? h.Vr[i] : '',
      k_month: +h.cal.k[m].toFixed(3),
    });
  }
  return out;
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

// ---------- small stats helpers ----------
export function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
export function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
export function std(a) { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }
export function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
export function r2(o, p) {
  const m = mean(o); let ss = 0, sr = 0;
  for (let i = 0; i < o.length; i++) { ss += (o[i] - m) ** 2; sr += (o[i] - p[i]) ** 2; }
  return ss > 0 ? 1 - sr / ss : 0;
}
export function mape(o, p) {
  let s = 0, n = 0;
  for (let i = 0; i < o.length; i++) if (o[i] >= 5) { s += Math.abs(o[i] - p[i]) / o[i]; n++; }
  return n ? (100 * s) / n : 0;
}
export function bias(o, p) {
  const so = o.reduce((a, b) => a + b, 0), sp = p.reduce((a, b) => a + b, 0);
  return so > 0 ? (100 * (sp - so)) / so : 0;
}
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}
