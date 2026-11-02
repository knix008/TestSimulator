// Audio file codecs besides RIFF WAV: Sun/NeXT AU (.au/.snd), AIFF / AIFF-C
// (.aif/.aiff/.aifc), FLAC (.flac, full decoder + fixed-predictor encoder),
// G.711 mu-law / A-law sample conversion, and big-endian WAV (RIFX).
//
// Every decoder returns a "decoded stream":
//   { format, compression, rate, channels, frames, bits, float, nativeCls,
//     get(frame, channel) → native sample, toDouble(x) → sample in [-1, 1],
//     info: { title, artist, comment } }
// Every encoder takes { channels, rate, frames, get, bits, float, info } where
// get(f, c) returns the sample already quantized for `bits` like the WAV
// writer does (8-bit values are offset-binary 0..255, others signed).
import { E, ByteWriter } from './util.js';

// ---------------------------------------------------------------- G.711

/** mu-law byte → linear 16-bit sample (ITU-T G.711). */
export function ulawToLinear(u) {
  const x = ~u & 0xff;
  const sign = x & 0x80, exp = (x >> 4) & 7, mant = x & 0x0f;
  const s = (((mant << 3) + 0x84) << exp) - 0x84;
  return sign ? -s : s;
}
/** linear 16-bit sample → mu-law byte (ITU-T G.711). */
export function linearToUlaw(v) {
  let x = Math.max(-32768, Math.min(32767, Math.round(v)));
  const sign = x < 0 ? 0x80 : 0;
  if (sign) x = -x;
  if (x > 32635) x = 32635;
  x += 0x84;
  let exp = 7;
  for (let mask = 0x4000; (x & mask) === 0 && exp > 0; mask >>= 1) exp--;
  const mant = (x >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mant) & 0xff;
}
/** A-law byte → linear 16-bit sample (ITU-T G.711). */
export function alawToLinear(a0) {
  const a = a0 ^ 0x55;
  let t = (a & 0x0f) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) t += 8;
  else if (seg === 1) t += 0x108;
  else { t += 0x108; t <<= seg - 1; }
  return a & 0x80 ? t : -t;
}
/** linear 16-bit sample → A-law byte (ITU-T G.711). */
export function linearToAlaw(v) {
  let x = Math.max(-32768, Math.min(32767, Math.round(v)));
  let mask;
  if (x >= 0) mask = 0xd5; else { mask = 0x55; x = -x - 1; }
  const ends = [0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff, 0x7fff];
  let seg = 0;
  while (seg < 8 && x > ends[seg]) seg++;
  if (seg >= 8) return 0x7f ^ mask;
  let aval = seg << 4;
  aval |= seg < 2 ? (x >> 4) & 0x0f : (x >> (seg + 3)) & 0x0f;
  return aval ^ mask;
}

// ---------------------------------------------------------------- shared helpers

const tagAt = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const pcmToDouble = (bits) => (x) => x / 2 ** (bits - 1);
const nativeOfBits = (bits) => (bits <= 8 ? 'int8' : bits <= 16 ? 'int16' : 'int32');

/** Signed integer quantized value from the writer's convention (8-bit offset binary). */
const signedOf = (bits) => (bits === 8 ? (x) => x - 128 : (x) => x);

function pcmGetter(dv, bytes, start, channels, bits, le) {
  const bps = bits >> 3;
  switch (bits) {
    case 8: return (f, c) => dv.getInt8(start + f * channels + c);
    case 16: return (f, c) => dv.getInt16(start + (f * channels + c) * 2, le);
    case 24: return (f, c) => {
      const o = start + (f * channels + c) * 3;
      const v = le ? bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) : (bytes[o] << 16) | (bytes[o + 1] << 8) | bytes[o + 2];
      return v & 0x800000 ? v - 0x1000000 : v;
    };
    case 32: return (f, c) => dv.getInt32(start + (f * channels + c) * 4, le);
    default: void bps; throw E('io:audioread:unsupported', `PCM audio with ${bits} bits per sample is not supported.`);
  }
}

function writePcm(out, x, bits, le) {
  switch (bits) {
    case 8: out.u8(x & 255); break;
    case 16: out.i16(x, le); break;
    case 24: {
      const v = x < 0 ? x + 0x1000000 : x;
      if (le) { out.u8(v & 255); out.u8((v >> 8) & 255); out.u8((v >> 16) & 255); } else { out.u8((v >> 16) & 255); out.u8((v >> 8) & 255); out.u8(v & 255); }
      break;
    }
    default: out.i32(x, le);
  }
}

