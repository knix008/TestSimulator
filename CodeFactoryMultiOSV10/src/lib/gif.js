// Minimal GIF89a encoder.
//
// Canvas can produce PNG, JPEG and WebP on its own; GIF it cannot, and GIF is
// the one of the four that is still asked for by name. So it is written here:
// median-cut colour reduction to a 256-entry palette, LZW compression, and a
// single transparent index when the image has transparency.
//
// Scope is deliberately narrow — one frame, no animation, no interlacing.

/** Colour cube split along its widest channel until `max` boxes remain. */
function medianCut(pixels, max) {
  // pixels: Uint8ClampedArray RGBA. Collect the opaque colours only; fully or
  // partly transparent pixels map to the transparent index instead.
  const seen = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    // 5 bits per channel is plenty for a 256-colour palette and keeps the
    // initial set small enough to sort quickly on a large diagram.
    const key = ((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3);
    const entry = seen.get(key);
    if (entry) entry[3]++;
    else seen.set(key, [pixels[i], pixels[i + 1], pixels[i + 2], 1]);
  }

  let boxes = [[...seen.values()]];
  if (boxes[0].length === 0) return [[0, 0, 0]];

  while (boxes.length < max) {
    // Split the box with the widest channel spread; stop when none can split.
    let target = -1;
    let targetChannel = 0;
    let widest = 0;

    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const colour of box) {
          if (colour[c] < lo) lo = colour[c];
          if (colour[c] > hi) hi = colour[c];
        }
        if (hi - lo > widest) {
          widest = hi - lo;
          target = index;
          targetChannel = c;
        }
      }
    });

    if (target < 0 || widest === 0) break;

    const box = boxes[target];
    box.sort((a, b) => a[targetChannel] - b[targetChannel]);
    const mid = box.length >> 1;
    boxes.splice(target, 1, box.slice(0, mid), box.slice(mid));
  }

  // Each box becomes its weighted average colour.
  return boxes
    .filter((box) => box.length > 0)
    .map((box) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let weight = 0;
      for (const colour of box) {
        r += colour[0] * colour[3];
        g += colour[1] * colour[3];
        b += colour[2] * colour[3];
        weight += colour[3];
      }
      return weight === 0 ? [0, 0, 0] : [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)];
    });
}

function nearestIndex(palette, r, g, b) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = palette[i][0] - r;
    const dg = palette[i][1] - g;
    const db = palette[i][2] - b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** GIF's variable-code-width LZW, least-significant-bit first. */
function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  const out = [];
  let current = 0;
  let bits = 0;

  const emit = (code, width) => {
    current |= code << bits;
    bits += width;
    while (bits >= 8) {
      out.push(current & 0xff);
      current >>= 8;
      bits -= 8;
    }
  };

  let codeWidth = minCodeSize + 1;
  let next = endCode + 1;
  let dictionary = new Map();

  emit(clearCode, codeWidth);

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const found = dictionary.get(key);

    if (found !== undefined) {
      prefix = found;
      continue;
    }

    emit(prefix, codeWidth);
    dictionary.set(key, next);
    next++;

    if (next > (1 << codeWidth)) {
      if (codeWidth < 12) {
        codeWidth++;
      } else {
        emit(clearCode, codeWidth);
        dictionary = new Map();
        next = endCode + 1;
        codeWidth = minCodeSize + 1;
      }
    }
    prefix = k;
  }

  emit(prefix, codeWidth);
  emit(endCode, codeWidth);
  if (bits > 0) out.push(current & 0xff);

  return out;
}

/**
 * Encodes one RGBA frame as a GIF89a.
 *
 * @param {Uint8ClampedArray} pixels RGBA, width*height*4
 * @param {number} width
 * @param {number} height
 * @param {{transparent?: boolean}} [options]
 * @returns {Uint8Array}
 */
export function encodeGif(pixels, width, height, options = {}) {
  const transparent = !!options.transparent;
  const maxColours = transparent ? 255 : 256;

  const palette = medianCut(pixels, maxColours);
  const transparentIndex = transparent ? palette.length : -1;
  if (transparent) palette.push([0, 0, 0]);

  // The colour table size must be a power of two, at least 2 entries.
  let tableBits = 1;
  while (1 << tableBits < palette.length) tableBits++;
  const tableSize = 1 << tableBits;

  const indices = new Uint8Array(width * height);
  // A tiny cache: diagrams are large areas of a few flat colours, so the same
  // RGB triple is looked up over and over.
  const cache = new Map();
  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    if (transparent && pixels[i + 3] < 128) {
      indices[p] = transparentIndex;
      continue;
    }
    const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    let index = cache.get(key);
    if (index === undefined) {
      index = nearestIndex(palette, pixels[i], pixels[i + 1], pixels[i + 2]);
      cache.set(key, index);
    }
    indices[p] = index;
  }

  const bytes = [];
  const push = (...values) => bytes.push(...values);
  const pushShort = (value) => push(value & 0xff, (value >> 8) & 0xff);

  // Header + logical screen descriptor
  for (const ch of 'GIF89a') push(ch.charCodeAt(0));
  pushShort(width);
  pushShort(height);
  push(0x80 | ((tableBits - 1) & 0x07)); // global colour table, size
  push(transparent ? transparentIndex : 0); // background colour index
  push(0); // pixel aspect ratio

  // Global colour table, padded to the table size
  for (let i = 0; i < tableSize; i++) {
    const colour = palette[i] || [0, 0, 0];
    push(colour[0], colour[1], colour[2]);
  }

  // Graphic control extension — only needed to declare transparency
  if (transparent) {
    push(0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, transparentIndex, 0x00);
  }

  // Image descriptor
  push(0x2c);
  pushShort(0);
  pushShort(0);
  pushShort(width);
  pushShort(height);
  push(0); // no local colour table, not interlaced

  const minCodeSize = Math.max(2, tableBits);
  push(minCodeSize);

  const compressed = lzwEncode(indices, minCodeSize);
  for (let i = 0; i < compressed.length; i += 255) {
    const chunk = compressed.slice(i, i + 255);
    push(chunk.length, ...chunk);
  }
  push(0); // block terminator

  push(0x3b); // trailer
  return Uint8Array.from(bytes);
}
