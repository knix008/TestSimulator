/* Shared by test/image-export.test.js (Node encodes) and scripts/export-check.mjs (headless Edge encodes):
 * synthetic inputs, the case list, and INDEPENDENT decoders — sharp (libvips), ffmpeg, Python Pillow / numpy,
 * libheif-js, libjxl's decoder, and small spec readers for formats nothing installed can read
 * (NIfTI, Analyze, MetaImage, NRRD, Farbfeld, PDF image streams). */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'test', 'tmp', 'export');
const FFMPEG = ['C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe', 'ffmpeg'].find((p) => p === 'ffmpeg' || fs.existsSync(p));

/* ── Synthetic inputs ── */
function synth(w, h, shift = 0) {   // gradient + red disc + blue box + green triangle + transparency
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    let r = Math.round((x * 255) / (w - 1)), g = Math.round((y * 255) / (h - 1)), b = (x * 7 + y * 3 + shift * 40) & 255, a = 255;
    const cx = w * 0.3 + shift * 3, cy = h * 0.45, rad = Math.min(w, h) * 0.22;
    if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) { r = 230; g = 30; b = 40; }
    if (x >= w * 0.55 && x < w * 0.8 && y >= h * 0.15 && y < h * 0.45) { r = 20; g = 60; b = 220; }
    if (y > h * 0.6 && x > w * 0.5 && x - w * 0.5 < (y - h * 0.6) * 1.5) { r = 30; g = 200; b = 60; }
    if (x >= w - Math.ceil(w / 6)) a = Math.round((y * 255) / (h - 1));   // alpha ramp on the right
    if (x < 4 && y < 4) a = 0;                                             // fully transparent corner
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
  }
  return px;
}
function ramp16(w, h) { const v = new Uint16Array(w * h); const k = Math.floor(65535 / (w * h - 1)); for (let i = 0; i < v.length; i++) v[i] = i * k; v[v.length - 1] = 65535; return v; }
function ct16(w, h, f = 0) { const v = new Int16Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = -1024 + ((x * 37 + y * 101 + f * 211) % 4096); return v; }
function float32(w, h) { const v = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = (x - w / 2) * 0.37 + y * 1.5 - 0.125; return v; }
function u16big(w, h, f = 0) { const v = new Uint16Array(w * h); for (let i = 0; i < v.length; i++) v[i] = (i * 97 + f * 5000) % 60000; return v; }

const INPUTS = {
  rgba64: () => ({ width: 64, height: 48, rgba: synth(64, 48), name: 'synthetic' }),
  rgba37: () => ({ width: 37, height: 23, rgba: synth(37, 23), name: 'odd' }),
  u16: () => ({ width: 64, height: 48, gray: ramp16(64, 48), spacing: [0.7, 0.5], name: 'ramp16' }),
  i16: () => ({ width: 37, height: 23, gray: ct16(37, 23), spacing: [0.7, 0.5], name: 'ct' }),
  f32: () => ({ width: 37, height: 23, gray: float32(37, 23), name: 'float' }),
  vol: () => ({ width: 37, height: 23, frames: [0, 1, 2].map((f) => ({ gray: ct16(37, 23, f) })), spacing: [0.7, 0.5], sliceThickness: 2.5, name: 'volume' }),
  volu16: () => ({ width: 37, height: 23, frames: [0, 1, 2].map((f) => ({ gray: u16big(37, 23, f) })), spacing: [0.8, 0.6], sliceThickness: 1.25, name: 'volu16' }),
  anim: () => ({ width: 37, height: 23, frames: [0, 1, 2].map((f) => ({ rgba: synth(37, 23, f) })), name: 'anim' }),
  rgb16: () => { const w = 37, h = 23, r = synth(37, 23).map((v, i) => ((i & 3) === 3 ? 255 : v)), s = new Uint16Array(w * h * 3); for (let i = 0; i < s.length; i++) s[i] = (i * 1237) % 65536; return { width: w, height: h, rgba: r, rgb16: s, name: 'rgb16' }; },
  big: () => ({ width: 512, height: 512, rgba: synth(512, 512), gray: ct16(512, 512), name: 'big' }),
};
const inputCache = {};
const input = (k) => (inputCache[k] = inputCache[k] || INPUTS[k]());

/* ── Expected pixels (computed here, not with ImageExport) ── */
function flatten(rgba) {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) { const a = rgba[i + 3]; for (let c = 0; c < 3; c++) out[i + c] = Math.round((rgba[i + c] * a + 255 * (255 - a)) / 255); out[i + 3] = 255; }
  return out;
}
const lum = (f) => { const n = f.length / 4, o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = Math.round((f[i * 4] * 299 + f[i * 4 + 1] * 587 + f[i * 4 + 2] * 114) / 1000); return o; };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function expected(kind, inp) {   // → { ch, frames: [typed array], tol?, psnr? }
  const fr = inp.frames || [{ rgba: inp.rgba, gray: inp.gray }];
  const n = inp.width * inp.height;
  const pick = (a, ch) => { const o = new Uint8Array(n * ch); for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) o[i * ch + c] = a[i * 4 + c]; return o; };
  switch (kind.split(':')[0]) {
    case 'rgba': return { ch: 4, frames: fr.map((f) => f.rgba) };
    case 'rgb': return { ch: 3, frames: fr.map((f) => pick(flatten(f.rgba), 3)) };
    case 'gray8': return { ch: 1, frames: fr.map((f) => lum(flatten(f.rgba))) };
    case 'bw': { const t = 128; return { ch: 1, frames: fr.map((f) => lum(flatten(f.rgba)).map((v) => (v < t ? 0 : 255))) }; }
    case 'psnr': return { ch: 3, frames: fr.map((f) => pick(flatten(f.rgba), 3)), psnr: +kind.split(':')[1], flattenDecoded: true };
    case 'raw': return { ch: 1, frames: fr.map((f) => f.gray) };
    case 'shift': { const lo = Math.min(0, ...fr.map((f) => Math.min(...f.gray))); return { ch: 1, frames: fr.map((f) => Float64Array.from(f.gray, (v) => v - lo)) }; }
    case 'x257': return { ch: 1, frames: fr.map((f) => Uint16Array.from(lum(flatten(f.rgba)), (v) => v * 257)) };
    case 'rgb16': return { ch: 3, frames: [inp.rgb16] };
    case 'half': return { ch: 1, frames: fr.map((f) => f.gray), rel: 1e-3, abs: 1e-3 };
    case 'lin': case 'linhalf': case 'rgbe': case 'linalpha': case 'linalphahalf': {
      const alpha = kind.startsWith('linalpha');
      const ch = alpha ? 4 : 3;
      const frames = fr.map((f) => { const src = alpha ? f.rgba : flatten(f.rgba), o = new Float32Array(n * ch); for (let i = 0; i < n; i++) { for (let c = 0; c < 3; c++) o[i * ch + c] = lin(src[i * 4 + c]); if (alpha) o[i * ch + 3] = src[i * 4 + 3] / 255; } return o; });
      return kind === 'rgbe' ? { ch, frames, rgbe: true } : kind === 'lin' ? { ch, frames, abs: 1e-7 } : { ch, frames, rel: 1e-3, abs: 1e-4 };
    }
    case 'fit': { const X = require('../../src/js/imageExport'); const s = +kind.split(':')[1]; return { ch: 4, frames: [X.fitSquare(inp.rgba, inp.width, inp.height, s)], w: s, h: s }; }
    default: throw new Error('unknown expectation ' + kind);
  }
}

