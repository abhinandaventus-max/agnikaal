// Builds promo/Agnikaal-Presentation.pptx (7 slides) with pptxgenjs.
// Usage: node promo/build-pptx.cjs [path/to/apply_theme.js]
const pptxgen = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const A = (f) => path.join(__dirname, 'pptx-assets', f);
const TEAM = (f) => path.join(__dirname, '..', 'public', 'team', f);
const S = JSON.parse(fs.readFileSync(A('stats.json')));
const OUT = path.join(__dirname, 'Agnikaal-Presentation.pptx');

const LINKS = {
  app: 'https://agnikaal.vercel.app',
  deck: 'https://agnikaal.vercel.app/deck.html',
  github: 'https://github.com/abhinandaventus-max/agnikaal',
  abhinand: 'https://www.linkedin.com/in/abhinandks12',
  annlia: 'https://www.linkedin.com/in/annlia-lixon/',
  challenge: 'https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/',
};
const K = { bg: '0B0D14', card: '151925', card2: '1B2030', line: '2A3044', text: 'EEF0F6', muted: '9AA1B5', dim: '6B7287',
  fire: 'FF6A2B', amber: 'FFB347', gold: 'FFD166', cyan: '5AD1FF', purple: 'A98BFF', green: '4ADE80', red: 'F43F5E' };
const THEME = { name: 'Agnikaal Ember', headFontFace: 'Arial', bodyFontFace: 'Calibri',
  colors: { dk1: K.bg, lt1: 'FFFFFF', dk2: K.card, lt2: K.text, accent1: K.fire, accent2: K.amber, accent3: K.cyan,
    accent4: K.purple, accent5: K.green, accent6: K.red, hlink: K.amber, folHlink: K.gold } };

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.author = 'Team AKASHA7';
pres.company = 'Team AKASHA7';
pres.title = 'Agnikaal: Harmonized MODIS + VIIRS Fire Calendar';
pres.subject = 'NASA Space Apps Challenge 2026';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };

pres.defineSlideMaster({
  title: 'AGNI_TITLE',
  background: { color: '07080D' },
  objects: [],
});
pres.defineSlideMaster({
  title: 'AGNI_CONTENT',
  background: { color: K.bg },
  margin: [0.5, 0.6, 0.5, 0.6],
  objects: [
    { text: { text: 'Agnikaal  ·  NASA Space Apps 2026  ·  Team AKASHA7', options: { x: 0.6, y: 7.02, w: 7, h: 0.3, fontSize: 10, color: K.dim, fontFace: 'Calibri' } } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.62, w: 12.1, h: 0.85, fontSize: 34, bold: true, color: K.text, fontFace: 'Arial', valign: 'top', align: 'left', margin: 0 }, text: '' } },
  ],
  slideNumber: { x: 12.3, y: 7.0, w: 0.45, h: 0.3, fontSize: 10, color: K.dim, align: 'right' },
});

