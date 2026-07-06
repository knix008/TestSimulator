const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { resolveSqlitePath } = require('../config');
const { initializeDatabase } = require('./init');

function openDatabase(config) {
  const sqlitePath = resolveSqlitePath(config);
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  initializeDatabase(db);
  return db;
}

function closeDatabase(db) {
  if (db) {
    db.close();
  }
}

module.exports = {
  openDatabase,
  closeDatabase
};
