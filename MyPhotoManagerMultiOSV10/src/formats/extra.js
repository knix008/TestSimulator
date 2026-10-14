// Less common raster formats decoded in plain JavaScript: Truevision TGA,
// ZSoft PCX, Netpbm (PBM/PGM/PPM/PAM), QOI, Radiance HDR (tone-mapped),
// DirectDraw Surface (uncompressed and DXT1/3/5), SGI, Sun raster, X bitmap
// and Windows ICO. Every decoder is a pure function of the file bytes and
// returns { width, height, data: Uint8ClampedArray (RGBA) }, so they run the
// same in Node, the page and a Web Worker. ICO entries that hold a PNG are
// returned as { png: Uint8Array, width, height } for the caller to decode.

const MAX_PIXELS = 300_000_000;

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (typeof input === 'string') return new TextEncoder().encode(input);
  return new Uint8Array(input);
}

function makeImage(width, height, format) {
  if (!(width > 0) || !(height > 0) || width * height > MAX_PIXELS) throw new Error(`unsupported ${format} size ${width}×${height}`);
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function need(bytes, end, format) {
  if (end > bytes.length) throw new Error(`truncated ${format} file`);
}

const u16le = (b, p) => b[p] | (b[p + 1] << 8);
const u32le = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const u16be = (b, p) => (b[p] << 8) | b[p + 1];
const u32be = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));

/** Makes a fully transparent result opaque (writers that leave alpha at 0). */
function fixZeroAlpha(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return;
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
}

// ---------------------------------------------------------------- TGA

/** Truevision TGA: color-mapped, true-color (15/16/24/32) and grayscale, raw or RLE. */
export function decodeTga(input) {
  const b = toBytes(input);
  need(b, 18, 'TGA');
  const idLength = b[0];
  const mapType = b[1];
  const type = b[2];
  const mapFirst = u16le(b, 3);
  const mapLength = u16le(b, 5);
  const mapBits = b[7];
  const width = u16le(b, 12);
  const height = u16le(b, 14);
  const bpp = b[16];
  const descriptor = b[17];
  const kind = type & 7;
  const rle = type >= 9 && type <= 11;
  if (![1, 2, 3].includes(kind) || (type !== kind && !rle)) throw new Error(`unsupported TGA image type ${type}`);
  const image = makeImage(width, height, 'TGA');
  let p = 18 + idLength;

  // Color map (any entry size), stored as RGBA.
  let palette = null;
  if (mapType === 1) {
    const entryBytes = Math.ceil(mapBits / 8);
    need(b, p + mapLength * entryBytes, 'TGA');
    palette = new Uint8Array((mapFirst + mapLength) * 4);
    const tmp = [0, 0, 0, 0];
    for (let i = 0; i < mapLength; i++) {
      readTgaColor(b, p + i * entryBytes, mapBits, tmp);
      palette.set(tmp, (mapFirst + i) * 4);
    }
    p += mapLength * entryBytes;
  } else if (mapType !== 0) {
    throw new Error('unsupported TGA color map');
  }
  if (kind === 1 && !palette) throw new Error('TGA color-mapped image without a map');

  const pixelBytes = Math.ceil(bpp / 8);
  if (!pixelBytes || pixelBytes > 4) throw new Error(`unsupported TGA depth ${bpp}`);
  const px = [0, 0, 0, 255];
  const readPixel = (at) => {
    if (kind === 1) {
      const index = pixelBytes === 2 ? u16le(b, at) : b[at];
      const o = index * 4;
      px[0] = palette[o]; px[1] = palette[o + 1]; px[2] = palette[o + 2]; px[3] = palette[o + 3];
    } else if (kind === 3) {
      px[0] = px[1] = px[2] = b[at];
      px[3] = pixelBytes === 2 ? b[at + 1] : 255;
    } else {
      readTgaColor(b, at, bpp, px);
    }
  };

  const total = width * height;
  const topDown = (descriptor & 0x20) !== 0;
  const rightToLeft = (descriptor & 0x10) !== 0;
  const out = image.data;
  const put = (n) => {
    const row = Math.floor(n / width);
    const col = n - row * width;
    const y = topDown ? row : height - 1 - row;
    const x = rightToLeft ? width - 1 - col : col;
    const o = (y * width + x) * 4;
    out[o] = px[0]; out[o + 1] = px[1]; out[o + 2] = px[2]; out[o + 3] = px[3];
  };

  if (!rle) {
    need(b, p + total * pixelBytes, 'TGA');
    for (let n = 0; n < total; n++, p += pixelBytes) { readPixel(p); put(n); }
  } else {
    let n = 0;
    while (n < total) {
      need(b, p + 1, 'TGA');
      const header = b[p++];
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        need(b, p + pixelBytes, 'TGA');
        readPixel(p);
        p += pixelBytes;
        for (let i = 0; i < count && n < total; i++) put(n++);
      } else {
        need(b, p + count * pixelBytes, 'TGA');
        for (let i = 0; i < count && n < total; i++, p += pixelBytes) { readPixel(p); put(n++); }
      }
    }
  }
  const alphaBits = descriptor & 0x0f;
  if (kind === 2 && (bpp === 32 || bpp === 16)) {
    if (alphaBits === 0 && bpp === 16) for (let i = 3; i < out.length; i += 4) out[i] = 255;
    else fixZeroAlpha(out);
  }
  return image;
}

