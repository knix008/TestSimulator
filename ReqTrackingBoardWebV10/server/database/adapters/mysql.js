import mysql from 'mysql2/promise';
import { convertPlaceholders, mysqlSchema, ensureAdminUser, migrateThemeColumn, migrateEmailColumn, migrateMenuLayoutColumn, migrateLanguageColumn, migrateRequirementHistoryTable } from '../schemas.js';

function serverConfigFrom(config) {
  return {
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    password: config.password,
    charset: 'utf8mb4',
  };
}

async function ensureMysqlDatabase(conn, database) {
  await conn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}

async function mysqlDatabaseExists(conn, database) {
  const [rows] = await conn.execute(
    'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [database]
  );
  return rows.length > 0;
}

export function createMysqlAdapter(config) {
  const dialect = config.type === 'mysql' ? 'mysql' : 'mariadb';
  const database = config.database;
  const serverConfig = serverConfigFrom(config);
  const poolConfig = { ...serverConfig, database, waitForConnections: true, connectionLimit: 10 };

  let pool = null;

  async function getPool() {
    if (!pool) pool = mysql.createPool(poolConfig);
    return pool;
  }

  async function exec(sql, params = []) {
    const { sql: q, params: p } = convertPlaceholders(sql, params, 'mysql');
    const [result] = await (await getPool()).execute(q, p);
    return result;
  }

  const adapter = {
    dialect,
    async testConnection() {
      const conn = await mysql.createConnection(serverConfig);
      try {
        await conn.ping();
        const existed = await mysqlDatabaseExists(conn, database);
        if (!existed) {
          await ensureMysqlDatabase(conn, database);
        }
        return { databaseExisted: existed, databaseCreated: !existed };
      } finally {
        await conn.end();
      }
    },
    async initSchema() {
      const conn = await mysql.createConnection(serverConfig);
      try {
        await ensureMysqlDatabase(conn, database);
        await conn.changeUser({ database });
        const statements = mysqlSchema(database);
        for (let i = 1; i < statements.length; i++) {
          await conn.execute(statements[i]);
        }
      } finally {
        await conn.end();
      }
      pool = null;
      await migrateThemeColumn(adapter, dialect);
      await migrateEmailColumn(adapter, dialect);
      await migrateMenuLayoutColumn(adapter, dialect);
      await migrateLanguageColumn(adapter, dialect);
      await migrateRequirementHistoryTable(adapter, dialect);
      const bcrypt = await import('bcryptjs');
      await ensureAdminUser(adapter, bcrypt.default);
    },
    async query(sql, params = []) {
      const result = await exec(sql, params);
      return Array.isArray(result) ? result : [];
    },
    async queryOne(sql, params = []) {
      const rows = await adapter.query(sql, params);
      return rows[0] ?? null;
    },
    async insert(sql, params = []) {
      const result = await exec(sql, params);
      return result.insertId;
    },
    async execute(sql, params = []) {
      return exec(sql, params);
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
