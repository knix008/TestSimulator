// The user manual's content model (pure: no DOM, no Vite, so Node tests use it).
//
// The manual is a set of Markdown files per language (src/docs/<lang>/NN-name.md,
// one chapter per file, starting with "# Title"). This module turns them into
// chapters with HTML and a table of contents:
//
//   parseMarkdown(md, { prefix, base })  → { title, html, headings:[{level, text, id}] }
//   buildManual(files, lang, { base })   → { lang, chapters:[{ id, file, title, html, headings }], toc }
//   tocTree(headings)                    → nested [{ id, text, level, children }]
//   manualPrintHtml(chapters, opts)      → a standalone HTML page (print / export)
//
// Supported Markdown: # .. #### headings, paragraphs, **bold**, *italic*,
// `code`, [link](url), ![caption](image) on its own line (a figure with a
// caption), - / * and 1. lists (two-space indent nests), > notes (a first
// word "팁:", "Tip:", "주의:", "Note:" … picks the note style), ``` fences
// (```m gets M syntax colours), | tables |, --- rules and {{Ctrl+N}} keys.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Joins a relative URL to the base ('' keeps it relative). Absolute URLs stay. */
export function resolveUrl(url, base = '') {
  const u = String(url || '');
  if (!base || /^([a-z][\w+.-]*:|\/|#)/i.test(u)) return u;
  return base.endsWith('/') ? base + u : `${base}/${u}`;
}

const M_KEYWORDS = new Set(['if', 'elseif', 'else', 'end', 'for', 'parfor', 'while', 'do', 'until', 'switch', 'case', 'otherwise', 'try', 'catch', 'function', 'return', 'break', 'continue', 'global', 'persistent', 'classdef', 'properties', 'methods', 'events', 'enumeration', 'arguments', 'spmd']);

/** M code → HTML with token spans (comments, strings, keywords, numbers). */
export function highlightM(code) {
  const out = [];
  const lines = String(code).split('\n');
  for (const line of lines) {
    let i = 0;
    let html = '';
    let prev = ''; // the last significant character (decides whether ' is a transpose)
    while (i < line.length) {
      const c = line[i];
      const rest = line.slice(i);
      if (c === '%' || (c === '.' && rest.startsWith('...'))) {
        html += `<span class="tk-c">${escapeHtml(line.slice(i))}</span>`;
        break;
      }
      if (c === '"' || (c === "'" && !/[\w)\]}.']/.test(prev))) {
        let j = i + 1;
        while (j < line.length) {
          if (line[j] === c) { if (line[j + 1] === c) { j += 2; continue; } break; }
          j += 1;
        }
        html += `<span class="tk-s">${escapeHtml(line.slice(i, j + 1))}</span>`;
        i = j + 1;
        prev = c;
        continue;
      }
      const num = /^(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)[ij]?/.exec(rest);
      if (num && !/[\w]/.test(prev)) {
        html += `<span class="tk-n">${escapeHtml(num[0])}</span>`;
        i += num[0].length;
        prev = '0';
        continue;
      }
      const word = /^[A-Za-z_]\w*/.exec(rest);
      if (word) {
        const w = word[0];
        html += M_KEYWORDS.has(w) ? `<span class="tk-k">${w}</span>` : escapeHtml(w);
        i += w.length;
        prev = 'a';
        continue;
      }
      if (c === '>' && rest.startsWith('>> ') && i === 0) {
        html += '<span class="tk-p">&gt;&gt;</span>';
        i += 2;
        continue;
      }
      html += escapeHtml(c);
      if (c !== ' ' && c !== '\t') prev = c;
      i += 1;
    }
    out.push(html);
  }
  return out.join('\n');
}

/** Inline Markdown → HTML (text is escaped first). */
export function inline(text, base = '') {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, code) => { codes.push(code); return `\u0000${codes.length - 1}\u0000`; });
  s = escapeHtml(s);
  s = s.replace(/\{\{([^}]+)\}\}/g, (_, keys) => keys.split('+').map((k) => `<kbd>${k.trim()}</kbd>`).join('+'));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${resolveUrl(src, base)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const internal = href.startsWith('#');
    return `<a href="${internal ? href : resolveUrl(href, base)}"${internal ? ' data-internal="1"' : ' target="_blank" rel="noopener"'}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${escapeHtml(codes[Number(n)])}</code>`);
  return s;
}

/** The text of a heading without Markdown marks (for the table of contents). */
export const plainText = (text) => String(text).replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\{\{([^}]+)\}\}/g, '$1').trim();

