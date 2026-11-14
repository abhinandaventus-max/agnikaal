import './styles.css';
import './deck.css';
import * as d3 from 'd3';
import { decodeRegion, cellMask, harmonize, calendar, climatology, season, trend, MONTHS } from './harmonize.js';
import { drawTrend, drawScatter, drawCalendar } from './charts.js';

const $ = (s) => document.querySelector(s);
const slides = [...document.querySelectorAll('.slide')];
const GH = import.meta.env.VITE_GITHUB_URL;
if (GH) $('#dGh').textContent = GH.replace('https://', '');

// navigation
let cur = 0;
const go = (i) => { cur = Math.max(0, Math.min(slides.length - 1, i)); slides[cur].scrollIntoView({ behavior: 'smooth' }); };
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { cur = slides.indexOf(e.target); $('#slideNo').textContent = `${cur + 1} / ${slides.length}`; e.target.classList.add('on'); } }), { threshold: 0.55 });
slides.forEach((s) => io.observe(s));
window.addEventListener('keydown', (e) => {
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(cur + 1); }
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
  if (e.key.toLowerCase() === 'p') window.print();
});

async function main() {
  const [meta, buf] = await Promise.all([fetch('/data/india.json').then((r) => r.json()), fetch('/data/india.bin').then((r) => r.arrayBuffer())]);
  const R = decodeRegion(meta, buf);
  const h = harmonize(R, null);
  const rows = calendar(h, 2001, 2025);
  const v = h.validation;
  $('#dSeam').textContent = `${meta.seamJump.toFixed(1)}×`;
  $('#dDet').textContent = `${(meta.detections / 1e6).toFixed(1)} M`;
  $('#dR2').textContent = v.r2.toFixed(2);
  $('#dBias').textContent = `${v.bias >= 0 ? '+' : ''}${v.bias.toFixed(1)}%`;
  $('#dNaive').textContent = `${v.naiveBias.toFixed(0)}%`;
  drawTrend($('#dRaw'), { rows, h, tr: trend(rows), showRaw: true });
  drawScatter($('#dScatter'), { pairs: v.pairs.filter((p) => p[0] + p[1] > 0), kAll: h.cal.kAll });

  const { mask } = cellMask(R, { type: 'bbox', bbox: [73.8, 29.5, 77.2, 32.6] });
  const hp = harmonize(R, mask);
  const prow = calendar(hp, 2001, 2025);
  const clim = climatology(hp, 2001, 2025);
  const se = season(clim);
  const tr = trend(prow);
  const worst = prow.reduce((a, b) => (b.total > a.total ? b : a));
  $('#dWorst').textContent = worst.year;
  $('#dTrend').textContent = `${tr.pctPerDecade >= 0 ? '+' : ''}${tr.pctPerDecade.toFixed(0)}%/decade (${tr.p < 0.05 ? 'significant' : 'not significant'})`;
  $('#dCrit').textContent = se.critical.map((m) => MONTHS[m]).join(' · ');
  $('#dCritPct').textContent = `${Math.round(se.criticalShare * 100)}%`;
  drawCalendar($('#dCal'), { rows: prow, clim, mode: 'count', palette: 'inferno', raw: false, h: hp });
  void d3;
}
main();