function readTgaColor(b, p, bits, px) {
  if (bits === 15 || bits === 16) {
    const v = u16le(b, p);
    px[0] = ((v >> 10) & 31) * 255 / 31 + 0.5 | 0;
    px[1] = ((v >> 5) & 31) * 255 / 31 + 0.5 | 0;
    px[2] = (v & 31) * 255 / 31 + 0.5 | 0;
    px[3] = bits === 16 ? (v & 0x8000 ? 255 : 0) : 255;
  } else if (bits === 24 || bits === 32) {
    px[0] = b[p + 2]; px[1] = b[p + 1]; px[2] = b[p];
    px[3] = bits === 32 ? b[p + 3] : 255;
  } else if (bits === 8) {
    px[0] = px[1] = px[2] = b[p]; px[3] = 255;
  } else {
    throw new Error(`unsupported TGA color depth ${bits}`);
  }
}

// ---------------------------------------------------------------- PCX

/** ZSoft PCX: 1-bit mono, 1-bit × 2–4 planes / 2–4-bit (EGA palette), 8-bit palette, 24/32-bit planes. */
export function decodePcx(input) {
  const b = toBytes(input);
  need(b, 128, 'PCX');
  if (b[0] !== 0x0a) throw new Error('not a PCX file');
  const encoding = b[2];
  const bits = b[3];
  const width = u16le(b, 8) - u16le(b, 4) + 1;
  const height = u16le(b, 10) - u16le(b, 6) + 1;
  const planes = b[65];
  const bytesPerLine = u16le(b, 66);
  const image = makeImage(width, height, 'PCX');
  const lineBytes = planes * bytesPerLine;

  // Decode every scan line in one pass (some writers let runs cross lines).
  const raw = new Uint8Array(lineBytes * height);
  let p = 128;
  if (encoding === 1) {
    let o = 0;
    while (o < raw.length && p < b.length) {
      const v = b[p++];
      if ((v & 0xc0) === 0xc0) {
        const count = Math.min(v & 0x3f, raw.length - o);
        raw.fill(b[p++] ?? 0, o, o + count);
        o += count;
      } else {
        raw[o++] = v;
      }
    }
  } else {
    raw.set(b.subarray(p, p + raw.length));
  }

  const out = image.data;
  if (bits === 8 && (planes === 3 || planes === 4)) {
    for (let y = 0; y < height; y++) {
      const line = y * lineBytes;
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        out[o] = raw[line + x];
        out[o + 1] = raw[line + bytesPerLine + x];
        out[o + 2] = raw[line + 2 * bytesPerLine + x];
        out[o + 3] = planes === 4 ? raw[line + 3 * bytesPerLine + x] : 255;
      }
    }
    if (planes === 4) fixZeroAlpha(out);
    return image;
  }

  let palette;
  if (bits === 8 && planes === 1) {
    palette = new Uint8Array(768);
    if (b.length >= 128 + 769 && b[b.length - 769] === 0x0c) palette.set(b.subarray(b.length - 768));
    else for (let i = 0; i < 256; i++) palette[i * 3] = palette[i * 3 + 1] = palette[i * 3 + 2] = i;
  } else if (bits === 1 && planes === 1) {
    palette = new Uint8Array([0, 0, 0, 255, 255, 255]);
  } else if ((bits === 1 && planes <= 4) || ((bits === 2 || bits === 4) && planes === 1)) {
    palette = b.slice(16, 64);
  } else {
    throw new Error(`unsupported PCX layout ${bits}-bit × ${planes}`);
  }
  for (let y = 0; y < height; y++) {
    const line = y * lineBytes;
    for (let x = 0; x < width; x++) {
      let index;
      if (bits === 8) {
        index = raw[line + x];
      } else if (bits === 1) {
        index = 0;
        for (let k = 0; k < planes; k++) index |= ((raw[line + k * bytesPerLine + (x >> 3)] >> (7 - (x & 7))) & 1) << k;
      } else {
        const perByte = 8 / bits;
        const shift = 8 - bits * (1 + (x % perByte));
        index = (raw[line + Math.floor(x / perByte)] >> shift) & ((1 << bits) - 1);
      }
      const o = (y * width + x) * 4;
      out[o] = palette[index * 3];
      out[o + 1] = palette[index * 3 + 1];
      out[o + 2] = palette[index * 3 + 2];
      out[o + 3] = 255;
    }
  }
  return image;
}

// ---------------------------------------------------------------- Netpbm

const isSpace = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0b || c === 0x0c;

