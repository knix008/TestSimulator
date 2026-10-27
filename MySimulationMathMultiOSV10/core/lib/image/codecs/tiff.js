// TIFF codec: reads strips or tiles, chunky or planar, 1/2/4/8/16-bit
// integers and 32-bit floats, uncompressed / LZW / Deflate / PackBits,
// horizontal predictor, gray / RGB / palette / CMYK, several pages.
// Writes uncompressed, LZW, Deflate or PackBits pages and appends pages.
import { cerr, makeRaster, Out } from './common.js';
import { inflate, deflate } from '../../io/zlib.js';

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
const COMPRESSION_NAME = { 1: 'Uncompressed', 2: 'CCITT 1D', 3: 'CCITT Group 3', 4: 'CCITT Group 4', 5: 'LZW', 6: 'JPEG (old)', 7: 'JPEG', 8: 'Deflate', 32946: 'Deflate', 32773: 'PackBits' };
const PHOTOMETRIC_NAME = { 0: 'WhiteIsZero', 1: 'BlackIsZero', 2: 'RGB', 3: 'RGB Palette', 4: 'Transparency mask', 5: 'Separated', 6: 'YCbCr', 8: 'CIELab' };

function reader(b) {
  if (b.length < 8) throw cerr('tif', 'file too short');
  const le = b[0] === 0x49;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  if (u16(2) === 43) throw cerr('tif', 'BigTIFF files are not supported');
  if (u16(2) !== 42) throw cerr('tif', 'bad magic number');
  return { le, dv, u16, u32 };
}

function readValue(R, type, o) {
  const { dv, le } = R;
  switch (type) {
    case 1: case 2: case 7: return dv.getUint8(o);
    case 6: return dv.getInt8(o);
    case 3: return dv.getUint16(o, le);
    case 8: return dv.getInt16(o, le);
    case 4: return dv.getUint32(o, le);
    case 9: return dv.getInt32(o, le);
    case 5: return dv.getUint32(o, le) / (dv.getUint32(o + 4, le) || 1);
    case 10: return dv.getInt32(o, le) / (dv.getInt32(o + 4, le) || 1);
    case 11: return dv.getFloat32(o, le);
    case 12: return dv.getFloat64(o, le);
    default: return 0;
  }
}

/** All IFDs: [{ tags: {tag: values[] | string}, offset, nextPtrPos }]. */
export function tiffIfds(b) {
  const R = reader(b);
  const ifds = [];
  let off = R.u32(4);
  const seen = new Set();
  while (off && off < b.length && !seen.has(off)) {
    seen.add(off);
    const n = R.u16(off);
    const tags = Object.create(null);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      const tag = R.u16(e), type = R.u16(e + 2), count = R.u32(e + 4);
      const sz = TYPE_SIZE[type] || 1;
      const vo = sz * count <= 4 ? e + 8 : R.u32(e + 8);
      if (vo + sz * count > b.length) continue;
      if (type === 2) { let s = ''; for (let k = 0; k < count; k++) { const c = b[vo + k]; if (c === 0) break; s += String.fromCharCode(c); } tags[tag] = s; } else {
        const vals = new Array(count);
        for (let k = 0; k < count; k++) vals[k] = readValue(R, type, vo + k * sz);
        tags[tag] = vals;
      }
    }
    const nextPtrPos = off + 2 + n * 12;
    ifds.push({ tags, offset: off, nextPtrPos });
    off = R.u32(nextPtrPos);
  }
  if (!ifds.length) throw cerr('tif', 'no image file directory');
  return { ifds, le: R.le };
}

