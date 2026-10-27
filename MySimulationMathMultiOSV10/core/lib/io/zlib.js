// DEFLATE (RFC 1951) compressor and decompressor, zlib (RFC 1950) and gzip
// (RFC 1952) wrappers, CRC-32 and Adler-32. Pure JS, no dependencies.
import { MError } from '../../value.js';

const zerr = (msg) => new MError('io:zlib:corrupt', `Compressed data is corrupt: ${msg}`);

// ---------------------------------------------------------------- checksums

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
export function crc32(bytes, crc = 0) {
  let c = ~crc;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}
export function adler32(bytes, adler = 1) {
  let a = adler & 0xffff, b = adler >>> 16;
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(i + 3800, bytes.length);
    for (; i < end; i++) { a += bytes[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// ---------------------------------------------------------------- tables

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// ---------------------------------------------------------------- inflate

/** Decoding table: entry = (codeLength << 16) | symbol, indexed by the next maxBits bits (LSB first). */
function buildDecoder(lengths, n) {
  let max = 0;
  for (let i = 0; i < n; i++) if (lengths[i] > max) max = lengths[i];
  if (max === 0) return { table: new Int32Array(2).fill(-1), bits: 1 };
  const count = new Int32Array(16);
  for (let i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  let left = 1;
  for (let l = 1; l <= 15; l++) { left <<= 1; left -= count[l]; if (left < 0) throw zerr('over-subscribed code'); }
  const next = new Int32Array(16);
  let code = 0;
  for (let l = 1; l <= 15; l++) { code = (code + count[l - 1]) << 1; next[l] = code; }
  const size = 1 << max;
  const table = new Int32Array(size).fill(-1);
  for (let s = 0; s < n; s++) {
    const l = lengths[s];
    if (!l) continue;
    let c = next[l]++;
    // reverse l bits
    let r = 0; for (let k = 0; k < l; k++) { r = (r << 1) | (c & 1); c >>= 1; }
    const entry = (l << 16) | s;
    for (let k = r; k < size; k += 1 << l) table[k] = entry;
  }
  return { table, bits: max };
}

let FIXED_LIT = null, FIXED_DIST = null;
function fixedTables() {
  if (!FIXED_LIT) {
    const l = new Uint8Array(288);
    for (let i = 0; i < 144; i++) l[i] = 8;
    for (let i = 144; i < 256; i++) l[i] = 9;
    for (let i = 256; i < 280; i++) l[i] = 7;
    for (let i = 280; i < 288; i++) l[i] = 8;
    FIXED_LIT = buildDecoder(l, 288);
    FIXED_DIST = buildDecoder(new Uint8Array(30).fill(5), 30);
  }
  return [FIXED_LIT, FIXED_DIST];
}

/**
 * Raw DEFLATE decompression. Returns { data, end } where end is the input
 * offset just after the final block (byte-aligned up).
 */
export function inflateRawEx(input, start = 0, sizeHint = 0) {
  let pos = start, bitbuf = 0, bitcnt = 0;
  const inLen = input.length;
  let out = new Uint8Array(Math.max(1024, sizeHint || input.length * 4));
  let op = 0;
  const grow = (need) => {
    if (op + need <= out.length) return;
    let c = out.length * 2; while (c < op + need) c *= 2;
    const b = new Uint8Array(c); b.set(out.subarray(0, op)); out = b;
  };
  const need = (n) => {
    while (bitcnt < n) {
      if (pos >= inLen) throw zerr('unexpected end of data');
      bitbuf |= input[pos++] << bitcnt; bitcnt += 8;
    }
  };
  const bits = (n) => { if (!n) return 0; need(n); const v = bitbuf & ((1 << n) - 1); bitbuf >>>= n; bitcnt -= n; return v; };
  let overrun = 0; // zero bytes fabricated past the end (to allow peeking near EOF)
  const decode = (d) => {
    // ensure up to d.bits bits, padding with zeros past the end
    while (bitcnt < d.bits) {
      if (pos < inLen) bitbuf |= input[pos++] << bitcnt; else overrun++;
      bitcnt += 8;
    }
    const e = d.table[bitbuf & ((1 << d.bits) - 1)];
    if (e < 0) throw zerr('invalid code');
    const l = e >>> 16;
    bitbuf >>>= l; bitcnt -= l;
    return e & 0xffff;
  };
  let final = 0;
  do {
    final = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitbuf = 0; bitcnt = 0; // align (any partially read byte is dropped)
      if (pos + 4 > inLen) throw zerr('truncated stored block');
      const len = input[pos] | (input[pos + 1] << 8);
      const nlen = input[pos + 2] | (input[pos + 3] << 8);
      if ((len ^ 0xffff) !== nlen) throw zerr('stored block length mismatch');
      pos += 4;
      if (pos + len > inLen) throw zerr('truncated stored block');
      grow(len); out.set(input.subarray(pos, pos + len), op); op += len; pos += len;
      continue;
    }
    let lit, dist;
    if (type === 1) [lit, dist] = fixedTables();
    else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
      const cld = buildDecoder(cl, 19);
      const lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const sym = decode(cld);
        if (sym < 16) lens[i++] = sym;
        else {
          let rep, val = 0;
          if (sym === 16) { if (!i) throw zerr('repeat with no previous length'); val = lens[i - 1]; rep = 3 + bits(2); } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
          if (i + rep > hlit + hdist) throw zerr('too many code lengths');
          while (rep--) lens[i++] = val;
        }
      }
      if (!lens[256]) throw zerr('missing end-of-block code');
      lit = buildDecoder(lens.subarray(0, hlit), hlit);
      dist = buildDecoder(lens.subarray(hlit), hdist);
    } else throw zerr('invalid block type');
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) { if (op >= out.length) grow(1); out[op++] = sym; continue; }
      if (sym === 256) break;
      const li = sym - 257;
      if (li >= 29) throw zerr('invalid length code');
      const len = LEN_BASE[li] + bits(LEN_EXTRA[li]);
      const ds = decode(dist);
      if (ds >= 30) throw zerr('invalid distance code');
      const d = DIST_BASE[ds] + bits(DIST_EXTRA[ds]);
      if (d > op) throw zerr('distance too far back');
      grow(len);
      let from = op - d;
      if (d >= len) { out.copyWithin(op, from, from + len); op += len; } else for (let k = 0; k < len; k++) out[op++] = out[from++];
    }
  } while (!final);
  if (overrun > 0 && Math.floor(bitcnt / 8) < overrun) throw zerr('unexpected end of data');
  // give back whole unread bytes
  const unread = Math.floor(bitcnt / 8) - overrun;
  return { data: out.slice(0, op), end: pos - Math.max(0, unread) };
}
export const inflateRaw = (input, sizeHint) => inflateRawEx(input, 0, sizeHint).data;

