// Password-protected ZIP entries — both kinds real archives use:
//
//   ZipCrypto  the original PKWARE "traditional" encryption (general flag
//              bit 0, a 12-byte header in front of the data). Weak, but it is
//              what Windows Explorer writes and the only kind it opens.
//   WinZip AES method 99 with an 0x9901 extra field: PBKDF2-HMAC-SHA1 keys,
//              AES-128/192/256 in little-endian counter mode, and a 10-byte
//              HMAC-SHA1 code over the encrypted data (AE-1 / AE-2). 7-Zip,
//              WinZip, WinRAR and Bandizip all write it.
//
// Everything here is synchronous plain JavaScript (see pdf-crypto-core.js for
// why), and works on the bytes of one entry: the reader (zip.js) and the
// writer (zip-write.js) do the archive structure.
import {
  aesCtrWinZip, hmacSha1, pbkdf2Sha1, randomBytes, bytesEqual, concatBytes,
} from '../pdf-crypto-core.js';

// ── CRC-32 (ZIP's checksum, and the heart of ZipCrypto's key schedule) ──

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(data, crc = 0) {
  let c = ~crc;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

const crcByte = (c, b) => CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);

// Passwords are UTF-8, as 7-Zip and WinZip write them for AES and modern
// tools for ZipCrypto.
export const passwordBytes = (pw) => new TextEncoder().encode(String(pw ?? ''));

/** Thrown when an entry needs a password the archive was not given, or a wrong one. */
export class ZipPasswordError extends Error {
  constructor(reason = 'needed', message = '') {
    super(message || (reason === 'wrong'
      ? 'The password for this ZIP archive is not correct.'
      : 'This ZIP archive is password protected.'));
    this.name = 'ZipPasswordError';
    this.reason = reason;   // 'needed' | 'wrong'
  }
}

// ── ZipCrypto ──

function zipCryptoKeys(password) {
  const k = new Int32Array([0x12345678, 0x23456789, 0x34567890]);
  for (const b of passwordBytes(password)) updateKeys(k, b);
  return k;
}

function updateKeys(k, b) {
  k[0] = crcByte(k[0], b);
  k[1] = (Math.imul((k[1] + (k[0] & 255)) | 0, 134775813) + 1) | 0;
  k[2] = crcByte(k[2], k[1] >>> 24);
}

function streamByte(k) {
  const t = (k[2] | 2) & 0xffff;
  return (Math.imul(t, t ^ 1) >>> 8) & 255;
}

/**
 * Decrypts a ZipCrypto entry's raw data (12-byte header + data).
 * `check` is the byte the header must end with: the CRC's high byte, or the
 * modification time's high byte when the sizes come in a data descriptor.
 * Returns the still-compressed data, or null when the password is wrong.
 */
export function zipCryptoDecrypt(raw, password, check) {
  if (raw.length < 12) return null;
  const k = zipCryptoKeys(password);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] ^ streamByte(k);
    updateKeys(k, c);
    out[i] = c;
  }
  if (out[11] !== check) return null;
  return out.subarray(12);
}

/** Encrypts compressed data with ZipCrypto; `crc` is the plain data's CRC-32. */
export function zipCryptoEncrypt(data, password, crc) {
  const head = randomBytes(12);
  head[11] = crc >>> 24;
  const plain = concatBytes(head, data);
  const k = zipCryptoKeys(password);
  const out = new Uint8Array(plain.length);
  for (let i = 0; i < plain.length; i++) {
    const c = plain[i];
    out[i] = c ^ streamByte(k);
    updateKeys(k, c);
  }
  return out;
}

// ── WinZip AES ──

export const AES_STRENGTH = { 1: 16, 2: 24, 3: 32 };   // strength → key bytes
const saltLength = (keyLen) => keyLen / 2;

function aesKeys(password, salt, keyLen) {
  const dk = pbkdf2Sha1(passwordBytes(password), salt, 1000, 2 * keyLen + 2);
  return { enc: dk.subarray(0, keyLen), mac: dk.subarray(keyLen, 2 * keyLen), verify: dk.subarray(2 * keyLen) };
}

/**
 * Decrypts a WinZip AES entry's raw data (salt + verifier + data + MAC).
 * Returns the still-compressed data, or null when the password is wrong.
 * A matching verifier with a broken MAC means a damaged file, which throws.
 */
export function aesDecrypt(raw, password, strength, name = '') {
  const keyLen = AES_STRENGTH[strength];
  if (!keyLen) throw new Error(`"${name}" uses an unknown AES strength (${strength}).`);
  const sl = saltLength(keyLen);
  if (raw.length < sl + 2 + 10) return null;
  const salt = raw.subarray(0, sl);
  const keys = aesKeys(password, salt, keyLen);
  if (!bytesEqual(keys.verify, raw.subarray(sl, sl + 2), 2)) return null;
  const body = raw.subarray(sl + 2, raw.length - 10);
  const mac = hmacSha1(keys.mac, body).subarray(0, 10);
  if (!bytesEqual(mac, raw.subarray(raw.length - 10), 10)) {
    throw new Error(`"${name}" is damaged (its AES authentication code does not match).`);
  }
  return aesCtrWinZip(keys.enc, body);
}

/** Encrypts compressed data with WinZip AES (strength 3 = AES-256). */
export function aesEncrypt(data, password, strength = 3) {
  const keyLen = AES_STRENGTH[strength];
  const salt = randomBytes(saltLength(keyLen));
  const keys = aesKeys(password, salt, keyLen);
  const body = aesCtrWinZip(keys.enc, data);
  const mac = hmacSha1(keys.mac, body).subarray(0, 10);
  return concatBytes(salt, keys.verify, body, mac);
}

// ── What the saved file is protected with ──

/** The encryption names the save dialog offers for an archive. */
export const ZIP_ENCRYPTION = ['aes256', 'zipcrypto'];
