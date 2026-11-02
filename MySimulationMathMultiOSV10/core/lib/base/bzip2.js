// bzip2 compression and decompression in plain JS (used by bzip2, bunzip2
// and unpack). Format: 'BZh' + level, blocks of run-length coded data
// transformed by the Burrows-Wheeler transform, move-to-front, zero-run
// coding (RUNA / RUNB) and Huffman coding, each block with a CRC-32.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
    t[i] = c >>> 0;
  }
  return t;
})();
const crcUpdate = (crc, b) => ((crc << 8) ^ CRC[((crc >>> 24) ^ b) & 255]) >>> 0;

// ------------------------------------------------------------- decompression

class BitReader {
  constructor(bytes) { this.b = bytes; this.pos = 0; this.bit = 0; }
  read(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (this.pos >= this.b.length) throw new Error('unexpected end of data');
      v = (v * 2) + ((this.b[this.pos] >> (7 - this.bit)) & 1);
      if (++this.bit === 8) { this.bit = 0; this.pos++; }
    }
    return v;
  }
  bit1() {
    if (this.pos >= this.b.length) throw new Error('unexpected end of data');
    const v = (this.b[this.pos] >> (7 - this.bit)) & 1;
    if (++this.bit === 8) { this.bit = 0; this.pos++; }
    return v;
  }
  align() { if (this.bit) { this.bit = 0; this.pos++; } }
}

function decodeBlock(br, maxBlock, out) {
  const blockCRC = br.read(32) >>> 0;
  if (br.bit1()) throw new Error('randomized blocks are not supported');
  const origPtr = br.read(24);
  const used = br.read(16);
  const seq = [];
  for (let i = 0; i < 16; i++) if (used & (0x8000 >> i)) { const m = br.read(16); for (let j = 0; j < 16; j++) if (m & (0x8000 >> j)) seq.push(i * 16 + j); }
  if (!seq.length) throw new Error('no symbols in use');
  const alphaSize = seq.length + 2;
  const nGroups = br.read(3);
  if (nGroups < 2 || nGroups > 6) throw new Error('bad number of Huffman tables');
  const nSel = br.read(15);
  if (nSel < 1) throw new Error('bad number of selectors');
  const mtfG = Array.from({ length: nGroups }, (_, i) => i);
  const selectors = new Uint8Array(nSel);
  for (let i = 0; i < nSel; i++) {
    let j = 0; while (br.bit1()) { j++; if (j >= nGroups) throw new Error('bad selector'); }
    const v = mtfG[j]; mtfG.splice(j, 1); mtfG.unshift(v); selectors[i] = v;
  }
  const tables = [];
  for (let g = 0; g < nGroups; g++) {
    const len = new Uint8Array(alphaSize);
    let cur = br.read(5);
    for (let s = 0; s < alphaSize; s++) {
      for (;;) {
        if (cur < 1 || cur > 20) throw new Error('bad code length');
        if (!br.bit1()) break;
        cur += br.bit1() ? -1 : 1;
      }
      len[s] = cur;
    }
    // canonical decoding table: limit[l], base[l], perm
    let minL = 32, maxL = 0;
    for (const l of len) { if (l < minL) minL = l; if (l > maxL) maxL = l; }
    const perm = []; for (let l = minL; l <= maxL; l++) for (let s = 0; s < alphaSize; s++) if (len[s] === l) perm.push(s);
    const limit = new Int32Array(maxL + 2), base = new Int32Array(maxL + 2), first = new Int32Array(maxL + 2);
    let code = 0, k = 0;
    for (let l = minL; l <= maxL; l++) {
      first[l] = k; base[l] = code;
      let cnt = 0; for (let s = 0; s < alphaSize; s++) if (len[s] === l) cnt++;
      code += cnt; k += cnt; limit[l] = code - 1;
      code <<= 1;
    }
    tables.push({ minL, maxL, limit, base, first, perm });
  }
  // symbols → MTF → bytes
  const mtf = seq.slice();
  const counts = new Int32Array(256);
  const ll = new Uint8Array(maxBlock);
  let n = 0, selIdx = 0, groupLeft = 0, tbl = null;
  let runPos = 0, runLen = 0;
  const EOB = alphaSize - 1;
  const flushRun = () => {
    if (!runLen) return;
    const b = mtf[0];
    if (n + runLen > maxBlock) throw new Error('block overflow');
    counts[b] += runLen;
    ll.fill(b, n, n + runLen); n += runLen;
    runLen = 0; runPos = 0;
  };
  for (;;) {
    if (groupLeft === 0) { if (selIdx >= nSel) throw new Error('selector overflow'); tbl = tables[selectors[selIdx++]]; groupLeft = 50; }
    groupLeft--;
    let l = tbl.minL, code = br.read(l);
    while (l <= tbl.maxL && code > tbl.limit[l]) { code = (code << 1) | br.bit1(); l++; }
    if (l > tbl.maxL) throw new Error('bad Huffman code');
    const sym = tbl.perm[tbl.first[l] + code - tbl.base[l]];
    if (sym === 0 || sym === 1) {
      if (runPos === 0) runPos = 1;
      runLen += sym === 0 ? runPos : 2 * runPos;
      runPos <<= 1;
      continue;
    }
    flushRun();
    if (sym === EOB) break;
    const idx = sym - 1;
    const b = mtf[idx]; mtf.splice(idx, 1); mtf.unshift(b);
    if (n >= maxBlock) throw new Error('block overflow');
    counts[b]++; ll[n++] = b;
  }
  if (origPtr >= n) throw new Error('bad block origin');
  // inverse BWT
  const cf = new Int32Array(256); let s = 0;
  for (let i = 0; i < 256; i++) { cf[i] = s; s += counts[i]; }
  const T = new Int32Array(n);
  for (let i = 0; i < n; i++) T[cf[ll[i]]++] = i;
  // undo initial run-length coding while computing the CRC
  let crc = 0xffffffff;
  let p = T[origPtr], last = -1, rep = 0;
  for (let k = 0; k < n; k++) {
    const b = ll[p]; p = T[p];
    if (rep === 4) {
      for (let q = 0; q < b; q++) { out.push(last); crc = crcUpdate(crc, last); }
      rep = 0; last = -1; continue;
    }
    if (b === last) rep++; else { rep = 1; last = b; }
    out.push(b); crc = crcUpdate(crc, b);
  }
  crc = (~crc) >>> 0;
  if (crc !== blockCRC) throw new Error('block CRC mismatch (data is corrupt)');
  return crc;
}

