const { canEditWorkspaceContent } = require('./workspaceService');

function mapMember(row) {
  return {
    userId: row.user_id,
    username: row.username,
    role: row.role
  };
}

function ensureOwnerMember(db, workspaceId) {
  const workspace = db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return;
  }

  const existing = db
    .prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, workspace.owner_id);
  if (!existing) {
    db.prepare(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
    ).run(workspaceId, workspace.owner_id, 'Owner');
  }
}

function getMembers(db, user, workspaceId) {
  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Workspace 멤버를 조회할 권한이 없습니다.');
  }

  ensureOwnerMember(db, workspaceId);

  const rows = db
    .prepare(
      `SELECT wm.user_id, wm.role, u.username
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ?
       ORDER BY u.username COLLATE NOCASE`
    )
    .all(workspaceId);

  return rows.map(mapMember);
}

function addMember(db, user, workspaceId, userId, role) {
  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Workspace 멤버를 추가할 권한이 없습니다.');
  }
  if (role === 'Owner') {
    throw new Error('Owner 역할은 Workspace 생성 시 자동으로 지정됩니다.');
  }
  if (
    db
      .prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .get(workspaceId, userId)
  ) {
    throw new Error('이미 등록된 멤버입니다.');
  }

  db.prepare(
    'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)'
  ).run(workspaceId, userId, role);
}

function removeMember(db, user, workspaceId, userId) {
  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Workspace 멤버를 제거할 권한이 없습니다.');
  }

  const member = db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, userId);
  if (!member) {
    return;
  }
  if (member.role === 'Owner') {
    throw new Error('Owner는 제거할 수 없습니다.');
  }

  db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(
    workspaceId,
    userId
  );
}

function updateMemberRole(db, user, workspaceId, userId, role) {
  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Workspace 멤버 역할을 변경할 권한이 없습니다.');
  }
  if (role === 'Owner') {
    throw new Error('Owner 역할은 변경할 수 없습니다.');
  }

  const member = db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, userId);
  if (!member) {
    throw new Error('멤버를 찾을 수 없습니다.');
  }
  if (member.role === 'Owner') {
    throw new Error('Owner 역할은 변경할 수 없습니다.');
  }

  db.prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?').run(
    role,
    workspaceId,
    userId
  );
}

function getAvailableUsers(db, user, workspaceId) {
  getMembers(db, user, workspaceId);
  const memberIds = new Set(
    db
      .prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?')
      .all(workspaceId)
      .map((row) => row.user_id)
  );

  return db
    .prepare('SELECT id, username, role FROM users ORDER BY username COLLATE NOCASE')
    .all()
    .filter((row) => !memberIds.has(row.id))
    .map((row) => ({ id: row.id, username: row.username, role: row.role }));
}

module.exports = {
  getMembers,
  addMember,
  removeMember,
  updateMemberRole,
  getAvailableUsers,
  ensureOwnerMember
};
