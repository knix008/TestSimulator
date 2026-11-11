// npm run build:docs — the help pages the app shows in its document window (src/viewer.js):
//   public/doc/UsersGuide.html, UsersGuide.en.html  ← USERSGUIDE.md (the <!-- lang:ko --> / <!-- lang:en --> halves)
//   public/doc/Tutorial.html, Tutorial.en.html      ← the tutorial's steps (src/ui/tutorial.js) and their texts (src/i18n/board.js)
// public/ is served by Vite while developing, copied into dist/ by the web build and embedded in the desktop
// program, so the pages are found at doc/<name>.html next to the app page everywhere. h2/h3 get ids: the
// viewer lists them as chapters.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'doc');
mkdirSync(out, { recursive: true });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
const slug = (s, used) => {
  let id = String(s).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
  while (used.has(id)) id += '-';
  used.add(id);
  return id;
};

/** A small Markdown subset: headings, paragraphs, lists, tables, inline code/bold/links. */
export function markdown(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const used = new Set();
  let list = null;
  let para = [];
  const flush = () => {
    if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    if (list) { html.push(`</${list}>`); list = null; }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^<!--.*-->$/.test(line.trim())) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); const level = h[1].length; html.push(level >= 2 ? `<h${level} id="${slug(h[2], used)}">${inline(h[2])}</h${level}>` : `<h1>${inline(h[2])}</h1>`); continue; }
    if (/^\|/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i -= 1;
      const cells = (row) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      html.push(`<table><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const li = /^\s*(-|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
      const kind = li[1] === '-' ? 'ul' : 'ol';
      if (list !== kind) { if (list) html.push(`</${list}>`); html.push(`<${kind}>`); list = kind; }
      html.push(`<li>${inline(li[2])}</li>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if (list) { html.push(`</${list}>`); list = null; }
    para.push(line.trim());
  }
  flush();
  return html.join('\n');
}

/** The contents on the left: every h2 / h3 of the page (they carry ids), linked. */
function tocOf(body, lang) {
  const items = [...body.matchAll(/<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)].map(([, level, id, inner]) => ({ level: Number(level), id, text: inner.replace(/<[^>]+>/g, '') }));
  if (!items.length) return '<nav class="toc" aria-hidden="true"></nav>';
  const title = lang === 'en' ? 'Contents' : '목차';
  return `<nav class="toc" aria-label="${title}"><p class="toc-title">${title}</p><ul>${items.map((item) => `<li class="h${item.level}"><a href="#${esc(item.id)}">${item.text}</a></li>`).join('')}</ul></nav>`;
}