/** Decompresses .bz2 data (concatenated streams allowed). */
export function bzip2Decompress(bytes) {
  const out = new ByteSink();
  const br = new BitReader(bytes);
  let streams = 0;
  while (br.pos + 4 <= bytes.length) {
    if (bytes[br.pos] !== 0x42 || bytes[br.pos + 1] !== 0x5a || bytes[br.pos + 2] !== 0x68) {
      if (streams) break; // trailing garbage after a valid stream
      throw new Error('not a bzip2 file');
    }
    const level = bytes[br.pos + 3] - 0x30;
    if (level < 1 || level > 9) throw new Error('bad block size');
    br.pos += 4; br.bit = 0;
    let combined = 0;
    for (;;) {
      const m1 = br.read(24), m2 = br.read(24);
      if (m1 === 0x314159 && m2 === 0x265359) {
        const c = decodeBlock(br, level * 100000, out);
        combined = (((combined << 1) | (combined >>> 31)) ^ c) >>> 0;
      } else if (m1 === 0x177245 && m2 === 0x385090) {
        const stored = br.read(32) >>> 0;
        if (stored !== combined) throw new Error('stream CRC mismatch (data is corrupt)');
        br.align();
        break;
      } else throw new Error('bad block header');
    }
    streams++;
  }
  if (!streams) throw new Error('not a bzip2 file');
  return out.bytes();
}

