import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sqliteSchema, ensureAdminUser, migrateThemeColumn, migrateEmailColumn } from '../schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSqlitePath(filename) {
  if (path.isAbsolute(filename)) return filename;
  return path.join(__dirname, '..', '..', filename);
}

export function createSqliteAdapter(config) {
  let db = null;
  let dbPath = resolveSqlitePath(config.filename || './data/reqtracking.db');

  function getDb() {
    if (!db) {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
    }
    return db;
  }

  const adapter = {
    dialect: 'sqlite3',
    async testConnection() {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const existed = fs.existsSync(dbPath);
      const test = new Database(dbPath);
      test.prepare('SELECT 1').get();
      test.close();
      return { databaseExisted: existed, databaseCreated: !existed };
    },
    async initSchema() {
      dbPath = resolveSqlitePath(config.filename || './data/reqtracking.db');
      if (db) {
        db.close();
        db = null;
      }
      const database = getDb();
      for (const sql of sqliteSchema()) {
        database.exec(sql);
      }
      await migrateThemeColumn(adapter, 'sqlite3');
      await migrateEmailColumn(adapter, 'sqlite3');
      const bcrypt = await import('bcryptjs');
      await ensureAdminUser(adapter, bcrypt.default);
    },
    async query(sql, params = []) {
      return getDb().prepare(sql).all(...params);
    },
    async queryOne(sql, params = []) {
      return getDb().prepare(sql).get(...params) ?? null;
    },
    async insert(sql, params = []) {
      const result = getDb().prepare(sql).run(...params);
      return result.lastInsertRowid;
    },
    async execute(sql, params = []) {
      const result = getDb().prepare(sql).run(...params);
      return { affectedRows: result.changes };
    },
    async close() {
      if (db) {
        db.close();
        db = null;
      }
    },
  };

  return adapter;
}