/* ── Comparison ── */
function compare(exp, dec, inp) {   // dec = { w, h, ch, frames: [typed] }
  const W = exp.w || inp.width, H = exp.h || inp.height, n = W * H;
  if (dec.w !== W || dec.h !== H) return { ok: false, msg: `size ${dec.w}×${dec.h}, expected ${W}×${H}` };
  if (dec.frames.length < exp.frames.length) return { ok: false, msg: `${dec.frames.length} frame(s), expected ${exp.frames.length}` };
  let worst = 0, sse = 0, cnt = 0, maxRel = 0;
  for (let f = 0; f < exp.frames.length; f++) {
    const e = exp.frames[f];
    let d = dec.frames[f];
    if (exp.flattenDecoded && dec.ch === 4) d = flatten(d);
    for (let i = 0; i < n; i++) for (let c = 0; c < exp.ch; c++) {
      const dc = dec.ch === 1 ? 0 : c >= dec.ch ? dec.ch - 1 : c;
      if (dec.ch === 1 && c > 0) continue;
      const ev = e[i * exp.ch + c], dv = d[i * dec.ch + dc];
      const diff = Math.abs(ev - dv);
      if (exp.psnr) { sse += diff * diff; cnt++; continue; }
      if (exp.rgbe) { const m = Math.max(e[i * exp.ch], e[i * exp.ch + 1], e[i * exp.ch + 2]); if (diff > m / 64 + 1e-6) worst = Math.max(worst, diff); continue; }
      if (exp.rel !== undefined) { const r = diff / Math.max(Math.abs(ev), 1); if (diff > exp.abs && r > exp.rel) worst = Math.max(worst, diff); maxRel = Math.max(maxRel, Math.min(r, diff)); continue; }
      if (exp.abs !== undefined) { if (diff > exp.abs) worst = Math.max(worst, diff); continue; }
      if (diff > worst) worst = diff;
    }
  }
  if (exp.psnr) { const mse = sse / Math.max(1, cnt), psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse); return { ok: psnr >= exp.psnr, msg: `PSNR ${psnr === Infinity ? '∞' : psnr.toFixed(1)} dB (≥ ${exp.psnr})` }; }
  if (exp.rel !== undefined) return { ok: worst === 0, msg: worst === 0 ? `within ${exp.rel} rel` : `max diff ${worst}` };
  return { ok: worst === 0, msg: worst === 0 ? (exp.abs || exp.rgbe ? 'within tolerance' : 'exact') : `max diff ${worst}` };
}

