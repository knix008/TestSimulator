// Shared Markdown logic — merging, hierarchical heading numbering, outline
// extraction and HTML rendering. Ported from the Windows MDMakerWinV10
// reference so the Web / Electron builds behave identically.
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { expandImageRefs, imageRefName, srcBaseName } from './images';

// ── Document front-matter sections ────────────────────────
// The merged document carries its cover, contents and figure index as ordinary
// Markdown wrapped in HTML-comment markers. That way the Edit tab shows — and
// lets you change — exactly what the preview and the exports render, while the
// markers still let each renderer lay a block out as a real page (a centred
// cover, index tables with right-aligned page numbers) instead of flat text.
// HTML comments are invisible in every other Markdown renderer, so an exported
// .md stays clean and can be read back in.
const SECTION_OPEN = /^\s*<!--\s*mmm:(cover|toc|figures)\s*-->\s*$/;
const SECTION_CLOSE = /^\s*<!--\s*\/mmm:(cover|toc|figures)\s*-->\s*$/;

// Splits into lines and flags, per line, whether it belongs to a front-matter
// section — heading numbering, the outline and the figure list all skip those,
// so the cover title never gets numbered and "## 목차" never shows up in the
// structure tree.
function scanSections(markdown) {
  const lines = String(markdown || '').split('\n');
  const inSection = new Array(lines.length).fill(false);
  const sections = {};
  let open = null;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!open) {
      const m = SECTION_OPEN.exec(lines[i]);
      if (m) { open = m[1]; start = i; inSection[i] = true; }
      continue;
    }
    inSection[i] = true;
    const c = SECTION_CLOSE.exec(lines[i]);
    if (c && c[1] === open) {
      sections[open] = lines.slice(start + 1, i).join('\n').trim();
      open = null;
    }
  }
  // An unterminated marker swallows the rest of the file rather than leaking a
  // raw HTML comment into the body.
  if (open) sections[open] = lines.slice(start + 1).join('\n').trim();
  return { lines, inSection, sections };
}

// { cover, toc, figures, body } — the four parts of a merged document.
export function splitDocument(markdown) {
  const { lines, inSection, sections } = scanSections(markdown);
  const body = lines.filter((_l, i) => !inSection[i]).join('\n');
  return {
    cover: sections.cover || '',
    toc: sections.toc || '',
    figures: sections.figures || '',
    body: body.replace(/^\s*\n+/, '').trimEnd(),
  };
}

// Re-assembles a document from its parts; empty parts are left out entirely.
export function composeDocument({ cover = '', toc = '', figures = '', body = '' }) {
  const wrap = (id, text) => `<!-- mmm:${id} -->\n${text.trim()}\n<!-- /mmm:${id} -->`;
  const blocks = [];
  if (cover.trim()) blocks.push(wrap('cover', cover));
  if (toc.trim()) blocks.push(wrap('toc', toc));
  if (figures.trim()) blocks.push(wrap('figures', figures));
  if (body.trim()) blocks.push(body.trim());
  return blocks.length ? blocks.join('\n\n') + '\n' : '';
}

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

// Runs a transform on every ATX heading line, skipping fenced code blocks and
// the generated front-matter sections.
function eachHeadingLine(markdown, transform) {
  const { lines, inSection } = scanSections(markdown);
  const out = new Array(lines.length);
  let inFence = false;
  let fenceChar = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inSection[i]) { out[i] = line; continue; }
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
// Returns [{ level, text, line, index }] for the heading tree, skipping fences
// and the front-matter sections (the cover title and the index headings are not
// part of the document structure). `index` matches the body's `h-N` anchors.
export function getOutline(markdown) {
  const { lines, inSection } = scanSections(markdown);
  const items = [];
  let inFence = false;
  let fenceChar = '';
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inSection[i]) continue;
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

