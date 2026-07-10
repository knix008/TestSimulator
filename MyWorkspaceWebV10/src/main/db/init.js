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

function ensureCommentAttachmentsTable(db) {
  if (tableExists(db, 'comment_attachments')) {
    return;
  }

  db.exec(`
    CREATE TABLE comment_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (comment_id) REFERENCES page_comments(id) ON DELETE CASCADE
    );
  `);
}

function ensureCommentParentIdColumn(db) {
  const columns = db.prepare('PRAGMA table_info(page_comments)').all();
  if (columns.some((column) => column.name === 'parent_id')) {
    return;
  }

  db.exec('ALTER TABLE page_comments ADD COLUMN parent_id INTEGER REFERENCES page_comments(id) ON DELETE CASCADE');
}

function ensureUserDisplayNameColumn(db) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (columns.some((column) => column.name === 'display_name')) {
    return;
  }

  db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
}

function ensureUserNotifyOnCommentColumn(db) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (columns.some((column) => column.name === 'notify_on_comment')) {
    return;
  }

  db.exec('ALTER TABLE users ADD COLUMN notify_on_comment INTEGER NOT NULL DEFAULT 0');
}

function initializeDatabase(db) {
  applySchema(db);
  ensureCommentAttachmentsTable(db);
  ensureCommentParentIdColumn(db);
  ensureUserDisplayNameColumn(db);
  ensureUserNotifyOnCommentColumn(db);
  ensureDefaultAdmin(db);
  ensureWorkspaceOwnerMembers(db);
}

module.exports = {
  tableExists,
  initializeDatabase
};
