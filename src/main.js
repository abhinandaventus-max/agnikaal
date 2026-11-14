import './styles.css';
import * as d3 from 'd3';
import {
  MONTHS, decodeRegion, cellMask, harmonize, calendar, climatology, season, trend,
  warningLevel, monthlyRows, toCSV, percentileRank, anomaly,
} from './harmonize.js';
import {
  drawCalendar, drawSeasonClock, drawTrend, drawSeries, drawScatter, drawK, drawGauge, drawDaily, PALETTES, nice,
} from './charts.js';
import { createMap } from './map.js';
import { CASES } from './presets.js';
import { startGlobe } from './globe.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const GITHUB_URL = import.meta.env.VITE_GITHUB_URL || 'https://github.com/';

// ------------------------------------------------------------------ chrome
function initChrome() {
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const burger = $('#burger'), links = $('#navLinks');
  burger.addEventListener('click', () => { const o = links.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
  links.addEventListener('click', () => { links.classList.remove('open'); burger.setAttribute('aria-expanded', false); });
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(el); });
  $('#ghLink').href = GITHUB_URL;
}

function animateCount(el, to, decimals = 0) {
  const from = 0, t0 = performance.now(), dur = 1800;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = (from + (to - from) * e).toFixed(decimals);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function initCounters() {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const to = +e.target.dataset.to; animateCount(e.target, to, to < 10 && to % 1 ? 1 : 0); io.unobserve(e.target);
  }), { threshold: 0.6 });
  $$('.count').forEach((c) => io.observe(c));
}

function initTimeline() {
  const el = $('#timeline');
  const y0 = 2000, y1 = 2027;
  const pos = (y) => ((y - y0) / (y1 - y0)) * 100;
  const sats = [
    ['Terra', 'MODIS · 1 km', 2000.15, 2026.9, 'modis fade', 'orbit drift since 2020'],
    ['Aqua', 'MODIS · 1 km', 2002.4, 2026.9, 'modis fade', 'end of life approaching'],
    ['S-NPP', 'VIIRS · 375 m', 2012.0, 2026.0, 'viirs fade', 'reference VIIRS 2012 →'],
    ['NOAA-20', 'VIIRS · 375 m', 2018.1, 2026.9, 'viirs', 'live bridge'],
    ['NOAA-21', 'VIIRS · 375 m', 2023.9, 2026.9, 'viirs', ''],
  ];
  el.innerHTML = sats.map(([n, s, a, b, cls, note], i) => `
    <div class="tl-row"><div class="tl-name"><b>${n}</b>${s}</div>
      <div class="tl-track"><div class="tl-bar ${cls}" style="left:${pos(a)}%;width:${pos(b) - pos(a)}%;transition-delay:${i * 180}ms">${note}</div></div></div>`).join('') +
    `<div class="tl-axis"><div></div><div>${[2000, 2005, 2010, 2015, 2020, 2025].map((y) => `<span style="left:${pos(y)}%">${y}</span>`).join('')}</div></div>`;
  const track = el.querySelector('.tl-row .tl-track').getBoundingClientRect;
  const seam = document.createElement('div');
  seam.className = 'tl-seam'; seam.dataset.label = '2012 · the seam';
  el.appendChild(seam);
  const place = () => {
    const tr = el.querySelector('.tl-track').getBoundingClientRect(), base = el.getBoundingClientRect();
    seam.style.left = `${tr.left - base.left + (tr.width * pos(2012)) / 100}px`;
  };
  place(); window.addEventListener('resize', place);
  new IntersectionObserver(([e]) => e.isIntersecting && el.classList.add('in'), { threshold: 0.3 }).observe(el);
  void track;
}

// Animated pixel-size explainer
function initPixelDemo() {
  const cM = $('#pdModis'), cV = $('#pdViirs'), cH = $('#pdHarm');
  const S = 300, km = 6; // canvas = 6 km x 6 km
  let t = 0, visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe($('#pixelDemo'));
  const blob = (x, y, r) => { // irregular fire front in km
    const cx = 3, cy = 3; const a = Math.atan2(y - cy, x - cx);
    const rr = r * (1 + 0.28 * Math.sin(3 * a + t * 0.02) + 0.15 * Math.cos(5 * a));
    return Math.hypot(x - cx, (y - cy) * 1.3) < rr;
  };
  const drawGrid = (cv, cell, color, count) => {
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, S, S);
    const n = Math.round(km / cell), px = S / n;
    const r = 0.5 + 1.0 * (0.5 + 0.5 * Math.sin(t * 0.012));
    let c = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      // detection if any of 3x3 subsamples burn (sensitivity)
      let hit = false;
      for (let a = 0.2; a < 1 && !hit; a += 0.3) for (let b = 0.2; b < 1 && !hit; b += 0.3) hit = blob((i + a) * cell, (j + b) * cell, r);
      if (hit) { c++; ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.fillRect(i * px + 1, j * px + 1, px - 2, px - 2); }
      ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.strokeRect(i * px + 0.5, j * px + 0.5, px - 1, px - 1);
    }
    // fire front outline
    ctx.strokeStyle = 'rgba(255,209,102,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let k = 0; k <= 120; k++) {
      const a = (k / 120) * 2 * Math.PI;
      const rr = r * (1 + 0.28 * Math.sin(3 * a + t * 0.02) + 0.15 * Math.cos(5 * a));
      const x = 3 + Math.cos(a) * rr, y = 3 + (Math.sin(a) * rr) / 1.3;
      k ? ctx.lineTo((x / km) * S, (y / km) * S) : ctx.moveTo((x / km) * S, (y / km) * S);
    }
    ctx.stroke();
    count.textContent = c;
    return c;
  };
  const loop = () => {
    requestAnimationFrame(loop);
    if (!visible) return;
    t += 1;
    const m = drawGrid(cM, 1, '#a98bff', $('#pdM'));
    drawGrid(cV, 0.375, '#5ad1ff', $('#pdV'));
    const h = drawGrid(cH, 1, '#ff8a3d', $('#pdH'));
    void m; void h;
  };
  loop();
}