class ByteSink {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  push(b) {
    if (this.n === this.buf.length) { const nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    this.buf[this.n++] = b;
  }
  bytes() { return this.buf.slice(0, this.n); }
}

// ------------------------------------------------------------- compression

class BitWriter {
  constructor() { this.out = new ByteSink(); this.acc = 0; this.nb = 0; }
  write(n, v) {
    for (let i = n - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | (Math.floor(v / 2 ** i) & 1);
      if (++this.nb === 8) { this.out.push(this.acc); this.acc = 0; this.nb = 0; }
    }
  }
  finish() { if (this.nb) { this.out.push(this.acc << (8 - this.nb)); this.acc = 0; this.nb = 0; } return this.out.bytes(); }
}

/** Sorted rotation order (suffix array of the cyclic string) by prefix doubling. */
function rotationOrder(block, n) {
  let sa = new Int32Array(n), rank = new Int32Array(n), tmp = new Int32Array(n), sa2 = new Int32Array(n);
  // initial: counting sort by byte
  const cnt = new Int32Array(Math.max(257, n + 1));
  for (let i = 0; i < n; i++) cnt[block[i] + 1]++;
  for (let i = 1; i < 257; i++) cnt[i] += cnt[i - 1];
  for (let i = 0; i < n; i++) sa[cnt[block[i]]++] = i;
  rank[sa[0]] = 0;
  for (let i = 1; i < n; i++) rank[sa[i]] = rank[sa[i - 1]] + (block[sa[i]] !== block[sa[i - 1]] ? 1 : 0);
  for (let k = 1; k < n; k <<= 1) {
    if (rank[sa[n - 1]] === n - 1) break;
    // sort by (rank[i], rank[i+k]) — sa sorted by rank[i] already; order by second key via shifting
    for (let i = 0; i < n; i++) { let j = sa[i] - k; j %= n; if (j < 0) j += n; sa2[i] = j; }
    // stable counting sort of sa2 by rank
    const c = cnt; c.fill(0, 0, n + 1);
    for (let i = 0; i < n; i++) c[rank[i] + 1]++;
    for (let i = 1; i <= n; i++) c[i] += c[i - 1];
    for (let i = 0; i < n; i++) { const j = sa2[i]; sa[c[rank[j]]++] = j; }
    tmp[sa[0]] = 0;
    for (let i = 1; i < n; i++) {
      const a = sa[i], b = sa[i - 1];
      const same = rank[a] === rank[b] && rank[(a + k) % n] === rank[(b + k) % n];
      tmp[a] = tmp[b] + (same ? 0 : 1);
    }
    [rank, tmp] = [tmp, rank];
  }
  return sa;
}

function huffmanLengths(freq, maxLen) {
  const n = freq.length;
  let f = Array.from(freq, (x) => Math.max(1, x));
  for (;;) {
    // build tree with a simple sorted-array merge
    const nodes = f.map((w, i) => ({ w, sym: i, l: null, r: null }));
    const heap = nodes.slice().sort((a, b) => a.w - b.w);
    const merged = [];
    let hi = 0, mi = 0;
    const take = () => (mi < merged.length && (hi >= heap.length || merged[mi].w < heap[hi].w) ? merged[mi++] : heap[hi++]);
    for (let k = 0; k < n - 1; k++) { const a = take(), b = take(); merged.push({ w: a.w + b.w, sym: -1, l: a, r: b }); }
    const len = new Uint8Array(n);
    const root = n === 1 ? nodes[0] : merged[merged.length - 1];
    const stack = [[root, 0]];
    let maxSeen = 0;
    while (stack.length) {
      const [nd, d] = stack.pop();
      if (nd.sym >= 0) { len[nd.sym] = Math.max(1, d); if (d > maxSeen) maxSeen = d; } else { stack.push([nd.l, d + 1], [nd.r, d + 1]); }
    }
    if (maxSeen <= maxLen) return len;
    f = f.map((x) => 1 + Math.floor(x / 2));
  }
}

function encodeBlock(bw, block, n, blockCRC) {
  const sa = rotationOrder(block, n);
  let origPtr = -1;
  const last = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const j = sa[i]; if (j === 0) origPtr = i; last[i] = block[j === 0 ? n - 1 : j - 1]; }
  // symbols in use
  const inUse = new Uint8Array(256);
  for (let i = 0; i < n; i++) inUse[last[i]] = 1;
  const seq = []; for (let i = 0; i < 256; i++) if (inUse[i]) seq.push(i);
  const unseq = new Int32Array(256); seq.forEach((b, i) => { unseq[b] = i; });
  const alphaSize = seq.length + 2, EOB = alphaSize - 1;
  // MTF + zero runs
  const mtf = seq.map((_, i) => i);
  const syms = [];
  let zrun = 0;
  const flush = () => {
    if (!zrun) return;
    let z = zrun - 1;
    for (;;) { syms.push(z & 1 ? 1 : 0); if (z < 2) break; z = (z - 2) >> 1; }
    zrun = 0;
  };
  for (let i = 0; i < n; i++) {
    const v = unseq[last[i]];
    let j = 0; while (mtf[j] !== v) j++;
    if (j === 0) { zrun++; continue; }
    flush();
    mtf.splice(j, 1); mtf.unshift(v);
    syms.push(j + 1);
  }
  flush();
  syms.push(EOB);
  const freq = new Int32Array(alphaSize);
  for (const s of syms) freq[s]++;
  const len = huffmanLengths(freq, 17);
  const code = new Int32Array(alphaSize);
  let c = 0;
  for (let l = 1; l <= 17; l++) { for (let s = 0; s < alphaSize; s++) if (len[s] === l) code[s] = c++; c <<= 1; }
  // header
  bw.write(24, 0x314159); bw.write(24, 0x265359);
  bw.write(32, blockCRC);
  bw.write(1, 0);
  bw.write(24, origPtr);
  let used = 0;
  for (let i = 0; i < 16; i++) { let any = false; for (let j = 0; j < 16; j++) if (inUse[i * 16 + j]) any = true; if (any) used |= 0x8000 >> i; }
  bw.write(16, used);
  for (let i = 0; i < 16; i++) if (used & (0x8000 >> i)) { let m = 0; for (let j = 0; j < 16; j++) if (inUse[i * 16 + j]) m |= 0x8000 >> j; bw.write(16, m); }
  const nGroups = 2;
  const nSel = Math.ceil(syms.length / 50);
  bw.write(3, nGroups);
  bw.write(15, nSel);
  for (let i = 0; i < nSel; i++) bw.write(1, 0); // all blocks use table 0
  for (let g = 0; g < nGroups; g++) {
    let cur = len[0];
    bw.write(5, cur);
    for (let s = 0; s < alphaSize; s++) {
      while (cur < len[s]) { bw.write(2, 2); cur++; }
      while (cur > len[s]) { bw.write(2, 3); cur--; }
      bw.write(1, 0);
    }
  }
  for (const s of syms) bw.write(len[s], code[s]);
}

