import {
  clearDbConfig,
  isExternalConfig,
  loadDbConfig,
  saveDbConfig,
  setConfigPath,
} from './configStore.js';
import { sanitizeConfigForClient } from './constants.js';
import {
  checkKnexSchema,
  closeKnexDatabase,
  connectKnex,
  getActiveExternalConfig,
  getKnexDatabase,
  isKnexConnected,
} from './knexRuntime.js';
import {
  closeSqliteDatabase,
  getSqliteDatabase,
  getSqliteDatabasePath,
  initSqliteDatabase,
  isSqliteReady,
} from './sqlite.js';

let dataDir = null;
let mode = null; // 'sqlite' | 'external'

export function setDataDir(dir) {
  dataDir = dir;
  setConfigPath(dir);
}

export async function initDatabase(dir = dataDir) {
  if (!dir) throw new Error('DATA_DIR is not set');
  setDataDir(dir);

  const config = loadDbConfig();
  if (isExternalConfig(config)) {
    try {
      await connectKnex(config);
      mode = 'external';
      return getDatabase();
    } catch (err) {
      console.warn('[db] External DB connection failed, falling back to SQLite:', err.message);
    }
  }

  await initSqliteDatabase(dir);
  mode = 'sqlite';
  return getDatabase();
}

export function getDatabase() {
  if (mode === 'external' && isKnexConnected()) {
    return getKnexDatabase();
  }
  if (isSqliteReady()) {
    return getSqliteDatabase();
  }
  throw new Error('Database is not initialized');
}

export function isDatabaseReady() {
  return (mode === 'external' && isKnexConnected()) || isSqliteReady();
}

export function getDatabaseInfo() {
  const config = loadDbConfig();
  if (mode === 'external' && isKnexConnected()) {
    const active = getActiveExternalConfig();
    return {
      mode: 'external',
      provider: active?.provider || config.provider,
      server: active?.server || config.server,
      port: active?.port || config.port,
      database: active?.database || config.database,
      username: active?.username || config.username,
      path: null,
      configured: true,
      connected: true,
    };
  }

  return {
    mode: 'sqlite',
    provider: 'sqlite',
    server: null,
    port: null,
    database: null,
    username: null,
    path: getSqliteDatabasePath(),
    configured: isExternalConfig(config),
    connected: isSqliteReady(),
  };
}

export function getDatabasePath() {
  const info = getDatabaseInfo();
  if (info.mode === 'external') {
    return `${info.provider}://${info.server}:${info.port}/${info.database}`;
  }
  return info.path;
}

export async function connectExternalDatabase(input) {
  const current = loadDbConfig();
  const config = {
    enabled: true,
    provider: input.provider || 'mariadb',
    server: input.server?.trim(),
    port: Number(input.port) || 0,
    database: input.database?.trim(),
    username: input.username?.trim(),
    password: input.password ?? current.password ?? '',
  };

  if (!config.server || !config.database || !config.username) {
    throw new Error('서버, 데이터베이스, 사용자명은 필수입니다.');
  }

  await closeKnexDatabase();
  await connectKnex(config);
  saveDbConfig(config);
  mode = 'external';
  return {
    connected: true,
    schemaReady: await checkKnexSchema(),
    config: sanitizeConfigForClient(config),
  };
}

export async function disconnectExternalDatabase() {
  await closeKnexDatabase();
  clearDbConfig();
  if (!isSqliteReady()) {
    await initSqliteDatabase(dataDir);
  }
  mode = 'sqlite';
  return { connected: true, mode: 'sqlite' };
}

export async function initExternalSchema() {
  if (!isKnexConnected()) {
    throw new Error('외부 DB에 연결되어 있지 않습니다.');
  }
  const config = loadDbConfig();
  await connectKnex(config);
  return { schemaReady: await checkKnexSchema() };
}

export function getDbSettingsStatus() {
  const config = loadDbConfig();
  return {
    mode: mode || (isExternalConfig(config) ? 'external' : 'sqlite'),
    connected: isDatabaseReady(),
    schemaReady: isDatabaseReady(),
    configured: isExternalConfig(config),
    config: sanitizeConfigForClient(config),
    info: getDatabaseInfo(),
  };
}

export async function closeDatabase() {
  await closeKnexDatabase();
  closeSqliteDatabase();
  mode = null;
}
