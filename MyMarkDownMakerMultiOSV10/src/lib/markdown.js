// Shared Markdown logic — merging, hierarchical heading numbering, outline
// extraction and HTML rendering. Ported from the Windows MDMakerWinV10
// reference so the Web / Electron builds behave identically.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ── Heading number prefix handling ────────────────────────
// One numbering token at the start of heading text:
//   1, 1.2, 1), 1.), (1), 1., etc.
const HEADING_NUMBER_TOKEN = new RegExp(
  '^(?:' +
    '\\(\\s*\\d+(?:\\.\\d+)*\\s*\\)' +      // (1)  (1.2)
    '|\\d+(?:\\.\\d+)*[.)\\,;:]+' +          // 1.  1)  1,  1;  1:
    '|\\d+(?:\\.\\d+)*\\.' +                 // 1.  1.2.
    '|\\d+(?:\\.\\d+)*' +                    // 1   1.2
  ')\\s+'
);

export function stripLeadingNumberPrefix(text) {
  let t = text.replace(/^\s+/, '');
  let prevLen;
  do {
    prevLen = t.length;
    t = t.replace(HEADING_NUMBER_TOKEN, '');
    t = t.replace(/^\s+/, '');
  } while (t.length < prevLen && t.length > 0);
  return t;
}

// Removes accumulated numbers (1  1.2  1.2.3 …) after #, ##, ### markers.
export function stripHeadingNumbers(markdown) {
  return eachHeadingLine(markdown, (hashes, rest) => {
    const title = stripLeadingNumberPrefix(rest);
    return title ? `${hashes} ${title}` : hashes;
  });
}

// Applies fresh hierarchical numbers (1, 1.1, 1.1.1 …) to every heading.
export function applyHeadingNumbering(markdown) {
  const counters = new Array(6).fill(0);
  return eachHeadingLine(markdown, (hashes, rest) => {
    const level = hashes.length;
    counters[level - 1]++;
    for (let i = level; i < 6; i++) counters[i] = 0;
    let start = 0;
    while (start < level - 1 && counters[start] === 0) start++;
    const parts = [];
    for (let i = start; i < level; i++) parts.push(counters[i]);
    const prefix = parts.join('.');
    const title = stripLeadingNumberPrefix(rest);
    return title ? `${hashes} ${prefix} ${title}` : `${hashes} ${prefix}`;
  });
}

// Strip existing numbers, then re-apply sequential numbering to the whole doc.
export function renumberHeadings(markdown) {
  return applyHeadingNumbering(stripHeadingNumbers(markdown));
}

// Runs a transform on every ATX heading line, skipping fenced code blocks.
function eachHeadingLine(markdown, transform) {
  const lines = markdown.split('\n');
  const out = new Array(lines.length);
  let inFence = false;
  let fenceChar = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) { inFence = true; fenceChar = ch; }
      else if (ch === fenceChar) { inFence = false; }
      out[i] = line;
      continue;
    }
    if (inFence) { out[i] = line; continue; }
    const m = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    out[i] = m ? transform(m[1], m[2].replace(/\r$/, '')) : line;
  }
  return out.join('\n');
}

// ── Outline (document structure) ──────────────────────────
// Returns [{ level, text, line, index }] for the heading tree, skipping fences.
export function getOutline(markdown) {
  const lines = markdown.split('\n');
  const items = [];
  let inFence = false;
  let fenceChar = '';
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) { inFence = true; fenceChar = ch; }
      else if (ch === fenceChar) { inFence = false; }
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (m) {
      items.push({ level: m[1].length, text: m[2].replace(/\r$/, '').trim(), line: i, index: idx++ });
    }
  }
  return items;
}

// ── Merging ───────────────────────────────────────────────
// files: [{ name, relPath, content }]  →  single markdown string.
// Sections are separated by a horizontal rule; an optional H2 header carrying
// the file's relative path is inserted before each section.
export function mergeFiles(files, { insertFileHeaders = false } = {}) {
  const parts = [];
  for (const f of files) {
    let seg = '';
    if (insertFileHeaders) {
      seg += `## ${f.relPath || f.name}\n\n`;
    }
    seg += (f.content || '').replace(/\s+$/, '');
    parts.push(seg);
  }
  const body = parts.join('\n\n---\n\n');
  return body.length ? body + '\n' : '';
}

