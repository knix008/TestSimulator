// npm run tutorial:video — records the whole in-app tutorial on auto play in the real (web) app and encodes it as
//   doc/video/MyProductionFlow-Tutorial.mp4   (Help › Tutorial video plays it; the installer carries doc/)
//   doc/video/MyProductionFlow-Tutorial.json  (chapter and step start times, titles in Korean and English)
// with a copy of the mp4 in the project root.
//
// Headless Edge/Chrome over CDP (test/e2e/web.harness.mjs). Screenshots one after the other (about 10 a second,
// each with its time) — each request makes the page draw, while a screencast only gets frames when a headless page
// draws by itself, which it stops doing after a while. Each frame is held until the next one (ffmpeg concat
// durations), so the video runs at real speed. Silent.
// Needs ffmpeg (PATH, FFMPEG=…, or Chocolatey's). TUTORIAL_LANG=en records the English tour (…Tutorial.en.mp4);
// THEME=dark; --preview records only the first chapter (quick check, not copied to the root).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WebApp } = await import(pathToFileURL(path.join(root, 'test/e2e/web.harness.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIDTH = 1600;
const HEIGHT = 960;
const lang = process.env.TUTORIAL_LANG === 'en' ? 'en' : 'ko';
const theme = process.env.THEME ?? 'light';
const preview = process.argv.includes('--preview');
const name = lang === 'en' ? 'MyProductionFlow-Tutorial.en' : 'MyProductionFlow-Tutorial';

function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { /* not on PATH */ }
  const choco = 'C:/ProgramData/chocolatey/bin/ffmpeg.exe';
  if (fs.existsSync(choco)) return choco;
  throw new Error('ffmpeg 가 필요합니다 (PATH 또는 FFMPEG=경로)');
}

const encoder = ffmpeg();
const app = new WebApp({ gpu: true, width: WIDTH, height: HEIGHT });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myproductionflow-video-'));
let failed = false;
try {
  await app.start();
  await app.run(`A.actions.updateSettings({ language: '${lang}', theme: '${theme}', tutorialDone: false, startShowTutorialBanner: true }); return 1;`);
  // Steps with their chapters, and every title in both languages (the video window shows the viewer's language).
  const info = await app.run(`const { STEPS, CHAPTERS } = await import('/src/ui/tutorial.js'); const { DICTIONARIES } = await import('/src/i18n.js');
    const both = (key) => ({ ko: DICTIONARIES.ko[key] ?? key, en: DICTIONARIES.en[key] ?? key });
    return { chapters: CHAPTERS.map((id) => ({ id, title: both('tutorial.chapter.' + id) })), steps: STEPS.map((s) => ({ id: s.id, chapter: s.chapter, dwell: s.dwell ?? 4200, title: both('tutorial.' + s.id + '.title') })) };`);
  const last = preview ? info.steps.findLastIndex((s) => s.chapter === info.steps[0].chapter) : info.steps.length - 1;
  await sleep(1500);

  const frames = [];
  let recording = true;
  const recorder = (async () => {
    while (recording) {
      const time = Date.now() / 1000;
      const response = await app.main.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 }).catch(() => null);
      if (!response?.result?.data) { await sleep(50); continue; }
      const file = path.join(work, `${String(frames.length).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(response.result.data, 'base64'));
      frames.push({ file, time });
      await sleep(Math.max(0, 100 - (Date.now() / 1000 - time) * 1000));
    }
  })();
  // When each step starts (page clock = this clock, same machine): the chapter marks.
  await app.run(`window.__tourTimes = {}; window.__tourTimer = setInterval(() => { const s = A.tutorial()?.state(); if (s?.active && !(s.index in window.__tourTimes)) window.__tourTimes[s.index] = Date.now() / 1000; }, 40); return 1;`);
  await sleep(1200);
  await app.run(`A.run('tutorial'); await T.until(() => A.tutorial()?.state().active, 10000, 'tutorial'); const tut = A.tutorial(); tut.autoplay = true; await tut.go(0); return 1;`, 60000);
  let shown = -1;
  const deadline = Date.now() + 20 * 60000;
  for (;;) {
    const s = await app.run(`return A.tutorial().state();`);
    if (s.index !== shown) { shown = s.index; process.stdout.write(`\r  ${s.index + 1}/${info.steps.length} ${info.steps[s.index].id.padEnd(18)}`); }
    if (!s.active) throw new Error('the tutorial stopped early');
    if (s.index === last && !s.busy) break;
    if (Date.now() > deadline) throw new Error('the tutorial did not finish in 20 minutes');
    await sleep(300);
  }
  // Hold the last step as long as auto play would.
  await sleep(info.steps[last].dwell);
  recording = false;
  await recorder;
  const stepTimes = await app.run(`clearInterval(window.__tourTimer); return window.__tourTimes;`);
  await app.run(`await A.tutorial().stop(); A.actions.updateSettings({ language: 'ko' }); return 1;`).catch(() => {});
  process.stdout.write('\n');
  if (frames.length < 10) throw new Error(`only ${frames.length} frames recorded`);

  const origin = frames[0].time;
  const offset = (time) => Math.round((time - origin) * 1000) / 1000;
  const endOf = (i) => offset(frames[i + 1]?.time ?? frames[i].time + 0.1);
  const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, endOf(i) - offset(f.time)).toFixed(3)}`).join('\n');
  const listFile = path.join(work, 'list.txt');
  fs.writeFileSync(listFile, `${list}\nfile '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`);
  const outDir = path.join(root, 'doc', 'video');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}${preview ? '.preview' : ''}.mp4`);
  // Mostly still screens with sharp text: -tune stillimage, a keyframe every 4 s for quick seeking.
  execFileSync(encoder, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', process.env.CRF ?? '25', '-g', '120', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  const duration = endOf(frames.length - 1);
  const at = (i) => (stepTimes[i] != null ? Math.max(0, Math.round((stepTimes[i] - origin) * 10) / 10) : null);
  const steps = info.steps.slice(0, last + 1).map((s, i) => ({ id: s.id, chapter: s.chapter, start: at(i), title: s.title }));
  const chapters = [];
  for (const step of steps) {
    if (step.start == null || chapters.some((c) => c.id === step.chapter)) continue;
    chapters.push({ id: step.chapter, start: step.start, title: info.chapters.find((c) => c.id === step.chapter).title });
  }
  const sidecar = { video: path.basename(out), language: lang, width: WIDTH, height: HEIGHT, duration: Math.round(duration * 10) / 10, recorded: new Date().toISOString(), chapters, steps };
  fs.writeFileSync(out.replace(/\.mp4$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  if (!preview) fs.copyFileSync(out, path.join(root, `${name}.mp4`));
  console.log(`${frames.length} frames → ${path.basename(out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${duration.toFixed(0)} s) in doc/video/${preview ? '' : ' and the project root'}`);
  const errors = app.takeErrors();
  if (errors.length) { console.error(`page errors:\n${errors.join('\n')}`); failed = true; }
} finally {
  await app.stop();
  setTimeout(() => { try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* still open */ } }, 1500);
}
if (failed) process.exitCode = 1;
