// Deterministic intro-video stage: window.__seek(t) paints frame t (seconds).
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { decodeRegion, cellMask, harmonize, calendar, climatology, season, trend, MONTHS } from '../src/harmonize.js';
import { fireOutlook, fireRegimes, REGIME_COLORS, askAgniLite, buildFacts } from '../src/ai.js';
import { autoInsights } from '../src/research.js';
import { weatherDrivers, placeName } from '../src/discover.js';

const W = 1920, H = 1080;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const CAPTIONS = params.get('captions') === '1';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeIO = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const prog = (t, a, d) => clamp((t - a) / d);

const GAP = +(params.get('gap') ?? 0.55), LEAD = 0.5, TAIL = +(params.get('tail') ?? 2.6);
let SCENES = [], TOTAL = 0, D = {};

async function load() {
  const timing = await fetch(params.get('timing') || '/promo/timing.json').then((r) => r.json());
  let t = LEAD;
  SCENES = timing.map((s) => { const sc = { ...s, start: t, end: t + s.dur + GAP }; t = sc.end; return sc; });
  SCENES.at(-1).end += TAIL;
  TOTAL = SCENES.at(-1).end;
  const [meta, buf, live, idx] = await Promise.all([
    fetch('/data/india.json').then((r) => r.json()), fetch('/data/india.bin').then((r) => r.arrayBuffer()),
    fetch('/data/live_sample.json').then((r) => r.json()), fetch('/data/index.json').then((r) => r.json()),
  ]);
  const R = decodeRegion(meta, buf);
  const h = harmonize(R, null);
  const years = d3.range(2001, 2026);
  const yr = (A, y) => d3.sum(d3.range(12), (m) => A[(y - h.y0) * 12 + m]);
  D.raw = years.map((y) => (y < 2012 ? yr(h.Mr, y) : yr(h.Vr, y)));
  D.harm = years.map((y) => yr(h.H, y));
  D.years = years;
  D.r2 = h.validation.r2;
  D.det = d3.sum(idx, (r) => r.detections) / 1e6;
  D.countries = idx.length;
  // per-cell mean annual harmonized activity (VIIRS era) for the India map
  const vals = new Float32Array(R.nc);
  const { k, v } = R.series.V_fcd;
  for (let i = 0; i < k.length; i++) { const mi = k[i] & 511; if (mi >= (2012 - 2000) * 12) vals[k[i] >>> 9] += v[i] / 14; }
  D.R = R; D.cellVals = vals; D.cellMax = d3.quantile([...vals].filter((x) => x > 0).sort(d3.ascending), 0.99);
  const { mask } = cellMask(R, { type: 'bbox', bbox: [73.8, 29.5, 77.2, 32.6] });
  const hp = harmonize(R, mask);
  D.cal = calendar(hp, 2001, 2025);
  const clim = climatology(hp, 2001, 2025);
  const se = season(clim), tr = trend(D.cal);
  $('#fCrit').textContent = se.critical.map((m) => MONTHS[m]).join(' · ');
  $('#fWorst').textContent = D.cal.reduce((a, b) => (b.total > a.total ? b : a)).year;
  $('#fTrend').textContent = tr.p < 0.05 ? `${tr.pctPerDecade > 0 ? '+' : ''}${tr.pctPerDecade.toFixed(0)}% / decade` : 'Stable, no sig. trend';
  D.calMax = d3.max(D.cal.flatMap((r) => r.vals));
  D.live = live.points.filter(([lon, lat]) => lon > 68.5 && lon < 97.5 && lat > 6.75 && lat < 35.25);
  D.fires = live.points;
  D.land = feature(land110, land110.objects.land);
  // AI scene data: NSW outlook (El Nino), India regimes, a grounded Agni answer for Punjab
  const [am, ab, oniJ] = await Promise.all([fetch('/data/australia.json').then((r) => r.json()), fetch('/data/australia.bin').then((r) => r.arrayBuffer()), fetch('/data/oni.json').then((r) => r.json())]);
  const AU = decodeRegion(am, ab);
  const nsw = harmonize(AU, cellMask(AU, { type: 'bbox', bbox: [148.0, -37.6, 153.7, -28.2] }).mask);
  const oniKeys = Object.keys(oniJ.values).sort(), oniNow = oniJ.values[oniKeys[oniKeys.length - 1]];
  D.oniNow = oniNow;
  D.outlook = fireOutlook(nsw, climatology(nsw, 2001, 2025), oniJ.values, { year: 2026, month: 10, anom: null, oni: oniNow }).leads;
  D.regimes = fireRegimes(R);
  const pS = { h: hp, clim, rows: D.cal, season: se, trend: tr, region: { name: 'Punjab' }, aoi: { label: 'Punjab' }, yA: 2001, yB: 2025 };
  D.agni = askAgniLite('Should we prepare crews?', buildFacts(pS)).replace(/\s+Right now.*$/, '');
  // Research Lab scene: real insights (Punjab), ERA5 drivers (NSW vs Punjab), catalogue events
  D.ins = autoInsights(hp, oniJ.values).tests.filter((t) => t.q != null && t.q < 0.05).slice(0, 3);
  const nswClim = climatology(nsw, 2001, 2025);
  const [dA, dB] = await Promise.all([
    weatherDrivers({ h: nsw, season: season(nswClim), oni: oniJ.values }, { aoiBBox: () => [148.0, -37.6, 153.7, -28.2] }),
    weatherDrivers({ h: hp, season: se, oni: oniJ.values }, { aoiBBox: () => [73.8, 29.5, 77.2, 32.6] }),
  ]);
  D.drv = [dA.r2, dB.r2];
  const evAll = (await fetch('/data/events.json').then((r) => r.json())).events;
  const pick = [['australia', 2020, 0], ['canada', 2023, 8], ['australia', 2003, 0], ['india', 2021, 2]];
  D.events = [];
  for (const [rg, y, m] of pick) { const e = evAll.find((x) => x.region === rg && x.year === y && x.month === m); if (e) D.events.push({ ...e, name: await placeName(e.lat, e.lon) }); }
  // captions: script text (with punctuation) aligned to the spoken word timings
  D.caps = [];
  for (const sc of SCENES) for (const c of captionLines(sc)) D.caps.push(c);
  document.querySelectorAll('[data-in]').forEach((el) => { el.dataset.inv = el.dataset.in; });
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  window.__total = TOTAL; window.__scenes = SCENES.map((s) => ({ id: s.id, start: s.start, file: s.file }));
  window.__ready = true;
}

