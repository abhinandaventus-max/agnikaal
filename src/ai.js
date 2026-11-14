// Agnikaal AI layer: all free, all in the browser.
//  1. fireOutlook()   - ridge-regression seasonal outlook (persistence + ENSO + trend), LOYO-backtested
//  2. fireWeather()   - 7-day Hot-Dry-Windy style index from the free Open-Meteo forecast API
//  3. fireRegimes()   - unsupervised k-means clustering of fire-calendar shapes
//  4. askAgniLite()   - instant, grounded Q&A over the area's statistics (no model download)
//     + on-device LLM (WebLLM, WebGPU) loaded on demand by main.js
import { MONTHS, quantile, percentileRank } from './harmonize.js';

const MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const l1p = Math.log1p, e1m = Math.expm1;

// ------------------------------------------------------------------ 1. OUTLOOK
function solve(A, b) { // tiny Gaussian elimination for the ridge normal equations
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-9;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-9));
}
function ridge(X, y, w, lambda = 1) {
  const p = X[0].length, A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  X.forEach((x, i) => { for (let j = 0; j < p; j++) { b[j] += w[i] * x[j] * y[i]; for (let k = 0; k < p; k++) A[j][k] += w[i] * x[j] * x[k]; } });
  for (let j = 1; j < p; j++) A[j][j] += lambda;
  return solve(A, b);
}
const feat = (a1, a3, aLY, oni, m, yr) => {
  const a = (2 * Math.PI * (m + 0.5)) / 12;
  return [1, a1, a3, aLY, oni, oni * Math.cos(a), oni * Math.sin(a), (yr - 2013) / 10];
};
const LAMBDA = 3;
const normCdf = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

/**
 * h: harmonized series, clim: climatology, oni: {'YYYY-MM': value}, now: {year, month, anom|null}
 * Returns 6-month outlook with tercile probabilities + backtest skill per lead.
 */