/* ── Cases: [name, format id, options, input, expectation, validators] ── */
const C = (name, id, options, inp, expect, validators) => ({ name, id, options, input: inp, expect, validators });
const CASES = [
  C('png rgba', 'png', {}, 'rgba64', 'rgba', ['sharp', 'ffmpeg:rgba', 'pil:RGBA']),
  C('png rgba 37x23', 'png', {}, 'rgba37', 'rgba', ['sharp', 'ffmpeg:rgba', 'pil:RGBA']),
  C('png rgb level 9', 'png', { color: 'rgb', level: 9 }, 'rgba37', 'rgb', ['ffmpeg:rgb24', 'pil:RGB']),
  C('png gray 8-bit', 'png', { color: 'gray' }, 'rgba37', 'gray8', ['ffmpeg:gray', 'pil:raw']),
  C('png gray16 (uint16)', 'png', { depth: '16' }, 'u16', 'raw', ['ffmpeg:gray16le', 'pil:raw', 'sharp16']),
  C('png gray16 (int16 shifted)', 'png', { depth: '16' }, 'i16', 'shift', ['ffmpeg:gray16le', 'pil:raw']),
  C('png rgb16', 'png', { depth: '16' }, 'rgb16', 'rgb16', ['ffmpeg:rgb48le', 'sharp16']),
  C('apng 3 frames', 'apng', { delayMs: 120 }, 'anim', 'rgba', ['ffmpeg:rgba', 'pil:RGBA*']),
  C('jpeg q90', 'jpeg', { quality: 90 }, 'rgba64', 'psnr:30', ['sharp', 'ffmpeg:rgb24', 'pil:RGB']),
  C('jpeg q75 37x23', 'jpeg', { quality: 75 }, 'rgba37', 'psnr:26', ['sharp', 'ffmpeg:rgb24', 'pil:RGB']),
  C('jpeg progressive', 'jpeg', { quality: 90, progressive: true }, 'rgba37', 'psnr:30', ['sharp', 'ffmpeg:rgb24', 'pil:RGB']),
  C('jpeg grayscale', 'jpeg', { quality: 92, grayscale: true }, 'rgba64', 'gray8', ['pil:L~35', 'ffmpeg:gray~35']),
  // q85 gives 24.7 dB on this small hard-edged picture: byte-identical to libvips' (sharp's) own WebP q85
  C('webp lossy', 'webp', { quality: 85 }, 'rgba64', 'psnr:24', ['sharp', 'ffmpeg:rgba', 'pil:RGBA']),
  C('webp lossless', 'webp', { lossless: true }, 'rgba37', 'rgba', ['sharp', 'ffmpeg:rgba', 'pil:RGBA']),
  C('avif lossy', 'avif', { quality: 70 }, 'rgba64', 'psnr:28', ['sharp', 'pil:RGBA']),   // ffmpeg drops the AVIF alpha item
  C('avif lossless', 'avif', { lossless: true }, 'rgba37', 'rgba', ['sharp', 'pil:RGBA']),
  C('avif 12-bit grey', 'avif', { depth: '12', lossless: true }, 'u16', 'raw~16', ['sharp16']),
  C('heic', 'heic', { quality: 85 }, 'rgba64', 'psnr:28', ['libheif', 'ffmpeg:rgb24', 'pil:RGB']),
  C('heic 37x23', 'heic', { quality: 85 }, 'rgba37', 'psnr:26', ['libheif', 'ffmpeg:rgb24']),
  // libjxl optimises perceptual distance (butteraugli), not PSNR: q85 ≈ 27.7 dB here, opaque pixels too
  C('jxl lossy', 'jxl', { quality: 85 }, 'rgba64', 'psnr:26', ['jxl-dec']),
  // the only JXL decoder here (libjxl in @jsquash/jxl) returns 8 bits through float sRGB: dark values ±1
  C('jxl lossless', 'jxl', { lossless: true }, 'rgba37', 'rgba', ['jxl-dec:!1']),
  C('gif', 'gif', {}, 'rgba64', 'psnr:24', ['sharp', 'ffmpeg:rgb24', 'pil:RGB']),
  C('gif animated', 'gif-animated', { delayMs: 100 }, 'anim', 'psnr:24', ['ffmpeg:rgb24', 'pil:RGB*']),
  C('bmp 24', 'bmp', { bits: '24' }, 'rgba37', 'rgb', ['ffmpeg:rgb24', 'pil:RGB']),
  C('bmp 32 alpha', 'bmp', { bits: '32' }, 'rgba37', 'rgba', ['ffmpeg:rgba', 'pil:RGBA']),
  C('bmp 8 grey', 'bmp', { bits: '8' }, 'rgba64', 'gray8', ['ffmpeg:gray!1', 'pil:L']),   // ffmpeg: palette → grey through RGB (±1)
  C('tiff lzw rgba', 'tiff', { compression: 'lzw' }, 'rgba64', 'rgba', ['sharp', 'ffmpeg:rgba', 'pil:RGBA']),
  C('tiff deflate rgba', 'tiff', { compression: 'deflate' }, 'rgba37', 'rgba', ['sharp', 'ffmpeg:rgba', 'pil:RGBA']),
  C('tiff packbits rgb', 'tiff', { compression: 'packbits', sample: 'rgb' }, 'rgba37', 'rgb', ['sharp', 'ffmpeg:rgb24', 'pil:RGB']),
  C('tiff none rgb', 'tiff', { compression: 'none', sample: 'rgb' }, 'rgba64', 'rgb', ['sharp', 'ffmpeg:rgb24', 'pil:RGB']),
  C('tiff lzw big', 'tiff', { compression: 'lzw', sample: 'rgba' }, 'big', 'rgba', ['sharp', 'pil:RGBA']),
  C('tiff gray16 lzw', 'tiff', { compression: 'lzw' }, 'u16', 'raw', ['ffmpeg:gray16le', 'pil:raw', 'sharp16']),
  C('tiff int16 signed deflate', 'tiff', { compression: 'deflate' }, 'i16', 'raw', ['pil:raw', 'tifffile:raw']),
  C('tiff float32', 'tiff', { compression: 'none' }, 'f32', 'raw', ['tifffile:raw', 'pil:raw', 'cv2:raw']),   // ffmpeg's TIFF decoder has no float
  C('tiff multipage (3 frames)', 'tiff', { compression: 'packbits' }, 'vol', 'raw', ['pil:raw*', 'tifffile:raw*']),
  C('jp2 lossless rgba', 'jp2', {}, 'rgba37', 'rgba', ['pil:RGBA', 'ffmpeg:rgba']),
  C('jp2 lossless gray16', 'jp2', {}, 'u16', 'raw', ['pil:raw', 'ffmpeg:gray16le']),
  // signed J2K (Ssiz sign bit): OpenJPEG-based readers hand the samples back unsigned + 32768
  C('jp2 lossless int16 signed', 'jp2', {}, 'i16', 'raw', ['pil:raw!u', 'ffmpeg:gray16le!u']),
  C('jp2 lossy ratio 10', 'jp2', { lossless: false, ratio: 10 }, 'rgba64', 'psnr:28', ['pil:RGB', 'ffmpeg:rgb24']),
  C('j2k lossless rgb', 'j2k', {}, 'rgba64', 'rgba', ['pil:RGBA', 'ffmpeg:rgba']),
  C('j2k lossless gray16', 'j2k', {}, 'u16', 'raw', ['pil:raw', 'ffmpeg:gray16le']),
  C('jls lossless rgb', 'jls', {}, 'rgba37', 'rgb', ['ffmpeg:rgb24']),
  C('jls lossless gray16', 'jls', {}, 'u16', 'raw', ['ffmpeg:gray16le']),
  C('jls near 3', 'jls', { near: 3 }, 'rgba64', 'psnr:35', ['ffmpeg:rgb24']),
  C('psd flattened rgb', 'psd', {}, 'rgba64', 'rgb', ['pil:RGB', 'ffmpeg:rgb24']),
  C('psd rle rgba', 'psd', { alpha: true }, 'rgba64', 'rgba', ['pil:RGBA']),   // ffmpeg ignores the extra (alpha) channel
  C('psd raw rgba', 'psd', { compression: 'raw', alpha: true }, 'rgba37', 'rgba', ['pil:RGBA']),
  C('psd gray16', 'psd', {}, 'u16', 'raw', ['ffmpeg:gray16le']),
  C('tga 32 rle', 'tga', {}, 'rgba37', 'rgba', ['ffmpeg:rgba', 'pil:RGBA']),
  C('tga 24 raw', 'tga', { bits: '24', rle: false }, 'rgba64', 'rgb', ['ffmpeg:rgb24', 'pil:RGB']),
  C('tga 8 grey rle', 'tga', { bits: '8' }, 'rgba64', 'gray8', ['ffmpeg:gray', 'pil:L']),
  C('dds', 'dds', {}, 'rgba37', 'rgba', ['ffmpeg:rgba', 'pil:RGBA']),
  C('qoi rgba', 'qoi', {}, 'rgba64', 'rgba', ['ffmpeg:rgba', 'pil:RGBA']),
  C('qoi big', 'qoi', {}, 'big', 'rgba', ['ffmpeg:rgba', 'pil:RGBA']),
  C('exr half zip rgba', 'exr', {}, 'rgba37', 'linalphahalf', ['ffmpeg:gbrapf32le']),
  C('exr float none rgba', 'exr', { pixel: 'float', compression: 'none' }, 'rgba64', 'linalpha', ['ffmpeg:gbrapf32le']),
  C('exr float zips grey', 'exr', { pixel: 'float', compression: 'zips' }, 'f32', 'raw', ['ffmpeg:grayf32le']),
  C('exr half zip grey int16', 'exr', {}, 'i16', 'half', ['cv2:raw']),   // ffmpeg clamps EXR values to 0..1
  C('hdr rle', 'hdr', {}, 'rgba64', 'rgbe', ['ffmpeg:gbrpf32le']),
  C('hdr flat 37x23', 'hdr', { rle: false }, 'rgba37', 'rgbe', ['ffmpeg:gbrpf32le']),
  C('pfm rgb', 'pfm', {}, 'rgba37', 'lin', ['ffmpeg:gbrpf32le']),
  C('pfm grey', 'pfm', {}, 'f32', 'raw', ['ffmpeg:grayf32le', 'pil:raw']),
  C('pcx', 'pcx', {}, 'rgba37', 'rgb', ['ffmpeg:rgb24', 'pil:RGB']),
  C('pbm', 'pbm', {}, 'rgba64', 'bw', ['ffmpeg:gray', 'pil:L']),
  C('pbm ascii', 'pbm', { ascii: true }, 'rgba37', 'bw', ['ffmpeg:gray', 'pil:L']),
  C('pgm 8', 'pgm', {}, 'rgba37', 'gray8', ['ffmpeg:gray', 'pil:L']),
  C('pgm 16', 'pgm', { depth: '16' }, 'u16', 'raw', ['ffmpeg:gray16le', 'pil:raw']),
  C('pgm ascii 16', 'pgm', { depth: '16', ascii: true }, 'i16', 'shift', ['ffmpeg:gray16le', 'pil:raw']),
  C('ppm', 'ppm', {}, 'rgba64', 'rgb', ['ffmpeg:rgb24', 'pil:RGB']),
  C('ppm ascii', 'ppm', { ascii: true }, 'rgba37', 'rgb', ['ffmpeg:rgb24', 'pil:RGB']),
  C('pam rgba', 'pam', {}, 'rgba37', 'rgba', ['ffmpeg:rgba']),
  C('pam gray16', 'pam', { depth: '16' }, 'u16', 'raw', ['ffmpeg:gray16le']),
  C('sgi rle rgba', 'sgi', {}, 'rgba37', 'rgba', ['ffmpeg:rgba', 'pil:RGBA']),
  C('sgi verbatim rgba', 'sgi', { rle: false }, 'rgba64', 'rgba', ['ffmpeg:rgba', 'pil:RGBA']),
  C('sgi 16-bit grey', 'sgi', { depth: '16' }, 'u16', 'raw', ['ffmpeg:gray16le']),   // Pillow reads 16-bit SGI as 8-bit
  C('sun raster', 'ras', {}, 'rgba64', 'rgb', ['ffmpeg:rgb24', 'pil:RGB']),
  // odd width: rows are padded to 16 bits (spec, ffmpeg); Pillow's RLE reader ignores the padding, so it checks the even width
  C('sun raster rle', 'ras', { rle: true }, 'rgba37', 'rgb', ['ffmpeg:rgb24']),
  C('sun raster rle even', 'ras', { rle: true }, 'rgba64', 'rgb', ['ffmpeg:rgb24', 'pil:RGB']),
  C('xbm', 'xbm', {}, 'rgba37', 'bw', ['ffmpeg:gray', 'pil:L!inv']),   // X11: bit 1 = foreground (black); Pillow shows it white
  C('xpm', 'xpm', {}, 'rgba64', 'psnr:24', ['ffmpeg:rgba']),   // Pillow's XPM reader takes one character per pixel only
  C('wbmp', 'wbmp', {}, 'rgba37', 'bw', ['ffmpeg:gray']),
  C('farbfeld', 'ff', {}, 'rgba37', 'rgba~ff', ['farbfeld']),
  C('farbfeld gray16', 'ff', {}, 'u16', 'raw', ['farbfeld']),
  C('svg', 'svg', {}, 'rgba37', 'psnr:40', ['sharp']),
  C('eps ascii85', 'eps', {}, 'rgba37', 'rgb', ['eps-data', 'pil:RGB?gs']),
  C('eps hex grey', 'eps', { encoding: 'hex', grayscale: true }, 'rgba64', 'gray8', ['eps-data']),
  C('pdf 3 pages', 'pdf', { quality: 92 }, 'anim', 'psnr:30', ['pdf-jpeg']),
  C('ico png entries', 'ico', {}, 'rgba64', 'fit:256', ['pil:RGBA']),   // ffmpeg decodes only the first (16 px) entry
  C('ico bmp entries', 'ico', { entry: 'bmp', sizes: '16,32' }, 'rgba64', 'fit:32', ['pil:RGBA']),
  C('cur', 'cur', { size: '32' }, 'rgba37', 'fit:32', ['pil:RGBA']),
  C('icns', 'icns', {}, 'rgba64', 'fit:512', ['pil:RGBA']),
  // Pillow's FITS reader ignores BZERO / BSCALE and float byte order: numpy spec reader instead
  C('fits uint16 (BZERO)', 'fits', {}, 'u16', 'raw', ['fits-np', 'ffmpeg:dims']),
  C('fits int16', 'fits', {}, 'i16', 'raw', ['fits-np']),
  C('fits float32', 'fits', {}, 'f32', 'raw', ['fits-np']),
  C('fits int16 cube', 'fits', {}, 'vol', 'raw', ['fits-np']),
  C('fits rgb', 'fits', {}, 'rgba37', 'rgb~planar', ['fits-np']),
  C('nifti int16 volume', 'nifti', {}, 'vol', 'raw', ['nifti', 'nibabel', 'sitk']),
  C('nifti uint16', 'nifti', {}, 'u16', 'raw', ['nifti', 'nibabel', 'sitk']),
  C('nifti float32', 'nifti', {}, 'f32', 'raw', ['nifti', 'nibabel', 'sitk']),
  C('nifti rgb24', 'nifti', {}, 'rgba37', 'rgb', ['nifti']),
  C('nifti.gz int16 volume', 'nifti-gz', {}, 'vol', 'raw', ['nifti', 'nibabel', 'sitk']),
  C('analyze int16 volume', 'analyze', {}, 'vol', 'raw', ['analyze', 'nibabel']),
  C('analyze uint16→int32', 'analyze', {}, 'volu16', 'raw', ['analyze', 'nibabel']),
  C('mha int16 volume', 'mha', {}, 'vol', 'raw', ['meta', 'sitk']),
  C('mha compressed float', 'mha', { compress: true }, 'f32', 'raw', ['meta', 'sitk']),
  C('mhd+raw uint16 volume', 'mhd', {}, 'volu16', 'raw', ['meta', 'sitk']),
  C('nrrd raw int16 volume', 'nrrd', {}, 'vol', 'raw', ['nrrd', 'sitk']),
  C('nrrd gzip uint16', 'nrrd', { encoding: 'gzip' }, 'u16', 'raw', ['nrrd', 'sitk']),
  C('nrrd rgb', 'nrrd', {}, 'rgba37', 'rgb', ['nrrd']),
];