// Async, chunked variant of mergeFiles: reports per-file progress via
// onProgress(done, total, name) and yields to the event loop every few files so
// a progress popup can paint during large merges. Same output as mergeFiles.
export async function mergeFilesAsync(files, { insertFileHeaders = false } = {}, onProgress) {
  const parts = [];
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const f = files[i];
    let seg = '';
    if (insertFileHeaders) seg += `## ${f.relPath || f.name}\n\n`;
    seg += (f.content || '').replace(/\s+$/, '');
    parts.push(seg);
    if (onProgress) onProgress(i + 1, total, f.relPath || f.name);
    if ((i & 15) === 15) await new Promise((r) => setTimeout(r, 0));
  }
  const body = parts.join('\n\n---\n\n');
  return body.length ? body + '\n' : '';
}

// ── Selection helpers (sort / exclude) ────────────────────
export const SORT_ORDERS = ['nameAsc', 'nameDesc', 'dateNewest', 'dateOldest', 'custom'];

export function sortFiles(files, order) {
  const arr = [...files];
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  switch (order) {
    case 'nameAsc':    return arr.sort(byName);
    case 'nameDesc':   return arr.sort((a, b) => byName(b, a));
    case 'dateNewest': return arr.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    case 'dateOldest': return arr.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
    case 'custom':     return arr;
    default:           return arr.sort(byName);
  }
}

function globToRegExp(pattern) {
  const esc = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + esc + '$', 'i');
}

export function parseExcludePatterns(text) {
  return (text || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// A file is excluded when any path segment matches any wildcard pattern.
export function isExcluded(relPath, patterns) {
  if (!patterns.length) return false;
  const segments = String(relPath).split(/[\\/]/);
  return patterns.some((raw) => {
    const rx = globToRegExp(raw);
    return segments.some((seg) => rx.test(seg));
  });
}

// ── HTML rendering ────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: false });

// Renders markdown to sanitized HTML, tagging headings with sequential ids
// (h-0, h-1 …) so the outline can scroll the preview to each heading.
export function renderHtml(markdown) {
  let html = marked.parse(markdown || '');
  let i = 0;
  html = html.replace(/<(h[1-6])(\s|>)/g, (_m, tag, after) => `<${tag} id="h-${i++}"${after}`);
  return DOMPurify.sanitize(html, { ADD_ATTR: ['id', 'target', 'align'] });
}

// Export file base name: first heading (or first non-empty line) without
// markers/numbers, sanitized for use as a filename.
export function documentExportBaseName(markdown) {
  if (!markdown || !markdown.trim()) return 'merged';
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const title = heading
      ? stripLeadingNumberPrefix(heading[1].trim())
      : stripLeadingNumberPrefix(line);
    return sanitizeFileName(title) || 'merged';
  }
  return 'merged';
}

function sanitizeFileName(name) {
  if (!name || !name.trim()) return '';
  let n = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/\.+$/, '');
  if (n.length > 80) n = n.slice(0, 80).trim();
  return n;
}

// Public sanitizer for a user-supplied export file name (strips extension too).
export function sanitizeExportName(name) {
  return sanitizeFileName(String(name || '').replace(/\.(md|markdown|html?|pdf|docx)$/i, ''));
}

// Default export/appearance settings (typography + header/footer/page number).
export const DEFAULT_EXPORT_SETTINGS = {
  fontFamily: '',        // '' = system default stack
  fontSizePt: 11,
  lineHeight: 1.5,       // export line spacing
  coverPage: true,       // auto-generated cover page
  coverTitle: '',        // user-entered cover title ('' = use document title)
  coverAuthor: '',       // cover: author
  coverDate: '',         // cover: date ('' = today's date)
  coverVersion: '',      // cover: version number
  coverShowVersion: true, // show version on the cover
  coverShowAuthor: true,  // show author on the cover
  coverShowDate: true,    // show date on the cover
  tocPage: true,         // separate index / table-of-contents page
  tocPageNumbers: true,  // show a right-aligned page number per index entry
  tocPageMap: null,      // { 'h-<index>': page } from a pagination pass (baked)
  headerText: '',
  headerAlign: 'center', // left | center | right
  footerText: '',
  footerAlign: 'center',
  showPageNumber: true,
  pageNumberPos: 'bottom-right', // {top|bottom}-{left|center|right}
  pageNumberOnCover: false,      // show the page number on the cover page too
};