/** zlib-wrapped data (2-byte header, deflate stream, Adler-32). */
export function inflate(input, sizeHint) {
  if (input.length < 2) throw zerr('too short');
  const cmf = input[0], flg = input[1];
  if ((cmf & 15) !== 8 || ((cmf << 8) | flg) % 31 !== 0) {
    // not zlib: try raw deflate
    return inflateRaw(input, sizeHint);
  }
  if (flg & 0x20) throw zerr('preset dictionary not supported');
  const r = inflateRawEx(input, 2, sizeHint);
  return r.data;
}

/** gzip member(s); concatenated members are joined. */
export function gunzipBytes(input) {
  const parts = [];
  let p = 0;
  while (p < input.length) {
    if (input[p] !== 0x1f || input[p + 1] !== 0x8b) { if (parts.length) break; throw new MError('io:gunzip:notGzip', 'The data is not in gzip format.'); }
    if (input[p + 2] !== 8) throw zerr('unknown gzip method');
    const flg = input[p + 3];
    let q = p + 10;
    if (flg & 4) { const xlen = input[q] | (input[q + 1] << 8); q += 2 + xlen; }
    let name = '';
    if (flg & 8) { while (input[q]) name += String.fromCharCode(input[q++]); q++; }
    if (flg & 16) { while (input[q]) q++; q++; }
    if (flg & 2) q += 2;
    const r = inflateRawEx(input, q);
    parts.push({ data: r.data, name });
    p = r.end + 8;
  }
  return parts;
}
export function gunzip(input) {
  const parts = gunzipBytes(input);
  if (parts.length === 1) return parts[0].data;
  let n = 0; for (const x of parts) n += x.data.length;
  const out = new Uint8Array(n); let o = 0; for (const x of parts) { out.set(x.data, o); o += x.data.length; }
  return out;
}

