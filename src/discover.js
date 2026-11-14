// Research Lab discovery tools: similar places (fingerprint search), fire-event finder, weather drivers (ERA5).
import { MONTHS } from './harmonize.js';
import { fingerprint } from './fingerprint.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const geoCache = new Map();
export async function placeName(lat, lon) {
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const p = fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&localityLanguage=en`)
    .then((r) => r.json()).then((d) => [d.locality || d.city, d.principalSubdivision, d.countryName].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ') || `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`)
    .catch(() => `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`);
  geoCache.set(key, p);
  return p;
}
function spark(p, color, w = 120, h = 34) {
  const max = Math.max(...p) || 1, bw = w / 12;
  return `<svg viewBox="0 0 ${w} ${h}" class="mini-spark" aria-hidden="true">${p.map((v, m) => `<rect x="${m * bw + 1}" y="${h - 2 - (v / max) * (h - 4)}" width="${bw - 2}" height="${(v / max) * (h - 4)}" rx="1.5" fill="${color}"/>`).join('')}</svg>`;
}
const W = [...new Array(12).fill(1), 1.4, 0.9, 0.6, 0.9]; // feature weights

// ------------------------------------------------------------------ 1. SIMILAR PLACES
let FP = null;
async function loadFP() {
  if (FP) return FP;
  const [meta, buf] = await Promise.all([fetch('/data/fingerprints.json').then((r) => r.json()), fetch('/data/fingerprints.bin').then((r) => r.arrayBuffer())]);
  FP = { ...meta, f: new Uint8Array(buf), n: meta.cells.length / 3 };
  return FP;
}
export function aoiFingerprint(S) {
  const mat = []; for (let y = 2001; y <= 2025; y++) mat.push(MONTHS.map((_, m) => S.h.H[(y - S.h.y0) * 12 + m]));
  return fingerprint(mat, Math.max(1, S.maskCount || S.region.nc), S.oni || {});
}
export async function similarPlaces(S, ctx, nPlaces = 6) {
  const fp = await loadFP(), q = aoiFingerprint(S), [bw, bs, be, bn] = ctx.aoiBBox();
  const scored = [];
  for (let i = 0; i < fp.n; i++) {
    const ri = fp.cells[3 * i], lat = fp.cells[3 * i + 1] * fp.res - 90 + fp.res / 2, lon = fp.cells[3 * i + 2] * fp.res - 180 + fp.res / 2;
    if (fp.regions[ri].id === S.regionId && lon >= bw - 0.5 && lon <= be + 0.5 && lat >= bs - 0.5 && lat <= bn + 0.5) continue; // skip the area itself
    let d = 0; for (let j = 0; j < 16; j++) { const x = fp.f[i * 16 + j] / 255 - q[j]; d += W[j] * x * x; }
    scored.push({ i, ri, lat, lon, d });
  }
  scored.sort((a, b) => a.d - b.d);
  const places = [];
  for (const s of scored.slice(0, 1500)) {
    if (places.some((p) => Math.hypot(p.lat - s.lat, (p.lon - s.lon) * Math.cos((s.lat * Math.PI) / 180)) < 3)) continue;
    const near = scored.slice(0, 1500).filter((t) => t.ri === s.ri && Math.abs(t.lat - s.lat) <= 1 && Math.abs(t.lon - s.lon) <= 1);
    places.push({ ...s, cells: near.length, sim: Math.max(0, 100 * Math.exp(-s.d / 0.3)), profile: Array.from(fp.f.slice(s.i * 16, s.i * 16 + 12)).map((x) => (x / 255) ** 2) });
    if (places.length >= nPlaces) break;
  }
  return { q, places, regions: fp.regions, searched: scored.length };
}
export async function renderSimilar(box, S, ctx) {
  box.innerHTML = '<div class="lab-loading"><div class="spinner"></div><span>Comparing this area\'s fire fingerprint with 32,000 places in 5 countries…</span></div>';
  try {
    const r = await similarPlaces(S, ctx);
    const qProf = r.q.slice(0, 12).map((x) => x * x);
    box.innerHTML = `<div class="sub">Each place has a 16-number <b>fire fingerprint</b> (season shape, activity level, trend, year-to-year variability, El Niño link). These are the closest matches to <b>${esc(S.aoi ? S.aoi.label : S.region.name)}</b> among ${r.searched.toLocaleString()} grid cells, so you can test whether a pattern found here also holds elsewhere.</div>
      <div class="cmp-head"><span>This area</span>${spark(qProf, '#ffb347')}</div>
      <div class="sim-list">${r.places.map((p, k) => `<div class="sim">
        <div class="sim-rank">${k + 1}</div>
        <div class="sim-txt"><b data-geo="${p.lat},${p.lon}">${p.lat.toFixed(1)}°, ${p.lon.toFixed(1)}°</b><span>${esc(r.regions[p.ri].name)} · ${p.cells} similar cells nearby</span></div>
        ${spark(p.profile, '#5ad1ff')}
        <div class="sim-score"><b>${Math.round(p.sim)}%</b><span>match</span></div>
        <button class="chip sim-open" data-k="${k}">Open →</button></div>`).join('')}</div>
      <p class="note">Similarity = weighted distance between fingerprints (exp(−d/0.3)). Orange = this area's typical season, blue = the match. Use matches as comparison sites or to check that a trend is not just local.</p>`;
    box.querySelectorAll('[data-geo]').forEach(async (el) => { const [la, lo] = el.dataset.geo.split(',').map(Number); el.textContent = await placeName(la, lo); });
    box.querySelectorAll('.sim-open').forEach((b) => b.addEventListener('click', async () => {
      const p = r.places[+b.dataset.k];
      ctx.openArea(r.regions[p.ri].id, { type: 'bbox', bbox: [p.lon - 0.75, p.lat - 0.75, p.lon + 0.75, p.lat + 0.75], label: `Similar place: ${await placeName(p.lat, p.lon)}` }, 'calendar');
    }));
  } catch (e) { box.innerHTML = `<p class="note">Similarity search unavailable (${esc(e.message)}).</p>`; }
}

