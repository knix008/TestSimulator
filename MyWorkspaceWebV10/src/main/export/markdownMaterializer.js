const fs = require('fs');
const path = require('path');
const { tryGetAssetBytes, guessContentType, isSupportedImageExtension } = require('../services/pageAssetService');

const MARKDOWN_IMAGE_REGEX =
  /!\[([^\]]*)\]\((<?[^)>\s]+>?)(?:\s+("([^"]*)"|'([^']*)'))?\)/gi;
const MARKDOWN_FILE_LINK_REGEX =
  /(?<!!)\[([^\]]*)\]\(\s*(?:<)?(page-asset:(?:\/\/)?\d+\/[^)\s"<>]+)(?:>)?\s*\)/gi;
const HTML_IMG_REGEX = /<img\b([^>]*?)\/?>/gi;
const EDITOR_IMAGE_WRAP_REGEX =
  /<span\b([^>]*class=["'][^"']*editor-image-wrap[^"']*["'][^>]*)>([\s\S]*?)<\/span>/gi;
const EDITOR_IMAGE_HANDLE_REGEX =
  /<span\b[^>]*class=["'][^"']*editor-image-resize-handle[^"']*["'][^>]*>\s*<\/span>/gi;

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

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

function extractHtmlAttr(attrs, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|(\\d+))`, 'i');
  const match = pattern.exec(attrs || '');
  return match?.[2] || match?.[3] || match?.[4] || '';
}

function tryGetImageWidthPx(attrs) {
  const dataWidth = parsePositiveInt(extractHtmlAttr(attrs, 'data-editor-width'));
  if (dataWidth) {
    return dataWidth;
  }

  const styleMatch = String(attrs || '').match(/\bwidth\s*:\s*(\d+)\s*px/i);
  if (styleMatch) {
    return parsePositiveInt(styleMatch[1]);
  }

  const widthAttr = parsePositiveInt(extractHtmlAttr(attrs, 'width'));
  if (widthAttr > 0 && widthAttr <= 4096) {
    return widthAttr;
  }

  const title = extractHtmlAttr(attrs, 'title');
  return tryParseEditorSizeTitle(title).width;
}

function tryGetImageHeightPx(attrs) {
  const dataHeight = parsePositiveInt(extractHtmlAttr(attrs, 'data-editor-height'));
  if (dataHeight) {
    return dataHeight;
  }

  const styleMatch = String(attrs || '').match(/\bheight\s*:\s*(\d+)\s*px/i);
  if (styleMatch) {
    return parsePositiveInt(styleMatch[1]);
  }

  const heightAttr = parsePositiveInt(extractHtmlAttr(attrs, 'height'));
  if (heightAttr > 0 && heightAttr <= 4096) {
    return heightAttr;
  }

  const title = extractHtmlAttr(attrs, 'title');
  return tryParseEditorSizeTitle(title).height;
}

function tryParseEditorSizeTitle(title) {
  const text = String(title || '');
  const widthMatch = text.match(/(?:editor-width|width)\s*:\s*(\d+)/i);
  const heightMatch = text.match(/(?:editor-height|height)\s*:\s*(\d+)/i);
  return {
    width: widthMatch ? parsePositiveInt(widthMatch[1]) : 0,
    height: heightMatch ? parsePositiveInt(heightMatch[1]) : 0
  };
}

function buildSizedImageTitle(width, height = 0) {
  return height > 0
    ? `editor-width:${width} editor-height:${height}`
    : `editor-width:${width}`;
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function buildExportImgHtml(src, alt, width = 0, height = 0) {
  const safeSrc = escapeHtmlAttr(src);
  const safeAlt = escapeHtmlAttr(alt);
  let attrs = `class="export-sized-image" src="${safeSrc}" alt="${safeAlt}"`;
  if (width > 0) {
    attrs += ` width="${width}"`;
  }
  if (height > 0) {
    attrs += ` height="${height}"`;
  }
  if (width > 0 && height > 0) {
    attrs += ` style="width:${width}px;height:${height}px;object-fit:contain;max-width:none;display:block;"`;
  } else if (width > 0) {
    attrs += ` style="width:${width}px;height:auto;max-width:none;display:block;"`;
  }
  return `<img ${attrs}>`;
}

function wrapPageAssetUri(pageId, fileName) {
  return `<page-asset:${pageId}/${fileName}>`;
}

function buildMarkdownImageReference(alt, url, width = 0, height = 0) {
  if (!width) {
    return `![${alt}](${url})`;
  }
  return `![${alt}](${url} "${buildSizedImageTitle(width, height)}")`;
}

function collapseEditorImageArtifacts(markdown) {
  let result = String(markdown || '')
    .replace(EDITOR_IMAGE_HANDLE_REGEX, '');

  result = result.replace(EDITOR_IMAGE_WRAP_REGEX, (match, wrapAttrs, inner) => {
    const imgMatch = /<img\b([^>]*?)\/?>/i.exec(inner);
    if (!imgMatch) {
      return match;
    }

    const imgAttrs = imgMatch[1];
    const width = tryGetImageWidthPx(wrapAttrs) || tryGetImageWidthPx(imgAttrs);
    const height = tryGetImageHeightPx(wrapAttrs) || tryGetImageHeightPx(imgAttrs);
    const src = extractHtmlAttr(imgAttrs, 'data-permanent-src') || extractHtmlAttr(imgAttrs, 'src');
    const parsed = parsePageAssetRef(src);
    if (!parsed || !isImageAsset(parsed.fileName)) {
      return match;
    }

    const alt = extractHtmlAttr(imgAttrs, 'alt');
    return buildMarkdownImageReference(alt, wrapPageAssetUri(parsed.pageId, parsed.fileName), width, height);
  });

  return result.replace(HTML_IMG_REGEX, (match, attrs) => {
    const src = extractHtmlAttr(attrs, 'data-permanent-src') || extractHtmlAttr(attrs, 'src');
    const parsed = parsePageAssetRef(src);
    if (!parsed || !isImageAsset(parsed.fileName)) {
      return match;
    }

    const width = tryGetImageWidthPx(attrs);
    const height = tryGetImageHeightPx(attrs);
    const alt = extractHtmlAttr(attrs, 'alt');
    return buildMarkdownImageReference(alt, wrapPageAssetUri(parsed.pageId, parsed.fileName), width, height);
  });
}

function getAssetBytes(db, user, pageId, fileName) {
  if (!db || !user) {
    return null;
  }
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

    const title = titleDouble || titleSingle || '';
    const { width, height } = tryParseEditorSizeTitle(title);
    const dataUri = buildDataUri(bytes, parsed.fileName);
    return buildMarkdownImageReference(alt, dataUri, width, height);
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
    const { width, height } = tryParseEditorSizeTitle(title);
    return buildMarkdownImageReference(alt, relativePath, width, height);
  };

  result = result.replace(MARKDOWN_IMAGE_REGEX, replaceImage);

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

function embedSizedMarkdownImagesAsHtml(markdown) {
  return String(markdown || '').replace(
    MARKDOWN_IMAGE_REGEX,
    (match, alt, url, _titleGroup, titleDouble, titleSingle) => {
      const title = titleDouble || titleSingle || '';
      const { width, height } = tryParseEditorSizeTitle(title);
      if (!width) {
        return match;
      }

      const cleanUrl = String(url || '').trim().replace(/^<|>$/g, '');
      return buildExportImgHtml(cleanUrl, alt, width, height);
    }
  );
}

function finalizeSizedMarkdownForExport(markdown) {
  return embedSizedMarkdownImagesAsHtml(markdown);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMarkdownImageUrl(url) {
  return String(url || '').replace(/^<|>$/g, '').trim();
}

function replaceMarkdownImageReferenceForAsset(markdown, pageId, fileName, alt, width, height = 0) {
  let result = String(markdown || '');
  const names = [...new Set([fileName, encodeURIComponent(fileName)])];
  const safeAlt = String(alt || '');

  for (const name of names) {
    const pattern = new RegExp(
      `!\\[([^\\]]*)\\]\\(\\s*(?:<)?page-asset:(?:\\/\\/)?${pageId}\\/${escapeRegex(name)}(?:>)?(?:\\s+(?:"[^"]*"|'[^']*'))?\\s*\\)`,
      'i'
    );
    if (!pattern.test(result)) {
      continue;
    }
    return result.replace(pattern, (_match, matchedAlt) => buildMarkdownImageReference(
      matchedAlt || safeAlt || fileName,
      wrapPageAssetUri(pageId, fileName),
      width,
      height || 0
    ));
  }

  return result;
}

function applyImageSizesByOrderFromEditorHtml(markdown, wraps = []) {
  const sizedWraps = wraps
    .map((wrap) => {
      const width = tryGetImageWidthPx(wrap.wrapAttrs) || tryGetImageWidthPx(wrap.imgAttrs);
      if (!width) {
        return null;
      }
      return {
        width,
        height: tryGetImageHeightPx(wrap.wrapAttrs) || tryGetImageHeightPx(wrap.imgAttrs) || 0,
        alt: extractHtmlAttr(wrap.imgAttrs, 'alt') || ''
      };
    })
    .filter(Boolean);

  if (!sizedWraps.length) {
    return markdown;
  }

  let wrapIndex = 0;
  return String(markdown || '').replace(
    MARKDOWN_IMAGE_REGEX,
    (match, alt, url, _titleGroup, titleDouble, titleSingle) => {
      const title = titleDouble || titleSingle || '';
      if (tryParseEditorSizeTitle(title).width) {
        return match;
      }

      const cleanUrl = normalizeMarkdownImageUrl(url);
      const parsed = parsePageAssetRef(cleanUrl);
      const isDataUri = /^data:image\//i.test(cleanUrl);
      if (!parsed && !isDataUri) {
        return match;
      }
      if (parsed && !isImageAsset(parsed.fileName)) {
        return match;
      }

      const wrap = sizedWraps[wrapIndex];
      if (!wrap) {
        return match;
      }
      wrapIndex += 1;

      if (isDataUri) {
        return buildMarkdownImageReference(alt || wrap.alt, cleanUrl, wrap.width, wrap.height);
      }

      return buildMarkdownImageReference(
        alt || wrap.alt || parsed.fileName,
        wrapPageAssetUri(parsed.pageId, parsed.fileName),
        wrap.width,
        wrap.height
      );
    }
  );
}

function collectEditorImageWrapsFromHtml(html) {
  const wraps = [];
  const regex = /<span\b([^>]*class=["'][^"']*editor-image-wrap[^"']*["'][^>]*)>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = regex.exec(String(html || ''))) !== null) {
    const imgMatch = /<img\b([^>]*?)\/?>/i.exec(match[2]);
    if (!imgMatch) {
      continue;
    }
    wraps.push({
      wrapAttrs: match[1],
      imgAttrs: imgMatch[1]
    });
  }
  return wraps;
}

function applyEditorImageSizesToMarkdown(editorHtml, markdown) {
  const html = String(editorHtml || '');
  if (!html.trim()) {
    return String(markdown || '');
  }

  let result = String(markdown || '');
  const wraps = collectEditorImageWrapsFromHtml(html);
  if (!wraps.length) {
    return result;
  }

  for (const wrap of wraps) {
    const width = tryGetImageWidthPx(wrap.wrapAttrs) || tryGetImageWidthPx(wrap.imgAttrs);
    if (!width) {
      continue;
    }

    const height = tryGetImageHeightPx(wrap.wrapAttrs) || tryGetImageHeightPx(wrap.imgAttrs) || 0;
    const src = extractHtmlAttr(wrap.imgAttrs, 'data-permanent-src') || extractHtmlAttr(wrap.imgAttrs, 'src');
    const parsed = parsePageAssetRef(src);
    if (!parsed || !isImageAsset(parsed.fileName)) {
      continue;
    }

    const alt = extractHtmlAttr(wrap.imgAttrs, 'alt') || '';
    const replaced = replaceMarkdownImageReferenceForAsset(
      result,
      parsed.pageId,
      parsed.fileName,
      alt,
      width,
      height
    );
    if (replaced !== result) {
      result = replaced;
    }
  }

  return applyImageSizesByOrderFromEditorHtml(result, wraps);
}

function prepareMarkdownForExport(markdown, db, user, exportFilePath, { embedImagesAsBase64 = false, editorHtml = null } = {}) {
  let body = collapseEditorImageArtifacts(markdown);
  if (editorHtml) {
    body = applyEditorImageSizesToMarkdown(editorHtml, body);
  }
  if (embedImagesAsBase64) {
    body = materializeMarkdownImagesAsBase64(body, db, user);
    return finalizeSizedMarkdownForExport(body);
  }

  const directory = path.dirname(exportFilePath);
  if (!directory) {
    return finalizeSizedMarkdownForExport(body);
  }

  const assetsFolderName = `${path.basename(exportFilePath, path.extname(exportFilePath))}_assets`;
  const assetsFolder = path.join(directory, assetsFolderName);
  body = materializeMarkdownImagesToFolder(body, db, user, assetsFolderName, assetsFolder);
  return finalizeSizedMarkdownForExport(body);
}

module.exports = {
  prepareMarkdownForExport,
  materializeMarkdownImagesAsBase64,
  materializeMarkdownImagesToFolder,
  collapseEditorImageArtifacts,
  applyEditorImageSizesToMarkdown,
  buildMarkdownImageReference,
  buildExportImgHtml,
  embedSizedMarkdownImagesAsHtml,
  finalizeSizedMarkdownForExport,
  tryParseEditorSizeTitle,
  parsePageAssetRef
};
