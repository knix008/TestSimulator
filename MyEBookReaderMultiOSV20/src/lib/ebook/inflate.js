// Raw DEFLATE (RFC 1951) decoder.
//
// EPUB, CBZ and every other ZIP-based book format store their entries with
// method 8, so a reader needs exactly this and nothing else. Writing it out
// keeps the app dependency-free and — because it is plain data in, plain data
// out — makes it directly unit-testable, which a browser DecompressionStream
// (unavailable in older runtimes, asynchronous, stream-shaped) is not.

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
  67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
  4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
  769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
  9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// Canonical Huffman decoding table: counts per bit length plus the symbols in
// code order, which is all `readSymbol` needs to walk the codes bit by bit.
function buildHuffman(lengths) {
  const maxBits = 15;
  const counts = new Uint16Array(maxBits + 1);
  for (const len of lengths) if (len) counts[len]++;

  const offsets = new Uint16Array(maxBits + 2);
  for (let bits = 1; bits <= maxBits; bits++) offsets[bits + 1] = offsets[bits] + counts[bits];

  const symbols = new Uint16Array(lengths.length);
  const next = offsets.slice();
  for (let sym = 0; sym < lengths.length; sym++) {
    const len = lengths[sym];
    if (len) symbols[next[len]++] = sym;
  }
  return { counts, symbols };
}

class BitReader {
  constructor(data, offset = 0) {
    this.data = data;
    this.pos = offset;
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  bits(n) {
    while (this.bitCount < n) {
      if (this.pos >= this.data.length) throw new Error('DEFLATE stream ended in the middle of a code.');
      this.bitBuf |= this.data[this.pos++] << this.bitCount;
      this.bitCount += 8;
    }
    const value = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitCount -= n;
    return value;
  }

  alignToByte() {
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  symbol(table) {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= this.bits(1);
      const count = table.counts[len];
      if (code - first < count) return table.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('Invalid Huffman code in the DEFLATE stream.');
  }
}

function fixedTables() {
  const lit = new Uint8Array(288);
  for (let i = 0; i < 144; i++) lit[i] = 8;
  for (let i = 144; i < 256; i++) lit[i] = 9;
  for (let i = 256; i < 280; i++) lit[i] = 7;
  for (let i = 280; i < 288; i++) lit[i] = 8;
  const dist = new Uint8Array(30).fill(5);
  return { literal: buildHuffman(lit), distance: buildHuffman(dist) };
}

function dynamicTables(reader) {
  const hlit = reader.bits(5) + 257;
  const hdist = reader.bits(5) + 1;
  const hclen = reader.bits(4) + 4;

  const codeLengths = new Uint8Array(19);
  for (let i = 0; i < hclen; i++) codeLengths[CODE_LENGTH_ORDER[i]] = reader.bits(3);
  const codeTable = buildHuffman(codeLengths);

  const lengths = new Uint8Array(hlit + hdist);
  let i = 0;
  while (i < lengths.length) {
    const sym = reader.symbol(codeTable);
    if (sym < 16) {
      lengths[i++] = sym;
    } else if (sym === 16) {
      if (i === 0) throw new Error('DEFLATE: repeat code with no previous length.');
      const prev = lengths[i - 1];
      let repeat = 3 + reader.bits(2);
      while (repeat-- > 0 && i < lengths.length) lengths[i++] = prev;
    } else if (sym === 17) {
      let repeat = 3 + reader.bits(3);
      while (repeat-- > 0 && i < lengths.length) lengths[i++] = 0;
    } else {
      let repeat = 11 + reader.bits(7);
      while (repeat-- > 0 && i < lengths.length) lengths[i++] = 0;
    }
  }

  return {
    literal: buildHuffman(lengths.subarray(0, hlit)),
    distance: buildHuffman(lengths.subarray(hlit)),
  };
}

// Output buffer that grows geometrically: the uncompressed size is known from
// the ZIP header in practice, but a stream may also be read without one.
class Sink {
  constructor(hint = 1024) {
    this.buf = new Uint8Array(Math.max(64, hint));
    this.len = 0;
  }

  ensure(extra) {
    if (this.len + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  push(byte) {
    this.ensure(1);
    this.buf[this.len++] = byte;
  }

  copy(source, start, count) {
    this.ensure(count);
    this.buf.set(source.subarray(start, start + count), this.len);
    this.len += count;
  }

  result() {
    return this.buf.subarray(0, this.len);
  }
}

/**
 * Inflates a raw DEFLATE stream.
 * @param {Uint8Array} data     compressed bytes
 * @param {object}     options  `expectedSize` pre-sizes the output buffer
 * @returns {Uint8Array} the decompressed bytes
 */
export function inflateRaw(data, { expectedSize = 0, offset = 0 } = {}) {
  const reader = new BitReader(data, offset);
  const out = new Sink(expectedSize || data.length * 4);

  for (;;) {
    const last = reader.bits(1);
    const type = reader.bits(2);

    if (type === 0) {
      // Stored: length and its complement, then the bytes verbatim.
      reader.alignToByte();
      if (reader.pos + 4 > data.length) throw new Error('DEFLATE: truncated stored block.');
      const len = data[reader.pos] | (data[reader.pos + 1] << 8);
      const nlen = data[reader.pos + 2] | (data[reader.pos + 3] << 8);
      reader.pos += 4;
      if ((len ^ 0xffff) !== nlen) throw new Error('DEFLATE: stored block length check failed.');
      if (reader.pos + len > data.length) throw new Error('DEFLATE: stored block runs past the end of the data.');
      out.copy(data, reader.pos, len);
      reader.pos += len;
    } else if (type === 1 || type === 2) {
      const tables = type === 1 ? fixedTables() : dynamicTables(reader);
      for (;;) {
        const sym = reader.symbol(tables.literal);
        if (sym < 256) {
          out.push(sym);
        } else if (sym === 256) {
          break;
        } else {
          const li = sym - 257;
          if (li >= LENGTH_BASE.length) throw new Error('DEFLATE: invalid length symbol.');
          const length = LENGTH_BASE[li] + reader.bits(LENGTH_EXTRA[li]);
          const dsym = reader.symbol(tables.distance);
          if (dsym >= DIST_BASE.length) throw new Error('DEFLATE: invalid distance symbol.');
          const distance = DIST_BASE[dsym] + reader.bits(DIST_EXTRA[dsym]);
          if (distance > out.len) throw new Error('DEFLATE: distance points before the start of the output.');
          out.ensure(length);
          let from = out.len - distance;
          for (let n = 0; n < length; n++) out.buf[out.len++] = out.buf[from++];
        }
      }
    } else {
      throw new Error('DEFLATE: reserved block type 3.');
    }

    if (last) break;
  }

  return out.result();
}

/** zlib wrapper (RFC 1950) — a 2-byte header, then a raw DEFLATE stream. */
export function inflate(data, options = {}) {
  if (data.length > 2 && (data[0] & 0x0f) === 8 && ((data[0] << 8) | data[1]) % 31 === 0) {
    return inflateRaw(data, { ...options, offset: 2 });
  }
  return inflateRaw(data, options);
}
