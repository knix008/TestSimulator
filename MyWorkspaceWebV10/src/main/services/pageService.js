const { makeUnique, orderByName } = require('../utils/nameHelper');
const {
  canEditWorkspaceContent,
  canManageWorkspace,
  getEffectiveWorkspaceLockUserId,
  isWorkspaceLocked
} = require('./workspaceService');

const DEFAULT_PAGE_CONTENT = '# 제목없음\n\n';

function replaceFirstHeadingTitle(markdown, title) {
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.*)$/.exec(lines[index]);
    if (match) {
      lines[index] = `${match[1]} ${title}`;
      return lines.join('\n');
    }
  }
  return `# ${title}\n\n${markdown}`;
}

function getEffectivePageLockUserId(db, pageId) {
  const page = db.prepare('SELECT locked_by_user_id, workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return null;
  }
  if (page.locked_by_user_id != null) {
    return page.locked_by_user_id;
  }
  return getEffectiveWorkspaceLockUserId(db, page.workspace_id);
}

function isPageLocked(db, pageId) {
  const page = db.prepare('SELECT locked_by_user_id, workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return false;
  }
  if (page.locked_by_user_id != null) {
    return true;
  }
  return isWorkspaceLocked(db, page.workspace_id);
}

function canEditPageContent(db, user, pageId) {
  const page = db.prepare('SELECT workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return false;
  }
  if (!canEditWorkspaceContent(db, user, page.workspace_id)) {
    return false;
  }

  const lockedByUserId = getEffectivePageLockUserId(db, pageId);
  if (!lockedByUserId) {
    return true;
  }
  if (user?.role === 'Admin') {
    return true;
  }
  return lockedByUserId === user.id;
}

function canLockPage(db, user, pageId) {
  const page = db.prepare('SELECT workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return false;
  }
  return canManageWorkspace(db, user, page.workspace_id) && !isPageLocked(db, pageId);
}

function canUnlockPage(db, user, pageId) {
  const page = db.prepare('SELECT locked_by_user_id, workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page?.locked_by_user_id) {
    return false;
  }
  if (isWorkspaceLocked(db, page.workspace_id) && !page.locked_by_user_id) {
    return false;
  }
  if (user?.role === 'Admin') {
    return true;
  }
  return page.locked_by_user_id === user.id;
}

function lockPage(db, user, pageId) {
  if (!canLockPage(db, user, pageId)) {
    throw new Error('Page를 잠글 권한이 없습니다.');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE pages SET locked_by_user_id = ?, locked_at = ?, updated_at = ? WHERE id = ?').run(
    user.id,
    now,
    now,
    pageId
  );
}

function unlockPage(db, user, pageId) {
  if (!canUnlockPage(db, user, pageId)) {
    throw new Error('Page 잠금을 해제할 권한이 없습니다.');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE pages SET locked_by_user_id = NULL, locked_at = NULL, updated_at = ? WHERE id = ?').run(
    now,
    pageId
  );
}

function getPage(db, user, pageId) {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return null;
  }

  const { getAccessibleWorkspaceIds } = require('./workspaceService');
  if (!getAccessibleWorkspaceIds(db, user).includes(page.workspace_id)) {
    return null;
  }

  return {
    id: page.id,
    workspaceId: page.workspace_id,
    title: page.title,
    content: page.content,
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    isLocked: isPageLocked(db, pageId),
    canEdit: canEditPageContent(db, user, pageId)
  };
}

function createPage(db, user, { workspaceId, title, content }) {
  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Page를 생성할 권한이 없습니다.');
  }

  let trimmedTitle = (title || '').trim();
  if (!trimmedTitle) {
    trimmedTitle = '제목없음';
  }

  let pageContent = (content || '').trim();
  if (!pageContent) {
    pageContent = DEFAULT_PAGE_CONTENT;
  }

  const existingTitles = orderByName(
    db.prepare('SELECT title FROM pages WHERE workspace_id = ?').all(workspaceId),
    (row) => row.title
  ).map((row) => row.title);

  const uniqueTitle = makeUnique(trimmedTitle, existingTitles);
  if (uniqueTitle !== trimmedTitle) {
    pageContent = replaceFirstHeadingTitle(pageContent, uniqueTitle);
  } else if (!/^#\s/m.test(pageContent)) {
    pageContent = `# ${uniqueTitle}\n\n${pageContent}`;
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO pages (workspace_id, title, content, created_at, updated_at)
       VALUES (@workspaceId, @title, @content, @createdAt, @updatedAt)`
    )
    .run({
      workspaceId,
      title: uniqueTitle,
      content: pageContent,
      createdAt: now,
      updatedAt: now
    });

  return getPage(db, user, result.lastInsertRowid);
}

function savePage(db, user, { pageId, title, content }) {
  const existing = getPage(db, user, pageId);
  if (!existing) {
    throw new Error('Page를 찾을 수 없습니다.');
  }
  if (!canEditPageContent(db, user, pageId)) {
    throw new Error('Page가 잠겨 있거나 편집 권한이 없습니다.');
  }

  const trimmedTitle = (title || existing.title).trim() || '제목없음';
  const pageContent = content ?? existing.content;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE pages
     SET title = @title, content = @content, updated_at = @updatedAt
     WHERE id = @pageId`
  ).run({
    pageId,
    title: trimmedTitle,
    content: pageContent,
    updatedAt: now
  });

  saveVersionSnapshot(db, user, pageId, trimmedTitle, pageContent, now);
  return getPage(db, user, pageId);
}

