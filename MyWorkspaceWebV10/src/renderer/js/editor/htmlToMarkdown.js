import TurndownService from '../../vendor/turndown.es.js';
import {
  buildSizedMarkdownImageReference,
  parsePageAssetSrc,
  toStoredAssetSrc,
  resolveImageSrcFromImgElement,
  resolveParsedImageAssetFromImgElement
} from './pageMarkdownNormalizer.js';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-'
});

turndown.addRule('editorImageChildImg', {
  filter(node) {
    return node.nodeName === 'IMG' && Boolean(node.closest?.('.editor-image-wrap'));
  },
  replacement() {
    return '';
  }
});

turndown.addRule('editorImageResizeHandle', {
  filter(node) {
    return node.nodeName === 'SPAN' && node.classList?.contains('editor-image-resize-handle');
  },
  replacement() {
    return '';
  }
});

turndown.addRule('editorImageWrap', {
  filter(node) {
    return node.nodeName === 'SPAN' && node.classList?.contains('editor-image-wrap');
  },
  replacement(_content, node) {
    const img = node.querySelector('img');
    if (!img) {
      return '';
    }
    const alt = img.getAttribute('alt') || '';
    const parsed = resolveParsedImageAssetFromImgElement(img);
    const wrapStyle = node.getAttribute('style') || '';
    const imgStyle = img.getAttribute('style') || '';
    const wrapWidthMatch = wrapStyle.match(/\bwidth\s*:\s*(\d+)\s*px/i);
    const wrapHeightMatch = wrapStyle.match(/\bheight\s*:\s*(\d+)\s*px/i);
    const imgWidthMatch = imgStyle.match(/\bwidth\s*:\s*(\d+)\s*px/i);
    const imgHeightMatch = imgStyle.match(/\bheight\s*:\s*(\d+)\s*px/i);
    const width = img.getAttribute('data-editor-width') || node.getAttribute('data-editor-width')
      || img.getAttribute('width') || node.getAttribute('width')
      || (wrapWidthMatch ? wrapWidthMatch[1] : null)
      || (imgWidthMatch ? imgWidthMatch[1] : null);
    const height = img.getAttribute('data-editor-height') || node.getAttribute('data-editor-height')
      || img.getAttribute('height') || node.getAttribute('height')
      || (wrapHeightMatch ? wrapHeightMatch[1] : null)
      || (imgHeightMatch ? imgHeightMatch[1] : null);
    if (width && parsed) {
      return buildSizedMarkdownImageReference(
        parsed.pageId,
        parsed.fileName,
        Number.parseInt(width, 10),
        alt,
        height ? Number.parseInt(height, 10) : 0
      );
    }
    const src = resolveImageSrcFromImgElement(img);
    return `![${alt}](${src})`;
  }
});

turndown.addRule('editorFileAttachment', {
  filter(node) {
    return node.nodeName === 'A' && node.classList?.contains('editor-file-attachment');
  },
  replacement(_content, node) {
    const href = node.getAttribute('href') || '';
    const parsed = parsePageAssetSrc(href);
    if (parsed && /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(parsed.fileName)) {
      const alt = node.textContent?.trim() || parsed.fileName;
      return `![${alt}](${toStoredAssetSrc(href)})`;
    }
    const text = node.textContent?.trim() || href;
    return `[${text}](${toStoredAssetSrc(href) || href})`;
  }
});

turndown.addRule('preserveLineBreaks', {
  filter: 'br',
  replacement: () => '  \n'
});

export function htmlToMarkdown(html) {
  if (!html || !html.trim()) {
    return '';
  }
  return turndown.turndown(html).trim();
}

export function extractTitleFromHtml(html, fallback = '제목없음') {
  const match = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (!match) {
    return fallback;
  }
  return match[1].replace(/<[^>]+>/g, '').trim() || fallback;
}