const kicker = (s, t) => s.addText(t.toUpperCase(), { x: 0.6, y: 0.3, w: 10, h: 0.3, fontSize: 12, bold: true, color: K.amber, charSpacing: 3, margin: 0, isTextBox: true });
const card = (s, x, y, w, h, fill = K.card, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.14, fill: { color: fill }, line: { color: K.line, width: 0.75 }, objectName: name });
const badge = (s, x, y, d, txt, color) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color, transparency: 78 }, line: { color, width: 1.25 } });
  s.addText(txt, { x, y, w: d, h: d, fontSize: d > 0.6 ? 16 : 13, bold: true, color, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
};
const link = (text, url, extra = {}) => ({ text, options: { hyperlink: { url, tooltip: url }, color: K.amber, ...extra } });

// =============== 1. TITLE + TEAM =================
{
  pres.addSection({ title: 'Intro' });
  const s = pres.addSlide({ masterName: 'AGNI_TITLE', sectionTitle: 'Intro' });
  s.addImage({ path: A('globe.jpg'), x: 7.18, y: 0, w: 6.153, h: 7.5, altText: 'Globe with live NASA VIIRS fire detections and MODIS/VIIRS satellite orbits' });
  s.addText('NASA SPACE APPS 2026  ·  HARMONIZATION OF MODIS AND VIIRS HOT SPOTS', { x: 0.6, y: 0.55, w: 7.2, h: 0.3, fontSize: 12, bold: true, color: K.amber, charSpacing: 2, margin: 0, isTextBox: true });
  s.addText([{ text: 'Agni', options: { color: K.text } }, { text: 'kaal', options: { color: K.amber } }], { x: 0.6, y: 0.95, w: 7, h: 1.35, fontSize: 80, bold: true, fontFace: 'Arial', margin: 0, isTextBox: true });
  s.addText('25 years of fire. One consistent record.', { x: 0.6, y: 2.3, w: 7, h: 0.5, fontSize: 26, bold: true, color: K.text, margin: 0, isTextBox: true });
  s.addText('A web app that joins NASA’s old MODIS and new VIIRS fire satellites into one fair fire calendar, for any area you draw, with a live 7-day early warning.', { x: 0.6, y: 2.85, w: 6.6, h: 0.85, fontSize: 15, color: K.muted, margin: 0, isTextBox: true });
  s.addText([link('▶  agnikaal.vercel.app', LINKS.app, { bold: true }), { text: '      ' }, link('GitHub repository', LINKS.github, { bold: true })], { x: 0.6, y: 3.78, w: 6.8, h: 0.35, fontSize: 15, margin: 0, isTextBox: true });

  s.addText('TEAM AKASHA7', { x: 0.6, y: 4.45, w: 6, h: 0.3, fontSize: 12, bold: true, color: K.amber, charSpacing: 2, margin: 0, isTextBox: true });
  const team = [
    ['abhinand.jpg', 'Abhinand', LINKS.abhinand],
    ['abhijith.jpg', 'Abhijith K S', null],
    ['annlia.jpg', 'Annlia Lixon', LINKS.annlia],
  ];
  team.forEach(([img, name, url], i) => {
    const x = 0.6 + i * 2.25;
    s.addShape(pres.shapes.OVAL, { x: x - 0.04, y: 4.86, w: 1.38, h: 1.38, fill: { color: K.bg }, line: { color: K.amber, width: 2 } });
    s.addImage({ path: TEAM(img), x, y: 4.9, w: 1.3, h: 1.3, rounding: true, altText: `Photo of ${name}` });
    s.addText(name, { x: x - 0.3, y: 6.3, w: 1.9, h: 0.32, fontSize: 15, bold: true, color: K.text, align: 'center', margin: 0, isTextBox: true });
    s.addText(url ? [link('LinkedIn ↗', url)] : [{ text: 'Team member', options: { color: K.muted } }], { x: x - 0.3, y: 6.62, w: 1.9, h: 0.28, fontSize: 12, align: 'center', margin: 0, isTextBox: true });
  });
  s.addNotes('Hello judges. We are Team AKASHA7. Agnikaal means "fire" plus "time": a fire calendar. In one line: we turn NASA\'s two fire satellite records, MODIS and VIIRS, into one consistent fire history that anyone can explore for their own area, and we add a live early warning.');
}

// =============== 2. PROBLEM =================
{
  pres.addSection({ title: 'Problem' });
  const s = pres.addSlide({ masterName: 'AGNI_CONTENT', sectionTitle: 'Problem' });
  kicker(s, '01 · The problem');
  s.addText('One fire, two very different counts', { placeholder: 'title' });
  const rows = [
    ['1 km', K.purple, 'MODIS (2000 →)', 'Older sensor with big 1 km pixels; nearing end of life.'],
    ['375 m', K.cyan, 'VIIRS (2012 →)', 'Sharper pixels, so one fire can light up about 7 pixels.'],
    [`${S.india.seam.toFixed(1)}×`, K.fire, 'Fake jump in 2012', 'Join the two and India’s fire count jumps 5.4× overnight. History looks broken.'],
  ];
  rows.forEach(([b, c, h, t], i) => {
    const y = 1.75 + i * 1.6;
    card(s, 0.6, y, 5.2, 1.38);
    badge(s, 0.85, y + 0.28, 0.82, b, c);
    s.addText(h, { x: 1.9, y: y + 0.2, w: 3.75, h: 0.4, fontSize: 18, bold: true, color: K.text, margin: 0, isTextBox: true });
    s.addText(t, { x: 1.9, y: y + 0.6, w: 3.75, h: 0.65, fontSize: 14, color: K.muted, margin: 0, isTextBox: true });
  });
  card(s, 6.1, 1.75, 6.6, 4.78);
  const yrs = S.india.years.map(String);
  const modis = S.india.raw.map((v, i) => (S.india.years[i] < 2012 ? Math.round(v / 1000) : 0));
  const viirs = S.india.raw.map((v, i) => (S.india.years[i] >= 2012 ? Math.round(v / 1000) : 0));
  s.addChart(pres.charts.BAR, [{ name: 'MODIS era (raw)', labels: yrs, values: modis }, { name: 'VIIRS era (raw)', labels: yrs, values: viirs }], {
    x: 6.25, y: 1.85, w: 6.3, h: 4.55, barDir: 'col', barGrouping: 'stacked', barGapWidthPct: 35,
    chartColors: [K.purple, K.cyan], showTitle: true, title: 'India · raw yearly fire detections (thousands)', titleColor: K.text, titleFontSize: 13, titleFontFace: '+mn-lt',
    showLegend: true, legendPos: 'b', legendColor: K.muted, legendFontSize: 11, legendFontFace: '+mn-lt',
    catAxisLabelColor: K.muted, valAxisLabelColor: K.muted, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt',
    valGridLine: { color: '2A3044', size: 0.5 }, catGridLine: { style: 'none' }, catAxisLineShow: false, valAxisLineShow: false,
  });
  s.addText('← 2012: new sensor, not more fire', { x: 9.0, y: 2.35, w: 3.4, h: 0.32, fontSize: 13, bold: true, color: K.fire, margin: 0, isTextBox: true });
  s.addNotes('NASA has watched fires for 25 years with two different sensors. MODIS sees 1 km pixels, VIIRS sees 375 m pixels, so the same fire looks several times bigger to VIIRS. If you simply join the records, India\'s fire count jumps 5.4 times in 2012. That jump is not real; it is just a new satellite. Fire managers cannot compare this season with history.');
}

// =============== 3. SOLUTION =================
{
  pres.addSection({ title: 'Solution' });
  const s = pres.addSlide({ masterName: 'AGNI_CONTENT', sectionTitle: 'Solution' });
  kicker(s, '02 · Our solution');
  s.addText('One shared grid, calibrated for your area', { placeholder: 'title' });
  const steps = [
    ['1', 'Clean', 'Keep real vegetation fires; remove volcanoes, gas flares and factories.'],
    ['2', 'Same grid', 'Every fire from every satellite snapped to one 1 km grid, counted once per day.'],
    ['3', 'Calibrate', 'Old MODIS matched to new VIIRS, month by month, for the exact area you draw.'],
    ['4', 'Validate', 'Each calibration is tested live; a NOAA-20 bridge links to today’s data.'],
  ];
  steps.forEach(([n, h, t], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.7, 2.82, 2.05);
    badge(s, x + 0.25, 1.92, 0.6, n, K.amber);
    s.addText(h, { x: x + 1.0, y: 1.98, w: 1.7, h: 0.45, fontSize: 20, bold: true, color: K.text, margin: 0, valign: 'middle', isTextBox: true });
    s.addText(t, { x: x + 0.25, y: 2.65, w: 2.4, h: 1.0, fontSize: 14, color: K.muted, margin: 0, isTextBox: true });
    if (i < 3) s.addText('→', { x: x + 2.8, y: 2.45, w: 0.3, h: 0.4, fontSize: 18, bold: true, color: K.fire, align: 'center', margin: 0, isTextBox: true });
  });
  card(s, 0.6, 4.0, 12.1, 2.75);
  s.addChart(pres.charts.BAR, [{ name: 'Harmonized fire activity', labels: S.india.years.map(String), values: S.india.harm.map((v) => Math.round(v / 1000)) }], {
    x: 0.75, y: 4.08, w: 8.4, h: 2.6, barDir: 'col', barGapWidthPct: 35, chartColors: [K.amber],
    showTitle: true, title: 'India after Agnikaal · harmonized fire activity (thousand fire-cell-days)', titleColor: K.text, titleFontSize: 12, titleFontFace: '+mn-lt', showLegend: false,
    catAxisLabelColor: K.muted, valAxisLabelColor: K.muted, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt',
    valGridLine: { color: '2A3044', size: 0.5 }, catGridLine: { style: 'none' }, catAxisLineShow: false, valAxisLineShow: false,
  });
  s.addText([{ text: 'The fake 2012 jump is gone.', options: { bold: true, color: K.text, breakLine: true } }, { text: 'Now 2005 and 2025 can be compared fairly, in the same unit, for any place.', options: { color: K.muted } }], { x: 9.35, y: 4.5, w: 3.15, h: 1.9, fontSize: 16, margin: 0, valign: 'top', isTextBox: true });
  s.addNotes('Our fix has four steps. First we clean the data so only vegetation fires remain. Second, we put every detection from every satellite on the same 1 km grid and count each place once per day, which removes the pixel-size effect. Third, we calibrate old MODIS to new VIIRS month by month, for the exact area the user draws. Fourth, we test every calibration live. The result: the fake 2012 jump disappears.');
}