// ---------------------------------------------------------------- RIFX (big-endian WAV)

export function decodeRifx(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 12 || tagAt(b, 0) !== 'RIFX' || tagAt(b, 8) !== 'WAVE') throw E('io:audioread:notWav', 'The file is not a big-endian WAV (RIFX) file.');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = tagAt(b, p), size = dv.getUint32(p + 4, false), body = p + 8;
    if (id === 'fmt ') {
      let format = dv.getUint16(body, false);
      if (format === 0xfffe && size >= 40) format = dv.getUint16(body + 24, false);
      fmt = { format, channels: dv.getUint16(body + 2, false), rate: dv.getUint32(body + 4, false), bits: dv.getUint16(body + 14, false) };
    } else if (id === 'data') data = { start: body, size: Math.min(size, b.length - body) };
    p = body + size + (size & 1);
  }
  if (!fmt || !data) throw E('io:audioread:corrupt', 'The RIFX file has no format or data chunk.');
  return fromCodec(dv, b, data.start, data.size, fmt.channels, fmt.rate, fmt.bits, fmt.format === 3 ? 'float' : fmt.format === 7 ? 'ulaw' : fmt.format === 6 ? 'alaw' : fmt.format === 1 ? 'pcm' : null, false, 'WAV', {});
}

/** Builds a decoded stream for raw interleaved samples of a codec. */
function fromCodec(dv, b, start, size, channels, rate, bits, codec, le, format, info) {
  if (!codec) throw E('io:audioread:unsupported', 'The audio encoding of the file is not supported.');
  if (!channels) throw E('io:audioread:corrupt', 'The audio file has no channels.');
  if (codec === 'ulaw' || codec === 'alaw') {
    const dec = codec === 'ulaw' ? ulawToLinear : alawToLinear;
    return {
      format, compression: codec === 'ulaw' ? 'mu-law' : 'A-law', rate, channels, frames: Math.floor(size / channels), bits: 8, float: false, nativeCls: 'int16',
      get: (f, c) => dec(b[start + f * channels + c]), toDouble: (x) => x / 32768, info,
    };
  }
  if (codec === 'float') {
    if (bits !== 32 && bits !== 64) throw E('io:audioread:unsupported', `Floating-point audio with ${bits} bits is not supported.`);
    const k = bits >> 3;
    return {
      format, compression: 'Uncompressed', rate, channels, frames: Math.floor(size / (k * channels)), bits, float: true, nativeCls: bits === 32 ? 'single' : 'double',
      get: bits === 32 ? (f, c) => dv.getFloat32(start + (f * channels + c) * 4, le) : (f, c) => dv.getFloat64(start + (f * channels + c) * 8, le),
      toDouble: (x) => x, info,
    };
  }
  const cb = Math.ceil(bits / 8) * 8;
  const k = cb >> 3;
  const raw = pcmGetter(dv, b, start, channels, cb, le);
  // samples narrower than their container (e.g. 12 bits in 16) are left-justified
  const shift = cb - bits;
  const get = shift ? (f, c) => Math.floor(raw(f, c) / 2 ** shift) : raw;
  return {
    format, compression: 'Uncompressed', rate, channels, frames: Math.floor(size / (k * channels)), bits, float: false, nativeCls: nativeOfBits(bits),
    get, toDouble: pcmToDouble(bits), info,
  };
}

// ---------------------------------------------------------------- AU / SND

const AU_ENC = { 1: ['ulaw', 8], 2: ['pcm', 8], 3: ['pcm', 16], 4: ['pcm', 24], 5: ['pcm', 32], 6: ['float', 32], 7: ['float', 64], 27: ['alaw', 8] };

export function decodeAu(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 24 || tagAt(b, 0) !== '.snd') throw E('io:audioread:notAu', 'The file is not an AU (.snd) file.');
  const offset = dv.getUint32(4, false);
  let size = dv.getUint32(8, false);
  const enc = dv.getUint32(12, false), rate = dv.getUint32(16, false), channels = dv.getUint32(20, false);
  if (size === 0xffffffff || offset + size > b.length) size = b.length - offset;
  const e = AU_ENC[enc];
  if (!e) throw E('io:audioread:unsupported', `AU encoding ${enc} is not supported.`);
  let note = '';
  for (let i = 24; i < Math.min(offset, b.length) && b[i]; i++) note += String.fromCharCode(b[i]);
  return fromCodec(dv, b, offset, size, channels, rate, e[1], e[0], false, 'AU', { comment: note });
}

