// Computes every number and series used in the scientific report, using the app's own code.
import fs from 'node:fs';
import { decodeRegion, cellMask, harmonize, calendar, climatology, season, trend, MONTHS } from '../src/harmonize.js';
import { autoInsights } from '../src/research.js';
import { fireOutlook } from '../src/ai.js';
import { weatherDrivers } from '../src/discover.js';
import { CASES } from '../src/presets.js';

const D = new URL('../public/data/', import.meta.url);
const oni = JSON.parse(fs.readFileSync(new URL('oni.json', D))).values;
const index = JSON.parse(fs.readFileSync(new URL('index.json', D)));
const regions = {};
function load(id) {
  if (regions[id]) return regions[id];
  const meta = JSON.parse(fs.readFileSync(new URL(`${id}.json`, D)));
  const buf = fs.readFileSync(new URL(`${id}.bin`, D));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return (regions[id] = decodeRegion(meta, ab));
}
const yearSum = (A, y0, y) => { let s = 0; for (let m = 0; m < 12; m++) s += A[(y - y0) * 12 + m]; return s; };
function analyse(R, aoi) {
  const mask = aoi ? cellMask(R, aoi).mask : null;
  const h = harmonize(R, mask);
  const rows = calendar(h, 2001, 2025);
  const clim = climatology(h, 2001, 2025);
  const se = season(clim);
  const tr = trend(rows);
  const years = rows.map((r) => r.year);
  const ann = (A) => years.map((y) => yearSum(A, h.y0, y));
  const ins = autoInsights(h, oni);
  const out = fireOutlook(h, clim, oni, { year: 2025, month: 11, anom: 0, oni: oni['2025-12'] ?? 0 }, 6);
  return {
    h, se, clim,
    res: {
      years, H: ann(h.H), M: ann(h.M), V: ann(h.V), Mr: ann(h.Mr), Vr: ann(h.Vr),
      naive: years.map((y) => (y >= 2012 ? yearSum(h.Vr, h.y0, y) : yearSum(h.Mr, h.y0, y))),
      lo: ann(h.lo), hi: ann(h.hi),
      cal: { k: [...h.cal.k], sd: [...h.cal.sd], kAll: h.cal.kAll },
      val: { ...h.validation, pairs: h.validation.pairs },
      calendar: rows.map((r) => r.vals), climMed: clim.map((c) => c.med), climP10: clim.map((c) => c.p10), climP90: clim.map((c) => c.p90),
      season: se, trend: tr,
      insights: ins.tests.filter((t) => !t.info).map(({ id, p, q, effect, kind, title, stat, strength }) => ({ id, p, q, effect, kind, title, stat, strength })),
      nHyp: ins.nHyp, nSig: ins.nSig,
      outlook: out.leads.map((l) => l && { lead: l.lead, hitRate: l.hitRate, skill: l.skill, n: l.n }), ninoEffect: out.ninoEffect,
    },
  };
}
const result = { index, regions: {}, cases: {}, drivers: {} };
for (const r of index) {
  const R = load(r.id);
  const a = analyse(R, null);
  result.regions[r.id] = { name: r.name, detections: r.detections, seamJump: r.seamJump, cells: R.nc, ...a.res, pairs: undefined, val: { ...a.res.val, pairs: undefined } };
  result.regions[r.id].pairs = a.res.val.pairs;
  console.log(r.id, 'R2', a.res.val.r2.toFixed(3), 'naiveBias', a.res.val.naiveBias.toFixed(1), 'bias', a.res.val.bias.toFixed(1));
}
for (const c of CASES) {
  const R = load(c.region);
  const a = analyse(R, c.aoi);
  const { pairs, ...val } = a.res.val;
  result.cases[c.id] = { title: c.title, tag: c.tag, region: c.region, bbox: c.aoi.bbox, ...a.res, val };
  console.log(c.id, 'R2', val.r2.toFixed(3), 'nSig', a.res.nSig, '/', a.res.nHyp);
  if (['punjab', 'blacksummer', 'california', 'central', 'quebec'].includes(c.id)) {
    try {
      const d = await weatherDrivers({ h: a.h, season: a.se, oni }, { aoiBBox: () => c.aoi.bbox });
      result.drivers[c.id] = { r2: d.r2, imp: d.imp, worst: d.worst, crit: d.crit, years: d.years, fire: d.fire };
      console.log('  drivers R2', d.r2.toFixed(2));
    } catch (e) { console.log('  drivers failed', e.message); }
  }
}
result.events = JSON.parse(fs.readFileSync(new URL('events.json', D)));
result.oni = oni;
fs.writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(result));
console.log('done');
