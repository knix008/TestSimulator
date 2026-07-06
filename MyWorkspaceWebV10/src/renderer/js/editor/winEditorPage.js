import { marked } from '../../vendor/marked.esm.js';
import { expandAssetReferences, wrapImagesForEditing } from './pageMarkdownNormalizer.js';

let templateCache = null;

const TEMPLATE_TOKENS = {
  lang: 'ko',
  colorScheme: 'light',
  bodyFontSize: '15',
  bg: '#F6F8FA',
  text: '#000000',
  caret: '#0969DA',
  placeholder: '#8C959F',
  focus: '#0969DA33',
  codeBg: '#E7EBF1',
  border: '#9AA3B0',
  borderLight: '#BAC1CB',
  surface: '#FFFFFF',
  accent: '#0969DA',
  muted: '#57606A',
  selection: '#0969DA33',
  PlaceholderToken: '내용을 입력하세요...',
  DefaultCodeToken: 'code',
  BodyPlaceholder: '/*EDITOR_BODY*/'
};

function applyTemplateTokens(template) {
  let result = template;
  for (const [key, value] of Object.entries(TEMPLATE_TOKENS)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

export async function loadEditorTemplate() {
  if (!templateCache) {
    const response = await fetch('editor/win-editor-template.html');
    if (!response.ok) {
      throw new Error('WinV10 editor template not found. Run: node scripts/extract-win-editor.js');
    }
    templateCache = await response.text();
  }
  return templateCache;
}

export function injectHeadingIds(html) {
  let index = 0;
  return html.replace(/<h([1-6])([^>]*)>/gi, (_match, level, attrs) => {
    index += 1;
    const cleaned = attrs.replace(/\sid\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
    return `<h${level}${cleaned} id="outline-heading-${index}">`;
  });
}

export { wrapImagesForEditing } from './pageMarkdownNormalizer.js';

export function wrapFileLinksForEditing(html) {
  return html.replace(
    /<a\b(?![^>]*class=["']editor-file-attachment["'])([^>]*?\shref=["']([^"']+)["'][^>]*?)>(.*?)<\/a>/gi,
    (match, attrs, href, text) => {
      if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
        return match;
      }
      if (!/page-asset:/i.test(href) && !/^page-asset:\/\//i.test(href) && !/^file:/i.test(href)) {
        return match;
      }
      return `<a class="editor-file-attachment" contenteditable="false"${attrs}>${text}</a>`;
    }
  );
}

export function expandPageAssetUrls(markdown) {
  return String(markdown || '').replace(
    /page-asset:(?!\/\/)(\d+)\/([^?\s)"'<>]+)/gi,
    (_match, pageId, fileName) => `page-asset://${pageId}/${encodeURIComponent(fileName)}`
  );
}

export function markdownToEditorBody(markdown, pageId = null) {
  let prepared = expandAssetReferences(markdown, pageId);
  prepared = expandPageAssetUrls(prepared);
  let body = marked.parse(prepared || '', { breaks: true, gfm: true });
  if (!body || !body.trim()) {
    body = '<p><br></p>';
  } else {
    body = injectHeadingIds(body);
    body = wrapImagesForEditing(body);
    body = wrapFileLinksForEditing(body);
  }
  return body;
}

export async function buildEditorDocument(markdown, pageId = null) {
  const template = await loadEditorTemplate();
  const body = markdownToEditorBody(markdown, pageId);
  if (template.includes('/*EDITOR_BODY*/')) {
    return template.replace('/*EDITOR_BODY*/', body);
  }
  if (template.includes('{BodyPlaceholder}')) {
    return applyTemplateTokens(template).replace('{BodyPlaceholder}', body);
  }
  throw new Error('Editor template is missing body placeholder. Run: node scripts/extract-win-editor.js');
}