/** Netpbm P1–P6 (ASCII and binary PBM/PGM/PPM, maxval ≤ 65535) and P7 PAM. */
export function decodePnm(input) {
  const b = toBytes(input);
  need(b, 3, 'PNM');
  if (b[0] !== 0x50 || b[1] < 0x31 || b[1] > 0x37) throw new Error('not a Netpbm file');
  const kind = b[1] - 0x30;
  let p = 2;

  const skipSpaceAndComments = () => {
    while (p < b.length) {
      if (isSpace(b[p])) p++;
      else if (b[p] === 0x23) { while (p < b.length && b[p] !== 0x0a && b[p] !== 0x0d) p++; }
      else break;
    }
  };
  const readInt = () => {
    skipSpaceAndComments();
    let v = 0;
    let digits = 0;
    while (p < b.length && b[p] >= 0x30 && b[p] <= 0x39) { v = v * 10 + b[p++] - 0x30; digits++; }
    if (!digits) throw new Error('bad Netpbm number');
    return v;
  };

  let width, height, depth, maxval;
  if (kind === 7) {
    const fields = {};
    let tupleType = '';
    for (;;) {
      if (p >= b.length) throw new Error('truncated PAM header');
      let end = p;
      while (end < b.length && b[end] !== 0x0a) end++;
      const line = ascii(b, p, end - p).trim();
      p = end + 1;
      if (!line || line[0] === '#') continue;
      if (line === 'ENDHDR') break;
      const [key, ...rest] = line.split(/\s+/);
      if (key === 'TUPLTYPE') tupleType += (tupleType ? ' ' : '') + rest.join(' ');
      else fields[key] = Number(rest[0]);
    }
    ({ WIDTH: width, HEIGHT: height, DEPTH: depth, MAXVAL: maxval } = fields);
    if (!(depth >= 1 && depth <= 4)) throw new Error(`unsupported PAM depth ${depth} (${tupleType})`);
  } else {
    width = readInt();
    height = readInt();
    maxval = kind === 1 || kind === 4 ? 1 : readInt();
    depth = kind === 3 || kind === 6 ? 3 : 1;
    if (kind >= 4) p++; // the single whitespace byte before the raster
  }
  if (!(maxval >= 1 && maxval <= 65535)) throw new Error(`bad Netpbm maxval ${maxval}`);
  const image = makeImage(width, height, 'PNM');
  const out = image.data;
  const total = width * height;
  const scale = (v) => (v >= maxval ? 255 : Math.round((v * 255) / maxval));

  // Read every sample into a flat array first.
  const samples = new Uint16Array(total * depth);
  if (kind === 1) {
    for (let i = 0; i < total; i++) {
      skipSpaceAndComments();
      if (p >= b.length) throw new Error('truncated PBM file');
      samples[i] = b[p++] === 0x31 ? 1 : 0;
    }
  } else if (kind === 2 || kind === 3) {
    for (let i = 0; i < samples.length; i++) samples[i] = readInt();
  } else if (kind === 4) {
    const stride = (width + 7) >> 3;
    need(b, p + stride * height, 'PBM');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) samples[y * width + x] = (b[p + y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
    }
  } else {
    const wide = maxval > 255;
    need(b, p + samples.length * (wide ? 2 : 1), 'PNM');
    if (wide) for (let i = 0; i < samples.length; i++, p += 2) samples[i] = u16be(b, p);
    else samples.set(b.subarray(p, p + samples.length));
  }

  // PBM stores ink: 1 is black. PAM BLACKANDWHITE is a normal gray scale.
  const inverted = kind === 1 || kind === 4;
  for (let i = 0; i < total; i++) {
    const s = i * depth;
    const o = i * 4;
    if (depth >= 3) {
      out[o] = scale(samples[s]); out[o + 1] = scale(samples[s + 1]); out[o + 2] = scale(samples[s + 2]);
      out[o + 3] = depth === 4 ? scale(samples[s + 3]) : 255;
    } else {
      const v = inverted ? (samples[s] ? 0 : 255) : scale(samples[s]);
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = depth === 2 ? scale(samples[s + 1]) : 255;
    }
  }
  return image;
}

// ---------------------------------------------------------------- QOI

