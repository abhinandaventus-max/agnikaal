// Shared 16-number fire fingerprint (pipeline + browser): season shape x12, activity, trend, variability, ENSO link.
import { quantile } from './harmonize.js';
const Y0 = 2001;
const med = (a) => quantile([...a].sort((x, y) => x - y), 0.5);
function senPct(ys) {
  const s = []; for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) s.push((ys[j] - ys[i]) / (j - i));
  const m = med(ys); return m > 0 ? (med(s) * 10) / m : 0;
}
function spearman(a, b) {
  const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], k) => { r[i] = k; }); return r; };
  const ra = rank(a), rb = rank(b), n = a.length, mm = (n - 1) / 2; let nu = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { nu += (ra[i] - mm) * (rb[i] - mm); da += (ra[i] - mm) ** 2; db += (rb[i] - mm) ** 2; }
  return da && db ? nu / Math.sqrt(da * db) : 0;
}
/** Fingerprint from a [years][12] matrix of monthly activity and the number of cells it covers */
export function fingerprint(mat, nCells, oni) {
  const clim = Array.from({ length: 12 }, (_, m) => mat.reduce((a, r) => a + r[m], 0) / mat.length);
  const tot = clim.reduce((a, b) => a + b, 0) || 1;
  const annual = mat.map((r) => r.reduce((a, b) => a + b, 0));
  const mean = annual.reduce((a, b) => a + b, 0) / annual.length;
  const sd = Math.sqrt(annual.reduce((a, v) => a + (v - mean) ** 2, 0) / annual.length);
  const top = clim.map((v, m) => [m, v]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
  const fire = mat.map((r) => top.reduce((a, m) => a + r[m], 0));
  const on = mat.map((_, i) => top.reduce((a, m) => a + (oni[`${Y0 + i}-${String(m + 1).padStart(2, '0')}`] ?? 0), 0) / 3);
  const f = clim.map((v) => Math.sqrt(v / tot));
  f.push(Math.min(1, Math.max(0, Math.log10(1 + mean / Math.max(1, nCells)) / 3.5)));
  f.push(Math.min(1, Math.max(0, (senPct(annual) + 1) / 2)));
  f.push(Math.min(1, (sd / (mean || 1)) / 1.5));
  f.push((spearman(fire, on) + 1) / 2);
  return f;
}

