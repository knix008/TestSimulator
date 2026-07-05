const { verifyPassword } = require('./passwordHasher');

function mapUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    email: row.email || '',
    notifyOnPageUpdate: Boolean(row.notify_on_page_update),
    notifyOnWorkspaceChange: Boolean(row.notify_on_workspace_change),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function login(db, username, password) {
  const normalized = (username || '').trim();
  if (!normalized) {
    return { ok: false, message: '사용자 ID를 입력하세요.' };
  }
  if (!password) {
    return { ok: false, message: '비밀번호를 입력하세요.' };
  }

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(normalized);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return { ok: false, message: 'ID 또는 비밀번호가 올바르지 않습니다.' };
  }

  return { ok: true, user: mapUser(row) };
}

module.exports = {
  login,
  mapUser
};