export function encodeAu({ channels, rate, frames, get, bits, float, info, codec }) {
  const enc = codec === 'ulaw' ? 1 : codec === 'alaw' ? 27 : float ? (bits === 64 ? 7 : 6) : { 8: 2, 16: 3, 24: 4, 32: 5 }[bits];
  const note = [info && info.title, info && info.artist, info && info.comment].filter(Boolean).join(' ');
  let noteLen = note.length + 1; while ((24 + noteLen) % 8) noteLen++;
  const per = codec ? 1 : bits >> 3;
  const out = new ByteWriter(24 + noteLen + frames * channels * per);
  out.ascii('.snd'); out.u32(24 + noteLen, false); out.u32(frames * channels * per, false); out.u32(enc, false); out.u32(rate, false); out.u32(channels, false);
  out.ascii(note); for (let i = note.length; i < noteLen; i++) out.u8(0);
  const s = signedOf(bits);
  for (let f = 0; f < frames; f++) for (let c = 0; c < channels; c++) {
    const x = get(f, c);
    if (codec === 'ulaw') out.u8(linearToUlaw(x));
    else if (codec === 'alaw') out.u8(linearToAlaw(x));
    else if (float) { if (bits === 32) out.f32(x, false); else out.f64(x, false); } else writePcm(out, s(x), bits, false);
  }
  return out.result();
}

// ---------------------------------------------------------------- AIFF / AIFF-C

function readExtended(b, o) {
  const exp = ((b[o] & 0x7f) << 8) | b[o + 1];
  const hi = ((b[o + 2] << 24) >>> 0) + (b[o + 3] << 16) + (b[o + 4] << 8) + b[o + 5];
  const lo = ((b[o + 6] << 24) >>> 0) + (b[o + 7] << 16) + (b[o + 8] << 8) + b[o + 9];
  if (!exp && !hi && !lo) return 0;
  const v = (hi * 2 ** 32 + lo) * 2 ** (exp - 16383 - 63);
  return b[o] & 0x80 ? -v : v;
}
function writeExtended(out, x) {
  if (!x) { for (let i = 0; i < 10; i++) out.u8(0); return; }
  const e = Math.floor(Math.log2(x));
  const m = x / 2 ** e; // 1 <= m < 2
  const hi = Math.floor(m * 2 ** 31);
  const lo = Math.round((m * 2 ** 31 - hi) * 2 ** 32);
  out.u16(e + 16383, false); out.u32(hi, false); out.u32(lo, false);
}

export function decodeAiff(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 12 || tagAt(b, 0) !== 'FORM' || (tagAt(b, 8) !== 'AIFF' && tagAt(b, 8) !== 'AIFC')) throw E('io:audioread:notAiff', 'The file is not an AIFF file.');
  const aifc = tagAt(b, 8) === 'AIFC';
  let p = 12, comm = null, ssnd = null;
  const info = {};
  const textOf = (o, n) => { let s = ''; for (let i = 0; i < n && b[o + i]; i++) s += String.fromCharCode(b[o + i]); return s; };
  while (p + 8 <= b.length) {
    const id = tagAt(b, p), size = dv.getUint32(p + 4, false), body = p + 8;
    if (id === 'COMM') {
      comm = { channels: dv.getInt16(body, false), frames: dv.getUint32(body + 2, false), bits: dv.getInt16(body + 6, false), rate: readExtended(b, body + 8), comp: aifc ? tagAt(b, body + 18) : 'NONE' };
    } else if (id === 'SSND') {
      const off = dv.getUint32(body, false);
      ssnd = { start: body + 8 + off, size: Math.min(size - 8 - off, b.length - body - 8 - off) };
    } else if (id === 'NAME') info.title = textOf(body, size);
    else if (id === 'AUTH') info.artist = textOf(body, size);
    else if (id === 'ANNO') info.comment = textOf(body, size);
    p = body + size + (size & 1);
  }
  if (!comm) throw E('io:audioread:corrupt', 'The AIFF file has no COMM chunk.');
  if (!ssnd) ssnd = { start: b.length, size: 0 };
  const c = comm.comp;
  let codec = null, le = false, bits = comm.bits;
  if (c === 'NONE' || c === 'twos') codec = 'pcm';
  else if (c === 'sowt') { codec = 'pcm'; le = true; } else if (c === 'fl32' || c === 'FL32') { codec = 'float'; bits = 32; } else if (c === 'fl64' || c === 'FL64') { codec = 'float'; bits = 64; } else if (c === 'ulaw' || c === 'ULAW') codec = 'ulaw';
  else if (c === 'alaw' || c === 'ALAW') codec = 'alaw';
  else throw E('io:audioread:unsupported', `AIFF-C compression '${c}' is not supported.`);
  const s = fromCodec(dv, b, ssnd.start, ssnd.size, comm.channels, Math.round(comm.rate), bits, codec, le, aifc ? 'AIFC' : 'AIFF', info);
  s.frames = Math.min(s.frames, comm.frames);
  return s;
}

