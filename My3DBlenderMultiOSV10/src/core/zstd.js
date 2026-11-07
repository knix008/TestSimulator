// A Zstandard decoder (RFC 8878), written here: .blend files have been compressed with it since Blender 3.0. Decompression only, with
// no dictionaries. Skippable frames are passed over, which is how Blender stores its seek table.
const MAGIC = 0xfd2fb528;

class Bits {
  // A backward bit stream: read from the last byte towards the first, starting under the top set bit of the last byte.
  constructor(data, start, end) {
    this.data = data;
    this.start = start;
    const last = data[end - 1];
    if (!last) throw new Error('zstd: a bit stream has no end mark');
    this.pos = (end - start) * 8 - (8 - (31 - Math.clz32(last)));
  }

  read(n) {
    let value = 0;
    let got = 0;
    while (got < n) {
      this.pos--;
      got++;
      const bit = this.pos >= 0 ? (this.data[this.start + (this.pos >> 3)] >> (this.pos & 7)) & 1 : 0;
      // Multiplying, not shifting: offsets take up to 31 bits and more.
      value = value * 2 + bit;
    }
    return value;
  }
}

/** Reads a normalized FSE table description, forward. Returns the distribution, accuracy log and the bytes used. */
function readFSEHeader(data, start, end, maxLog) {
  let pos = start;
  let bits = 0;
  let bitCount = 0;
  const need = (n) => { while (bitCount < n && pos < end) { bits += data[pos++] * 2 ** bitCount; bitCount += 8; } };
  const take = (n) => { need(n); const v = bits % 2 ** n; bits = Math.floor(bits / 2 ** n); bitCount -= n; return v; };
  const log = take(4) + 5;
  if (log > maxLog) throw new Error('zstd: table accuracy too large');
  let remaining = 1 << log;
  const counts = [];
  while (remaining > 0) {
    const max = remaining + 1;
    const width = 32 - Math.clz32(max);
    const threshold = (1 << width) - 1 - max;
    need(width);
    const low = bits % 2 ** (width - 1);
    let value;
    if (low < threshold) { value = take(width - 1); } else {
      value = take(width);
      if (value >= 1 << (width - 1)) value -= threshold;
    }
    const count = value - 1;
    counts.push(count);
    remaining -= count < 0 ? 1 : count;
    if (count === 0) {
      for (;;) {
        const repeat = take(2);
        for (let i = 0; i < repeat; i++) counts.push(0);
        if (repeat !== 3) break;
      }
    }
  }
  // Any bits left over in the last byte are dropped.
  const used = pos - start - Math.floor(bitCount / 8);
  return { counts, log, used };
}

/** The decoding table of a distribution: for each state its symbol, how many bits to read, and the base of the next state. */
function buildFSE(counts, log) {
  const size = 1 << log;
  const symbols = new Uint16Array(size);
  const bitsOut = new Uint8Array(size);
  const base = new Uint16Array(size);
  const next = new Uint32Array(counts.length);
  let high = size - 1;
  counts.forEach((c, s) => {
    if (c === -1) { symbols[high--] = s; next[s] = 1; } else next[s] = c;
  });
  const step = (size >> 1) + (size >> 3) + 3;
  const mask = size - 1;
  let at = 0;
  counts.forEach((c, s) => {
    for (let i = 0; i < c; i++) {
      symbols[at] = s;
      do { at = (at + step) & mask; } while (at > high);
    }
  });
  if (at !== 0) throw new Error('zstd: a bad FSE table');
  for (let i = 0; i < size; i++) {
    const s = symbols[i];
    const x = next[s]++;
    const width = log - (31 - Math.clz32(x));
    bitsOut[i] = width;
    base[i] = (x << width) - size;
  }
  return { symbols, bits: bitsOut, base, log };
}

const rle = (symbol) => ({ symbols: Uint16Array.of(symbol), bits: Uint8Array.of(0), base: Uint16Array.of(0), log: 0 });