// ── Figures (images) ──────────────────────────────────────
// One match per image, in document order: Markdown `![alt](src "title")`,
// reference-style `![alt][ref]`, or a raw <img> tag. Kept in one alternation so
// every form stays interleaved in the order it appears on the line — the count
// must match the <img> tags renderHtml() numbers, or the figure index would
// point at the wrong pictures.
const FIGURE_TOKEN = /!\[([^\]]*)\]\(\s*<?([^)\s"<>]+)>?\s*(?:"([^"]*)"|'([^']*)')?\s*\)|!\[([^\]]*)\]\[([^\]]*)\]|<img\b([^>]*?)\/?>/gi;

// Display size is carried in the image title as `w=<percent>%` — a place plain
// Markdown already has, so the Edit tab stays readable and other renderers just
// ignore it. renderHtml() turns it into a real width, and the Markdown export
// rewrites such images as <img width> so the size survives outside the app.
const SIZE_HINT = /^\s*w=(\d{1,3})%\s*$/i;

// Percent width of a figure, or 0 for "original size".
function sizeFromTitle(title) {
  const m = SIZE_HINT.exec(String(title || ''));
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n <= 100 ? n : 0;
}

// Rewrites one figure's Markdown so it renders at `percent` of the page width
// (0 / null restores the original size). Returns the whole document.
export function setFigureWidth(markdown, figure, percent) {
  if (!figure) return markdown;
  const pct = Math.max(10, Math.min(100, Math.round(Number(percent) || 0)));
  const alt = figure.alt || '';
  const src = figure.src;
  const next = (!percent || pct >= 100)
    ? `![${alt}](${src})`
    : `![${alt}](${src} "w=${pct}%")`;
  const text = String(markdown || '');
  return text.slice(0, figure.start) + next + text.slice(figure.start + figure.length);
}

// A figure number the author already wrote into the caption — "그림 3-1",
// "[그림 5]", "Figure 2.", "Fig. 1-2" — plus a bare leading number followed by a
// separator ("1-1. 구성도"). The document applies its own sequential numbering,
// so leaving the old one in would print "그림 1. 그림 3-1 구성도".
const FIGURE_LABEL_PREFIX = new RegExp(
  '^\\s*[[(<]?\\s*' +
  '(?:그림|사진|도표|Figure|Fig\\.?|FIG\\.?)\\s*' +
  '\\d+(?:[-.]\\d+)*' +
  '\\s*[\\])>]?\\s*[.:\\-–—]?\\s*',
  'i',
);
// A bare number counts as a figure number when it is multi-part ("3-1 구성도")
// or is followed by a separator ("5. 구성도"). A lone number with just a space
// after it is left alone — "2024 매출 그래프" is a title, not a numbering.
const BARE_NUMBER_PREFIX = /^\s*(?:\d+[-.]\d+(?:[-.]\d+)*\s+|\d+(?:[-.]\d+)*\s*[.:\-–—]\s+)/;

// Removes those prefixes (repeatedly, e.g. "[그림 1] 1-2. 제목").
export function stripFigureNumberPrefix(text) {
  let s = String(text || '').trim();
  let prev;
  do {
    prev = s;
    s = s.replace(FIGURE_LABEL_PREFIX, '').replace(BARE_NUMBER_PREFIX, '').trim();
  } while (s !== prev && s);
  return s;
}

function attrOf(attrs, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs || '');
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

// Returns [{ index, line, start, length, alt, src, caption }] for every image in
// the document, skipping fenced code blocks. `index` matches the `fig-<n>`
// anchor that renderHtml() puts on the corresponding <img>, so the figure index
// page, the preview and the sidebar all agree on the same numbering.
// Markdown link definitions (`[id]: <url> "title"`), keyed by lower-cased id.
// Reference-style images (`![alt][id]`) point at these, so the figure list has
// to resolve them or it would show the label instead of the picture.
function linkDefinitions(lines) {
  const defs = {};
  for (const line of lines) {
    const m = line.match(/^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/);
    if (m) defs[m[1].trim().toLowerCase()] = m[2];
  }
  return defs;
}

export function getFigures(markdown) {
  const { lines, inSection } = scanSections(markdown);
  const defs = linkDefinitions(lines);
  const items = [];
  let inFence = false;
  let fenceChar = '';
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // `offset` keeps counting through skipped lines so `start` stays an absolute
    // position in the whole document (the editor selects by it).
    if (inSection[i]) { offset += line.length + 1; continue; }
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) { inFence = true; fenceChar = ch; }
      else if (ch === fenceChar) { inFence = false; }
      offset += line.length + 1;
      continue;
    }
    if (inFence) { offset += line.length + 1; continue; }
    let m;
    FIGURE_TOKEN.lastIndex = 0;
    while ((m = FIGURE_TOKEN.exec(line))) {
      let alt, src, width;
      if (m[2] !== undefined) {                                         // ![alt](src "w=60%")
        alt = m[1]; src = m[2]; width = sizeFromTitle(m[3] ?? m[4]);
      } else if (m[6] !== undefined) {                                  // ![alt][ref]
        alt = m[5];
        // `![alt][]` and `![alt]` fall back to the alt text as the label.
        const label = (m[6] || m[5] || '').trim().toLowerCase();
        src = defs[label] || m[6] || m[5];
        width = 0;
      } else {                                                          // <img …>
        alt = attrOf(m[7], 'alt'); src = attrOf(m[7], 'src');
        width = sizeFromTitle(`w=${parseInt(attrOf(m[7], 'width'), 10) || 0}%`);
      }
      alt = alt.trim();
      src = src.trim();
      if (!src) continue;
      items.push({
        index: items.length,
        line: i,
        start: offset + m.index,
        length: m[0].length,
        alt,
        src,
        width, // percent of the page width; 0 = original size
        // Any figure number the caption already carries is dropped — the
        // document numbers its figures itself. A data: URI has no meaningful
        // name, so such a figure falls back to its "Figure N" label alone.
        caption: stripFigureNumberPrefix(alt)
          || imageRefName(src)
          || (/^data:/i.test(src) ? '' : srcBaseName(src)),
      });
    }
    offset += line.length + 1;
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

// Renders markdown to sanitized HTML.
//   • headings get sequential ids (h-0, h-1 …) so the outline can scroll the
//     preview to each heading;
//   • images get sequential ids (fig-0, fig-1 …) matching getFigures(), so the
//     figure index page and the sidebar can link straight to a picture;
//   • `mmm-img:<n>` refs are expanded to their Base64 data URIs, which is what
//     actually makes the images show up.
// opts.figureCaptions numbers standalone images as "Figure N. caption" below
// the picture (the labels the figure index page refers to).
// Turns the `title="w=60%"` size hint marked emits into a real width. Both the
// attribute and the inline style are set: Chromium/paged.js honour the style,
// Word honours the width attribute.
function applyFigureSizes(html) {
  return html.replace(/<img\b([^>]*?)\/?>/gi, (whole, attrs) => {
    const t = /\btitle\s*=\s*"([^"]*)"/i.exec(attrs);
    const pct = sizeFromTitle(t && t[1]);
    if (!pct) return whole;
    const rest = attrs.replace(/\stitle\s*=\s*"[^"]*"/i, '');
    return `<img${rest} width="${pct}%" style="width:${pct}%">`;
  });
}

