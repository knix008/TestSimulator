// Writing the R2007 (AC1021) container (Open Design Specification chapter 5; read back by r2007.js), after
// LibreDWG's encode_r2007.c:
//
//   0x000  the fixed start, 0x80 bytes (as R2004+: version, code page, …)
//   0x080  the file header, 0x400 bytes: 3 Reed–Solomon (255,239) code words, interleaved, holding the 0x110-byte
//          header (stored, not compressed: a negative length) with its CRC-64 check sequence, then check data
//   0x480  the pages map and its copy, the data pages of every section (RS(255,251) coded, interleaved), the
//          sections map and its copy, and the file header again.
//
// System pages (the two maps) repeat their data as often as fits and carry RS(255,239) parity; data pages carry
// RS(255,251) parity, interleaved (encoding 4) or after the data (encoding 1: AppInfo, SummaryInfo). Pages are stored
// uncompressed (the reader copies a page whose compressed size equals its size). Checksums: a 32-bit one per data
// page over its data, 64-bit CRCs (ECMA-182, normal and mirrored) of pages and maps, and the file header's check
// values from the specification's random generator. Every algorithm was checked against a file AutoCAD wrote.
// The sections are AutoCAD's but for AppInfoHistory (undocumented; LibreDWG leaves it out as well).
import { R2007, dwgError } from './bits.js';
import { fixedHeader, auxHeaderSection, concat } from './r2004-write.js';

const M64 = (1n << 64n) - 1n;
const DATA_START = 0x480;
const HEADER_SIZE = 0x400;
const PAGE_MAX = 0xf800;
const FIRST_ID = 3;
const RANDOM_SEED = 0x24cc9552adddcbdbn;
const ROUND8 = (x) => (x + 7) & ~7;
const ROUND32 = (x) => (x + 31) & ~31;

const putLE64 = (b, at, v) => { let x = BigInt.asUintN(64, BigInt(v)); for (let i = 0; i < 8; i++) { b[at + i] = Number(x & 0xffn); x >>= 8n; } };
const putLE32 = (b, at, v) => { b[at] = v & 255; b[at + 1] = (v >>> 8) & 255; b[at + 2] = (v >>> 16) & 255; b[at + 3] = (v >>> 24) & 255; };

/** Sections: their hash code, largest page size and encoding (4: Reed–Solomon interleaved pages, 1: raw pages). */
const SECTION_INFO = {
  'AcDb:AppInfo': [0x3fa0043e, 0x300, 1], 'AcDb:SummaryInfo': [0x717a060f, 0x80, 1], 'AcDb:RevHistory': [0x60a205b3, 0x1000, 4],
  'AcDb:AcDbObjects': [0x674c05a9, 0xf800, 4], 'AcDb:ObjFreeSpace': [0x77e2061f, 0xf800, 4], 'AcDb:Template': [0x4a1404ce, 0x400, 4],
  'AcDb:Handles': [0x3f6e0450, 0xf800, 4], 'AcDb:Classes': [0x3f54045f, 0xf800, 4], 'AcDb:AuxHeader': [0x54f0050a, 0x800, 4], 'AcDb:Header': [0x32b803d9, 0x800, 4],
};
/** The order of the sections in the file, as AutoCAD writes them. */
const ORDER = ['AcDb:AppInfo', 'AcDb:SummaryInfo', 'AcDb:RevHistory', 'AcDb:AcDbObjects', 'AcDb:ObjFreeSpace', 'AcDb:Template', 'AcDb:Handles', 'AcDb:Classes', 'AcDb:AuxHeader', 'AcDb:Header'];

// ───────────────────────── the small sections (LibreDWG's appinfo.spec, summaryinfo.spec, revhistory.spec)

