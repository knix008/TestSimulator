// DWG import: AutoCAD's native binary drawing format, read without any
// external library, following the Open Design Alliance "Open Design
// Specification for .dwg files".
//
// Supported releases: R13 (AC1012), R14 (AC1014), R2000 (AC1015), R2004
// (AC1018), R2007 (AC1021), R2010 (AC1024), R2013 (AC1027) and R2018
// (AC1032). The reader is layered:
//
//   container   R13–R2000: a plain file with section locators.
//               R2004+:    an encrypted file header, a page map and a section
//                          map; every section is split into LZ77-compressed
//                          pages ("AcDb:Header", "AcDb:Classes",
//                          "AcDb:Handles", "AcDb:AcDbObjects", …).
//               R2007:     the same idea, but pages are Reed-Solomon
//                          interleaved and use a different LZ77 variant.
//   objects     the handle map gives every object's offset; each object is
//               a bit stream (data, then — R2007+ — a string stream at its
//               end, then a handle stream).
//   translate   the objects that matter for a plan (layers, block headers
//               and the model-space entities) become DXF-style records
//               ({type, tags: [[code, value]]}) and go through the very same
//               importer as DXF files (importCadRecords in dxf.js), so a DWG
//               and its DXF export import identically.
//
// Angles in DWG are radians (DXF: degrees) — converted on translation.

import { importCadRecords } from "./dxf.js";

// ================================================================ versions

const R13 = 1012, R14 = 1014, R2000 = 1015, R2004 = 1018, R2007 = 1021, R2010 = 1024, R2013 = 1027, R2018 = 1032;
const RELEASES = { AC1012: "R13", AC1014: "R14", AC1015: "R2000", AC1018: "R2004", AC1021: "R2007", AC1024: "R2010", AC1027: "R2013", AC1032: "R2018" };
const OLD_RELEASES = { "MC0.0": "R1.0", "AC1.2": "R1.2", "AC1.4": "R1.4", "AC1.50": "R2.0", "AC2.10": "R2.10", AC1001: "R2.5", AC1002: "R2.6", AC1003: "R9", AC1004: "R10", AC1006: "R10", AC1009: "R11/R12" };

/**
 * Version of a DWG file from its first bytes.
 * → {code: "AC1015", release: "R2000", supported: true} or null (not a DWG).
 */
export function detectDwgVersion(bytes) {
  const b = toBytes(bytes);
  if (b.length < 6) return null;
  const code = String.fromCharCode(...b.subarray(0, 6));
  if (RELEASES[code]) return { code, release: RELEASES[code], supported: true, number: +code.slice(2) };
  for (const k of Object.keys(OLD_RELEASES)) if (code.startsWith(k)) return { code: k, release: OLD_RELEASES[k], supported: false, number: 0 };
  return null;
}

function toBytes(x) {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  throw new TypeError("DWG data must be bytes");
}

// ================================================================ checksums

let CRC16_TABLE = null;
/** DWG's 16-bit CRC (CRC-16/ARC polynomial, reflected 0xA001) with a seed. */
export function crc16(bytes, seed = 0xc0c1, start = 0, end = bytes.length) {
  if (!CRC16_TABLE) {
    CRC16_TABLE = new Uint16Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1; CRC16_TABLE[i] = c; }
  }
  let crc = seed & 0xffff;
  for (let i = start; i < end; i++) crc = (crc >>> 8) ^ CRC16_TABLE[(crc ^ bytes[i]) & 0xff];
  return crc;
}

let CRC32_TABLE = null;
/** Standard CRC-32 (used by the R2004+ file header). */
export function crc32(bytes, seed = 0, start = 0, end = bytes.length) {
  if (!CRC32_TABLE) {
    CRC32_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; CRC32_TABLE[i] = c >>> 0; }
  }
  let crc = ~seed >>> 0;
  for (let i = start; i < end; i++) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xff];
  return ~crc >>> 0;
}

// ================================================================ bit reader

const truncated = () => new Error("The DWG file is truncated or damaged (read past the end of its data)");
const damaged = () => new Error("The DWG file is damaged (inconsistent section sizes)");
const MAX_SECTION = 1 << 30;
const F64 = new DataView(new ArrayBuffer(8));

/**
 * Reads DWG bit codes from a byte array, most significant bit first.
 * Positions are absolute bit offsets into `bytes`.
 */
export class BitReader {
  constructor(bytes, bit = 0, end = bytes.length * 8) {
    this.b = bytes;
    this.p = bit;
    this.end = Math.min(end, bytes.length * 8);
    this.cp = null; // TextDecoder for 8-bit strings
  }
  get left() { return this.end - this.p; }
  seek(bit) { this.p = bit; return this; }
  skip(bits) { if (this.p + bits > this.end) throw truncated(); this.p += bits; }
  B() {
    if (this.p >= this.end) throw truncated();
    const v = (this.b[this.p >> 3] >> (7 - (this.p & 7))) & 1;
    this.p++;
    return v;
  }
  bits(n) { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + this.B(); return v; }
  BB() { return this.bits(2); }
  RC() {
    const p = this.p;
    if (p + 8 > this.end) throw truncated();
    this.p = p + 8;
    const i = p >> 3, s = p & 7;
    return s ? ((this.b[i] << s) | (this.b[i + 1] >> (8 - s))) & 255 : this.b[i];
  }
  RS() { const lo = this.RC(); return lo | (this.RC() << 8); }
  RSs() { const v = this.RS(); return v & 0x8000 ? v - 0x10000 : v; }
  RL() { const a = this.RS(); return (a + this.RS() * 65536) >>> 0; }
  RLs() { return this.RL() | 0; }
  RD() { for (let i = 0; i < 8; i++) F64.setUint8(i, this.RC()); return F64.getFloat64(0, true); }
  /** Bit short: 00 short, 01 byte, 10 → 0, 11 → 256. Unsigned. */
  BS() { const c = this.BB(); return c === 0 ? this.RS() : c === 1 ? this.RC() : c === 2 ? 0 : 256; }
  BSs() { const v = this.BS(); return v & 0x8000 ? v - 0x10000 : v; }
  /** Bit long: 00 long, 01 byte, 10 → 0. */
  BL() { const c = this.BB(); if (c === 0) return this.RL(); if (c === 1) return this.RC(); if (c === 2) return 0; throw new Error("Bad bit long code"); }
  BLs() { return this.BL() | 0; }
  /** Bit long long: 3-bit byte count, then the bytes (little-endian). */
  BLL() { const n = this.bits(3); let v = 0; for (let i = 0; i < n; i++) v += this.RC() * 2 ** (8 * i); return v; }
  /** Bit double: 00 double, 01 → 1.0, 10 → 0.0. */
  BD() { const c = this.BB(); if (c === 0) return this.RD(); if (c === 1) return 1; if (c === 2) return 0; throw new Error("Bad bit double code"); }
  /** Bit double with default: patches bytes of the default value. */
  DD(def) {
    const c = this.BB();
    if (c === 0) return def;
    if (c === 3) return this.RD();
    F64.setFloat64(0, def, true);
    if (c === 2) { F64.setUint8(4, this.RC()); F64.setUint8(5, this.RC()); }
    for (let i = 0; i < 4; i++) F64.setUint8(i, this.RC());
    return F64.getFloat64(0, true);
  }
  RD2() { return [this.RD(), this.RD()]; }
  RD3() { return [this.RD(), this.RD(), this.RD()]; }
  BD2() { return [this.BD(), this.BD()]; }
  BD3() { return [this.BD(), this.BD(), this.BD()]; }
  DD2(d) { const x = this.DD(d[0]); return [x, this.DD(d[1])]; }
  DD3(d) { const x = this.DD(d[0]), y = this.DD(d[1]); return [x, y, this.DD(d[2])]; }
  /** Handle reference: 4-bit code, 4-bit length, then big-endian bytes. */
  H() { const code = this.bits(4), n = this.bits(4); let v = 0; for (let i = 0; i < n; i++) v = v * 256 + this.RC(); return { code, v }; }
  /** Object type: R2010+ packs it in 2 bits + 1–2 bytes. */
  OT() { const c = this.BB(); if (c === 0) return this.RC(); if (c === 1) return this.RC() + 0x1f0; return this.RS(); }
  /** 8-bit text (R13–R2004): bit short length, bytes in the drawing code page. */
  TV() {
    const n = this.BS();
    if (n > this.left / 8) throw truncated();
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = this.RC();
    let e = n;
    while (e > 0 && a[e - 1] === 0) e--;
    return (this.cp || LATIN1).decode(a.subarray(0, e));
  }
  /** Unicode text (R2007+): bit short length in UTF-16 units. */
  TU() {
    const n = this.BS();
    if (n * 16 > this.left) throw truncated();
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.RS());
    return s.replace(/\0+$/, "");
  }
}

const LATIN1 = new TextDecoder("latin1");

// DWG code page numbers → TextDecoder labels.
const CODEPAGES = { 1: "us-ascii", 2: "iso-8859-1", 3: "iso-8859-2", 4: "iso-8859-3", 5: "iso-8859-4", 6: "iso-8859-5", 7: "iso-8859-6", 8: "iso-8859-7", 9: "iso-8859-8", 10: "iso-8859-9", 11: "ibm866", 22: "shift_jis", 23: "macintosh", 24: "big5", 25: "euc-kr", 26: "euc-kr", 27: "ibm866", 28: "windows-1250", 29: "windows-1251", 30: "windows-1252", 31: "gbk", 32: "windows-1253", 33: "windows-1254", 34: "windows-1255", 35: "windows-1256", 36: "windows-1257", 37: "windows-874", 38: "shift_jis", 39: "gbk", 40: "euc-kr", 41: "big5", 42: "euc-kr", 44: "windows-1258" };
function decoderFor(cp) {
  try { return new TextDecoder(CODEPAGES[cp] || "windows-1252"); } catch { return new TextDecoder("windows-1252"); }
}