const PRETTY = [[/agni-kaal dot vercel dot app/gi, 'agnikaal.vercel.app'], [/Agni-kaal/g, 'Agnikaal'], [/Akasha Seven/g, 'AKASHA7'],
  [/ninety-seven percent/g, '97%'], [/seventy million/g, '70 million'], [/twenty-five/g, '25']];
const pretty = (t) => PRETTY.reduce((a, [re, r]) => a.replace(re, r), t);
function captionLines(sc) {
  const toks = sc.text.split(/\s+/), out = [];
  let ti = 0, line = [], st = null;
  sc.words.forEach((w, i) => {
    const n = w.w.split(/\s+/).length;
    const got = toks.slice(ti, ti + n); ti += n;
    if (st == null) st = w.t;
    line.push(...got);
    const txt = line.join(' '), last = got[got.length - 1] || '';
    const brk = i === sc.words.length - 1 || txt.length > 40 || (/[.,:;?!]$/.test(last) && txt.length >= 16);
    if (brk) { out.push({ a: sc.start + st, b: sc.start + w.t + w.d + 0.2, text: pretty(txt) }); line = []; st = null; }
  });
  return out;
}

const sceneEl = (id) => document.getElementById('s-' + id);
function animateIns(el, lt) {
  el.querySelectorAll('[data-in]').forEach((n) => {
    const p = ease(prog(lt, +n.dataset.in, 0.7));
    n.style.opacity = p; n.style.transform = `translateY(${(1 - p) * 34}px)`;
  });
}