/** The Quite OK Image format. */
export function decodeQoi(input) {
  const b = toBytes(input);
  need(b, 14, 'QOI');
  if (ascii(b, 0, 4) !== 'qoif') throw new Error('not a QOI file');
  const width = u32be(b, 4);
  const height = u32be(b, 8);
  const image = makeImage(width, height, 'QOI');
  const out = image.data;
  const index = new Uint8Array(64 * 4);
  let r = 0, g = 0, bl = 0, a = 255;
  let p = 14;
  let run = 0;
  const end = b.length - 8; // the stream ends with 7 zero bytes and a 1
  for (let o = 0; o < out.length; o += 4) {
    if (run > 0) {
      run--;
    } else if (p < end) {
      const op = b[p++];
      if (op === 0xfe) {
        r = b[p]; g = b[p + 1]; bl = b[p + 2]; p += 3;
      } else if (op === 0xff) {
        r = b[p]; g = b[p + 1]; bl = b[p + 2]; a = b[p + 3]; p += 4;
      } else {
        const tag = op >> 6;
        if (tag === 0) {
          const i = (op & 63) * 4;
          r = index[i]; g = index[i + 1]; bl = index[i + 2]; a = index[i + 3];
        } else if (tag === 1) {
          r = (r + ((op >> 4) & 3) - 2) & 255;
          g = (g + ((op >> 2) & 3) - 2) & 255;
          bl = (bl + (op & 3) - 2) & 255;
        } else if (tag === 2) {
          const next = b[p++];
          const dg = (op & 63) - 32;
          r = (r + dg - 8 + (next >> 4)) & 255;
          g = (g + dg) & 255;
          bl = (bl + dg - 8 + (next & 15)) & 255;
        } else {
          run = op & 63;
        }
      }
      const h = ((r * 3 + g * 5 + bl * 7 + a * 11) % 64) * 4;
      index[h] = r; index[h + 1] = g; index[h + 2] = bl; index[h + 3] = a;
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = a;
  }
  return image;
}

// ---------------------------------------------------------------- Radiance HDR

/** Radiance RGBE (.hdr): flat, old-style and new-style RLE scan lines; Reinhard + gamma 2.2 to 8 bits. */
export function decodeHdr(input) {
  const b = toBytes(input);
  let p = 0;
  const readLine = () => {
    let end = p;
    while (end < b.length && b[end] !== 0x0a) end++;
    if (end >= b.length) throw new Error('truncated HDR header');
    const line = ascii(b, p, end - p).replace(/\r$/, '');
    p = end + 1;
    return line;
  };
  const first = readLine();
  if (!first.startsWith('#?')) throw new Error('not a Radiance HDR file');
  let format = '32-bit_rle_rgbe';
  for (let line = readLine(); line !== ''; line = readLine()) {
    if (line.startsWith('FORMAT=')) format = line.slice(7).trim();
  }
  if (format !== '32-bit_rle_rgbe') throw new Error(`unsupported HDR format ${format}`);
  const m = /^([-+])Y\s+(\d+)\s+([-+])X\s+(\d+)$/.exec(readLine().trim());
  if (!m) throw new Error('unsupported HDR orientation');
  const height = Number(m[2]);
  const width = Number(m[4]);
  const flipY = m[1] === '+';
  const flipX = m[3] === '-';
  const image = makeImage(width, height, 'HDR');
  const out = image.data;
  const line = new Uint8Array(width * 4);
  const curve = (v) => Math.round(255 * Math.pow(v / (1 + v), 1 / 2.2));

  for (let row = 0; row < height; row++) {
    if (width >= 8 && width < 0x8000 && b[p] === 2 && b[p + 1] === 2 && !(b[p + 2] & 0x80) && ((b[p + 2] << 8) | b[p + 3]) === width) {
      // New RLE: four runs of components, each run-length encoded.
      p += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < width) {
          need(b, p + 1, 'HDR');
          let count = b[p++];
          if (count > 128) {
            count -= 128;
            if (x + count > width) throw new Error('bad HDR run');
            const v = b[p++];
            for (let i = 0; i < count; i++) line[(x++) * 4 + c] = v;
          } else {
            if (!count || x + count > width) throw new Error('bad HDR run');
            need(b, p + count, 'HDR');
            for (let i = 0; i < count; i++) line[(x++) * 4 + c] = b[p++];
          }
        }
      }
    } else {
      // Flat pixels, possibly with old-style (1,1,1,n) repeats.
      let x = 0;
      let shift = 0;
      while (x < width) {
        need(b, p + 4, 'HDR');
        if (b[p] === 1 && b[p + 1] === 1 && b[p + 2] === 1) {
          const count = b[p + 3] << shift;
          p += 4;
          if (!x) throw new Error('bad HDR run');
          for (let i = 0; i < count && x < width; i++, x++) line.copyWithin(x * 4, (x - 1) * 4, x * 4);
          shift += 8;
        } else {
          line[x * 4] = b[p]; line[x * 4 + 1] = b[p + 1]; line[x * 4 + 2] = b[p + 2]; line[x * 4 + 3] = b[p + 3];
          p += 4;
          x++;
          shift = 0;
        }
      }
    }
    const y = flipY ? height - 1 - row : row;
    for (let x = 0; x < width; x++) {
      const e = line[x * 4 + 3];
      const f = e ? Math.pow(2, e - 136) : 0;
      const o = (y * width + (flipX ? width - 1 - x : x)) * 4;
      out[o] = curve(line[x * 4] * f);
      out[o + 1] = curve(line[x * 4 + 1] * f);
      out[o + 2] = curve(line[x * 4 + 2] * f);
      out[o + 3] = 255;
    }
  }
  return image;
}

// ---------------------------------------------------------------- DDS

const FOURCC = (s) => s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24);

