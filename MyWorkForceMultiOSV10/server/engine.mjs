import './quiet.mjs';
import { alreadyExists, createTable, listTablesSql, MIGRATIONS, SCHEMA_VERSION, TABLES } from './schema.mjs';

const KNOWN = new Set(['sqlite', 'mysql', 'mariadb', 'mssql', 'postgres']);

function fail(error, code = 'connect') {
  const next = new Error(code);
  next.detail = error?.message || String(error || '');
  return next;
}

// Each driver is a literal import so the installer bundle (scripts/stage-runtime.mjs) carries it.
const DRIVERS = {
  'mysql2/promise': () => import('mysql2/promise'),
  pg: () => import('pg'),
  mssql: () => import('mssql'),
};

async function load(name) {
  try {
    return await DRIVERS[name]();
  } catch (error) {
    const missing = fail(error, 'driver-missing');
    missing.detail = name;
    throw missing;
  }
}

class SqliteEngine {
  constructor(db) { this.db = db; this.engine = 'sqlite'; }

  run(sql, params = []) {
    const statement = this.db.prepare(sql);
    if (/^\s*(select|with|pragma)\b/i.test(sql)) return statement.all(...params);
    statement.run(...params);
    return [];
  }

  async query(sql, params) { return this.run(sql, params); }
  async exec(sql) { this.db.exec(sql); }

