// UI for the AI features: Outlook (forecast + fire weather), Fire regimes, Ask Agni chat.
import { MONTHS, monthlyRows, toCSV } from './harmonize.js';
import { autoInsights, methodsText, BIBTEX, notebook, buildKML, googleEarthUrl, aoiGeoJSON, cellTotals } from './research.js';
import { renderSimilar, renderEvents, renderDrivers } from './discover.js';
import { nice } from './charts.js';
import { fireOutlook, latestOni, fireWeather, weeklyRisk, WX_LEVEL, fireRegimes, REGIME_COLORS, buildFacts, askAgniLite, agniSystemPrompt } from './ai.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<i class="guard">$2</i>').replace(/\n/g, '<br>');
const LVL_CLASS = { Low: 'lvl-1', Moderate: 'lvl-2', High: 'lvl-3', 'Very high': 'lvl-4', 'Below normal': 'lvl-1', 'Near normal': 'lvl-2', 'Above normal': 'lvl-4', 'No clear signal': 'muted' };

// ------------------------------------------------------------------ state helpers
export function ensureOutlook(S, ctx) {
  if (!S.oni) return null;
  const key = ctx.aoiKey() + '|' + (S.live && S.liveFor === ctx.aoiKey() ? 'L' : '-');
  if (S.outlook && S.outlookKey === key) return S.outlook;
  const now = new Date(), month = now.getMonth(), year = now.getFullYear();
  const { value, key: ok } = latestOni(S.oni);
  let anom = null;
  if (S.live && S.liveFor === ctx.aoiKey()) anom = Math.log1p(S.live.warn.est) - Math.log1p(S.clim[month].med);
  S.outlook = fireOutlook(S.h, S.clim, S.oni, { year, month, anom, oni: value, oniMonth: ok });
  S.outlook.usedLive = anom != null;
  S.outlookKey = key;
  return S.outlook;
}
export function ensureRegimes(S) {
  const R = S.region;
  if (R.regimes === undefined) R.regimes = fireRegimes(R);
  const rg = R.regimes;
  S.aoiRegime = null;
  if (rg) {
    const counts = new Array(rg.regimes.length).fill(0);
    for (let i = 0; i < R.nc; i++) if (rg.cellRegime[i] >= 0 && (!S.mask || S.mask[i])) counts[rg.cellRegime[i]]++;
    const best = counts.indexOf(Math.max(...counts));
    if (counts[best] > 0) S.aoiRegime = { ...rg.regimes[best], idx: best, counts };
  }
  return rg;
}
export async function ensureWeather(S, ctx) {
  const key = ctx.aoiKey();
  if (S.wx && S.wxKey === key) return S.wx;
  const [w, s, e, n] = ctx.aoiBBox();
  S.wx = await fireWeather((s + n) / 2, (w + e) / 2);
  S.wxKey = key;
  return S.wx;
}

