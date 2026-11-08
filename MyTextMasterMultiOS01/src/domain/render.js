// Markdown → HTML for the preview, HTML export and printing. Each top-level block is wrapped
// in <div data-line="n"> (its first source line), which is what keeps the editor and the
// preview scrolled to the same place. Headings get ids (slugs) so the outline and #links work.
import { Marked } from 'marked';
import { slugify } from './outline.js';
import { PREVIEW_CSS } from './previewcss.js';

function makeMarked(ids) {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const base = slugify(text);
        const n = ids.get(base) ?? 0;
        ids.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  return marked;
}

/** Markdown to HTML (not sanitized: the preview runs it through DOMPurify). */
export function markdownToHtml(source, { lines = true } = {}) {
  const ids = new Map();
  const marked = makeMarked(ids);
  const tokens = marked.lexer(String(source ?? ''));
  if (!lines) return marked.parser(tokens);
  let line = 1;
  let html = '';
  for (const token of tokens) {
    const start = line;
    line += (token.raw.match(/\n/g) ?? []).length;
    if (token.type === 'space') continue;
    const single = [token];
    single.links = tokens.links;
    html += `<div class="md-block" data-line="${start}">${marked.parser(single)}</div>\n`;
  }
  return html;
}

/** The first <title> or <h1> of an HTML text, or the first heading of Markdown. */
export function titleOf(kind, source, fallback = '') {
  const text = String(source ?? '');
  if (kind === 'html') {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text)?.[1];
    return title ? title.replace(/<[^>]+>/g, '').trim() || fallback : fallback;
  }
  if (kind === 'markdown') return /^\s{0,3}#\s+(.+?)\s*#*\s*$/m.exec(text)?.[1]?.trim() || fallback;
  return fallback;
}

const escape = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** A complete HTML page for a Markdown document: the export and the print copy. */
export function standaloneHtml(source, { title = 'Document', style = 'github', dark = false, lang = 'ko' } = {}) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MyTextMaster">
<title>${escape(title)}</title>
<style>
${PREVIEW_CSS}
</style>
</head>
<body class="preview-body style-${style}${dark ? ' dark' : ''}">
<article class="markdown-body">
${markdownToHtml(source, { lines: false })}
</article>
</body>
</html>
`;
}

/** Plain text as a printable page. */
export function textPage(source, { title = 'Document', lang = 'ko', font = 'Consolas' } = {}) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>body{margin:24px;font:13px/1.5 "${font.replace(/"/g, '')}",Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#111;background:#fff}</style>
</head><body>${escape(source)}</body></html>`;
}
