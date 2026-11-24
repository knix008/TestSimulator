// Minimal ZIP reader for the container formats the app opens:
// EPUB (OEBPS in a zip), CBZ (images in a zip) and any other zipped book.
//
// Only reading is needed, and only the two methods real files use — stored (0)
// and deflate (8). The archive is parsed from its central directory, so an
// entry can be inflated on demand instead of decompressing the whole book up
// front: a 300 MB comic opens as fast as its first page.
//
// Password-protected entries (ZipCrypto and WinZip AES, see zip-crypt.js) are
// read once the archive has its password: unlockZip() checks one and keeps
// it for these bytes, so every later readZip() of the same file — the EPUB
// reader, a relayout at another font size — reads them without asking again.
import { inflateRaw } from './inflate.js';
import {
  ZipPasswordError, aesDecrypt, zipCryptoDecrypt, crc32,
} from './zip-crypt.js';

export { ZipPasswordError };

const AES_METHOD = 99;
const AES_EXTRA = 0x9901;

// The password that opened an archive, keyed by its bytes.
const passwords = new WeakMap();

/** Remembers `password` for these archive bytes (a reload after Save). */
export function rememberZipPassword(data, password) {
  if (data && password != null) passwords.set(data, String(password));
}

/** The password these archive bytes were opened with, or null. */
export function zipPasswordOf(data) {
  return (data && passwords.get(data)) ?? null;
}

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const EOCD64_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function u16(view, at) { return view.getUint16(at, true); }
function u32(view, at) { return view.getUint32(at, true); }

