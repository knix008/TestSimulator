import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import mysql from 'mysql2/promise';
import pg from 'pg';
import sql from 'mssql';
import {
  buildDatabaseUrl,
  type DatabaseConfig,
  type DbProvider,
} from '../config/database.js';

export interface DatabaseApplyResult {
  databaseCreated: boolean;
  schemaApplied: boolean;
  message: string;
}

function validateDatabaseName(databaseName: string): void {
  if (!databaseName.trim()) {
    throw new Error('Database name is required.');
  }
  if (databaseName.length > 128) {
    throw new Error('Database name is too long.');
  }
  for (const character of databaseName) {
    if (/^[a-zA-Z0-9_.-]$/.test(character)) continue;
    throw new Error(`Database name contains invalid character: '${character}'`);
  }
}

function quoteMySqlIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

function quotePostgreSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteSqlServerIdentifier(identifier: string): string {
  return `[${identifier.replace(/]/g, ']]')}]`;
}

function sqliteDatabasePath(config: DatabaseConfig): string {
  return resolve((config.file ?? `./data/${config.database}.db`).trim());
}

async function sqliteDatabaseExists(config: DatabaseConfig): Promise<boolean> {
  const path = (config.file ?? `./data/${config.database}.db`).trim();
  if (path === ':memory:') return true;
  return existsSync(sqliteDatabasePath(config));
}

async function ensureSqliteDatabase(config: DatabaseConfig): Promise<boolean> {
  const path = (config.file ?? `./data/${config.database}.db`).trim();
  if (path === ':memory:') return false;

  const fullPath = sqliteDatabasePath(config);
  const directory = dirname(fullPath);
  mkdirSync(directory, { recursive: true });

  const existed = existsSync(fullPath);
  if (!existed) {
    writeFileSync(fullPath, '');
  }
  return !existed;
}

async function mySqlDatabaseExists(config: DatabaseConfig): Promise<boolean> {
  validateDatabaseName(config.database);
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    connectTimeout: 10_000,
  });

  try {
    const [rows] = await connection.query(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [config.database],
    );
    return Array.isArray(rows) && rows.length > 0;
  } finally {
    await connection.end();
  }
}

async function ensureMySqlDatabase(config: DatabaseConfig): Promise<boolean> {
  const existed = await mySqlDatabaseExists(config);
  if (existed) return false;

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    connectTimeout: 10_000,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${quoteMySqlIdentifier(config.database)}`);
    return true;
  } finally {
    await connection.end();
  }
}

async function postgreSqlDatabaseExists(config: DatabaseConfig): Promise<boolean> {
  validateDatabaseName(config.database);
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
    connectionTimeoutMillis: 10_000,
  });

  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
    return Boolean(result.rowCount && result.rowCount > 0);
  } finally {
    await client.end();
  }
}

async function ensurePostgreSqlDatabase(config: DatabaseConfig): Promise<boolean> {
  if (await postgreSqlDatabaseExists(config)) return false;

  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
    connectionTimeoutMillis: 10_000,
  });

  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${quotePostgreSqlIdentifier(config.database)}`);
    return true;
  } finally {
    await client.end();
  }
}

async function sqlServerDatabaseExists(config: DatabaseConfig): Promise<boolean> {
  validateDatabaseName(config.database);
  const pool = await sql.connect({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'master',
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
    connectionTimeout: 10_000,
  });

  try {
    const result = await pool
      .request()
      .input('name', sql.NVarChar, config.database)
      .query('SELECT 1 AS found FROM sys.databases WHERE name = @name');
    return result.recordset.length > 0;
  } finally {
    await pool.close();
  }
}

async function ensureSqlServerDatabase(config: DatabaseConfig): Promise<boolean> {
  if (await sqlServerDatabaseExists(config)) return false;

  const pool = await sql.connect({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'master',
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
    connectionTimeout: 10_000,
  });

  try {
    await pool.request().query(`CREATE DATABASE ${quoteSqlServerIdentifier(config.database)}`);
    return true;
  } finally {
    await pool.close();
  }
}

export async function databaseExists(config: DatabaseConfig): Promise<boolean> {
  switch (config.provider) {
    case 'sqlite':
      return sqliteDatabaseExists(config);
    case 'mariadb':
    case 'mysql':
      return mySqlDatabaseExists(config);
    case 'postgresql':
      return postgreSqlDatabaseExists(config);
    case 'sqlserver':
      return sqlServerDatabaseExists(config);
    default:
      throw new Error(`Unsupported database provider: ${config.provider satisfies never}`);
  }
}

export async function ensureDatabaseExists(config: DatabaseConfig): Promise<boolean> {
  switch (config.provider) {
    case 'sqlite':
      return ensureSqliteDatabase(config);
    case 'mariadb':
    case 'mysql':
      return ensureMySqlDatabase(config);
    case 'postgresql':
      return ensurePostgreSqlDatabase(config);
    case 'sqlserver':
      return ensureSqlServerDatabase(config);
    default:
      throw new Error(`Unsupported database provider: ${config.provider satisfies never}`);
  }
}

export async function testDatabaseConnection(config: DatabaseConfig): Promise<DatabaseApplyResult> {
  const exists = await databaseExists(config);

  switch (config.provider) {
    case 'sqlite':
      break;
    case 'mariadb':
    case 'mysql': {
      if (exists) {
        const connection = await mysql.createConnection({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          connectTimeout: 10_000,
        });
        await connection.ping();
        await connection.end();
      } else {
        const connection = await mysql.createConnection({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          connectTimeout: 10_000,
        });
        await connection.ping();
        await connection.end();
      }
      break;
    }
    case 'postgresql': {
      const client = new pg.Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: exists ? config.database : 'postgres',
        connectionTimeoutMillis: 10_000,
      });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      break;
    }
    case 'sqlserver': {
      const pool = await sql.connect({
        server: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: exists ? config.database : 'master',
        options: {
          encrypt: true,
          trustServerCertificate: true,
        },
        connectionTimeout: 10_000,
      });
      await pool.close();
      break;
    }
  }

  const message = exists
    ? `기존 데이터베이스 '${config.database}'에 연결되었습니다.`
    : `데이터베이스 '${config.database}'가 없습니다. 저장 및 적용 시 생성됩니다.`;

  return {
    databaseCreated: false,
    schemaApplied: false,
    message,
  };
}

export function getDefaultPort(provider: DbProvider): number {
  switch (provider) {
    case 'postgresql':
      return 5432;
    case 'sqlserver':
      return 1433;
    case 'sqlite':
      return 0;
    default:
      return 3306;
  }
}
