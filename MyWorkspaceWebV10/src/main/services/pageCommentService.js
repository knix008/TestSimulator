const { canEditPageContent, getPage } = require('./pageService');
const {
  getAttachmentsByCommentIds,
  saveAttachments,
  updateCommentAttachments
} = require('./commentAttachmentService');
const { notifyWorkspaceCommentAdded } = require('./notificationService');

const MAX_CONTENT_LENGTH = 8000;
const MAX_QUOTED_TEXT_LENGTH = 2000;

function ensurePageAccess(db, user, pageId) {
  const page = getPage(db, user, pageId);
  if (!page) {
    throw new Error('Page에 접근할 수 없습니다.');
  }
  return page;
}

function normalizeContent(content, { allowEmpty = false } = {}) {
  const normalized = (content || '').trim();
  if (!normalized && !allowEmpty) {
    throw new Error('댓글 내용 또는 첨부 파일을 입력하세요.');
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

function normalizeParentId(parentId) {
  if (parentId == null || parentId === '') {
    return null;
  }
  const parsed = Number(parentId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('유효하지 않은 답글 대상입니다.');
  }
  return parsed;
}

function resolveAuthorUsername(row) {
  return String(row.author_username || row.username || '').trim();
}

function resolveAuthorDisplayName(row) {
  return String(row.author_display_name || '').trim();
}

function mapComment(row, context, attachments = [], authorLookup = {}, depthLookup = {}) {
  const parentId = row.parent_id || null;
  const authorUsername = resolveAuthorUsername(row);
  const authorDisplayName = resolveAuthorDisplayName(row);
  return {
    id: row.id,
    pageId: row.page_id,
    userId: row.user_id,
    authorUsername,
    authorDisplayName,
    content: row.content,
    quotedText: row.quoted_text || null,
    parentId,
    depth: depthLookup[row.id] || 0,
    replyToUsername: parentId ? authorLookup[parentId] || null : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments,
    canEdit: row.user_id === context.userId,
    canDelete: row.user_id === context.userId || context.canEditPage
  };
}

function buildAuthorLookup(rows) {
  const lookup = {};
  for (const row of rows) {
    lookup[row.id] = resolveAuthorUsername(row);
  }
  return lookup;
}

function buildDepthLookup(rows) {
  const parentMap = new Map(rows.map((row) => [row.id, row.parent_id || null]));
  const depthLookup = {};

  function getDepth(commentId) {
    if (depthLookup[commentId] != null) {
      return depthLookup[commentId];
    }

    let depth = 0;
    let currentParentId = parentMap.get(commentId);
    const visited = new Set();

    while (currentParentId) {
      if (visited.has(currentParentId)) {
        break;
      }
      visited.add(currentParentId);
      depth += 1;
      currentParentId = parentMap.get(currentParentId) || null;
    }

    depthLookup[commentId] = depth;
    return depth;
  }

  for (const row of rows) {
    getDepth(row.id);
  }

  return depthLookup;
}

const COMMENT_SELECT = `
  SELECT
    pc.*,
    u.username AS author_username,
    u.display_name AS author_display_name
  FROM page_comments pc
  LEFT JOIN users u ON u.id = pc.user_id
`;

function getCommentRowById(db, commentId) {
  return db.prepare(`${COMMENT_SELECT} WHERE pc.id = ?`).get(commentId);
}

function getCommentRowsByIds(db, commentIds = []) {
  const normalizedIds = [...new Set(commentIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!normalizedIds.length) {
    return [];
  }
  const placeholders = normalizedIds.map(() => '?').join(', ');
  return db.prepare(`${COMMENT_SELECT} WHERE pc.id IN (${placeholders})`).all(...normalizedIds);
}
function getCommentDepth(db, commentId) {
  let depth = 0;
  let parentId = db.prepare('SELECT parent_id FROM page_comments WHERE id = ?').get(commentId)?.parent_id || null;
  const visited = new Set();

  while (parentId) {
    if (visited.has(parentId)) {
      break;
    }
    visited.add(parentId);
    depth += 1;
    parentId = db.prepare('SELECT parent_id FROM page_comments WHERE id = ?').get(parentId)?.parent_id || null;
  }

  return depth;
}

function getComments(db, user, pageId) {
  ensurePageAccess(db, user, pageId);
  const canEditPage = canEditPageContent(db, user, pageId);

  const rows = db
    .prepare(
      `${COMMENT_SELECT}
       WHERE pc.page_id = ?
       ORDER BY pc.created_at ASC`
    )
    .all(pageId);

  const authorLookup = buildAuthorLookup(rows);
  const depthLookup = buildDepthLookup(rows);
  const attachmentMap = getAttachmentsByCommentIds(
    db,
    rows.map((row) => row.id)
  );

  return rows.map((row) =>
    mapComment(
      row,
      { userId: user.id, canEditPage },
      attachmentMap.get(row.id) || [],
      authorLookup,
      depthLookup
    )
  );
}

function ensureValidParentComment(db, pageId, parentId) {
  if (parentId == null) {
    return null;
  }

  const parent = db.prepare('SELECT id, page_id FROM page_comments WHERE id = ?').get(parentId);
  if (!parent) {
    throw new Error('답글 대상 댓글을 찾을 수 없습니다.');
  }
  if (parent.page_id !== pageId) {
    throw new Error('같은 Page의 댓글에만 답글을 달 수 있습니다.');
  }
  return parent;
}

function addComment(db, user, pageId, content, quotedText = null, attachments = [], parentId = null) {
  ensurePageAccess(db, user, pageId);
  const normalizedParentId = normalizeParentId(parentId);
  ensureValidParentComment(db, pageId, normalizedParentId);

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const normalized = normalizeContent(content, { allowEmpty: hasAttachments });
  const normalizedQuote = normalizeQuotedText(quotedText);
  const now = new Date().toISOString();

  const insertComment = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO page_comments
         (page_id, user_id, username, content, quoted_text, parent_id, created_at, updated_at)
         VALUES (@pageId, @userId, @username, @content, @quotedText, @parentId, @createdAt, @updatedAt)`
      )
      .run({
        pageId,
        userId: user.id,
        username: user.username,
        content: normalized,
        quotedText: normalizedQuote,
        parentId: normalizedParentId,
        createdAt: now,
        updatedAt: now
      });

    const commentId = result.lastInsertRowid;
    const savedAttachments = saveAttachments(db, commentId, attachments);
    const row = getCommentRowById(db, commentId);
    const authorLookup = buildAuthorLookup(
      normalizedParentId
        ? getCommentRowsByIds(db, [normalizedParentId])
        : []
    );
    const depthLookup = { [commentId]: getCommentDepth(db, commentId) };
    return mapComment(
      row,
      {
        userId: user.id,
        canEditPage: canEditPageContent(db, user, pageId)
      },
      savedAttachments,
      authorLookup,
      depthLookup
    );
  });

  const comment = insertComment();
  notifyWorkspaceCommentAdded(db, pageId, user, comment);
  return comment;
}

function updateComment(db, user, commentId, content, attachments = [], removeAttachmentIds = []) {
  const comment = db.prepare('SELECT * FROM page_comments WHERE id = ?').get(commentId);
  if (!comment) {
    throw new Error('댓글을 찾을 수 없습니다.');
  }

  ensurePageAccess(db, user, comment.page_id);
  if (comment.user_id !== user.id) {
    throw new Error('댓글을 수정할 권한이 없습니다.');
  }

  const updateCommentTx = db.transaction(() => {
    const existingAttachments = updateCommentAttachments(db, commentId, {
      attachments,
      removeAttachmentIds
    });
    const normalized = normalizeContent(content, { allowEmpty: existingAttachments.length > 0 });
    const now = new Date().toISOString();
    db.prepare('UPDATE page_comments SET content = ?, updated_at = ? WHERE id = ?').run(
      normalized,
      now,
      commentId
    );

    const row = getCommentRowById(db, commentId);
    const authorLookup = comment.parent_id
      ? buildAuthorLookup(getCommentRowsByIds(db, [comment.parent_id]))
      : {};
    const depthLookup = { [commentId]: getCommentDepth(db, commentId) };
    return mapComment(
      row,
      {
        userId: user.id,
        canEditPage: canEditPageContent(db, user, comment.page_id)
      },
      existingAttachments,
      authorLookup,
      depthLookup
    );
  });

  return updateCommentTx();
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
