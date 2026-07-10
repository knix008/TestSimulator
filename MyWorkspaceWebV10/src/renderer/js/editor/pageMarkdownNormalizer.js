const MARKDOWN_IMAGE_REGEX =
  /!\[([^\]]*)\]\((<?[^)>\s]+>?)(?:\s+("([^"]*)"|'([^']*)'))?\)/gi;
const HTML_IMG_TAG_REGEX = /<img\b([^>]*?)\/?>/gi;
const IMAGE_FILE_REGEX = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const CORRUPTED_SIZED_IMAGE_REGEX =
  /!\[([^\]]*)\]\(\s*(?:<)?page-asset:(?:\/\/)?(\d+)\/([^)\s"]+?)(?:>)?\s+"editor-width:(\d+)"\s*\)/gi;

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function extractAttributeValue(attrs, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = pattern.exec(attrs || '');
  if (!match) {
    return null;
  }
  return match[2] ?? match[3] ?? null;
}

function stripEditorArtifacts(text) {
  return String(text || '').replace(/\u200B/g, '');
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

export function parsePageAssetSrc(src) {
  let normalized = stripEditorArtifacts(String(src || '').trim()).replace(/^<|>$/g, '');
  if (!normalized) {
    return null;
  }

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // keep as-is
  }
  normalized = normalized.replace(/>$/, '');

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

export function tryParseEditorWidthTitle(title) {
  if (!title) {
    return null;
  }

  let match = title.match(/(?:editor-width|width)\s*:\s*(\d+)/i);
  if (match) {
    const width = Number.parseInt(match[1], 10);
    return width > 0 ? width : null;
  }

  match = title.match(/\{width\s*=\s*(\d+)\}/i);
  if (match) {
    const width = Number.parseInt(match[1], 10);
    return width > 0 ? width : null;
  }

  return null;
}

export function tryParseEditorHeightTitle(title) {
  if (!title) {
    return null;
  }

  const match = title.match(/(?:editor-height|height)\s*:\s*(\d+)/i);
  if (!match) {
    return null;
  }

  const height = Number.parseInt(match[1], 10);
  return height > 0 ? height : null;
}

export function tryParseEditorSizeTitle(title) {
  return {
    width: tryParseEditorWidthTitle(title),
    height: tryParseEditorHeightTitle(title)
  };
}

export function tryGetImageWidthPx(attrs) {
  const dataWidth = extractAttributeValue(attrs, 'data-editor-width');
  if (dataWidth) {
    const parsed = Number.parseInt(dataWidth, 10);
    if (parsed > 0) {
      return parsed;
    }
  }

  const style = extractAttributeValue(attrs, 'style') || attrs;
  const styleMatch = String(style).match(/\bwidth\s*:\s*(\d+)\s*px/i);
  if (styleMatch) {
    const parsed = Number.parseInt(styleMatch[1], 10);
    if (parsed > 0) {
      return parsed;
    }
  }

  const widthAttr = extractAttributeValue(attrs, 'width');
  if (widthAttr) {
    const parsed = Number.parseInt(widthAttr, 10);
    if (parsed > 0 && parsed <= 4096) {
      return parsed;
    }
  }

  const title = extractAttributeValue(attrs, 'title');
  if (title) {
    const parsed = tryParseEditorWidthTitle(title);
    if (parsed) {
      return parsed;
    }
  }

  return 0;
}

export function tryGetImageHeightPx(attrs) {
  const dataHeight = extractAttributeValue(attrs, 'data-editor-height');
  if (dataHeight) {
    const parsed = Number.parseInt(dataHeight, 10);
    if (parsed > 0) {
      return parsed;
    }
  }

  const style = extractAttributeValue(attrs, 'style') || attrs;
  const styleMatch = String(style).match(/\bheight\s*:\s*(\d+)\s*px/i);
  if (styleMatch) {
    const parsed = Number.parseInt(styleMatch[1], 10);
    if (parsed > 0) {
      return parsed;
    }
  }

  const heightAttr = extractAttributeValue(attrs, 'height');
  if (heightAttr) {
    const parsed = Number.parseInt(heightAttr, 10);
    if (parsed > 0 && parsed <= 4096) {
      return parsed;
    }
  }

  const title = extractAttributeValue(attrs, 'title');
  if (title) {
    const parsed = tryParseEditorHeightTitle(title);
    if (parsed) {
      return parsed;
    }
  }

  return 0;
}

export function buildSizedImageTag(src, width, alt = '', height = 0) {
  const safeSrc = escapeHtmlAttribute(src);
  const safeAlt = escapeHtmlAttribute(alt);
  const heightPx = Number.parseInt(height, 10);
  if (heightPx > 0) {
    return `<img src="${safeSrc}" data-permanent-src="${safeSrc}" width="${width}" height="${heightPx}" data-editor-width="${width}" data-editor-height="${heightPx}" style="width: ${width}px; height: ${heightPx}px; max-width: none; object-fit: fill;" alt="${safeAlt}">`;
  }
  return `<img src="${safeSrc}" data-permanent-src="${safeSrc}" width="${width}" data-editor-width="${width}" style="width: ${width}px; height: auto; max-width: none;" alt="${safeAlt}">`;
}

function ensureImgAttrsHaveDisplaySize(attrs, widthPx, heightPx = 0) {
  const src = extractAttributeValue(attrs, 'src');
  if (!src) {
    return attrs;
  }
  const permanentSrc = extractAttributeValue(attrs, 'data-permanent-src') || src;
  const alt = extractAttributeValue(attrs, 'alt') || '';
  const altAttr = alt ? ` alt="${escapeHtmlAttribute(alt)}"` : '';
  const permanentAttr = ` data-permanent-src="${escapeHtmlAttribute(permanentSrc)}"`;
  const height = Number.parseInt(heightPx, 10);
  if (height > 0) {
    return ` src="${escapeHtmlAttribute(src)}"${permanentAttr}${altAttr} data-editor-width="${widthPx}" data-editor-height="${height}" style="width: 100%; height: 100%; max-width: none; object-fit: fill; display: block;"`;
  }
  return ` src="${escapeHtmlAttribute(src)}"${permanentAttr}${altAttr} data-editor-width="${widthPx}" style="width: 100%; height: auto; max-width: none; display: block;"`;
}

export function wrapImagesForEditing(html) {
  return String(html || '').replace(HTML_IMG_TAG_REGEX, (match, attrs) => {
    if (/editor-image-wrap/i.test(match)) {
      return match;
    }

    const widthPx = tryGetImageWidthPx(attrs);
    const heightPx = tryGetImageHeightPx(attrs);
    if (!widthPx) {
      const src = extractAttributeValue(attrs, 'src');
      let normalizedAttrs = attrs.trim();
      if (src && parsePageAssetSrc(src) && !/data-permanent-src/i.test(normalizedAttrs)) {
        normalizedAttrs += ` data-permanent-src="${escapeHtmlAttribute(src)}"`;
      }
      return `<span class="editor-image-wrap" contenteditable="false"><img ${normalizedAttrs}><span class="editor-image-resize-handle" contenteditable="false"></span></span>`;
    }

    const normalizedAttrs = ensureImgAttrsHaveDisplaySize(attrs, widthPx, heightPx);
    const wrapStyle = heightPx > 0
      ? ` style="width: ${widthPx}px; height: ${heightPx}px;"`
      : ` style="width: ${widthPx}px;"`;
    const heightClass = heightPx > 0 ? ' has-editor-height' : '';
    const heightData = heightPx > 0 ? ` data-editor-height="${heightPx}"` : '';
    return `<span class="editor-image-wrap is-sized${heightClass}" contenteditable="false" data-editor-width="${widthPx}" data-loaded-size="1"${heightData}${wrapStyle}><img${normalizedAttrs}><span class="editor-image-resize-handle" contenteditable="false"></span></span>`;
  });
}

function normalizeMarkdownImageUrl(url) {
  return stripEditorArtifacts(String(url || '').replace(/^<|>$/g, '').trim());
}

function buildEditorUri(pageId, fileName) {
  return `page-asset://${pageId}/${encodeURIComponent(fileName)}`;
}

function buildStoredAssetUri(pageId, fileName) {
  return `page-asset:${pageId}/${fileName}`;
}

function wrapMarkdownAssetUri(assetUri) {
  const stored = toStoredAssetSrc(assetUri) || assetUri;
  return stored.startsWith('<') ? stored : `<${stored}>`;
}

export function buildSizedMarkdownImageReference(pageId, fileName, widthPx, alt = '', heightPx = 0) {
  const assetUri = buildStoredAssetUri(pageId, fileName);
  const height = Number.parseInt(heightPx, 10);
  const sizeTitle = height > 0
    ? `editor-width:${widthPx} editor-height:${height}`
    : `editor-width:${widthPx}`;
  return `![${alt}](${wrapMarkdownAssetUri(assetUri)} "${sizeTitle}")`;
}

function normalizePageId(pageId) {
  const parsed = Number.parseInt(String(pageId ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pageIdsMatch(left, right) {
  const leftId = normalizePageId(left);
  const rightId = normalizePageId(right);
  return leftId != null && leftId === rightId;
}

function tryParsePageAssetReference(url, pageId) {
  const parsed = parsePageAssetSrc(normalizeMarkdownImageUrl(url));
  if (!parsed || !pageIdsMatch(parsed.pageId, pageId)) {
    return null;
  }
  return parsed.fileName;
}

function isSupportedImageFileName(fileName) {
  return IMAGE_FILE_REGEX.test(fileName || '');
}

export function resolveImageSrcFromImgElement(img) {
  if (!img) {
    return '';
  }

  const candidates = [img.getAttribute('data-permanent-src'), img.getAttribute('src')];
  for (const candidate of candidates) {
    if (candidate && parsePageAssetSrc(candidate)) {
      return toStoredAssetSrc(candidate);
    }
  }

  return toStoredAssetSrc(img.getAttribute('src') || '');
}

export function resolveParsedImageAssetFromImgElement(img) {
  if (!img) {
    return null;
  }

  const candidates = [img.getAttribute('data-permanent-src'), img.getAttribute('src')];
  for (const candidate of candidates) {
    const parsed = parsePageAssetSrc(candidate || '');
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function promoteImageFileLinksInMarkdown(markdown, pageId) {
  if (pageId == null) {
    return markdown;
  }

  return String(markdown || '').replace(
    /(?<!!)\[([^\]]*)\]\(\s*(?:<)?(page-asset:(?:\/\/)?\d+\/[^)\s"<>]+)(?:>)?\s*\)/gi,
    (match, label, url) => {
      const parsed = parsePageAssetSrc(normalizeMarkdownImageUrl(url));
      if (!parsed || !pageIdsMatch(parsed.pageId, pageId) || !isSupportedImageFileName(parsed.fileName)) {
        return match;
      }

      const alt = String(label || '').trim() || parsed.fileName;
      return `![${alt}](${toStoredAssetSrc(url)})`;
    }
  );
}

export function collapseEditorImagesInMarkdown(markdown, pageId) {
  if (pageId == null) {
    return markdown;
  }

  return String(markdown || '').replace(MARKDOWN_IMAGE_REGEX, (match, alt, url, _titleGroup, titleQuoted, titleSingle) => {
    const fileName = tryParsePageAssetReference(url, pageId);
    if (!fileName || !isSupportedImageFileName(fileName)) {
      return match;
    }

    const title = titleQuoted || titleSingle || '';
    const { width, height } = tryParseEditorSizeTitle(title);
    const stored = buildStoredAssetUri(pageId, fileName);
    if (width) {
      return buildSizedMarkdownImageReference(pageId, fileName, width, alt, height || 0);
    }

    return `![${alt}](${wrapMarkdownAssetUri(stored)})`;
  });
}

const MARKDOWN_FILE_LINK_REGEX =
  /(?<!!)\[([^\]]*)\]\(\s*(?:<)?(page-asset:(?:\/\/)?\d+\/[^)\s"<>]+)(?:>)?\s*\)/gi;

export function collapseEditorFileLinksInMarkdown(markdown, pageId) {
  if (pageId == null) {
    return markdown;
  }

  return String(markdown || '').replace(MARKDOWN_FILE_LINK_REGEX, (match, label, url) => {
    const parsed = parsePageAssetSrc(normalizeMarkdownImageUrl(url));
    if (!parsed || !pageIdsMatch(parsed.pageId, pageId)) {
      return match;
    }

    const stored = buildStoredAssetUri(pageId, parsed.fileName);
    return `[${label}](${wrapMarkdownAssetUri(stored)})`;
  });
}

function tryResolveStoredAssetUri(src, pageId) {
  const parsed = parsePageAssetSrc(src);
  const normalizedPageId = normalizePageId(pageId);
  if (!parsed || !normalizedPageId || parsed.pageId !== normalizedPageId) {
    return null;
  }
  if (!isSupportedImageFileName(parsed.fileName)) {
    return null;
  }
  return {
    fileName: parsed.fileName,
    editorUri: buildEditorUri(normalizedPageId, parsed.fileName)
  };
}

function resolveImageAssetFromAttrs(attrs, pageId) {
  const permanentSrc = extractAttributeValue(attrs, 'data-permanent-src');
  if (permanentSrc) {
    const resolved = tryResolveStoredAssetUri(permanentSrc, pageId);
    if (resolved) {
      return resolved;
    }
  }

  const src = extractAttributeValue(attrs, 'src');
  if (!src) {
    return null;
  }

  return tryResolveStoredAssetUri(src, pageId);
}

function resolveImageAssetFromElement(img, pageId) {
  if (!img) {
    return null;
  }

  const permanentSrc = img.getAttribute('data-permanent-src');
  if (permanentSrc) {
    const resolved = tryResolveStoredAssetUri(permanentSrc, pageId);
    if (resolved) {
      return resolved;
    }
  }

  return tryResolveStoredAssetUri(img.getAttribute('src') || '', pageId);
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
    return result.replace(pattern, (_match, matchedAlt) => buildSizedMarkdownImageReference(
      pageId,
      fileName,
      width,
      String(matchedAlt || safeAlt || fileName),
      height || 0
    ));
  }

  const sizedRef = buildSizedMarkdownImageReference(pageId, fileName, width, safeAlt || fileName, height || 0);
  if (!result.includes(sizedRef)) {
    result = result.trim() ? `${result}\n\n${sizedRef}` : sizedRef;
  }
  return result;
}

function readWrapWidthPxFromHtml(wrapHtml, imgAttrs = '') {
  let width = tryGetImageWidthPx(wrapHtml) || tryGetImageWidthPx(imgAttrs);
  if (width) {
    return width;
  }

  const styleMatch = String(wrapHtml || '').match(/\bstyle\s*=\s*["'][^"']*?\bwidth\s*:\s*(\d+)\s*px/i);
  return styleMatch ? Number.parseInt(styleMatch[1], 10) : 0;
}

function readWrapHeightPxFromHtml(wrapHtml, imgAttrs = '') {
  let height = tryGetImageHeightPx(wrapHtml) || tryGetImageHeightPx(imgAttrs);
  if (height) {
    return height;
  }

  const styleMatch = String(wrapHtml || '').match(/\bstyle\s*=\s*["'][^"']*?\bheight\s*:\s*(\d+)\s*px/i);
  return styleMatch ? Number.parseInt(styleMatch[1], 10) : 0;
}

function collectEditorImageWrapsFromHtml(html) {
  if (typeof DOMParser === 'undefined') {
    const stripped = String(html || '').replace(
      /<span\b[^>]*\beditor-image-resize-handle\b[^>]*>\s*<\/span>/gi,
      ''
    );
    return (stripped.match(EDITOR_IMAGE_WRAP_REGEX) || []).map((wrapHtml) => ({ wrapHtml }));
  }

  const doc = new DOMParser().parseFromString(`<div id="persist-root">${html}</div>`, 'text/html');
  return Array.from(doc.querySelectorAll('.editor-image-wrap')).map((wrap) => ({
    wrapEl: wrap,
    wrapHtml: wrap.outerHTML
  }));
}

export function repairCorruptedImageMarkdown(markdown) {
  let result = stripEditorArtifacts(markdown);
  result = result.replace(CORRUPTED_SIZED_IMAGE_REGEX, (match, alt, pageId, rawPath, width) => {
    const fileName = sanitizeAssetFileName(rawPath);
    if (!fileName || !isSupportedImageFileName(fileName)) {
      return match;
    }
    return buildSizedMarkdownImageReference(
      Number.parseInt(pageId, 10),
      fileName,
      Number.parseInt(width, 10),
      alt
    );
  });
  return result;
}

function expandMarkdownImageReferences(markdown, pageId) {
  return String(markdown || '').replace(MARKDOWN_IMAGE_REGEX, (match, alt, url, _titleGroup, titleQuoted, titleSingle) => {
    const title = titleQuoted || titleSingle || '';
    const { width, height } = tryParseEditorSizeTitle(title);
    const fileName = tryParsePageAssetReference(url, pageId);
    if (!fileName || !isSupportedImageFileName(fileName)) {
      return match;
    }

    const editorUri = buildEditorUri(pageId, fileName);
    if (width) {
      return buildSizedImageTag(editorUri, width, alt, height || 0);
    }

    return `![${alt}](${editorUri})`;
  });
}

function expandHtmlImageReferences(markdown, pageId) {
  return String(markdown || '').replace(HTML_IMG_TAG_REGEX, (match, attrs) => {
    const resolved = resolveImageAssetFromAttrs(attrs, pageId);
    if (!resolved) {
      return match;
    }

    const width = tryGetImageWidthPx(attrs);
    const height = tryGetImageHeightPx(attrs);
    const alt = extractAttributeValue(attrs, 'alt') || '';
    return width
      ? buildSizedImageTag(resolved.editorUri, width, alt, height || 0)
      : `<img src="${escapeHtmlAttribute(resolved.editorUri)}" data-permanent-src="${escapeHtmlAttribute(resolved.editorUri)}" alt="${escapeHtmlAttribute(alt)}">`;
  });
}

export function expandAssetReferences(markdown, pageId) {
  if (pageId == null) {
    return markdown;
  }

  let result = repairCorruptedImageMarkdown(markdown);
  result = expandMarkdownImageReferences(result, pageId);
  result = expandHtmlImageReferences(result, pageId);
  return result;
}

export function persistSizedImagesInMarkdown(markdown, pageId) {
  if (pageId == null) {
    return markdown;
  }

  return String(markdown || '').replace(HTML_IMG_TAG_REGEX, (match, attrs) => {
    const width = tryGetImageWidthPx(attrs);
    if (!width) {
      return match;
    }

    const resolved = resolveImageAssetFromAttrs(attrs, pageId);
    if (!resolved) {
      return match;
    }

    const height = tryGetImageHeightPx(attrs);
    const alt = extractAttributeValue(attrs, 'alt') || '';
    return buildSizedMarkdownImageReference(pageId, resolved.fileName, width, alt, height || 0);
  });
}

const EDITOR_IMAGE_WRAP_REGEX = /<span\b[^>]*class=["'][^"']*editor-image-wrap[^"']*["'][^>]*>[\s\S]*?<\/span>/gi;

function buildSizedMarkdownImageReferenceFromUrl(url, widthPx, alt = '', heightPx = 0) {
  const normalizedUrl = normalizeMarkdownImageUrl(url);
  const height = Number.parseInt(heightPx, 10);
  const sizeTitle = height > 0
    ? `editor-width:${widthPx} editor-height:${height}`
    : `editor-width:${widthPx}`;
  const wrappedUrl = normalizedUrl.startsWith('<') ? normalizedUrl : `<${normalizedUrl}>`;
  return `![${alt}](${wrappedUrl} "${sizeTitle}")`;
}

function isExportableMarkdownImageUrl(url) {
  const normalizedUrl = normalizeMarkdownImageUrl(url);
  if (/^data:image\//i.test(normalizedUrl)) {
    return true;
  }
  const parsed = parsePageAssetSrc(normalizedUrl);
  return Boolean(parsed && isSupportedImageFileName(parsed.fileName));
}

function applyImageSizeRecordsByOrder(markdown, pageId, records = []) {
  const normalizedPageId = normalizePageId(pageId);
  if (!normalizedPageId || !records.length) {
    return markdown;
  }

  let recordIndex = 0;
  return String(markdown || '').replace(
    MARKDOWN_IMAGE_REGEX,
    (match, alt, url, _titleGroup, titleQuoted, titleSingle) => {
      const title = titleQuoted || titleSingle || '';
      if (tryParseEditorSizeTitle(title).width) {
        return match;
      }

      if (!isExportableMarkdownImageUrl(url)) {
        return match;
      }

      const record = records[recordIndex];
      if (!record) {
        return match;
      }
      recordIndex += 1;

      const width = Number.parseInt(record.width, 10);
      if (!width) {
        return match;
      }

      const height = Number.parseInt(record.height, 10) || 0;
      const normalizedUrl = normalizeMarkdownImageUrl(url);
      if (/^data:image\//i.test(normalizedUrl)) {
        return buildSizedMarkdownImageReferenceFromUrl(
          normalizedUrl,
          width,
          String(alt || record.alt || ''),
          height
        );
      }

      const parsed = parsePageAssetSrc(normalizedUrl);
      const targetPageId = normalizePageId(record.pageId) || normalizedPageId;
      return buildSizedMarkdownImageReference(
        targetPageId,
        record.fileName || parsed?.fileName,
        width,
        String(alt || record.alt || parsed?.fileName || ''),
        height
      );
    }
  );
}

export function persistImageSizeRecordsInMarkdown(markdown, pageId, records = []) {
  const normalizedPageId = normalizePageId(pageId);
  if (!normalizedPageId || !records.length) {
    return markdown;
  }

  let result = String(markdown || '');
  for (const record of records) {
    const width = Number.parseInt(record?.width, 10);
    const fileName = String(record?.fileName || '').trim();
    if (!width || !fileName) {
      continue;
    }
    const targetPageId = normalizePageId(record.pageId) || normalizedPageId;
    const replaced = replaceMarkdownImageReferenceForAsset(
      result,
      targetPageId,
      fileName,
      record?.alt || '',
      width,
      Number.parseInt(record?.height, 10) || 0
    );
    if (replaced !== result) {
      result = replaced;
    }
  }

  return applyImageSizeRecordsByOrder(result, normalizedPageId, records);
}

export function persistSizedImagesFromEditorHtml(html, pageId, markdown = '') {
  const normalizedPageId = normalizePageId(pageId);
  if (normalizedPageId == null) {
    return markdown;
  }

  let result = String(markdown || '');
  const wraps = collectEditorImageWrapsFromHtml(html);

  for (const entry of wraps) {
    let width = 0;
    let height = 0;
    let alt = '';
    let resolved = null;

    if (entry.wrapEl) {
      const wrap = entry.wrapEl;
      const img = wrap.querySelector('img');
      if (!img) {
        continue;
      }
      const wrapHtml = wrap.outerHTML;
      const imgAttrs = Array.from(img.attributes)
        .map((attr) => `${attr.name}="${attr.value}"`)
        .join(' ');
      width = Number.parseInt(
        wrap.getAttribute('data-editor-width')
          || img.getAttribute('data-editor-width')
          || img.getAttribute('width')
          || '0',
        10
      );
      height = Number.parseInt(
        wrap.getAttribute('data-editor-height')
          || img.getAttribute('data-editor-height')
          || img.getAttribute('height')
          || '0',
        10
      );
      alt = img.getAttribute('alt') || '';
      resolved = resolveImageAssetFromElement(img, normalizedPageId);
      if (!width) {
        width = readWrapWidthPxFromHtml(wrapHtml, imgAttrs);
      }
      if (!height) {
        height = readWrapHeightPxFromHtml(wrapHtml, imgAttrs);
      }
    } else {
      const wrapHtml = entry.wrapHtml || '';
      const imgMatch = /<img\b([^>]*?)\/?>/i.exec(wrapHtml);
      if (!imgMatch) {
        continue;
      }
      const imgAttrs = imgMatch[1];
      width = readWrapWidthPxFromHtml(wrapHtml, imgAttrs);
      if (!width) {
        continue;
      }
      height = readWrapHeightPxFromHtml(wrapHtml, imgAttrs);
      alt = extractAttributeValue(imgAttrs, 'alt') || '';
      resolved = resolveImageAssetFromAttrs(imgAttrs, normalizedPageId);
    }

    if (!width || !resolved) {
      continue;
    }

    result = replaceMarkdownImageReferenceForAsset(
      result,
      normalizedPageId,
      resolved.fileName,
      alt,
      width,
      height || 0
    );
  }

  return result;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toStoredAssetSrc(src) {
  const parsed = parsePageAssetSrc(src);
  if (!parsed) {
    return src;
  }
  return buildStoredAssetUri(parsed.pageId, parsed.fileName);
}