export function renderHtml(markdown, opts = {}) {
  const { figureCaptions = false, figureLabel = 'Figure', anchors = true } = opts;
  const figures = figureCaptions ? getFigures(markdown) : null;
  let html = marked.parse(expandImageRefs(markdown || ''));
  html = applyFigureSizes(html);
  if (anchors) {
    let i = 0;
    html = html.replace(/<(h[1-6])(\s|>)/g, (_m, tag, after) => `<${tag} id="h-${i++}"${after}`);
    let f = 0;
    html = html.replace(/<img\b([^>]*?)\/?>/gi, (_m, attrs) => `<img${attrs} id="fig-${f++}">`);
  }
  if (figures) {
    // Only a paragraph that holds nothing but the image becomes a captioned
    // <figure>; images used inline inside a sentence are left as they are.
    html = html.replace(/<p>\s*(<img\b[^>]*\bid="fig-(\d+)"[^>]*>)\s*<\/p>/gi, (_m, img, n) => {
      const fig = figures[Number(n)];
      const text = fig && fig.caption ? `${figureLabel} ${Number(n) + 1}. ${fig.caption}` : `${figureLabel} ${Number(n) + 1}`;
      return `<figure class="figure">${img}<figcaption>${escapeHtml(text)}</figcaption></figure>`;
    });
  }
  return DOMPurify.sanitize(html, { ADD_ATTR: ['id', 'target', 'align'] });
}

