import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, harmonize, climatology, season, trend, toCSV, monthlyRows, pointInPolygon, warningLevel } from '../src/harmonize.js';

// Synthetic region: one cell, MODIS sees fires; VIIRS sees exactly 2.5x MODIS in the overlap.
function synthetic(k = 2.5) {
  const y0 = 2000, nm = 26 * 12;
  const seasonal = [5, 20, 60, 40, 10, 2, 1, 1, 2, 30, 80, 15];
  const M = [], V = [];
  for (let i = 0; i < nm; i++) {
    const y = y0 + Math.floor(i / 12), m = i % 12;
    if (y === 2000 && m < 10) continue;
    const mv = seasonal[m] * (1 + 0.1 * ((y * 7) % 5));
    M.push([i, Math.round(mv)]);
    if (y >= 2012) V.push([i, Math.round(mv * k)]);
  }
  const pack = (arr) => {
    const kk = new Uint32Array(arr.length), vv = new Uint32Array(arr.length);
    arr.forEach(([i, v], j) => { kk[j] = (0 << 9) | i; vv[j] = v; });
    return { k: kk, v: vv };
  };
  return {
    y0, nm, nc: 1, res: 0.25, cellLat: new Float32Array([10]), cellLon: new Float32Array([76]),
    series: { M_fcd: pack(M), M_raw: pack(M.map(([i, v]) => [i, v * 2])), V_fcd: pack(V), V_raw: pack(V.map(([i, v]) => [i, v * 7])) },
  };
}

test('calibration recovers the true MODIS->VIIRS ratio', () => {
  const R = synthetic(2.5);
  const h = harmonize(R, null);
  // months with >= 5 fires/month (tiny months are dominated by integer rounding)
  for (const m of [0, 1, 2, 3, 4, 9, 10, 11]) assert.ok(Math.abs(h.cal.k[m] - 2.5) < 0.15, `k[${m}]=${h.cal.k[m]}`);
  assert.ok(Math.abs(h.cal.kAll - 2.5) < 0.05);
});

test('harmonized series is continuous across the 2012 seam', () => {
  const h = harmonize(synthetic(2.5), null);
  const sum = (y) => { let s = 0; for (let m = 0; m < 12; m++) s += h.H[(y - h.y0) * 12 + m]; return s; };
  const ratio = sum(2012) / sum(2011);
  assert.ok(ratio > 0.7 && ratio < 1.4, `seam ratio ${ratio}`);
  assert.equal(h.src[(2005 - 2000) * 12], 1);
  assert.equal(h.src[(2015 - 2000) * 12], 2);
});

test('cross-validation scores the calibration well and the naive splice badly', () => {
  const h = harmonize(synthetic(2.5), null);
  assert.ok(h.validation.r2 > 0.9, `r2 ${h.validation.r2}`);
  assert.ok(Math.abs(h.validation.bias) < 5);
  assert.ok(h.validation.naiveBias < -50, `naive bias ${h.validation.naiveBias}`);
});

test('a missing VIIRS archive year is filled from calibrated MODIS, not zero', () => {
  const R = synthetic(2.5);
  const { k, v } = R.series.V_fcd;
  const keep = [...k].map((kk, j) => [kk, v[j]]).filter(([kk]) => 2000 + Math.floor((kk & 511) / 12) !== 2021);
  R.series.V_fcd = { k: Uint32Array.from(keep.map((x) => x[0])), v: Uint32Array.from(keep.map((x) => x[1])) };
  const h = harmonize(R, null);
  let s2021 = 0, s2020 = 0;
  for (let m = 0; m < 12; m++) { s2021 += h.H[(2021 - 2000) * 12 + m]; s2020 += h.H[(2020 - 2000) * 12 + m]; }
  assert.equal(h.src[(2021 - 2000) * 12 + 5], 1);
  assert.ok(s2021 > 0.5 * s2020, `2021=${s2021} 2020=${s2020}`);
});

test('season finds the critical window and peak', () => {
  const h = harmonize(synthetic(), null);
  const se = season(climatology(h, 2001, 2025));
  assert.equal(se.peak, 10); // November
  assert.ok(se.window.len <= 8);
});

test('trend detects increase', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ year: 2001 + i, total: 100 + i * 10 }));
  const tr = trend(rows);
  assert.ok(Math.abs(tr.slope - 10) < 1e-9);
  assert.ok(tr.p < 0.001);
});

test('shrinkage keeps empty months finite', () => {
  const M = new Float64Array(312), V = new Float64Array(312);
  const cal = calibrate(M, V, 2000, [2012, 2013]);
  cal.k.forEach((k) => assert.ok(Number.isFinite(k) && k > 0));
});

test('polygon test + CSV export + warning level', () => {
  assert.ok(pointInPolygon(0.5, 0.5, [[0, 0], [1, 0], [1, 1], [0, 1]]));
  assert.ok(!pointInPolygon(2, 0.5, [[0, 0], [1, 0], [1, 1], [0, 1]]));
  const h = harmonize(synthetic(), null);
  const csv = toCSV(monthlyRows(h, 2010, 2013));
  assert.ok(csv.startsWith('year,month,harmonized_fcd'));
  assert.equal(csv.split('\n').length, 1 + 48);
  const clim = climatology(h, 2001, 2025);
  assert.equal(warningLevel(1000, clim, 10, 2026).level, 'Extreme');
  assert.equal(warningLevel(0, clim, 10, 2026).level, 'Below normal');
});
