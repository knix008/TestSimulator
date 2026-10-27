// JPEG codec: baseline and progressive Huffman decoding (any sampling
// factors, restart intervals, gray / YCbCr / RGB / CMYK / YCCK), baseline
// encoding (gray or YCbCr 4:4:4, quality 0..100).
import { cerr, makeRaster, be16, Out } from './common.js';

export const ZIGZAG = new Int32Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

// cos table for the 8-point (I)DCT: COS[x*8+u] = C(u) * cos((2x+1) u pi / 16) / 2
const COS = new Float64Array(64);
for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) COS[x * 8 + u] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) / 2;

function idctBlock(coef, off, q, out) {
  // out: Float64Array(64) row-major samples (level shifted + clamped later)
  const tmp = new Float64Array(64);
  const d = new Float64Array(64);
  for (let i = 0; i < 64; i++) d[i] = coef[off + i] * q[i];
  // rows (v index = row of coefficients)
  for (let v = 0; v < 8; v++) {
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * d[v * 8 + u];
      tmp[v * 8 + x] = s;
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let s = 0;
      for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * tmp[v * 8 + x];
      out[y * 8 + x] = s;
    }
  }
}

function fdctBlock(px, out) {
  // px: 64 level-shifted samples row-major; out: coefficients natural order
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += COS[x * 8 + u] * px[y * 8 + x]; tmp[y * 8 + u] = s; }
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += COS[y * 8 + v] * tmp[y * 8 + u]; out[v * 8 + u] = s; }
}

function buildHuffman(counts, values) {
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

function decodeScan(data, start, frame, comps, resetInterval, ss, se, ah, al) {
  let pos = start, bitsData = 0, bitsCount = 0, eobrun = 0;
  const progressive = frame.progressive;
  const readBit = () => {
    if (bitsCount > 0) { bitsCount--; return (bitsData >> bitsCount) & 1; }
    if (pos >= data.length) { bitsData = 0; bitsCount = 7; return 0; }
    bitsData = data[pos++];
    if (bitsData === 0xff) {
      const nx = data[pos];
      if (nx === 0) pos++;
      else { pos--; bitsData = 0; bitsCount = 7; return 0; } // marker: feed zeros
    }
    bitsCount = 7;
    return (bitsData >> 7) & 1;
  };
  const decodeHuff = (t) => {
    if (!t) throw cerr('jpg', 'missing Huffman table');
    let code = 0;
    for (let l = 1; l <= 16; l++) {
      code = (code << 1) | readBit();
      if (code <= t.maxcode[l]) return t.values[t.valptr[l] + code - t.mincode[l]];
    }
    return 0;
  };
  const receive = (n) => { let v = 0; while (n-- > 0) v = (v << 1) | readBit(); return v; };
  const extend = (n) => {
    if (n === 0) return 0;
    const v = receive(n);
    return v >= 1 << (n - 1) ? v : v - (1 << n) + 1;
  };

  const baseline = (c, off) => {
    const co = c.coeffs;
    const t = decodeHuff(c.dc);
    c.pred += t === 0 ? 0 : extend(t);
    co[off] = c.pred;
    for (let k = 1; k < 64;) {
      const rs = decodeHuff(c.ac); const s = rs & 15, r = rs >> 4;
      if (s === 0) { if (r < 15) break; k += 16; continue; }
      k += r;
      if (k > 63) break;
      co[off + ZIGZAG[k]] = extend(s);
      k++;
    }
  };
  const dcFirst = (c, off) => {
    const t = decodeHuff(c.dc);
    c.pred += t === 0 ? 0 : extend(t);
    c.coeffs[off] = c.pred * (1 << al);
  };
  const dcRefine = (c, off) => { if (readBit()) c.coeffs[off] |= 1 << al; };
  const acFirst = (c, off) => {
    if (eobrun > 0) { eobrun--; return; }
    const co = c.coeffs;
    for (let k = ss; k <= se;) {
      const rs = decodeHuff(c.ac); const s = rs & 15, r = rs >> 4;
      if (s === 0) {
        if (r < 15) { eobrun = (1 << r) - 1; if (r) eobrun += receive(r); break; }
        k += 16; continue;
      }
      k += r;
      if (k > 63) break;
      co[off + ZIGZAG[k]] = extend(s) * (1 << al);
      k++;
    }
  };
  const acRefine = (c, off) => {
    const co = c.coeffs;
    const p1 = 1 << al, m1 = -1 << al;
    let k = ss;
    if (eobrun <= 0) {
      for (; k <= se; k++) {
        const rs = decodeHuff(c.ac);
        let r = rs >> 4, s = rs & 15;
        if (s) s = readBit() ? p1 : m1;
        else if (r !== 15) { eobrun = 1 << r; if (r) eobrun += receive(r); break; }
        do {
          const z = off + ZIGZAG[k]; const v = co[z];
          if (v !== 0) { if (readBit() && (v & p1) === 0) co[z] = v >= 0 ? v + p1 : v + m1; } else if (--r < 0) break;
          k++;
        } while (k <= se);
        if (s && k <= se) co[off + ZIGZAG[k]] = s;
      }
    }
    if (eobrun > 0) {
      for (; k <= se; k++) {
        const z = off + ZIGZAG[k]; const v = co[z];
        if (v !== 0 && readBit() && (v & p1) === 0) co[z] = v >= 0 ? v + p1 : v + m1;
      }
      eobrun--;
    }
  };
  const fn = !progressive ? baseline : ss === 0 ? (ah === 0 ? dcFirst : dcRefine) : (ah === 0 ? acFirst : acRefine);

  const single = comps.length === 1;
  let total;
  if (single) { const c = comps[0]; total = c.blocksPerLine * c.blocksPerColumn; } else total = frame.mcusPerLine * frame.mcusPerColumn;
  const decodeMcu = (n) => {
    if (single) {
      const c = comps[0];
      const row = Math.floor(n / c.blocksPerLine), col = n % c.blocksPerLine;
      fn(c, (row * c.blocksPerLineForMcu + col) * 64);
      return;
    }
    const mr = Math.floor(n / frame.mcusPerLine), mc = n % frame.mcusPerLine;
    for (const c of comps) {
      for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) {
        const row = mr * c.v + v, col = mc * c.h + h;
        fn(c, (row * c.blocksPerLineForMcu + col) * 64);
      }
    }
  };
  let n = 0;
  const interval = resetInterval || total;
  while (n < total) {
    for (const c of comps) c.pred = 0;
    eobrun = 0;
    const lim = Math.min(total, n + interval);
    for (; n < lim; n++) decodeMcu(n);
    // find the next marker
    bitsCount = 0;
    while (pos < data.length && !(data[pos] === 0xff && data[pos + 1] !== 0 && data[pos + 1] !== 0xff)) pos++;
    if (pos >= data.length) break;
    const m = data[pos + 1];
    if (m >= 0xd0 && m <= 0xd7) pos += 2; else break;
  }
  bitsCount = 0;
  return pos;
}

