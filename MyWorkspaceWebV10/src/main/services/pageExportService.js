const fs = require('fs');
const path = require('path');
const {
  buildExportHtml,
  ensureTitleHeading,
  materializePageAssets
} = require('../export/htmlBuilder');
const { prepareMarkdownForExport } = require('../export/markdownMaterializer');
const { exportHtmlToPdf } = require('../export/pdfExporter');
const { exportHtmlToDocx } = require('../export/docxExporter');

function sanitizeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, '_').trim() || 'untitled';
}

function exportPageMarkdown(db, user, pageId, filePath, { getPage, embedImagesAsBase64 = false } = {}) {
  const page = getPage(db, user, pageId);
  if (!page) {
    throw new Error('Page를 찾을 수 없습니다.');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const prepared = prepareMarkdownForExport(
    ensureTitleHeading(page.title, page.content),
    db,
    user,
    filePath,
    { embedImagesAsBase64 }
  );
  fs.writeFileSync(filePath, `${prepared}\n`, 'utf8');
}

async function exportPage(db, user, pageId, filePath, format, { getPage, embedImagesAsBase64 = false } = {}) {
  const page = getPage(db, user, pageId);
  if (!page) {
    throw new Error('Page를 찾을 수 없습니다.');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const title = page.title;
  const content = page.content;

  switch (format) {
    case 'markdown': {
      const body = prepareMarkdownForExport(
        ensureTitleHeading(title, content),
        db,
        user,
        filePath,
        { embedImagesAsBase64 }
      );
      fs.writeFileSync(filePath, `${body}\n`, 'utf8');
      break;
    }
    case 'word': {
      const html = buildExportHtml(title, content, db, user, pageId);
      await exportHtmlToDocx(html, filePath);
      break;
    }
    case 'pdf': {
      const html = buildExportHtml(title, content, db, user, pageId);
      await exportHtmlToPdf(html, filePath);
      break;
    }
    default:
      throw new Error(`지원하지 않는 내보내기 형식입니다: ${format}`);
  }
}

function collectWorkspacePages(db, workspaceId) {
  const pages = db
    .prepare('SELECT id, title, content FROM pages WHERE workspace_id = ? ORDER BY title COLLATE NOCASE')
    .all(workspaceId);
  const children = db
    .prepare('SELECT id FROM workspaces WHERE parent_id = ? ORDER BY name COLLATE NOCASE')
    .all(workspaceId);

  let collected = [...pages];
  for (const child of children) {
    collected = collected.concat(collectWorkspacePages(db, child.id));
  }
  return collected;
}

function buildCombinedMarkdown(pages) {
  return pages.map((page) => ensureTitleHeading(page.title, page.content)).join('\n\n---\n\n');
}

function exportWorkspaceMarkdown(db, user, workspaceId, targetDir, deps) {
  exportWorkspace(db, user, workspaceId, targetDir, 'markdown', deps);
}

async function exportWorkspace(db, user, workspaceId, targetPath, format, deps) {
  const { canAccessWorkspace } = deps;
  if (!canAccessWorkspace(user, workspaceId)) {
    throw new Error('Workspace에 접근할 수 없습니다.');
  }

  const workspace = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    throw new Error('Workspace를 찾을 수 없습니다.');
  }

  if (format === 'markdown') {
    exportWorkspaceMarkdownTree(db, user, workspaceId, targetPath, deps);
    return;
  }

  const pages = collectWorkspacePages(db, workspaceId);
  const combined = buildCombinedMarkdown(pages);
  const title = workspace.name;
  const materialized = materializePageAssets(combined, db, user, pages[0]?.id || 0);

  if (format === 'word') {
    const html = buildExportHtml(title, materialized, db, user, pages[0]?.id || 0);
    await exportHtmlToDocx(html, targetPath);
    return;
  }

  if (format === 'pdf') {
    const html = buildExportHtml(title, materialized, db, user, pages[0]?.id || 0);
    await exportHtmlToPdf(html, targetPath);
    return;
  }

  throw new Error(`지원하지 않는 내보내기 형식입니다: ${format}`);
}

function exportWorkspaceMarkdownTree(db, user, workspaceId, targetDir, deps) {
  exportNode(db, user, workspaceId, targetDir, deps);
}

function exportNode(db, user, workspaceId, targetDir, deps) {
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return;
  }

  const folder = path.join(targetDir, sanitizeFileName(workspace.name));
  fs.mkdirSync(folder, { recursive: true });

  const pages = db
    .prepare('SELECT * FROM pages WHERE workspace_id = ? ORDER BY title COLLATE NOCASE')
    .all(workspaceId);
  for (const page of pages) {
    const fileName = `${sanitizeFileName(page.title)}.md`;
    const filePath = path.join(folder, fileName);
    const body = prepareMarkdownForExport(
      ensureTitleHeading(page.title, page.content),
      db,
      user,
      filePath,
      { embedImagesAsBase64: Boolean(deps.embedImagesAsBase64) }
    );
    fs.writeFileSync(filePath, `${body}\n`, 'utf8');
  }

  const children = db
    .prepare('SELECT id FROM workspaces WHERE parent_id = ? ORDER BY name COLLATE NOCASE')
    .all(workspaceId);
  for (const child of children) {
    exportNode(db, user, child.id, folder, deps);
  }
}

function getExportExtension(format) {
  switch (format) {
    case 'word':
      return '.docx';
    case 'pdf':
      return '.pdf';
    default:
      return '.md';
  }
}

function getExportFilter(format) {
  switch (format) {
    case 'word':
      return [{ name: 'Word Document', extensions: ['docx'] }];
    case 'pdf':
      return [{ name: 'PDF Document', extensions: ['pdf'] }];
    default:
      return [{ name: 'Markdown', extensions: ['md'] }];
  }
}

module.exports = {
  exportPageMarkdown,
  exportPage,
  exportWorkspaceMarkdown,
  exportWorkspace,
  getExportExtension,
  getExportFilter,
  sanitizeFileName
};
