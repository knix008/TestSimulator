// Photoshop PSD / PSB: reads the merged ("composite") image that Photoshop
// stores after the layers. Bitmap, grayscale, indexed, RGB, CMYK and Lab at
// 1/8/16/32 bits; raw, PackBits (RLE) and ZIP compression.
import pako from 'pako';

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
  }
  u8() { return this.bytes[this.p++]; }
  u16() { const v = this.view.getUint16(this.p); this.p += 2; return v; }
  u32() { const v = this.view.getUint32(this.p); this.p += 4; return v; }
  u64() { const hi = this.u32(); const lo = this.u32(); return hi * 2 ** 32 + lo; }
  skip(n) { this.p += n; }
}

function unpackBits(source, start, length, out, outStart, outLength) {
  let p = start;
  const end = start + length;
  let o = outStart;
  const outEnd = outStart + outLength;
  while (p < end && o < outEnd) {
    let n = source[p++];
    if (n > 127) n -= 256;
    if (n >= 0) {
      const count = Math.min(n + 1, outEnd - o, end - p);
      out.set(source.subarray(p, p + count), o);
      p += n + 1;
      o += count;
    } else if (n !== -128) {
      const value = source[p++];
      const count = Math.min(1 - n, outEnd - o);
      out.fill(value, o, o + count);
      o += count;
    }
  }
}

/** Header fields only (cheap): { width, height, channels, depth, mode, version }. */
export function psdInfo(bytes) {
  const r = new Reader(bytes);
  if (r.u32() !== 0x38425053) throw new Error('not a PSD file');
  const version = r.u16();
  r.skip(6);
  const channels = r.u16();
  const height = r.u32();
  const width = r.u32();
  const depth = r.u16();
  const mode = r.u16();
  return { version, channels, height, width, depth, mode };
}

/** Decodes the composite image → { width, height, data: Uint8ClampedArray (RGBA) }. */
export function decodePsd(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const info = psdInfo(bytes);
  const { version, channels, width, height, depth, mode } = info;
  if (!width || !height || width * height > 300_000_000) throw new Error('unsupported PSD size');
  const r = new Reader(bytes);
  r.p = 26;
  const colorDataLength = r.u32();
  const palette = bytes.subarray(r.p, r.p + colorDataLength);
  r.skip(colorDataLength);
  r.skip(r.u32()); // image resources
  r.skip(version === 2 ? r.u64() : r.u32()); // layers and masks
  const compression = r.u16();

  const bytesPerSample = depth === 16 ? 2 : depth === 32 ? 4 : 1;
  const rowBytes = depth === 1 ? Math.ceil(width / 8) : width * bytesPerSample;
  const planeBytes = rowBytes * height;
  const planes = new Uint8Array(planeBytes * channels);

  if (compression === 0) {
    planes.set(bytes.subarray(r.p, r.p + planes.length));
  } else if (compression === 1) {
    const rows = channels * height;
    const counts = new Array(rows);
    for (let i = 0; i < rows; i++) counts[i] = version === 2 ? r.u32() : r.u16();
    let p = r.p;
    for (let i = 0; i < rows; i++) {
      unpackBits(bytes, p, counts[i], planes, i * rowBytes, rowBytes);
      p += counts[i];
    }
  } else if (compression === 2 || compression === 3) {
    const inflated = pako.inflate(bytes.subarray(r.p));
    if (compression === 3) {
      // ZIP with prediction: per-row deltas (8/16 bit).
      for (let c = 0; c < channels; c++) {
        for (let y = 0; y < height; y++) {
          const row = c * planeBytes + y * rowBytes;
          if (bytesPerSample === 2) {
            for (let x = 1; x < width; x++) {
              const prev = (inflated[row + (x - 1) * 2] << 8) | inflated[row + (x - 1) * 2 + 1];
              const value = (prev + ((inflated[row + x * 2] << 8) | inflated[row + x * 2 + 1])) & 0xffff;
              inflated[row + x * 2] = value >> 8;
              inflated[row + x * 2 + 1] = value & 0xff;
            }
          } else {
            for (let x = 1; x < rowBytes; x++) inflated[row + x] = (inflated[row + x] + inflated[row + x - 1]) & 0xff;
          }
        }
      }
    }
    planes.set(inflated.subarray(0, planes.length));
  } else {
    throw new Error(`unsupported PSD compression ${compression}`);
  }

  const sample = (channel, i) => {
    const base = channel * planeBytes;
    if (depth === 8) return planes[base + i];
    if (depth === 16) return planes[base + i * 2];
    if (depth === 32) {
      const view = new DataView(planes.buffer, base + i * 4, 4);
      return Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, view.getFloat32(0)), 1 / 2.2) * 255)));
    }
    // 1 bit: 0 = white in Photoshop bitmaps.
    const y = Math.floor(i / width);
    const x = i % width;
    return planes[base + y * rowBytes + (x >> 3)] & (0x80 >> (x & 7)) ? 0 : 255;
  };

  const out = new Uint8ClampedArray(width * height * 4);
  const count = width * height;
  const hasAlpha = (mode === 3 && channels >= 4) || (mode === 1 && channels >= 2) || (mode === 4 && channels >= 5);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    switch (mode) {
      case 0: case 1: { const v = sample(0, i); out[o] = v; out[o + 1] = v; out[o + 2] = v; break; }
      case 2: {
        const index = sample(0, i);
        out[o] = palette[index] ?? 0; out[o + 1] = palette[256 + index] ?? 0; out[o + 2] = palette[512 + index] ?? 0;
        break;
      }
      case 4: {
        // Photoshop stores CMYK inverted (0 = full ink).
        const c = 1 - sample(0, i) / 255; const m = 1 - sample(1, i) / 255; const y = 1 - sample(2, i) / 255; const k = 1 - sample(3, i) / 255;
        out[o] = 255 * (1 - c) * (1 - k); out[o + 1] = 255 * (1 - m) * (1 - k); out[o + 2] = 255 * (1 - y) * (1 - k);
        break;
      }
      case 9: {
        const [R, G, B] = labToRgb((sample(0, i) / 255) * 100, sample(1, i) - 128, sample(2, i) - 128);
        out[o] = R; out[o + 1] = G; out[o + 2] = B;
        break;
      }
      default: out[o] = sample(0, i); out[o + 1] = sample(Math.min(1, channels - 1), i); out[o + 2] = sample(Math.min(2, channels - 1), i);
    }
    out[o + 3] = hasAlpha ? sample(mode === 3 ? 3 : mode === 4 ? 4 : 1, i) : 255;
  }
  return { width, height, data: out };
}