export function fireOutlook(h, clim, oni, now, leads = 6) {
  const y0 = h.y0, med = clim.map((c) => c.med);
  const share = med.map((v) => v / (med.reduce((a, b) => a + b, 0) || 1));
  const anomAt = (i) => l1p(h.H[i]) - l1p(med[i % 12]);
  const oniAt = (y, m) => oni[`${y}-${String(m + 1).padStart(2, '0')}`];
  const res = [];
  for (let L = 1; L <= leads; L++) {
    const rows = [];
    for (let y = 2002; y <= 2025; y++) for (let m = 0; m < 12; m++) {
      const t = (y - y0) * 12 + m, s = t - L;
      if (!h.src[t] || !h.src[s] || s < (2001 - y0) * 12) continue;
      const sy = y0 + Math.floor(s / 12), sm = s % 12;
      const o = oniAt(sy, sm); if (o == null) continue;
      const a3 = [s, s - 1, s - 2].filter((q) => q >= 0 && h.src[q]).map(anomAt);
      const ly = t - 12 >= 0 && h.src[t - 12] ? anomAt(t - 12) : 0;
      rows.push({ y, m, x: feat(anomAt(s), a3.reduce((a, b) => a + b, 0) / (a3.length || 1), ly, o, m, y), t: anomAt(t), w: 0.15 + share[m] * 12 });
    }
    if (rows.length < 60) { res.push(null); continue; }
    // leave-one-year-out backtest on the fire-relevant months
    let hit = 0, n = 0, se = 0, seClim = 0;
    for (let yy = 2002; yy <= 2025; yy++) {
      const tr = rows.filter((r) => r.y !== yy), te = rows.filter((r) => r.y === yy && share[r.m] >= 1 / 24);
      if (!te.length) continue;
      const beta = ridge(tr.map((r) => r.x), tr.map((r) => r.t), tr.map((r) => r.w), LAMBDA);
      for (const r of te) {
        const past = tr.filter((q) => q.m === r.m).map((q) => q.t).sort((a, b) => a - b);
        const lo = quantile(past, 1 / 3), hi = quantile(past, 2 / 3);
        const p = r.x.reduce((a, v, j) => a + v * beta[j], 0);
        const cat = (v) => (v < lo ? 0 : v > hi ? 2 : 1);
        if (cat(p) === cat(r.t)) hit++;
        n++; se += (p - r.t) ** 2; seClim += (quantile(past, 0.5) - r.t) ** 2;
      }
    }
    const beta = ridge(rows.map((r) => r.x), rows.map((r) => r.t), rows.map((r) => r.w), LAMBDA);
    const resid = rows.map((r) => r.t - r.x.reduce((a, v, j) => a + v * beta[j], 0));
    const sigma = Math.sqrt(resid.reduce((a, v) => a + v * v, 0) / resid.length) || 0.5;
    // issue the forecast for now + L
    const tm = (now.month + L) % 12, ty = now.year + Math.floor((now.month + L) / 12);
    // current predictors: live-estimated anomaly for this month, last year's same-month anomaly
    const lyI = (ty - 1 - y0) * 12 + tm;
    const aLY = lyI >= 0 && lyI < h.nm && h.src[lyI] ? anomAt(lyI) : 0;
    const pRaw = feat(now.anom ?? 0, now.anom ?? 0, aLY, now.oni, tm, ty).reduce((a, v, j) => a + v * beta[j], 0);
    const pastT = rows.filter((r) => r.m === tm).map((r) => r.t).sort((a, b) => a - b);
    const lo = quantile(pastT, 1 / 3), hi = quantile(pastT, 2 / 3), base = quantile(pastT, 0.5);
    const sdClim = Math.sqrt(pastT.reduce((a, v) => a + (v - base) ** 2, 0) / (pastT.length || 1)) || sigma;
    // skill-aware shrinkage: trust the model only as much as its leave-one-year-out skill allows
    const skill = seClim ? 1 - se / seClim : 0;
    const wgt = Math.max(0, Math.min(1, skill / 0.25));
    const p = base + wgt * (pRaw - base), sig = wgt * sigma + (1 - wgt) * sdClim;
    const pBelow = normCdf((lo - p) / sig), pAbove = 1 - normCdf((hi - p) / sig);
    res.push({
      lead: L, year: ty, month: tm, expected: Math.max(0, e1m(l1p(med[tm]) + p)), median: med[tm], share: share[tm],
      pBelow, pNormal: Math.max(0, 1 - pBelow - pAbove), pAbove,
      category: wgt === 0 ? 'No clear signal' : pAbove > 0.45 ? 'Above normal' : pBelow > 0.45 ? 'Below normal' : 'Near normal',
      hitRate: n ? hit / n : null, skill, weight: wgt, n,
    });
  }
  // empirical El Nino sensitivity in the area's main fire months
  const top = med.map((v, m) => [m, v]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
  const nino = [], other = [];
  for (let y = 2001; y <= 2025; y++) for (const m of top) {
    const t = (y - y0) * 12 + m, o = oniAt(y, m);
    if (!h.src[t] || o == null) continue;
    (o >= 0.5 ? nino : other).push(anomAt(t));
  }
  const mdn = (a) => quantile([...a].sort((x, y) => x - y), 0.5);
  const ninoEffect = nino.length >= 4 && other.length >= 4 ? Math.exp(mdn(nino) - mdn(other)) - 1 : null;
  return { leads: res, ninoEffect, topMonths: top, oniNow: now.oni, oniMonth: now.oniMonth };
}

export function latestOni(oni) {
  const keys = Object.keys(oni).sort();
  const k = keys[keys.length - 1];
  return { value: oni[k], key: k };
}

// ------------------------------------------------------------------ 2. FIRE WEATHER
const es = (t) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3)); // kPa
export async function fireWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    '&daily=temperature_2m_max,relative_humidity_2m_min,wind_speed_10m_max,precipitation_sum&forecast_days=7&timezone=auto&wind_speed_unit=ms';
  const r = await fetch(url);
  if (!r.ok) throw new Error('weather service unavailable');
  const d = (await r.json()).daily;
  let dry = 0;
  const days = d.time.map((t, i) => {
    const T = d.temperature_2m_max[i], RH = d.relative_humidity_2m_min[i], W = d.wind_speed_10m_max[i], P = d.precipitation_sum[i] ?? 0;
    const vpd = Math.max(0, es(T) * (1 - RH / 100));
    const hdw = vpd * W; // Hot-Dry-Windy style (kPa x m/s)
    dry = P < 1 ? dry + 1 : 0;
    const lvl = P >= 5 ? 0 : hdw >= 30 ? 3 : hdw >= 15 ? 2 : hdw >= 7 ? 1 : 0;
    return { date: t, T, RH, W, P, vpd, hdw, lvl, dryRun: dry };
  });
  const peak = days.reduce((a, b) => (b.hdw > a.hdw ? b : a), days[0]);
  return { days, peak, maxLvl: Math.max(...days.map((x) => x.lvl)), meanHdw: days.reduce((a, b) => a + b.hdw, 0) / days.length };
}
export const WX_LEVEL = ['Low', 'Moderate', 'High', 'Very high'];