// =============== 4. WHAT YOU GET =================
{
  pres.addSection({ title: 'Features' });
  const s = pres.addSlide({ masterName: 'AGNI_CONTENT', sectionTitle: 'Features' });
  kicker(s, '03 · What you get');
  s.addText('Draw any area, get its full fire story', { placeholder: 'title' });
  s.addImage({ path: A('calendar.jpg'), x: 0.6, y: 1.65, w: 6.5, h: 2.69, altText: 'India fire map and the Punjab burning calendar 2001 to 2025' });
  s.addImage({ path: A('live.jpg'), x: 0.6, y: 4.45, w: 6.5, h: 2.69 - 0.25, sizing: { type: 'cover', w: 6.5, h: 2.44 }, altText: 'Live hotspots map and early warning gauge' });
  const items = [
    ['Fire calendar', 'Month-by-month fire activity, 2001–2025, in counts, anomaly or percentile view.', K.fire],
    ['Critical season', 'Which months hold 80% of the burning (Punjab: May and Oct–Nov).', K.amber],
    ['Worst years & trend', 'Ranked fire years and a statistically tested long-term trend.', K.gold],
    ['Live 7-day warning', 'This week rated Below normal, Typical, Elevated or Extreme.', K.red],
    ['Time-lapse map', '25 years of fire animated across the map.', K.cyan],
    ['Downloads', 'Data (CSV), calendar image (PNG) and an auto-written briefing.', K.green],
  ];
  items.forEach(([h, t, c], i) => {
    const y = 1.65 + i * 0.9;
    s.addShape(pres.shapes.OVAL, { x: 7.45, y: y + 0.1, w: 0.26, h: 0.26, fill: { color: c }, line: { color: c } });
    s.addText(h, { x: 7.9, y, w: 4.8, h: 0.36, fontSize: 17, bold: true, color: K.text, margin: 0, isTextBox: true });
    s.addText(t, { x: 7.9, y: y + 0.36, w: 4.8, h: 0.46, fontSize: 13, color: K.muted, margin: 0, isTextBox: true });
  });
  s.addNotes('Using it is simple: pick a region, draw a box or polygon, or type a latitude and longitude. You immediately get the fire calendar, the critical fire season, the worst years and the trend, a live 7-day warning, a 25-year time-lapse, and downloads. Example: Punjab shows its two crop-burning seasons, May and October to November.');
}

