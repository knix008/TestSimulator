// Picture formats the browser does not decode, decoded here.
//
// A WebView shows JPEG, PNG, GIF, WebP, BMP, AVIF, SVG and ICO by itself.
// Everything else a reader may be handed — game textures, scientific images,
// Photoshop files, Unix bitmaps, HDR photographs — would otherwise be a blank
// page. Each decoder below turns one of those formats into plain 8-bit RGBA
// ({ width, height, data }), which the caller paints onto a canvas exactly as
// it does for TIFF (tiff.js).
//
// Covered: TGA, the PNM family (PBM/PGM/PPM/PAM/PFM), PCX, QOI, Radiance HDR,
// farbfeld, DDS (uncompressed and BC1–BC5), XBM, XPM, PSD/PSB (the merged
// composite image), SGI and WBMP.
//
// Camera RAW files are not decoded (demosaicing a sensor dump is a different
// job); every camera embeds a full-size or near-full-size JPEG preview, and
// rawPreviewJpeg() digs out the largest one so the browser can show it.
//
// Nothing here touches the DOM, so all of it runs (and is tested) in Node.
import { inflate } from './inflate.js';

/** Extensions decoded by this module. */
export const EXTRA_IMAGE_EXTENSIONS = [
  'tga', 'targa', 'icb', 'vda', 'vst',
  'pbm', 'pgm', 'ppm', 'pnm', 'pam', 'pfm',
  'pcx',
  'qoi',
  'hdr', 'pic', 'rgbe',
  'ff', 'farbfeld',
  'dds',
  'xbm', 'xpm',
  'psd', 'psb',
  'sgi', 'rgb', 'rgba', 'bw', 'int', 'inta',
  'wbmp',
];

/** Camera RAW extensions — shown through their embedded JPEG preview. */
export const RAW_IMAGE_EXTENSIONS = [
  'dng', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'orf', 'rw2', 'raf',
  'pef', 'srw', 'x3f', 'erf', 'kdc', 'dcr', 'mrw', '3fr', 'mef', 'mos', 'iiq', 'rwl',
];

/** Largest picture accepted, in pixels — beyond this the RGBA buffer alone is > 1 GB. */
const MAX_PIXELS = 1 << 28;

// ── Small helpers ──────────────────────────────────────────────────────────

function fail(format, message) {
  throw new Error(`${format}: ${message}`);
}

function newImage(format, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail(format, `invalid picture size ${width} × ${height}.`);
  }
  if (width * height > MAX_PIXELS) fail(format, `picture is too large (${width} × ${height}).`);
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes, start, length) {
  let s = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function startsWith(bytes, text, at = 0) {
  if (!bytes || bytes.length < at + text.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

function latin1(bytes, start = 0, end = bytes.length) {
  let s = '';
  for (let i = start; i < end; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(end, i + 8192)));
  }
  return s;
}

const isSpace = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0b || c === 0x0c;

/**
 * Linear light → 8-bit display value. `scale` comes from the tone mapper; the
 * default 2.2 gamma is close enough to sRGB for a viewer.
 */
function toDisplay(v) {
  if (!(v > 0)) return 0;
  if (v >= 1) return 255;
  return Math.round(Math.pow(v, 1 / 2.2) * 255);
}

/**
 * Tone maps linear float RGB (3 floats per pixel) into the RGBA image.
 * 'clamp' clips at 1; 'reinhard' applies Reinhard's global operator with the
 * usual 0.18 key; 'auto' clamps when nothing is brighter than 1 and uses
 * Reinhard otherwise.
 */
function toneMap(floats, image, alpha, mode = 'auto') {
  const n = image.width * image.height;
  let max = 0;
  for (let i = 0; i < floats.length; i++) if (floats[i] > max) max = floats[i];
  const useReinhard = mode === 'reinhard' || (mode === 'auto' && max > 1);
  let scale = 1;
  if (useReinhard) {
    let sum = 0;
    for (let p = 0; p < n; p++) {
      const L = 0.2126 * floats[p * 3] + 0.7152 * floats[p * 3 + 1] + 0.0722 * floats[p * 3 + 2];
      sum += Math.log(1e-6 + Math.max(0, L));
    }
    const avg = Math.exp(sum / n);
    scale = avg > 0 ? 0.18 / avg : 1;
  }
  const out = image.data;
  for (let p = 0; p < n; p++) {
    let r = floats[p * 3]; let g = floats[p * 3 + 1]; let b = floats[p * 3 + 2];
    if (useReinhard) {
      const L = Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b) * scale;
      const f = L > 0 ? scale / (1 + L) : 0;
      r *= f; g *= f; b *= f;
    }
    out[p * 4] = toDisplay(r);
    out[p * 4 + 1] = toDisplay(g);
    out[p * 4 + 2] = toDisplay(b);
    out[p * 4 + 3] = alpha ? Math.round(Math.min(1, Math.max(0, alpha[p])) * 255) : 255;
  }
  return image;
}

/** PackBits (Apple / TIFF / PSD run-length), `count` output bytes from `pos`. */
function unpackBits(bytes, pos, end, out, outPos, count, format) {
  const stop = outPos + count;
  while (outPos < stop) {
    if (pos >= end) fail(format, 'run-length data ends early.');
    const n = (bytes[pos++] << 24) >> 24;
    if (n >= 0) {
      const len = n + 1;
      if (pos + len > end) fail(format, 'run-length data ends early.');
      for (let i = 0; i < len && outPos < stop; i++) out[outPos++] = bytes[pos + i];
      pos += len;
    } else if (n !== -128) {
      const len = 1 - n;
      if (pos >= end) fail(format, 'run-length data ends early.');
      const v = bytes[pos++];
      for (let i = 0; i < len && outPos < stop; i++) out[outPos++] = v;
    }
  }
  return pos;
}

// ── TGA ────────────────────────────────────────────────────────────────────

