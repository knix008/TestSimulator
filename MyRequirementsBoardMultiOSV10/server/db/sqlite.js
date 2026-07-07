import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { hashPassword } from '../auth/password.js';
import { backfillProjectMembers } from '../lib/projectMembers.js';
import { renumberRequirementCodes, isReqCode } from '../lib/reqCode.js';

let SQL = null;
let database = null;
let dbPath = null;
let dbFacade = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  company TEXT DEFAULT '',
  department TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'VIEWER' CHECK(role IN ('ADMIN','EDITOR','VIEWER')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registration_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  company TEXT DEFAULT '',
  department TEXT DEFAULT '',
  requested_role TEXT NOT NULL DEFAULT 'VIEWER',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  classification TEXT DEFAULT '',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','IN_PROGRESS','DONE')),
  created_by_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, code)
);

CREATE TABLE IF NOT EXISTS test_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  steps TEXT DEFAULT '',
  expected_result TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'NOT_RUN' CHECK(status IN ('NOT_RUN','PASS','FAIL','BLOCKED')),
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  created_by_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS project_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'VIEWER' CHECK(member_role IN ('VIEWER','EDITOR')),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);

CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status);
CREATE INDEX IF NOT EXISTS idx_test_cases_requirement ON test_cases(requirement_id);
`;

function getTableColumns(tableName) {
  const info = database.exec(`PRAGMA table_info(${tableName})`);
  return info[0]?.values?.map((row) => row[1]) ?? [];
}

function migrateLegacySchema() {
  const tables = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'");
  if (!tables.length || !tables[0].values.length) return;

  const columns = getTableColumns('app_settings');
  if (columns.includes('setting_key')) return;
  if (!columns.includes('key')) return;

  database.run('ALTER TABLE app_settings RENAME TO app_settings_legacy');
  database.run(`CREATE TABLE app_settings (
  setting_key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
)`);
  database.run('INSERT INTO app_settings (setting_key, value) SELECT key, value FROM app_settings_legacy');
  database.run('DROP TABLE app_settings_legacy');
}

function migrateRequirementsClassificationSchema() {
  const columns = getTableColumns('requirements');
  if (!columns.includes('classification')) {
    database.run('ALTER TABLE requirements ADD COLUMN classification TEXT DEFAULT \'\'');
    database.run(
      'UPDATE requirements SET classification = code WHERE TRIM(COALESCE(classification, \'\')) = \'\' AND code NOT LIKE \'REQ-%\'',
    );
  }
}

async function migrateRequirementsClassificationRenumber(db) {
  const columns = getTableColumns('requirements');
  if (!columns.includes('classification')) return;

  const pending = await db.prepare(
    `SELECT COUNT(*) AS c FROM requirements
     WHERE code NOT LIKE 'REQ-%' AND code NOT LIKE '__tmp%' AND code NOT LIKE '__import%'`,
  ).get();
  if (!pending?.c) return;

  const rows = await db.prepare('SELECT id, code, classification FROM requirements').all();
  for (const row of rows) {
    if (isReqCode(row.code)) continue;
    if (String(row.classification || '').trim()) continue;
    await db.prepare('UPDATE requirements SET classification = ? WHERE id = ?').run(row.code, row.id);
  }

  const projects = await db.prepare('SELECT id FROM projects').all();
  for (const project of projects) {
    await renumberRequirementCodes(db, project.id);
  }
}

function persistDatabase() {
  if (!database || !dbPath) return;
  const data = database.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function rowToObject(columns, values) {
  const row = {};
  columns.forEach((col, i) => { row[col] = values[i]; });
  return row;
}

let transactionDepth = 0;
let transactionQueue = Promise.resolve();

function runStatement(sql, params, { deferPersist = false } = {}) {
  database.run(sql, params);
  const idRow = database.exec('SELECT last_insert_rowid() AS id');
  const changesRow = database.exec('SELECT changes() AS changes');
  if (!deferPersist) {
    persistDatabase();
  }
  return {
    lastInsertRowid: idRow[0]?.values[0]?.[0] ?? 0,
    changes: changesRow[0]?.values[0]?.[0] ?? 0,
  };
}

function createStatement(sql, { deferPersist = false } = {}) {
  return {
    get(...params) {
      const stmt = database.prepare(sql);
      try {
        stmt.bind(params);
        if (stmt.step()) {
          return Promise.resolve(rowToObject(stmt.getColumnNames(), stmt.get()));
        }
        return Promise.resolve(undefined);
      } finally {
        stmt.free();
      }
    },
    all(...params) {
      const stmt = database.prepare(sql);
      const rows = [];
      try {
        stmt.bind(params);
        while (stmt.step()) {
          rows.push(rowToObject(stmt.getColumnNames(), stmt.get()));
        }
        return Promise.resolve(rows);
      } finally {
        stmt.free();
      }
    },
    run(...params) {
      return Promise.resolve(runStatement(sql, params, { deferPersist }));
    },
  };
}

function createDbFacade({ inTransaction = false } = {}) {
  const deferPersist = inTransaction || transactionDepth > 0;
  return {
    prepare(sql) {
      return createStatement(sql, { deferPersist });
    },
    exec(sql) {
      database.run(sql);
      if (!deferPersist) {
        persistDatabase();
      }
      return Promise.resolve();
    },
    transaction(fn) {
      return runTransaction(fn);
    },
  };
}

function safeRollback() {
  try {
    database.run('ROLLBACK');
  } catch {
    // sql.js throws when no transaction is active (e.g. after failed COMMIT).
  }
}

async function runTransaction(fn) {
  if (transactionDepth > 0) {
    return fn(createDbFacade({ inTransaction: true }));
  }

  const execute = async () => {
    transactionDepth += 1;
    database.run('BEGIN');
    try {
      const result = await fn(createDbFacade({ inTransaction: true }));
      database.run('COMMIT');
      persistDatabase();
      return result;
    } catch (err) {
      safeRollback();
      throw err;
    } finally {
      transactionDepth -= 1;
    }
  };

  const run = transactionQueue.then(execute, execute);
  transactionQueue = run.catch(() => {});
  return run;
}

function ensureAdminUser(db) {
  return db.prepare("SELECT * FROM users WHERE LOWER(username) = 'admin'").get().then(async (admin) => {
    if (!admin) {
      const row = await db.prepare('SELECT COUNT(*) AS count FROM users').get();
      if (Number(row?.count ?? 0) > 0) {
        await db.prepare(
          `INSERT INTO users (username, password_hash, name, role, is_active)
           VALUES (?, ?, ?, 'ADMIN', 1)`,
        ).run('admin', hashPassword('admin'), '관리자');
        return;
      }
      await db.prepare(
        `INSERT INTO users (username, password_hash, name, role, is_active)
         VALUES (?, ?, ?, 'ADMIN', 1)`,
      ).run('admin', hashPassword('admin'), '관리자');
      return;
    }
    if (admin.is_active === 0) {
      await db.prepare('UPDATE users SET is_active = 1, role = ? WHERE id = ?').run('ADMIN', admin.id);
    }
  });
}

function ensureDefaultAdmin(db) {
  return ensureAdminUser(db);
}

function ensureDefaultProject(db) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM projects').get();
  return row.then((r) => {
    if (r.count > 0) return;
    return db.prepare(
      `INSERT INTO projects (code, name, description)
       VALUES ('DEFAULT', '기본 프로젝트', '시스템 기본 프로젝트')`,
    ).run();
  });
}

export async function initSqliteDatabase(dataDir) {
  if (dbFacade) return dbFacade;

  if (!SQL) {
    SQL = await initSqlJs();
  }

  fs.mkdirSync(dataDir, { recursive: true });
  dbPath = path.join(dataDir, 'requirements-board.db');

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    database = new SQL.Database(fileBuffer);
  } else {
    database = new SQL.Database();
  }

  database.run('PRAGMA foreign_keys = ON');
  database.exec(SCHEMA_SQL);
  migrateLegacySchema();
  migrateRequirementsClassificationSchema();

  dbFacade = createDbFacade();
  await migrateRequirementsClassificationRenumber(dbFacade);
  await ensureDefaultAdmin(dbFacade);
  await ensureDefaultProject(dbFacade);
  await backfillProjectMembers(dbFacade);
  persistDatabase();

  return dbFacade;
}

export function getSqliteDatabase() {
  if (!dbFacade) throw new Error('SQLite database is not initialized');
  return dbFacade;
}

export function getSqliteDatabasePath() {
  return dbPath;
}

export function isSqliteReady() {
  return database !== null;
}

export function closeSqliteDatabase() {
  if (!database) return;
  persistDatabase();
  database.close();
  database = null;
  dbFacade = null;
  dbPath = null;
  transactionDepth = 0;
  transactionQueue = Promise.resolve();
}
