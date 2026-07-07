import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DB_CONFIG } from './constants.js';

const CONFIG_FILE = 'db-config.json';

let configPath = null;

export function setConfigPath(dataDir) {
  configPath = path.join(dataDir, CONFIG_FILE);
}

export function loadDbConfig() {
  if (!configPath || !fs.existsSync(configPath)) {
    return { ...DEFAULT_DB_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...DEFAULT_DB_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_DB_CONFIG };
  }
}

export function saveDbConfig(config) {
  if (!configPath) throw new Error('Config path is not set');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export function clearDbConfig() {
  if (!configPath || !fs.existsSync(configPath)) return;
  fs.unlinkSync(configPath);
}

export function isExternalConfig(config) {
  return Boolean(
    config?.enabled
    && config?.provider
    && config.provider !== 'sqlite'
    && config.server
    && config.database
    && config.username,
  );
}
