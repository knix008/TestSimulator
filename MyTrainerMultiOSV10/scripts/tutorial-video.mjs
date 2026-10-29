// npm run tutorial:video — records the whole tutorial on auto play in the real (web) app and encodes it as
// docs/video/MyTrainer-Tutorial[.en].mp4 (the installer carries docs/, Help › Tutorial video opens it),
// with the chapter and step start times in a JSON beside it, and a copy in the project root.
//
// Headless Edge/Chrome over CDP: screenshots in a row (about 8 a second, each with its time); each
// frame is held until the next one (ffmpeg concat durations), so the video runs at real speed. Silent.
// Needs ffmpeg (PATH, FFMPEG=…, or Chocolatey's). TUTORIAL_LANG=en records the English tour; THEME=dark.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWeb } from '../test/e2e/web.harness.mjs';
import { sleep } from '../test/e2e/cdp.mjs';
import { CHAPTERS, STEP_TEXT } from '../src/domain/tutorial-text.js';
import { STEPS } from '../src/ui/tutorial.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1600;
const HEIGHT = 900;
const lang = process.env.TUTORIAL_LANG === 'en' ? 'en' : 'ko';
const name = lang === 'en' ? 'MyTrainer-Tutorial.en' : 'MyTrainer-Tutorial';

function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { /* not on PATH */ }
  const choco = 'C:/ProgramData/chocolatey/bin/ffmpeg.exe';
  if (fs.existsSync(choco)) return choco;
  throw new Error('ffmpeg 가 필요합니다 (PATH 또는 FFMPEG=경로)');
}

const encoder = ffmpeg();
const { page, close } = await startWeb({ width: WIDTH, height: HEIGHT, storage: { 'mytrainer.settings.v1': { language: lang, showStartPage: true, theme: process.env.THEME ?? 'light' } } });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mytrainer-video-'));
try {
  await sleep(2000);
  // Screenshots one after the other (about 8 a second): each one makes the page draw. A screencast only
  // sends a frame when the page draws by itself, which a headless browser stops doing after a while.
  const frames = [];
  let recording = true;
  const recorder = (async () => {
    while (recording) {
      const time = Date.now() / 1000;
      const response = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 }).catch(() => null);
      if (!response?.result?.data) continue;
      const file = path.join(work, `${String(frames.length).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(response.result.data, 'base64'));
      frames.push({ file, time });
      await sleep(Math.max(0, 120 - (Date.now() / 1000 - time) * 1000));
    }
  })();
  // When each step starts (page clock, seconds): the chapter marks.
  await page.eval('(() => { window.__tourTimes = {}; window.__tourTimer = setInterval(() => { const s = __mytrainer.tutorial.state(); if (s.active && !(s.index in window.__tourTimes)) window.__tourTimes[s.index] = Date.now() / 1000; }, 40); return 1; })()');
  await sleep(1500);
  await page.eval('(() => { __mytrainer.tutorial.start({ autoplay: true, index: 0 }); return 1; })()');
  let shown = -1;
  const deadline = Date.now() + 15 * 60000;
  for (;;) {
    const s = JSON.parse(await page.eval('JSON.stringify(__mytrainer.tutorial.state())'));
    if (s.index !== shown && s.index >= 0) { shown = s.index; process.stdout.write(`\r  ${s.index + 1}/${STEPS.length} ${STEPS[s.index][0].padEnd(16)}`); }
    if (!s.active) break;
    if (Date.now() > deadline) throw new Error('the tutorial did not finish in 15 minutes');
    await sleep(400);
  }
  await sleep(1500);
  recording = false;
  await recorder;
  const stepTimes = JSON.parse(await page.eval('(clearInterval(window.__tourTimer), JSON.stringify(window.__tourTimes))'));
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
  execFileSync(encoder, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', process.env.CRF ?? '26', '-g', '120', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  const duration = endOf(frames.length - 1);
  const text = new Map(STEP_TEXT.map(([id, chapter, koTitle, , enTitle]) => [id, { chapter, title: lang === 'en' ? enTitle : koTitle }]));
  const at = (i) => (stepTimes[i] != null ? Math.max(0, Math.round((stepTimes[i] - origin) * 10) / 10) : null);
  const chapters = [];
  STEPS.forEach(([id], i) => { const { chapter } = text.get(id); if (!chapters.some((c) => c.id === chapter)) chapters.push({ id: chapter, title: CHAPTERS[chapter][lang], start: at(i) }); });
  const sidecar = { video: `${name}.mp4`, width: WIDTH, height: HEIGHT, duration: Math.round(duration * 10) / 10, recorded: new Date().toISOString(), chapters, steps: STEPS.map(([id], i) => ({ id, title: text.get(id).title, start: at(i) })) };
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(sidecar, null, 2));
  fs.copyFileSync(out, path.join(root, `${name}.mp4`));
  console.log(`${frames.length} frames → ${name}.mp4 (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${duration.toFixed(0)} s) in docs/video/ and the project root`);
} finally {
  await close();
  setTimeout(() => { try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* still open */ } }, 1500);
}
