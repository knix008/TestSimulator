import TurndownService from '../../vendor/turndown.es.js';

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
    const src = img.getAttribute('src') || '';
    const width = img.getAttribute('data-editor-width') || node.getAttribute('data-editor-width');
    if (width) {
      return `![${alt}](${src} "{width=${width}}")`;
    }
    return `![${alt}](${src})`;
  }
});

turndown.addRule('editorFileAttachment', {
  filter(node) {
    return node.nodeName === 'A' && node.classList?.contains('editor-file-attachment');
  },
  replacement(_content, node) {
    const href = node.getAttribute('href') || '';
    const text = node.textContent?.trim() || href;
    return `[${text}](${href})`;
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