// ------------------------------------------------------------------ state
const S = {
  index: [], regionId: 'india', region: null, aoi: null, mask: null, maskCount: 0,
  yA: 2001, yB: 2025, mode: 'count', palette: 'inferno', raw: false, tab: 'calendar',
  h: null, rows: null, clim: null, season: null, trend: null,
  live: null, liveFor: null, selYear: null, byMonth: null,
};
let M; // map api
const cache = new Map();

async function loadRegion(id) {
  if (cache.has(id)) return cache.get(id);
  const [meta, buf] = await Promise.all([
    fetch(`/data/${id}.json`).then((r) => r.json()),
    fetch(`/data/${id}.bin`).then((r) => r.arrayBuffer()),
  ]);
  const reg = decodeRegion(meta, buf);
  // per-month cell lists for the time-lapse
  const byMonth = Array.from({ length: reg.nm }, () => ({ M: [], V: [] }));
  for (const key of ['M', 'V']) {
    const { k, v } = reg.series[`${key}_fcd`];
    for (let i = 0; i < k.length; i++) byMonth[k[i] & 511][key].push(k[i] >>> 9, v[i]);
  }
  reg.byMonth = byMonth;
  cache.set(id, reg);
  return reg;
}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }

// ------------------------------------------------------------------ hash state
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('r')) S.regionId = p.get('r');
  if (p.get('y')) { const [a, b] = p.get('y').split('-').map(Number); if (a && b) { S.yA = a; S.yB = b; } }
  if (p.get('m')) S.mode = p.get('m');
  if (p.get('pal')) S.palette = p.get('pal');
  if (p.get('t')) S.tab = p.get('t');
  S.raw = p.get('raw') === '1';
  const a = p.get('aoi');
  if (a) {
    const [kind, rest] = a.split(':');
    if (kind === 'b') S.aoi = { type: 'bbox', bbox: rest.split(',').map(Number), label: 'Shared box' };
    if (kind === 'p') S.aoi = { type: 'polygon', coords: rest.split(';').map((s) => s.split(',').map(Number)), label: 'Shared polygon' };
    if (kind === 'c') { const [lat, lon, km] = rest.split(',').map(Number); S.aoi = circleAoi(lat, lon, km); }
  }
}
function writeHash() {
  const p = new URLSearchParams();
  p.set('r', S.regionId); p.set('y', `${S.yA}-${S.yB}`); p.set('m', S.mode); p.set('pal', S.palette); p.set('t', S.tab);
  if (S.raw) p.set('raw', '1');
  if (S.aoi) {
    if (S.aoi.circle) p.set('aoi', `c:${S.aoi.circle.lat.toFixed(3)},${S.aoi.circle.lon.toFixed(3)},${S.aoi.circle.km}`);
    else if (S.aoi.type === 'bbox') p.set('aoi', 'b:' + S.aoi.bbox.map((v) => v.toFixed(3)).join(','));
    else p.set('aoi', 'p:' + S.aoi.coords.map((c) => c.map((v) => v.toFixed(3)).join(',')).join(';'));
  }
  history.replaceState(null, '', '#' + p.toString());
}

function circleAoi(lat, lon, km) {
  const coords = d3.range(36).map((i) => {
    const a = (i / 36) * 2 * Math.PI;
    return [lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)];
  });
  return { type: 'polygon', coords, circle: { lat, lon, km }, label: `${lat.toFixed(2)}°, ${lon.toFixed(2)}° · r ${km} km` };
}

// ------------------------------------------------------------------ compute + render
function recompute() {
  const R = S.region; if (!R) return;
  const { mask, count } = cellMask(R, S.aoi);
  S.mask = S.aoi ? mask : null; S.maskCount = count;
  S.h = harmonize(R, S.mask);
  S.rows = calendar(S.h, S.yA, S.yB);
  S.clim = climatology(S.h, 2001, 2025);
  S.season = season(S.clim);
  S.trend = trend(S.rows);
  $('#hudAoi').textContent = `${S.aoi ? S.aoi.label : R.name + ' · whole region'} · ${count.toLocaleString()} cells`;
  updateMapCells();
  renderKPIs();
  renderTab();
  writeHash();
}

