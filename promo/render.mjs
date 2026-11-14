// Render the intro video frame-by-frame with headless Chrome + ffmpeg.
// Needs `npm run dev -- --port 5179` running and promo/timing.json from voiceover.py.
//   node promo/render.mjs stills 2,12,30 out/       -> PNG stills
//   node promo/render.mjs video out/ [--captions] [--fps 30]
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.STAGE_URL || 'http://localhost:5179/promo/intro-video.html';
const [mode, a1, a2] = process.argv.slice(2);
const captions = process.argv.includes('--captions');
const fpsArg = process.argv.indexOf('--fps');
const FPS = fpsArg > 0 ? +process.argv[fpsArg + 1] : 30;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(`${BASE}?captions=${captions ? 1 : 0}${process.env.STAGE_QUERY || ''}`, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const total = await page.evaluate('window.__total');
const scenes = await page.evaluate('window.__scenes');

if (mode === 'stills') {
  const out = a2 || '.'; fs.mkdirSync(out, { recursive: true });
  for (const t of a1.split(',').map(Number)) {
    await page.evaluate((x) => window.__seek(x), t);
    await page.screenshot({ path: path.join(out, `still-${String(t).padStart(5, '0')}.png`) });
  }
  console.log('total', total.toFixed(2));
} else {
  const out = a1; fs.mkdirSync(out, { recursive: true });
  const silent = path.join(out, `video-${captions ? 'cc' : 'clean'}${process.env.SUFFIX || ''}-silent.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.ceil(total * FPS);
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    await page.evaluate((x) => window.__seek(x), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  fs.writeFileSync(path.join(out, 'scenes.json'), JSON.stringify({ total, scenes }, null, 1));
  console.log('done', silent);
}
await browser.close();
void execFileSync;