/** DirectDraw Surface, first mip level: uncompressed (bit masks), DXT1/BC1, DXT3/BC2, DXT5/BC3, BC4, BC5. */
export function decodeDds(input) {
  const b = toBytes(input);
  need(b, 128, 'DDS');
  if (ascii(b, 0, 4) !== 'DDS ') throw new Error('not a DDS file');
  const height = u32le(b, 12);
  const width = u32le(b, 16);
  const pfFlags = u32le(b, 80);
  const fourCC = u32le(b, 84) | 0;
  const bitCount = u32le(b, 88);
  const masks = [u32le(b, 92), u32le(b, 96), u32le(b, 100), u32le(b, 104)];
  const image = makeImage(width, height, 'DDS');
  let p = 128;

  let block = null;
  let swizzle = null;
  if (pfFlags & 0x4) {
    if (fourCC === FOURCC('DXT1')) block = 'bc1';
    else if (fourCC === FOURCC('DXT2') || fourCC === FOURCC('DXT3')) block = 'bc2';
    else if (fourCC === FOURCC('DXT4') || fourCC === FOURCC('DXT5')) block = 'bc3';
    else if (fourCC === FOURCC('ATI1') || fourCC === FOURCC('BC4U')) block = 'bc4';
    else if (fourCC === FOURCC('ATI2') || fourCC === FOURCC('BC5U')) block = 'bc5';
    else if (fourCC === FOURCC('DX10')) {
      need(b, 148, 'DDS');
      const dxgi = u32le(b, 128);
      p = 148;
      if (dxgi === 71 || dxgi === 72) block = 'bc1';
      else if (dxgi === 74 || dxgi === 75) block = 'bc2';
      else if (dxgi === 77 || dxgi === 78) block = 'bc3';
      else if (dxgi === 80) block = 'bc4';
      else if (dxgi === 83) block = 'bc5';
      else if (dxgi === 28 || dxgi === 29) swizzle = { bits: 32, masks: [0xff, 0xff00, 0xff0000, 0xff000000] };
      else if (dxgi === 87 || dxgi === 91) swizzle = { bits: 32, masks: [0xff0000, 0xff00, 0xff, 0xff000000] };
      else if (dxgi === 88 || dxgi === 93) swizzle = { bits: 32, masks: [0xff0000, 0xff00, 0xff, 0] };
      else throw new Error(`unsupported DDS DXGI format ${dxgi}`);
    } else {
      throw new Error(`unsupported DDS compression ${ascii(b, 84, 4)}`);
    }
  } else {
    const hasAlpha = (pfFlags & 0x1) !== 0 || (pfFlags & 0x2) !== 0;
    if (pfFlags & 0x20000) swizzle = { bits: bitCount, masks: [masks[0], masks[0], masks[0], hasAlpha ? masks[3] : 0] };
    else if (pfFlags & 0x2 && !(pfFlags & 0x40)) swizzle = { bits: bitCount, masks: [0, 0, 0, masks[3]] };
    else swizzle = { bits: bitCount, masks: [masks[0], masks[1], masks[2], hasAlpha ? masks[3] : 0] };
  }

  if (swizzle) decodeMasked(b, p, image, swizzle);
  else decodeBlocks(b, p, image, block);
  return image;
}

function decodeMasked(b, p, image, { bits, masks }) {
  const { width, height, data: out } = image;
  const bytes = bits >> 3;
  if (![1, 2, 3, 4].includes(bytes) || bits % 8) throw new Error(`unsupported DDS bit count ${bits}`);
  const stride = width * bytes;
  need(b, p + stride * height, 'DDS');
  const channels = masks.map((mask) => {
    if (!mask) return null;
    let shift = 0;
    while (!((mask >>> shift) & 1)) shift++;
    let size = 0;
    while ((mask >>> (shift + size)) & 1) size++;
    return { mask, shift, max: 2 ** size - 1 };
  });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = p + y * stride + x * bytes;
      let v = b[at];
      if (bytes > 1) v |= b[at + 1] << 8;
      if (bytes > 2) v |= b[at + 2] << 16;
      if (bytes > 3) v = (v | (b[at + 3] << 24)) >>> 0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const ch = channels[c];
        out[o + c] = ch ? Math.round((((v & ch.mask) >>> 0) >>> ch.shift) * 255 / ch.max) : c === 3 ? 255 : 0;
      }
    }
  }
}

function color565(v, out, o) {
  const r = (v >> 11) & 31, g = (v >> 5) & 63, bl = v & 31;
  out[o] = (r << 3) | (r >> 2);
  out[o + 1] = (g << 2) | (g >> 4);
  out[o + 2] = (bl << 3) | (bl >> 2);
  out[o + 3] = 255;
}

/** 4×4 BC1 colors → 16 RGBA pixels in `px`. */
function decodeColorBlock(b, p, px, allowTransparent) {
  const c0 = u16le(b, p);
  const c1 = u16le(b, p + 2);
  const pal = new Uint8Array(16);
  color565(c0, pal, 0);
  color565(c1, pal, 4);
  if (c0 > c1 || !allowTransparent) {
    for (let k = 0; k < 3; k++) {
      pal[8 + k] = Math.round((2 * pal[k] + pal[4 + k]) / 3);
      pal[12 + k] = Math.round((pal[k] + 2 * pal[4 + k]) / 3);
    }
    pal[11] = pal[15] = 255;
  } else {
    for (let k = 0; k < 3; k++) pal[8 + k] = Math.round((pal[k] + pal[4 + k]) / 2);
    pal[11] = 255;
    pal[12] = pal[13] = pal[14] = pal[15] = 0;
  }
  for (let i = 0; i < 16; i++) {
    const code = (b[p + 4 + (i >> 2)] >> ((i & 3) * 2)) & 3;
    px.set(pal.subarray(code * 4, code * 4 + 4), i * 4);
  }
}

/** BC3/BC4 alpha block → 16 values written to px[i*4 + channel]. */
function decodeAlphaBlock(b, p, px, channel) {
  const a0 = b[p];
  const a1 = b[p + 1];
  const pal = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) pal.push(Math.round(((7 - i) * a0 + i * a1) / 7));
  else { for (let i = 1; i < 5; i++) pal.push(Math.round(((5 - i) * a0 + i * a1) / 5)); pal.push(0, 255); }
  let bits = 0;
  for (let k = 5; k >= 0; k--) bits = bits * 256 + b[p + 2 + k];
  for (let i = 0; i < 16; i++) {
    px[i * 4 + channel] = pal[bits % 8];
    bits = Math.floor(bits / 8);
  }
}

