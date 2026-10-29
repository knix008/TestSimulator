// Builds the in-app user manual (Help → User manual, F1) from the Markdown
// guides: UsersGuide.md → docs/USERSGUIDE.ko.html and docs/UsersGuide.en.md →
// docs/USERSGUIDE.en.html. A small Markdown converter (headings, paragraphs,
// lists, tables, code, quotes, images with captions, links, <kbd>) and one
// self-contained page: table of contents with a filter box, scroll spy, image
// zoom and print styles. No dependencies.
//
//   node scripts/build-manual.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  { md: "UsersGuide.md", out: "docs/USERSGUIDE.ko.html", lang: "ko", title: "MyArchitecture 10.0 사용 설명서", tab: "사용 설명서 — MyArchitecture 10.0", sub: "사용 설명서", filter: "목차 검색…", foot: "MyArchitecture 10.0 사용 설명서 · 프로그램의 실제 동작을 기준으로 작성되었고, 그림은 실제 실행 화면입니다.",
    ui: { lang: "언어", size: "글자 크기", smaller: "글자 작게", larger: "글자 크게", min: "최소화", max: "최대화", restore: "이전 크기로", close: "닫기" } },
  { md: "docs/UsersGuide.en.md", out: "docs/USERSGUIDE.en.html", lang: "en", title: "MyArchitecture 10.0 User's Guide", tab: "User manual — MyArchitecture 10.0", sub: "User's guide", filter: "Filter contents…", foot: "MyArchitecture 10.0 User's Guide · written against the program's actual behaviour; the pictures are real screenshots.",
    ui: { lang: "Language", size: "Text size", smaller: "Smaller text", larger: "Larger text", min: "Minimize", max: "Maximize", restore: "Restore", close: "Close" } },
];
// The language switch in the sidebar: [lang, label, page].
const LANGS = [["ko", "한국어", "USERSGUIDE.ko.html"], ["en", "English", "USERSGUIDE.en.html"]];
// Text size of the guide body (px): − / + step by 1, remembered in this browser.
const FONT = { min: 10, max: 28, def: 12 };
// Window buttons of the frameless manual window (the same glyphs as the program's, src/ui/app.js).
const GLYPH = {
  min: '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 5.5h10" stroke="currentColor" stroke-width="1"/></svg>',
  max: '<svg viewBox="0 0 10 10" width="10" height="10"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  restore: '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  close: '<svg viewBox="0 0 10 10" width="10" height="10"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" stroke-width="1.1"/></svg>',
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Inline HTML the guides may use on purpose.
const ALLOWED = /^<\/?(kbd|br|b|i|em|strong|sub|sup|span|small|code|u|mark)(\s[^>]*)?\/?>$/i;

// GitHub-style heading anchors, so links written for GitHub ([..](#2-화면과-조작)) work here too.
function slug(text, used) {
  let s = text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");
  let k = s, n = 1;
  while (used.has(k)) k = `${s}-${n++}`;
  used.add(k);
  return k;
}

function fixUrl(url, outDir) {
  if (/^(https?:|mailto:|#)/.test(url)) return url;
  // Paths in the Markdown are relative to the project root; the page lives in docs/.
  const rel = path.relative(path.join(root, outDir), path.join(root, url.split("#")[0])).replace(/\\/g, "/");
  return rel + (url.includes("#") ? "#" + url.split("#")[1] : "");
}

function inline(s, ctx) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  // Keep allowed inline tags, escape everything else.
  s = s.split(/(<[^>]+>)/g).map((part) => (part.startsWith("<") && ALLOWED.test(part) ? part : esc(part).replace(/&amp;(#?\w+;)/g, "&$1"))).join("");
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${fixUrl(src, ctx.outDir)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => `<a href="${fixUrl(href, ctx.outDir)}">${txt}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<b>$1</b>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s.,;:)!?]|$)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

function convert(md, ctx) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const toc = [];
  const used = new Set();
  let i = 0, title = null;
  const isBlockStart = (l) => /^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s|\|)/.test(l) || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(l.trim()) || /^(-{3,}|\*{3,})\s*$/.test(l) || /^<(div|table|details|figure|p|hr|pre)/i.test(l.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // Fenced code.
    let m = line.match(/^```(\w*)/);
    if (m) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre${m[1] ? ` class="lang-${m[1]}"` : ""}><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    // Headings.
    m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) {
      const level = m[1].length, text = m[2];
      if (level === 1 && !title) { title = text; i++; continue; }
      const id = slug(text, used);
      // The guide's own contents list is not a chapter of the sidebar.
      const isContents = /^(목차|차례|contents|table of contents)$/i.test(text.trim());
      if ((level === 2 || level === 3) && !isContents) toc.push({ level, id, text: inline(text, ctx).replace(/<[^>]+>/g, "") });
      out.push(`<h${level} id="${id}">${inline(text, ctx)}</h${level}>`);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    // Raw HTML block.
    if (/^<(div|table|details|figure|p|hr|pre)/i.test(line.trim())) {
      const buf = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      out.push(buf.join("\n"));
      continue;
    }
    // Figure: an image alone on its line, optionally followed by an italic caption line.
    m = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (m) {
      let cap = m[1];
      i++;
      while (i < lines.length && !lines[i].trim() && i + 1 < lines.length && /^[*_][^*_].*[*_]\s*$/.test(lines[i + 1].trim())) i++;
      if (i < lines.length && /^[*_][^*_].*[*_]\s*$/.test(lines[i].trim())) { cap = lines[i].trim().slice(1, -1); i++; }
      out.push(`<figure><img src="${fixUrl(m[2], ctx.outDir)}" alt="${esc(m[1])}" loading="lazy"><figcaption>${inline(cap, ctx)}</figcaption></figure>`);
      continue;
    }
    // Block quote → callout (💡 / 팁 / Tip → tip, ⚠ / 주의 / Warning → warn, otherwise note).
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      const text = buf.join("\n");
      const kind = /^(\s*\**\s*)(💡|팁|tip)/i.test(text) ? "tip" : /^(\s*\**\s*)(⚠|주의|경고|warning|caution)/i.test(text) ? "warn" : "note";
      out.push(`<div class="callout ${kind}">${convert(text, ctx).html}</div>`);
      continue;
    }
    // Table.
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c, ctx)}</${tag}>`;
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, k) => td("td", c, k)).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    // Lists (nested by indentation).
    if (/^\s*([-*+]|\d+[.)])\s/.test(line)) {
      const buf = [];
      while (i < lines.length && (lines[i].trim() === "" ? i + 1 < lines.length && /^\s+\S|^\s*([-*+]|\d+[.)])\s/.test(lines[i + 1]) : (/^\s*([-*+]|\d+[.)])\s/.test(lines[i]) || /^\s+\S/.test(lines[i])))) buf.push(lines[i++]);
      out.push(list(buf, ctx));
      continue;
    }
    // Paragraph.
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) { buf.push(lines[i++].trim()); }
    out.push(`<p>${inline(buf.join(" "), ctx).replace(/ {2,}$/gm, "<br>")}</p>`);
  }
  return { html: out.join("\n"), toc, title };
}

function list(lines, ctx) {
  const indentOf = (l) => l.match(/^\s*/)[0].replace(/\t/g, "    ").length;
  const base = indentOf(lines[0]);
  const ordered = /^\s*\d+[.)]\s/.test(lines[0]);
  const items = [];
  for (const l of lines) {
    const ind = indentOf(l);
    const m = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (m && ind <= base + 1) items.push({ text: [m[2]], sub: [] });
    else if (items.length) items[items.length - 1].sub.push(l);
  }
  const html = items.map((it) => {
    // Continuation lines belong to the item's text until a nested list starts.
    const cont = [];
    while (it.sub.length && !/^\s*([-*+]|\d+[.)])\s/.test(it.sub[0])) cont.push(it.sub.shift().trim());
    const sub = it.sub.filter((l) => l.trim());
    const rest = sub.length ? (/^\s*([-*+]|\d+[.)])\s/.test(sub[0]) ? list(sub, ctx) : convert(sub.map((l) => l.trim()).join("\n"), ctx).html) : "";
    return `<li>${inline([...it.text, ...cont].filter(Boolean).join(" "), ctx)}${rest}</li>`;
  }).join("");
  return ordered ? `<ol class="steps">${html}</ol>` : `<ul>${html}</ul>`;
}

// The colours are the program's theme: the app stores its theme tokens
// (src/ui/app.js applyTheme → "myarch.manualTheme") and THEME_SCRIPT maps
// them onto these variables. The values here are for the page on its own.
const CSS = `
:root { --bg: #fbfbf8; --paper: #fff; --text: #1f2328; --muted: #5b636e; --line: #e3e5e8; --line2: #d0d4da; --accent: #c2410c; --accent-soft: #fdeee4; --accent-text: #fff; --code: #f3f4f6; --side: #f4f5f2; --input: #fff;
  --tip-line: #2e9e5b; --warn-line: #e08a00; --note-line: #3b74d8; --shot-shadow: 0 4px 18px rgba(20, 30, 50, 0.10); --fs: ${FONT.def}px;
  --font: "Pretendard", "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; --mono: "Cascadia Mono", "JetBrains Mono", Consolas, "D2Coding", monospace; color-scheme: light; }
:root[data-mode="dark"] { --tip-line: #3fbf76; --warn-line: #f0a020; --note-line: #5b93f0; --shot-shadow: 0 4px 18px rgba(0, 0, 0, 0.45); color-scheme: dark; }
* { box-sizing: border-box; }
/* Only the part under the toolbar scrolls: the toolbar spans the whole width
   (its window buttons reach the window's edge, past the scrollbar). */
html, body { height: 100%; overflow: hidden; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15.5px/1.72 var(--font); -webkit-font-smoothing: antialiased; }
/* The guide's own toolbar across the top of the window: icon and title on the
   left, language and text size on the right, then (in the program, where the
   window has no native title bar) the window buttons. It moves the window. */
:root { --bar-h: 44px; }
.manual-bar { position: relative; z-index: 20; height: var(--bar-h); display: flex; align-items: center; gap: 14px; padding: 0 18px; background: var(--side); border-bottom: 1px solid var(--line); font-size: 13px; user-select: none; }
.manual-bar.framed { -webkit-app-region: drag; app-region: drag; padding-right: 0; }
.manual-bar .seg, .manual-bar .size, .manual-bar .win-controls { -webkit-app-region: no-drag; app-region: no-drag; }
.manual-bar .bar-title { display: flex; align-items: center; gap: 8px; margin-right: auto; min-width: 0; white-space: nowrap; overflow: hidden; }
.manual-bar .bar-title img { width: 20px; height: 20px; flex: none; }
.manual-bar .bar-title span { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.manual-bar .group { display: flex; align-items: center; gap: 8px; flex: none; }
.manual-bar .win-controls { display: flex; align-self: stretch; flex: none; margin-left: 4px; }
.manual-bar .win-controls[hidden] { display: none; }
.manual-bar .win-btn { display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 100%; padding: 0; border-radius: 0; cursor: default; }
.manual-bar .win-btn:hover { background: color-mix(in srgb, var(--text) 8%, transparent); }
.manual-bar .win-btn.win-close:hover { background: #e81123; color: #fff; }
.manual-bar .win-btn.win-close:active { background: #f1707a; color: #fff; }
.manual-bar .label { color: var(--muted); }
.manual-bar .divider { width: 1px; height: 20px; background: var(--line2); }
.manual-bar .seg, .manual-bar .size { display: flex; border: 1px solid var(--line2); border-radius: 7px; overflow: hidden; background: var(--input); }
.manual-bar button { font: inherit; font-size: 13px; color: var(--text); background: transparent; border: 0; padding: 4px 12px; cursor: pointer; line-height: 1.4; }
.manual-bar button:hover { background: var(--accent-soft); }
.manual-bar .seg button + button { border-left: 1px solid var(--line2); }
.manual-bar .seg button.on { background: var(--accent); color: var(--accent-text); cursor: default; }
.manual-bar .size button { width: 32px; padding: 4px 0; font-size: 15px; font-weight: 700; }
.manual-bar .size button:disabled { color: var(--muted); opacity: 0.45; cursor: default; background: transparent; }
.manual-bar .size output { min-width: 60px; text-align: center; align-self: center; color: var(--text); font-variant-numeric: tabular-nums; border-left: 1px solid var(--line2); border-right: 1px solid var(--line2); padding: 4px 0; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
.layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); align-items: start; height: calc(100vh - var(--bar-h)); overflow-y: auto; scroll-behavior: smooth; scroll-padding-top: 16px; }
nav.toc { position: sticky; top: 0; height: calc(100vh - var(--bar-h)); overflow-y: auto; background: var(--side); border-right: 1px solid var(--line); padding: 18px 14px 40px 18px; font-size: 13.5px; line-height: 1.45; }
nav.toc .brand { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; font-weight: 700; font-size: 17px; }
nav.toc .brand img { width: 30px; height: 30px; }
nav.toc .sub { color: var(--muted); font-size: 12.5px; margin: 0 0 12px 40px; }
nav.toc input { width: 100%; padding: 7px 10px; border: 1px solid var(--line2); border-radius: 7px; font: inherit; color: var(--text); background: var(--input); margin-bottom: 10px; }
nav.toc ol { list-style: none; margin: 0; padding: 0; }
nav.toc li.ch > a { display: block; padding: 5px 8px; border-radius: 6px; color: var(--text); font-weight: 600; margin-top: 2px; }
nav.toc li.ch > ol { margin: 0 0 4px 10px; padding-left: 8px; border-left: 1px solid var(--line2); display: none; }
nav.toc li.ch.open > ol, nav.toc.searching li.ch > ol { display: block; }
nav.toc li.sec > a { display: block; padding: 3px 8px; border-radius: 5px; color: var(--muted); }
nav.toc a.active { background: var(--accent-soft); color: var(--accent) !important; }
nav.toc li.hide { display: none; }
main { padding: 34px 48px 120px; max-width: calc(1080px + 40 * (var(--fs) - ${FONT.def}px)); font-size: var(--fs); }
header.cover { border-bottom: 1px solid var(--line); padding-bottom: 22px; margin-bottom: 18px; display: flex; gap: 20px; align-items: center; }
header.cover img { width: 84px; height: 84px; }
header.cover h1 { font-size: 2.15em; margin: 0 0 6px; letter-spacing: -0.5px; line-height: 1.3; }
header.cover p { margin: 4px 0; color: var(--muted); }
h2 { font-size: 1.65em; margin: 64px 0 14px; padding-top: 18px; border-top: 2px solid var(--text); letter-spacing: -0.3px; line-height: 1.4; }
h3 { font-size: 1.2em; margin: 36px 0 10px; } h4 { font-size: 1em; margin: 24px 0 6px; }
p { margin: 10px 0; } ul, ol { padding-left: 24px; } li { margin: 3px 0; }
code { font-family: var(--mono); font-size: 0.88em; background: var(--code); padding: 1px 5px; border-radius: 4px; border: 1px solid var(--line); }
pre { font-family: var(--mono); font-size: 0.82em; background: var(--code); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow-x: auto; line-height: 1.5; }
pre code { background: none; border: 0; padding: 0; font-size: 1em; }
kbd { display: inline-block; font-family: var(--mono); font-size: 0.82em; line-height: 1.2; padding: 2px 6px; margin: 0 1px; border: 1px solid var(--line2); border-bottom-width: 2px; border-radius: 5px; background: linear-gradient(var(--paper), var(--code)); color: var(--text); white-space: nowrap; vertical-align: 1px; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; margin: 12px 0 18px; font-size: 0.9em; background: var(--paper); }
th, td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
th { background: var(--side); font-weight: 700; } tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--paper) 96%, var(--text)); }
figure { margin: 18px 0 24px; }
figure img, p img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line2); border-radius: 8px; box-shadow: var(--shot-shadow); cursor: zoom-in; }
figure figcaption { font-size: 0.87em; color: var(--muted); margin-top: 7px; }
.callout { border-left: 4px solid; border-radius: 6px; padding: 10px 14px 10px 44px; margin: 14px 0; position: relative; }
.callout::before { position: absolute; left: 14px; top: 9px; font-size: 1.1em; }
.callout p:first-child { margin-top: 0; } .callout p:last-child { margin-bottom: 0; }
.tip { background: color-mix(in srgb, var(--tip-line) 12%, var(--paper)); border-color: var(--tip-line); } .tip::before { content: "💡"; }
.warn { background: color-mix(in srgb, var(--warn-line) 12%, var(--paper)); border-color: var(--warn-line); } .warn::before { content: "⚠️"; }
.note { background: color-mix(in srgb, var(--note-line) 12%, var(--paper)); border-color: var(--note-line); } .note::before { content: "ℹ️"; }
ol.steps { padding-left: 26px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
.lightbox { position: fixed; inset: 0; background: rgba(10, 14, 20, 0.85); display: none; align-items: center; justify-content: center; z-index: 50; cursor: zoom-out; padding: 20px; }
.lightbox.on { display: flex; } .lightbox img { max-width: 100%; max-height: 100%; border-radius: 6px; }
.totop { position: fixed; right: 18px; bottom: 18px; width: 38px; height: 38px; border-radius: 50%; background: var(--text); color: var(--bg); display: grid; place-items: center; font-size: 18px; opacity: 0.75; }
footer { margin-top: 80px; color: var(--muted); font-size: 0.84em; border-top: 1px solid var(--line); padding-top: 14px; }
@media (max-width: 960px) { .layout { grid-template-columns: 1fr; } nav.toc { position: static; height: auto; max-height: 50vh; border-right: 0; border-bottom: 1px solid var(--line); } main { padding: 20px 16px 80px; } }
@media print { html, body, .layout { height: auto; overflow: visible; } nav.toc, .manual-bar, .totop, .lightbox { display: none !important; } main { font-size: 15.5px; } .layout { display: block; } main { max-width: none; padding: 0; } h2 { page-break-before: always; } figure, table { page-break-inside: avoid; } }
`;

// Runs in <head>, before the first paint: the program's theme and the chosen
// text size. A theme change in the program reaches an open guide through the
// storage event (same origin, other window).
const THEME_SCRIPT = `(function () {
  var MAP = { '--bg': '--bg', '--panel': '--paper', '--panel2': '--side', '--panel3': '--code', '--text': '--text', '--muted': '--muted', '--line': '--line', '--line2': '--line2',
    '--accent': '--accent', '--accent-soft': '--accent-soft', '--accent-text': '--accent-text', '--input': '--input' };
  var root = document.documentElement;
  function theme() {
    var th = null;
    try { th = JSON.parse(localStorage.getItem('myarch.manualTheme') || 'null'); } catch (e) { th = null; }
    if (!th || !th.tokens) return;
    root.dataset.mode = th.mode === 'dark' ? 'dark' : 'light';
    for (var k in MAP) if (th.tokens[k]) root.style.setProperty(MAP[k], th.tokens[k]);
  }
  // size(): the stored size; size(v): set and remember v.
  function size(v) {
    if (v == null) { try { v = parseInt(localStorage.getItem('myarch.manual.fontSize'), 10); } catch (e) { v = NaN; } }
    else { try { localStorage.setItem('myarch.manual.fontSize', String(v)); } catch (e) { /* not remembered */ } }
    v = isNaN(v) ? ${FONT.def} : Math.min(${FONT.max}, Math.max(${FONT.min}, v));
    root.style.setProperty('--fs', v + 'px');
    window.manualPrefs.cur = v;
    return v;
  }
  window.manualPrefs = { theme: theme, size: size, min: ${FONT.min}, max: ${FONT.max}, cur: ${FONT.def} };
  theme(); size();
  window.addEventListener('storage', function (e) { if (e.key === 'myarch.manualTheme') theme(); if (e.key === 'myarch.manual.fontSize') { size(); if (window.manualPrefs.onSize) window.manualPrefs.onSize(); } });
})();`;

const SCRIPT = `(function () {
  // In the program (Windows, Linux) the window has no title bar: the toolbar
  // moves it (CSS app-region on Windows, start_dragging elsewhere) and carries
  // the window buttons. In a browser or on macOS there are none.
  var tb = document.getElementById('manual-bar'), T = window.__TAURI__ && window.__TAURI__.core;
  if (T && !/Macintosh|Mac OS X/.test(navigator.userAgent)) {
    var wc = document.getElementById('win-controls'), maxBtn = wc.querySelector('[data-win="max"]'), G = ${JSON.stringify({ max: GLYPH.max, restore: GLYPH.restore })};
    var sync = function (m) { maxBtn.innerHTML = m ? G.restore : G.max; maxBtn.title = m ? maxBtn.dataset.restore : maxBtn.dataset.maximize; maxBtn.setAttribute('aria-label', maxBtn.title); };
    var toggle = function () { T.invoke('win_toggle_maximize').then(sync, function () {}); };
    maxBtn.dataset.maximize = maxBtn.title; maxBtn.dataset.restore = tb.dataset.restore;
    wc.hidden = false; tb.classList.add('framed');
    wc.querySelector('[data-win="min"]').addEventListener('click', function () { T.invoke('win_minimize'); });
    maxBtn.addEventListener('click', toggle);
    wc.querySelector('[data-win="close"]').addEventListener('click', function () { T.invoke('win_close'); });
    T.invoke('win_is_maximized').then(sync, function () {});
    window.addEventListener('resize', function () { T.invoke('win_is_maximized').then(sync, function () {}); });
    if (!/Windows/.test(navigator.userAgent)) {
      var empty = function (e) { return e.button === 0 && !e.target.closest('button, output'); };
      tb.addEventListener('mousedown', function (e) { if (empty(e) && e.detail === 1) T.invoke('win_start_dragging', { label: null }); });
      tb.addEventListener('dblclick', function (e) { if (empty(e)) toggle(); });
    }
  }
  // The toolbar stays over the top of the page: what is read starts below it,
  // in the scrolling pane.
  var bar = tb.offsetHeight, pane = document.querySelector('.layout');
  var P = window.manualPrefs, out = document.getElementById('fs-value'), dec = document.getElementById('fs-dec'), inc = document.getElementById('fs-inc');
  function show() { var v = P.cur; out.textContent = v + ' px'; dec.disabled = v <= P.min; inc.disabled = v >= P.max; }
  function step(d) {
    // Keep the line at the top of the window where it is while the text grows or shrinks.
    var anchor = null, top = 0, heads = document.querySelectorAll('main h2[id], main h3[id], main p, main figure, main li');
    for (var j = 0; j < heads.length; j++) { var r = heads[j].getBoundingClientRect(); if (r.bottom > bar) { anchor = heads[j]; top = r.top; break; } }
    P.size(P.cur + d);
    show();
    if (anchor) pane.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: 'instant' });
  }
  P.onSize = show; show();
  dec.addEventListener('click', function () { step(-1); });
  inc.addEventListener('click', function () { step(1); });
  document.querySelectorAll('.manual-bar .seg button[data-href]').forEach(function (b) { b.addEventListener('click', function () { location.replace(b.dataset.href); }); });
  var links = [].slice.call(document.querySelectorAll('nav.toc a[href^="#"]')), map = {};
  links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  var heads = [].slice.call(document.querySelectorAll('main h2[id], main h3[id]'));
  function spy() {
    var y = bar + 90, cur = null;
    for (var i = 0; i < heads.length; i++) { if (heads[i].getBoundingClientRect().top <= y) cur = heads[i]; else break; }
    links.forEach(function (a) { a.classList.remove('active'); });
    document.querySelectorAll('nav.toc li.ch.open').forEach(function (li) { li.classList.remove('open'); });
    if (!cur || !map[cur.id]) return;
    var a = map[cur.id]; a.classList.add('active');
    var ch = a.closest('li.ch'); if (ch) { ch.classList.add('open'); var top = ch.querySelector(':scope > a'); if (top && top !== a) top.classList.add('active'); }
    // Keep the current entry in view by scrolling the contents list only (scrollIntoView would move the page too).
    var toc = document.getElementById('toc'), r = a.getBoundingClientRect(), n = toc.getBoundingClientRect();
    if (r.top < n.top + 40 || r.bottom > n.bottom - 40) toc.scrollTop += r.top - (n.top + n.height / 2);
  }
  var t = null; pane.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(spy, 40); }); spy();
  var f = document.getElementById('toc-filter');
  f.addEventListener('input', function () {
    var q = f.value.trim().toLowerCase();
    document.getElementById('toc').classList.toggle('searching', !!q);
    document.querySelectorAll('nav.toc li').forEach(function (li) { li.classList.toggle('hide', !!q && li.textContent.toLowerCase().indexOf(q) < 0); });
  });
  var lb = document.getElementById('lightbox');
  document.querySelectorAll('main img').forEach(function (img) { img.addEventListener('click', function () { lb.querySelector('img').src = img.src; lb.classList.add('on'); }); });
  lb.addEventListener('click', function () { lb.classList.remove('on'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.classList.remove('on'); });
})();`;

function page(src, body, toc, title) {
  const chapters = [];
  for (const e of toc) {
    if (e.level === 2) chapters.push({ ...e, secs: [] });
    else if (chapters.length) chapters[chapters.length - 1].secs.push(e);
  }
  const nav = chapters.map((c) => `<li class="ch"><a href="#${c.id}">${c.text}</a><ol>${c.secs.map((s) => `<li class="sec"><a href="#${s.id}">${s.text}</a></li>`).join("")}</ol></li>`).join("");
  return `<!doctype html>
<html lang="${src.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(src.tab)}</title>
<link rel="icon" href="../assets/icon.png">
<style>${CSS}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<div class="manual-bar" id="manual-bar" role="toolbar" data-restore="${esc(src.ui.restore)}">
  <div class="bar-title"><img src="../assets/icon.png" alt=""><b>${esc(src.sub)}</b><span>— MyArchitecture 10.0</span></div>
  <div class="group"><span class="label">${esc(src.ui.lang)}</span>
    <div class="seg" role="group" aria-label="${esc(src.ui.lang)}">${LANGS.map(([l, label, file]) => (l === src.lang ? `<button type="button" class="on" aria-pressed="true" lang="${l}">${label}</button>` : `<button type="button" aria-pressed="false" lang="${l}" data-href="${file}">${label}</button>`)).join("")}</div></div>
  <span class="divider"></span>
  <div class="group"><span class="label">${esc(src.ui.size)}</span>
    <div class="size" role="group" aria-label="${esc(src.ui.size)}"><button type="button" id="fs-dec" title="${esc(src.ui.smaller)}" aria-label="${esc(src.ui.smaller)}">−</button><output id="fs-value" aria-live="polite">${FONT.def} px</output><button type="button" id="fs-inc" title="${esc(src.ui.larger)}" aria-label="${esc(src.ui.larger)}">+</button></div></div>
  <div class="win-controls" id="win-controls" hidden><button type="button" class="win-btn win-min" data-win="min" title="${esc(src.ui.min)}" aria-label="${esc(src.ui.min)}">${GLYPH.min}</button><button type="button" class="win-btn win-max" data-win="max" title="${esc(src.ui.max)}" aria-label="${esc(src.ui.max)}">${GLYPH.max}</button><button type="button" class="win-btn win-close" data-win="close" title="${esc(src.ui.close)}" aria-label="${esc(src.ui.close)}">${GLYPH.close}</button></div>
</div>
<div class="layout">
<nav class="toc" id="toc">
  <div class="brand"><img src="../assets/icon.png" alt="">MyArchitecture 10.0</div>
  <div class="sub">${esc(src.sub)}</div>
  <input id="toc-filter" type="search" placeholder="${esc(src.filter)}" autocomplete="off">
  <ol>${nav}</ol>
</nav>
<main id="top">
<header class="cover"><img src="../assets/icon.png" alt=""><div><h1>${esc(title || src.title)}</h1><p>${esc(src.sub)} · MyArchitecture 10.0</p></div></header>
${body}
<footer>${esc(src.foot)}</footer>
</main>
</div>
<div class="lightbox" id="lightbox"><img alt=""></div>
<a class="totop" href="#top" title="Top">↑</a>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

let built = 0;
for (const src of SOURCES) {
  const file = path.join(root, src.md);
  if (!fs.existsSync(file)) { console.log(`skip ${src.md} (not found)`); continue; }
  const outDir = path.dirname(src.out);
  const { html, toc, title } = convert(fs.readFileSync(file, "utf8"), { outDir });
  fs.writeFileSync(path.join(root, src.out), page(src, html, toc, title));
  // Report images the page points at that do not exist.
  const missing = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u) && !fs.existsSync(path.join(root, outDir, u)));
  console.log(`${src.out}: ${toc.filter((e) => e.level === 2).length} chapters, ${toc.filter((e) => e.level === 3).length} sections${missing.length ? `, MISSING images: ${missing.join(", ")}` : ""}`);
  built++;
}
process.exit(built ? 0 : 1);