/** UTF-16 text with its length (terminator included) as a 2-byte count. */
const T16 = (text) => { const t = `${text}\0`; const b = new Uint8Array(2 + 2 * t.length); b[0] = t.length & 255; b[1] = t.length >> 8; for (let i = 0; i < t.length; i++) { b[2 + 2 * i] = t.charCodeAt(i) & 255; b[3 + 2 * i] = t.charCodeAt(i) >> 8; } return b; };
const RL = (v) => { const b = new Uint8Array(4); putLE32(b, 0, v >>> 0); return b; };
/** The application that wrote the file: version 3, "AppInfoDataList", three strings each after a 16-byte checksum. */
export function appInfoSection(appName = 'MyMechanics', appVersion = '1.0.0') {
  const product = `<ProductInformation name ="${appName}" build_version="${appVersion}" registry_version="${appVersion}" install_id_string="${appName}" registry_localeID="1033"/>`;
  return concat([RL(3), T16('AppInfoDataList'), RL(3), new Uint8Array(16), T16(appVersion), new Uint8Array(16), T16(''), new Uint8Array(16), T16(product)]);
}
/** The drawing properties: empty texts, the time in the drawing, created and updated (Julian day and ms), no custom ones. */
export function summaryInfoSection(jd) {
  const time = (d) => concat([RL(Math.floor(d)), RL(Math.round((d % 1) * 86400000))]);
  return concat([...Array.from({ length: 8 }, () => T16('')), time(0), time(jd), time(jd), new Uint8Array(2), RL(0), RL(0)]);
}
/** No revision history. */
export const revHistorySection = () => concat([RL(0), RL(0), RL(0)]);

/** AutoCAD's padding: the first 0x80 words of the random table of RANDOM_SEED, little endian, repeating every 512 bytes. */
let PAD = null;
const padFill = (dst, from, len, off) => {
  if (!PAD) { const r = new Rng(RANDOM_SEED); PAD = new Uint8Array(512); for (let i = 0; i < 0x80; i++) putLE32(PAD, 4 * i, r.table[i]); }
  for (let i = 0; i < len; i++) dst[from + i] = PAD[(off + i) % 512];
};

// ───────────────────────── 64-bit CRCs (5.12)

const CRC_NORMAL = new Array(256); const CRC_MIRRORED = new Array(256);
for (let i = 0; i < 256; i++) {
  let n = BigInt(i) << 56n; let m = BigInt(i);
  for (let j = 0; j < 8; j++) {
    n = n >> 63n ? ((n << 1n) & M64) ^ 0x42f0e1eba9ea3693n : (n << 1n) & M64;
    m = m & 1n ? (m >> 1n) ^ 0x95ac9329ac4bc9b5n : m >> 1n;
  }
  CRC_NORMAL[i] = n; CRC_MIRRORED[i] = m;
}
export function crcSeed1(seed, len) {
  let s = (BigInt(seed) + BigInt(len)) * 0x343fdn + 0x269ec3n & M64;
  s = s | ((s * (0x343fdn << 32n) + (0x269ec3n << 32n)) & M64);
  return ~s & M64;
}
export function crcSeed2(seed, len) {
  let s = (BigInt(seed) + BigInt(len)) * 0x343fdn + 0x269ec3n & M64;
  s = (s * ((1n << 32n) + 0x343fdn) + (BigInt(len) + 0x269ec3n)) & M64;
  return ~s & M64;
}
const BLK = [6, 7, 4, 5, 2, 3, 0, 1];
const TAIL = [[], [0], [0, 1], [0, 1, 2], [2, 3, 0, 1], [2, 3, 0, 1, 4], [2, 3, 0, 1, 4, 5], [2, 3, 0, 1, 4, 5, 6]];
/** The CRC-64 of n bytes from `crc`: blocks of 8 in the order of their 2-byte words 3, 2, 1, 0; the rest as 5.12. */
export function crc64(normal, crc, p, n = p.length) {
  let c = BigInt.asUintN(64, crc);
  const step = (b) => { c = normal ? CRC_NORMAL[(b ^ Number(c >> 56n)) & 0xff] ^ ((c << 8n) & M64) : CRC_MIRRORED[(Number(c & 0xffn) ^ b) & 0xff] ^ (c >> 8n); };
  let i = 0;
  for (; i + 8 <= n; i += 8) for (const j of BLK) step(p[i + j]);
  const rest = n & 7;
  for (let j = 0; j < (rest === 1 ? 1 : TAIL[rest].length); j++) step(p[i + TAIL[rest][j]]);
  return normal ? ~c & M64 : c;
}

