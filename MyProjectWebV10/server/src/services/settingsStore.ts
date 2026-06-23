import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseConfig, DbProvider } from '../config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '../../data/app-settings.json');

export interface StoredDatabaseSettings {
  provider: DbProvider;
  host: string;
  port: number;
  database: string;
  user: string;
  encryptedPassword: string;
  file?: string;
}

/** Local file stores DB connection settings only. User accounts live in mp_users. */
export interface AppSettings {
  database: StoredDatabaseSettings;
}

interface LegacyAppSettings extends AppSettings {
  admin?: {
    username: string;
    passwordHash: string;
  };
}

let cachedLegacyAdmin: { username: string; passwordHash: string } | null | undefined;

function getSecretKey(): Buffer {
  const secret = process.env.APP_SECRET ?? 'myproject-dev-secret-change-me';
  return scryptSync(secret, 'myproject-settings', 32);
}

export function encryptSecret(value: string): string {
  if (!value) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(value: string): string {
  if (!value) return '';
  const buffer = Buffer.from(value, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString('hex');
  return createHash('sha256').update(candidate).digest('hex') === createHash('sha256').update(hash).digest('hex');
}

function defaultDatabaseSettings(): StoredDatabaseSettings {
  return {
    provider: (process.env.DB_PROVIDER ?? 'mariadb') as DbProvider,
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'myproject',
    user: process.env.DB_USER ?? 'root',
    encryptedPassword: encryptSecret(process.env.DB_PASSWORD ?? ''),
    file: process.env.DB_FILE,
  };
}

function defaultSettings(): AppSettings {
  return { database: defaultDatabaseSettings() };
}

function normalizeSettings(raw: LegacyAppSettings): AppSettings {
  return {
    database: raw.database ?? defaultDatabaseSettings(),
  };
}

/** One-time legacy admin credentials captured before migration. */
export function readLegacyAdminCredentials(): { username: string; passwordHash: string } | null {
  if (cachedLegacyAdmin !== undefined) {
    return cachedLegacyAdmin;
  }

  if (!existsSync(SETTINGS_PATH)) {
    cachedLegacyAdmin = null;
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) as LegacyAppSettings;
    cachedLegacyAdmin = raw.admin?.username && raw.admin.passwordHash
      ? { username: raw.admin.username, passwordHash: raw.admin.passwordHash }
      : null;
    return cachedLegacyAdmin;
  } catch {
    cachedLegacyAdmin = null;
    return null;
  }
}

export function loadAppSettings(): AppSettings {
  if (!existsSync(SETTINGS_PATH)) {
    const settings = defaultSettings();
    saveAppSettings(settings);
    return settings;
  }

  const raw = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) as LegacyAppSettings;

  if (raw.admin?.username && raw.admin.passwordHash) {
    cachedLegacyAdmin = {
      username: raw.admin.username,
      passwordHash: raw.admin.passwordHash,
    };
  }

  const settings = normalizeSettings(raw);

  if (raw.admin) {
    saveAppSettings(settings);
  }

  return settings;
}

export function saveAppSettings(settings: AppSettings): void {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

export function toDatabaseConfig(settings: StoredDatabaseSettings): DatabaseConfig {
  return {
    provider: settings.provider,
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    password: decryptSecret(settings.encryptedPassword),
    file: settings.file,
  };
}

export function fromDatabaseConfig(config: DatabaseConfig, existingPassword?: string): StoredDatabaseSettings {
  return {
    provider: config.provider,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    encryptedPassword: config.password ? encryptSecret(config.password) : (existingPassword ?? ''),
    file: config.file,
  };
}

export function getSettingsPath(): string {
  return SETTINGS_PATH;
}
