import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harmonize, climatology, season, calendar, trend } from '../src/harmonize.js';
import { fireOutlook, fireRegimes, weeklyRisk, askAgniLite, buildFacts } from '../src/ai.js';

// Synthetic area: a dry-season fire calendar whose peak months are 60% higher in El Nino years.
function region({ nino = true } = {}) {
  const y0 = 2000, nm = 26 * 12, base = [10, 30, 90, 120, 40, 5, 2, 2, 3, 8, 12, 9];
  const oni = {};
  const M = [], V = [];
  for (let y = 1999; y <= 2026; y++) for (let m = 0; m < 12; m++) oni[`${y}-${String(m + 1).padStart(2, '0')}`] = +(1.6 * Math.sin((y * 12 + m) / 9)).toFixed(2);
  for (let i = 10; i < nm; i++) {
    const y = y0 + Math.floor(i / 12), m = i % 12;
    const o = oni[`${y}-${String(m + 1).padStart(2, '0')}`];
    const v = Math.round(base[m] * (nino && o >= 0.5 ? 1.6 : 1) * (1 + 0.15 * Math.sin(i * 1.7)));
    M.push([i, Math.max(0, Math.round(v / 2))]);
    if (y >= 2012) V.push([i, v]);
  }
  const pack = (arr, c = 0) => ({ k: Uint32Array.from(arr.map(([i]) => (c << 9) | i)), v: Uint32Array.from(arr.map(([, v]) => v)) });
  return { R: { y0, nm, nc: 1, res: 0.25, cellLat: new Float32Array([20]), cellLon: new Float32Array([78]),
    series: { M_fcd: pack(M), M_raw: pack(M), V_fcd: pack(V), V_raw: pack(V) } }, oni };
}

test('outlook detects the El Nino effect and beats chance in backtest', () => {
  const { R, oni } = region();
  const h = harmonize(R, null), clim = climatology(h, 2001, 2025);
  const o = fireOutlook(h, clim, oni, { year: 2026, month: 10, anom: 0, oni: 2.4 });
  assert.ok(o.ninoEffect > 0.3, `nino effect ${o.ninoEffect}`);
  assert.equal(o.leads.length, 6);
  const l1 = o.leads[0];
  assert.ok(l1.hitRate > 0.4, `hit rate ${l1.hitRate}`);
  const sum = l1.pBelow + l1.pNormal + l1.pAbove;
  assert.ok(Math.abs(sum - 1) < 1e-6);
  // strong El Nino now -> the peak months ahead should lean above normal
  const peak = o.leads.find((x) => x.month === 3);
  assert.ok(peak.pAbove > peak.pBelow, `Apr pAbove ${peak.pAbove} pBelow ${peak.pBelow}`);
});

test('regime clustering separates one-season and two-season calendars', () => {
  const nm = 26 * 12, nc = 80, k = [], v = [];
  const one = [1, 2, 20, 40, 10, 1, 0, 0, 0, 1, 1, 1], two = [1, 1, 2, 3, 30, 2, 1, 1, 2, 35, 25, 2];
  for (let c = 0; c < nc; c++) for (let i = (2012 - 2000) * 12; i < nm; i++) {
    const p = c < 40 ? one : two, val = p[i % 12] * (1 + (c % 5) * 0.1);
    if (val > 0) { k.push((c << 9) | i); v.push(Math.round(val)); }
  }
  const R = { y0: 2000, nm, nc, series: { V_fcd: { k: Uint32Array.from(k), v: Uint32Array.from(v) } } };
  const rg = fireRegimes(R, 2);
  assert.ok(rg);
  assert.notEqual(rg.cellRegime[0], rg.cellRegime[79]);
  assert.ok(rg.regimes.some((r) => /Two-season/.test(r.name)), rg.regimes.map((r) => r.name).join(' | '));
});

test('weekly risk rises with fire weather and season timing', () => {
  const clim = Array.from({ length: 12 }, (_, m) => ({ med: m === 3 ? 100 : 5 }));
  const calm = weeklyRisk({ wx: { maxLvl: 0, meanHdw: 2 }, clim, month: 7, live: null });
  const hot = weeklyRisk({ wx: { maxLvl: 3, meanHdw: 35 }, clim, month: 3, live: { warn: { code: 4 } } });
  assert.equal(calm.level, 'Low');
  assert.ok(['High', 'Very high'].includes(hot.level), hot.level);
});

test('Ask Agni (instant) answers from facts only', () => {
  const { R, oni } = region();
  const h = harmonize(R, null), clim = climatology(h, 2001, 2025), rows = calendar(h, 2001, 2025);
  const S = { h, clim, rows, season: season(clim), trend: trend(rows), region: { name: 'Testland' }, aoi: null, yA: 2001, yB: 2025 };
  S.outlook = fireOutlook(h, clim, oni, { year: 2026, month: 10, anom: 0, oni: 2.4 });
  const f = buildFacts(S);
  assert.match(askAgniLite('When is the fire season?', f), /April|March/);
  assert.match(askAgniLite('What was 2016 like?', f), /2016/);
  assert.match(askAgniLite('What do the next months look like?', f), /outlook/i);
  assert.match(askAgniLite('Does El Niño matter here?', f), /El Niño/);
  assert.match(askAgniLite('hello', f), /try/i);
});
