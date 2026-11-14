import * as d3 from 'd3';
import { MONTHS, anomaly, percentileRank } from './harmonize.js';

export const PALETTES = {
  inferno: (t) => d3.interpolateInferno(0.08 + 0.9 * t),
  cividis: d3.interpolateCividis,
  viridis: d3.interpolateViridis,
  ylorrd: (t) => d3.interpolateYlOrRd(0.12 + 0.88 * t),
};
export const DIVERGING = (t) => d3.interpolateRdBu(1 - t); // blue = below, red = above

const fmt = d3.format(',.0f');
const logTicks = (max) => [0, 10, 100, 1000, 10000, 100000, 1000000].filter((v) => v <= max * 1.05);
const fmt1 = d3.format(',.1f');
export const nice = (v) => (v == null ? '–' : v >= 1e6 ? d3.format('.2s')(v) : v >= 100 ? fmt(v) : fmt1(v));

const tip = () => document.getElementById('tip');
export function showTip(html, ev) {
  const t = tip(); t.innerHTML = html; t.classList.add('show');
  const x = Math.min(ev.clientX + 14, window.innerWidth - t.offsetWidth - 10);
  const y = ev.clientY + 16 + t.offsetHeight > window.innerHeight ? ev.clientY - t.offsetHeight - 12 : ev.clientY + 16;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
export function hideTip() { tip().classList.remove('show'); }
const row = (a, b) => `<div class="t-row"><span>${a}</span><span>${b}</span></div>`;

/** Year x month burning calendar heatmap */
export function drawCalendar(el, { rows, clim, mode, palette, raw, h, onHover }) {
  el.innerHTML = '';
  // width-aware layout so 10px labels stay legible on phones
  const W = Math.max(330, Math.min(640, el.clientWidth || 640));
  const narrow = W < 520, left = 38, top = 24, gap = 8;
  const totW = narrow ? 44 : 90;
  const cw = Math.min(36, (W - left - gap - totW - (narrow ? 30 : 46)) / 12);
  const ch = Math.max(narrow ? 13 : 14, Math.min(22, 440 / rows.length));
  const H = top + rows.length * ch + (narrow ? 90 : 72);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img')
    .attr('aria-label', 'Burning activity calendar: rows are years, columns are months');
  const vals = rows.flatMap((r) => r.vals.filter((v) => v != null));
  const vmax = d3.max(vals) || 1;
  const pal = PALETTES[palette] || PALETTES.inferno;
  const countScale = d3.scaleSqrt().domain([0, vmax]).range([0, 1]);
  const color = (v, m) => {
    if (v == null) return 'rgba(255,255,255,0.03)';
    if (mode === 'anom') { const z = anomaly(v, clim[m]); return DIVERGING(Math.max(0, Math.min(1, 0.5 + z / 6))); }
    if (mode === 'pct') { const p = percentileRank(v, clim[m].values); return pal(p / 100); }
    return v === 0 ? '#11131c' : pal(countScale(v));
  };
  svg.selectAll('text.mh').data(MONTHS).join('text').attr('class', 'mh')
    .attr('x', (d, i) => left + i * cw + cw / 2).attr('y', top - 8).attr('text-anchor', 'middle').text((d) => (narrow ? d[0] : d));
  const g = svg.append('g');
  rows.forEach((r, ri) => {
    const y = top + ri * ch;
    g.append('text').attr('x', left - 8).attr('y', y + ch / 2 + 3).attr('text-anchor', 'end').text(r.year)
      .style('fill', r.year < 2012 ? 'var(--modis)' : 'var(--viirs)');
    r.vals.forEach((v, m) => {
      const i = (r.year - h.y0) * 12 + m;
      const rawv = r.year < 2012 ? h.Mr[i] : h.Vr[i];
      const shown = raw ? (h.src[i] ? rawv : null) : v;
      const rect = g.append('rect').attr('class', 'cal-cell')
        .attr('x', left + m * cw + 1).attr('y', y + 1).attr('width', cw - 2).attr('height', ch - 2).attr('rx', 3)
        .attr('fill', raw ? (shown == null ? 'rgba(255,255,255,0.03)' : pal(Math.min(1, Math.sqrt(shown / (rawMax(h, rows) || 1))))) : color(v, m))
        .style('opacity', 0);
      if (!raw && h.src[i] === 1) rect.attr('stroke', 'rgba(169,139,255,0.35)').attr('stroke-width', 0.6);
      rect.transition().delay(ri * 18 + m * 6).duration(380).style('opacity', 1);
      rect.on('mousemove', (ev) => {
        const z = v == null ? null : anomaly(v, clim[m]);
        const p = v == null ? null : percentileRank(v, clim[m].values);
        showTip(`<b>${MONTHS[m]} ${r.year}</b>` +
          row('Harmonized FCD', nice(v)) +
          row('Median (baseline)', nice(clim[m].med)) +
          row('Anomaly', z == null ? '–' : (z > 0 ? '+' : '') + z.toFixed(2) + ' σ') +
          row('Percentile', p == null ? '–' : p.toFixed(0) + 'th') +
          row('Raw detections', nice(rawv)) +
          row('Source', h.src[i] === 2 ? 'VIIRS S-NPP' : h.src[i] === 1 ? 'MODIS × k̂ₘ' : '–'), ev);
        onHover && onHover(r.year, m);
      }).on('mouseleave', hideTip);
    });
  });
  // annual totals bars
  const tx = left + 12 * cw + gap;
  const totals = rows.map((r) => (raw ? r.vals.reduce((a, _, m) => a + (r.year < 2012 ? h.Mr[(r.year - h.y0) * 12 + m] : h.Vr[(r.year - h.y0) * 12 + m]), 0) : r.total));
  const tmax = d3.max(totals) || 1;
  svg.append('text').attr('x', tx).attr('y', top - 8).text(narrow ? 'Total' : raw ? 'Raw total' : 'Year total');
  totals.forEach((t, ri) => {
    const y = top + ri * ch;
    svg.append('rect').attr('x', tx).attr('y', y + 3).attr('height', ch - 6).attr('rx', 2).attr('width', 0)
      .attr('fill', rows[ri].year < 2012 ? 'var(--modis)' : 'var(--viirs)').attr('opacity', 0.8)
      .transition().delay(300 + ri * 18).duration(600).attr('width', (t / tmax) * totW);
    svg.append('text').attr('x', tx + (t / tmax) * totW + 4).attr('y', y + ch / 2 + 3).text(narrow ? d3.format('.2s')(t) : nice(t)).style('font-size', '9px');
  });
  // climatology strip
  const cy = top + rows.length * ch + 10;
  svg.append('text').attr('x', left - 8).attr('y', cy + 11).attr('text-anchor', 'end').text('med');
  const medMax = d3.max(clim, (c) => c.med) || 1;
  clim.forEach((c, m) => {
    svg.append('rect').attr('x', left + m * cw + 1).attr('y', cy).attr('width', cw - 2).attr('height', 16).attr('rx', 3)
      .attr('fill', pal(Math.sqrt(c.med / medMax))).on('mousemove', (ev) => showTip(`<b>${MONTHS[m]} baseline</b>${row('Median', nice(c.med))}${row('P90', nice(c.p90))}${row('Max', nice(c.max))}`, ev)).on('mouseleave', hideTip);
  });
  // legend
  const lg = svg.append('g').attr('transform', `translate(${left},${cy + 30})`);
  const defs = svg.append('defs');
  const gid = 'lg' + Math.random().toString(36).slice(2);
  const grad = defs.append('linearGradient').attr('id', gid);
  d3.range(0, 1.01, 0.1).forEach((t) => grad.append('stop').attr('offset', t).attr('stop-color', mode === 'anom' && !raw ? DIVERGING(t) : pal(t)));
  const LW = Math.min(200, W - left - 20);
  lg.append('rect').attr('width', LW).attr('height', 8).attr('rx', 4).attr('fill', `url(#${gid})`);
  const lbl = raw ? ['0', 'raw detections (sensor-dependent)', nice(rawMax(h, rows))]
    : mode === 'anom' ? ['−3σ below', 'robust anomaly vs median', '+3σ above']
      : mode === 'pct' ? ['0th', 'percentile within month', '100th'] : ['0', 'fire cell-days (VIIRS-eq.)', nice(vmax)];
  lg.append('text').attr('y', 21).text(lbl[0]);
  lg.append('text').attr('x', LW).attr('y', 21).attr('text-anchor', 'end').text(lbl[2]);
  lg.append('text').attr('y', 35).text(lbl[1]);
  const mx0 = narrow ? 0 : LW + 30, my0 = narrow ? 44 : -2;
  lg.append('rect').attr('x', mx0).attr('y', my0).attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', 'none').attr('stroke', 'rgba(169,139,255,0.6)');
  lg.append('text').attr('x', mx0 + 18).attr('y', my0 + 10).text('MODIS-derived (2001–2011)');
  return svg.node();
}
function rawMax(h, rows) {
  let m = 0;
  for (const r of rows) for (let k = 0; k < 12; k++) { const i = (r.year - h.y0) * 12 + k; m = Math.max(m, r.year < 2012 ? h.Mr[i] : h.Vr[i]); }
  return m;
}

/** Radial "fire season clock" */
export function drawSeasonClock(el, { clim, season, h, year, palette }) {
  el.innerHTML = '';
  const S = 360, R = 150, r0 = 46, c = S / 2;
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${S} ${S}`).attr('role', 'img').attr('aria-label', 'Fire season clock');
  const g = svg.append('g').attr('transform', `translate(${c},${c})`);
  const vmax = d3.max(clim, (d) => d.p90) || 1;
  const rs = d3.scaleSqrt().domain([0, vmax]).range([r0, R]);
  const pal = PALETTES[palette] || PALETTES.inferno;
  const a = (m) => (m / 12) * 2 * Math.PI;
  [0.25, 0.5, 0.75, 1].forEach((t) => g.append('circle').attr('r', rs(vmax * t)).attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.06)'));
  if (season && season.critical) {
    season.critical.forEach((m) => g.append('path').attr('d', d3.arc()({ innerRadius: R + 6, outerRadius: R + 14, startAngle: a(m) + 0.02, endAngle: a(m + 1) - 0.02 }))
      .attr('fill', 'var(--fire)').attr('opacity', 0.9));
  }
  const arc = d3.arc().padAngle(0.03).cornerRadius(4);
  clim.forEach((cl, m) => {
    g.append('path').attr('d', arc({ innerRadius: r0, outerRadius: rs(cl.p90), startAngle: a(m), endAngle: a(m + 1) })).attr('fill', 'rgba(255,255,255,0.06)');
    const p = g.append('path').attr('fill', pal(Math.sqrt(cl.med / vmax))).attr('d', arc({ innerRadius: r0, outerRadius: r0, startAngle: a(m), endAngle: a(m + 1) }));
    p.transition().delay(m * 50).duration(700).attrTween('d', () => { const i = d3.interpolate(r0, rs(cl.med)); return (t) => arc({ innerRadius: r0, outerRadius: i(t), startAngle: a(m), endAngle: a(m + 1) }); });
    p.on('mousemove', (ev) => showTip(`<b>${MONTHS[m]}</b>${row('Median', nice(cl.med))}${row('P10–P90', nice(cl.p10) + ' – ' + nice(cl.p90))}`, ev)).on('mouseleave', hideTip);
    const lx = Math.sin(a(m + 0.5)) * (R + 26), ly = -Math.cos(a(m + 0.5)) * (R + 26);
    g.append('text').attr('x', lx).attr('y', ly + 3).attr('text-anchor', 'middle').text(MONTHS[m]);
  });
  // selected year path
  if (year != null) {
    const pts = d3.range(12).map((m) => { const i = (year - h.y0) * 12 + m; const v = h.src[i] ? h.H[i] : 0; return [a(m + 0.5), rs(Math.min(v, vmax * 1.6))]; });
    const line = d3.lineRadial().curve(d3.curveCardinalClosed);
    const path = g.append('path').attr('d', line(pts)).attr('fill', 'none').attr('stroke', 'var(--viirs)').attr('stroke-width', 2).attr('stroke-dasharray', '4 3');
    const len = path.node().getTotalLength();
    path.attr('stroke-dashoffset', len).transition().duration(1200).attr('stroke-dashoffset', 0);
  }
  if (season) {
    const ang = ((season.peakMonthFloat + 0.5) / 12) * 2 * Math.PI;
    const needle = g.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 0).attr('stroke', 'var(--fire-3)').attr('stroke-width', 3).attr('stroke-linecap', 'round');
    needle.transition().duration(1200).attr('x2', Math.sin(ang) * (r0 + (R - r0) * season.concentration)).attr('y2', -Math.cos(ang) * (r0 + (R - r0) * season.concentration));
  }
  g.append('circle').attr('r', r0 - 6).attr('fill', '#0c0e16').attr('stroke', 'var(--line-2)');
  g.append('text').attr('text-anchor', 'middle').attr('y', -2).style('font-size', '18px').style('fill', 'var(--text)').style('font-family', 'Space Grotesk')
    .text(season ? MONTHS[season.peak] : '–');
  g.append('text').attr('text-anchor', 'middle').attr('y', 14).text('peak');
  return svg.node();
}

/** Annual totals with raw splice overlay and Theil-Sen trend */
export function drawTrend(el, { rows, h, tr, showRaw }) {
  el.innerHTML = '';
  const W = 640, H = 300, m = { l: 48, r: 14, t: 16, b: 28 };
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Annual fire activity trend');
  const x = d3.scaleBand().domain(rows.map((r) => r.year)).range([m.l, W - m.r]).padding(0.22);
  const rawTot = rows.map((r) => d3.sum(d3.range(12), (k) => { const i = (r.year - h.y0) * 12 + k; return r.year < 2012 ? h.Mr[i] : h.Vr[i]; }));
  const lo = rows.map((r) => d3.sum(d3.range(12), (k) => h.lo[(r.year - h.y0) * 12 + k]));
  const hi = rows.map((r) => d3.sum(d3.range(12), (k) => h.hi[(r.year - h.y0) * 12 + k]));
  const ymax = d3.max([...rows.map((r) => r.total), ...hi, ...(showRaw ? rawTot : [])]) || 1;
  const y = d3.scaleLinear().domain([0, ymax * 1.08]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(x.domain().filter((d) => d % 4 === 0 || d === rows.at(-1).year)).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2s')).tickSize(-(W - m.l - m.r))).call((g) => g.selectAll('line').attr('stroke', 'rgba(255,255,255,0.05)')).select('.domain').remove();
  svg.selectAll('rect.bar').data(rows).join('rect').attr('class', 'bar').attr('x', (d) => x(d.year)).attr('width', x.bandwidth()).attr('rx', 3)
    .attr('fill', (d) => (d.year < 2012 ? 'url(#gm)' : 'url(#gv)')).attr('y', H - m.b).attr('height', 0)
    .on('mousemove', (ev, d) => { const i = rows.indexOf(d); showTip(`<b>${d.year}</b>${row('Harmonized FCD', nice(d.total))}${d.year < 2012 ? row('Range', nice(lo[i]) + ' – ' + nice(hi[i])) : ''}${row('Raw detections', nice(rawTot[i]))}`, ev); }).on('mouseleave', hideTip)
    .transition().delay((d, i) => i * 25).duration(700).attr('y', (d) => y(d.total)).attr('height', (d) => y(0) - y(d.total));
  const defs = svg.append('defs');
  [['gm', '#7c5cff', '#a98bff'], ['gv', '#2196d3', '#5ad1ff']].forEach(([id, a, b]) => { const gr = defs.append('linearGradient').attr('id', id).attr('x1', 0).attr('x2', 0).attr('y1', 1).attr('y2', 0); gr.append('stop').attr('offset', 0).attr('stop-color', a).attr('stop-opacity', 0.55); gr.append('stop').attr('offset', 1).attr('stop-color', b); });
  rows.forEach((r, i) => { if (r.year < 2012) svg.append('line').attr('x1', x(r.year) + x.bandwidth() / 2).attr('x2', x(r.year) + x.bandwidth() / 2).attr('y1', y(lo[i])).attr('y2', y(hi[i])).attr('stroke', '#fff').attr('opacity', 0.45); });
  if (showRaw) {
    const ln = d3.line().x((d, i) => x(rows[i].year) + x.bandwidth() / 2).y((d) => y(d));
    const p = svg.append('path').attr('d', ln(rawTot)).attr('fill', 'none').attr('stroke', 'var(--fire)').attr('stroke-width', 2.2);
    const L = p.node().getTotalLength(); p.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(1400).attr('stroke-dashoffset', 0);
  }
  if (tr) {
    const xa = rows[0].year, xb = rows.at(-1).year;
    svg.append('line').attr('x1', x(xa) + x.bandwidth() / 2).attr('x2', x(xb) + x.bandwidth() / 2)
      .attr('y1', y(Math.max(0, tr.intercept + tr.slope * xa))).attr('y2', y(Math.max(0, tr.intercept + tr.slope * xb)))
      .attr('stroke', 'var(--fire-3)').attr('stroke-width', 2).attr('stroke-dasharray', '6 4');
  }
  if (rows.some((r) => r.year === 2012)) {
    const sx = x(2012) - x.step() * x.paddingInner() / 2;
    svg.append('line').attr('x1', sx).attr('x2', sx).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--fire)').attr('stroke-dasharray', '3 3').attr('opacity', 0.6);
    svg.append('text').attr('x', sx + 4).attr('y', m.t + 8).text('VIIRS era →').style('fill', 'var(--fire-2)');
  }
  return svg.node();
}

/** Monthly time series: raw MODIS, raw VIIRS, harmonized */
export function drawSeries(el, { h, yA, yB }) {
  el.innerHTML = '';
  const W = 640, H = 230, m = { l: 48, r: 10, t: 12, b: 24 };
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Monthly raw and harmonized series');
  const i0 = (Math.max(yA, 2000) - h.y0) * 12, i1 = (yB - h.y0) * 12 + 11;
  const idx = d3.range(i0, i1 + 1);
  const date = (i) => new Date(h.y0 + Math.floor(i / 12), i % 12, 15);
  const x = d3.scaleTime().domain([date(i0), date(i1)]).range([m.l, W - m.r]);
  const ymax = d3.max(idx, (i) => Math.max(h.H[i], h.Mr[i], h.Vr[i])) || 1;
  const y = d3.scaleSymlog().constant(10).domain([0, ymax]).range([H - m.b, m.t]);
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(logTicks(ymax)).tickFormat(d3.format('~s')).tickSize(-(W - m.l - m.r))).call((g) => g.selectAll('line').attr('stroke', 'rgba(255,255,255,0.05)')).select('.domain').remove();
  const line = (acc, keep) => d3.line().defined((i) => keep(i)).x((i) => x(date(i))).y((i) => y(acc(i))).curve(d3.curveMonotoneX);
  const add = (d, color, w, dash) => { const p = svg.append('path').attr('d', d).attr('fill', 'none').attr('stroke', color).attr('stroke-width', w).attr('stroke-dasharray', dash || null).attr('opacity', 0.95); return p; };
  const area = d3.area().defined((i) => h.src[i] === 1).x((i) => x(date(i))).y0((i) => y(h.lo[i])).y1((i) => y(h.hi[i])).curve(d3.curveMonotoneX);
  svg.append('path').attr('d', area(idx)).attr('fill', 'rgba(255,179,71,0.18)');
  add(line((i) => h.Mr[i], (i) => h.src[i] > 0)(idx), 'var(--modis)', 1.2, '2 2');
  add(line((i) => h.Vr[i], (i) => h.y0 + Math.floor(i / 12) >= 2012)(idx), 'var(--viirs)', 1.2, '2 2');
  const hp = add(line((i) => h.H[i], (i) => h.src[i] > 0)(idx), 'var(--fire-2)', 2.2);
  const L = hp.node().getTotalLength(); hp.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(1600).attr('stroke-dashoffset', 0);
  return svg.node();
}

/** Overlap scatter: MODIS FCD vs VIIRS FCD (monthly) with fitted k */
export function drawScatter(el, { pairs, kAll }) {
  el.innerHTML = '';
  const S = 300, m = 36;
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${S} ${S}`).attr('role', 'img').attr('aria-label', 'Overlap scatter of MODIS vs VIIRS fire cell-days');
  const mx = d3.max(pairs, (p) => Math.max(p[0], p[1])) || 10;
  const sc = d3.scaleSymlog().constant(5).domain([0, mx]).range([0, S - 2 * m]);
  const g = svg.append('g').attr('transform', `translate(${m},${m / 2})`);
  const Hh = S - 2 * m;
  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${Hh})`).call(d3.axisBottom(sc).tickValues(logTicks(mx)).tickFormat(d3.format('~s')));
  g.append('g').attr('class', 'axis').call(d3.axisLeft(sc.copy().range([Hh, 0])).tickValues(logTicks(mx)).tickFormat(d3.format('~s')));
  g.selectAll('circle').data(pairs).join('circle').attr('cx', (p) => sc(p[0])).attr('cy', (p) => Hh - sc(p[1])).attr('r', 0)
    .attr('fill', 'var(--viirs)').attr('opacity', 0.55).transition().delay((d, i) => i * 3).attr('r', 2.6);
  const xs = d3.range(0, mx, mx / 60);
  g.append('path').attr('d', d3.line().x((v) => sc(v)).y((v) => Hh - sc(Math.min(mx, v * kAll)))(xs)).attr('stroke', 'var(--fire-2)').attr('stroke-width', 2).attr('fill', 'none');
  g.append('path').attr('d', d3.line().x((v) => sc(v)).y((v) => Hh - sc(v))(xs)).attr('stroke', 'rgba(255,255,255,0.3)').attr('stroke-dasharray', '3 3').attr('fill', 'none');
  g.append('text').attr('x', Hh / 2).attr('y', Hh + 30).attr('text-anchor', 'middle').text('MODIS FCD / month');
  g.append('text').attr('transform', `translate(-28,${Hh / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('VIIRS FCD / month');
  return svg.node();
}

/** k by month with ±sd */
export function drawK(el, { cal }) {
  el.innerHTML = '';
  const W = 300, H = 300, m = { l: 34, r: 8, t: 14, b: 36 };
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Monthly calibration factors');
  const x = d3.scaleBand().domain(d3.range(12)).range([m.l, W - m.r]).padding(0.25);
  const ymax = d3.max(d3.range(12), (i) => cal.k[i] + cal.sd[i]) || 2;
  const y = d3.scaleLinear().domain([0, ymax * 1.1]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat((i) => MONTHS[i][0]).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r))).call((g) => g.selectAll('line').attr('stroke', 'rgba(255,255,255,0.05)')).select('.domain').remove();
  d3.range(12).forEach((i) => {
    svg.append('rect').attr('x', x(i)).attr('width', x.bandwidth()).attr('rx', 3).attr('fill', 'var(--fire)').attr('opacity', 0.85).attr('y', y(0)).attr('height', 0)
      .on('mousemove', (ev) => showTip(`<b>${MONTHS[i]}</b>${row('k̂ₘ', cal.k[i].toFixed(2))}${row('± sd', cal.sd[i].toFixed(2))}`, ev)).on('mouseleave', hideTip)
      .transition().delay(i * 40).duration(600).attr('y', y(cal.k[i])).attr('height', y(0) - y(cal.k[i]));
    svg.append('line').attr('x1', x(i) + x.bandwidth() / 2).attr('x2', x(i) + x.bandwidth() / 2).attr('y1', y(Math.max(0, cal.k[i] - cal.sd[i]))).attr('y2', y(cal.k[i] + cal.sd[i])).attr('stroke', '#fff').attr('opacity', 0.5);
  });
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(cal.kAll)).attr('y2', y(cal.kAll)).attr('stroke', 'var(--viirs)').attr('stroke-dasharray', '4 3');
  svg.append('text').attr('x', W - m.r).attr('y', y(cal.kAll) - 4).attr('text-anchor', 'end').text('k̄ = ' + cal.kAll.toFixed(2)).style('fill', 'var(--viirs)');
  return svg.node();
}