// ------------------------------------------------------------------ 2. EVENT FINDER
let EV = null;
export async function renderEvents(box, S, ctx) {
  box.innerHTML = '<div class="lab-loading"><div class="spinner"></div><span>Loading the global event catalogue…</span></div>';
  try {
    EV ||= await fetch('/data/events.json').then((r) => r.json());
    const scope = S.evScope || 'region';
    const list = EV.events.filter((e) => scope === 'all' || e.region === S.regionId).slice(0, 15);
    box.innerHTML = `<div class="sub">The AI scanned <b>25 years × every grid cell</b> in 5 countries for months that were statistically extreme (robust z ≥ 3.5, at least 3× normal), then joined neighbouring cells into events and ranked them by excess fire activity. Many are famous disasters, and some were never widely reported: ready-made case studies.</div>
      <div class="seg ev-scope"><button class="mode ${scope === 'region' ? 'active' : ''}" data-s="region">${esc(S.region.name)}</button><button class="mode ${scope === 'all' ? 'active' : ''}" data-s="all">All 5 countries</button></div>
      <div class="ev-list">${list.map((e, k) => {
        const km2 = Math.round(e.cells * 27.8 * 27.8 * Math.cos((e.lat * Math.PI) / 180));
        return `<button class="ev" data-k="${k}"><span class="ev-rank">${k + 1}</span>
          <span class="ev-txt"><b>${MONTHS[e.month]} ${e.year} · <span data-geo="${e.lat},${e.lon}">${e.lat.toFixed(1)}°, ${e.lon.toFixed(1)}°</span></b>
          <span>${esc(e.regionName)} · ${e.cells} cell${e.cells === 1 ? "" : "s"} (~${km2.toLocaleString()} km²) · ${e.fcd.toLocaleString()} FCD, +${e.excess.toLocaleString()} above normal</span></span>
          <span class="ev-z">+${e.zmax}σ</span></button>`; }).join('') || '<p class="note">No extreme events in this region.</p>'}</div>
      <p class="note">${esc(EV.method)}. Click an event to open its area with the anomaly calendar.</p>`;
    box.querySelectorAll('.ev-scope .mode').forEach((b) => b.addEventListener('click', () => { S.evScope = b.dataset.s; renderEvents(box, S, ctx); }));
    box.querySelectorAll('[data-geo]').forEach(async (el) => { const [la, lo] = el.dataset.geo.split(',').map(Number); el.textContent = await placeName(la, lo); });
    box.querySelectorAll('.ev').forEach((b) => b.addEventListener('click', async () => {
      const e = list[+b.dataset.k];
      ctx.openArea(e.region, { type: 'bbox', bbox: e.bbox, label: `${MONTHS[e.month]} ${e.year} event · ${await placeName(e.lat, e.lon)}` }, 'calendar', 'anom');
    }));
  } catch (e) { box.innerHTML = `<p class="note">Event catalogue unavailable (${esc(e.message)}).</p>`; }
}

