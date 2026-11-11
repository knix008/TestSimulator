// A small, safe Markdown renderer for descriptions and comments. Everything is escaped first; only a
// fixed set of constructs becomes HTML: headings, paragraphs, lists (- * 1.), task items (- [ ] / - [x]),
// block quotes, fenced code, horizontal rules, **bold**, *italic*, ~~strike~~, `code`, [links](http…),
// ![images](attachment:<id> | http…), :icon[<IconRef>] and @mentions of known users.
import { renderIconRefsInHtml } from '../../ui/iconref.js';
import { esc } from './util.js';

const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

/**
 * options: { users: Map(id → user) or array, attachmentUrl(id) → url, mentionClass }
 */
export function renderMarkdown(text, { users = [], attachmentUrl = (id) => `#${id}` } = {}) {
  const names = new Set([...(users?.values?.() ?? users)].map((u) => String(u.username ?? '').toLowerCase()).filter(Boolean));
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // { tag, items: [] }
  let quote = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map((l) => inline(l)).join('<br>')}</p>`); para = []; } };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.tag}${list.task ? ' class="md-tasks"' : ''}>${list.items.join('')}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${renderMarkdown(quote.join('\n'), { users, attachmentUrl })}</blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  const url = (raw) => {
    const value = String(raw).trim();
    const att = /^attachment:([A-Za-z0-9_-]{1,64})$/.exec(value);
    if (att) return attachmentUrl(att[1]);
    return SAFE_URL.test(value) ? value : null;
  };

  function inline(raw) {
    // Code spans first: their content is kept literally.
    const codes = [];
    let s = String(raw).replace(/`([^`\n]+)`/g, (m, code) => { codes.push(code); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s);
    s = s.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (m, alt, href) => {
      const u = url(href.replace(/&amp;/g, '&'));
      return u ? `<img class="md-img" src="${esc(u)}" alt="${alt}" loading="lazy" />` : m;
    });
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      const u = url(href.replace(/&amp;/g, '&'));
      return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : m;
    });
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (m, pre, href) => `${pre}<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^\w@&])@([a-z0-9][a-z0-9._-]{0,63})/gi, (m, pre, name) => (names.has(name.toLowerCase()) ? `${pre}<span class="md-mention" data-mention="${esc(name)}">@${name}</span>` : m));
    s = renderIconRefsInHtml(s, { size: 16 });
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${esc(codes[Number(i)])}</code>`);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```(.*)$/.exec(line);
    if (fence) {
      flushAll();
      const body = [];
      for (i += 1; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      out.push(`<pre class="md-code"><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*>/.test(line)) { flushPara(); flushList(); quote.push(line.replace(/^\s*>\s?/, '')); continue; }
    flushQuote();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) { flushAll(); const n = heading[1].length + 2; out.push(`<h${n}>${inline(heading[2])}</h${n}>`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushAll(); out.push('<hr>'); continue; }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      const tag = /\d/.test(item[1]) ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [], task: false };
      const task = /^\[([ xX])\]\s+(.*)$/.exec(item[2]);
      if (task) {
        list.task = true;
        list.items.push(`<li class="md-task${task[1] !== ' ' ? ' done' : ''}"><span class="md-box">${task[1] !== ' ' ? '✓' : ''}</span>${inline(task[2])}</li>`);
      } else list.items.push(`<li>${inline(item[2])}</li>`);
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] = list.items.at(-1).replace(/<\/li>$/, `<br>${inline(line.trim())}</li>`); continue; }
    flushList();
    para.push(line);
  }
  flushAll();
  return out.join('');
}

/** The @username being typed just before `caret` → { start, query } or null. */
export function mentionAt(text, caret) {
  const before = String(text ?? '').slice(0, caret);
  const m = /(^|[^\w@])@([a-z0-9._-]{0,32})$/i.exec(before);
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null;
}
