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

  return 0;
}

export function buildSizedImageTag(src, width, alt = '', height = 0) {
  const safeSrc = escapeHtmlAttribute(src);
  const safeAlt = escapeHtmlAttribute(alt);
  const heightPx = Number.parseInt(height, 10);
  if (heightPx > 0) {
    return `<img src="${safeSrc}" width="${width}" height="${heightPx}" data-editor-width="${width}" data-editor-height="${heightPx}" style="width: ${width}px; height: ${heightPx}px; max-width: none; object-fit: fill;" alt="${safeAlt}">`;
  }
  return `<img src="${safeSrc}" width="${width}" data-editor-width="${width}" style="width: ${width}px; height: auto; max-width: none;" alt="${safeAlt}">`;
}

function ensureImgAttrsHaveDisplaySize(attrs, widthPx, heightPx = 0) {
  const src = extractAttributeValue(attrs, 'src');
  if (!src) {
    return attrs;
  }
  const alt = extractAttributeValue(attrs, 'alt') || '';
  const altAttr = alt ? ` alt="${escapeHtmlAttribute(alt)}"` : '';
  const height = Number.parseInt(heightPx, 10);
  if (height > 0) {
    return ` src="${escapeHtmlAttribute(src)}"${altAttr} data-editor-width="${widthPx}" data-editor-height="${height}" style="width: 100%; height: 100%; max-width: none; object-fit: fill; display: block;"`;
  }
  return ` src="${escapeHtmlAttribute(src)}"${altAttr} data-editor-width="${widthPx}" style="width: 100%; height: auto; max-width: none; display: block;"`;
}

export function wrapImagesForEditing(html) {
  return String(html || '').replace(HTML_IMG_TAG_REGEX, (match, attrs) => {
    if (/editor-image-wrap/i.test(match)) {
      return match;
    }

    const widthPx = tryGetImageWidthPx(attrs);
    const heightPx = tryGetImageHeightPx(attrs);
    if (!widthPx) {
      return `<span class="editor-image-wrap" contenteditable="false"><img ${attrs.trim()}><span class="editor-image-resize-handle editor-image-resize-handle--e" contenteditable="false"></span><span class="editor-image-resize-handle editor-image-resize-handle--s" contenteditable="false"></span><span class="editor-image-resize-handle editor-image-resize-handle--se" contenteditable="false"></span></span>`;
    }

    const normalizedAttrs = ensureImgAttrsHaveDisplaySize(attrs, widthPx, heightPx);
    const wrapStyle = heightPx > 0
      ? ` style="width: ${widthPx}px; height: ${heightPx}px;"`
      : ` style="width: ${widthPx}px;"`;
    const heightClass = heightPx > 0 ? ' has-editor-height' : '';
    const heightData = heightPx > 0 ? ` data-editor-height="${heightPx}"` : '';
    return `<span class="editor-image-wrap is-sized${heightClass}" contenteditable="false" data-editor-width="${widthPx}"${heightData}${wrapStyle}><img${normalizedAttrs}><span class="editor-image-resize-handle editor-image-resize-handle--e" contenteditable="false"></span><span class="editor-image-resize-handle editor-image-resize-handle--s" contenteditable="false"></span><span class="editor-image-resize-handle editor-image-resize-handle--se" contenteditable="false"></span></span>`;
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

function tryParsePageAssetReference(url, pageId) {
  const parsed = parsePageAssetSrc(normalizeMarkdownImageUrl(url));
  if (!parsed || parsed.pageId !== pageId) {
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
      if (!parsed || parsed.pageId !== pageId || !isSupportedImageFileName(parsed.fileName)) {
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
    if (!parsed || parsed.pageId !== pageId) {
      return match;
    }

    const stored = buildStoredAssetUri(pageId, parsed.fileName);
    return `[${label}](${wrapMarkdownAssetUri(stored)})`;
  });
}

function tryResolveStoredAssetUri(src, pageId) {
  const parsed = parsePageAssetSrc(src);
  if (!parsed || parsed.pageId !== pageId) {
    return null;
  }
  if (!isSupportedImageFileName(parsed.fileName)) {
    return null;
  }
  return {
    fileName: parsed.fileName,
    editorUri: buildEditorUri(pageId, parsed.fileName)
  };
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
    const src = extractAttributeValue(attrs, 'src');
    if (!src) {
      return match;
    }

    const resolved = tryResolveStoredAssetUri(src, pageId);
    if (!resolved) {
      return match;
    }

    const width = tryGetImageWidthPx(attrs);
    const height = tryGetImageHeightPx(attrs);
    const alt = extractAttributeValue(attrs, 'alt') || '';
    return width
      ? buildSizedImageTag(resolved.editorUri, width, alt, height || 0)
      : `<img src="${escapeHtmlAttribute(resolved.editorUri)}" alt="${escapeHtmlAttribute(alt)}">`;
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

    const src = extractAttributeValue(attrs, 'src');
    if (!src) {
      return match;
    }

    const resolved = tryResolveStoredAssetUri(src, pageId);
    if (!resolved) {
      return match;
    }

    const height = tryGetImageHeightPx(attrs);
    const alt = extractAttributeValue(attrs, 'alt') || '';
    return buildSizedMarkdownImageReference(pageId, resolved.fileName, width, alt, height || 0);
  });
}

export function toStoredAssetSrc(src) {
  const parsed = parsePageAssetSrc(src);
  if (!parsed) {
    return src;
  }
  return buildStoredAssetUri(parsed.pageId, parsed.fileName);
}
