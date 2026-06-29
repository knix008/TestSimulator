import pg from 'pg';
import path from 'path';
import { convertPlaceholders, postgresSchema, ensureAdminUser, migrateThemeColumn, migrateEmailColumn } from '../schemas.js';

const { Pool } = pg;

export function createPostgresAdapter(config) {
  const poolConfig = {
    host: config.host,
    port: config.port || 5432,
    user: config.user,
    password: config.password,
    database: config.database,
    max: 10,
  };

  let pool = null;

  function getPool() {
    if (!pool) pool = new Pool(poolConfig);
    return pool;
  }

  async function run(sql, params = []) {
    const { sql: q, params: p } = convertPlaceholders(sql, params, 'postgresql');
    const result = await getPool().query(q, p);
    return result.rows;
  }

  const adapter = {
    dialect: 'postgresql',
    async testConnection() {
      const adminPool = new Pool({
        host: config.host,
        port: config.port || 5432,
        user: config.user,
        password: config.password,
        database: 'postgres',
      });
      try {
        await adminPool.query('SELECT 1');
        const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
        const existed = exists.rows.length > 0;
        if (!existed) {
          await adminPool.query(`CREATE DATABASE "${config.database}" ENCODING 'UTF8'`);
        }
        return { databaseExisted: existed, databaseCreated: !existed };
      } finally {
        await adminPool.end();
      }
    },
    async initSchema() {
      const adminPool = new Pool({
        host: config.host,
        port: config.port || 5432,
        user: config.user,
        password: config.password,
        database: 'postgres',
      });
      try {
        const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
        if (exists.rows.length === 0) {
          await adminPool.query(`CREATE DATABASE "${config.database}" ENCODING 'UTF8'`);
        }
      } finally {
        await adminPool.end();
      }

      if (pool) {
        await pool.end();
        pool = null;
      }

      for (const sql of postgresSchema()) {
        await getPool().query(sql);
      }

      await migrateThemeColumn(adapter, 'postgresql');
      await migrateEmailColumn(adapter, 'postgresql');
      const bcrypt = await import('bcryptjs');
      await ensureAdminUser(adapter, bcrypt.default);
    },
    async query(sql, params) {
      return run(sql, params);
    },
    async queryOne(sql, params) {
      const rows = await run(sql, params);
      return rows[0] ?? null;
    },
    async insert(sql, params) {
      const { sql: q, params: p } = convertPlaceholders(sql, params, 'postgresql');
      const returning = q.includes('RETURNING') ? q : `${q} RETURNING id`;
      const result = await getPool().query(returning, p);
      return result.rows[0]?.id;
    },
    async execute(sql, params) {
      const { sql: q, params: p } = convertPlaceholders(sql, params, 'postgresql');
      const result = await getPool().query(q, p);
      return { affectedRows: result.rowCount };
    },
    async close() {
      if (pool) {
        await pool.end();
        pool = null;
      }
    },
  };

  return adapter;
}
