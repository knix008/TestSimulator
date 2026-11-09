// Runs the in-app tutorial in the web version (Vite dev server + headless Microsoft Edge or
// Chrome with the real graphics card) and records it. Nothing of the user's is touched: the
// browser gets a new, empty profile that is deleted afterwards, and the dev server listens on a
// port that is free on both 127.0.0.1 and ::1 (scripts/dev-port.mjs) — a server another program
// (or a running `npm start`) uses is never reused or stopped.
//
//   node scripts/tutorial-capture.mjs docs    one screenshot per step and language →
//                                             doc/tutorial/images/NN-<step>.jpg (Korean UI) and
//                                             doc/tutorial/images/en/NN-<step>.jpg (English UI),
//                                             then the HTML pages (scripts/build-docs.mjs)
//   node scripts/tutorial-capture.mjs check   every step once in both languages, fails on page errors
//   node scripts/tutorial-capture.mjs video   the whole tour on auto play (Korean) →
//                                             doc/video/MySketchBook-Tutorial.mp4 (H.264, faststart) and
//                                             MySketchBook-Tutorial.json (start of every step and chapter,
//                                             for the player's chapter marks). Needs ffmpeg (PATH, FFMPEG=…
//                                             or Chocolatey's). CRF=… sets the quality (default 24).
//
// Options: --lang=ko|en (docs/check: only that language), --keep (leave the browser profile).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Page, sleep, waitTarget } from '../test/e2e/cdp.mjs';
import { freeDevPort } from './dev-port.mjs';
import { tutorialSteps } from './build-docs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'docs';
const option = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? null;
const languages = option('lang') ? [option('lang')] : mode === 'video' ? ['ko'] : ['ko', 'en'];
const P = 'window.__mysketchbook';
// The main window's minimum width follows its toolbar (about 1640 px in Korean, 1750 px in English):
// a narrower page would cut off the right of the toolbar and the right panel.
const WIDTH = 1760;
const HEIGHT = 990;

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

/** A port for the browser's debugger (any free one; nothing else listens there). */
const anyPort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

async function answers(url) { try { return (await fetch(url)).ok; } catch { return false; } }

// ───────────────────────── server and browser

const { steps, chapters } = tutorialSteps();
const devPort = await freeDevPort(5600);
const url = `http://127.0.0.1:${devPort}/`;
// MYSKETCHBOOK_NO_HMR: an edit to src/ while capturing must not reload the page under the tour.
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(devPort), '--strictPort'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, MYSKETCHBOOK_NO_HMR: '1' },
});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mysketchbook-tour-'));
let browser = null;
let page = null;
const errors = [];

async function shutdown() {
  page?.close();
  try { browser?.kill(); } catch { /* gone */ }
  try { vite.kill(); } catch { /* gone */ }
  await sleep(600);
  if (!process.argv.includes('--keep')) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still in use */ } }
}
process.on('SIGINT', () => { shutdown().finally(() => process.exit(130)); });

