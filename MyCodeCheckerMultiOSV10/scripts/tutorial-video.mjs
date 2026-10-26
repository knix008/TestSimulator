// npm run tutorial:video — records the tutorial in the real (web) app with a
// spoken narration and saves MyCodeChecker-Tutorial.mp4 (or .webm) in
// docs/video/ and the project root, with the chapter / step start times in a
// JSON beside it. No ffmpeg:
//
//  1. Narration: one WAV per step from Windows SAPI (System.Speech, voice
//     "Microsoft Heami Desktop" for Korean, "Microsoft Zira Desktop" for
//     English) through PowerShell. Elsewhere (or without the voice) the video
//     is silent and each step lasts its reading time.
//  2. Recording: Vite + headless Edge/Chrome over CDP; Page.startScreencast
//     frames while the tour goes step by step, each step held for its
//     narration (+ a short pause).
//  3. Encoding: the same browser opens an encoder page served by a small
//     local server; it paints the frames on a canvas at their times, plays
//     the WAVs into a WebAudio MediaStreamDestination at the step times and
//     records canvas + audio with MediaRecorder (MP4/H.264+AAC when the
//     browser can, WebM/VP9+Opus otherwise). Encoding runs in real time.
//
// Options (also env): --lang ko|en (TUTORIAL_LANG) · --limit N (first N
// steps) · --title-only (narrate titles only; for quick tests) · --out <dir>
// (write there instead of docs/video/ + project root) · --silent · --theme <id>.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVite, launchBrowser, sleep, waitFor, freePort, ENSURE_TOUR } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, env, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return process.env[env] ?? fallback;
};
const lang = opt('lang', 'TUTORIAL_LANG', 'ko') === 'en' ? 'en' : 'ko';
const limit = Number(opt('limit', 'TUTORIAL_LIMIT', 0)) || 0;
const titleOnly = flag('title-only');
const silentWanted = flag('silent');
const outArg = opt('out', 'TUTORIAL_OUT', '');
const theme = opt('theme', 'TUTORIAL_THEME', 'midnight');
const WIDTH = 1360;
const HEIGHT = 840;
const PAUSE = 0.8; // seconds after each narration
const name = lang === 'en' ? 'MyCodeChecker-Tutorial.en' : 'MyCodeChecker-Tutorial';
const VOICE = lang === 'en' ? 'Microsoft Zira Desktop' : 'Microsoft Heami Desktop';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-video-'));
const framesDir = path.join(work, 'frames');
const audioDir = path.join(work, 'audio');
fs.mkdirSync(framesDir);
fs.mkdirSync(audioDir);

/** Text read aloud: no symbols the voice would spell out. */
function speakable(text) {
  return String(text)
    .replace(/[[\]{}<>]/g, ' ')
    .replace(/[▶◀⏮⏭⏸✓✕×⠿→←·›…]/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** WAV length in seconds (RIFF header: byte rate, then the data chunk size). */
function wavSeconds(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF') return 0;
  let at = 12;
  let byteRate = 0;
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(at + 16);
    if (id === 'data') return byteRate ? size / byteRate : 0;
    at += 8 + size + (size % 2);
  }
  return 0;
}

/** One WAV per text through Windows SAPI; returns seconds per item, or null when there is no voice. */
function synthesize(texts) {
  if (process.platform !== 'win32' || silentWanted) return null;
  const list = path.join(work, 'narration.json');
  fs.writeFileSync(list, JSON.stringify(texts.map((text, i) => ({ text, file: path.join(audioDir, `${i}.wav`) }))), 'utf8');
  const ps1 = path.join(work, 'speak.ps1');
  fs.writeFileSync(ps1, [
    'param([string]$List, [string]$Voice, [int]$Rate)',
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Speech',
    '$items = Get-Content -Raw -Encoding UTF8 -Path $List | ConvertFrom-Json',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$s.SelectVoice($Voice)',
    '$s.Rate = $Rate',
    '$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)',
    'foreach ($it in $items) { $s.SetOutputToWaveFile($it.file, $fmt); $s.Speak($it.text); $s.SetOutputToNull() }',
    '$s.Dispose()',
    'Write-Output "ok"',
  ].join('\r\n'), 'utf8');
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-List', list, '-Voice', VOICE, '-Rate', lang === 'en' ? '0' : '1'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30 * 60000 });
  } catch (err) {
    console.warn(`narration unavailable (${VOICE}): ${String(err.stderr || err.message).split('\n')[0]} — the video will be silent`);
    return null;
  }
  return texts.map((_, i) => wavSeconds(path.join(audioDir, `${i}.wav`)));
}

