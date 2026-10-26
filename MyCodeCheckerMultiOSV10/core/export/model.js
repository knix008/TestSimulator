'use strict';

// Document model shared by the docx / xlsx / pdf / html / csv writers.
//
//   {
//     title, subtitle, lang?,
//     meta:   [[key, value]],
//     blocks: [
//       { type: 'h1' | 'h2' | 'h3', text },
//       { type: 'p', text, small? },
//       { type: 'table', columns: [..], rows: [[..]], widths?: [relative], align?: ['left'|'right'] },
//       { type: 'kv', rows: [[key, value]] },
//       { type: 'pagebreak' },
//       { type: 'list', items: [..] },
//       { type: 'badge', text, color },
//     ],
//   }
//
// fromHtml(html) turns the HTML that core/platform/reports.js produces into this
// model without a DOM library. It is tolerant: unknown tags are walked through,
// unclosed cells / rows / items are closed implicitly, scripts, styles and SVG
// charts are dropped.

const BLOCK_TYPES = new Set(['h1', 'h2', 'h3', 'p', 'table', 'kv', 'pagebreak', 'list', 'badge']);

// ---------------------------------------------------------------------------
// Text helpers

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–',
  hellip: '…', le: '≤', ge: '≥', times: '×', copy: '©', reg: '®', trade: '™', laquo: '«',
  raquo: '»', bull: '•', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', rarr: '→', larr: '←',
  uarr: '↑', darr: '↓', deg: '°', plusmn: '±', sect: '§', para: '¶', euro: '€', yen: '¥',
  pound: '£', cent: '¢', ne: '≠', minus: '−', check: '✓', shy: '',
};

/** Decode HTML character references (named, decimal, hex). Unknown names stay as written. */
function decodeEntities(s) {
  return String(s == null ? '' : s).replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (all, ref) => {
    if (ref[0] === '#') {
      const cp = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
      return String.fromCodePoint(cp);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, ref) ? NAMED[ref] : all;
  });
}

/** True for code points that take two columns (Hangul, CJK, full-width forms). */
function isWide(cp) {
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff)
    || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa960 && cp <= 0xa97f)
    || (cp >= 0xac00 && cp <= 0xd7ff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f)
    || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x20000 && cp <= 0x3fffd);
}

/** Display width in "columns": East Asian wide characters count as 2. */
function displayWidth(s) {
  let w = 0;
  for (const ch of String(s == null ? '' : s)) w += isWide(ch.codePointAt(0)) ? 2 : 1;
  return w;
}

function hasHangul(s) { return /[ᄀ-ᇿ㄰-㆏가-힯]/.test(String(s || '')); }

/** Cell value as display text. */
function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object' && v.text != null) return String(v.text);
  return String(v);
}

const NUMERIC = /^-?(0|[1-9][0-9]{0,14})(\.[0-9]{1,10})?$/;
/** Number for a cell that should be stored as a number, else null. Leading zeros keep a value textual. */
function numericValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUMERIC.test(v.trim())) return Number(v.trim());
  return null;
}

/** Relative column weights estimated from content (header and cells, wide chars = 2). */
function columnWeights(table, opts = {}) {
  const n = tableWidth(table);
  if (Array.isArray(table.widths) && table.widths.length >= n && table.widths.slice(0, n).every((w) => Number(w) > 0)) {
    return table.widths.slice(0, n).map(Number);
  }
  const max = opts.max || 60;
  const min = opts.min || 4;
  const out = new Array(n).fill(min);
  const rows = [table.columns || [], ...(table.rows || [])];
  for (const r of rows) {
    for (let c = 0; c < n; c++) {
      const text = cellText(r[c]);
      let widest = 0;
      for (const line of text.split('\n')) widest = Math.max(widest, displayWidth(line));
      out[c] = Math.max(out[c], Math.min(max, widest + 1));
    }
  }
  return out;
}

function tableWidth(table) {
  let n = (table.columns || []).length;
  for (const r of table.rows || []) n = Math.max(n, r.length);
  return Math.max(n, 1);
}

