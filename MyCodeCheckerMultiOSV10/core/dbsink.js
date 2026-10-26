'use strict';

// Saving analysis results to a database: SQLite (Node's built-in node:sqlite),
// PostgreSQL (pg), MySQL / MariaDB (mysql2) and SQL Server (mssql).
// Tables (prefix from settings.database.schema, default "mcc"):
//   <p>_projects  (id, project_key, name, path, updated_at)
//   <p>_analyses  (id, project_id, branch, analyzed_at, gate, main measures, measures_json)
//   <p>_issues    (analysis_id, issue_key, rule, type, severity, status, ...)
//   <p>_measures  (analysis_id, metric, value)
// Exporting the same analysis again replaces its rows, so it is idempotent.

const path = require('path');
const crypto = require('crypto');

const MASK = '••••••••';
const DEFAULT_PORT = { postgres: 5432, mysql: 3306, mssql: 1433 };
const DEFAULTS = { enabled: false, kind: 'sqlite', file: '', host: '127.0.0.1', port: 0, database: 'mycodechecker', user: '', password: '', ssl: false, schema: 'mcc', autoExport: true, includeIssues: true };

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function settingsOf(ws, configDir) {
  const s = { ...DEFAULTS, ...((ws.settings && ws.settings.database) || {}) };
  if (!s.port) s.port = DEFAULT_PORT[s.kind] || 0;
  if (s.kind === 'sqlite' && !s.file && configDir) s.file = path.join(configDir, 'mycodechecker.db');
  return s;
}

function publicSettings(ws, configDir) {
  const s = settingsOf(ws, configDir);
  return { ...s, password: s.password ? MASK : '' };
}

function saveSettings(ws, next, configDir) {
  const prev = settingsOf(ws, configDir);
  const merged = { ...prev, ...(next || {}) };
  if (merged.password === MASK) merged.password = prev.password;
  if (!['sqlite', 'postgres', 'mysql', 'mssql'].includes(merged.kind)) throw fail('BAD_REQUEST', `Unknown database kind: ${merged.kind}`);
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(merged.schema || '')) throw fail('BAD_REQUEST', 'The table prefix may use letters, digits and _ only');
  merged.port = Number(merged.port) || DEFAULT_PORT[merged.kind] || 0;
  ws.settings = { ...(ws.settings || {}), database: merged };
  return publicSettings(ws, configDir);
}

// ---------------------------------------------------------------------------
// Dialects: column types, "create if missing", placeholders, row limits.

const TYPES = {
  sqlite: { key: 'TEXT', text: 'TEXT', int: 'INTEGER', num: 'REAL' },
  postgres: { key: 'VARCHAR(200)', text: 'TEXT', int: 'BIGINT', num: 'DOUBLE PRECISION' },
  mysql: { key: 'VARCHAR(191)', text: 'LONGTEXT', int: 'BIGINT', num: 'DOUBLE' },
  mssql: { key: 'NVARCHAR(400)', text: 'NVARCHAR(MAX)', int: 'BIGINT', num: 'FLOAT' },
};

const MEASURE_COLUMNS = ['ncloc', 'files', 'bugs', 'vulnerabilities', 'code_smells', 'security_hotspots', 'coverage', 'duplicated_lines_density',
  'sqale_index', 'reliability_rating', 'security_rating', 'maintainability_rating', 'new_bugs', 'new_vulnerabilities', 'new_code_smells', 'new_coverage'];

function tableDefs(prefix) {
  return [
    { name: `${prefix}_projects`, cols: [['id', 'key'], ['project_key', 'key'], ['name', 'text'], ['path', 'text'], ['updated_at', 'key']], pk: ['id'] },
    { name: `${prefix}_analyses`, cols: [['id', 'key'], ['project_id', 'key'], ['branch', 'key'], ['analyzed_at', 'key'], ['gate', 'key'],
      ...MEASURE_COLUMNS.map((c) => [c, 'num']), ['measures_json', 'text']], pk: ['id'] },
    { name: `${prefix}_issues`, cols: [['analysis_id', 'key'], ['issue_key', 'key'], ['rule', 'key'], ['type', 'key'], ['severity', 'key'], ['status', 'key'], ['resolution', 'key'],
      ['file', 'text'], ['line', 'int'], ['message', 'text'], ['message_ko', 'text'], ['engine', 'key'], ['checker', 'key'], ['cid', 'key'], ['cwe', 'key'],
      ['is_new', 'int'], ['assignee', 'key'], ['tags', 'text'], ['created_at', 'key']], pk: ['analysis_id', 'issue_key'] },
    { name: `${prefix}_measures`, cols: [['analysis_id', 'key'], ['metric', 'key'], ['value', 'num']], pk: ['analysis_id', 'metric'] },
  ];
}