// ---------- canvas painters ----------
function bg(t) {
  ctx.clearRect(0, 0, W, H);
  // drifting embers
  for (let i = 0; i < 70; i++) {
    const x = (i * 271.3 + t * (8 + (i % 7) * 3)) % W;
    const y = H - ((i * 133.7 + t * (20 + (i % 5) * 9)) % (H + 40));
    const a = 0.08 + 0.18 * (0.5 + 0.5 * Math.sin(t * 1.3 + i));
    ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},60,${a})`;
    ctx.beginPath(); ctx.arc(x, y, 1.2 + (i % 3), 0, 6.283); ctx.fill();
  }
}

function globe(t, cx, cy, R, alpha) {
  ctx.save(); ctx.globalAlpha = alpha;
  const proj = d3.geoOrthographic().translate([cx, cy]).scale(R).rotate([-60 - t * 6, -14]).clipAngle(90);
  const path = d3.geoPath(proj, ctx);
  const gl = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.32);
  gl.addColorStop(0, 'rgba(90,209,255,.25)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R * 1.32, 0, 6.283); ctx.fill();
  const oc = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R);
  oc.addColorStop(0, '#18233f'); oc.addColorStop(1, '#070a14');
  ctx.fillStyle = oc; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
  ctx.beginPath(); path(d3.geoGraticule10()); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); path(D.land); ctx.fillStyle = '#1c2338'; ctx.fill(); ctx.strokeStyle = 'rgba(150,170,220,.35)'; ctx.stroke();
  const center = [60 + t * 6, 14];
  ctx.globalCompositeOperation = 'lighter';
  D.fires.forEach((f, i) => {
    if (d3.geoDistance(f, center) > 1.54) return;
    const p = proj(f); if (!p) return;
    const fl = 0.55 + 0.45 * Math.sin(t * 5 + i * 1.7);
    ctx.fillStyle = `rgba(255,110,40,${0.32 * fl})`; ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 6.283); ctx.fill();
    ctx.fillStyle = `rgba(255,215,130,${0.9 * fl})`; ctx.beginPath(); ctx.arc(p[0], p[1], 1.8, 0, 6.283); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
  // satellites on tilted orbits
  [['#a98bff', 0, 1.15], ['#c4b0ff', 2.1, 1.19], ['#5ad1ff', 4, 1.23], ['#8fe3ff', 1.1, 1.27]].forEach(([c, ph, r], k) => {
    const a = ph + t * 0.45;
    const tilt = -0.35 + k * 0.22;
    const ex = Math.cos(a) * R * r, ey = Math.sin(a) * R * r * 0.32;
    const x = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
    ctx.strokeStyle = c + '30'; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.ellipse(cx, cy, R * r, R * r * 0.32, tilt, 0, 6.283); ctx.stroke();
    if (Math.sin(a) < 0 && Math.hypot(x - cx, y - cy) < R) return;
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
  });
  ctx.restore();
}

function pixelGrid(x0, y0, size, cell, color, t, start) {
  // fire front growing inside a size x size km window (6 km)
  const km = 6, n = Math.round(km / cell), px = size / n;
  const r = 0.4 + 1.5 * easeIO(prog(t, start, 4));
  const blob = (x, y) => { const a = Math.atan2(y - 3, x - 3); const rr = r * (1 + 0.25 * Math.sin(3 * a + 0.6) + 0.14 * Math.cos(5 * a)); return Math.hypot(x - 3, (y - 3) * 1.25) < rr; };
  let count = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let hit = false;
    for (let a = 0.2; a < 1 && !hit; a += 0.3) for (let b = 0.2; b < 1 && !hit; b += 0.3) hit = blob((i + a) * cell, (j + b) * cell);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.strokeRect(x0 + i * px + 0.5, y0 + j * px + 0.5, px - 1, px - 1);
    if (hit) { count++; ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.fillRect(x0 + i * px + 1.5, y0 + j * px + 1.5, px - 3, px - 3); ctx.globalAlpha = 1; }
  }
  ctx.strokeStyle = 'rgba(255,209,102,.95)'; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let q = 0; q <= 120; q++) { const a = (q / 120) * 6.283; const rr = r * (1 + 0.25 * Math.sin(3 * a + 0.6) + 0.14 * Math.cos(5 * a)); const xx = 3 + Math.cos(a) * rr, yy = 3 + (Math.sin(a) * rr) / 1.25; const X = x0 + (xx / km) * size, Y = y0 + (yy / km) * size; q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
  ctx.stroke(); ctx.lineWidth = 1;
  return count;
}

function bars(x0, y0, w, h, series, colors, p, opts = {}) {
  const n = series.length, bw = w / n;
  const max = opts.max || d3.max(series);
  series.forEach((v, i) => {
    const pp = ease(clamp(p * n * 0.12 - i * 0.12 + 0.12 * 0)) ;
    const grow = opts.instant ? 1 : ease(clamp((p - i / n * 0.7) / 0.3));
    const bh = (v / max) * h * grow;
    ctx.fillStyle = colors(i); ctx.globalAlpha = 0.9;
    roundRect(x0 + i * bw + bw * 0.15, y0 + h - bh, bw * 0.7, bh, 5); ctx.fill(); ctx.globalAlpha = 1;
    void pp;
  });
  ctx.fillStyle = '#6b7287'; ctx.font = '500 20px JetBrains Mono'; ctx.textAlign = 'center';
  [2001, 2006, 2012, 2018, 2025].forEach((y) => { const i = y - 2001; ctx.fillText(y, x0 + i * bw + bw / 2, y0 + h + 32); });
  ctx.textAlign = 'left';
}
function roundRect(x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function indiaMap(x0, y0, w, h, p, liveP = 0, t = 0) {
  const R = D.R, [bw, bs, be, bn] = R.bbox;
  const sx = w / (be - bw), sy = h / (bn - bs), s = Math.min(sx, sy);
  const ox = x0 + (w - (be - bw) * s) / 2, oy = y0 + (h - (bn - bs) * s) / 2;
  const X = (lon) => ox + (lon - bw) * s, Y = (lat) => oy + (bn - lat) * s;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < R.nc; i++) {
    const v = D.cellVals[i]; if (!v) continue;
    const reveal = clamp((p * 1.6) - (bn - R.cellLat[i]) / (bn - bs));
    if (reveal <= 0) continue;
    const tt = Math.sqrt(Math.min(1, v / D.cellMax));
    ctx.globalAlpha = (0.25 + 0.75 * tt) * reveal * (liveP ? 0.45 : 1);
    ctx.fillStyle = d3.interpolateInferno(0.15 + 0.85 * tt);
    ctx.fillRect(X(R.cellLon[i]), Y(R.cellLat[i] + R.res), R.res * s - 0.6, R.res * s - 0.6);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (liveP > 0) {
    D.live.forEach(([lon, lat], i) => {
      const a = clamp(liveP * 3 - (i / D.live.length) * 2);
      if (a <= 0) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + i);
      ctx.fillStyle = `rgba(255,59,92,${0.25 * a * pulse})`; ctx.beginPath(); ctx.arc(X(lon), Y(lat), 10 + 6 * pulse, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(255,120,140,${a})`; ctx.beginPath(); ctx.arc(X(lon), Y(lat), 4, 0, 6.283); ctx.fill();
    });
  }
  return { X, Y };
}