function decodeTga(bytes) {
  const F = 'TGA';
  if (bytes.length < 18) fail(F, 'file is too short.');
  const idLength = bytes[0];
  const mapType = bytes[1];
  const type = bytes[2];
  const mapStart = bytes[3] | (bytes[4] << 8);
  const mapLength = bytes[5] | (bytes[6] << 8);
  const mapDepth = bytes[7];
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const depth = bytes[16];
  const descriptor = bytes[17];
  const alphaBits = descriptor & 0x0f;
  const rle = type >= 9 && type <= 11;
  const base = rle ? type - 8 : type;
  if (base !== 1 && base !== 2 && base !== 3) fail(F, `unsupported image type ${type}.`);
  if (![8, 15, 16, 24, 32].includes(depth)) fail(F, `unsupported pixel depth ${depth}.`);
  const image = newImage(F, width, height);

  let pos = 18 + idLength;

  // Colour map, expanded to RGBA.
  let palette = null;
  if (mapType === 1) {
    const entry = Math.ceil(mapDepth / 8);
    if (![15, 16, 24, 32].includes(mapDepth)) fail(F, `unsupported colour map depth ${mapDepth}.`);
    if (pos + mapLength * entry > bytes.length) fail(F, 'colour map runs past the end of the file.');
    palette = new Uint8Array((mapStart + mapLength) * 4);
    for (let i = 0; i < mapLength; i++) {
      readTrue(bytes, pos + i * entry, mapDepth, mapDepth === 32 ? 8 : (mapDepth === 16 ? 1 : 0), palette, (mapStart + i) * 4);
    }
    pos += mapLength * entry;
  } else if (base === 1) {
    fail(F, 'colour-mapped image has no colour map.');
  }

  const bpp = Math.ceil(depth / 8);
  const pixel = new Uint8Array(4);
  const readPixel = (at) => {
    if (base === 1) {
      const index = bpp === 1 ? bytes[at] : bytes[at] | (bytes[at + 1] << 8);
      if (index * 4 + 3 < palette.length) {
        pixel[0] = palette[index * 4]; pixel[1] = palette[index * 4 + 1];
        pixel[2] = palette[index * 4 + 2]; pixel[3] = palette[index * 4 + 3];
      } else {
        pixel[0] = pixel[1] = pixel[2] = 0; pixel[3] = 255;
      }
    } else if (base === 3) {
      pixel[0] = pixel[1] = pixel[2] = bytes[at];
      pixel[3] = bpp === 2 && alphaBits ? bytes[at + 1] : 255;
    } else {
      readTrue(bytes, at, depth, alphaBits, pixel, 0);
    }
  };

  const total = width * height;
  const out = image.data;
  const topDown = (descriptor & 0x20) !== 0;
  const rightToLeft = (descriptor & 0x10) !== 0;
  const put = (i) => {
    const row = Math.floor(i / width);
    const col = i - row * width;
    const y = topDown ? row : height - 1 - row;
    const x = rightToLeft ? width - 1 - col : col;
    const o = (y * width + x) * 4;
    out[o] = pixel[0]; out[o + 1] = pixel[1]; out[o + 2] = pixel[2]; out[o + 3] = pixel[3];
  };

  if (!rle) {
    if (pos + total * bpp > bytes.length) fail(F, 'pixel data runs past the end of the file.');
    for (let i = 0; i < total; i++, pos += bpp) { readPixel(pos); put(i); }
  } else {
    let i = 0;
    while (i < total) {
      if (pos >= bytes.length) fail(F, 'run-length data ends early.');
      const header = bytes[pos++];
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        if (pos + bpp > bytes.length) fail(F, 'run-length data ends early.');
        readPixel(pos); pos += bpp;
        for (let n = 0; n < count && i < total; n++) put(i++);
      } else {
        if (pos + count * bpp > bytes.length) fail(F, 'run-length data ends early.');
        for (let n = 0; n < count && i < total; n++, pos += bpp) { readPixel(pos); put(i++); }
      }
    }
  }
  return image;
}

/** A true-colour TGA pixel (BGR order, 15/16/24/32 bits) into out[at..at+3]. */
function readTrue(bytes, at, depth, alphaBits, out, o) {
  if (depth === 15 || depth === 16) {
    const v = bytes[at] | (bytes[at + 1] << 8);
    const r = (v >> 10) & 31; const g = (v >> 5) & 31; const b = v & 31;
    out[o] = (r << 3) | (r >> 2);
    out[o + 1] = (g << 3) | (g >> 2);
    out[o + 2] = (b << 3) | (b >> 2);
    out[o + 3] = depth === 16 && alphaBits ? (v & 0x8000 ? 255 : 0) : 255;
  } else if (depth === 24) {
    out[o] = bytes[at + 2]; out[o + 1] = bytes[at + 1]; out[o + 2] = bytes[at]; out[o + 3] = 255;
  } else if (depth === 32) {
    out[o] = bytes[at + 2]; out[o + 1] = bytes[at + 1]; out[o + 2] = bytes[at];
    out[o + 3] = alphaBits ? bytes[at + 3] : 255;
  } else {
    out[o] = out[o + 1] = out[o + 2] = bytes[at]; out[o + 3] = 255;
  }
}

// ── PNM family: PBM, PGM, PPM, PAM, PFM ────────────────────────────────────

function decodePnm(bytes, options) {
  const F = 'PNM';
  if (bytes.length < 3 || bytes[0] !== 0x50) fail(F, 'missing "P" signature.');
  const kind = String.fromCharCode(bytes[1]);
  let pos = 2;

  const skipSpace = () => {
    for (;;) {
      while (pos < bytes.length && isSpace(bytes[pos])) pos++;
      if (bytes[pos] === 0x23) { // '#' comment to end of line
        while (pos < bytes.length && bytes[pos] !== 0x0a && bytes[pos] !== 0x0d) pos++;
      } else return;
    }
  };
  const token = () => {
    skipSpace();
    const start = pos;
    while (pos < bytes.length && !isSpace(bytes[pos]) && bytes[pos] !== 0x23) pos++;
    if (start === pos) fail(F, 'header ends early.');
    return ascii(bytes, start, pos - start);
  };
  const int = () => {
    const t = token();
    if (!/^\d+$/.test(t)) fail(F, `expected a number, found "${t.slice(0, 20)}".`);
    return parseInt(t, 10);
  };

  if (kind === 'f' || kind === 'F') return decodePfm(bytes, kind === 'F' ? 3 : 1, token, () => pos, options);

  let width; let height; let depth; let maxval;
  if (kind === '7') {
    const header = {};
    for (;;) {
      skipSpace();
      const start = pos;
      while (pos < bytes.length && bytes[pos] !== 0x0a && bytes[pos] !== 0x0d) pos++;
      const line = ascii(bytes, start, pos - start).trim();
      if (pos >= bytes.length && line !== 'ENDHDR') fail(F, 'PAM header has no ENDHDR.');
      if (line === 'ENDHDR') {
        if (bytes[pos] === 0x0d && bytes[pos + 1] === 0x0a) pos += 2; else pos++;
        break;
      }
      const [key, ...rest] = line.split(/\s+/);
      header[key.toUpperCase()] = rest.join(' ');
    }
    width = parseInt(header.WIDTH, 10);
    height = parseInt(header.HEIGHT, 10);
    depth = parseInt(header.DEPTH, 10);
    maxval = parseInt(header.MAXVAL, 10);
    if (!(depth >= 1 && depth <= 4)) fail(F, `unsupported PAM depth ${header.DEPTH}.`);
  } else if (kind >= '1' && kind <= '6') {
    width = int();
    height = int();
    const bitmap = kind === '1' || kind === '4';
    maxval = bitmap ? 1 : int();
    depth = kind === '3' || kind === '6' ? 3 : 1;
    if (kind >= '4') {
      if (pos >= bytes.length || !isSpace(bytes[pos])) fail(F, 'header ends early.');
      pos++; // exactly one whitespace byte before the raster
    }
  } else {
    fail(F, `unknown variant P${kind}.`);
  }
  if (!(maxval >= 1 && maxval <= 65535)) fail(F, `invalid maximum value ${maxval}.`);

  const image = newImage(F, width, height);
  const out = image.data;
  const n = width * height;
  const scale = (v) => (maxval === 255 ? v : Math.round((Math.min(v, maxval) * 255) / maxval));

  if (kind === '1' || kind === '4') {
    // Bitmaps: 1 is black.
    if (kind === '1') {
      for (let p = 0; p < n; p++) {
        while (pos < bytes.length && bytes[pos] !== 0x30 && bytes[pos] !== 0x31) {
          if (bytes[pos] === 0x23) { while (pos < bytes.length && bytes[pos] !== 0x0a) pos++; } else pos++;
        }
        if (pos >= bytes.length) fail(F, 'pixel data ends early.');
        const v = bytes[pos++] === 0x31 ? 0 : 255;
        out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v; out[p * 4 + 3] = 255;
      }
    } else {
      const stride = (width + 7) >> 3;
      if (pos + stride * height > bytes.length) fail(F, 'pixel data ends early.');
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const bit = (bytes[pos + y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
          const o = (y * width + x) * 4;
          out[o] = out[o + 1] = out[o + 2] = bit ? 0 : 255; out[o + 3] = 255;
        }
      }
    }
    return image;
  }

  const samples = new Uint16Array(n * depth);
  if (kind === '2' || kind === '3') {
    for (let i = 0; i < samples.length; i++) samples[i] = int();
  } else {
    const wide = maxval > 255;
    const size = samples.length * (wide ? 2 : 1);
    if (pos + size > bytes.length) fail(F, 'pixel data ends early.');
    for (let i = 0; i < samples.length; i++) {
      samples[i] = wide ? (bytes[pos + i * 2] << 8) | bytes[pos + i * 2 + 1] : bytes[pos + i];
    }
  }

  for (let p = 0; p < n; p++) {
    const s = p * depth; const o = p * 4;
    if (depth >= 3) {
      out[o] = scale(samples[s]); out[o + 1] = scale(samples[s + 1]); out[o + 2] = scale(samples[s + 2]);
      out[o + 3] = depth === 4 ? scale(samples[s + 3]) : 255;
    } else {
      out[o] = out[o + 1] = out[o + 2] = scale(samples[s]);
      out[o + 3] = depth === 2 ? scale(samples[s + 1]) : 255;
    }
  }
  return image;
}

