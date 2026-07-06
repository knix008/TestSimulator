const fs = require('fs');
const path = require('path');
const {
  importFileFromPath,
  buildMarkdownImageReference,
  buildMarkdownFileReference,
  isSupportedImageExtension
} = require('./pageAssetService');

const MARKDOWN_IMAGE_REGEX = /!\[(?<alt>[^\]]*)\]\((?<url>[^)]+)\)/gi;
const MARKDOWN_FILE_LINK_REGEX = /(?<!!)\[(?<title>[^\]]*)\]\((?<url>[^)]+)\)/gi;

const UNTITLED_PAGE_TITLE = '제목없음';

function isMarkdownFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  const trimmed = filePath.trim();
  if (!trimmed) {
    return false;
  }
  try {
    if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }
  const ext = path.extname(trimmed).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

function normalizeExistingMarkdownPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  try {
    const trimmed = filePath.trim().replace(/^"(.*)"$/, '$1');
    if (!isMarkdownFilePath(trimmed)) {
      return null;
    }
    const fullPath = path.resolve(trimmed);
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile() ? fullPath : null;
  } catch {
    return null;
  }
}

function normalizeMarkdownImportPaths(paths) {
  const normalized = [];
  const seen = new Set();

  for (const filePath of paths || []) {
    const fullPath = normalizeExistingMarkdownPath(filePath);
    if (!fullPath) {
      continue;
    }
    const key = fullPath.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(fullPath);
  }

  return normalized;
}

function extractTitleFromMarkdown(markdown) {
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (match) {
      const title = match[2].trim();
      return title || UNTITLED_PAGE_TITLE;
    }
  }
  return UNTITLED_PAGE_TITLE;
}

function tryParseFrontMatterTitle(markdown) {
  const text = String(markdown || '');
  if (!text.startsWith('---')) {
    return { title: null, body: text };
  }

  const closingIndex = text.indexOf('\n---', 3);
  if (closingIndex < 0) {
    return { title: null, body: text };
  }

  const frontMatter = text.slice(3, closingIndex);
  const body = text.slice(closingIndex + 4).replace(/^\s+/, '');
  let title = null;

  for (const rawLine of frontMatter.split('\n')) {
    const line = rawLine.trim();
    if (!line.toLowerCase().startsWith('title:')) {
      continue;
    }
    let value = line.slice('title:'.length).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    title = value.trim() || null;
    break;
  }

  return { title, body };
}

function readMarkdownFile(markdownFilePath) {
  const raw = fs.readFileSync(markdownFilePath, 'utf8');
  const parsed = tryParseFrontMatterTitle(raw);
  let title = parsed.title;
  let body = parsed.body;

  if (!title) {
    title = extractTitleFromMarkdown(body);
  }

  if (title === UNTITLED_PAGE_TITLE) {
    const fileTitle = path.basename(markdownFilePath, path.extname(markdownFilePath)).trim();
    if (fileTitle) {
      title = fileTitle;
    }
  }

  return {
    title: String(title || UNTITLED_PAGE_TITLE).trim(),
    body: String(body || '')
  };
}

function prepareMarkdownFromText(markdownText, fileName = '') {
  const parsed = tryParseFrontMatterTitle(markdownText);
  let title = parsed.title;
  let body = parsed.body;

  if (!title) {
    title = extractTitleFromMarkdown(body);
  }

  const fileTitle = path.basename(String(fileName || ''), path.extname(String(fileName || ''))).trim();
  if (title === UNTITLED_PAGE_TITLE && fileTitle) {
    title = fileTitle;
  }

  return {
    title: String(title || UNTITLED_PAGE_TITLE).trim(),
    body: String(body || '')
  };
}

function getImportTitle(markdownFilePath, prepared) {
  const fileTitle = path.basename(markdownFilePath, path.extname(markdownFilePath)).trim();
  return fileTitle || prepared.title;
}

function getImportTitleFromFileName(fileName, prepared) {
  const fileTitle = path.basename(String(fileName || ''), path.extname(String(fileName || ''))).trim();
  return fileTitle || prepared.title;
}

function shouldSkipAssetUrl(url) {
  const value = String(url || '').trim();
  return (
    !value ||
    /^https?:/i.test(value) ||
    /^mailto:/i.test(value) ||
    /^page-asset:/i.test(value) ||
    value.startsWith('#')
  );
}

function resolveLocalAssetPath(markdownFilePath, url) {
  let decoded = String(url || '').trim().replace(/^["']|["']$/g, '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep raw value when URI decoding fails.
  }

  if (!decoded) {
    return null;
  }

  if (path.isAbsolute(decoded)) {
    return fs.existsSync(decoded) ? decoded : null;
  }

  const markdownDirectory = path.dirname(markdownFilePath);
  if (!markdownDirectory) {
    return null;
  }

  const normalizedRelative = decoded.replace(/\//g, path.sep);
  const combined = path.resolve(path.join(markdownDirectory, normalizedRelative));
  if (fs.existsSync(combined)) {
    return combined;
  }

  const assetsFolderName = `${path.basename(markdownFilePath, path.extname(markdownFilePath))}_assets`;
  const assetsCandidate = path.resolve(
    path.join(markdownDirectory, assetsFolderName, path.basename(normalizedRelative))
  );
  return fs.existsSync(assetsCandidate) ? assetsCandidate : null;
}

function importAssetLinks(markdown, markdownFilePath, pageId, db, user, regex, imageLink) {
  return String(markdown || '').replace(regex, (match, ...args) => {
    const groups = args[args.length - 1];
    if (!groups || typeof groups !== 'object' || !groups.url) {
      return match;
    }

    const url = String(groups.url).trim();
    if (shouldSkipAssetUrl(url)) {
      return match;
    }

    const localPath = resolveLocalAssetPath(markdownFilePath, url);
    if (!localPath) {
      return match;
    }

    try {
      const extension = path.extname(localPath);
      const asset = importFileFromPath(db, user, pageId, localPath, {
        imageOnly: imageLink && isSupportedImageExtension(extension)
      });

      if (imageLink) {
        const alt = groups.alt || '';
        return buildMarkdownImageReference(pageId, asset.fileName, alt);
      }

      const label = groups.title || asset.displayName || asset.fileName;
      return buildMarkdownFileReference(pageId, asset.fileName, label);
    } catch {
      return match;
    }
  });
}

function importLocalAssets(markdown, markdownFilePath, pageId, db, user) {
  let result = importAssetLinks(
    markdown,
    markdownFilePath,
    pageId,
    db,
    user,
    MARKDOWN_IMAGE_REGEX,
    true
  );
  result = importAssetLinks(
    result,
    markdownFilePath,
    pageId,
    db,
    user,
    MARKDOWN_FILE_LINK_REGEX,
    false
  );
  return result;
}

module.exports = {
  isMarkdownFilePath,
  normalizeExistingMarkdownPath,
  normalizeMarkdownImportPaths,
  readMarkdownFile,
  prepareMarkdownFromText,
  getImportTitle,
  getImportTitleFromFileName,
  importLocalAssets
};
