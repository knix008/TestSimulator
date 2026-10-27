// GIF codec: GIF87a/89a reading (all frames, interlace, local palettes,
// transparency, disposal), GIF89a writing with LZW, animation (delay, loop
// count) and appending frames to an existing file.
import { cerr, le16, Out } from './common.js';

export function lzwDecodeGif(data, minSize, nOut) {
  const clear = 1 << minSize, eoi = clear + 1;
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  const out = new Uint8Array(nOut);
  const stack = new Uint8Array(4097);
  let codeSize = minSize + 1, next = eoi + 1, old = -1, first = 0, op = 0;
  let bb = 0, bc = 0, p = 0;
  while (op < nOut) {
    while (bc < codeSize) { if (p >= data.length) return out; bb |= data[p++] << bc; bc += 8; }
    const code = bb & ((1 << codeSize) - 1);
    bb >>>= codeSize; bc -= codeSize;
    if (code === clear) { codeSize = minSize + 1; next = eoi + 1; old = -1; continue; }
    if (code === eoi) break;
    if (old === -1) {
      if (code >= clear) throw cerr('gif', 'bad LZW code');
      out[op++] = code; old = code; first = code; continue;
    }
    let sp = 0, c = code;
    if (code >= next) { if (code > next) throw cerr('gif', 'bad LZW code'); stack[sp++] = first; c = old; }
    while (c >= clear) { stack[sp++] = suffix[c]; c = prefix[c]; }
    first = c; stack[sp++] = c;
    while (sp > 0 && op < nOut) out[op++] = stack[--sp];
    if (next < 4096) {
      prefix[next] = old; suffix[next] = first; next++;
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
    }
    old = code;
  }
  return out;
}

export function lzwEncodeGif(idx, minSize) {
  const clear = 1 << minSize, eoi = clear + 1;
  const o = new Out(idx.length / 2 + 16);
  let bb = 0, bc = 0, codeSize = minSize + 1, next = eoi + 1;
  const emit = (c) => { bb |= c << bc; bc += codeSize; while (bc >= 8) { o.u8(bb & 255); bb >>>= 8; bc -= 8; } };
  const dict = new Map();
  emit(clear);
  if (idx.length) {
    let pre = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = pre * 256 + k;
      const hit = dict.get(key);
      if (hit !== undefined) { pre = hit; continue; }
      emit(pre);
      if (next < 4096) {
        dict.set(key, next++);
        if (next > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        emit(clear); dict.clear(); codeSize = minSize + 1; next = eoi + 1;
      }
      pre = k;
    }
    emit(pre);
  }
  emit(eoi);
  if (bc > 0) o.u8(bb & 255);
  return o.result();
}

function readSubBlocks(b, p) {
  const parts = []; let n = 0;
  while (p < b.length) { const len = b[p++]; if (!len) break; parts.push(b.subarray(p, p + len)); n += len; p += len; }
  const out = new Uint8Array(n); let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
  return [out, p];
}

