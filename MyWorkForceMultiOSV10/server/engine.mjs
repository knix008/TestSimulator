import './quiet.mjs';
import { schemaFor } from './schema.mjs';

const KNOWN = new Set(['sqlite', 'mysql', 'mariadb', 'mssql', 'postgres']);

function fail(error, code = 'connect') {
  const next = new Error(code);
  next.detail = error?.message || String(error || '');
  return next;
}

async function load(name) {
  try {
    return await import(name);
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

export async function openEngine(config) {
  const engine = config?.engine || 'sqlite';
  if (!KNOWN.has(engine)) throw fail(new Error(engine), 'engine-unknown');
  try {
    if (engine === 'sqlite') {
      const { DatabaseSync } = await import('node:sqlite');
      const file = config.file || ':memory:';
      const db = new DatabaseSync(file);
      if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
      const opened = new SqliteEngine(db);
      for (const statement of schemaFor(engine)) await opened.exec(statement);
      return opened;
    }
    if (engine === 'mysql' || engine === 'mariadb') {
      const mysql = await load('mysql2/promise');
      const pool = mysql.createPool({
        host: config.host, port: Number(config.port) || 3306, user: config.user, password: config.password || '',
        database: config.database, connectionLimit: 4, charset: 'utf8mb4',
      });
      const opened = new MysqlEngine(pool, engine);
      for (const statement of schemaFor(engine)) await opened.exec(statement);
      return opened;
    }
    if (engine === 'postgres') {
      const pg = await load('pg');
      const pool = new pg.Pool({
        host: config.host, port: Number(config.port) || 5432, user: config.user, password: config.password || '',
        database: config.database, max: 4,
      });
      const opened = new PostgresEngine(pool);
      for (const statement of schemaFor(engine)) await opened.exec(statement);
      return opened;
    }
    const mssql = await load('mssql');
    const pool = await mssql.default.connect({
      server: config.host, port: Number(config.port) || 1433, user: config.user, password: config.password || '',
      database: config.database, options: { trustServerCertificate: true, encrypt: Boolean(config.encrypt) },
    });
    const opened = new MssqlEngine(pool, mssql.default);
    for (const statement of schemaFor(engine)) await opened.exec(statement);
    return opened;
  } catch (error) {
    if (error?.message === 'driver-missing' || error?.message === 'engine-unknown') throw error;
    throw fail(error);
  }
}
