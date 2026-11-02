// Lossless JPEG (ITU T.81 process 14, SOF3, Huffman coded): decoder for
// 2..16-bit samples with any of the predictors 1..7, point transform and
// restart intervals; encoder for 8..16-bit grayscale / RGB with predictor 1
// and an optimal Huffman table (T.81 Annex K.2).
import { cerr, makeRaster, be16 } from './common.js';

// ---------------------------------------------------------------- decoder

function huffTable(counts, values) {
  // lookup by (length, code) → value
  const maxcode = new Int32Array(18).fill(-1), mincode = new Int32Array(17), valptr = new Int32Array(17);
  let code = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    valptr[l] = k; mincode[l] = code;
    code += counts[l - 1]; k += counts[l - 1];
    maxcode[l] = counts[l - 1] ? code - 1 : -1;
    code <<= 1;
  }
  return { maxcode, mincode, valptr, values };
}

function predict(sel, ra, rb, rc) {
  switch (sel) {
    case 1: return ra;
    case 2: return rb;
    case 3: return rc;
    case 4: return ra + rb - rc;
    case 5: return ra + ((rb - rc) >> 1);
    case 6: return rb + ((ra - rc) >> 1);
    case 7: return (ra + rb) >> 1;
    default: return 0;
  }
}

/** Decodes a lossless JPEG → raster (8-bit data for P <= 8, 16-bit otherwise). */
export function decodeLosslessJpeg(data) {
  if (data[0] !== 0xff || data[1] !== 0xd8) throw cerr('jpg', 'missing SOI marker');
  let pos = 2;
  const tables = [];
  let frame = null, restart = 0;
  let planes = null;
  for (;;) {
    while (pos < data.length && data[pos] !== 0xff) pos++;
    while (pos < data.length && data[pos] === 0xff) pos++;
    if (pos >= data.length) break;
    const marker = data[pos++];
    if (marker === 0xd9) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    const len = be16(data, pos);
    const end = pos + len;
    let p = pos + 2;
    if (marker === 0xc4) {
      while (p < end) {
        const th = data[p] & 15; p++;
        const counts = data.subarray(p, p + 16); p += 16;
        let n = 0; for (const c of counts) n += c;
        tables[th] = huffTable(counts, data.slice(p, p + n)); p += n;
      }
    } else if (marker === 0xdd) {
      restart = be16(data, p);
    } else if (marker === 0xc3) {
      const precision = data[p];
      if (precision < 2 || precision > 16) throw cerr('jpg', `${precision}-bit lossless samples are not supported`);
      const height = be16(data, p + 1), width = be16(data, p + 3), nc = data[p + 5];
      const comps = [];
      for (let i = 0; i < nc; i++) { const q = p + 6 + i * 3; comps.push({ id: data[q], h: data[q + 1] >> 4, v: data[q + 1] & 15 }); }
      if (comps.some((c) => c.h !== 1 || c.v !== 1)) throw cerr('jpg', 'subsampled lossless JPEG files are not supported');
      if (!width || !height) throw cerr('jpg', 'image size is zero (DNL marker) is not supported');
      frame = { width, height, precision, comps };
      planes = comps.map(() => new Int32Array(width * height));
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      throw cerr('jpg', 'mixed lossless and lossy frames are not supported');
    } else if (marker === 0xda) {
      if (!frame) throw cerr('jpg', 'scan before frame header');
      const ns = data[p++];
      const sc = [];
      for (let i = 0; i < ns; i++) {
        const id = data[p], t = data[p + 1]; p += 2;
        const k = frame.comps.findIndex((x) => x.id === id);
        if (k < 0) throw cerr('jpg', 'unknown component in scan');
        if (!tables[t >> 4]) throw cerr('jpg', 'missing Huffman table');
        sc.push({ k, table: tables[t >> 4] });
      }
      const sel = data[p], pt = data[p + 2] & 15;
      pos = decodeScan(data, end, frame, planes, sc, sel, pt, restart);
      continue;
    }
    pos = end;
  }
  if (!frame) throw cerr('jpg', 'no frame found');
  const { width, height, precision, comps } = frame;
  const nc = comps.length;
  const r = makeRaster(width, height, nc === 1 ? 1 : nc === 3 ? 3 : nc, precision > 8 ? 16 : 8);
  for (let i = 0; i < width * height; i++) for (let k = 0; k < nc; k++) r.data[i * nc + k] = planes[k][i];
  r.colorSpace = nc === 1 ? 'grayscale' : 'rgb';
  r.components = nc;
  r.lossless = true;
  r.precision = precision;
  return r;
}

