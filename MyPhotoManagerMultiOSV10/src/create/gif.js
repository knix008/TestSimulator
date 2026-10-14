// Animated GIF encoder (GIF89a).
//  - colour reduction: images with at most `maxColors` distinct colours keep
//    them exactly; others go through median cut on a 5-bit-per-channel
//    histogram (box colour = true mean of the pixels inside it)
//  - optional Floyd–Steinberg dithering
//  - one global palette for every frame, or a local palette per frame
//  - variable-width LZW (2…12 bit codes, clear code when the table is full)
//  - NETSCAPE2.0 loop extension and a graphic control extension per frame
// Works on ImageData-like objects { width, height, data: Uint8ClampedArray RGBA }.

const HIST_BITS = 5;
const HIST_SIZE = 1 << (HIST_BITS * 3);
const CACHE_BITS = 6;

/** Distinct colours (24-bit) and their counts, or null when there are more than `limit`. */
function exactColors(images, limit) {
  const counts = new Map();
  for (const image of images) {
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const n = counts.get(key);
      if (n === undefined) {
        if (counts.size >= limit) return null;
        counts.set(key, 1);
      } else counts.set(key, n + 1);
    }
  }
  return counts;
}

/** Median cut over a 5-bit histogram; returns palette as an array of [r, g, b]. */
function medianCut(images, maxColors) {
  const count = new Uint32Array(HIST_SIZE);
  const sumR = new Float64Array(HIST_SIZE);
  const sumG = new Float64Array(HIST_SIZE);
  const sumB = new Float64Array(HIST_SIZE);
  const shift = 8 - HIST_BITS;
  for (const image of images) {
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      const bin = ((r >> shift) << (HIST_BITS * 2)) | ((g >> shift) << HIST_BITS) | (b >> shift);
      count[bin] += 1; sumR[bin] += r; sumG[bin] += g; sumB[bin] += b;
    }
  }
  const bins = [];
  for (let i = 0; i < HIST_SIZE; i++) if (count[i]) bins.push(i);
  const chan = (bin, c) => (bin >> (HIST_BITS * (2 - c))) & ((1 << HIST_BITS) - 1);
  const makeBox = (list) => {
    const lo = [31, 31, 31]; const hi = [0, 0, 0];
    let n = 0;
    for (const bin of list) {
      n += count[bin];
      for (let c = 0; c < 3; c++) { const v = chan(bin, c); if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    }
    // Perceptual weights: green differences matter most.
    const spans = [(hi[0] - lo[0]) * 1.0, (hi[1] - lo[1]) * 1.2, (hi[2] - lo[2]) * 0.8];
    const axis = spans.indexOf(Math.max(...spans));
    return { list, n, axis, span: hi[axis] - lo[axis], volume: (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) };
  };
  const boxes = [makeBox(bins)];
  while (boxes.length < maxColors) {
    // First split by population, later by population × volume (keeps rare but distinct colours).
    const byVolume = boxes.length >= maxColors * 0.6;
    let best = -1; let bestScore = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.list.length < 2 || box.span === 0) continue;
      const score = byVolume ? box.n * box.volume : box.n;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    const box = boxes[best];
    const { axis } = box;
    const sorted = box.list.slice().sort((a, b) => chan(a, axis) - chan(b, axis));
    let acc = 0; let cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += count[sorted[i]];
      if (acc >= box.n / 2) { cut = i + 1; break; }
      cut = i + 1;
    }
    // Do not split inside one histogram value along the axis.
    boxes.splice(best, 1, makeBox(sorted.slice(0, cut)), makeBox(sorted.slice(cut)));
  }
  return boxes.map((box) => {
    let n = 0; let r = 0; let g = 0; let b = 0;
    for (const bin of box.list) { n += count[bin]; r += sumR[bin]; g += sumG[bin]; b += sumB[bin]; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

/** Nearest-palette-colour lookup with a 6-bit-per-channel cache (exact match first). */
function makeMapper(palette) {
  const exact = new Map();
  palette.forEach(([r, g, b], i) => { const key = (r << 16) | (g << 8) | b; if (!exact.has(key)) exact.set(key, i); });
  const cache = new Int16Array(1 << (CACHE_BITS * 3)).fill(-1);
  const n = palette.length;
  const pr = new Int32Array(n); const pg = new Int32Array(n); const pb = new Int32Array(n);
  palette.forEach(([r, g, b], i) => { pr[i] = r; pg[i] = g; pb[i] = b; });
  const nearest = (r, g, b) => {
    let best = 0; let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dr = r - pr[i]; const dg = g - pg[i]; const db = b - pb[i];
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
  const shift = 8 - CACHE_BITS;
  return (r, g, b) => {
    const e = exact.get((r << 16) | (g << 8) | b);
    if (e !== undefined) return e;
    const key = ((r >> shift) << (CACHE_BITS * 2)) | ((g >> shift) << CACHE_BITS) | (b >> shift);
    let idx = cache[key];
    if (idx < 0) {
      // Look up the centre of the cache cell so every colour in it maps alike.
      const half = 1 << (shift - 1);
      idx = nearest(((r >> shift) << shift) + half, ((g >> shift) << shift) + half, ((b >> shift) << shift) + half);
      cache[key] = idx;
    }
    return idx;
  };
}

/** Palette (array of [r, g, b]) for one or more images. */
function buildPalette(images, maxColors) {
  const exact = exactColors(images, maxColors);
  if (exact) {
    const list = [...exact.keys()].map((key) => [(key >> 16) & 255, (key >> 8) & 255, key & 255]);
    return list.length ? list : [[0, 0, 0]];
  }
  return medianCut(images, maxColors);
}

/** Palette indices for an image (optionally Floyd–Steinberg dithered). */
function mapImage(image, palette, dither) {
  const { width, height, data } = image;
  const map = makeMapper(palette);
  const indices = new Uint8Array(width * height);
  if (!dither) {
    for (let p = 0, i = 0; p < indices.length; p++, i += 4) indices[p] = map(data[i], data[i + 1], data[i + 2]);
    return indices;
  }
  // Error buffers for the current and the next row.
  let cur = new Float32Array((width + 2) * 3);
  let next = new Float32Array((width + 2) * 3);
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let y = 0; y < height; y++) {
    next.fill(0);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const e = (x + 1) * 3;
      const r = clamp(data[i] + cur[e]); const g = clamp(data[i + 1] + cur[e + 1]); const b = clamp(data[i + 2] + cur[e + 2]);
      const idx = map(r, g, b);
      indices[y * width + x] = idx;
      const c = palette[idx];
      const er = r - c[0]; const eg = g - c[1]; const eb = b - c[2];
      const spread = (off, buf, k) => { buf[off] += er * k; buf[off + 1] += eg * k; buf[off + 2] += eb * k; };
      spread(e + 3, cur, 7 / 16);
      spread(e - 3, next, 3 / 16);
      spread(e, next, 5 / 16);
      spread(e + 3, next, 1 / 16);
    }
    const t = cur; cur = next; next = t;
  }
  return indices;
}

/**
 * Reduce an image to at most `maxColors` colours.
 * Returns { palette: Uint8Array (r,g,b triples), indices: Uint8Array (one per pixel) }.
 * Images with no more than `maxColors` distinct colours are reproduced exactly.
 */
export function quantize(image, maxColors = 256, { dither = false } = {}) {
  const limit = Math.max(1, Math.min(256, maxColors | 0));
  const palette = buildPalette([image], limit);
  const indices = mapImage(image, palette, dither);
  return { palette: Uint8Array.from(palette.flat()), indices };
}

/** Byte writer that grows as needed. */
class ByteWriter {
  constructor(size = 1 << 16) { this.buf = new Uint8Array(size); this.p = 0; }
  ensure(n) {
    if (this.p + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.p + n) size *= 2;
    const next = new Uint8Array(size); next.set(this.buf.subarray(0, this.p)); this.buf = next;
  }
  byte(v) { this.ensure(1); this.buf[this.p++] = v & 255; }
  u16(v) { this.ensure(2); this.buf[this.p++] = v & 255; this.buf[this.p++] = (v >> 8) & 255; }
  bytes(arr) { this.ensure(arr.length); this.buf.set(arr, this.p); this.p += arr.length; }
  ascii(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  result() { return this.buf.slice(0, this.p); }
}

/** LZW-compress palette indices; writes the min code size and the data sub-blocks. */
export function lzwEncode(indices, minCodeSize, out) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  // Dictionary: (prefix code << 8 | byte) → code, invalidated by a generation stamp.
  const table = new Int16Array(4096 * 256);
  const stamp = new Uint16Array(4096 * 256);
  let generation = 1;
  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;

  const block = new Uint8Array(255);
  let blockLen = 0;
  let bitBuf = 0;
  let bitCount = 0;
  out.byte(minCodeSize);
  const flushByte = (v) => {
    block[blockLen++] = v;
    if (blockLen === 255) { out.byte(255); out.bytes(block); blockLen = 0; }
  };
  const emit = (code) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) { flushByte(bitBuf & 255); bitBuf >>>= 8; bitCount -= 8; }
  };
  const reset = () => {
    generation += 1;
    if (generation === 65536) { stamp.fill(0); generation = 1; }
    nextCode = eoiCode + 1;
    codeSize = minCodeSize + 1;
  };

  emit(clearCode);
  if (indices.length) {
    let cur = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (cur << 8) | k;
      if (stamp[key] === generation) { cur = table[key]; continue; }
      emit(cur);
      if (nextCode === 4096) {
        emit(clearCode);
        reset();
      } else {
        if (nextCode >= (1 << codeSize)) codeSize += 1;
        table[key] = nextCode++;
        stamp[key] = generation;
      }
      cur = k;
    }
    emit(cur);
  }
  emit(eoiCode);
  if (bitCount > 0) flushByte(bitBuf & 255);
  if (blockLen) { out.byte(blockLen); out.bytes(block.subarray(0, blockLen)); }
  out.byte(0);
}