// Builds a CSS font-family stack from a chosen family (may be empty).
export function fontStack(family) {
  const base = "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
  return family ? `"${family}", ${base}` : base;
}

// @page margin-box CSS for header/footer text and the page-number counter.
// Best-effort for HTML/print/web-PDF; Electron PDF uses printToPDF templates.
function buildPageMarginCss(s, family) {
  const slots = {}; // e.g. 'top-center' -> ['"Header"', 'counter(page)']
  const add = (slot, content) => { (slots[slot] ||= []).push(content); };
  if (s.headerText) add(`top-${s.headerAlign}`, cssString(s.headerText));
  if (s.footerText) add(`bottom-${s.footerAlign}`, cssString(s.footerText));
  if (s.showPageNumber) add(s.pageNumberPos, 'counter(page)');

  const boxes = Object.entries(slots).map(([slot, parts]) =>
    `@${slot}{content:${parts.join(' " " ')};font-family:${family};font-size:9pt;color:#555}`);

  // Always define an A4 page with margins (paged.js honours these and renders
  // the margin boxes; plain browsers use them only when printing).
  let css = `@page{size:A4;margin:18mm 16mm;${boxes.join('')}}`;
  // Hide the page number on the cover (first) page when requested.
  if (boxes.length && s.coverPage && s.showPageNumber && !s.pageNumberOnCover) {
    css += `@page:first{@${s.pageNumberPos}{content:""}}`;
  }
  return css;
}

// Cover page markup (auto-generated first page).
function coverHtml(title, s) {
  const sub = s.headerText ? `<div class="cover-sub">${escapeHtml(s.headerText)}</div>` : '';
  const date = (s.coverDate && s.coverDate.trim()) || s.dateStr || '';
  const lines = [];
  if (s.coverShowVersion && s.coverVersion) lines.push(escapeHtml(s.coverVersion));
  if (s.coverShowAuthor && s.coverAuthor) lines.push(escapeHtml(s.coverAuthor));
  if (s.coverShowDate && date) lines.push(escapeHtml(date));
  const meta = lines.length ? `<div class="cover-meta">${lines.map((l) => `<div>${l}</div>`).join('')}</div>` : '';
  return `<div class="cover"><div class="cover-inner">
  <h1 class="cover-title">${escapeHtml(title)}</h1>
  ${sub}
  ${meta}
</div></div>`;
}

// Index / table-of-contents page linking to each heading (#h-N anchors).
// opts:
//   withPageNo  – add a page-number column with a dotted leader per entry.
//   breakBefore – start the index on a fresh page.
//   pageMap     – { 'h-<index>': pageNumber } resolved by a pagination pass;
//                 numbers are baked in as static text. When absent, the .toc-c-pg
//                 cell is left empty for the paged PDF renderer to fill live.
//
// Rendered as a 3-cell table (title / dotted-leader / page number). A table is
// the one layout that renders consistently across the PDF (paged.js), the
// browser and Word (MHT) — flexbox and CSS leaders are unreliable in Word, and
// the middle cell's dotted bottom-border gives the classic "……" leader.
function tocHtml(markdown, label, opts = {}) {
  const { withPageNo, breakBefore, pageMap } = opts;
  const items = getOutline(markdown);
  if (!items.length) return '';
  const pageFor = (h) => {
    const n = pageMap ? pageMap[`h-${h.index}`] : undefined;
    return n != null ? String(n) : '';
  };
  const rows = items.map((h) => {
    // Indent by the numbering depth (1 / 1.1 / 1.1.1 …) when the heading carries
    // a leading number; otherwise fall back to the heading level.
    const m = (h.text || '').match(/^(\d+(?:\.\d+)*)(?:\s|$)/);
    const depth = m ? m[1].split('.').length : h.level;
    const indent = (Math.max(1, depth) - 1) * 1.6;
    const isL1 = depth <= 1;
    const cls = `toc-item${isL1 ? ' toc-l1' : ''}`;
    // Word (MHT) ignores CSS class/child-combinator rules, so bold the top-level
    // (H1) entries via inline styles + <b> which Word honors reliably.
    const label1 = escapeHtml(h.text || ' ');
    const title = isL1
      ? `<a href="#h-${h.index}" style="font-weight:bold"><b>${label1}</b></a>`
      : `<a href="#h-${h.index}">${label1}</a>`;
    const titleStyle = `padding-left:${indent}em${isL1 ? ';font-weight:bold' : ''}`;
    if (!withPageNo) {
      return `<tr class="${cls}"><td class="toc-c-title" colspan="3" style="${titleStyle}">${title}</td></tr>`;
    }
    const pg = pageFor(h);
    const pgInner = isL1 ? `<b>${pg}</b>` : pg;
    const pgStyle = isL1 ? ' style="font-weight:bold;color:#111"' : '';
    return `<tr class="${cls}">`
      + `<td class="toc-c-title" style="${titleStyle}">${title}</td>`
      + `<td class="toc-c-dots"></td>`
      + `<td class="toc-c-pg"${pgStyle}>${pgInner}</td>`
      + `</tr>`;
  }).join('');
  return `<div class="toc${breakBefore ? ' pb' : ''}"><h1 class="toc-title">${escapeHtml(label)}</h1>`
    + `<table class="toc-table"><tbody>${rows}</tbody></table></div>`;
}