function calendarGrid(x0, y0, w, h, p) {
  const rows = D.cal, n = rows.length, cw = w / 12, ch = h / n;
  ctx.font = '500 16px JetBrains Mono'; ctx.fillStyle = '#9aa1b5'; ctx.textAlign = 'center';
  MONTHS.forEach((m, i) => ctx.fillText(m[0], x0 + i * cw + cw / 2, y0 - 10));
  ctx.textAlign = 'right';
  rows.forEach((r, ri) => {
    if (ri % 4 === 0 || ri === n - 1) { ctx.fillStyle = r.year < 2012 ? '#a98bff' : '#5ad1ff'; ctx.fillText(r.year, x0 - 10, y0 + ri * ch + ch * 0.75); }
    r.vals.forEach((v, m) => {
      const a = ease(clamp(p * 1.4 - (ri * 12 + m) / (n * 12)));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = v ? d3.interpolateInferno(0.08 + 0.9 * Math.sqrt(v / D.calMax)) : '#11131c';
      roundRect(x0 + m * cw + 1.5, y0 + ri * ch + 1.5, cw - 3, ch - 3, 3); ctx.fill();
    });
  });
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

function gauge(cx, cy, R, pr) {
  const bands = [[0, 40, '#5ad1ff'], [40, 75, '#4ade80'], [75, 90, '#fbbf24'], [90, 100, '#f43f5e']];
  const ang = (p) => Math.PI + (p / 100) * Math.PI;
  bands.forEach(([a, b, c]) => { ctx.strokeStyle = c; ctx.lineWidth = 34; ctx.beginPath(); ctx.arc(cx, cy, R, ang(a) + 0.02, ang(b) - 0.02); ctx.stroke(); });
  ctx.lineWidth = 1;
  const a = ang(pr);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40)); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 6.283); ctx.fill(); ctx.lineWidth = 1; ctx.lineCap = 'butt';
  ctx.font = '500 20px JetBrains Mono'; ctx.fillStyle = '#9aa1b5';
  ctx.textAlign = 'center';
  [['Below', 18], ['Normal', 57], ['Elevated', 82], ['Extreme', 96]].forEach(([l, p]) => {
    const aa = ang(p), c = Math.cos(aa);
    ctx.textAlign = c > 0.25 ? 'left' : c < -0.25 ? 'right' : 'center';
    ctx.fillText(l, cx + c * (R + 36), cy + Math.sin(aa) * (R + 36) + 6);
  });
  ctx.textAlign = 'left';
}