function saveVersionSnapshot(db, user, pageId, title, content, savedAt) {
  db.prepare(
    `INSERT INTO page_versions (page_id, title, content, saved_by_user_id, saved_at)
     VALUES (@pageId, @title, @content, @savedByUserId, @savedAt)`
  ).run({
    pageId,
    title,
    content,
    savedByUserId: user.id,
    savedAt
  });

  const versions = db
    .prepare('SELECT id FROM page_versions WHERE page_id = ? ORDER BY saved_at DESC')
    .all(pageId);

  if (versions.length > 50) {
    const stale = versions.slice(50);
    const deleteStmt = db.prepare('DELETE FROM page_versions WHERE id = ?');
    for (const row of stale) {
      deleteStmt.run(row.id);
    }
  }
}

function searchPages(db, user, query) {
  const normalized = (query || '').trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const { getAccessibleWorkspaceIds } = require('./workspaceService');
  const accessibleIds = new Set(getAccessibleWorkspaceIds(db, user));
  const pages = db.prepare('SELECT id, workspace_id, title, content FROM pages').all();

  return pages
    .filter((page) => accessibleIds.has(page.workspace_id))
    .filter((page) => {
      return (
        page.title.toLowerCase().includes(normalized) ||
        page.content.toLowerCase().includes(normalized)
      );
    })
    .sort((left, right) => {
      const leftTitle = left.title.toLowerCase();
      const rightTitle = right.title.toLowerCase();
      const leftTitleStarts = leftTitle.startsWith(normalized);
      const rightTitleStarts = rightTitle.startsWith(normalized);
      if (leftTitleStarts !== rightTitleStarts) {
        return leftTitleStarts ? -1 : 1;
      }
      const leftTitleContains = leftTitle.includes(normalized);
      const rightTitleContains = rightTitle.includes(normalized);
      if (leftTitleContains !== rightTitleContains) {
        return leftTitleContains ? -1 : 1;
      }
      return leftTitle.localeCompare(rightTitle, 'ko');
    })
    .slice(0, 30)
    .map((page) => ({
      pageId: page.id,
      workspaceId: page.workspace_id,
      title: page.title,
      snippet: buildSnippet(page.content, normalized),
      matchInContent: page.content.toLowerCase().includes(normalized)
    }));
}

function buildSnippet(content, query) {
  const lower = content.toLowerCase();
  const index = lower.indexOf(query);
  if (index < 0) {
    return content.slice(0, 120);
  }
  const start = Math.max(0, index - 40);
  const end = Math.min(content.length, index + query.length + 80);
  return content.slice(start, end).replace(/\s+/g, ' ').trim();
}

function renamePage(db, user, pageId, title) {
  const existing = getPage(db, user, pageId);
  if (!existing) {
    throw new Error('Page를 찾을 수 없습니다.');
  }
  if (!canEditPageContent(db, user, pageId)) {
    throw new Error('Page 이름을 변경할 권한이 없습니다.');
  }

  const trimmed = (title || '').trim();
  if (!trimmed) {
    throw new Error('Page 제목을 입력하세요.');
  }

  const siblings = db
    .prepare('SELECT title FROM pages WHERE workspace_id = ? AND id != ?')
    .all(existing.workspaceId, pageId)
    .map((row) => row.title);
  const uniqueTitle = makeUnique(trimmed, siblings);
  const content = replaceFirstHeadingTitle(existing.content, uniqueTitle);
  const now = new Date().toISOString();

  db.prepare('UPDATE pages SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
    uniqueTitle,
    content,
    now,
    pageId
  );

  return getPage(db, user, pageId);
}

