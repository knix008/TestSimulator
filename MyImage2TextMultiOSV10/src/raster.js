const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'heif', 'mif1', 'msf1']);

export function detectFormat(bytes, extension = '') {
  const ext = extension.toLowerCase();
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (HEIF_BRANDS.has(brand)) return 'heif';
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'qoif') return 'qoi';
  if (isTiff(bytes)) return 'tiff';
  if (isJxl(bytes)) return 'jxl';
  if (isHdr(bytes)) return 'hdr';
  if (isPnm(bytes)) return 'pnm';
  if (ext === 'svg' || isSvg(bytes)) return 'svg';
  if (ext === 'tga') return 'tga';
  if (ext === 'heic' || ext === 'heif' || ext === 'hif') return 'heif';
  if (ext === 'avif') return 'avif';
  if (ext === 'tif' || ext === 'tiff') return 'tiff';
  if (ext === 'jxl') return 'jxl';
  if (ext === 'hdr' || ext === 'pic') return 'hdr';
  if (ext === 'pbm' || ext === 'pgm' || ext === 'ppm' || ext === 'pnm') return 'pnm';
  if (ext === 'qoi') return 'qoi';
  return null;
}

export function decodeQoi(bytes) {
  if (ascii(bytes, 0, 4) !== 'qoif') throw new Error('QOI가 아닙니다.');
  const width = u32(bytes, 4);
  const height = u32(bytes, 8);
  const count = checkedCount(width, height);
  const pixels = new Uint8ClampedArray(count * 4);
  const index = Array.from({ length: 64 }, () => [0, 0, 0, 0]);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let cursor = 14;
  let pixel = 0;
  const end = bytes.length - 8;
  while (pixel < count && cursor < end) {
    const tag = bytes[cursor++];
    let run = 1;
    if (tag === 0xfe) {
      r = bytes[cursor++];
      g = bytes[cursor++];
      b = bytes[cursor++];
    } else if (tag === 0xff) {
      r = bytes[cursor++];
      g = bytes[cursor++];
      b = bytes[cursor++];
      a = bytes[cursor++];
    } else if ((tag & 0xc0) === 0x00) {
      [r, g, b, a] = index[tag];
      run = 1;
      write(pixels, pixel, r, g, b, a);
      pixel += 1;
      continue;
    } else if ((tag & 0xc0) === 0x40) {
      r = (r + ((tag >> 4) & 3) - 2) & 255;
      g = (g + ((tag >> 2) & 3) - 2) & 255;
      b = (b + (tag & 3) - 2) & 255;
    } else if ((tag & 0xc0) === 0x80) {
      const next = bytes[cursor++];
      const dg = (tag & 0x3f) - 32;
      r = (r + dg - 8 + ((next >> 4) & 0x0f)) & 255;
      g = (g + dg) & 255;
      b = (b + dg - 8 + (next & 0x0f)) & 255;
    } else {
      run = (tag & 0x3f) + 1;
    }
    index[hash(r, g, b, a)] = [r, g, b, a];
    for (let step = 0; step < run && pixel < count; step += 1) {
      write(pixels, pixel, r, g, b, a);
      pixel += 1;
    }
  }
  if (pixel !== count) throw new Error('QOI를 읽지 못했습니다.');
  return { width, height, rgba: pixels };
}

