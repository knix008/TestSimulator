const { canEditPageContent, getPage } = require('./pageService');
const MAX_CONTENT_LENGTH = 8000;
const MAX_QUOTED_TEXT_LENGTH = 2000;

function ensurePageAccess(db, user, pageId) {
  const page = getPage(db, user, pageId);
  if (!page) {
    throw new Error('Page에 접근할 수 없습니다.');
  }
  return page;
}

function normalizeContent(content) {
  const normalized = (content || '').trim();
  if (!normalized) {
    throw new Error('댓글 내용을 입력하세요.');
  }
  if (normalized.length > MAX_CONTENT_LENGTH) {
    throw new Error(`댓글은 ${MAX_CONTENT_LENGTH}자 이하여야 합니다.`);
  }
  return normalized;
}

function normalizeQuotedText(quotedText) {
  if (!quotedText) {
    return null;
  }
  const normalized = quotedText.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > MAX_QUOTED_TEXT_LENGTH) {
    return normalized.slice(0, MAX_QUOTED_TEXT_LENGTH);
  }
  return normalized;
}

function mapComment(row, context) {
  return {
    id: row.id,
    pageId: row.page_id,
    userId: row.user_id,
    authorUsername: row.username,
    content: row.content,
    quotedText: row.quoted_text || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canEdit: row.user_id === context.userId,
    canDelete: row.user_id === context.userId || context.canEditPage
  };
}

function getComments(db, user, pageId) {
  ensurePageAccess(db, user, pageId);
  const canEditPage = canEditPageContent(db, user, pageId);

  const rows = db
    .prepare(
      `SELECT * FROM page_comments
       WHERE page_id = ?
       ORDER BY created_at ASC`
    )
    .all(pageId);

  return rows.map((row) =>
    mapComment(row, { userId: user.id, canEditPage })
  );
}

function addComment(db, user, pageId, content, quotedText = null) {
  ensurePageAccess(db, user, pageId);
  const normalized = normalizeContent(content);
  const normalizedQuote = normalizeQuotedText(quotedText);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO page_comments
       (page_id, user_id, username, content, quoted_text, created_at, updated_at)
       VALUES (@pageId, @userId, @username, @content, @quotedText, @createdAt, @updatedAt)`
    )
    .run({
      pageId,
      userId: user.id,
      username: user.username,
      content: normalized,
      quotedText: normalizedQuote,
      createdAt: now,
      updatedAt: now
    });

  const row = db.prepare('SELECT * FROM page_comments WHERE id = ?').get(result.lastInsertRowid);
  return mapComment(row, { userId: user.id, canEditPage: canEditPageContent(db, user, pageId) });
}

function updateComment(db, user, commentId, content) {
  const comment = db.prepare('SELECT * FROM page_comments WHERE id = ?').get(commentId);
  if (!comment) {
    throw new Error('댓글을 찾을 수 없습니다.');
  }

  ensurePageAccess(db, user, comment.page_id);
  if (comment.user_id !== user.id) {
    throw new Error('댓글을 수정할 권한이 없습니다.');
  }

  const normalized = normalizeContent(content);
  const now = new Date().toISOString();
  db.prepare('UPDATE page_comments SET content = ?, updated_at = ? WHERE id = ?').run(
    normalized,
    now,
    commentId
  );

  const row = db.prepare('SELECT * FROM page_comments WHERE id = ?').get(commentId);
  return mapComment(row, {
    userId: user.id,
    canEditPage: canEditPageContent(db, user, comment.page_id)
  });
}

function deleteComment(db, user, commentId) {
  const comment = db.prepare('SELECT * FROM page_comments WHERE id = ?').get(commentId);
  if (!comment) {
    throw new Error('댓글을 찾을 수 없습니다.');
  }

  ensurePageAccess(db, user, comment.page_id);
  if (comment.user_id !== user.id && !canEditPageContent(db, user, comment.page_id)) {
    throw new Error('댓글을 삭제할 권한이 없습니다.');
  }

  db.prepare('DELETE FROM page_comments WHERE id = ?').run(commentId);
}

module.exports = {
  getComments,
  addComment,
  updateComment,
  deleteComment
};