try {
  for (let i = 0; !(await answers(url)); i++) {
    if (i > 600) throw new Error(`Vite (${url}) did not answer in 90 s`);
    await sleep(150);
  }
  const exe = process.env.BROWSER ?? BROWSERS.find((file) => fs.existsSync(file));
  if (!exe) throw new Error('Microsoft Edge or Google Chrome is needed (or BROWSER=<path>)');
  const debugPort = await anyPort();
  // Headless with the real GPU (WebGL through ANGLE/D3D11 on Windows, not SwiftShader), and no throttling of a
  // page nobody looks at. No sync and no extensions: a synced extension's welcome tab hid the page before.
  browser = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `--window-size=${WIDTH},${HEIGHT}`,
    '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=' + (process.platform === 'win32' ? 'd3d11' : 'default'),
    '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--disable-features=Translate',
    'about:blank',
  ], { stdio: 'ignore' });
  const target = await waitTarget(debugPort, (item) => item.type === 'page', 20000);
  page = await new Page(target).open();
  page.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
  page.on('Page.javascriptDialogOpening', () => { page.send('Page.handleJavaScriptDialog', { accept: true }); });
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });

  const ready = `Boolean(${P}?.actions && document.querySelector('#toolbar .tool-button') && document.querySelector('#statusbar .status-notice'))`;
  async function load(language) {
    // ?nowelcome: the first-run welcome popup is not part of the tour.
    await page.send('Page.navigate', { url: `${url}?nowelcome` });
    await page.waitFor(ready, { timeout: 90000, message: 'the app is ready' });
    // Vite may reload the page once while it optimises dependencies: wait until it stays.
    await sleep(2500);
    await page.waitFor(ready, { timeout: 60000, message: 'the app is ready again' });
    await page.eval(`(${P}.actions.updateSettings({ language: '${language}', showWelcome: false }), 1)`);
    await page.waitFor(`document.documentElement.lang === '${language}'`, { timeout: 10000, message: `language ${language}` });
    const gpu = await page.eval(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
    console.log(`[${language}] ${url} · GPU: ${gpu} · min width ${await page.eval(`getComputedStyle(document.documentElement).getPropertyValue('--min-width')`)}`);
    // Library thumbnails are drawn one per frame for the cards on screen and kept in memory; the tour redraws
    // the panel too often for them to finish, so they are made first (a project, the whole library, scrolled through).
    await page.eval(`(${P}.actions.newProject('apt84'), ${P}.actions.showLibrary('all'), 1)`);
    const pending = `document.querySelectorAll('#left-panel .lib-pending').length`;
    for (let i = 0; i < 60; i++) {
      await page.eval(`(() => { const b = document.querySelector('#left-panel .panel-body'); if (b) b.scrollTop = (b.scrollHeight * ${i % 10}) / 10; return 1; })()`);
      await sleep(500);
      if (i > 12 && (await page.eval(pending)) === 0) break;
    }
    await page.eval(`(() => { const b = document.querySelector('#left-panel .panel-body'); if (b) b.scrollTop = 0; return 1; })()`);
    await page.eval(`${P}.actions.closeProject({ force: true }).then(() => 1)`);
    await sleep(500);
  }

  const tour = `${P}.tutorial()`;
  // The tutorial object exists only after the first start; before it starts its state reads "step 0, not busy".
  const atStep = (index) => `Boolean(${tour}?.state().active && ${tour}.state().index === ${index} && !${tour}.state().busy)`;

  if (mode === 'docs' || mode === 'check') {
    for (const language of languages) {
      const outDir = path.join(root, 'doc', 'tutorial', 'images', ...(language === 'ko' ? [] : [language]));
      if (mode === 'docs') {
        fs.mkdirSync(outDir, { recursive: true });
        for (const name of fs.readdirSync(outDir)) if (name.toLowerCase().endsWith('.jpg')) fs.rmSync(path.join(outDir, name));
      }
      await load(language);
      await page.eval(`(${P}.api.run('tutorial'), 1)`);
      for (let i = 0; i < steps.length; i++) {
        if (i > 0) await page.eval(`(${tour}.next(), 1)`);
        await page.waitFor(atStep(i), { timeout: 60000, message: `tutorial step ${i + 1}` });
        await sleep(1400); // the step settles: camera animations, popups opening, thumbnails
        // Leaving the 2D plan keeps the top view's camera "up" (the 3D view comes back rolled; reported as an app
        // issue): the pictures show the view upright, as it is meant to be.
        await page.eval(`(() => { const vp = ${P}.viewport; if (vp && !vp.planMode && vp.camera.up.y < 0.99) { for (const c of [vp.perspective, vp.ortho]) c.up.set(0, 1, 0); vp.syncCameras(); } return 1; })()`);
        await sleep(300);
        // Wait for the view's full-quality frame (the viewport draws on demand).
        await page.eval(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))).then(() => 1)`);
        if (mode === 'docs') {
          let shot = null;
          for (let attempt = 0; attempt < 5 && !shot?.result?.data; attempt++) {
            if (attempt) await sleep(800);
            shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
          }
          if (!shot?.result?.data) throw new Error(`step ${i + 1} (${steps[i].id}): no screenshot (${shot?.error?.message ?? 'empty'})`);
          fs.writeFileSync(path.join(outDir, `${String(i + 1).padStart(2, '0')}-${steps[i].id}.jpg`), Buffer.from(shot.result.data, 'base64'));
        }
        process.stdout.write(`\r[${language}] ${i + 1}/${steps.length} ${steps[i].id}                    `);
      }
      process.stdout.write('\n');
      await page.eval(`${tour}.stop().then(() => 1)`);
    }
    if (mode === 'docs') execFileSync(process.execPath, [path.join(root, 'scripts', 'build-docs.mjs')], { stdio: 'inherit' });
  } else if (mode === 'video') {
    await load(languages[0]);
    const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mysketchbook-frames-'));
    const frames = [];
    page.on('Page.screencastFrame', (frame) => {
      const file = path.join(frameDir, `${String(frames.length).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(frame.data, 'base64'));
      frames.push({ file, time: frame.metadata.timestamp });
      page.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    });
    // When each step starts (page clock, ms): the chapter marks of the player.
    await page.eval(`(() => { window.__tourTimes = {}; window.__tourTimer = setInterval(() => { const s = ${tour}?.state(); if (s?.active && !(s.index in window.__tourTimes)) window.__tourTimes[s.index] = Date.now(); }, 40); return 1; })()`);
    await page.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
    await sleep(500);
    await page.eval(`(${P}.api.run('tutorial'), 1)`);
    await page.waitFor(`Boolean(${tour}?.state().active)`, { timeout: 20000, message: 'the tutorial starts' });
    await page.eval(`(() => { const t = ${tour}; t.autoplay = true; t.go(0); return 1; })()`);
    await page.waitFor(atStep(steps.length - 1), { timeout: 30 * 60000, interval: 500, message: 'auto play reaches the last step' });
    await sleep(6000);
    await page.send('Page.stopScreencast');
    const stepTimes = await page.eval(`(clearInterval(window.__tourTimer), window.__tourTimes)`);
    await page.eval(`${tour}.stop().then(() => 1)`);
    // Frames come only when something changes: each one is held until the next (concat demuxer durations), so the
    // video runs at real speed and the step times of the sidecar match it.
    const origin = frames[0].time;
    const offset = (time) => Math.round((time - origin) * 1000) / 1000;
    const endOf = (i) => offset(frames[i + 1]?.time ?? frames[i].time + 2);
    const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, endOf(i) - offset(f.time)).toFixed(3)}`).join('\n');
    const listFile = path.join(frameDir, 'list.txt');
    fs.writeFileSync(listFile, `${list}\nfile '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`);
    const outDir = path.join(root, 'doc', 'video');
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, 'MySketchBook-Tutorial.mp4');
    const crf = process.env.CRF ?? '24';
    execFileSync(ffmpeg(), ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', crf, '-g', '120', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
    const duration = endOf(frames.length - 1);
    await writeVideoChapters(path.join(outDir, 'MySketchBook-Tutorial.json'), stepTimes, origin, duration);
    fs.rmSync(frameDir, { recursive: true, force: true });
    console.log(`${frames.length} frames → ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${duration.toFixed(0)} s, CRF ${crf})`);
  } else {
    throw new Error(`unknown mode "${mode}" (docs | check | video)`);
  }
  if (errors.length) {
    console.error(`page errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await shutdown();
}

/** ffmpeg: FFMPEG=…, then PATH, then Chocolatey's shim on Windows. */
function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { /* not on PATH */ }
  const choco = 'C:/ProgramData/chocolatey/bin/ffmpeg.exe';
  if (process.platform === 'win32' && fs.existsSync(choco)) return choco;
  throw new Error('ffmpeg is needed (PATH or FFMPEG=<path>)');
}

/** doc/video/MySketchBook-Tutorial.json: start (s into the video) and ko/en title of every step and chapter. */
async function writeVideoChapters(file, stepTimes, origin, duration) {
  const { DICTIONARIES } = await import(pathToFileURL(path.join(root, 'src', 'i18n.js')).href);
  const title = (key) => ({ ko: DICTIONARIES.ko[key], en: DICTIONARIES.en[key] });
  const at = (index) => (stepTimes?.[index] != null ? Math.max(0, Math.round((stepTimes[index] / 1000 - origin) * 100) / 100) : null);
  const stepsOut = steps.map((step, index) => ({ id: step.id, chapter: step.chapter, start: at(index), title: title(`tutorial.${step.id}.title`) })).filter((step) => step.start != null);
  const chaptersOut = chapters.map((id) => ({ id, start: stepsOut.find((step) => step.chapter === id)?.start ?? null, title: title(`tutorial.chapter.${id}`) })).filter((c) => c.start != null);
  const data = { version: 1, video: path.basename(file).replace(/\.json$/, '.mp4'), width: WIDTH, height: HEIGHT, duration: Math.round(duration * 100) / 100, recorded: new Date().toISOString(), chapters: chaptersOut, steps: stepsOut };
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${path.relative(root, file)}: ${chaptersOut.length} chapters, ${stepsOut.length} steps`);
}