// ---------------------------------------------------------------- deflate

class BitWriter {
  constructor(cap) { this.buf = new Uint8Array(Math.max(64, cap)); this.len = 0; this.bb = 0; this.bc = 0; }
  ensure(n) { if (this.len + n > this.buf.length) { let c = this.buf.length * 2; while (c < this.len + n) c *= 2; const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.len)); this.buf = b; } }
  put(v, n) {
    this.bb |= v << this.bc; this.bc += n;
    while (this.bc >= 8) { if (this.len >= this.buf.length) this.ensure(1); this.buf[this.len++] = this.bb & 255; this.bb >>>= 8; this.bc -= 8; }
  }
  align() { if (this.bc > 0) { this.ensure(1); this.buf[this.len++] = this.bb & 255; } this.bb = 0; this.bc = 0; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length; }
  result() { this.align(); return this.buf.slice(0, this.len); }
}

/** Code lengths (limited to maxLen) of a Huffman code for the frequencies. */
export function huffmanLengths(freq, maxLen) {
  const n = freq.length;
  const lens = new Uint8Array(n);
  const syms = [];
  for (let i = 0; i < n; i++) if (freq[i] > 0) syms.push(i);
  if (syms.length === 0) return lens;
  if (syms.length === 1) { lens[syms[0]] = 1; return lens; }
  // package nodes with a simple binary heap
  const nodesF = [], left = [], right = [];
  const heap = [];
  const less = (a, b) => nodesF[a] < nodesF[b] || (nodesF[a] === nodesF[b] && a < b);
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (less(heap[i], heap[p])) { [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } else break; } };
  const pop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
    return top;
  };
  for (const s of syms) { nodesF.push(freq[s]); left.push(-1 - s); right.push(-1); push(nodesF.length - 1); }
  while (heap.length > 1) {
    const a = pop(), b = pop();
    nodesF.push(nodesF[a] + nodesF[b]); left.push(a); right.push(b); push(nodesF.length - 1);
  }
  // depths
  const stack = [[heap[0], 0]];
  while (stack.length) {
    const [nd, d] = stack.pop();
    if (left[nd] < 0 && right[nd] === -1) { lens[-1 - left[nd]] = Math.max(1, d); continue; }
    stack.push([left[nd], d + 1], [right[nd], d + 1]);
  }
  // limit lengths, keeping the code complete (Kraft sum == 2^maxLen)
  const target = 1 << maxLen;
  let kraft = 0;
  for (const s of syms) { if (lens[s] > maxLen) lens[s] = maxLen; kraft += 1 << (maxLen - lens[s]); }
  if (kraft > target) {
    // lengthen the least frequent codes shorter than maxLen
    const order = syms.slice().sort((a, b) => freq[a] - freq[b] || lens[b] - lens[a]);
    while (kraft > target) {
      let best = -1;
      for (const s of order) if (lens[s] < maxLen && (best < 0 || lens[s] > lens[best])) best = s;
      kraft -= 1 << (maxLen - lens[best] - 1); lens[best]++;
    }
  }
  if (kraft < target) {
    const order = syms.slice().sort((a, b) => freq[b] - freq[a]);
    let changed = true;
    while (kraft < target && changed) {
      changed = false;
      for (const s of order) {
        if (lens[s] > 1 && kraft + (1 << (maxLen - lens[s])) <= target) { kraft += 1 << (maxLen - lens[s]); lens[s]--; changed = true; if (kraft === target) break; }
      }
    }
  }
  return lens;
}
/** Canonical codes, bit-reversed for LSB-first output. */
function huffmanCodes(lens) {
  const n = lens.length;
  const count = new Int32Array(16), next = new Int32Array(16);
  for (let i = 0; i < n; i++) if (lens[i]) count[lens[i]]++;
  let code = 0;
  for (let l = 1; l <= 15; l++) { code = (code + count[l - 1]) << 1; next[l] = code; }
  const codes = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    const l = lens[s]; if (!l) continue;
    let c = next[l]++, r = 0;
    for (let k = 0; k < l; k++) { r = (r << 1) | (c & 1); c >>= 1; }
    codes[s] = r;
  }
  return codes;
}