function page(title, lang, body) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --text: #1f2328; --muted: #59636e; --accent: #2f63d8; --border: #d0d7de; --code: #f3f5f8; }
  @media (prefers-color-scheme: dark) { :root { --bg: #16191f; --text: #e6e9ef; --muted: #9aa4b2; --accent: #7aa7ff; --border: #343a46; --code: #222731; } }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.65 "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; }
  .layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 28px; max-width: 1180px; margin: 0 auto; padding: 20px 24px; }
  main { min-width: 0; max-width: 860px; padding: 8px 0 60px; }
  nav.toc { position: sticky; top: 16px; align-self: start; max-height: calc(100vh - 32px); overflow: auto; font-size: 14px; padding: 8px 8px 8px 0; border-right: 1px solid var(--border); }
  nav.toc .toc-title { font-weight: 700; color: var(--muted); font-size: 12px; letter-spacing: .04em; margin: 0 0 8px 10px; }
  nav.toc ul { list-style: none; margin: 0; padding: 0; }
  nav.toc li a { display: block; padding: 3px 10px; border-left: 2px solid transparent; color: var(--text); text-decoration: none; border-radius: 0 6px 6px 0; }
  nav.toc li a:hover { background: var(--code); }
  nav.toc li a.active { border-left-color: var(--accent); color: var(--accent); font-weight: 600; }
  nav.toc li.h3 a { padding-left: 24px; color: var(--muted); font-size: 13px; }
  @media (max-width: 760px) { .layout { grid-template-columns: 1fr; padding: 12px; } nav.toc { position: static; max-height: none; border: 1px solid var(--border); border-radius: 10px; } }
  @media print { nav.toc { display: none; } .layout { display: block; } }
  h1 { font-size: 1.9em; margin: 0 0 18px; }
  h2 { font-size: 1.45em; margin: 34px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  h3 { font-size: 1.15em; margin: 26px 0 8px; color: var(--accent); }
  p, li { color: var(--text); }
  code { padding: 1px 6px; border-radius: 5px; background: var(--code); font-family: Consolas, "D2Coding", monospace; font-size: 0.92em; }
  table { border-collapse: collapse; margin: 10px 0 18px; }
  th, td { border: 1px solid var(--border); padding: 5px 12px; text-align: left; }
  th { background: var(--code); }
  .step { margin: 0 0 14px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px; }
  .step b { color: var(--accent); }
  .muted { color: var(--muted); }
</style>
</head>
<body><div class="layout">
${tocOf(body, lang)}
<main>
${body}
</main></div>
<script>
  // the section being read is marked in the contents
  const links = [...document.querySelectorAll('nav.toc a')];
  const mark = () => { let current = null; for (const a of links) { const h = document.getElementById(decodeURIComponent(a.hash.slice(1))); if (h && h.getBoundingClientRect().top < 120) current = a; } links.forEach((a) => a.classList.toggle('active', a === current)); };
  addEventListener('scroll', mark, { passive: true }); mark();
</script></body>
</html>
`;
}

// ── user's guide
const guide = readFileSync(path.join(root, 'USERSGUIDE.md'), 'utf8').replace(/\r\n/g, '\n');
const halves = { ko: guide.split('<!-- lang:ko -->')[1]?.split('<!-- lang:en -->')[0] ?? '', en: guide.split('<!-- lang:en -->')[1] ?? '' };
for (const [lang, text] of Object.entries(halves)) {
  const body = `<h1>MyBoard — ${lang === 'en' ? 'User’s Guide' : '사용 설명서'}</h1>\n${markdown(text.replace(/^##\s+(한국어|English)\s*$/m, ''))}`;
  writeFileSync(path.join(out, `UsersGuide${lang === 'en' ? '.en' : ''}.html`), page(lang === 'en' ? 'MyBoard — User’s Guide' : 'MyBoard — 사용 설명서', lang, body));
}

// ── tutorial document (the same steps the in-app tutorial walks through)
const { STEPS, CHAPTERS } = await import(pathToFileURL(path.join(root, 'src', 'ui', 'tutorial.js')).href);
const texts = await import(pathToFileURL(path.join(root, 'src', 'i18n', 'board.js')).href);
for (const lang of ['ko', 'en']) {
  const t = (key) => texts[lang][key] ?? key;
  let body = `<h1>MyBoard — ${lang === 'en' ? 'Tutorial' : '따라하기'}</h1>\n<p class="muted">${esc(lang === 'en' ? 'The same steps the tutorial shows in the program (Help › Tutorial, F11).' : '프로그램 안의 따라하기(도움말 › 따라하기, F11)와 같은 단계입니다.')}</p>\n`;
  let n = 0;
  for (const chapter of CHAPTERS) {
    body += `<h2 id="${chapter}">${esc(t(`tutorial.chapter.${chapter}`))}</h2>\n`;
    for (const step of STEPS.filter((s) => s.chapter === chapter)) {
      n += 1;
      body += `<div class="step"><h3 id="step-${step.id}">${n}. ${esc(t(`tutorial.${step.id}.title`))}</h3><p>${esc(t(`tutorial.${step.id}.text`))}</p></div>\n`;
    }
  }
  writeFileSync(path.join(out, `Tutorial${lang === 'en' ? '.en' : ''}.html`), page(lang === 'en' ? 'MyBoard — Tutorial' : 'MyBoard — 따라하기', lang, body));
}
console.log(`[build-docs] public/doc: UsersGuide(.en).html, Tutorial(.en).html`);
