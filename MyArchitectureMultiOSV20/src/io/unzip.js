// ZIP reader for archives written by other programs (Sweet Home 3D .sh3d,
// .ifczip): STORE and DEFLATE entries. Deflate is undone with the platform's
// DecompressionStream("deflate-raw") (Electron, browsers and Node 18+), so
// there is no decompressor to ship. zip.js keeps the tiny STORE-only writer.

const dec = new TextDecoder();

// Central directory of a .zip → [{name, method, csize, size, offset, flags}].
export function zipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const stop = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= stop; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a ZIP archive");
  let count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  // ZIP64: the real values live in the ZIP64 end record.
  if ((p === 0xffffffff || count === 0xffff) && eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50) {
    const z = Number(dv.getBigUint64(eocd - 12, true));
    if (dv.getUint32(z, true) === 0x06064b50) { count = Number(dv.getBigUint64(z + 32, true)); p = Number(dv.getBigUint64(z + 48, true)); }
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error("damaged ZIP central directory");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    let csize = dv.getUint32(p + 20, true);
    let size = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    let offset = dv.getUint32(p + 42, true);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nlen);
    const name = flags & 0x800 ? dec.decode(nameBytes) : latin1(nameBytes);
    // ZIP64 extra field (id 1) for sizes / offset that did not fit.
    let x = p + 46 + nlen;
    const xend = x + xlen;
    while (x + 4 <= xend) {
      const id = dv.getUint16(x, true), len = dv.getUint16(x + 2, true);
      if (id === 1) {
        let q = x + 4;
        if (size === 0xffffffff) { size = Number(dv.getBigUint64(q, true)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (offset === 0xffffffff) { offset = Number(dv.getBigUint64(q, true)); }
      }
      x += 4 + len;
    }
    out.push({ name, method, csize, size, offset, flags });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

const latin1 = (b) => { let s = ""; for (const c of b) s += String.fromCharCode(c); return s; };

// Is this a ZIP archive (local file header or empty-archive signature)?
export function isZip(bytes) {
  return bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5) && (bytes[3] === 4 || bytes[3] === 6);
}

async function inflateRaw(data) {
  if (typeof DecompressionStream !== "function") throw new Error("this platform cannot decompress ZIP entries");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Bytes of one entry (from zipEntries()).
export async function zipEntryData(bytes, e) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error(`damaged ZIP entry ${e.name}`);
  if (e.flags & 1) throw new Error(`ZIP entry ${e.name} is encrypted`);
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const raw = bytes.subarray(start, start + e.csize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  throw new Error(`ZIP entry ${e.name} uses compression method ${e.method}`);
}

// Find an entry by name (exact, then case-insensitive, then a predicate) and read it.
export async function readZipEntry(bytes, match) {
  const list = zipEntries(bytes);
  const e = typeof match === "function" ? list.find(match) : list.find((x) => x.name === match) || list.find((x) => x.name.toLowerCase() === String(match).toLowerCase());
  return e ? zipEntryData(bytes, e) : null;
}

// Text (UTF-8, BOM dropped) of an entry, or null when it is missing.
export async function readZipText(bytes, match) {
  const data = await readZipEntry(bytes, match);
  return data ? dec.decode(data).replace(/^﻿/, "") : null;
}
