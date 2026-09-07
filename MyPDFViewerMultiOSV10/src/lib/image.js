// Image encoding for captured regions.
//
// The canvas gives us PNG, JPEG and WebP for free; GIF and BMP it cannot
// produce, so both are encoded here — the same approach the project already
// takes for ICO/ICNS in lib/ico.mjs.

export const IMAGE_FORMATS = [
  { id: 'png', ext: 'png', mime: 'image/png', label: 'PNG', lossy: false, alpha: true },
  { id: 'jpeg', ext: 'jpg', mime: 'image/jpeg', label: 'JPEG', lossy: true, alpha: false },
  { id: 'webp', ext: 'webp', mime: 'image/webp', label: 'WebP', lossy: true, alpha: true },
  { id: 'gif', ext: 'gif', mime: 'image/gif', label: 'GIF', lossy: false, alpha: false },
  { id: 'bmp', ext: 'bmp', mime: 'image/bmp', label: 'BMP', lossy: false, alpha: false },
];

export const DEFAULT_FORMAT = 'png';

export function formatById(id) {
  return IMAGE_FORMATS.find((f) => f.id === id) || IMAGE_FORMATS[0];
}

// Maps a file extension (as typed in the save dialog) back to a format.
export function formatByExtension(ext) {
  const clean = String(ext || '').replace(/^\./, '').toLowerCase();
  if (clean === 'jpeg') return formatById('jpeg');
  return IMAGE_FORMATS.find((f) => f.ext === clean) || null;
}

// Save-dialog filters: the format the user picks (or types) decides the encoder.
export function saveFilters(preferred) {
  const first = formatById(preferred);
  const rest = IMAGE_FORMATS.filter((f) => f.id !== first.id);
  return [first, ...rest].map((f) => ({ name: `${f.label} Image`, extensions: f.id === 'jpeg' ? ['jpg', 'jpeg'] : [f.ext] }));
}

// ── Decoding ──────────────────────────────────────────────
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The captured image could not be decoded.'));
    img.src = src;
  });
}

// Draws a data URL onto a fresh canvas. Formats without an alpha channel get a
// white background rather than the black one a transparent PNG would flatten to.
async function toCanvas(dataUrl, { background = null } = {}) {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  return canvas;
}

function canvasToBytes(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error(`This browser cannot encode ${mime}.`)); return; }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, mime, quality);
  });
}

// ── Public API ────────────────────────────────────────────

// Encodes a PNG data URL (what a capture produces) into `format`.
// `quality` is 0..1 and only applies to JPEG and WebP.
export async function encodeImage(dataUrl, formatId, quality = 0.92) {
  const fmt = formatById(formatId);
  const canvas = await toCanvas(dataUrl, { background: fmt.alpha ? null : '#ffffff' });

  if (fmt.id === 'png' || fmt.id === 'jpeg' || fmt.id === 'webp') {
    const bytes = await canvasToBytes(canvas, fmt.mime, fmt.lossy ? quality : undefined);
    // Chromium always supports these three; a stray fallback to PNG would
    // silently write a mislabelled file, so fail loudly instead.
    if (!bytes || bytes.length === 0) throw new Error(`Encoding to ${fmt.label} produced no data.`);
    return bytes;
  }

  const ctx = canvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (fmt.id === 'bmp') return encodeBmp(data, width, height);
  if (fmt.id === 'gif') return encodeGif(data, width, height);
  throw new Error(`Unsupported image format: ${formatId}`);
}

// A preview data URL in the chosen format (used by the capture dialog so the
// user sees what JPEG quality actually costs).
export async function previewDataUrl(dataUrl, formatId, quality) {
  const bytes = await encodeImage(dataUrl, formatId, quality);
  const blob = new Blob([bytes], { type: formatById(formatId).mime });
  return { url: URL.createObjectURL(blob), size: bytes.length, bytes };
}

// ── BMP (24-bit, bottom-up) ───────────────────────────────
function encodeBmp(rgba, width, height) {
  const rowSize = (width * 3 + 3) & ~3;      // rows are padded to 4 bytes
  const pixelBytes = rowSize * height;
  const out = new Uint8Array(54 + pixelBytes);
  const view = new DataView(out.buffer);

  // BITMAPFILEHEADER
  out[0] = 0x42; out[1] = 0x4d;              // 'BM'
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true);              // pixel data offset
  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);           // positive height = bottom-up
  view.setUint16(26, 1, true);               // planes
  view.setUint16(28, 24, true);              // bits per pixel
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true);             // 72 dpi, pixels per metre
  view.setInt32(42, 2835, true);

  for (let y = 0; y < height; y++) {
    let dst = 54 + (height - 1 - y) * rowSize;
    let src = y * width * 4;
    for (let x = 0; x < width; x++) {
      out[dst++] = rgba[src + 2];            // B
      out[dst++] = rgba[src + 1];            // G
      out[dst++] = rgba[src];                // R
      src += 4;
    }
  }
  return out;
}

// ── GIF (GIF89a, median-cut palette + LZW) ────────────────

