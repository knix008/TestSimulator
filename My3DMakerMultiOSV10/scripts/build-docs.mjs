// npm run build:docs — doc/*.md → public/doc/*.html (served with the app: the Help viewer shows them in
// the app's colours; the desktop installer also ships doc/). A small Markdown subset: headings, paragraphs,
// lists, tables, `code`, **bold** and pictures: a line `![caption](images/ko/name.png)` becomes a figure with the
// caption under it (indented under a list item, it shows that step). doc/images/ (made by `npm run guide:images`)
// is copied to public/doc/images, so the pages find their pictures both in doc/ (installed with the desktop app,
// opened in a browser) and in the app's help viewer (public/doc → dist/doc).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'doc');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const LIST_ITEM = /^\s*([*-]|\d+\.)\s+/;
const figure = (alt, src) => `<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" />${alt ? `<figcaption>${inline(alt)}</figcaption>` : ''}</figure>`;
const slug = (s, used) => {
  let base = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
  let id = base; let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
};

export function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = []; const toc = []; const used = new Set();
  let title = 'My3DMaker';
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length; const text = h[2].trim();
      if (level === 1) { title = text; out.push(`<h1>${inline(text)}</h1>`); }
      else { const id = slug(text, used); if (level <= 3) toc.push({ level, id, text }); out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`); }
      i++; continue;
    }
    if (/^\|/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const img = IMAGE.exec(line);
    if (img) { flush(); out.push(figure(img[1], img[2])); i++; continue; }
    // "> tip" lines: a note box.
    if (/^>\s?/.test(line)) {
      flush();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '').trim()); i++; }
      out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
      continue;
    }
    if (LIST_ITEM.test(line)) {
      flush();
      const ordered = /^\s*\d+\./.test(line);
      const start = ordered ? Number(/^\s*(\d+)\./.exec(line)[1]) : 1;
      const items = [];
      while (i < lines.length) {
        if (LIST_ITEM.test(lines[i]) && (/^\s*\d+\./.test(lines[i]) === ordered)) { items.push({ text: lines[i].replace(LIST_ITEM, ''), figures: [] }); i++; continue; }
        // A picture indented under the item (blank lines around it allowed) belongs to that step.
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        const pic = j < lines.length && /^\s{2,}/.test(lines[j]) ? IMAGE.exec(lines[j]) : null;
        if (!pic) break;
        items.at(-1).figures.push(figure(pic[1], pic[2]));
        i = j + 1;
        // Blank lines before the next item of the same list.
        let k = i;
        while (k < lines.length && !lines[k].trim()) k++;
        if (k < lines.length && ((LIST_ITEM.test(lines[k]) && /^\s*\d+\./.test(lines[k]) === ordered) || (/^\s{2,}/.test(lines[k]) && IMAGE.test(lines[k])))) i = k;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.map((it) => `<li>${inline(it.text)}${it.figures.join('')}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flush();
  return { title, toc, body: out.join('\n') };
}

function page({ title, toc, body }, lang, other) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
:root { --bg: #f5f7fa; --surface: #ffffff; --text: #1f2328; --muted: #5b6472; --border: #d9dde3; --accent: #2563eb; --accent-soft: #e6eefc; --code-bg: #f0f2f5; --row-alt: #f7f8fa; --shadow: 0 1px 3px rgba(0,0,0,.12); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.65 "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif; }
.topbar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 10px 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
.topbar a { color: var(--accent); text-decoration: none; margin-left: auto; }
.layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 28px; max-width: 1180px; margin: 0 auto; padding: 24px; }
nav.toc { position: sticky; top: 64px; align-self: start; max-height: calc(100vh - 88px); overflow: auto; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; font-size: 0.9em; }
nav.toc a { display: block; padding: 3px 6px; border-radius: 6px; color: var(--text); text-decoration: none; }
nav.toc a.l3 { padding-left: 18px; color: var(--muted); }
nav.toc a:hover { background: var(--accent-soft); color: var(--accent); }
main { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 8px 36px 36px; box-shadow: var(--shadow); min-width: 0; }
h1 { font-size: 1.9em; margin: 22px 0 8px; }
h2 { margin-top: 34px; padding-bottom: 6px; border-bottom: 2px solid var(--accent-soft); color: var(--accent); }
h3 { margin-top: 22px; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.94em; }
th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: var(--accent-soft); }
tbody tr:nth-child(even) td { background: var(--row-alt); }
code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-family: Consolas, "Cascadia Mono", monospace; font-size: 0.92em; }
li { margin: 3px 0; }
figure { margin: 14px 0 20px; text-align: center; }
li > figure { margin: 8px 0 16px; }
figure img { display: block; max-width: 100%; height: auto; margin: 0 auto; border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow); background: #fff; }
figcaption { margin-top: 6px; color: var(--muted); font-size: 0.88em; }
blockquote { margin: 14px 0; padding: 8px 14px; border-left: 4px solid var(--accent); border-radius: 0 8px 8px 0; background: var(--accent-soft); }
blockquote p { margin: 0; }
@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } nav.toc { position: static; max-height: none; } main { padding: 8px 18px 24px; } }
@media print { .topbar, nav.toc { display: none; } .layout { display: block; padding: 0; } main { border: 0; box-shadow: none; } figure { break-inside: avoid; } }
</style>
</head>
<body>
<header class="topbar"><b>My3DMaker</b><span>${esc(title)}</span><a href="${other.href}">${esc(other.label)}</a></header>
<div class="layout">
<nav class="toc">${toc.map((e) => `<a class="l${e.level}" href="#${e.id}">${esc(e.text)}</a>`).join('')}</nav>
<main>
${body}
</main>
</div>
</body>
</html>
`;
}

{
  fs.mkdirSync(outDir, { recursive: true });
  // The pictures: doc/images → public/doc/images (stale ones removed).
  const imagesSrc = path.join(root, 'doc', 'images');
  const imagesOut = path.join(outDir, 'images');
  fs.rmSync(imagesOut, { recursive: true, force: true });
  if (fs.existsSync(imagesSrc)) {
    fs.cpSync(imagesSrc, imagesOut, { recursive: true });
    const count = fs.readdirSync(imagesSrc, { recursive: true }).filter((f) => /\.png$/i.test(f)).length;
    console.log(`doc/images → public/doc/images (${count} pictures)`);
  }
  const missing = [];
  for (const name of ['UsersGuide', 'Tutorial']) {
    for (const lang of ['ko', 'en']) {
      const src = path.join(root, 'doc', `${name}${lang === 'en' ? '.en' : ''}.md`);
      if (!fs.existsSync(src)) continue;
      const md = fs.readFileSync(src, 'utf8');
      for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) if (!/^[a-z]+:/i.test(m[1]) && !fs.existsSync(path.join(root, 'doc', m[1]))) missing.push(`${path.basename(src)}: ${m[1]}`);
      const html = page(markdownToHtml(md), lang, lang === 'en' ? { href: `${name}.html`, label: '한국어' } : { href: `${name}.en.html`, label: 'English' });
      const file = `${name}${lang === 'en' ? '.en' : ''}.html`;
      fs.writeFileSync(path.join(outDir, file), html);
      fs.writeFileSync(path.join(root, 'doc', file), html);
      console.log(`doc/${file}`);
    }
  }
  if (missing.length) {
    console.log(`Pictures not found (run npm run guide:images):\n  ${missing.join('\n  ')}`);
    process.exitCode = 1;
  }
}