// Byte-aligned helpers (handle map, section headers).
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u64 = (b, i) => u32(b, i) + u32(b, i + 4) * 4294967296;
const i64 = (b, i) => { const hi = u32(b, i + 4) | 0; return u32(b, i) + hi * 4294967296; };

// ================================================================ decompression

/**
 * R2004+ LZ77 page decompression ("AcDb" system and data pages).
 * Returns a Uint8Array of `outSize` bytes (the tail stays zero when the
 * stream ends early).
 */
export function decompressR2004(src, outSize, start = 0, end = src.length) {
  const out = new Uint8Array(outSize);
  let i = start, o = 0;
  end = Math.min(end, src.length);
  const byte = () => { if (i >= end) throw truncated(); return src[i++]; };
  const literalLength = (op) => {
    let n = op & 0x0f;
    if (n === 0) { let b; while ((b = byte()) === 0) n += 0xff; n += 0x0f + b; }
    return n + 3;
  };
  const longCount = () => {
    let n = 0, b = byte();
    if (b === 0) { n = 0xff; while ((b = byte()) === 0) n += 0xff; }
    return n + b;
  };
  const literal = (n) => {
    if (i + n > end || o + n > outSize) throw truncated();
    out.set(src.subarray(i, i + n), o);
    i += n; o += n;
  };
  let op = byte();
  if ((op & 0xf0) === 0) { literal(literalLength(op)); op = byte(); }
  for (;;) {
    let count, offset, lit;
    if (op === 0x11) break;
    if (op === 0x10 || (op >= 0x12 && op <= 0x1f) || (op >= 0x20 && op <= 0x3f)) {
      if (op === 0x10) count = longCount() + 9;
      else if (op < 0x20) count = (op & 0x0f) + 2;
      else if (op === 0x20) count = longCount() + 0x21;
      else count = op - 0x1e;
      const b1 = byte(), b2 = byte();
      offset = (b1 >> 2) | (b2 << 6);
      if (op < 0x20) offset += 0x3fff;
      lit = b1 & 3;
    } else if (op >= 0x40) {
      count = (op >> 4) - 1;
      offset = (byte() << 2) | ((op & 0x0c) >> 2);
      lit = op & 3;
    } else throw new Error(`Bad DWG compression opcode 0x${op.toString(16)}`);
    let from = o - offset - 1;
    if (from < 0 || o + count > outSize) throw new Error("Bad DWG compressed data (reference out of range)");
    for (let k = 0; k < count; k++) out[o++] = out[from++];
    if (i >= end) break;
    if (lit === 0) {
      op = byte();
      if ((op & 0xf0) === 0) { literal(literalLength(op)); if (i >= end) break; op = byte(); }
    } else {
      literal(lit);
      if (i >= end) break;
      op = byte();
    }
  }
  return out;
}

// R2007 literal runs are stored shuffled: per run length below 32 the
// [source offset, size] pieces in output order (see `piece`).
const LITERAL_ORDER = [
  [], [[0, 1]], [[0, 2]], [[0, 3]], [[0, 4]], [[4, 1], [0, 4]], [[5, 1], [1, 4], [0, 1]], [[5, 2], [1, 4], [0, 1]],
  [[0, 8]], [[8, 1], [0, 8]], [[9, 1], [1, 8], [0, 1]], [[9, 2], [1, 8], [0, 1]], [[8, 4], [0, 8]], [[12, 1], [8, 4], [0, 8]],
  [[13, 1], [9, 4], [1, 8], [0, 1]], [[13, 2], [9, 4], [1, 8], [0, 1]], [[0, 16]], [[9, 8], [8, 1], [0, 8]],
  [[17, 1], [1, 16], [0, 1]], [[16, 3], [0, 16]], [[16, 4], [0, 16]], [[20, 1], [16, 4], [0, 16]], [[20, 2], [16, 4], [0, 16]],
  [[20, 3], [16, 4], [0, 16]], [[16, 8], [0, 16]], [[17, 8], [16, 1], [0, 16]], [[25, 1], [17, 8], [16, 1], [0, 16]],
  [[25, 2], [17, 8], [16, 1], [0, 16]], [[24, 4], [16, 8], [0, 16]], [[28, 1], [24, 4], [16, 8], [0, 16]],
  [[28, 2], [24, 4], [16, 8], [0, 16]], [[30, 1], [26, 4], [18, 8], [2, 16], [0, 2]],
];

/** R2007 LZ77 variant (with shuffled literal runs). */
export function decompressR2007(src, outSize, start = 0, end = src.length) {
  const out = new Uint8Array(outSize);
  let i = start, o = 0;
  end = Math.min(end, src.length);
  const byte = () => { if (i >= end) throw truncated(); return src[i++]; };
  const literalLength = (op) => {
    let n = op + 8;
    if (n === 0x17) {
      let b = byte();
      n += b;
      if (b === 0xff) { do { b = byte(); b |= byte() << 8; n += b; } while (b === 0xffff); }
    }
    return n;
  };
  const literal = (n) => {
    if (i + n > end || o + n > outSize) throw truncated();
    while (n >= 32) {
      piece(i + 16, 16); piece(i, 16);
      i += 32; n -= 32;
    }
    for (const [s, k] of LITERAL_ORDER[n]) piece(i + s, k);
    i += n;
  };
  // Literal pieces: up to 3 bytes reversed, 4 and 8 straight, 16 = two
  // swapped 8-byte halves.
  const piece = (s, k) => {
    if (k <= 3) for (let j = k - 1; j >= 0; j--) out[o++] = src[s + j];
    else if (k === 16) { out.set(src.subarray(s + 8, s + 16), o); out.set(src.subarray(s, s + 8), o + 8); o += 16; } else { out.set(src.subarray(s, s + k), o); o += k; }
  };
  let op, offset = 0, length = 0;
  const instruction = () => {
    switch (op >> 4) {
      case 0:
        length = (op & 0x0f) + 0x13;
        offset = byte();
        op = byte();
        length += (op >> 3) & 0x10;
        offset += ((op & 0x78) << 5) + 1;
        break;
      case 1:
        length = (op & 0x0f) + 3;
        offset = byte();
        op = byte();
        offset += ((op & 0xf8) << 5) + 1;
        break;
      case 2:
        offset = byte();
        offset |= (byte() << 8) & 0xff00;
        length = op & 7;
        if ((op & 8) === 0) {
          op = byte();
          length += op & 0xf8;
        } else {
          offset++;
          length += byte() << 3;
          op = byte();
          length += ((op & 0xf8) << 8) + 0x100;
        }
        break;
      default:
        length = op >> 4;
        offset = op & 0x0f;
        op = byte();
        offset += ((op & 0xf8) << 1) + 1;
    }
  };
  op = byte();
  if ((op & 0xf0) === 0x20) { i += 2; length = byte() & 0x07; }
  while (i < end) {
    if (length === 0) length = literalLength(op);
    literal(length);
    length = 0;
    if (i >= end) break;
    op = byte();
    instruction();
    for (;;) {
      let from = o - offset;
      if (from < 0 || o + length > outSize) throw new Error("Bad DWG compressed data (reference out of range)");
      for (let k = 0; k < length; k++) out[o++] = out[from++];
      length = op & 7;
      if (length !== 0 || i >= end) break;
      op = byte();
      if (op >> 4 === 0) break;
      if (op >> 4 === 0x0f) op &= 0x0f;
      instruction();
    }
  }
  return out;
}

// Reed-Solomon (255, k) blocks interleaved byte by byte: keep the data part.
// (The parity bytes are not checked: a damaged file shows up as a decode error.)
function rsData(src, start, blocks, k) {
  const out = new Uint8Array(blocks * k);
  for (let b = 0; b < blocks; b++) for (let j = 0; j < k; j++) out[b * k + j] = src[start + j * blocks + b] ?? 0;
  return out;
}

// ================================================================ containers

const SENTINEL_LEN = 16;

// R13–R2000: section locator records right after the file header.
function containerR2000(buf, ver) {
  const n = u32(buf, 0x15);
  if (buf.length < 0x19 || 0x19 + Math.min(n, 16) * 9 > buf.length) throw truncated();
  if (n > 16) throw new Error("The DWG file header is damaged");
  const loc = {};
  for (let k = 0; k < n; k++) {
    const p = 0x19 + k * 9;
    loc[buf[p]] = { offset: u32(buf, p + 1), size: u32(buf, p + 5) };
  }
  const need = (i, what) => {
    const l = loc[i];
    if (l && l.offset > 0 && l.offset + l.size > buf.length) throw truncated();
    if (!l || l.offset <= 0) throw new Error(`The DWG ${what} section is missing`);
    return buf.subarray(l.offset, l.offset + l.size);
  };
  return { ver, codepage: u16(buf, 0x13), header: need(0, "header"), classes: need(1, "class"), handles: need(2, "object map"), objects: buf, objectsBase: 0 };
}

