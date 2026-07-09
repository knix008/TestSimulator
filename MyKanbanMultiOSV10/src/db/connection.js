const knex = require('knex');
const path = require('path');
const fs = require('fs');

let db = null;

function getDataPath() {
  if (process.env.KANBAN_DATA_PATH) return process.env.KANBAN_DATA_PATH;
  const dir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getConfigPath() {
  const dir = getDataPath();
  return path.join(dir, 'db-config.json');
}

function getDefaultConfig() {
  const dbFile = path.join(getDataPath(), 'kanban.db');
  return {
    client: 'sqlite3',
    connection: { filename: dbFile },
    useNullAsDefault: true
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

  db = knex(config);
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
  return getDefaultConfig();
}

async function updateDbConfig(config) {
  const cfgPath = getConfigPath();
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
  await loadDbConfig();
  const { runMigrations } = require('./migrate');
  await runMigrations(db);
}

function buildKnexConfig(formData) {
  const { dbType, host, port, database, username, password, filename } = formData;

  if (dbType === 'sqlite') {
    return {
      client: 'sqlite3',
      connection: { filename: filename || path.join(getDataPath(), 'kanban.db') },
      useNullAsDefault: true
    };
  }

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

module.exports = { loadDbConfig, getDb, getCurrentConfig, updateDbConfig, buildKnexConfig, getDataPath };
