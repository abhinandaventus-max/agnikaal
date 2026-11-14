// Realistic WebGL Earth for the hero: NASA Blue Marble (day) + Black Marble (night lights),
// day/night terminator with ocean glint, Fresnel atmosphere, live VIIRS fires, orbiting satellites, stars.
import * as THREE from 'three';

const DEG = Math.PI / 180;
// matches THREE.SphereGeometry UV mapping for an equirectangular texture
function lonLatToVec(lon, lat, r) {
  const phi = (lon + 180) * DEG, th = lat * DEG;
  return new THREE.Vector3(-Math.cos(phi) * Math.cos(th) * r, Math.sin(th) * r, Math.sin(phi) * Math.cos(th) * r);
}

const EARTH_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vView;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const EARTH_FS = `
uniform sampler2D dayTex; uniform sampler2D nightTex; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vView;
void main(){
  vec3 day = texture2D(dayTex, vUv).rgb; vec3 night = texture2D(nightTex, vUv).rgb;
  float ndl = dot(normalize(vN), normalize(sunDir));
  float light = smoothstep(-0.12, 0.25, ndl);
  // ocean glint: blue-dominant pixels get a soft specular highlight
  float ocean = smoothstep(0.05, 0.25, day.b - max(day.r, day.g) * 0.85);
  vec3 h = normalize(normalize(sunDir) + vView);
  float spec = pow(max(dot(normalize(vN), h), 0.0), 40.0) * ocean * 0.55;
  vec3 col = day * (0.08 + 1.05 * light) + vec3(1.0, 0.92, 0.8) * spec * light;
  col += night * vec3(1.0, 0.78, 0.5) * pow(1.0 - light, 2.0) * 1.35;
  // limb darkening + slight warm tint near terminator
  float rim = pow(1.0 - max(dot(normalize(vN), vView), 0.0), 2.0);
  col = mix(col, col * vec3(1.05, 0.9, 0.8), smoothstep(0.0, 0.2, ndl) * (1.0 - smoothstep(0.2, 0.5, ndl)) * 0.6);
  col += vec3(0.25, 0.55, 1.0) * rim * 0.35 * (0.3 + light);
  gl_FragColor = vec4(col, 1.0);
}`;
const ATM_VS = `varying vec3 vN; varying vec3 vView;
void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const ATM_FS = `uniform vec3 sunDir; varying vec3 vN; varying vec3 vView;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vView)), 3.2);
  float lit = 0.35 + 0.65 * smoothstep(-0.4, 0.6, dot(normalize(vN), normalize(sunDir)));
  gl_FragColor = vec4(vec3(0.32, 0.62, 1.0) * f * 1.6 * lit, f * lit); }`;

function dotTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export async function startEarth(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no webgl');
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(0, 0, 4.7);
  const loader = new THREE.TextureLoader();
  const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
  const [dayTex, nightTex] = await Promise.all([load('/textures/earth-day.jpg'), load('/textures/earth-night.jpg')]);
  dayTex.colorSpace = THREE.SRGBColorSpace; nightTex.colorSpace = THREE.SRGBColorSpace;
  dayTex.anisotropy = nightTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const sunDir = new THREE.Vector3(-0.85, 0.25, 0.55).normalize();
  const tilt = new THREE.Group(); tilt.rotation.z = 23.4 * DEG * 0.6; scene.add(tilt);
  const earth = new THREE.Group(); tilt.add(earth);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.ShaderMaterial({ uniforms: { dayTex: { value: dayTex }, nightTex: { value: nightTex }, sunDir: { value: sunDir } }, vertexShader: EARTH_VS, fragmentShader: EARTH_FS }));
  earth.add(globe);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.08, 96, 64), new THREE.ShaderMaterial({ uniforms: { sunDir: { value: sunDir } }, vertexShader: ATM_VS, fragmentShader: ATM_FS, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  scene.add(atm);

  // live fires (last 24 h VIIRS sample)
  let fires = [];
  try { const r = await fetch('/data/live_sample.json'); if (r.ok) fires = (await r.json()).points || []; } catch { /* offline */ }
  const fpos = new Float32Array(fires.length * 3), fsize = new Float32Array(fires.length), fph = new Float32Array(fires.length);
  fires.forEach(([lon, lat, s], i) => { const v = lonLatToVec(lon, lat, 1.004); fpos.set([v.x, v.y, v.z], i * 3); fsize[i] = 0.018 + (s || 0) * 0.01; fph[i] = Math.random() * 6.28; });
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('size', new THREE.BufferAttribute(fsize, 1));
  fgeo.setAttribute('phase', new THREE.BufferAttribute(fph, 1));
  const fmat = new THREE.ShaderMaterial({
    uniforms: { map: { value: dotTexture('rgba(255,230,160,1)', 'rgba(255,90,20,0)') }, time: { value: 0 }, scale: { value: 600 } },
    vertexShader: `attribute float size; attribute float phase; uniform float time; uniform float scale; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vec3 n = normalize(normalMatrix * normalize(position));
        vA = smoothstep(-0.05, 0.25, dot(n, normalize(-mv.xyz))) * (0.65 + 0.35 * sin(time * 3.0 + phase));
        gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(c.rgb, c.a * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  earth.add(new THREE.Points(fgeo, fmat));

  // satellites on sun-synchronous-like orbits
  const sats = [
    ['#a98bff', 0.2, 1.17, 0.0], ['#c4b0ff', 2.1, 1.2, 2.2], ['#5ad1ff', 1.2, 1.23, 4.0], ['#8fe3ff', 3.0, 1.26, 1.1], ['#b8efff', 4.4, 1.29, 3.3],
  ].map(([color, raan, r, phase]) => {
    const g = new THREE.Group(); g.rotation.y = raan; g.rotation.x = (98.2 - 90) * DEG; scene.add(g);
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => { const a = (i / 128) * Math.PI * 2; return new THREE.Vector3(0, Math.cos(a) * r, Math.sin(a) * r); })), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.16 }));
    g.add(ring);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(0.07); g.add(sp);
    return { g, sp, r, phase };
  });

  // start facing India
  const phi0 = (78 + 180) * DEG;
  earth.rotation.y = Math.PI / 2 - phi0;
  let vel = 0.0006, drag = null, visible = true, last = performance.now();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, r: earth.rotation.y }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (drag) { const nr = drag.r + (e.clientX - drag.x) * 0.006; vel = (nr - earth.rotation.y) * 0.5; earth.rotation.y = nr; } });
  const up = () => { drag = null; vel = Math.max(-0.02, Math.min(0.02, vel)); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    fmat.uniforms.scale.value = h * 1.1;
  }
  resize(); window.addEventListener('resize', resize);
  canvas.classList.add('ready', 'webgl');

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(50, now - last); last = now;
    if (!drag) { vel += (0.0006 - vel) * 0.02; if (!reduce) earth.rotation.y += vel * dt / 16; }
    fmat.uniforms.time.value = now / 1000;
    sats.forEach((s, i) => { const a = s.phase + now * 0.00012 * (1 + i * 0.03); s.sp.position.set(0, Math.cos(a) * s.r, Math.sin(a) * s.r); });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  return { fireCount: fires.length };
}
