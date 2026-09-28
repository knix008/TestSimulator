// Baseline TIFF decoder.
//
// Browsers do not decode TIFF, so a scanned page or a photo saved as .tif would
// otherwise be unreadable. This covers what real files use: little- and
// big-endian byte order, strips, 8- and 16-bit samples, greyscale, RGB(A) and
// palette images, and the three compressions that actually appear —
// uncompressed, PackBits, LZW — plus Deflate, which comes free from the app's
// own inflate (the same one the EPUB reader uses).
//
// Out goes plain RGBA, which the reader paints onto a canvas.
import { inflate } from './inflate.js';

const TAG = {
  WIDTH: 256,
  HEIGHT: 257,
  BITS_PER_SAMPLE: 258,
  COMPRESSION: 259,
  PHOTOMETRIC: 262,
  STRIP_OFFSETS: 273,
  SAMPLES_PER_PIXEL: 277,
  ROWS_PER_STRIP: 278,
  STRIP_BYTE_COUNTS: 279,
  PLANAR: 284,
  PREDICTOR: 317,
  COLOR_MAP: 320,
  EXTRA_SAMPLES: 338,
  SAMPLE_FORMAT: 339,
};

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

export function looksLikeTiff(data) {
  if (!data || data.length < 8) return false;
  const little = data[0] === 0x49 && data[1] === 0x49;
  const big = data[0] === 0x4d && data[1] === 0x4d;
  if (!little && !big) return false;
  const magic = little ? data[2] | (data[3] << 8) : (data[2] << 8) | data[3];
  return magic === 42;
}

function readEntries(view, data, little) {
  const ifdOffset = view.getUint32(4, little);
  if (ifdOffset + 2 > data.length) throw new Error('TIFF: the image directory is outside the file.');
  const count = view.getUint16(ifdOffset, little);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    const at = ifdOffset + 2 + i * 12;
    if (at + 12 > data.length) break;
    const tag = view.getUint16(at, little);
    const type = view.getUint16(at + 2, little);
    const length = view.getUint32(at + 4, little);
    const size = (TYPE_SIZE[type] || 1) * length;
    let valueAt = at + 8;
    if (size > 4) valueAt = view.getUint32(at + 8, little);
    if (valueAt + Math.min(size, 4) > data.length) continue;

    const values = [];
    for (let n = 0; n < length && n < 1 << 16; n++) {
      const p = valueAt + n * (TYPE_SIZE[type] || 1);
      if (p >= data.length) break;
      switch (type) {
        case 1: case 7: values.push(data[p]); break;
        case 3: values.push(view.getUint16(p, little)); break;
        case 4: values.push(view.getUint32(p, little)); break;
        case 6: values.push(view.getInt8(p)); break;
        case 8: values.push(view.getInt16(p, little)); break;
        case 9: values.push(view.getInt32(p, little)); break;
        case 5: case 10: values.push(view.getUint32(p, little) / (view.getUint32(p + 4, little) || 1)); break;
        default: values.push(data[p]);
      }
    }
    entries.set(tag, values);
  }
  return entries;
}

/** PackBits (TIFF compression 32773): a run-length scheme from MacPaint. */
export function unpackBits(input, expected) {
  const out = new Uint8Array(expected);
  let at = 0;
  let i = 0;
  while (i < input.length && at < expected) {
    const n = input[i++] << 24 >> 24;      // signed byte
    if (n >= 0) {
      for (let k = 0; k <= n && i < input.length && at < expected; k++) out[at++] = input[i++];
    } else if (n !== -128) {
      const byte = input[i++];
      for (let k = 0; k < 1 - n && at < expected; k++) out[at++] = byte;
    }
  }
  return out;
}

/** LZW as TIFF uses it: variable code width, early change, clear/end codes. */
export function lzwDecode(input, expected) {
  const out = new Uint8Array(expected || input.length * 4);
  let outAt = 0;
  const push = (bytes) => {
    for (const byte of bytes) {
      if (outAt < out.length) out[outAt++] = byte;
    }
  };

  let dictionary = [];
  const reset = () => {
    dictionary = new Array(256);
    for (let i = 0; i < 256; i++) dictionary[i] = [i];
    dictionary.length = 258;
  };
  reset();

  let bitPos = 0;
  let codeWidth = 9;
  let previous = null;

  const nextCode = () => {
    let code = 0;
    for (let i = 0; i < codeWidth; i++) {
      const byte = input[(bitPos >> 3)];
      if (byte === undefined) return 257;
      code = (code << 1) | ((byte >> (7 - (bitPos & 7))) & 1);
      bitPos++;
    }
    return code;
  };

  for (;;) {
    const code = nextCode();
    if (code === 257) break;                 // end of information
    if (code === 256) {                      // clear
      reset();
      codeWidth = 9;
      previous = null;
      continue;
    }
    let entry;
    if (dictionary[code]) entry = dictionary[code];
    else if (previous) entry = [...previous, previous[0]];
    else break;

    push(entry);
    if (previous) dictionary.push([...previous, entry[0]]);
    previous = entry;

    // "Early change": the width grows one code before it strictly must.
    if (dictionary.length + 1 === 1 << codeWidth && codeWidth < 12) codeWidth++;
    if (outAt >= out.length) break;
  }

  return out.subarray(0, expected || outAt);
}