// ---------- seek ----------
function seek(t) {
  bg(t);
  $('#progress').style.width = `${(t / TOTAL) * 100}%`;
  const brandP = clamp((t - SCENES[1].start + 0.3) / 0.6);
  $('#brand').style.opacity = brandP * (t > SCENES.at(-1).start - 0.3 ? 1 - clamp((t - SCENES.at(-1).start + 0.3) / 0.5) : 1);
  for (const sc of SCENES) {
    const el = sceneEl(sc.id);
    const lt = t - sc.start;
    const on = t >= sc.start - 0.4 && t <= sc.end + 0.4;
    const a = on ? Math.min(ease(prog(t, sc.start - 0.4, 0.6)), sc === SCENES.at(-1) ? 1 : 1 - ease(prog(t, sc.end - 0.35, 0.5))) : 0;
    el.style.opacity = a;
    if (!on) continue;
    animateIns(el, lt);
    ctx.save(); ctx.globalAlpha = a;
    paint[sc.id] && paint[sc.id](lt, sc, el);
    ctx.restore();
  }
  // captions
  const cap = $('#cap');
  if (CAPTIONS) {
    const c = D.caps.find((c) => t >= c.a && t <= c.b);
    cap.textContent = c ? c.text : '';
    cap.style.opacity = c ? 1 : 0;
  }
}

