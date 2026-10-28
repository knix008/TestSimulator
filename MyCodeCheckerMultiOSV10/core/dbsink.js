'use strict';

// Saving analysis results to a database: SQLite (Node's built-in node:sqlite),
// PostgreSQL (pg), MySQL / MariaDB (mysql2) and SQL Server (mssql).
// Tables (prefix from settings.database.schema, default "mcc"):
//   <p>_projects  (id, project_key, name, path, updated_at)
//   <p>_analyses  (id, project_id, branch, analyzed_at, gate, main measures, measures_json)
//   <p>_issues    (analysis_id, issue_key, rule, type, severity, status, ...)
//   <p>_measures  (analysis_id, metric, value)
//   <p>_project_details (analysis_id, project_id, the project's analysis setup at that
//                  analysis: exclusions, excluded folders, include dirs, defines, new-code
//                  baseline, checks turned off, quality gate and its verdict per condition,
//                  languages)
// Only analysis results and project information are saved, never the program's own
// settings (theme, language, AI, database connection ...).
// Exporting the same analysis again replaces its rows, so it is idempotent.

const path = require('path');
const crypto = require('crypto');

const MASK = '••••••••';
// MariaDB speaks the MySQL protocol and SQL: it uses the mysql2 driver and the mysql dialect.
const DEFAULT_PORT = { postgres: 5432, mysql: 3306, mariadb: 3306, mssql: 1433 };
// timeoutSec: the longest one statement (or the connection) may take.
const DEFAULTS = { enabled: false, kind: 'sqlite', file: '', host: '127.0.0.1', port: 0, database: 'mycodechecker', user: '', password: '', ssl: false, schema: 'mcc', autoExport: true, includeIssues: true, timeoutSec: 60 };

function fail(code, message, ko) {
  return Object.assign(new Error(message), { code }, ko ? { text: { en: message, ko } } : {});
}

const timeoutMs = (s) => Math.max(1, Number(s && s.timeoutSec) || DEFAULTS.timeoutSec) * 1000;