// ------------------------------------------------------------------ OUTLOOK TAB
export async function renderOutlook(el, S, ctx) {
  const o = ensureOutlook(S, ctx);
  el.innerHTML = `<h4>AI fire outlook for ${esc(S.aoi ? S.aoi.label : S.region.name)}</h4>
    <div class="sub">This week's risk from the 7-day weather forecast, the normal season and live satellites, plus a 6-month AI outlook trained on 25 years of this area's harmonized record and the El Niño index.</div>
    <div id="riskBox" class="risk-box"><div class="spinner"></div><span>Loading 7-day fire weather (Open-Meteo)…</span></div>
    <h5 class="ai-h">Next 6 months</h5>
    <div class="outlook-strip">${o ? o.leads.filter(Boolean).map(card).join('') : '<p class="note">Outlook needs the ENSO index; reload the page.</p>'}</div>
    ${o ? modelCard(o, S) : ''}`;
  try {
    if (!S.live || S.liveFor !== ctx.aoiKey()) ctx.fetchLive().catch(() => {});
    const wx = await ensureWeather(S, ctx);
    if (S.tab !== 'outlook') return;
    S.risk = weeklyRisk({ wx, clim: S.clim, month: new Date().getMonth(), live: S.live && S.liveFor === ctx.aoiKey() ? S.live : null });
    $('#riskBox').outerHTML = riskBox(S.risk, wx);
  } catch (e) {
    const b = $('#riskBox'); if (b) b.innerHTML = `<span class="note">Weather forecast unavailable right now (${esc(e.message)}).</span>`;
  }
}
function card(x) {
  const pct = (v) => Math.round(v * 100);
  return `<div class="o-card ${x.share >= 0.08 ? 'o-crit' : ''}">
    <div class="o-m">${MONTHS[x.month]} ${x.year}</div>
    <div class="o-cat ${LVL_CLASS[x.category]}">${x.category}</div>
    <div class="o-bar" title="Below ${pct(x.pBelow)}% · Normal ${pct(x.pNormal)}% · Above ${pct(x.pAbove)}%">
      <span style="width:${pct(x.pBelow)}%;background:var(--viirs)"></span><span style="width:${pct(x.pNormal)}%;background:#4b5368"></span><span style="width:${pct(x.pAbove)}%;background:var(--fire)"></span></div>
    <div class="o-p">${x.weight === 0 ? 'using climatology' : `${pct(x.pAbove)}% above · ${pct(x.pBelow)}% below`}</div>
    <div class="o-v">${nice(x.expected)} <small>vs ${nice(x.median)} typical</small></div>
    ${x.share >= 0.08 ? '<div class="o-flag">🔥 fire season</div>' : ''}
  </div>`;
}
function modelCard(o, S) {
  const l1 = o.leads[0], l3 = o.leads[2];
  const oniTxt = o.oniNow >= 1.5 ? 'strong El Niño' : o.oniNow >= 0.5 ? 'El Niño' : o.oniNow <= -0.5 ? 'La Niña' : 'neutral';
  return `<div class="metrics">
      <div class="metric"><b class="good">${l1 && l1.hitRate != null ? Math.round(l1.hitRate * 100) + '%' : '–'}</b><span>backtest hit rate, 1 month ahead (33% = chance)</span></div>
      <div class="metric"><b>${l3 && l3.hitRate != null ? Math.round(l3.hitRate * 100) + '%' : '–'}</b><span>hit rate, 3 months ahead</span></div>
      <div class="metric"><b class="${o.ninoEffect > 0 ? 'badv' : ''}">${o.ninoEffect == null ? '–' : (o.ninoEffect > 0 ? '+' : '') + Math.round(o.ninoEffect * 100) + '%'}</b><span>El Niño effect on main fire months (${o.topMonths.map((m) => MONTHS[m]).join(', ')})</span></div>
      <div class="metric"><b>${o.oniNow.toFixed(2)}</b><span>latest ENSO index (${oniTxt}, NOAA ONI)</span></div>
    </div>
    <p class="note">Model: ridge regression on log fire anomalies using this month's activity ${o.usedLive ? '(estimated from the live 7-day pace)' : '(assumed normal until live data loads)'}, the same month last year, the El Niño index (with a seasonal interaction) and the long-term trend. It is validated by leaving out one year at a time across 2002–2025, and each month's forecast is trusted only as much as that backtest skill allows. Where the model has no proven skill it says <b>No clear signal</b> and shows climatology. Probabilities are for below / near / above this month's normal tercile. A planning aid, not an official forecast.</p>`;
}
function riskBox(r, wx) {
  const part = (label, v) => `<div class="rp"><span>${label}</span><div class="rp-bar"><i style="width:${(v / 3) * 100}%"></i></div></div>`;
  return `<div class="risk-box ready">
    <div class="risk-main"><div class="k-l">Fire risk this week</div><div class="risk-lvl ${LVL_CLASS[r.level]}">${r.level}</div>
      ${part('Fire weather', r.parts.weather)}${part('Season timing', r.parts.season)}${part('Live activity', r.parts.live)}</div>
    <div class="wx-days">${wx.days.map((d) => `<div class="wx ${['', 'w1', 'w2', 'w3'][d.lvl]}" title="Hot-Dry-Windy index ${d.hdw.toFixed(1)}">
      <b>${new Date(d.date + 'T00:00').toLocaleDateString('en', { weekday: 'short' })}</b><span>${Math.round(d.T)}°C</span><span>${Math.round(d.RH)}% RH</span><span>${d.W.toFixed(0)} m/s</span><span>${d.P >= 0.5 ? d.P.toFixed(0) + ' mm' : 'dry'}</span><em>${WX_LEVEL[d.lvl]}</em></div>`).join('')}</div>
  </div>`;
}

