import knexFactory from 'knex';
import { defaultPortFor } from './constants.js';
import { ensureSchema, ensureSeedData, hasSchema } from './schema.js';

let activeKnex = null;
let activeConfig = null;

const VALID_DB_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function clientNameFor(provider) {
  switch (provider) {
    case 'mysql':
    case 'mariadb':
      return 'mysql2';
    case 'postgresql':
      return 'pg';
    case 'mssql':
      return 'mssql';
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

function baseConnection(config, database) {
  switch (config.provider) {
    case 'mysql':
    case 'mariadb':
      return {
        host: config.server,
        port: config.port || defaultPortFor(config.provider),
        user: config.username,
        password: config.password,
        database,
      };
    case 'postgresql':
      return {
        host: config.server,
        port: config.port || defaultPortFor(config.provider),
        user: config.username,
        password: config.password,
        database,
      };
    case 'mssql':
      return {
        server: config.server,
        port: config.port || defaultPortFor(config.provider),
        user: config.username,
        password: config.password,
        database,
        options: { trustServerCertificate: true, encrypt: false },
      };
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

function buildKnexConfig(config, database) {
  return {
    client: clientNameFor(config.provider),
    connection: baseConnection(config, database),
    pool: { min: 0, max: 10 },
  };
}

async function ensureDatabaseExists(config) {
  if (!VALID_DB_NAME.test(config.database)) {
    throw new Error(`데이터베이스명은 영문/숫자/밑줄(_)만 사용할 수 있습니다: ${config.database}`);
  }

  if (config.provider === 'mysql' || config.provider === 'mariadb') {
    const admin = knexFactory(buildKnexConfig(config, undefined));
    try {
      await admin.raw('CREATE DATABASE IF NOT EXISTS ??', [config.database]);
    } finally {
      await admin.destroy();
    }
    return;
  }

  if (config.provider === 'postgresql') {
    const admin = knexFactory(buildKnexConfig(config, 'postgres'));
    try {
      const result = await admin.raw('SELECT 1 FROM pg_database WHERE datname = ?', [config.database]);
      if (result.rows.length === 0) {
        await admin.raw(`CREATE DATABASE "${config.database}"`);
      }
    } finally {
      await admin.destroy();
    }
    return;
  }

  if (config.provider === 'mssql') {
    const admin = knexFactory(buildKnexConfig(config, 'master'));
    try {
      await admin.raw(
        `IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'${config.database}') CREATE DATABASE [${config.database}]`,
      );
    } finally {
      await admin.destroy();
    }
  }
}

function adaptSql(sql, client) {
  let adapted = sql.replace(/datetime\('now'\)/gi, client === 'mssql' ? 'GETDATE()' : 'CURRENT_TIMESTAMP');
  adapted = adapted.replace(/\s+COLLATE NOCASE/gi, '');
  adapted = adapted.replace(/username = \?/gi, 'LOWER(username) = LOWER(?)');

  if (client === 'pg' && /^\s*INSERT/i.test(adapted) && !/RETURNING/i.test(adapted)) {
    adapted = adapted.replace(/;?\s*$/i, ' RETURNING id');
  }

  if (client === 'mssql' && /^\s*INSERT/i.test(adapted) && !/OUTPUT\s+INSERTED/i.test(adapted)) {
    adapted = adapted.replace(/VALUES\s*\(/i, 'OUTPUT INSERTED.id VALUES (');
  }

  return adapted;
}

function normalizeRows(result, client) {
  if (client === 'mysql2') return result[0];
  if (client === 'pg') return result.rows;
  if (client === 'mssql') return Array.isArray(result) ? result : result.recordset || [];
  return result;
}

function normalizeGet(result, client) {
  const rows = normalizeRows(result, client);
  return Array.isArray(rows) ? rows[0] : rows;
}

function normalizeAll(result, client) {
  return normalizeRows(result, client) || [];
}

function normalizeRun(result, client, sql) {
  if (client === 'mysql2') {
    const packet = result[0];
    return {
      lastInsertRowid: packet?.insertId ?? 0,
      changes: packet?.affectedRows ?? 0,
    };
  }
  if (client === 'pg') {
    if (/RETURNING/i.test(sql)) {
      return {
        lastInsertRowid: result.rows?.[0]?.id ?? 0,
        changes: result.rowCount ?? 0,
      };
    }
    return { lastInsertRowid: 0, changes: result.rowCount ?? 0 };
  }
  if (client === 'mssql') {
    const rows = normalizeRows(result, client);
    const first = Array.isArray(rows) ? rows[0] : rows;
    return {
      lastInsertRowid: first?.id ?? 0,
      changes: result?.rowsAffected?.[0] ?? 0,
    };
  }
  return { lastInsertRowid: 0, changes: 0 };
}

export function createKnexAdapter(knex) {
  const client = knex.client.config.client;
  return {
    prepare(sql) {
      const adaptedSql = adaptSql(sql, client);
      return {
        get(...params) {
          return knex.raw(adaptedSql, params).then((result) => normalizeGet(result, client));
        },
        all(...params) {
          return knex.raw(adaptedSql, params).then((result) => normalizeAll(result, client));
        },
        run(...params) {
          return knex.raw(adaptedSql, params).then((result) => normalizeRun(result, client, adaptedSql));
        },
      };
    },
    exec(sql) {
      return knex.raw(adaptSql(sql, client));
    },
    transaction(fn) {
      return knex.transaction(async (trx) => fn(createKnexAdapter(trx)));
    },
  };
}

export async function connectKnex(config) {
  await ensureDatabaseExists(config);

  const next = knexFactory(buildKnexConfig(config, config.database));
  await next.raw('SELECT 1');

  const schemaExists = await hasSchema(next);
  if (!schemaExists) {
    await ensureSchema(next);
    await ensureSeedData(next);
  }

  if (activeKnex) {
    await activeKnex.destroy();
  }

  activeKnex = next;
  activeConfig = { ...config };
  return createKnexAdapter(next);
}

export function getKnexDatabase() {
  if (!activeKnex) throw new Error('External database is not connected');
  return createKnexAdapter(activeKnex);
}

export function getActiveExternalConfig() {
  return activeConfig ? { ...activeConfig, password: undefined } : null;
}

export function isKnexConnected() {
  return activeKnex !== null;
}

export async function closeKnexDatabase() {
  if (!activeKnex) return;
  await activeKnex.destroy();
  activeKnex = null;
  activeConfig = null;
}

export async function checkKnexSchema() {
  if (!activeKnex) return false;
  return hasSchema(activeKnex);
}