export function encodeAiff({ channels, rate, frames, get, bits, float, info, codec }) {
  const aifc = float || !!codec;
  const per = codec ? 1 : bits >> 3;
  const dataSize = frames * channels * per;
  const chunks = [];
  const textChunk = (id, s) => { if (s) chunks.push([id, s]); };
  textChunk('NAME', info && info.title); textChunk('AUTH', info && info.artist); textChunk('ANNO', info && info.comment);
  const out = new ByteWriter(64 + dataSize);
  out.ascii('FORM'); out.u32(0, false); out.ascii(aifc ? 'AIFC' : 'AIFF');
  if (aifc) { out.ascii('FVER'); out.u32(4, false); out.u32(0xa2805140, false); }
  const comp = codec === 'ulaw' ? ['ulaw', '\x07µLaw 2:1'] : codec === 'alaw' ? ['alaw', '\x08ALaw 2:1'] : float ? [bits === 64 ? 'fl64' : 'fl32', '\x0cIEEE float32'] : null;
  const compName = comp ? comp[1].replace('µ', 'u') : '';
  let commSize = 18;
  if (aifc) { commSize += 4 + compName.length; if (compName.length & 1) commSize++; }
  out.ascii('COMM'); out.u32(commSize, false); out.u16(channels, false); out.u32(frames, false); out.u16(codec ? 16 : bits, false); writeExtended(out, rate);
  if (aifc) { out.ascii(comp[0]); out.ascii(compName); if (compName.length & 1) out.u8(0); }
  for (const [id, s] of chunks) { out.ascii(id); out.u32(s.length, false); out.ascii(s); if (s.length & 1) out.u8(0); }
  out.ascii('SSND'); out.u32(dataSize + 8, false); out.u32(0, false); out.u32(0, false);
  const sg = signedOf(bits);
  for (let f = 0; f < frames; f++) for (let c = 0; c < channels; c++) {
    const x = get(f, c);
    if (codec === 'ulaw') out.u8(linearToUlaw(x));
    else if (codec === 'alaw') out.u8(linearToAlaw(x));
    else if (float) { if (bits === 32) out.f32(x, false); else out.f64(x, false); } else writePcm(out, sg(x), bits, false);
  }
  if (dataSize & 1) out.u8(0);
  const r = out.result();
  new DataView(r.buffer).setUint32(4, r.length - 8, false);
  return r;
}

// ---------------------------------------------------------------- FLAC: bit I/O

class BitReader {
  constructor(b, pos = 0) { this.b = b; this.pos = pos; this.bit = 0; }
  u(n) {
    let v = 0;
    while (n > 0) {
      if (this.pos >= this.b.length) throw E('io:audioread:corrupt', 'The FLAC stream ends unexpectedly.');
      const avail = 8 - this.bit;
      const take = Math.min(avail, n);
      const bits = (this.b[this.pos] >> (avail - take)) & ((1 << take) - 1);
      v = v * (1 << take) + bits;
      n -= take; this.bit += take;
      if (this.bit === 8) { this.bit = 0; this.pos++; }
    }
    return v;
  }
  s(n) { if (!n) return 0; const v = this.u(n); return v >= 2 ** (n - 1) ? v - 2 ** n : v; }
  unary() {
    let n = 0;
    for (;;) {
      if (this.pos >= this.b.length) throw E('io:audioread:corrupt', 'The FLAC stream ends unexpectedly.');
      if (this.bit === 0 && this.b[this.pos] === 0) { n += 8; this.pos++; continue; }
      if (this.u(1)) return n;
      n++;
    }
  }
  align() { if (this.bit) { this.bit = 0; this.pos++; } }
}

