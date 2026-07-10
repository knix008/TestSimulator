const fs = require('fs');
const path = require('path');
const { tryGetAssetBytes, guessContentType, isSupportedImageExtension } = require('../services/pageAssetService');

const MARKDOWN_IMAGE_REGEX =
  /!\[([^\]]*)\]\((<?[^)>\s]+>?)(?:\s+("([^"]*)"|'([^']*)'))?\)/gi;
const MARKDOWN_FILE_LINK_REGEX =
  /(?<!!)\[([^\]]*)\]\(\s*(?:<)?(page-asset:(?:\/\/)?\d+\/[^)\s"<>]+)(?:>)?\s*\)/gi;
const HTML_IMG_REGEX = /<img\b([^>]*?)\/?>/gi;

function sanitizeAssetFileName(rawPath) {
  let fileName = String(rawPath || '').trim().replace(/>$/, '');
  try {
    fileName = decodeURIComponent(fileName);
  } catch {
    // keep encoded form
  }
  fileName = fileName.replace(/%3E$/i, '').replace(/>$/, '');
  const q = fileName.indexOf('?');
  const h = fileName.indexOf('#');
  let end = fileName.length;
  if (q >= 0) {
    end = Math.min(end, q);
  }
  if (h >= 0) {
    end = Math.min(end, h);
  }
  return fileName.slice(0, end).trim();
}

function parsePageAssetRef(rawUrl) {
  const normalized = String(rawUrl || '').trim().replace(/^<|>$/g, '');
  const match = normalized.match(/^page-asset:(?:\/\/)?(\d+)\/(.+)$/i);
  if (!match) {
    return null;
  }

  const fileName = sanitizeAssetFileName(match[2]);
  if (!fileName) {
    return null;
  }

  return {
    pageId: Number.parseInt(match[1], 10),
    fileName
  };
}

function getAssetBytes(db, user, pageId, fileName) {
  return tryGetAssetBytes(db, user, pageId, fileName);
}

function buildDataUri(bytes, fileName) {
  const mime = guessContentType(fileName);
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function isImageAsset(fileName) {
  const ext = path.extname(fileName);
  return isSupportedImageExtension(ext);
}

function copyAssetToFolder(db, user, pageId, fileName, assetsFolder, usedNames) {
  const bytes = getAssetBytes(db, user, pageId, fileName);
  if (!bytes) {
    return null;
  }

  let targetName = path.basename(fileName);
  const lower = targetName.toLowerCase();
  if (usedNames.has(lower)) {
    const ext = path.extname(targetName);
    const base = path.basename(targetName, ext);
    let index = 2;
    while (usedNames.has(`${base}_${index}${ext}`.toLowerCase())) {
      index += 1;
    }
    targetName = `${base}_${index}${ext}`;
  }

  usedNames.add(targetName.toLowerCase());
  fs.mkdirSync(assetsFolder, { recursive: true });
  fs.writeFileSync(path.join(assetsFolder, targetName), bytes);
  return targetName;
}

function materializeMarkdownImagesAsBase64(markdown, db, user) {
  let result = String(markdown || '');

  result = result.replace(MARKDOWN_IMAGE_REGEX, (match, alt, url, _titleGroup, titleDouble, titleSingle) => {
    const parsed = parsePageAssetRef(url);
    if (!parsed || !isImageAsset(parsed.fileName)) {
      return match;
    }

    const bytes = getAssetBytes(db, user, parsed.pageId, parsed.fileName);
    if (!bytes) {
      return match;
    }

    const dataUri = buildDataUri(bytes, parsed.fileName);
    const title = titleDouble || titleSingle || '';
    return title ? `![${alt}](${dataUri} "${title}")` : `![${alt}](${dataUri})`;
  });

  result = result.replace(HTML_IMG_REGEX, (match, attrs) => {
    const srcMatch = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    const src = srcMatch?.[2] || srcMatch?.[3];
    if (!src) {
      return match;
    }

    const parsed = parsePageAssetRef(src);
    if (!parsed || !isImageAsset(parsed.fileName)) {
      return match;
    }

    const bytes = getAssetBytes(db, user, parsed.pageId, parsed.fileName);
    if (!bytes) {
      return match;
    }

    const altMatch = /\balt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    const alt = altMatch?.[2] || altMatch?.[3] || '';
    const dataUri = buildDataUri(bytes, parsed.fileName);
    return `<img src="${dataUri}" alt="${alt.replace(/"/g, '&quot;')}">`;
  });

  return result;
}

function materializeMarkdownImagesToFolder(markdown, db, user, assetsFolderName, assetsFolder) {
  const usedNames = new Set();
  let result = String(markdown || '');

  const replaceImage = (match, alt, url, _titleGroup, titleDouble, titleSingle) => {
    const parsed = parsePageAssetRef(url);
    if (!parsed || !isImageAsset(parsed.fileName)) {
      return match;
    }

    const copied = copyAssetToFolder(db, user, parsed.pageId, parsed.fileName, assetsFolder, usedNames);
    if (!copied) {
      return match;
    }

    const relativePath = `${assetsFolderName}/${copied}`.replace(/\\/g, '/');
    const title = titleDouble || titleSingle || '';
    return title ? `![${alt}](${relativePath} "${title}")` : `![${alt}](${relativePath})`;
  };

  result = result.replace(MARKDOWN_IMAGE_REGEX, replaceImage);

  result = result.replace(HTML_IMG_REGEX, (match, attrs) => {
    const srcMatch = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    const src = srcMatch?.[2] || srcMatch?.[3];
    if (!src) {
      return match;
    }

    const parsed = parsePageAssetRef(src);
    if (!parsed || !isImageAsset(parsed.fileName)) {
      return match;
    }

    const copied = copyAssetToFolder(db, user, parsed.pageId, parsed.fileName, assetsFolder, usedNames);
    if (!copied) {
      return match;
    }

    const altMatch = /\balt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    const alt = altMatch?.[2] || altMatch?.[3] || '';
    const relativePath = `${assetsFolderName}/${copied}`.replace(/\\/g, '/');
    return `![${alt}](${relativePath})`;
  });

  const replaceFileLink = (match, label, url) => {
    const parsed = parsePageAssetRef(url);
    if (!parsed || isImageAsset(parsed.fileName)) {
      return match;
    }

    const copied = copyAssetToFolder(db, user, parsed.pageId, parsed.fileName, assetsFolder, usedNames);
    if (!copied) {
      return match;
    }

    const relativePath = `${assetsFolderName}/${copied}`.replace(/\\/g, '/');
    return `[${label}](${relativePath})`;
  };

  result = result.replace(MARKDOWN_FILE_LINK_REGEX, replaceFileLink);
  return result;
}

function prepareMarkdownForExport(markdown, db, user, exportFilePath, { embedImagesAsBase64 = false } = {}) {
  const body = String(markdown || '');
  if (embedImagesAsBase64) {
    return materializeMarkdownImagesAsBase64(body, db, user);
  }

  const directory = path.dirname(exportFilePath);
  if (!directory) {
    return body;
  }

  const assetsFolderName = `${path.basename(exportFilePath, path.extname(exportFilePath))}_assets`;
  const assetsFolder = path.join(directory, assetsFolderName);
  return materializeMarkdownImagesToFolder(body, db, user, assetsFolderName, assetsFolder);
}

module.exports = {
  prepareMarkdownForExport,
  materializeMarkdownImagesAsBase64,
  materializeMarkdownImagesToFolder,
  parsePageAssetRef
};