function updateMapCells(monthIdx) {
  const R = S.region, h = S.h; if (!R || !h) return;
  const vals = new Float32Array(R.nc);
  const k = h.cal.k;
  if (monthIdx == null) {
    const i0 = (S.yA - R.y0) * 12, i1 = (S.yB - R.y0) * 12 + 11;
    for (let mi = i0; mi <= i1; mi++) addMonth(vals, R.byMonth[mi], mi, k, 1);
    const yrs = S.yB - S.yA + 1;
    for (let i = 0; i < R.nc; i++) vals[i] /= yrs;
    const max = d3.quantile(Array.from(vals).filter((v) => v > 0).sort(d3.ascending), 0.995) || 1;
    M.cells.setData(R, vals, max, S.mask);
    renderLegend(max, 'mean annual fire cell-days (VIIRS-eq.) per 0.25° cell');
  }
  return vals;
}
function addMonth(vals, bucket, mi, k, w) {
  const year = 2000 + Math.floor(mi / 12), m = mi % 12;
  if (year >= 2012) { const a = bucket.V; for (let j = 0; j < a.length; j += 2) vals[a[j]] += a[j + 1] * w; }
  else { const a = bucket.M; for (let j = 0; j < a.length; j += 2) vals[a[j]] += a[j + 1] * k[m] * w; }
}
function renderLegend(max, label) {
  const pal = PALETTES[S.palette];
  const stops = d3.range(0, 1.01, 0.1).map((t) => pal(t)).join(',');
  $('#mapLegend').innerHTML = `<span>0</span><div class="ramp" style="background:linear-gradient(90deg,${stops})"></div><span>${nice(max)}</span><span style="width:100%">${label}</span>`;
}

function renderKPIs() {
  const h = S.h, rows = S.rows, se = S.season, tr = S.trend, v = h.validation;
  const mean = d3.mean(rows, (r) => r.total) || 0;
  const worst = rows.reduce((a, b) => (b.total > a.total ? b : a), rows[0]);
  const win = critLabel(se);
  const live = S.live && S.liveFor === aoiKey() ? S.live.warn : null;
  const items = [
    ['Mean / year', nice(mean), 'fire cell-days, VIIRS-eq.'],
    ['Critical months', win, se ? `${Math.round(se.criticalShare * 100)}% of activity · peak ${MONTHS[se.peak]}` : 'no fire signal'],
    ['Worst year', worst ? worst.year : '–', worst ? nice(worst.total) + ' FCD' : ''],
    ['Trend', tr ? `${tr.pctPerDecade > 0 ? '+' : ''}${tr.pctPerDecade.toFixed(0)}%/dec` : '–', tr ? (tr.p < 0.05 ? `significant (p=${tr.p.toFixed(3)})` : `not significant (p=${tr.p.toFixed(2)})`) : ''],
    ['Calibration skill', `R² ${v.r2.toFixed(2)}`, `LOYO-CV · naive bias ${v.naiveBias.toFixed(0)}%`],
    ['Live 7-day', live ? `<span class="lvl-${live.code}">${live.level}</span>` : '<span class="muted">…</span>', live ? `${live.pr.toFixed(0)}th pct for ${MONTHS[new Date().getMonth()]}` : 'fetching NOAA-20/21'],
  ];
  $('#kpis').innerHTML = items.map(([l, val, s]) => `<div class="kpi"><div class="k-l">${l}</div><div class="k-v">${val}</div><div class="k-s">${s}</div></div>`).join('');
}

