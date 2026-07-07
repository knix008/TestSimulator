import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hashSync(password, ROUNDS);
}

const dbPaths = [
  path.join(__dirname, '..', 'data', 'requirements-board.db'),
  path.join(process.env.APPDATA || '', 'my-requirements-board-multi-os', 'data', 'requirements-board.db'),
  path.join(process.env.APPDATA || '', 'MyRequirementsBoard', 'data', 'requirements-board.db'),
];

const SQL = await initSqlJs();
const passwordHash = hashPassword('admin');

for (const dbPath of dbPaths) {
  if (!fs.existsSync(dbPath)) {
    console.log(`[skip] DB 없음: ${dbPath}`);
    continue;
  }

  const db = new SQL.Database(fs.readFileSync(dbPath));
  const existing = db.exec("SELECT id FROM users WHERE LOWER(username) = 'admin'");
  const adminId = existing[0]?.values?.[0]?.[0];

  if (adminId) {
    db.run(
      "UPDATE users SET password_hash = ?, role = 'ADMIN', is_active = 1 WHERE id = ?",
      [passwordHash, adminId],
    );
    console.log(`[ok] admin 비밀번호 초기화: ${dbPath}`);
  } else {
    db.run(
      "INSERT INTO users (username, password_hash, name, role, is_active) VALUES ('admin', ?, '관리자', 'ADMIN', 1)",
      [passwordHash],
    );
    console.log(`[ok] admin 계정 생성: ${dbPath}`);
  }

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
}

console.log('완료 — ID: admin / 비밀번호: admin');