/** Decodes a JPEG file. Returns a Raster (1, 3 or 4 channels, 8 bit) plus { progressive, colorSpace }. */
export function decodeJpeg(data) {
  if (data[0] !== 0xff || data[1] !== 0xd8) throw cerr('jpg', 'missing SOI marker');
  let pos = 2;
  const qt = [], dcT = [], acT = [];
  let frame = null, resetInterval = 0, adobe = null, jfif = false;
  const comments = [];
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
    if (marker >= 0xe0 && marker <= 0xef) {
      if (marker === 0xe0 && data[p] === 0x4a && data[p + 1] === 0x46 && data[p + 2] === 0x49 && data[p + 3] === 0x46) jfif = true;
      if (marker === 0xee && data[p] === 0x41 && data[p + 1] === 0x64 && data[p + 2] === 0x6f && data[p + 3] === 0x62 && data[p + 4] === 0x65) adobe = { transform: data[p + 11] };
    } else if (marker === 0xfe) {
      let s = ''; for (let i = p; i < end; i++) s += String.fromCharCode(data[i]); comments.push(s);
    } else if (marker === 0xdb) {
      while (p < end) {
        const pq = data[p] >> 4, tq = data[p] & 15; p++;
        const t = new Int32Array(64);
        for (let k = 0; k < 64; k++) { if (pq) { t[ZIGZAG[k]] = be16(data, p); p += 2; } else t[ZIGZAG[k]] = data[p++]; }
        qt[tq] = t;
      }
    } else if (marker === 0xc4) {
      while (p < end) {
        const tc = data[p] >> 4, th = data[p] & 15; p++;
        const counts = data.subarray(p, p + 16); p += 16;
        let n = 0; for (const c of counts) n += c;
        const vals = data.slice(p, p + n); p += n;
        (tc === 0 ? dcT : acT)[th] = buildHuffman(counts, vals);
      }
    } else if (marker === 0xdd) {
      resetInterval = be16(data, p);
    } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const precision = data[p];
      if (precision !== 8) throw cerr('jpg', `${precision}-bit samples are not supported`);
      const height = be16(data, p + 1), width = be16(data, p + 3), nc = data[p + 5];
      if (!width || !height) throw cerr('jpg', 'image size is zero');
      const comps = [];
      for (let i = 0; i < nc; i++) { const q = p + 6 + i * 3; comps.push({ id: data[q], h: data[q + 1] >> 4, v: data[q + 1] & 15, tq: data[q + 2] }); }
      const hmax = Math.max(...comps.map((c) => c.h)), vmax = Math.max(...comps.map((c) => c.v));
      const mcusPerLine = Math.ceil(width / (8 * hmax)), mcusPerColumn = Math.ceil(height / (8 * vmax));
      for (const c of comps) {
        c.blocksPerLine = Math.ceil(Math.ceil((width * c.h) / hmax) / 8);
        c.blocksPerColumn = Math.ceil(Math.ceil((height * c.v) / vmax) / 8);
        c.blocksPerLineForMcu = mcusPerLine * c.h;
        c.blocksPerColumnForMcu = mcusPerColumn * c.v;
        c.coeffs = new Int32Array(c.blocksPerLineForMcu * c.blocksPerColumnForMcu * 64);
        c.pred = 0;
      }
      frame = { width, height, comps, hmax, vmax, mcusPerLine, mcusPerColumn, progressive: marker === 0xc2 };
    } else if ((marker >= 0xc3 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      throw cerr('jpg', 'lossless, hierarchical and arithmetic-coded JPEG files are not supported');
    } else if (marker === 0xda) {
      if (!frame) throw cerr('jpg', 'scan before frame header');
      const ns = data[p++];
      const sc = [];
      for (let i = 0; i < ns; i++) {
        const id = data[p], t = data[p + 1]; p += 2;
        const c = frame.comps.find((x) => x.id === id);
        if (!c) throw cerr('jpg', 'unknown component in scan');
        c.dc = dcT[t >> 4]; c.ac = acT[t & 15];
        sc.push(c);
      }
      const ss = data[p], se = data[p + 1], ah = data[p + 2] >> 4, al = data[p + 2] & 15;
      pos = decodeScan(data, end, frame, sc, resetInterval, ss, se, ah, al);
      continue;
    }
    pos = end;
  }
  if (!frame) throw cerr('jpg', 'no frame found');
  const { width, height, comps, hmax, vmax } = frame;
  // IDCT into component planes
  const blk = new Float64Array(64);
  const planes = comps.map((c) => {
    const q = qt[c.tq] || new Int32Array(64).fill(1);
    const pw = c.blocksPerLineForMcu * 8, ph = c.blocksPerColumnForMcu * 8;
    const plane = new Uint8Array(pw * ph);
    for (let br = 0; br < c.blocksPerColumnForMcu; br++) {
      for (let bc = 0; bc < c.blocksPerLineForMcu; bc++) {
        idctBlock(c.coeffs, (br * c.blocksPerLineForMcu + bc) * 64, q, blk);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const v = Math.round(blk[y * 8 + x] + 128);
          plane[(br * 8 + y) * pw + bc * 8 + x] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }
    return { plane, pw, sx: c.h / hmax, sy: c.v / vmax, cw: Math.ceil((width * c.h) / hmax), ch: Math.ceil((height * c.v) / vmax) };
  });
  const nc = comps.length;
  const outCh = nc === 1 ? 1 : nc === 3 ? 3 : 4;
  const r = makeRaster(width, height, outCh, 8);
  let transform;
  if (nc === 3) transform = adobe ? adobe.transform !== 0 : !(comps[0].id === 0x52 && comps[1].id === 0x47 && comps[2].id === 0x42);
  else if (nc === 4) transform = adobe ? adobe.transform === 2 : false;
  const s = new Float64Array(nc);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < nc; k++) {
        const P = planes[k];
        if (P.sx === 1 && P.sy === 1) { s[k] = P.plane[y * P.pw + x]; continue; }
        // linear interpolation between centred samples (like "fancy" upsampling)
        const fx = Math.min(P.cw - 1, Math.max(0, (x + 0.5) * P.sx - 0.5)), fy = Math.min(P.ch - 1, Math.max(0, (y + 0.5) * P.sy - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(P.cw - 1, x0 + 1), y1 = Math.min(P.ch - 1, y0 + 1);
        const ax = fx - x0, ay = fy - y0;
        const p = P.plane, w = P.pw;
        s[k] = (p[y0 * w + x0] * (1 - ax) + p[y0 * w + x1] * ax) * (1 - ay) + (p[y1 * w + x0] * (1 - ax) + p[y1 * w + x1] * ax) * ay;
      }
      const o = (y * width + x) * outCh;
      if (nc === 1) { r.data[o] = s[0]; continue; }
      let a = s[0], b = s[1], c = s[2];
      if (transform) {
        const Y = s[0], cb = s[1] - 128, cr = s[2] - 128;
        a = Y + 1.402 * cr; b = Y - 0.344136 * cb - 0.714136 * cr; c = Y + 1.772 * cb;
      }
      const cl = (v) => { v = Math.round(v); return v < 0 ? 0 : v > 255 ? 255 : v; };
      if (nc === 3) { r.data[o] = cl(a); r.data[o + 1] = cl(b); r.data[o + 2] = cl(c); } else {
        // CMYK; Adobe files store inverted values
        const inv = !!adobe;
        const vals = [cl(a), cl(b), cl(c), s[3]];
        for (let k = 0; k < 4; k++) r.data[o + k] = inv ? 255 - vals[k] : vals[k];
      }
    }
  }
  r.progressive = frame.progressive;
  r.colorSpace = nc === 1 ? 'grayscale' : nc === 3 ? 'rgb' : 'cmyk';
  r.comments = comments;
  r.jfif = jfif;
  r.components = nc;
  return r;
}

