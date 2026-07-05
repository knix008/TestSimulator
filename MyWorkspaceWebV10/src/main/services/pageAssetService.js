const path = require('path');
const fs = require('fs');
const { getAccessibleWorkspaceIds } = require('./workspaceService');
const { canEditWorkspaceContent } = require('./workspaceService');

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'];

function normalizeExtension(extension) {
  if (!extension) {
    return '';
  }
  return extension.toLowerCase();
}

function isSupportedImageExtension(extension) {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(normalizeExtension(extension));
}

function validateFileName(fileName) {
  if (!fileName || String(fileName).includes('..')) {
    throw new Error('Invalid asset file name.');
  }
}

function canAccessPage(db, user, pageId) {
  const page = db.prepare('SELECT workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return false;
  }
  return getAccessibleWorkspaceIds(db, user).includes(page.workspace_id);
}

function ensureCanAccessPage(db, user, pageId) {
  if (!canAccessPage(db, user, pageId)) {
    throw new Error('Page asset에 접근할 수 없습니다.');
  }
}

function ensureCanEditPage(db, user, pageId) {
  const page = db.prepare('SELECT workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page || !canEditWorkspaceContent(db, user, page.workspace_id)) {
    throw new Error('Page asset을 저장할 권한이 없습니다.');
  }
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
    '.md': 'text/markdown'
  };
  return map[ext] || 'application/octet-stream';
}

function allocateUniqueAssetFileName(db, pageId, preferredFileName, extension) {
  const ext = normalizeExtension(extension || path.extname(preferredFileName || ''));
  let baseName = path.basename(preferredFileName || 'asset', ext);
  baseName = baseName.replace(/\s+\(\d+\)$/, '') || 'asset';

  const existing = new Set(
    db
      .prepare('SELECT file_name FROM page_assets WHERE page_id = ?')
      .all(pageId)
      .map((row) => row.file_name.toLowerCase())
  );

  let candidate = `${baseName}${ext}`;
  let index = 1;
  while (existing.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${baseName} (${index})${ext}`;
  }
  return candidate;
}

function saveAsset(db, user, pageId, fileName, content, contentType) {
  validateFileName(fileName);
  ensureCanEditPage(db, user, pageId);

  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT id FROM page_assets WHERE page_id = ? AND file_name = ?')
    .get(pageId, fileName);

  if (existing) {
    db.prepare(
      'UPDATE page_assets SET data = ?, content_type = ?, created_at = ? WHERE id = ?'
    ).run(content, contentType || guessContentType(fileName), now, existing.id);
  } else {
    db.prepare(
      `INSERT INTO page_assets (page_id, file_name, content_type, data, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(pageId, fileName, contentType || guessContentType(fileName), content, now);
  }

  cacheAssetLocally(pageId, fileName, content);
  return fileName;
}

function tryGetAssetBytes(db, user, pageId, fileName) {
  validateFileName(fileName);
  if (!canAccessPage(db, user, pageId)) {
    return null;
  }

  const row = db
    .prepare('SELECT data FROM page_assets WHERE page_id = ? AND file_name = ?')
    .get(pageId, fileName);
  if (!row) {
    return null;
  }
  return row.data;
}

function buildAssetUri(pageId, fileName) {
  return `page-asset://${pageId}/${encodeURIComponent(fileName)}`;
}

function buildMarkdownImageReference(pageId, fileName, altText = '') {
  return `![${altText}](page-asset:${pageId}/${fileName})`;
}

function buildMarkdownFileReference(pageId, fileName, displayName) {
  const label = (displayName || fileName).trim();
  return `[${label}](page-asset:${pageId}/${fileName})`;
}

function importImageBytes(db, user, pageId, content, extension, preferredFileName) {
  if (!isSupportedImageExtension(extension)) {
    throw new Error(`지원하지 않는 이미지 형식입니다: ${extension || '(없음)'}`);
  }
  const fileName = allocateUniqueAssetFileName(db, pageId, preferredFileName, extension);
  saveAsset(db, user, pageId, fileName, content, guessContentType(fileName));
  return {
    fileName,
    uri: buildAssetUri(pageId, fileName),
    markdown: buildMarkdownImageReference(pageId, fileName, path.basename(fileName, extension))
  };
}

function importFileFromPath(db, user, pageId, sourcePath, { imageOnly = false } = {}) {
  const extension = path.extname(sourcePath);
  if (imageOnly && !isSupportedImageExtension(extension)) {
    throw new Error(`지원하지 않는 이미지 형식입니다: ${extension || '(없음)'}`);
  }

  const content = fs.readFileSync(sourcePath);
  const fileName = allocateUniqueAssetFileName(db, pageId, path.basename(sourcePath), extension);
  saveAsset(db, user, pageId, fileName, content, guessContentType(fileName));

  const isImage = isSupportedImageExtension(extension);
  return {
    fileName,
    uri: buildAssetUri(pageId, fileName),
    markdown: isImage
      ? buildMarkdownImageReference(pageId, fileName, path.basename(fileName, extension))
      : buildMarkdownFileReference(pageId, fileName, path.basename(sourcePath, extension))
  };
}

function cacheAssetLocally(pageId, fileName, content) {
  try {
    const { getUserDataPaths } = require('../config');
    const folder = path.join(getUserDataPaths().pageAssets, String(pageId));
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, fileName), content);
  } catch {
    // Cache is optional.
  }
}

function resolveAssetFromCache(pageId, fileName) {
  try {
    const { getUserDataPaths } = require('../config');
    const localPath = path.join(getUserDataPaths().pageAssets, String(pageId), fileName);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
  } catch {
    // Ignore cache read errors.
  }
  return null;
}

function parsePageAssetReference(uri) {
  const match = String(uri || '').match(/^page-asset:\/\/(\d+)\/([^?#]+)/i);
  if (!match) {
    return null;
  }
  return {
    pageId: Number.parseInt(match[1], 10),
    fileName: decodeURIComponent(match[2])
  };
}

function cloneEmbeddedPageAssetHtml(db, user, html, pageId) {
  if (!html) {
    return html;
  }

  return html.replace(/\b(?:src|href)\s*=\s*(["'])(?<url>[^"']+)\1/gi, (match, _quote, url) => {
    const parsed = parsePageAssetReference(url);
    if (!parsed || parsed.pageId !== pageId) {
      return match;
    }

    const bytes = tryGetAssetBytes(db, user, pageId, parsed.fileName);
    if (!bytes) {
      return match;
    }

    const extension = path.extname(parsed.fileName);
    const newFileName = allocateUniqueAssetFileName(db, pageId, parsed.fileName, extension);
    saveAsset(db, user, pageId, newFileName, bytes, guessContentType(newFileName));
    return match.replace(url, buildAssetUri(pageId, newFileName));
  });
}

module.exports = {
  SUPPORTED_IMAGE_EXTENSIONS,
  isSupportedImageExtension,
  saveAsset,
  tryGetAssetBytes,
  buildAssetUri,
  buildMarkdownImageReference,
  buildMarkdownFileReference,
  importImageBytes,
  importFileFromPath,
  resolveAssetFromCache,
  cloneEmbeddedPageAssetHtml,
  canAccessPage,
  guessContentType
};
