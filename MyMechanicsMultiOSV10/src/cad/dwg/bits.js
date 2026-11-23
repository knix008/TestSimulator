// DWG bit codes (Open Design Specification for .dwg files, chapter 2): a reader and a writer of the bit-level forms
// (B, BB, 3B, BS, BL, BLL, BD, DD, RC, RS, RL, RD, MC, MS, H, T/TU, BE, BT, CMC), and the two CRCs.
// Little-endian throughout; bits are taken from the most significant bit of each byte first.

export const R2000 = 15, R2004 = 18, R2007 = 21, R2010 = 24, R2013 = 27, R2018 = 32;
export const VERSIONS = { AC1012: 13, AC1014: 14, AC1015: R2000, AC1018: R2004, AC1021: R2007, AC1024: R2010, AC1027: R2013, AC1032: R2018 };

const dwgError = (message, code = 'dwg-read') => Object.assign(new Error(message), { code });

const f64 = new DataView(new ArrayBuffer(8));

export class BitReader {
  /** `bytes` (Uint8Array), `bit` the starting bit position, `version` (R2000 …) for the version-dependent forms. */
  constructor(bytes, bit = 0, version = R2000) { this.b = bytes; this.bit = bit; this.version = version; this.end = bytes.length * 8; }
  get byte() { return this.bit >> 3; }
  need(n) { if (this.bit + n > this.end) throw dwgError('read past the end of the data'); }
  B() { this.need(1); const v = (this.b[this.bit >> 3] >> (7 - (this.bit & 7))) & 1; this.bit++; return v; }
  bits(n) { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | this.B(); return v >>> 0; }
  BB() { return (this.B() << 1) | this.B(); }
  /** 1–3 bits until a zero bit (R24). */
  B3() { let v = 0; for (let i = 0; i < 3; i++) { const x = this.B(); v = (v << 1) | x; if (!x) break; } return v; }
  RC() {
    this.need(8);
    const i = this.bit >> 3; const s = this.bit & 7;
    const v = s === 0 ? this.b[i] : ((this.b[i] << s) | (this.b[i + 1] >> (8 - s))) & 255;
    this.bit += 8; return v;
  }
  rawBytes(n) { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = this.RC(); return out; }
  RS() { const lo = this.RC(); return (this.RC() << 8 | lo) << 16 >> 16; }
  RSu() { const lo = this.RC(); return this.RC() << 8 | lo; }
  RL() { const a = this.rawBytes(4); return (a[0] | a[1] << 8 | a[2] << 16 | a[3] << 24) >>> 0; }
  RLs() { return this.RL() | 0; }
  RD() { const a = this.rawBytes(8); for (let i = 0; i < 8; i++) f64.setUint8(i, a[i]); return f64.getFloat64(0, true); }
  BS() { switch (this.BB()) { case 0: return this.RS(); case 1: return this.RC(); case 2: return 0; default: return 256; } }
  BL() { switch (this.BB()) { case 0: return this.RLs(); case 1: return this.RC(); case 2: return 0; default: throw dwgError('bad bitlong'); } }
  BLL() { const n = this.B3(); let v = 0; for (let i = 0; i < n; i++) v += this.RC() * 2 ** (8 * i); return v; }
  BD() { switch (this.BB()) { case 0: return this.RD(); case 1: return 1; case 2: return 0; default: throw dwgError('bad bitdouble'); } }
  /** BitDouble with default (2.9). */
  DD(def) {
    const code = this.BB();
    if (code === 0) return def;
    if (code === 3) return this.RD();
    f64.setFloat64(0, def, true);
    if (code === 2) { f64.setUint8(4, this.RC()); f64.setUint8(5, this.RC()); }
    for (let i = 0; i < 4; i++) f64.setUint8(i, this.RC());
    return f64.getFloat64(0, true);
  }
  RD2() { return [this.RD(), this.RD()]; }
  RD3() { return [this.RD(), this.RD(), this.RD()]; }
  BD2() { return [this.BD(), this.BD()]; }
  BD3() { return [this.BD(), this.BD(), this.BD()]; }
  /** Bit extrusion (2.8): R2000+ one bit for (0, 0, 1). */
  BE() { if (this.version >= R2000 && this.B()) return [0, 0, 1]; return this.BD3(); }
  /** Bit thickness (2.10). */
  BT() { if (this.version >= R2000 && this.B()) return 0; return this.BD(); }
  /** Modular char (2.6): `signed` for file offsets. */
  MC(signed = true) {
    let v = 0; let shift = 0;
    for (let k = 0; k < 8; k++) {
      let c = this.RC();
      if (c & 0x80) { v += (c & 0x7f) * 2 ** shift; shift += 7; continue; }
      let neg = false;
      if (signed && (c & 0x40)) { neg = true; c &= 0x3f; }
      v += c * 2 ** shift;
      return neg ? -v : v;
    }
    throw dwgError('bad modular char');
  }
  /** Modular short (2.7). */
  MS() {
    let v = 0; let shift = 0;
    for (let k = 0; k < 4; k++) {
      const w = this.RSu();
      if (w & 0x8000) { v += (w & 0x7fff) * 2 ** shift; shift += 15; continue; }
      return v + w * 2 ** shift;
    }
    throw dwgError('bad modular short');
  }
  /** Handle reference (2.13): { code, value } (value: the handle, or the offset for codes 6–12). */
  H() {
    const first = this.RC(); const code = first >> 4; const n = first & 15;
    let v = 0; for (let i = 0; i < n; i++) v = v * 256 + this.RC();
    return { code, value: v };
  }
  /** A handle reference made absolute against the referencing object's handle. */
  Habs(ref) {
    const h = this.H();
    switch (h.code) {
      case 6: return ref + 1;
      case 8: return ref - 1;
      case 0xa: return ref + h.value;
      case 0xc: return ref - h.value;
      default: return h.value;
    }
  }
  /** T (≤ R2004): bitshort length and single-byte characters (code page 1252 assumed). */
  T() { const n = this.BS(); if (n < 0 || n > 1e6) throw dwgError('bad text length'); let s = ''; for (let i = 0; i < n; i++) s += CP1252[this.RC()]; return unescapeText(s.replace(/\0+$/, '')); }
  /** TU (R2007+): bitshort length and UTF-16 characters. */
  TU() { const n = this.BS(); if (n < 0 || n > 1e6) throw dwgError('bad text length'); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.RSu()); return unescapeText(s.replace(/\0+$/, '')); }
  /** CmColor (2.11): R2000 a colour index; R2004+ the ENC/CMC forms, returned as { index, rgb }. */
  CMC() {
    if (this.version < R2004) return { index: this.BS() };
    const index = this.BS(); const rgb = this.BL(); const flags = this.RC();
    if (flags & 1) this.TV(); if (flags & 2) this.TV();
    return { index, rgb };
  }
  /** Entity colour (ENC, R2004+). */
  ENC() {
    if (this.version < R2004) return { index: this.BS() };
    const n = this.BS(); const flags = n >> 8; const out = { index: n & 0x1ff };
    if (flags & 0x80) out.rgb = this.BL() & 0xffffff;
    if (flags & 0x40) out.hasBook = true;
    if (flags & 0x20) out.transparency = this.BL();
    return out;
  }
  /** Variable text: T before R2007, TU after (from the string stream, see objects.js). */
  TV() { return this.version >= R2007 ? (this.strings ?? this).TU() : this.T(); }
  /** Moves to the next byte boundary. */
  align() { this.bit = (this.bit + 7) & ~7; }
}