// =============== 5. PROOF =================
{
  pres.addSection({ title: 'Proof' });
  const s = pres.addSlide({ masterName: 'AGNI_CONTENT', sectionTitle: 'Proof' });
  kicker(s, '04 · Tested, not guessed');
  s.addText('Proven on real NASA data', { placeholder: 'title' });
  const stats = [['0.97', 'cross-validation R²\n(India, monthly)', K.green], ['69.8M', 'NASA fire detections\nharmonized', K.text], ['5', 'countries, 2001–2025\n+ live feed', K.cyan], ['−82%', 'error of the naive\nsplice we avoid', K.red]];
  stats.forEach(([v, l, c], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.65, 2.82, 1.75);
    s.addText(v, { x: x + 0.25, y: 1.78, w: 2.4, h: 0.85, fontSize: 44, bold: true, color: c, margin: 0, fontFace: 'Arial', isTextBox: true });
    s.addText(l, { x: x + 0.25, y: 2.65, w: 2.4, h: 0.65, fontSize: 13, color: K.muted, margin: 0, isTextBox: true });
  });
  const hdr = (t) => ({ text: t, options: { bold: true, color: K.amber, fill: { color: K.card2 } } });
  const cell = (t, c = K.text) => ({ text: t, options: { color: c, fill: { color: K.card } } });
  const names = { india: 'India', argentina: 'Argentina', australia: 'Australia', united_states: 'United States', canada: 'Canada' };
  const rows = [[hdr('Country'), hdr('Calibration R²'), hdr('Naive splice error'), hdr('Fake 2012 jump')]];
  Object.entries(names).forEach(([k, n]) => rows.push([cell(n), cell(S[k].r2.toFixed(2), K.green), cell(`${Math.round(S[k].naive)}%`, K.red), cell(`${S[k].seam.toFixed(1)}×`)]));
  s.addTable(rows, { x: 0.6, y: 3.7, w: 6.6, colW: [1.9, 1.5, 1.7, 1.5], fontSize: 13, fontFace: 'Calibri', rowH: 0.43, border: { type: 'solid', color: K.line, pt: 0.75 }, valign: 'middle', margin: [0, 0.12, 0, 0.12] });
  card(s, 7.5, 3.7, 5.2, 2.95);
  s.addText('It finds real disasters', { x: 7.75, y: 3.85, w: 4.8, h: 0.4, fontSize: 18, bold: true, color: K.text, margin: 0, isTextBox: true });
  s.addText([
    { text: 'Québec, Canada · worst year 2023 (June)', options: { bullet: true, breakLine: true } },
    { text: 'New South Wales · Black Summer 2019', options: { bullet: true, breakLine: true } },
    { text: 'California · record year 2020', options: { bullet: true, breakLine: true } },
    { text: 'Paraná Delta, Argentina · 2008 fires', options: { bullet: true, breakLine: true } },
    { text: 'Punjab · stubble burning May + Oct–Nov', options: { bullet: true } },
  ], { x: 7.75, y: 4.35, w: 4.8, h: 2.2, fontSize: 15, color: K.muted, paraSpaceAfter: 8, margin: 0, valign: 'top', isTextBox: true });
  s.addNotes('We do not just claim it works. Every calibration is cross-validated by hiding one year at a time: R squared is 0.92 to 0.98 across five countries, while a naive splice is wrong by 70 to 82 percent. And without being told, the harmonized record finds the real disasters: Québec 2023, Australia\'s Black Summer, California 2020, the Paraná Delta fires of 2008, and Punjab\'s stubble burning seasons.');
}

