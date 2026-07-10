const path = require('path');
const fs = require('fs');
const { getPage } = require('./pageService');

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_COMMENT = 10;
const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'];

function validateFileName(fileName) {
  if (!fileName || String(fileName).includes('..') || /[\\/]/.test(String(fileName))) {
    throw new Error('유효하지 않은 첨부 파일 이름입니다.');
  }
}

function normalizeExtension(extension) {
  if (!extension) {
    return '';
  }
  const normalized = String(extension).toLowerCase();
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

function guessContentType(fileName) {
  const ext = normalizeExtension(path.extname(fileName));
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.zip': 'application/zip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return map[ext] || 'application/octet-stream';
}

function guessExtensionFromMime(mime, fileName) {
  const normalizedMime = String(mime || '').toLowerCase();
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md'
  };
  if (map[normalizedMime]) {
    return map[normalizedMime];
  }
  const ext = path.extname(fileName || '');
  return ext || '.bin';
}

function isImageFileName(fileName) {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(normalizeExtension(path.extname(fileName)));
}

function isImageContentType(contentType) {
  return String(contentType || '').toLowerCase().startsWith('image/');
}

function allocateUniqueFileName(db, commentId, preferredFileName) {
  const ext = normalizeExtension(path.extname(preferredFileName || ''));
  let baseName = path.basename(preferredFileName || 'attachment', ext) || 'attachment';
  baseName = baseName.replace(/_\d+$/i, '').replace(/\s+\(\d+\)$/i, '') || 'attachment';

  const existing = new Set(
    db
      .prepare('SELECT file_name FROM comment_attachments WHERE comment_id = ?')
      .all(commentId)
      .map((row) => row.file_name.toLowerCase())
  );

  let candidate = `${baseName}${ext}`;
  if (!existing.has(candidate.toLowerCase())) {
    return candidate;
  }

  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    candidate = `${baseName}_${index}${ext}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${baseName}_${Date.now()}${ext}`;
}

function mapAttachment(row) {
  return {
    id: row.id,
    commentId: row.comment_id,
    fileName: row.file_name,
    contentType: row.content_type,
    isImage: isImageContentType(row.content_type) || isImageFileName(row.file_name),
    createdAt: row.created_at
  };
}

function getAttachmentsByCommentIds(db, commentIds) {
  if (!commentIds.length) {
    return new Map();
  }

  const placeholders = commentIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT * FROM comment_attachments
       WHERE comment_id IN (${placeholders})
       ORDER BY id ASC`
    )
    .all(...commentIds);

  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.comment_id) || [];
    list.push(mapAttachment(row));
    map.set(row.comment_id, list);
  }
  return map;
}

function normalizeIncomingAttachments(attachments) {
  if (!attachments) {
    return [];
  }
  if (!Array.isArray(attachments)) {
    throw new Error('첨부 파일 형식이 올바르지 않습니다.');
  }
  if (attachments.length > MAX_ATTACHMENTS_PER_COMMENT) {
    throw new Error(`첨부 파일은 댓글당 ${MAX_ATTACHMENTS_PER_COMMENT}개까지 가능합니다.`);
  }
  return attachments;
}

function decodeAttachmentBuffer(attachment) {
  const encoded = attachment?.dataBase64 ?? attachment?.data ?? '';
  if (!encoded) {
    throw new Error('첨부 파일 데이터가 비어 있습니다.');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length) {
    throw new Error('첨부 파일 데이터가 비어 있습니다.');
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`첨부 파일 크기는 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB 이하여야 합니다.`);
  }
  return buffer;
}

function saveAttachments(db, commentId, attachments) {
  const normalized = normalizeIncomingAttachments(attachments);
  if (!normalized.length) {
    return [];
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO comment_attachments
     (comment_id, file_name, content_type, data, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const saved = [];

  for (const attachment of normalized) {
    const buffer = decodeAttachmentBuffer(attachment);
    const preferredName = attachment.fileName || attachment.file_name || 'attachment';
    validateFileName(preferredName);
    const fileName = allocateUniqueFileName(db, commentId, preferredName);
    const contentType = attachment.contentType || attachment.content_type || guessContentType(fileName);
    const result = insert.run(commentId, fileName, contentType, buffer, now);
    const row = db.prepare('SELECT * FROM comment_attachments WHERE id = ?').get(result.lastInsertRowid);
    saved.push(mapAttachment(row));
  }

  return saved;
}

function countAttachments(db, commentId) {
  return db.prepare('SELECT COUNT(*) AS count FROM comment_attachments WHERE comment_id = ?').get(commentId).count;
}

function normalizeAttachmentIds(attachmentIds) {
  if (!attachmentIds?.length) {
    return [];
  }
  if (!Array.isArray(attachmentIds)) {
    throw new Error('첨부 파일 형식이 올바르지 않습니다.');
  }
  const normalized = attachmentIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (normalized.length !== attachmentIds.length) {
    throw new Error('유효하지 않은 첨부 파일입니다.');
  }
  return [...new Set(normalized)];
}

function deleteAttachmentsByIds(db, commentId, attachmentIds) {
  const normalizedIds = normalizeAttachmentIds(attachmentIds);
  if (!normalizedIds.length) {
    return;
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT id FROM comment_attachments
       WHERE comment_id = ? AND id IN (${placeholders})`
    )
    .all(commentId, ...normalizedIds);

  if (rows.length !== normalizedIds.length) {
    throw new Error('첨부 파일을 찾을 수 없습니다.');
  }

  db.prepare(
    `DELETE FROM comment_attachments
     WHERE comment_id = ? AND id IN (${placeholders})`
  ).run(commentId, ...normalizedIds);
}