/** PFM: float greyscale ('Pf') or RGB ('PF'), rows stored bottom-up. */
function decodePfm(bytes, channels, token, getPos, options) {
  const F = 'PFM';
  const width = parseInt(token(), 10);
  const height = parseInt(token(), 10);
  const scaleValue = parseFloat(token());
  if (!Number.isFinite(scaleValue) || scaleValue === 0) fail(F, 'invalid scale / byte-order value.');
  let pos = getPos();
  if (!isSpace(bytes[pos])) fail(F, 'header ends early.');
  pos++;
  const image = newImage(F, width, height);
  const little = scaleValue < 0;
  const count = width * height * channels;
  if (pos + count * 4 > bytes.length) fail(F, 'pixel data ends early.');
  const dv = view(bytes);
  const floats = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const s = (srcRow * width + x) * channels;
      const d = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const v = dv.getFloat32(pos + (s + (channels === 3 ? c : 0)) * 4, little);
        floats[d + c] = Number.isFinite(v) ? v : 0;
      }
    }
  }
  return toneMap(floats, image, null, options.tonemap);
}

// ── PCX ────────────────────────────────────────────────────────────────────

function decodePcx(bytes) {
  const F = 'PCX';
  if (bytes.length < 128 || bytes[0] !== 0x0a) fail(F, 'missing PCX signature.');
  const encoding = bytes[2];
  const bits = bytes[3];
  const xmin = bytes[4] | (bytes[5] << 8);
  const ymin = bytes[6] | (bytes[7] << 8);
  const xmax = bytes[8] | (bytes[9] << 8);
  const ymax = bytes[10] | (bytes[11] << 8);
  const planes = bytes[65];
  const bytesPerLine = bytes[66] | (bytes[67] << 8);
  const width = xmax - xmin + 1;
  const height = ymax - ymin + 1;
  if (![1, 2, 4, 8].includes(bits)) fail(F, `unsupported bit depth ${bits}.`);
  if (planes < 1 || planes > 4) fail(F, `unsupported plane count ${planes}.`);
  if (bytesPerLine * 8 < width * bits) fail(F, 'line length is shorter than the picture width.');
  const image = newImage(F, width, height);

  // Unpack the whole raster; runs may cross line boundaries.
  const lineSize = planes * bytesPerLine;
  const raster = new Uint8Array(lineSize * height);
  let pos = 128;
  if (encoding === 1) {
    let o = 0;
    while (o < raster.length) {
      if (pos >= bytes.length) fail(F, 'run-length data ends early.');
      const b = bytes[pos++];
      if ((b & 0xc0) === 0xc0) {
        const count = b & 0x3f;
        if (pos >= bytes.length) fail(F, 'run-length data ends early.');
        const v = bytes[pos++];
        for (let i = 0; i < count && o < raster.length; i++) raster[o++] = v;
      } else {
        raster[o++] = b;
      }
    }
  } else {
    if (pos + raster.length > bytes.length) fail(F, 'pixel data ends early.');
    raster.set(bytes.subarray(pos, pos + raster.length));
  }

  const out = image.data;
  if (bits === 8 && planes >= 3) {
    for (let y = 0; y < height; y++) {
      const line = y * lineSize;
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        out[o] = raster[line + x];
        out[o + 1] = raster[line + bytesPerLine + x];
        out[o + 2] = raster[line + 2 * bytesPerLine + x];
        out[o + 3] = planes === 4 ? raster[line + 3 * bytesPerLine + x] : 255;
      }
    }
    return image;
  }

  // Indexed: combine the planes into a palette index.
  const indexBits = bits * planes;
  let palette;
  if (indexBits === 1) {
    palette = new Uint8Array([0, 0, 0, 255, 255, 255]);
  } else if (bits === 8 && planes === 1) {
    const at = bytes.length - 769;
    if (at >= 128 && bytes[at] === 0x0c) {
      palette = bytes.subarray(at + 1, at + 769);
    } else {
      palette = new Uint8Array(768);
      for (let i = 0; i < 256; i++) palette[i * 3] = palette[i * 3 + 1] = palette[i * 3 + 2] = i;
    }
  } else {
    palette = bytes.subarray(16, 64); // the 16-colour EGA palette in the header
  }
  const mask = (1 << bits) - 1;
  for (let y = 0; y < height; y++) {
    const line = y * lineSize;
    for (let x = 0; x < width; x++) {
      let index = 0;
      for (let p = 0; p < planes; p++) {
        const bit = x * bits;
        const byte = raster[line + p * bytesPerLine + (bit >> 3)];
        const v = (byte >> (8 - bits - (bit & 7))) & mask;
        index |= v << (p * bits);
      }
      const o = (y * width + x) * 4;
      const c = index * 3;
      out[o] = palette[c] || 0; out[o + 1] = palette[c + 1] || 0; out[o + 2] = palette[c + 2] || 0;
      out[o + 3] = 255;
    }
  }
  return image;
}

// ── QOI ────────────────────────────────────────────────────────────────────