/* ── Tools ── */
const has = {};
function probeTools() {
  if (has.probed) return has;
  has.probed = true;
  try { require('sharp'); has.sharp = true; } catch { has.sharp = false; }
  has.ffmpeg = spawnSync(FFMPEG, ['-hide_banner', '-version'], { encoding: 'utf8' }).status === 0;
  const py = spawnSync('python', ['-E', '-P', '-c', 'import json,importlib.util as u;print(json.dumps({m:bool(u.find_spec(m)) for m in ["PIL","numpy","nibabel","SimpleITK"]}))'], { encoding: 'utf8' });
  try { const m = JSON.parse(py.stdout.trim()); has.python = true; has.pil = m.PIL && m.numpy; has.numpy = m.numpy; has.nibabel = m.nibabel; has.sitk = m.SimpleITK; } catch { has.python = false; }
  has.gs = ['gswin64c', 'gswin32c', 'gs'].some((g) => spawnSync(g, ['--version'], { encoding: 'utf8' }).status === 0);
  return has;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    const out = [], err = [];
    p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => err.push(d));
    p.on('close', (code) => resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString() }));
    p.on('error', (e) => resolve({ code: -1, stdout: Buffer.alloc(0), stderr: String(e) }));
  });
}
async function pool(items, limit, fn) {
  const res = new Array(items.length); let next = 0;
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(async () => { while (next < items.length) { const i = next++; res[i] = await fn(items[i], i); } }));
  return res;
}

