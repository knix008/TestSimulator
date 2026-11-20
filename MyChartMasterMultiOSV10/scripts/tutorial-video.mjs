// npm run tutorial:video — records the in-app tutorial on auto play into MyChartMaster-Tutorial.mp4.
//
// Builds the web app into a temporary folder (never dist/), serves it, and plays the tutorial in a headless
// Edge / Chrome (test/e2e/browser.mjs) while a CDP screencast records it; ffmpeg (on PATH) makes the MP4.
// The video is Korean and silent. It is written to:
//   - the project root:        MyChartMaster-Tutorial.mp4
//   - docs/video/ (installer): MyChartMaster-Tutorial.mp4 + MyChartMaster-Tutorial.json (chapters and steps)
//
//   node scripts/tutorial-video.mjs                 Korean (default)
//   node scripts/tutorial-video.mjs --lang en       English
//   node scripts/tutorial-video.mjs --web <folder>  use an existing web build instead of building one
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, serve } from '../test/e2e/browser.mjs';

// Vite cannot glob node_modules from a lower-case drive path (d:/…) on Windows: use an upper-case drive letter.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const language = option('--lang') ?? 'ko';
const WIDTH = 1600;
const HEIGHT = 1000;
const NAME = 'MyChartMaster-Tutorial';
const P = 'window.__mychartmaster';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.error('ffmpeg is not on PATH'); process.exit(1); }

let webDir = option('--web');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mychartmaster-video-'));
if (!webDir) {
  webDir = path.join(work, 'web');
  console.log('Building the web app…');
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', webDir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
}

const { STEPS } = await import(pathToFileURL(path.join(root, 'src', 'ui', 'tutorial.js')).href).catch(() => ({ STEPS: null }));
const dicts = {};
for (const lang of ['ko', 'en']) {
  const base = (await import(pathToFileURL(path.join(root, 'src', 'i18n', `${lang}.js`)).href)).default;
  const extra = (await import(pathToFileURL(path.join(root, 'src', 'i18n', `chart-${lang}.js`)).href)).default;
  const sheet = (await import(pathToFileURL(path.join(root, 'src', 'i18n', `sheet-${lang}.js`)).href)).default;
  dicts[lang] = { ...base, ...extra, ...sheet };
}

const server = await serve(webDir);
const page = await launch(`${server.url}?nowelcome`, { width: WIDTH, height: HEIGHT, language });
const frameDir = path.join(work, 'frames');
fs.mkdirSync(frameDir, { recursive: true });
const frames = [];
let pageErrors = [];
try {
  const js = (code) => page.eval(code);
  await page.waitFor(`Boolean(${P}?.actions && document.querySelector('#toolbar .tool-button'))`, 30000);
  await js(`(${P}.actions.updateSettings(${JSON.stringify({ language, showWelcome: false, theme: 'light', showNetMap: false, paneLayout: 'stack' })}), 1)`);
  await sleep(1200);

  // The step list as the page has it (the Node import above may fail on browser-only imports).
  const steps = STEPS?.map((s) => ({ id: s.id, chapter: s.chapter }))
    ?? await js(`(async () => (await import('/src/ui/tutorial.js')).STEPS.map((s) => ({ id: s.id, chapter: s.chapter })))()`);
  const tour = `${P}.tutorial()`;

  // Headless pages only paint while something asks for frames: the screencast does, so start it first.
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
  const onFrame = (frame) => {
    const file = path.join(frameDir, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(frame.data, 'base64'));
    frames.push({ file, time: frame.metadata.timestamp });
    page.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  };
  page.on('Page.screencastFrame', onFrame);
  await sleep(800);

  await js(`(${P}.actions.startTutorial({ autoplay: true }), 1)`);
  const marks = [];
  const stepMarks = [];
  const deadline = Date.now() + 40 * 60000;
  for (;;) {
    const state = await js(`(() => { const s = ${tour}?.state?.(); return s ? { index: s.index, active: s.active, busy: s.busy } : null; })()`).catch(() => null);
    if (state?.active) {
      const chapter = steps[state.index]?.chapter;
      if (chapter && !marks.some((m) => m.chapter === chapter)) marks.push({ chapter, at: Date.now() });
      if (stepMarks.at(-1)?.index !== state.index) {
        stepMarks.push({ index: state.index, at: Date.now() });
        process.stdout.write(`\r  step ${state.index + 1}/${steps.length} ${steps[state.index]?.id}                    `);
      }
      if (state.index === steps.length - 1 && !state.busy) break;
    }
    if (Date.now() > deadline) throw new Error('auto play did not reach the last step');
    await sleep(200);
  }
  process.stdout.write('\n');
  await sleep(6000);
  await page.send('Page.stopScreencast');
  await js(`${tour}.stop().then(() => 1)`).catch(() => {});
  pageErrors = page.errors.slice();
  if (frames.length < 10) throw new Error(`only ${frames.length} frames were recorded`);

  // Frames come only when something changes: each is held until the next (concat demuxer durations).
  const holds = frames.map((f, i) => Math.max(0.04, (frames[i + 1]?.time ?? f.time + 2) - f.time));
  const startsAt = [];
  holds.reduce((sum, hold, i) => { startsAt[i] = sum; return sum + hold; }, 0);
  const listFile = path.join(work, 'list.txt');
  const entry = (f) => `file '${f.file.replace(/\\/g, '/')}'`;
  fs.writeFileSync(listFile, `${frames.map((f, i) => `${entry(f)}\nduration ${holds[i].toFixed(3)}`).join('\n')}\n${entry(frames.at(-1))}\n`);
  const out = path.join(root, `${NAME}.mp4`);
  console.log(`Encoding ${frames.length} frames…`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-movflags', '+faststart', out], { stdio: 'inherit' });

  // The in-app player (docs/video/, carried by the installer) gets the video and its chapter sidecar.
  const videoTime = (at) => {
    let i = 0;
    while (i + 1 < frames.length && frames[i + 1].time * 1000 <= at) i += 1;
    return Math.max(0, Math.round((startsAt[i] + Math.max(0, Math.min(holds[i], at / 1000 - frames[i].time))) * 10) / 10);
  };
  const title = (key) => ({ ko: dicts.ko[key] ?? '', en: dicts.en[key] ?? '' });
  const sidecar = {
    video: `${NAME}.mp4`, width: WIDTH, height: HEIGHT, language,
    duration: Math.round(holds.reduce((sum, hold) => sum + hold, 0) * 10) / 10,
    chapters: marks.map((m) => ({ id: m.chapter, start: videoTime(m.at), title: title(`tutorial.chapter.${m.chapter}`) })),
    steps: stepMarks.map((m) => ({ id: steps[m.index].id, chapter: steps[m.index].chapter, start: videoTime(m.at), title: title(`tutorial.${steps[m.index].id}.title`) })),
  };
  const videoDir = path.join(root, 'docs', 'video');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.copyFileSync(out, path.join(videoDir, `${NAME}.mp4`));
  fs.writeFileSync(path.join(videoDir, `${NAME}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
  console.log(`${path.relative(root, out)}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${sidecar.duration} s, ${sidecar.chapters.length} chapters, ${sidecar.steps.length} steps`);
} finally {
  await page.close();
  await server.close();
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 });
}

if (pageErrors.length) {
  console.log('Page errors:');
  for (const e of pageErrors) console.log(`  ${e.split('\n')[0]}`);
  process.exitCode = 1;
}

