const IMAGE_FORMATS = {
  png: { ext: "png", mime: "image/png", alpha: true },
  gif: { ext: "gif", mime: "image/gif", alpha: true },
  jpg: { ext: "jpg", mime: "image/jpeg", alpha: false },
  tiff: { ext: "tiff", mime: "image/tiff", alpha: true },
  webp: { ext: "webp", mime: "image/webp", alpha: true },
};

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(type));
    }, type, quality);
  });
}

function flattenCanvas(canvas) {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d");
  ctx.fillStyle = themeVar("--screen", "#0c0a09");
  ctx.fillRect(0, 0, copy.width, copy.height);
  ctx.drawImage(canvas, 0, 0);
  return copy;
}

function concatBytes(chunks) {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function channelSpan(box) {
  let r0 = 255;
  let r1 = 0;
  let g0 = 255;
  let g1 = 0;
  let b0 = 255;
  let b1 = 0;
  for (const pixel of box) {
    if (pixel[0] < r0) r0 = pixel[0];
    if (pixel[0] > r1) r1 = pixel[0];
    if (pixel[1] < g0) g0 = pixel[1];
    if (pixel[1] > g1) g1 = pixel[1];
    if (pixel[2] < b0) b0 = pixel[2];
    if (pixel[2] > b1) b1 = pixel[2];
  }
  const ranges = [r1 - r0, g1 - g0, b1 - b0];
  let channel = 0;
  if (ranges[1] > ranges[channel]) channel = 1;
  if (ranges[2] > ranges[channel]) channel = 2;
  return { range: ranges[channel], channel };
}

function averageColor(box) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const pixel of box) {
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  }
  const count = box.length || 1;
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function quantizeColors(data, count, skipTransparent) {
  const points = [];
  for (let i = 0; i < data.length; i += 4) {
    if (skipTransparent && data[i + 3] < 16) continue;
    points.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!points.length) return [[0, 0, 0]];
  const boxes = [points];
  while (boxes.length < count) {
    let index = -1;
    let range = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const span = channelSpan(boxes[i]);
      if (span.range > range) {
        range = span.range;
        index = i;
      }
    }
    if (index < 0) break;
    const box = boxes[index];
    const channel = channelSpan(box).channel;
    box.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(box.length / 2);
    boxes.splice(index, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(averageColor);
}

function nearestColor(palette, start, r, g, b, cache) {
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const cached = cache[key];
  if (cached != null) return cached;
  let best = start;
  let score = Infinity;
  for (let i = start; i < palette.length; i++) {
    const color = palette[i];
    const dr = color[0] - r;
    const dg = color[1] - g;
    const db = color[2] - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < score) {
      score = dist;
      best = i;
      if (!dist) break;
    }
  }
  cache[key] = best;
  return best;
}

function lzwGif(indexes, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoi + 1;
  const dict = new Map();
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  const write = (code) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(buffer & 255);
      buffer >>= 8;
      bits -= 8;
    }
  };
  write(clear);
  if (!indexes.length) {
    write(eoi);
    if (bits) bytes.push(buffer & 255);
    return new Uint8Array(bytes);
  }
  let prefix = indexes[0];
  for (let i = 1; i < indexes.length; i++) {
    const key = `${prefix},${indexes[i]}`;
    if (dict.has(key)) {
      prefix = dict.get(key);
      continue;
    }
    write(prefix);
    if (nextCode < 4096) {
      dict.set(key, nextCode);
      nextCode += 1;
      if (codeSize < 12 && nextCode === (1 << codeSize)) codeSize += 1;
    } else {
      write(clear);
      dict.clear();
      codeSize = minCodeSize + 1;
      nextCode = eoi + 1;
    }
    prefix = indexes[i];
  }
  write(prefix);
  write(eoi);
  if (bits) bytes.push(buffer & 255);
  return new Uint8Array(bytes);
}