const LL_DEFAULT = buildFSE([4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 1, 1, 1, 1, 1, -1, -1, -1, -1], 6);
const ML_DEFAULT = buildFSE([1, 4, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1], 6);
const OF_DEFAULT = buildFSE([1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1], 5);
const LL_BASE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40, 48, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
const LL_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const ML_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 39, 41, 43, 47, 51, 59, 67, 83, 99, 131, 259, 515, 1027, 2051, 4099, 8195, 16387, 32771, 65539];
const ML_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

/** The Huffman decoding table from the weights: indexed by maxBits bits. */
function buildHuffman(weights) {
  let sum = 0;
  for (const w of weights) if (w) sum += 2 ** (w - 1);
  if (!sum) throw new Error('zstd: empty Huffman weights');
  const maxBits = 32 - Math.clz32(sum);
  const left = 2 ** maxBits - sum;
  if (left & (left - 1)) throw new Error('zstd: the Huffman weights do not add up');
  const all = [...weights, 31 - Math.clz32(left) + 1];
  const size = 1 << maxBits;
  const symbols = new Uint8Array(size);
  const lengths = new Uint8Array(size);
  // Lowest weight first, in symbol order.
  let at = 0;
  for (let w = 1; w <= maxBits; w++) {
    const span = 1 << (w - 1);
    for (let s = 0; s < all.length; s++) {
      if (all[s] !== w) continue;
      symbols.fill(s, at, at + span);
      lengths.fill(maxBits + 1 - w, at, at + span);
      at += span;
    }
  }
  return { symbols, lengths, maxBits };
}

function readHuffmanTable(data, start) {
  const header = data[start];
  if (header >= 128) {
    const count = header - 127;
    const weights = new Array(count);
    for (let i = 0; i < count; i++) {
      const byte = data[start + 1 + (i >> 1)];
      weights[i] = i & 1 ? byte & 15 : byte >> 4;
    }
    return { table: buildHuffman(weights), used: 1 + Math.ceil(count / 2) };
  }
  // Weights compressed with two interleaved FSE states.
  const { counts, log, used } = readFSEHeader(data, start + 1, start + 1 + header, 6);
  const fse = buildFSE(counts, log);
  const bits = new Bits(data, start + 1 + used, start + 1 + header);
  let a = bits.read(log);
  let b = bits.read(log);
  const weights = [];
  for (;;) {
    weights.push(fse.symbols[a]);
    a = fse.base[a] + bits.read(fse.bits[a]);
    if (bits.pos < 0) { weights.push(fse.symbols[b]); break; }
    weights.push(fse.symbols[b]);
    b = fse.base[b] + bits.read(fse.bits[b]);
    if (bits.pos < 0) { weights.push(fse.symbols[a]); break; }
  }
  return { table: buildHuffman(weights), used: 1 + header };
}

function huffmanStream(table, data, start, end, out, at, count) {
  const bits = new Bits(data, start, end);
  const { symbols, lengths, maxBits } = table;
  const mask = (1 << maxBits) - 1;
  let state = bits.read(maxBits);
  for (let i = 0; i < count; i++) {
    out[at + i] = symbols[state];
    const n = lengths[state];
    state = ((state << n) & mask) | bits.read(n);
  }
}