const LEN_SYM = new Uint16Array(259), LEN_SYM_EXTRA = new Uint16Array(259);
for (let i = 0; i < 29; i++) for (let l = LEN_BASE[i]; l < (i === 28 ? 259 : LEN_BASE[i + 1]); l++) { LEN_SYM[l] = 257 + i; LEN_SYM_EXTRA[l] = l - LEN_BASE[i]; }
LEN_SYM[258] = 285; LEN_SYM_EXTRA[258] = 0;
function distSym(d) { let lo = 0, hi = 29; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (DIST_BASE[m] <= d) lo = m; else hi = m - 1; } return lo; }
const DIST_SYM_SMALL = new Uint8Array(513);
for (let d = 1; d <= 512; d++) DIST_SYM_SMALL[d] = distSym(d);
const dsym = (d) => (d <= 512 ? DIST_SYM_SMALL[d] : distSym(d));

/** LZ77 tokens: Uint32 entries; literal = byte, match = 0x80000000 | (len << 15) | (dist - 1). */
function lz77(data, from, to, level, state) {
  const { head, prev } = state;
  const maxChain = level >= 9 ? 1024 : level >= 6 ? 128 : level >= 3 ? 32 : 8;
  const niceLen = level >= 9 ? 258 : level >= 6 ? 128 : 32;
  const lazy = level >= 4;
  const toks = [];
  const HMASK = 0x7fff;
  const hash = (i) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & HMASK;
  const insert = (i) => { if (i + 2 < data.length) { const h = hash(i); prev[i & 0x7fff] = head[h]; head[h] = i; } };
  const findMatch = (i) => {
    if (i + 2 >= to) return [0, 0];
    const maxLen = Math.min(258, to - i);
    let chain = maxChain, bestLen = 2, bestDist = 0;
    let j = head[hash(i)];
    while (j >= 0 && i - j <= 32768 && chain-- > 0) {
      if (data[j + bestLen] === data[i + bestLen] && data[j] === data[i] && data[j + 1] === data[i + 1]) {
        let l = 2; while (l < maxLen && data[j + l] === data[i + l]) l++;
        if (l > bestLen) { bestLen = l; bestDist = i - j; if (l >= niceLen) break; }
      }
      const pj = prev[j & 0x7fff];
      if (pj >= j) break;
      j = pj;
    }
    return bestLen >= 3 ? [bestLen, bestDist] : [0, 0];
  };
  let i = from;
  while (i < to) {
    let [len, dist] = level > 0 ? findMatch(i) : [0, 0];
    if (len && lazy && len < niceLen && i + 1 < to) {
      insert(i);
      const [l2, d2] = findMatch(i + 1);
      if (l2 > len) { toks.push(data[i]); i++; len = l2; dist = d2; } else { toks.push(0x80000000 | (len << 15) | (dist - 1)); for (let k = 1; k < len; k++) insert(i + k); i += len; continue; }
      toks.push(0x80000000 | (len << 15) | (dist - 1));
      for (let k = 0; k < len; k++) insert(i + k);
      i += len;
      continue;
    }
    if (len) {
      toks.push(0x80000000 | (len << 15) | (dist - 1));
      for (let k = 0; k < len; k++) insert(i + k);
      i += len;
    } else { toks.push(data[i]); insert(i); i++; }
  }
  return toks;
}

