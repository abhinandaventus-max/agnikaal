// Vercel serverless function: live VIIRS NOAA-20 / NOAA-21 hotspots (last 7 days)
// for a bounding box, pulled from NASA FIRMS public regional NRT files (no key needed).
// GET /api/nrt?bbox=w,s,e,n[&sat=J1|J2]

const FIRMS = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
const SAT = {
  J1: { dir: 'noaa-20-viirs-c2', prefix: 'J1_VIIRS_C2' },
  J2: { dir: 'noaa-21-viirs-c2', prefix: 'J2_VIIRS_C2' },
};
// FIRMS regional NRT subsets (rough extents, lon/lat)
const AREAS = [
  ['Canada', [-141, 41, -52, 84]],
  ['Alaska', [-170, 51, -129, 72]],
  ['USA_contiguous_and_Hawaii', [-161, 18, -66, 50]],
  ['Central_America', [-118, 5, -59, 33]],
  ['South_America', [-82, -56, -34, 13]],
  ['Europe', [-26, 34, 45, 72]],
  ['Northern_and_Central_Africa', [-18, -5, 52, 38]],
  ['Southern_Africa', [10, -35, 52, -5]],
  ['South_Asia', [60, 5, 98, 38]],
  ['SouthEast_Asia', [92, -11, 142, 29]],
  ['Australia_NewZealand', [112, -48, 180, -9]],
  ['Russia_Asia', [26, 35, 180, 82]],
];

// warm-instance cache: FIRMS NRT files refresh roughly every few hours
const CACHE = new Map();
async function getCached(url) {
  const hit = CACHE.get(url);
  if (hit && Date.now() - hit.t < 30 * 60 * 1000) return hit.text;
  const r = await fetch(url, { headers: { 'user-agent': 'agnikaal-nrt/1.0' } });
  if (!r.ok) return null;
  const text = await r.text();
  CACHE.set(url, { t: Date.now(), text });
  return text;
}

function pickArea(w, s, e, n) {
  const cx = (w + e) / 2, cy = (s + n) / 2;
  const hit = AREAS.find(([, [a, b, c, d]]) => cx >= a && cx <= c && cy >= b && cy <= d);
  return hit ? hit[0] : 'Global';
}

export default async function handler(req, res) {
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const bb = String(q.bbox || '').split(',').map(Number);
    if (bb.length !== 4 || bb.some((x) => !Number.isFinite(x))) {
      res.status(400).json({ error: 'bbox=w,s,e,n required' });
      return;
    }
    const [w, s, e, n] = bb;
    const area = pickArea(w, s, e, n);
    const order = q.sat === 'J2' ? ['J2', 'J1'] : ['J1', 'J2'];
    let used = null, rows = [], header = null, fetched = null;
    for (const key of order) {
      const { dir, prefix } = SAT[key];
      const url = `${FIRMS}/${dir}/csv/${prefix}_${area}_7d.csv`;
      const text = await getCached(url);
      if (text == null) continue;
      const lines = text.trim().split('\n');
      if (lines.length < 2) continue;
      header = lines[0].split(',');
      rows = lines.slice(1);
      used = key; fetched = url;
      break;
    }
    if (!used) {
      res.status(200).json({ area, satellite: null, hotspots: [], note: 'No NRT data available' });
      return;
    }
    const col = (name) => header.indexOf(name);
    const iLat = col('latitude'), iLon = col('longitude'), iDate = col('acq_date'), iTime = col('acq_time'),
      iConf = col('confidence'), iFrp = col('frp'), iDn = col('daynight');
    const hotspots = [];
    for (const line of rows) {
      const c = line.split(',');
      const lat = +c[iLat], lon = +c[iLon];
      if (lon < w || lon > e || lat < s || lat > n) continue;
      const conf = (c[iConf] || '').toLowerCase();
      hotspots.push({ lat, lon, date: c[iDate], time: c[iTime], conf: conf[0] || '', frp: +c[iFrp] || 0, dn: c[iDn] });
      if (hotspots.length >= 20000) break;
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json({ area, satellite: used === 'J1' ? 'VIIRS NOAA-20' : 'VIIRS NOAA-21', source: fetched, count: hotspots.length, hotspots });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
}