// UTF-8 unless the entry predates the flag, in which case the bytes are most
// likely CP437; treating them as latin-1 keeps ASCII names (the common case)
// intact rather than throwing.
function decodeName(bytes, utf8) {
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function findEndOfCentralDirectory(view, data) {
  const maxComment = Math.min(data.length, 0xffff + 22);
  for (let i = 22; i <= maxComment; i++) {
    const at = data.length - i;
    if (at < 0) break;
    if (u32(view, at) === EOCD_SIGNATURE) return at;
  }
  return -1;
}

/**
 * Parses the archive directory.
 * @param {Uint8Array} data the whole file
 * @returns {{ entries: Array, byName: Map }}
 */
export function readZip(data) {
  if (!(data instanceof Uint8Array)) throw new Error('readZip expects the archive bytes.');
  if (data.length < 22) throw new Error('This file is too small to be a ZIP archive.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const eocd = findEndOfCentralDirectory(view, data);
  if (eocd < 0) throw new Error('No ZIP end-of-central-directory record was found — the file is not a ZIP archive (or is truncated).');

  let count = u16(view, eocd + 10);
  let centralOffset = u32(view, eocd + 16);

  // ZIP64: the 32-bit fields are saturated and the real values live in the
  // ZIP64 record the locator points at.
  if (centralOffset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    if (locator >= 0 && u32(view, locator) === EOCD64_LOCATOR) {
      const zip64At = Number(view.getBigUint64(locator + 8, true));
      if (zip64At >= 0 && zip64At + 56 <= data.length && u32(view, zip64At) === EOCD64_SIGNATURE) {
        count = Number(view.getBigUint64(zip64At + 32, true));
        centralOffset = Number(view.getBigUint64(zip64At + 48, true));
      }
    }
  }

  const entries = [];
  const byName = new Map();
  let at = centralOffset;

  for (let i = 0; i < count; i++) {
    if (at + 46 > data.length || u32(view, at) !== CENTRAL_SIGNATURE) break;
    const versionMadeBy = u16(view, at + 4);
    const flags = u16(view, at + 8);
    const method = u16(view, at + 10);
    const modTime = u16(view, at + 12);
    const modDate = u16(view, at + 14);
    const crc = u32(view, at + 16);
    let compressedSize = u32(view, at + 20);
    let uncompressedSize = u32(view, at + 24);
    const nameLength = u16(view, at + 28);
    const extraLength = u16(view, at + 30);
    const commentLength = u16(view, at + 32);
    const externalAttrs = u32(view, at + 38);
    let localOffset = u32(view, at + 42);
    const nameBytes = data.subarray(at + 46, at + 46 + nameLength);
    const name = decodeName(nameBytes, (flags & 0x800) !== 0);

    // Extra fields: ZIP64 (0x0001) carries the real sizes / offset, WinZip
    // AES (0x9901) the key strength and the real compression method.
    let aes = null;
    {
      const zip64 = uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff;
      let ex = at + 46 + nameLength;
      const exEnd = ex + extraLength;
      while (ex + 4 <= exEnd) {
        const id = u16(view, ex);
        const size = u16(view, ex + 2);
        if (id === 0x0001 && zip64) {
          let p = ex + 4;
          if (uncompressedSize === 0xffffffff) { uncompressedSize = Number(view.getBigUint64(p, true)); p += 8; }
          if (compressedSize === 0xffffffff) { compressedSize = Number(view.getBigUint64(p, true)); p += 8; }
          if (localOffset === 0xffffffff) { localOffset = Number(view.getBigUint64(p, true)); p += 8; }
        } else if (id === AES_EXTRA && size >= 7) {
          aes = { version: u16(view, ex + 4), strength: data[ex + 8], method: u16(view, ex + 9) };
        }
        ex += 4 + size;
      }
    }

    const entry = {
      name,
      nameBytes,
      flags,
      versionMadeBy,
      externalAttrs,
      modTime,
      modDate,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
      directory: name.endsWith('/'),
      encrypted: (flags & 1) !== 0,
      aes: method === AES_METHOD ? aes : null,
    };
    entries.push(entry);
    if (!entry.directory) byName.set(name, entry);
    at += 46 + nameLength + extraLength + commentLength;
  }

  if (!entries.length) throw new Error('The ZIP archive contains no entries.');
  const encrypted = entries.some((e) => e.encrypted && !e.directory);
  return {
    entries,
    byName,
    data,
    encrypted,
    password: encrypted ? zipPasswordOf(data) : null,
  };
}

/** True when the archive has protected entries and no password yet. */
export function zipNeedsPassword(zip) {
  return !!zip?.encrypted && zip.password == null;
}

/** How the archive is protected: 'aes256' / 'aes192' / 'aes128' / 'zipcrypto', or null. */
export function zipEncryptionOf(zip) {
  const e = zip?.entries.find((x) => x.encrypted && !x.directory);
  if (!e) return null;
  if (e.aes) return `aes${AES_KEY_BITS[e.aes.strength] || 256}`;
  return 'zipcrypto';
}
const AES_KEY_BITS = { 1: 128, 2: 192, 3: 256 };

/**
 * Tries `password` on the archive: the smallest protected entry is decrypted
 * and checked all the way (MAC / CRC), so a lucky check byte cannot pass a
 * wrong password. On success the archive — and every later readZip of the
 * same bytes — keeps the password. Returns whether it was right.
 */
export function unlockZip(zip, password) {
  const pw = String(password ?? '');
  const probe = zip.entries
    .filter((e) => e.encrypted && !e.directory)
    .sort((a, b) => a.compressedSize - b.compressedSize)[0];
  if (!probe) return true;
  try {
    readEntryWith(zip, probe, pw);
  } catch (err) {
    if (err instanceof ZipPasswordError) return false;
    throw err;
  }
  zip.password = pw;
  rememberZipPassword(zip.data, pw);
  return true;
}

/** The entry's stored bytes (still compressed, still encrypted). */
export function rawEntryData(zip, found) {
  const data = zip.data;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const at = found.localOffset;
  if (at + 30 > data.length || u32(view, at) !== LOCAL_SIGNATURE) {
    throw new Error(`The local header of "${found.name}" is missing or damaged.`);
  }
  const nameLength = u16(view, at + 26);
  const extraLength = u16(view, at + 28);
  const start = at + 30 + nameLength + extraLength;
  const end = start + found.compressedSize;
  if (end > data.length) throw new Error(`"${found.name}" runs past the end of the archive.`);
  return data.subarray(start, end);
}

/**
 * The entry's compressed bytes with any encryption taken off, and the
 * compression method they are in. Throws ZipPasswordError without the right
 * password.
 */
export function decryptedEntryData(zip, found, password = zip.password) {
  const raw = rawEntryData(zip, found);
  if (!found.encrypted) return { data: raw, method: found.method };
  if (password == null) throw new ZipPasswordError('needed');
  if (found.aes) {
    const out = aesDecrypt(raw, password, found.aes.strength, found.name);
    if (!out) throw new ZipPasswordError('wrong');
    return { data: out, method: found.aes.method };
  }
  if (found.method === AES_METHOD) {
    throw new Error(`"${found.name}" is AES encrypted but has no AES information.`);
  }
  // With a data descriptor (flag bit 3) the CRC was not known when the header
  // was written, so the check byte is the modification time's high byte.
  const check = found.flags & 8 ? (found.modTime >>> 8) & 255 : found.crc >>> 24;
  const out = zipCryptoDecrypt(raw, password, check);
  if (!out) throw new ZipPasswordError('wrong');
  return { data: out, method: found.method };
}

function readEntryWith(zip, found, password) {
  const { data, method } = decryptedEntryData(zip, found, password);
  let out;
  if (method === 0) out = data;
  else if (method === 8) {
    try {
      out = inflateRaw(data, { expectedSize: found.uncompressedSize });
    } catch (err) {
      // A ZipCrypto check byte matches one wrong password in 256: the data
      // then decrypts to noise, which does not inflate.
      if (found.encrypted && !found.aes) throw new ZipPasswordError('wrong');
      throw err;
    }
  } else {
    throw new Error(`"${found.name}" uses compression method ${method}, which this reader does not support.`);
  }
  // AE-2 entries store no CRC (the MAC covers them); everything else is checked.
  if (found.encrypted && !(found.aes && found.aes.version === 2) && crc32(out) !== found.crc) {
    if (!found.aes) throw new ZipPasswordError('wrong');
    throw new Error(`"${found.name}" is damaged (checksum mismatch).`);
  }
  return out;
}

/** Reads one entry's bytes, decrypting and inflating it as needed. */
export function readEntry(zip, entry) {
  const found = typeof entry === 'string' ? zip.byName.get(entry) : entry;
  if (!found) throw new Error(`The archive has no entry named "${entry}".`);
  return readEntryWith(zip, found, zip.password);
}

export function readEntryText(zip, entry) {
  return new TextDecoder('utf-8').decode(readEntry(zip, entry));
}

/** True when the bytes start with a local file header or an empty archive. */
export function looksLikeZip(data) {
  return !!data && data.length > 4 && data[0] === 0x50 && data[1] === 0x4b
    && (data[2] === 0x03 || data[2] === 0x05 || data[2] === 0x07);
}

/** Resolves "../images/a.png" against "OEBPS/text/ch1.xhtml" → "OEBPS/images/a.png". */
export function resolveZipPath(base, relative) {
  const target = String(relative || '').split(/[?#]/)[0];
  if (!target) return '';
  if (/^[a-z]+:/i.test(target)) return target;
  if (target.startsWith('/')) return target.slice(1);
  const baseParts = String(base || '').split('/');
  baseParts.pop();
  for (const part of target.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

/** Case-insensitive lookup — some EPUBs disagree with their own manifest. */
export function findEntry(zip, name) {
  if (!name) return null;
  const direct = zip.byName.get(name);
  if (direct) return direct;
  const decoded = (() => { try { return decodeURIComponent(name); } catch { return name; } })();
  if (zip.byName.has(decoded)) return zip.byName.get(decoded);
  const lower = decoded.toLowerCase();
  for (const entry of zip.entries) {
    if (!entry.directory && entry.name.toLowerCase() === lower) return entry;
  }
  return null;
}