/**
 * MediaRecorder writes a fragmented MP4 whose header says "duration 0", so
 * players show a wrong length and seek badly. Write the real duration into
 * mvhd / tkhd / mdhd and add an mehd box (fragment duration) to mvex. The
 * fragments address their data from their own moof (default-base-is-moof),
 * so growing moov does not move anything they point at.
 */
function finalizeMp4(buf, seconds) {
  const box = (at) => ({ size: buf.readUInt32BE(at), type: buf.toString('ascii', at + 4, at + 8) });
  const children = (start, end) => {
    const list = [];
    for (let at = start; at + 8 <= end;) {
      const b = box(at);
      if (b.size < 8) break;
      list.push({ ...b, at });
      at += b.size;
    }
    return list;
  };
  const top = children(0, buf.length);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) return buf;
  const kids = children(moov.at + 8, moov.at + moov.size);
  const mvhd = kids.find((b) => b.type === 'mvhd');
  if (!mvhd) return buf;
  const v = buf[mvhd.at + 8];
  const movieScale = buf.readUInt32BE(mvhd.at + 12 + (v ? 16 : 8));
  const movieDur = Math.round(seconds * movieScale);
  const put = (at, version, value) => { if (version) buf.writeBigUInt64BE(BigInt(value), at); else buf.writeUInt32BE(Math.min(value, 0xffffffff), at); };
  put(mvhd.at + 12 + (v ? 20 : 12), v, movieDur);
  for (const trak of kids.filter((b) => b.type === 'trak')) {
    const tk = children(trak.at + 8, trak.at + trak.size);
    const tkhd = tk.find((b) => b.type === 'tkhd');
    if (tkhd) { const tv = buf[tkhd.at + 8]; put(tkhd.at + 12 + (tv ? 24 : 16), tv, movieDur); }
    const mdia = tk.find((b) => b.type === 'mdia');
    const mdhd = mdia && children(mdia.at + 8, mdia.at + mdia.size).find((b) => b.type === 'mdhd');
    if (mdhd) {
      const mv = buf[mdhd.at + 8];
      const scale = buf.readUInt32BE(mdhd.at + 12 + (mv ? 16 : 8));
      put(mdhd.at + 12 + (mv ? 20 : 12), mv, Math.round(seconds * scale));
    }
  }
  const mvex = kids.find((b) => b.type === 'mvex');
  if (!mvex) return buf;
  const mehd = children(mvex.at + 8, mvex.at + mvex.size).find((b) => b.type === 'mehd');
  if (mehd) { put(mehd.at + 12, buf[mehd.at + 8], movieDur); return buf; }
  const add = Buffer.alloc(20);
  add.writeUInt32BE(20, 0);
  add.write('mehd', 4, 'ascii');
  add[8] = 1;
  add.writeBigUInt64BE(BigInt(movieDur), 12);
  const out = Buffer.concat([buf.subarray(0, mvex.at + 8), add, buf.subarray(mvex.at + 8)]);
  out.writeUInt32BE(mvex.size + 20, mvex.at);
  out.writeUInt32BE(moov.size + 20, moov.at);
  return out;
}

