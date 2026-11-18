import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'mwf1:';
const FIELDS = ['name', 'login', 'email', 'phone', 'jobTitle', 'team', 'photo'];

export function loadPrivacyKey(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'privacy.key');
  if (existsSync(file)) {
    const saved = readFileSync(file);
    if (saved.length === 32) return saved;
  }
  const key = randomBytes(32);
  writeFileSync(file, key, { mode: 0o600 });
  return key;
}

/** A short name for a key, to compare two data services without showing the key: "3fa2-91c0-…". */
export function keyFingerprint(key) {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return hex.match(/.{4}/g).join('-');
}

/** A key typed or pasted by the administrator (base64 or hex of 32 bytes). */
export function parseKey(text) {
  const value = String(text || '').trim();
  let key = null;
  if (/^[0-9a-f]{64}$/i.test(value)) key = Buffer.from(value, 'hex');
  else if (/^[A-Za-z0-9+/=_-]{43,44}$/.test(value)) key = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!key || key.length !== 32) throw new Error('key-invalid');
  return key;
}

/**
 * The key a database is sealed with. A database on its own server may already be sealed by another data
 * service: its key is imported once and kept here per database (keys.json); everything else uses this
 * service's own key (privacy.key).
 */
export function keyFor(dir, store) {
  try {
    const ring = JSON.parse(readFileSync(join(dir, 'keys.json'), 'utf8'));
    if (ring[store]) return parseKey(ring[store]);
  } catch { /* no imported keys */ }
  return loadPrivacyKey(dir);
}

export function rememberKeyFor(dir, store, key) {
  let ring = {};
  try { ring = JSON.parse(readFileSync(join(dir, 'keys.json'), 'utf8')); } catch { /* first one */ }
  ring[store] = Buffer.from(key).toString('base64');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'keys.json'), JSON.stringify(ring, null, 2), { mode: 0o600 });
}

const CHECK = 'myworkforce-key-check';
export const sealCheck = (key) => seal(CHECK, key);
/** Does this key open the database's check value? */
export function checkMatches(sealed, key) {
  try { return openValue(sealed, key) === CHECK; } catch { return false; }
}

export function seal(value, key) {
  const text = value == null ? '' : String(value);
  if (!text || text.startsWith(PREFIX) || !key) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, body]).toString('base64');
}

export function openValue(value, key) {
  const text = value == null ? '' : String(value);
  if (!text.startsWith(PREFIX) || !key) return text;
  const packed = Buffer.from(text.slice(PREFIX.length), 'base64');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const body = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

export function sealUsers(users, key) {
  for (const user of users || []) {
    for (const field of FIELDS) {
      if (user[field]) user[field] = seal(user[field], key);
    }
  }
}

export function openUsers(users, key) {
  for (const user of users || []) {
    for (const field of FIELDS) {
      if (user[field]) user[field] = openValue(user[field], key);
    }
  }
}