// Windows-1252, the usual DWGCODEPAGE (ANSI_1252); bytes 0x80–0x9F map to their glyphs.
const CP1252 = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i));
'€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ'.split('').forEach((c, i) => { CP1252[0x80 + i] = c; });
const FROM1252 = new Map(CP1252.map((c, i) => [c, i]));
/** AutoCAD keeps characters its code page lacks as \U+XXXX in strings. */
const unescapeText = (s) => (s.includes('\\U+') ? s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : s);

export class BitWriter {
  constructor(version = R2000) { this.buf = new Uint8Array(4096); this.bit = 0; this.version = version; }
  grow(nbits) { const need = (this.bit + nbits + 7) >> 3; if (need <= this.buf.length) return; const b = new Uint8Array(Math.max(need, this.buf.length * 2)); b.set(this.buf); this.buf = b; }
  B(v) { this.grow(1); if (v) this.buf[this.bit >> 3] |= 0x80 >> (this.bit & 7); this.bit++; }
  bits(v, n) { for (let i = n - 1; i >= 0; i--) this.B((v >>> i) & 1); }
  BB(v) { this.B((v >> 1) & 1); this.B(v & 1); }
  RC(v) { this.bits(v & 255, 8); }
  rawBytes(a) { for (const x of a) this.RC(x); }
  RS(v) { this.RC(v & 255); this.RC((v >> 8) & 255); }
  RL(v) { this.RC(v & 255); this.RC((v >>> 8) & 255); this.RC((v >>> 16) & 255); this.RC((v >>> 24) & 255); }
  RD(v) { f64.setFloat64(0, v, true); for (let i = 0; i < 8; i++) this.RC(f64.getUint8(i)); }
  BS(v) {
    if (v === 0) this.BB(2); else if (v === 256) this.BB(3); else if (v > 0 && v < 256) { this.BB(1); this.RC(v); } else { this.BB(0); this.RS(v); }
  }
  BL(v) { if (v === 0) this.BB(2); else if (v > 0 && v < 256) { this.BB(1); this.RC(v); } else { this.BB(0); this.RL(v); } }
  BD(v) { if (v === 1) this.BB(1); else if (v === 0 && !Object.is(v, -0)) this.BB(2); else { this.BB(0); this.RD(v); } }
  /** BitDouble with default: the value itself, or nothing when it equals the default. */
  DD(v, def) {
    if (v === def) { this.BB(0); return; }
    f64.setFloat64(0, v, true); const a = Array.from({ length: 8 }, (_, i) => f64.getUint8(i));
    f64.setFloat64(0, def, true); const d = Array.from({ length: 8 }, (_, i) => f64.getUint8(i));
    if (a[4] === d[4] && a[5] === d[5] && a[6] === d[6] && a[7] === d[7]) { this.BB(1); for (let i = 0; i < 4; i++) this.RC(a[i]); return; }
    if (a[6] === d[6] && a[7] === d[7]) { this.BB(2); this.RC(a[4]); this.RC(a[5]); for (let i = 0; i < 4; i++) this.RC(a[i]); return; }
    this.BB(3); this.RD(v);
  }
  RD2(p) { this.RD(p[0]); this.RD(p[1]); }
  RD3(p) { this.RD(p[0]); this.RD(p[1]); this.RD(p[2]); }
  BD2(p) { this.BD(p[0]); this.BD(p[1]); }
  BD3(p) { this.BD(p[0]); this.BD(p[1]); this.BD(p[2]); }
  BE(p = [0, 0, 1]) { if (p[0] === 0 && p[1] === 0 && p[2] === 1) { this.B(1); return; } this.B(0); this.BD3(p); }
  BT(v = 0) { if (v === 0) { this.B(1); return; } this.B(0); this.BD(v); }
  /** Handle reference with an explicit code. */
  H(code, value) {
    const bytes = []; let v = value; while (v > 0) { bytes.unshift(v % 256); v = Math.floor(v / 256); }
    this.RC((code << 4) | bytes.length); for (const x of bytes) this.RC(x);
  }
  T(s) {
    // Characters outside code page 1252 as AutoCAD writes them: \U+XXXX.
    const text = [...String(s)].map((c) => (FROM1252.has(c) ? c : `\\U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)).join('');
    const bytes = [...text].map((c) => FROM1252.get(c) ?? 63);
    this.BS(bytes.length); for (const x of bytes) this.RC(x);
  }
  align() { this.bit = (this.bit + 7) & ~7; this.grow(0); }
  bytes() { return this.buf.slice(0, (this.bit + 7) >> 3); }
}

// —— modular char / short writers (byte-aligned output for the object map and object sizes) ——
export function encodeMC(v, signed = true) {
  const out = []; let neg = signed && v < 0; let x = Math.abs(v);
  for (;;) {
    const low = x % 128; x = Math.floor(x / 128);
    if (x === 0) {
      if (signed && (low & 0x40)) { out.push(0x80 | low); out.push(neg ? 0x40 : 0); }
      else out.push(low | (neg ? 0x40 : 0));
      return out;
    }
    out.push(0x80 | low);
  }
}
export function encodeMS(v) {
  const out = []; let x = v;
  for (;;) {
    const low = x % 32768; x = Math.floor(x / 32768);
    if (x === 0) { out.push(low & 255, low >> 8); return out; }
    out.push(low & 255, (low >> 8) | 0x80);
  }
}

// —— CRCs (2.14) ——
const CRC16 = new Uint16Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1; CRC16[n] = c; }
/** The 16-bit CRC of the spec's table (CRC-16/ARC), from a seed. */
export function crc8(seed, bytes, from = 0, to = bytes.length) {
  let dx = seed & 0xffff;
  for (let i = from; i < to; i++) { const al = (bytes[i] ^ dx) & 0xff; dx = (dx >> 8) ^ CRC16[al]; }
  return dx & 0xffff;
}
const CRC32T = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; CRC32T[n] = c >>> 0; }
/** The 32-bit CRC (R2004+). */
export function crc32(bytes, from = 0, to = bytes.length, seed = 0) {
  let c = ~seed >>> 0;
  for (let i = from; i < to; i++) c = (c >>> 8) ^ CRC32T[(c ^ bytes[i]) & 0xff];
  return ~c >>> 0;
}

export { dwgError };
