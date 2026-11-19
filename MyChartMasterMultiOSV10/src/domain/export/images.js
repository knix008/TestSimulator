// Saving pictures (network map, I/O graph, TCP stream graph, flow graph) as PNG, JPEG, WebP, GIF,
// AVIF or SVG. PNG, JPEG and WebP come from the web view's canvas; GIF is written here (median-cut
// palette + LZW, after MyPaint's encoder); AVIF comes from the canvas where the engine can write it
// and otherwise from the desktop program (ravif, native.encodeAvif); SVG is the drawing itself.

/** [id, label, mime] in the order the save choices list them. */
export const IMAGE_FORMATS = [
  ['png', 'PNG', 'image/png'],
  ['jpg', 'JPEG', 'image/jpeg'],
  ['webp', 'WebP', 'image/webp'],
  ['gif', 'GIF', 'image/gif'],
  ['avif', 'AVIF', 'image/avif'],
  ['svg', 'SVG', 'image/svg+xml'],
];
export const imageMime = (format) => IMAGE_FORMATS.find(([id]) => id === format)?.[2] ?? 'application/octet-stream';

/** A standalone SVG drawn on a canvas, `scale` times its size, over `background` (JPEG and GIF have no transparency). */
export async function svgToCanvas(svgText, { scale = 2, background = '' } = {}) {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (background) { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.scale(scale, scale);
  context.drawImage(image, 0, 0);
  return canvas;
}

/** The canvas's own encoder; null when this engine cannot write the type (it quietly hands back a PNG then). */
async function canvasBytes(canvas, mime, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob || (blob.type && blob.type !== mime)) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * The picture's file bytes. `avif(width, height, rgba)` is the fallback AVIF writer (the desktop
 * program); without one, an engine that cannot write AVIF fails with a message saying so.
 */
export async function encodeCanvas(canvas, format, { quality = 0.92, avif = null, transparent = false } = {}) {
  if (format === 'gif') {
    const { width, height } = canvas;
    return encodeGif(width, height, canvas.getContext('2d').getImageData(0, 0, width, height).data, { transparent });
  }
  const mime = imageMime(format);
  const own = await canvasBytes(canvas, mime, quality);
  if (own) return own;
  if (format === 'avif' && avif) {
    const { width, height } = canvas;
    return avif(width, height, new Uint8Array(canvas.getContext('2d').getImageData(0, 0, width, height).data.buffer), Math.round(quality * 100));
  }
  throw new Error(`This system cannot write ${IMAGE_FORMATS.find(([id]) => id === format)?.[1] ?? format} pictures.`);
}

// ───────────────────────── GIF

/** Colours → a palette of at most `maxColors` (exact when the picture has that few, median cut otherwise). */
export function quantize(rgba, maxColors = 256) {
  const n = rgba.length >> 2;
  const seen = new Map();
  const indices = new Uint8Array(n);
  let exact = true;
  for (let i = 0; i < n; i++) {
    const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    let idx = seen.get(key);
    if (idx === undefined) {
      if (seen.size >= maxColors) { exact = false; break; }
      idx = seen.size;
      seen.set(key, idx);
    }
    indices[i] = idx;
  }
  if (exact) {
    const palette = new Uint8Array(Math.max(1, seen.size) * 3);
    for (const [key, idx] of seen) { palette[idx * 3] = key >> 16; palette[idx * 3 + 1] = (key >> 8) & 255; palette[idx * 3 + 2] = key & 255; }
    return { palette, indices, count: Math.max(1, seen.size) };
  }
  // Median cut over a 5-bit-per-channel histogram.
  const hist = new Map();
  for (let i = 0; i < n; i++) {
    const key = ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3);
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  let boxes = [[...hist.keys()]];
  const ch = (k, c) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31);
  while (boxes.length < maxColors) {
    let bi = -1;
    let bestRange = -1;
    let bestC = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 31;
        let hi = 0;
        for (const k of box) { const v = ch(k, c); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > bestRange) { bestRange = hi - lo; bi = i; bestC = c; }
      }
    });
    if (bi < 0) break;
    const box = boxes[bi].sort((a, b) => ch(a, bestC) - ch(b, bestC));
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, bi), box.slice(0, mid), box.slice(mid), ...boxes.slice(bi + 1)];
  }
  const palette = new Uint8Array(boxes.length * 3);
  boxes.forEach((box, i) => {
    let r = 0; let g = 0; let b = 0; let w = 0;
    for (const k of box) { const c = hist.get(k); r += (ch(k, 0) * 8 + 4) * c; g += (ch(k, 1) * 8 + 4) * c; b += (ch(k, 2) * 8 + 4) * c; w += c; }
    palette[i * 3] = Math.round(r / w); palette[i * 3 + 1] = Math.round(g / w); palette[i * 3 + 2] = Math.round(b / w);
  });
  const lookup = new Map();
  for (let i = 0; i < n; i++) {
    const key = ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3);
    let idx = lookup.get(key);
    if (idx === undefined) {
      let best = 0;
      let bestD = Infinity;
      const r = rgba[i * 4]; const g = rgba[i * 4 + 1]; const b = rgba[i * 4 + 2];
      for (let p = 0; p < boxes.length; p++) {
        const dr = palette[p * 3] - r; const dg = palette[p * 3 + 1] - g; const db = palette[p * 3 + 2] - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = p; }
      }
      idx = best;
      lookup.set(key, idx);
    }
    indices[i] = idx;
  }
  return { palette, indices, count: boxes.length };
}

