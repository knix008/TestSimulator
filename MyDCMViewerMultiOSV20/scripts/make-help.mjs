// Builds the in-app help window's content from doc/help/*.md (Korean) and doc/help/en/*.md (English):
//   src/help/help-data.js   window.HELP_LANGS = { ko: [{ id, title, tour, headings, html, text }], en: [...] }
//                           window.HELP_PAGES = HELP_LANGS.ko
//   src/help/images/        the pictures the pages use (copied from doc/images/; English pages use
//                           doc/images/en/<name> when it exists, shipped as src/help/images/en/<name>)
// The help window (src/js/help.js) shows them; doc/ stays the readable source.
//   node scripts/make-help.mjs        (also run by npm run help:media after new screenshots)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'doc', 'help');
const IMG = path.join(ROOT, 'doc', 'images');
const OUT = path.join(ROOT, 'src', 'help');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// inline: code, images, links, bold, italic, <kbd> passes through
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s).replace(/&lt;(\/?)kbd&gt;/g, '<$1kbd>');
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => `<img src="help/${src}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, href) => (href.endsWith('.md') ? `<a href="#" data-help="${path.basename(href, '.md')}">${t}</a>` : `<a href="${href}" target="_blank" rel="noopener">${t}</a>`));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[+i]);
}
function convert(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [], headings = [];
  let tour = null, title = '';
  let i = 0;
  const slug = (t) => 'h-' + headings.length;
  while (i < lines.length) {
    const l = lines[i];
    const tm = /^<!--\s*tour:\s*([\w-]+)\s*-->$/.exec(l.trim());
    if (tm) { if (!tour) tour = tm[1]; else out.push(`<div class="help-tour" data-tour="${tm[1]}"></div>`); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) {
      const level = h[1].length, text = h[2].trim();
      if (level === 1) { title = text; out.push(`<h1>${inline(text)}</h1>`); }
      else { const id = slug(text); headings.push({ id, level, text }); out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`); }
      i++; continue;
    }
    if (/^\|/.test(l)) {   // table
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(l.trim());
    if (img) { out.push(`<figure><img src="help/${img[2]}" alt="${esc(img[1])}" loading="lazy"><figcaption>${inline(img[1])}</figcaption></figure>`); i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||>|\s*([-*]|\d+\.)\s|!\[|<!--)/.test(lines[i])) para.push(lines[i++].trim());
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); else i++;
  }
  const html = out.join('\n');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { title, tour, headings, html, text };
}

const LANGS = { ko: SRC, en: path.join(SRC, 'en') };
const langs = {};
for (const [lang, dir] of Object.entries(LANGS)) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
  langs[lang] = files.map((f) => ({ id: path.basename(f, '.md'), ...convert(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}
// English pages show the English screenshots (doc/images/en/) where there are some, the Korean ones otherwise
for (const p of langs.en) p.html = p.html.replace(/src="help\/images\/([^"/]+)"/g, (m, name) => (fs.existsSync(path.join(IMG, 'en', name)) ? `src="help/images/en/${name}"` : m));
fs.mkdirSync(path.join(OUT, 'images', 'en'), { recursive: true });
const used = new Set();
for (const pages of Object.values(langs)) for (const p of pages) for (const m of p.html.matchAll(/src="help\/images\/([^"]+)"/g)) used.add(m[1]);
const missing = [];
for (const name of used) {
  const from = path.join(IMG, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(OUT, 'images', name)); else missing.push(name);
}
for (const sub of ['', 'en']) for (const old of fs.readdirSync(path.join(OUT, 'images', sub))) {
  const rel = sub ? `${sub}/${old}` : old;
  if (rel !== 'en' && !used.has(rel)) fs.rmSync(path.join(OUT, 'images', rel));
}
fs.writeFileSync(path.join(OUT, 'help-data.js'), `/* Generated by scripts/make-help.mjs from doc/help/*.md and doc/help/en/*.md — edit those, not this file. */\nwindow.HELP_LANGS = ${JSON.stringify(langs, null, 0)};\nwindow.HELP_PAGES = window.HELP_LANGS.ko;\n`);
console.log(`${Object.entries(langs).map(([l, p]) => `${p.length} ${l}`).join(' + ')} help pages, ${used.size} pictures${missing.length ? ` (missing: ${missing.join(', ')})` : ''} → ${path.relative(ROOT, OUT)}`);
if (missing.length && process.argv.includes('--strict')) process.exit(1);