function updateCommentAttachments(db, commentId, { attachments = [], removeAttachmentIds = [] } = {}) {
  const normalizedRemoveIds = normalizeAttachmentIds(removeAttachmentIds);
  const normalizedAttachments = normalizeIncomingAttachments(attachments);
  const currentCount = countAttachments(db, commentId);
  const nextCount = currentCount - normalizedRemoveIds.length + normalizedAttachments.length;

  if (nextCount > MAX_ATTACHMENTS_PER_COMMENT) {
    throw new Error(`첨부 파일은 댓글당 ${MAX_ATTACHMENTS_PER_COMMENT}개까지 가능합니다.`);
  }

  deleteAttachmentsByIds(db, commentId, normalizedRemoveIds);
  saveAttachments(db, commentId, normalizedAttachments);
  return getAttachmentsByCommentIds(db, [commentId]).get(commentId) || [];
}

function tryGetAttachmentBytes(db, user, attachmentId) {
  const row = db
    .prepare(
      `SELECT ca.*, pc.page_id
       FROM comment_attachments ca
       INNER JOIN page_comments pc ON pc.id = ca.comment_id
       WHERE ca.id = ?`
    )
    .get(attachmentId);

  if (!row) {
    return null;
  }

  const page = getPage(db, user, row.page_id);
  if (!page) {
    return null;
  }

  return {
    bytes: row.data,
    fileName: row.file_name,
    contentType: row.content_type
  };
}

function readAttachmentCandidate(filePath, { imageOnly = false } = {}) {
  const extension = path.extname(filePath);
  if (imageOnly && !isImageFileName(filePath)) {
    throw new Error(`지원하지 않는 이미지 형식입니다: ${extension || '(없음)'}`);
  }

  const content = fs.readFileSync(filePath);
  if (content.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`첨부 파일 크기는 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB 이하여야 합니다.`);
  }

  const fileName = path.basename(filePath);
  const contentType = guessContentType(fileName);
  return {
    fileName,
    contentType,
    dataBase64: content.toString('base64'),
    isImage: isImageFileName(fileName)
  };
}

function readAttachmentFromDataUri(dataUri, fileName) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri || '');
  if (!match) {
    throw new Error('유효하지 않은 파일 데이터입니다.');
  }

  const content = Buffer.from(match[2], 'base64');
  if (!content.length) {
    throw new Error('첨부 파일 데이터가 비어 있습니다.');
  }
  if (content.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`첨부 파일 크기는 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB 이하여야 합니다.`);
  }

  const resolvedName = fileName || `attachment${guessExtensionFromMime(match[1], fileName)}`;
  validateFileName(resolvedName);

  return {
    fileName: resolvedName,
    contentType: match[1],
    dataBase64: match[2],
    isImage: isImageContentType(match[1])
  };
}

module.exports = {
  MAX_ATTACHMENTS_PER_COMMENT,
  getAttachmentsByCommentIds,
  saveAttachments,
  updateCommentAttachments,
  tryGetAttachmentBytes,
  readAttachmentCandidate,
  readAttachmentFromDataUri,
  guessContentType
};