function quoteId(kind, name) {
  if (kind === 'mysql') return `\`${name}\``;
  if (kind === 'mssql') return `[${name}]`;
  return `"${name}"`;
}

function createSql(kind, def) {
  const t = TYPES[kind];
  const cols = def.cols.map(([n, ty]) => `${quoteId(kind, n)} ${t[ty]}${def.pk.includes(n) ? ' NOT NULL' : ''}`);
  const body = `${quoteId(kind, def.name)} (${cols.join(', ')}, PRIMARY KEY (${def.pk.map((c) => quoteId(kind, c)).join(', ')}))`;
  if (kind === 'mssql') return `IF OBJECT_ID(N'${def.name}', N'U') IS NULL CREATE TABLE ${body}`;
  return `CREATE TABLE IF NOT EXISTS ${body}`;
}

/** Turn "?" placeholders into the dialect's form. */
function placeholders(kind, sql) {
  let n = 0;
  if (kind === 'postgres') return sql.replace(/\?/g, () => `$${++n}`);
  if (kind === 'mssql') return sql.replace(/\?/g, () => `@p${++n}`);
  return sql;
}

// Rows per INSERT: SQL Server allows 2100 parameters per request.
function chunkSize(kind, columns) {
  if (kind === 'mssql') return Math.max(1, Math.floor(2000 / columns));
  if (kind === 'sqlite') return Math.max(1, Math.floor(30000 / columns));
  return 500;
}

// ---------------------------------------------------------------------------
// Connections: { kind, query(sql, params) -> rows, close(), version() }

async function connect(s, opts = {}) {
  if (opts.driver) return opts.driver;
  const req = (name) => {
    try { return require(name); } catch { throw fail('DB_DRIVER', `The ${name} driver is not installed`); }
  };
  try {
    if (s.kind === 'sqlite') {
      const { DatabaseSync } = req('node:sqlite');
      if (!s.file) throw fail('DB_NOT_CONFIGURED', 'Choose the SQLite file');
      require('fs').mkdirSync(path.dirname(path.resolve(s.file)), { recursive: true });
      const db = new DatabaseSync(path.resolve(s.file));
      return {
        kind: 'sqlite',
        async query(sql, params = []) {
          const st = db.prepare(sql);
          return /^\s*(select|pragma)/i.test(sql) ? st.all(...params) : (st.run(...params), []);
        },
        async version() { return `SQLite ${db.prepare('select sqlite_version() v').get().v}`; },
        async close() { db.close(); },
      };
    }
    if (s.kind === 'postgres') {
      const { Client } = req('pg');
      const client = new Client({ host: s.host, port: s.port, database: s.database, user: s.user, password: s.password, ssl: s.ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 15000 });
      await client.connect();
      return {
        kind: 'postgres',
        async query(sql, params = []) { return (await client.query(placeholders('postgres', sql), params)).rows; },
        async version() { return (await client.query('select version() as v')).rows[0].v; },
        async close() { await client.end(); },
      };
    }
    if (s.kind === 'mysql') {
      const mysql = req('mysql2/promise');
      const conn = await mysql.createConnection({ host: s.host, port: s.port, database: s.database, user: s.user, password: s.password, ssl: s.ssl ? {} : undefined, connectTimeout: 15000, charset: 'utf8mb4' });
      return {
        kind: 'mysql',
        async query(sql, params = []) { const [rows] = await conn.query(sql, params); return Array.isArray(rows) ? rows : []; },
        async version() { const [rows] = await conn.query('select version() as v'); return `MySQL ${rows[0].v}`; },
        async close() { await conn.end(); },
      };
    }
    if (s.kind === 'mssql') {
      const sql = req('mssql');
      const pool = await new sql.ConnectionPool({ server: s.host, port: s.port, database: s.database, user: s.user, password: s.password, options: { encrypt: !!s.ssl, trustServerCertificate: !s.ssl }, connectionTimeout: 15000 }).connect();
      return {
        kind: 'mssql',
        async query(text, params = []) {
          const r = pool.request();
          params.forEach((v, i) => r.input(`p${i + 1}`, v));
          return (await r.query(placeholders('mssql', text))).recordset || [];
        },
        async version() { return (await pool.request().query('select @@VERSION as v')).recordset[0].v; },
        async close() { await pool.close(); },
      };
    }
  } catch (err) {
    if (err.code === 'DB_DRIVER' || err.code === 'DB_NOT_CONFIGURED') throw err;
    throw fail('DB_CONNECT', `Cannot connect to the ${s.kind} database: ${err.message}`);
  }
  throw fail('BAD_REQUEST', `Unknown database kind: ${s.kind}`);
}

async function ensureSchema(conn, prefix) {
  for (const def of tableDefs(prefix)) await conn.query(createSql(conn.kind, def));
}

