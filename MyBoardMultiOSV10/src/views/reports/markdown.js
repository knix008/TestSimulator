// A small, safe Markdown renderer for the text gadget: headings, bold, italic, code, links (http/https),
// bullet and numbered lists, quotes, rules and :icon[ref]. Everything is escaped first.
import { escapeHtml } from '../../ui/dom.js';
import { renderIconRefsInHtml } from '../../ui/iconref.js';

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return renderIconRefsInHtml(s, { size: 15 });
}

export function renderMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { close(); continue; }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { close(); out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { close(); out.push('<hr />'); continue; }
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1].replace(/^\[( |x)\]\s*/i, (x, c) => (c.trim() ? '☑ ' : '☐ ')))}</li>`); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = /^>\s?(.*)$/.exec(line))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    close();
    out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('');
}