function writeBlock(bw, data, from, to, toks, last) {
  // frequencies
  const lf = new Uint32Array(286), df = new Uint32Array(30);
  for (const t of toks) {
    if (t & 0x80000000) { const len = (t >>> 15) & 0x1ff, d = (t & 0x7fff) + 1; lf[LEN_SYM[len]]++; df[dsym(d)]++; } else lf[t]++;
  }
  lf[256] = 1;
  let nd = 0; for (let i = 0; i < 30; i++) if (df[i]) nd++;
  if (nd === 0) { df[0] = 1; df[1] = 1; } else if (nd === 1) { df[df[0] ? 1 : 0] = 1; }
  const ll = huffmanLengths(lf, 15), dl = huffmanLengths(df, 15);
  let hlit = 286; while (hlit > 257 && !ll[hlit - 1]) hlit--;
  let hdist = 30; while (hdist > 1 && !dl[hdist - 1]) hdist--;
  // run-length encode code lengths
  const all = [...ll.subarray(0, hlit), ...dl.subarray(0, hdist)];
  const rle = [];
  for (let i = 0; i < all.length;) {
    const v = all[i]; let r = 1; while (i + r < all.length && all[i + r] === v) r++;
    let k = r;
    if (v === 0) {
      while (k >= 11) { const c = Math.min(138, k); rle.push([18, c - 11]); k -= c; }
      if (k >= 3) { rle.push([17, k - 3]); k = 0; }
      while (k-- > 0) rle.push([0]);
    } else {
      rle.push([v]); k--;
      while (k >= 3) { const c = Math.min(6, k); rle.push([16, c - 3]); k -= c; }
      while (k-- > 0) rle.push([v]);
    }
    i += r;
  }
  const cf = new Uint32Array(19);
  for (const [s] of rle) cf[s]++;
  const cl = huffmanLengths(cf, 7);
  let hclen = 19; while (hclen > 4 && !cl[CL_ORDER[hclen - 1]]) hclen--;
  // cost estimate vs stored
  let dynBits = 17 + 3 * hclen;
  for (const [s] of rle) dynBits += cl[s] + (s === 16 ? 2 : s === 17 ? 3 : s === 18 ? 7 : 0);
  for (let s = 0; s < 286; s++) if (lf[s]) dynBits += lf[s] * (ll[s] + (s > 256 ? LEN_EXTRA[s - 257] : 0));
  for (let s = 0; s < 30; s++) if (df[s]) dynBits += df[s] * (dl[s] + DIST_EXTRA[s]);
  const rawLen = to - from;
  const storedBits = 3 + 8 + 32 * Math.ceil(Math.max(1, rawLen) / 65535) + 8 * rawLen;
  if (storedBits < dynBits) {
    let p = from;
    do {
      const n = Math.min(65535, to - p);
      const lastPiece = p + n >= to;
      bw.put(last && lastPiece ? 1 : 0, 1); bw.put(0, 2); bw.align();
      bw.ensure(4); bw.put(n & 0xffff, 16); bw.put(~n & 0xffff, 16);
      bw.bytes(data.subarray(p, p + n)); p += n;
    } while (p < to);
    return;
  }
  const lc = huffmanCodes(ll), dc = huffmanCodes(dl), cc = huffmanCodes(cl);
  bw.put(last ? 1 : 0, 1); bw.put(2, 2);
  bw.put(hlit - 257, 5); bw.put(hdist - 1, 5); bw.put(hclen - 4, 4);
  for (let i = 0; i < hclen; i++) bw.put(cl[CL_ORDER[i]], 3);
  for (const [s, e] of rle) { bw.put(cc[s], cl[s]); if (s === 16) bw.put(e, 2); else if (s === 17) bw.put(e, 3); else if (s === 18) bw.put(e, 7); }
  for (const t of toks) {
    if (t & 0x80000000) {
      const len = (t >>> 15) & 0x1ff, d = (t & 0x7fff) + 1;
      const ls = LEN_SYM[len]; bw.put(lc[ls], ll[ls]);
      const le = LEN_EXTRA[ls - 257]; if (le) bw.put(LEN_SYM_EXTRA[len], le);
      const ds = dsym(d); bw.put(dc[ds], dl[ds]);
      const de = DIST_EXTRA[ds]; if (de) bw.put(d - DIST_BASE[ds], de);
    } else bw.put(lc[t], ll[t]);
  }
  bw.put(lc[256], ll[256]);
}