// R2004, R2010, R2013, R2018.
function containerR2004(buf, ver, warn) {
  if (buf.length < 0x100) throw truncated();
  const hdr = new Uint8Array(0x6c);
  let seed = 1;
  for (let i = 0; i < 0x6c; i++) {
    seed = (Math.imul(seed, 0x343fd) + 0x269ec3) >>> 0;
    hdr[i] = buf[0x80 + i] ^ ((seed >>> 16) & 0xff);
  }
  if (String.fromCharCode(...hdr.subarray(0, 11)) !== "AcFssFcAJMB") throw new Error("The DWG file header is damaged (bad signature)");
  const pageMapAddr = u64(hdr, 0x54) + 0x100;
  const sectionMapId = u32(hdr, 0x5c);

  // System pages: 20-byte header (type, sizes, compression, checksum).
  const systemPage = (addr, type) => {
    if (addr + 20 > buf.length) throw truncated();
    if (u32(buf, addr) !== type) throw new Error("The DWG page map is damaged");
    const dsize = u32(buf, addr + 4), csize = u32(buf, addr + 8), comp = u32(buf, addr + 12);
    if (dsize > MAX_SECTION) throw damaged();
    return comp === 2 ? decompressR2004(buf, dsize, addr + 20, addr + 20 + csize) : buf.slice(addr + 20, addr + 20 + dsize);
  };

  const pm = systemPage(pageMapAddr, 0x41630e3b);
  const pages = new Map();
  let addr = 0x100;
  for (let p = 0; p + 8 <= pm.length;) {
    const num = u32(pm, p) | 0, size = u32(pm, p + 4);
    p += 8;
    if (num < 0) p += 16; // gap record: parent, left, right, 0
    else pages.set(num, { addr, size });
    addr += size;
  }
  const smPage = pages.get(sectionMapId);
  if (!smPage) throw new Error("The DWG section map is missing");
  const sm = systemPage(smPage.addr, 0x4163003b);
  const nDesc = u32(sm, 0);
  const sections = {};
  let p = 20;
  for (let d = 0; d < nDesc && p + 96 <= sm.length; d++) {
    const size = u64(sm, p), pageCount = u32(sm, p + 8), maxSize = u32(sm, p + 12), compressed = u32(sm, p + 20), encrypted = u32(sm, p + 28);
    let name = "";
    for (let k = 0; k < 64 && sm[p + 32 + k]; k++) name += String.fromCharCode(sm[p + 32 + k]);
    p += 96;
    const list = [];
    for (let k = 0; k < pageCount && p + 16 <= sm.length; k++, p += 16) list.push({ num: u32(sm, p), dataSize: u32(sm, p + 4), start: u64(sm, p + 8) });
    sections[name] = { size, maxSize, compressed, encrypted, pages: list };
  }

  const read = (name, required = true) => {
    const s = sections[name];
    if (!s) { if (required) throw new Error(`The DWG ${name} section is missing`); return null; }
    if (s.encrypted === 1) throw new Error(`The DWG ${name} section is encrypted (password-protected drawing)`);
    if (s.size > MAX_SECTION) throw damaged();
    const out = new Uint8Array(s.size);
    for (const pg of s.pages) {
      const loc = pages.get(pg.num);
      if (!loc || loc.addr + 32 > buf.length) { warn("Some DWG data pages are missing"); continue; }
      const mask = (0x4164536b ^ loc.addr) >>> 0;
      const h = (k) => (u32(buf, loc.addr + k * 4) ^ mask) >>> 0;
      const csize = h(2), dsize = Math.min(Math.max(h(3), s.maxSize), MAX_SECTION);
      try {
        const data = s.compressed === 2
          ? decompressR2004(buf, dsize, loc.addr + 32, loc.addr + 32 + csize)
          : buf.subarray(loc.addr + 32, loc.addr + 32 + csize);
        const n = Math.min(data.length, s.size - pg.start);
        if (n > 0) out.set(data.subarray(0, n), pg.start);
      } catch { warn("Some DWG data pages are damaged; parts of the drawing may be missing"); }
    }
    return out;
  };
  return { ver, codepage: u16(buf, 0x13), header: read("AcDb:Header"), classes: read("AcDb:Classes"), handles: read("AcDb:Handles"), objects: read("AcDb:AcDbObjects"), objectsBase: 0 };
}

// R2007: Reed-Solomon coded pages, R2007 LZ77.
function containerR2007(buf, ver, warn) {
  if (buf.length < 0x480) throw truncated();
  const fhRaw = rsData(buf, 0x80, 3, 239);
  const comprLen = u32(fhRaw, 24) | 0;
  const fh = comprLen > 0 ? decompressR2007(fhRaw, 0x110, 32, 32 + comprLen) : fhRaw.slice(32, 32 + 0x110);
  const F = (k) => u64(fh, k * 8);
  const pagesMapOffset = F(7), pagesMapSizeComp = F(10), pagesMapSizeUncomp = F(11), pagesMapCorrection = F(3);
  const sectionsMapSizeComp = F(22), sectionsMapId = F(24), sectionsMapSizeUncomp = F(25), sectionsMapCorrection = F(27);

  const systemPage = (addr, comp, uncomp, correction) => {
    if (comp > MAX_SECTION || uncomp > MAX_SECTION || correction > 64) throw damaged();
    const pesize = Math.ceil(comp / 8) * 8 * correction;
    const blocks = Math.ceil(pesize / 239);
    if (!(blocks > 0) || addr + blocks * 255 > buf.length) throw truncated();
    const data = rsData(buf, addr, blocks, 239);
    return comp < uncomp ? decompressR2007(data, uncomp, 0, comp) : data.subarray(0, uncomp);
  };
  const pm = systemPage(0x480 + pagesMapOffset, pagesMapSizeComp, pagesMapSizeUncomp, pagesMapCorrection);
  const pages = new Map();
  let addr = 0x480;
  for (let p = 0; p + 16 <= pm.length; p += 16) {
    const size = u64(pm, p), id = i64(pm, p + 8);
    if (id > 0) pages.set(id, { addr, size });
    addr += size;
    if (!size) break;
  }
  const smPage = pages.get(sectionsMapId);
  if (!smPage) throw new Error("The DWG section map is missing");
  const sm = systemPage(smPage.addr, sectionsMapSizeComp, sectionsMapSizeUncomp, sectionsMapCorrection);
  const sections = {};
  for (let p = 0; p + 64 <= sm.length;) {
    const dataSize = u64(sm, p), maxSize = u64(sm, p + 8), encrypted = u64(sm, p + 16), nameLen = u64(sm, p + 32), encoded = u64(sm, p + 48), numPages = u64(sm, p + 56);
    p += 64;
    let name = "";
    for (let k = 0; k + 1 < nameLen; k += 2) { const c = u16(sm, p + k); if (!c) break; name += String.fromCharCode(c); }
    p += nameLen;
    const list = [];
    for (let k = 0; k < numPages && p + 56 <= sm.length; k++, p += 56) list.push({ offset: u64(sm, p), size: u64(sm, p + 8), id: i64(sm, p + 16), uncomp: u64(sm, p + 24), comp: u64(sm, p + 32) });
    if (name) sections[name] = { dataSize, maxSize, encrypted, encoded, pages: list };
    if (!nameLen && !numPages && !dataSize) break;
  }
  const read = (name) => {
    const s = sections[name];
    if (!s) throw new Error(`The DWG ${name} section is missing`);
    if (s.encrypted === 1) throw new Error(`The DWG ${name} section is encrypted (password-protected drawing)`);
    if (s.dataSize > MAX_SECTION) throw damaged();
    const out = new Uint8Array(s.dataSize);
    for (const pg of s.pages) {
      const loc = pages.get(pg.id);
      if (!loc) { warn("Some DWG data pages are missing"); continue; }
      try {
        if (pg.comp > MAX_SECTION || pg.uncomp > MAX_SECTION) throw damaged();
        let data;
        if (s.encoded === 4) {
          const blocks = Math.ceil((Math.ceil(pg.comp / 8) * 8) / 251);
          data = rsData(buf, loc.addr, blocks, 251);
        } else data = buf.subarray(loc.addr, loc.addr + loc.size);
        const dec = pg.comp < pg.uncomp ? decompressR2007(data, pg.uncomp, 0, pg.comp) : data.subarray(0, pg.uncomp);
        const n = Math.min(dec.length, s.dataSize - pg.offset);
        if (n > 0) out.set(dec.subarray(0, n), pg.offset);
      } catch { warn("Some DWG data pages are damaged; parts of the drawing may be missing"); }
    }
    return out;
  };
  return { ver, codepage: u16(buf, 0x13), header: read("AcDb:Header"), classes: read("AcDb:Classes"), handles: read("AcDb:Handles"), objects: read("AcDb:AcDbObjects"), objectsBase: 0 };
}

// ================================================================ string streams (R2007+)

// The strings of an R2007+ object sit at the end of its data stream; a flag
// bit just before the end says whether there are any, and the stream length
// precedes it (15 bits, or 30 when the high bit is set).
function stringStream(r, startBit, endBit) {
  let p = endBit - 1;
  if (p < startBit) return null;
  r.seek(p);
  if (!r.B()) return null;
  p -= 16;
  r.seek(p);
  let size = r.RS();
  if (size & 0x8000) {
    p -= 16;
    r.seek(p);
    size = (size & 0x7fff) | (r.RS() << 15);
  }
  const s = p - size;
  if (s < startBit) return null;
  return new BitReader(r.b, s, p);
}

// ================================================================ header variables

