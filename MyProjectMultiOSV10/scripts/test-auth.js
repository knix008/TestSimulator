const Database = require('better-sqlite3');
const path = require('path');
const { hashPassword, verifyPassword } = require('../dist-electron/auth/passwordUtils');

const db = new Database(':memory:');
db.exec(`
CREATE TABLE mp_users (
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
`);

const h = hashPassword('admin');
db.prepare(
  `INSERT INTO mp_users (username, DisplayName, PasswordHash, role, CanRead, CanModify, IsActive)
   VALUES (?, ?, ?, 'admin', 1, 1, 1)`,
).run('admin', 'Administrator', h);

const row = db.prepare('SELECT * FROM mp_users WHERE username = ? COLLATE NOCASE').get('admin');
console.log('row keys:', Object.keys(row));
const stored = row.PasswordHash ?? row.passwordHash;
console.log('stored hash present:', Boolean(stored));
console.log('verify admin:', verifyPassword('admin', stored));

const userData = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'myproject-multi-os', 'myproject-local.db')
  : null;
if (userData && require('fs').existsSync(userData)) {
  const live = new Database(userData, { readonly: true });
  const users = live.prepare('SELECT Id, username, role, IsActive, PasswordHash FROM mp_users').all();
  console.log('live db users:', users.map((u) => ({ id: u.Id, username: u.username, role: u.role, active: u.IsActive })));
  const admin = live.prepare('SELECT * FROM mp_users WHERE username = ? COLLATE NOCASE').get('admin');
  if (admin) {
    const hash = admin.PasswordHash ?? admin.passwordHash;
    console.log('live verify admin:', verifyPassword('admin', hash));
  } else {
    console.log('live db: no admin user');
  }
  live.close();
} else {
  console.log('live db path not found:', userData);
}
