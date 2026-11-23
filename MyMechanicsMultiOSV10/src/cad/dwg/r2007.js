// The R2007 (AC1021) DWG layout (Open Design Specification chapter 5): a Reed–Solomon coded file header at 0x80,
// a page map and a section map (system pages, RS(255,239) interleaved, optionally compressed), and data pages
// (RS(255,251), interleaved for the compressed sections) with the R21 compression of 5.10. Reading only needs the
// data bytes of each code word — the error correction (parity) is not used.
import { dwgError } from './bits.js';

const u32 = (b, at) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
const i32 = (b, at) => b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24;
const u64 = (b, at) => u32(b, at) + u32(b, at + 4) * 2 ** 32;
const i64 = (b, at) => u32(b, at) + i32(b, at + 4) * 2 ** 32;

/** The data bytes of `blocks` interleaved RS code words of `k` data bytes (byte i of block j at i·blocks + j). */
function deinterleave(src, at, blocks, k) {
  const out = new Uint8Array(blocks * k);
  for (let j = 0; j < blocks; j++) for (let i = 0; i < k; i++) out[j * k + i] = src[at + i * blocks + j] ?? 0;
  return out;
}

// The byte orders of 5.10.1 for copying 1–32 literal bytes: [block size, source offset] parts, applied recursively.
const COPY_PARTS = {
  1: [[1, 0]], 2: [[1, 1], [1, 0]], 3: [[1, 2], [1, 1], [1, 0]], 4: [[1, 0], [1, 1], [1, 2], [1, 3]], 5: [[1, 4], [4, 0]],
  6: [[1, 5], [4, 1], [1, 0]], 7: [[2, 5], [4, 1], [1, 0]], 8: [[4, 0], [4, 4]], 9: [[1, 8], [8, 0]], 10: [[1, 9], [8, 1], [1, 0]],
  11: [[2, 9], [8, 1], [1, 0]], 12: [[4, 8], [8, 0]], 13: [[1, 12], [4, 8], [8, 0]], 14: [[1, 13], [4, 9], [8, 1], [1, 0]],
  15: [[2, 13], [4, 9], [8, 1], [1, 0]], 16: [[8, 8], [8, 0]], 17: [[8, 9], [1, 8], [8, 0]], 18: [[1, 17], [16, 1], [1, 0]],
  19: [[3, 16], [16, 0]], 20: [[4, 16], [16, 0]], 21: [[1, 20], [4, 16], [16, 0]], 22: [[2, 20], [4, 16], [16, 0]],
  23: [[3, 20], [4, 16], [16, 0]], 24: [[8, 16], [16, 0]], 25: [[8, 17], [1, 16], [16, 0]], 26: [[1, 25], [8, 17], [1, 16], [16, 0]],
  27: [[2, 25], [8, 17], [1, 16], [16, 0]], 28: [[4, 24], [8, 16], [16, 0]], 29: [[1, 28], [4, 24], [8, 16], [16, 0]],
  30: [[2, 28], [4, 24], [8, 16], [16, 0]], 31: [[1, 30], [4, 26], [8, 18], [16, 2], [2, 0]], 32: [[16, 16], [16, 0]],
};
const ORDER = {};
const orderOf = (n) => {
  if (ORDER[n]) return ORDER[n];
  if (n === 1) return (ORDER[1] = [0]);
  const out = [];
  for (const [size, at] of COPY_PARTS[n]) for (const k of orderOf(size)) out.push(at + k);
  return (ORDER[n] = out);
};