function readLiterals(data, start, frame) {
  const b0 = data[start];
  const type = b0 & 3;
  const sizeFormat = (b0 >> 2) & 3;
  if (type < 2) {
    let size;
    let head;
    if ((sizeFormat & 1) === 0) { size = b0 >> 3; head = 1; } else if (sizeFormat === 1) { size = (b0 >> 4) | (data[start + 1] << 4); head = 2; } else { size = (b0 >> 4) | (data[start + 1] << 4) | (data[start + 2] << 12); head = 3; }
    if (type === 0) return { literals: data.subarray(start + head, start + head + size), used: head + size };
    return { literals: new Uint8Array(size).fill(data[start + head]), used: head + 1 };
  }
  let regenerated;
  let compressed;
  let head;
  let streams = 4;
  if (sizeFormat < 2) {
    const v = b0 | (data[start + 1] << 8) | (data[start + 2] << 16);
    regenerated = (v >> 4) & 0x3ff;
    compressed = (v >> 14) & 0x3ff;
    head = 3;
    if (sizeFormat === 0) streams = 1;
  } else if (sizeFormat === 2) {
    const v = (b0 | (data[start + 1] << 8) | (data[start + 2] << 16) | (data[start + 3] << 24)) >>> 0;
    regenerated = (v >>> 4) & 0x3fff;
    compressed = v >>> 18;
    head = 4;
  } else {
    const low = (b0 | (data[start + 1] << 8) | (data[start + 2] << 16) | (data[start + 3] << 24)) >>> 0;
    regenerated = (low >>> 4) & 0x3ffff;
    compressed = (low >>> 22) | (data[start + 4] << 10);
    head = 5;
  }
  let at = start + head;
  const end = at + compressed;
  if (type === 2) {
    const { table, used } = readHuffmanTable(data, at);
    frame.huffman = table;
    at += used;
  } else if (!frame.huffman) throw new Error('zstd: repeated Huffman table without a table');
  const literals = new Uint8Array(regenerated);
  if (streams === 1) huffmanStream(frame.huffman, data, at, end, literals, 0, regenerated);
  else {
    const s1 = data[at] | (data[at + 1] << 8);
    const s2 = data[at + 2] | (data[at + 3] << 8);
    const s3 = data[at + 4] | (data[at + 5] << 8);
    at += 6;
    const part = Math.ceil(regenerated / 4);
    huffmanStream(frame.huffman, data, at, at + s1, literals, 0, part);
    huffmanStream(frame.huffman, data, at + s1, at + s1 + s2, literals, part, part);
    huffmanStream(frame.huffman, data, at + s1 + s2, at + s1 + s2 + s3, literals, part * 2, part);
    huffmanStream(frame.huffman, data, at + s1 + s2 + s3, end, literals, part * 3, regenerated - part * 3);
  }
  return { literals, used: end - start };
}

function readSequenceTable(mode, data, at, end, fallback, maxLog, previous) {
  if (mode === 0) return { table: fallback, used: 0 };
  if (mode === 1) return { table: rle(data[at]), used: 1 };
  if (mode === 3) { if (!previous) throw new Error('zstd: repeated table without a table'); return { table: previous, used: 0 }; }
  const { counts, log, used } = readFSEHeader(data, at, end, maxLog);
  return { table: buildFSE(counts, log), used };
}

class Output {
  constructor(size) { this.bytes = new Uint8Array(size); this.length = 0; }

