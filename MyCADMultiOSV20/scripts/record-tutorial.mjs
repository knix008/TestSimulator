// npm run record:tutorial — the tutorial video (MyCAD-Tutorial.mp4 in the
// project folder): the app plays every lesson of the in-app tutorial in
// Watch mode, and ffmpeg records the app window from the screen (so the
// dialog windows the lessons open are in the video too).
//   node scripts/record-tutorial.mjs [--lang ko|en] [--speed 1.25] [--lessons 1-16] [--out file.mp4]
// Needs ffmpeg (on PATH or FFMPEG=…\ffmpeg.exe); Windows (gdigrab) or Linux (x11grab).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from '../test/e2e/harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const language = argument('lang', 'ko');
const speed = Number(argument('speed', '1.25'));
const [first, last] = argument('lessons', '1-16').split('-').map(Number);
const out = path.resolve(argument('out', path.join(root, language === 'ko' ? 'MyCAD-Tutorial.mp4' : `MyCAD-Tutorial-${language}.mp4`)));
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error('ffmpeg was not found. Install it (e.g. winget install ffmpeg) or set FFMPEG to ffmpeg.exe.');
  process.exit(1);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const k = 'window.__mycad';
const app = await new App().start();
const m = app.main;
let recorder = null;
const started = Date.now();
try {
  await m.eval(`(${k}.actions.updateSettings({ theme: 'light', language: '${language}', toolbarRows: 1, collapsedSections: [] }), 1)`);
  // The window stays in front while recording (its dialogs are its own children and stay above it).
  await m.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_always_on_top', { label: 'main', value: true }).then(() => 1)`).catch(() => {});
  await m.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus', { label: 'main' }).then(() => 1)`).catch(() => {});
  // A known place on screen: the top-left corner, at its normal size (physical pixels, as the screen grabber sees them).
  await m.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_position', { label: 'main', value: { Physical: { x: 0, y: 0 } } }).then(() => 1)`);
  await sleep(800);
  const size = await m.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|outer_size', { label: 'main' })`);
  const at = await m.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position', { label: 'main' })`);
  const even = (v) => Math.floor(v / 2) * 2;
  // Windows draws an invisible resize border (about 7 px) left, right and below the window: leave it out.
  const border = process.platform === 'win32' ? Math.round(7 * (size.width / Math.max(1, await m.eval('window.outerWidth'))) ) : 0;
  const main = { left: Math.max(0, at.x) + border, top: Math.max(0, at.y) };
  const width = even(size.width - border * 2);
  const height = even(size.height - border);
  console.log(`recording ${width}×${height} at ${main.left},${main.top}`);
  const input = process.platform === 'win32'
    ? ['-f', 'gdigrab', '-framerate', '25', '-draw_mouse', '0', '-offset_x', String(main.left), '-offset_y', String(main.top), '-video_size', `${width}x${height}`, '-i', 'desktop']
    : ['-f', 'x11grab', '-framerate', '25', '-draw_mouse', '0', '-video_size', `${width}x${height}`, '-i', `${process.env.DISPLAY ?? ':0'}+${main.left},${main.top}`];
  recorder = spawn(ffmpeg, ['-y', '-loglevel', 'error', ...input, '-vf', 'scale=1600:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  await sleep(1500);
  // Play the lessons: Watch mode, stopping after the last one asked for.
  const result = await m.eval(`(async () => {
    const t = await ${k}.actions.openTutorial({ lesson: ${first - 1}, mode: 'watch' });
    t.instant = false;
    t.speed = ${speed};
    const advance = t.advance.bind(t);
    t.advance = async () => (t.li === ${last - 1} && t.si === t.lesson.steps.length - 1 ? false : advance());
    await t.play();
    return { lesson: t.li + 1, step: t.si + 1, error: t.lastError ?? null };
  })()`, 3600000);
  await sleep(2500);
  console.log(`played to lesson ${result.lesson} step ${result.step}${result.error ? ` — stopped: ${result.error}` : ''}`);
  if (result.error) process.exitCode = 1;
} finally {
  if (recorder) {
    recorder.stdin.write('q');
    await new Promise((resolve) => recorder.on('exit', resolve));
  }
  await Promise.race([app.kill(), sleep(8000)]);
}
if (fs.existsSync(out)) {
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`${path.relative(root, out)} — about ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
}