// ------------------------------------------------------------------ REGIMES TAB
export function renderRegimes(el, S, ctx) {
  const rg = ensureRegimes(S);
  if (!rg) { el.innerHTML = '<h4>Fire regimes</h4><p class="note">Not enough fire activity in this region to learn regimes.</p>'; return; }
  ctx.M.cells.setCategories(S.region, rg.cellRegime, REGIME_COLORS, S.mask);
  const total = rg.nCells;
  el.innerHTML = `<h4>AI fire regimes</h4>
    <div class="sub">Unsupervised machine learning (k-means) grouped ${total.toLocaleString()} grid cells by the <i>shape</i> of their fire calendar (2012–2025). No labels were given; the map is now coloured by regime.${S.aoiRegime ? ` ${S.aoi ? 'Your area' : 'This region'} is mostly <b style="color:${REGIME_COLORS[S.aoiRegime.idx]}">${esc(S.aoiRegime.name)}</b>.` : ''}</div>
    <div class="regimes">${rg.regimes.map((r, i) => `<div class="regime ${S.aoiRegime && S.aoiRegime.idx === i ? 'on' : ''}">
      <i class="sw" style="background:${REGIME_COLORS[i]}"></i>
      <div class="r-txt"><b>${esc(r.name)}</b><span>${Math.round((r.count / total) * 100)}% of cells${S.aoiRegime ? ` · ${S.aoiRegime.counts[i]} in your area` : ''}</span><p>${esc(r.hint)}</p></div>
      ${spark(r.profile, REGIME_COLORS[i])}</div>`).join('')}</div>
    <p class="note">Each cell's monthly profile is normalised so only timing matters, not size. Regime names are generated from the learned profile (number of peaks, timing and concentration). Causes are typical interpretations, not ground truth.</p>`;
}
function spark(p, color) {
  const max = Math.max(...p) || 1;
  return `<svg class="spark" viewBox="0 0 120 40" aria-hidden="true">${p.map((v, m) => `<rect x="${m * 10 + 1}" y="${38 - (v / max) * 34}" width="8" height="${(v / max) * 34}" rx="1.5" fill="${color}" opacity="0.9"/>`).join('')}
    <text x="1" y="40" font-size="6" fill="#6b7287">J</text><text x="111" y="40" font-size="6" fill="#6b7287">D</text></svg>`;
}

