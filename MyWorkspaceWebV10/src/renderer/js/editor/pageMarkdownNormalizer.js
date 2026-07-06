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

export function buildSizedImageTag(src, width, alt = '') {
  const safeSrc = escapeHtmlAttribute(src);
  const safeAlt = escapeHtmlAttribute(alt);
  return `<img src="${safeSrc}" width="${width}" data-editor-width="${width}" style="width: ${width}px; height: auto; max-width: none;" alt="${safeAlt}">`;
}

function ensureImgAttrsHaveDisplayWidth(attrs, widthPx) {
  const src = extractAttributeValue(attrs, 'src');
  if (!src) {
    return attrs;
  }
  const alt = extractAttributeValue(attrs, 'alt') || '';
  const altAttr = alt ? ` alt="${escapeHtmlAttribute(alt)}"` : '';
  return ` src="${escapeHtmlAttribute(src)}"${altAttr} data-editor-width="${widthPx}" style="width: 100%; height: auto; max-width: none; display: block;"`;
}

export function wrapImagesForEditing(html) {
  return String(html || '').replace(HTML_IMG_TAG_REGEX, (match, attrs) => {
    if (/editor-image-wrap/i.test(match)) {
      return match;
    }

    const widthPx = tryGetImageWidthPx(attrs);
    if (!widthPx) {
      return `<span class="editor-image-wrap" contenteditable="false"><img ${attrs.trim()}><span class="editor-image-resize-handle" contenteditable="false"></span></span>`;
    }

    const normalizedAttrs = ensureImgAttrsHaveDisplayWidth(attrs, widthPx);
    return `<span class="editor-image-wrap is-sized" contenteditable="false" data-editor-width="${widthPx}" style="width: ${widthPx}px;"><img${normalizedAttrs}><span class="editor-image-resize-handle" contenteditable="false"></span></span>`;
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
  return assetUri.startsWith('<') ? assetUri : `<${assetUri}>`;
}

export function buildSizedMarkdownImageReference(pageId, fileName, widthPx, alt = '') {
  const assetUri = buildStoredAssetUri(pageId, fileName);
  return `![${alt}](${wrapMarkdownAssetUri(assetUri)} "editor-width:${widthPx}")`;
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
    const width = tryParseEditorWidthTitle(title);
    const fileName = tryParsePageAssetReference(url, pageId);
    if (!fileName || !isSupportedImageFileName(fileName)) {
      return match;
    }

    const editorUri = buildEditorUri(pageId, fileName);
    if (width) {
      return buildSizedImageTag(editorUri, width, alt);
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
    const alt = extractAttributeValue(attrs, 'alt') || '';
    return width
      ? buildSizedImageTag(resolved.editorUri, width, alt)
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

    const alt = extractAttributeValue(attrs, 'alt') || '';
    return buildSizedMarkdownImageReference(pageId, resolved.fileName, width, alt);
  });
}

export function toStoredAssetSrc(src) {
  const parsed = parsePageAssetSrc(src);
  if (!parsed) {
    return src;
  }
  return buildStoredAssetUri(parsed.pageId, parsed.fileName);
}