function deletePage(db, user, pageId, userConfirmed) {
  if (!userConfirmed) {
    throw new Error('Page 삭제는 사용자 확인 후에만 가능합니다.');
  }

  const page = db.prepare('SELECT id, workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return;
  }
  if (!canEditPageContent(db, user, pageId)) {
    throw new Error('Page를 삭제할 권한이 없습니다.');
  }

  db.prepare('DELETE FROM pages WHERE id = ?').run(pageId);
}

function canEditPageContentLegacy(db, user, pageId) {
  const page = db.prepare('SELECT workspace_id FROM pages WHERE id = ?').get(pageId);
  if (!page) {
    return false;
  }
  return canEditWorkspaceContent(db, user, page.workspace_id);
}

function importMarkdownFileIntoWorkspace(db, user, markdownFilePath, workspaceId) {
  const {
    normalizeExistingMarkdownPath,
    readMarkdownFile,
    getImportTitle,
    importLocalAssets
  } = require('./pageMarkdownImporter');

  const sourcePath = normalizeExistingMarkdownPath(markdownFilePath);
  if (!sourcePath) {
    throw new Error('Markdown 파일을 찾을 수 없습니다.');
  }

  const prepared = readMarkdownFile(sourcePath);
  const importTitle = getImportTitle(sourcePath, prepared);
  const page = createPage(db, user, {
    workspaceId,
    title: importTitle,
    content: prepared.body
  });

  let finalContent = importLocalAssets(prepared.body, sourcePath, page.id, db, user);
  finalContent = replaceFirstHeadingTitle(finalContent, page.title);

  if (finalContent !== page.content) {
    return savePage(db, user, {
      pageId: page.id,
      title: page.title,
      content: finalContent
    });
  }

  return page;
}

function importMarkdownFilesIntoWorkspace(db, user, workspaceId, paths) {
  const { normalizeMarkdownImportPaths } = require('./pageMarkdownImporter');

  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Page를 생성할 권한이 없습니다.');
  }

  const normalizedPaths = normalizeMarkdownImportPaths(paths);
  if (!normalizedPaths.length) {
    return { importedCount: 0, pageIds: [], lastPageId: null };
  }

  const pageIds = [];
  let lastPage = null;

  for (const filePath of normalizedPaths) {
    lastPage = importMarkdownFileIntoWorkspace(db, user, filePath, workspaceId);
    pageIds.push(lastPage.id);
  }

  return {
    importedCount: pageIds.length,
    pageIds,
    lastPageId: lastPage?.id ?? null,
    lastPage
  };
}

function importMarkdownContentIntoWorkspace(db, user, workspaceId, fileName, content) {
  const { prepareMarkdownFromText, getImportTitleFromFileName } = require('./pageMarkdownImporter');

  const prepared = prepareMarkdownFromText(content, fileName);
  const importTitle = getImportTitleFromFileName(fileName, prepared);
  const page = createPage(db, user, {
    workspaceId,
    title: importTitle,
    content: prepared.body
  });

  const finalContent = replaceFirstHeadingTitle(prepared.body, page.title);
  if (finalContent !== page.content) {
    return savePage(db, user, {
      pageId: page.id,
      title: page.title,
      content: finalContent
    });
  }

  return page;
}

function importMarkdownTextsIntoWorkspace(db, user, workspaceId, items) {
  if (!canEditWorkspaceContent(db, user, workspaceId)) {
    throw new Error('Page를 생성할 권한이 없습니다.');
  }

  const pageIds = [];
  let lastPage = null;

  for (const item of items || []) {
    const fileName = String(item?.fileName || 'untitled.md').trim() || 'untitled.md';
    const content = String(item?.content ?? '');
    if (!content.trim()) {
      continue;
    }

    lastPage = importMarkdownContentIntoWorkspace(db, user, workspaceId, fileName, content);
    pageIds.push(lastPage.id);
  }

  return {
    importedCount: pageIds.length,
    pageIds,
    lastPageId: lastPage?.id ?? null,
    lastPage
  };
}

module.exports = {
  getPage,
  createPage,
  savePage,
  renamePage,
  deletePage,
  canEditPageContent,
  canEditPageContentLegacy,
  canLockPage,
  canUnlockPage,
  lockPage,
  unlockPage,
  isPageLocked,
  searchPages,
  importMarkdownFileIntoWorkspace,
  importMarkdownFilesIntoWorkspace,
  importMarkdownTextsIntoWorkspace,
  DEFAULT_PAGE_CONTENT
};
