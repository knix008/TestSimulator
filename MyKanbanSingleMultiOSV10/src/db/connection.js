const knex = require('knex');
const path = require('path');
const fs = require('fs');

let db = null;
let activeConfig = null;
let jsonMode = false;

function getDataPath() {
  if (process.env.KANBAN_DATA_PATH) return process.env.KANBAN_DATA_PATH;
  const dir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUploadsPath() {
  const dir = process.env.KANBAN_DATA_PATH
    ? path.join(process.env.KANBAN_DATA_PATH, 'uploads')
    : path.join(__dirname, '../../uploads');
  return ensureDir(dir);
}

function getConfigPath() {
  const dir = getDataPath();
  return path.join(dir, 'db-config.json');
}

function getJsonConfig(filename) {
  return {
    client: 'json',
    connection: { filename: filename || path.join(getDataPath(), 'workspace.json') },
  };
}

function getSqliteConfig(filename) {
  return {
    client: 'sqlite3',
    connection: { filename: filename || path.join(getDataPath(), 'kanban.db') },
    useNullAsDefault: true,
  };
}

function isJsonConfig(config) {
  return config?.client === 'json';
}

function getDefaultConfig() {
  const sqliteFile = path.join(getDataPath(), 'kanban.db');
  if (fs.existsSync(sqliteFile) && fs.statSync(sqliteFile).size > 0) {
    return getSqliteConfig(sqliteFile);
  }
  return getJsonConfig();
}

function jsonRuntimeConfig() {
  return {
    client: 'sqlite3',
    connection: { filename: path.join(getDataPath(), 'json-cache.db') },
    useNullAsDefault: true,
  };
}

async function loadDbConfig() {
  const cfgPath = getConfigPath();
  let config;

  if (fs.existsSync(cfgPath)) {
    try {
      config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch {
      config = getDefaultConfig();
    }
  } else {
    config = getDefaultConfig();
  }

  if (db) {
    try { await db.destroy(); } catch {}
  }

  activeConfig = config;
  jsonMode = isJsonConfig(config);
  const runtime = jsonMode ? jsonRuntimeConfig() : config;
  if (runtime.client === 'sqlite3') {
    ensureDir(path.dirname(path.resolve(runtime.connection.filename)));
  }
  db = knex(runtime);
  return db;
}

function getDb() {
  if (!db) throw new Error('DB가 초기화되지 않았습니다. loadDbConfig()를 먼저 호출하세요.');
  return db;
}

function getCurrentConfig() {
  const cfgPath = getConfigPath();
  if (fs.existsSync(cfgPath)) {
    try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
  }
  return activeConfig || getDefaultConfig();
}

function isJsonMode() {
  return jsonMode;
}

function getConnectionKey(config) {
  if (!config) return '';
  const client = config.client || 'sqlite3';
  const conn = config.connection || {};
  if (client === 'json') {
    const filename = path.resolve(conn.filename || path.join(getDataPath(), 'workspace.json'));
    return `json:${filename}`;
  }
  if (client === 'sqlite3' || client === 'better-sqlite3') {
    const filename = path.resolve(conn.filename || path.join(getDataPath(), 'kanban.db'));
    return `sqlite:${filename}`;
  }
  const host = conn.host || conn.server || '';
  const port = conn.port || '';
  return `${client}:${host}:${port}:${conn.database}:${conn.user}`;
}

async function updateDbConfig(config) {
  const oldDb = db;
  const oldKey = getConnectionKey(getCurrentConfig());
  const newKey = getConnectionKey(config);
  const shouldMigrateData = oldKey !== newKey;

  let snapshot = null;
  if (shouldMigrateData && oldDb) {
    try {
      const { exportDatabaseSnapshot } = require('./migrate-data');
      snapshot = await exportDatabaseSnapshot(oldDb);
    } catch (err) {
      console.warn('DB snapshot export failed:', err.message);
    }
  }

  const cfgPath = getConfigPath();
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
  await loadDbConfig();
  const { runMigrations, seedDefaultAdmin } = require('./migrate');
  await runMigrations(db);

  if (shouldMigrateData && snapshot?.hasData) {
    const { importDatabaseSnapshot } = require('./migrate-data');
    const result = await importDatabaseSnapshot(db, snapshot, {
      replace: isJsonConfig(config),
      keepIds: true,
    });
    if (result.imported) {
      await seedDefaultAdmin(db);
      if (isJsonConfig(config)) {
        const { persistJsonWorkspace } = require('./json-store');
        await persistJsonWorkspace();
      }
      return {
        migrated: true,
        users: result.users,
        boards: result.boards,
      };
    }
  }

  if (isJsonConfig(config)) {
    const { persistJsonWorkspace } = require('./json-store');
    await persistJsonWorkspace();
  }

  return { migrated: false };
}

function buildKnexConfig(formData) {
  const { dbType, host, port, database, username, password, filename } = formData;

  if (dbType === 'json') return getJsonConfig(filename);

  if (dbType === 'sqlite') return getSqliteConfig(filename);

  const clientMap = { mysql: 'mysql2', mariadb: 'mysql2', postgresql: 'pg', mssql: 'mssql' };
  const client = clientMap[dbType];
  if (!client) throw new Error(`지원하지 않는 DB 타입: ${dbType}`);

  const connection = { database, user: username, password };

  if (dbType === 'mssql') {
    connection.server = host;
    connection.port = parseInt(port) || 1433;
    connection.options = { encrypt: true, trustServerCertificate: true };
  } else {
    connection.host = host;
    connection.port = parseInt(port) || (dbType === 'postgresql' ? 5432 : 3306);
  }

  return { client, connection };
}

module.exports = {
  loadDbConfig, getDb, getCurrentConfig, updateDbConfig, buildKnexConfig,
  getDataPath, getUploadsPath, isJsonMode, isJsonConfig,
};
