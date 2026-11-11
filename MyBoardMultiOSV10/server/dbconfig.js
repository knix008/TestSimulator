// Persisted database configuration: <dataDir>/database.json, the password encrypted (AES-256-GCM) with a
// per-install key file <dataDir>/database.key (created on first save, readable by the user only).
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const FILE = 'database.json';
const KEY = 'database.key';

function key(dataDir, create) {
  const f = path.join(dataDir, KEY);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  if (!create) return null;
  const k = randomBytes(32);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(f, k, { mode: 0o600 });
  return k;
}

/** @returns {object|null} the stored config with the password decrypted */
export function loadDbConfig(dataDir) {
  const f = path.join(dataDir, FILE);
  if (!fs.existsSync(f)) return null;
  const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (cfg.password && typeof cfg.password === 'object') {
    const k = key(dataDir, false);
    if (!k) throw new Error('database.key is missing; the stored password cannot be read');
    const { iv, tag, data } = cfg.password;
    const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    cfg.password = Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  }
  return cfg;
}

/** Store a config (password encrypted). Pass null to remove it (back to the default SQLite file). */
export function saveDbConfig(dataDir, cfg) {
  const f = path.join(dataDir, FILE);
  if (!cfg) { if (fs.existsSync(f)) fs.unlinkSync(f); return; }
  const out = { ...cfg };
  delete out.pglite;
  if (out.password) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key(dataDir, true), iv);
    const data = Buffer.concat([c.update(String(out.password), 'utf8'), c.final()]);
    out.password = { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(out, null, 2), { mode: 0o600 });
}

/** The config without secrets, for GET /db/config. */
export function publicDbConfig(cfg, info) {
  const { password, pglite, ...rest } = cfg || {};
  return { ...rest, hasPassword: !!password, label: info?.label, type: info?.type || rest.type || 'sqlite' };
}
