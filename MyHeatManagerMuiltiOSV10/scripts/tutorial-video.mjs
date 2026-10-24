// npm run tutorial:video — records the whole tutorial on auto play in the real
// (web) app and encodes it as MyHeatManager-Tutorial.mp4 in the project root
// (and docs/video/), with the chapter start times in a JSON beside it.
//
// Headless Edge/Chrome over CDP (test/e2e/cdp.mjs): Page.startScreencast sends
// a frame whenever the screen changes; each frame is held until the next one
// (ffmpeg concat durations), so the video runs at real speed. Needs ffmpeg
// (PATH, FFMPEG=…, or Chocolatey's). TUTORIAL_LANG=en records the English tour.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVite, launchBrowser, sleep, waitFor } from '../test/e2e/cdp.mjs';
import { CHAPTERS, STEP_TEXT } from '../src/core/tutorial-text.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1600;
const HEIGHT = 900;
const lang = process.env.TUTORIAL_LANG === 'en' ? 'en' : 'ko';
const name = lang === 'en' ? 'MyHeatManager-Tutorial.en' : 'MyHeatManager-Tutorial';

function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { /* not on PATH */ }
  const choco = 'C:/ProgramData/chocolatey/bin/ffmpeg.exe';
  if (fs.existsSync(choco)) return choco;
  throw new Error('ffmpeg 가 필요합니다 (PATH 또는 FFMPEG=경로)');
}

const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: WIDTH, height: HEIGHT });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myheat-video-'));
try {
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } }).catch(() => {});
  await cdp.evaluate(`window.__myheat.api.patchSettings({ language: '${lang}', theme: 'dark', tutorialDone: false, startBgTransparency: 0 })`);
  await cdp.evaluate('window.__myheat.api.closeDocForce(window.__myheat.doc().id)');
  await sleep(500);
  const steps = await cdp.evaluate('(async () => (await import("/src/ui/tutorial.js")).STEPS.map((s) => ({ id: s.id, chapter: s.chapter })))()');
  const frames = [];
  cdp.on('Page.screencastFrame', (frame) => {
    const file = path.join(work, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(frame.data, 'base64'));
    frames.push({ file, time: frame.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  });
  // When each step starts (page clock): the chapter marks.
  await cdp.evaluate('(() => { window.__tourTimes = {}; window.__tourTimer = setInterval(() => { const s = window.__myheat.tutorial.state(); if (s.active && !(s.index in window.__tourTimes)) window.__tourTimes[s.index] = Date.now() / 1000; }, 40); return 1; })()');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
  await sleep(1500);
  await cdp.evaluate('window.__myheat.tutorial.start({ autoplay: true, index: 0 })');
  const last = steps.length - 1;
  let shown = -1;
  await waitFor(async () => {
    const s = await cdp.evaluate('window.__myheat.tutorial.state()');
    if (s.index !== shown) { shown = s.index; process.stdout.write(`\r  ${s.index + 1}/${steps.length} ${steps[s.index].id.padEnd(18)}`); }
    return s.index === last && !s.busy;
  }, 30 * 60000, 500);
  await sleep(6000);
  await cdp.send('Page.stopScreencast');
  const stepTimes = await cdp.evaluate('(clearInterval(window.__tourTimer), window.__tourTimes)');
  await cdp.evaluate('window.__myheat.tutorial.stop()');
  process.stdout.write('\n');
  if (frames.length < 10) throw new Error(`only ${frames.length} frames recorded`);

  const origin = frames[0].time;
  const offset = (time) => Math.round((time - origin) * 1000) / 1000;
  const endOf = (i) => offset(frames[i + 1]?.time ?? frames[i].time + 2);
  const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, endOf(i) - offset(f.time)).toFixed(3)}`).join('\n');
  const listFile = path.join(work, 'list.txt');
  fs.writeFileSync(listFile, `${list}\nfile '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`);
  const outDir = path.join(root, 'docs', 'video');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}.mp4`);
  // Mostly still screens with sharp text: -tune stillimage, a keyframe every 4 s for quick seeking.
  execFileSync(ffmpeg(), ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', process.env.CRF ?? '24', '-g', '120', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  const duration = endOf(frames.length - 1);
  // Chapter marks: the start of each chapter's first step, in seconds into the video.
  const chapters = [];
  steps.forEach((step, i) => {
    const time = stepTimes[i] != null ? Math.max(0, Math.round((stepTimes[i] - origin) * 10) / 10) : null;
    if (!chapters.some((c) => c.id === step.chapter)) chapters.push({ id: step.chapter, title: CHAPTERS[step.chapter][lang === 'en' ? 1 : 0], start: time });
  });
  const sidecar = {
    video: `${name}.mp4`, width: WIDTH, height: HEIGHT, duration: Math.round(duration * 10) / 10, recorded: new Date().toISOString(), chapters,
    steps: steps.map((s, i) => ({ id: s.id, title: STEP_TEXT[s.id][lang].title, start: stepTimes[i] != null ? Math.round((stepTimes[i] - origin) * 10) / 10 : null })),
  };
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(sidecar, null, 2));
  fs.copyFileSync(out, path.join(root, `${name}.mp4`));
  console.log(`${frames.length} frames → ${name}.mp4 (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${duration.toFixed(0)} s) in docs/video/ and the project root`);
  if (errors.length) {
    console.error(`page errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  stop();
  vite.stop();
  setTimeout(() => { try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* still open */ } }, 1500);
}
