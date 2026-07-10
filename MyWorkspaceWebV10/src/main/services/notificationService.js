function mapNotification(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    kind: row.kind,
    title: row.title,
    body: row.body,
    workspaceId: row.workspace_id,
    pageId: row.page_id,
    createdAt: row.created_at,
    isRead: Boolean(row.is_read)
  };
}

function getNotifications(db, userId, { limit = 50 } = {}) {
  const rows = db
    .prepare(
      `SELECT *
       FROM user_notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, limit);

  return rows.map(mapNotification);
}

function getUnreadNotificationCount(db, userId) {
  return db
    .prepare('SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND is_read = 0')
    .get(userId).count;
}

function getNotificationSummary(db, userId) {
  const total = db
    .prepare('SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ?')
    .get(userId).count;
  const unread = getUnreadNotificationCount(db, userId);
  return { total, unread };
}

function markNotificationRead(db, userId, notificationId) {
  const row = db
    .prepare('SELECT * FROM user_notifications WHERE id = ? AND user_id = ?')
    .get(notificationId, userId);
  if (!row) {
    throw new Error('알림을 찾을 수 없습니다.');
  }

  db.prepare('UPDATE user_notifications SET is_read = 1 WHERE id = ?').run(notificationId);
  return mapNotification({ ...row, is_read: 1 });
}

function markAllNotificationsRead(db, userId) {
  db.prepare('UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
  return getUnreadNotificationCount(db, userId);
}

function deleteNotification(db, userId, notificationId) {
  const row = db
    .prepare('SELECT id FROM user_notifications WHERE id = ? AND user_id = ?')
    .get(notificationId, userId);
  if (!row) {
    throw new Error('알림을 찾을 수 없습니다.');
  }

  db.prepare('DELETE FROM user_notifications WHERE id = ?').run(notificationId);
  return getUnreadNotificationCount(db, userId);
}

function deleteAllNotifications(db, userId) {
  db.prepare('DELETE FROM user_notifications WHERE user_id = ?').run(userId);
  return 0;
}

function createNotification(
  db,
  {
    userId,
    actorUserId,
    actorUsername,
    kind,
    title,
    body,
    workspaceId,
    pageId = null
  }
) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO user_notifications
       (user_id, actor_user_id, actor_username, kind, title, body, workspace_id, page_id, created_at, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(userId, actorUserId, actorUsername, kind, title, body, workspaceId, pageId, now);

  return mapNotification(
    db.prepare('SELECT * FROM user_notifications WHERE id = ?').get(result.lastInsertRowid)
  );
}

function notifyWorkspaceCommentAdded(db, pageId, actor, comment) {
  const page = db.prepare('SELECT workspace_id, title FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return [];
  }

  const recipients = db
    .prepare(
      `SELECT DISTINCT u.id
       FROM users u
       WHERE u.id != ?
         AND u.notify_on_comment = 1
         AND (
           u.id IN (SELECT user_id FROM workspace_members WHERE workspace_id = ?)
           OR u.id = (SELECT owner_id FROM workspaces WHERE id = ?)
         )`
    )
    .all(actor.id, page.workspace_id, page.workspace_id);

  const preview = String(comment.content || '').trim().slice(0, 120);
  const body = preview || '첨부 파일이 포함된 댓글입니다.';
  const created = [];

  for (const recipient of recipients) {
    created.push(
      createNotification(db, {
        userId: recipient.id,
        actorUserId: actor.id,
        actorUsername: actor.username,
        kind: 'comment',
        title: `${page.title}에 새 댓글`,
        body,
        workspaceId: page.workspace_id,
        pageId
      })
    );
  }

  return created;
}

module.exports = {
  getNotifications,
  getUnreadNotificationCount,
  getNotificationSummary,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  createNotification,
  notifyWorkspaceCommentAdded
};