// Export file base name: first heading (or first non-empty line) without
// markers/numbers, sanitized for use as a filename.
export function documentExportBaseName(markdown) {
  if (!markdown || !markdown.trim()) return 'merged';
  // The cover title names the document; fall back to the body's first heading.
  const doc = splitDocument(markdown);
  const source = doc.cover.trim() || doc.body;
  for (const raw of source.split('\n')) {
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
  fontSizePt: 10,
  lineHeight: 1.5,       // export line spacing
  coverPage: true,       // auto-generated cover page
  coverTitle: '',        // user-entered cover title ('' = use document title)
  coverAuthor: '',       // cover: author
  coverDate: '',         // cover: date ('' = today's date)
  coverVersion: '',      // cover: version number
  coverTitleFont: '',    // cover title font ('' = the export font)
  coverTitleSizePt: 0,   // cover title size in pt (0 = automatic, 2.7em)
  coverTitleAlign: 'center',
  coverMetaAlign: 'center', // version / author / date block alignment
  coverShowVersion: true, // show version on the cover
  coverShowAuthor: true,  // show author on the cover
  coverShowDate: true,    // show date on the cover
  tocPage: true,         // separate index / table-of-contents page
  tocPageNumbers: true,  // show a right-aligned page number per index entry
  tocPageMap: null,      // { 'h-<index>': page } from a pagination pass (baked)
  figurePage: true,      // separate figure index page (skipped when there are
                         // no images in the document)
  figurePageNumbers: true, // show a right-aligned page number per figure entry
  figurePageMap: null,   // { 'fig-<index>': page } from a pagination pass
  headerText: '',
  headerAlign: 'center', // left | center | right
  footerText: '',
  footerAlign: 'center',
  showPageNumber: true,
  pageNumberPos: 'bottom-right', // {top|bottom}-{left|center|right}
  pageNumberOnCover: false,      // show the page number on the cover page too
};

// Builds a CSS font-family stack from a chosen family (may be empty).
// The same stack for a style="…" attribute: the family name is single-quoted so
// it cannot close the attribute, and anything but plain name characters is
// dropped (font names come from the system list, but this is generated markup).
export function inlineFontStack(family) {
  const safe = String(family || '').replace(/[^\w \-.]/g, '').trim();
  return safe ? fontStack(safe).replace(/"/g, "'") : fontStack('');
}

export function fontStack(family) {
  const base = "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
  return family ? `"${family}", ${base}` : base;
}

// @page margin-box CSS for header/footer text and the page-number counter.
// Best-effort for HTML/print/web-PDF; Electron PDF uses printToPDF templates.
function buildPageMarginCss(s, family, hasCover) {
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
  if (boxes.length && hasCover && s.showPageNumber && !s.pageNumberOnCover) {
    css += `@page:first{@${s.pageNumberPos}{content:""}}`;
  }
  return css;
}

// ── Front-matter builders (Markdown the user can edit) ────
// These produce the *text* that goes into the cover / toc / figures sections of
// the merged document. The renderers below turn that same text back into a
// styled cover page and index tables, so what the Edit tab shows is what the
// preview and the exports lay out.

// Escapes the two characters that would break a Markdown link label.
function escapeLinkText(text) {
  return String(text || '').replace(/([[\]])/g, '\\$1');
}

// Text of the first ATX heading in a block ('' when there is none).
function firstHeadingText(markdown) {
  for (const raw of String(markdown || '').split('\n')) {
    const m = raw.match(/^\s*#{1,6}\s+(.*)$/);
    if (m) return m[1].trim();
  }
  return '';
}

// Cover block: the title as an H1, then version / author / date, each its own
// paragraph so they stack as separate lines.
export function buildCoverMarkdown(title, s = {}) {
  const meta = [];
  const date = (s.coverDate && s.coverDate.trim()) || s.dateStr || '';
  if (s.coverShowVersion !== false && s.coverVersion) meta.push(s.coverVersion.trim());
  if (s.coverShowAuthor !== false && s.coverAuthor) meta.push(s.coverAuthor.trim());
  if (s.coverShowDate !== false && date) meta.push(date.trim());
  const sub = s.headerText ? [s.headerText.trim()] : [];
  return [`# ${String(title || '').trim()}`, ...sub, ...meta].join('\n\n');
}

// Contents block: a Markdown list whose nesting is the heading depth and whose
// links carry the `#h-N` anchors the page-number pass and the preview use.
export function buildTocMarkdown(body, label) {
  const items = getOutline(body);
  if (!items.length) return '';
  const rows = items.map((h) => {
    // Indent by the numbering depth (1 / 1.1 / 1.1.1 …) when the heading carries
    // a leading number; otherwise fall back to the heading level.
    const m = (h.text || '').match(/^(\d+(?:\.\d+)*)(?:\s|$)/);
    const depth = m ? m[1].split('.').length : h.level;
    return `${'  '.repeat(Math.max(0, depth - 1))}- [${escapeLinkText(h.text || ' ')}](#h-${h.index})`;
  });
  return `## ${label}\n\n${rows.join('\n')}`;
}

// Figure index block. Returns '' when the body has no images, so a picture-less
// document never gets a figure index at all.
export function buildFiguresMarkdown(body, label, figureLabel = 'Figure') {
  const figures = getFigures(body);
  if (!figures.length) return '';
  const rows = figures.map((f) => {
    const no = `${figureLabel} ${f.index + 1}`;
    const text = f.caption ? `${no}. ${f.caption}` : no;
    return `- [${escapeLinkText(text)}](#fig-${f.index})`;
  });
  return `## ${label}\n\n${rows.join('\n')}`;
}

// Builds the whole document (front matter + body) from a merged body. The
// settings decide which blocks exist at all.
export function buildDocument(body, settings = {}) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings };
  const title = (s.coverTitle && s.coverTitle.trim()) || s.title || documentExportBaseName(body);
  return composeDocument({
    cover: s.coverPage ? buildCoverMarkdown(title, s) : '',
    toc: s.tocPage ? buildTocMarkdown(body, s.contentsLabel || 'Contents') : '',
    figures: s.figurePage ? buildFiguresMarkdown(body, s.figuresLabel || 'List of Figures', s.figureLabel || 'Figure') : '',
    body,
  });
}

// Regenerates only the front matter, keeping the body — and therefore any manual
// body edits — exactly as it is.
export function refreshFrontMatter(markdown, settings = {}) {
  return buildDocument(splitDocument(markdown).body, settings);
}

// ── Front-matter renderers ────────────────────────────────

// Cover page: the block's own Markdown, centred on a page of its own. Anchors
// are suppressed so the cover's H1 never steals the body's `h-0` id.
// The title's font/size/alignment and the meta block's alignment are applied as
// INLINE styles on the rendered <h1> / <p>: Word (MHT) ignores class-based rules
// but honours inline ones, so this is the only way the cover looks the same in
// the preview, the PDF and the .doc.
function renderCoverHtml(coverMd, opts = {}) {
  if (!String(coverMd || '').trim()) return '';
  const { titleFont, titleSizePt, titleAlign = 'center', metaAlign = 'center', breakBefore } = opts;
  let inner = renderHtml(coverMd, { anchors: false });
  const title = [
    `text-align:${titleAlign}`,
    titleFont ? `font-family:${inlineFontStack(titleFont)}` : '',
    Number(titleSizePt) > 0 ? `font-size:${Number(titleSizePt)}pt` : '',
  ].filter(Boolean).join(';');
  inner = inner.replace(/<h1(\s|>)/i, `<h1 style="${title}"$1`);
  inner = inner.replace(/<p(\s|>)/gi, `<p style="text-align:${metaAlign}"$1`);
  return `<div class="cover${breakBefore ? ' pb' : ''}">`
    + `<div class="cover-inner">${inner}</div></div>`;
}

// Renders a contents / figure-index block — a Markdown list of `[text](#anchor)`
// links — as a 3-cell table (title / spacer / page number). A table is the one
// layout that renders consistently across the PDF (paged.js), the browser and
// Word (MHT); flexbox and CSS leaders are unreliable in Word.
//
// Entry indentation comes from the list nesting, the page number from the link's
// anchor via `pageMap`. Entries the user has retyped without a link still show —
// they simply carry no page number.
// opts:
//   withPageNo  – add the page-number column.
//   breakBefore – start the block on a fresh page.
//   pageMap     – { 'h-<n>' | 'fig-<n>': page } from a pagination pass. When
//                 absent the cell is left empty for the paged PDF renderer.
//   extraClass  – extra class on the wrapper (e.g. 'figure-index').
function renderIndexHtml(blockMd, opts = {}) {
  const { withPageNo, breakBefore, pageMap, extraClass = '' } = opts;
  const lines = String(blockMd || '').split('\n');
  let label = '';
  const rows = [];
  for (const raw of lines) {
    const head = raw.match(/^\s*#{1,6}\s+(.*)$/);
    if (head) { if (!label) label = head[1].trim(); continue; }
    const li = raw.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (!li) continue;
    const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1;
    let text = li[2].trim();
    let anchor = '';
    const link = text.match(/^\[([\s\S]*)\]\(\s*#([A-Za-z0-9_-]+)\s*\)$/);
    if (link) {
      text = link[1].replace(/\\([[\]])/g, '$1');
      anchor = link[2];
    }
    const isL1 = depth <= 1;
    const indent = (depth - 1) * 1.6;
    // Word (MHT) ignores CSS class/child-combinator rules, so bold the top-level
    // entries via inline styles + <b>, which Word honors reliably.
    const escaped = escapeHtml(text || ' ');
    const inner = isL1 ? `<b>${escaped}</b>` : escaped;
    const title = anchor
      ? `<a href="#${anchor}"${isL1 ? ' style="font-weight:bold"' : ''}>${inner}</a>`
      : inner;
    const titleStyle = `padding-left:${indent}em${isL1 ? ';font-weight:bold' : ''}`;
    if (!withPageNo) {
      rows.push(`<tr class="toc-item${isL1 ? ' toc-l1' : ''}">`
        + `<td class="toc-c-title" colspan="3" style="${titleStyle}">${title}</td></tr>`);
      continue;
    }
    const n = (anchor && pageMap) ? pageMap[anchor] : undefined;
    const pg = n != null ? String(n) : '';
    rows.push(`<tr class="toc-item${isL1 ? ' toc-l1' : ''}">`
      + `<td class="toc-c-title" style="${titleStyle}">${title}</td>`
      + `<td class="toc-c-dots"></td>`
      + `<td class="toc-c-pg"${isL1 ? ' style="font-weight:bold;color:#111"' : ''}>${isL1 ? `<b>${pg}</b>` : pg}</td>`
      + `</tr>`);
  }
  if (!rows.length) return '';
  const heading = label ? `<h1 class="toc-title">${escapeHtml(label)}</h1>` : '';
  return `<div class="toc${extraClass ? ` ${extraClass}` : ''}${breakBefore ? ' pb' : ''}">${heading}`
    + `<table class="toc-table"><tbody>${rows.join('')}</tbody></table></div>`;
}


// ── Fitting wide code blocks / ASCII art to the page ──────
// The A4 content box, in CSS pixels at 96dpi: 210mm wide less the 16mm side
// margins the @page rule sets.
export const PAGE_CONTENT_PX = Math.round((210 - 32) * 96 / 25.4); // ≈ 673

// A fenced block must never be wrapped — that would break the box drawings in an
// ASCII diagram — so a wide one simply runs off the page. On screen
// `overflow-x:auto` gives it a scrollbar; paper has none. Shrinking the block's
// font until its widest line fits keeps the drawing intact and on the page.
const PRE_GLYPH_EM = 0.6;  // advance width of one monospace glyph, in em
const PRE_MIN_PX = 4;      // never shrink past this

// East Asian wide characters take two character cells — the Korean text inside
// these diagrams is what usually pushes them over the edge.
function isWideChar(cp) {
  return (cp >= 0x1100 && cp <= 0x115f)
    || (cp >= 0x2e80 && cp <= 0x303e)
    || (cp >= 0x3041 && cp <= 0x33ff)
    || (cp >= 0x3400 && cp <= 0x4dbf)
    || (cp >= 0x4e00 && cp <= 0x9fff)
    || (cp >= 0xa000 && cp <= 0xa4cf)
    || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xfe30 && cp <= 0xfe6f)
    || (cp >= 0xff00 && cp <= 0xff60)
    || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x20000 && cp <= 0x3fffd);
}

function displayWidth(line) {
  let w = 0;
  for (const ch of line) w += isWideChar(ch.codePointAt(0)) ? 2 : 1;
  return w;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// `basePx` is the block's normal rendered size; blocks that already fit are left
// untouched (this only ever shrinks).
function fitCodeBlocks(html, basePx) {
  const capacity = PAGE_CONTENT_PX / (PRE_GLYPH_EM * basePx);
  return html.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (whole, attrs, inner) => {
    const text = decodeEntities(inner.replace(/<[^>]*>/g, ''));
    let widest = 0;
    for (const line of text.split('\n')) widest = Math.max(widest, displayWidth(line));
    if (!widest || widest <= capacity) return whole;
    const px = Math.max(PRE_MIN_PX, PAGE_CONTENT_PX / (PRE_GLYPH_EM * widest));
    const rest = attrs.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    return `<pre${rest} style="font-size:${px.toFixed(2)}px;line-height:1.3">${inner}</pre>`;
  });
}

// Constrain content tables to the page width. CSS `table-layout:fixed` handles
// the PDF/HTML path, but Word (MHT) ignores class/`table-layout` CSS — it only
// honors inline styles, <col> widths and the `mso-table-layout-alt` property. So
// give every content table a <colgroup> of equal-width columns plus an inline
// fixed layout, which both Word and Chromium respect, so wide tables wrap to the
// page instead of overflowing the right margin.
function fitContentTables(html) {
  return html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi, (whole, attrs, inner) => {
    const firstRow = inner.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
    const n = firstRow ? (firstRow[1].match(/<(?:th|td)\b/gi) || []).length : 0;
    if (n < 1) return whole;
    const w = (100 / n).toFixed(3);
    const colgroup = `<colgroup>${`<col style="width:${w}%">`.repeat(n)}</colgroup>`;
    const fitStyle = 'table-layout:fixed;width:100%;max-width:100%;border-collapse:collapse;mso-table-layout-alt:fixed';
    const cleanAttrs = attrs.replace(/\sstyle="[^"]*"/i, '');
    // Insert zero-width break opportunities into long unbreakable tokens (paths,
    // URLs) in cell text so they wrap at the CHARACTER level. Word ignores CSS
    // word-break, but honors U+200B; the PDF/HTML break there too. Only text
    // between tags is touched (not attributes), and HTML entities stay intact.
    const broken = inner.replace(/>([^<]+)</g, (m, txt) => `>${breakLongTokens(txt)}<`);
    return `<table${cleanAttrs} style="${fitStyle}">${colgroup}${broken}</table>`;
  });
}

// Split runs of 15+ non-space characters with a zero-width space (U+200B) after
// each unit so long tokens can wrap anywhere. HTML entities (&amp;, &#8203; …)
// are treated as single units so they are never corrupted.
function breakLongTokens(text) {
  return text.replace(/\S{15,}/g, (run) => {
    const units = run.match(/&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);|[\s\S]/g) || [];
    return units.join('​');
  });
}