const PIX = {   // ffmpeg pix_fmt → channels, typed array, planar order
  rgba: [4, Uint8Array], rgb24: [3, Uint8Array], gray: [1, Uint8Array], gray16le: [1, Uint16Array], rgb48le: [3, Uint16Array],
  grayf32le: [1, Float32Array], gbrpf32le: [3, Float32Array, true], gbrapf32le: [4, Float32Array, true],
};
async function ffmpegDecode(file, spec) {
  const [fmt, stream] = spec.split('@');
  const map = stream ? ['-map', '0:' + stream] : [];
  if (fmt === 'dims') {
    const r = await run(FFMPEG, ['-hide_banner', '-i', file, '-f', 'null', '-']);
    const m = /Video: [^\n]*?(\d{1,5})x(\d{1,5})/.exec(r.stderr);
    if (!m) throw new Error(r.stderr.split('\n').slice(-3).join(' '));
    return { w: +m[1], h: +m[2], dimsOnly: true };
  }
  const [ch, T, planar] = PIX[fmt];
  const raw = file + `.${fmt}.raw`;
  const r = await run(FFMPEG, ['-hide_banner', '-v', 'info', '-y', '-i', file, ...map, '-f', 'rawvideo', '-pix_fmt', fmt, raw]);
  if (r.code !== 0) throw new Error(r.stderr.trim().split('\n').slice(-2).join(' | '));
  const m = new RegExp(`Stream #0:${stream || '\\d+'}[^\\n]*Video: [^\\n]*?, (\\d{1,5})x(\\d{1,5})`).exec(r.stderr);
  const buf = fs.readFileSync(raw); fs.unlinkSync(raw);
  const w = +m[1], h = +m[2], fb = w * h * ch * T.BYTES_PER_ELEMENT, nf = Math.floor(buf.length / fb);
  const frames = [];
  for (let f = 0; f < nf; f++) {
    const a = new T(buf.buffer.slice(buf.byteOffset + f * fb, buf.byteOffset + (f + 1) * fb));
    if (!planar) { frames.push(a); continue; }
    const n = w * h, o = new T(n * ch), order = [1, 2, 0, 3];   // planes G B R (A)
    for (let p = 0; p < ch; p++) for (let i = 0; i < n; i++) o[i * ch + order[p]] = a[p * n + i];
    frames.push(o);
  }
  return { w, h, ch, frames };
}
async function sharpDecode(file, mode) {
  const sharp = require('sharp');
  const all = mode.endsWith('*');
  const s = sharp(fs.readFileSync(file), { pages: all ? -1 : 1, limitInputPixels: false });
  const meta = await s.metadata();
  if (mode.startsWith('sharp16') || mode.startsWith('sharpf')) {
    const signed = mode.startsWith('sharp16s'), float = mode.startsWith('sharpf');
    const grey = (meta.channels || 1) <= 2;
    const p = float ? s.raw({ depth: 'float' }) : (signed ? s : grey ? s.toColourspace('grey16') : s.toColourspace('rgb16')).raw({ depth: signed ? 'short' : 'ushort' });
    const { data, info } = await p.toBuffer({ resolveWithObject: true });
    const T = float ? Float32Array : signed ? Int16Array : Uint16Array;
    const a = new T(data.buffer.slice(data.byteOffset, data.byteOffset + data.length));
    const ph = meta.pageHeight || info.height, nf = info.height / ph, fs2 = info.width * ph * info.channels;
    return { w: info.width, h: ph, ch: info.channels, frames: new Array(nf).fill(0).map((_, f) => a.subarray(f * fs2, (f + 1) * fs2)) };
  }
  const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ph = meta.pageHeight || info.height, nf = info.height / ph, fs2 = info.width * ph * 4;
  return { w: info.width, h: ph, ch: 4, frames: new Array(nf).fill(0).map((_, f) => new Uint8Array(data.buffer, data.byteOffset + f * fs2, fs2)) };
}

const PY = String.raw`
import sys, json, os, base64, binascii, re, zipfile
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
jobs = json.load(open(sys.argv[1]))
res = []
def dump(r, a, key):
    a = np.ascontiguousarray(a)
    if a.dtype == np.uint8:
        r['dtype'] = 'u8'
    else:
        a = a.astype('<f8'); r['dtype'] = 'f8'
    p = os.path.join(os.path.dirname(sys.argv[1]), key + '.npbin')
    a.tofile(p); r['bin'] = p; r['shape'] = list(a.shape)
for j in jobs:
    r = {'key': j['key']}
    try:
        op = j['op']; f = j['file']
        if op == 'pil':
            im = Image.open(f)
            r['format'] = im.format; r['mode'] = im.mode; n = getattr(im, 'n_frames', 1); r['n_frames'] = n
            arrs = []
            for k in (range(n) if j.get('all') else [0]):
                if k: im.seek(k)
                m = j['mode']
                arrs.append(np.asarray(im if m == 'raw' else im.convert(m)))
            a = np.stack(arrs)
            if a.ndim == 3: a = a[..., None]
            r['w'] = int(a.shape[2]); r['h'] = int(a.shape[1]); r['ch'] = int(a.shape[3])
            dump(r, a, j['key'])
        elif op == 'cv2':
            os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'
            import cv2
            a = cv2.imread(f, cv2.IMREAD_UNCHANGED)
            if a is None: raise Exception('OpenCV could not read the file')
            if a.ndim == 3 and a.shape[2] >= 3: a = a[..., [2, 1, 0] + ([3] if a.shape[2] == 4 else [])]
            if a.ndim == 2: a = a[..., None]
            r['format'] = 'OpenCV ' + cv2.__version__ + ' ' + str(a.dtype); r['w'] = int(a.shape[1]); r['h'] = int(a.shape[0]); r['ch'] = int(a.shape[2])
            dump(r, a[None], j['key'])
        elif op == 'tifffile':
            import tifffile
            with tifffile.TiffFile(f) as t:
                a = np.stack([p.asarray() for p in t.pages])
                r['format'] = 'tifffile %s, %d page(s)' % (str(a.dtype), len(t.pages))
            if a.ndim == 3: a = a[..., None]
            r['w'] = int(a.shape[2]); r['h'] = int(a.shape[1]); r['ch'] = int(a.shape[3])
            dump(r, a, j['key'])
        elif op == 'fits':
            data = open(f, 'rb').read(); hdr = {}; pos = 0
            while True:
                card = data[pos:pos + 80].decode('ascii'); pos += 80
                k = card[:8].strip()
                if k == 'END': break
                if card[8:10] == '= ':
                    v = card[10:].split('/')[0].strip()
                    hdr[k] = v.strip("'").strip() if v.startswith("'") else v
            pos = ((pos + 2879) // 2880) * 2880
            bp = int(hdr['BITPIX']); dt = {8: 'u1', 16: '>i2', 32: '>i4', -32: '>f4', -64: '>f8'}[bp]
            nax = int(hdr['NAXIS']); dims = [int(hdr['NAXIS%d' % (i + 1)]) for i in range(nax)]
            cnt = int(np.prod(dims))
            a = np.frombuffer(data, dtype=dt, count=cnt, offset=pos).astype('f8')
            a = a * float(hdr.get('BSCALE', 1)) + float(hdr.get('BZERO', 0))
            a = a.reshape(list(reversed(dims)))
            if nax == 2: a = a[None]
            a = a[:, ::-1, :]
            r['w'] = dims[0]; r['h'] = dims[1]; r['ch'] = 1
            dump(r, a[..., None], j['key'])
        elif op == 'eps':
            t = open(f, 'rb').read().decode('latin-1')
            m = re.search(r'/Width (\d+) /Height (\d+)', t); w, h = int(m.group(1)), int(m.group(2))
            gray = '/DeviceGray' in t
            body = t.split('filter\n>> image\n', 1)[1]
            if 'ASCII85Decode' in t: raw = base64.a85decode(body.split('~>')[0].encode('latin-1'), adobe=False)
            else: raw = binascii.unhexlify(re.sub(r'\s', '', body.split('>')[0]))
            c = 1 if gray else 3
            r['w'] = w; r['h'] = h; r['ch'] = c
            dump(r, np.frombuffer(raw, dtype=np.uint8)[:w * h * c].reshape(1, h, w, c), j['key'])
        elif op == 'unzip':
            z = zipfile.ZipFile(f); bad = z.testzip()
            if bad: raise Exception('bad zip member ' + bad)
            d = f + '.unzipped'; z.extractall(d); r['files'] = [os.path.join(d, n) for n in z.namelist()]
        elif op == 'nibabel':
            import nibabel as nib
            img = nib.load(f); a = np.asanyarray(img.dataobj).astype('f8')
            if a.ndim == 4 and a.shape[3] == 1: a = a[..., 0]
            a = np.transpose(a, (2, 1, 0)) if a.ndim == 3 else np.transpose(a, (1, 0))[None]
            r['w'] = int(a.shape[2]); r['h'] = int(a.shape[1]); r['ch'] = 1; r['spacing'] = [float(z) for z in img.header.get_zooms()]
            dump(r, a[..., None], j['key'])
        elif op == 'sitk':
            import SimpleITK as sitk
            img = sitk.ReadImage(f); a = sitk.GetArrayFromImage(img).astype('f8')
            if a.ndim == 2: a = a[None]
            r['w'] = int(a.shape[2]); r['h'] = int(a.shape[1]); r['ch'] = 1; r['spacing'] = list(img.GetSpacing())
            dump(r, a[..., None], j['key'])
        r['ok'] = True
    except Exception as e:
        r['ok'] = False; r['error'] = '%s: %s' % (type(e).__name__, e)
    res.append(r)
print(json.dumps(res))
`;