/** Header information without decoding the scans. */
export function jpegInfo(data) {
  if (data[0] !== 0xff || data[1] !== 0xd8) throw cerr('jpg', 'missing SOI marker');
  let pos = 2;
  const info = { comments: [] };
  while (pos < data.length) {
    while (pos < data.length && data[pos] !== 0xff) pos++;
    while (pos < data.length && data[pos] === 0xff) pos++;
    const m = data[pos++];
    if (m === 0xd9 || m === 0xda) break;
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) continue;
    const len = be16(data, pos);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      info.bitDepth = data[pos + 2]; info.height = be16(data, pos + 3); info.width = be16(data, pos + 5); info.components = data[pos + 7];
      info.coding = m === 0xc2 ? 'progressive' : m === 0xc0 || m === 0xc1 ? 'baseline' : 'other';
    }
    if (m === 0xfe) { let s = ''; for (let i = pos + 2; i < pos + len; i++) s += String.fromCharCode(data[i]); info.comments.push(s); }
    pos += len;
  }
  return info;
}

// ---------------------------------------------------------------- encoder

const STD_LUM_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const STD_CHR_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
const DC_LUM_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_CHR_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LUM_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_LUM_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
const AC_CHR_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_CHR_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];

function huffCodes(bits, vals) {
  const code = new Int32Array(256), size = new Int32Array(256);
  let c = 0, k = 0;
  for (let l = 1; l <= 16; l++) { for (let i = 0; i < bits[l - 1]; i++) { code[vals[k]] = c; size[vals[k]] = l; k++; c++; } c <<= 1; }
  return { code, size };
}
function scaleQ(t, quality) {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const sc = q < 50 ? 5000 / q : 200 - 2 * q;
  return t.map((v) => Math.min(255, Math.max(1, Math.floor((v * sc + 50) / 100))));
}

