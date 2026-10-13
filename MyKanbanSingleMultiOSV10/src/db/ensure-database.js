const knex = require('knex');
const path = require('path');
const fs = require('fs');

function sanitizeDbName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error('데이터베이스명은 영문, 숫자, 밑줄(_), 하이픈(-)만 사용할 수 있습니다.');
  }
  return trimmed;
}

function quoteIdentifier(client, name) {
  const safe = sanitizeDbName(name);
  if (client === 'mysql2') return `\`${safe.replace(/`/g, '``')}\``;
  if (client === 'pg') return `"${safe.replace(/"/g, '""')}"`;
  if (client === 'mssql') return `[${safe.replace(/]/g, ']]')}]`;
  return safe;
}

function isMissingDatabaseError(err, client) {
  const msg = (err?.message || '').toLowerCase();
  const code = err?.code || err?.errno || err?.number;

  if (client === 'mysql2') {
    return code === 'ER_BAD_DB_ERROR' || code === 1049 || msg.includes('unknown database');
  }
  if (client === 'pg') {
    return code === '3D000' || msg.includes('does not exist') && msg.includes('database');
  }
  if (client === 'mssql') {
    return code === 'ELOGIN' || code === 4060 || msg.includes('cannot open database');
  }
  return false;
}

async function databaseExists(adminDb, client, dbName) {
  const safe = sanitizeDbName(dbName);
  if (client === 'mysql2') {
    const result = await adminDb.raw('SHOW DATABASES');
    const rows = Array.isArray(result) ? (result[0] || result) : [];
    return rows.some((row) => {
      const value = row.Database || row.database || Object.values(row)[0];
      return String(value).toLowerCase() === safe.toLowerCase();
    });
  }
  if (client === 'pg') {
    const row = await adminDb('pg_database').where({ datname: safe }).first();
    return !!row;
  }
  if (client === 'mssql') {
    const row = await adminDb('sys.databases').where({ name: safe }).first();
    return !!row;
  }
  return false;
}

async function createDatabase(adminDb, client, dbName) {
  const id = quoteIdentifier(client, dbName);
  if (client === 'mysql2') {
    await adminDb.raw(
      `CREATE DATABASE ${id} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    return;
  }
  if (client === 'pg') {
    await adminDb.raw(`CREATE DATABASE ${id} ENCODING 'UTF8'`);
    return;
  }
  if (client === 'mssql') {
    await adminDb.raw(`IF DB_ID(N'${sanitizeDbName(dbName).replace(/'/g, "''")}') IS NULL CREATE DATABASE ${id}`);
  }
}

function buildAdminConfig(config) {
  const client = config.client;
  const conn = { ...config.connection };
  delete conn.database;

  if (client === 'pg') {
    conn.database = 'postgres';
  } else if (client === 'mssql') {
    conn.database = 'master';
  }

  return { ...config, connection: conn };
}

function ensureSqliteFileReady(config) {
  const filename = config?.connection?.filename;
  if (!filename) return { created: false };
  const dir = path.dirname(path.resolve(filename));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return { created: true };
  }
  if (!fs.existsSync(filename)) {
    return { created: true };
  }
  return { created: false };
}

async function ensureRemoteDatabase(config) {
  const client = config.client;
  const dbName = config.connection?.database;
  if (!dbName?.trim()) {
    throw new Error('데이터베이스명이 필요합니다.');
  }

  let adminDb;
  try {
    adminDb = knex(buildAdminConfig(config));
    if (await databaseExists(adminDb, client, dbName)) {
      return { created: false };
    }
    await createDatabase(adminDb, client, dbName);
    return { created: true };
  } finally {
    if (adminDb) try { await adminDb.destroy(); } catch {}
  }
}

async function ensureDatabaseReady(dbType, config) {
  if (dbType === 'sqlite' || config.client === 'sqlite3') {
    return ensureSqliteFileReady(config);
  }

  if (!['mysql', 'mariadb', 'postgresql', 'mssql'].includes(dbType)) {
    return { created: false };
  }

  let db;
  try {
    db = knex(config);
    await db.raw('SELECT 1 as result');
    return { created: false };
  } catch (err) {
    if (!isMissingDatabaseError(err, config.client)) throw err;
  } finally {
    if (db) try { await db.destroy(); } catch {}
  }

  return ensureRemoteDatabase(config);
}

module.exports = {
  ensureDatabaseReady,
  isMissingDatabaseError,
};
