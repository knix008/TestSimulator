import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDatabaseSettings } from '../src/services/databaseManager.js';
import {
  encryptSecret,
  loadAppSettings,
  saveAppSettings,
  toDatabaseConfig,
} from '../src/services/settingsStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '../data/app-settings.json');

async function main() {
  const password = process.env.SYNC_DB_PASSWORD;
  if (password === undefined) {
    console.error('SYNC_DB_PASSWORD is not set.');
    process.exit(1);
  }

  const settings = loadAppSettings();
  settings.database.encryptedPassword = encryptSecret(password);
  saveAppSettings(settings);

  const config = toDatabaseConfig(settings.database);
  config.password = password;

  console.log(`Updating web DB settings for ${config.user}@${config.host}/${config.database} ...`);
  const result = await applyDatabaseSettings(config, { persist: true });
  console.log(result.message);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