export function lzwDecodeTiff(data, expected) {
  const out = new Uint8Array(expected);
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  for (let i = 0; i < 256; i++) suffix[i] = i;
  let codeSize = 9, next = 258, old = -1, first = 0, op = 0, bb = 0, bc = 0, p = 0;
  while (op < expected) {
    while (bc < codeSize) { if (p >= data.length) return out; bb = ((bb << 8) | data[p++]) >>> 0; bc += 8; }
    const code = (bb >>> (bc - codeSize)) & ((1 << codeSize) - 1);
    bc -= codeSize; bb &= (1 << bc) - 1;
    if (code === 256) { codeSize = 9; next = 258; old = -1; continue; }
    if (code === 257) break;
    if (old === -1) { out[op++] = code; old = code; first = code; continue; }
    let sp = 0, c = code;
    if (code >= next) { stack[sp++] = first; c = old; }
    while (c >= 258) { stack[sp++] = suffix[c]; c = prefix[c]; }
    first = c; stack[sp++] = c;
    while (sp > 0 && op < expected) out[op++] = stack[--sp];
    if (next < 4096) { prefix[next] = old; suffix[next] = first; next++; if (next === (1 << codeSize) - 1 && codeSize < 12) codeSize++; }
    old = code;
  }
  return out;
}

export function lzwEncodeTiff(data) {
  const o = new Out(data.length / 2 + 16);
  let bb = 0, bc = 0, codeSize = 9, next = 258;
  const emit = (c) => { bb = (bb << codeSize) | c; bc += codeSize; while (bc >= 8) { o.u8((bb >>> (bc - 8)) & 255); bc -= 8; } bb &= (1 << bc) - 1; };
  const dict = new Map();
  emit(256);
  if (data.length) {
    let pre = data[0];
    for (let i = 1; i < data.length; i++) {
      const k = data[i], key = pre * 256 + k;
      const hit = dict.get(key);
      if (hit !== undefined) { pre = hit; continue; }
      emit(pre);
      dict.set(key, next++);
      if (next >= (1 << codeSize) && codeSize < 12) codeSize++;
      if (next >= 4094) { emit(256); dict.clear(); codeSize = 9; next = 258; }
      pre = k;
    }
    emit(pre);
  }
  emit(257);
  if (bc > 0) o.u8((bb << (8 - bc)) & 255);
  return o.result();
}

export function packbitsDecode(data, expected) {
  const out = new Uint8Array(expected);
  let p = 0, o = 0;
  while (p < data.length && o < expected) {
    const n = (data[p++] << 24) >> 24;
    if (n >= 0) { for (let i = 0; i <= n && o < expected; i++) out[o++] = data[p++]; } else if (n !== -128) { const v = data[p++]; for (let i = 0; i < 1 - n && o < expected; i++) out[o++] = v; }
  }
  return out;
}
export function packbitsEncode(data) {
  const o = new Out(data.length + 16);
  let i = 0;
  while (i < data.length) {
    let run = 1;
    while (i + run < data.length && run < 128 && data[i + run] === data[i]) run++;
    if (run >= 2) { o.u8(257 - run); o.u8(data[i]); i += run; continue; }
    let j = i; const lit = [];
    while (j < data.length && lit.length < 128 && !(j + 1 < data.length && data[j + 1] === data[j])) lit.push(data[j++]);
    if (!lit.length) lit.push(data[j++]);
    o.u8(lit.length - 1); for (const v of lit) o.u8(v);
    i = j;
  }
  return o.result();
}

const tag1 = (t, k, d) => (t[k] ? (Array.isArray(t[k]) ? t[k][0] : t[k]) : d);

/** Summary of an IFD for imfinfo. */
export function tiffPageInfo(t) {
  const bps = t[258] || [1];
  const spp = tag1(t, 277, 1);
  return {
    width: tag1(t, 256, 0), height: tag1(t, 257, 0), bitsPerSample: bps, samplesPerPixel: spp,
    compression: COMPRESSION_NAME[tag1(t, 259, 1)] || String(tag1(t, 259, 1)),
    photometric: PHOTOMETRIC_NAME[tag1(t, 262, 1)] || String(tag1(t, 262, 1)), photometricCode: tag1(t, 262, 1),
    planar: tag1(t, 284, 1), description: typeof t[270] === 'string' ? t[270] : '', software: typeof t[305] === 'string' ? t[305] : '',
    xres: tag1(t, 282, null), yres: tag1(t, 283, null), resUnit: tag1(t, 296, 2), sampleFormat: tag1(t, 339, 1),
    rowsPerStrip: tag1(t, 278, tag1(t, 257, 0)), tiled: !!t[322], colormap: !!t[320], extraSamples: t[338] || [],
  };
}