/** Compresses bytes into the .bz2 format (block size level 1..9, default 9). */
export function bzip2Compress(input, level = 9) {
  const bw = new BitWriter();
  bw.write(8, 0x42); bw.write(8, 0x5a); bw.write(8, 0x68); bw.write(8, 0x30 + level);
  const maxBlock = level * 100000 - 19;
  const block = new Uint8Array(level * 100000);
  let combined = 0;
  let i = 0;
  const N = input.length;
  while (i < N) {
    let n = 0, crc = 0xffffffff;
    while (i < N && n < maxBlock - 5) {
      const b = input[i];
      let run = 1;
      while (i + run < N && input[i + run] === b && run < 255) run++;
      if (run >= 4) {
        block[n++] = b; block[n++] = b; block[n++] = b; block[n++] = b; block[n++] = run - 4;
      } else for (let k = 0; k < run; k++) block[n++] = b;
      for (let k = 0; k < run; k++) crc = crcUpdate(crc, b);
      i += run;
    }
    crc = (~crc) >>> 0;
    encodeBlock(bw, block, n, crc);
    combined = (((combined << 1) | (combined >>> 31)) ^ crc) >>> 0;
  }
  bw.write(24, 0x177245); bw.write(24, 0x385090);
  bw.write(32, combined);
  return bw.finish();
}
