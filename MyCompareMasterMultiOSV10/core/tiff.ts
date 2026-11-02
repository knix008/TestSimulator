/**
 * A baseline TIFF decoder.
 *
 * TIFF is the one picture format in common use that no browser will display, so a
 * picture comparison of two TIFFs has to decode them here and hand the renderer PNGs
 * instead. Bringing in a decoding library for one format would mean shipping a
 * megabyte of someone else's code — and, for the formats people actually have, the
 * work is a few hundred lines: a tag directory, strips of pixels, and three
 * compressions.
 *
 * What it reads: both byte orders; 1, 4, 8 and 16 bits per sample; grayscale
 * (either polarity), palette, RGB and RGBA; uncompressed, PackBits and LZW, with
 * the horizontal-differencing predictor. That is "baseline TIFF" plus LZW, which is
 * what a scanner, a camera or Photoshop produces.
 *
 * What it does not read: JPEG-in-TIFF, CCITT fax, tiled layouts and floating-point
 * samples. Those throw, with the reason, rather than returning a wrong picture.
 */

export type DecodedImage = {
  width: number;
  height: number;
  /** `width * height * 4` bytes, RGBA, 8 bits each. */
  rgba: Uint8Array;
};

/** True when the bytes begin with either of TIFF's two magic numbers. */
export function isTiff(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  const little = data[0] === 0x49 && data[1] === 0x49;
  const big = data[0] === 0x4d && data[1] === 0x4d;
  if (!little && !big) return false;
  const magic = little ? data[2] | (data[3] << 8) : (data[2] << 8) | data[3];
  return magic === 42;
}

/* ------------------------------------------------------------------ *
 * The tag directory
 * ------------------------------------------------------------------ */

const TAG = {
  width: 256,
  height: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  planarConfig: 284,
  predictor: 317,
  colorMap: 320,
  extraSamples: 338,
  sampleFormat: 339,
  tileWidth: 322,
} as const;

/** Size in bytes of each TIFF field type, indexed by its type code. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

class Reader {
  readonly data: Uint8Array;
  readonly little: boolean;

  // Written out rather than declared as constructor parameters: Node runs this file
  // by stripping the types, and a parameter property is syntax it cannot strip.
  constructor(data: Uint8Array, little: boolean) {
    this.data = data;
    this.little = little;
  }

  u8(at: number): number {
    return this.data[at];
  }

  u16(at: number): number {
    return this.little
      ? this.data[at] | (this.data[at + 1] << 8)
      : (this.data[at] << 8) | this.data[at + 1];
  }

  u32(at: number): number {
    return this.little
      ? (this.data[at] | (this.data[at + 1] << 8) | (this.data[at + 2] << 16) | (this.data[at + 3] << 24)) >>> 0
      : ((this.data[at] << 24) | (this.data[at + 1] << 16) | (this.data[at + 2] << 8) | this.data[at + 3]) >>> 0;
  }
}

function readValues(reader: Reader, at: number): { tag: number; values: number[] } {
  const tag = reader.u16(at);
  const type = reader.u16(at + 2);
  const count = reader.u32(at + 4);
  const size = TYPE_SIZE[type] ?? 1;
  const total = size * count;
  // Up to four bytes live in the entry itself; anything longer is an offset.
  const start = total <= 4 ? at + 8 : reader.u32(at + 8);

  const values: number[] = [];
  for (let index = 0; index < count; index++) {
    const from = start + index * size;
    if (from + size > reader.data.length) break;
    if (size === 1) values.push(reader.u8(from));
    else if (size === 2) values.push(reader.u16(from));
    else if (size === 4) values.push(reader.u32(from));
    else values.push(reader.u32(from)); // a rational: its numerator is enough here
  }
  return { tag, values };
}

/* ------------------------------------------------------------------ *
 * Decoding
 * ------------------------------------------------------------------ */

