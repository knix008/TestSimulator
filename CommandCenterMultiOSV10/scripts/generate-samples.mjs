// Generates the sample files in samples/ that the tests (test/samples.test.mjs) and the smoke
// scenarios (`npm run smoke -- --scenario samples`) open in the viewer / preview window:
//
//   images  — PNG, JPEG, GIF (animated), WebP, TIFF, AVIF (sharp), BMP, ICO, SVG, APNG-less (written here)
//   pdf     — a two-page PDF (written here)
//   media   — WAV (PCM sine, written here), WebM video + WebM/Opus audio (recorded by Electron's
//             MediaRecorder from a canvas / an oscillator — no ffmpeg needed)
//
// Files that cannot be produced here are committed as is: sample.heic (nokiatech HEIF conformance
// C003), sample.mp4 (a short H.264 clip), *.dcm (pydicom test files: single frame, JPEG 2000, RGB,
// 10-frame MR, 30-frame YBR colour). Re-run after changing the drawing: node scripts/generate-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');
fs.mkdirSync(out, { recursive: true });

// ── The picture: a Command Center badge (gradient, ring, bars) — 320 × 240 ──
const W = 320, H = 240;
function picture(frame = 0) {
  const hue = (frame * 40) % 360;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,25%)"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="70" fill="none" stroke="#fff" stroke-width="10" opacity="0.9"/>
  <rect x="${W / 2 - 40}" y="${H / 2 - 10}" width="80" height="20" rx="4" fill="#ffd54f"/>
  <text x="${W / 2}" y="${H - 18}" text-anchor="middle" font-family="Arial" font-size="20" fill="#fff">Command Center ${frame ? `#${frame + 1}` : ''}</text>
