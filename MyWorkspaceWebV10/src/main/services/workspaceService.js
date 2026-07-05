const { orderByName, makeUnique } = require('../utils/nameHelper');

const TreeNodeKind = {
  FavoritesRoot: 'FavoritesRoot',
  Workspace: 'Workspace',
  Page: 'Page'
};

function isAdmin(user) {
  return user?.role === 'Admin';
}

function getAccessibleWorkspaceIds(db, user) {
  if (isAdmin(user)) {
    return db.prepare('SELECT id FROM workspaces').all().map((row) => row.id);
  }

  const owned = db
    .prepare('SELECT id FROM workspaces WHERE owner_id = ?')
    .all(user.id)
    .map((row) => row.id);
  const member = db
    .prepare('SELECT workspace_id AS id FROM workspace_members WHERE user_id = ?')
    .all(user.id)
    .map((row) => row.id);
  return [...new Set([...owned, ...member])];
}

function canManageWorkspace(db, user, workspaceId) {
  if (isAdmin(user)) {
    return true;
  }

  const workspace = db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return false;
  }
  if (workspace.owner_id === user.id) {
    return true;
  }

  const member = db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, user.id);
  return member?.role === 'Editor' || member?.role === 'Owner';
}

function isWorkspaceDirectlyLocked(db, workspaceId) {
  const row = db.prepare('SELECT locked_by_user_id FROM workspaces WHERE id = ?').get(workspaceId);
  return row?.locked_by_user_id != null;
}

function hasLockedAncestorWorkspace(db, workspaceId) {
  let currentId = workspaceId;
  while (currentId != null) {
    const row = db.prepare('SELECT parent_id, locked_by_user_id FROM workspaces WHERE id = ?').get(currentId);
    if (!row) {
      return false;
    }
    if (row.locked_by_user_id != null && currentId !== workspaceId) {
      return true;
    }
    currentId = row.parent_id;
  }
  return false;
}

function isWorkspaceLocked(db, workspaceId) {
  return isWorkspaceDirectlyLocked(db, workspaceId) || hasLockedAncestorWorkspace(db, workspaceId);
}

function getEffectiveWorkspaceLockUserId(db, workspaceId) {
  let currentId = workspaceId;
  while (currentId != null) {
    const row = db.prepare('SELECT parent_id, locked_by_user_id FROM workspaces WHERE id = ?').get(currentId);
    if (!row) {
      return null;
    }
    if (row.locked_by_user_id != null) {
      return row.locked_by_user_id;
    }
    currentId = row.parent_id;
  }
  return null;
}

function getSubtreeWorkspaceIds(db, workspaceId) {
  const ids = [];
  const queue = [workspaceId];
  while (queue.length) {
    const id = queue.shift();
    ids.push(id);
    const children = db.prepare('SELECT id FROM workspaces WHERE parent_id = ?').all(id);
    for (const child of children) {
      queue.push(child.id);
    }
  }
  return ids;
}

function canEditWorkspaceContent(db, user, workspaceId) {
  if (!canManageWorkspace(db, user, workspaceId)) {
    return false;
  }

  const lockedByUserId = getEffectiveWorkspaceLockUserId(db, workspaceId);
  if (!lockedByUserId) {
    return true;
  }
  if (isAdmin(user)) {
    return true;
  }
  return lockedByUserId === user.id;
}

function canFavoriteWorkspace(db, user, workspaceId) {
  if (!db.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(workspaceId)) {
    return false;
  }
  if (isAdmin(user)) {
    return getAccessibleWorkspaceIds(db, user).includes(workspaceId);
  }
  return canManageWorkspace(db, user, workspaceId);
}

function canLockWorkspace(db, user, workspaceId) {
  return canManageWorkspace(db, user, workspaceId) && !isWorkspaceLocked(db, workspaceId);
}

function canUnlockWorkspace(db, user, workspaceId) {
  if (!isWorkspaceDirectlyLocked(db, workspaceId)) {
    return false;
  }
  if (hasLockedAncestorWorkspace(db, workspaceId)) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  const row = db.prepare('SELECT locked_by_user_id FROM workspaces WHERE id = ?').get(workspaceId);
  return row?.locked_by_user_id === user.id;
}