/** Undoes the horizontal differencing predictor (tag 317 = 2). */
function undoPredictor(rows, width, samples, bits) {
  if (bits !== 8) return rows;
  for (let y = 0; y < rows.length / (width * samples); y++) {
    const base = y * width * samples;
    for (let x = samples; x < width * samples; x++) {
      rows[base + x] = (rows[base + x] + rows[base + x - samples]) & 0xff;
    }
  }
  return rows;
}

/**
 * Decodes a TIFF into RGBA.
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function decodeTiff(bytes) {
  if (!looksLikeTiff(bytes)) throw new Error('This file is not a TIFF image.');
  const little = bytes[0] === 0x49;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readEntries(view, bytes, little);

  const first = (tag, fallback) => (entries.get(tag)?.[0] ?? fallback);
  const width = first(TAG.WIDTH, 0);
  const height = first(TAG.HEIGHT, 0);
  if (!width || !height) throw new Error('TIFF: the image has no size.');

  const samples = first(TAG.SAMPLES_PER_PIXEL, 1);
  const bitsList = entries.get(TAG.BITS_PER_SAMPLE) || [8];
  const bits = bitsList[0] || 8;
  const compression = first(TAG.COMPRESSION, 1);
  const photometric = first(TAG.PHOTOMETRIC, 1);
  const planar = first(TAG.PLANAR, 1);
  const predictor = first(TAG.PREDICTOR, 1);
  const rowsPerStrip = first(TAG.ROWS_PER_STRIP, height);
  const offsets = entries.get(TAG.STRIP_OFFSETS) || [];
  const counts = entries.get(TAG.STRIP_BYTE_COUNTS) || [];
  const palette = entries.get(TAG.COLOR_MAP) || null;

  if (planar !== 1) throw new Error('TIFF: planar (separated) sample layout is not supported.');
  if (bits !== 8 && bits !== 16) throw new Error(`TIFF: ${bits}-bit samples are not supported.`);
  if (![1, 5, 8, 32773, 32946].includes(compression)) {
    throw new Error(`TIFF: compression ${compression} is not supported (JPEG-in-TIFF among others).`);
  }

  const bytesPerSample = bits / 8;
  const rowBytes = width * samples * bytesPerSample;
  const raw = new Uint8Array(rowBytes * height);
  let at = 0;

  for (let strip = 0; strip < offsets.length; strip++) {
    const start = offsets[strip];
    const size = counts[strip] ?? (rowBytes * rowsPerStrip);
    const chunk = bytes.subarray(start, start + size);
    const rows = Math.min(rowsPerStrip, height - strip * rowsPerStrip);
    const expected = rowBytes * Math.max(0, rows);
    let decoded;
    switch (compression) {
      case 1: decoded = chunk.subarray(0, expected); break;
      case 5: decoded = lzwDecode(chunk, expected); break;
      case 32773: decoded = unpackBits(chunk, expected); break;
      case 8: case 32946: decoded = inflate(chunk, { expectedSize: expected }); break;
      default: decoded = chunk;
    }
    if (predictor === 2) decoded = undoPredictor(decoded.slice(), width, samples, bits);
    raw.set(decoded.subarray(0, Math.min(decoded.length, raw.length - at)), at);
    at += expected;
  }

  // ── To RGBA ─────────────────────────────────────────────
  const out = new Uint8ClampedArray(width * height * 4);
  const sample = (index) => (bits === 16
    ? (little
      ? raw[index * 2] | (raw[index * 2 + 1] << 8)
      : (raw[index * 2] << 8) | raw[index * 2 + 1]) >> 8
    : raw[index]);

  for (let p = 0; p < width * height; p++) {
    const base = p * samples;
    let r;
    let g;
    let b;
    let a = 255;
    if (palette && photometric === 3) {
      const index = sample(base);
      const size = palette.length / 3;
      r = (palette[index] || 0) >> 8;
      g = (palette[size + index] || 0) >> 8;
      b = (palette[size * 2 + index] || 0) >> 8;
    } else if (samples >= 3) {
      r = sample(base);
      g = sample(base + 1);
      b = sample(base + 2);
      if (samples >= 4) a = sample(base + 3);
    } else {
      const value = sample(base);
      // Photometric 0 means zero is white (a scanned page, usually).
      r = photometric === 0 ? 255 - value : value;
      g = r;
      b = r;
      if (samples === 2) a = sample(base + 1);
    }
    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = a;
  }

  return { width, height, data: out };
}