function encodeGif(image, transparent) {
  const { width, height, data } = image;
  const colors = quantizeColors(data, transparent ? 255 : 256, transparent);
  const palette = transparent ? [[0, 0, 0], ...colors] : colors.slice();
  while (palette.length < 256) palette.push([0, 0, 0]);
  const cache = new Array(32768);
  const indexes = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    indexes[p] = transparent && data[i + 3] < 16
      ? 0
      : nearestColor(palette, transparent ? 1 : 0, data[i], data[i + 1], data[i + 2], cache);
  }
  const lzw = lzwGif(indexes, 8);
  const blocks = [];
  for (let i = 0; i < lzw.length; i += 255) {
    const chunk = lzw.subarray(i, Math.min(lzw.length, i + 255));
    blocks.push(new Uint8Array([chunk.length]));
    blocks.push(chunk);
  }
  blocks.push(new Uint8Array([0]));
  const header = new Uint8Array(13 + 256 * 3);
  header.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 255, width >> 8, height & 255, height >> 8, 0xf7, 0, 0]);
  for (let i = 0; i < 256; i++) header.set(palette[i], 13 + i * 3);
  const control = transparent
    ? new Uint8Array([0x21, 0xf9, 0x04, 0x01, 0, 0, 0, 0])
    : new Uint8Array(0);
  const descriptor = new Uint8Array([0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0, 8]);
  return concatBytes([header, control, descriptor, ...blocks, new Uint8Array([0x3b])]);
}

function writeU16(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >> 8) & 255;
}

function writeU32(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >> 8) & 255;
  out[offset + 2] = (value >> 16) & 255;
  out[offset + 3] = (value >>> 24) & 255;
}

function encodeTiff(image, transparent) {
  const { width, height, data } = image;
  const samples = transparent ? 4 : 3;
  const strip = new Uint8Array(width * height * samples);
  for (let i = 0, p = 0; i < data.length; i += 4) {
    strip[p++] = data[i];
    strip[p++] = data[i + 1];
    strip[p++] = data[i + 2];
    if (transparent) strip[p++] = data[i + 3];
  }
  const bits = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) bits[i * 2] = 8;
  const dataOffset = 8;
  const bitsOffset = dataOffset + strip.length + ((strip.length % 2) ? 1 : 0);
  const rationalOffset = bitsOffset + bits.length + ((bits.length % 2) ? 1 : 0);
  const ifdOffset = rationalOffset + 16;
  const tags = [
    [256, 4, 1, width],
    [257, 4, 1, height],
    [258, 3, samples, bitsOffset],
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, dataOffset],
    [277, 3, 1, samples],
    [278, 4, 1, height],
    [279, 4, 1, strip.length],
    [282, 5, 1, rationalOffset],
    [283, 5, 1, rationalOffset + 8],
    [296, 3, 1, 2],
  ];
  if (transparent) tags.push([338, 3, 1, 2]);
  tags.sort((a, b) => a[0] - b[0]);
  const file = new Uint8Array(ifdOffset + 2 + tags.length * 12 + 4);
  file[0] = 0x49;
  file[1] = 0x49;
  writeU16(file, 2, 42);
  writeU32(file, 4, ifdOffset);
  file.set(strip, dataOffset);
  file.set(bits, bitsOffset);
  writeU32(file, rationalOffset, 72);
  writeU32(file, rationalOffset + 4, 1);
  writeU32(file, rationalOffset + 8, 72);
  writeU32(file, rationalOffset + 12, 1);
  writeU16(file, ifdOffset, tags.length);
  let cursor = ifdOffset + 2;
  for (const [tag, type, count, value] of tags) {
    writeU16(file, cursor, tag);
    writeU16(file, cursor + 2, type);
    writeU32(file, cursor + 4, count);
    if (type === 3 && count === 1) writeU16(file, cursor + 8, value);
    else writeU32(file, cursor + 8, value);
    cursor += 12;
  }
  return file;
}

async function encodeCanvas(canvas, format, transparent) {
  const spec = IMAGE_FORMATS[format];
  if (!spec) throw new Error(format);
  if (format === "jpg") return canvasBlob(flattenCanvas(canvas), spec.mime, 0.92);
  if (format === "png") return canvasBlob(canvas, spec.mime);
  if (format === "webp") return canvasBlob(canvas, spec.mime, 0.92);
  const image = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const bytes = format === "gif" ? encodeGif(image, !!transparent) : encodeTiff(image, !!transparent);
  return new Blob([bytes], { type: spec.mime });
}