/** The 32-bit checksum of a data page (5.4.1). */
export function pageChecksum2007(seed0, p, length = p.length) {
  const seed = (seed0 + length) * 0x343fd + 0x269ec3;
  let sum1 = seed % 0x10000; let sum2 = Math.floor(seed / 0x10000) % 0x10000;
  let at = 0;
  while (length) {
    const big = Math.min(length, 0x15b0);
    length -= big;
    let i = 0;
    for (; i + 8 <= big; i += 8) {
      for (let j = 3; j >= 0; j--) {
        sum1 = (sum1 + p[at + 2 * j]) >>> 0; sum2 = (sum2 + sum1) >>> 0;
        sum1 = (sum1 + p[at + 2 * j + 1]) >>> 0; sum2 = (sum2 + sum1) >>> 0;
      }
      at += 8;
    }
    const rest = big & 7;
    for (let j = 0; j < rest; j++) { sum1 = (sum1 + p[at + (rest === 1 ? 0 : TAIL[rest][j])]) >>> 0; sum2 = (sum2 + sum1) >>> 0; }
    at += rest;
    sum1 %= 0xfff1; sum2 %= 0xfff1;
  }
  return ((sum2 << 16) | (sum1 & 0xffff)) >>> 0;
}

/** The rotation of a 64-bit value by control & 0x1f bits (5.2.1.1.5). */
const crcShift = (value, control) => { const k = BigInt(Number(BigInt.asUintN(64, control) & 0x1fn)); const v = BigInt.asUintN(64, value); return k ? ((v << k) | (v >> (64n - k))) & M64 : v; };

// ───────────────────────── the specification's random generator (5.11)

class Rng {
  constructor(seed) {
    this.table = new Uint32Array(0x270);
    const s = BigInt.asUintN(64, seed);
    this.table[0] = (Math.imul(Number(s & 0xffffffffn), 0x343fd) + 0x269ec3) >>> 0;
    this.table[1] = (Math.imul(Number(s >> 32n), 0x343fd) + 0x269ec3) >>> 0;
    let value = this.table[1];
    for (let i = 2; i < 0x270; i++) { value = (Math.imul((value >>> 0x1e) ^ value, 0x6c078965) + i) >>> 0; this.table[i] = value; }
    this.index = 0x80;
  }
  next() { this.index += 2; if (this.index >= 0x270) this.index = 0; return BigInt(this.table[this.index]) | (BigInt(this.table[this.index + 1]) << 32n); }
  /** The 10 low bits of value spread into a random 64-bit value. */
  encode(value) {
    const r = this.next();
    let lo = Number(r & 0xdf7df7dfn) >>> 0; let hi = Number((r >> 32n) & 0xf7df7df7n) >>> 0;
    if (value & 0x200) lo |= 0x20; if (value & 0x100) lo |= 0x800; if (value & 0x80) lo |= 0x20000; if (value & 0x40) lo |= 0x800000; if (value & 0x20) lo |= 0x20000000;
    if (value & 0x10) hi |= 0x08; if (value & 0x8) hi |= 0x200; if (value & 0x4) hi |= 0x8000; if (value & 0x2) hi |= 0x200000; if (value & 0x1) hi |= 0x8000000;
    return BigInt(lo >>> 0) | (BigInt(hi >>> 0) << 32n);
  }
}

