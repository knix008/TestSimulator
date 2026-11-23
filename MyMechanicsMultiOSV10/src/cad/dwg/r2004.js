// The R2004+ DWG container (Open Design Specification chapter 4; R2010, R2013 and R2018 keep it): a file header
// whose 0x6C bytes at 0x80 are XORed with a fixed sequence, a section page map and a section map (system pages,
// compressed), and data sections made of pages with a masked 32-byte header and LZ77-compressed payload.
// R2007 (AC1021) uses another layout (chapter 5): r2007Sections.
import { crc32, dwgError } from './bits.js';

/** The fixed sequence of 4.1 (also the filler between pages). */
export const MAGIC = (() => {
  const out = new Uint8Array(0x100); let seed = 1;
  for (let i = 0; i < out.length; i++) { seed = (Math.imul(seed, 0x343fd) + 0x269ec3) | 0; out[i] = (seed >> 16) & 0xff; }
  return out;
})();

/** The page checksum of 4.2 (an Adler-like sum in chunks of 0x15b0). */
export function pageChecksum(seed, data, from = 0, to = data.length) {
  let sum1 = seed & 0xffff; let sum2 = seed >>> 16; let i = from;
  while (i < to) {
    const end = Math.min(to, i + 0x15b0);
    for (; i < end; i++) { sum1 += data[i]; sum2 += sum1; }
    sum1 %= 0xfff1; sum2 %= 0xfff1;
  }
  return ((sum2 << 16) | (sum1 & 0xffff)) >>> 0;
}

/** LZ77 decompression of 4.7 into a buffer of `size` bytes. */
export function decompress(src, from, length, size) {
  const out = new Uint8Array(size); let o = 0; let i = from; const end = from + length;
  const byte = () => { if (i >= end) throw dwgError('compressed data ends early'); return src[i++]; };
  const literalLength = () => {
    const b = src[i];
    if (b === undefined || b & 0xf0) return 0;
    i++;
    if (b !== 0) return b + 3;
    let total = 0x0f;
    for (;;) { const x = byte(); if (x === 0) total += 0xff; else { total += x; break; } }
    return total + 3;
  };
  const longCompOffset = () => { let x = byte(); if (x !== 0) return x; let total = 0xff; for (;;) { x = byte(); if (x === 0) total += 0xff; else return total + x; } };
  const twoByteOffset = () => { const a = byte(); const b = byte(); return { offset: (a >> 2) | (b << 6), lit: a & 3 }; };
  const copyLiteral = (n) => { if (o + n > size || i + n > end) throw dwgError('compressed data overruns'); out.set(src.subarray(i, i + n), o); o += n; i += n; };
  copyLiteral(literalLength());
  while (i < end) {
    const op = byte();
    if (op === 0x11) break;
    let count; let offset; let lit;
    if (op >= 0x40) {
      count = ((op & 0xf0) >> 4) - 1;
      const op2 = byte(); offset = (op2 << 2) | ((op & 0x0c) >> 2);
      lit = op & 3; if (lit === 0) lit = literalLength();
    } else if (op === 0x10 || (op >= 0x12 && op <= 0x1f)) {
      count = op === 0x10 ? longCompOffset() + 9 : (op & 0x0f) + 2;
      const t = twoByteOffset(); offset = t.offset + 0x3fff; lit = t.lit || literalLength();
    } else if (op >= 0x20) {
      count = op === 0x20 ? longCompOffset() + 0x21 : op - 0x1e;
      const t = twoByteOffset(); offset = t.offset; lit = t.lit || literalLength();
    } else throw dwgError(`bad compression opcode ${op}`);
    // A back reference: `count` bytes from `offset + 1` bytes back (the copy may overlap itself).
    const from2 = o - offset - 1;
    if (from2 < 0 || o + count > size) throw dwgError('bad back reference');
    for (let k = 0; k < count; k++) out[o + k] = out[from2 + k];
    o += count;
    copyLiteral(lit);
  }
  return out;
}

const u32 = (b, at) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
const i32 = (b, at) => b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24;
const u64 = (b, at) => u32(b, at) + u32(b, at + 4) * 2 ** 32;

