const AdmZip = require('adm-zip');
const { orderByName } = require('../utils/nameHelper');

const MANIFEST = 'workspace.json';
const ASSETS_PREFIX = 'assets/';

function buildArchiveNode(db, workspaceId) {
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    throw new Error('Workspace를 찾을 수 없습니다.');
  }

  const node = {
    name: workspace.name,
    pages: [],
    children: []
  };

  const pages = orderByName(
    db.prepare('SELECT * FROM pages WHERE workspace_id = ?').all(workspaceId),
    (row) => row.title
  );

  for (const page of pages) {
    node.pages.push({
      key: generateKey(),
      title: page.title,
      content: page.content
    });
  }

  const children = orderByName(
    db.prepare('SELECT * FROM workspaces WHERE parent_id = ?').all(workspaceId),
    (row) => row.name
  );

  for (const child of children) {
    node.children.push(buildArchiveNode(db, child.id));
  }

  return node;
}

function exportWorkspace(db, user, workspaceId, { canAccessWorkspace }) {
  if (!canAccessWorkspace(user, workspaceId)) {
    throw new Error('Workspace에 접근할 수 없습니다.');
  }

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: user.username,
    root: buildArchiveNode(db, workspaceId)
  };
}

function saveArchive(filePath, document, assetMap = {}) {
  const zip = new AdmZip();
  zip.addFile(MANIFEST, Buffer.from(JSON.stringify(document, null, 2), 'utf8'));

  for (const [pageKey, files] of Object.entries(assetMap)) {
    for (const [fileName, bytes] of Object.entries(files)) {
      zip.addFile(`${ASSETS_PREFIX}${pageKey}/${fileName}`, Buffer.from(bytes));
    }
  }

  zip.writeZip(filePath);
}

function loadArchive(filePath) {
  const zip = new AdmZip(filePath);
  const entry = zip.getEntry(MANIFEST);
  if (!entry) {
    throw new Error('Workspace archive manifest not found.');
  }

  const document = JSON.parse(zip.readAsText(entry, 'utf8'));
  if (document.formatVersion !== 1) {
    throw new Error('Unsupported workspace archive format.');
  }

  const assets = {};
  for (const zipEntry of zip.getEntries()) {
    if (zipEntry.isDirectory || !zipEntry.entryName.startsWith(ASSETS_PREFIX)) {
      continue;
    }
    const relative = zipEntry.entryName.slice(ASSETS_PREFIX.length);
    const slash = relative.indexOf('/');
    if (slash <= 0) {
      continue;
    }
    const pageKey = relative.slice(0, slash);
    const fileName = relative.slice(slash + 1);
    if (!fileName) {
      continue;
    }
    if (!assets[pageKey]) {
      assets[pageKey] = {};
    }
    assets[pageKey][fileName] = zip.readFile(zipEntry);
  }

  return { document, assets };
}

function importWorkspace(db, user, document, assetsByPageKey, { createWorkspace, createPage, updatePage }) {
  let workspaceCount = 0;
  let pageCount = 0;

  function importNode(node, parentId) {
    const workspace = createWorkspace(db, user, { name: node.name, parentId });
    workspaceCount += 1;

    for (const archivePage of node.pages || []) {
      const title = (archivePage.title || '').trim() || '제목없음';
      const content = (archivePage.content || '').trim() || '.';
      const page = createPage(db, user, {
        workspaceId: workspace.id,
        title,
        content
      });
      pageCount += 1;

      const pageKey = archivePage.key;
      const files = pageKey ? assetsByPageKey[pageKey] : null;
      if (files && Object.keys(files).length > 0) {
        const rewritten = rewriteArchiveAssets(content, pageKey, page.id);
        if (rewritten !== content) {
          updatePage(db, user, page.id, page.title, rewritten);
        }
      }
    }

    for (const child of node.children || []) {
      importNode(child, workspace.id);
    }

    return workspace;
  }

  const root = importNode(document.root, null);
  return {
    rootWorkspaceId: root.id,
    workspaceCount,
    pageCount
  };
}

function rewriteArchiveAssets(content, pageKey, pageId) {
  let result = content;
  const pattern = new RegExp(`archive-asset:${pageKey}/([^)\\s"']+)`, 'gi');
  result = result.replace(pattern, (_match, fileName) => `page-asset:${pageId}/${fileName}`);
  return result;
}

function generateKey() {
  return [...cryptoRandomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cryptoRandomBytes(length) {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

module.exports = {
  exportWorkspace,
  saveArchive,
  loadArchive,
  importWorkspace
};