const ENCODER_HTML =`<!doctype html><html><head><meta charset="utf-8"><title>encoder</title>
<style>html,body{margin:0;background:#000}canvas{display:block}</style></head><body><canvas id="c"></canvas>
<script type="module">
const plan = await (await fetch('plan.json')).json();
const canvas = document.getElementById('c');
canvas.width = plan.width; canvas.height = plan.height;
const g = canvas.getContext('2d');
g.fillStyle = '#000'; g.fillRect(0, 0, plan.width, plan.height);
const ac = new AudioContext({ sampleRate: 48000 });
const dest = ac.createMediaStreamDestination();
const buffers = await Promise.all(plan.audio.map((a) => fetch(a.src).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b))));
const tracks = [...canvas.captureStream(30).getVideoTracks()];
if (plan.audio.length) tracks.push(...dest.stream.getAudioTracks());
const stream = new MediaStream(tracks);
const mime = plan.mimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 3500000, audioBitsPerSecond: 128000, videoKeyFrameIntervalDuration: 4000 });
const chunks = [];
rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
const stopped = new Promise((resolve) => { rec.onstop = resolve; });
// Frames are fetched and decoded (createImageBitmap, off the main thread) a
// little ahead; when decoding falls behind, the newest ready frame is shown
// and the late ones are skipped, so the picture never lags the narration.
const ready = new Map();
const pending = new Set();
const load = (i) => {
  if (i >= plan.frames.length || ready.has(i) || pending.has(i)) return;
  pending.add(i);
  fetch(plan.frames[i].src).then((r) => r.blob()).then((b) => createImageBitmap(b))
    .then((bmp) => { ready.set(i, bmp); }, () => {}).finally(() => pending.delete(i));
};
const AHEAD = 24;
for (let i = 0; i < AHEAD; i++) load(i);
while (!ready.has(0)) await new Promise((r) => setTimeout(r, 20));
let shown = 0;
let current = ready.get(0);
g.drawImage(current, 0, 0, plan.width, plan.height);
await ac.resume();
rec.start(1000);
const t0 = performance.now();
const a0 = ac.currentTime + 0.05;
plan.audio.forEach((a, i) => { const s = ac.createBufferSource(); s.buffer = buffers[i]; s.connect(dest); s.start(a0 + a.t); });
let k = 0;
window.__log = [];
while (true) {
  const now = (performance.now() - t0) / 1000;
  if (now >= plan.duration) break;
  while (k + 1 < plan.frames.length && plan.frames[k + 1].t <= now) k++;
  for (let i = k; i < k + AHEAD; i++) load(i);
  // Behind? Drop what is queued before k so the decoder works on what is due.
  let best = -1;
  for (let j = k; j > shown; j--) { if (ready.has(j)) { best = j; break; } }
  if (best > shown) {
    current = ready.get(best);
    for (const key of [...ready.keys()]) if (key < best) { ready.get(key).close(); ready.delete(key); }
    shown = best;
  }
  // Paint every tick (also the same frame) so the video track keeps running.
  g.drawImage(current, 0, 0, plan.width, plan.height);
  if (window.__log.length < 4000) window.__log.push([Math.round(now * 100) / 100, k, shown]);
  window.__progress = now / plan.duration;
  await new Promise((r) => setTimeout(r, 33));
}
rec.stop();
await stopped;
const blob = new Blob(chunks, { type: mime || 'video/webm' });
const res = await fetch('out', { method: 'PUT', body: blob, headers: { 'x-mime': mime } });
window.__done = { ok: res.ok, mime, size: blob.size, shown };
</script></body></html>`;

