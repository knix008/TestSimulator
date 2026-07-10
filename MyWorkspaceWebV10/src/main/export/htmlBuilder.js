const { marked } = require('marked');
const { tryGetAssetBytes, guessContentType } = require('../services/pageAssetService');
const {
  materializeMarkdownImagesAsBase64,
  parsePageAssetRef,
  collapseEditorImageArtifacts,
  buildExportImgHtml,
  embedSizedMarkdownImagesAsHtml,
  applyEditorImageSizesToMarkdown
} = require('./markdownMaterializer');

marked.setOptions({ breaks: true, gfm: true });

const HTML_IMG_REGEX = /<img\b([^>]*?)\/?>/gi;
const EDITOR_IMAGE_WRAP_REGEX =
  /<span\b([^>]*class=["'][^"']*editor-image-wrap[^"']*["'][^>]*)>([\s\S]*?)<\/span>/gi;
const EDITOR_IMAGE_HANDLE_REGEX =
  /<span\b[^>]*class=["'][^"']*editor-image-resize-handle[^"']*["'][^>]*>\s*<\/span>/gi;

function buildDataUri(bytes, fileName) {
  const mime = guessContentType(fileName);
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function tryMaterializePageAsset(db, user, rawUrl) {
  if (!db || !user) {
    return null;
  }

  const parsed = parsePageAssetRef(rawUrl);
  if (!parsed) {
    return null;
  }

  const bytes = tryGetAssetBytes(db, user, parsed.pageId, parsed.fileName);
  if (!bytes) {
    return null;
  }

  return buildDataUri(bytes, parsed.fileName);
}

function materializePageAssets(markdown, db, user) {
  return materializeMarkdownImagesAsBase64(markdown, db, user);
}

function extractHtmlAttr(attrs, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(attrs);
  return match?.[2] || match?.[3] || match?.[4] || '';
}

function stripEditorArtifacts(html) {
  return String(html || '')
    .replace(EDITOR_IMAGE_WRAP_REGEX, '$2')
    .replace(EDITOR_IMAGE_HANDLE_REGEX, '');
}

function mergeWrapImageSizes(html) {
  return String(html || '').replace(EDITOR_IMAGE_WRAP_REGEX, (match, wrapAttrs, inner) => {
    const imgMatch = /<img\b([^>]*?)\/?>/i.exec(inner);
    if (!imgMatch) {
      return match;
    }

    const wrapWidth = extractHtmlAttr(wrapAttrs, 'data-editor-width')
      || ((wrapAttrs.match(/\bwidth\s*:\s*(\d+)\s*px/i) || [])[1] || '');
    const wrapHeight = extractHtmlAttr(wrapAttrs, 'data-editor-height')
      || ((wrapAttrs.match(/\bheight\s*:\s*(\d+)\s*px/i) || [])[1] || '');

    let imgAttrs = imgMatch[1];
    if (wrapWidth && !extractHtmlAttr(imgAttrs, 'data-editor-width')) {
      imgAttrs += ` data-editor-width="${wrapWidth}"`;
    }
    if (wrapHeight && !extractHtmlAttr(imgAttrs, 'data-editor-height')) {
      imgAttrs += ` data-editor-height="${wrapHeight}"`;
    }
    if (wrapWidth && !/\bwidth\s*=/i.test(imgAttrs)) {
      imgAttrs += ` width="${wrapWidth}"`;
    }
    if (wrapHeight && !/\bheight\s*=/i.test(imgAttrs)) {
      imgAttrs += ` height="${wrapHeight}"`;
    }

    const updatedImg = `<img ${imgAttrs.trim()}>`;
    const updatedInner = inner.replace(imgMatch[0], updatedImg);
    return `<span class="editor-image-wrap">${updatedInner}</span>`;
  });
}

function buildExportBodyFromEditorHtml(editorHtml, db, user) {
  let html = mergeWrapImageSizes(editorHtml);
  html = stripEditorArtifacts(html);
  return materializeHtmlImages(html, db, user);
}

function buildExportBodyFromMarkdown(title, markdown, db, user, editorHtml = null) {
  let body = String(markdown || '');
  if (editorHtml) {
    body = applyEditorImageSizesToMarkdown(editorHtml, body);
  }
  const normalizedMarkdown = collapseEditorImageArtifacts(ensureTitleHeading(title, body));
  const prepared = materializePageAssets(normalizedMarkdown, db, user);
  const withSizedImages = embedSizedMarkdownImagesAsHtml(prepared);
  let htmlBody = markdownToHtml(withSizedImages);
  htmlBody = stripEditorArtifacts(htmlBody);
  return materializeHtmlImages(htmlBody, db, user);
}

function buildExportDocumentHtml(title, htmlBody) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title || 'MyWorkspace')}</title>
  <style>
    body {
      font-family: "Segoe UI", "Malgun Gothic", sans-serif;
      line-height: 1.6;
      color: #1f2328;
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.2em; margin-bottom: 0.5em; }
    pre, code { font-family: Consolas, monospace; }
    pre { background: #f6f8fa; padding: 12px; overflow: auto; border-radius: 6px; }
    blockquote { border-left: 4px solid #d0d7de; margin: 0; padding-left: 12px; color: #57606a; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d0d7de; padding: 6px 8px; }
    img { max-width: 100%; height: auto; }
    img.export-sized-image,
    img[width] {
      max-width: none !important;
    }
    hr { border: 0; border-top: 1px solid #d0d7de; margin: 24px 0; }
  </style>
</head>
<body>${htmlBody}</body>
</html>`;
}

function tryParseEditorSizeTitle(title) {
  const text = String(title || '');
  const widthMatch = text.match(/(?:editor-width|width)\s*:\s*(\d+)/i);
  const heightMatch = text.match(/(?:editor-height|height)\s*:\s*(\d+)/i);
  const width = widthMatch ? Number.parseInt(widthMatch[1], 10) : 0;
  const height = heightMatch ? Number.parseInt(heightMatch[1], 10) : 0;
  return {
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0
  };
}

function resolveExportImageSize(attrs) {
  const dataWidth = Number.parseInt(extractHtmlAttr(attrs, 'data-editor-width'), 10);
  const dataHeight = Number.parseInt(extractHtmlAttr(attrs, 'data-editor-height'), 10);
  const widthAttr = Number.parseInt(extractHtmlAttr(attrs, 'width'), 10);
  const heightAttr = Number.parseInt(extractHtmlAttr(attrs, 'height'), 10);
  const style = String(attrs || '');
  const styleWidth = style.match(/\bwidth\s*:\s*(\d+)\s*px/i);
  const styleHeight = style.match(/\bheight\s*:\s*(\d+)\s*px/i);
  const titleSize = tryParseEditorSizeTitle(extractHtmlAttr(attrs, 'title'));

  const width = (Number.isFinite(dataWidth) && dataWidth > 0 ? dataWidth : 0)
    || (styleWidth ? Number.parseInt(styleWidth[1], 10) : 0)
    || (Number.isFinite(widthAttr) && widthAttr > 0 && widthAttr <= 4096 ? widthAttr : 0)
    || titleSize.width;
  const height = (Number.isFinite(dataHeight) && dataHeight > 0 ? dataHeight : 0)
    || (styleHeight ? Number.parseInt(styleHeight[1], 10) : 0)
    || (Number.isFinite(heightAttr) && heightAttr > 0 && heightAttr <= 4096 ? heightAttr : 0)
    || titleSize.height;

  return { width, height };
}

function buildExportImgTag(dataUri, alt, width = 0, height = 0) {
  return buildExportImgHtml(dataUri, alt, width, height);
}

function materializeHtmlImages(html, db, user) {
  return String(html || '').replace(HTML_IMG_REGEX, (match, attrs) => {
    const src = extractHtmlAttr(attrs, 'src');
    if (!src) {
      return match;
    }

    const alt = extractHtmlAttr(attrs, 'alt');
    const { width, height } = resolveExportImageSize(attrs);
    const dataUri = /^data:/i.test(src) ? src : tryMaterializePageAsset(db, user, src);

    if (dataUri && /^data:/i.test(dataUri)) {
      return buildExportImgTag(dataUri, alt, width, height);
    }

    if (/page-asset:/i.test(src)) {
      const parsed = parsePageAssetRef(src);
      const label = alt || parsed?.fileName || 'image';
      if (width > 0) {
        const fallbackSrc = tryMaterializePageAsset(db, user, src);
        if (fallbackSrc && /^data:/i.test(fallbackSrc)) {
          return buildExportImgTag(fallbackSrc, alt, width, height);
        }
      }
      return `<em>[Image: ${escapeHtml(label)}]</em>`;
    }

    if (/^https?:\/\//i.test(src)) {
      const label = alt || src;
      if (width > 0) {
        return buildExportImgTag(src, alt, width, height);
      }
      return `<a href="${escapeHtml(src)}">${escapeHtml(label)}</a>`;
    }

    if (width > 0 && !/^data:/i.test(src)) {
      return buildExportImgTag(src, alt, width, height);
    }

    return match;
  });
}

function ensureTitleHeading(title, markdown) {
  const trimmedTitle = (title || '').trim() || '제목없음';
  const body = String(markdown || '').trim();
  if (/^#\s/m.test(body)) {
    return body.replace(/^#\s+.*$/m, `# ${trimmedTitle}`);
  }
  return `# ${trimmedTitle}\n\n${body}`;
}

function markdownToHtml(markdown) {
  return marked.parse(markdown || '');
}

function buildExportHtml(title, markdown, db, user, options = {}) {
  const editorHtml = options?.editorHtml || null;
  const htmlBody = editorHtml && String(editorHtml).trim()
    ? buildExportBodyFromEditorHtml(editorHtml, db, user)
    : buildExportBodyFromMarkdown(title, markdown, db, user, editorHtml);
  return buildExportDocumentHtml(title, htmlBody);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  materializePageAssets,
  ensureTitleHeading,
  markdownToHtml,
  buildExportHtml,
  stripEditorArtifacts,
  materializeHtmlImages,
  mergeWrapImageSizes,
  buildExportBodyFromEditorHtml
};