// Walks the header variables up to $INSUNITS (and keeps a few for checks).
// R2007+ keep handles and texts in separate streams, so they are skipped.
function readHeaderVars(r, ver, T) {
  const out = {};
  const v = ver;
  const H = v >= R2007 ? () => null : () => r.H();
  const CMC = () => readCMC(r, v, T);
  const bs = (n) => { for (let i = 0; i < n; i++) r.B(); };
  const BSn = (n) => { for (let i = 0; i < n; i++) r.BS(); };
  const BDn = (n) => { for (let i = 0; i < n; i++) r.BD(); };
  if (v >= R2013) r.BLL();
  BDn(4); T(); T(); T(); T(); r.BL(); r.BL();
  if (v <= R14) r.BS();
  if (v < R2004) H();
  bs(2); // DIMASO, DIMSHO
  if (v <= R14) bs(1);
  bs(7); // PLINEGEN … LIMCHECK
  if (v <= R14) bs(1);
  if (v >= R2004) bs(1);
  bs(4); // USRTIMER, SKPOLY, ANGDIR, SPLFRAME
  if (v <= R14) bs(2);
  bs(2); // MIRRTEXT, WORLDVIEW
  if (v <= R14) bs(1);
  bs(3); // TILEMODE, PLIMCHECK, VISRETAIN
  if (v <= R14) bs(1);
  bs(2); // DISPSILH, PELLIPSE
  BSn(1); // PROXYGRAPHICS
  if (v <= R14) BSn(1);
  BSn(5); // TREEDEPTH, LUNITS, LUPREC, AUNITS, AUPREC
  if (v <= R14) BSn(1);
  BSn(1); // ATTMODE
  if (v <= R14) BSn(1);
  BSn(1); // PDMODE
  if (v <= R14) BSn(1);
  if (v >= R2004) { r.BL(); r.BL(); r.BL(); }
  BSn(5 + 14); // USERI1-5, SPLINESEGS … TEXTQLTY
  out.LTSCALE = r.BD();
  out.TEXTSIZE = r.BD();
  BDn(19); // TRACEWID … CELTSCALE
  if (v < R2007) T(); // MENU
  for (let i = 0; i < 4; i++) r.BL(); // TDCREATE, TDUPDATE
  if (v >= R2004) { r.BL(); r.BL(); r.BL(); }
  for (let i = 0; i < 4; i++) r.BL(); // TDINDWG, TDUSRTIMER
  CMC(); // CECOLOR
  r.H(); // HANDSEED (always in the data stream)
  H(); H(); H(); // CLAYER, TEXTSTYLE, CELTYPE
  if (v >= R2007) H();
  H(); H(); // DIMSTYLE, CMLSTYLE
  if (v >= R2000) r.BD();
  r.BD3(); r.BD3(); r.BD3(); r.RD2(); r.RD2(); r.BD(); r.BD3(); r.BD3(); r.BD3(); H(); // paper space
  if (v >= R2000) { H(); r.BS(); H(); for (let i = 0; i < 6; i++) r.BD3(); }
  r.BD3();
  out.EXTMIN = r.BD3();
  out.EXTMAX = r.BD3();
  r.RD2(); r.RD2(); r.BD(); r.BD3(); r.BD3(); r.BD3(); H();
  if (v >= R2000) { H(); r.BS(); H(); for (let i = 0; i < 6; i++) r.BD3(); T(); T(); }
  if (v <= R14) {
    bs(11); r.RC(); r.RC(); bs(2); r.RC(); r.RC(); r.RC(); bs(1); r.RC(); r.RC(); r.RC(); r.RC();
    BSn(6); H();
  }
  out.DIMSCALE = r.BD();
  BDn(8); // DIMASZ … DIMTM
  if (v >= R2007) { r.BD(); r.BD(); r.BS(); CMC(); }
  if (v >= R2000) { bs(6); BSn(3); }
  if (v >= R2007) r.BS();
  out.DIMTXT = r.BD();
  BDn(7); // DIMCEN … DIMGAP
  if (v <= R14) { T(); T(); T(); T(); T(); }
  if (v >= R2000) { r.BD(); bs(1); r.BS(); bs(4); }
  CMC(); CMC(); CMC();
  if (v >= R2000) { BSn(11); bs(2); BSn(4); bs(1); BSn(1); }
  if (v >= R2007) bs(1);
  if (v >= R2010) { bs(1); r.BD(); T(); r.BD(); T(); }
  if (v >= R2000) { H(); H(); H(); H(); H(); }
  if (v >= R2007) { H(); H(); H(); }
  if (v >= R2000) { r.BS(); r.BS(); }
  for (let i = 0; i < 9; i++) H(); // table control objects
  if (v <= R2000) H();
  H(); H(); H(); // ACAD_GROUP, ACAD_MLINESTYLE, named objects
  if (v < R2000) return out;
  r.BS(); r.BS(); T(); T(); H(); H(); H();
  if (v >= R2004) { H(); H(); }
  if (v >= R2007) H();
  if (v >= R2013) H();
  r.BL(); // FLAGS
  out.INSUNITS = r.BS();
  return out;
}

// Colour of a table object (CMC).
function readCMC(r, v, T) {
  const idx = r.BSs();
  if (v < R2004) return { index: idx };
  const rgb = r.BL(), flag = r.RC();
  if (flag & 1) T();
  if (flag & 2) T();
  return { index: idx, rgb };
}

// Colour of an entity (ENC, R2004+): flags in the high bits of the index.
function readENC(r, v) {
  if (v < R2004) return { index: r.BSs() };
  const raw = r.BS();
  const flags = raw >> 8;
  const c = { index: raw & 0x1ff, book: !!(flags & 0x40) };
  if (flags & 0x80) c.rgb = r.BL();
  if (flags & 0x20) r.BL(); // transparency
  return c;
}

// ================================================================ classes, handle map

// Header and class sections: sentinel, RL byte size, (R2010+: RL high size,
// zero), (R2007+: RL bit size counted from that word, with a string stream
// at the end), then the bit stream. → {r, T}
function sectionStreams(sec, v, cp) {
  if (!sec || sec.length < SENTINEL_LEN + 8) throw truncated();
  const size = u32(sec, SENTINEL_LEN);
  let p = SENTINEL_LEN + 4;
  if (v >= R2010 && u32(sec, p) === 0) p += 4;
  const dec = decoderFor(cp);
  if (v < R2007) {
    const r = new BitReader(sec, p * 8, (p + size) * 8);
    r.cp = dec;
    return { r, T: () => r.TV() };
  }
  const end = p * 8 + u32(sec, p);
  const r = new BitReader(sec, (p + 4) * 8, end);
  const str = stringStream(new BitReader(sec), (p + 4) * 8, end);
  if (str) r.end = str.p; // the data stream stops where the strings start
  return { r, T: str ? () => str.TU() : () => "" };
}

function readClasses(sec, ver, cp) {
  const classes = new Map();
  if (!sec || sec.length < 24) return classes;
  const { r, T } = sectionStreams(sec, ver, cp);
  if (ver >= R2004) { r.BS(); r.RC(); r.RC(); r.B(); }
  while (r.left > 40) {
    const start = r.p;
    try {
      const num = r.BS();
      r.BS(); // proxy flags
      const app = T(), cpp = T(), dxf = T();
      r.B();
      const itemId = r.BS();
      if (ver >= R2004) { r.BL(); r.BL(); r.BL(); r.BL(); r.BL(); }
      if (num < 500 || num > 5000) break;
      classes.set(num, { num, dxf: dxf.toUpperCase(), cpp, app, entity: itemId === 0x1f2 });
    } catch {
      r.p = start;
      break;
    }
  }
  return classes;
}

// Handle → offset (sections of big-endian size + modular char pairs).
function readHandleMap(sec) {
  const map = new Map();
  let p = 0;
  while (p + 2 <= sec.length) {
    const size = (sec[p] << 8) | sec[p + 1];
    if (size <= 2) break;
    const end = Math.min(sec.length, p + size);
    let q = p + 2, handle = 0, loc = 0;
    while (q < end) {
      // unsigned modular char: handle delta
      let v = 0, mul = 1, b;
      do { b = sec[q++]; v += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80 && q < end);
      // signed modular char: location delta (sign in bit 0x40 of the last byte)
      let w = 0, m2 = 1, c;
      for (;;) {
        c = sec[q++];
        if (c & 0x80 && q < end) { w += (c & 0x7f) * m2; m2 *= 128; } else { w += (c & 0x3f) * m2; if (c & 0x40) w = -w; break; }
      }
      handle += v;
      loc += w;
      map.set(handle, loc);
    }
    p += size + 2; // section + CRC
  }
  return map;
}

// ================================================================ objects

// Fixed object types (below 500): DXF entity name, or null for non-entities.
const ENTITY_NAMES = {
  1: "TEXT", 2: "ATTRIB", 3: "ATTDEF", 4: "BLOCK", 5: "ENDBLK", 6: "SEQEND", 7: "INSERT", 8: "INSERT",
  10: "VERTEX", 11: "VERTEX", 12: "VERTEX", 13: "VERTEX", 14: "VERTEX",
  15: "POLYLINE", 16: "POLYLINE", 17: "ARC", 18: "CIRCLE", 19: "LINE",
  20: "DIMENSION", 21: "DIMENSION", 22: "DIMENSION", 23: "DIMENSION", 24: "DIMENSION", 25: "DIMENSION", 26: "DIMENSION",
  27: "POINT", 28: "3DFACE", 29: "POLYLINE", 30: "POLYLINE", 31: "SOLID", 32: "TRACE", 33: "SHAPE", 34: "VIEWPORT",
  35: "ELLIPSE", 36: "SPLINE", 37: "REGION", 38: "3DSOLID", 39: "BODY", 40: "RAY", 41: "XLINE", 43: "OLEFRAME",
  44: "MTEXT", 45: "LEADER", 46: "TOLERANCE", 47: "MLINE", 74: "OLE2FRAME", 77: "LWPOLYLINE", 78: "HATCH",
};
const T_BLOCK_HEADER = 0x31, T_LAYER = 0x33;
// Class names decoded like the fixed types they stand for.
const CLASS_TYPES = { LWPOLYLINE: 77, HATCH: 78 };