function decodeBlocks(b, p, image, kind) {
  const { width, height, data: out } = image;
  const blockBytes = kind === 'bc1' || kind === 'bc4' ? 8 : 16;
  const bw = Math.ceil(width / 4);
  const bh = Math.ceil(height / 4);
  need(b, p + bw * bh * blockBytes, 'DDS');
  const px = new Uint8Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++, p += blockBytes) {
      if (kind === 'bc1') {
        decodeColorBlock(b, p, px, true);
      } else if (kind === 'bc2') {
        decodeColorBlock(b, p + 8, px, false);
        for (let i = 0; i < 16; i++) px[i * 4 + 3] = ((b[p + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
      } else if (kind === 'bc3') {
        decodeColorBlock(b, p + 8, px, false);
        decodeAlphaBlock(b, p, px, 3);
      } else if (kind === 'bc4') {
        decodeAlphaBlock(b, p, px, 0);
        for (let i = 0; i < 16; i++) { px[i * 4 + 1] = px[i * 4 + 2] = px[i * 4]; px[i * 4 + 3] = 255; }
      } else {
        decodeAlphaBlock(b, p, px, 0);
        decodeAlphaBlock(b, p + 8, px, 1);
        for (let i = 0; i < 16; i++) { px[i * 4 + 2] = 0; px[i * 4 + 3] = 255; }
      }
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3);
        const y = by * 4 + (i >> 2);
        if (x < width && y < height) out.set(px.subarray(i * 4, i * 4 + 4), (y * width + x) * 4);
      }
    }
  }
}

// ---------------------------------------------------------------- SGI

/** SGI image (.sgi/.rgb/.bw): 8 or 16 bits per channel, verbatim or RLE, 1–4 channels. */
export function decodeSgi(input) {
  const b = toBytes(input);
  need(b, 512, 'SGI');
  if (u16be(b, 0) !== 474) throw new Error('not an SGI image');
  const rle = b[2] === 1;
  const bpc = b[3];
  const dimension = u16be(b, 4);
  const width = u16be(b, 6);
  const height = dimension === 1 ? 1 : u16be(b, 8);
  const channels = dimension < 3 ? 1 : u16be(b, 10);
  if (bpc !== 1 && bpc !== 2) throw new Error(`unsupported SGI depth ${bpc}`);
  if (channels < 1) throw new Error('bad SGI channel count');
  const image = makeImage(width, height, 'SGI');
  const out = image.data;
  const row = new Uint8Array(width);

  const readRow = (y, c) => {
    if (!rle) {
      const at = 512 + ((c * height + y) * width) * bpc;
      need(b, at + width * bpc, 'SGI');
      for (let x = 0; x < width; x++) row[x] = b[at + x * bpc];
      return;
    }
    const tab = 512 + (c * height + y) * 4;
    need(b, 512 + channels * height * 8, 'SGI');
    let p = u32be(b, tab);
    let x = 0;
    for (;;) {
      need(b, p + bpc, 'SGI');
      const v = bpc === 2 ? u16be(b, p) : b[p];
      p += bpc;
      let count = v & 0x7f;
      if (!count) break;
      count = Math.min(count, width - x);
      if (v & 0x80) {
        need(b, p + count * bpc, 'SGI');
        for (let i = 0; i < count; i++, p += bpc) row[x++] = b[p];
      } else {
        need(b, p + bpc, 'SGI');
        row.fill(b[p], x, x + count);
        x += count;
        p += bpc;
      }
    }
    row.fill(0, x);
  };

  for (let y = 0; y < height; y++) {
    const o = (height - 1 - y) * width * 4; // rows run bottom to top
    if (channels >= 3) {
      for (let c = 0; c < Math.min(channels, 4); c++) {
        readRow(y, c);
        for (let x = 0; x < width; x++) out[o + x * 4 + c] = row[x];
      }
      if (channels === 3) for (let x = 0; x < width; x++) out[o + x * 4 + 3] = 255;
    } else {
      readRow(y, 0);
      for (let x = 0; x < width; x++) { out[o + x * 4] = out[o + x * 4 + 1] = out[o + x * 4 + 2] = row[x]; out[o + x * 4 + 3] = 255; }
      if (channels === 2) {
        readRow(y, 1);
        for (let x = 0; x < width; x++) out[o + x * 4 + 3] = row[x];
      }
    }
  }
  return image;
}

// ---------------------------------------------------------------- Sun raster