/**
 * Encodes a baseline JPEG. img: { width, height, channels (1 or 3), data (8-bit interleaved) }.
 * opts: { quality = 75, comment }
 */
export function encodeJpeg(img, opts = {}) {
  const { width, height, data } = img;
  const ch = img.channels >= 3 ? 3 : 1;
  const quality = opts.quality ?? 75;
  const ql = scaleQ(STD_LUM_Q, quality), qc = scaleQ(STD_CHR_Q, quality);
  const out = new Out(width * height + 1024);
  out.be16(0xffd8);
  // JFIF APP0
  out.be16(0xffe0); out.be16(16); out.ascii('JFIF'); out.u8(0); out.u8(1); out.u8(1); out.u8(0); out.be16(1); out.be16(1); out.u8(0); out.u8(0);
  if (opts.comment) { const s = String(opts.comment); out.be16(0xfffe); out.be16(s.length + 2); out.ascii(s); }
  const writeDqt = (id, t) => { out.be16(0xffdb); out.be16(67); out.u8(id); for (let k = 0; k < 64; k++) out.u8(t[ZIGZAG[k]]); };
  writeDqt(0, ql);
  if (ch === 3) writeDqt(1, qc);
  out.be16(0xffc0); out.be16(8 + 3 * ch); out.u8(8); out.be16(height); out.be16(width); out.u8(ch);
  for (let i = 0; i < ch; i++) { out.u8(i + 1); out.u8(0x11); out.u8(i === 0 ? 0 : 1); }
  const writeDht = (cls, id, bits, vals) => { out.be16(0xffc4); out.be16(19 + vals.length); out.u8((cls << 4) | id); for (const b of bits) out.u8(b); for (const v of vals) out.u8(v); };
  writeDht(0, 0, DC_LUM_BITS, DC_VALS); writeDht(1, 0, AC_LUM_BITS, AC_LUM_VALS);
  if (ch === 3) { writeDht(0, 1, DC_CHR_BITS, DC_VALS); writeDht(1, 1, AC_CHR_BITS, AC_CHR_VALS); }
  out.be16(0xffda); out.be16(6 + 2 * ch); out.u8(ch);
  for (let i = 0; i < ch; i++) { out.u8(i + 1); out.u8(i === 0 ? 0x00 : 0x11); }
  out.u8(0); out.u8(63); out.u8(0);

  const tabs = [
    { dc: huffCodes(DC_LUM_BITS, DC_VALS), ac: huffCodes(AC_LUM_BITS, AC_LUM_VALS), q: ql },
    { dc: huffCodes(DC_CHR_BITS, DC_VALS), ac: huffCodes(AC_CHR_BITS, AC_CHR_VALS), q: qc },
  ];
  let bb = 0, bc = 0;
  const put = (code, size) => {
    for (let i = size - 1; i >= 0; i--) {
      bb = (bb << 1) | ((code >> i) & 1); bc++;
      if (bc === 8) { out.u8(bb); if (bb === 0xff) out.u8(0); bb = 0; bc = 0; }
    }
  };
  const cat = (v) => { let a = Math.abs(v), n = 0; while (a) { n++; a >>= 1; } return n; };
  const putVal = (v, n) => put(v < 0 ? (v - 1) & ((1 << n) - 1) : v, n);
  // colour conversion to planes
  const planes = [];
  for (let k = 0; k < ch; k++) planes.push(new Float64Array(width * height));
  for (let i = 0; i < width * height; i++) {
    if (ch === 1) { planes[0][i] = data[i * img.channels]; continue; }
    const R = data[i * img.channels], G = data[i * img.channels + 1], B = data[i * img.channels + 2];
    planes[0][i] = 0.299 * R + 0.587 * G + 0.114 * B;
    planes[1][i] = -0.168736 * R - 0.331264 * G + 0.5 * B + 128;
    planes[2][i] = 0.5 * R - 0.418688 * G - 0.081312 * B + 128;
  }
  const preds = new Int32Array(ch);
  const px = new Float64Array(64), co = new Float64Array(64), qz = new Int32Array(64);
  const bw = Math.ceil(width / 8), bh = Math.ceil(height / 8);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      for (let k = 0; k < ch; k++) {
        const P = planes[k];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const yy = Math.min(height - 1, by * 8 + y), xx = Math.min(width - 1, bx * 8 + x);
          px[y * 8 + x] = P[yy * width + xx] - 128;
        }
        fdctBlock(px, co);
        const T = tabs[k === 0 ? 0 : 1];
        for (let i = 0; i < 64; i++) { const v = Math.round(co[ZIGZAG[i]] / T.q[ZIGZAG[i]]); qz[i] = i ? Math.max(-1023, Math.min(1023, v)) : v; }
        const diff = qz[0] - preds[k]; preds[k] = qz[0];
        const dn = cat(diff);
        put(T.dc.code[dn], T.dc.size[dn]); if (dn) putVal(diff, dn);
        let run = 0;
        for (let i = 1; i < 64; i++) {
          const v = qz[i];
          if (v === 0) { run++; continue; }
          while (run > 15) { put(T.ac.code[0xf0], T.ac.size[0xf0]); run -= 16; }
          const n = Math.min(10, cat(v));
          const sym = (run << 4) | n;
          put(T.ac.code[sym], T.ac.size[sym]); putVal(v, n);
          run = 0;
        }
        if (run) put(T.ac.code[0], T.ac.size[0]);
      }
    }
  }
  if (bc) put((1 << (8 - bc)) - 1, 8 - bc);
  out.be16(0xffd9);
  return out.result();
}
