// Precompute (1) a 16-number "fire fingerprint" per grid cell for similar-place search and
// (2) a global catalogue of extreme fire events (space-time clusters of robust anomalies).
// Usage: node pipeline/discover.mjs   ->  public/data/fingerprints.{json,bin}, public/data/events.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRegion, harmonize, quantile } from '../src/harmonize.js';
import { fingerprint } from '../src/fingerprint.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = (f) => path.join(ROOT, 'public', 'data', f);
const index = JSON.parse(fs.readFileSync(D('index.json')));
const oni = JSON.parse(fs.readFileSync(D('oni.json'))).values;
const Y0 = 2001, Y1 = 2025, NY = Y1 - Y0 + 1;
const med = (a) => quantile([...a].sort((x, y) => x - y), 0.5);

const fpCells = []; const fpBytes = []; const events = [];
index.forEach((reg, ri) => {
  const meta = JSON.parse(fs.readFileSync(D(`${reg.id}.json`)));
  const b = fs.readFileSync(D(`${reg.id}.bin`));
  const R = decodeRegion(meta, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const k = harmonize(R, null).cal.k;
  // dense per-cell harmonized monthly series [cell][year][month]
  const S = new Float32Array(R.nc * NY * 12), vTot = new Float32Array(R.nc);
  const put = (name, fn) => { const { k: kk, v } = R.series[name]; for (let i = 0; i < kk.length; i++) { const c = kk[i] >>> 9, mi = kk[i] & 511, y = R.y0 + Math.floor(mi / 12); if (y < Y0 || y > Y1) continue; fn(c, y, mi % 12, v[i]); } };
  put('V_fcd', (c, y, m, v) => { if (y >= 2012) { S[(c * NY + y - Y0) * 12 + m] = v; vTot[c] += v; } });
  put('M_fcd', (c, y, m, v) => { if (y < 2012) S[(c * NY + y - Y0) * 12 + m] = v * k[m]; });
  let kept = 0;
  for (let c = 0; c < R.nc; c++) {
    if (vTot[c] < 25) continue;
    const mat = Array.from({ length: NY }, (_, yi) => Array.from({ length: 12 }, (_, m) => S[(c * NY + yi) * 12 + m]));
    const f = fingerprint(mat, 1, oni);
    fpCells.push(ri, meta.cells[2 * c], meta.cells[2 * c + 1]);
    fpBytes.push(...f.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255)));
    kept++;
  }
  // events: robust anomalies per cell & calendar month, clustered in space for each month
  const cand = new Map(); // month index -> [{c, cy, cx, v, z, ex}]
  for (let c = 0; c < R.nc; c++) for (let m = 0; m < 12; m++) {
    const xs = []; for (let yi = 0; yi < NY; yi++) xs.push(S[(c * NY + yi) * 12 + m]);
    const lx = xs.map((x) => Math.log1p(x)), md = med(lx), mad = Math.max(0.35, med(lx.map((x) => Math.abs(x - md))) * 1.4826), base = Math.expm1(md);
    xs.forEach((x, yi) => {
      const z = (Math.log1p(x) - md) / mad;
      if (z >= 3.5 && x >= 30 && x >= 3 * Math.max(1, base)) {
        const key = yi * 12 + m;
        if (!cand.has(key)) cand.set(key, []);
        cand.get(key).push({ c, cy: meta.cells[2 * c], cx: meta.cells[2 * c + 1], v: x, z, ex: x - base });
      }
    });
  }
  const regEvents = [];
  for (const [key, list] of cand) {
    const byPos = new Map(list.map((e) => [`${e.cy},${e.cx}`, e])), seen = new Set();
    for (const e of list) {
      if (seen.has(e)) continue;
      const comp = [], stack = [e]; seen.add(e);
      while (stack.length) {
        const q = stack.pop(); comp.push(q);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = byPos.get(`${q.cy + dy},${q.cx + dx}`); if (n && !seen.has(n)) { seen.add(n); stack.push(n); } }
      }
      const ex = comp.reduce((a, q) => a + q.ex, 0);
      if (comp.length < 2 && ex < 150) continue;
      const lat = comp.reduce((a, q) => a + (q.cy + 0.5) * R.res - 90, 0) / comp.length, lon = comp.reduce((a, q) => a + (q.cx + 0.5) * R.res - 180, 0) / comp.length;
      const ys = comp.map((q) => q.cy * R.res - 90), xs2 = comp.map((q) => q.cx * R.res - 180);
      regEvents.push({ region: reg.id, regionName: reg.name, year: Y0 + Math.floor(key / 12), month: key % 12, cells: comp.length,
        fcd: Math.round(comp.reduce((a, q) => a + q.v, 0)), excess: Math.round(ex), zmax: +Math.max(...comp.map((q) => q.z)).toFixed(1),
        lat: +lat.toFixed(2), lon: +lon.toFixed(2), bbox: [+(Math.min(...xs2) - 0.25).toFixed(2), +(Math.min(...ys) - 0.25).toFixed(2), +(Math.max(...xs2) + 0.5).toFixed(2), +(Math.max(...ys) + 0.5).toFixed(2)] });
    }
  }
  regEvents.sort((a, b) => b.excess - a.excess);
  events.push(...regEvents.slice(0, 30));
  console.log(`${reg.id}: ${kept} fingerprints, ${regEvents.length} events (top: ${regEvents.slice(0, 3).map((e) => `${e.year}-${e.month + 1} ${e.excess}`).join(', ')})`);
});
fs.writeFileSync(D('fingerprints.bin'), Buffer.from(Uint8Array.from(fpBytes)));
fs.writeFileSync(D('fingerprints.json'), JSON.stringify({ dims: 16, res: 0.25, regions: index.map((r) => ({ id: r.id, name: r.name })), cells: fpCells, features: ['clim x12 (sqrt share)', 'log activity', 'trend', 'variability', 'ENSO rho'] }));
events.sort((a, b) => b.excess - a.excess);
fs.writeFileSync(D('events.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), method: 'robust z >= 3.5 on log monthly FCD per cell & calendar month, >= 30 FCD and >= 3x median, 8-connected clusters per month', events }));
console.log('fingerprints', fpCells.length / 3, 'events', events.length, 'bin', fpBytes.length);
