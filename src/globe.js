import * as d3 from 'd3';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';

const SATS = [
  { name: 'Terra', color: '#a98bff', raan: 0.2, phase: 0.0, speed: 1.0 },
  { name: 'Aqua', color: '#c4b0ff', raan: 2.1, phase: 2.2, speed: 1.0 },
  { name: 'S-NPP', color: '#5ad1ff', raan: 1.2, phase: 4.0, speed: 0.98 },
  { name: 'NOAA-20', color: '#8fe3ff', raan: 3.0, phase: 1.1, speed: 0.98 },
  { name: 'NOAA-21', color: '#b8efff', raan: 4.4, phase: 3.3, speed: 0.98 },
];
const INC = (98.2 * Math.PI) / 180;

export async function startGlobe(canvas) {
  const ctx = canvas.getContext('2d');
  const land = feature(land110, land110.objects.land);
  let fires = [];
  try {
    const r = await fetch('/data/live_sample.json');
    if (r.ok) fires = (await r.json()).points || [];
  } catch { /* offline */ }
  const projection = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(projection, ctx);
  const grat = d3.geoGraticule10();
  let W = 0, H = 0, R = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    R = Math.min(W, H) * 0.36;
    projection.translate([W / 2, H / 2]).scale(R);
  }
  resize();
  window.addEventListener('resize', resize);
  canvas.classList.add('ready');
  const trails = SATS.map(() => []);
  let lambda = -70, t0 = performance.now(), visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function satLonLat(s, t) {
    const u = s.phase + t * 0.00042 * s.speed;
    const x = Math.cos(s.raan) * Math.cos(u) - Math.sin(s.raan) * Math.sin(u) * Math.cos(INC);
    const y = Math.sin(s.raan) * Math.cos(u) + Math.cos(s.raan) * Math.sin(u) * Math.cos(INC);
    const z = Math.sin(u) * Math.sin(INC);
    return [(Math.atan2(y, x) * 180) / Math.PI - t * 0.004, (Math.asin(z) * 180) / Math.PI];
  }
  function toScreen(ll, alt) {
    const center = [-projection.rotate()[0], -projection.rotate()[1]];
    const behind = d3.geoDistance(ll, center) > Math.PI / 2;
    const p = projection.clipAngle(null)(ll); projection.clipAngle(90);
    if (!p) return null;
    return { x: W / 2 + (p[0] - W / 2) * alt, y: H / 2 + (p[1] - H / 2) * alt, behind };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = now - t0;
    if (!reduce) lambda += 0.06;
    projection.rotate([lambda, -18]);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // atmosphere glow
    const g = ctx.createRadialGradient(W / 2, H / 2, R * 0.9, W / 2, H / 2, R * 1.35);
    g.addColorStop(0, 'rgba(90,209,255,0.22)'); g.addColorStop(0.4, 'rgba(90,140,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W / 2, H / 2, R * 1.35, 0, 2 * Math.PI); ctx.fill();
    // ocean
    const oc = ctx.createRadialGradient(W / 2 - R * 0.35, H / 2 - R * 0.4, R * 0.1, W / 2, H / 2, R);
    oc.addColorStop(0, '#16203a'); oc.addColorStop(1, '#070a14');
    ctx.fillStyle = oc; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, 2 * Math.PI); ctx.fill();
    // back-side orbits & sats
    drawSats(t, true);
    ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.beginPath(); path(land); ctx.fillStyle = '#1b2236'; ctx.fill(); ctx.strokeStyle = 'rgba(140,160,210,0.35)'; ctx.lineWidth = 0.6; ctx.stroke();
    // fires
    const center = [-lambda, 18];
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      if (d3.geoDistance(f, center) > Math.PI / 2 - 0.02) continue;
      const p = projection(f); if (!p) continue;
      const flick = 0.55 + 0.45 * Math.sin(t * 0.004 + i * 1.7);
      const r = 1.1 + (f[2] || 0) * 0.5;
      ctx.fillStyle = `rgba(255,${90 + ((i * 37) % 90)},40,${0.35 * flick})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], r * 3, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(255,210,120,${0.9 * flick})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.8, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // terminator-ish shading
    const sh = ctx.createLinearGradient(W / 2 - R, 0, W / 2 + R, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.65, 'rgba(0,0,0,0.05)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, 2 * Math.PI); ctx.fill();
    drawSats(t, false);
  }
  function drawSats(t, back) {
    SATS.forEach((s, k) => {
      // orbit ring
      ctx.beginPath();
      let started = false;
      for (let a = 0; a <= 64; a++) {
        const ll = satLonLat({ ...s, phase: s.phase + (a / 64) * 2 * Math.PI }, t);
        const p = toScreen(ll, 1.14 + k * 0.035);
        if (!p || p.behind !== back) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = s.color + (back ? '18' : '40'); ctx.lineWidth = 1; ctx.stroke();
      const p = toScreen(satLonLat(s, t), 1.14 + k * 0.035);
      if (!p || p.behind !== back) return;
      trails[k].push(p); if (trails[k].length > 14) trails[k].shift();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = back ? 0.35 : 1;
      ctx.shadowColor = s.color; ctx.shadowBlur = back ? 0 : 14;
      ctx.beginPath(); ctx.arc(p.x, p.y, back ? 2 : 3.6, 0, 6.283); ctx.fill();
      ctx.shadowBlur = 0;
      if (!back && W > 640) { ctx.font = '600 11px JetBrains Mono, monospace'; ctx.fillStyle = s.color; ctx.fillText(s.name, p.x + 8, p.y - 6); }
      ctx.globalAlpha = 1;
    });
  }
  requestAnimationFrame(frame);
  return { fireCount: fires.length };
}