class BitWriter {
  constructor(cap = 4096) { this.buf = new Uint8Array(cap); this.len = 0; this.acc = 0; this.n = 0; }
  byte(x) { if (this.len >= this.buf.length) { const b = new Uint8Array(this.buf.length * 2); b.set(this.buf); this.buf = b; } this.buf[this.len++] = x; }
  u(v, n) {
    // writes the n low bits of v (n <= 32, v >= 0)
    for (let i = n - 1; i >= 0; i--) {
      const bit = Math.floor(v / 2 ** i) & 1;
      this.acc = (this.acc << 1) | bit;
      if (++this.n === 8) { this.byte(this.acc); this.acc = 0; this.n = 0; }
    }
  }
  s(v, n) { this.u(v < 0 ? v + 2 ** n : v, n); }
  zeros(k) { for (let i = 0; i < k; i++) { this.acc <<= 1; if (++this.n === 8) { this.byte(this.acc & 255); this.acc = 0; this.n = 0; } } }
  align() { if (this.n) { this.byte((this.acc << (8 - this.n)) & 255); this.acc = 0; this.n = 0; } }
  result() { return this.buf.slice(0, this.len); }
}

const CRC8 = (() => { const t = new Uint8Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; t[i] = c; } return t; })();
const CRC16 = (() => { const t = new Uint16Array(256); for (let i = 0; i < 256; i++) { let c = i << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff; t[i] = c; } return t; })();
const crc8 = (b, a, z) => { let c = 0; for (let i = a; i < z; i++) c = CRC8[c ^ b[i]]; return c; };
const crc16 = (b, a, z) => { let c = 0; for (let i = a; i < z; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b[i]]; return c; };

// ---------------------------------------------------------------- FLAC: decoder

const FLAC_RATES = [0, 88200, 176400, 192000, 8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000];
const FLAC_BITS = [0, 8, 12, 0, 16, 20, 24, 32];

function readResidual(r, out, blockSize, order) {
  const method = r.u(2);
  if (method > 1) throw E('io:audioread:corrupt', 'Unknown FLAC residual coding method.');
  const pbits = method === 0 ? 4 : 5, escape = method === 0 ? 15 : 31;
  const porder = r.u(4);
  const parts = 1 << porder;
  let i = order;
  for (let p = 0; p < parts; p++) {
    const n = (blockSize >> porder) - (p === 0 ? order : 0);
    const k = r.u(pbits);
    if (k === escape) {
      const nb = r.u(5);
      for (let j = 0; j < n; j++) out[i++] = r.s(nb);
    } else {
      for (let j = 0; j < n; j++) {
        const q = r.unary();
        const v = q * 2 ** k + (k ? r.u(k) : 0);
        out[i++] = v % 2 === 1 ? -(v + 1) / 2 : v / 2;
      }
    }
  }
}

function readSubframe(r, blockSize, bps) {
  if (r.u(1)) throw E('io:audioread:corrupt', 'Bad FLAC subframe header.');
  const type = r.u(6);
  let wasted = 0;
  if (r.u(1)) wasted = r.unary() + 1;
  const bits = bps - wasted;
  const s = new Float64Array(blockSize);
  if (type === 0) { s.fill(r.s(bits)); } else if (type === 1) { for (let i = 0; i < blockSize; i++) s[i] = r.s(bits); } else if (type >= 8 && type <= 12) {
    const order = type & 7;
    for (let i = 0; i < order; i++) s[i] = r.s(bits);
    readResidual(r, s, blockSize, order);
    for (let i = order; i < blockSize; i++) {
      switch (order) {
        case 1: s[i] += s[i - 1]; break;
        case 2: s[i] += 2 * s[i - 1] - s[i - 2]; break;
        case 3: s[i] += 3 * s[i - 1] - 3 * s[i - 2] + s[i - 3]; break;
        case 4: s[i] += 4 * s[i - 1] - 6 * s[i - 2] + 4 * s[i - 3] - s[i - 4]; break;
        default: break;
      }
    }
  } else if (type >= 32) {
    const order = (type & 31) + 1;
    for (let i = 0; i < order; i++) s[i] = r.s(bits);
    const prec = r.u(4) + 1;
    if (prec === 16) throw E('io:audioread:corrupt', 'Bad FLAC LPC precision.');
    const shift = r.s(5);
    const coef = new Float64Array(order);
    for (let j = 0; j < order; j++) coef[j] = r.s(prec);
    readResidual(r, s, blockSize, order);
    const div = 2 ** Math.max(0, shift);
    for (let i = order; i < blockSize; i++) {
      let sum = 0;
      for (let j = 0; j < order; j++) sum += coef[j] * s[i - 1 - j];
      s[i] += Math.floor(sum / div);
    }
  } else throw E('io:audioread:corrupt', `Reserved FLAC subframe type ${type}.`);
  if (wasted) for (let i = 0; i < blockSize; i++) s[i] *= 2 ** wasted;
  return s;
}