// ───────────────────────── Reed–Solomon (LibreDWG's reedsolomon.c)

/** A code over GF(256) with `poly`, `nroots` parity bytes, the generator's roots α^1 … α^nroots. */
function rsCode(poly, nroots) {
  const exp = new Uint8Array(510); const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= poly; }
  for (let i = 255; i < 510; i++) exp[i] = exp[i - 255];
  const mul = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);
  const gen = new Uint8Array(nroots + 1); gen[0] = 1;
  for (let i = 0; i < nroots; i++) {
    const root = exp[(1 + i) % 255];
    for (let j = i + 1; j > 0; j--) gen[j] = gen[j - 1] ^ mul(gen[j], root);
    gen[0] = mul(gen[0], root);
  }
  return { nroots, exp, log, mul, gen };
}
export const RS_SYSTEM = rsCode(0x169, 16);
export const RS_DATA = rsCode(0x11d, 4);
/** The parity of `count` data bytes (the remainder of X^nroots · data(X) by the generator; data[count−1] highest). */
export function rsParity(code, src, count) {
  const np = code.nroots; const parity = new Uint8Array(np);
  for (let i = count - 1; i >= 0; i--) {
    const lead = parity[np - 1] ^ src[i];
    for (let j = np - 1; j > 0; j--) parity[j] = parity[j - 1] ^ code.mul(lead, code.gen[j]);
    parity[0] = code.mul(lead, code.gen[0]);
  }
  return parity;
}
/** The syndromes of a 255-byte code word (all zero when it is consistent). */
export function rsSyndromes(code, blk) {
  const out = [];
  for (let i = 0; i < code.nroots; i++) {
    const x = code.exp[(1 + i) % 255]; let r = 0;
    // The code word as a polynomial: parity (degrees 0 … nroots−1) then the data (degrees nroots …).
    const k = 255 - code.nroots;
    for (let d = k - 1; d >= 0; d--) r = code.mul(r, x) ^ blk[d];
    for (let d = code.nroots - 1; d >= 0; d--) r = code.mul(r, x) ^ blk[k + d];
    out.push(r);
  }
  return out;
}

/** The payload repeated `repeat` times (each copy at a multiple of 8), cut into blocks of `k`, with parity, interleaved. */
function rsEncodePage(src, size, repeat, k) {
  const unit = ROUND8(size);
  const blocks = Math.ceil((unit * repeat) / k);
  const pe = new Uint8Array(blocks * k);
  for (let r = 0; r < repeat; r++) if (size) pe.set(src.subarray(0, size), r * unit);
  const out = new Uint8Array(blocks * 255);
  const code = k === 239 ? RS_SYSTEM : RS_DATA;
  for (let i = 0; i < blocks; i++) {
    const blk = new Uint8Array(255);
    blk.set(pe.subarray(i * k, i * k + k));
    blk.set(rsParity(code, blk, k), k);
    for (let j = 0; j < 255; j++) out[i + j * blocks] = blk[j];
  }
  return { bytes: out, blocks };
}

/**
 * A data page: RS(255,251) coded and interleaved (encoding 4), padded to 32 — or raw (encoding 1): the data padded to
 * 8, then the 4 parity bytes of each block of 251 (the last block completed with the padding table), then padding.
 * Its data checksum and CRC-64.
 */
function dataPage(src, encoding = 4) {
  const n = src.length;
  const sums = { sizeComp: n, checksum: pageChecksum2007(0, src, n), crc: crc64(false, crcSeed1(0, n), src, n) };
  if (encoding === 1) {
    const n8 = ROUND8(n); const bc = Math.ceil(n8 / 251);
    const data = new Uint8Array(ROUND32(n8 + 4 * bc)); data.set(src);
    for (let i = 0; i < bc; i++) {
      const have = Math.min(251, n8 - i * 251);
      const blk = new Uint8Array(255); blk.set(data.subarray(i * 251, i * 251 + have));
      if (have < 251) padFill(blk, have, 251 - have, 0);
      data.set(rsParity(RS_DATA, blk, 251), n8 + 4 * i);
    }
    padFill(data, n8 + 4 * bc, data.length - (n8 + 4 * bc), 0);
    return { data, used: n8 + 4 * bc, ...sums };
  }
  const { bytes, blocks } = rsEncodePage(src, n, 1, 251);
  const data = new Uint8Array(ROUND32(blocks * 255)); data.set(bytes);
  return { data, ...sums };
}