function labToRgb(L, a, b) {
  let y = (L + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;
  const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  x = 0.95047 * f(x); y = f(y); z = 1.08883 * f(z);
  const lin = [x * 3.2406 + y * -1.5372 + z * -0.4986, x * -0.9689 + y * 1.8758 + z * 0.0415, x * 0.0557 + y * -0.204 + z * 1.057];
  return lin.map((v) => Math.max(0, Math.min(255, Math.round(255 * (v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v)))));
}

/** Minimal 8-bit RGB PSD writer (raw composite) — used by the test fixtures. */
export function encodePsd({ width, height, data }, { rle = true } = {}) {
  const channels = 3;
  const header = new Uint8Array(26);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, 0x38425053); hv.setUint16(4, 1); hv.setUint16(12, channels); hv.setUint32(14, height); hv.setUint32(18, width); hv.setUint16(22, 8); hv.setUint16(24, 3);
  const sections = new Uint8Array(12); // color mode, resources, layers: all empty
  const rows = [];
  for (let c = 0; c < channels; c++) {
    for (let y = 0; y < height; y++) {
      const row = new Uint8Array(width);
      for (let x = 0; x < width; x++) row[x] = data[(y * width + x) * 4 + c];
      rows.push(rle ? packBits(row) : row);
    }
  }
  const counts = rle ? new Uint8Array(rows.length * 2) : new Uint8Array(0);
  if (rle) rows.forEach((row, i) => { counts[i * 2] = row.length >> 8; counts[i * 2 + 1] = row.length & 0xff; });
  const body = rows.reduce((sum, row) => sum + row.length, 0);
  const out = new Uint8Array(header.length + sections.length + 2 + counts.length + body);
  out.set(header, 0);
  out.set(sections, 26);
  out[38] = 0; out[39] = rle ? 1 : 0;
  out.set(counts, 40);
  let p = 40 + counts.length;
  for (const row of rows) { out.set(row, p); p += row.length; }
  return out;
}

function packBits(row) {
  const out = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++;
    if (run > 1) {
      out.push(257 - run, row[i]);
      i += run;
    } else {
      let literal = 1;
      while (i + literal < row.length && literal < 128 && row[i + literal] !== row[i + literal - 1]) literal++;
      if (i + literal < row.length && literal > 1) literal--;
      out.push(literal - 1, ...row.subarray(i, i + literal));
      i += literal;
    }
  }
  return Uint8Array.from(out);
}