const NOTE_KINDS = [
  [/^(팁|tip)\s*[:：]/i, 'tip'],
  [/^(주의|경고|caution|warning)\s*[:：]/i, 'warn'],
  [/^(참고|note|알림)\s*[:：]/i, 'note'],
];

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '`') code = !code;
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i += 1; continue; }
    if (c === '|' && !code) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * One Markdown document → { title, html, headings }. Heading ids are
 * `${prefix}-${n}` (n counts the headings of the document from 0; the h1 is
 * `${prefix}`), so they stay stable whatever the language of the text.
 */
export function parseMarkdown(md, { prefix = 'h', base = '' } = {}) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const headings = [];
  let title = '';
  let n = 0;
  let i = 0;
  const isBlockStart = (l) => /^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s|\||---+\s*$|!\[)/.test(l);

  const list = (start) => {
    // Collect the list's lines (items and their indented continuations).
    const items = [];
    let j = start;
    const baseIndent = /^(\s*)/.exec(lines[start])[1].length;
    const orderedList = /^\s*\d+\./.test(lines[start]);
    const sameKind = (l) => { const m = /^(\s*)([-*]|\d+\.)\s/.exec(l); return m && m[1].length === baseIndent && /\d/.test(m[2]) === orderedList; };
    while (j < lines.length) {
      const l = lines[j];
      if (!l.trim()) {
        // A blank line ends the list unless an indented line or another item of the same kind follows.
        const next = lines[j + 1];
        if (next && ((/^\s{2,}\S/.test(next) && /^(\s*)/.exec(next)[1].length > baseIndent) || sameKind(next))) { j += 1; continue; }
        break;
      }
      const ind = /^(\s*)/.exec(l)[1].length;
      if (ind < baseIndent) break;
      if (ind === baseIndent && /^\s*([-*]|\d+\.)\s/.test(l) && !sameKind(l)) break;
      const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(l);
      if (m && ind === baseIndent) items.push({ text: m[3], ordered: /\d/.test(m[2]), num: parseInt(m[2], 10), sub: [] });
      else if (items.length && ind > baseIndent) items[items.length - 1].sub.push(l.slice(baseIndent + 2));
      else if (items.length) items[items.length - 1].text += ` ${l.trim()}`;
      else break;
      j += 1;
    }
    const ordered = items.length && items[0].ordered;
    const body = items.map((it) => {
      const sub = it.sub.length ? parseMarkdown(it.sub.join('\n'), { prefix: `${prefix}-x`, base, nested: true }).html : '';
      return `<li>${inline(it.text, base)}${sub}</li>`;
    }).join('');
    html.push(ordered ? `<ol${items[0].num > 1 ? ` start="${items[0].num}"` : ''}>${body}</ol>` : `<ul>${body}</ul>`);
    return j;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = plainText(h[2]);
      const id = level === 1 && !title ? prefix : `${prefix}-${n}`;
      if (level === 1 && !title) title = text;
      else n += 1;
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inline(h[2], base)}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const langTag = line.slice(3).trim().toLowerCase();
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { body.push(lines[i]); i += 1; }
      i += 1;
      const code = body.join('\n');
      const inner = langTag === 'm' ?highlightM(code) : escapeHtml(code);
      html.push(`<pre class="code${langTag ? ` lang-${escapeHtml(langTag)}` : ''}"><code>${inner}</code></pre>`);
      continue;
    }
    if (/^---+\s*$/.test(line)) { html.push('<hr>'); i += 1; continue; }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line.trim());
    if (img) {
      html.push(`<figure><img src="${escapeHtml(resolveUrl(img[2], base))}" alt="${escapeHtml(img[1])}" loading="lazy"><figcaption>${inline(img[1], base)}</figcaption></figure>`);
      i += 1;
      continue;
    }
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) { body.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      const text = body.join('\n');
      const kind = (NOTE_KINDS.find(([re]) => re.test(text.replace(/\*\*/g, ''))) || [null, 'note'])[1];
      html.push(`<div class="note note-${kind}">${parseMarkdown(text, { prefix: `${prefix}-q`, base, nested: true }).html}</div>`);
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i])); i += 1; }
      const al = (k) => (aligns[k] ? ` style="text-align:${aligns[k]}"` : '');
      html.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => `<th${al(k)}>${inline(c, base)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td${al(k)}>${inline(r[k] || '', base)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) { i = list(i); continue; }
    // A paragraph: lines up to a blank line or the start of another block.
    const para = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i].trim()); i += 1; }
    html.push(`<p>${inline(para.join(' '), base)}</p>`);
  }
  return { title, html: html.join('\n'), headings };
}

/** Flat headings → a tree (the h1 is the root of a chapter). */
export function tocTree(headings) {
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const h of headings) {
    const node = { id: h.id, text: h.text, level: h.level, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

/** The chapter's file name → its id: "03-command-window.md" → "command-window". */
export const chapterIdOf = (file) => String(file).split('/').pop().replace(/\.md$/i, '').replace(/^\d+[-_]?/, '').replace(/[^\w-]+/g, '-').toLowerCase() || 'chapter';

/**
 * files: { 'path/ko/01-x.md': text, … } (any keys; those under /<lang>/ are
 * taken, sorted by file name). Returns the chapters and the whole TOC.
 */
export function buildManual(files, lang, { base = '' } = {}) {
  const keys = Object.keys(files || {}).filter((k) => k.replace(/\\/g, '/').includes(`/${lang}/`)).sort((a, b) => a.split('/').pop().localeCompare(b.split('/').pop()));
  const chapters = keys.map((k, idx) => {
    const id = chapterIdOf(k);
    const doc = parseMarkdown(files[k], { prefix: id, base });
    return { id, index: idx, file: k.split('/').pop(), title: doc.title || id, html: doc.html, headings: doc.headings };
  });
  const toc = chapters.map((c) => {
    const tree = tocTree(c.headings);
    const top = tree.find((x) => x.id === c.id) || { id: c.id, text: c.title, level: 1, children: tree };
    return { ...top, chapter: c.id };
  });
  return { lang, chapters, toc };
}

/** Counts: chapters, sections (h2) and subsections (h3+). */
export function manualStats(manual) {
  let sections = 0;
  let subsections = 0;
  let images = 0;
  for (const c of manual.chapters) {
    for (const h of c.headings) { if (h.level === 2) sections += 1; else if (h.level > 2) subsections += 1; }
    images += (c.html.match(/<figure>/g) || []).length;
  }
  return { chapters: manual.chapters.length, sections, subsections, images };
}

/** Image sources used by the chapters (as written, after `base`). */
export function imagesOf(manual) {
  const out = [];
  for (const c of manual.chapters) for (const m of c.html.matchAll(/<img src="([^"]+)"/g)) out.push(m[1]);
  return out;
}

/** The heading whose top is the last one above `y` (scroll spy). tops: [{ id, top }] sorted. */
export function currentHeading(tops, y, slack = 24) {
  let cur = tops.length ? tops[0].id : null;
  for (const t of tops) { if (t.top <= y + slack) cur = t.id; else break; }
  return cur;
}

export const FONT_MIN = 9;
export const FONT_MAX = 24;
export const FONT_DEFAULT = 12;
export const clampFont = (n) => Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(Number(n) || FONT_DEFAULT)));

/** The manual's own CSS (colours come from the app's theme tokens). */
export const GUIDE_CONTENT_CSS = `
.guide-doc { color: var(--fg); line-height: 1.65; max-width: 980px; }
.guide-doc h1 { font-size: 1.85em; margin: 0 0 .6em; padding-bottom: .3em; border-bottom: 2px solid var(--accent); }
.guide-doc h2 { font-size: 1.4em; margin: 1.6em 0 .5em; padding-bottom: .2em; border-bottom: 1px solid var(--border); }
.guide-doc h3 { font-size: 1.15em; margin: 1.3em 0 .4em; }
.guide-doc h4 { font-size: 1em; margin: 1.1em 0 .3em; color: var(--fg-muted); }
.guide-doc p, .guide-doc ul, .guide-doc ol { margin: .5em 0; }
.guide-doc ul, .guide-doc ol { padding-left: 1.6em; }
.guide-doc li { margin: .2em 0; }
.guide-doc a { color: var(--accent); }
.guide-doc code { font-family: var(--mono, Consolas, monospace); font-size: .92em; padding: .05em .35em; border-radius: 4px; background: var(--bg-panel); border: 1px solid var(--border); }
.guide-doc pre.code { background: var(--bg-panel); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 6px; padding: .7em .9em; overflow: auto; line-height: 1.45; }
.guide-doc pre.code code { padding: 0; border: 0; background: none; font-size: .95em; white-space: pre; }
.guide-doc .tk-c { color: var(--ok, #3a3); font-style: italic; }
.guide-doc .tk-s { color: var(--folder, #c80); }
.guide-doc .tk-k { color: var(--accent); font-weight: 600; }
.guide-doc .tk-n { color: var(--series-5, var(--danger, #c33)); }
.guide-doc .tk-p { color: var(--fg-muted); }
.guide-doc kbd { font-family: var(--mono, Consolas, monospace); font-size: .85em; padding: .05em .4em; border-radius: 4px; border: 1px solid var(--border-strong, var(--border)); border-bottom-width: 2px; background: var(--bg-elev); color: var(--fg); white-space: nowrap; }
.guide-doc .table-wrap { overflow-x: auto; margin: .7em 0; }
.guide-doc table { border-collapse: collapse; min-width: 50%; }
.guide-doc th, .guide-doc td { border: 1px solid var(--border); padding: .35em .65em; vertical-align: top; text-align: left; }
.guide-doc th { background: color-mix(in srgb, var(--accent) 16%, var(--bg-elev)); }
.guide-doc tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--bg-panel) 60%, transparent); }
.guide-doc figure { margin: 1em 0 1.3em; }
.guide-doc figure img { display: block; max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,.18); }
.guide-doc figcaption { margin-top: .4em; font-size: .9em; color: var(--fg-muted); }
.guide-doc hr { border: 0; border-top: 1px solid var(--border); margin: 1.5em 0; }
.guide-doc .note { margin: .8em 0; padding: .5em .9em; border-radius: 6px; border: 1px solid var(--border); border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--bg-elev)); }
.guide-doc .note-tip { border-left-color: var(--ok, #3a3); background: color-mix(in srgb, var(--ok, #3a3) 9%, var(--bg-elev)); }
.guide-doc .note-warn { border-left-color: var(--folder, #c80); background: color-mix(in srgb, var(--folder, #c80) 10%, var(--bg-elev)); }
.guide-doc .note p { margin: .25em 0; }
.guide-chapter + .guide-chapter { margin-top: 2.4em; padding-top: 1.2em; border-top: 3px double var(--border); }
`;

/** Print palette: the theme tokens set to black on white. */
const PRINT_TOKENS = ':root{--fg:#111;--fg-muted:#555;--bg:#fff;--bg-panel:#f4f5f7;--bg-elev:#fff;--border:#c9ccd2;--border-strong:#9aa;--accent:#1f5fbf;--ok:#2a7a2a;--folder:#9a6200;--danger:#b02020;--mono:Consolas,"D2Coding",monospace;}';

/**
 * A standalone HTML page with the given chapters (print or export): the
 * theme-independent print palette, page breaks before each chapter, a table of
 * contents when there is more than one chapter, images resolved against baseUrl.
 */
export function manualPrintHtml(chapters, { title = '', lang = 'ko', baseUrl = '', fontSize = FONT_DEFAULT } = {}) {
  const fix = (html) => (baseUrl ? html.replace(/(<img src=")(?![a-z][\w+.-]*:|\/)([^"]+)"/gi, (_, a, src) => `${a}${resolveUrl(src, baseUrl)}"`) : html);
  const toc = chapters.length > 1
    ? `<nav class="print-toc"><h1>${escapeHtml(title)}</h1><ol>${chapters.map((c) => `<li><a href="#${c.id}">${escapeHtml(c.title)}</a><ol>${c.headings.filter((h) => h.level === 2).map((h) => `<li>${escapeHtml(h.text)}</li>`).join('')}</ol></li>`).join('')}</ol></nav>`
    : '';
  const body = chapters.map((c) => `<section class="guide-chapter" data-chapter="${c.id}">${fix(c.html)}</section>`).join('\n');
  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'ko'}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${baseUrl ? `<base href="${escapeHtml(baseUrl)}">` : ''}
<style>${PRINT_TOKENS}
body{margin:0;background:#fff;color:#111;font:${clampFont(fontSize)}px/1.6 "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Segoe UI",sans-serif;}
${GUIDE_CONTENT_CSS}
.guide-doc{max-width:none}
.print-toc ol{padding-left:1.4em}.print-toc>ol>li{margin:.35em 0;font-weight:600}.print-toc>ol>li ol{font-weight:400}
.print-toc{break-after:page}
.guide-chapter + .guide-chapter{border-top:0;margin-top:0;padding-top:0;break-before:page}
pre.code,figure,table{break-inside:avoid}
h1,h2,h3{break-after:avoid}
</style></head><body><main class="guide-doc">${toc}${body}</main></body></html>`;
}