/** A system page: its data repeated as often as fits a page of at least 0x400 bytes, RS(255,239) coded. */
function systemPage(src) {
  const size = src.length;
  let pagesize = Math.floor((ROUND8(size) * 2 + 238) / 239) * 255;
  pagesize = pagesize < 0x400 ? 0x400 : ROUND32(pagesize);
  const repeat = Math.floor((Math.floor(pagesize / 255) * 239) / ROUND8(size));
  const { bytes } = rsEncodePage(src, size, repeat, 239);
  const data = new Uint8Array(pagesize); data.set(bytes);
  const crc = crc64(false, crcSeed1(0, size), src, size);
  return { data, size: pagesize, repeat, sizeComp: size, sizeUncomp: size, crcComp: crc, crcUncomp: crc };
}

/** The sections map: each section's description and UTF-16 name, then its pages; an empty section closes it. */
function sectionsMap(secs) {
  const parts = [];
  for (const s of secs) {
    const d = new Uint8Array(64 + 2 * s.name.length + 2 + 56 * s.pages.length);
    putLE64(d, 0, s.dataSize); putLE64(d, 8, s.maxSize); putLE64(d, 16, 0); putLE64(d, 24, s.hash);
    putLE64(d, 32, 2 * s.name.length + 2); putLE64(d, 40, 0); putLE64(d, 48, s.encoding); putLE64(d, 56, s.pages.length);
    for (let c = 0; c < s.name.length; c++) d[64 + 2 * c] = s.name.charCodeAt(c);
    let at = 64 + 2 * s.name.length + 2;
    for (const p of s.pages) {
      putLE64(d, at, p.offset); putLE64(d, at + 8, Math.max(ROUND8(p.usize), s.maxSize)); putLE64(d, at + 16, p.id);
      putLE64(d, at + 24, p.usize); putLE64(d, at + 32, p.csize); putLE64(d, at + 40, p.checksum); putLE64(d, at + 48, p.crc);
      at += 56;
    }
    parts.push(d);
  }
  const empty = new Uint8Array(64); putLE64(empty, 8, PAGE_MAX); putLE64(empty, 48, 4);
  parts.push(empty);
  return concat(parts);
}