/** Semi-circular early-warning gauge */
export function drawGauge(el, { pr, level, code }) {
  el.innerHTML = '';
  const W = 240, H = 150, R = 100, cx = 120, cy = 128;
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', `Early warning level ${level}`);
  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);
  const bands = [[0, 40, '#5ad1ff'], [40, 75, '#4ade80'], [75, 90, '#fbbf24'], [90, 100, '#f43f5e']];
  const ang = (p) => -Math.PI / 2 + (p / 100) * Math.PI;
  bands.forEach(([a, b, c]) => g.append('path').attr('d', d3.arc()({ innerRadius: R - 16, outerRadius: R, startAngle: ang(a), endAngle: ang(b), padAngle: 0.02 })).attr('fill', c).attr('opacity', 0.85));
  const needle = g.append('g').attr('transform', `rotate(${-90})`);
  needle.append('path').attr('d', `M-4,0 L0,${-(R - 22)} L4,0 Z`).attr('fill', '#fff');
  g.append('circle').attr('r', 8).attr('fill', '#fff');
  needle.transition().duration(1600).ease(d3.easeElasticOut.amplitude(1).period(0.5)).attr('transform', `rotate(${-90 + ((pr ?? 0) / 100) * 180})`);
  svg.append('text').attr('x', cx).attr('y', 24).attr('text-anchor', 'middle').attr('class', 'lvl-' + code).style('font-size', '16px').style('font-family', 'Space Grotesk').style('fill', 'currentColor').text(level);
  return svg.node();
}

/** Daily bar chart of live detections */
export function drawDaily(el, { days }) {
  el.innerHTML = '';
  const W = 400, H = 150, m = { l: 34, r: 6, t: 10, b: 22 };
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleBand().domain(days.map((d) => d.date)).range([m.l, W - m.r]).padding(0.25);
  const y = d3.scaleLinear().domain([0, d3.max(days, (d) => d.n) || 1]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat((d) => d.slice(5)).tickSize(0)).select('.domain').remove();
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0)).select('.domain').remove();
  svg.selectAll('rect').data(days).join('rect').attr('x', (d) => x(d.date)).attr('width', x.bandwidth()).attr('rx', 3).attr('fill', '#ff3b5c').attr('y', y(0)).attr('height', 0)
    .transition().delay((d, i) => i * 60).duration(600).attr('y', (d) => y(d.n)).attr('height', (d) => y(0) - y(d.n));
  return svg.node();
}