/** Sun raster (.ras): 1/8/24/32-bit, raw or byte-RLE (type 2), BGR or RGB (type 3), RGB color maps. */
export function decodeRas(input) {
  const b = toBytes(input);
  need(b, 32, 'Sun raster');
  if (u32be(b, 0) !== 0x59a66a95) throw new Error('not a Sun raster file');
  const width = u32be(b, 4);
  const height = u32be(b, 8);
  const depth = u32be(b, 12);
  const type = u32be(b, 20);
  const mapType = u32be(b, 24);
  const mapLength = u32be(b, 28);
  if (![1, 8, 24, 32].includes(depth)) throw new Error(`unsupported Sun raster depth ${depth}`);
  if (type > 3) throw new Error(`unsupported Sun raster type ${type}`);
  const image = makeImage(width, height, 'Sun raster');
  need(b, 32 + mapLength, 'Sun raster');
  let map = null;
  if (mapType === 1 && mapLength) {
    const n = Math.floor(mapLength / 3);
    map = new Uint8Array(256 * 3);
    for (let i = 0; i < n && i < 256; i++) {
      map[i * 3] = b[32 + i];
      map[i * 3 + 1] = b[32 + n + i];
      map[i * 3 + 2] = b[32 + 2 * n + i];
    }
  } else if (mapType !== 0 && mapLength) {
    throw new Error('unsupported Sun raster color map');
  }
  const stride = (((width * depth + 7) >> 3) + 1) & ~1; // rows pad to 16 bits
  let raw = b.subarray(32 + mapLength);
  if (type === 2) {
    const size = stride * height;
    const dec = new Uint8Array(size);
    let p = 0;
    let o = 0;
    while (o < size && p < raw.length) {
      const v = raw[p++];
      if (v !== 0x80) { dec[o++] = v; continue; }
      const n = raw[p++];
      if (n === 0) { dec[o++] = 0x80; continue; }
      const value = raw[p++];
      const count = Math.min(n + 1, size - o);
      dec.fill(value, o, o + count);
      o += count;
    }
    raw = dec;
  }
  if (raw.length < stride * height) throw new Error('truncated Sun raster file');
  const out = image.data;
  const rgbOrder = type === 3;
  for (let y = 0; y < height; y++) {
    const line = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o + 3] = 255;
      if (depth === 1) {
        const bit = (raw[line + (x >> 3)] >> (7 - (x & 7))) & 1;
        if (map) { out[o] = map[bit * 3]; out[o + 1] = map[bit * 3 + 1]; out[o + 2] = map[bit * 3 + 2]; }
        else out[o] = out[o + 1] = out[o + 2] = bit ? 0 : 255;
      } else if (depth === 8) {
        const v = raw[line + x];
        if (map) { out[o] = map[v * 3]; out[o + 1] = map[v * 3 + 1]; out[o + 2] = map[v * 3 + 2]; }
        else out[o] = out[o + 1] = out[o + 2] = v;
      } else {
        const at = line + x * (depth >> 3) + (depth === 32 ? 1 : 0); // 32-bit pixels lead with a pad byte
        out[o] = raw[at + (rgbOrder ? 0 : 2)];
        out[o + 1] = raw[at + 1];
        out[o + 2] = raw[at + (rgbOrder ? 2 : 0)];
      }
    }
  }
  return image;
}

// ---------------------------------------------------------------- XBM

/** X bitmap C source (X11 char arrays and X10 short arrays); set bits are black on white. */
export function decodeXbm(input) {
  const text = typeof input === 'string' ? input : new TextDecoder('latin1').decode(toBytes(input));
  const define = (suffix) => {
    const m = new RegExp(`#define\\s+\\S*?${suffix}\\s+(\\d+)`).exec(text);
    return m ? Number(m[1]) : NaN;
  };
  const width = define('width');
  const height = define('height');
  const open = text.indexOf('{');
  const close = text.indexOf('}', open);
  if (open < 0 || close < 0 || !(width > 0) || !(height > 0)) throw new Error('not an X bitmap');
  const wordBits = /\bshort\b/.test(text.slice(0, open)) ? 16 : 8;
  const values = text.slice(open + 1, close).split(',').map((s) => s.trim()).filter(Boolean).map((s) => Number.parseInt(s, /^0x/i.test(s) ? 16 : 10));
  const wordsPerRow = Math.ceil(width / wordBits);
  if (values.length < wordsPerRow * height || values.some(Number.isNaN)) throw new Error('truncated X bitmap');
  const image = makeImage(width, height, 'XBM');
  const out = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const word = values[y * wordsPerRow + Math.floor(x / wordBits)];
      const v = (word >> (x % wordBits)) & 1 ? 0 : 255;
      const o = (y * width + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return image;
}

// ---------------------------------------------------------------- ICO

/** Windows icon / cursor: the largest entry; PNG entries come back as { png, width, height }. */
export function decodeIco(input) {
  const b = toBytes(input);
  need(b, 6, 'ICO');
  const kind = u16le(b, 2);
  const count = u16le(b, 4);
  if (u16le(b, 0) !== 0 || (kind !== 1 && kind !== 2) || !count) throw new Error('not an ICO file');
  need(b, 6 + count * 16, 'ICO');
  let best = null;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const entry = {
      width: b[e] || 256,
      height: b[e + 1] || 256,
      bpp: kind === 1 ? u16le(b, e + 6) : 0,
      size: u32le(b, e + 8),
      offset: u32le(b, e + 12),
    };
    if (entry.offset + entry.size > b.length || entry.size < 16) continue;
    const bytes = b.subarray(entry.offset, entry.offset + entry.size);
    if (u32be(bytes, 0) === 0x89504e47) {
      entry.png = bytes;
      entry.width = u32be(bytes, 16);
      entry.height = u32be(bytes, 20);
      entry.bpp = 32;
    } else {
      entry.bpp = u16le(bytes, 14);
      entry.width = Math.abs(u32le(bytes, 4) | 0);
      entry.height = Math.abs(u32le(bytes, 8) | 0) >> 1;
    }
    entry.bytes = bytes;
    const area = entry.width * entry.height;
    if (!best || area > best.width * best.height || (area === best.width * best.height && entry.bpp > best.bpp)) best = entry;
  }
  if (!best) throw new Error('no usable ICO entry');
  if (best.png) return { png: best.png, width: best.width, height: best.height };
  return decodeIcoBitmap(best.bytes);
}