// A statement that does not answer in time fails with DB_TIMEOUT (the driver
// keeps running it; the export rolls back and closes the connection).
function withTimeout(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(fail('DB_TIMEOUT', `The database did not answer within ${Math.round(ms / 1000)} s (${what})`, `데이터베이스가 ${Math.round(ms / 1000)}초 안에 응답하지 않았습니다(${what}). 연결 상태를 확인하거나 설정 › 데이터베이스에서 시간 제한을 늘리십시오.`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// The connection with every query timed and cancellable (opts.isCancelled).
function guarded(conn, ms, opts = {}) {
  return {
    ...conn,
    async query(sql, params) {
      // ROLLBACK still goes through after a cancel.
      if (opts.isCancelled && opts.isCancelled() && !/^ROLLBACK/i.test(String(sql).trim())) throw fail('CANCELLED', 'Database export cancelled', 'DB 저장을 취소했습니다.');
      return withTimeout(conn.query(sql, params), ms, String(sql).trim().split(/\s+/).slice(0, 2).join(' '));
    },
    async close() {
      try { await withTimeout(conn.close(), Math.min(ms, 5000), 'close'); } catch { /* a stuck connection is dropped */ }
    },
  };
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
  if (!['sqlite', 'postgres', 'mysql', 'mariadb', 'mssql'].includes(merged.kind)) throw fail('BAD_REQUEST', `Unknown database kind: ${merged.kind}`);
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(merged.schema || '')) throw fail('BAD_REQUEST', 'The table prefix may use letters, digits and _ only');
  merged.port = Number(merged.port) || DEFAULT_PORT[merged.kind] || 0;
  merged.timeoutSec = Math.min(3600, Math.max(5, Math.round(Number(merged.timeoutSec) || DEFAULTS.timeoutSec)));
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
    { name: `${prefix}_projects`, cols: [['id', 'key'], ['project_key', 'key'], ['name', 'text'], ['path', 'text'], ['updated_at', 'key'],
      ['description', 'text'], ['main_branch', 'key'], ['project_file', 'text'], ['tags', 'text'], ['created_at', 'key'],
      ['last_analysis_id', 'key'], ['last_branch', 'key'], ['last_analyzed_at', 'key'], ['last_gate', 'key']], pk: ['id'] },
    { name: `${prefix}_project_details`, cols: [['analysis_id', 'key'], ['project_id', 'key'], ['branch', 'key'], ['analyzed_at', 'key'],
      ['quality_gate', 'text'], ['gate_status', 'key'], ['gate_json', 'text'], ['config_json', 'text'], ['checks_off', 'text'], ['languages_json', 'text'],
      ['files', 'int'], ['ncloc', 'int']], pk: ['analysis_id'] },
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
    try { return require(name); } catch { throw fail('DB_DRIVER', `The ${name} driver is not installed`, `${name} 드라이버가 설치되어 있지 않습니다.`); }
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
    if (s.kind === 'mysql' || s.kind === 'mariadb') {
      const mysql = req('mysql2/promise');
      const conn = await mysql.createConnection({ host: s.host, port: s.port, database: s.database, user: s.user, password: s.password, ssl: s.ssl ? {} : undefined, connectTimeout: 15000, charset: 'utf8mb4' });
      return {
        kind: 'mysql',
        async query(sql, params = []) { const [rows] = await conn.query(sql, params); return Array.isArray(rows) ? rows : []; },
        async version() { const [rows] = await conn.query('select version() as v'); return `${/mariadb/i.test(rows[0].v) || s.kind === 'mariadb' ? 'MariaDB' : 'MySQL'} ${rows[0].v}`; },
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
    throw fail('DB_CONNECT', `Cannot connect to the ${s.kind} database: ${err.message}`, `${s.kind} 데이터베이스에 연결할 수 없습니다: ${err.message}`);
  }
  throw fail('BAD_REQUEST', `Unknown database kind: ${s.kind}`);
}

async function ensureSchema(conn, prefix) {
  for (const def of tableDefs(prefix)) {
    await conn.query(createSql(conn.kind, def));
    await ensureColumns(conn, def);
  }
}

// Tables made by an older version get the columns added since.
async function ensureColumns(conn, def) {
  let rows = [];
  if (conn.kind === 'sqlite') rows = await conn.query(`PRAGMA table_info(${quoteId('sqlite', def.name)})`);
  else if (conn.kind === 'postgres') rows = await conn.query('SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?', [def.name]);
  else if (conn.kind === 'mysql') rows = await conn.query('SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [def.name]);
  else if (conn.kind === 'mssql') rows = await conn.query('SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(?)', [def.name]);
  const have = new Set((rows || []).map((r) => String(r.name || r.NAME || r.column_name || r.COLUMN_NAME || '').toLowerCase()).filter(Boolean));
  if (!have.size) return; // just created (or a driver that cannot tell)
  const t = TYPES[conn.kind];
  for (const [col, ty] of def.cols) {
    if (have.has(col.toLowerCase())) continue;
    await conn.query(`ALTER TABLE ${quoteId(conn.kind, def.name)} ADD ${conn.kind === 'mssql' ? '' : 'COLUMN '}${quoteId(conn.kind, col)} ${t[ty]}`);
  }
}

async function insertRows(conn, table, columns, rows, onChunk) {
  const size = chunkSize(conn.kind, columns.length);
  const cols = columns.map((c) => quoteId(conn.kind, c)).join(', ');
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    const values = part.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    await conn.query(`INSERT INTO ${quoteId(conn.kind, table)} (${cols}) VALUES ${values}`, part.flat());
    if (onChunk) onChunk(part.length);
    // SQLite (node:sqlite) runs synchronously: let the server answer progress
    // requests between chunks.
    await new Promise((resolve) => setImmediate(resolve));
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

/**
 * Write one analysis. Returns { analysisId, issues, measures }.
 * opts.onProgress({ phase: 'connect'|'schema'|'write'|'commit', done, total }) reports
 * progress (done/total are rows); opts.isCancelled() stops it between statements.
 */
async function exportAnalysis(s, { project, branch, analysis, settings }, opts = {}) {
  if (!s.enabled && !opts.force) throw fail('DB_NOT_CONFIGURED', 'Saving to a database is off. Turn it on in Settings › Database', '데이터베이스 저장이 꺼져 있습니다. 설정 › 데이터베이스에서 켜십시오.');
  const ms = timeoutMs(s);
  const report = (phase, done = 0, total = 0) => { if (opts.onProgress) opts.onProgress({ phase, done, total }); };
  report('connect');
  const conn = guarded(await withTimeout(connect(s, opts), ms + 1000, 'connect'), ms, opts);
  const p = s.schema || 'mcc';
  try {
    report('schema');
    await ensureSchema(conn, p);
    const analysisId = crypto.createHash('sha1').update(`${project.id}|${branch}|${analysis.finishedAt}`).digest('hex').slice(0, 24);
    const m = analysis.measures || {};
    const issues = s.includeIssues === false ? [] : (analysis.issues || []);
    // issue_key is unique per analysis; a repeated key (imported findings) gets #2, #3 ...
    const seenKeys = new Map();
    const rowKey = (k) => {
      const n = (seenKeys.get(k) || 0) + 1;
      seenKeys.set(k, n);
      return n === 1 ? k : `${k}#${n}`;
    };
    const measureRows = Object.entries(m).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [analysisId, k, v]);
    const total = 3 + measureRows.length + issues.length;
    let done = 0;
    const step = (n) => { done += n; report('write', done, total); };
    report('write', 0, total);
    await tx(conn, async () => {
      await conn.query(`DELETE FROM ${quoteId(conn.kind, `${p}_projects`)} WHERE ${quoteId(conn.kind, 'id')} = ?`, [project.id]);
      const gate = analysis.qualityGate || {};
      await insertRows(conn, `${p}_projects`, ['id', 'project_key', 'name', 'path', 'updated_at', 'description', 'main_branch', 'project_file', 'tags', 'created_at', 'last_analysis_id', 'last_branch', 'last_analyzed_at', 'last_gate'],
        [[project.id, str(project.key, 190), str(project.name), str(project.path), str(analysis.finishedAt, 40), str(project.description), str(project.mainBranch || 'main', 190), str(project.projectFile),
          JSON.stringify(project.tags || []), str(project.createdAt, 40), analysisId, str(branch, 190), str(analysis.finishedAt, 40), str(gate.status, 20)]], step);
      // The project's analysis setup at this analysis (not the program's settings).
      await conn.query(`DELETE FROM ${quoteId(conn.kind, `${p}_project_details`)} WHERE ${quoteId(conn.kind, 'analysis_id')} = ?`, [analysisId]);
      const config = {
        exclusions: [...(((settings || {}).exclusions) || []), ...(project.exclusions || [])], excludeDirs: project.excludeDirs || [], includeDirs: project.includeDirs || [],
        defines: project.defines || {}, coverageReports: project.coverageReports || [], newCode: project.newCode || { newCode: (settings || {}).newCode || 'previous' },
        gateId: project.gateId || null, policyId: project.policyId || null, profiles: project.profiles || {},
      };
      const checksOff = Object.entries(((settings || {}).checks) || {}).filter(([, on]) => on === false).map(([id]) => id);
      await insertRows(conn, `${p}_project_details`, ['analysis_id', 'project_id', 'branch', 'analyzed_at', 'quality_gate', 'gate_status', 'gate_json', 'config_json', 'checks_off', 'languages_json', 'files', 'ncloc'],
        [[analysisId, project.id, str(branch, 190), str(analysis.finishedAt, 40), str(gate.name), str(gate.status, 20),
          JSON.stringify((gate.conditions || []).map((c) => ({ metric: c.metric, op: c.op, threshold: c.threshold, actual: c.actual, status: c.status, enabled: c.enabled !== false }))),
          JSON.stringify(config), JSON.stringify(checksOff), JSON.stringify(analysis.languages || {}), num(m.files), num(m.ncloc)]], step);
      for (const t of ['issues', 'measures']) await conn.query(`DELETE FROM ${quoteId(conn.kind, `${p}_${t}`)} WHERE ${quoteId(conn.kind, 'analysis_id')} = ?`, [analysisId]);
      await conn.query(`DELETE FROM ${quoteId(conn.kind, `${p}_analyses`)} WHERE ${quoteId(conn.kind, 'id')} = ?`, [analysisId]);
      await insertRows(conn, `${p}_analyses`, ['id', 'project_id', 'branch', 'analyzed_at', 'gate', ...MEASURE_COLUMNS, 'measures_json'],
        [[analysisId, project.id, str(branch, 190), str(analysis.finishedAt, 40), str(analysis.qualityGate && analysis.qualityGate.status, 20), ...MEASURE_COLUMNS.map((c) => num(m[c])), JSON.stringify(m)]], step);
      await insertRows(conn, `${p}_measures`, ['analysis_id', 'metric', 'value'], measureRows, step);
      await insertRows(conn, `${p}_issues`, ['analysis_id', 'issue_key', 'rule', 'type', 'severity', 'status', 'resolution', 'file', 'line', 'message', 'message_ko', 'engine', 'checker', 'cid', 'cwe', 'is_new', 'assignee', 'tags', 'created_at'],
        issues.map((i) => [analysisId, str(rowKey(String(i.key)), 190), str(i.rule, 190), str(i.type, 40), str(i.severity, 20), str(i.status || 'OPEN', 40), str(i.resolution, 40), str(i.file), num(i.line), str(msg(i.message, 'en')), str(msg(i.message, 'ko')), str(i.engine, 60), str(i.checker, 120), i.cid == null ? null : String(i.cid), str(i.cwe, 40), i.isNew ? 1 : 0, str(i.assignee, 190), JSON.stringify(i.tags || []), str(i.createdAt, 40)]), step);
      report('commit', done, total);
    });
    return { analysisId, issues: issues.length, measures: measureRows.length, kind: conn.kind };
  } finally {
    await conn.close();
  }
}

/** Connect, create the tables if needed, and report the server version and tables. */
async function testConnection(s, opts = {}) {
  const ms = timeoutMs(s);
  const conn = guarded(await withTimeout(connect(s, opts), ms + 1000, 'connect'), ms, opts);
  try {
    await ensureSchema(conn, s.schema || 'mcc');
    return { ok: true, kind: conn.kind, version: await withTimeout(conn.version(), ms, 'version'), tables: tableDefs(s.schema || 'mcc').map((d) => d.name) };
  } finally {
    await conn.close();
  }
}

module.exports = { DEFAULTS, DEFAULT_PORT, MASK, settingsOf, publicSettings, saveSettings, tableDefs, createSql, placeholders, chunkSize, connect, exportAnalysis, testConnection, withTimeout };
