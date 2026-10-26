// npm run build:docs — the user's guide, tutorial and README as standalone HTML pages.
//
//   UsersGuide.md    → docs/UsersGuide.html
//   UsersGuide.en.md → docs/UsersGuide.en.html
//   Tutorial.md      → docs/Tutorial.html
//   Tutorial.en.md   → docs/Tutorial.en.html
//   README.md        → docs/README.html
//   README.en.md     → docs/README.en.html
//   ARCHITECTURE.md  → docs/ARCHITECTURE.html
//
// A Markdown file that does not exist yet is skipped (and its page is not linked as the other language).
// The pages (and docs/images/) are then copied to public/docs/ so the web build (vite → dist/) serves
// them at ./docs/… for Help › User's guide in the browser and in the Tauri window.
//
// No dependencies: a small Markdown converter (headings, paragraphs, nested lists, tables, fenced
// code, blockquotes, rules, images, links, inline code, bold, italic) with a table of contents from
// the h2/h3 headings, light and dark colours (prefers-color-scheme) and a Korean font stack. Opened from
// the app, a page takes the app's theme colours (localStorage mycodechecker.docTheme, when the app writes
// it: { dark, vars: { '--bg': … } }) and follows when the theme changes while it is open.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(root, 'docs');
const publicDocs = path.join(root, 'public', 'docs');
const imagesDir = path.join(docsDir, 'images');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const APP = 'MyCodeChecker';

const ALL_PAGES = [
  { input: 'UsersGuide.md', output: 'UsersGuide.html', lang: 'ko', other: 'UsersGuide.en.html', otherLabel: 'English', title: `${APP} 사용 설명서` },
  { input: 'UsersGuide.en.md', output: 'UsersGuide.en.html', lang: 'en', other: 'UsersGuide.html', otherLabel: '한국어', title: `${APP} User's Guide` },
  { input: 'Tutorial.md', output: 'Tutorial.html', lang: 'ko', other: 'Tutorial.en.html', otherLabel: 'English', title: `${APP} 튜토리얼` },
  { input: 'Tutorial.en.md', output: 'Tutorial.en.html', lang: 'en', other: 'Tutorial.html', otherLabel: '한국어', title: `${APP} Tutorial` },
  { input: 'README.md', output: 'README.html', lang: 'ko', other: 'README.en.html', otherLabel: 'English', title: APP },
  { input: 'README.en.md', output: 'README.en.html', lang: 'en', other: 'README.html', otherLabel: '한국어', title: APP },
  { input: 'ARCHITECTURE.md', output: 'ARCHITECTURE.html', lang: 'ko', other: '', otherLabel: '', title: `${APP} 구조` },
];

/** The pages whose Markdown exists; the language switch only links to a page that is built. */
const PAGES = (() => {
  const present = ALL_PAGES.filter((page) => fs.existsSync(path.join(root, page.input)));
  const outputs = new Set(present.map((page) => page.output));
  return present.map((page) => (outputs.has(page.other) ? page : { ...page, other: '', otherLabel: '' }));
})();
const SKIPPED = ALL_PAGES.filter((page) => !PAGES.some((p) => p.input === page.input));

/** Markdown sources and the page each becomes (for rewriting links between documents). */
const MD_TO_HTML = new Map(PAGES.map((page) => [path.resolve(root, page.input), page.output]));

// ───────────────────────── helpers

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** GitHub-style heading anchors: lower case, punctuation dropped, spaces → hyphens. */
export function slugify(text) {
  return String(text).trim().toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const isExternal = (url) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);

/**
 * Rewrites a relative link or image path of `source` (a Markdown file) so it
 * works from docs/: docs/tutorial/images/… → tutorial/images/…, images/… next
 * to docs/tutorial/README.md → tutorial/images/…, other Markdown documents →
 * their HTML page.
 */