async function insertRows(conn, table, columns, rows) {
  const size = chunkSize(conn.kind, columns.length);
  const cols = columns.map((c) => quoteId(conn.kind, c)).join(', ');
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    const values = part.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    await conn.query(`INSERT INTO ${quoteId(conn.kind, table)} (${cols}) VALUES ${values}`, part.flat());
  }
}

async function tx(conn, fn) {
  const begin = conn.kind === 'mssql' ? 'BEGIN TRANSACTION' : conn.kind === 'mysql' ? 'START TRANSACTION' : 'BEGIN';
  await conn.query(begin);
  try {
    const out = await fn();
    await conn.query(conn.kind === 'mssql' ? 'COMMIT TRANSACTION' : 'COMMIT');
    return out;
  } catch (err) {
    try { await conn.query(conn.kind === 'mssql' ? 'ROLLBACK TRANSACTION' : 'ROLLBACK'); } catch { /* keep the first error */ }
    throw err;
  }
}

const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v, max = 4000) => (v == null ? null : String(v).slice(0, max));
const msg = (m, lang) => (m && typeof m === 'object' ? m[lang] || m.en || m.ko || '' : String(m || ''));

/** Write one analysis. Returns { analysisId, issues, measures }. */
async function exportAnalysis(s, { project, branch, analysis }, opts = {}) {
  if (!s.enabled && !opts.force) throw fail('DB_NOT_CONFIGURED', 'Saving to a database is off. Turn it on in Settings › Database');
  const conn = await connect(s, opts);
  const p = s.schema || 'mcc';
  try {
    await ensureSchema(conn, p);
    const analysisId = crypto.createHash('sha1').update(`${project.id}|${branch}|${analysis.finishedAt}`).digest('hex').slice(0, 24);
    const m = analysis.measures || {};
    const issues = s.includeIssues === false ? [] : (analysis.issues || []);
    const measureRows = Object.entries(m).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [analysisId, k, v]);
    await tx(conn, async () => {
      await conn.query(`DELETE FROM ${quoteId(conn.kind, `${p}_projects`)} WHERE ${quoteId(conn.kind, 'id')} = ?`, [project.id]);
      await insertRows(conn, `${p}_projects`, ['id', 'project_key', 'name', 'path', 'updated_at'], [[project.id, str(project.key, 190), str(project.name), str(project.path), str(analysis.finishedAt, 40)]]);
      for (const t of ['issues', 'measures']) await conn.query(`DELETE FROM ${quoteId(conn.kind, `${p}_${t}`)} WHERE ${quoteId(conn.kind, 'analysis_id')} = ?`, [analysisId]);
      await conn.query(`DELETE FROM ${quoteId(conn.kind, `${p}_analyses`)} WHERE ${quoteId(conn.kind, 'id')} = ?`, [analysisId]);
      await insertRows(conn, `${p}_analyses`, ['id', 'project_id', 'branch', 'analyzed_at', 'gate', ...MEASURE_COLUMNS, 'measures_json'],
        [[analysisId, project.id, str(branch, 190), str(analysis.finishedAt, 40), str(analysis.qualityGate && analysis.qualityGate.status, 20), ...MEASURE_COLUMNS.map((c) => num(m[c])), JSON.stringify(m)]]);
      await insertRows(conn, `${p}_measures`, ['analysis_id', 'metric', 'value'], measureRows);
      await insertRows(conn, `${p}_issues`, ['analysis_id', 'issue_key', 'rule', 'type', 'severity', 'status', 'resolution', 'file', 'line', 'message', 'message_ko', 'engine', 'checker', 'cid', 'cwe', 'is_new', 'assignee', 'tags', 'created_at'],
        issues.map((i) => [analysisId, str(i.key, 190), str(i.rule, 190), str(i.type, 40), str(i.severity, 20), str(i.status || 'OPEN', 40), str(i.resolution, 40), str(i.file), num(i.line), str(msg(i.message, 'en')), str(msg(i.message, 'ko')), str(i.engine, 60), str(i.checker, 120), i.cid == null ? null : String(i.cid), str(i.cwe, 40), i.isNew ? 1 : 0, str(i.assignee, 190), JSON.stringify(i.tags || []), str(i.createdAt, 40)]));
    });
    return { analysisId, issues: issues.length, measures: measureRows.length, kind: conn.kind };
  } finally {
    await conn.close();
  }
}

/** Connect, create the tables if needed, and report the server version and tables. */
async function testConnection(s, opts = {}) {
  const conn = await connect(s, opts);
  try {
    await ensureSchema(conn, s.schema || 'mcc');
    return { ok: true, kind: conn.kind, version: await conn.version(), tables: tableDefs(s.schema || 'mcc').map((d) => d.name) };
  } finally {
    await conn.close();
  }
}

module.exports = { DEFAULTS, DEFAULT_PORT, MASK, settingsOf, publicSettings, saveSettings, tableDefs, createSql, placeholders, chunkSize, connect, exportAnalysis, testConnection };