function lzwEncode(indices, minCodeSize, push) {
  const clearCode = 1 << minCodeSize;
  const eoi = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map();
  let bitBuf = 0;
  let bitCnt = 0;
  const emit = (code) => {
    bitBuf |= code << bitCnt;
    bitCnt += codeSize;
    while (bitCnt >= 8) { push(bitBuf & 255); bitBuf >>>= 8; bitCnt -= 8; }
  };
  emit(clearCode);
  let prefix = indices.length ? indices[0] : 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const code = dict.get(key);
    if (code !== undefined) { prefix = code; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clearCode);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bitCnt > 0) push(bitBuf & 255);
}

/**
 * RGBA pixels → a GIF89a file (one frame, at most 256 colours). With `transparent`, pixels less than half opaque
 * become the one transparent palette entry (GIF transparency is on or off per pixel); the rest share 255 colours.
 */
export function encodeGif(width, height, rgba, { transparent = false } = {}) {
  const n = rgba.length >> 2;
  let clear = null;
  let pixels = rgba;
  if (transparent) {
    clear = new Uint8Array(n);
    let any = false;
    let fill = -1;
    for (let i = 0; i < n; i++) { if (rgba[i * 4 + 3] < 128) { clear[i] = 1; any = true; } else if (fill < 0) fill = i; }
    if (!any) clear = null;
    else {
      // See-through pixels take an opaque pixel's colour so they add nothing to the palette.
      pixels = Uint8ClampedArray.from(rgba);
      const [r, g, b] = fill >= 0 ? [rgba[fill * 4], rgba[fill * 4 + 1], rgba[fill * 4 + 2]] : [0, 0, 0];
      for (let i = 0; i < n; i++) if (clear[i]) { pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; }
    }
  }
  const q = quantize(pixels, clear ? 255 : 256);
  const { palette, indices } = q;
  let { count } = q;
  const clearIndex = clear ? count : -1;
  if (clear) { for (let i = 0; i < n; i++) if (clear[i]) indices[i] = clearIndex; count += 1; }
  let bits = 1;
  while ((1 << bits) < count) bits++;
  const palSize = 1 << bits;
  const bytes = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 255, width >> 8, height & 255, height >> 8, 0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0];
  for (let i = 0; i < palSize; i++) bytes.push(palette[i * 3] || 0, palette[i * 3 + 1] || 0, palette[i * 3 + 2] || 0);
  // Graphic Control Extension: the transparent colour index.
  if (clear) bytes.push(0x21, 0xF9, 4, 0x01, 0, 0, clearIndex, 0);
  bytes.push(0x2C, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0);
  const minCode = Math.max(2, bits);
  bytes.push(minCode);
  const chunk = [];
  const flush = () => { if (chunk.length) { bytes.push(chunk.length); for (const b of chunk) bytes.push(b); chunk.length = 0; } };
  lzwEncode(indices, minCode, (b) => { chunk.push(b); if (chunk.length === 255) flush(); });
  flush();
  bytes.push(0, 0x3B);
  return Uint8Array.from(bytes);
}