export function decodeTga(bytes) {
  if (bytes.length < 18) throw new Error('TGA가 아닙니다.');
  const idLength = bytes[0];
  const colorType = bytes[2];
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const depth = bytes[16];
  const descriptor = bytes[17];
  const count = checkedCount(width, height);
  const bytesPerPixel = depth === 8 ? 1 : depth === 24 ? 3 : depth === 32 ? 4 : 0;
  if (!bytesPerPixel || ![2, 3, 10, 11].includes(colorType)) throw new Error('TGA를 읽지 못했습니다.');
  let cursor = 18 + idLength;
  const colorMap = bytes[1] !== 0;
  if (colorMap) {
    const mapLength = bytes[5] | (bytes[6] << 8);
    const mapDepth = bytes[7];
    cursor += mapLength * Math.ceil(mapDepth / 8);
  }
  const raw = new Uint8Array(count * bytesPerPixel);
  const rle = colorType === 10 || colorType === 11;
  let filled = 0;
  if (!rle) {
    raw.set(bytes.subarray(cursor, cursor + raw.length));
    filled = raw.length / bytesPerPixel;
  } else {
    while (filled < count) {
      const packet = bytes[cursor++];
      const length = (packet & 0x7f) + 1;
      if (packet & 0x80) {
        const pixel = bytes.subarray(cursor, cursor + bytesPerPixel);
        cursor += bytesPerPixel;
        for (let copy = 0; copy < length && filled < count; copy += 1) {
          raw.set(pixel, filled * bytesPerPixel);
          filled += 1;
        }
      } else {
        const size = length * bytesPerPixel;
        raw.set(bytes.subarray(cursor, cursor + size), filled * bytesPerPixel);
        cursor += size;
        filled += length;
      }
    }
  }
  const rgba = new Uint8ClampedArray(count * 4);
  for (let index = 0; index < count; index += 1) {
    const source = index * bytesPerPixel;
    if (bytesPerPixel === 1) write(rgba, index, raw[source], raw[source], raw[source], 255);
    else write(rgba, index, raw[source + 2], raw[source + 1], raw[source], bytesPerPixel === 4 ? raw[source + 3] : 255);
  }
  const topOrigin = (descriptor & 0x20) !== 0;
  return { width, height, rgba: topOrigin ? rgba : flipVertical(rgba, width, height) };
}

export function decodeHdr(bytes) {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  if (!text.startsWith('#?RADIANCE') && !text.startsWith('#?RGBE')) throw new Error('HDR이 아닙니다.');
  const headerEnd = findDoubleNewline(bytes);
  let cursor = headerEnd;
  const lineEnd = bytes.indexOf(10, cursor);
  if (lineEnd < 0) throw new Error('HDR을 읽지 못했습니다.');
  const match = new TextDecoder('latin1').decode(bytes.subarray(cursor, lineEnd)).match(/([+-])Y\s+(\d+)\s+([+-])X\s+(\d+)/);
  if (!match) throw new Error('HDR을 읽지 못했습니다.');
  const height = Number(match[2]);
  const width = Number(match[4]);
  const count = checkedCount(width, height);
  cursor = lineEnd + 1;
  const rgbe = new Uint8Array(count * 4);
  const rle = width >= 8 && width < 32768 && cursor + 4 <= bytes.length
    && bytes[cursor] === 2 && bytes[cursor + 1] === 2
    && ((bytes[cursor + 2] << 8) | bytes[cursor + 3]) === width;
  if (rle) {
    for (let y = 0; y < height; y += 1) {
      cursor += 4;
      const row = y * width;
      for (let channel = 0; channel < 4; channel += 1) {
        let x = 0;
        while (x < width) {
          const code = bytes[cursor++];
          if (code > 128) {
            const value = bytes[cursor++];
            const run = code - 128;
            for (let step = 0; step < run; step += 1) rgbe[(row + x + step) * 4 + channel] = value;
            x += run;
          } else {
            for (let step = 0; step < code; step += 1) rgbe[(row + x + step) * 4 + channel] = bytes[cursor++];
            x += code;
          }
        }
      }
    }
  } else {
    rgbe.set(bytes.subarray(cursor, cursor + count * 4));
  }
  const linear = new Float64Array(count * 3);
  let peak = 0;
  for (let index = 0; index < count; index += 1) {
    const source = index * 4;
    const exponent = rgbe[source + 3];
    const scale = exponent === 0 ? 0 : 2 ** (exponent - 128 - 8);
    const channels = [rgbe[source] * scale, rgbe[source + 1] * scale, rgbe[source + 2] * scale];
    linear.set(channels, index * 3);
    peak = Math.max(peak, channels[0], channels[1], channels[2]);
  }
  const rgba = new Uint8ClampedArray(count * 4);
  const gain = peak > 0 ? 255 / peak : 0;
  for (let index = 0; index < count; index += 1) {
    write(
      rgba,
      index,
      linear[index * 3] * gain,
      linear[index * 3 + 1] * gain,
      linear[index * 3 + 2] * gain,
      255,
    );
  }
  return { width, height, rgba: match[1] === '-' ? rgba : flipVertical(rgba, width, height) };
}

