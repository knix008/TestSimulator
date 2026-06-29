import { loadDbConfig, saveDbConfig, normalizeDbConfig, isDbInstalled } from './config.js';
import { createMysqlAdapter } from './adapters/mysql.js';
import { createPostgresAdapter } from './adapters/postgres.js';
import { createSqliteAdapter } from './adapters/sqlite.js';
import { migrateThemeColumn, migrateEmailColumn, migrateMenuLayoutColumn, migrateLanguageColumn, migrateRequirementHistoryTable, ensureAdminUser } from './schemas.js';

let adapter = null;
let dbReady = false;
let connectionError = null;

export function createAdapter(config) {
  const normalized = normalizeDbConfig(config);
  switch (normalized.type) {
    case 'mysql':
    case 'mariadb':
      return createMysqlAdapter(normalized);
    case 'postgresql':
      return createPostgresAdapter(normalized);
    case 'sqlite3':
      return createSqliteAdapter(normalized);
    default:
      throw new Error(`Unsupported database type: ${normalized.type}`);
  }
}

async function verifyAdapter(activeAdapter) {
  await activeAdapter.queryOne('SELECT 1 AS ok');
}

function isMissingDatabaseError(err) {
  const msg = String(err?.message || err).toLowerCase();
  return msg.includes('unknown database')
    || msg.includes('does not exist')
    || err?.code === 'ER_BAD_DB_ERROR'
    || err?.code === '3D000';
}

export function getAdapter() {
  if (!dbReady || !adapter) {
    throw new Error(connectionError || 'Database is not connected');
  }
  return adapter;
}

export function isDbReady() {
  return isDbInstalled() && dbReady;
}

export function getConnectionError() {
  return connectionError;
}

export async function connectDatabase(config) {
  if (adapter) await adapter.close().catch(() => {});
  adapter = createAdapter(config);
  await verifyAdapter(adapter);
  dbReady = true;
  connectionError = null;
  return adapter;
}

export async function testDatabaseConnection(config) {
  const testAdapter = createAdapter(config);
  try {
    const result = await testAdapter.testConnection();
    return result ?? {};
  } finally {
    await testAdapter.close();
  }
}

export async function initDatabase() {
  const config = loadDbConfig();
  if (!config.installed) {
    dbReady = false;
    connectionError = null;
    return false;
  }
  try {
    if (adapter) await adapter.close().catch(() => {});
    adapter = createAdapter(config);
    try {
      await verifyAdapter(adapter);
    } catch (err) {
      if (!isMissingDatabaseError(err)) throw err;
      await adapter.initSchema();
    }
    await migrateThemeColumn(adapter, config.type === 'mysql' ? 'mysql' : config.type);
    await migrateEmailColumn(adapter, config.type === 'mysql' ? 'mysql' : config.type);
    await migrateMenuLayoutColumn(adapter, config.type === 'mysql' ? 'mysql' : config.type);
    await migrateLanguageColumn(adapter, config.type === 'mysql' ? 'mysql' : config.type);
    await migrateRequirementHistoryTable(adapter, config.type === 'mysql' ? 'mysql' : config.type);
    const bcrypt = await import('bcryptjs');
    await ensureAdminUser(adapter, bcrypt.default);
    dbReady = true;
    connectionError = null;
    return true;
  } catch (err) {
    dbReady = false;
    connectionError = err.message;
    adapter = null;
    throw err;
  }
}

export async function setupDatabase(config) {
  return reconfigureDatabase(config);
}

export async function reconfigureDatabase(config) {
  const normalized = normalizeDbConfig({ ...config, installed: true });
  const newAdapter = createAdapter(normalized);
  await newAdapter.initSchema();
  await newAdapter.close();
  saveDbConfig(normalized);
  adapter = createAdapter(normalized);
  await verifyAdapter(adapter);
  dbReady = true;
  connectionError = null;
  return normalized;
}

export function getDbInfo() {
  const config = loadDbConfig();
  return {
    installed: config.installed,
    ready: dbReady,
    connectionError,
    type: config.type,
    host: config.host,
    port: config.port,
    database: config.database,
    filename: config.filename,
  };
}

export function getDbConfigForAdmin() {
  const config = loadDbConfig();
  return {
    installed: config.installed,
    ready: dbReady,
    type: config.type,
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    filename: config.filename,
    hasPassword: !!config.password,
  };
}

export async function query(sql, params = []) {
  return getAdapter().query(sql, params);
}

export async function queryOne(sql, params = []) {
  return getAdapter().queryOne(sql, params);
}

export async function insert(sql, params = []) {
  return getAdapter().insert(sql, params);
}

export async function execute(sql, params = []) {
  return getAdapter().execute(sql, params);
}

export function now() {
  return new Date();
}

export { isDbInstalled, loadDbConfig, normalizeDbConfig };
