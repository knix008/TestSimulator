const { SCHEMA_STATEMENTS } = require('./schema');

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function applySchema(db) {
  db.pragma('foreign_keys = ON');
  for (const statement of SCHEMA_STATEMENTS) {
    db.exec(statement);
  }
}

function ensureDefaultAdmin(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count > 0) {
    return;
  }

  const { hashPassword } = require('../services/passwordHasher');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (username, password_hash, role, created_at, updated_at)
     VALUES (@username, @passwordHash, @role, @createdAt, @updatedAt)`
  ).run({
    username: 'admin',
    passwordHash: hashPassword('admin'),
    role: 'Admin',
    createdAt: now,
    updatedAt: now
  });
}

function ensureWorkspaceOwnerMembers(db) {
  const workspaces = db.prepare('SELECT id, owner_id FROM workspaces').all();
  const insert = db.prepare(
    'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
  );
  for (const workspace of workspaces) {
    const exists = db
      .prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .get(workspace.id, workspace.owner_id);
    if (!exists) {
      insert.run(workspace.id, workspace.owner_id, 'Owner');
    }
  }
}

function initializeDatabase(db) {
  applySchema(db);
  ensureDefaultAdmin(db);
  ensureWorkspaceOwnerMembers(db);
}

module.exports = {
  tableExists,
  initializeDatabase
};