function readUtf8Number(r) {
  const x = r.u(8);
  let n, v;
  if (x < 0x80) return x;
  if (x >= 0xfe) { n = 6; v = 0; } else if (x >= 0xfc) { n = 5; v = x & 1; } else if (x >= 0xf8) { n = 4; v = x & 3; } else if (x >= 0xf0) { n = 3; v = x & 7; } else if (x >= 0xe0) { n = 2; v = x & 15; } else if (x >= 0xc0) { n = 1; v = x & 31; } else throw E('io:audioread:corrupt', 'Bad FLAC frame number.');
  for (let i = 0; i < n; i++) v = v * 64 + (r.u(8) & 63);
  return v;
}

export function decodeFlac(b) {
  let p = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) { // ID3v2 tag in front
    const sz = ((b[6] & 127) << 21) | ((b[7] & 127) << 14) | ((b[8] & 127) << 7) | (b[9] & 127);
    p = 10 + sz;
  }
  if (tagAt(b, p) !== 'fLaC') throw E('io:audioread:notFlac', 'The file is not a FLAC file.');
  p += 4;
  let si = null;
  const info = {};
  for (let last = false; !last && p + 4 <= b.length;) {
    last = !!(b[p] & 0x80);
    const type = b[p] & 0x7f, len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    const body = p + 4;
    if (type === 0) {
      const r = new BitReader(b, body);
      si = { minBlock: r.u(16), maxBlock: r.u(16) }; r.u(24); r.u(24);
      si.rate = r.u(20); si.channels = r.u(3) + 1; si.bits = r.u(5) + 1; si.total = r.u(36);
    } else if (type === 4) {
      const dv = new DataView(b.buffer, b.byteOffset + body, len);
      let q = 0; const vl = dv.getUint32(q, true); q += 4 + vl;
      const count = dv.getUint32(q, true); q += 4;
      for (let i = 0; i < count && q + 4 <= len; i++) {
        const l = dv.getUint32(q, true); q += 4;
        const text = new TextDecoder().decode(b.subarray(body + q, body + q + l)); q += l;
        const eq = text.indexOf('=');
        if (eq > 0) {
          const k = text.slice(0, eq).toUpperCase(), v = text.slice(eq + 1);
          if (k === 'TITLE') info.title = v; else if (k === 'ARTIST') info.artist = v; else if (k === 'COMMENT' || k === 'DESCRIPTION') info.comment = v;
        }
      }
    }
    p = body + len;
  }
  if (!si) throw E('io:audioread:corrupt', 'The FLAC file has no STREAMINFO block.');
  const chans = Array.from({ length: si.channels }, () => []);
  let frames = 0;
  while (p + 2 <= b.length) {
    if (b[p] !== 0xff || (b[p + 1] & 0xfe) !== 0xf8) { p++; continue; }
    const start = p;
    const r = new BitReader(b, p);
    r.u(16);
    const bsCode = r.u(4), rateCode = r.u(4), chAssign = r.u(4), sizeCode = r.u(3); r.u(1);
    readUtf8Number(r);
    let blockSize;
    if (bsCode === 1) blockSize = 192;
    else if (bsCode >= 2 && bsCode <= 5) blockSize = 576 << (bsCode - 2);
    else if (bsCode === 6) blockSize = r.u(8) + 1;
    else if (bsCode === 7) blockSize = r.u(16) + 1;
    else if (bsCode >= 8) blockSize = 256 << (bsCode - 8);
    else { p++; continue; }
    if (rateCode === 12) r.u(8); else if (rateCode === 13 || rateCode === 14) r.u(16);
    const hdrEnd = r.pos;
    if (crc8(b, start, hdrEnd) !== b[hdrEnd]) { p++; continue; }
    r.pos = hdrEnd + 1; r.bit = 0;
    const bps = sizeCode === 0 ? si.bits : FLAC_BITS[sizeCode];
    const nch = chAssign < 8 ? chAssign + 1 : 2;
    const sub = [];
    for (let c = 0; c < nch; c++) {
      const side = (chAssign === 8 && c === 1) || (chAssign === 9 && c === 0) || (chAssign === 10 && c === 1);
      sub.push(readSubframe(r, blockSize, bps + (side ? 1 : 0)));
    }
    r.align();
    r.u(16); // CRC-16 of the frame
    if (chAssign >= 8) {
      const [a, s] = sub;
      for (let i = 0; i < blockSize; i++) {
        if (chAssign === 8) s[i] = a[i] - s[i];
        else if (chAssign === 9) { const right = s[i]; sub[0][i] = a[i] + right; }
        else { const side = s[i]; const mid = a[i] * 2 + (Math.abs(side) % 2); a[i] = (mid + side) / 2; s[i] = (mid - side) / 2; }
      }
    }
    for (let c = 0; c < Math.min(nch, si.channels); c++) chans[c].push(sub[c]);
    frames += blockSize;
    p = r.pos;
  }
  const total = si.total || frames;
  const data = chans.map((list) => { const a = new Float64Array(frames); let o = 0; for (const s of list) { a.set(s, o); o += s.length; } return a; });
  return {
    format: 'FLAC', compression: 'FLAC', rate: si.rate, channels: si.channels, frames: Math.min(total, frames), bits: si.bits, float: false, nativeCls: nativeOfBits(si.bits),
    get: (f, c) => data[c][f], toDouble: pcmToDouble(si.bits), info,
  };
}