// Renders the document's own cover / contents / figure-index sections. Shared by
// the standalone export and the in-app preview so both lay the document out the
// same way.
//   pageMap     – baked page numbers, or null.
//   withNumbers – emit the page-number column at all. Exports always do (an
//                 empty cell is what the paged.js PDF pass fills in live); the
//                 preview never does, because it is not paginated.
function renderFrontMatter(doc, s, pageMap, withNumbers) {
  const cover = renderCoverHtml(doc.cover, {
    titleFont: s.coverTitleFont,
    titleSizePt: s.coverTitleSizePt,
    titleAlign: s.coverTitleAlign || 'center',
    metaAlign: s.coverMetaAlign || 'center',
  });
  const toc = renderIndexHtml(doc.toc, {
    withPageNo: withNumbers && s.tocPageNumbers !== false,
    breakBefore: !!cover,
    pageMap,
  });
  // The figure index follows the heading index on its own page. It exists only
  // when the document actually has one (buildFiguresMarkdown skips empty ones).
  const figIndex = renderIndexHtml(doc.figures, {
    withPageNo: withNumbers && s.figurePageNumbers !== false,
    breakBefore: !!(cover || toc),
    pageMap,
    extraClass: 'figure-index',
  });
  return { cover, toc, figIndex };
}