export function decodePnm(bytes) {
  let cursor = 0;
  const token = () => {
    while (cursor < bytes.length) {
      const byte = bytes[cursor];
      if (byte === 35) {
        while (cursor < bytes.length && bytes[cursor] !== 10) cursor += 1;
        continue;
      }
      if (byte === 9 || byte === 10 || byte === 13 || byte === 32) {
        cursor += 1;
        continue;
      }
      break;
    }
    const start = cursor;
    while (cursor < bytes.length && ![9, 10, 13, 32].includes(bytes[cursor])) cursor += 1;
    if (start === cursor) throw new Error('PNM을 읽지 못했습니다.');
    return new TextDecoder('latin1').decode(bytes.subarray(start, cursor));
  };
  const magic = token();
  const width = Number(token());
  const height = Number(token());
  const count = checkedCount(width, height);
  const binary = magic === 'P4' || magic === 'P5' || magic === 'P6';
  const maxValue = magic === 'P1' || magic === 'P4' ? 1 : Number(token());
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(maxValue) || maxValue <= 0) {
    throw new Error('PNM을 읽지 못했습니다.');
  }
  if (binary) {
    while (cursor < bytes.length && ![9, 10, 13, 32].includes(bytes[cursor])) cursor += 1;
    if (cursor < bytes.length) cursor += 1;
  }
  const rgba = new Uint8ClampedArray(count * 4);
  const wide = maxValue > 255;
  const sample = () => {
    if (!binary) return Number(token());
    if (!wide) return bytes[cursor++];
    const value = (bytes[cursor] << 8) | bytes[cursor + 1];
    cursor += 2;
    return value;
  };
  const scale = (value, blackIsOne = false) => {
    const amount = blackIsOne ? 1 - value : value / maxValue;
    return Math.max(0, Math.min(255, Math.round(amount * 255)));
  };
  if (magic === 'P1' || magic === 'P4') {
    for (let index = 0; index < count; index += 1) {
      let bit = 0;
      if (magic === 'P4') {
        const x = index % width;
        const y = Math.floor(index / width);
        const stride = Math.ceil(width / 8);
        bit = (bytes[cursor + y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
      } else {
        bit = Number(token());
      }
      const tone = bit ? 0 : 255;
      write(rgba, index, tone, tone, tone, 255);
    }
  } else if (magic === 'P2' || magic === 'P5') {
    for (let index = 0; index < count; index += 1) {
      const tone = scale(sample());
      write(rgba, index, tone, tone, tone, 255);
    }
  } else if (magic === 'P3' || magic === 'P6') {
    for (let index = 0; index < count; index += 1) {
      write(rgba, index, scale(sample()), scale(sample()), scale(sample()), 255);
    }
  } else {
    throw new Error('PNM을 읽지 못했습니다.');
  }
  return { width, height, rgba };
}

function isTiff(bytes) {
  return bytes.length >= 4 && (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00)
    || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  );
}

function isJxl(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0x0a) return true;
  return bytes.length >= 12 && ascii(bytes, 4, 12) === 'JXL \r\n\x87\n';
}

function isHdr(bytes) {
  return ascii(bytes, 0, 10) === '#?RADIANCE' || ascii(bytes, 0, 6) === '#?RGBE';
}

function isPnm(bytes) {
  return bytes.length >= 3 && bytes[0] === 80 && bytes[1] >= 49 && bytes[1] <= 54
    && (bytes[2] === 9 || bytes[2] === 10 || bytes[2] === 13 || bytes[2] === 32 || bytes[2] === 35);
}

function isSvg(bytes) {
  const start = new TextDecoder('utf-8').decode(bytes.subarray(0, Math.min(bytes.length, 256))).trimStart().toLowerCase();
  return start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'));
}

function checkedCount(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('그림 크기가 올바르지 않습니다.');
  }
  const count = width * height;
  if (count > 80_000_000) throw new Error('그림이 너무 큽니다.');
  return count;
}

function ascii(bytes, start, end) {
  let text = '';
  const last = Math.min(end, bytes.length);
  for (let index = start; index < last; index += 1) text += String.fromCharCode(bytes[index]);
  return text;
}

function u32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function hash(r, g, b, a) {
  return (r * 3 + g * 5 + b * 7 + a * 11) & 63;
}

function write(pixels, index, r, g, b, a) {
  const offset = index * 4;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
  pixels[offset + 3] = a;
}

function flipVertical(pixels, width, height) {
  const row = width * 4;
  const flipped = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y += 1) {
    flipped.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  return flipped;
}

function findDoubleNewline(bytes) {
  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (bytes[index] === 10 && bytes[index + 1] === 10) return index + 2;
    if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) return index + 4;
  }
  throw new Error('HDR을 읽지 못했습니다.');
}