/** Raw DEFLATE compression; level 0 (store) .. 9 (best). */
export function deflateRaw(data, level = 6) {
  if (!(data instanceof Uint8Array)) data = Uint8Array.from(data);
  const bw = new BitWriter(data.length / 2 + 64);
  if (data.length === 0) { bw.put(1, 1); bw.put(1, 2); bw.put(0, 7); return bw.result(); }
  const state = { head: new Int32Array(0x8000).fill(-1), prev: new Int32Array(0x8000).fill(-1) };
  const BLOCK = 1 << 17;
  for (let p = 0; p < data.length; p += BLOCK) {
    const to = Math.min(data.length, p + BLOCK);
    const toks = level === 0 ? null : lz77(data, p, to, level, state);
    if (!toks) {
      const lastBlk = to >= data.length;
      for (let q = p; q < to;) { const n = Math.min(65535, to - q); bw.put(lastBlk && q + n >= to ? 1 : 0, 1); bw.put(0, 2); bw.align(); bw.put(n, 16); bw.put(~n & 0xffff, 16); bw.bytes(data.subarray(q, q + n)); q += n; }
    } else writeBlock(bw, data, p, to, toks, to >= data.length);
  }
  return bw.result();
}
/** zlib-wrapped DEFLATE. */
export function deflate(data, level = 6) {
  if (!(data instanceof Uint8Array)) data = Uint8Array.from(data);
  const body = deflateRaw(data, level);
  const out = new Uint8Array(body.length + 6);
  out[0] = 0x78; out[1] = level >= 7 ? 0xda : level >= 2 ? 0x9c : 0x01;
  out.set(body, 2);
  const a = adler32(data);
  out[out.length - 4] = a >>> 24; out[out.length - 3] = (a >>> 16) & 255; out[out.length - 2] = (a >>> 8) & 255; out[out.length - 1] = a & 255;
  return out;
}
/** gzip member with optional file name and modification time (seconds). */
export function gzip(data, opts = {}) {
  if (!(data instanceof Uint8Array)) data = Uint8Array.from(data);
  const body = deflateRaw(data, opts.level ?? 6);
  const name = opts.name ? Array.from(opts.name, (c) => c.charCodeAt(0) & 255) : null;
  const head = [0x1f, 0x8b, 8, name ? 8 : 0];
  const mt = Math.floor(opts.mtime || 0) >>> 0;
  head.push(mt & 255, (mt >>> 8) & 255, (mt >>> 16) & 255, mt >>> 24, 0, 255);
  if (name) head.push(...name, 0);
  const out = new Uint8Array(head.length + body.length + 8);
  out.set(head); out.set(body, head.length);
  const c = crc32(data), n = data.length >>> 0;
  const t = head.length + body.length;
  out[t] = c & 255; out[t + 1] = (c >>> 8) & 255; out[t + 2] = (c >>> 16) & 255; out[t + 3] = c >>> 24;
  out[t + 4] = n & 255; out[t + 5] = (n >>> 8) & 255; out[t + 6] = (n >>> 16) & 255; out[t + 7] = n >>> 24;
  return out;
}
