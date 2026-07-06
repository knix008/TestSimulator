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
    const width = img.getAttribute('data-editor-width') || node.getAttribute('data-editor-width')
      || img.getAttribute('width') || node.getAttribute('width');
    if (width && parsed) {
      return buildSizedMarkdownImageReference(
        parsed.pageId,
        parsed.fileName,
        Number.parseInt(width, 10),
        alt
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
