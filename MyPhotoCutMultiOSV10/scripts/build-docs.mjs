// npm run build:docs — UsersGuide.md (Korean) and UsersGuide.en.md → docs/UsersGuide.html and
// docs/UsersGuide.en.html (standalone pages, installed with the app and opened by Help › User's guide;
// public/docs/ gets a copy for the web build). A small Markdown reader: headings, paragraphs,
// lists, tables, **bold**, `code`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');

function toHtml(md, toc) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let list = false;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      out.push(`<table><thead><tr>${cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const img = /^!\[(.*?)\]\((.+?)\)$/.exec(line.trim());
    if (img) { if (list) { out.push('</ul>'); list = false; } out.push(`<figure><img src="${esc(img[2])}" alt="${esc(img[1])}" loading="lazy" /><figcaption>${inline(img[1])}</figcaption></figure>`); continue; }
    const li = /^(?:-|\d+\.)\s+(.*)$/.exec(line);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { const level = h[1].length; const id = `s${n++}`; if (level > 1) toc.push({ id, level, text: h[2] }); out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`); continue; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

const page = (title, body, lang, toc) => `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#fbf8fa;--text:#1d2433;--muted:#667085;--accent:#d94a7b;--line:#e6dbe1}
@media (prefers-color-scheme:dark){:root{--bg:#17131a;--text:#ece6ee;--muted:#a59aa8;--accent:#ff7aa6;--line:#3a2f3d}}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 "Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
.layout{display:grid;grid-template-columns:260px minmax(0,1fr);max-width:1240px;margin:0 auto}
nav.toc{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;padding:24px 10px 24px 18px;border-right:1px solid var(--line);font-size:14px}
nav.toc b{display:block;margin:0 0 10px;color:var(--accent)}nav.toc a{display:block;padding:4px 8px;border-radius:6px;color:var(--text);text-decoration:none}nav.toc a.l3{padding-left:22px;color:var(--muted);font-size:13px}nav.toc a:hover,nav.toc a.on{background:color-mix(in srgb,var(--accent) 14%,transparent)}
@media (max-width:760px){.layout{grid-template-columns:1fr}nav.toc{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line)}}
main{max-width:920px;padding:28px 24px 60px}
h1{color:var(--accent);border-bottom:2px solid var(--line);padding-bottom:8px}h2{margin-top:2em;border-bottom:1px solid var(--line);padding-bottom:4px}
table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}th{background:color-mix(in srgb,var(--accent) 12%,transparent)}
code{background:color-mix(in srgb,var(--accent) 12%,transparent);padding:1px 5px;border-radius:4px}
figure{margin:14px 0 22px}figure img{display:block;max-width:100%;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12)}figcaption{margin-top:6px;font-size:13px;color:var(--muted);text-align:center}
</style></head><body><div class="layout"><nav class="toc" aria-label="${lang === 'ko' ? '목차' : 'Contents'}"><b>${lang === 'ko' ? '목차' : 'Contents'}</b>${toc.map((e) => `<a class="l${e.level}" href="#${e.id}">${inline(e.text)}</a>`).join('')}</nav><main>${body}</main></div>
<script>const links=[...document.querySelectorAll('nav.toc a')];const heads=links.map(a=>document.getElementById(a.hash.slice(1)));addEventListener('scroll',()=>{let i=0;heads.forEach((h,k)=>{if(h.getBoundingClientRect().top<120)i=k});links.forEach((a,k)=>a.classList.toggle('on',k===i))},{passive:true});</script></body></html>
`;

const docs = path.join(root, 'docs');
fs.mkdirSync(docs, { recursive: true });
// The pictures go with the pages (desktop resources and the web build's public/docs).
const pictures = path.join(docs, 'images');
if (fs.existsSync(pictures)) {
  const target = path.join(root, 'public', 'docs', 'images');
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(pictures)) fs.copyFileSync(path.join(pictures, file), path.join(target, file));
}
for (const [md, html, lang] of [['UsersGuide.md', 'UsersGuide.html', 'ko'], ['UsersGuide.en.md', 'UsersGuide.en.html', 'en']]) {
  const source = path.join(root, md);
  if (!fs.existsSync(source)) continue;
  const text = fs.readFileSync(source, 'utf8');
  const title = /^#\s+(.*)$/m.exec(text)?.[1] ?? 'MyPhotoCut';
  const toc = [];
  const out = page(title, toHtml(text, toc), lang, toc);
  fs.writeFileSync(path.join(docs, html), out);
  fs.mkdirSync(path.join(root, 'public', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'docs', html), out);
  console.log(`docs/${html}`);
}