const DEG = 180 / Math.PI;

class DwgReader {
  constructor(c, warn) {
    this.c = c;
    this.v = c.ver;
    this.warn = warn;
    this.cp = decoderFor(c.codepage);
    this.classes = new Map();
  }

  // Object prelude → {type, handle, r (data stream), hdl (handle stream), T}
  open(offset) {
    const buf = this.c.objects, v = this.v;
    let p = offset;
    if (!(p >= 0 && p + 4 <= buf.length)) throw truncated();
    let size = 0, mul = 1;
    for (let k = 0; k < 4; k++) {
      const w = u16(buf, p);
      p += 2;
      size += (w & 0x7fff) * mul;
      mul *= 0x8000;
      if (!(w & 0x8000)) break;
    }
    let hdlBits = 0;
    if (v >= R2010) {
      let m = 1, b;
      do { b = buf[p++]; hdlBits += (b & 0x7f) * m; m *= 128; } while (b & 0x80 && p < buf.length);
    }
    const start = p * 8, end = Math.min((p + size) * 8, buf.length * 8);
    const r = new BitReader(buf, start, end);
    r.cp = this.cp;
    const type = v >= R2010 ? r.OT() : r.BS();
    let bitsize = 0;
    if (v >= R2010) bitsize = size * 8 - hdlBits;
    else if (v >= R2000) bitsize = r.RL();
    const handle = r.H().v;
    return { type, handle, r, start, end, size, bitsize };
  }

  // The rest of the common prelude; leaves r at the object's own data.
  common(o, entity) {
    const { r } = o, v = this.v;
    for (let guard = 0; guard < 1000; guard++) { // extended entity data
      const n = r.BS();
      if (!n) break;
      r.H();
      r.skip(n * 8);
    }
    if (entity) {
      if (r.B()) { const n = v >= R2010 ? r.BLL() : r.RL(); r.skip(n * 8); }
    }
    if (v <= R14) o.bitsize = r.RL();
    o.hdlStart = o.start + o.bitsize;
    // Strings (R2007+) live at the end of the data stream.
    if (v >= R2007) {
      const s = stringStream(new BitReader(r.b, 0, r.b.length * 8), o.start, o.hdlStart);
      if (s) s.cp = this.cp;
      o.T = s ? () => s.TU() : () => "";
      r.end = Math.min(r.end, o.hdlStart);
    } else o.T = () => r.TV();
    const hdl = new BitReader(r.b, o.hdlStart, o.end);
    o.hdl = hdl;
    const ref = () => {
      const h = hdl.H();
      switch (h.code) {
        case 6: return o.handle + 1;
        case 8: return o.handle - 1;
        case 10: return o.handle + h.v;
        case 12: return o.handle - h.v;
        default: return h.v;
      }
    };
    o.ref = ref;
    if (entity) {
      o.entmode = r.BB();
      o.nreact = r.BL();
      o.xdicMissing = v >= R2004 ? r.B() : 0;
      if (v >= R2013) r.B();
      o.bylayerLt = v <= R14 ? r.B() : 1;
      o.nolinks = v <= R2000 ? r.B() : 1;
      o.color = readENC(r, v);
      r.BD(); // linetype scale
      if (v >= R2000) { o.ltFlags = r.BB(); o.psFlags = r.BB(); }
      if (v >= R2007) { o.matFlags = r.BB(); r.RC(); }
      if (v >= R2010) { o.vs = [r.B(), r.B(), r.B()]; }
      o.invisible = r.BS();
      if (v >= R2000) r.RC();
    } else {
      o.nreact = r.BL();
      o.xdicMissing = v >= R2004 ? r.B() : 0;
      if (v >= R2013) r.B();
    }
    return o;
  }

  // Common handles: owner, reactors, xdictionary, layer, links.
  commonHandles(o, entity) {
    const v = this.v;
    if (!entity || o.entmode === 0) o.owner = o.ref(); else o.owner = null;
    if (o.nreact > 10000) throw new Error("bad reactor count");
    for (let i = 0; i < o.nreact; i++) o.ref();
    if (!o.xdicMissing) o.ref();
    if (!entity) return;
    if (v <= R14) { o.layer = o.ref(); if (!o.bylayerLt) o.ref(); }
    if (v <= R2000 && !o.nolinks) { o.prev = o.ref(); o.next = o.ref(); }
    if (v >= R2004 && o.color.book) o.ref();
    if (v >= R2000) {
      o.layer = o.ref();
      if (o.ltFlags === 3) o.ref();
    }
    if (v >= R2007 && o.matFlags === 3) o.ref();
    if (v >= R2000 && o.psFlags === 3) o.ref();
    if (v >= R2010) for (const f of o.vs) if (f) o.ref();
  }

  // Table entry name and flags (common to LAYER, BLOCK_HEADER, …).
  tableName(o) {
    const { r } = o;
    const name = o.T();
    r.B(); // 64-flag
    if (this.v < R2007) r.BS(); // xref index + 1 (R2007+: kept in the flags)
    const xdep = r.B();
    return { name, xdep };
  }

  layer(o) {
    const { r } = o, v = this.v;
    const { name } = this.tableName(o);
    let frozen, on;
    // R13/R14: the "on" bit is not used; an off layer has a negative colour.
    if (v <= R14) { frozen = r.B(); r.B(); r.B(); r.B(); on = 1; } else {
      const f = r.BS();
      frozen = f & 1;
      on = !(f & 2);
    }
    const col = readCMC(r, v, o.T);
    return { name, frozen: !!frozen, on: !!on, color: col };
  }

  blockHeader(o) {
    const { r } = o, v = this.v;
    const { name } = this.tableName(o);
    const anonymous = r.B();
    r.B(); // has attributes
    const xref = r.B();
    const overlaid = r.B();
    if (v >= R2000) r.B();
    if (v >= R2004) r.BL();
    const base = r.BD3();
    return { name, anonymous: !!anonymous, xref: !!(xref || overlaid), base };
  }
}

// ---------------------------------------------------------------- entity → DXF tags

