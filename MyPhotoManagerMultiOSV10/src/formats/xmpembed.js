// Embedded XMP in PNG, WebP and TIFF (JPEG lives in exif-edit.js):
//   PNG  — an iTXt chunk with the keyword "XML:com.adobe.xmp", right after IHDR
//   WebP — an "XMP " chunk at the end and the XMP flag in VP8X (simple lossy /
//          lossless files are turned into the extended layout first)
//   TIFF — tag 700 (XMLPacket) in the first IFD; the IFD is rewritten at the end
//          of the file so nothing else moves
// Each format has a reader and a writer; writers return a new byte array.
import { crc32 } from './zip.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const XMP_KEY = 'XML:com.adobe.xmp';

export function xmpContainer(bytes) {
  if (PNG_SIG.every((b, i) => bytes[i] === b)) return 'png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42 && bytes[3] === 0) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 42)) return 'tiff';
  return null;
}

/** XMP packet text embedded in a PNG, WebP or TIFF, or ''. */
export function readEmbeddedXmp(bytes) {
  switch (xmpContainer(bytes)) {
    case 'png': return pngXmp(bytes);
    case 'webp': return webpXmp(bytes);
    case 'tiff': return tiffXmp(bytes);
    default: return '';
  }
}

/** Copy of the file with `xmp` as its embedded XMP (replacing any). Throws for other formats. */
export function embedXmp(bytes, xmp) {
  switch (xmpContainer(bytes)) {
    case 'png': return pngWithXmp(bytes, xmp);
    case 'webp': return webpWithXmp(bytes, xmp);
    case 'tiff': return tiffWithXmp(bytes, xmp);
    default: throw new Error('XMP can be embedded only in PNG, WebP and TIFF here');
  }
}

const ascii = (bytes, at, n) => String.fromCharCode(...bytes.subarray(at, at + n));
const u32be = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

// ───────────────────────── PNG

function pngChunks(bytes) {
  const out = [];
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = u32be(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    out.push({ type, start: at, data: at + 8, length, end: at + 12 + length });
    at += 12 + length;
    if (type === 'IEND') break;
  }
  return out;
}

const isXmpChunk = (bytes, c) => c.type === 'iTXt' && ascii(bytes, c.data, XMP_KEY.length) === XMP_KEY && bytes[c.data + XMP_KEY.length] === 0;

function pngXmp(bytes) {
  const chunk = pngChunks(bytes).find((c) => isXmpChunk(bytes, c));
  if (!chunk) return '';
  // keyword\0 compression-flag compression-method language\0 translated\0 text
  let at = chunk.data + XMP_KEY.length + 1;
  const compressed = bytes[at];
  at += 2;
  while (bytes[at] !== 0 && at < chunk.data + chunk.length) at++;
  at++;
  while (bytes[at] !== 0 && at < chunk.data + chunk.length) at++;
  at++;
  if (compressed) return ''; // XMP in PNG is stored uncompressed by every writer we know
  return dec.decode(bytes.subarray(at, chunk.data + chunk.length));
}

function pngWithXmp(bytes, xmp) {
  const body = new Uint8Array([...enc.encode(XMP_KEY), 0, 0, 0, 0, 0, ...enc.encode(xmp)]);
  const chunk = new Uint8Array(12 + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length);
  chunk.set(enc.encode('iTXt'), 4);
  chunk.set(body, 8);
  view.setUint32(8 + body.length, crc32(chunk.subarray(4, 8 + body.length)));
  const chunks = pngChunks(bytes);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG without IHDR');
  const parts = [bytes.subarray(0, ihdr.end), chunk];
  for (const c of chunks) if (c !== ihdr && !isXmpChunk(bytes, c)) parts.push(bytes.subarray(c.start, c.end));
  return concat(parts);
}

// ───────────────────────── WebP

function webpChunks(bytes) {
  const out = [];
  const end = Math.min(bytes.length, 8 + u32le(bytes, 4));
  for (let at = 12; at + 8 <= end;) {
    const size = u32le(bytes, at + 4);
    out.push({ type: ascii(bytes, at, 4), start: at, data: at + 8, size, end: at + 8 + size + (size & 1) });
    at += 8 + size + (size & 1);
  }
  return out;
}

