import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbs = [
  ['project', path.join(__dirname, '..', 'data', 'requirements-board.db')],
  ['electron-userData', path.join(process.env.APPDATA, 'my-requirements-board-multi-os', 'data', 'requirements-board.db')],
];

const SQL = await initSqlJs();
for (const [label, dbPath] of dbs) {
  if (!fs.existsSync(dbPath)) {
    console.log(`${label}: missing`);
    continue;
  }
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const result = db.exec("SELECT username, password_hash, is_active FROM users WHERE username = 'admin'");
  const row = result[0]?.values[0];
  if (!row) {
    console.log(`${label}: no admin user`);
    continue;
  }
  const ok = bcrypt.compareSync('admin', row[1]);
  console.log(`${label}: admin/admin=${ok}, is_active=${row[2]}`);
  db.close();
}
