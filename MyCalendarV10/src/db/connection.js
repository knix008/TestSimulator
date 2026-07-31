const knex = require('knex');
const path = require('path');
const fs = require('fs');

let db = null;

function getDataPath() {
  if (process.env.CALENDAR_DATA_PATH) {
    if (!fs.existsSync(process.env.CALENDAR_DATA_PATH)) {
      fs.mkdirSync(process.env.CALENDAR_DATA_PATH, { recursive: true });
    }
    return process.env.CALENDAR_DATA_PATH;
  }
  const dir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDbFile() {
  return path.join(getDataPath(), 'calendar.db');
}

async function loadDbConfig() {
  if (db) {
    try { await db.destroy(); } catch {}
  }
  db = knex({
    client: 'sqlite3',
    connection: { filename: getDbFile() },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb)
    }
  });
  return db;
}

function getDb() {
  if (!db) throw new Error('DB가 초기화되지 않았습니다. loadDbConfig()를 먼저 호출하세요.');
  return db;
}

module.exports = { loadDbConfig, getDb, getDataPath, getDbFile };