function renderTab() {
  const el = $('#panel');
  $$('.tab').forEach((t) => { const a = t.dataset.tab === S.tab; t.classList.toggle('active', a); t.setAttribute('aria-selected', a); });
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  const h = S.h;
  if (S.tab === 'calendar') {
    el.innerHTML = `<h4>Burning activity calendar · ${S.yA}–${S.yB}</h4><div class="sub">${S.raw ? '<b class="c-fire">Raw splice view:</b> uncorrected detection counts. See the jump at 2012 when VIIRS starts.' : 'Harmonized monthly fire cell-days (VIIRS-equivalent). Hover a cell; purple outline = MODIS-derived.'}</div><div id="cal"></div>`;
    drawCalendar($('#cal'), { rows: S.rows, clim: S.clim, mode: S.mode, palette: S.palette, raw: S.raw, h, onHover: (y) => { S.selYear = y; } });
  } else if (S.tab === 'season') {
    const se = S.season;
    el.innerHTML = `<h4>Fire season fingerprint</h4><div class="sub">Bars = median month (2001–2025), shadow = P90, orange ticks = critical months (fewest months holding ≥80% of activity). Needle = timing & concentration. Dashed = selected year.</div>
      <div class="two"><div id="clock"></div><div><label class="mini" style="padding:0">Compare year <select id="yrSel">${S.rows.map((r) => `<option ${r.year === (S.selYear || S.yB) ? 'selected' : ''}>${r.year}</option>`).join('')}</select></label>
      <div class="metrics">
        <div class="metric"><b>${se ? MONTHS[se.peak] : '–'}</b><span>peak month</span></div>
        <div class="metric"><b>${se ? (se.concentration * 100).toFixed(0) + '%' : '–'}</b><span>seasonality (0 = year-round)</span></div>
        <div class="metric"><b>${critLabel(se)}</b><span>critical months</span></div>
        <div class="metric"><b>${se ? (se.criticalShare * 100).toFixed(0) + '%' : '–'}</b><span>of fires in ${se ? se.critical.length : 0} month(s)</span></div>
      </div><div id="monthTable"></div></div></div>`;
    const draw = () => drawSeasonClock($('#clock'), { clim: S.clim, season: se, h, year: +$('#yrSel').value, palette: S.palette });
    $('#yrSel').onchange = draw; draw();
    $('#monthTable').innerHTML = `<div class="sub">Months ranked by median activity: ${S.clim.map((c, m) => [m, c.med]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, v]) => `<b>${MONTHS[m]}</b> ${nice(v)}`).join(' · ')}</div>`;
  } else if (S.tab === 'trend') {
    const tr = S.trend;
    const top = [...S.rows].sort((a, b) => b.total - a.total).slice(0, 5);
    el.innerHTML = `<h4>Year-over-year burning</h4><div class="sub">Annual harmonized totals (purple = MODIS-derived with ±1σ calibration range, blue = VIIRS). Dashed gold = Theil–Sen trend. ${S.raw ? 'Orange line = naive raw splice.' : ''}</div><div id="trend"></div>
      <div class="metrics">
        <div class="metric"><b>${tr ? (tr.slope >= 0 ? '+' : '') + nice(tr.slope) : '–'}</b><span>FCD per year (Sen slope)</span></div>
        <div class="metric"><b>${tr ? tr.z.toFixed(2) : '–'}</b><span>Mann–Kendall Z</span></div>
        <div class="metric"><b class="${tr && tr.p < 0.05 ? 'good' : ''}">${tr ? tr.p.toFixed(3) : '–'}</b><span>p-value</span></div>
        <div class="metric"><b>${top.map((r) => r.year).slice(0, 3).join(', ')}</b><span>top fire years</span></div>
      </div>`;
    drawTrend($('#trend'), { rows: S.rows, h, tr, showRaw: S.raw });
  } else if (S.tab === 'harm') {
    const v = h.validation, c = h.cal;
    el.innerHTML = `<h4>Harmonization, under the hood</h4><div class="sub">Monthly series for this exact area: <span class="c-modis">raw MODIS</span>, <span class="c-viirs">raw VIIRS</span> (dotted) and <span class="c-fire">Agnikaal harmonized</span> with the calibration band (log scale).</div>
      <div id="series"></div>
      <div class="metrics">
        <div class="metric"><b class="good">${v.r2.toFixed(2)}</b><span>LOYO-CV R² (VIIRS predicted from MODIS)</span></div>
        <div class="metric"><b>${v.mape.toFixed(0)}%</b><span>monthly MAPE (months ≥5 FCD)</span></div>
        <div class="metric"><b class="good">${v.bias >= 0 ? '+' : ''}${v.bias.toFixed(1)}%</b><span>harmonized total bias</span></div>
        <div class="metric"><b class="badv">${v.naiveBias >= 0 ? '+' : ''}${v.naiveBias.toFixed(0)}%</b><span>naive raw-splice bias</span></div>
      </div>
      <div class="two"><div><div class="sub">Overlap months 2012–2025 (each dot = one month). Gold = fitted k̄, dashed = 1:1.</div><div id="scatter"></div></div>
      <div><div class="sub">Month-specific factors k̂ₘ ± σ (empirical-Bayes shrunk, λ = 25).</div><div id="kchart"></div></div></div>
      <p class="note">Overlap sample: ${nice(c.overlapMODIS)} MODIS vs ${nice(c.overlapVIIRS)} VIIRS fire cell-days across ${v.n} area-months. Factors are recomputed for every area you draw.</p>`;
    drawSeries($('#series'), { h, yA: S.yA, yB: S.yB });
    drawScatter($('#scatter'), { pairs: v.pairs.filter((p) => p[0] + p[1] > 0), kAll: c.kAll });
    drawK($('#kchart'), { cal: c });
  } else if (S.tab === 'live') {
    renderLive(el);
  } else if (S.tab === 'brief') {
    el.innerHTML = briefing();
  }
}

// "Mar–May" when contiguous, else "Apr–May · Oct–Nov"
function critLabel(se) {
  if (!se || !se.critical || !se.critical.length) return '–';
  const c = se.critical, runs = [];
  let start = c[0], prev = c[0];
  for (let i = 1; i <= c.length; i++) {
    if (i < c.length && c[i] === prev + 1) { prev = c[i]; continue; }
    runs.push([start, prev]); if (i < c.length) { start = prev = c[i]; }
  }
  if (runs.length > 1 && runs[0][0] === 0 && runs.at(-1)[1] === 11) { const f = runs.shift(); runs.at(-1)[1] = f[1]; }
  return runs.map(([a, b]) => (a === b ? MONTHS[a] : `${MONTHS[a]}–${MONTHS[b]}`)).join(' · ');
}