function decodeIcoBitmap(b) {
  const headerSize = u32le(b, 0);
  const width = u32le(b, 4) | 0;
  const fullHeight = u32le(b, 8) | 0;
  const bpp = u16le(b, 14);
  const compression = u32le(b, 16);
  const used = u32le(b, 32);
  const height = Math.abs(fullHeight) >> 1;
  const topDown = fullHeight < 0;
  if (compression !== 0 && compression !== 3) throw new Error('unsupported ICO bitmap compression');
  const image = makeImage(width, height, 'ICO');
  let p = headerSize;
  let palette = null;
  if (bpp <= 8) {
    const n = used || 1 << bpp;
    need(b, p + n * 4, 'ICO');
    palette = b.subarray(p, p + n * 4);
    p += n * 4;
  } else if (compression === 3 && headerSize === 40) {
    p += 12; // bit field masks follow a plain BITMAPINFOHEADER
  }
  const stride = ((width * bpp + 31) >> 5) * 4;
  const maskStride = ((width + 31) >> 5) * 4;
  const maskStart = p + stride * height;
  need(b, maskStart, 'ICO');
  const hasMask = b.length >= maskStart + maskStride * height;
  const out = image.data;
  for (let row = 0; row < height; row++) {
    const y = topDown ? row : height - 1 - row;
    const line = p + row * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (bpp <= 8) {
        const per = 8 / bpp;
        const index = (b[line + Math.floor(x / per)] >> (8 - bpp * (1 + (x % per)))) & ((1 << bpp) - 1);
        const c = index * 4;
        out[o] = palette[c + 2] ?? 0; out[o + 1] = palette[c + 1] ?? 0; out[o + 2] = palette[c] ?? 0; out[o + 3] = 255;
      } else if (bpp === 16) {
        const v = u16le(b, line + x * 2);
        out[o] = ((v >> 10) & 31) * 255 / 31 + 0.5 | 0;
        out[o + 1] = ((v >> 5) & 31) * 255 / 31 + 0.5 | 0;
        out[o + 2] = (v & 31) * 255 / 31 + 0.5 | 0;
        out[o + 3] = 255;
      } else if (bpp === 24 || bpp === 32) {
        const at = line + x * (bpp >> 3);
        out[o] = b[at + 2]; out[o + 1] = b[at + 1]; out[o + 2] = b[at];
        out[o + 3] = bpp === 32 ? b[at + 3] : 255;
      } else {
        throw new Error(`unsupported ICO bit depth ${bpp}`);
      }
    }
  }
  // 32-bit entries carry their own alpha; the AND mask only matters when it is all zero.
  let useMask = bpp !== 32;
  if (bpp === 32) {
    useMask = true;
    for (let i = 3; i < out.length; i += 4) if (out[i]) { useMask = false; break; }
    if (useMask && !hasMask) for (let i = 3; i < out.length; i += 4) out[i] = 255;
  }
  if (useMask && hasMask) {
    for (let row = 0; row < height; row++) {
      const y = topDown ? row : height - 1 - row;
      const line = maskStart + row * maskStride;
      for (let x = 0; x < width; x++) out[(y * width + x) * 4 + 3] = (b[line + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0 : 255;
    }
  }
  return image;
}

// ---------------------------------------------------------------- dispatch

/** Extension → decoder name. */
export const EXTRA_FORMATS = {
  tga: 'tga', icb: 'tga', vda: 'tga', vst: 'tga',
  pcx: 'pcx', pcc: 'pcx',
  pbm: 'pnm', pgm: 'pnm', ppm: 'pnm', pnm: 'pnm', pam: 'pnm',
  qoi: 'qoi',
  hdr: 'hdr', rgbe: 'hdr',
  dds: 'dds',
  sgi: 'sgi', rgb: 'sgi', rgba: 'sgi', bw: 'sgi', int: 'sgi', inta: 'sgi',
  ras: 'ras', sun: 'ras',
  xbm: 'xbm',
};

const DECODERS = {
  tga: decodeTga, pcx: decodePcx, pnm: decodePnm, qoi: decodeQoi, hdr: decodeHdr, dds: decodeDds,
  sgi: decodeSgi, ras: decodeRas, xbm: decodeXbm, ico: decodeIco,
};

/** Decodes by file extension (or decoder name, e.g. 'ico'). */
export function decodeExtra(bytes, ext) {
  const key = String(ext).toLowerCase().replace(/^\./, '');
  const decoder = DECODERS[EXTRA_FORMATS[key] ?? key];
  if (!decoder) throw new Error(`no decoder for .${key}`);
  return decoder(bytes);
}