/** The decrypted 0x6C-byte file header data of 4.1. */
export function r2004Header(bytes) {
  const h = new Uint8Array(0x6c);
  for (let i = 0; i < 0x6c; i++) h[i] = bytes[0x80 + i] ^ MAGIC[i];
  const id = String.fromCharCode(...h.subarray(0, 11));
  if (id !== 'AcFssFcAJMB') throw dwgError('the R2004 file header is damaged');
  return {
    pageMapId: u32(h, 0x50), pageMapAddress: u64(h, 0x54) + 0x100, sectionMapId: u32(h, 0x5c),
    pageArraySize: u32(h, 0x60), gapArraySize: u32(h, 0x64), lastPageId: u32(h, 0x28), raw: h,
  };
}

/** A system page (section page map, section map): its 0x14-byte header, then the decompressed data. */
function systemPage(bytes, address, type) {
  if (u32(bytes, address) !== type) throw dwgError('a system page is damaged');
  const size = u32(bytes, address + 4); const comp = u32(bytes, address + 8); const kind = u32(bytes, address + 12);
  return kind === 2 ? decompress(bytes, address + 0x14, comp, size) : bytes.slice(address + 0x14, address + 0x14 + size);
}

/**
 * The data sections of an R2004+ file by name (Uint8Array each): AcDb:Header, AcDb:Classes, AcDb:Handles,
 * AcDb:AcDbObjects, … Encrypted sections are left out.
 */
export function r2004Sections(bytes) {
  const header = r2004Header(bytes);
  // Section page map: page number → { address, size } (addresses accumulate from 0x100).
  const pm = systemPage(bytes, header.pageMapAddress, 0x41630e3b);
  const pages = new Map(); let address = 0x100;
  for (let at = 0; at + 8 <= pm.length;) {
    const number = i32(pm, at); const size = u32(pm, at + 4); at += 8;
    if (number < 0) at += 16; else pages.set(number, { address, size });
    address += size;
  }
  const mapPage = pages.get(header.sectionMapId);
  if (!mapPage) throw dwgError('the section map is missing');
  const sm = systemPage(bytes, mapPage.address, 0x4163003b);
  const count = u32(sm, 0);
  const sections = new Map();
  let at = 0x14;
  for (let s = 0; s < count && at + 0x60 <= sm.length; s++) {
    const total = u64(sm, at); const pageCount = u32(sm, at + 8); const maxSize = u32(sm, at + 12);
    const compressed = u32(sm, at + 20); const encrypted = u32(sm, at + 28);
    let name = ''; for (let k = 0; k < 64 && sm[at + 32 + k]; k++) name += String.fromCharCode(sm[at + 32 + k]);
    at += 0x60;
    const refs = [];
    for (let p = 0; p < pageCount; p++) { refs.push({ number: u32(sm, at), dataSize: u32(sm, at + 4), start: u64(sm, at + 8) }); at += 16; }
    if (!name || encrypted === 1) continue;
    const out = new Uint8Array(Math.max(total, 0));
    for (const ref of refs) {
      const page = pages.get(ref.number);
      if (!page) continue;
      // The 32-byte page header, masked with 0x4164536b ^ its address.
      const mask = (0x4164536b ^ page.address) >>> 0;
      const hdr = new Uint8Array(32);
      for (let k = 0; k < 32; k += 4) { const v = (u32(bytes, page.address + k) ^ mask) >>> 0; hdr[k] = v & 255; hdr[k + 1] = (v >>> 8) & 255; hdr[k + 2] = (v >>> 16) & 255; hdr[k + 3] = v >>> 24; }
      if (u32(hdr, 0) !== 0x4163043b) throw dwgError(`a page of ${name} is damaged`);
      const dataSize = u32(hdr, 8);
      const payload = compressed === 2 ? decompress(bytes, page.address + 32, dataSize, maxSize) : bytes.subarray(page.address + 32, page.address + 32 + maxSize);
      const take = Math.max(0, Math.min(maxSize, total - ref.start));
      out.set(payload.subarray(0, take), ref.start);
    }
    sections.set(name, out);
  }
  return sections;
}

/** R2007 (AC1021): its own paged layout with Reed–Solomon coded pages (chapter 5) — see r2007.js. */
export { r2007Sections } from './r2007.js';

export { crc32 };