function lockWorkspace(db, user, workspaceId) {
  if (!canLockWorkspace(db, user, workspaceId)) {
    throw new Error('Workspace를 잠글 권한이 없습니다.');
  }

  const subtreeIds = getSubtreeWorkspaceIds(db, workspaceId);
  const now = new Date().toISOString();

  for (const id of subtreeIds) {
    const workspace = db.prepare('SELECT locked_by_user_id FROM workspaces WHERE id = ?').get(id);
    if (workspace?.locked_by_user_id != null) {
      continue;
    }
    db.prepare('UPDATE workspaces SET locked_by_user_id = ?, locked_at = ?, updated_at = ? WHERE id = ?').run(
      user.id,
      now,
      now,
      id
    );
  }

  const pages = db
    .prepare(`SELECT id FROM pages WHERE workspace_id IN (${subtreeIds.map(() => '?').join(',')})`)
    .all(...subtreeIds);
  for (const page of pages) {
    const row = db.prepare('SELECT locked_by_user_id FROM pages WHERE id = ?').get(page.id);
    if (row?.locked_by_user_id != null) {
      continue;
    }
    db.prepare('UPDATE pages SET locked_by_user_id = ?, locked_at = ?, updated_at = ? WHERE id = ?').run(
      user.id,
      now,
      now,
      page.id
    );
  }
}

function unlockWorkspace(db, user, workspaceId) {
  if (!canUnlockWorkspace(db, user, workspaceId)) {
    throw new Error('Workspace 잠금을 해제할 권한이 없습니다.');
  }

  const subtreeIds = getSubtreeWorkspaceIds(db, workspaceId);
  const now = new Date().toISOString();

  for (const id of subtreeIds) {
    db.prepare(
      'UPDATE workspaces SET locked_by_user_id = NULL, locked_at = NULL, updated_at = ? WHERE id = ?'
    ).run(now, id);
  }

  const pages = db
    .prepare(`SELECT id FROM pages WHERE workspace_id IN (${subtreeIds.map(() => '?').join(',')})`)
    .all(...subtreeIds);
  for (const page of pages) {
    db.prepare('UPDATE pages SET locked_by_user_id = NULL, locked_at = NULL, updated_at = ? WHERE id = ?').run(
      now,
      page.id
    );
  }
}

function buildWorkspaceNode(workspace, workspaces, pages, favoriteIds, ancestorLocked = false) {
  const selfLocked = workspace.locked_by_user_id != null;
  const effectivelyLocked = ancestorLocked || selfLocked;

  const childWorkspaces = orderByName(
    workspaces.filter((item) => item.parent_id === workspace.id),
    (item) => item.name
  ).map((item) => buildWorkspaceNode(item, workspaces, pages, favoriteIds, effectivelyLocked));

  const childPages = orderByName(
    pages.filter((item) => item.workspace_id === workspace.id),
    (item) => item.title
  ).map((page) => {
    const pageSelfLocked = page.locked_by_user_id != null;
    return {
      kind: TreeNodeKind.Page,
      id: page.id,
      name: page.title,
      workspaceId: page.workspace_id,
      isLocked: effectivelyLocked || pageSelfLocked,
      lockedByUserId: pageSelfLocked ? page.locked_by_user_id : null,
      children: []
    };
  });

  return {
    kind: TreeNodeKind.Workspace,
    id: workspace.id,
    name: workspace.name,
    parentId: workspace.parent_id,
    isFavorite: favoriteIds.has(workspace.id),
    isLocked: effectivelyLocked,
    lockedByUserId: selfLocked ? workspace.locked_by_user_id : null,
    children: [...childWorkspaces, ...childPages]
  };
}

function loadTreeData(db, user) {
  const accessibleIds = new Set(getAccessibleWorkspaceIds(db, user));
  if (accessibleIds.size === 0) {
    return { favorites: [], roots: [] };
  }

  const workspaces = orderByName(
    db
      .prepare('SELECT * FROM workspaces')
      .all()
      .filter((row) => accessibleIds.has(row.id)),
    (row) => row.name
  );

  const pages = orderByName(
    db
      .prepare('SELECT * FROM pages')
      .all()
      .filter((row) => accessibleIds.has(row.workspace_id)),
    (row) => row.title
  );

  const favoriteIds = new Set(
    db
      .prepare('SELECT workspace_id FROM workspace_favorites WHERE user_id = ?')
      .all(user.id)
      .map((row) => row.workspace_id)
  );

  const roots = workspaces
    .filter((workspace) => workspace.parent_id == null || !accessibleIds.has(workspace.parent_id))
    .map((workspace) => buildWorkspaceNode(workspace, workspaces, pages, favoriteIds));

  const favorites = orderByName(
    workspaces.filter(
      (workspace) =>
        favoriteIds.has(workspace.id) && accessibleIds.has(workspace.id) && canFavoriteWorkspace(db, user, workspace.id)
    ),
    (row) => row.name
  ).map((workspace) => buildWorkspaceNode(workspace, workspaces, pages, favoriteIds));

  return { favorites, roots };
}