// Wraps rendered body HTML into a standalone, styled HTML document (for export).
// settings may include: coverPage, coverTitle, tocPage, tocPageNumbers,
// contentsLabel, dateStr, appName.
export function toStandaloneHtml(markdown, title = 'Document', settings = {}) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings };
  const body = renderHtml(markdown);
  const family = fontStack(s.fontFamily);
  const size = Number(s.fontSizePt) || 11;
  const lineHeight = Number(s.lineHeight) > 0 ? Number(s.lineHeight) : 1;
  const pageCss = buildPageMarginCss(s, family);
  const coverTitle = (s.coverTitle && s.coverTitle.trim()) || title;
  const appName = s.appName || 'MyMarkDownMaker';
  const cover = s.coverPage ? coverHtml(coverTitle, s) : '';
  const toc = s.tocPage ? tocHtml(markdown, s.contentsLabel || 'Contents', {
    withPageNo: s.tocPageNumbers,
    breakBefore: !!cover,
    pageMap: s.tocPageMap,
  }) : '';
  // Content always starts on a fresh page when a cover or index precedes it.
  const content = `<div class="doc-content${(cover || toc) ? ' pb' : ''}">${body}</div>`;
  // Word (.doc) needs the Office namespaces + ProgId so it opens as a Word
  // document and renders base64 images, page breaks and the cover/index.
  const htmlOpen = s.forWord
    ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ko">`
    : `<html lang="ko">`;
  const wordMeta = s.forWord ? `<meta name="ProgId" content="Word.Document">\n<meta name="Originator" content="Word">` : '';
  // Word ignores CSS page-break-before in MHT, so insert an explicit hard page
  // break element (the documented mso break) between sections for Word.
  const wb = s.forWord ? '<br clear="all" style="mso-special-character:line-break;page-break-before:always">' : '';
  // On screen the cover fills the viewport & centers; in print/Word it is a
  // simple centered block that breaks to the next page.
  const coverScreen = '@media screen{.cover{min-height:calc(100vh - 96px);display:flex;align-items:center;justify-content:center}}';
  return `<!DOCTYPE html>
${htmlOpen}<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(coverTitle)}</title>
<meta name="generator" content="${escapeHtml(appName)}">
<meta name="author" content="${escapeHtml(appName)}">
${wordMeta}
<style>
  body{font-family:${family};font-size:${size}pt;line-height:${lineHeight};
       max-width:900px;margin:0 auto;padding:48px 40px;color:#1a1a1a;background:#fff}
  /* When printing (Electron PDF), the body padding/max-width offsets the
     paged.js A4 pages and spills them onto extra blank pages — reset it so each
     paged page maps 1:1 to a physical page. */
  @media print{body{margin:0;padding:0;max-width:none}}
  h1,h2,h3,h4,h5,h6{margin-top:1em;margin-bottom:.3em;color:#111;font-weight:600;page-break-after:avoid}
  h1{font-size:1.9em;border-bottom:2px solid #e0e0e0;padding-bottom:.2em}
  h2{font-size:1.45em;border-bottom:1px solid #e0e0e0;padding-bottom:.15em}
  h3{font-size:1.2em} h4,h5,h6{font-size:1.05em}
  code{background:#f0f0f0;padding:.1em .35em;border-radius:3px;font-family:Consolas,monospace;font-size:.88em}
  pre{background:#f5f5f5;padding:.8em 1em;border-radius:6px;overflow-x:auto;border:1px solid #e0e0e0}
  pre code{background:none;padding:0}
  blockquote{border-left:4px solid #ccc;margin:0 0 1em;padding:.4em .9em;color:#555;background:#fafafa}
  table{border-collapse:collapse;width:100%;margin:1em 0}
  th,td{border:1px solid #ddd;padding:.4em .7em;text-align:left}
  th{background:#f0f0f0;font-weight:600} tr:nth-child(even){background:#fafafa}
  hr{border:none;border-top:2px solid #e0e0e0;margin:1.4em 0}
  a{color:#0b8a76;text-decoration:none} img{max-width:100%}
  /* Fixed em-based top offset (NOT vh: paged.js mis-resolves viewport units,
     which pushed the cover onto a 2nd blank page before the index). */
  .cover{text-align:center;padding-top:15em}
  .cover-title{font-size:2.7em;border:none;margin:0 0 .4em;padding:0}
  .cover-sub{font-size:1.2em;color:#555;margin-bottom:1.5em}
  .cover-meta{margin-top:2.5em;color:#555;font-size:1.05em;line-height:1.9}
  .pb{page-break-before:always;break-before:page}
  .toc-title{border-bottom:2px solid #e0e0e0;padding-bottom:.2em}
  .toc-table{width:100%;border-collapse:collapse;margin:.6em 0 0}
  .toc-table tr{background:none}
  .toc-table td{border:0;padding:.22em 0;vertical-align:bottom}
  .toc-table a{color:inherit;text-decoration:none}
  /* Each entry stays on ONE line; the middle cell is an empty spacer that pushes
     the page number flush right (no dotted leader). */
  .toc-c-title{white-space:nowrap;padding-right:.5em}
  .toc-c-dots{width:100%;min-width:1.5em}
  .toc-c-pg{white-space:nowrap;text-align:right;color:#555;padding-left:.5em;font-variant-numeric:tabular-nums}
  .toc-l1>.toc-c-title{font-weight:600}
  /* H1 (top-level) page numbers are bold and dark so they stand out. */
  .toc-l1>.toc-c-pg{font-weight:700;color:#111}
  .toc-l1>.toc-c-title{padding-top:.4em}
  ${coverScreen}
  ${pageCss}
</style>
</head><body>
${cover}${toc ? (cover ? wb : '') + toc : ''}${(cover || toc) ? wb : ''}${content}
</body></html>`;
}

// Builds a Markdown export document: optional cover + index, then content,
// separated by horizontal rules (Markdown has no real page breaks).
export function buildMergedMarkdownDocument(markdown, opts = {}) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...opts };
  const title = (s.coverTitle && s.coverTitle.trim()) || opts.title || documentExportBaseName(markdown);
  const blocks = [];
  if (s.coverPage) {
    const lines = [`# ${title}`, ''];
    const date = (s.coverDate && s.coverDate.trim()) || s.dateStr || '';
    if (s.coverShowVersion && s.coverVersion) lines.push(s.coverVersion, '');
    if (s.coverShowAuthor && s.coverAuthor) lines.push(s.coverAuthor, '');
    if (s.coverShowDate && date) lines.push(date, '');
    blocks.push(lines.join('\n').trimEnd());
  }
  if (s.tocPage) {
    const items = getOutline(markdown);
    if (items.length) {
      const toc = items
        .map((h) => `${'  '.repeat(Math.max(0, h.level - 1))}- ${h.text}`)
        .join('\n');
      blocks.push(`## ${opts.contentsLabel || 'Contents'}\n\n${toc}`);
    }
  }
  blocks.push(markdown);
  return blocks.join('\n\n---\n\n') + '\n';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function cssString(text) {
  return '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