export function decodeTiff(data: Uint8Array): DecodedImage {
  if (!isTiff(data)) throw new Error("Not a TIFF file.");
  const reader = new Reader(data, data[0] === 0x49);

  const ifd = reader.u32(4);
  const entries = reader.u16(ifd);
  const tags = new Map<number, number[]>();
  for (let index = 0; index < entries; index++) {
    const { tag, values } = readValues(reader, ifd + 2 + index * 12);
    tags.set(tag, values);
  }

  const first = (tag: number, fallback: number): number => tags.get(tag)?.[0] ?? fallback;

  const width = first(TAG.width, 0);
  const height = first(TAG.height, 0);
  if (width <= 0 || height <= 0) throw new Error("This TIFF declares no size.");
  if (tags.has(TAG.tileWidth)) throw new Error("Tiled TIFF files are not supported.");

  const samplesPerPixel = first(TAG.samplesPerPixel, 1);
  const bits = tags.get(TAG.bitsPerSample) ?? [first(TAG.bitsPerSample, 1)];
  const bitsPerSample = bits[0] ?? 1;
  if (![1, 4, 8, 16].includes(bitsPerSample)) {
    throw new Error(`This TIFF stores ${bitsPerSample} bits per sample, which is not supported.`);
  }
  if ((tags.get(TAG.sampleFormat)?.[0] ?? 1) === 3) {
    throw new Error("Floating-point TIFF files are not supported.");
  }
  if (first(TAG.planarConfig, 1) !== 1) {
    throw new Error("Planar TIFF files are not supported.");
  }

  const compression = first(TAG.compression, 1);
  const photometric = first(TAG.photometric, 1);
  const predictor = first(TAG.predictor, 1);
  const rowsPerStrip = first(TAG.rowsPerStrip, height);
  const offsets = tags.get(TAG.stripOffsets) ?? [];
  const counts = tags.get(TAG.stripByteCounts) ?? [];
  if (offsets.length === 0) throw new Error("This TIFF has no image data.");

  const bytesPerRow = Math.ceil((width * samplesPerPixel * bitsPerSample) / 8);
  const pixels = new Uint8Array(bytesPerRow * height);

  let written = 0;
  for (let strip = 0; strip < offsets.length; strip++) {
    const from = offsets[strip];
    const length = counts[strip] ?? data.length - from;
    const chunk = data.subarray(from, from + length);
    const rows = Math.min(rowsPerStrip, height - strip * rowsPerStrip);
    if (rows <= 0) break;
    const wanted = bytesPerRow * rows;

    const decoded = decompress(chunk, compression, wanted);
    const take = Math.min(decoded.length, pixels.length - written);
    pixels.set(decoded.subarray(0, take), written);
    written += take;
  }

  if (predictor === 2) undoHorizontalDifferencing(pixels, width, height, samplesPerPixel, bitsPerSample, bytesPerRow);

  return {
    width,
    height,
    rgba: toRgba(pixels, {
      width,
      height,
      bytesPerRow,
      bitsPerSample,
      samplesPerPixel,
      photometric,
      palette: tags.get(TAG.colorMap) ?? null,
      hasAlpha: samplesPerPixel === 4 || (samplesPerPixel === 2 && photometric <= 1),
    }),
  };
}

function decompress(chunk: Uint8Array, compression: number, wanted: number): Uint8Array {
  switch (compression) {
    case 1: return chunk;
    case 5: return lzw(chunk, wanted);
    case 32773: return packBits(chunk, wanted);
    case 6:
    case 7: throw new Error("JPEG-compressed TIFF files are not supported.");
    case 2:
    case 3:
    case 4: throw new Error("Fax-compressed TIFF files are not supported.");
    default: throw new Error(`This TIFF uses compression ${compression}, which is not supported.`);
  }
}

/** PackBits: a run-length scheme where the count byte is signed. */
function packBits(input: Uint8Array, wanted: number): Uint8Array {
  const out = new Uint8Array(wanted);
  let at = 0;
  let written = 0;
  while (at < input.length && written < wanted) {
    const control = (input[at++] << 24) >> 24; // sign-extend
    if (control >= 0) {
      const run = control + 1;
      for (let index = 0; index < run && written < wanted && at < input.length; index++) {
        out[written++] = input[at++];
      }
    } else if (control !== -128) {
      const run = 1 - control;
      const byte = input[at++];
      for (let index = 0; index < run && written < wanted; index++) out[written++] = byte;
    }
  }
  return out;
}

/**
 * TIFF's LZW: like GIF's but MSB-first, and with the codes one bit wider at each
 * boundary — the "early change" that catches every first implementation out.
 */