async function pythonBatch(jobs) {
  if (!jobs.length) return {};
  const jf = path.join(OUT, '_py_jobs.json'), sf = path.join(OUT, '_validate.py');
  fs.writeFileSync(jf, JSON.stringify(jobs)); fs.writeFileSync(sf, PY);
  const r = await run('python', ['-E', '-P', sf, jf], { cwd: OUT });
  let list;
  try { list = JSON.parse(r.stdout.toString()); } catch { throw new Error('python failed: ' + r.stderr.slice(-400)); }
  const map = {};
  for (const x of list) {
    if (x.bin) {
      const b = fs.readFileSync(x.bin); fs.unlinkSync(x.bin);
      const a = x.dtype === 'u8' ? new Uint8Array(b.buffer, b.byteOffset, b.length) : new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
      const fsz = x.w * x.h * x.ch, nf = a.length / fsz;
      x.dec = { w: x.w, h: x.h, ch: x.ch, frames: new Array(nf).fill(0).map((_, f) => a.subarray(f * fsz, (f + 1) * fsz)) };
    }
    map[x.key] = x;
  }
  return map;
}

/* ── Spec readers (independent of the encoder code) ── */
const TYPED = { 2: Uint8Array, 4: Int16Array, 8: Int32Array, 16: Float32Array, 512: Uint16Array, 128: Uint8Array };
function readNifti(file) {
  let b = fs.readFileSync(file);
  if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
  const dv = new DataView(b.buffer, b.byteOffset, b.length);
  if (dv.getInt32(0, true) !== 348) throw new Error('sizeof_hdr is not 348 (or big-endian)');
  const magic = b.toString('latin1', 344, 348);
  if (magic !== 'n+1\0') throw new Error(`magic ${JSON.stringify(magic)}`);
  const dim = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => dv.getInt16(40 + i * 2, true));
  const datatype = dv.getInt16(70, true), bitpix = dv.getInt16(72, true), off = dv.getFloat32(108, true);
  const pix = [1, 2, 3].map((i) => dv.getFloat32(76 + i * 4, true));
  const T = TYPED[datatype]; if (!T) throw new Error('datatype ' + datatype);
  if (bitpix !== (datatype === 128 ? 24 : T.BYTES_PER_ELEMENT * 8)) throw new Error(`bitpix ${bitpix} does not match datatype ${datatype}`);
  return voxels(b, off, T, dim, datatype === 128 ? 3 : 1, pix, `datatype ${datatype}, pixdim ${pix.map((v) => +v.toFixed(3)).join('×')}, vox_offset ${off}`);
}
function voxels(b, off, T, dim, ch, pix, info) {
  const w = dim[1], h = dim[2], nf = dim[0] >= 3 ? dim[3] : 1, n = w * h * ch;
  const all = new T(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + w * h * nf * ch * T.BYTES_PER_ELEMENT));
  if (all.length < n * nf) throw new Error('data too short');
  return { w, h, ch, frames: new Array(nf).fill(0).map((_, f) => all.subarray(f * n, (f + 1) * n)), spacing: pix, info };
}
function readAnalyze(hdrFile, imgFile) {
  const b = fs.readFileSync(hdrFile), dv = new DataView(b.buffer, b.byteOffset, b.length);
  if (b.length !== 348 || dv.getInt32(0, true) !== 348) throw new Error('header is not 348 bytes');
  const dim = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => dv.getInt16(40 + i * 2, true));
  const datatype = dv.getInt16(70, true), T = TYPED[datatype];
  if (!T || datatype === 512) throw new Error('not an Analyze 7.5 datatype: ' + datatype);
  const pix = [1, 2, 3].map((i) => dv.getFloat32(76 + i * 4, true));
  return voxels(fs.readFileSync(imgFile), 0, T, dim, 1, pix, `datatype ${datatype}, pixdim ${pix.map((v) => +v.toFixed(3)).join('×')}`);
}
const MET = { MET_UCHAR: Uint8Array, MET_SHORT: Int16Array, MET_USHORT: Uint16Array, MET_INT: Int32Array, MET_FLOAT: Float32Array };
function readMeta(file) {
  const b = fs.readFileSync(file);
  const fields = {}; let pos = 0;
  while (pos < b.length) {
    const end = b.indexOf(10, pos), line = b.toString('latin1', pos, end).replace(/\r$/, ''); pos = end + 1;
    const m = /^\s*(\w+)\s*=\s*(.*)$/.exec(line); if (!m) continue;
    fields[m[1]] = m[2].trim();
    if (m[1] === 'ElementDataFile') break;
  }
  let data = fields.ElementDataFile === 'LOCAL' ? b.subarray(pos) : fs.readFileSync(path.join(path.dirname(file), fields.ElementDataFile));
  if (fields.CompressedData === 'True') data = zlib.inflateSync(data);
  if (fields.BinaryDataByteOrderMSB !== 'False') throw new Error('expected little-endian data');
  const dims = fields.DimSize.split(/\s+/).map(Number), ch = +(fields.ElementNumberOfChannels || 1);
  return voxels(data, 0, MET[fields.ElementType], [dims.length, ...dims, 1, 1, 1, 1], ch, fields.ElementSpacing.split(/\s+/).map(Number), `${fields.ElementType}, spacing ${fields.ElementSpacing}`);
}
const NRRD_T = { short: Int16Array, 'unsigned short': Uint16Array, float: Float32Array, 'unsigned char': Uint8Array, int: Int32Array };
function readNrrd(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 8) !== 'NRRD0004') throw new Error('magic');
  const end = b.indexOf('\n\n'), head = b.toString('latin1', 0, end), f = {};
  for (const line of head.split('\n').slice(1)) { if (line.startsWith('#')) continue; const m = /^([^:]+):\s*(.*)$/.exec(line); if (m) f[m[1]] = m[2]; }
  let data = b.subarray(end + 2);
  if (f.encoding === 'gzip') data = zlib.gunzipSync(data); else if (f.encoding !== 'raw') throw new Error('encoding ' + f.encoding);
  const sizes = f.sizes.split(' ').map(Number), rgb = /RGB-color/.test(f.kinds || '');
  const d = rgb ? sizes.slice(1) : sizes;
  return voxels(data, 0, NRRD_T[f.type], [d.length, ...d, 1, 1, 1, 1], rgb ? 3 : 1, f.spacings.split(' ').filter((s) => s !== 'nan').map(Number), `${f.type}, ${f.encoding}, spacings ${f.spacings}`);
}
function readFarbfeld(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 8) !== 'farbfeld') throw new Error('magic');
  const w = b.readUInt32BE(8), h = b.readUInt32BE(12), a = new Uint16Array(w * h * 4);
  for (let i = 0; i < a.length; i++) a[i] = b.readUInt16BE(16 + i * 2);
  return { w, h, ch: 4, frames: [a] };
}
async function pdfJpegs(file) {
  const b = fs.readFileSync(file), s = b.toString('latin1');
  if (!s.startsWith('%PDF-')) throw new Error('not a PDF');
  const pages = (s.match(/\/Type\s*\/Page\b/g) || []).length;
  const frames = []; let w = 0, h = 0, re = /\/Filter\s*\/DCTDecode[^]*?stream\r?\n/g, m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, end = s.indexOf('endstream', start);
    const d = await sharpDecode(writeTmp(b.subarray(start, end), '.jpg'), 'sharp');
    w = d.w; h = d.h; frames.push(d.frames[0]);
  }
  if (frames.length !== pages) throw new Error(`${pages} pages but ${frames.length} JPEG streams`);
  return { w, h, ch: 4, frames, info: `${pages} pages` };
}
let tmpN = 0;
function writeTmp(data, ext) { const p = path.join(OUT, `_tmp${tmpN++}${ext}`); fs.writeFileSync(p, data); return p; }
let jxlDec = null;
async function jxlDecode(file) {
  if (!jxlDec) {
    const dir = path.join(ROOT, 'node_modules', '@jsquash', 'jxl', 'codec', 'dec');
    const factory = (await import(pathToFileURL(path.join(dir, 'jxl_dec.js')).href)).default;
    jxlDec = await factory({ noInitialRun: true, wasmBinary: fs.readFileSync(path.join(dir, 'jxl_dec.wasm')) });
  }
  const r = jxlDec.decode(fs.readFileSync(file));
  if (!r) throw new Error('libjxl could not decode');
  return { w: r.width, h: r.height, ch: 4, frames: [new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength)] };
}
let heifLib = null;
async function libheifDecode(file) {
  if (!heifLib) { let f = require('libheif-js/libheif-wasm/libheif-bundle.js'); if (f.default) f = f.default; heifLib = typeof f === 'function' ? await f({ print() {}, printErr() {} }) : f; }
  const dec = new heifLib.HeifDecoder(), imgs = dec.decode(fs.readFileSync(file));
  if (!imgs || !imgs.length) throw new Error('libheif: no image');
  const img = imgs[0], w = img.get_width(), h = img.get_height(), out = new Uint8ClampedArray(w * h * 4);
  await new Promise((res, rej) => img.display({ data: out, width: w, height: h }, (r) => (r ? res() : rej(new Error('libheif decode failed')))));
  return { w, h, ch: 4, frames: [out] };
}