function aoiKey() { return S.regionId + '|' + JSON.stringify(S.aoi && (S.aoi.bbox || S.aoi.coords)); }
function aoiBBox() {
  if (!S.aoi) return S.region.bbox;
  if (S.aoi.type === 'bbox') return S.aoi.bbox;
  const xs = S.aoi.coords.map((c) => c[0]), ys = S.aoi.coords.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const inflight = new Map();
function fetchLive() {
  const key = aoiKey();
  if (S.liveFor === key && S.live) return Promise.resolve(S.live);
  if (!inflight.has(key)) inflight.set(key, fetchLiveInner(key).finally(() => inflight.delete(key)));
  return inflight.get(key);
}
async function fetchLiveInner(key) {
  const bb = aoiBBox();
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
  let r;
  try { r = await fetch(`/api/nrt?bbox=${bb.map((v) => v.toFixed(3)).join(',')}`, { signal: ctl.signal }); }
  catch { throw new Error('NASA FIRMS took too long to respond'); }
  finally { clearTimeout(to); }
  if (!r.ok) throw new Error('live feed unavailable');
  const data = await r.json();
  if (aoiKey() !== key) throw new Error('area changed');
  const R = S.region, res = R.res;
  // keep only hotspots that fall inside the AOI (or the region's cells)
  const cellIdx = new Map();
  for (let i = 0; i < R.nc; i++) cellIdx.set(R.cells[2 * i] * 100000 + R.cells[2 * i + 1], i);
  const inAoi = (h) => {
    const ci = cellIdx.get(Math.floor((h.lat + 90) / res) * 100000 + Math.floor((h.lon + 180) / res));
    if (!S.aoi) return ci != null;
    if (S.aoi.type === 'bbox') { const [w, s, e, n] = S.aoi.bbox; return h.lon >= w && h.lon <= e && h.lat >= s && h.lat <= n; }
    return pointIn(h.lon, h.lat, S.aoi.coords);
  };
  const hs0 = (data.hotspots || []).filter(inAoi).filter((h) => h.conf !== 'l');
  // NRT has no "type" flag, so drop persistent static heat sources (industry, flares):
  // a ~1 km cell that is hot on >= 4 of the 7 days behaves like a factory, not a vegetation fire.
  const fineKey = (h) => `${Math.floor((h.lat + 90) / 0.01)}|${Math.floor((h.lon + 180) / 0.01)}`;
  const daysPerCell = new Map();
  for (const h of hs0) { const k = fineKey(h); if (!daysPerCell.has(k)) daysPerCell.set(k, new Set()); daysPerCell.get(k).add(h.date); }
  const staticCells = new Set([...daysPerCell].filter(([, d]) => d.size >= 4).map(([k]) => k));
  const hs = hs0.filter((h) => !staticCells.has(fineKey(h)));
  const seen = new Set(), perDay = new Map();
  for (const h of hs) {
    const k = `${Math.floor((h.lat + 90) / 0.01)}|${Math.floor((h.lon + 180) / 0.01)}|${h.date}`;
    if (!perDay.has(h.date)) perDay.set(h.date, 0);
    if (!seen.has(k)) { seen.add(k); perDay.set(h.date, perDay.get(h.date) + 1); }
  }
  const days = [...perDay.entries()].sort().map(([date, n]) => ({ date, n }));
  // NOAA-20 -> S-NPP bridge (region level, overlap months where both exist)
  let sn = 0, j1 = 0;
  for (let i = 0; i < R.nm; i++) if (R.snpp.fcd[i] > 0 && R.noaa20.fcd[i] > 0) { sn += R.snpp.fcd[i]; j1 += R.noaa20.fcd[i]; }
  const bridge = j1 > 0 ? sn / j1 : 1;
  const ndays = Math.max(1, Math.min(7, days.length || 7));
  const fcd = seen.size;
  const pace = (fcd * bridge) / Math.max(1, days.length);
  const warn = warningLevel(pace, S.clim, new Date().getMonth(), new Date().getFullYear());
  const warn10 = warningLevel(pace, climatology(S.h, 2016, 2025), new Date().getMonth(), new Date().getFullYear());
  S.live = { ...data, hs, days, fcd, bridge, pace, warn, warn10, ndays, staticRemoved: hs0.length - hs.length, staticCells: staticCells.size };
  S.liveFor = key;
  return S.live;
}
function pointIn(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }

async function renderLive(el) {
  el.innerHTML = `<h4>Live early warning · last 7 days</h4><div class="sub">Fetching VIIRS NOAA-20/21 near-real-time hotspots from NASA FIRMS…</div><div class="spinner"></div>`;
  try {
    const L = await fetchLive();
    if (S.tab !== 'live') return;
    const mo = new Date().getMonth();
    el.innerHTML = `<h4>Live early warning · last 7 days</h4>
      <div class="sub">${L.satellite || 'VIIRS'} hotspots (FIRMS ${L.area}), de-duplicated to fire cell-days, bridged to the S-NPP scale (×${L.bridge.toFixed(2)}) and compared with the harmonized ${MONTHS[mo]} record 2001–2025.</div>
      <div class="gauge-wrap"><div id="gauge"></div><div>
        <div class="metrics">
          <div class="metric"><b>${L.hs.length.toLocaleString()}</b><span>vegetation-fire hotspots (${L.staticRemoved.toLocaleString()} static-source removed)</span></div>
          <div class="metric"><b>${L.fcd.toLocaleString()}</b><span>fire cell-days (7 d)</span></div>
          <div class="metric"><b>${nice(L.warn.est)}</b><span>${MONTHS[mo]} pace, projected</span></div>
          <div class="metric"><b>${nice(L.warn.median)}</b><span>${MONTHS[mo]} historical median</span></div>
        </div>
        <p class="brief">This week is running at the <b>${L.warn.pr.toFixed(0)}th percentile</b> of ${MONTHS[mo]} activity since 2001 (robust anomaly ${L.warn.z >= 0 ? '+' : ''}${L.warn.z.toFixed(1)}σ): <b class="lvl-${L.warn.code}">${L.warn.level}</b>. Against the recent decade (2016–2025) alone it ranks at the <b>${L.warn10.pr.toFixed(0)}th percentile</b>: <b class="lvl-${L.warn10.code}">${L.warn10.level}</b>.</p>
      </div></div>
      <div class="sub">Daily fire cell-days</div><div id="daily"></div>
      <p class="note">Toggle “● Live 7 d” on the map to plot every hotspot. Projection assumes the 7-day pace holds for the month: a screening signal, not a forecast.</p>`;
    drawGauge($('#gauge'), L.warn);
    drawDaily($('#daily'), { days: L.days });
    renderKPIs();
  } catch (e) {
    el.innerHTML = `<h4>Live early warning</h4><p class="sub">Live feed unavailable right now (${e.message}). The historical calendar still works offline.</p>`;
  }
}

function briefing() {
  const h = S.h, rows = S.rows, se = S.season, tr = S.trend, clim = S.clim, v = h.validation;
  const name = S.aoi ? S.aoi.label : S.region.name;
  const mean = d3.mean(rows, (r) => r.total) || 0;
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const last = rows.at(-1);
  const lastPr = percentileRank(last.total, rows.map((r) => r.total).sort(d3.ascending));
  const anomalies = [];
  rows.forEach((r) => r.vals.forEach((val, m) => { const z = anomaly(val, clim[m]); if (z != null && z >= 3 && val > 20) anomalies.push({ y: r.year, m, z, val }); }));
  anomalies.sort((a, b) => b.z - a.z);
  const win = critLabel(se);
  const live = S.live && S.liveFor === aoiKey() ? S.live : null;
  return `<div class="brief">
    <h4>Fire activity briefing: ${name}</h4>
    <div class="sub">Generated ${new Date().toISOString().slice(0, 10)} · Agnikaal harmonized MODIS + VIIRS record · ${S.yA}–${S.yB}</div>
    <h5>Summary</h5>
    <p>On average this area records <b>${nice(mean)}</b> fire cell-days per year (VIIRS-equivalent). Burning is ${se ? (se.concentration > 0.6 ? '<b>strongly seasonal</b>' : se.concentration > 0.3 ? '<b>moderately seasonal</b>' : '<b>spread through the year</b>') : 'minimal'}, peaking in <b>${se ? MONTHS[se.peak] : '–'}</b>. The critical period is <b>${win}</b>: these ${se ? se.critical.length : 0} months hold ${se ? Math.round(se.criticalShare * 100) : 0}% of activity.</p>
    <h5>History</h5>
    <ul>
      <li>Highest-activity years: ${sorted.slice(0, 3).map((r) => `<b>${r.year}</b> (${nice(r.total)})`).join(', ')}.</li>
      <li>Lowest years: ${sorted.slice(-3).reverse().map((r) => `${r.year} (${nice(r.total)})`).join(', ')}.</li>
      <li>${last.year} ranked at the ${lastPr.toFixed(0)}th percentile of years in range.</li>
      <li>Trend: ${tr ? `${tr.pctPerDecade >= 0 ? '+' : ''}${tr.pctPerDecade.toFixed(0)}% per decade (Theil–Sen), ${tr.p < 0.05 ? '<b>statistically significant</b>' : 'not statistically significant'} (Mann–Kendall p = ${tr.p.toFixed(3)}).` : 'insufficient data.'}</li>
    </ul>
    <h5>Extreme months (≥ 3σ above the monthly median)</h5>
    <p>${anomalies.length ? anomalies.slice(0, 6).map((a) => `<b>${MONTHS[a.m]} ${a.y}</b> (+${a.z.toFixed(1)}σ)`).join(', ') : 'None detected in the selected period.'}</p>
    ${live ? `<h5>Current conditions (last 7 days)</h5><p>${live.hs.length} VIIRS hotspots, ${live.fcd} fire cell-days. Projected ${MONTHS[new Date().getMonth()]} pace is at the <b>${live.warn.pr.toFixed(0)}th percentile</b>: <b class="lvl-${live.warn.code}">${live.warn.level}</b>.</p>` : ''}
    <h5>Method & confidence</h5>
    <p>MODIS (2001–2011) was calibrated to the VIIRS scale with area-specific monthly factors from ${2025 - 2012 + 1} overlap years; leave-one-year-out cross-validation gives R² = ${v.r2.toFixed(2)} and total bias ${v.bias.toFixed(1)}% (a naive raw splice would be biased by ${v.naiveBias.toFixed(0)}%). Source: NASA FIRMS MODIS C6.1, VIIRS S-NPP / NOAA-20 / NOAA-21 C2.</p>
  </div>`;
}

// ------------------------------------------------------------------ time-lapse
let playing = false, raf = null;
function togglePlay() {
  const btn = $('#playBtn');
  if (playing) { playing = false; cancelAnimationFrame(raf); btn.textContent = '▶'; updateMapCells(); $('#playDate').textContent = 'Fire pulse 2001 → 2025'; return; }
  playing = true; btn.textContent = '❚❚';
  const R = S.region, k = S.h.cal.k;
  const i0 = (2001 - R.y0) * 12, i1 = (2025 - R.y0) * 12 + 11;
  let mi = i0, last = 0;
  const glow = new Float32Array(R.nc);
  const max = d3.quantile(Array.from(updateMapCells.call(null) || []).filter((v) => v > 0).sort(d3.ascending), 0.99) / 4 || 10;
  const step = (now) => {
    if (!playing) return;
    raf = requestAnimationFrame(step);
    if (now - last < 70) return; last = now;
    for (let i = 0; i < R.nc; i++) glow[i] *= 0.55;
    addMonth(glow, R.byMonth[mi], mi, k, 1);
    M.cells.setData(R, glow, max, S.mask);
    const y = 2000 + Math.floor(mi / 12);
    $('#playDate').innerHTML = `${MONTHS[mi % 12]} ${y} · <span class="${y < 2012 ? 'c-modis' : 'c-viirs'}">${y < 2012 ? 'MODIS × k̂' : 'VIIRS'}</span>`;
    $('#playProg').style.width = `${((mi - i0) / (i1 - i0)) * 100}%`;
    mi++;
    if (mi > i1) { playing = false; $('#playBtn').textContent = '▶'; setTimeout(() => { updateMapCells(); $('#playDate').textContent = 'Fire pulse 2001 → 2025'; }, 1200); }
  };
  raf = requestAnimationFrame(step);
}

// ------------------------------------------------------------------ exports
function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = () => (S.aoi ? (S.aoi.label || 'aoi') : S.region.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
async function exportPng() {
  if (S.tab !== 'calendar') { S.tab = 'calendar'; renderTab(); await new Promise((r) => setTimeout(r, 900)); }
  const svg = $('#cal svg');
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('*').forEach((n) => { n.style.opacity = ''; });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const style = document.createElement('style');
  style.textContent = 'text{fill:#9aa1b5;font-family:monospace;font-size:10px}';
  clone.prepend(style);
  const vb = svg.viewBox.baseVal, scale = 2;
  const src = new XMLSerializer().serializeToString(clone)
    .replaceAll('var(--modis)', '#a98bff').replaceAll('var(--viirs)', '#5ad1ff');
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = vb.width * scale; c.height = (vb.height + 40) * scale;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#0c0e16'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#eef0f6'; ctx.font = '600 14px sans-serif';
    ctx.fillText(`Agnikaal burning calendar · ${S.aoi ? S.aoi.label : S.region.name} · ${S.yA}–${S.yB}`, 12, 20);
    ctx.drawImage(img, 0, 30, vb.width, vb.height);
    c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `agnikaal-calendar-${slug()}.png`; a.click(); });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
}