function lzw(input: Uint8Array, wanted: number): Uint8Array {
  const CLEAR = 256;
  const END = 257;
  const out = new Uint8Array(wanted);
  let written = 0;

  let dictionary: Uint8Array[] = [];
  const reset = () => {
    dictionary = new Array(258);
    for (let index = 0; index < 256; index++) dictionary[index] = Uint8Array.of(index);
  };
  reset();

  let width = 9;
  let previous: Uint8Array | null = null;
  let bitAt = 0;
  const totalBits = input.length * 8;

  const next = (): number => {
    let code = 0;
    for (let index = 0; index < width; index++) {
      if (bitAt >= totalBits) return END;
      const byte = input[bitAt >> 3];
      const bit = (byte >> (7 - (bitAt & 7))) & 1;
      code = (code << 1) | bit;
      bitAt += 1;
    }
    return code;
  };

  for (;;) {
    const code = next();
    if (code === END) break;
    if (code === CLEAR) {
      reset();
      width = 9;
      previous = null;
      continue;
    }

    let entry: Uint8Array;
    if (code < dictionary.length && dictionary[code]) {
      entry = dictionary[code];
    } else if (previous) {
      entry = Uint8Array.of(...previous, previous[0]);
    } else {
      break;
    }

    const take = Math.min(entry.length, wanted - written);
    out.set(entry.subarray(0, take), written);
    written += take;
    if (written >= wanted) break;

    if (previous) dictionary.push(Uint8Array.of(...previous, entry[0]));
    previous = entry;

    // Early change: widen one code before the dictionary actually fills up.
    if (dictionary.length + 1 >= 1 << width && width < 12) width += 1;
  }

  return out;
}

/** The predictor stores each sample as its difference from the one to its left. */
function undoHorizontalDifferencing(
  pixels: Uint8Array,
  width: number,
  height: number,
  samplesPerPixel: number,
  bitsPerSample: number,
  bytesPerRow: number,
): void {
  if (bitsPerSample !== 8) return; // only defined for whole bytes in baseline TIFF
  for (let y = 0; y < height; y++) {
    const row = y * bytesPerRow;
    for (let x = samplesPerPixel; x < width * samplesPerPixel; x++) {
      pixels[row + x] = (pixels[row + x] + pixels[row + x - samplesPerPixel]) & 0xff;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Samples to RGBA
 * ------------------------------------------------------------------ */

type Layout = {
  width: number;
  height: number;
  bytesPerRow: number;
  bitsPerSample: number;
  samplesPerPixel: number;
  photometric: number;
  palette: number[] | null;
  hasAlpha: boolean;
};

function toRgba(pixels: Uint8Array, layout: Layout): Uint8Array {
  const { width, height, bytesPerRow, bitsPerSample, samplesPerPixel, photometric } = layout;
  const rgba = new Uint8Array(width * height * 4);
  const max = (1 << bitsPerSample) - 1;

  /** One sample, scaled to 0–255 whatever its depth. */
  const sampleAt = (row: number, index: number): number => {
    if (bitsPerSample === 8) return pixels[row + index] ?? 0;
    if (bitsPerSample === 16) return pixels[row + index * 2] ?? 0; // take the high byte
    const bitOffset = index * bitsPerSample;
    const byte = pixels[row + (bitOffset >> 3)] ?? 0;
    const shift = 8 - bitsPerSample - (bitOffset & 7);
    const value = (byte >> shift) & max;
    return Math.round((value / max) * 255);
  };

  for (let y = 0; y < height; y++) {
    const row = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      const base = x * samplesPerPixel;
      const out = (y * width + x) * 4;

      if (photometric === 3 && layout.palette) {
        // A palette's entries are three 16-bit ramps, one after the other.
        const size = layout.palette.length / 3;
        const bitOffset = base * bitsPerSample;
        const byte = pixels[row + (bitOffset >> 3)] ?? 0;
        const shift = 8 - bitsPerSample - (bitOffset & 7);
        const index = bitsPerSample === 8 ? pixels[row + base] ?? 0 : (byte >> shift) & max;
        rgba[out] = (layout.palette[index] ?? 0) >> 8;
        rgba[out + 1] = (layout.palette[size + index] ?? 0) >> 8;
        rgba[out + 2] = (layout.palette[size * 2 + index] ?? 0) >> 8;
        rgba[out + 3] = 255;
        continue;
      }

      if (samplesPerPixel >= 3) {
        rgba[out] = sampleAt(row, base);
        rgba[out + 1] = sampleAt(row, base + 1);
        rgba[out + 2] = sampleAt(row, base + 2);
        rgba[out + 3] = layout.hasAlpha ? sampleAt(row, base + 3) : 255;
        continue;
      }

      // Grayscale. Photometric 0 means zero is white, which is the other way round.
      let grey = sampleAt(row, base);
      if (photometric === 0) grey = 255 - grey;
      rgba[out] = grey;
      rgba[out + 1] = grey;
      rgba[out + 2] = grey;
      rgba[out + 3] = layout.hasAlpha ? sampleAt(row, base + 1) : 255;
    }
  }

  return rgba;
}