function rewriteUrl(url, source) {
  if (!url || isExternal(url)) return url;
  const [target, hash = ''] = url.split('#');
  if (!target) return url;
  const absolute = path.resolve(path.dirname(source), decodeURI(target));
  const page = MD_TO_HTML.get(absolute);
  const resolved = page ? path.join(docsDir, page) : absolute;
  const relative = path.relative(docsDir, resolved).split(path.sep).join('/');
  return encodeURI(relative) + (hash ? `#${hash}` : '');
}

// ───────────────────────── inline Markdown

function inline(text, ctx) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = String(text);
  // Code spans first: nothing inside them is Markdown.
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, ticks, code) => keep(`<code>${escapeHtml(code.trim())}</code>`));
  // Autolinks <https://…> and <mail@host>.
  s = s.replace(/<((?:https?:\/\/|mailto:)[^\s>]+)>/g, (_, url) => keep(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`));
  // Images and links (the link text is Markdown itself).
  s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (_, alt, src, title) => keep(
    `<img src="${escapeHtml(rewriteUrl(src, ctx.source))}" alt="${escapeHtml(alt)}" loading="lazy"${title ? ` title="${escapeHtml(title)}"` : ''} />`,
  ));
  s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (_, label, href, title) => keep(
    `<a href="${escapeHtml(rewriteUrl(href, ctx.source))}"${title ? ` title="${escapeHtml(title)}"` : ''}>${inline(label, ctx)}</a>`,
  ));
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^\w])_(?!\s)([^_]+?)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Hard line breaks: two trailing spaces or a backslash.
  s = s.replace(/(?: {2,}|\\)\n/g, '<br />\n');
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000(\d+)\u0000/g, (_, index) => slots[Number(index)]);
}

// ───────────────────────── blocks

const indentOf = (line) => {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
};
const dedent = (line, amount) => {
  let removed = 0;
  let index = 0;
  while (index < line.length && removed < amount && (line[index] === ' ' || line[index] === '\t')) {
    removed += line[index] === '\t' ? 4 - (removed % 4) : 1;
    index += 1;
  }
  return line.slice(index);
};
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const blank = (line) => !line.trim();
const isRule = (line) => /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
const isHeading = (line) => /^ {0,3}#{1,6}(\s|$)/.test(line);
const isFence = (line) => /^ {0,3}(```|~~~)/.test(line);
const splitRow = (line) => {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let cell = '';
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') { cell += '|'; i += 1; continue; }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue; }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
};
const isTableSeparator = (line) => /\|/.test(line) && splitRow(line).every((cell) => /^:?-{1,}:?$/.test(cell));

function renderBlocks(lines, ctx) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i += 1; continue; }

    // Fenced code.
    const fence = /^ {0,3}(```+|~~~+)\s*([\w+-]*)/.exec(line);
    if (fence) {
      const close = fence[1];
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(close)) code.push(lines[i++]);
      i += 1;
      out.push(`<pre><code${fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading.
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const html = inline(text, ctx);
      const base = slugify(html.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ''));
      let id = base || 'section';
      for (let n = 1; ctx.ids.has(id); n++) id = `${base}-${n}`;
      ctx.ids.add(id);
      if (level === 1 && !ctx.title) ctx.title = html.replace(/<[^>]+>/g, '');
      if (level === 2 || level === 3) ctx.toc.push({ level, id, html });
      out.push(`<h${level} id="${id}">${html}${level >= 2 ? ` <a class="anchor" href="#${id}" aria-hidden="true">#</a>` : ''}</h${level}>`);
      i += 1;
      continue;
    }

    if (isRule(line)) { out.push('<hr />'); i += 1; continue; }

    // Blockquote.
    if (/^ {0,3}>/.test(line)) {
      const quoted = [];
      while (i < lines.length && !blank(lines[i]) && (/^ {0,3}>/.test(lines[i]) || quoted.length)) {
        if (!/^ {0,3}>/.test(lines[i]) && (isHeading(lines[i]) || isFence(lines[i]) || LIST_ITEM.test(lines[i]))) break;
        quoted.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${renderBlocks(quoted, ctx)}</blockquote>`);
      continue;
    }

    // Table.
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((cell) => (cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && !blank(lines[i]) && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      const cell = (tag, text, index) => `<${tag}${align[index] ? ` style="text-align:${align[index]}"` : ''}>${inline(text ?? '', ctx)}</${tag}>`;
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((text, index) => cell('th', text, index)).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${head.map((_, index) => cell('td', row[index], index)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    // List.
    const first = LIST_ITEM.exec(line);
    if (first) {
      const base = indentOf(first[1]);
      const ordered = /\d/.test(first[2]);
      const items = [];
      let current = null;
      let loose = false;
      while (i < lines.length) {
        const row = lines[i];
        const item = LIST_ITEM.exec(row);
        if (item && indentOf(item[1]) <= base + 1 && /\d/.test(item[2]) === ordered) {
          const contentIndent = indentOf(item[1]) + item[2].length + Math.min(item[3].length, 4);
          current = { lines: [item[4]], contentIndent, start: Number.parseInt(item[2], 10) };
          items.push(current);
          i += 1;
          continue;
        }
        if (blank(row)) {
          // A blank line continues the list only when indented content (or another item) follows.
          let next = i + 1;
          while (next < lines.length && blank(lines[next])) next += 1;
          const following = lines[next];
          const nextItem = following !== undefined ? LIST_ITEM.exec(following) : null;
          const sameList = nextItem && indentOf(nextItem[1]) <= base + 1 && /\d/.test(nextItem[2]) === ordered;
          if (following !== undefined && (indentOf(following) > base + 1 || sameList)) {
            if (indentOf(following) >= current.contentIndent || sameList) loose = loose || Boolean(sameList) || indentOf(following) >= current.contentIndent;
            current.lines.push('');
            i += 1;
            continue;
          }
          break;
        }
        if (indentOf(row) > base + 1 || (!item && !isHeading(row) && !isFence(row) && !isRule(row) && !/^ {0,3}>/.test(row) && !(row.includes('|') && isTableSeparator(lines[i + 1] ?? '')))) {
          // Indented content belongs to the item; an unindented plain line is a lazy continuation.
          current.lines.push(indentOf(row) > base + 1 ? dedent(row, current.contentIndent) : row.trim());
          i += 1;
          continue;
        }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      const startAttr = ordered && items[0].start !== 1 ? ` start="${items[0].start}"` : '';
      const body = items.map((item) => {
        let html = renderBlocks(item.lines, ctx);
        if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, '$1');
        return `<li>${html}</li>`;
      }).join('');
      out.push(`<${tag}${startAttr}>${body}</${tag}>`);
      continue;
    }

    // Paragraph.
    const para = [];
    while (i < lines.length && !blank(lines[i]) && !isHeading(lines[i]) && !isFence(lines[i]) && !isRule(lines[i]) && !/^ {0,3}>/.test(lines[i])
      && !(para.length && LIST_ITEM.test(lines[i]))
      && !(lines[i].includes('|') && isTableSeparator(lines[i + 1] ?? ''))) {
      para.push(lines[i].replace(/^\s+/, ''));
      i += 1;
    }
    if (!para.length) { para.push(lines[i]); i += 1; }
    out.push(`<p>${inline(para.join('\n'), ctx)}</p>`);
  }
  return out.join('\n');
}

/** Markdown → { html, toc, title }. `source` is the Markdown file's path (for relative links). */
export function markdownToHtml(markdown, source = path.join(root, 'README.md')) {
  const ctx = { source, ids: new Set(), toc: [], title: '' };
  const lines = String(markdown).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const html = renderBlocks(lines, ctx);
  return { html, toc: ctx.toc, title: ctx.title };
}

// ───────────────────────── page

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f7f8fa; --surface: #ffffff; --text: #1d2330; --muted: #5d6677; --border: #dde2ea;
  --accent: #2f6fde; --accent-soft: #e8f0fe; --code-bg: #f1f3f7; --row-alt: #f8fafc; --shadow: 0 1px 3px rgba(20, 30, 50, .08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14171d; --surface: #1b1f27; --text: #e3e7ee; --muted: #9aa4b5; --border: #2e3440;
    --accent: #6ea8ff; --accent-soft: #1f2b40; --code-bg: #242a35; --row-alt: #1f242d; --shadow: 0 1px 3px rgba(0, 0, 0, .4);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--bg); color: var(--text); line-height: 1.7; font-size: 16px;
  font-family: "Pretendard", "Segoe UI", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", system-ui, sans-serif;
  word-break: keep-all; overflow-wrap: anywhere;
}
a { color: var(--link, var(--accent)); text-decoration: none; }
a:hover { text-decoration: underline; }
.topbar {
  position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 10px 24px;
  background: var(--surface); border-bottom: 1px solid var(--border); box-shadow: var(--shadow);
}
.topbar .brand { font-weight: 700; color: var(--text); }
.topbar .grow { flex: 1; }
.topbar .lang { display: inline-flex; align-items: center; padding: 3px; border: 1px solid var(--border); border-radius: 4px; line-height: 0; }
.topbar .lang:hover { border-color: var(--accent, #1478b8); }
.topbar .lang svg { display: block; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.15); }
.layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 32px; max-width: 1320px; margin: 0 auto; padding: 24px; }
nav.toc { position: sticky; top: 64px; align-self: start; max-height: calc(100vh - 88px); overflow: auto; font-size: 14px; padding: 12px 8px 12px 0; }
nav.toc .toc-title { font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; font-size: 12px; margin: 0 0 8px 10px; }
nav.toc ul { list-style: none; margin: 0; padding: 0; }
nav.toc li a { display: block; padding: 3px 10px; border-left: 2px solid transparent; color: var(--text); border-radius: 0 6px 6px 0; }
nav.toc li a:hover { background: var(--accent-soft); text-decoration: none; }
nav.toc li.h3 a { padding-left: 24px; color: var(--muted); font-size: 13px; }
main { min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 32px 44px 48px; box-shadow: var(--shadow); }
h1, h2, h3, h4 { line-height: 1.3; scroll-margin-top: 72px; }
h1 { font-size: 2em; margin: 0 0 .6em; }
h2 { font-size: 1.5em; margin: 2em 0 .6em; padding-bottom: .3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.2em; margin: 1.6em 0 .5em; }
h4 { font-size: 1.05em; margin: 1.4em 0 .4em; }
.anchor { opacity: 0; margin-left: 6px; font-weight: 400; color: var(--muted); }
h2:hover .anchor, h3:hover .anchor { opacity: 1; }
img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow); display: block; margin: 12px 0; }
.table-wrap { overflow-x: auto; margin: 14px 0; }
table { border-collapse: collapse; width: 100%; font-size: 15px; }
th, td { border: 1px solid var(--border); padding: 7px 11px; text-align: left; vertical-align: top; }
th { background: var(--th-bg, var(--accent-soft)); font-weight: 600; }
tbody tr:nth-child(even) td { background: var(--row-alt); }
code { font-family: "Cascadia Code", Consolas, "D2Coding", "Courier New", monospace; font-size: .9em; background: var(--code-bg); border-radius: 4px; padding: 1px 5px; }
pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; overflow-x: auto; line-height: 1.5; }
pre code { background: none; padding: 0; font-size: 14px; }
blockquote { margin: 14px 0; padding: 8px 16px; border-left: 4px solid var(--accent); background: var(--accent-soft); border-radius: 0 8px 8px 0; color: var(--text); }
blockquote p { margin: 6px 0; }
hr { border: 0; border-top: 1px solid var(--border); margin: 28px 0; }
ul, ol { padding-left: 1.6em; }
li { margin: 3px 0; }
li > ul, li > ol { margin: 4px 0; }
footer { color: var(--muted); font-size: 13px; text-align: center; padding: 24px; }
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; padding: 12px; gap: 12px; }
  nav.toc { position: static; max-height: none; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
  main { padding: 20px 18px 32px; border-radius: 10px; }
  .topbar { padding: 10px 14px; }
}
@media print {
  .topbar, nav.toc { display: none; }
  .layout { display: block; padding: 0; }
  main { border: 0; box-shadow: none; padding: 0; }
}
`;

// The app's theme: { dark, vars } from localStorage (written before the page opens), the storage event
// (another window changed it) or a message from the app's guide window ({ type: 'mcc-doc-theme', theme }).
// vars may hold the app's own tokens (--bg, --bg-panel, --bg-elev, --fg, --fg-muted, --border, --accent,
// --danger…) and/or the page's (--surface, --text, --muted, --code-bg, --row-alt, --accent-soft, --link,
// --th-bg); the page's are derived from the app's when missing, so the page matches every theme.
const THEME_SCRIPT = `(function () {
  var key = 'mycodechecker.docTheme';
  function pick(v, names) { for (var i = 0; i < names.length; i++) { if (v[names[i]]) return v[names[i]]; } return ''; }
  function derive(src) {
    var v = {}; for (var k in src) v[k] = src[k];
    var surface = v['--surface'] || pick(v, ['--bg-elev', '--raised', '--bg-panel', '--panel', '--bg']);
    if (surface) v['--surface'] = surface;
    if (!v['--text'] && v['--fg']) v['--text'] = v['--fg'];
    if (!v['--muted']) { var m = pick(v, ['--fg-muted']); if (m) v['--muted'] = m; }
    if (!v['--code-bg']) { var c = pick(v, ['--bg-panel', '--panel', '--bg']); if (c) v['--code-bg'] = c; }
    if (!v['--row-alt']) { var r = pick(v, ['--bg-panel', '--panel']); if (r) v['--row-alt'] = r; }
    if (!v['--accent-soft'] && v['--accent'] && surface) v['--accent-soft'] = 'color-mix(in srgb, ' + v['--accent'] + ' 16%, ' + surface + ')';
    if (!v['--link'] && v['--accent']) v['--link'] = v['--accent'];
    if (!v['--th-bg'] && v['--accent-soft']) v['--th-bg'] = v['--accent-soft'];
    return v;
  }
  function apply(t) {
    if (typeof t === 'string') { try { t = JSON.parse(t); } catch (e) { return; } }
    if (!t || !t.vars) return;
    var v = derive(t.vars), root = document.documentElement;
    for (var name in v) { if (name.indexOf('--') === 0 && typeof v[name] === 'string') root.style.setProperty(name, v[name]); }
    root.style.colorScheme = t.dark === false ? 'light' : 'dark';
  }
  try { apply(localStorage.getItem(key)); } catch (e) { /* no storage */ }
  addEventListener('storage', function (e) { if (e.key === key && e.newValue) apply(e.newValue); });
  addEventListener('message', function (e) {
    if (e.origin !== location.origin && e.source !== parent) return;
    if (e.data && e.data.type === 'mcc-doc-theme' && e.data.theme) apply(e.data.theme);
  });
})();`;

// The language switch shows the flag of the other language, as in the app: the Union Jack on a Korean page,
// the Taegukgi on an English one.
const UNION_JACK = `<svg width="27" height="18" viewBox="0 0 60 40" role="img" aria-hidden="true"><rect width="60" height="40" fill="#012169"/><path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" stroke-width="8"/><path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" stroke-width="4"/><path d="M30,0 V40 M0,20 H60" stroke="#ffffff" stroke-width="13"/><path d="M30,0 V40 M0,20 H60" stroke="#C8102E" stroke-width="8"/></svg>`;
const TAEGUKGI = (() => {
  const BAR = 12; const THICK = 2; const STEP = 3.6; const SPLIT = 2;
  const trigram = (cx, cy, rotate, solid) => `<g transform="rotate(${rotate} ${cx} ${cy})">${solid.map((whole, index) => {
    const y = cy + (index - 1) * STEP - THICK / 2;
    if (whole) return `<rect x="${cx - BAR / 2}" y="${y}" width="${BAR}" height="${THICK}" fill="#000"/>`;
    const half = (BAR - SPLIT) / 2;
    return `<rect x="${cx - BAR / 2}" y="${y}" width="${half}" height="${THICK}" fill="#000"/><rect x="${cx + SPLIT / 2}" y="${y}" width="${half}" height="${THICK}" fill="#000"/>`;
  }).join('')}</g>`;
  return `<svg width="27" height="18" viewBox="0 0 60 40" role="img" aria-hidden="true"><rect width="60" height="40" fill="#ffffff"/><g transform="rotate(-33.69 30 20) translate(60 0) scale(-1 1)"><circle cx="30" cy="20" r="10" fill="#CD2E3A"/><path d="M20,20 a5,5 0 0,1 10,0 a5,5 0 0,0 10,0 a10,10 0 0,1 -20,0" fill="#0047A0"/></g>${trigram(10.6, 7.1, -56.31, [true, true, true])}${trigram(49.4, 7.1, 56.31, [false, true, false])}${trigram(10.6, 32.9, -123.69, [true, false, true])}${trigram(49.4, 32.9, 123.69, [false, false, false])}</svg>`;
})();

function page({ title, lang, html, toc, other, otherLabel }) {
  const tocHtml = toc.length ? `<nav class="toc" aria-label="${lang === 'ko' ? '목차' : 'Contents'}"><p class="toc-title">${lang === 'ko' ? '목차' : 'Contents'}</p><ul>${toc.map((item) => `<li class="h${item.level}"><a href="#${item.id}">${item.html.replace(/<a [^>]*>|<\/a>/g, '')}</a></li>`).join('')}</ul></nav>` : '<nav class="toc" aria-hidden="true"></nav>';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="${APP} scripts/build-docs.mjs" />
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<header class="topbar"><span class="brand">${APP} <small>v${escapeHtml(version)}</small></span><span class="grow"></span>${other ? `<a class="lang" href="${escapeHtml(other)}" hreflang="${lang === 'ko' ? 'en' : 'ko'}" title="${escapeHtml(otherLabel)}" aria-label="${escapeHtml(otherLabel)}">${lang === 'ko' ? UNION_JACK : TAEGUKGI}</a>` : ''}</header>
<div class="layout">
${tocHtml}
<main>
${html}
</main>
</div>
<footer>${APP} v${escapeHtml(version)} · © SHKWON (knix008@naver.com)</footer>
</body>
</html>
`;
}

// ───────────────────────── build

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const copied = [];
  for (const entry of fs.existsSync(from) ? fs.readdirSync(from, { withFileTypes: true }) : []) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copied.push(...copyDir(source, target));
    else if (entry.isFile() && entry.name !== '.keep') { fs.copyFileSync(source, target); copied.push(target); }
  }
  return copied;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

export function build() {
  fs.mkdirSync(docsDir, { recursive: true });
  const written = [];
  for (const info of PAGES) {
    const input = path.join(root, info.input);
    const { html, toc, title } = markdownToHtml(fs.readFileSync(input, 'utf8'), input);
    const output = path.join(docsDir, info.output);
    fs.writeFileSync(output, page({ ...info, title: title || info.title, html, toc }));
    written.push({ output, note: info.input });
  }
  // A page whose Markdown is gone must not linger from an earlier build.
  for (const info of SKIPPED) fs.rmSync(path.join(docsDir, info.output), { force: true });
  // Web build: public/docs/ (served at ./docs/).
  fs.rmSync(publicDocs, { recursive: true, force: true });
  fs.mkdirSync(publicDocs, { recursive: true });
  for (const info of PAGES) fs.copyFileSync(path.join(docsDir, info.output), path.join(publicDocs, info.output));
  const images = copyDir(imagesDir, path.join(publicDocs, 'images'));
  return { written, images, skipped: SKIPPED.map((info) => info.input) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { written, images, skipped } = build();
  console.log('Document HTML:');
  for (const { output, note } of written) console.log(`  ${path.relative(root, output).split(path.sep).join('/')}  (${kb(fs.statSync(output).size)}) ← ${note}`);
  if (skipped.length) console.log(`Skipped (no Markdown yet): ${skipped.join(', ')}`);
  console.log(`Copied to public/docs/: ${PAGES.length} HTML files, ${images.length} images`);
}