/** The 0x400 bytes of the file header (5.2.1): the check sequence, the header, 3 RS code words, the check data. */
function fileHeaderBytes(hbuf, key, r1, r2, chkSeed) {
  const pe = new Uint8Array(3 * 239);
  const out = new Uint8Array(HEADER_SIZE);
  const len = -hbuf.length; // stored, not compressed
  const n = hbuf.length;
  const unit = ROUND8(32 + n);
  const seq = new Uint8Array(16); putLE64(seq, 0, key); putLE64(seq, 8, crcShift(key, key));
  putLE64(pe, 0, crc64(true, crcSeed1(0, 16), seq, 16));
  putLE64(pe, 8, key);
  putLE64(pe, 16, crc64(true, crcSeed2(0, n), hbuf, n));
  putLE32(pe, 24, len >>> 0); putLE32(pe, 28, 0);
  pe.set(hbuf, 32);
  for (let i = 1; (i + 1) * unit <= pe.length; i++) pe.copyWithin(i * unit, 0, unit);
  for (let i = 0; i < 3; i++) {
    const blk = new Uint8Array(255); blk.set(pe.subarray(i * 239, i * 239 + 239)); blk.set(rsParity(RS_SYSTEM, blk, 239), 239);
    for (let j = 0; j < 255; j++) out[i + 3 * j] = blk[j];
  }
  const buf = new Uint8Array(64); const b = new Array(8);
  b[0] = crcShift(r1, r2); b[1] = crcShift(b[0], b[0]); b[2] = crcShift(r2, b[1]); b[3] = crcShift(b[2], b[2]);
  b[4] = crcShift(r1, b[3]); b[5] = crcShift(b[4], b[4]); b[6] = crcShift(b[5], b[5]); b[7] = crcShift(b[6], b[6]);
  b.forEach((v, i) => putLE64(buf, 8 * i, v));
  const normal = crc64(true, ~r2 & M64, buf, 64);
  b[0] = crcShift(r1, r2); b[1] = crcShift(normal, b[0]); b[2] = crcShift(r2, b[1]); b[3] = crcShift(normal, b[2]);
  b[4] = crcShift(r1, b[3]); b[5] = crcShift(normal, b[4]); b[6] = crcShift(r2, b[5]); b[7] = crcShift(b[6], b[6]);
  b.forEach((v, i) => putLE64(buf, 8 * i, v));
  const mirrored = crc64(false, ~r1 & M64, buf, 64);
  putLE64(out, 0x3d8, normal); putLE64(out, 0x3e0, mirrored); putLE64(out, 0x3e8, r1); putLE64(out, 0x3f0, r2); putLE64(out, 0x3f8, chkSeed);
  return out;
}