/** Decodes page `index` (0-based). Returns a Raster (data Uint8/Uint16/Float32/Uint32 array). */
export function decodeTiff(b, index = 0) {
  const { ifds, le } = tiffIfds(b);
  if (index < 0 || index >= ifds.length) throw cerr('tif', `page ${index + 1} does not exist (file has ${ifds.length})`);
  const t = ifds[index].tags;
  const width = tag1(t, 256, 0), height = tag1(t, 257, 0);
  const spp = tag1(t, 277, 1), bps = tag1(t, 258, 1);
  const comp = tag1(t, 259, 1), photo = tag1(t, 262, spp >= 3 ? 2 : 1), planar = tag1(t, 284, 1);
  const pred = tag1(t, 317, 1), fmt = tag1(t, 339, 1);
  if (![1, 5, 8, 32946, 32773].includes(comp)) throw cerr('tif', `compression '${COMPRESSION_NAME[comp] || comp}' is not supported`);
  if (![1, 2, 4, 8, 16, 32].includes(bps)) throw cerr('tif', `${bps}-bit samples are not supported`);
  const tiled = !!t[322];
  const tw = tiled ? tag1(t, 322, width) : width;
  const th = tiled ? tag1(t, 323, height) : tag1(t, 278, height);
  const offsets = tiled ? t[324] : t[273], counts = tiled ? t[325] : t[279];
  if (!offsets) throw cerr('tif', 'missing strip offsets');
  const planes = planar === 2 ? spp : 1;
  const sppChunk = planar === 2 ? 1 : spp;
  const rowBytesFull = Math.ceil((width * sppChunk * bps) / 8);
  const planeBufs = [];
  for (let k = 0; k < planes; k++) planeBufs.push(new Uint8Array(rowBytesFull * height));
  const across = tiled ? Math.ceil(width / tw) : 1, down = Math.ceil(height / th);
  const chunkRowBytes = Math.ceil((tw * sppChunk * bps) / 8);
  const chunkBytes = chunkRowBytes * th;
  for (let i = 0; i < offsets.length; i++) {
    const plane = Math.floor(i / (across * down));
    if (plane >= planes) break;
    const ci = i % (across * down);
    const cx = ci % across, cy = Math.floor(ci / across);
    const src = b.subarray(offsets[i], offsets[i] + (counts ? counts[i] : chunkBytes));
    let raw;
    if (comp === 1) raw = pred === 2 ? src.slice() : src;
    else if (comp === 5) raw = lzwDecodeTiff(src, chunkBytes);
    else if (comp === 32773) raw = packbitsDecode(src, chunkBytes);
    else raw = inflate(src, chunkBytes);
    if (pred === 2) {
      const bpsB = bps / 8;
      if (bps === 8) for (let y = 0; y < th; y++) { const ro = y * chunkRowBytes; for (let x = sppChunk; x < tw * sppChunk; x++) raw[ro + x] = (raw[ro + x] + raw[ro + x - sppChunk]) & 255; } else if (bps === 16) {
        const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        for (let y = 0; y < th; y++) { const ro = y * chunkRowBytes; for (let x = sppChunk; x < tw * sppChunk; x++) { const o = ro + x * 2; if (o + 2 > raw.length) break; dv.setUint16(o, (dv.getUint16(o, le) + dv.getUint16(o - 2 * sppChunk, le)) & 0xffff, le); } }
      }
      void bpsB;
    }
    const dst = planeBufs[plane];
    const rows = Math.min(th, height - cy * th);
    const x0Bytes = Math.ceil((cx * tw * sppChunk * bps) / 8);
    const copyBytes = Math.min(chunkRowBytes, rowBytesFull - x0Bytes);
    for (let y = 0; y < rows; y++) {
      const so = y * chunkRowBytes;
      if (so >= raw.length) break;
      dst.set(raw.subarray(so, so + copyBytes), (cy * th + y) * rowBytesFull + x0Bytes);
    }
  }
  // samples
  const n = width * height * spp;
  let data;
  if (bps === 32) data = fmt === 3 ? new Float32Array(n) : new Uint32Array(n);
  else if (bps === 16) data = new Uint16Array(n);
  else data = new Uint8Array(n);
  const sampleAt = (buf, bit) => {
    if (bps === 8) return buf[bit >> 3];
    if (bps === 16) { const o = bit >> 3; return le ? buf[o] | (buf[o + 1] << 8) : (buf[o] << 8) | buf[o + 1]; }
    if (bps === 32) {
      const o = bit >> 3; const dv = new DataView(buf.buffer, buf.byteOffset + o, 4);
      return fmt === 3 ? dv.getFloat32(0, le) : dv.getUint32(0, le);
    }
    return (buf[bit >> 3] >> (8 - bps - (bit & 7))) & ((1 << bps) - 1);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < spp; k++) {
        const v = planar === 2 ? sampleAt(planeBufs[k], y * rowBytesFull * 8 + x * bps) : sampleAt(planeBufs[0], y * rowBytesFull * 8 + (x * spp + k) * bps);
        data[(y * width + x) * spp + k] = v;
      }
    }
  }
  const r = makeRaster(width, height, spp, bps);
  r.data = data;
  r.bitDepth = bps;
  r.sampleFormat = fmt === 3 ? 'float' : fmt === 2 ? 'int' : 'uint';
  if (photo === 0) { const mx = bps >= 32 ? 1 : (1 << bps) - 1; for (let i = 0; i < data.length; i++) data[i] = mx - data[i]; }
  if (photo === 3 && t[320]) {
    const cm = t[320]; const nn = cm.length / 3;
    r.indexed = true;
    r.palette16 = new Uint16Array(cm);
    r.palette = new Uint8Array(nn * 3);
    for (let i = 0; i < nn; i++) { r.palette[3 * i] = cm[i] >> 8; r.palette[3 * i + 1] = cm[nn + i] >> 8; r.palette[3 * i + 2] = cm[2 * nn + i] >> 8; }
  }
  r.photometric = photo;
  r.cmyk = photo === 5;
  r.extraSamples = t[338] || [];
  r.pageCount = ifds.length;
  return r;
}