  async transaction(fn) {
    this.db.exec('BEGIN');
    try {
      await fn((sql, params) => this.run(sql, params));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async close() { this.db.close(); }
}

class MysqlEngine {
  constructor(pool, engine) { this.pool = pool; this.engine = engine; }

  async query(sql, params = []) {
    const [rows] = await this.pool.query(sql, params);
    return Array.isArray(rows) ? rows : [];
  }

  async exec(sql) { await this.pool.query(sql); }

  async transaction(fn) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await fn(async (sql, params = []) => {
        const [rows] = await connection.query(sql, params);
        return Array.isArray(rows) ? rows : [];
      });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() { await this.pool.end(); }
}

class PostgresEngine {
  constructor(pool) { this.pool = pool; this.engine = 'postgres'; }

  text(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  async query(sql, params = []) {
    const result = await this.pool.query(this.text(sql), params);
    return result.rows || [];
  }

  async exec(sql) { await this.pool.query(sql); }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await fn(async (sql, params = []) => {
        const result = await client.query(this.text(sql), params);
        return result.rows || [];
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() { await this.pool.end(); }
}

class MssqlEngine {
  constructor(pool, sql) { this.pool = pool; this.sql = sql; this.engine = 'mssql'; }

  request(target, sql, params = []) {
    const request = target.request ? target.request() : new this.sql.Request(target);
    let index = 0;
    const text = sql.replace(/\?/g, () => `@p${index++}`);
    params.forEach((value, at) => request.input(`p${at}`, value));
    return request.query(text);
  }

  async query(sql, params = []) {
    const result = await this.request(this.pool, sql, params);
    return result.recordset || [];
  }

  async exec(sql) { await this.pool.request().query(sql); }

  async transaction(fn) {
    const transaction = new this.sql.Transaction(this.pool);
    await transaction.begin();
    try {
      await fn(async (sql, params = []) => {
        const result = await this.request(transaction, sql, params);
        return result.recordset || [];
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async close() { await this.pool.close(); }
}

/** The error a driver gives when the named database does not exist on the server. */
export function databaseMissing(error) {
  const code = String(error?.code || '');
  const number = Number(error?.errno || error?.number || error?.originalError?.info?.number || 0);
  if (code === 'ER_BAD_DB_ERROR' || number === 1049) return true;
  if (code === '3D000') return true;
  if (number === 4060) return true;
  return /unknown database|database ".+" does not exist|cannot open database/i.test(String(error?.message || ''));
}

/** A database name that is safe to put in CREATE DATABASE. */
export function validDatabaseName(name) {
  return /^[A-Za-z_][A-Za-z0-9_$-]{0,63}$/.test(String(name || ''));
}

async function connectTo(engine, config, database) {
  if (engine === 'mysql' || engine === 'mariadb') {
    const mysql = await load('mysql2/promise');
    const pool = mysql.createPool({
      host: config.host, port: Number(config.port) || 3306, user: config.user, password: config.password || '',
      database: database || undefined, connectionLimit: 4, charset: 'utf8mb4',
    });
    return new MysqlEngine(pool, engine);
  }
  if (engine === 'postgres') {
    const pg = await load('pg');
    const pool = new pg.Pool({
      host: config.host, port: Number(config.port) || 5432, user: config.user, password: config.password || '',
      database: database || undefined, max: 4,
    });
    return new PostgresEngine(pool);
  }
  const mssql = await load('mssql');
  const pool = await mssql.default.connect({
    server: config.host, port: Number(config.port) || 1433, user: config.user, password: config.password || '',
    database: database || undefined, options: { trustServerCertificate: true, encrypt: Boolean(config.encrypt) },
  });
  return new MssqlEngine(pool, mssql.default);
}

/** Creates the configured database on its server (connected through the server's default database). */
export async function createDatabase(config) {
  const engine = config?.engine || 'sqlite';
  if (engine === 'sqlite') return false;
  const name = config.database;
  if (!validDatabaseName(name)) throw fail(new Error(String(name || '')), 'database-name');
  let admin;
  try {
    admin = await connectTo(engine, config, engine === 'postgres' ? 'postgres' : (engine === 'mssql' ? 'master' : ''));
    if (engine === 'mysql' || engine === 'mariadb') await admin.exec(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    else if (engine === 'postgres') {
      const rows = await admin.query('SELECT 1 AS found FROM pg_database WHERE datname = ?', [name]);
      if (!rows.length) await admin.exec(`CREATE DATABASE "${name}" ENCODING 'UTF8'`);
    } else await admin.exec(`IF DB_ID(N'${name}') IS NULL CREATE DATABASE [${name}]`);
    return true;
  } catch (error) {
    if (['driver-missing', 'database-name'].includes(error?.message)) throw error;
    throw fail(error, 'database-create');
  } finally {
    if (admin) await admin.close().catch(() => {});
  }
}

async function tableNames(engine) {
  const rows = await engine.query(listTablesSql(engine.engine), []);
  return new Set(rows.map((row) => String(row.name ?? row.NAME ?? row.TABLE_NAME ?? '').toLowerCase()));
}

async function storedVersion(engine, present) {
  if (!present.has('app_meta')) return 0;
  const rows = await engine.query('SELECT meta_value FROM app_meta WHERE meta_key = ?', ['schema_version']);
  const value = Number(rows[0]?.meta_value);
  if (Number.isFinite(value) && value > 0) return value;
  // Databases made before the version row existed already have the version 1 tables.
  return present.has('workspace_document') ? 1 : 0;
}

async function writeVersion(engine, version) {
  await engine.transaction(async (query) => {
    await query('DELETE FROM app_meta WHERE meta_key = ?', ['schema_version']);
    await query('INSERT INTO app_meta (meta_key, meta_value) VALUES (?, ?)', ['schema_version', String(version)]);
  });
}

/** What is in the database compared with the schema this program needs. */
export async function inspectSchema(engine) {
  const present = await tableNames(engine);
  const version = await storedVersion(engine, present);
  const tables = [];
  for (const table of TABLES) {
    const exists = present.has(table.name);
    let rows = null;
    if (exists) {
      try {
        const counted = await engine.query(`SELECT COUNT(*) AS n FROM ${table.name}`, []);
        rows = Number(counted[0]?.n ?? Object.values(counted[0] || {})[0] ?? 0);
      } catch { rows = null; }
    }
    tables.push({ name: table.name, exists, rows });
  }
  const missing = tables.filter((table) => !table.exists).map((table) => table.name);
  const pending = MIGRATIONS.filter((step) => step.version > version).map((step) => ({ version: step.version, ko: step.ko, en: step.en }));
  return {
    engine: engine.engine,
    version,
    expected: SCHEMA_VERSION,
    tables,
    missing,
    pending,
    newer: version > SCHEMA_VERSION,
    ready: !missing.length && !pending.length && version <= SCHEMA_VERSION,
  };
}

/** Creates the missing tables and runs the steps after the stored version. Returns what it did. */
export async function ensureSchema(engine) {
  const present = await tableNames(engine);
  const created = [];
  for (const table of TABLES) {
    if (present.has(table.name)) continue;
    try {
      await engine.exec(createTable(engine.engine, table));
    } catch (error) {
      if (!alreadyExists(error)) throw fail(error, 'schema');
    }
    created.push(table.name);
  }
  const version = await storedVersion(engine, new Set([...present, ...created]));
  if (version > SCHEMA_VERSION) {
    const newer = new Error('schema-newer');
    newer.detail = `${version} > ${SCHEMA_VERSION}`;
    throw newer;
  }
  const applied = [];
  for (const step of MIGRATIONS) {
    if (step.version <= version) continue;
    for (const statement of step.statements(engine.engine)) {
      try {
        await engine.exec(statement);
      } catch (error) {
        if (!alreadyExists(error)) throw fail(error, 'schema');
      }
    }
    await writeVersion(engine, step.version);
    applied.push(step.version);
  }
  return { created, applied };
}

/**
 * Opens the engine. With `schema: false` the tables are left alone (the settings page inspects them first);
 * otherwise missing tables are created and the schema is brought up to date, so a first start just works.
 */
export async function openEngine(config) {
  const engine = config?.engine || 'sqlite';
  if (!KNOWN.has(engine)) throw fail(new Error(engine), 'engine-unknown');
  let opened;
  try {
    if (engine === 'sqlite') {
      const { DatabaseSync } = await import('node:sqlite');
      const file = config.file || ':memory:';
      const db = new DatabaseSync(file);
      if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
      opened = new SqliteEngine(db);
    } else {
      opened = await connectTo(engine, config, config.database);
      await opened.query('SELECT 1 AS ok', []);
    }
  } catch (error) {
    if (opened) await opened.close().catch(() => {});
    if (error?.message === 'driver-missing' || error?.message === 'engine-unknown') throw error;
    if (databaseMissing(error)) throw fail(error, 'database-missing');
    throw fail(error);
  }
  if (config.schema !== false) {
    try {
      opened.schemaChanges = await ensureSchema(opened);
    } catch (error) {
      await opened.close().catch(() => {});
      throw error;
    }
  }
  return opened;
}