// ---------------------------------------------------------------- FLAC: encoder

const FLAC_BLOCK = 4096;

function riceBits(res, from, to, k) {
  let n = 0;
  for (let i = from; i < to; i++) { const v = res[i]; const u = v < 0 ? -2 * v - 1 : 2 * v; n += Math.floor(u / 2 ** k) + 1 + k; }
  return n;
}
function bestRice(res, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) { const v = res[i]; sum += v < 0 ? -2 * v - 1 : 2 * v; }
  const n = to - from;
  let k0 = n ? Math.max(0, Math.floor(Math.log2(Math.max(1, sum / n)))) : 0;
  k0 = Math.min(k0, 30);
  let best = k0, bestBits = riceBits(res, from, to, k0);
  for (const k of [k0 - 1, k0 + 1]) { if (k < 0 || k > 30) continue; const bb = riceBits(res, from, to, k); if (bb < bestBits) { best = k; bestBits = bb; } }
  return [best, bestBits];
}
/** Best partition order and parameters for a residual (orders 0..maxOrder). */
function planResidual(res, n, order) {
  let best = null;
  for (let po = 0; po <= 6; po++) {
    if ((n >> po) << po !== n || (n >> po) <= order) break;
    const parts = [];
    let bits = 6;
    for (let p = 0; p < 1 << po; p++) {
      const from = p === 0 ? order : p * (n >> po), to = (p + 1) * (n >> po);
      const [k, bb] = bestRice(res, from, to);
      parts.push(k); bits += 5 + bb;
    }
    if (!best || bits < best.bits) best = { po, parts, bits };
  }
  return best;
}

function encodeSubframe(w, s, n, bps) {
  let constant = true;
  for (let i = 1; i < n; i++) if (s[i] !== s[0]) { constant = false; break; }
  if (constant) { w.u(0, 1); w.u(0, 6); w.u(0, 1); w.s(s[0], bps); return; }
  let best = { order: -1, bits: n * bps };
  const res = new Float64Array(n);
  for (let order = 0; order <= Math.min(4, n - 1); order++) {
    for (let i = order; i < n; i++) {
      switch (order) {
        case 0: res[i] = s[i]; break;
        case 1: res[i] = s[i] - s[i - 1]; break;
        case 2: res[i] = s[i] - 2 * s[i - 1] + s[i - 2]; break;
        case 3: res[i] = s[i] - 3 * s[i - 1] + 3 * s[i - 2] - s[i - 3]; break;
        default: res[i] = s[i] - 4 * s[i - 1] + 6 * s[i - 2] - 4 * s[i - 3] + s[i - 4];
      }
    }
    const plan = planResidual(res, n, order);
    if (!plan) continue;
    const bits = order * bps + plan.bits;
    if (bits < best.bits) best = { order, bits, plan, res: res.slice() };
  }
  if (best.order < 0) { w.u(0, 1); w.u(1, 6); w.u(0, 1); for (let i = 0; i < n; i++) w.s(s[i], bps); return; }
  const { order, plan, res: r } = best;
  w.u(0, 1); w.u(8 + order, 6); w.u(0, 1);
  for (let i = 0; i < order; i++) w.s(s[i], bps);
  w.u(1, 2); w.u(plan.po, 4); // 5-bit Rice parameters
  for (let p = 0; p < 1 << plan.po; p++) {
    const k = plan.parts[p];
    w.u(k, 5);
    const from = p === 0 ? order : p * (n >> plan.po), to = (p + 1) * (n >> plan.po);
    for (let i = from; i < to; i++) {
      const v = r[i]; const u = v < 0 ? -2 * v - 1 : 2 * v;
      const q = Math.floor(u / 2 ** k);
      w.zeros(q); w.u(1, 1);
      if (k) w.u(u % 2 ** k, k);
    }
  }
}