/** Parses a GIF; frames are composed onto the logical screen (index data). */
export function decodeGif(b, opts = {}) {
  const sig = String.fromCharCode(...b.subarray(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw cerr('gif', 'missing GIF signature');
  const width = le16(b, 6), height = le16(b, 8), packed = b[10], bgIndex = b[11];
  let p = 13, globalPalette = null;
  if (packed & 0x80) { const n = 2 << (packed & 7); globalPalette = b.slice(p, p + 3 * n); p += 3 * n; }
  const frames = [], comments = [];
  let gce = null, loopCount = null;
  const canvas = new Uint8Array(width * height).fill(bgIndex);
  while (p < b.length) {
    const t = b[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[p++];
      if (label === 0xf9) {
        const pk = b[p + 1];
        gce = { disposal: (pk >> 2) & 7, transparent: pk & 1 ? b[p + 4] : null, delay: le16(b, p + 2) };
        p += 1 + b[p];
        [, p] = readSubBlocks(b, p);
      } else if (label === 0xff) {
        const len = b[p]; const id = String.fromCharCode(...b.subarray(p + 1, p + 1 + len)); p += 1 + len;
        const [d, np] = readSubBlocks(b, p); p = np;
        if ((id === 'NETSCAPE2.0' || id === 'ANIMEXTS1.0') && d[0] === 1) loopCount = d[1] | (d[2] << 8);
      } else if (label === 0xfe) {
        const [d, np] = readSubBlocks(b, p); p = np; comments.push(String.fromCharCode(...d));
      } else { [, p] = readSubBlocks(b, p); }
      continue;
    }
    if (t !== 0x2c) { if (frames.length) break; throw cerr('gif', `unexpected block 0x${t.toString(16)}`); }
    const left = le16(b, p), top = le16(b, p + 2), w = le16(b, p + 4), h = le16(b, p + 6), pk = b[p + 8];
    p += 9;
    let palette = globalPalette;
    if (pk & 0x80) { const n = 2 << (pk & 7); palette = b.slice(p, p + 3 * n); p += 3 * n; }
    const minSize = b[p++];
    const [z, np] = readSubBlocks(b, p); p = np;
    const raw = lzwDecodeGif(z, minSize, w * h);
    const interlaced = !!(pk & 0x40);
    const rows = [];
    if (interlaced) { for (const [s, d] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < h; y += d) rows.push(y); } else for (let y = 0; y < h; y++) rows.push(y);
    const g = gce || { disposal: 0, transparent: null, delay: 0 };
    gce = null;
    const before = g.disposal === 3 ? canvas.slice() : null;
    for (let r = 0; r < h; r++) {
      const y = top + rows[r]; if (y >= height) continue;
      for (let x = 0; x < w; x++) {
        const xx = left + x; if (xx >= width) continue;
        const v = raw[r * w + x];
        if (g.transparent !== null && v === g.transparent) continue;
        canvas[y * width + xx] = v;
      }
    }
    frames.push({ data: canvas.slice(), palette: palette || defaultPalette(), delay: g.delay, disposal: g.disposal, transparentIndex: g.transparent, left, top, width: w, height: h, interlaced, local: !!(pk & 0x80) });
    if (opts.firstOnly) break;
    if (g.disposal === 2) { for (let y = top; y < Math.min(height, top + h); y++) for (let x = left; x < Math.min(width, left + w); x++) canvas[y * width + x] = bgIndex; } else if (g.disposal === 3 && before) canvas.set(before);
  }
  if (!frames.length) throw cerr('gif', 'no image data');
  return { width, height, frames, globalPalette, bgIndex, loopCount, comments, version: sig.slice(3) };
}
function defaultPalette() { const p = new Uint8Array(768); for (let i = 0; i < 256; i++) p[3 * i] = p[3 * i + 1] = p[3 * i + 2] = i; return p; }

const palBits = (n) => { let b = 1; while ((1 << b) < n) b++; return b; };
function padPalette(pal) {
  const n = pal.length / 3, bits = palBits(Math.max(2, n));
  const out = new Uint8Array(3 << bits); out.set(pal.subarray(0, Math.min(pal.length, out.length)));
  return [out, bits];
}

function frameBlock(o, f, local) {
  // graphic control extension
  if (f.delay != null || f.transparentIndex != null || f.disposal) {
    o.u8(0x21); o.u8(0xf9); o.u8(4);
    o.u8(((f.disposal || 0) << 2) | (f.transparentIndex != null ? 1 : 0));
    o.le16(Math.round(f.delay || 0)); o.u8(f.transparentIndex ?? 0); o.u8(0);
  }
  o.u8(0x2c); o.le16(f.left || 0); o.le16(f.top || 0); o.le16(f.width); o.le16(f.height);
  let bits = 8;
  if (local) { const [pal, b] = padPalette(f.palette); bits = b; o.u8(0x80 | (b - 1)); o.bytes(pal); } else { bits = palBits(Math.max(2, f.palette.length / 3)); o.u8(0); }
  const minSize = Math.max(2, bits);
  o.u8(minSize);
  const z = lzwEncodeGif(f.data, minSize);
  for (let i = 0; i < z.length; i += 255) { const n = Math.min(255, z.length - i); o.u8(n); o.bytes(z.subarray(i, i + n)); }
  o.u8(0);
}

/**
 * Encodes a GIF89a. frames: [{ width, height, data (indices), palette (RGB triples),
 * delay (1/100 s), transparentIndex, disposal }]. opts: { loopCount, comment, backgroundIndex }
 */
export function encodeGif(frames, opts = {}) {
  const f0 = frames[0];
  const o = new Out(f0.width * f0.height + 1024);
  o.ascii('GIF89a'); o.le16(opts.screenWidth || f0.width); o.le16(opts.screenHeight || f0.height);
  const [gpal, gbits] = padPalette(f0.palette);
  o.u8(0x80 | ((gbits - 1) << 4) | (gbits - 1)); o.u8(opts.backgroundIndex || 0); o.u8(0);
  o.bytes(gpal);
  if (opts.loopCount != null) {
    o.u8(0x21); o.u8(0xff); o.u8(11); o.ascii('NETSCAPE2.0'); o.u8(3); o.u8(1); o.le16(opts.loopCount); o.u8(0);
  }
  if (opts.comment) { const s = String(opts.comment); o.u8(0x21); o.u8(0xfe); for (let i = 0; i < s.length; i += 255) { const n = Math.min(255, s.length - i); o.u8(n); o.ascii(s.slice(i, i + n)); } o.u8(0); }
  frames.forEach((f, i) => {
    const same = i === 0 || (f.palette.length === f0.palette.length && f.palette.every((v, k) => v === f0.palette[k]));
    frameBlock(o, f, !same);
  });
  o.u8(0x3b);
  return o.result();
}

/** Appends frames (with local palettes) to an existing GIF file's bytes. */
export function appendGif(existing, frames) {
  let end = existing.length;
  while (end > 0 && existing[end - 1] !== 0x3b) end--;
  if (end === 0) throw cerr('gif', 'missing trailer');
  const o = new Out(existing.length + 4096);
  o.bytes(existing.subarray(0, end - 1));
  for (const f of frames) frameBlock(o, f, true);
  o.u8(0x3b);
  return o.result();
}