  reserve(extra) {
    if (this.length + extra <= this.bytes.length) return;
    const grown = new Uint8Array(Math.max(this.bytes.length * 2, this.length + extra));
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  append(chunk) { this.reserve(chunk.length); this.bytes.set(chunk, this.length); this.length += chunk.length; }
}

function decodeBlock(data, start, end, frame, out) {
  const { literals, used } = readLiterals(data, start, frame);
  let at = start + used;
  let count = data[at++];
  if (count >= 128) {
    if (count < 255) count = ((count - 128) << 8) + data[at++];
    else { count = data[at] + (data[at + 1] << 8) + 0x7f00; at += 2; }
  }
  if (!count) { out.append(literals); return; }
  const modes = data[at++];
  const ll = readSequenceTable(modes >> 6, data, at, end, LL_DEFAULT, 9, frame.ll);
  at += ll.used;
  const of = readSequenceTable((modes >> 4) & 3, data, at, end, OF_DEFAULT, 8, frame.of);
  at += of.used;
  const ml = readSequenceTable((modes >> 2) & 3, data, at, end, ML_DEFAULT, 9, frame.ml);
  at += ml.used;
  frame.ll = ll.table;
  frame.of = of.table;
  frame.ml = ml.table;
  const bits = new Bits(data, at, end);
  let llState = bits.read(ll.table.log);
  let ofState = bits.read(of.table.log);
  let mlState = bits.read(ml.table.log);
  let litAt = 0;
  const rep = frame.rep;
  for (let i = 0; i < count; i++) {
    const ofCode = of.table.symbols[ofState];
    const mlCode = ml.table.symbols[mlState];
    const llCode = ll.table.symbols[llState];
    const ofValue = 2 ** ofCode + bits.read(ofCode);
    const matchLength = ML_BASE[mlCode] + bits.read(ML_EXTRA[mlCode]);
    const literalLength = LL_BASE[llCode] + bits.read(LL_EXTRA[llCode]);
    let offset;
    if (ofValue > 3) {
      offset = ofValue - 3;
      rep[2] = rep[1];
      rep[1] = rep[0];
      rep[0] = offset;
    } else {
      const index = ofValue - 1 + (literalLength === 0 ? 1 : 0);
      if (index === 0) offset = rep[0];
      else {
        offset = index < 3 ? rep[index] : rep[0] - 1;
        if (!offset) throw new Error('zstd: a zero offset');
        if (index > 1) rep[2] = rep[1];
        rep[1] = rep[0];
        rep[0] = offset;
      }
    }
    out.reserve(literalLength + matchLength);
    out.bytes.set(literals.subarray(litAt, litAt + literalLength), out.length);
    out.length += literalLength;
    litAt += literalLength;
    if (offset > out.length - frame.begin) throw new Error('zstd: an offset before the start of the frame');
    // Overlapping copies repeat what they have just written, so byte by byte.
    const bytes = out.bytes;
    let to = out.length;
    let from = to - offset;
    for (let k = 0; k < matchLength; k++) bytes[to++] = bytes[from++];
    out.length = to;
    if (i < count - 1) {
      llState = ll.table.base[llState] + bits.read(ll.table.bits[llState]);
      mlState = ml.table.base[mlState] + bits.read(ml.table.bits[mlState]);
      ofState = of.table.base[ofState] + bits.read(of.table.bits[ofState]);
    }
  }
  out.append(literals.subarray(litAt));
}

export const isZstd = (bytes) => bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;

/** All the frames of a Zstandard stream, joined. */
export function zstdDecompress(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Output(Math.max(1 << 16, data.length * 4));
  let at = 0;
  while (at + 4 <= data.length) {
    const magic = view.getUint32(at, true);
    if ((magic & 0xfffffff0) === 0x184d2a50) { at += 8 + view.getUint32(at + 4, true); continue; }
    if (magic !== MAGIC) throw new Error('zstd: not a Zstandard frame');
    at += 4;
    const descriptor = data[at++];
    const singleSegment = (descriptor >> 5) & 1;
    const fcsFlag = descriptor >> 6;
    const hasChecksum = (descriptor >> 2) & 1;
    const dictId = descriptor & 3;
    if (!singleSegment) at++;
    if (dictId) throw new Error('zstd: dictionaries are not supported');
    at += [0, 1, 2, 4][dictId];
    at += [singleSegment ? 1 : 0, 2, 4, 8][fcsFlag];
    const frame = { rep: [1, 4, 8], huffman: null, ll: null, of: null, ml: null, begin: out.length };
    for (;;) {
      const header = data[at] | (data[at + 1] << 8) | (data[at + 2] << 16);
      at += 3;
      const last = header & 1;
      const type = (header >> 1) & 3;
      const size = header >> 3;
      if (type === 0) { out.append(data.subarray(at, at + size)); at += size; } else if (type === 1) {
        out.reserve(size);
        out.bytes.fill(data[at], out.length, out.length + size);
        out.length += size;
        at += 1;
      } else if (type === 2) { decodeBlock(data, at, at + size, frame, out); at += size; } else throw new Error('zstd: a reserved block type');
      if (last) break;
    }
    if (hasChecksum) at += 4;
  }
  return out.bytes.subarray(0, out.length);
}