</svg>`);
}

async function images() {
  const svg = picture();
  fs.writeFileSync(path.join(out, 'sample.svg'), svg);
  await sharp(svg).png().toFile(path.join(out, 'sample.png'));
  await sharp(svg).jpeg({ quality: 85 }).toFile(path.join(out, 'sample.jpg'));
  await sharp(svg).webp({ quality: 85 }).toFile(path.join(out, 'sample.webp'));
  await sharp(svg).tiff({ compression: 'lzw' }).toFile(path.join(out, 'sample.tiff'));
  await sharp(svg).avif({ quality: 50 }).toFile(path.join(out, 'sample.avif'));
  // animated GIF: 6 frames with the hue turning (written here — this sharp cannot join frames)
  const frames = [];
  for (let i = 0; i < 6; i++) frames.push(await sharp(picture(i)).resize(160, 120).removeAlpha().raw().toBuffer());
  fs.writeFileSync(path.join(out, 'sample.gif'), gif89a(frames, 160, 120, 20));
  // BMP (24-bit, bottom-up) and ICO (one 32 × 32 PNG entry) are written by hand — sharp has no encoder for them.
  const { data, info } = await sharp(svg).resize(128, 96).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  fs.writeFileSync(path.join(out, 'sample.bmp'), bmp24(data, info.width, info.height));
  const png32 = await sharp(svg).resize(32, 32, { fit: 'cover' }).png().toBuffer();
  fs.writeFileSync(path.join(out, 'sample.ico'), ico([png32]));
}

// GIF89a, looping, one global 6×6×6 palette (216 colours), LZW-packed frames; delay in 1/100 s.
function gif89a(frames, w, h, delay) {
  const parts = [];
  const u16 = (n) => Buffer.from([n & 255, n >> 8]);
  parts.push(Buffer.from('GIF89a'), u16(w), u16(h), Buffer.from([0xf7, 0, 0]));   // global colour table, 256 entries
  const pal = Buffer.alloc(256 * 3);
  for (let i = 0; i < 216; i++) { pal[i * 3] = Math.floor(i / 36) * 51; pal[i * 3 + 1] = (Math.floor(i / 6) % 6) * 51; pal[i * 3 + 2] = (i % 6) * 51; }
  parts.push(pal);
  parts.push(Buffer.from([0x21, 0xff, 11]), Buffer.from('NETSCAPE2.0'), Buffer.from([3, 1, 0, 0, 0]));   // loop forever
  for (const rgb of frames) {
    const idx = Buffer.alloc(w * h);
    for (let i = 0; i < w * h; i++) idx[i] = Math.round(rgb[i * 3] / 51) * 36 + Math.round(rgb[i * 3 + 1] / 51) * 6 + Math.round(rgb[i * 3 + 2] / 51);
    parts.push(Buffer.from([0x21, 0xf9, 4, 0]), u16(delay), Buffer.from([0, 0]));   // graphic control: delay, no transparency
    parts.push(Buffer.from([0x2c]), u16(0), u16(0), u16(w), u16(h), Buffer.from([0]), Buffer.from([8]), lzw(idx, 8), Buffer.from([0]));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}
// GIF LZW with `minCode`-bit codes, output as 255-byte sub-blocks.
function lzw(data, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let dict = new Map(), next = eoi + 1, size = minCode + 1;
  const bytes = []; let acc = 0, nbits = 0;
  const emit = (code) => { acc |= code << nbits; nbits += size; while (nbits >= 8) { bytes.push(acc & 255); acc >>>= 8; nbits -= 8; } };
  emit(clear);
  let prefix = data[0];
  for (let i = 1; i < data.length; i++) {
    const k = data[i], key = prefix * 4096 + k;
    if (dict.has(key)) { prefix = dict.get(key); continue; }
    emit(prefix);
    if (next < 4096) { dict.set(key, next++); if (next - 1 === 1 << size && size < 12) size++; }
    else { emit(clear); dict = new Map(); next = eoi + 1; size = minCode + 1; }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (nbits > 0) bytes.push(acc & 255);
  const blocks = [];
  for (let i = 0; i < bytes.length; i += 255) { const chunk = bytes.slice(i, i + 255); blocks.push(Buffer.from([chunk.length]), Buffer.from(chunk)); }
  return Buffer.concat(blocks);
}

function bmp24(rgb, w, h) {
  const rowBytes = Math.ceil((w * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 3, dst = y * rowBytes;
    for (let x = 0; x < w; x++) {   // BGR, bottom-up
      pixels[dst + x * 3] = rgb[src + x * 3 + 2];
      pixels[dst + x * 3 + 1] = rgb[src + x * 3 + 1];
      pixels[dst + x * 3 + 2] = rgb[src + x * 3];
    }
  }
  const head = Buffer.alloc(54);
  head.write('BM', 0); head.writeUInt32LE(54 + pixels.length, 2); head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14); head.writeInt32LE(w, 18); head.writeInt32LE(h, 22); head.writeUInt16LE(1, 26); head.writeUInt16LE(24, 28);
  head.writeUInt32LE(pixels.length, 34); head.writeInt32LE(2835, 38); head.writeInt32LE(2835, 42);
  return Buffer.concat([head, pixels]);
}

function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  const dirs = [], blobs = [];
  let offset = 6 + 16 * pngs.length;
  for (const png of pngs) {
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    const d = Buffer.alloc(16);
    d[0] = w >= 256 ? 0 : w; d[1] = h >= 256 ? 0 : h; d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(png.length, 8); d.writeUInt32LE(offset, 12);
    dirs.push(d); blobs.push(png); offset += png.length;
  }
  return Buffer.concat([head, ...dirs, ...blobs]);
}

// ── WAV: 2 s of a 440 Hz sine with a soft envelope, 16-bit mono 22050 Hz ──
function wav() {
  const rate = 22050, secs = 2, n = rate * secs;
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const tt = i / rate, env = Math.min(1, tt * 8) * Math.min(1, (secs - tt) * 4);
    pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * tt) * 0.5 * env * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(out, 'sample.wav'), Buffer.concat([h, pcm]));
}

// ── PDF: two pages of Helvetica text and a filled box, written by hand (no library) ──
function pdf() {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const page = (contents) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents ${contents} 0 R >>`;
  const stream = (content) => `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  add('<< /Type /Catalog /Pages 2 0 R >>');                                                 // 1
  add('<< /Type /Pages /Kids [5 0 R 7 0 R] /Count 2 >>');                                   // 2
  add('<< /Producer (Command Center samples) /Title (Command Center sample PDF) >>');       // 3
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');                            // 4
  add(page(6));                                                                              // 5
  add(stream('0.23 0.49 0.84 rg 60 700 475 60 re f 1 1 1 rg BT /F1 28 Tf 80 720 Td (Command Center) Tj ET 0 0 0 rg BT /F1 14 Tf 60 660 Td (Sample PDF, page 1 of 2) Tj 0 -24 Td (Shown by the built-in PDF viewer of the host.) Tj ET'));   // 6
  add(page(8));                                                                              // 7
  add(stream('0 0 0 rg BT /F1 20 Tf 60 760 Td (Page 2) Tj /F1 12 Tf 0 -30 Td (The end.) Tj ET'));   // 8
  let doc = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(Buffer.byteLength(doc, 'latin1')); doc += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(doc, 'latin1');
  doc += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  doc += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(path.join(out, 'sample.pdf'), Buffer.from(doc, 'latin1'));
}

// ── WebM video (VP9, 2 s of the badge turning) and WebM/Opus audio, recorded by Electron ──
function webm() {
  const electron = path.join(root, 'node_modules', 'electron', 'cli.js');
  const script = path.join(out, '.record.cjs');
  fs.writeFileSync(script, `
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: { offscreen: true, autoplayPolicy: 'no-user-gesture-required' } });
  await win.loadURL('data:text/html,<canvas id=c width=320 height=240></canvas>');
  const record = (audio) => win.webContents.executeJavaScript(\`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let stream;
    if (\${audio}) {
      const ac = new AudioContext(); const osc = ac.createOscillator(); const dest = ac.createMediaStreamDestination();
      osc.frequency.value = 523; osc.connect(dest); osc.start(); stream = dest.stream;
    } else {
      const c = document.getElementById('c'); const g = c.getContext('2d'); stream = c.captureStream(30);
      let f = 0; const draw = () => { const hue = (f++ * 3) % 360; g.fillStyle = 'hsl(' + hue + ',70%,40%)'; g.fillRect(0, 0, 320, 240); g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(160, 120, 70, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#ffd54f'; g.fillRect(120, 110, 80, 20); g.fillStyle = '#fff'; g.font = '20px Arial'; g.textAlign = 'center'; g.fillText('Command Center', 160, 222); };
      draw(); setInterval(draw, 33);
    }
    const rec = new MediaRecorder(stream, { mimeType: \${audio} ? 'audio/webm;codecs=opus' : 'video/webm;codecs=vp9' });
    const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => { rec.onstop = r; });
    rec.start(); await wait(2200); rec.stop(); await done;
    return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(new Blob(chunks)); });
  })()\`);
  fs.writeFileSync(path.join(${JSON.stringify(out)}, 'sample.webm'), Buffer.from(await record(false), 'base64'));
  fs.writeFileSync(path.join(${JSON.stringify(out)}, 'sample_audio.webm'), Buffer.from(await record(true), 'base64'));
  app.quit();
});
`);
  return new Promise((resolve) => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(process.execPath, [electron, script], { cwd: root, stdio: 'inherit', env });
    const timer = setTimeout(() => { child.kill(); console.error('[samples] webm recording timed out'); resolve(); }, 60_000);
    child.on('exit', () => { clearTimeout(timer); try { fs.unlinkSync(script); } catch { /* gone */ } resolve(); });
  });
}

await images();
wav();
pdf();
if (!process.argv.includes('--no-webm')) await webm();
console.log('[samples]', fs.readdirSync(out).filter((f) => !f.startsWith('.')).map((f) => `${f} (${fs.statSync(path.join(out, f)).size} B)`).join('\n[samples] '));