// Wraps a merged document into a standalone, styled HTML document (for export).
// The cover / contents / figure index come from the document's own front-matter
// sections, so whatever the user edited in the Edit tab is what gets exported.
export function toStandaloneHtml(markdown, title = 'Document', settings = {}) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings };
  const doc = splitDocument(markdown);
  const figureLabel = s.figureLabel || 'Figure';
  const family = fontStack(s.fontFamily);
  const size = Number(s.fontSizePt) || 10;
  // A <pre> renders at .88em of the body size (see the stylesheet below), in px.
  const preBasePx = size * (96 / 72) * 0.88;
  const body = fitCodeBlocks(fitContentTables(renderHtml(doc.body, {
    figureCaptions: !!doc.figures,
    figureLabel,
  })), preBasePx);
  const lineHeight = Number(s.lineHeight) > 0 ? Number(s.lineHeight) : 1;
  const { cover, toc, figIndex } = renderFrontMatter(doc, s, s.figurePageMap || s.tocPageMap || null, true);
  const pageCss = buildPageMarginCss(s, family, !!cover);
  const coverTitle = firstHeadingText(doc.cover) || (s.coverTitle && s.coverTitle.trim()) || title;
  const appName = s.appName || 'MyMarkDownMaker';
  const front = cover || toc || figIndex;
  // Content always starts on a fresh page when a cover or index precedes it.
  const content = `<div class="doc-content${front ? ' pb' : ''}">${body}</div>`;
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
  /* The font-size lives on the <pre> so fitCodeBlocks() can shrink a whole
     block (ASCII art) by overriding just that one value. */
  pre{background:#f5f5f5;padding:.8em 1em;border-radius:6px;overflow-x:auto;border:1px solid #e0e0e0;
      font-family:Consolas,monospace;font-size:.88em}
  pre code{background:none;padding:0;font-size:inherit;font-family:inherit}
  blockquote{border-left:4px solid #ccc;margin:0 0 1em;padding:.4em .9em;color:#555;background:#fafafa}
  /* Fixed layout + word wrapping so wide tables stay within the page instead of
     overflowing (and being clipped) off the right edge in the PDF. */
  table{border-collapse:collapse;width:100%;max-width:100%;table-layout:fixed;margin:1em 0}
  th,td{border:1px solid #ddd;padding:.4em .7em;text-align:left;word-wrap:break-word;overflow-wrap:anywhere}
  th{background:#f0f0f0;font-weight:600} tr:nth-child(even){background:#fafafa}
  hr{border:none;border-top:2px solid #e0e0e0;margin:1.4em 0}
  a{color:#0b8a76;text-decoration:none} img{max-width:100%;height:auto}
  /* Captioned figure: keep the picture and its "Figure N" label on one page. */
  figure.figure{margin:1.2em 0;text-align:center;page-break-inside:avoid;break-inside:avoid}
  figure.figure img{max-width:100%}
  figure.figure figcaption{margin-top:.5em;font-size:.9em;color:#555;text-align:center}
  /* Fixed em-based top offset (NOT vh: paged.js mis-resolves viewport units,
     which pushed the cover onto a 2nd blank page before the index). */
  .cover{text-align:center;padding-top:15em}
  .cover-title{font-size:2.7em;border:none;margin:0 0 .4em;padding:0}
  .cover-sub{font-size:1.2em;color:#555;margin-bottom:1.5em}
  .cover-meta{margin-top:2.5em;color:#555;font-size:1.05em;line-height:1.9}
  .pb{page-break-before:always;break-before:page}
  .toc-title{border-bottom:2px solid #e0e0e0;padding-bottom:.2em}
  .toc-table{width:100%;border-collapse:collapse;table-layout:auto;margin:.6em 0 0}
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
  /* Figure entries stay on one line, exactly like the heading entries. Letting
     them wrap collapses the title cell against the full-width spacer next to it,
     which stacks the text one character per line. */
  ${coverScreen}
  ${pageCss}
</style>
</head><body>
${cover}${toc ? (cover ? wb : '') + toc : ''}${figIndex ? ((cover || toc) ? wb : '') + figIndex : ''}${front ? wb : ''}${content}
</body></html>`;
}


// The in-app preview: the same cover / contents / figure index / body the export
// lays out, as an HTML fragment the app's own stylesheet skins (no standalone
// document wrapper). Index entries carry no page numbers — the preview is not
// paginated — but their anchors still work, so clicking an entry jumps to it.
export function renderPreviewHtml(markdown, settings = {}) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings };
  const doc = splitDocument(markdown);
  const { cover, toc, figIndex } = renderFrontMatter(doc, s, null);
  const body = renderHtml(doc.body, {
    figureCaptions: !!doc.figures,
    figureLabel: s.figureLabel || 'Figure',
  });
  return [cover, toc, figIndex, `<div class="doc-content">${body}</div>`]
    .filter(Boolean).join('\n');
}

// Markdown export. The document already carries its cover / contents / figure
// index as Markdown, so this only has to put the real image data back — the
// section markers are HTML comments, invisible in any Markdown renderer, and
// they let the file be read back into the app unchanged.
export function buildMergedMarkdownDocument(markdown) {
  let out = expandImageRefs(String(markdown || '').trimEnd());
  // A resized image becomes an <img width> tag: Markdown has no size syntax, but
  // every common renderer honours inline HTML, so the size survives the export.
  out = out.replace(/!\[([^\]]*)\]\(\s*<?([^)\s"<>]+)>?\s*"([^"]*)"\s*\)/g, (whole, alt, src, title) => {
    const pct = sizeFromTitle(title);
    return pct ? `<img src="${src}" alt="${escapeHtml(alt)}" width="${pct}%">` : whole;
  });
  return out ? out + '\n' : '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function cssString(text) {
  return '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