// =============== 6. WHY IT STANDS OUT =================
{
  pres.addSection({ title: 'Uniqueness' });
  const s = pres.addSlide({ masterName: 'AGNI_CONTENT', sectionTitle: 'Uniqueness' });
  kicker(s, '05 · Why it stands out');
  s.addText('Unique approach, real benefits', { placeholder: 'title' });
  const hdr = (t, c) => ({ text: t, options: { bold: true, color: c, fill: { color: K.card2 } } });
  const r = (a, b) => [{ text: a, options: { color: K.muted, fill: { color: K.card } } }, { text: b, options: { color: K.text, bold: true, fill: { color: K.card } } }];
  s.addTable([
    [hdr('Typical fire dashboard', K.muted), hdr('Agnikaal', K.amber)],
    r('Joins raw counts: fake 2012 jump', 'Harmonized: one fair unit, 2001 → today'),
    r('One global correction factor', 'Calibrated for your area, month by month'),
    r('Trust me, no accuracy check', 'Live cross-validation score for every area'),
    r('Factories and gas flares counted as fires', 'Static heat sources filtered out'),
    r('History only, or live only', 'History + live 7-day early warning'),
    r('Fixed regions', 'Draw any box, polygon or lat/lon radius'),
  ], { x: 0.6, y: 1.7, w: 7.1, colW: [3.2, 3.9], fontSize: 14, fontFace: 'Calibri', rowH: 0.68, border: { type: 'solid', color: K.line, pt: 0.75 }, valign: 'middle', margin: [0, 0.14, 0, 0.14] });
  const who = [
    ['Emergency managers', 'Know if this week is unusual and pre-position crews early.', K.amber],
    ['Firefighters', 'Live hotspots with time, day/night and intensity, as CSV.', K.fire],
    ['Land managers', 'Track crop-burning seasons and policy impact year to year.', K.green],
    ['Scientists', 'Transparent, validated, reproducible open pipeline.', K.cyan],
  ];
  who.forEach(([h, t, c], i) => {
    const y = 1.7 + i * 1.2;
    card(s, 8.0, y, 4.7, 1.05);
    s.addShape(pres.shapes.OVAL, { x: 8.2, y: y + 0.32, w: 0.3, h: 0.3, fill: { color: c }, line: { color: c } });
    s.addText(h, { x: 8.7, y: y + 0.1, w: 3.9, h: 0.34, fontSize: 16, bold: true, color: K.text, margin: 0, isTextBox: true });
    s.addText(t, { x: 8.7, y: y + 0.45, w: 3.9, h: 0.52, fontSize: 13, color: K.muted, margin: 0, isTextBox: true });
  });
  s.addNotes('Compared with a typical fire dashboard, Agnikaal is different in six ways: it harmonizes instead of joining raw counts; it calibrates for your exact area and month instead of one global number; it shows its own accuracy; it filters out factories and gas flares; it combines history with a live warning; and you can draw any area. The benefit: emergency managers, firefighters, land managers and scientists get one honest fire history they can act on.');
}

