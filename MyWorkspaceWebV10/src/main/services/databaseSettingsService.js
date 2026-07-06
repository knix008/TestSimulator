const path = require('path');
const fs = require('fs');
const { loadConfig, saveLocalConfig, getUserDataPaths, resolveSqlitePath } = require('../config');

const PROVIDERS = ['SQLite', 'MariaDB', 'MySQL', 'PostgreSQL', 'SqlServer'];

const DEFAULT_PORTS = {
  MariaDB: '3306',
  MySQL: '3306',
  PostgreSQL: '5432',
  SqlServer: '1433',
  SQLite: ''
};

function getDefaultSqlitePath() {
  return path.join(getUserDataPaths().root, 'myworkspace.db');
}

function normalizeProvider(provider) {
  const value = String(provider || 'SQLite');
  return PROVIDERS.includes(value) ? value : 'SQLite';
}

function readDatabaseSettings() {
  const config = loadConfig();
  const database = config?.Database || {};
  return {
    Provider: normalizeProvider(database.Provider),
    Server: database.Server || 'localhost',
    Port: database.Port || DEFAULT_PORTS[normalizeProvider(database.Provider)] || '',
    Database: database.Database || 'myworkspace',
    User: database.User || '',
    Password: database.Password || '',
    SqliteFilePath: database.SqliteFilePath || '',
    ConnectionDisabled: Boolean(database.ConnectionDisabled)
  };
}

function cloneSettings(settings) {
  return {
    Provider: normalizeProvider(settings.Provider),
    Server: settings.Server || 'localhost',
    Port: settings.Port || DEFAULT_PORTS[normalizeProvider(settings.Provider)] || '',
    Database: settings.Database || 'myworkspace',
    User: settings.User || '',
    Password: settings.Password || '',
    SqliteFilePath: settings.SqliteFilePath || '',
    ConnectionDisabled: Boolean(settings.ConnectionDisabled)
  };
}

function resolveSqliteFilePath(settings) {
  const configured = settings.SqliteFilePath?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(getUserDataPaths().root, configured);
  }
  return getDefaultSqlitePath();
}

function validateSettings(settings) {
  if (settings.Provider === 'SQLite') {
    if (!resolveSqliteFilePath(settings)) {
      return { ok: false, message: 'SQLite 파일 경로를 입력하세요.' };
    }
    return { ok: true };
  }

  if (!settings.Server?.trim() || !settings.Database?.trim()) {
    return { ok: false, message: '서버와 데이터베이스 이름을 입력하세요.' };
  }

  return { ok: true };
}

async function testSqliteConnection(settings) {
  const sqlitePath = resolveSqliteFilePath(settings);
  const existed = fs.existsSync(sqlitePath);
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const Database = require('better-sqlite3');
  const db = new Database(sqlitePath);
  try {
    db.prepare('SELECT 1').get();
    return { ok: true, databaseCreated: !existed };
  } finally {
    db.close();
  }
}

async function testMysqlConnection(settings) {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    return { ok: false, message: 'MySQL/MariaDB 연결 모듈(mysql2)이 설치되어 있지 않습니다.' };
  }

  const connection = await mysql.createConnection({
    host: settings.Server.trim(),
    port: Number.parseInt(settings.Port, 10) || 3306,
    user: settings.User.trim(),
    password: settings.Password,
    database: settings.Database.trim(),
    connectTimeout: 10000
  });

  try {
    await connection.query('SELECT 1');
    return { ok: true };
  } finally {
    await connection.end();
  }
}

async function testPostgresConnection(settings) {
  let pg;
  try {
    pg = require('pg');
  } catch {
    return { ok: false, message: 'PostgreSQL 연결 모듈(pg)이 설치되어 있지 않습니다.' };
  }

  const client = new pg.Client({
    host: settings.Server.trim(),
    port: Number.parseInt(settings.Port, 10) || 5432,
    user: settings.User.trim(),
    password: settings.Password,
    database: settings.Database.trim(),
    connectionTimeoutMillis: 10000
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    return { ok: true };
  } finally {
    await client.end();
  }
}

async function testConnection(settings, { createIfNotExists = false } = {}) {
  const normalized = cloneSettings(settings);
  const validation = validateSettings(normalized);
  if (!validation.ok) {
    return validation;
  }

  try {
    switch (normalized.Provider) {
      case 'SQLite':
        return await testSqliteConnection(normalized);
      case 'MariaDB':
      case 'MySQL':
        return await testMysqlConnection(normalized);
      case 'PostgreSQL':
        return await testPostgresConnection(normalized);
      case 'SqlServer':
        return {
          ok: false,
          message: 'Microsoft SQL Server 연결 테스트는 아직 Electron 버전에서 지원되지 않습니다.'
        };
      default:
        return { ok: false, message: '지원하지 않는 DB 유형입니다.' };
    }
  } catch (error) {
    return {
      ok: false,
      message: error?.message || '데이터베이스 연결에 실패했습니다.'
    };
  }
}

function saveDatabaseSettings(settings) {
  const normalized = cloneSettings(settings);
  normalized.ConnectionDisabled = false;
  saveLocalConfig({ Database: normalized });
  return normalized;
}

function disconnectDatabase() {
  const current = readDatabaseSettings();
  saveLocalConfig({
    Database: {
      ...current,
      ConnectionDisabled: true
    }
  });
}

function getProviderDisplayName(provider) {
  switch (normalizeProvider(provider)) {
    case 'MariaDB':
      return 'MariaDB';
    case 'MySQL':
      return 'MySQL';
    case 'PostgreSQL':
      return 'PostgreSQL';
    case 'SqlServer':
      return 'Microsoft SQL Server';
    case 'SQLite':
    default:
      return 'SQLite 3';
  }
}

function getConnectionStatus() {
  const settings = readDatabaseSettings();
  if (settings.ConnectionDisabled) {
    return { connected: false, message: 'disconnected' };
  }
  if (settings.Provider === 'SQLite') {
    return { connected: true, message: 'sqlite', provider: settings.Provider };
  }
  return { connected: true, message: 'external', provider: settings.Provider };
}

module.exports = {
  PROVIDERS,
  DEFAULT_PORTS,
  getDefaultSqlitePath,
  readDatabaseSettings,
  validateSettings,
  testConnection,
  saveDatabaseSettings,
  disconnectDatabase,
  getProviderDisplayName,
  getConnectionStatus,
  resolveSqliteFilePath
};