// ------------------------------------------------------------------ ASK AGNI
let engine = null, engineModel = null, loading = null;
const LLM_PREFS = ['Llama-3.2-1B-Instruct-q4f16_1-MLC', 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'];
const CHIPS = ['What has changed here?', 'When is the fire season?', 'Is this week normal?', 'What do the next months look like?', 'Should we prepare crews?', 'Does El Niño matter here?', 'What was 2016 like?'];

export function renderAsk(el, S, ctx) {
  S.chat ||= [{ role: 'assistant', content: `Hi, I'm **Agni**. Ask me anything about the fire history, season, risk or outlook of the area you've selected. I answer only from Agnikaal's data.` }];
  el.innerHTML = `<div class="ask-head"><h4>✨ Ask Agni</h4>
      <div class="engine"><span id="engLbl">${engine ? `On-device AI · ${esc(engineModel.split('-q4')[0])}` : 'Instant mode'}</span>
      ${engine ? '' : '<button class="btn btn-ghost sm" id="llmLoad">Load on-device AI (free, ~0.9 GB)</button>'}</div></div>
    <div class="sub">Grounded in the statistics of <b>${esc(S.aoi ? S.aoi.label : S.region.name)}</b>. Instant mode answers immediately from the data. The optional on-device AI (WebLLM, runs in your browser on WebGPU, nothing sent to any server) phrases those verified facts conversationally, and a <b>number guard</b> rejects any reply containing a number that is not in the data.</div>
    <div class="chat" id="chat" aria-live="polite"></div>
    <div class="chips">${CHIPS.map((c) => `<button class="chip q-chip">${c}</button>`).join('')}</div>
    <form class="ask-form" id="askForm"><input id="askIn" autocomplete="off" placeholder="Ask about this area's fires…" aria-label="Your question" /><button class="btn btn-fire sm" type="submit">Ask</button></form>
    <div class="llm-prog hidden" id="llmProg"><div class="play-bar"><span id="llmBar"></span></div><small id="llmTxt"></small></div>`;
  const chat = $('#chat');
  const draw = () => { chat.innerHTML = S.chat.map((m) => `<div class="msg ${m.role}">${md(m.content)}</div>`).join(''); chat.scrollTop = chat.scrollHeight; };
  draw();
  const ask = async (q) => {
    if (!q.trim()) return;
    ensureOutlook(S, ctx); ensureRegimes(S); ensureInsights(S, ctx);
    if (/weather|wind|rain|risk|this week/i.test(q)) {
      try { await ensureWeather(S, ctx); S.risk = weeklyRisk({ wx: S.wx, clim: S.clim, month: new Date().getMonth(), live: S.live && S.liveFor === ctx.aoiKey() ? S.live : null }); } catch { /* offline */ }
    }
    const facts = buildFacts(S);
    S.chat.push({ role: 'user', content: q });
    if (!engine) { S.chat.push({ role: 'assistant', content: askAgniLite(q, facts) }); draw(); return; }
    // 1) retrieve: grounded answers for each part of the question
    const parts = q.split(/\?|\band\b|;/i).map((x) => x.trim()).filter((x) => x.length > 3);
    const grounded = [...new Set((parts.length ? parts : [q]).map((x) => askAgniLite(x, facts)))].join('\n');
    const msg = { role: 'assistant', content: '…' }; S.chat.push(msg); draw();
    try {
      // 2) phrase: the on-device model only rewrites the verified facts
      const stream = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are Agni, a friendly assistant for fire managers. You will receive VERIFIED FACTS that already answer the question completely. Rewrite them as a short, natural reply (2-3 sentences). Keep every number and year exactly as written. Do not add new numbers or facts. Never refuse: the facts are correct.' },
          { role: 'user', content: `VERIFIED FACTS:\n${grounded.replace(/\*\*/g, '')}\n\nQUESTION: ${q}\n\nReply:` },
        ], stream: true, temperature: 0.1, max_tokens: 180 });
      msg.content = '';
      for await (const c of stream) { msg.content += c.choices[0]?.delta?.content || ''; draw(); }
      // 3) number guard: every number the model wrote must exist in the grounded facts
      const nums = (t) => (t.replace(/,(?=\d{3})/g, '').match(/\d+(\.\d+)?/g) || []);
      const allowed = new Set(nums(grounded));
      const bad = nums(msg.content).filter((x) => !allowed.has(x));
      const refused = /cannot|can't|not provided|not available|unable to|i don't know|i do not know|no information/i.test(msg.content);
      // term guard: month names and risk/level words in the reply must also appear in the facts
      const TERMS = /\b(january|february|march|april|may|june|july|august|september|october|november|december|below normal|above normal|near normal|typical|elevated|extreme|very high|moderate|low|high|el ni[nñ]o|la ni[nñ]a|rising|falling|increasing|decreasing)\b/gi;
      const g = grounded.toLowerCase();
      const badTerms = [...new Set((msg.content.match(TERMS) || []).map((t) => t.toLowerCase()))].filter((t) => !g.includes(t) && !(t === 'high' && g.includes('very high')) && !(t === 'low' && /below/.test(g)));
      if (bad.length || badTerms.length || refused || msg.content.trim().length < 20) msg.content = grounded + '\n\n_(verified answer: the AI draft did not match the data, so the guard replaced it)_';
      draw();
    } catch (e) { msg.content = grounded + `\n\n_(on-device AI error, used instant mode: ${e.message})_`; draw(); }
  };
  el.querySelectorAll('.q-chip').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
  $('#askForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#askIn').value; $('#askIn').value = ''; ask(v); });
  const lb = $('#llmLoad');
  if (lb) lb.addEventListener('click', async () => {
    if (!('gpu' in navigator)) { S.chat.push({ role: 'assistant', content: 'This browser has no WebGPU, so the on-device model cannot run here (try desktop Chrome or Edge). Instant mode still answers every question.' }); draw(); return; }
    lb.disabled = true; lb.textContent = 'Loading…'; $('#llmProg').classList.remove('hidden');
    try {
      loading ||= (async () => {
        const webllm = await import(/* @vite-ignore */ 'https://esm.run/@mlc-ai/web-llm@0.2.84');
        const ids = webllm.prebuiltAppConfig.model_list.map((m) => m.model_id);
        engineModel = LLM_PREFS.find((x) => ids.includes(x));
        engine = await webllm.CreateMLCEngine(engineModel, { initProgressCallback: (p) => { const bar = $('#llmBar'), t = $('#llmTxt'); if (bar) bar.style.width = `${Math.round((p.progress || 0) * 100)}%`; if (t) t.textContent = p.text; } });
      })();
      await loading;
      S.chat.push({ role: 'assistant', content: `On-device AI is ready (**${engineModel.split('-q4')[0]}**, running locally in your browser). Ask me anything about this area.` });
      if (S.tab === 'ask') renderAsk(el, S, ctx);
    } catch (e) {
      loading = null; lb.disabled = false; lb.textContent = 'Load on-device AI (free, ~0.9 GB)';
      S.chat.push({ role: 'assistant', content: `Could not load the on-device model (${e.message}). Instant mode still works.` }); draw();
    }
  });
}