function decodeQoi(bytes) {
  const F = 'QOI';
  if (bytes.length < 14 || !startsWith(bytes, 'qoif')) fail(F, 'missing "qoif" signature.');
  const dv = view(bytes);
  const width = dv.getUint32(4);
  const height = dv.getUint32(8);
  const image = newImage(F, width, height);
  const out = image.data;
  const index = new Uint8Array(64 * 4);
  let r = 0; let g = 0; let b = 0; let a = 255;
  let run = 0;
  let pos = 14;
  const end = bytes.length;
  const total = width * height * 4;
  for (let o = 0; o < total; o += 4) {
    if (run > 0) {
      run--;
    } else {
      if (pos >= end) fail(F, 'pixel data ends early.');
      const op = bytes[pos++];
      if (op === 0xfe) {
        if (pos + 3 > end) fail(F, 'pixel data ends early.');
        r = bytes[pos++]; g = bytes[pos++]; b = bytes[pos++];
      } else if (op === 0xff) {
        if (pos + 4 > end) fail(F, 'pixel data ends early.');
        r = bytes[pos++]; g = bytes[pos++]; b = bytes[pos++]; a = bytes[pos++];
      } else {
        const tag = op & 0xc0;
        if (tag === 0x00) {
          const i = (op & 0x3f) * 4;
          r = index[i]; g = index[i + 1]; b = index[i + 2]; a = index[i + 3];
        } else if (tag === 0x40) {
          r = (r + ((op >> 4) & 3) - 2) & 0xff;
          g = (g + ((op >> 2) & 3) - 2) & 0xff;
          b = (b + (op & 3) - 2) & 0xff;
        } else if (tag === 0x80) {
          if (pos >= end) fail(F, 'pixel data ends early.');
          const next = bytes[pos++];
          const dg = (op & 0x3f) - 32;
          r = (r + dg - 8 + ((next >> 4) & 0x0f)) & 0xff;
          g = (g + dg) & 0xff;
          b = (b + dg - 8 + (next & 0x0f)) & 0xff;
        } else {
          run = op & 0x3f;
        }
      }
      const h = ((r * 3 + g * 5 + b * 7 + a * 11) % 64) * 4;
      index[h] = r; index[h + 1] = g; index[h + 2] = b; index[h + 3] = a;
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }
  return image;
}

// ── Radiance HDR (RGBE) ────────────────────────────────────────────────────

function decodeHdr(bytes, options) {
  const F = 'HDR';
  if (!startsWith(bytes, '#?')) fail(F, 'missing "#?RADIANCE" signature.');
  let pos = 0;
  const line = () => {
    const start = pos;
    while (pos < bytes.length && bytes[pos] !== 0x0a) pos++;
    const text = ascii(bytes, start, pos - start).replace(/\r$/, '');
    pos++;
    return text;
  };
  line(); // signature
  let format = '32-bit_rle_rgbe';
  for (;;) {
    if (pos >= bytes.length) fail(F, 'header ends early.');
    const text = line();
    if (text === '') break;
    const m = /^FORMAT=(.*)$/.exec(text);
    if (m) format = m[1].trim();
  }
  if (format !== '32-bit_rle_rgbe' && format !== '32-bit_rle_xyze') fail(F, `unsupported format ${format}.`);
  const res = /^([-+])Y\s+(\d+)\s+([-+])X\s+(\d+)$/.exec(line().trim());
  if (!res) fail(F, 'unsupported resolution line (only "±Y h ±X w" is handled).');
  const height = parseInt(res[2], 10);
  const width = parseInt(res[4], 10);
  const flipY = res[1] === '+';
  const flipX = res[3] === '-';
  const image = newImage(F, width, height);

  const scan = new Uint8Array(width * 4);
  const floats = new Float32Array(width * height * 3);
  for (let row = 0; row < height; row++) {
    pos = readHdrScanline(bytes, pos, width, scan, F);
    const y = flipY ? height - 1 - row : row;
    for (let col = 0; col < width; col++) {
      const x = flipX ? width - 1 - col : col;
      const e = scan[col * 4 + 3];
      const d = (y * width + x) * 3;
      if (e === 0) { floats[d] = floats[d + 1] = floats[d + 2] = 0; continue; }
      const f = Math.pow(2, e - 136);
      floats[d] = scan[col * 4] * f;
      floats[d + 1] = scan[col * 4 + 1] * f;
      floats[d + 2] = scan[col * 4 + 2] * f;
    }
  }
  if (format === '32-bit_rle_xyze') {
    for (let i = 0; i < floats.length; i += 3) {
      const X = floats[i]; const Y = floats[i + 1]; const Z = floats[i + 2];
      floats[i] = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
      floats[i + 1] = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
      floats[i + 2] = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    }
  }
  return toneMap(floats, image, null, options.tonemap);
}

function readHdrScanline(bytes, pos, width, scan, F) {
  const end = bytes.length;
  const newRle = width >= 8 && width < 0x8000 && pos + 4 <= end &&
    bytes[pos] === 2 && bytes[pos + 1] === 2 && (bytes[pos + 2] & 0x80) === 0;
  if (newRle) {
    if (((bytes[pos + 2] << 8) | bytes[pos + 3]) !== width) fail(F, 'scanline width mismatch.');
    pos += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < width) {
        if (pos >= end) fail(F, 'pixel data ends early.');
        let count = bytes[pos++];
        if (count > 128) {
          count -= 128;
          if (x + count > width || pos >= end) fail(F, 'bad run-length scanline.');
          const v = bytes[pos++];
          for (let i = 0; i < count; i++) scan[(x++) * 4 + c] = v;
        } else {
          if (count === 0 || x + count > width || pos + count > end) fail(F, 'bad run-length scanline.');
          for (let i = 0; i < count; i++) scan[(x++) * 4 + c] = bytes[pos++];
        }
      }
    }
    return pos;
  }
  // Flat pixels, possibly with old-style runs (1,1,1,n repeats the previous pixel).
  let x = 0;
  let shift = 0;
  while (x < width) {
    if (pos + 4 > end) fail(F, 'pixel data ends early.');
    if (bytes[pos] === 1 && bytes[pos + 1] === 1 && bytes[pos + 2] === 1 && x > 0) {
      const count = bytes[pos + 3] << shift;
      pos += 4;
      for (let i = 0; i < count && x < width; i++, x++) {
        for (let c = 0; c < 4; c++) scan[x * 4 + c] = scan[(x - 1) * 4 + c];
      }
      shift += 8;
    } else {
      for (let c = 0; c < 4; c++) scan[x * 4 + c] = bytes[pos + c];
      pos += 4; x++; shift = 0;
    }
  }
  return pos;
}

// ── farbfeld ───────────────────────────────────────────────────────────────

function decodeFarbfeld(bytes) {
  const F = 'farbfeld';
  if (bytes.length < 16 || !startsWith(bytes, 'farbfeld')) fail(F, 'missing "farbfeld" signature.');
  const dv = view(bytes);
  const width = dv.getUint32(8);
  const height = dv.getUint32(12);
  const image = newImage(F, width, height);
  const count = width * height * 4;
  if (16 + count * 2 > bytes.length) fail(F, 'pixel data ends early.');
  const out = image.data;
  for (let i = 0; i < count; i++) out[i] = Math.round(dv.getUint16(16 + i * 2) / 257);
  return image;
}

// ── DDS ────────────────────────────────────────────────────────────────────

const DDPF_ALPHAPIXELS = 0x1;
const DDPF_ALPHA = 0x2;
const DDPF_FOURCC = 0x4;
const DDPF_LUMINANCE = 0x20000;

function decodeDds(bytes) {
  const F = 'DDS';
  if (bytes.length < 128 || !startsWith(bytes, 'DDS ')) fail(F, 'missing "DDS " signature.');
  const dv = view(bytes);
  const height = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const pfFlags = dv.getUint32(80, true);
  const fourCC = ascii(bytes, 84, 4);
  const bitCount = dv.getUint32(88, true);
  const masks = [dv.getUint32(92, true), dv.getUint32(96, true), dv.getUint32(100, true), dv.getUint32(104, true)];
  let pos = 128;
  const image = newImage(F, width, height);

  let compression = '';
  if (pfFlags & DDPF_FOURCC) {
    if (fourCC === 'DX10') {
      if (bytes.length < 148) fail(F, 'DX10 header is truncated.');
      const dxgi = dv.getUint32(128, true);
      pos = 148;
      const map = {
        70: 'BC1', 71: 'BC1', 72: 'BC1', 73: 'BC2', 74: 'BC2', 75: 'BC2', 76: 'BC3', 77: 'BC3', 78: 'BC3',
        79: 'BC4', 80: 'BC4', 82: 'BC5', 83: 'BC5',
        27: 'RGBA8', 28: 'RGBA8', 29: 'RGBA8', 87: 'BGRA8', 90: 'BGRA8', 91: 'BGRA8', 88: 'BGRX8', 92: 'BGRX8', 93: 'BGRX8',
      };
      compression = map[dxgi];
      if (!compression) fail(F, `unsupported DXGI format ${dxgi}.`);
      if (compression === 'RGBA8') return ddsMasked(bytes, pos, image, 32, [0xff, 0xff00, 0xff0000, 0xff000000], F);
      if (compression === 'BGRA8') return ddsMasked(bytes, pos, image, 32, [0xff0000, 0xff00, 0xff, 0xff000000], F);
      if (compression === 'BGRX8') return ddsMasked(bytes, pos, image, 32, [0xff0000, 0xff00, 0xff, 0], F);
    } else {
      compression = {
        DXT1: 'BC1', DXT2: 'BC2', DXT3: 'BC2', DXT4: 'BC3', DXT5: 'BC3',
        ATI1: 'BC4', BC4U: 'BC4', ATI2: 'BC5', BC5U: 'BC5',
      }[fourCC];
      if (!compression) fail(F, `unsupported compression "${fourCC.replace(/\0/g, '')}".`);
    }
    return ddsBlocks(bytes, pos, image, compression, F);
  }

  if (pfFlags & DDPF_LUMINANCE) {
    const lumMasks = [masks[0], masks[0], masks[0], pfFlags & DDPF_ALPHAPIXELS ? masks[3] : 0];
    return ddsMasked(bytes, pos, image, bitCount, lumMasks, F);
  }
  if (pfFlags & DDPF_ALPHA && !(pfFlags & 0x40)) {
    return ddsMasked(bytes, pos, image, bitCount, [0, 0, 0, masks[3]], F, true);
  }
  return ddsMasked(bytes, pos, image, bitCount, [masks[0], masks[1], masks[2], pfFlags & DDPF_ALPHAPIXELS ? masks[3] : 0], F);
}