// Reduces the image to at most 256 colours. Colours are bucketed to 15 bits
// (5 per channel) first, which keeps the median cut fast on large captures
// without a visible difference at screen resolution.
function quantize(rgba, maxColors) {
  const hist = new Map();                    // 15-bit colour key → pixel count
  for (let i = 0; i < rgba.length; i += 4) {
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
    hist.set(key, (hist.get(key) || 0) + 1);
  }

  const keys = [...hist.keys()];
  const chan = (key, c) => (c === 0 ? (key >> 10) & 31 : c === 1 ? (key >> 5) & 31 : key & 31);

  // Each box holds a set of colour keys; split the widest one until we have
  // enough boxes (classic median cut).
  const boxes = [makeBox(keys)];
  while (boxes.length < maxColors) {
    let target = -1;
    let widest = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].keys.length < 2) continue;
      if (boxes[i].range > widest) { widest = boxes[i].range; target = i; }
    }
    if (target === -1) break;
    const box = boxes[target];
    const c = box.axis;
    box.keys.sort((a, b) => chan(a, c) - chan(b, c));
    // Split at the median by pixel count, so busy colours keep more precision.
    const half = box.count / 2;
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.keys.length - 1; i++) {
      acc += hist.get(box.keys[i]);
      if (acc >= half) { cut = i + 1; break; }
      cut = i + 1;
    }
    boxes.splice(target, 1, makeBox(box.keys.slice(0, cut)), makeBox(box.keys.slice(cut)));
  }

  function makeBox(boxKeys) {
    let count = 0;
    const lo = [31, 31, 31];
    const hi = [0, 0, 0];
    for (const key of boxKeys) {
      count += hist.get(key);
      for (let c = 0; c < 3; c++) {
        const v = chan(key, c);
        if (v < lo[c]) lo[c] = v;
        if (v > hi[c]) hi[c] = v;
      }
    }
    let axis = 0;
    let range = 0;
    for (let c = 0; c < 3; c++) {
      const r = hi[c] - lo[c];
      if (r > range) { range = r; axis = c; }
    }
    return { keys: boxKeys, count, axis, range };
  }

  // Palette entry = the box's pixel-weighted average colour.
  const palette = new Uint8Array(boxes.length * 3);
  const keyToIndex = new Map();
  boxes.forEach((box, index) => {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (const key of box.keys) {
      const w = hist.get(key);
      r += (((key >> 10) & 31) << 3) * w;
      g += (((key >> 5) & 31) << 3) * w;
      b += ((key & 31) << 3) * w;
      n += w;
      keyToIndex.set(key, index);
    }
    palette[index * 3] = n ? Math.min(255, Math.round(r / n)) : 0;
    palette[index * 3 + 1] = n ? Math.min(255, Math.round(g / n)) : 0;
    palette[index * 3 + 2] = n ? Math.min(255, Math.round(b / n)) : 0;
  });

  const indices = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
    indices[p] = keyToIndex.get(key) ?? 0;
  }
  return { indices, palette, colors: boxes.length };
}

// GIF's variable-width LZW, emitted LSB-first into 255-byte sub-blocks.
function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const out = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = minCodeSize + 1;
  let next = eoiCode + 1;
  let dict = new Map();

  const emit = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  const reset = () => {
    dict = new Map();
    next = eoiCode + 1;
    codeSize = minCodeSize + 1;
  };

  emit(clearCode);
  reset();

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;           // prefix < 4096, k < 256
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next);
      if (next === (1 << codeSize) && codeSize < 12) codeSize++;
      next++;
    } else {
      emit(clearCode);
      reset();
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);

  // Pack into sub-blocks: one length byte followed by up to 255 data bytes.
  const blocks = [];
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255);
    blocks.push(chunk.length, ...chunk);
  }
  blocks.push(0);                            // block terminator
  return Uint8Array.from(blocks);
}

function encodeGif(rgba, width, height) {
  const { indices, palette, colors } = quantize(rgba, 256);

  // The colour table size must be a power of two, at least 2 entries.
  let bits = 1;
  while ((1 << bits) < colors) bits++;
  if (bits > 8) bits = 8;
  const tableSize = 1 << bits;

  const minCodeSize = Math.max(2, bits);
  const data = lzwEncode(indices, minCodeSize);

  const out = new Uint8Array(13 + tableSize * 3 + 10 + data.length + 1);
  const view = new DataView(out.buffer);
  let p = 0;

  // Header
  for (const ch of 'GIF89a') out[p++] = ch.charCodeAt(0);
  // Logical screen descriptor
  view.setUint16(p, width, true); p += 2;
  view.setUint16(p, height, true); p += 2;
  out[p++] = 0x80 | ((bits - 1) & 7) | (7 << 4); // global colour table, 8-bit colour resolution
  out[p++] = 0;                                  // background colour index
  out[p++] = 0;                                  // pixel aspect ratio
  // Global colour table (unused entries stay black)
  out.set(palette.subarray(0, Math.min(palette.length, tableSize * 3)), p);
  p += tableSize * 3;
  // Image descriptor
  out[p++] = 0x2c;
  view.setUint16(p, 0, true); p += 2;            // left
  view.setUint16(p, 0, true); p += 2;            // top
  view.setUint16(p, width, true); p += 2;
  view.setUint16(p, height, true); p += 2;
  out[p++] = 0;                                  // no local table, not interlaced
  // Image data
  out[p++] = minCodeSize;
  out.set(data, p); p += data.length;
  // Trailer
  out[p++] = 0x3b;

  return out.subarray(0, p);
}