// ------------------------------------------------------------------ RESEARCH LAB
export function ensureInsights(S, ctx) {
  const key = ctx.aoiKey() + '|' + (S.oni ? 1 : 0);
  if (S.insights && S.insightsKey === key) return S.insights;
  S.insights = autoInsights(S.h, S.oni); S.insightsKey = key;
  return S.insights;
}
const BADGE = { Strong: 'b-strong', Significant: 'b-sig', Suggestive: 'b-sugg', 'Not significant': 'b-ns', Check: 'b-check', Notable: 'b-note' };
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
export function renderLab(el, S, ctx) {
  const ins = ensureInsights(S, ctx);
  const name = S.aoi ? S.aoi.label : S.region.name;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const sub = S.labSub || 'insights';
  const SUBS = [['insights', 'Auto-Insights'], ['drivers', 'Weather drivers'], ['similar', 'Similar places'], ['events', 'Event finder'], ['exports', 'Exports']];
  el.innerHTML = `<div class="ask-head"><h4>🔬 Research Lab</h4><span class="engine">${esc(name)}</span></div>
    <div class="lab-sub" role="tablist">${SUBS.map(([k, l]) => `<button class="mode ${k === sub ? 'active' : ''}" data-sub="${k}">${l}</button>`).join('')}</div>
    <div id="labBody"></div>`;
  el.querySelectorAll('.lab-sub .mode').forEach((b) => b.addEventListener('click', () => { S.labSub = b.dataset.sub; renderLab(el, S, ctx); }));
  const body = el.querySelector('#labBody');
  if (sub === 'drivers') return renderDrivers(body, S, ctx);
  if (sub === 'similar') return renderSimilar(body, S, ctx);
  if (sub === 'events') return renderEvents(body, S, ctx);
  if (sub === 'insights') {
    const shown = ins.tests.filter((t) => t.strength !== 'Not significant');
    const hidden = ins.tests.length - shown.length;
    body.innerHTML = `<div class="sub">${ins.nSig} of ${ins.nHyp} hypotheses significant (FDR 5%). The engine automatically tests long-term and month-by-month trends, regime shifts, season timing and the El Niño link, plus data checks, then corrects for multiple testing (Benjamini–Hochberg) so nothing is a fluke of scanning many patterns.</div>
      <div class="insights">${shown.map((t) => `<div class="ins"><span class="badge ${BADGE[t.strength]}">${t.strength}${t.q != null ? ` · q=${t.q < 0.001 ? '<0.001' : t.q.toFixed(3)}` : ''}</span>
        <b>${esc(t.title)}</b><span class="ins-stat">${esc(t.stat)}</span><span class="ins-why">${esc(t.why)}</span></div>`).join('')}</div>
      ${hidden ? `<p class="note">${hidden} further hypotheses were tested and are not significant here (that is a result too: no evidence of change).</p>` : ''}`;
    return;
  }
  body.innerHTML = `<div class="sub">One-click, reproducible outputs for researchers, scientists and students.</div>
    <div class="lab-actions">
      <button class="lab-btn" id="labNb"><b>⬇ Jupyter / Colab notebook</b><span>Data embedded · calendar, trend tests, citations · runs as-is</span></button>
      <button class="lab-btn" id="labMethods"><b>⧉ Copy methods paragraph</b><span>Auto-written, with this area's numbers, for your paper or report</span></button>
      <button class="lab-btn" id="labBib"><b>⧉ Copy BibTeX</b><span>Agnikaal + NASA FIRMS DOIs + algorithm papers</span></button>
      <button class="lab-btn" id="labJson"><b>⬇ Data (CSV)</b><span>Monthly harmonized + raw sensor series, 2001–2025</span></button>
      <button class="lab-btn ge" id="labKml"><b>⬇ KML for Google Earth</b><span>3D fire columns (height = activity) + live hotspots + your area</span></button>
      <a class="lab-btn ge" id="labGE" href="#" target="_blank" rel="noopener"><b>🌍 Open in Google Earth</b><span>Fly to this area in 3D, then drag the KML file onto the globe</span></a>
      <button class="lab-btn" id="labGeo"><b>⬇ Area (GeoJSON)</b><span>Your drawn area for QGIS, ArcGIS or Python</span></button>
    </div>
    <details class="methods"><summary>Preview methods paragraph</summary><p>${esc(methodsText(S, ins))}</p></details>`;
  el = body;
  const csv = () => toCSV(monthlyRows(S.h, 2001, 2025));
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); ctx.toast(msg); } catch { ctx.toast('Copy blocked by the browser: select the text in the preview instead'); } };
  el.querySelector('#labNb').onclick = () => dl(`agnikaal-${slug}.ipynb`, notebook(S, csv(), ins), 'application/x-ipynb+json');
  el.querySelector('#labMethods').onclick = () => copy(methodsText(S, ins), 'Methods paragraph copied');
  el.querySelector('#labBib').onclick = () => copy(BIBTEX, 'BibTeX copied');
  el.querySelector('#labJson').onclick = () => dl(`agnikaal-${slug}-monthly.csv`, csv(), 'text/csv');
  const bb = ctx.aoiBBox();
  el.querySelector('#labGE').href = googleEarthUrl(bb);
  el.querySelector('#labKml').onclick = () => dl(`agnikaal-${slug}.kml`, buildKML({ name, aoi: S.aoi, bbox: bb, cells: cellTotals(S.region, S.h, S.mask), hotspots: S.live && S.liveFor === ctx.aoiKey() ? S.live.hs : [] }), 'application/vnd.google-earth.kml+xml');
  el.querySelector('#labGeo').onclick = () => dl(`agnikaal-${slug}.geojson`, aoiGeoJSON(S.aoi, bb, { name, source: 'Agnikaal', meanAnnualFCD: Math.round(ins.annual.reduce((a, b) => a + b, 0) / ins.annual.length) }), 'application/geo+json');
}
