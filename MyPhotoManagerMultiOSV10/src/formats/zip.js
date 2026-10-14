// ZIP archives: list (central directory, ZIP64 end record), extract (stored
// and deflate, CRC-32 checked) and write (deflate when it helps, else stored).
// Names are UTF-8 when general-purpose flag bit 11 is set, otherwise CP437.
// Timestamps use the MS-DOS date/time fields, interpreted as local time.
import pako from 'pako';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_END64 = 0x06064b50;
const SIG_END64_LOCATOR = 0x07064b50;
const FLAG_UTF8 = 0x0800;

let crcTable = null;

/** CRC-32 (IEEE 802.3) of a byte array; pass `crc` to continue a running value. */
export function crc32(bytes, crc = 0) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

// Code page 437 for bytes 0x80–0xFF (bytes below are ASCII).
const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

function decodeCp437(bytes) {
  let s = '';
  for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
  return s;
}

const utf8 = new TextDecoder('utf-8');
const utf8Encoder = new TextEncoder();

/** MS-DOS date + time → epoch milliseconds (local time). */
export function dosToMs(date, time) {
  const year = 1980 + (date >> 9);
  const month = ((date >> 5) & 15) - 1;
  const day = date & 31;
  return new Date(year, Math.max(0, month), Math.max(1, day), time >> 11, (time >> 5) & 63, (time & 31) * 2).getTime();
}

/** Epoch milliseconds → { date, time } MS-DOS fields (local time, 2-second resolution). */
export function msToDos(ms) {
  const d = new Date(ms);
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  if (d.getFullYear() < 1980) return { date: (0 << 9) | (1 << 5) | 1, time: 0 };
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u64 = (dv, p) => dv.getUint32(p, true) + dv.getUint32(p + 4, true) * 2 ** 32;

function findEnd(bytes, dv) {
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let p = bytes.length - 22; p >= min; p--) {
    if (dv.getUint32(p, true) === SIG_END) return p;
  }
  throw new Error('Not a ZIP archive (no end of central directory record)');
}

/**
 * List the entries of a ZIP archive from its central directory.
 * Returns [{ name, size, compressedSize, method, offset, modified (ms), isDir, crc, flags, encrypted }].
 */
export function readZip(bytes) {
  const dv = view(bytes);
  const end = findEnd(bytes, dv);
  let count = dv.getUint16(end + 10, true);
  let cdSize = dv.getUint32(end + 12, true);
  let cdOffset = dv.getUint32(end + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = end - 20;
    if (loc >= 0 && dv.getUint32(loc, true) === SIG_END64_LOCATOR) {
      const rec = u64(dv, loc + 8);
      if (dv.getUint32(rec, true) !== SIG_END64) throw new Error('Broken ZIP64 end record');
      count = u64(dv, rec + 32);
      cdSize = u64(dv, rec + 40);
      cdOffset = u64(dv, rec + 48);
    }
  }
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error('Broken ZIP central directory');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const time = dv.getUint16(p + 12, true);
    const date = dv.getUint16(p + 14, true);
    const crc = dv.getUint32(p + 16, true);
    let compressedSize = dv.getUint32(p + 20, true);
    let size = dv.getUint32(p + 24, true);
    const nameLength = dv.getUint16(p + 28, true);
    const extraLength = dv.getUint16(p + 30, true);
    const commentLength = dv.getUint16(p + 32, true);
    const externalAttributes = dv.getUint32(p + 38, true);
    let offset = dv.getUint32(p + 42, true);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLength);
    const name = flags & FLAG_UTF8 ? utf8.decode(nameBytes) : decodeCp437(nameBytes);
    // ZIP64 extended information: only the fields that overflowed are present, in this order.
    let e = p + 46 + nameLength;
    const extraEnd = e + extraLength;
    while (e + 4 <= extraEnd) {
      const id = dv.getUint16(e, true);
      const len = dv.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(dv, q); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(dv, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(dv, q); q += 8; }
      }
      e += 4 + len;
    }
    const isDir = name.endsWith('/') || (externalAttributes & 0x10) !== 0;
    entries.push({ name, size, compressedSize, method, offset, modified: dosToMs(date, time), isDir, crc, flags, encrypted: (flags & 1) !== 0 });
    p = extraEnd + commentLength;
  }
  return entries;
}

/** Uncompressed bytes of one entry (from readZip); throws on CRC mismatch. */
export function extractZip(bytes, entry) {
  if (entry.encrypted) throw new Error(`Encrypted ZIP entry: ${entry.name}`);
  const dv = view(bytes);
  const p = entry.offset;
  if (dv.getUint32(p, true) !== SIG_LOCAL) throw new Error(`Broken ZIP local header: ${entry.name}`);
  const start = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  let data;
  if (entry.method === 0) data = raw.slice();
  else if (entry.method === 8) {
    try { data = pako.inflateRaw(raw); } catch (err) { throw new Error(`Corrupt deflate data in ${entry.name}: ${err?.message ?? err}`); }
    if (!data) throw new Error(`Corrupt deflate data in ${entry.name}`);
  } else throw new Error(`Unsupported ZIP compression method ${entry.method}: ${entry.name}`);
  if (data.length !== entry.size) throw new Error(`Size mismatch in ${entry.name}`);
  if (entry.crc !== undefined && crc32(data) !== entry.crc) throw new Error(`CRC mismatch in ${entry.name}`);
  return data;
}

/**
 * Write a ZIP archive.
 *   entries: [{ name, data: Uint8Array (omit or empty for a folder ending in '/'), modified? (ms) }]
 *   options.level: deflate level 0…9 (0 = always store)
 * Each entry is deflated when that makes it smaller, otherwise stored.
 */
export function writeZip(entries, { level = 6 } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = utf8Encoder.encode(entry.name);
    const data = entry.data ?? new Uint8Array(0);
    const crc = crc32(data);
    let method = 0;
    let payload = data;
    if (level > 0 && data.length > 0) {
      const deflated = pako.deflateRaw(data, { level });
      if (deflated.length < data.length) { method = 8; payload = deflated; }
    }
    if (payload.length >= 0xffffffff || data.length >= 0xffffffff || offset >= 0xffffffff) throw new Error('ZIP64 output is not supported');
    const { date, time } = msToDos(entry.modified ?? Date.now());
    const isDir = entry.name.endsWith('/');

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = view(local);
    lv.setUint32(0, SIG_LOCAL, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, FLAG_UTF8, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = view(central);
    cv.setUint32(0, SIG_CENTRAL, true);
    cv.setUint16(4, (3 << 8) | 20, true); // made by: UNIX, version 2.0
    cv.setUint16(6, 20, true);
    cv.setUint16(8, FLAG_UTF8, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(38, isDir ? ((0o40755 << 16) | 0x10) >>> 0 : (0o100644 << 16) >>> 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local, payload);
    centrals.push(central);
    offset += local.length + payload.length;
  }
  if (entries.length > 0xffff) throw new Error('ZIP64 output is not supported');
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = view(end);
  ev.setUint32(0, SIG_END, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length; }
  return out;
}
