import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'database.json');

export const SUPPORTED_DB_TYPES = ['mariadb', 'mysql', 'postgresql', 'sqlite3'];
export const DEFAULT_DB_TYPE = 'mariadb';

function buildDefaultConfig() {
  return {
    installed: false,
    type: DEFAULT_DB_TYPE,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'reqtracking',
    filename: './data/reqtracking.db',
  };
}

export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadDbConfig() {
  ensureConfigDir();
  const defaults = buildDefaultConfig();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...defaults };
  }
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...defaults };
  }
}

export function saveDbConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export function isDbInstalled() {
  return loadDbConfig().installed === true;
}

export function getDefaultPort(type) {
  switch (type) {
    case 'postgresql': return 5432;
    case 'sqlite3': return null;
    default: return 3306;
  }
}

export function normalizeDbConfig(input) {
  const type = SUPPORTED_DB_TYPES.includes(input.type) ? input.type : DEFAULT_DB_TYPE;
  const defaults = { ...buildDefaultConfig(), type };
  return {
    installed: !!input.installed,
    type,
    host: input.host || defaults.host,
    port: input.port ?? getDefaultPort(type),
    user: input.user || defaults.user,
    password: input.password ?? defaults.password,
    database: input.database || defaults.database,
    filename: input.filename || defaults.filename,
  };
}

export function getDefaultDbConfig() {
  return buildDefaultConfig();
}

export { CONFIG_FILE };