// Returns {type, tags, ...links} for one entity, reading its data stream.
function entityRecord(d, o, kind) {
  const { r } = o, v = d.v, T = o.T;
  const tags = [];
  const add = (c, x) => tags.push([c, x]);
  const add3 = (c, p) => { add(c, p[0]); add(c + 10, p[1]); add(c + 20, p[2] || 0); };
  const ext = (e) => { if (e && (e[0] || e[1] || e[2] !== 1)) { add(210, e[0]); add(220, e[1]); add(230, e[2]); } };
  const BE = () => (v >= R2000 ? (r.B() ? [0, 0, 1] : r.BD3()) : r.BD3());
  const BT = () => (v >= R2000 ? (r.B() ? 0 : r.BD()) : r.BD());
  const rec = { type: ENTITY_NAMES[kind] || kind, tags };
  switch (kind) {
    case 19: { // LINE
      let a, b;
      if (v >= R2000) {
        const zz = r.B();
        const x1 = r.RD(), x2 = r.DD(x1), y1 = r.RD(), y2 = r.DD(y1);
        let z1 = 0, z2 = 0;
        if (!zz) { z1 = r.RD(); z2 = r.DD(z1); }
        a = [x1, y1, z1]; b = [x2, y2, z2];
      } else { a = r.BD3(); b = r.BD3(); }
      add3(10, a); add3(11, b);
      add(39, BT()); ext(BE());
      break;
    }
    case 18: case 17: { // CIRCLE, ARC
      add3(10, r.BD3()); add(40, r.BD());
      add(39, BT()); ext(BE());
      if (kind === 17) { add(50, r.BD() * DEG); add(51, r.BD() * DEG); }
      break;
    }
    case 27: { // POINT
      add3(10, r.BD3()); add(39, BT()); ext(BE()); add(50, r.BD() * DEG);
      break;
    }
    case 35: { // ELLIPSE
      add3(10, r.BD3()); add3(11, r.BD3()); ext(r.BD3());
      add(40, r.BD()); add(41, r.BD()); add(42, r.BD());
      break;
    }
    case 31: case 32: { // SOLID, TRACE
      const th = BT(), el = r.BD();
      const c = [r.RD2(), r.RD2(), r.RD2(), r.RD2()];
      c.forEach((q, i) => add3(10 + i, [q[0], q[1], el]));
      add(39, th); ext(BE());
      break;
    }
    case 28: { // 3DFACE
      let c;
      if (v >= R2000) {
        const noFlags = r.B(), zz = r.B();
        const p1 = [r.RD(), r.RD(), 0];
        if (!zz) p1[2] = r.RD();
        const p2 = r.DD3(p1), p3 = r.DD3(p2), p4 = r.DD3(p3);
        c = [p1, p2, p3, p4];
        if (!noFlags) add(70, r.BS());
      } else { c = [r.BD3(), r.BD3(), r.BD3(), r.BD3()]; add(70, r.BS()); }
      c.forEach((q, i) => add3(10 + i, q));
      break;
    }
    case 1: case 2: case 3: { // TEXT, ATTRIB, ATTDEF
      let el, ins, al, e3, th, obl = 0, rot = 0, hgt, wf = 1, txt, gen = 0, hj = 0, vj = 0;
      if (v >= R2000) {
        const df = r.RC();
        el = df & 1 ? 0 : r.RD();
        ins = r.RD2();
        al = df & 2 ? ins : r.DD2(ins);
        e3 = BE(); th = BT();
        if (!(df & 4)) obl = r.RD();
        if (!(df & 8)) rot = r.RD();
        hgt = r.RD();
        if (!(df & 16)) wf = r.RD();
        txt = T();
        if (!(df & 32)) gen = r.BS();
        if (!(df & 64)) hj = r.BS();
        if (!(df & 128)) vj = r.BS();
      } else {
        el = r.BD(); ins = r.RD2(); al = r.RD2(); e3 = r.BD3(); th = r.BD(); obl = r.BD(); rot = r.BD(); hgt = r.BD(); wf = r.BD(); txt = T(); gen = r.BS(); hj = r.BS(); vj = r.BS();
      }
      add3(10, [ins[0], ins[1], el]); add(40, hgt); add(1, txt); add(50, rot * DEG); add(41, wf); add(51, obl * DEG); add(71, gen);
      add(72, hj);
      if (hj || vj) add3(11, [al[0], al[1], el]);
      add(39, th); ext(e3);
      if (kind === 1) add(73, vj);
      else {
        add(74, vj);
        if (v >= R2010) r.RC(); // version
        if (v >= R2018) {
          const t2 = r.RC();
          if (t2 > 1) { rec.skipAttr = true; } // multi-line attribute: text only
        }
        if (!rec.skipAttr) {
          add(2, T());
          r.BS(); // field length
          add(70, r.RC());
        }
      }
      break;
    }
    case 44: { // MTEXT
      add3(10, r.BD3()); ext(r.BD3()); add3(11, r.BD3());
      add(41, r.BD());
      if (v >= R2007) r.BD();
      add(40, r.BD()); add(71, r.BS()); add(72, r.BS());
      r.BD(); r.BD();
      add(1, T());
      break;
    }
    case 77: { // LWPOLYLINE
      const f = r.BS();
      let cw = 0;
      if (f & 4) cw = r.BD();
      const el = f & 8 ? r.BD() : 0;
      const th = f & 2 ? r.BD() : 0;
      const nrm = f & 1 ? r.BD3() : null;
      const np = r.BL();
      const nb = f & 16 ? r.BL() : 0;
      const nid = v >= R2010 && f & 1024 ? r.BL() : 0;
      const nw = f & 32 ? r.BL() : 0;
      if (np > 1e6 || nb > 1e6 || nw > 1e6 || nid > 1e6) throw new Error("bad lwpolyline");
      const pts = [];
      for (let i = 0; i < np; i++) pts.push(v >= R2000 && i ? r.DD2(pts[i - 1]) : r.RD2());
      const bul = [];
      for (let i = 0; i < nb; i++) bul.push(r.BD());
      for (let i = 0; i < nid; i++) r.BL();
      add(70, (f & 512 ? 1 : 0) | (f & 256 ? 128 : 0));
      add(90, np);
      if (cw) add(43, cw);
      add(38, el); add(39, th); ext(nrm);
      pts.forEach((q, i) => { add(10, q[0]); add(20, q[1]); if (bul[i]) add(42, bul[i]); });
      break;
    }
    case 15: { // POLYLINE (2D)
      const fl = r.BS(); r.BS();
      r.BD(); r.BD();
      const th = BT(), el = r.BD(), e3 = BE();
      add(66, 1); add(10, 0); add(20, 0); add(30, el); add(70, fl); add(39, th); ext(e3);
      rec.owned = v >= R2004 ? r.BL() : -1;
      break;
    }
    case 16: { // POLYLINE (3D)
      const c1 = r.RC(), c2 = r.RC();
      add(66, 1); add(70, 8 | (c2 & 1) | (c1 & 3 ? 4 : 0));
      rec.owned = v >= R2004 ? r.BL() : -1;
      break;
    }
    case 29: { // POLYLINE (polyface mesh)
      const nv = r.BS(), nf = r.BS();
      add(66, 1); add(70, 64); add(71, nv); add(72, nf);
      rec.owned = v >= R2004 ? r.BL() : -1;
      break;
    }
    case 30: { // POLYLINE (polygon mesh)
      const fl = r.BS(); r.BS();
      const m = r.BS(), n = r.BS(); r.BS(); r.BS();
      add(66, 1); add(70, 16 | fl); add(71, m); add(72, n);
      rec.owned = v >= R2004 ? r.BL() : -1;
      break;
    }
    case 10: { // VERTEX (2D)
      const fl = r.RC();
      const pt = r.BD3();
      const sw = r.BD();
      if (sw >= 0) r.BD();
      const bulge = r.BD();
      add3(10, pt); add(70, fl); if (bulge) add(42, bulge);
      break;
    }
    case 11: case 12: case 13: { // VERTEX (3D, mesh, polyface)
      const fl = r.RC();
      add3(10, r.BD3());
      add(70, kind === 11 ? fl | 32 : kind === 12 ? fl | 64 : 192);
      break;
    }
    case 14: { // VERTEX (polyface face)
      add(70, 128);
      for (let i = 0; i < 4; i++) add(71 + i, r.BSs());
      break;
    }
    case 7: case 8: { // INSERT, MINSERT
      const ins = r.BD3();
      let sc;
      if (v >= R2000) {
        const f = r.BB();
        if (f === 3) sc = [1, 1, 1];
        else if (f === 1) { const y = r.DD(1); sc = [1, y, r.DD(1)]; } else if (f === 2) { const x = r.RD(); sc = [x, x, x]; } else { const x = r.RD(); const y = r.DD(x); sc = [x, y, r.DD(x)]; }
      } else sc = r.BD3();
      const rot = r.BD();
      const e3 = r.BD3();
      const hasAtt = r.B();
      rec.owned = v >= R2004 && hasAtt ? r.BL() : -1;
      rec.hasAttribs = !!hasAtt;
      add3(10, ins); add(41, sc[0]); add(42, sc[1]); add(43, sc[2]); add(50, rot * DEG); ext(e3);
      if (hasAtt) add(66, 1);
      if (kind === 8) { add(70, r.BS()); add(71, r.BS()); add(44, r.BD()); add(45, r.BD()); }
      break;
    }
    case 20: case 21: case 22: case 23: case 24: case 25: case 26: { // DIMENSION
      if (v >= R2010) r.RC();
      const e3 = r.BD3();
      const mid = r.RD2();
      const el = r.BD();
      r.RC();
      const txt = T();
      const trot = r.BD();
      r.BD(); r.BD3(); r.BD();
      let meas;
      if (v >= R2000) { r.BS(); r.BS(); r.BD(); meas = r.BD(); }
      if (v >= R2007) { r.B(); r.B(); r.B(); }
      r.RD2(); // clone insertion point (12)
      add(1, txt); add3(11, [mid[0], mid[1], el]); add(53, trot * DEG); ext(e3);
      if (meas !== undefined) add(42, meas);
      const P = (c) => add3(c, r.BD3());
      add(70, { 20: 6, 21: 0, 22: 1, 23: 5, 24: 2, 25: 4, 26: 3 }[kind]);
      if (kind === 20) { P(10); P(13); P(14); }
      else if (kind === 21) { P(13); P(14); P(10); r.BD(); add(50, r.BD() * DEG); }
      else if (kind === 22) { P(13); P(14); P(10); }
      else if (kind === 23) { P(10); P(13); P(14); P(15); }
      else if (kind === 24) { r.RD2(); P(13); P(14); P(15); P(10); }
      else { P(10); P(15); }
      break;
    }
    case 36: { // SPLINE
      let sc = r.BL();
      if (v >= R2013) {
        const sf = r.BL(), kp = r.BL();
        if (sf & 1) sc = 2;
        if (kp === 15) sc = 1;
      }
      const deg = r.BL();
      let flags = 0;
      add(71, deg);
      if (sc & 1) {
        const rational = r.B(), closed = r.B(), periodic = r.B();
        r.BD(); r.BD();
        const nk = r.BL(), nc = r.BL(), weighted = r.B();
        if (nk > 1e6 || nc > 1e6) throw new Error("bad spline");
        flags = (closed ? 1 : 0) | (periodic ? 2 : 0) | (rational ? 4 : 0);
        for (let i = 0; i < nk; i++) add(40, r.BD());
        const w = [];
        for (let i = 0; i < nc; i++) { add3(10, r.BD3()); if (weighted) w.push(r.BD()); }
        for (const x of w) add(41, x);
      } else {
        r.BD();
        const t0 = r.BD3(), t1 = r.BD3();
        const nf = r.BL();
        if (nf > 1e6) throw new Error("bad spline");
        const fit = [];
        for (let i = 0; i < nf; i++) fit.push(r.BD3());
        // A DWG keeps only the fit points of a fitted spline (DXF has the
        // control points AutoCAD derives from them): interpolate the same way.
        const bs = fitSpline(fit, t0, t1);
        if (bs) {
          for (const k of bs.knots) add(40, k);
          for (const q of bs.ctrl) add3(10, q);
        }
        for (const q of fit) add3(11, q);
      }
      tags.unshift([70, flags]);
      break;
    }
    case 45: { // LEADER (path only)
      r.B(); r.BS(); r.BS();
      const n = r.BL();
      if (n > 1e5) throw new Error("bad leader");
      for (let i = 0; i < n; i++) add3(10, r.BD3());
      break;
    }
    case 78: hatchTags(r, v, T, add, ext); break;
    default:
      break; // unsupported: the type name alone (the importer reports it)
  }
  // Handles: common first, then the entity's own.
  d.commonHandles(o, true);
  if (kind === 1 || kind === 2 || kind === 3) { /* style */ }
  else if (kind === 7 || kind === 8) {
    rec.block = o.ref();
    if (rec.hasAttribs) {
      if (v <= R2000) { rec.first = o.ref(); rec.last = o.ref(); } else { rec.children = []; for (let i = 0; i < rec.owned; i++) rec.children.push(o.ref()); }
      rec.seqend = o.ref();
    }
  } else if (kind >= 15 && kind <= 16 || kind === 29 || kind === 30) {
    if (v <= R2000) { rec.first = o.ref(); rec.last = o.ref(); } else { rec.children = []; for (let i = 0; i < Math.min(rec.owned, 1e6); i++) rec.children.push(o.ref()); }
    rec.seqend = o.ref();
  } else if (kind >= 20 && kind <= 26) {
    o.ref(); // dimension style
    rec.block = o.ref();
  }
  return rec;
}