function webpXmp(bytes) {
  const chunk = webpChunks(bytes).find((c) => c.type === 'XMP ');
  return chunk ? dec.decode(bytes.subarray(chunk.data, chunk.data + chunk.size)) : '';
}

/** Canvas size of a simple WebP (VP8 / VP8L chunk). */
function webpSize(bytes, chunk) {
  const d = chunk.data;
  if (chunk.type === 'VP8 ') return { width: (bytes[d + 6] | (bytes[d + 7] << 8)) & 0x3fff, height: (bytes[d + 8] | (bytes[d + 9] << 8)) & 0x3fff };
  if (chunk.type === 'VP8L') {
    const b = u32le(bytes, d + 1);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, alpha: Boolean((b >> 28) & 1) };
  }
  return null;
}

function riffChunk(type, data) {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  out.set(enc.encode(type), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function webpWithXmp(bytes, xmp) {
  const chunks = webpChunks(bytes);
  let vp8x = chunks.find((c) => c.type === 'VP8X');
  const parts = [];
  if (vp8x) {
    const head = bytes.slice(vp8x.start, vp8x.end);
    head[8] |= 0x04; // XMP flag
    parts.push(head);
  } else {
    const image = chunks.find((c) => c.type === 'VP8 ' || c.type === 'VP8L');
    const size = image && webpSize(bytes, image);
    if (!size) throw new Error('WebP without an image chunk');
    const data = new Uint8Array(10);
    data[0] = 0x04 | (size.alpha ? 0x10 : 0);
    const w = size.width - 1;
    const h = size.height - 1;
    data.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 4);
    parts.push(riffChunk('VP8X', data));
  }
  for (const c of chunks) if (c.type !== 'VP8X' && c.type !== 'XMP ') parts.push(bytes.subarray(c.start, c.end));
  parts.push(riffChunk('XMP ', enc.encode(xmp)));
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(enc.encode('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(enc.encode('WEBP'), 8);
  out.set(body, 12);
  return out;
}

// ───────────────────────── TIFF

function tiffReader(bytes) {
  const little = bytes[0] === 0x49;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { little, u16: (at) => view.getUint16(at, little), u32: (at) => view.getUint32(at, little) };
}

function tiffXmp(bytes) {
  const r = tiffReader(bytes);
  const ifd = r.u32(4);
  const count = r.u16(ifd);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (r.u16(at) !== 700) continue;
    const n = r.u32(at + 4);
    const offset = n <= 4 ? at + 8 : r.u32(at + 8);
    return dec.decode(bytes.subarray(offset, offset + n));
  }
  return '';
}

function tiffWithXmp(bytes, xmp) {
  const r = tiffReader(bytes);
  const ifd = r.u32(4);
  const count = r.u16(ifd);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (r.u16(at) !== 700) entries.push(bytes.slice(at, at + 12));
  }
  const next = r.u32(ifd + 2 + count * 12);
  const packet = enc.encode(xmp);
  // New data at the end (word aligned): the packet, then the new IFD.
  let size = bytes.length + (bytes.length & 1);
  const packetAt = size;
  size += packet.length + (packet.length & 1);
  const ifdAt = size;
  const total = entries.length + 1;
  size += 2 + total * 12 + 4;
  const out = new Uint8Array(size);
  out.set(bytes, 0);
  out.set(packet, packetAt);
  const view = new DataView(out.buffer);
  const le = r.little;
  const entry = new Uint8Array(12);
  const ev = new DataView(entry.buffer);
  ev.setUint16(0, 700, le);
  ev.setUint16(2, 1, le); // BYTE
  ev.setUint32(4, packet.length, le);
  ev.setUint32(8, packetAt, le);
  const tagOf = (e) => (le ? e[0] | (e[1] << 8) : (e[0] << 8) | e[1]);
  const sorted = [...entries, entry].sort((a, b) => tagOf(a) - tagOf(b));
  view.setUint16(ifdAt, total, le);
  sorted.forEach((e, i) => out.set(e, ifdAt + 2 + i * 12));
  view.setUint32(ifdAt + 2 + total * 12, next, le);
  view.setUint32(4, ifdAt, le);
  return out;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