function maskShift(mask) {
  if (!mask) return { shift: 0, max: 0 };
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift++;
  return { shift, max: mask >>> shift };
}

function ddsMasked(bytes, pos, image, bitCount, masks, F, alphaOnly = false) {
  if (![8, 16, 24, 32].includes(bitCount)) fail(F, `unsupported bit count ${bitCount}.`);
  const bpp = bitCount / 8;
  const { width, height, data: out } = image;
  if (pos + width * height * bpp > bytes.length) fail(F, 'pixel data ends early.');
  const ch = masks.map((m) => ({ ...maskShift(m >>> 0), mask: m >>> 0 }));
  for (let p = 0; p < width * height; p++) {
    const at = pos + p * bpp;
    let v = 0;
    for (let i = bpp - 1; i >= 0; i--) v = v * 256 + bytes[at + i];
    const o = p * 4;
    for (let c = 0; c < 4; c++) {
      const { shift, max, mask } = ch[c];
      if (!mask) { out[o + c] = c === 3 || alphaOnly ? 255 : 0; continue; }
      const value = Math.floor(v / 2 ** shift) & max;
      out[o + c] = max === 255 ? value : Math.round((value * 255) / max);
    }
    if (alphaOnly) out[o] = out[o + 1] = out[o + 2] = 255;
  }
  return image;
}

function rgb565(v, out, o) {
  const r = (v >> 11) & 31; const g = (v >> 5) & 63; const b = v & 31;
  out[o] = (r << 3) | (r >> 2); out[o + 1] = (g << 2) | (g >> 4); out[o + 2] = (b << 3) | (b >> 2);
}

/** Colour block (BC1 layout) → 16 RGBA pixels. */
function decodeColorBlock(bytes, at, block, allowTransparent) {
  const c0 = bytes[at] | (bytes[at + 1] << 8);
  const c1 = bytes[at + 2] | (bytes[at + 3] << 8);
  const colors = new Uint8Array(16);
  rgb565(c0, colors, 0); rgb565(c1, colors, 4);
  colors[3] = colors[7] = 255;
  if (c0 > c1 || !allowTransparent) {
    for (let c = 0; c < 3; c++) {
      colors[8 + c] = Math.round((2 * colors[c] + colors[4 + c]) / 3);
      colors[12 + c] = Math.round((colors[c] + 2 * colors[4 + c]) / 3);
    }
    colors[11] = colors[15] = 255;
  } else {
    for (let c = 0; c < 3; c++) colors[8 + c] = Math.round((colors[c] + colors[4 + c]) / 2);
    colors[11] = 255;
    colors[12] = colors[13] = colors[14] = colors[15] = 0;
  }
  for (let i = 0; i < 16; i++) {
    const idx = (bytes[at + 4 + (i >> 2)] >> ((i & 3) * 2)) & 3;
    block.set(colors.subarray(idx * 4, idx * 4 + 4), i * 4);
  }
}

/** BC4-style 8-byte block → 16 values written to block[i*4 + channel]. */
function decodeAlphaBlock(bytes, at, block, channel) {
  const a0 = bytes[at]; const a1 = bytes[at + 1];
  const values = [a0, a1];
  if (a0 > a1) for (let i = 1; i <= 6; i++) values.push(Math.round(((7 - i) * a0 + i * a1) / 7));
  else {
    for (let i = 1; i <= 4; i++) values.push(Math.round(((5 - i) * a0 + i * a1) / 5));
    values.push(0, 255);
  }
  // 48 bits of 3-bit indices, little-endian.
  const lo = bytes[at + 2] | (bytes[at + 3] << 8) | (bytes[at + 4] << 16);
  const hi = bytes[at + 5] | (bytes[at + 6] << 8) | (bytes[at + 7] << 16);
  for (let i = 0; i < 16; i++) {
    const src = i < 8 ? lo : hi;
    const idx = (src >> ((i & 7) * 3)) & 7;
    block[i * 4 + channel] = values[idx];
  }
}

function ddsBlocks(bytes, pos, image, kind, F) {
  const { width, height, data: out } = image;
  const bw = Math.ceil(width / 4); const bh = Math.ceil(height / 4);
  const blockSize = kind === 'BC1' || kind === 'BC4' ? 8 : 16;
  if (pos + bw * bh * blockSize > bytes.length) fail(F, 'block data ends early.');
  const block = new Uint8Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++, pos += blockSize) {
      if (kind === 'BC1') {
        decodeColorBlock(bytes, pos, block, true);
      } else if (kind === 'BC2') {
        decodeColorBlock(bytes, pos + 8, block, false);
        for (let i = 0; i < 16; i++) {
          const nib = (bytes[pos + (i >> 1)] >> ((i & 1) * 4)) & 0x0f;
          block[i * 4 + 3] = nib * 17;
        }
      } else if (kind === 'BC3') {
        decodeColorBlock(bytes, pos + 8, block, false);
        decodeAlphaBlock(bytes, pos, block, 3);
      } else if (kind === 'BC4') {
        decodeAlphaBlock(bytes, pos, block, 0);
        for (let i = 0; i < 16; i++) {
          block[i * 4 + 1] = block[i * 4 + 2] = block[i * 4]; block[i * 4 + 3] = 255;
        }
      } else { // BC5: two channels (usually a normal map); rebuild Z.
        decodeAlphaBlock(bytes, pos, block, 0);
        decodeAlphaBlock(bytes, pos + 8, block, 1);
        for (let i = 0; i < 16; i++) {
          const nx = block[i * 4] / 127.5 - 1; const ny = block[i * 4 + 1] / 127.5 - 1;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          block[i * 4 + 2] = Math.round((nz + 1) * 127.5); block[i * 4 + 3] = 255;
        }
      }
      for (let y = 0; y < 4; y++) {
        const py = by * 4 + y;
        if (py >= height) break;
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          if (px >= width) break;
          const o = (py * width + px) * 4; const s = (y * 4 + x) * 4;
          out[o] = block[s]; out[o + 1] = block[s + 1]; out[o + 2] = block[s + 2]; out[o + 3] = block[s + 3];
        }
      }
    }
  }
  return image;
}

// ── XBM / XPM (C source pictures) ──────────────────────────────────────────

function decodeXbm(bytes) {
  const F = 'XBM';
  const text = latin1(bytes);
  const w = /#define\s+\S*?width\s+(\d+)/.exec(text);
  const h = /#define\s+\S*?height\s+(\d+)/.exec(text);
  if (!w || !h) fail(F, 'width / height #defines are missing.');
  const width = parseInt(w[1], 10); const height = parseInt(h[1], 10);
  const brace = text.indexOf('{');
  if (brace < 0) fail(F, 'bitmap data is missing.');
  const short = /\bshort\b/.test(text.slice(0, brace));
  const values = (text.slice(brace).match(/0[xX][0-9a-fA-F]+|\b\d+\b/g) || []).map((v) => parseInt(v, v.startsWith('0x') || v.startsWith('0X') ? 16 : 10));
  const unit = short ? 16 : 8;
  const perRow = Math.ceil(width / unit);
  if (values.length < perRow * height) fail(F, 'bitmap data ends early.');
  const image = newImage(F, width, height);
  const out = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = (values[y * perRow + Math.floor(x / unit)] >> (x % unit)) & 1;
      const o = (y * width + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = bit ? 0 : 255; out[o + 3] = 255;
    }
  }
  return image;
}

