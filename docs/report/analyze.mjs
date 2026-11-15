import fs from 'node:fs';
const APP = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const H = await import(APP + '/src/harmonize.js');
const RS = await import(APP + '/src/research.js');
const { CASES: PRESETS } = await import(APP + '/src/presets.js');
const oni = JSON.parse(fs.readFileSync(APP + '/public/data/oni.json')).values;
const index = JSON.parse(fs.readFileSync(APP + '/public/data/index.json'));
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${APP}/public/data/${id}.json`)); const b = fs.readFileSync(`${APP}/public/data/${id}.bin`); return H.decodeRegion(meta, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const yearly = (A, y0) => { const o = {}; for (let y = 2001; y <= 2025; y++) { let s = 0; for (let m = 0; m < 12; m++) s += A[(y - y0) * 12 + m]; o[y] = s; } return o; };
const out = { regions: [], aois: [] };
const R = {};
// variants for ablation: pooled k (lambda huge), monthly no shrink (lambda 0), default 25, raw-count calibration
function cvVariant(M, V, y0, years, lambda) { const obs = [], pred = []; for (const y of years) { const tr = years.filter(t => t !== y); const { k } = H.calibrate(M, V, y0, tr, { lambda }); for (let m = 0; m < 12; m++) { const i = (y - y0) * 12 + m; obs.push(V[i]); pred.push(k[m] * M[i]); } } return { r2: H.r2(obs, pred), mape: H.mape(obs, pred), bias: H.bias(obs, pred) }; }
function step(series) { const pre = [2009, 2010, 2011].map(y => series[y]), post = [2012, 2013, 2014].map(y => series[y]); const med = a => [...a].sort((x, y) => x - y)[1]; return med(post) / med(pre); }
for (const r of index) {
  const reg = R[r.id] = load(r.id);
  const h = H.harmonize(reg, null);
  const years = H.range(2012, 2025);
  const abl = {}; for (const [nm, lam] of [['pooled', 1e12], ['monthly_noshrink', 0], ['monthly_eb25', 25], ['monthly_eb100', 100]]) abl[nm] = cvVariant(h.M, h.V, h.y0, years, lam);
  // raw-count calibration (detections, no FCD)
  abl.raw_counts_eb25 = cvVariant(h.Mr, h.Vr, h.y0, years, 25);
  const rawSplice = {}; const harm = {}; const yM = yearly(h.Mr, h.y0), yV = yearly(h.Vr, h.y0), yH = yearly(h.H, h.y0);
  for (let y = 2001; y <= 2025; y++) { rawSplice[y] = y < 2012 ? yM[y] : yV[y]; harm[y] = yH[y]; }
  const tr = H.trend(H.calendar(h, 2001, 2025)); const trRaw = H.trend(Object.entries(rawSplice).map(([y, t]) => ({ year: +y, total: t })));
  const ins = RS.autoInsights(h, oni);
  out.regions.push({ id: r.id, name: r.name, detections: r.detections, cells: reg.nc, seamJumpIndex: r.seamJump,
    k: [...h.cal.k], sd: [...h.cal.sd], kAll: h.cal.kAll, val: { ...h.validation, pairs: undefined },
    rawRatioOverlap: (() => { let a = 0, b = 0; for (const y of years) { a += yV[y]; b += yM[y]; } return a / b; })(),
    fcdRatioOverlap: h.cal.kAll, stepRaw: step(rawSplice), stepHarm: step(harm), rawSplice, harm,
    modisFcdYear: yearly(h.M, h.y0), viirsFcdYear: yearly(h.V, h.y0),
    trend: { pct: tr.pctPerDecade, p: tr.p }, trendRaw: { pct: trRaw.pctPerDecade, p: trRaw.p }, abl,
    nSig: ins.nSig, nHyp: ins.nHyp });
  { const obs = [], pred = [], mo = []; for (const y of years) { const { k } = H.calibrate(h.M, h.V, h.y0, years.filter(t => t !== y), { lambda: 25 }); for (let m = 0; m < 12; m++) { const i = (y - h.y0) * 12 + m; obs.push(h.V[i]); pred.push(k[m] * h.M[i]); mo.push(m); } }
  const nobs = [], npred = []; for (const y of years) for (let m = 0; m < 12; m++) { const i = (y - h.y0) * 12 + m; nobs.push(h.Vr[i]); npred.push(h.Mr[i]); }
  fs.writeFileSync(`loyo_${r.id}.json`, JSON.stringify({ obs, pred, mo, nobs, npred })); }
}
const presets = (PRESETS || []);
for (const p of presets) {
  const reg = R[p.region]; const { mask, count } = H.cellMask(reg, p.aoi); const h = H.harmonize(reg, mask);
  const clim = H.climatology(h, 2001, 2025); const se = H.season(clim); const tr = H.trend(H.calendar(h, 2001, 2025));
  const ins = RS.autoInsights(h, oni);
  const cal = H.calendar(h, 2001, 2025);
  const abl = {}; for (const [nm, lam] of [['pooled', 1e12], ['monthly_noshrink', 0], ['monthly_eb25', 25]]) abl[nm] = cvVariant(h.M, h.V, h.y0, H.range(2012, 2025), lam); abl.raw_counts_eb25 = cvVariant(h.Mr, h.Vr, h.y0, H.range(2012, 2025), 25);
  out.aois.push({ abl, id: p.id, title: p.title, region: p.region, cells: count, val: { ...h.validation, pairs: undefined }, k: [...h.cal.k],
    peak: H.MONTHS[se.peak], critical: se.critical.map(m => H.MONTHS[m]), conc: se.concentration, trend: { pct: tr.pctPerDecade, p: tr.p },
    insights: ins.tests.filter(t => t.q != null && t.q < 0.05).map(t => ({ title: t.title, stat: t.stat, q: t.q, strength: t.strength })),
    infos: ins.tests.filter(t => t.info).map(t => t.title + ' | ' + t.stat),
    calendar: cal.map(r => r.vals), climMed: clim.map(c => c.med) });
}
fs.writeFileSync('results.json', JSON.stringify(out, null, 1));
for (const r of out.regions) console.log(r.name, 'R2', r.val.r2.toFixed(3), 'MAPE', r.val.mape.toFixed(1), 'bias', r.val.bias.toFixed(1), '| naive bias', r.val.naiveBias.toFixed(1), 'naiveMAPE', r.val.naiveMape.toFixed(1), '| step raw', r.stepRaw.toFixed(2), 'harm', r.stepHarm.toFixed(2), '| kAll', r.kAll.toFixed(2), 'rawRatio', r.rawRatioOverlap.toFixed(2), '| trend', r.trend.pct.toFixed(1), r.trend.p.toFixed(3), 'raw', r.trendRaw.pct.toFixed(1), r.trendRaw.p.toFixed(3), '| abl', Object.entries(r.abl).map(([k, v]) => k + ':' + v.r2.toFixed(3) + '/' + v.mape.toFixed(1)).join(' '));
for (const a of out.aois) console.log(a.id, a.cells, 'R2', a.val.r2.toFixed(3), 'MAPE', a.val.mape.toFixed(1), 'naiveMAPE', a.val.naiveMape.toFixed(1), a.peak, a.critical.join(''), 'trend', a.trend.pct.toFixed(0), a.trend.p.toFixed(3), 'abl', Object.entries(a.abl).map(([k, v]) => k + ':' + v.r2.toFixed(2) + '/' + v.mape.toFixed(0)).join(' '), '|', a.insights.map(i => i.title + ' q=' + i.q.toFixed(3)).join(' ; '));