/** The file bytes from the sections' contents (as r2004File takes them). */
export function r2007File({ header, classes, handles, objects, objFreeSpace, template, handseed, jd, appVersion = '1.0.0', extra = [] }) {
  const content = {
    'AcDb:AppInfo': appInfoSection('MyMechanics', appVersion), 'AcDb:SummaryInfo': summaryInfoSection(jd), 'AcDb:RevHistory': revHistorySection(),
    'AcDb:AcDbObjects': objects, 'AcDb:ObjFreeSpace': objFreeSpace, 'AcDb:Template': template, 'AcDb:Handles': handles,
    'AcDb:Classes': classes, 'AcDb:AuxHeader': auxHeaderSection(handseed, jd, R2007), 'AcDb:Header': header,
  };
  let nextId = FIRST_ID;
  const pages = []; const secs = [];
  // `extra`: more sections [name, bytes, [hash, page size, encoding]], first (tests).
  for (const [name, data] of extra) content[name] = data;
  const info = { ...SECTION_INFO, ...Object.fromEntries(extra.map(([name, , i]) => [name, i])) };
  for (const name of [...extra.map(([name]) => name), ...ORDER]) {
    const data = content[name];
    if (!data?.length) continue;
    const [hash, max, encoding] = info[name];
    const sec = { name, hash, encoding, dataSize: data.length, maxSize: max, pages: [], first: pages.length };
    for (let pos = 0; pos < data.length; pos += PAGE_MAX) {
      const src = data.subarray(pos, Math.min(data.length, pos + PAGE_MAX));
      const pg = dataPage(src, encoding);
      pg.id = nextId++;
      if (ROUND8(src.length) > sec.maxSize) sec.maxSize = ROUND8(src.length);
      if (encoding === 1) {
        // A raw section's size is its data rounded to 0x80; its page is never smaller than that coded (AutoCAD reads
        // past a shorter one).
        sec.maxSize = Math.ceil(data.length / 0x80) * 0x80;
        const psize = ROUND32(sec.maxSize + 4 * Math.ceil(sec.maxSize / 251));
        if (psize > pg.data.length) { const grown = new Uint8Array(psize); grown.set(pg.data); padFill(grown, pg.data.length, psize - pg.data.length, pg.data.length - pg.used); pg.data = grown; }
      }
      pages.push(pg);
      sec.pages.push({ offset: pos, id: pg.id, usize: src.length, csize: pg.sizeComp, checksum: pg.checksum, crc: pg.crc });
    }
    secs.push(sec);
  }
  const secmap = sectionsMap(secs);
  const sm = [systemPage(secmap), systemPage(secmap)];
  sm[0].id = nextId++; sm[1].id = nextId++;
  // The pages map lists every page in file order (its own two copies first); its size does not depend on its content.
  const pm = [{ id: nextId++ }, { id: nextId++ }];
  const listed = pages.length + 4;
  const map = new Uint8Array(16 * listed);
  const probe = systemPage(map);
  const entries = [[probe.size, pm[0].id], [probe.size, pm[1].id], ...pages.map((p) => [p.data.length, p.id]), [sm[0].size, sm[0].id], [sm[1].size, sm[1].id]];
  entries.forEach(([size, id], i) => { putLE64(map, 16 * i, size); putLE64(map, 16 * i + 8, id); });
  Object.assign(pm[0], systemPage(map)); Object.assign(pm[1], systemPage(map));
  if (pm[0].size !== probe.size) throw dwgError('DWG R2007 page map size mismatch', 'dwg-write');

  let total = DATA_START + pm[0].size + pm[1].size;
  for (const p of pages) total += p.data.length;
  total += sm[0].size + sm[1].size;
  const header2 = total - DATA_START;
  total += HEADER_SIZE;

  const rng = new Rng(RANDOM_SEED);
  const r1 = rng.next(); const r2 = rng.next(); const chkSeed = rng.encode(0); const key = rng.next();
  const hb = new Uint8Array(0x110);
  const F = (at, v) => putLE64(hb, at, v);
  F(0x00, 0x70); F(0x08, total); F(0x10, pm[0].crcComp); F(0x18, pm[0].repeat); F(0x20, rng.encode(0)); F(0x28, pm[0].size); F(0x30, pm[1].id);
  F(0x38, 0); F(0x40, pm[0].id); F(0x48, header2); F(0x50, pm[0].sizeComp); F(0x58, pm[0].sizeUncomp); F(0x60, listed); F(0x68, nextId - 1);
  F(0x70, 0x20); F(0x78, 0x40); F(0x80, pm[0].crcUncomp); F(0x88, 0xf800); F(0x90, 4); F(0x98, 1); F(0xa0, secs.length + 1);
  F(0xa8, sm[0].crcUncomp); F(0xb0, sm[0].sizeComp); F(0xb8, sm[1].id); F(0xc0, sm[0].id); F(0xc8, sm[0].sizeUncomp); F(0xd0, sm[0].crcComp);
  F(0xd8, sm[0].repeat); F(0xe0, rng.encode(0)); F(0xe8, 0x60100); F(0xf0, 0); F(0xf8, rng.encode(0)); F(0x100, RANDOM_SEED);
  F(0x108, 0); F(0x108, crc64(true, crcSeed2(0, hb.length), hb, hb.length));
  const fh = fileHeaderBytes(hb, key, r1, r2, chkSeed);

  const fixed = fixedHeader(R2007).subarray(0, 0x80);
  putLE32(fixed, 0x28, 0x80);
  // Where the summary and the application information start (their first page).
  const pageAt = (k) => DATA_START + pm[0].size + pm[1].size + pages.slice(0, k).reduce((n, p) => n + p.data.length, 0);
  for (const sec of secs) { if (sec.name === 'AcDb:SummaryInfo') putLE32(fixed, 0x20, pageAt(sec.first)); if (sec.name === 'AcDb:AppInfo') putLE32(fixed, 0x2c, pageAt(sec.first)); }
  const out = concat([fixed, fh, pm[0].data, pm[1].data, ...pages.map((p) => p.data), sm[0].data, sm[1].data, fh]);
  if (out.length !== total) throw dwgError('DWG R2007 layout mismatch', 'dwg-write');
  return out;
}