// =============== 7. TRY IT =================
{
  pres.addSection({ title: 'Try it' });
  const s = pres.addSlide({ masterName: 'AGNI_CONTENT', sectionTitle: 'Try it' });
  kicker(s, '06 · Try it now');
  s.addText('Open it, draw your area, see your fire history', { placeholder: 'title' });
  [['qr-app.png', 'Live app', 'agnikaal.vercel.app', LINKS.app], ['qr-github.png', 'Source code', 'GitHub repository', LINKS.github]].forEach(([q, h, t, url], i) => {
    const x = 0.6 + i * 3.0;
    card(s, x, 1.7, 2.75, 3.6);
    s.addImage({ path: A(q), x: x + 0.4, y: 1.95, w: 1.95, h: 1.95, hyperlink: { url, tooltip: url }, altText: `QR code for ${url}` });
    s.addText(h, { x: x + 0.15, y: 4.05, w: 2.45, h: 0.36, fontSize: 16, bold: true, color: K.text, align: 'center', margin: 0, isTextBox: true });
    s.addText([link(t, url)], { x: x + 0.15, y: 4.45, w: 2.45, h: 0.32, fontSize: 13, align: 'center', margin: 0, isTextBox: true });
  });
  card(s, 6.6, 1.7, 6.1, 3.6);
  s.addText('Links', { x: 6.85, y: 1.85, w: 5.6, h: 0.4, fontSize: 18, bold: true, color: K.text, margin: 0, isTextBox: true });
  s.addText([
    { text: 'Live app: ', options: { color: K.muted, bullet: true } }, link(LINKS.app, LINKS.app, { breakLine: true }),
    { text: '7-slide web deck: ', options: { color: K.muted, bullet: true } }, link('agnikaal.vercel.app/deck.html', LINKS.deck, { breakLine: true }),
    { text: 'GitHub: ', options: { color: K.muted, bullet: true } }, link('github.com/abhinandaventus-max/agnikaal', LINKS.github, { breakLine: true }),
    { text: 'Abhinand: ', options: { color: K.muted, bullet: true } }, link('linkedin.com/in/abhinandks12', LINKS.abhinand, { breakLine: true }),
    { text: 'Annlia Lixon: ', options: { color: K.muted, bullet: true } }, link('linkedin.com/in/annlia-lixon', LINKS.annlia, { breakLine: true }),
    { text: 'Challenge: ', options: { color: K.muted, bullet: true } }, link('Harmonization of MODIS and VIIRS Hot Spots', LINKS.challenge),
  ], { x: 6.85, y: 2.35, w: 5.65, h: 2.8, fontSize: 15, paraSpaceAfter: 8, margin: 0, valign: 'top', isTextBox: true });
  card(s, 0.6, 5.55, 12.1, 1.2, K.card2);
  s.addText([{ text: 'Next: ', options: { bold: true, color: K.amber } }, { text: 'global coverage  ·  NOAA-21 calibration  ·  fire-weather overlay  ·  SMS alerts for registered areas', options: { color: K.text } }], { x: 0.85, y: 5.7, w: 11.6, h: 0.4, fontSize: 15, margin: 0, isTextBox: true });
  s.addText('Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP / NOAA-20 / NOAA-21). NASA does not endorse this project.', { x: 0.85, y: 6.15, w: 11.6, h: 0.4, fontSize: 12, color: K.dim, margin: 0, isTextBox: true });
  s.addNotes('Please try it yourself: scan the QR code or open agnikaal.vercel.app, draw your own area, and see its fire history in seconds. The code is open on GitHub. Next we want global coverage, NOAA-21 calibration, a fire-weather overlay and SMS alerts. Thank you from Team AKASHA7.');
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  const themeJs = process.argv[2];
  if (themeJs) { const { applyTheme } = require(themeJs); await applyTheme(OUT, THEME); }
  console.log('wrote', OUT);
})();