function decodeScan(data, start, frame, planes, sc, sel, pt, restart) {
  let pos = start, bitsData = 0, bitsCount = 0;
  const readBit = () => {
    if (bitsCount > 0) { bitsCount--; return (bitsData >> bitsCount) & 1; }
    if (pos >= data.length) { bitsData = 0; bitsCount = 7; return 0; }
    bitsData = data[pos++];
    if (bitsData === 0xff) { const nx = data[pos]; if (nx === 0) pos++; else if (nx >= 0xd0 && nx <= 0xd7) { bitsData = 0; } }
    bitsCount = 7;
    return (bitsData >> 7) & 1;
  };
  const decodeHuff = (t) => {
    let code = 0;
    for (let l = 1; l <= 16; l++) {
      code = (code << 1) | readBit();
      if (t.maxcode[l] >= 0 && code <= t.maxcode[l] && code >= t.mincode[l]) return t.values[t.valptr[l] + code - t.mincode[l]];
    }
    throw cerr('jpg', 'bad Huffman code');
  };
  const receive = (s) => { let v = 0; for (let i = 0; i < s; i++) v = (v << 1) | readBit(); return v; };
  const { width, height, precision } = frame;
  const P = precision - pt;
  const mask = (1 << precision) - 1;
  const base = 1 << (P - 1);
  const unit = sc.length; // samples per MCU (all components sampled 1x1)
  let mcus = 0;
  let firstLine = true, atStart = true;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (restart && mcus && mcus % restart === 0) {
        // skip to the RSTn marker and reset the predictor
        bitsCount = 0;
        while (pos + 1 < data.length && !(data[pos] === 0xff && data[pos + 1] >= 0xd0 && data[pos + 1] <= 0xd7)) pos++;
        pos += 2;
        firstLine = true; atStart = true;
      }
      for (let s = 0; s < unit; s++) {
        const { k, table } = sc[s];
        const pl = planes[k];
        const t = decodeHuff(table);
        let diff;
        if (t === 0) diff = 0;
        else if (t === 16) diff = 32768;
        else { diff = receive(t); if (diff < 1 << (t - 1)) diff -= (1 << t) - 1; }
        let pred;
        const i = y * width + x;
        const ra = x > 0 ? pl[i - 1] >> pt : 0, rb = y > 0 ? pl[i - width] >> pt : 0, rc = x > 0 && y > 0 ? pl[i - width - 1] >> pt : 0;
        if (atStart) pred = base;
        else if (firstLine) pred = ra;
        else if (x === 0) pred = rb;
        else pred = predict(sel, ra, rb, rc);
        pl[i] = (((pred + diff) & ((1 << P) - 1)) << pt) & mask;
      }
      mcus++;
      atStart = false;
    }
    firstLine = false;
  }
  // continue after the scan: find the next marker
  while (pos + 1 < data.length && !(data[pos] === 0xff && data[pos + 1] !== 0 && !(data[pos + 1] >= 0xd0 && data[pos + 1] <= 0xd7))) pos++;
  return pos;
}

// ---------------------------------------------------------------- encoder