/* ── Validation run ── */
function adjustExpect(c, inp) {
  const [kind, flag] = c.expect.split('~');
  const e = expected(kind, inp);
  // 12-bit AVIF read back at 16 bits: decoders scale by ×16 or ×65535/4095 — within one 12-bit step either way
  if (flag === '16' && kind === 'raw') { e.frames = e.frames.map((f) => Float64Array.from(f, (v) => Math.round(Math.round((v * 4095) / 65535) * 65535 / 4095))); e.abs = 16; }
  if (flag === 'ff') { e.frames = e.frames.map((f) => Uint16Array.from(f, (v) => v * 257)); }
  if (flag === 'planar') e.planar = true;
  return e;
}
function tolerance(e, v) {   // per-validator suffixes: ~N = PSNR ≥ N dB, !inv = inverted 1-bit convention, !u = signed read back unsigned (+32768), !1 = ±1
  const m = /~(\d+)$/.exec(v);
  if (m) { e.psnr = +m[1]; e.flattenDecoded = false; }
  if (/!inv/.test(v)) e.frames = e.frames.map((f) => f.map((x) => 255 - x));
  if (/!u/.test(v)) e.frames = e.frames.map((f) => Float64Array.from(f, (x) => x + 32768));
  if (/!1/.test(v)) e.abs = 1;
  return e;
}
/** files: [{ c, file }] — returns [{ c, file, size, rows: [{ tool, status: 'pass'|'fail'|'skip', msg }] }] */
async function validate(files) {
  probeTools();
  const pyJobs = [], tasks = [];
  const out = files.map(({ c, file, error, skip }) => ({ c, file, error, skip, size: file && fs.existsSync(file) ? fs.statSync(file).size : 0, rows: [] }));
  for (const r of out) {
    if (r.error || !r.file) continue;
    const inp = input(r.c.input);
    for (const v of r.c.validators) {
      const row = { tool: v, status: 'skip', msg: '' };
      r.rows.push(row);
      const [tool, arg = ''] = v.split(':');
      const exp = () => tolerance(adjustExpect(r.c, inp), v);
      const finish = (dec) => {
        if (dec.dimsOnly) { const ok = dec.w === inp.width && dec.h === inp.height; row.status = ok ? 'pass' : 'fail'; row.msg = `${dec.w}×${dec.h} (header only)`; return; }
        const e = exp();
        if (e.planar) { const n = inp.width * inp.height; const f = dec.frames; if (f.length === 3 && dec.ch === 1) dec = { ...dec, ch: 3, frames: [Uint8Array.from({ length: n * 3 }, (_, i) => f[i % 3][Math.floor(i / 3)])] }; }
        const res = compare(e, dec, inp);
        row.status = res.ok ? 'pass' : 'fail'; row.msg = res.msg + (dec.info ? ` · ${dec.info}` : '') + (dec.spacing ? ` · spacing ${dec.spacing.map((s) => +(+s).toFixed(3)).join('×')}` : '');
      };
      const job = async (fn) => { try { finish(await fn()); } catch (e) { row.status = 'fail'; row.msg = String(e.message || e).slice(0, 300); } };
      if (tool === 'sharp' || tool.startsWith('sharp16')) { if (!has.sharp) { row.msg = 'sharp not installed'; continue; } tasks.push(() => job(() => sharpDecode(r.file, v))); }
      else if (tool === 'ffmpeg') { if (!has.ffmpeg) { row.msg = 'ffmpeg not found'; continue; } tasks.push(() => job(() => ffmpegDecode(r.file, arg.replace(/[~!].*$/, '')))); }
      else if (tool === 'jxl-dec') tasks.push(() => job(() => jxlDecode(r.file).then((d) => ({ ...d, info: 'libjxl decoder (@jsquash/jxl; no other JXL decoder installed)' }))));
      else if (tool === 'libheif') tasks.push(() => job(() => libheifDecode(r.file).then((d) => ({ ...d, info: 'libheif + libde265' }))));
      else if (tool === 'farbfeld') tasks.push(() => job(async () => ({ ...readFarbfeld(r.file), info: 'spec reader' })));
      else if (tool === 'pdf-jpeg') { if (!has.sharp) { row.msg = 'sharp not installed'; continue; } tasks.push(() => job(() => pdfJpegs(r.file))); }
      else if (tool === 'nifti') tasks.push(() => job(async () => ({ ...readNifti(r.file) })));
      else if (tool === 'meta' && r.c.id === 'mha') tasks.push(() => job(async () => readMeta(r.file)));
      else if (tool === 'nrrd') tasks.push(() => job(async () => readNrrd(r.file)));
      else if (['pil', 'cv2', 'tifffile', 'fits-np', 'eps-data', 'nibabel', 'sitk', 'analyze', 'meta'].includes(tool)) {
        if (!has.python || !has.pil) { row.msg = 'Python Pillow / numpy not found'; continue; }
        if (tool === 'nibabel' && !has.nibabel) { row.msg = 'nibabel not installed (python -E -P -c "import nibabel" fails)'; continue; }
        if (tool === 'sitk' && !has.sitk) { row.msg = 'SimpleITK not installed'; continue; }
        if (tool === 'pil' && arg.endsWith('?gs') && !has.gs) { row.msg = 'Pillow needs Ghostscript for EPS — not installed'; continue; }
        const key = 'j' + pyJobs.length;
        const zipped = ['analyze', 'mhd'].includes(r.c.id);
        if (zipped && !r.unzipKey) { r.unzipKey = 'z' + pyJobs.length; pyJobs.push({ key: r.unzipKey, op: 'unzip', file: r.file }); }
        if (tool === 'analyze' || tool === 'meta') { row.after = { tool, unzip: r.unzipKey }; continue; }
        const target = () => (zipped ? null : r.file);
        if ((tool === 'nibabel' || tool === 'sitk') && zipped) { row.after = { tool, unzip: r.unzipKey, py: true }; continue; }
        const mode = arg.replace(/[*?!~@].*$/, '');
        pyJobs.push({ key, op: tool === 'fits-np' ? 'fits' : tool === 'eps-data' ? 'eps' : tool, file: target(), mode: mode || 'raw', all: arg.includes('*') });
        row.py = key;
      } else row.msg = 'unknown validator';
    }
  }
  const [pyRes] = await Promise.all([pythonBatch(pyJobs).catch((e) => ({ _error: e.message })), pool(tasks, 8, (t) => t())]);
  // Python results, then the readers that needed the unzipped pair
  const second = [];
  for (const r of out) for (const row of r.rows) {
    const inp = input(r.c.input);
    if (row.py) {
      const x = pyRes[row.py];
      if (!x) { row.status = 'fail'; row.msg = pyRes._error || 'no python result'; continue; }
      if (!x.ok) { row.status = 'fail'; row.msg = x.error; continue; }
      const res = compare(tolerance(adjustExpect(r.c, inp), row.tool), x.dec, inp);
      row.status = res.ok ? 'pass' : 'fail'; row.msg = `${res.msg}${x.format ? ` · PIL ${x.format} ${x.mode}${x.n_frames > 1 ? ` ×${x.n_frames}` : ''}` : ''}${x.spacing ? ` · spacing ${x.spacing.map((s) => +s.toFixed(3)).join('×')}` : ''}`;
    } else if (row.after) {
      const z = pyRes[row.after.unzip];
      if (!z || !z.ok) { row.status = 'fail'; row.msg = 'unzip: ' + (z ? z.error : pyRes._error); continue; }
      const fl = z.files, find = (ext) => fl.find((f) => f.toLowerCase().endsWith(ext));
      if (row.after.py) {
        const key = 'k' + second.length;
        second.push({ key, op: row.tool, file: find('.hdr') || find('.mhd'), row, r });
        continue;
      }
      try {
        const dec = row.tool === 'analyze' ? readAnalyze(find('.hdr'), find('.img')) : readMeta(find('.mhd'));
        const res = compare(adjustExpect(r.c, inp), dec, inp);
        row.status = res.ok ? 'pass' : 'fail'; row.msg = `${res.msg} · ${dec.info} · zip opened by Python zipfile`;
      } catch (e) { row.status = 'fail'; row.msg = e.message; }
    }
  }
  if (second.length) {
    const res2 = await pythonBatch(second.map(({ key, op, file }) => ({ key, op, file })));
    for (const s of second) {
      const x = res2[s.key];
      if (!x || !x.ok) { s.row.status = 'fail'; s.row.msg = x ? x.error : 'no result'; continue; }
      const res = compare(adjustExpect(s.r.c, input(s.r.c.input)), x.dec, input(s.r.c.input));
      s.row.status = res.ok ? 'pass' : 'fail'; s.row.msg = res.msg + (x.spacing ? ` · spacing ${x.spacing.map((v) => +v.toFixed(3)).join('×')}` : '');
    }
  }
  for (const r of out) for (const row of r.rows) delete row.py;
  return out;
}

function table(results) {
  const lines = [];
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  lines.push(`${pad('case', 30)} ${pad('format', 12)} ${pad('bytes', 8)} ${pad('validator', 18)} result`);
  for (const r of results) {
    if (r.error) { lines.push(`${pad(r.c.name, 30)} ${pad(r.c.id, 12)} ${pad('-', 8)} ${pad('encode', 18)} ${r.skip ? 'SKIP' : 'FAIL'}  ${r.error}`); continue; }
    r.rows.forEach((row, i) => lines.push(`${pad(i ? '' : r.c.name, 30)} ${pad(i ? '' : r.c.id, 12)} ${pad(i ? '' : r.size, 8)} ${pad(row.tool, 18)} ${row.status.toUpperCase()}  ${row.msg}`));
  }
  return lines.join('\n');
}

module.exports = { ROOT, OUT, CASES, INPUTS, input, synth, flatten, validate, table, probeTools, has, fileName: (c, f) => `${c.name.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '')}.${f.ext}` };