/**
 * Cubic B-spline through fit points with chord-length knots and the given
 * end tangents (zero vector → estimated), as AutoCAD builds a fitted spline.
 * → {knots, ctrl} or null.
 */
export function fitSpline(Q, t0 = [0, 0, 0], t1 = [0, 0, 0]) {
  const n = Q.length - 1;
  if (n < 1) return null;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const u = [0];
  for (let k = 1; k <= n; k++) u.push(u[k - 1] + len(sub(Q[k], Q[k - 1])));
  if (!(u[n] > 0)) return null;
  for (let k = 1; k <= n; k++) if (!(u[k] > u[k - 1])) return null; // repeated fit point
  const unit = (a) => { const l = len(a); return l > 1e-12 ? a.map((x) => x / l) : null; };
  // End tangents: given (unit) or Bessel's estimate from three points.
  const bessel = (a, b, c, ua, ub, uc) => {
    if (!c) return sub(b, a).map((x) => x / (ub - ua));
    const d1 = sub(b, a).map((x) => x / (ub - ua)), d2 = sub(c, b).map((x) => x / (uc - ub));
    const al = (ub - ua) / (uc - ua);
    return d1.map((x, i) => (1 + al) * x - al * d2[i]);
  };
  const D0 = unit(t0) || unit(bessel(Q[0], Q[1], Q[2], u[0], u[1], u[2])) || [1, 0, 0];
  const Dn = unit(t1) || unit(bessel(Q[n], Q[n - 1], Q[n - 2], u[n], u[n - 1], u[n - 2]).map((x) => -x)) || [1, 0, 0];
  const knots = [0, 0, 0, 0, ...u.slice(1, n), u[n], u[n], u[n], u[n]];
  const P = new Array(n + 3);
  P[0] = Q[0].slice();
  P[1] = Q[0].map((x, i) => x + (u[1] / 3) * D0[i]);
  P[n + 1] = Q[n].map((x, i) => x - ((u[n] - u[n - 1]) / 3) * Dn[i]);
  P[n + 2] = Q[n].slice();
  if (n >= 2) {
    // Rows k = 1 … n−1: N_k, N_k+1, N_k+2 at u_k (cubic basis, knot span k+3).
    const basis = (span, x) => {
      const N = [1], left = [], right = [];
      for (let j = 1; j <= 3; j++) {
        left[j] = x - knots[span + 1 - j];
        right[j] = knots[span + j] - x;
        let saved = 0;
        for (let r = 0; r < j; r++) {
          const tmp = N[r] / (right[r + 1] + left[j - r]);
          N[r] = saved + right[r + 1] * tmp;
          saved = left[j - r] * tmp;
        }
        N[j] = saved;
      }
      return N; // N[0..3] = N_{span-3} … N_{span}
    };
    const m = n - 1;
    const a = [], b = [], c = [], d = [];
    for (let k = 1; k <= n - 1; k++) {
      const N = basis(k + 3, u[k]);
      a.push(N[0]); b.push(N[1]); c.push(N[2]);
      let rhs = Q[k].slice();
      if (k === 1) rhs = rhs.map((x, i) => x - N[0] * P[1][i]);
      if (k === n - 1) rhs = rhs.map((x, i) => x - N[2] * P[n + 1][i]);
      d.push(rhs);
    }
    // Thomas algorithm over the unknowns P_2 … P_n.
    for (let i = 1; i < m; i++) {
      const w = a[i] / b[i - 1];
      b[i] -= w * c[i - 1];
      d[i] = d[i].map((x, j) => x - w * d[i - 1][j]);
    }
    const X = new Array(m);
    X[m - 1] = d[m - 1].map((x) => x / b[m - 1]);
    for (let i = m - 2; i >= 0; i--) X[i] = d[i].map((x, j) => (x - c[i] * X[i + 1][j]) / b[i]);
    for (let i = 0; i < m; i++) P[i + 2] = X[i];
  }
  if (P.some((q) => q.some((x) => !Number.isFinite(x)))) return null;
  return { knots, ctrl: P };
}

// HATCH: boundary paths in DXF tag order (see hatchLoops in dxf.js).
function hatchTags(r, v, T, add, ext) {
  if (v >= R2004) {
    r.BL(); r.BL(); r.BD(); r.BD(); r.BL(); r.BD();
    const nc = r.BL();
    if (nc > 1000) throw new Error("bad hatch");
    for (let i = 0; i < nc; i++) { r.BD(); readCMC(r, v, T); }
    T();
  }
  const el = r.BD();
  const e3 = r.BD3();
  add(10, 0); add(20, 0); add(30, el); ext(e3);
  add(2, T());
  add(70, r.B()); add(71, r.B());
  const np = r.BL();
  if (np > 1e5) throw new Error("bad hatch");
  add(91, np);
  for (let k = 0; k < np; k++) {
    const flag = r.BL();
    add(92, flag);
    if (!(flag & 2)) {
      const ns = r.BL();
      if (ns > 1e6) throw new Error("bad hatch");
      add(93, ns);
      for (let s = 0; s < ns; s++) {
        const ty = r.RC();
        add(72, ty);
        if (ty === 1) { const a = r.RD2(), b = r.RD2(); add(10, a[0]); add(20, a[1]); add(11, b[0]); add(21, b[1]); }
        else if (ty === 2) { const c = r.RD2(); add(10, c[0]); add(20, c[1]); add(40, r.BD()); add(50, r.BD() * DEG); add(51, r.BD() * DEG); add(73, r.B()); }
        else if (ty === 3) { const c = r.RD2(), m = r.RD2(); add(10, c[0]); add(20, c[1]); add(11, m[0]); add(21, m[1]); add(40, r.BD()); add(50, r.BD() * DEG); add(51, r.BD() * DEG); add(73, r.B()); }
        else if (ty === 4) {
          const deg = r.BL(), rational = r.B(), periodic = r.B(), nk = r.BL(), nc = r.BL();
          if (nk > 1e6 || nc > 1e6) throw new Error("bad hatch");
          add(94, deg); add(73, rational); add(74, periodic); add(95, nk); add(96, nc);
          for (let i = 0; i < nk; i++) add(40, r.BD());
          for (let i = 0; i < nc; i++) { const q = r.RD2(); add(10, q[0]); add(20, q[1]); if (rational) add(42, r.BD()); }
          if (v >= R2010) {
            const nf = r.BL();
            if (nf > 1e6) throw new Error("bad hatch");
            if (nf) {
              add(97, nf);
              for (let i = 0; i < nf; i++) { const q = r.RD2(); add(11, q[0]); add(21, q[1]); }
              const t1 = r.RD2(), t2 = r.RD2();
              add(12, t1[0]); add(22, t1[1]); add(13, t2[0]); add(23, t2[1]);
            }
          }
        } else throw new Error("bad hatch edge");
      }
    } else {
      const bulge = r.B(), closed = r.B(), nv = r.BL();
      if (nv > 1e6) throw new Error("bad hatch");
      add(72, bulge); add(73, closed); add(93, nv);
      for (let i = 0; i < nv; i++) { const q = r.RD2(); add(10, q[0]); add(20, q[1]); if (bulge) add(42, r.BD()); }
    }
    const nb = r.BL();
    add(97, nb);
  }
}

// ================================================================ import

// Emitted with their owner (or implied by the block structure), never alone.
const SKIP_SILENT = new Set(["BLOCK", "ENDBLK", "SEQEND", "VERTEX", "ATTRIB"]);

/**
 * Read a DWG drawing (bytes) into CAD layer geometry, exactly like
 * importDxf: {drawings, texts, layers, units, scale, bounds, warnings,
 * counts, version}.
 */