/** Optimal JPEG Huffman code lengths (T.81 Annex K.2, limited to 16 bits) → { bits[16], vals[] }. */
function optimalTable(freq0) {
  const freq = Array.from(freq0);
  freq[256] = 1; // reserved code point so no code is all ones
  const codesize = new Array(257).fill(0), others = new Array(257).fill(-1);
  for (;;) {
    let v1 = -1, v2 = -1;
    for (let i = 0; i <= 256; i++) if (freq[i] > 0 && (v1 < 0 || freq[i] <= freq[v1])) v1 = i;
    for (let i = 0; i <= 256; i++) if (freq[i] > 0 && i !== v1 && (v2 < 0 || freq[i] <= freq[v2])) v2 = i;
    if (v2 < 0) break;
    freq[v1] += freq[v2]; freq[v2] = 0;
    codesize[v1]++; while (others[v1] >= 0) { v1 = others[v1]; codesize[v1]++; }
    others[v1] = v2;
    codesize[v2]++; while (others[v2] >= 0) { v2 = others[v2]; codesize[v2]++; }
  }
  const bits = new Array(33).fill(0);
  for (let i = 0; i <= 256; i++) if (codesize[i]) bits[codesize[i]]++;
  for (let i = 32; i > 16; i--) {
    while (bits[i] > 0) {
      let j = i - 2; while (bits[j] === 0) j--;
      bits[i] -= 2; bits[i - 1]++; bits[j + 1] += 2; bits[j]--;
    }
  }
  let i = 16; while (bits[i] === 0) i--;
  bits[i]--; // remove the reserved code point
  const vals = [];
  for (let l = 1; l <= 32; l++) for (let s = 0; s < 256; s++) if (codesize[s] === l) vals.push(s);
  return { bits: bits.slice(1, 17), vals };
}

/**
 * Encodes a lossless JPEG. img: { width, height, channels (1 or 3), data } with
 * samples below 2^precision. opts: { precision = 8 (2..16) }.
 */
export function encodeLosslessJpeg(img, opts = {}) {
  const { width, height, data } = img;
  const nc = img.channels >= 3 ? 3 : 1;
  const step = img.channels;
  const P = opts.precision || 8;
  const mod = 2 ** P;
  // differences with predictor 1 (first line: left; first column: above)
  const n = width * height;
  const cats = new Uint8Array(n * nc);
  const diffs = new Int32Array(n * nc);
  const freq = new Array(257).fill(0);
  for (let k = 0; k < nc; k++) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const v = Math.min(mod - 1, data[i * step + k]);
      let pred;
      if (x === 0 && y === 0) pred = 1 << (P - 1);
      else if (y === 0) pred = data[(i - 1) * step + k];
      else if (x === 0) pred = data[(i - width) * step + k];
      else pred = data[(i - 1) * step + k];
      pred = Math.min(mod - 1, pred);
      let d = (v - pred) % 65536;
      if (d > 32768) d -= 65536; else if (d < -32767) d += 65536;
      const a = Math.abs(d);
      const t = d === 32768 ? 16 : a ? 32 - Math.clz32(a) : 0;
      cats[i * nc + k] = t; diffs[i * nc + k] = d;
      freq[t]++;
    }
  }
  const tab = optimalTable(freq);
  const code = new Int32Array(256), size = new Int32Array(256);
  { let c = 0, k = 0; for (let l = 1; l <= 16; l++) { for (let i = 0; i < tab.bits[l - 1]; i++) { code[tab.vals[k]] = c; size[tab.vals[k]] = l; k++; c++; } c <<= 1; } }
  const out = [];
  const u8 = (x) => out.push(x & 255);
  const u16 = (x) => { u8(x >> 8); u8(x); };
  u16(0xffd8);
  u16(0xffc3); u16(8 + 3 * nc); u8(P); u16(height); u16(width); u8(nc);
  for (let k = 0; k < nc; k++) { u8(k + 1); u8(0x11); u8(0); }
  u16(0xffc4); u16(19 + tab.vals.length); u8(0); for (const b of tab.bits) u8(b); for (const v of tab.vals) u8(v);
  u16(0xffda); u16(6 + 2 * nc); u8(nc);
  for (let k = 0; k < nc; k++) { u8(k + 1); u8(0); }
  u8(1); u8(0); u8(0); // predictor 1, Se = 0, Ah/Al = 0
  let bb = 0, bc = 0;
  const put = (v, s) => {
    for (let i = s - 1; i >= 0; i--) {
      bb = (bb << 1) | ((v >> i) & 1); bc++;
      if (bc === 8) { u8(bb); if (bb === 0xff) u8(0); bb = 0; bc = 0; }
    }
  };
  for (let i = 0; i < n; i++) for (let k = 0; k < nc; k++) {
    const t = cats[i * nc + k];
    put(code[t], size[t]);
    if (t && t < 16) { const d = diffs[i * nc + k]; put(d < 0 ? d - 1 + (1 << t) : d, t); }
  }
  if (bc) put((1 << (8 - bc)) - 1, 8 - bc);
  u16(0xffd9);
  return Uint8Array.from(out);
}
