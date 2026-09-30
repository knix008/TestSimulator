// HUFF/CDIC decompression — the other way a MOBI can be compressed.
//
// Most MOBI books use PalmDOC LZ77 (compression 2). Dictionaries and a good
// many AZW files use compression 17480 instead, which is a Huffman code over a
// *phrase dictionary*: each code stands for a run of bytes rather than a single
// one, and a phrase may itself still be compressed, so decoding is recursive.
//
// Two kinds of record carry the tables:
//
//   HUFF — one record. A 256-entry table indexed by the top byte of the next 32
//          bits of the stream, giving that code's length, whether it is a whole
//          code ("terminal") and the largest code of that length; plus a table
//          of the smallest and largest code for each of the 32 possible code
//          lengths, for the codes the first table cannot settle on its own.
//   CDIC — one or more records holding the phrases themselves.
//
// The bit reader keeps a 64-bit window and slides it four bytes at a time, which
// is what lets a code of up to 32 bits always be read whole.

const HUFF_MAGIC = 'HUFF';
const CDIC_MAGIC = 'CDIC';

function ascii(data, at, len) {
  return new TextDecoder('latin1').decode(data.subarray(at, at + len));
}

/** Truncates to 32 bits the way the format's arithmetic does. */
function toUint32(value) {
  return Number(BigInt.asUintN(32, BigInt(value)));
}

/** Reads the HUFF record's two tables. */
function readHuff(record) {
  if (!record || record.length < 24 || ascii(record, 0, 4) !== HUFF_MAGIC) {
    throw new Error('The HUFF record of this book is missing or damaged.');
  }
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
  const off1 = view.getUint32(8);
  const off2 = view.getUint32(12);
  if (off1 + 256 * 4 > record.length || off2 + 64 * 4 > record.length) {
    throw new Error('The HUFF record of this book is truncated.');
  }

  // One entry per possible leading byte: how long the code is, whether that is
  // the whole of it, and the largest code of that length.
  const dict1 = new Array(256);
  for (let i = 0; i < 256; i += 1) {
    const v = view.getUint32(off1 + i * 4);
    const codelen = v & 0x1f;
    const terminal = (v & 0x80) !== 0;
    if (codelen === 0) throw new Error('The HUFF table of this book has a zero-length code.');
    dict1[i] = {
      codelen,
      terminal,
      maxcode: toUint32((BigInt((v >>> 8) + 1) << BigInt(32 - codelen)) - 1n),
    };
  }

  // The smallest and largest code of each length, for codes the table above
  // could not settle — 32 pairs, indexed by the code length itself.
  const mincode = new Array(33).fill(0);
  const maxcode = new Array(33).fill(0);
  for (let i = 0; i < 32; i += 1) {
    const lo = view.getUint32(off2 + i * 8);
    const hi = view.getUint32(off2 + i * 8 + 4);
    mincode[i] = toUint32(BigInt(lo) << BigInt(32 - i));
    maxcode[i] = toUint32((BigInt(hi + 1) << BigInt(32 - i)) - 1n);
  }
  return { dict1, mincode, maxcode };
}

/** Reads the phrases out of the CDIC records, in order. */
function readCdics(records) {
  const phrases = [];
  let total = 0;
  for (const record of records) {
    if (!record || record.length < 16 || ascii(record, 0, 4) !== CDIC_MAGIC) {
      throw new Error('A CDIC record of this book is missing or damaged.');
    }
    const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
    const count = view.getUint32(8);
    const bits = view.getUint32(12);
    if (!total) total = count;
    // Each CDIC record holds at most 1 << bits phrases, and the last one holds
    // only what is left of the total.
    const here = Math.max(0, Math.min(1 << bits, total - phrases.length));
    const body = record.subarray(16);
    const bodyView = new DataView(body.buffer, body.byteOffset, body.byteLength);
    for (let i = 0; i < here; i += 1) {
      if (i * 2 + 2 > body.length) break;
      const at = bodyView.getUint16(i * 2);
      if (at + 2 > body.length) break;
      const head = bodyView.getUint16(at);
      const length = head & 0x7fff;
      if (at + 2 + length > body.length) break;
      phrases.push({
        bytes: body.subarray(at + 2, at + 2 + length),
        // A phrase whose top bit is clear is itself still compressed, and is
        // decoded the first time it is used.
        plain: (head & 0x8000) !== 0,
      });
    }
  }
  return phrases;
}

/**
 * A reader for one book's HUFF/CDIC tables.
 *
 * `records` is the HUFF record followed by the book's CDIC records, which is
 * the order they appear in the file.
 */
export function openHuffCdic(records) {
  if (!records?.length) throw new Error('This book says it is HUFF/CDIC compressed but carries no tables.');
  const { dict1, mincode, maxcode } = readHuff(records[0]);
  const phrases = readCdics(records.slice(1));
  if (!phrases.length) throw new Error('The phrase dictionary of this book is empty.');

  // A phrase that is decoded is remembered: a dictionary entry is used again and
  // again, and decoding it once per use would make a long book very slow.
  const decoded = new Array(phrases.length).fill(null);
  const busy = new Uint8Array(phrases.length);

  const unpack = (data) => {
    const out = [];
    // Eight bytes of slack so the 64-bit window can always be filled.
    const padded = new Uint8Array(data.length + 8);
    padded.set(data);
    const window = (at) => {
      let v = 0n;
      for (let i = 0; i < 8; i += 1) v = (v << 8n) | BigInt(padded[at + i] || 0);
      return v;
    };

    let bitsLeft = data.length * 8;
    let at = 0;
    let bits = window(0);
    let spare = 32;

    for (;;) {
      if (spare <= 0) {
        at += 4;
        bits = window(at);
        spare += 32;
      }
      const code = Number((bits >> BigInt(spare)) & 0xffffffffn);
      const entry = dict1[code >>> 24];
      let { codelen } = entry;
      let top = entry.maxcode;
      if (!entry.terminal) {
        // The leading byte was not enough: walk out to the length whose codes
        // this one falls inside.
        while (codelen < 32 && code < mincode[codelen]) codelen += 1;
        top = maxcode[codelen];
      }
      spare -= codelen;
      bitsLeft -= codelen;
      if (bitsLeft < 0) break;

      const index = (top - code) >>> (32 - codelen);
      const phrase = phrases[index];
      if (!phrase) break;
      let bytes = decoded[index] || (phrase.plain ? phrase.bytes : null);
      if (!bytes) {
        // A phrase that is itself compressed. The guard is for a damaged file
        // that would otherwise send this into a loop through itself.
        if (busy[index]) break;
        busy[index] = 1;
        bytes = unpack(phrase.bytes);
        busy[index] = 0;
        decoded[index] = bytes;
      }
      for (let i = 0; i < bytes.length; i += 1) out.push(bytes[i]);
    }
    return Uint8Array.from(out);
  };

  return {
    phraseCount: phrases.length,
    /** The plain bytes of one compressed text record. */
    decompress(record) {
      return unpack(record);
    },
  };
}