const NAMED_COLORS = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '00ff00', blue: '0000ff', yellow: 'ffff00',
  cyan: '00ffff', magenta: 'ff00ff', gray: 'bebebe', grey: 'bebebe', orange: 'ffa500', purple: 'a020f0',
  brown: 'a52a2a', pink: 'ffc0cb', navy: '000080', navyblue: '000080', maroon: 'b03060', olive: '808000',
  teal: '008080', silver: 'c0c0c0', lime: '00ff00', darkgray: 'a9a9a9', darkgrey: 'a9a9a9',
  lightgray: 'd3d3d3', lightgrey: 'd3d3d3', dimgray: '696969', dimgrey: '696969', gold: 'ffd700',
  violet: 'ee82ee', darkred: '8b0000', darkgreen: '006400', darkblue: '00008b', lightblue: 'add8e6',
  skyblue: '87ceeb', beige: 'f5f5dc', tan: 'd2b48c', khaki: 'f0e68c', salmon: 'fa8072', coral: 'ff7f50',
  gainsboro: 'dcdcdc', whitesmoke: 'f5f5f5', ivory: 'fffff0', snow: 'fffafa',
};

function parseXpmColor(value) {
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return [0, 0, 0, 0];
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    if (/^[0-9a-f]+$/.test(hex) && hex.length % 3 === 0 && hex.length >= 3) {
      const n = hex.length / 3;
      const part = (i) => {
        const h = hex.slice(i * n, i * n + n);
        const max = 16 ** n - 1;
        return Math.round((parseInt(h, 16) * 255) / max);
      };
      return [part(0), part(1), part(2), 255];
    }
    return [0, 0, 0, 255];
  }
  const key = v.replace(/\s+/g, '');
  const grey = /^gr[ae]y(\d{1,3})$/.exec(key);
  if (grey) { const g = Math.round((Math.min(100, +grey[1]) * 255) / 100); return [g, g, g, 255]; }
  const hex = NAMED_COLORS[key];
  if (hex) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
  return [0, 0, 0, 255];
}

/** The C string literals of an XPM file, in order, comments skipped. */
function xpmStrings(text) {
  const strings = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '"') {
      let s = '';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) { s += text[i + 1]; i += 2; } else s += text[i++];
      }
      i++;
      strings.push(s);
    } else i++;
  }
  return strings;
}

function decodeXpm(bytes) {
  const F = 'XPM';
  const text = latin1(bytes);
  let lines;
  if (/^\s*!\s*XPM2/.test(text)) {
    lines = text.split(/\r?\n/).slice(1).filter((l) => l.length > 0);
  } else {
    lines = xpmStrings(text);
  }
  if (!lines.length) fail(F, 'no picture data found.');
  const head = lines[0].trim().split(/\s+/).map((v) => parseInt(v, 10));
  const [width, height, ncolors, cpp] = head;
  if (!(ncolors > 0) || !(cpp > 0)) fail(F, 'invalid header line.');
  if (lines.length < 1 + ncolors + height) fail(F, 'picture data ends early.');
  const image = newImage(F, width, height);
  const colors = new Map();
  const KEYS = new Set(['c', 'm', 'g', 'g4', 's']);
  for (let i = 0; i < ncolors; i++) {
    const line = lines[1 + i];
    const chars = line.slice(0, cpp);
    const tokens = line.slice(cpp).trim().split(/\s+/);
    const found = {};
    let key = null;
    for (const t of tokens) {
      if (KEYS.has(t) && (key === null || found[key] !== undefined)) { key = t; found[key] = undefined; continue; }
      if (key) found[key] = found[key] === undefined ? t : `${found[key]} ${t}`;
    }
    const value = found.c ?? found.g ?? found.g4 ?? found.m ?? 'black';
    colors.set(chars, parseXpmColor(value));
  }
  const out = image.data;
  for (let y = 0; y < height; y++) {
    const row = lines[1 + ncolors + y];
    for (let x = 0; x < width; x++) {
      const c = colors.get(row.slice(x * cpp, x * cpp + cpp)) || [0, 0, 0, 255];
      const o = (y * width + x) * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
    }
  }
  return image;
}

// ── PSD / PSB (merged composite) ───────────────────────────────────────────

