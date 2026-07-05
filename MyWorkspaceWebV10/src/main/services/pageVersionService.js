function getVersions(db, user, pageId, { canAccessWorkspace, getPageWorkspaceId }) {
  const workspaceId = getPageWorkspaceId(pageId);
  if (!workspaceId || !canAccessWorkspace(user, workspaceId)) {
    throw new Error('Page에 접근할 수 없습니다.');
  }

  return db
    .prepare(
      `SELECT v.id, v.page_id AS pageId, v.title, v.content, v.saved_at AS savedAt, u.username AS savedByUsername
       FROM page_versions v
       JOIN users u ON u.id = v.saved_by_user_id
       WHERE v.page_id = ?
       ORDER BY v.saved_at DESC`
    )
    .all(pageId);
}

function getVersion(db, user, versionId, { canAccessWorkspace, getPageWorkspaceId }) {
  const version = db
    .prepare(
      `SELECT v.*, u.username AS savedByUsername
       FROM page_versions v
       JOIN users u ON u.id = v.saved_by_user_id
       WHERE v.id = ?`
    )
    .get(versionId);

  if (!version) {
    return null;
  }

  const workspaceId = getPageWorkspaceId(version.page_id);
  if (!workspaceId || !canAccessWorkspace(user, workspaceId)) {
    return null;
  }

  return {
    id: version.id,
    pageId: version.page_id,
    title: version.title,
    content: version.content,
    savedAt: version.saved_at,
    savedByUsername: version.savedByUsername
  };
}

function restoreVersion(db, user, versionId, { canEditWorkspaceContent, getPageWorkspaceId, savePage }) {
  const version = getVersion(db, user, versionId, {
    canAccessWorkspace: (u, wsId) => canEditWorkspaceContent(u, wsId),
    getPageWorkspaceId
  });

  if (!version) {
    throw new Error('버전을 찾을 수 없습니다.');
  }

  const workspaceId = getPageWorkspaceId(version.pageId);
  if (!workspaceId || !canEditWorkspaceContent(user, workspaceId)) {
    throw new Error('Page를 수정할 권한이 없습니다.');
  }

  return savePage(db, user, {
    pageId: version.pageId,
    title: version.title,
    content: version.content
  });
}

module.exports = {
  getVersions,
  getVersion,
  restoreVersion
};