function getWorkspaceTree(db, user) {
  const { favorites, roots } = loadTreeData(db, user);
  const nodes = [];

  if (favorites.length) {
    nodes.push({
      kind: TreeNodeKind.FavoritesRoot,
      id: 0,
      name: '즐겨찾기',
      children: favorites
    });
  }

  return [...nodes, ...roots];
}

function createWorkspace(db, user, { name, parentId = null }) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error('Workspace 이름을 입력하세요.');
  }

  if (parentId != null && !getAccessibleWorkspaceIds(db, user).includes(parentId)) {
    throw new Error('상위 Workspace에 접근할 수 없습니다.');
  }

  const siblings = db
    .prepare('SELECT name FROM workspaces WHERE parent_id IS ?')
    .all(parentId)
    .map((row) => row.name);
  const uniqueName = makeUnique(trimmed, siblings);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO workspaces (parent_id, name, owner_id, created_at, updated_at)
       VALUES (@parentId, @name, @ownerId, @createdAt, @updatedAt)`
    )
    .run({
      parentId,
      name: uniqueName,
      ownerId: user.id,
      createdAt: now,
      updatedAt: now
    });

  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(
    result.lastInsertRowid,
    user.id,
    'Owner'
  );

  return {
    id: result.lastInsertRowid,
    name: uniqueName,
    parentId
  };
}

function renameWorkspace(db, user, workspaceId, name) {
  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Workspace 이름을 변경할 권한이 없습니다.');
  }

  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error('Workspace 이름을 입력하세요.');
  }

  const workspace = db.prepare('SELECT id, parent_id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    throw new Error('Workspace를 찾을 수 없습니다.');
  }

  const siblings = db
    .prepare('SELECT name FROM workspaces WHERE parent_id IS ? AND id != ?')
    .all(workspace.parent_id, workspaceId)
    .map((row) => row.name);
  const uniqueName = makeUnique(trimmed, siblings);
  const now = new Date().toISOString();

  db.prepare('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?').run(uniqueName, now, workspaceId);
  return { id: workspaceId, name: uniqueName };
}

function deleteWorkspace(db, user, workspaceId, userConfirmed) {
  if (!userConfirmed) {
    throw new Error('Workspace 삭제는 사용자 확인 후에만 가능합니다.');
  }
  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Workspace를 삭제할 권한이 없습니다.');
  }

  const workspace = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    throw new Error('Workspace를 찾을 수 없습니다.');
  }

  const childCount = db
    .prepare('SELECT COUNT(*) AS count FROM workspaces WHERE parent_id = ?')
    .get(workspaceId).count;
  if (childCount > 0) {
    throw new Error('하위 Workspace가 있으면 삭제할 수 없습니다.');
  }

  db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
}

function setFavorite(db, user, workspaceId, isFavorite) {
  if (!canFavoriteWorkspace(db, user, workspaceId)) {
    throw new Error('등록된 Workspace만 즐겨찾기에 추가할 수 있습니다.');
  }

  const existing = db
    .prepare('SELECT 1 FROM workspace_favorites WHERE user_id = ? AND workspace_id = ?')
    .get(user.id, workspaceId);

  if (isFavorite) {
    if (!existing) {
      db.prepare('INSERT INTO workspace_favorites (user_id, workspace_id) VALUES (?, ?)').run(user.id, workspaceId);
    }
  } else if (existing) {
    db.prepare('DELETE FROM workspace_favorites WHERE user_id = ? AND workspace_id = ?').run(user.id, workspaceId);
  }
}

function isFavorite(db, user, workspaceId) {
  return Boolean(
    db.prepare('SELECT 1 FROM workspace_favorites WHERE user_id = ? AND workspace_id = ?').get(user.id, workspaceId)
  );
}

module.exports = {
  TreeNodeKind,
  getWorkspaceTree,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  setFavorite,
  isFavorite,
  canEditWorkspaceContent,
  canManageWorkspace,
  canFavoriteWorkspace,
  canLockWorkspace,
  canUnlockWorkspace,
  lockWorkspace,
  unlockWorkspace,
  isWorkspaceLocked,
  getEffectiveWorkspaceLockUserId,
  getAccessibleWorkspaceIds
};