function labToRgb(L, a, b) {
  // CIE L*a*b* (D50, as Photoshop uses) → linear XYZ → sRGB.
  let y = (L + 16) / 116; let x = a / 500 + y; let z = y - b / 200;
  const f = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  x = 0.9642 * f(x); y = f(y); z = 0.8251 * f(z);
  // Bradford-adapted D50 → sRGB matrix.
  const rl = 3.1339 * x - 1.6169 * y - 0.4906 * z;
  const gl = -0.9788 * x + 1.9161 * y + 0.0335 * z;
  const bl = 0.0719 * x - 0.2290 * y + 1.4052 * z;
  const enc = (v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  return [enc(rl), enc(gl), enc(bl)];
}

function decodePsd(bytes) {
  const F = 'PSD';
  if (bytes.length < 26 || !startsWith(bytes, '8BPS')) fail(F, 'missing "8BPS" signature.');
  const dv = view(bytes);
  const version = dv.getUint16(4);
  if (version !== 1 && version !== 2) fail(F, `unknown version ${version}.`);
  const big = version === 2;
  const channels = dv.getUint16(12);
  const height = dv.getUint32(14);
  const width = dv.getUint32(18);
  const depth = dv.getUint16(22);
  const mode = dv.getUint16(24);
  if (![1, 8, 16, 32].includes(depth)) fail(F, `unsupported bit depth ${depth}.`);
  const image = newImage(F, width, height);

  let pos = 26;
  const need = (n) => { if (pos + n > bytes.length) fail(F, 'file ends early.'); };
  const readLen = (wide) => {
    need(wide ? 8 : 4);
    const v = wide ? dv.getUint32(pos) * 2 ** 32 + dv.getUint32(pos + 4) : dv.getUint32(pos);
    pos += wide ? 8 : 4;
    return v;
  };

  // Colour mode data (the palette for indexed pictures).
  const modeLen = readLen(false);
  need(modeLen);
  const palette = mode === 2 && modeLen >= 768 ? bytes.subarray(pos, pos + 768) : null;
  pos += modeLen;
  // Image resources — skipped.
  const resLen = readLen(false);
  need(resLen);
  pos += resLen;
  // Layer and mask information: only the layer count's sign matters here — a
  // negative count says the first extra channel is the composite's transparency.
  const layerLen = readLen(big);
  need(layerLen);
  let transparent = false;
  if (layerLen >= (big ? 10 : 6)) {
    const infoLen = big ? dv.getUint32(pos) * 2 ** 32 + dv.getUint32(pos + 4) : dv.getUint32(pos);
    const at = pos + (big ? 8 : 4);
    if (infoLen >= 2 && at + 2 <= bytes.length) transparent = dv.getInt16(at) < 0;
  }
  pos += layerLen;

  need(2);
  const compression = dv.getUint16(pos);
  pos += 2;

  const bytesPerSample = depth === 1 ? 0 : depth / 8;
  const rowBytes = depth === 1 ? Math.ceil(width / 8) : width * bytesPerSample;
  const planeBytes = rowBytes * height;
  const colorChannels = { 0: 1, 1: 1, 2: 1, 3: 3, 4: 4, 7: 1, 8: 1, 9: 3 }[mode];
  if (colorChannels === undefined) fail(F, `unsupported colour mode ${mode}.`);
  if (channels < colorChannels) fail(F, `colour mode ${mode} needs ${colorChannels} channels, file has ${channels}.`);
  const hasAlpha = transparent && channels > colorChannels;
  const wanted = colorChannels + (hasAlpha ? 1 : 0);

  // Planar channel data, decompressed into one buffer.
  const planes = new Uint8Array(planeBytes * wanted);
  if (compression === 0) {
    need(planeBytes * wanted);
    planes.set(bytes.subarray(pos, pos + planeBytes * wanted));
  } else if (compression === 1) {
    const countSize = big ? 4 : 2;
    const rows = channels * height;
    need(rows * countSize);
    const counts = new Array(rows);
    for (let i = 0; i < rows; i++) counts[i] = big ? dv.getUint32(pos + i * 4) : dv.getUint16(pos + i * 2);
    pos += rows * countSize;
    for (let c = 0; c < wanted; c++) {
      for (let y = 0; y < height; y++) {
        const len = counts[c * height + y];
        need(len);
        unpackBits(bytes, pos, pos + len, planes, c * planeBytes + y * rowBytes, rowBytes, F);
        pos += len;
      }
    }
  } else if (compression === 2 || compression === 3) {
    const raw = inflate(bytes.subarray(pos), { expectedSize: planeBytes * channels });
    if (raw.length < planeBytes * wanted) fail(F, 'compressed image data ends early.');
    planes.set(raw.subarray(0, planeBytes * wanted));
    if (compression === 3) undoPsdPrediction(planes, wanted, width, height, bytesPerSample);
  } else {
    fail(F, `unsupported compression ${compression}.`);
  }

  // One 8-bit sample of channel c at pixel p.
  const dvPlanes = view(planes);
  const sample = (c, p) => {
    const base = c * planeBytes;
    if (depth === 8) return planes[base + p];
    if (depth === 16) return planes[base + p * 2];
    if (depth === 32) {
      const v = dvPlanes.getFloat32(base + p * 4);
      return toDisplay(v);
    }
    const y = Math.floor(p / width); const x = p - y * width;
    return (planes[base + y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0 : 255;
  };

  const out = image.data;
  const n = width * height;
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    let r; let g; let b;
    if (mode === 3) {
      r = sample(0, p); g = sample(1, p); b = sample(2, p);
    } else if (mode === 4) {
      // Photoshop stores CMYK inverted: 255 means no ink.
      const k = sample(3, p) / 255;
      r = Math.round(sample(0, p) * k); g = Math.round(sample(1, p) * k); b = Math.round(sample(2, p) * k);
    } else if (mode === 9) {
      [r, g, b] = labToRgb((sample(0, p) * 100) / 255, sample(1, p) - 128, sample(2, p) - 128);
    } else if (mode === 2 && palette) {
      const i = sample(0, p);
      r = palette[i]; g = palette[256 + i]; b = palette[512 + i];
    } else {
      r = g = b = sample(0, p);
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
    out[o + 3] = hasAlpha ? sample(colorChannels, p) : 255;
  }
  return image;
}

/** Undo the per-row delta ("ZIP with prediction") on 8/16-bit planes. */
function undoPsdPrediction(planes, count, width, height, bytesPerSample) {
  if (bytesPerSample === 1) {
    for (let r = 0; r < count * height; r++) {
      const s = r * width;
      for (let x = 1; x < width; x++) planes[s + x] = (planes[s + x] + planes[s + x - 1]) & 0xff;
    }
  } else if (bytesPerSample === 2) {
    for (let r = 0; r < count * height; r++) {
      const s = r * width * 2;
      for (let x = 1; x < width; x++) {
        const prev = (planes[s + (x - 1) * 2] << 8) | planes[s + (x - 1) * 2 + 1];
        const cur = ((planes[s + x * 2] << 8) | planes[s + x * 2 + 1]) + prev;
        planes[s + x * 2] = (cur >> 8) & 0xff; planes[s + x * 2 + 1] = cur & 0xff;
      }
    }
  }
  // 32-bit prediction (byte-shuffled floats) is rare in composites; left as is.
}

// ── SGI ────────────────────────────────────────────────────────────────────

function decodeSgi(bytes) {
  const F = 'SGI';
  if (bytes.length < 512 || bytes[0] !== 0x01 || bytes[1] !== 0xda) fail(F, 'missing SGI signature.');
  const dv = view(bytes);
  const storage = bytes[2];
  const bpc = bytes[3];
  const dimension = dv.getUint16(4);
  const width = dv.getUint16(6);
  const height = dimension === 1 ? 1 : dv.getUint16(8);
  const zsize = dimension === 3 ? dv.getUint16(10) : 1;
  if (bpc !== 1 && bpc !== 2) fail(F, `unsupported bytes per channel ${bpc}.`);
  if (zsize < 1) fail(F, 'no channels.');
  const image = newImage(F, width, height);
  const channels = Math.min(zsize, 4);
  const planes = new Uint8Array(width * height * channels);
  const value = (at) => bytes[at]; // 16-bit samples are big-endian: keep the high byte

  if (storage === 0) {
    const size = width * height * zsize * bpc;
    if (512 + size > bytes.length) fail(F, 'pixel data ends early.');
    for (let c = 0; c < channels; c++) {
      for (let i = 0; i < width * height; i++) planes[c * width * height + i] = value(512 + (c * width * height + i) * bpc);
    }
  } else if (storage === 1) {
    const rows = height * zsize;
    if (512 + rows * 8 > bytes.length) fail(F, 'offset tables are truncated.');
    for (let c = 0; c < channels; c++) {
      for (let y = 0; y < height; y++) {
        let pos = dv.getUint32(512 + (c * height + y) * 4);
        let x = 0;
        const dst = c * width * height + y * width;
        for (;;) {
          if (pos + bpc > bytes.length) fail(F, 'run-length data ends early.');
          const n = bpc === 1 ? bytes[pos] : dv.getUint16(pos);
          pos += bpc;
          const count = n & 0x7f;
          if (count === 0) break;
          if (n & 0x80) {
            if (pos + count * bpc > bytes.length) fail(F, 'run-length data ends early.');
            for (let i = 0; i < count; i++, pos += bpc) if (x < width) planes[dst + x++] = value(pos);
          } else {
            if (pos + bpc > bytes.length) fail(F, 'run-length data ends early.');
            const v = value(pos); pos += bpc;
            for (let i = 0; i < count && x < width; i++) planes[dst + x++] = v;
          }
        }
      }
    }
  } else {
    fail(F, `unknown storage ${storage}.`);
  }

  // Rows are stored bottom-up.
  const out = image.data;
  const area = width * height;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width;
    for (let x = 0; x < width; x++) {
      const s = src + x; const o = (y * width + x) * 4;
      if (channels >= 3) {
        out[o] = planes[s]; out[o + 1] = planes[area + s]; out[o + 2] = planes[2 * area + s];
        out[o + 3] = channels === 4 ? planes[3 * area + s] : 255;
      } else {
        out[o] = out[o + 1] = out[o + 2] = planes[s];
        out[o + 3] = channels === 2 ? planes[area + s] : 255;
      }
    }
  }
  return image;
}

// ── WBMP ───────────────────────────────────────────────────────────────────

function decodeWbmp(bytes) {
  const F = 'WBMP';
  let pos = 0;
  const mbi = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      if (pos >= bytes.length) fail(F, 'header ends early.');
      const b = bytes[pos++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    fail(F, 'invalid header number.');
    return 0;
  };
  if (mbi() !== 0) fail(F, 'only type 0 (black and white) is defined.');
  if (pos >= bytes.length) fail(F, 'header ends early.');
  const fix = bytes[pos++];
  if (fix & 0x80) { // extension headers, skip
    while (pos < bytes.length && bytes[pos++] & 0x80);
  }
  const width = mbi(); const height = mbi();
  const image = newImage(F, width, height);
  const stride = (width + 7) >> 3;
  if (pos + stride * height > bytes.length) fail(F, 'pixel data ends early.');
  const out = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = (bytes[pos + y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
      const o = (y * width + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = bit ? 255 : 0; out[o + 3] = 255;
    }
  }
  return image;
}

// ── Dispatch ───────────────────────────────────────────────────────────────

/** Extension → decoder. */
export const EXTRA_DECODERS = {
  tga: decodeTga, targa: decodeTga, icb: decodeTga, vda: decodeTga, vst: decodeTga,
  pbm: decodePnm, pgm: decodePnm, ppm: decodePnm, pnm: decodePnm, pam: decodePnm, pfm: decodePnm,
  pcx: decodePcx,
  qoi: decodeQoi,
  hdr: decodeHdr, pic: decodeHdr, rgbe: decodeHdr,
  ff: decodeFarbfeld, farbfeld: decodeFarbfeld,
  dds: decodeDds,
  xbm: decodeXbm,
  xpm: decodeXpm,
  psd: decodePsd, psb: decodePsd,
  sgi: decodeSgi, rgb: decodeSgi, rgba: decodeSgi, bw: decodeSgi, int: decodeSgi, inta: decodeSgi,
  wbmp: decodeWbmp,
};

/**
 * Decodes a picture this module handles.
 * @param {Uint8Array} bytes
 * @param {string} ext       file extension (without the dot) or a sniffed kind
 * @param {object} options   `tonemap`: 'auto' | 'clamp' | 'reinhard' (HDR / PFM)
 * @returns {{width:number,height:number,data:Uint8ClampedArray}|null} null when
 *   `ext` is not one of ours; throws on corrupt data.
 */
export function decodeExtraImage(bytes, ext, options = {}) {
  const key = String(ext || '').replace(/^\./, '').toLowerCase();
  const decoder = EXTRA_DECODERS[key];
  if (!decoder) return null;
  if (!bytes || !bytes.length) throw new Error(`${key.toUpperCase()}: the file is empty.`);
  return decoder(bytes, { tonemap: 'auto', ...options });
}

/**
 * Recognises formats with a dependable signature. Returns the extension to
 * decode as, or ''. TGA, WBMP, XBM and XPM have no reliable magic and are only
 * opened by name.
 */
export function sniffExtraImage(bytes) {
  if (!bytes || bytes.length < 4) return '';
  const b = bytes;
  if (startsWith(b, 'qoif') && b.length >= 14) return 'qoi';
  if (startsWith(b, '8BPS') && b.length >= 26) return b[5] === 2 ? 'psb' : 'psd';
  if (startsWith(b, 'farbfeld') && b.length >= 16) return 'ff';
  if (startsWith(b, 'DDS ') && b.length >= 128 && b[4] === 124) return 'dds';
  if (startsWith(b, '#?RADIANCE') || startsWith(b, '#?RGBE')) return 'hdr';
  if (b[0] === 0x01 && b[1] === 0xda && b.length >= 512 && (b[2] === 0 || b[2] === 1) &&
      (b[3] === 1 || b[3] === 2) && b[4] === 0 && b[5] >= 1 && b[5] <= 3) return 'sgi';
  if (b[0] === 0x0a && b.length >= 128 && [0, 2, 3, 4, 5].includes(b[1]) && (b[2] === 0 || b[2] === 1) &&
      [1, 2, 4, 8].includes(b[3]) && b[65] >= 1 && b[65] <= 4) {
    const xmin = b[4] | (b[5] << 8); const xmax = b[8] | (b[9] << 8);
    const ymin = b[6] | (b[7] << 8); const ymax = b[10] | (b[11] << 8);
    const bpl = b[66] | (b[67] << 8);
    if (xmax >= xmin && ymax >= ymin && bpl > 0 && bpl * 8 >= (xmax - xmin + 1) * b[3]) return 'pcx';
  }
  if (b[0] === 0x50) {
    // 'P1'..'P6' then whitespace, then the width (comments allowed in between).
    const head = ascii(b, 0, 64);
    if (/^P[1-6]\s+(#[^\n]*\n\s*)*\d+\s+\d+/.test(head)) {
      return { 1: 'pbm', 4: 'pbm', 2: 'pgm', 5: 'pgm', 3: 'ppm', 6: 'ppm' }[head[1]];
    }
    if (/^P7\s/.test(head) && /\b(WIDTH|HEIGHT|DEPTH|MAXVAL|TUPLTYPE|ENDHDR)\b/.test(ascii(b, 0, 512))) return 'pam';
    if (/^P[fF]\s+\d+\s+\d+\s+-?\d/.test(head)) return 'pfm';
  }
  return '';
}

// ── Camera RAW: the embedded JPEG preview ──────────────────────────────────

/**
 * Reads the frame size of a JPEG starting at `start` (an SOI). Only frames a
 * browser can draw count: baseline, extended or progressive, 8-bit, 1–4
 * components. That rules out the lossless (SOF3) sensor data in CR2 / DNG.
 * @returns {{width:number,height:number,sos:number}|null}
 */
function jpegFrameAt(b, start) {
  let i = start + 2;
  const end = b.length;
  let frame = null;
  for (let guard = 0; guard < 512 && i + 4 <= end; guard++) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    while (m === 0xff && i + 2 < end) { i++; m = b[i + 1]; }
    i += 2;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
    if (m === 0xd8 || m === 0xd9 || m === 0x00) return null;
    if (i + 2 > end) return null;
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (m !== 0xc0 && m !== 0xc1 && m !== 0xc2) return null;
      if (i + 8 > end) return null;
      const precision = b[i + 2];
      const height = (b[i + 3] << 8) | b[i + 4];
      const width = (b[i + 5] << 8) | b[i + 6];
      const comps = b[i + 7];
      if (precision !== 8 || comps < 1 || comps > 4 || !width || !height) return null;
      if (len !== 8 + comps * 3) return null;
      frame = { width, height };
    }
    if (m === 0xda) return frame ? { ...frame, sos: i - 2 } : null;
    i += len;
  }
  return null;
}

/** Offset just past the EOI of the JPEG whose first scan starts at `sos`, or the file end. */
function jpegEndFrom(b, sos) {
  let i = sos;
  const end = b.length;
  while (i + 4 <= end) {
    // A marker segment (sos points at FF xx).
    if (b[i] !== 0xff) return end;
    const m = b[i + 1];
    if (m === 0xd9) return i + 2;
    if (m === 0xff) { i++; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    i += 2 + len;
    if (m !== 0xda) continue;
    // Entropy-coded data: runs until a marker other than stuffing or RST.
    while (i + 1 < end) {
      if (b[i] === 0xff) {
        const n = b[i + 1];
        if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) { i += n === 0xff ? 1 : 2; continue; }
        break;
      }
      i++;
    }
  }
  return end;
}

/**
 * The largest embedded JPEG in a camera RAW (or any) file.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array|null} a view of the JPEG bytes, or null when none is found
 */
export function rawPreviewJpeg(bytes) {
  if (!bytes || bytes.length < 8) return null;
  let best = null;
  let tried = 0;
  const last = bytes.length - 3;
  for (let i = 0; i < last; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    if (++tried > 20000) break;
    const frame = jpegFrameAt(bytes, i);
    if (!frame) continue;
    const area = frame.width * frame.height;
    if (!best || area > best.area) best = { start: i, sos: frame.sos, area };
  }
  if (!best) return null;
  return bytes.subarray(best.start, jpegEndFrom(bytes, best.sos));
}

/** True for an extension handled through the embedded preview. */
export function isRawExtension(ext) {
  return RAW_IMAGE_EXTENSIONS.includes(String(ext || '').toLowerCase());
}