const paint = {
  intro(lt) {
    globe(lt + 3, 1400, 560, 380, ease(prog(lt, 0, 1.2)));
    // title letter reveal
    const p = ease(prog(lt, 0.6, 1.1));
    $('#title').style.opacity = p; $('#title').style.filter = `blur(${(1 - p) * 14}px)`;
    $('#title').style.transform = `translateY(${(1 - p) * 30}px)`;
  },
  problem(lt) {
    const m = pixelGrid(150, 410, 340, 1, '#a98bff', lt, 1.2);
    const v = pixelGrid(590, 410, 340, 0.375, '#5ad1ff', lt, 1.6);
    $('#pM').textContent = m; $('#pV').textContent = v;
    if (lt > 7.2) {
      const p = prog(lt, 7.6, 3.5);
      const max = d3.max(D.raw);
      bars(1080, 470, 690, 300, D.raw, (i) => (D.years[i] < 2012 ? '#a98bff' : '#5ad1ff'), p, { max });
      const j = ease(prog(lt, 11, 0.8));
      $('#jump').style.opacity = j; $('#jump').style.transform = `scale(${0.9 + 0.1 * j})`;
      if (j > 0) { const bw = 690 / 25; ctx.strokeStyle = `rgba(255,106,43,${j})`; ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1080 + 11 * bw, 590); ctx.lineTo(1080 + 11 * bw, 780); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
    } else { $('#jump').style.opacity = 0; }
  },
  fix(lt) {
    // phase 1: scattered sensor dots snap to grid; phase 2: bars morph raw -> harmonized
    const x0 = 840, y0 = 400, w = 930, h = 440;
    const snap = easeIO(prog(lt, 1.5, 2.2));
    const fade1 = 1 - ease(prog(lt, 5.2, 0.8));
    if (fade1 > 0) {
      ctx.globalAlpha *= fade1;
      const cols = 14, rows = 7, cw = w / cols, chh = h / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { ctx.strokeStyle = `rgba(255,255,255,${0.08 * snap})`; ctx.strokeRect(x0 + i * cw, y0 + j * chh, cw, chh); }
      for (let q = 0; q < 160; q++) {
        const rx = (Math.sin(q * 12.9898) * 43758.5453) % 1, ry = (Math.sin(q * 78.233) * 12543.123) % 1;
        const fx = Math.abs(rx) * w, fy = Math.abs(ry) * h;
        const gx = Math.floor(fx / cw) * cw + cw / 2, gy = Math.floor(fy / chh) * chh + chh / 2;
        const x = x0 + fx + (gx - fx) * snap, y = y0 + fy + (gy - fy) * snap;
        ctx.fillStyle = q % 3 ? '#5ad1ff' : '#a98bff';
        ctx.beginPath(); ctx.arc(x, y, 7 * (1 - snap * 0.3), 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      $('#fixLabel').textContent = snap < 0.95 ? 'Detections from two sensors…' : '…counted once on one 1 km grid';
    }
    if (lt > 5.6) {
      const morph = easeIO(prog(lt, 7.6, 2.4));
      const series = D.raw.map((r, i) => r + (D.harm[i] * (d3.max(D.raw) / d3.max(D.harm)) * 0.9 - r) * morph);
      const appear = prog(lt, 5.6, 1.2);
      ctx.globalAlpha = ease(appear);
      bars(x0, y0 + 40, w, h - 40, series, (i) => (D.years[i] < 2012 ? (morph > 0.5 ? '#ff8a3d' : '#a98bff') : (morph > 0.5 ? '#ffb347' : '#5ad1ff')), 1, { max: d3.max(D.raw), instant: true });
      ctx.globalAlpha = 1;
      $('#fixLabel').textContent = morph < 0.5 ? 'India · raw counts joined (broken at 2012)' : 'India · Agnikaal harmonized record, 2001 → 2025';
    }
  },
  use(lt) {
    indiaMap(140, 350, 660, 630, prog(lt, 0.5, 2.2));
    // AOI box over Punjab
    const R = D.R, [bw, bs, be, bn] = R.bbox; const s = Math.min(660 / (be - bw), 630 / (bn - bs));
    const ox = 140 + (660 - (be - bw) * s) / 2, oy = 350 + (630 - (bn - bs) * s) / 2;
    const bp = ease(prog(lt, 1.6, 0.9));
    if (bp > 0) {
      const x1 = ox + (73.8 - bw) * s, y1 = oy + (bn - 32.6) * s, x2 = ox + (77.2 - bw) * s, y2 = oy + (bn - 29.5) * s;
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]);
      ctx.strokeRect(x1, y1, (x2 - x1) * bp, (y2 - y1) * bp); ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.font = '600 24px Inter'; ctx.fillStyle = `rgba(255,209,102,${bp})`; ctx.fillText('Punjab', x2 + 12, y1 + 22);
    }
    calendarGrid(950, 380, 460, 580, prog(lt, 2.4, 3.2));
  },
  live(lt) {
    indiaMap(140, 350, 780, 630, 1, ease(prog(lt, 0.8, 3)), lt);
    const swing = easeIO(prog(lt, 2.2, 2.6));
    const pr = 8 + 50 * swing + Math.sin(lt * 3) * 2 * swing;
    gauge(1400, 610, 190, pr);
    const lvl = $('#lvl'); lvl.textContent = pr < 40 ? 'Below normal' : 'Typical'; lvl.style.color = pr < 40 ? '#5ad1ff' : '#4ade80';
    lvl.style.opacity = ease(prog(lt, 3.6, 0.6));
  },
  proof(lt) {
    $('#cR2').textContent = `${Math.round(97 * ease(prog(lt, 1, 1.6)))}%`;
    $('#cDet').textContent = (D.det * ease(prog(lt, 3.2, 1.6))).toFixed(1);
    $('#cCountry').textContent = Math.round(D.countries * ease(prog(lt, 4.8, 1)));
  },
  ai(lt) {
    const strip = $('#aiStrip');
    if (!strip.dataset.built) {
      strip.dataset.built = 1;
      $('#aiOni').textContent = (D.oniNow > 0 ? '+' : '') + D.oniNow.toFixed(2);
      strip.innerHTML = D.outlook.filter(Boolean).map((o) => {
        const col = o.category === 'Above normal' ? '#f43f5e' : o.category === 'Below normal' ? '#5ad1ff' : o.category === 'Near normal' ? '#4ade80' : '#6b7287';
        return `<div class="o-card2" data-o><div class="m">${MONTHS[o.month]} ${o.year}</div><div class="c" style="color:${col}">${o.category}</div>
          <div class="bar"><span style="width:${o.pBelow * 100}%;background:#5ad1ff"></span><span style="width:${o.pNormal * 100}%;background:#4b5368"></span><span style="width:${o.pAbove * 100}%;background:#ff6a2b"></span></div>
          <div class="p">${Math.round(o.pAbove * 100)}% chance above normal</div></div>`;
      }).join('');
    }
    strip.querySelectorAll('[data-o]').forEach((c, i) => { const p = ease(prog(lt, 1.0 + i * 0.35, 0.6)); c.style.opacity = p; c.style.transform = `translateY(${(1 - p) * 24}px)`; });
    // regimes mini-map of India
    const rg = D.regimes, R = D.R; const [bw, bs, be, bn] = R.bbox;
    const x0 = 150, y0 = 700, w = 560, h = 300, s2 = Math.min(w / (be - bw), h / (bn - bs));
    const ox = x0 + (w - (be - bw) * s2) / 2, oy = y0 + (h - (bn - bs) * s2) / 2;
    const rp = prog(lt, 4.6, 2.2);
    for (let i = 0; i < R.nc; i++) {
      const g = rg.cellRegime[i]; if (g < 0) continue;
      const rev = clamp(rp * 1.6 - (bn - R.cellLat[i]) / (bn - bs)); if (rev <= 0) continue;
      ctx.globalAlpha = 0.9 * rev; ctx.fillStyle = REGIME_COLORS[g];
      ctx.fillRect(ox + (R.cellLon[i] - bw) * s2, oy + (bn - R.cellLat[i] - R.res) * s2, R.res * s2 - 0.5, R.res * s2 - 0.5);
    }
    ctx.globalAlpha = 1;
    // Ask Agni typing effect
    const full = D.agni.replace(/\*\*/g, '');
    const n = Math.floor(full.length * clamp((lt - 8.6) / 4.5));
    $('#aiA').innerHTML = n > 0 ? full.slice(0, n).replace(/(April|May|October|November|94%)/g, '<b>$1</b>') : '<span style="opacity:.5">…</span>';
  },
  lab(lt) {
    const box = $('#labIns');
    if (!box.dataset.built) {
      box.dataset.built = 1;
      box.innerHTML = D.ins.map((t) => `<div class="lab-ins" data-li><span class="bd ${t.strength === 'Strong' ? '' : 'sig'}">${t.strength.toUpperCase()} · q=${t.q < 0.001 ? '<0.001' : t.q.toFixed(3)}</span><b>${t.title}</b><span class="st">${t.stat}</span></div>`).join('');
      $('#labEv').innerHTML = D.events.map((e) => `<div class="ev-row" data-le><div><b>${MONTHS[e.month]} ${e.year} · ${e.name.split(',').slice(0, 2).join(',')}</b><span>${e.regionName} · ${e.cells} cells · +${e.excess.toLocaleString()} fire cell-days above normal</span></div><em>+${e.zmax}σ</em></div>`).join('');
    }
    box.querySelectorAll('[data-li]').forEach((c, i) => { const p = ease(prog(lt, 1.2 + i * 1.1, 0.7)); c.style.opacity = p; c.style.transform = `translateX(${(1 - p) * -30}px)`; });
    const pa = ease(prog(lt, 5.4, 1.6)), pb = ease(prog(lt, 6.4, 1.6));
    $('#drvA').style.width = `${D.drv[0] * 100 * pa}%`; $('#drvAv').textContent = `${Math.round(D.drv[0] * 100 * pa)}%`;
    $('#drvB').style.width = `${Math.max(1.5, D.drv[1] * 100 * pb)}%`; $('#drvBv').textContent = `${Math.round(D.drv[1] * 100 * pb)}%`;
    $('#drvNote').innerHTML = lt > 7.6 ? '<b style="color:#4ade80">NSW: climate-driven</b> · <b style="color:#f43f5e">Punjab: human-driven</b> (crop calendar &amp; policy)' : 'Share of year-to-year fire variation explained by weather';
    $('#labEv').querySelectorAll('[data-le]').forEach((c, i) => { const p = ease(prog(lt, 9.6 + i * 0.7, 0.6)); c.style.opacity = p; });
  },
  who() {},
  team(lt, sc, el) {
    el.querySelectorAll('.team-photo').forEach((im, i) => { const p = ease(prog(lt, 0.8 + i * 0.8, 0.9)); im.style.transform = `scale(${0.85 + 0.15 * p})`; });
    globe(lt + 40, 960, 1350, 520, 0.35);
  },
};

load().then(() => { window.__seek = seek; seek(+params.get('t') || 0); });