/** Combine weather, season timing and live activity into one transparent weekly score */
export function weeklyRisk({ wx, clim, month, live }) {
  const med = clim.map((c) => c.med), tot = med.reduce((a, b) => a + b, 0) || 1;
  const seasonShare = med[month] / tot; // share of the year's burning that normally happens this month
  const season = seasonShare >= 0.15 ? 3 : seasonShare >= 0.08 ? 2 : seasonShare >= 0.04 ? 1 : 0;
  const weather = wx ? Math.min(3, Math.round((wx.maxLvl * 2 + Math.min(3, wx.meanHdw / 10)) / 3)) : 1;
  const liveCode = live ? Math.max(0, live.warn.code - 1) : 1; // 0..3
  const score = 0.4 * weather + 0.35 * season + 0.25 * liveCode; // 0..3
  const level = score >= 2.3 ? 'Very high' : score >= 1.6 ? 'High' : score >= 0.9 ? 'Moderate' : 'Low';
  return { score, level, parts: { weather, season, live: liveCode }, seasonShare };
}

// ------------------------------------------------------------------ 3. FIRE REGIMES
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
/** k-means on normalised 12-month fire calendars of every cell (VIIRS era 2012-2025) */
export function fireRegimes(R, k = 5) {
  const prof = new Map();
  const { k: key, v } = R.series.V_fcd;
  for (let i = 0; i < key.length; i++) {
    const c = key[i] >>> 9, mi = key[i] & 511;
    if (mi < (2012 - R.y0) * 12) continue;
    let p = prof.get(c); if (!p) { p = new Float64Array(13); prof.set(c, p); }
    p[mi % 12] += v[i]; p[12] += v[i];
  }
  const cells = [], X = [];
  for (const [c, p] of prof) {
    if (p[12] < 25) continue; // need enough fires for a stable shape
    const s = Array.from({ length: 12 }, (_, m) => (p[(m + 11) % 12] + 2 * p[m] + p[(m + 1) % 12]) / 4);
    const tot = s.reduce((a, b) => a + b, 0);
    cells.push(c); X.push(s.map((x) => Math.sqrt(x / tot)));
  }
  if (cells.length < k * 5) return null;
  const rnd = rng(42), dist = (a, b) => a.reduce((s, x, j) => s + (x - b[j]) ** 2, 0);
  const C = [X[Math.floor(rnd() * X.length)].slice()];
  while (C.length < k) { // k-means++
    const d = X.map((x) => Math.min(...C.map((c) => dist(x, c))));
    let r = rnd() * d.reduce((a, b) => a + b, 0), i = 0;
    while (r > d[i] && i < d.length - 1) { r -= d[i]; i++; }
    C.push(X[i].slice());
  }
  let lab = new Int32Array(X.length);
  for (let it = 0; it < 30; it++) {
    let moved = 0;
    X.forEach((x, i) => { let b = 0, bd = Infinity; C.forEach((c, j) => { const dd = dist(x, c); if (dd < bd) { bd = dd; b = j; } }); if (lab[i] !== b) { lab[i] = b; moved++; } });
    C.forEach((c, j) => { const mem = X.filter((_, i) => lab[i] === j); if (mem.length) for (let d = 0; d < 12; d++) c[d] = mem.reduce((a, x) => a + x[d], 0) / mem.length; });
    if (!moved) break;
  }
  const regimes = C.map((c, j) => describeRegime(c.map((x) => x * x), X.filter((_, i) => lab[i] === j).length, j));
  // order by size, remap labels
  const order = regimes.map((r, j) => [j, r.count]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const remap = new Int32Array(k); order.forEach((j, idx) => { remap[j] = idx; });
  const cellRegime = new Int16Array(R.nc).fill(-1);
  cells.forEach((c, i) => { cellRegime[c] = remap[lab[i]]; });
  return { regimes: order.map((j) => regimes[j]), cellRegime, nCells: cells.length };
}
function describeRegime(p, count) {
  const tot = p.reduce((a, b) => a + b, 0) || 1, q = p.map((x) => x / tot);
  const peaks = [];
  q.forEach((x, m) => { if (x >= q[(m + 11) % 12] && x >= q[(m + 1) % 12] && x >= 0.06) peaks.push(m); });
  peaks.sort((a, b) => q[b] - q[a]);
  let sx = 0, sy = 0; q.forEach((x, m) => { const a = ((m + 0.5) / 12) * 2 * Math.PI; sx += x * Math.cos(a); sy += x * Math.sin(a); });
  const conc = Math.hypot(sx, sy);
  const sep = peaks.length >= 2 ? Math.min(Math.abs(peaks[0] - peaks[1]), 12 - Math.abs(peaks[0] - peaks[1])) : 0;
  const second = peaks.length >= 2 ? q[peaks[1]] / q[peaks[0]] : 0;
  const order = q.map((x, m) => [m, x]).sort((a, b) => b[1] - a[1]);
  // tightest circular window holding >= 65% of fires (handles seasons that wrap the new year)
  let win = null;
  for (let len = 1; len <= 12 && !win; len++) for (let st = 0; st < 12; st++) {
    let a = 0; for (let j = 0; j < len; j++) a += q[(st + j) % 12];
    if (a >= 0.65 && (!win || a > win.a)) win = { st, len, a };
  }
  const core = [win.st, (win.st + win.len - 1) % 12];
  let name, hint;
  if (sep >= 3 && second >= 0.45) { name = `Two-season burning (${MONTHS[peaks[0]]} + ${MONTHS[peaks[1]]})`; hint = 'Two separate fire pulses a year: often crop-residue burning after each harvest, or early- and late-dry-season burning.'; }
  else if (conc >= 0.65) { name = `Sharp ${MONTHS[peaks[0] ?? order[0][0]]} burning`; hint = 'Almost all fires in a few weeks: typical of planned burning (land clearing, shifting cultivation or one crop harvest).'; }
  else if (conc >= 0.35 || win.len <= 6) { name = `${MONTHS[core[0]]}–${MONTHS[core[1]]} fire season`; hint = 'One long dry-season fire period: typical of forest, grassland and savanna fires.'; }
  else { name = 'Year-round low-level fires'; hint = 'Fires spread through the year without a strong season: often mixed land use or persistent small burns.'; }
  return { name, hint, profile: q, count, peaks, conc };
}
export const REGIME_COLORS = ['#ff6a2b', '#5ad1ff', '#ffd166', '#a98bff', '#4ade80'];

// ------------------------------------------------------------------ 4. ASK AGNI (instant, grounded)
export function buildFacts(S) {
  const h = S.h, rows = S.rows, se = S.season, tr = S.trend, clim = S.clim;
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const f = {
    area: S.aoi ? S.aoi.label : S.region.name, region: S.region.name, years: `${S.yA}-${S.yB}`,
    unit: 'fire cell-days (FCD, VIIRS-equivalent): unique ~1 km cells with fire per day, summed per month',
    meanPerYear: Math.round(rows.reduce((a, r) => a + r.total, 0) / rows.length),
    monthlyMedian: Object.fromEntries(clim.map((c, m) => [MONTHS[m], Math.round(c.med)])),
    peakMonth: se ? MON_FULL[se.peak] : null,
    criticalMonths: se ? se.critical.map((m) => MON_FULL[m]) : [],
    criticalShare: se ? Math.round(se.criticalShare * 100) : null,
    worstYears: sorted.slice(0, 3).map((r) => ({ year: r.year, fcd: Math.round(r.total) })),
    quietestYears: sorted.slice(-3).map((r) => ({ year: r.year, fcd: Math.round(r.total) })),
    trendPctPerDecade: tr ? Math.round(tr.pctPerDecade) : null, trendSignificant: tr ? tr.p < 0.05 : null,
    calibrationR2: +h.validation.r2.toFixed(2), naiveSpliceBiasPct: Math.round(h.validation.naiveBias),
    yearTotals: Object.fromEntries(rows.map((r) => [r.year, Math.round(r.total)])),
  };
  if (S.live && S.liveFor) f.liveLast7Days = { hotspots: S.live.hs.length, level: S.live.warn.level, percentile: Math.round(S.live.warn.pr), recentDecadeLevel: S.live.warn10 && S.live.warn10.level };
  if (S.wx) f.weather7d = { peakDay: S.wx.peak.date, peakHDW: +S.wx.peak.hdw.toFixed(1), maxLevel: WX_LEVEL[S.wx.maxLvl], days: S.wx.days.map((d) => ({ date: d.date, Tmax: d.T, RHmin: d.RH, windMs: d.W, rainMm: d.P, level: WX_LEVEL[d.lvl] })) };
  if (S.risk) f.fireRiskThisWeek = S.risk.level;
  if (S.outlook) f.outlook = S.outlook.leads.filter(Boolean).map((o) => ({ month: `${MON_FULL[o.month]} ${o.year}`, category: o.category, pAbove: Math.round(o.pAbove * 100), pBelow: Math.round(o.pBelow * 100), expectedFCD: Math.round(o.expected), typicalFCD: Math.round(o.median), backtestHitRatePct: o.hitRate == null ? null : Math.round(o.hitRate * 100) }));
  if (S.outlook && S.outlook.ninoEffect != null) f.elNinoEffectPct = Math.round(S.outlook.ninoEffect * 100);
  if (S.outlook) f.oniLatest = S.outlook.oniNow;
  if (S.aoiRegime) f.fireRegime = S.aoiRegime.name;
  if (S.insights) f.findings = S.insights.tests.filter((t) => t.q != null && t.q < 0.05).slice(0, 4).map((t) => `${t.title} (${t.strength.toLowerCase()}, q=${t.q < 0.001 ? '<0.001' : t.q.toFixed(3)})`);
  return f;
}

const has = (q, ...w) => w.some((x) => q.includes(x));
const fmt = (n) => (n == null ? '–' : Math.round(n).toLocaleString());
export function askAgniLite(question, f) {
  const q = question.toLowerCase();
  const yr = q.match(/\b(20[0-2]\d)\b/);
  const mIdx = MONTHS.findIndex((m, i) => q.includes(MON_FULL[i].toLowerCase()) || new RegExp(`\\b${m.toLowerCase()}\\b`).test(q));
  if (yr && f.yearTotals[yr[1]] != null) {
    const v = f.yearTotals[yr[1]], all = Object.values(f.yearTotals).sort((a, b) => a - b);
    const rank = all.length - all.indexOf(v);
    return `In ${yr[1]}, ${f.area} recorded about **${fmt(v)} fire cell-days**, ranking #${rank} of ${all.length} years (average ${fmt(f.meanPerYear)}). ${v > f.meanPerYear * 1.25 ? 'That was a heavy fire year.' : v < f.meanPerYear * 0.75 ? 'That was a quiet year.' : 'That was close to normal.'}`;
  }
  if (mIdx >= 0 && !has(q, 'next', 'coming', 'forecast', 'outlook')) {
    const v = f.monthlyMedian[MONTHS[mIdx]], max = Math.max(...Object.values(f.monthlyMedian));
    return `In a typical year, ${MON_FULL[mIdx]} has about **${fmt(v)} fire cell-days** in ${f.area}${v >= max * 0.6 ? ', one of the busiest months, so expect high activity.' : v <= max * 0.1 ? ', a quiet month for fires.' : '.'}`;
  }
  if (has(q, 'next', 'coming', 'forecast', 'outlook', 'predict', 'future', 'season ahead')) {
    if (!f.outlook) return 'Open the **Outlook** tab once and I can tell you what the next months look like.';
    const key = f.outlook.filter((o) => !['Near normal', 'No clear signal'].includes(o.category));
    const lines = f.outlook.slice(0, 6).map((o) => `${o.month}: **${o.category}** (${o.pAbove}% chance above normal)`).join('; ');
    return `AI outlook for ${f.area}: ${lines}. ${key.length ? '' : 'No strong signal: expect a typical season. '}Backtested hit rate is about ${f.outlook[0].backtestHitRatePct ?? '–'}% (33% would be pure chance).${f.elNinoEffectPct != null ? ` In El Niño years this area's main fire months run ${f.elNinoEffectPct > 0 ? '+' : ''}${f.elNinoEffectPct}% vs other years, and the latest ENSO index is ${f.oniLatest}.` : ''}`;
  }
  if (has(q, 'changed', 'finding', 'insight', 'research', 'significant', 'discover', 'pattern', 'shift')) {
    if (!f.findings) return 'Open the **Research Lab** tab and I will scan this area for significant changes.';
    return f.findings.length ? `Statistically significant findings for ${f.area} (after false-discovery correction): ${f.findings.map((x) => `**${x}**`).join('; ')}.` : `No statistically significant change was found in ${f.area} after correcting for multiple tests: activity looks stable.`;
  }
  if (has(q, 'el nino', 'el niño', 'enso', 'la nina', 'la niña', 'ocean')) {
    return f.elNinoEffectPct == null ? 'There are not enough El Niño years with fires here to measure a reliable effect.' : `During El Niño years (ONI ≥ 0.5), fire activity in ${f.area}'s main fire months is **${f.elNinoEffectPct > 0 ? '+' : ''}${f.elNinoEffectPct}%** compared with other years. The latest ONI is **${f.oniLatest}**, ${f.oniLatest >= 1.5 ? 'a strong El Niño' : f.oniLatest >= 0.5 ? 'El Niño conditions' : f.oniLatest <= -0.5 ? 'La Niña conditions' : 'neutral'}.`;
  }
  if (has(q, 'weather', 'wind', 'humid', 'hot', 'rain', 'dry')) {
    if (!f.weather7d) return 'Open the **Outlook** tab to load the 7-day fire-weather forecast.';
    const w = f.weather7d;
    return `Fire weather for the next 7 days peaks on **${w.peakDay}** (Hot-Dry-Windy index ${w.peakHDW}, level ${w.maxLevel}). ${f.fireRiskThisWeek ? `Overall fire risk this week: **${f.fireRiskThisWeek}**.` : ''}`;
  }
  if (has(q, 'this week', 'now', 'today', 'current', 'live', 'right now', 'risk')) {
    const parts = [];
    if (f.fireRiskThisWeek) parts.push(`Overall fire risk this week: **${f.fireRiskThisWeek}**.`);
    if (f.liveLast7Days) parts.push(`Live satellites saw ${fmt(f.liveLast7Days.hotspots)} hotspots in the last 7 days: **${f.liveLast7Days.level}** for this month (${f.liveLast7Days.percentile}th percentile since 2001).`);
    return parts.length ? parts.join(' ') : 'Live data is still loading; ask again in a few seconds, or open the **Live warning** tab.';
  }
  if (has(q, 'prepare', 'should we', 'what should', 'advice', 'plan', 'crew', 'action', 'recommend')) {
    const cm = f.criticalMonths;
    const before = cm.length ? MON_FULL[(MON_FULL.indexOf(cm[0]) + 11) % 12] : null;
    return `For ${f.area}: the critical fire months are **${cm.join(', ') || '–'}** (${f.criticalShare}% of all burning). Plan crews, fire lines and awareness campaigns in **${before || 'the month before'}**, before the window opens. ${f.fireRiskThisWeek ? `Right now the weekly risk is **${f.fireRiskThisWeek}**.` : ''} ${f.trendSignificant && f.trendPctPerDecade > 0 ? `Activity is rising (+${f.trendPctPerDecade}% per decade), so budget for more than last decade's average.` : ''}`;
  }
  if (has(q, 'worst', 'highest', 'most', 'biggest', 'record')) return `The heaviest fire years in ${f.area} were ${f.worstYears.map((y) => `**${y.year}** (${fmt(y.fcd)})`).join(', ')}.`;
  if (has(q, 'least', 'lowest', 'quiet', 'best year')) return `The quietest years were ${f.quietestYears.map((y) => `${y.year} (${fmt(y.fcd)})`).join(', ')}.`;
  if (has(q, 'trend', 'increas', 'decreas', 'rising', 'getting worse', 'change')) return f.trendPctPerDecade == null ? 'Not enough years for a trend.' : `Fire activity is changing by **${f.trendPctPerDecade > 0 ? '+' : ''}${f.trendPctPerDecade}% per decade**, and that change is ${f.trendSignificant ? '**statistically significant**' : '**not statistically significant**'} (Mann–Kendall test).`;
  if (has(q, 'season', 'when', 'month', 'peak', 'critical', 'busiest')) return `Fire season in ${f.area} peaks in **${f.peakMonth}**. The critical months are **${f.criticalMonths.join(', ')}**, holding ${f.criticalShare}% of all burning.`;
  if (has(q, 'type', 'regime', 'kind', 'why', 'cause', 'crop', 'stubble', 'forest')) return f.fireRegime ? `The AI fire-regime model puts this area in **${f.fireRegime}**. Open the **Regimes** tab to see the map.` : 'Open the **Regimes** tab and I will classify this area\'s fire pattern.';
  if (has(q, 'accura', 'trust', 'valid', 'harmoni', 'modis', 'viirs', 'how does', 'method')) return `Agnikaal puts MODIS and VIIRS on one 1 km grid, then calibrates MODIS to VIIRS month by month for this exact area. Hiding one year at a time, the calibration explains **${Math.round(f.calibrationR2 * 100)}%** of the variation (R² ${f.calibrationR2}), while naively joining the sensors would be off by ${f.naiveSpliceBiasPct}%.`;
  return `I can answer questions about ${f.area}: try "When is the fire season?", "Is this week normal?", "What do the next months look like?", "What was 2016 like?", "Should we prepare crews?", or "Does El Niño matter here?"`;
}

export function agniSystemPrompt(f) {
  return 'You are Agni, the assistant inside Agnikaal, a NASA Space Apps fire-history app. Answer the user in at most 4 short sentences, in plain language for fire managers. ' +
    'Use ONLY the facts in the JSON below; if the answer is not in the facts, say you do not know. Never invent numbers. Units are fire cell-days (FCD).\nFACTS:\n' + JSON.stringify(f);
}
