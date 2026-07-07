import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDb = path.join(__dirname, '..', 'data', 'requirements-board.db');
const appDataDb = path.join(
  process.env.APPDATA || '',
  'my-requirements-board-multi-os',
  'data',
  'requirements-board.db',
);

async function inspectDb(label, dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`[${label}] DB 없음: ${dbPath}`);
    return;
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const users = db.exec('SELECT id, username, role, is_active, substr(password_hash,1,20) AS hash_prefix FROM users');
  console.log(`[${label}] ${dbPath}`);
  console.log(users[0] ? users[0].values : 'no users');
  db.close();
}

await inspectDb('project', projectDb);
await inspectDb('electron-userData', appDataDb);