/** Right-align columns that are marked or whose non-empty data cells are all numbers. */
function columnAlign(table) {
  const n = tableWidth(table);
  const out = [];
  for (let c = 0; c < n; c++) {
    if (Array.isArray(table.align) && table.align[c]) { out.push(table.align[c] === 'right' ? 'right' : table.align[c] === 'center' ? 'center' : 'left'); continue; }
    let nums = 0; let other = 0;
    for (const r of table.rows || []) {
      const v = r[c];
      if (v == null || cellText(v) === '' || cellText(v) === '—') continue;
      if (numericValue(v) != null) nums++; else other++;
    }
    out.push(nums > 0 && other === 0 ? 'right' : 'left');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Model normalization

/** Return a clean copy of a model: strings everywhere, unknown blocks dropped. */
function normalize(model) {
  const m = model || {};
  const str = (v) => (v == null ? '' : String(v));
  const out = {
    title: str(m.title),
    subtitle: str(m.subtitle),
    lang: m.lang === 'ko' || m.lang === 'en' ? m.lang : undefined,
    meta: (Array.isArray(m.meta) ? m.meta : []).filter(Array.isArray).map((kv) => [str(kv[0]), str(kv[1])]),
    blocks: [],
  };
  for (const b of Array.isArray(m.blocks) ? m.blocks : []) {
    if (!b || !BLOCK_TYPES.has(b.type)) continue;
    switch (b.type) {
      case 'h1': case 'h2': case 'h3': out.blocks.push({ type: b.type, text: str(b.text) }); break;
      case 'p': out.blocks.push({ type: 'p', text: str(b.text), ...(b.small ? { small: true } : {}) }); break;
      case 'table': {
        const t = { type: 'table', columns: (b.columns || []).map((c) => cellText(c)), rows: (b.rows || []).filter(Array.isArray).map((r) => r.map((c) => (typeof c === 'number' ? c : cellText(c)))) };
        if (Array.isArray(b.widths)) t.widths = b.widths.map(Number);
        if (Array.isArray(b.align)) t.align = b.align.slice();
        if (b.caption) t.caption = str(b.caption);
        out.blocks.push(t);
        break;
      }
      case 'kv': out.blocks.push({ type: 'kv', rows: (b.rows || []).filter(Array.isArray).map((r) => [cellText(r[0]), cellText(r[1])]) }); break;
      case 'list': out.blocks.push({ type: 'list', items: (b.items || []).map((i) => cellText(i)) }); break;
      case 'badge': out.blocks.push({ type: 'badge', text: str(b.text), color: normColor(b.color) || '#546e7a' }); break;
      default: out.blocks.push({ type: 'pagebreak' });
    }
  }
  return out;
}

/** Language of a model: explicit, else Korean when the visible text has Hangul. */
function detectLang(model, opts = {}) {
  if (opts.lang === 'ko' || opts.lang === 'en') return opts.lang;
  if (model && (model.lang === 'ko' || model.lang === 'en')) return model.lang;
  if (!model) return 'en';
  if (hasHangul(model.title) || hasHangul(model.subtitle)) return 'ko';
  for (const b of model.blocks || []) if (/^h[123]$/.test(b.type) && hasHangul(b.text)) return 'ko';
  return 'en';
}

const CSS_COLORS = { 'var(--ok)': '#2e7d32', 'var(--bad)': '#c62828', 'var(--accent)': '#1565c0', 'var(--muted)': '#5b6876' };
/** '#rgb' / '#rrggbb' / 'var(--ok)' / 'rgb(r,g,b)' -> '#rrggbb' or ''. */
function normColor(c) {
  if (!c) return '';
  const s = String(c).trim().toLowerCase();
  if (CSS_COLORS[s]) return CSS_COLORS[s];
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return `#${m[1]}`;
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`;
  const named = { red: '#c62828', green: '#2e7d32', blue: '#1565c0', orange: '#ef6c00', gray: '#78909c', grey: '#78909c', black: '#000000', white: '#ffffff' };
  return named[s] || '';
}

// ---------------------------------------------------------------------------
// HTML -> tree (tolerant)

const VOID = new Set(['br', 'meta', 'img', 'hr', 'input', 'link', 'col', 'base', 'area', 'source', 'wbr']);
const SKIP = new Set(['script', 'style', 'svg', 'head', 'template', 'noscript', 'object', 'canvas', 'math']);
const INLINE = new Set(['span', 'strong', 'b', 'em', 'i', 'a', 'code', 'small', 'u', 'sub', 'sup', 'mark', 'abbr', 'kbd', 'samp', 'var', 'time', 'label', 'font', 'big', 's', 'del', 'ins', 'q', 'cite', 'br']);

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(src))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '');
  return attrs;
}

function el(tag, attrs, parent) { return { tag, attrs: attrs || {}, children: [], parent }; }

/** Parse HTML into a light element tree. Never throws on malformed input. */
function parseHtml(html) {
  const root = el('#root', {}, null);
  let cur = root;
  let title = '';
  const src = String(html == null ? '' : html);
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  let m;
  const closeTo = (names) => {
    for (let n = cur; n && n !== root; n = n.parent) {
      if (names.includes(n.tag)) { cur = n.parent; return true; }
    }
    return false;
  };
  const within = (names, stopAt) => {
    for (let n = cur; n && n !== root; n = n.parent) {
      if (names.includes(n.tag)) return n;
      if (stopAt && stopAt.includes(n.tag)) return null;
    }
    return null;
  };
  while ((m = re.exec(src))) {
    if (m[4] != null) { cur.children.push({ text: decodeEntities(m[4]) }); continue; }
    if (m[2] == null) { if (m[0] === '<') cur.children.push({ text: '<' }); continue; }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (!closing && SKIP.has(tag)) {
      // Skip until the matching close tag; keep <title> text from <head>.
      const endRe = new RegExp(`</${tag}\\s*>`, 'ig');
      endRe.lastIndex = re.lastIndex;
      const end = endRe.exec(src);
      const inner = src.slice(re.lastIndex, end ? end.index : src.length);
      if (tag === 'head') {
        const t = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(inner);
        if (t) title = decodeEntities(t[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
      }
      re.lastIndex = end ? end.index + end[0].length : src.length;
      continue;
    }
    if (tag === 'title') {
      const end = /<\/title\s*>/ig; end.lastIndex = re.lastIndex;
      const e = end.exec(src);
      if (!title) title = decodeEntities(src.slice(re.lastIndex, e ? e.index : src.length).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
      re.lastIndex = e ? e.index + e[0].length : src.length;
      continue;
    }
    if (closing) {
      if (tag === 'br') { cur.children.push(el('br', {}, cur)); continue; }
      closeTo([tag]);
      continue;
    }
    // Implicit closes.
    if (tag === 'td' || tag === 'th') closeTo(within(['td', 'th'], ['table', 'tr']) ? ['td', 'th'] : []);
    else if (tag === 'tr') { if (within(['tr'], ['table'])) closeTo(['tr']); }
    else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') { if (within(['thead', 'tbody', 'tfoot'], ['table'])) closeTo(['thead', 'tbody', 'tfoot']); }
    else if (tag === 'li') { if (within(['li'], ['ul', 'ol'])) closeTo(['li']); }
    else if (tag === 'p' || /^h[1-6]$/.test(tag) || tag === 'table' || tag === 'ul' || tag === 'ol' || tag === 'div') { if (cur.tag === 'p') cur = cur.parent; }
    const node = el(tag, parseAttrs(m[3] || ''), cur);
    cur.children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3] || '')) cur = node;
  }
  return { root, title };
}

// ---------------------------------------------------------------------------
// Tree -> model

function classes(node) { return new Set(String((node.attrs && node.attrs.class) || '').split(/\s+/).filter(Boolean)); }

function styleProp(node, prop) {
  const st = String((node.attrs && node.attrs.style) || '');
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = re.exec(st);
  return m ? m[1].trim() : '';
}

/** Visible text of a node (br -> newline, block children separated by spaces, whitespace collapsed). */
function textOf(node) {
  let out = '';
  const walk = (n) => {
    if (n.text != null) { out += n.text; return; }
    if (SKIP.has(n.tag)) return;
    if (n.tag === 'br') { out += '\u0000'; return; }
    const block = !INLINE.has(n.tag);
    if (block && out && !/\s$/.test(out)) out += ' ';
    for (const c of n.children) walk(c);
    if (block && out && !/\s$/.test(out)) out += ' ';
  };
  walk(node);
  return out.replace(/[\s ]+/g, ' ').replace(/ ?\u0000 ?/g, '\n').trim();
}

function findAll(node, pred, out = []) {
  for (const c of node.children || []) {
    if (c.text != null) continue;
    if (pred(c)) out.push(c);
    else findAll(c, pred, out);
  }
  return out;
}

function tableBlock(node) {
  const rows = [];
  const visit = (n, section) => {
    for (const c of n.children) {
      if (c.text != null) continue;
      if (c.tag === 'table') continue; // nested tables: flattened by their text in the cell
      if (c.tag === 'thead' || c.tag === 'tbody' || c.tag === 'tfoot') visit(c, c.tag);
      else if (c.tag === 'tr') {
        const cells = c.children.filter((x) => x.tag === 'td' || x.tag === 'th');
        rows.push({ section, header: cells.length > 0 && cells.every((x) => x.tag === 'th'), cells });
      } else if (c.tag === 'caption') { /* handled below */ } else visit(c, section);
    }
  };
  visit(node, null);
  let columns = [];
  let align = [];
  let start = 0;
  const headIdx = rows.findIndex((r) => r.section === 'thead' || r.header);
  if (headIdx === 0 || (headIdx > 0 && rows.slice(0, headIdx).every((r) => r.section === 'thead'))) {
    const head = rows[headIdx];
    for (const c of head.cells) {
      const span = Math.max(1, Math.min(50, parseInt(c.attrs.colspan, 10) || 1));
      for (let k = 0; k < span; k++) {
        columns.push(k ? '' : textOf(c));
        align.push(classes(c).has('n') || /right/i.test(styleProp(c, 'text-align') || c.attrs.align || '') ? 'right' : 'left');
      }
    }
    start = headIdx + 1;
  }
  const n = columns.length;
  const data = [];
  for (const r of rows.slice(start)) {
    if (r.section === 'thead' && n) continue;
    const out = [];
    for (const c of r.cells) {
      const span = Math.max(1, Math.min(50, parseInt(c.attrs.colspan, 10) || 1));
      out.push(textOf(c));
      for (let k = 1; k < span; k++) out.push('');
    }
    // The placeholder row reports.js prints for an empty table: one '—' cell spanning all columns.
    if (r.cells.length === 1 && n > 1 && (parseInt(r.cells[0].attrs.colspan, 10) || 1) >= n && /^[—-]?$/.test(out[0])) continue;
    data.push(out);
  }
  if (!n && data.length) { const w = Math.max(...data.map((r) => r.length)); columns = new Array(w).fill(''); align = new Array(w).fill('left'); }
  const caption = node.children.find((c) => c.tag === 'caption');
  const block = { type: 'table', columns, rows: data };
  if (align.some((a) => a === 'right')) {
    // Only keep explicit right alignment from class="n"; other columns fall back to detection.
    block.align = align.map((a) => (a === 'right' ? 'right' : 'left'));
  }
  if (caption) block.caption = textOf(caption);
  return block;
}

function listBlock(node) {
  return { type: 'list', items: node.children.filter((c) => c.tag === 'li').map((li) => textOf(li)).filter((s) => s !== '') };
}

function kvFromGrid(node) {
  const rows = [];
  for (const card of findAll(node, (c) => classes(c).has('card'))) {
    const k = findAll(card, (c) => classes(c).has('k'))[0];
    const v = findAll(card, (c) => classes(c).has('v'))[0];
    if (k || v) rows.push([k ? textOf(k) : '', v ? textOf(v) : '']);
    else rows.push(['', textOf(card)]);
  }
  return rows;
}

function parseMeta(text) {
  const meta = [];
  for (const part of text.split(/\s*[·|]\s*/)) {
    const s = part.trim();
    if (!s) continue;
    const i = s.indexOf(':');
    if (i > 0) meta.push([s.slice(0, i).trim(), s.slice(i + 1).trim()]);
    else meta.push(['', s]);
  }
  return meta;
}

/**
 * Convert report HTML into the document model.
 * @param {string} html
 * @returns {{title:string, subtitle:string, lang?:string, meta:string[][], blocks:object[]}}
 */
function fromHtml(html) {
  const { root, title } = parseHtml(html);
  const model = { title: '', subtitle: '', meta: [], blocks: [] };
  const htmlEl = findAll(root, (c) => c.tag === 'html')[0];
  if (htmlEl && /^(ko|en)/i.test(htmlEl.attrs.lang || '')) model.lang = htmlEl.attrs.lang.slice(0, 2).toLowerCase();
  let inline = [];
  const flush = () => {
    if (!inline.length) return;
    const holder = { tag: 'span', attrs: {}, children: inline };
    inline = [];
    const t = textOf(holder);
    if (t) model.blocks.push({ type: 'p', text: t });
  };
  const push = (b) => { flush(); model.blocks.push(b); };
  const walk = (node) => {
    for (const c of node.children) {
      if (c.text != null) { inline.push(c); continue; }
      const tag = c.tag;
      if (SKIP.has(tag)) continue;
      const cls = classes(c);
      if (/^h[1-6]$/.test(tag)) {
        const t = textOf(c);
        const level = Math.min(3, Number(tag[1]));
        if (level === 1 && !model.title && !model.blocks.length) { flush(); model.title = t; continue; }
        if (t) push({ type: `h${level}`, text: t });
        continue;
      }
      if (tag === 'table') { push(tableBlock(c)); continue; }
      if (tag === 'ul' || tag === 'ol') { const b = listBlock(c); if (b.items.length) push(b); continue; }
      if (tag === 'hr') { flush(); continue; }
      if (tag === 'div' && cls.has('meta') && !model.meta.length && !model.blocks.filter((b) => b.type !== 'p').length) {
        flush();
        model.meta = parseMeta(textOf(c));
        continue;
      }
      if (cls.has('grid') || cls.has('card')) { const rows = kvFromGrid(cls.has('card') ? { children: [c] } : c); if (rows.length) push({ type: 'kv', rows }); continue; }
      if (cls.has('verdict') || (cls.has('badge') && !INLINE.has(tag))) {
        push({ type: 'badge', text: textOf(c), color: normColor(styleProp(c, 'background-color') || styleProp(c, 'background')) || (cls.has('bad') ? '#c62828' : cls.has('ok') ? '#2e7d32' : '#546e7a') });
        continue;
      }
      if (cls.has('pagebreak') || /always|page/i.test(styleProp(c, 'page-break-before') || styleProp(c, 'break-before'))) { push({ type: 'pagebreak' }); continue; }
      if (tag === 'p' || tag === 'pre' || tag === 'blockquote') {
        flush();
        const t = tag === 'pre' ? decodePre(c) : textOf(c);
        if (t) model.blocks.push({ type: 'p', text: t, ...(cls.has('small') ? { small: true } : {}) });
        continue;
      }
      if (INLINE.has(tag)) { inline.push(c); continue; }
      // Generic container: a div with only inline content becomes a paragraph.
      const onlyInline = c.children.every((x) => x.text != null || INLINE.has(x.tag));
      if (onlyInline) {
        flush();
        const t = textOf(c);
        if (t) model.blocks.push({ type: 'p', text: t, ...(cls.has('small') ? { small: true } : {}) });
        continue;
      }
      flush();
      walk(c);
      flush();
    }
  };
  walk(root);
  flush();
  if (!model.title) model.title = title;
  return model;
}

function decodePre(node) {
  let out = '';
  const walk = (n) => { if (n.text != null) out += n.text; else if (n.tag === 'br') out += '\n'; else n.children.forEach(walk); };
  walk(node);
  return out.replace(/^\n|\n$/g, '');
}

// ---------------------------------------------------------------------------
// Simple model -> HTML / CSV (used by index.js for the 'html' and 'csv' formats)

function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function toHtml(model) {
  const m = normalize(model);
  const lang = detectLang(m);
  const nl = (s) => escHtml(s).replace(/\n/g, '<br>');
  const parts = [];
  for (const b of m.blocks) {
    if (/^h[123]$/.test(b.type)) parts.push(`<${b.type}>${nl(b.text)}</${b.type}>`);
    else if (b.type === 'p') parts.push(`<p${b.small ? ' class="small"' : ''}>${nl(b.text)}</p>`);
    else if (b.type === 'list') parts.push(`<ul>${b.items.map((i) => `<li>${nl(i)}</li>`).join('')}</ul>`);
    else if (b.type === 'badge') parts.push(`<div class="verdict" style="background:${b.color}">${nl(b.text)}</div>`);
    else if (b.type === 'pagebreak') parts.push('<div class="pagebreak"></div>');
    else if (b.type === 'kv') parts.push(`<table class="kv"><tbody>${b.rows.map((r) => `<tr><th>${nl(r[0])}</th><td>${nl(r[1])}</td></tr>`).join('')}</tbody></table>`);
    else if (b.type === 'table') {
      const al = columnAlign(b);
      const cls = (i) => (al[i] === 'right' ? ' class="n"' : '');
      parts.push(`<table>${b.caption ? `<caption>${nl(b.caption)}</caption>` : ''}<thead><tr>${b.columns.map((c, i) => `<th${cls(i)}>${nl(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${nl(cellText(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    }
  }
  const meta = m.meta.length ? `<div class="meta">${m.meta.map(([k, v]) => (k ? `${escHtml(k)}: <strong>${escHtml(v)}</strong>` : escHtml(v))).join(' · ')}</div>` : '';
  const css = 'body{font-family:"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;margin:24px;color:#1c2530;font-size:13px;line-height:1.45}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;border-bottom:2px solid #d3dae3;padding-bottom:4px}h3{font-size:14px}.meta,.small{color:#5b6876}table{border-collapse:collapse;width:100%;margin:6px 0 12px}td,th{border:1px solid #d3dae3;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef1f5}.n{text-align:right}.verdict{display:inline-block;color:#fff;font-weight:700;padding:6px 12px;border-radius:6px}.pagebreak{break-after:page}@page{size:A4;margin:14mm}';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escHtml(m.title)}</title><style>${css}</style></head><body>${m.title ? `<h1>${escHtml(m.title)}</h1>` : ''}${m.subtitle ? `<p>${escHtml(m.subtitle)}</p>` : ''}${meta}${parts.join('\n')}</body></html>`;
}

/** Same quoting as core/platform/util.js: always quoted, formula-like cells prefixed with '. */
function csvCell(v) {
  let s = cellText(v);
  if (/^[=+\-@]/.test(s) && numericValue(v) == null) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV of every table (and kv) block, separated by a blank line and a title row. UTF-8 BOM, CRLF. */
function toCsv(model) {
  const m = normalize(model);
  const out = [];
  let heading = '';
  for (const b of m.blocks) {
    if (/^h[123]$/.test(b.type)) heading = b.text;
    if (b.type !== 'table' && b.type !== 'kv') continue;
    if (out.length) out.push('');
    if (heading) out.push(csvCell(heading));
    if (b.type === 'table') {
      if (b.columns.some((c) => c !== '')) out.push(b.columns.map(csvCell).join(','));
      for (const r of b.rows) out.push(r.map(csvCell).join(','));
    } else for (const r of b.rows) out.push(r.map(csvCell).join(','));
  }
  return `﻿${out.join('\r\n')}\r\n`;
}

module.exports = {
  BLOCK_TYPES: [...BLOCK_TYPES], normalize, fromHtml, parseHtml, decodeEntities, displayWidth, isWide, hasHangul,
  cellText, numericValue, columnWeights, columnAlign, tableWidth, detectLang, normColor, toHtml, toCsv,
};