export function importDwg(input, { level = null, units = "auto" } = {}) {
  const buf = toBytes(input);
  const ver = detectDwgVersion(buf);
  if (!ver) throw new Error("Not a DWG file (unknown signature)");
  if (!ver.supported) throw new Error(`DWG ${ver.release} (${ver.code}) is too old to read: save it as DXF or as a newer DWG`);
  const notes = new Set();
  const warn = (s) => notes.add(s);
  const v = ver.number;
  let c;
  try {
    c = v >= R2007 && v < R2010 ? containerR2007(buf, v, warn) : v >= R2004 ? containerR2004(buf, v, warn) : containerR2000(buf, v);
  } catch (e) {
    if (e instanceof RangeError || /truncated/.test(e.message)) throw truncated();
    throw e;
  }
  const d = new DwgReader(c, warn);
  const cp = c.codepage;

  // Header variables (units). A damaged header only costs the units.
  const vars = {};
  try {
    const hv = headerVars(c.header, v, cp);
    if (hv.INSUNITS >= 0 && hv.INSUNITS <= 20) vars.$INSUNITS = { 70: hv.INSUNITS };
    if (hv.DIMTXT > 0 && hv.DIMTXT < 1e6) vars.$DIMTXT = { 40: hv.DIMTXT };
    d.headerVars = hv;
  } catch { warn("The DWG header could not be read; the units are guessed"); }

  try { d.classes = readClasses(c.classes, v, cp); } catch { warn("The DWG class list could not be read"); }
  const map = readHandleMap(c.handles);
  if (!map.size) throw new Error("The DWG object map is empty or damaged");

  // Pass 1: every object's type and the tables.
  const layers = new Map(); // handle → layer
  const blocks = new Map(); // handle → block header
  const ents = new Map(); // handle → {kind, o}
  let failed = 0;
  for (const [handle, off] of map) {
    let o;
    try {
      o = d.open(off + c.objectsBase);
      let kind = o.type;
      if (kind >= 500) {
        const cl = d.classes.get(kind);
        if (!cl) continue;
        if (CLASS_TYPES[cl.dxf]) kind = CLASS_TYPES[cl.dxf];
        else {
          if (cl.entity) { d.common(o, true); d.commonHandles(o, true); ents.set(handle, { kind: cl.dxf, o }); }
          continue;
        }
      }
      if (kind === T_LAYER) { d.common(o, false); layers.set(handle, d.layer(o)); } else if (kind === T_BLOCK_HEADER) { d.common(o, false); blocks.set(handle, d.blockHeader(o)); } else if (ENTITY_NAMES[kind]) {
        d.common(o, true);
        ents.set(handle, { kind, o });
      }
    } catch {
      failed++;
    }
  }
  if (!layers.size && !ents.size) throw new Error("No drawing objects could be read from this DWG file");
  // Anonymous blocks are stored as just "*D", "*U", … (AutoCAD numbers them
  // when it loads the file): number them so that every name is unique.
  const seenNames = new Set();
  const seq = {};
  for (const b of blocks.values()) {
    let key = b.name.toUpperCase();
    if (/^\*[A-Z]$/.test(key) || seenNames.has(key)) {
      const base = /^\*[A-Z]$/.test(key) ? b.name : `${b.name}~`;
      do { seq[base] = (seq[base] || 0) + 1; b.name = `${base}${seq[base]}`; key = b.name.toUpperCase(); } while (seenNames.has(key));
    }
    seenNames.add(key);
  }

  // Pass 2: entity data → DXF records.
  const recs = new Map();
  for (const [handle, it] of ents) {
    try {
      let rec;
      if (typeof it.kind === "string") { rec = { type: it.kind, tags: [] }; } else rec = entityRecord(d, it.o, it.kind);
      rec.handle = handle;
      rec.owner = it.o.owner;
      rec.entmode = it.o.entmode;
      rec.layerH = it.o.layer;
      rec.color = it.o.color;
      rec.invisible = it.o.invisible;
      rec.next = it.o.next;
      recs.set(handle, rec);
    } catch {
      failed++;
    }
  }
  if (failed) warn(`${failed} DWG object${failed === 1 ? "" : "s"} could not be read and ${failed === 1 ? "was" : "were"} skipped`);

  // Style tags: layer name, colour, invisibility.
  const layerName = (h) => (layers.get(h) || { name: "0" }).name;
  const styled = (rec) => {
    const t = rec.tags;
    t.unshift([8, layerName(rec.layerH)]);
    const col = rec.color || { index: 256 };
    let idx = col.index;
    if (col.rgb !== undefined) {
      const m = col.rgb >>> 24;
      if (m === 0xc2) t.push([420, col.rgb & 0xffffff]);
      else if (m === 0xc3) idx = col.rgb & 0xff;
      else if (m === 0xc0) idx = 256;
      else if (m === 0xc1) idx = 0;
    }
    if (idx !== 256) t.push([62, idx]);
    if (rec.invisible & 1) t.push([60, 1]);
    return rec;
  };

  // Children (vertices, attributes) of a polyline / insert, in order.
  const byOwner = new Map();
  for (const rec of recs.values()) {
    if (rec.owner == null) continue;
    if (!byOwner.has(rec.owner)) byOwner.set(rec.owner, []);
    byOwner.get(rec.owner).push(rec);
  }
  const childrenOf = (rec, type) => {
    let list = [];
    if (rec.children) list = rec.children.map((h) => recs.get(h)).filter(Boolean);
    else {
      const own = (byOwner.get(rec.handle) || []).slice().sort((a, b) => a.handle - b.handle);
      const ix = new Map(own.map((x, i) => [x.handle, i]));
      if (rec.first !== undefined && recs.has(rec.first)) {
        let cur = recs.get(rec.first);
        const seen = new Set();
        while (cur && !seen.has(cur.handle) && seen.size < 1e6) {
          seen.add(cur.handle);
          list.push(cur);
          if (cur.handle === rec.last) break;
          const nx = cur.next !== undefined && cur.next !== 0 && recs.has(cur.next) ? recs.get(cur.next) : own[(ix.get(cur.handle) ?? -2) + 1];
          cur = nx;
        }
      } else list = own;
    }
    return list.filter((x) => x.type === type);
  };

  // Records of one entity in DXF order (with VERTEX/ATTRIB … SEQEND).
  const emitted = new Map(); // type → objects in the file (model space and blocks)
  const emit = (rec, out, paper = false) => {
    if (SKIP_SILENT.has(rec.type)) return;
    if (paper) { out.push({ type: rec.type, tags: [[67, 1]] }); return; }
    emitted.set(rec.type, (emitted.get(rec.type) || 0) + 1);
    if (rec.block !== undefined) {
      const b = blocks.get(rec.block);
      if (b) rec.tags.unshift([2, b.name]);
    }
    out.push(styled(rec));
    if (rec.type === "POLYLINE") {
      for (const vx of childrenOf(rec, "VERTEX")) out.push(styled(vx));
      out.push({ type: "SEQEND", tags: [] });
    } else if (rec.type === "INSERT" && rec.hasAttribs) {
      for (const a of childrenOf(rec, "ATTRIB")) if (!a.skipAttr) out.push(styled(a));
      out.push({ type: "SEQEND", tags: [] });
    }
  };

  let modelH = null, paperH = null;
  for (const [h, b] of blocks) {
    const n = b.name.toUpperCase();
    if (n === "*MODEL_SPACE") modelH = h;
    else if (n === "*PAPER_SPACE") paperH = h;
  }
  const entities = [];
  const blockLists = new Map([...blocks.keys()].map((h) => [h, []]));
  const sorted = [...recs.values()].sort((a, b) => a.handle - b.handle);
  for (const rec of sorted) {
    if (rec.entmode === 2 || (rec.entmode === 0 && rec.owner === modelH && modelH !== null)) emit(rec, entities);
    else if (rec.entmode === 1 || (rec.entmode === 0 && rec.owner === paperH && paperH !== null)) emit(rec, entities, true);
    else if (rec.entmode === 0 && blockLists.has(rec.owner)) emit(rec, blockLists.get(rec.owner));
  }
  // Top-level model space entities per type (like importDxf's counts).
  const topCounts = {};
  for (const r of entities) if (!(r.tags.length === 1 && r.tags[0][0] === 67) && r.type !== "VERTEX" && r.type !== "SEQEND" && r.type !== "ATTRIB") topCounts[r.type] = (topCounts[r.type] || 0) + 1;

  const tables = [...layers.values()].filter((l) => l.name).map((l) => {
    const tags = [[2, l.name]];
    let idx = l.color.index;
    if (l.color.rgb !== undefined && l.color.rgb >>> 24 === 0xc3) idx = l.color.rgb & 0xff;
    if (!l.on && idx > 0) idx = -idx;
    tags.push([62, idx || 7], [70, l.frozen ? 1 : 0]);
    if (l.color.rgb !== undefined && l.color.rgb >>> 24 === 0xc2) tags.push([420, l.color.rgb & 0xffffff]);
    return { type: "LAYER", tags };
  });
  const blockRecs = [];
  for (const [h, b] of blocks) {
    if (h === modelH || h === paperH) continue;
    blockRecs.push({ type: "BLOCK", tags: [[2, b.name], [10, b.base[0]], [20, b.base[1]], [30, b.base[2]], [70, (b.anonymous ? 1 : 0) | (b.xref ? 4 : 0)]] });
    blockRecs.push(...blockLists.get(h));
    blockRecs.push({ type: "ENDBLK", tags: [] });
  }

  const res = importCadRecords({ vars, tables, blocks: blockRecs, entities }, { level, units });
  res.warnings = [...notes, ...res.warnings.map((w) => {
    const m = /^(\S+) entities are not supported and were skipped$/.exec(w);
    return m && emitted.get(m[1]) ? `${w} (${emitted.get(m[1])})` : w;
  })];
  res.counts = topCounts;
  res.version = ver.release;
  return res;
}

// Header section → variables (see sectionStreams).
function headerVars(sec, v, cp) {
  const { r, T } = sectionStreams(sec, v, cp);
  return readHeaderVars(r, v, T);
}