/** Serves the encoder page, the frames, the WAVs and the plan; receives the finished video. */
async function startEncoderServer(plan, outFile) {
  const port = await freePort();
  let received = null;
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (req.method === 'PUT' && url === '/out') {
      const file = fs.createWriteStream(outFile);
      req.pipe(file);
      file.on('finish', () => { received = { mime: req.headers['x-mime'] || '' }; res.end('ok'); });
      return;
    }
    const send = (body, type) => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    if (url === '/' || url === '/encoder.html') return send(ENCODER_HTML, 'text/html; charset=utf-8');
    if (url === '/plan.json') return send(JSON.stringify(plan), 'application/json');
    const m = /^\/(frames|audio)\/([\w.-]+)$/.exec(url);
    if (m) {
      const file = path.join(m[1] === 'frames' ? framesDir : audioDir, m[2]);
      if (fs.existsSync(file)) return send(fs.readFileSync(file), m[1] === 'frames' ? 'image/jpeg' : 'audio/wav');
    }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${port}/encoder.html`, received: () => received, stop: () => server.close() };
}

const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: WIDTH, height: HEIGHT, args: ['--autoplay-policy=no-user-gesture-required'] });
let encoder = null;
try {
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } }).catch(() => {});
  await cdp.evaluate(`(async () => { window.__mcc.action('theme:${theme}'); window.__mcc.action('lang:${lang}'); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
  if (!(await cdp.evaluate(ENSURE_TOUR))) throw new Error('window.__mcc.tutorial is missing');
  const all = await cdp.evaluate('window.__mcc.tutorial.steps.map((s) => ({ id: s.id, chapter: s.chapter, text: s.text }))');
  const chapters = await cdp.evaluate('window.__mcc.tutorial.chapters');
  const steps = limit ? all.slice(0, limit) : all;

  // 1. Narration.
  const texts = steps.map((s) => { const t = s.text[lang]; return speakable(titleOnly ? t.title : `${t.title}. ${t.body}`); });
  console.log(`narration: ${steps.length} step(s), voice ${silentWanted ? '(silent)' : VOICE}`);
  const spoken = synthesize(texts);
  const holdOf = (i) => {
    if (spoken && spoken[i] > 0) return spoken[i] + PAUSE;
    const t = steps[i].text[lang];
    const chars = titleOnly ? t.title.length : t.title.length + t.body.length;
    return Math.max(3, chars / (lang === 'en' ? 16 : 9));
  };

  // 2. Recording (the first step is prepared before the screencast starts).
  // Prepare the first step (sample analysis, start page) before recording.
  await cdp.evaluate('window.__mcc.tutorial.start({ index: 0 })');
  await waitFor(() => cdp.evaluate('!window.__mcc.tutorial.state().busy'), 240000, 300);
  if (steps.length > 1) {
    // Warm up: the sample project is analysed once, outside the video.
    const needs = await cdp.evaluate(`window.__mcc.tutorial.steps.slice(0, ${steps.length}).some((s) => (s.action || []).includes('project'))`);
    if (needs) {
      const first = await cdp.evaluate(`window.__mcc.tutorial.steps.findIndex((s) => (s.action || []).includes('project'))`);
      await cdp.evaluate(`window.__mcc.tutorial.go(${first})`);
      await cdp.evaluate('window.__mcc.tutorial.go(0)');
    }
  }
  const frames = [];
  cdp.on('Page.screencastFrame', (frame) => {
    const file = `${String(frames.length).padStart(6, '0')}.jpg`;
    fs.writeFileSync(path.join(framesDir, file), Buffer.from(frame.data, 'base64'));
    frames.push({ file, time: frame.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
  await waitFor(() => frames.length > 0, 10000, 50);
  const origin = frames[0].time;
  const marks = [];
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) await cdp.evaluate(`window.__mcc.tutorial.go(${i})`);
    await waitFor(() => cdp.evaluate('!window.__mcc.tutorial.state().busy'), 240000, 100);
    const now = await cdp.evaluate('Date.now() / 1000');
    marks.push(Math.max(0, now - origin));
    process.stdout.write(`\r  ${String(i + 1).padStart(3)}/${steps.length} ${steps[i].id.padEnd(22)} ${holdOf(i).toFixed(1)} s`);
    await sleep(holdOf(i) * 1000);
  }
  const end = (await cdp.evaluate('Date.now() / 1000')) - origin + 0.6;
  await sleep(600);
  await cdp.send('Page.stopScreencast');
  await cdp.evaluate('window.__mcc.tutorial.stop()');
  process.stdout.write('\n');
  if (!frames.length) throw new Error('no frames recorded');

  // 3. Encoding.
  const plan = {
    width: WIDTH,
    height: HEIGHT,
    duration: Math.round(end * 1000) / 1000,
    frames: frames.map((f) => ({ src: `frames/${f.file}`, t: Math.max(0, f.time - origin) })),
    audio: spoken ? steps.map((_, i) => ({ src: `audio/${i}.wav`, t: marks[i] })) : [],
    mimes: process.env.MCC_VIDEO_MIME ? [process.env.MCC_VIDEO_MIME] : spoken
      ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'],
  };
  const raw = path.join(work, 'out.bin');
  fs.writeFileSync(path.join(work, 'plan.json'), JSON.stringify({ ...plan, marks }, null, 1));
  encoder = await startEncoderServer(plan, raw);
  console.log(`encoding ${frames.length} frames, ${plan.duration.toFixed(1)} s (real time)…`);
  await cdp.send('Page.navigate', { url: encoder.url });
  let lastShown = -1;
  const done = await waitFor(async () => {
    const st = await cdp.evaluate('({ done: window.__done || null, p: window.__progress || 0 })').catch(() => null);
    if (st && Math.floor(st.p * 20) !== lastShown) { lastShown = Math.floor(st.p * 20); process.stdout.write(`\r  ${Math.round(st.p * 100)} %`); }
    return st && st.done;
  }, (plan.duration + 120) * 1000, 500);
  process.stdout.write('\r  100 %\n');
  const lag = await cdp.evaluate('(() => { const l = window.__log || []; let worst = 0; for (const [, k, sh] of l) worst = Math.max(worst, k - sh); return { ticks: l.length, worst }; })()').catch(() => null);
  if (lag) console.log(`  encoder: ${lag.ticks} ticks, worst lag ${lag.worst} frame(s)`);
  await waitFor(() => encoder.received(), 30000, 100);
  if (!done.ok || !done.size) throw new Error('the encoder produced no video');
  const ext = /mp4/.test(done.mime) ? 'mp4' : 'webm';

  // Output.
  const outDir = outArg ? path.resolve(outArg) : path.join(root, 'docs', 'video');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}.${ext}`);
  if (ext === 'mp4') fs.writeFileSync(out, finalizeMp4(fs.readFileSync(raw), plan.duration));
  else fs.copyFileSync(raw, out);
  for (const other of ['mp4', 'webm']) if (other !== ext) fs.rmSync(path.join(outDir, `${name}.${other}`), { force: true });
  const chapterMarks = [];
  steps.forEach((s, i) => {
    if (!chapterMarks.some((c) => c.id === s.chapter)) {
      const c = chapters.find((x) => x.id === s.chapter);
      chapterMarks.push({ id: s.chapter, title: c ? c[lang] : s.chapter, start: Math.round(marks[i] * 10) / 10 });
    }
  });
  const sidecar = {
    video: `${name}.${ext}`, mime: done.mime, width: WIDTH, height: HEIGHT, duration: Math.round(plan.duration * 10) / 10,
    narration: spoken ? VOICE : null, language: lang, recorded: new Date().toISOString(), chapters: chapterMarks,
    steps: steps.map((s, i) => ({ id: s.id, title: s.text[lang].title, start: Math.round(marks[i] * 10) / 10, narration: spoken ? Math.round(spoken[i] * 10) / 10 : null })),
  };
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(sidecar, null, 2));
  if (!outArg) {
    for (const other of ['mp4', 'webm']) if (other !== ext) fs.rmSync(path.join(root, `${name}.${other}`), { force: true });
    fs.copyFileSync(out, path.join(root, `${name}.${ext}`));
  }
  console.log(`${name}.${ext}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${plan.duration.toFixed(1)} s, ${done.mime || 'default codec'}${spoken ? `, narration ${VOICE}` : ', silent'} → ${outArg ? outDir : 'docs/video/ and the project root'}`);
  const pageErrors = errors.filter((e) => !/favicon/i.test(String(e)));
  if (pageErrors.length) {
    console.error(`page errors:\n${pageErrors.join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  if (encoder) encoder.stop();
  stop();
  vite.stop();
  if (process.env.MCC_VIDEO_KEEP) console.log('work folder kept:', work);
  else setTimeout(() => { try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* still open */ } }, 2000);
}