/** R21 decompression (5.10) of `length` bytes at `from` into `size` bytes. */
export function decompress21(src, from, count, size) {
  const out = new Uint8Array(size); let o = 0; let i = from; const end = from + count;
  const literal = (n) => {
    if (o + n > size || i + n > end) throw dwgError('R21 literal overruns');
    let left = n;
    while (left >= 32) { const ord = orderOf(32); for (let k = 0; k < 32; k++) out[o + k] = src[i + ord[k]]; o += 32; i += 32; left -= 32; }
    if (left) { const ord = orderOf(left); for (let k = 0; k < left; k++) out[o + k] = src[i + ord[k]]; o += left; i += left; }
  };
  const literalLength = (op) => {
    let n = op + 8;
    if (n === 0x17) {
      let x = src[i++]; n += x;
      if (x === 0xff) { do { x = src[i] | (src[i + 1] << 8); i += 2; n += x; } while (x === 0xffff); }
    }
    return n;
  };
  let op = src[i++]; let length = 0;
  if ((op & 0xf0) === 0x20) { i += 2; length = src[i++] & 7; }
  const instruction = () => {
    let len; let off;
    switch (op >> 4) {
      case 0: len = (op & 0xf) + 0x13; off = src[i++]; op = src[i++]; len += (op >> 3) & 0x10; off = ((op & 0x78) << 5) + 1 + off; break;
      case 1: len = (op & 0xf) + 3; off = src[i++]; op = src[i++]; off = ((op & 0xf8) << 5) + 1 + off; break;
      case 2:
        off = src[i++]; off |= (src[i++] << 8) & 0xff00; len = op & 7;
        if ((op & 8) === 0) { op = src[i++]; len += op & 0xf8; }
        else { off++; len += src[i++] << 3; op = src[i++]; len += ((op & 0xf8) << 8) + 0x100; }
        break;
      default: len = op >> 4; off = op & 15; op = src[i++]; off = ((op & 0xf8) << 1) + off + 1; break;
    }
    return { len, off };
  };
  while (i < end) {
    if (length === 0) length = literalLength(op);
    literal(length); length = 0;
    if (i >= end) break;
    op = src[i++];
    let { len, off } = instruction();
    for (;;) {
      if (off > o || o + len > size) throw dwgError('R21 back reference out of range');
      for (let k = 0; k < len; k++) out[o + k] = out[o - off + k];
      o += len;
      length = op & 7;
      if (length !== 0 || i >= end) break;
      op = src[i++];
      if ((op >> 4) === 0) break;
      if ((op >> 4) === 15) op &= 15;
      ({ len, off } = instruction());
    }
  }
  return out;
}

/** A system page: RS(255,239) interleaved, the data repeated `factor` times, compressed when smaller. */
function systemPage(bytes, address, compSize, size, factor) {
  const pesize = ((compSize + 7) & ~7) * factor;
  const blocks = Math.floor((pesize + 238) / 239);
  const data = deinterleave(bytes, address, blocks, 239);
  return compSize < size ? decompress21(data, 0, compSize, size) : data.slice(0, size);
}

/** The data sections of an R2007 file by name. */
export function r2007Sections(bytes) {
  // File header: 3 interleaved RS(255,239) code words at 0x80.
  const fh = deinterleave(bytes, 0x80, 3, 239);
  const comprLen = i32(fh, 0x18);
  const hdr = comprLen < 0 ? fh.slice(0x20, 0x20 - comprLen) : decompress21(fh, 0x20, comprLen, 0x110);
  const H = (at) => u64(hdr, at);
  const pagesMapOffset = H(0x38) + 0x480;
  const pm = systemPage(bytes, pagesMapOffset, H(0x50), H(0x58), H(0x18));
  const pages = new Map(); let offset = 0;
  for (let at = 0; at + 16 <= pm.length; at += 16) {
    const size = i64(pm, at); const id = i64(pm, at + 8);
    if (size === 0 && id === 0) break;
    pages.set(Math.abs(id), { offset: offset + 0x480, size });
    offset += size;
  }
  const mapPage = pages.get(H(0xc0));
  if (!mapPage) throw dwgError('the R2007 section map is missing');
  const sm = systemPage(bytes, mapPage.offset, H(0xb0), H(0xc8), H(0xd8));
  const sections = new Map();
  for (let at = 0; at + 64 <= sm.length;) {
    const total = u64(sm, at); const maxSize = u64(sm, at + 8); const encrypted = u64(sm, at + 16);
    const nameLength = u64(sm, at + 32); const encoding = u64(sm, at + 48); const pageCount = u64(sm, at + 56);
    at += 64;
    // The name length is in bytes (UTF-16, its terminating zero included).
    let name = ''; for (let k = 0; k + 1 < nameLength; k += 2) name += String.fromCharCode(sm[at + k] | sm[at + k + 1] << 8);
    at += nameLength;
    name = name.replace(/\0+$/, '');
    if (!(pageCount < 1e5) || !(total < 2 ** 31)) throw dwgError('the R2007 section map is damaged');
    const refs = [];
    for (let p = 0; p < pageCount; p++) { refs.push({ start: u64(sm, at), size: u64(sm, at + 8), id: u64(sm, at + 16), usize: u64(sm, at + 24), csize: u64(sm, at + 32) }); at += 56; }
    if (!name || encrypted === 1 || !(total > 0)) continue;
    const out = new Uint8Array(total);
    for (const ref of refs) {
      const page = pages.get(ref.id); if (!page) continue;
      const pesize = (ref.csize + 7) & ~7;
      const blocks = Math.floor((pesize + 250) / 251);
      const data = encoding === 4 ? deinterleave(bytes, page.offset, blocks, 251) : bytes.slice(page.offset, page.offset + blocks * 251);
      const payload = ref.csize < ref.usize ? decompress21(data, 0, ref.csize, ref.usize) : data.subarray(0, ref.usize);
      out.set(payload.subarray(0, Math.max(0, Math.min(ref.usize, total - ref.start))), ref.start);
    }
    sections.set(name, out);
    void maxSize;
  }
  return sections;
}