/** Bits needed for a colour table of `n` entries (GIF minimum is 2 entries). */
const tableBits = (n) => { let bits = 1; while ((1 << bits) < n) bits++; return bits; };

function writeColorTable(out, palette, bits) {
  const size = 1 << bits;
  for (let i = 0; i < size; i++) {
    const c = palette[i] ?? [0, 0, 0];
    out.byte(c[0]); out.byte(c[1]); out.byte(c[2]);
  }
}

/**
 * Encode frames into an animated GIF.
 *   frames: [{ image, delay? (ms) }]
 *   options.loop: 0 = forever, n = play n+1 times (NETSCAPE2.0 repeat count); null/-1 = no loop block
 *   options.delay: default per-frame delay in ms (GIF stores centiseconds)
 *   options.dither: Floyd–Steinberg dithering when colours are reduced
 *   options.palette: 'local' (own 256-colour table per frame, default) or 'global' (one shared table)
 *   options.maxColors: palette size limit (2…256)
 * Returns a Uint8Array with the GIF file.
 */
export function encodeGif(frames, { loop = 0, delay = 100, dither = false, palette = 'local', maxColors = 256 } = {}) {
  if (!frames?.length) throw new Error('encodeGif: no frames');
  const limit = Math.max(2, Math.min(256, maxColors | 0));
  const width = Math.max(...frames.map((f) => f.image.width));
  const height = Math.max(...frames.map((f) => f.image.height));
  const out = new ByteWriter();
  out.ascii('GIF89a');
  out.u16(width);
  out.u16(height);

  const globalPalette = palette === 'global' ? buildPalette(frames.map((f) => f.image), limit) : null;
  if (globalPalette) {
    const bits = tableBits(globalPalette.length);
    out.byte(0x80 | ((8 - 1) << 4) | (bits - 1)); // global table, 8-bit colour resolution
    out.byte(0); // background colour index
    out.byte(0); // pixel aspect ratio
    writeColorTable(out, globalPalette, bits);
  } else {
    out.byte(((8 - 1) << 4));
    out.byte(0);
    out.byte(0);
  }

  if (loop != null && loop >= 0) {
    out.byte(0x21); out.byte(0xff); out.byte(11);
    out.ascii('NETSCAPE2.0');
    out.byte(3); out.byte(1); out.u16(Math.min(65535, loop | 0)); out.byte(0);
  }

  for (const frame of frames) {
    const { image } = frame;
    const ms = frame.delay ?? delay;
    // Graphic control extension: disposal 1 (leave in place), no transparency.
    out.byte(0x21); out.byte(0xf9); out.byte(4);
    out.byte(1 << 2);
    out.u16(Math.max(0, Math.min(65535, Math.round(ms / 10))));
    out.byte(0);
    out.byte(0);

    const pal = globalPalette ?? buildPalette([image], limit);
    const indices = mapImage(image, pal, dither);
    const bits = tableBits(pal.length);
    out.byte(0x2c);
    out.u16(0); out.u16(0);
    out.u16(image.width); out.u16(image.height);
    if (globalPalette) out.byte(0);
    else {
      out.byte(0x80 | (bits - 1));
      writeColorTable(out, pal, bits);
    }
    lzwEncode(indices, Math.max(2, bits), out);
  }
  out.byte(0x3b);
  return out.result();
}