function utf8Number(v) {
  if (v < 0x80) return [v];
  let n = 1;
  while (v >= 2 ** (6 * n + 6 - n)) n++;
  const out = [];
  for (let i = 0; i < n; i++) { out.unshift(0x80 | (v % 64)); v = Math.floor(v / 64); }
  out.unshift(((0xff << (7 - n)) & 0xff) | v);
  return out;
}

export function encodeFlac({ channels, rate, frames, get, bits, info }) {
  if (![8, 16, 24].includes(bits)) throw E('io:audiowrite:badBits', 'FLAC files can have 8, 16 or 24 bits per sample.');
  if (channels > 8) throw E('io:audiowrite:tooManyChannels', 'FLAC files can have at most 8 channels.');
  if (rate > 655350) throw E('io:audiowrite:badRate', 'The sample rate is too high for FLAC.');
  const sg = signedOf(bits);
  const w = new BitWriter(1024 + frames * channels * (bits >> 3));
  for (const ch of 'fLaC') w.u(ch.charCodeAt(0), 8);
  const tags = [];
  if (info && info.title) tags.push('TITLE=' + info.title);
  if (info && info.artist) tags.push('ARTIST=' + info.artist);
  if (info && info.comment) tags.push('COMMENT=' + info.comment);
  // STREAMINFO
  w.u(tags.length ? 0 : 0x80, 8); w.u(34, 24);
  const bs = Math.min(FLAC_BLOCK, Math.max(16, frames));
  w.u(bs, 16); w.u(bs, 16); w.u(0, 24); w.u(0, 24);
  w.u(rate, 20); w.u(channels - 1, 3); w.u(bits - 1, 5); w.u(frames, 36);
  for (let i = 0; i < 16; i++) w.u(0, 8); // MD5 not computed (allowed by the format)
  if (tags.length) {
    const enc = new TextEncoder();
    const vendor = enc.encode('MySimulationMath');
    const items = tags.map((t) => enc.encode(t));
    const len = 4 + vendor.length + 4 + items.reduce((a, x) => a + 4 + x.length, 0);
    w.u(0x84, 8); w.u(len, 24);
    const le32 = (x) => { w.u(x & 255, 8); w.u((x >> 8) & 255, 8); w.u((x >> 16) & 255, 8); w.u((x >>> 24) & 255, 8); };
    le32(vendor.length); for (const x of vendor) w.u(x, 8);
    le32(items.length); for (const it of items) { le32(it.length); for (const x of it) w.u(x, 8); }
  }
  const sizeCode = { 8: 1, 16: 4, 24: 6 }[bits];
  let frameNo = 0;
  for (let f0 = 0; f0 < frames; f0 += bs, frameNo++) {
    const n = Math.min(bs, frames - f0);
    const start = w.len;
    w.u(0xfff8, 16); w.u(7, 4); w.u(0, 4); w.u(channels - 1, 4); w.u(sizeCode, 3); w.u(0, 1);
    for (const x of utf8Number(frameNo)) w.u(x, 8);
    w.u(n - 1, 16);
    w.byte(crc8(w.buf, start, w.len));
    for (let c = 0; c < channels; c++) {
      const s = new Float64Array(n);
      for (let i = 0; i < n; i++) s[i] = sg(get(f0 + i, c));
      encodeSubframe(w, s, n, bits);
    }
    w.align();
    const crc = crc16(w.buf, start, w.len);
    w.byte(crc >> 8); w.byte(crc & 255);
  }
  return w.result();
}
