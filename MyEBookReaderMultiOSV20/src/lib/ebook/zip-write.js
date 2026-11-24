// Writes ZIP archives with or without a password — Save with a password, or
// with the password taken off, for EPUB / CBZ / ZIP / FB2.ZIP books, and the
// archive other books are put in when the user protects them (TXT, MOBI…
// have no password of their own).
//
// An existing archive is rewritten without recompressing anything: each
// entry's compressed bytes are decrypted if needed and encrypted again if
// asked, and the headers are written fresh. New files are stored as they are
// (no deflate encoder ships with the reader; books are mostly compressed
// already).
//
// `encryption`: 'aes256' (WinZip AES-256, AE-2 — 7-Zip, WinZip, WinRAR,
// Bandizip, macOS Keka…) or 'zipcrypto' (the old PKWARE scheme — weak, but
// Windows Explorer opens it). Without a password nothing is encrypted.
import { decryptedEntryData, readEntry, readZip } from './zip.js';
import { aesEncrypt, crc32, zipCryptoEncrypt } from './zip-crypt.js';

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;
const LIMIT = 0xffffffff;

// The DOS date/time fields for "now" (local time, 2-second steps).
function dosNow(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);

class Out {
  constructor() { this.parts = []; this.length = 0; }
  push(bytes) { this.parts.push(bytes); this.length += bytes.length; }
  bytes() {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    return out;
  }
}

function header(size) {
  const b = new Uint8Array(size);
  return { b, v: new DataView(b.buffer) };
}

/**
 * Writes `items` as a ZIP archive. Each item:
 *   { name, nameBytes?, utf8?, data (compressed as `method` says), method: 0|8,
 *     crc, size (uncompressed), time, date, externalAttrs?, directory?, plain? }
 * `plain: true` keeps one entry unencrypted (an EPUB's "mimetype").
 */
export function writeZip(items, { password = null, encryption = 'aes256' } = {}) {
  const pw = password == null || password === '' ? null : String(password);
  const out = new Out();
  const central = [];
  for (const it of items) {
    const name = it.nameBytes || new TextEncoder().encode(it.name);
    const utf8 = it.nameBytes ? !!it.utf8 : !isAscii(it.name);
    const encrypt = !!pw && !it.directory && !it.plain;
    const aes = encrypt && encryption !== 'zipcrypto';
    let body = it.data;
    let method = it.method;
    let crc = it.crc >>> 0;
    let extra = new Uint8Array(0);
    if (encrypt && aes) {
      body = aesEncrypt(it.data, pw, 3);
      // AE-2 (no CRC: the MAC covers the data, and a CRC would leak a little
      // about the plain text).
      const x = header(11);
      x.v.setUint16(0, 0x9901, true);
      x.v.setUint16(2, 7, true);
      x.v.setUint16(4, 2, true);
      x.b[6] = 0x41; x.b[7] = 0x45;   // "AE"
      x.b[8] = 3;                     // AES-256
      x.v.setUint16(9, it.method, true);
      extra = x.b;
      method = 99;
      crc = 0;
    } else if (encrypt) {
      body = zipCryptoEncrypt(it.data, pw, crc);
    }
    if (body.length >= LIMIT || it.size >= LIMIT || out.length >= LIMIT) {
      throw new Error('This book is too large to save as a ZIP archive here (over 4 GB).');
    }
    const flags = (encrypt ? 1 : 0) | (utf8 ? 0x800 : 0);
    const version = aes ? 51 : 20;

    const offset = out.length;
    const loc = header(30);
    loc.v.setUint32(0, LOCAL, true);
    loc.v.setUint16(4, version, true);
    loc.v.setUint16(6, flags, true);
    loc.v.setUint16(8, method, true);
    loc.v.setUint16(10, it.time, true);
    loc.v.setUint16(12, it.date, true);
    loc.v.setUint32(14, crc, true);
    loc.v.setUint32(18, body.length, true);
    loc.v.setUint32(22, it.size, true);
    loc.v.setUint16(26, name.length, true);
    loc.v.setUint16(28, extra.length, true);
    out.push(loc.b);
    out.push(name);
    out.push(extra);
    out.push(body);

    const cen = header(46);
    cen.v.setUint32(0, CENTRAL, true);
    cen.v.setUint16(4, (it.versionMadeBy & 0xff00) | version, true);
    cen.v.setUint16(6, version, true);
    cen.v.setUint16(8, flags, true);
    cen.v.setUint16(10, method, true);
    cen.v.setUint16(12, it.time, true);
    cen.v.setUint16(14, it.date, true);
    cen.v.setUint32(16, crc, true);
    cen.v.setUint32(20, body.length, true);
    cen.v.setUint32(24, it.size, true);
    cen.v.setUint16(28, name.length, true);
    cen.v.setUint16(30, extra.length, true);
    cen.v.setUint32(38, it.externalAttrs >>> 0, true);
    cen.v.setUint32(42, offset, true);
    central.push(cen.b, name, extra);
  }
  const cdStart = out.length;
  for (const p of central) out.push(p);
  const cdSize = out.length - cdStart;
  if (items.length > 0xffff || out.length >= LIMIT) {
    throw new Error('This book has too many files to save as a ZIP archive here.');
  }
  const end = header(22);
  end.v.setUint32(0, EOCD, true);
  end.v.setUint16(8, items.length, true);
  end.v.setUint16(10, items.length, true);
  end.v.setUint32(12, cdSize, true);
  end.v.setUint32(16, cdStart, true);
  out.push(end.b);
  return out.bytes();
}

/**
 * Rewrites an archive (its bytes, already unlocked if it had a password —
 * see unlockZip) with a new password, or with none. The entries, their
 * names, dates and compression stay as they are. An EPUB's "mimetype" stays
 * unencrypted and first, as the EPUB container rules want.
 */
export function rewriteZip(data, { password = null, encryption = 'aes256' } = {}) {
  const zip = readZip(data);
  const items = zip.entries.map((e) => {
    if (e.directory) {
      return {
        nameBytes: e.nameBytes, utf8: (e.flags & 0x800) !== 0, data: new Uint8Array(0), method: 0,
        crc: 0, size: 0, time: e.modTime, date: e.modDate,
        versionMadeBy: e.versionMadeBy, externalAttrs: e.externalAttrs, directory: true,
      };
    }
    const { data: body, method } = decryptedEntryData(zip, e);
    let crc = e.crc;
    // AE-2 entries carry no CRC; the plain data has to be read to make one.
    if (e.aes && e.aes.version === 2) {
      crc = crc32(method === 0 ? body : readEntry(zip, e));
    }
    return {
      nameBytes: e.nameBytes,
      utf8: (e.flags & 0x800) !== 0,
      data: body,
      method,
      crc,
      size: e.uncompressedSize,
      time: e.modTime,
      date: e.modDate,
      versionMadeBy: e.versionMadeBy,
      externalAttrs: e.externalAttrs,
      plain: e.name === 'mimetype',
    };
  });
  return writeZip(items, { password, encryption });
}

/**
 * Puts files ([{ name, data }]) into a new archive, stored uncompressed.
 */
export function zipFiles(files, { password = null, encryption = 'aes256', date = new Date() } = {}) {
  const { time, date: day } = dosNow(date);
  return writeZip(files.map((f) => ({
    name: f.name,
    data: f.data,
    method: 0,
    crc: crc32(f.data),
    size: f.data.length,
    time,
    date: day,
    versionMadeBy: 0,
    externalAttrs: 0,
  })), { password, encryption });
}