// ------------------------------------------------------------------ 3. WEATHER DRIVERS (ERA5)
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-9; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r[n] / (r[i] || 1e-9)); }
function ridge(X, y, lam) { const p = X[0].length, A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0); X.forEach((x, i) => { for (let j = 0; j < p; j++) { b[j] += x[j] * y[i]; for (let k = 0; k < p; k++) A[j][k] += x[j] * x[k]; } }); for (let j = 1; j < p; j++) A[j][j] += lam; return solve(A, b); }
const zs = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length, sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) || 1; return a.map((v) => (v - m) / sd); };
const wxCache = new Map();
export async function weatherDrivers(S, ctx) {
  const [w, s, e, n] = ctx.aoiBBox(), lat = (s + n) / 2, lon = (w + e) / 2, key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (!wxCache.has(key)) wxCache.set(key, fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start_date=2001-01-01&end_date=2025-12-31&daily=temperature_2m_max,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean&timezone=GMT`).then((r) => { if (!r.ok) throw new Error('ERA5 archive unavailable'); return r.json(); }));
  const d = (await wxCache.get(key)).daily;
  // monthly aggregates [year][month]
  const agg = {}; d.time.forEach((t, i) => { const y = +t.slice(0, 4), m = +t.slice(5, 7) - 1, k = `${y}-${m}`; const a = (agg[k] ||= { P: 0, T: 0, RH: 0, Wd: 0, n: 0 }); a.P += d.precipitation_sum[i] ?? 0; a.T += d.temperature_2m_max[i] ?? 0; a.RH += d.relative_humidity_2m_mean[i] ?? 0; a.Wd += d.wind_speed_10m_max[i] ?? 0; a.n++; });
  const crit = S.season && S.season.critical.length ? S.season.critical : [S.season ? S.season.peak : 0];
  const first = crit[0], pre = [1, 2, 3].map((k) => (first - k + 12) % 12);
  const years = [], X = [], y = [], raw = [];
  for (let yr = 2002; yr <= 2025; yr++) {
    const get = (m, f) => { const yy = m > first && pre.includes(m) ? yr - 1 : yr; const a = agg[`${yy}-${m}`]; return a ? (f === 'P' ? a.P : a[f] / a.n) : null; };
    const preRain = pre.reduce((s2, m) => s2 + (get(m, 'P') ?? 0), 0);
    const inRain = crit.reduce((s2, m) => s2 + (get(m, 'P') ?? 0), 0);
    const T = crit.reduce((s2, m) => s2 + (get(m, 'T') ?? 0), 0) / crit.length;
    const RH = crit.reduce((s2, m) => s2 + (get(m, 'RH') ?? 0), 0) / crit.length;
    const Wd = crit.reduce((s2, m) => s2 + (get(m, 'Wd') ?? 0), 0) / crit.length;
    const on = crit.reduce((s2, m) => s2 + (S.oni?.[`${yr}-${String(m + 1).padStart(2, '0')}`] ?? 0), 0) / crit.length;
    const fire = crit.reduce((s2, m) => s2 + S.h.H[(yr - S.h.y0) * 12 + m], 0);
    years.push(yr); raw.push({ preRain, inRain, T, RH, Wd, on, fire }); y.push(Math.log1p(fire));
  }
  const names = [['preRain', 'Pre-season rainfall', 'mm'], ['inRain', 'In-season rainfall', 'mm'], ['T', 'Daily max temperature', '°C'], ['RH', 'Humidity', '%'], ['Wd', 'Wind', 'km/h'], ['on', 'El Niño (ONI)', '']];
  const Z = names.map(([k]) => zs(raw.map((r) => r[k])));
  years.forEach((_, i) => X.push([1, ...Z.map((z) => z[i])]));
  const ym = y.reduce((a, b) => a + b, 0) / y.length, yc = y.map((v) => v - ym);
  const beta = ridge(X, yc, 3);
  // leave-one-year-out skill
  let ss = 0, sr = 0;
  years.forEach((_, i) => { const tr = X.filter((_, j) => j !== i), ty = yc.filter((_, j) => j !== i); const b = ridge(tr, ty, 3); const p = X[i].reduce((a, v, j) => a + v * b[j], 0); sr += (yc[i] - p) ** 2; ss += yc[i] ** 2; });
  const r2 = Math.max(0, 1 - sr / ss);
  const imp = names.map(([k, label, unit], j) => ({ k, label, unit, coef: beta[j + 1] }));
  const totImp = imp.reduce((a, v) => a + Math.abs(v.coef), 0) || 1;
  imp.forEach((v) => { v.share = Math.abs(v.coef) / totImp; });
  const explain = (yr) => { const i = years.indexOf(yr); return imp.map((v, j) => ({ ...v, z: Z[j][i], value: raw[i][v.k], effect: Math.expm1(v.coef * Z[j][i]) })).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)); };
  const worst = years[y.indexOf(Math.max(...y))];
  return { r2, imp, years, explain, worst, crit, lat, lon, fire: raw.map((r) => r.fire) };
}
export async function renderDrivers(box, S, ctx) {
  box.innerHTML = '<div class="lab-loading"><div class="spinner"></div><span>Downloading 25 years of ERA5 weather for this area (Open-Meteo)…</span></div>';
  try {
    const D = await weatherDrivers(S, ctx);
    const yr = S.drvYear && D.years.includes(S.drvYear) ? S.drvYear : D.worst;
    const ex = D.explain(yr);
    const human = D.r2 < 0.15;
    const top = [...D.imp].sort((a, b) => b.share - a.share);
    box.innerHTML = `<div class="sub">An AI regression links each year's fire activity in the critical months (${D.crit.map((m) => MONTHS[m]).join(', ')}) to the weather that season: ERA5 reanalysis at the area centre (${D.lat.toFixed(2)}°, ${D.lon.toFixed(2)}°) plus El Niño, for 2002–2025, cross-validated year by year.</div>
      <div class="metrics">
        <div class="metric"><b class="${human ? 'badv' : 'good'}">${Math.round(D.r2 * 100)}%</b><span>of year-to-year fire variation explained by weather (cross-validated R²)</span></div>
        <div class="metric"><b>${esc(top[0].label)}</b><span>strongest driver (${Math.round(top[0].share * 100)}% of model weight)</span></div>
      </div>
      <p class="brief">${human ? `<b>Weather explains little here.</b> Year-to-year changes are most likely <b>human-driven</b> (crop calendars, land clearing, policy), which is itself a key research finding.` : `Weather and climate explain a large share of fire years here; <b>${esc(top[0].label.toLowerCase())}</b> matters most.`}</p>
      <h5 class="ai-h">Driver importance</h5>
      <div class="drv-bars">${top.map((v) => `<div class="drv"><span>${esc(v.label)}</span><div class="drv-bar"><i style="width:${Math.round(v.share * 100)}%;background:${v.coef > 0 ? 'var(--fire)' : 'var(--viirs)'}"></i></div><em>${v.coef > 0 ? 'more → more fire' : 'more → less fire'}</em></div>`).join('')}</div>
      <h5 class="ai-h">What drove <select id="drvYear" class="drv-year">${D.years.map((y) => `<option ${y === yr ? 'selected' : ''}>${y}</option>`).join('')}</select>?</h5>
      <div class="drv-bars">${ex.map((v) => `<div class="drv"><span>${esc(v.label)} <small>${v.unit ? `${Math.round(v.value)} ${v.unit}` : v.value.toFixed(2)}, ${v.z >= 0 ? '+' : ''}${v.z.toFixed(1)}σ</small></span><div class="drv-bar two"><i style="${v.effect >= 0 ? 'left:50%' : `right:50%`};width:${Math.min(50, Math.abs(v.effect) * 60)}%;background:${v.effect >= 0 ? 'var(--fire)' : 'var(--viirs)'}"></i></div><em>${v.effect >= 0 ? '+' : ''}${Math.round(v.effect * 100)}% fire</em></div>`).join('')}</div>
      <p class="note">Ridge regression on log fire activity with standardised predictors (λ = 3); pre-season = the 3 months before ${MON_FULL[D.crit[0]]}. Effects are partial contributions for the chosen year relative to an average year. Associations, not proof of causation.</p>`;
    box.querySelector('#drvYear').addEventListener('change', (e) => { S.drvYear = +e.target.value; renderDrivers(box, S, ctx); });
  } catch (e) { box.innerHTML = `<p class="note">Weather-driver analysis unavailable right now (${esc(e.message)}).</p>`; }
}