/**
 * Encodes one page into a full TIFF file, or appends it to `existing`.
 * img: Raster ({width,height,channels,bitDepth,data, palette16?, sampleFormat?}).
 * opts: { compression: 'none'|'lzw'|'deflate'|'packbits', description, resolution, cmyk }
 */
export function encodeTiff(img, opts = {}, existing = null) {
  const { width, height, channels: spp, bitDepth: bps } = img;
  const compName = String(opts.compression || 'none').toLowerCase();
  const comp = { none: 1, lzw: 5, deflate: 8, adobe: 8, packbits: 32773 }[compName];
  if (!comp) throw cerr('tif', `unknown compression '${opts.compression}'`);
  const isFloat = img.sampleFormat === 'float';
  // raw rows, little-endian
  const rowBytes = Math.ceil((width * spp * bps) / 8);
  const raw = new Uint8Array(rowBytes * height);
  const dv = new DataView(raw.buffer);
  for (let y = 0; y < height; y++) {
    const ro = y * rowBytes;
    for (let x = 0; x < width * spp; x++) {
      const v = img.data[y * width * spp + x];
      if (bps === 8) raw[ro + x] = v;
      else if (bps === 16) dv.setUint16(ro + 2 * x, v, true);
      else if (bps === 32) { if (isFloat) dv.setFloat32(ro + 4 * x, v, true); else dv.setUint32(ro + 4 * x, v, true); } else { const bit = x * bps; raw[ro + (bit >> 3)] |= (v & ((1 << bps) - 1)) << (8 - bps - (bit & 7)); }
    }
  }
  const strip = comp === 1 ? raw : comp === 5 ? lzwEncodeTiff(raw) : comp === 8 ? deflate(raw) : packbitsEncode(raw);
  const photo = img.palette16 ? 3 : opts.cmyk ? 5 : spp >= 3 ? 2 : 1;
  const entries = [];
  const E = (tag, type, values) => entries.push({ tag, type, values: Array.isArray(values) ? values : [values] });
  E(254, 4, 0);
  E(256, 4, width); E(257, 4, height);
  E(258, 3, new Array(spp).fill(bps));
  E(259, 3, comp); E(262, 3, photo);
  if (opts.description) E(270, 2, opts.description);
  E(273, 4, 0); // patched below
  E(277, 3, spp); E(278, 4, height); E(279, 4, strip.length);
  const res = opts.resolution || 72;
  E(282, 5, [res, 1]); E(283, 5, [res, 1]); E(284, 3, 1); E(296, 3, 2);
  if (img.palette16) E(320, 3, Array.from(img.palette16));
  const extra = (photo === 2 && spp > 3) || (photo === 1 && spp > 1) ? spp - (photo === 2 ? 3 : 1) : 0;
  if (extra > 0) E(338, 3, new Array(extra).fill(2));
  E(339, 3, new Array(spp).fill(isFloat ? 3 : 1));
  entries.sort((a, b) => a.tag - b.tag);

  const o = new Out((existing ? existing.length : 0) + strip.length + 1024);
  let base = 0;
  if (existing) { if (existing[0] !== 0x49) throw cerr('tif', 'pages can only be appended to little-endian files'); o.bytes(existing); if (o.len & 1) o.u8(0); base = 0; } else { o.ascii('II'); o.le16(42); o.le32(8); }
  void base;
  const stripOff = o.len;
  o.bytes(strip);
  if (o.len & 1) o.u8(0);
  const ifdOff = o.len;
  const n = entries.length;
  let extraOff = ifdOff + 2 + n * 12 + 4;
  const extraParts = [];
  o.le16(n);
  for (const e of entries) {
    if (e.tag === 273) e.values = [stripOff];
    let bytes;
    if (e.type === 2) { const s = e.values[0] + '\0'; bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 255; } else {
      const sz = TYPE_SIZE[e.type];
      bytes = new Uint8Array(sz * e.values.length);
      const d = new DataView(bytes.buffer);
      if (e.type === 5) { d.setUint32(0, e.values[0], true); d.setUint32(4, e.values[1], true); } else e.values.forEach((v, i) => (e.type === 3 ? d.setUint16(i * 2, v, true) : d.setUint32(i * 4, v, true)));
    }
    const count = e.type === 2 ? bytes.length : e.type === 5 ? 1 : e.values.length;
    o.le16(e.tag); o.le16(e.type); o.le32(count);
    if (bytes.length <= 4) { const pad = new Uint8Array(4); pad.set(bytes); o.bytes(pad); } else {
      o.le32(extraOff); extraParts.push(bytes); extraOff += bytes.length + (bytes.length & 1);
    }
  }
  o.le32(0);
  for (const p of extraParts) { o.bytes(p); if (p.length & 1) o.u8(0); }
  const out = o.result();
  if (!existing) new DataView(out.buffer).setUint32(4, ifdOff, true);
  if (existing) {
    // link the last IFD of the existing file to the new one
    const { ifds, le } = tiffIfds(existing);
    const pos = ifds[ifds.length - 1].nextPtrPos;
    new DataView(out.buffer).setUint32(pos, ifdOff, le);
  }
  return out;
}
