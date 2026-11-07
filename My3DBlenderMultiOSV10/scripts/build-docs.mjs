// npm run build:docs — doc/*.md → public/doc/*.html, the pages the Help menu opens. No dependencies: the documents use
// headings, paragraphs, lists, tables, code blocks, bold, inline code and links, and that is all this converter knows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { taegukgiMarkup, unionJackMarkup } from '../src/ui/dom.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'doc');
const target = path.join(root, 'public', 'doc');
fs.mkdirSync(target, { recursive: true });

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => escape(s)
  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${url.replace(/\.md(#|$)/, '.html$1')}">${label}</a>`);

export function toHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const toc = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      // The two languages have the same structure, so a section has the same id in both.
      const id = `s${toc.length}`;
      if (level === 2 || level === 3) toc.push({ id, level, text: heading[2] });
      out.push(`<h${level}${level === 2 || level === 3 ? ` id="${id}"` : ''}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i].replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^(\d+\.|-)\s/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      for (; i < lines.length && /^(\d+\.|-)\s/.test(lines[i]); i++) items.push(lines[i].replace(/^(\d+\.|-)\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#|\||```|\d+\.\s|-\s)/.test(lines[i]); i++) para.push(lines[i]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { body: out.join('\n'), toc };
}

const STYLE = `:root{color-scheme:light dark;--bg:#fff;--side:#f6f6f6;--fg:#1d1d1f;--muted:#5f6368;--line:#dcdcdc;--code:#f3f3f3;--accent:#c5651c;--doc-font:15px}
@media (prefers-color-scheme:dark){:root{--bg:#1f1f1f;--side:#282828;--fg:#dedede;--muted:#a0a0a0;--line:#3d3d3d;--code:#2c2c2c;--accent:#ef8b3c}}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;display:grid;grid-template-rows:44px minmax(0,1fr);grid-template-columns:280px minmax(0,1fr);background:var(--bg);color:var(--fg);font:14px/1.5 "Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;overflow:hidden}
.doc-top{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:0 14px;background:var(--side);border-bottom:1px solid var(--line)}
.doc-title{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.doc-label{color:var(--muted);font-size:12.5px;white-space:nowrap}.doc-value{width:58px;justify-content:center;text-align:center;font-variant-numeric:tabular-nums}.doc-flag{padding:0 6px}.doc-flag svg{display:block;border-radius:2px;box-shadow:0 0 0 1px var(--line)}
.doc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:28px;height:28px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}
.doc-btn:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}.doc-btn:disabled{opacity:.4;cursor:default}.doc-sep{width:1px;height:20px;margin:0 6px;background:var(--line)}
.doc-tree{display:flex;flex-direction:column;min-height:0;background:var(--side);border-right:1px solid var(--line)}
.doc-tree-head{flex:none;display:flex;align-items:center;gap:7px;height:34px;padding:0 6px 0 12px;font-weight:600;border-bottom:1px solid var(--line)}.doc-tree-head svg{flex:none;color:var(--accent)}.doc-tree-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.doc-fold{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:5px;background:none;color:var(--muted);font:inherit;font-size:16px;line-height:1;cursor:pointer}.doc-fold:hover{background:color-mix(in srgb,var(--fg) 10%,transparent);color:var(--accent)}
.doc-tree-body{flex:1;min-height:0;overflow-y:auto;padding:8px 8px 24px;scrollbar-width:thin}
body.tree-closed{grid-template-columns:38px minmax(0,1fr)}.tree-closed .doc-tree-body,.tree-closed .doc-tree-name{display:none}.tree-closed .doc-tree-head{flex-direction:column;height:auto;gap:6px;padding:6px 0;border:0}
.doc-tree a{display:block;padding:3px 8px;border-radius:5px;color:var(--fg);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.doc-tree a.l2{margin-top:2px;font-weight:600}.doc-tree a.l3{padding-left:22px;color:var(--muted);font-size:13px}
.doc-tree a:hover{background:color-mix(in srgb,var(--fg) 8%,transparent)}.doc-tree a.on{background:var(--accent);color:#fff}
main{overflow-y:auto;font-size:var(--doc-font);line-height:1.65;scroll-padding-top:12px}.doc-page{max-width:900px;margin:0 auto;padding:24px 28px 80px}
h1{font-size:1.87em;margin:0 0 8px}h2{font-size:1.4em;margin:1.6em 0 .4em;padding-bottom:4px;border-bottom:1px solid var(--line)}h3{font-size:1.07em;margin:1.3em 0 .3em}
a{color:var(--accent)}code{padding:1px 5px;background:var(--code);border-radius:3px;font:.87em ui-monospace,Consolas,monospace}pre{padding:10px 12px;background:var(--code);border-radius:5px;overflow:auto}pre code{padding:0;background:none}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:.93em}th,td{padding:5px 8px;border:1px solid var(--line);text-align:left;vertical-align:top}th{background:var(--code)}
img{display:block;max-width:100%;height:auto;margin:10px 0;border:1px solid var(--line);border-radius:6px}
@media (max-width:720px){body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,30vh) minmax(0,1fr)}.doc-top{flex-wrap:wrap;padding:6px 10px}.doc-tree{border-right:0;border-bottom:1px solid var(--line)}body.tree-closed{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr)}.doc-page{padding:16px 16px 60px}}`;

// Font size, the language link and the highlighted place in the tree. A file of its own, so that it runs under any content policy.
const SCRIPT = `(function () {
  var KEY = 'my3d.docFont', BASE = 15, MIN = 11, MAX = 24;
  var size = BASE;
  try { var saved = Number(localStorage.getItem(KEY)); if (saved >= MIN && saved <= MAX) size = saved; } catch (e) { /* a private window */ }
  var value = document.getElementById('doc-font-value'), smaller = document.getElementById('doc-font-down'), larger = document.getElementById('doc-font-up'), reset = document.getElementById('doc-font-reset');
  function apply() {
    document.documentElement.style.setProperty('--doc-font', size + 'px');
    value.textContent = size + 'px';
    smaller.disabled = size <= MIN; larger.disabled = size >= MAX;
    try { localStorage.setItem(KEY, String(size)); } catch (e) { /* a private window */ }
  }
  smaller.addEventListener('click', function () { size = Math.max(MIN, size - 1); apply(); });
  larger.addEventListener('click', function () { size = Math.min(MAX, size + 1); apply(); });
  reset.addEventListener('click', function () { size = BASE; apply(); });
  apply();
  var TREE = 'my3d.docTree', fold = document.getElementById('doc-tree-fold');
  function setTree(closed) {
    document.body.classList.toggle('tree-closed', closed);
    fold.textContent = closed ? '\u203A' : '\u2039';
    fold.title = closed ? fold.dataset.open : fold.dataset.close;
    fold.setAttribute('aria-expanded', String(!closed));
  }
  var closedAtStart = false;
  try { closedAtStart = localStorage.getItem(TREE) === 'closed'; } catch (e) { /* a private window */ }
  setTree(closedAtStart);
  fold.addEventListener('click', function () {
    var closed = !document.body.classList.contains('tree-closed');
    setTree(closed);
    try { localStorage.setItem(TREE, closed ? 'closed' : 'open'); } catch (e) { /* a private window */ }
  });
  var lang = document.getElementById('doc-lang'), page = lang.getAttribute('href').split('#')[0];
  function keepPlace(id) { lang.setAttribute('href', page + (id ? '#' + id : '')); }
  var main = document.querySelector('main');
  var links = {};
  document.querySelectorAll('.doc-tree a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  var sections = Object.keys(links).map(function (id) { return document.getElementById(id); });
  var current = null;
  function mark() {
    var top = main.getBoundingClientRect().top + 40, found = sections[0];
    for (var i = 0; i < sections.length; i++) { if (sections[i].getBoundingClientRect().top <= top) found = sections[i]; else break; }
    if (!found || found === current) return;
    if (current) links[current.id].classList.remove('on');
    current = found;
    var link = links[found.id];
    link.classList.add('on');
    link.scrollIntoView({ block: 'nearest' });
    keepPlace(found.id);
  }
  main.addEventListener('scroll', mark, { passive: true });
  mark();
})();
`;
fs.writeFileSync(path.join(target, 'doc.js'), SCRIPT);

let count = 0;
for (const file of fs.readdirSync(source).filter((f) => f.endsWith('.md'))) {
  const text = fs.readFileSync(path.join(source, file), 'utf8');
  const { body, toc } = toHtml(text);
  const title = text.match(/^#\s+(.*)$/m)?.[1] ?? file;
  const en = file.endsWith('.en.md');
  const other = en ? file.replace(/\.en\.md$/, '.html') : file.replace(/\.md$/, '.en.html');
  const words = en
    ? { size: 'Text size', smaller: 'Smaller text', larger: 'Larger text', reset: 'Back to 15px', tree: 'Contents', fold: 'Fold the contents', unfold: 'Unfold the contents', languageTip: '한국어로 보기', flag: taegukgiMarkup(15) }
    : { size: '글자 크기', smaller: '글자 작게', larger: '글자 크게', reset: '15px로 되돌리기', tree: '목차', fold: '목차 접기', unfold: '목차 펼치기', languageTip: 'English로 보기', flag: unionJackMarkup(15) };
  const top = `<header class="doc-top"><span class="doc-title">${escape(title)}</span><span class="doc-label">${words.size}</span><button type="button" class="doc-btn" id="doc-font-down" title="${words.smaller}" aria-label="${words.smaller}">−</button><button type="button" class="doc-btn doc-value" id="doc-font-reset" title="${words.reset}"><span id="doc-font-value"></span></button><button type="button" class="doc-btn" id="doc-font-up" title="${words.larger}" aria-label="${words.larger}">+</button><span class="doc-sep"></span><a class="doc-btn doc-flag" id="doc-lang" href="${other}" title="${words.languageTip}" aria-label="${words.languageTip}">${words.flag}</a></header>`;
  const tree = `<nav class="doc-tree" aria-label="${words.tree}"><div class="doc-tree-head"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M3 3h4M5 6.500h8M5 10h8M5 13.500h8M3 4v9.500"/></svg><span class="doc-tree-name">${words.tree}</span><button type="button" class="doc-fold" id="doc-tree-fold" data-close="${words.fold}" data-open="${words.unfold}">\u2039</button></div><div class="doc-tree-body">${toc.map((t) => `<a class="l${t.level}" href="#${t.id}" title="${escape(t.text.replace(/[\`*]/g, ''))}">${inline(t.text)}</a>`).join('')}</div></nav>`;
  const html = `<!doctype html><html lang="${en ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${STYLE}</style></head><body>${top}${tree}<main><div class="doc-page">${body}</div></main><script src="doc.js"></script></body></html>`;
  fs.writeFileSync(path.join(target, file.replace(/\.md$/, '.html')), html);
  count++;
}
// The pictures go along. They are made by npm run guide:images.
const pictures = path.join(source, 'images');
if (fs.existsSync(pictures)) fs.cpSync(pictures, path.join(target, 'images'), { recursive: true });
console.log(`Written: ${count} pages in public/doc`);
