import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { hashPassword } from '../auth/passwordUtils';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from '../auth/userTypes';

let database: Database.Database | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS mp_users (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  DisplayName TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  PasswordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  CanRead INTEGER NOT NULL DEFAULT 1,
  CanModify INTEGER NOT NULL DEFAULT 0,
  IsActive INTEGER NOT NULL DEFAULT 1,
  CreatedUtc TEXT NOT NULL DEFAULT (datetime('now')),
  UpdatedUtc TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function ensureDefaultAdmin(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) AS count FROM mp_users').get() as { count: number };
  if (row.count > 0) return;

  db.prepare(
    `INSERT INTO mp_users (username, DisplayName, PasswordHash, role, CanRead, CanModify, IsActive)
     VALUES (@username, @displayName, @passwordHash, 'admin', 1, 1, 1)`,
  ).run({
    username: DEFAULT_ADMIN_USERNAME,
    displayName: 'Administrator',
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
  });
}

export function initLocalDatabase(userDataPath: string): Database.Database {
  if (database) return database;

  fs.mkdirSync(userDataPath, { recursive: true });
  const dbPath = path.join(userDataPath, 'myproject-local.db');
  database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.exec(SCHEMA_SQL);
  ensureDefaultAdmin(database);
  return database;
}

export function getLocalDatabase(): Database.Database {
  if (!database) {
    throw new Error('Local database is not initialized');
  }
  return database;
}

export function closeLocalDatabase(): void {
  if (!database) return;
  database.close();
  database = null;
}

export function getLocalDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, 'myproject-local.db');
}
