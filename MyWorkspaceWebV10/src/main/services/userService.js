const { hashPassword, verifyPassword } = require('./passwordHasher');
const { mapUser } = require('./authService');

function getAllUsers(db) {
  return db
    .prepare('SELECT * FROM users ORDER BY username ASC')
    .all()
    .map(mapUser);
}

function getUserById(db, id) {
  return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function createUser(db, username, password, role = 'User') {
  const normalized = (username || '').trim();
  if (!normalized) {
    throw new Error('사용자 ID를 입력하세요.');
  }
  if (!password) {
    throw new Error('비밀번호를 입력하세요.');
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(normalized)) {
    throw new Error('이미 존재하는 사용자 ID입니다.');
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(normalized, hashPassword(password), role, now, now);

  return getUserById(db, result.lastInsertRowid);
}

function updateUser(db, id, username, role, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  const normalized = (username || '').trim();
  if (!normalized) {
    throw new Error('사용자 ID를 입력하세요.');
  }
  if (db.prepare('SELECT 1 FROM users WHERE id != ? AND username = ?').get(id, normalized)) {
    throw new Error('이미 존재하는 사용자 ID입니다.');
  }

  const now = new Date().toISOString();
  if (newPassword) {
    db.prepare(
      'UPDATE users SET username = ?, role = ?, password_hash = ?, updated_at = ? WHERE id = ?'
    ).run(normalized, role, hashPassword(newPassword), now, id);
  } else {
    db.prepare('UPDATE users SET username = ?, role = ?, updated_at = ? WHERE id = ?').run(
      normalized,
      role,
      now,
      id
    );
  }

  return getUserById(db, id);
}

function updateOwnProfile(db, userId, username) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  const normalized = (username || '').trim();
  if (!normalized) {
    throw new Error('사용자 ID를 입력하세요.');
  }
  if (db.prepare('SELECT 1 FROM users WHERE id != ? AND username = ?').get(userId, normalized)) {
    throw new Error('이미 존재하는 사용자 ID입니다.');
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(
    normalized,
    now,
    userId
  );

  return getUserById(db, userId);
}

function updateNotificationSettings(db, userId, email, notifyOnPageUpdate, notifyOnWorkspaceChange) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE users
     SET email = ?, notify_on_page_update = ?, notify_on_workspace_change = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    email?.trim() || null,
    notifyOnPageUpdate ? 1 : 0,
    notifyOnWorkspaceChange ? 1 : 0,
    now,
    userId
  );

  return getUserById(db, userId);
}

function changePassword(db, userId, currentPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }
  if (!currentPassword) {
    throw new Error('현재 비밀번호를 입력하세요.');
  }
  if (!newPassword) {
    throw new Error('새 비밀번호를 입력하세요.');
  }
  if (!verifyPassword(currentPassword, user.password_hash)) {
    throw new Error('현재 비밀번호가 올바르지 않습니다.');
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(newPassword),
    now,
    userId
  );
}

function deleteUser(db, id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return;
  }

  const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'Admin'").get()
    .count;
  if (user.role === 'Admin' && adminCount <= 1) {
    throw new Error('마지막 관리자 계정은 삭제할 수 없습니다.');
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateOwnProfile,
  updateNotificationSettings,
  changePassword,
  deleteUser
};
