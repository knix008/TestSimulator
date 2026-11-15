import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
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