// ------------------------------------------------------------------ boot
async function setRegion(id, { aoi = null, fit = true } = {}) {
  $('#mapLoading').classList.remove('done');
  S.regionId = id; S.aoi = aoi; S.live = null;
  $('#regionSel').value = id;
  try {
    S.region = await loadRegion(id);
  } catch (e) {
    $('#mapLoading').innerHTML = `<span>Could not load data for ${id}: ${e.message}</span>`;
    return;
  }
  M.clearLive(); $('#liveBtn').classList.remove('on');
  M.showAoi(S.aoi);
  if (fit) M.fit(S.aoi ? aoiBBox() : S.region.bbox);
  setToolUI(S.aoi ? 'none' : 'region');
  recompute();
  $('#mapLoading').classList.add('done');
  fetchLive().then(() => { renderKPIs(); }).catch(() => {});
}

function setToolUI(t) { $$('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t)); }

async function boot() {
  initChrome(); initCounters(); initTimeline(); initPixelDemo();
  startGlobe($('#globe')).catch(() => {});
  readHash();

  const index = await fetch('/data/index.json').then((r) => r.json());
  S.index = index;
  $('#regionSel').innerHTML = index.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  const totalDet = d3.sum(index, (r) => r.detections || 0);
  if (totalDet) { $('#statDet').dataset.to = (totalDet / 1e6).toFixed(1); }
  $('#buildInfo').textContent = `Data: NASA FIRMS archive to Dec 2025 + live NRT · ${index.length} regions`;
  const jump = index.find((r) => r.id === 'india');
  if (jump && jump.seamJump) $('#factJump').textContent = `≈ ${jump.seamJump.toFixed(1)}×`;

  // case files
  const avail = new Set(index.map((r) => r.id));
  $('#caseGrid').innerHTML = CASES.filter((c) => avail.has(c.region)).map((c) => `<button class="case reveal in" data-case="${c.id}"><span class="tag">${c.tag}</span><h3>${c.title}</h3><p>${c.text}</p><div class="go">Open in explorer →</div></button>`).join('');
  $('#caseGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.case'); if (!b) return;
    const c = CASES.find((x) => x.id === b.dataset.case);
    $('#explorer').scrollIntoView({ behavior: 'smooth' });
    setRegion(c.region, { aoi: { ...c.aoi, label: c.title } });
  });

  // years
  const yrs = d3.range(2001, 2026);
  $('#yA').innerHTML = yrs.map((y) => `<option>${y}</option>`).join('');
  $('#yB').innerHTML = yrs.map((y) => `<option>${y}</option>`).join('');
  $('#yA').value = S.yA; $('#yB').value = S.yB;
  const onYears = () => { let a = +$('#yA').value, b = +$('#yB').value; if (a > b) [a, b] = [b, a]; S.yA = a; S.yB = b; recompute(); };
  $('#yA').onchange = onYears; $('#yB').onchange = onYears;

  $('#palSel').value = S.palette;
  $('#palSel').onchange = (e) => { S.palette = e.target.value; M.cells.setPalette(S.palette); updateMapCells(); renderTab(); writeHash(); };
  $$('.mode').forEach((b) => { b.classList.toggle('active', b.dataset.mode === S.mode); b.onclick = () => { S.mode = b.dataset.mode; $$('.mode').forEach((x) => x.classList.toggle('active', x === b)); if (S.tab !== 'calendar') S.tab = 'calendar'; renderTab(); writeHash(); }; });
  $('#rawToggle').checked = S.raw;
  $('#rawToggle').onchange = (e) => { S.raw = e.target.checked; if (!['calendar', 'trend'].includes(S.tab)) S.tab = 'calendar'; renderTab(); writeHash(); toast(S.raw ? 'Raw splice: notice the false jump at 2012' : 'Harmonized: one consistent record'); };
  $$('.tab').forEach((t) => t.onclick = () => { S.tab = t.dataset.tab; renderTab(); writeHash(); });

  M = createMap($('#map'), {
    onAoi: (aoi) => { S.aoi = aoi; S.live = null; M.clearLive(); $('#liveBtn').classList.remove('on'); setToolUI('none'); recompute(); fetchLive().then(renderKPIs).catch(() => {}); },
  });
  M.cells.setPalette(S.palette);
  $$('.tool').forEach((b) => b.onclick = () => {
    const t = b.dataset.tool;
    setToolUI(t);
    $('#pointForm').classList.toggle('hidden', t !== 'point');
    if (t === 'region') { M.setTool('region'); S.aoi = null; M.showAoi(null); M.fit(S.region.bbox); recompute(); fetchLive().then(renderKPIs).catch(() => {}); }
    else if (t === 'rect' || t === 'poly') { M.setTool(t); toast(t === 'rect' ? 'Tap two opposite corners on the map' : 'Tap points on the map, then Finish'); }
    else M.setTool('none');
  });
  $('#pGo').onclick = () => {
    const lat = +$('#pLat').value, lon = +$('#pLon').value, km = Math.max(5, Math.min(500, +$('#pRad').value || 50));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return toast('Enter a valid latitude and longitude');
    const aoi = circleAoi(lat, lon, km);
    const reg = S.index.find((r) => lon >= r.bbox[0] && lon <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3]);
    if (reg && reg.id !== S.regionId) setRegion(reg.id, { aoi });
    else { S.aoi = aoi; M.showAoi(aoi); M.fit(aoiBBox()); S.live = null; recompute(); fetchLive().then(renderKPIs).catch(() => {}); }
  };
  $('#pMe').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => { $('#pLat').value = p.coords.latitude.toFixed(3); $('#pLon').value = p.coords.longitude.toFixed(3); $('#pGo').click(); }, () => toast('Location permission denied')) : toast('Geolocation not supported');
  $('#regionSel').onchange = (e) => setRegion(e.target.value);
  $('#playBtn').onclick = togglePlay;
  $('#liveBtn').onclick = async () => {
    const b = $('#liveBtn');
    if (b.classList.contains('on')) { b.classList.remove('on'); M.clearLive(); return; }
    b.textContent = '… loading';
    try { const L = await fetchLive(); M.showLive(L.hs); b.classList.add('on'); toast(`${L.hs.length} live hotspots · ${L.satellite}`); renderKPIs(); }
    catch (e) { toast('Live feed unavailable: ' + e.message); }
    b.textContent = '● Live 7 d';
  };
  $('#dlCsv').onclick = () => download(`agnikaal-monthly-${slug()}.csv`, toCSV(monthlyRows(S.h, S.yA, S.yB)));
  $('#dlHot').onclick = async () => {
    try { const L = await fetchLive(); download(`agnikaal-live-hotspots-${slug()}.csv`, toCSV(L.hs.map((h) => ({ latitude: h.lat, longitude: h.lon, acq_date: h.date, acq_time: h.time, confidence: h.conf, frp_mw: h.frp, daynight: h.dn, satellite: L.satellite })))); }
    catch (e) { toast('Live feed unavailable'); }
  };
  $('#dlPng').onclick = exportPng;
  $('#dlPrint').onclick = () => { S.tab = 'brief'; renderTab(); setTimeout(() => window.print(), 300); };
  $('#share').onclick = async () => { writeHash(); try { await navigator.clipboard.writeText(location.href); toast('Link copied: it reopens this exact view'); } catch { toast(location.href); } };

  const start = index.find((r) => r.id === S.regionId) ? S.regionId : index[0].id;
  const hp = new URLSearchParams(location.hash.slice(1));
  await setRegion(start, { aoi: S.aoi });
  // shared links open straight on the explorer (focus=<section id> to target another section)
  const focus = hp.get('focus') || (hp.get('aoi') ? 'explorer' : null);
  if (focus && document.getElementById(focus)) {
    $$('.reveal').forEach((e) => e.classList.add('in'));
    setTimeout(() => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById(focus).scrollIntoView(); document.documentElement.style.scrollBehavior = ''; }, 300);
  }
}

boot();
