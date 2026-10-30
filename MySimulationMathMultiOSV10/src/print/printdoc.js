// The print document, pure (no DOM, no host): page setup, sheet geometry,
// page ranges and buildPrintHtml. test/print.test.mjs loads it in Node.
//
// The setup becomes the document's own CSS: @page { size: <sheet>; margin: 0 }
// and sheets / pages of exactly the paper size with the margins inside them
// (paginate.js lays the content out into those pages). So the preview, the
// PDF, the printer and the browser all get the very same pages; the print
// APIs are told the paper size with margins 0 and scale 1, never anything
// that would override the document.

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -- Page setup --
// Paper sizes in mm, portrait. B4 / B5 are the JIS sizes (Korean / Japanese offices).
export const PAPERS = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [257, 364], B5: [182, 257],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6],
};
export const PAPER_NAMES = [...Object.keys(PAPERS), 'custom'];
export const MARGIN_PRESETS = { none: 0, narrow: 8, normal: 15, wide: 25 }; // mm, every side
export const NUP_CHOICES = [1, 2, 4, 6, 9, 16];
// 그림 여백: white space around a figure / diagram / scope image inside the page margins (mm, every side)
export const IMAGE_PADS = { none: 0, small: 4, normal: 10, large: 18 };
export const FONT_RANGE = [6, 24];
export const SCALE_RANGE = [10, 400];

export const PRINT_DEFAULTS = {
  printer: '',
  paper: 'A4', customW: 210, customH: 297,
  landscape: false,
  margin: 'normal', margins: { top: 15, right: 15, bottom: 15, left: 15 },
  scaleMode: 'fit', scale: 100,
  nup: 1,
  fontSize: 10, lineNumbers: true, wrap: true, syntax: true,
  header: true, headerText: '', date: true, pageNumbers: true,
  color: true, backgrounds: true, lighten: true,
  imagePad: 'normal', scopes: true,
  copies: 1, collate: true, duplex: 'none',
};

const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

/** The setup as it is used: known paper, margins in mm per side, ranges clamped. */
export function normalizeSetup(setup) {
  const s = { ...PRINT_DEFAULTS, ...(setup || {}) };
  if (!PAPERS[s.paper] && s.paper !== 'custom') s.paper = 'A4';
  s.customW = Math.round(num(s.customW, 50, 1200, 210));
  s.customH = Math.round(num(s.customH, 50, 1200, 297));
  s.landscape = !!s.landscape;
  if (s.margin !== 'custom' && !(s.margin in MARGIN_PRESETS)) s.margin = 'normal';
  const m = s.margin === 'custom' ? { ...PRINT_DEFAULTS.margins, ...(s.margins || {}) } : null;
  const p = s.margin === 'custom' ? null : MARGIN_PRESETS[s.margin];
  s.margins = {};
  for (const k of ['top', 'right', 'bottom', 'left']) s.margins[k] = m ? num(m[k], 0, 100, 15) : p;
  s.scaleMode = s.scaleMode === 'custom' ? 'custom' : 'fit';
  s.scale = Math.round(num(s.scale, SCALE_RANGE[0], SCALE_RANGE[1], 100));
  s.nup = NUP_CHOICES.includes(Number(s.nup)) ? Number(s.nup) : 1;
  s.fontSize = Math.round(num(s.fontSize, FONT_RANGE[0], FONT_RANGE[1], 10));
  for (const k of ['lineNumbers', 'wrap', 'syntax', 'header', 'date', 'pageNumbers', 'color', 'backgrounds', 'lighten', 'collate', 'scopes']) s[k] = s[k] !== false;
  if (!(s.imagePad in IMAGE_PADS)) s.imagePad = 'normal';
  s.headerText = String(s.headerText || '');
  s.copies = Math.round(num(s.copies, 1, 999, 1));
  s.duplex = s.duplex === 'long' || s.duplex === 'short' ? s.duplex : 'none';
  s.printer = String(s.printer || '');
  return s;
}

/** The paper in mm, portrait: [w, h]. */
export function paperSize(setup) {
  const s = normalizeSetup(setup);
  if (s.paper === 'custom') return [Math.min(s.customW, s.customH), Math.max(s.customW, s.customH)];
  return PAPERS[s.paper].slice();
}

/** The logical page (orientation applied): [w, h] mm. */
export function pageSize(setup) {
  const s = normalizeSetup(setup);
  const [w, h] = paperSize(s);
  return s.landscape ? [h, w] : [w, h];
}

// Header / footer band: 5 mm tall, 2 mm from the content, at least 3 mm from the paper edge.
const BAND = 5;
const GAP = 2;
const EDGE = 3;

/**
 * Where things go on a page (mm): the page size, the content box (margins,
 * pushed in when a small margin leaves no room for the header / footer) and
 * the header / footer bands.
 */
export function pageGeometry(setup) {
  const s = normalizeSetup(setup);
  const [pw, ph] = pageSize(s);
  const m = s.margins;
  const head = s.header || s.date;
  const foot = s.pageNumbers;
  const top = head ? Math.max(m.top, EDGE + BAND + GAP) : m.top;
  const bottom = foot ? Math.max(m.bottom, EDGE + BAND + GAP) : m.bottom;
  const cw = Math.max(10, pw - m.left - m.right);
  const ch = Math.max(10, ph - top - bottom);
  return {
    pw, ph, left: m.left, right: m.right, top, bottom, cw, ch,
    head: head ? { top: Math.max(EDGE, top - GAP - BAND), h: BAND } : null,
    foot: foot ? { bottom: Math.max(EDGE, bottom - GAP - BAND), h: BAND } : null,
  };
}

/**
 * Pages per sheet: the sheet (mm), the grid and the page scale. 2 and 6 pages
 * per sheet turn the sheet (portrait pages side by side on a landscape sheet).
 */
export function nupLayout(setup) {
  const s = normalizeSetup(setup);
  const [pw, ph] = pageSize(s);
  const n = s.nup;
  const turn = n === 2 || n === 6;
  const sw = turn ? ph : pw;
  const sh = turn ? pw : ph;
  const grid = { 1: [1, 1], 2: [2, 1], 4: [2, 2], 6: [3, 2], 9: [3, 3], 16: [4, 4] }[n];
  let [cols, rows] = grid;
  if (turn && sw < sh) [cols, rows] = [rows, cols];
  const scale = n === 1 ? 1 : Math.min(sw / cols / pw, sh / rows / ph);
  return { n, sheetW: sw, sheetH: sh, cols, rows, scale, cellW: sw / cols, cellH: sh / rows };
}

/**
 * "1-3, 5, 8-" -> [1, 2, 3, 5, 8, 9, 10] (1-based, sorted, unique, within
 * `total` when given). null for an empty or unusable string.
 */
export function parsePageRanges(text, total) {
  const set = new Set();
  const parts = String(text || '').split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) return null;
  const max = Number(total) > 0 ? Number(total) : Infinity;
  for (const part of parts) {
    const m = /^(\d+)?(-|~)?(\d+)?$/.exec(part);
    if (!m || (!m[1] && !m[3])) return null;
    const from = m[1] ? Number(m[1]) : 1;
    const to = m[2] ? (m[3] ? Number(m[3]) : max) : from;
    if (from < 1 || to < from) return null;
    if (!Number.isFinite(to) && !Number.isFinite(max)) { set.add(from); continue; }
    for (let p = from; p <= Math.min(to, max); p++) set.add(p);
  }
  const out = [...set].sort((a, b) => a - b);
  return out.length ? out : null;
}

/** Text runs [{ t, c? }] -> lines, each a list of runs (newlines split the runs). */
export function runsToLines(runs) {
  const lines = [[]];
  for (const r of runs || []) {
    const parts = String(r.t == null ? '' : r.t).replace(/\r\n?/g, '\n').split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push(r.c ? { t: p, c: r.c } : { t: p });
    });
  }
  return lines;
}

/** "YYYY-MM-DD HH:mm" of a Date. */
export function dateText(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const FONT_SANS = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", Roboto, Helvetica, Arial, sans-serif';
const FONT_MONO = '"Cascadia Mono", Consolas, "D2Coding", Menlo, "DejaVu Sans Mono", "Malgun Gothic", monospace';

/** <head> and <body> of an HTML string (a fragment is all body). */
export function splitHtml(html) {
  const s = String(html || '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(s);
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(s);
  if (!head && !body) return { head: '', body: s.replace(/<!doctype[^>]*>/i, '').replace(/<\/?html\b[^>]*>/gi, '') };
  const headInner = head ? head[1].replace(/<title\b[\s\S]*?<\/title\s*>/i, '').replace(/<meta\b[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '') : '';
  return { head: headInner, body: body ? body[1] : s.slice(head ? head.index + head[0].length : 0) };
}

/** The page CSS (sheets, pages, header / footer) for a setup. */
export function pageCss(setup) {
  const s = normalizeSetup(setup);
  const g = pageGeometry(s);
  const L = nupLayout(s);
  const mm = (v) => `${Math.round(v * 1000) / 1000}mm`;
  return `
  @page { size: ${mm(L.sheetW)} ${mm(L.sheetH)}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${FONT_SANS}; font-size: ${s.fontSize}pt; line-height: 1.4; }
  .msp-sheet { position: relative; width: ${mm(L.sheetW)}; height: ${mm(L.sheetH)}; overflow: hidden; background: #fff; break-after: page; page-break-after: always; break-inside: avoid; }
  .msp-sheet:last-child { break-after: auto; page-break-after: auto; }
  .msp-page { position: absolute; left: 0; top: 0; width: ${mm(g.pw)}; height: ${mm(g.ph)}; overflow: hidden; background: #fff; transform-origin: 0 0; }
  .msp-nup .msp-page { outline: 0.2mm solid #bbb; }
  .msp-body { position: absolute; left: ${mm(g.left)}; top: ${mm(g.top)}; width: ${mm(g.cw)}; height: ${mm(g.ch)}; overflow: hidden; }
  .msp-zoom { display: flow-root; }
  .msp-head, .msp-foot { position: absolute; left: ${mm(g.left)}; right: ${mm(g.right)}; display: flex; justify-content: space-between; align-items: flex-end; gap: 4mm; font: 8pt/1.2 ${FONT_SANS}; color: #444; white-space: nowrap; overflow: hidden; }
  .msp-head { top: ${mm(g.head ? g.head.top : 0)}; height: ${mm(BAND)}; border-bottom: 0.2mm solid #999; padding-bottom: 0.6mm; box-sizing: border-box; }
  .msp-foot { bottom: ${mm(g.foot ? g.foot.bottom : 0)}; height: ${mm(BAND)}; justify-content: center; align-items: flex-start; padding-top: 0.6mm; box-sizing: border-box; }
  .msp-head .msp-title { overflow: hidden; text-overflow: ellipsis; }
  .msp-gray .msp-sheet { filter: grayscale(1); }
  .msp-nobg .msp-body * { background: transparent !important; background-image: none !important; }
  .msp-staging { position: absolute; left: 0; top: 0; }
  @media screen {
    html, body { background: transparent; }
    .msp-sheet { margin: 0 auto 12px; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
    .msp-sheet:last-child { margin-bottom: 2px; }
  }`;
}

/** The content CSS (code, text, tables, images) for a setup. */
export function contentCss(setup) {
  const s = normalizeSetup(setup);
  const g = pageGeometry(s);
  const IMAGE_PAD = IMAGE_PADS[s.imagePad];
  return `
  .msp-code { font-family: ${FONT_MONO}; font-size: ${s.fontSize}pt; line-height: 1.35; }
  .msp-code .l { display: flex; align-items: flex-start; }
  .msp-code .n { flex: 0 0 auto; min-width: var(--msp-ln, 3ch); padding-right: 1.4ch; text-align: right; color: #888; user-select: none; }
  .msp-code .t { flex: 1 1 auto; min-width: 0; white-space: pre; }
  .msp-code.wrap .t { white-space: pre-wrap; overflow-wrap: anywhere; }
  .msp-code.nowrap { width: max-content; min-width: 100%; }
  .msp-code .t:empty::after { content: "\\200b"; }
  .tk-k { color: #0033b3; font-weight: 600; } .tk-f { color: #00627a; } .tk-s { color: #067d17; } .tk-c { color: #6a737d; font-style: italic; }
  .tk-n { color: #1750eb; } .tk-o { color: #444; } .tk-b { color: #555; } .tk-m { color: #9e880d; } .tk-a { color: #871094; } .tk-i { color: #c00; }
  .cw-err { color: #c00000; } .cw-warn { color: #a05a00; } .cw-echo { color: #0b4f8a; font-weight: 600; } .cw-info { color: #555; font-style: italic; }
  .msp-img { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding: ${IMAGE_PAD}mm; break-inside: avoid; }
  .msp-img img { display: block; max-width: 100%; }
  .msp-img.fit img { width: 100%; flex: 1 1 auto; min-height: 0; object-fit: contain; }
  .msp-img figcaption { flex: none; margin-top: 2mm; font-size: 9pt; color: #333; text-align: center; }
  .msp-img.lighten img { filter: invert(1) hue-rotate(180deg); }
  .msp-html { overflow-wrap: break-word; }
  .msp-html img, .msp-html svg, .msp-html canvas, .msp-html video { max-width: 100%; max-height: ${Math.floor(g.ch)}mm; height: auto; }
  .msp-html pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: ${FONT_MONO}; font-size: 0.92em; }
  .msp-html code { font-family: ${FONT_MONO}; font-size: 0.92em; }
  .msp-html table { border-collapse: collapse; max-width: 100%; }
  .msp-html table.msp-grid { font-family: ${FONT_MONO}; font-size: 0.95em; }
  .msp-html table.msp-grid th, .msp-html table.msp-grid td { border: 0.2mm solid #999; padding: 0.4mm 1.6mm; text-align: right; white-space: nowrap; }
  .msp-html table.msp-grid th { background: #eee; font-weight: 600; text-align: center; }
  .msp-html table.msp-grid thead th { position: static; }
  .msp-html h1, .msp-html h2, .msp-html h3, .msp-html h4 { break-after: avoid; }
  .msp-caption { font-size: 0.9em; color: #333; margin: 0 0 2mm; }`;
}

/**
 * The images of an image document: spec.images ([{ dataUrl, widthPx, caption, role }]) or the single
 * spec.imageDataUrl; scope results (role 'scope') only when the setup includes them.
 */
export function printImages(spec, setup) {
  const s = normalizeSetup(setup);
  const list = Array.isArray(spec.images) && spec.images.length ? spec.images : [{ dataUrl: spec.imageDataUrl, widthPx: spec.imageWidthPx, caption: '' }];
  return list.filter((im) => s.scopes || im.role !== 'scope');
}

/**
 * The document before pagination. spec:
 *   { title, kind: 'text' | 'code' | 'html' | 'image',
 *     text?, runs? ([{ t, c }], e.g. syntax colours), html?, baseUrl?,
 *     imageDataUrl?, imageWidthPx? (CSS px of the image at 100 %), or images: [{ dataUrl, widthPx, caption, role }] }
 * The content sits in <div id="msp-src">; paginate.js pours it into pages.
 */
export function buildPrintHtml(spec, setup) {
  const s = normalizeSetup(setup);
  const kind = spec.kind || 'text';
  const title = esc(spec.title || '');
  let extraHead = '';
  let body = '';
  if (kind === 'image') {
    const fit = s.scaleMode === 'fit';
    // each image fills one page (fit) or keeps its size × scale; captions when there are several or one is given
    const list = printImages(spec, s);
    const g = pageGeometry(s);
    body = list.map((im) => {
      const w = !fit && Number(im.widthPx) > 0 ? ` style="width:${Math.round(Number(im.widthPx) * s.scale) / 100}px"` : '';
      const cap = im.caption && (list.length > 1 || im.captionAlways) ? `<figcaption>${esc(im.caption)}</figcaption>` : '';
      return `<figure class="msp-img ${fit ? 'fit' : ''} ${spec.lightenable && s.lighten ? 'lighten' : ''}" style="height:${fit ? `${Math.floor(g.ch)}mm` : 'auto'}"><img src="${esc(im.dataUrl || '')}" alt="${esc(im.caption || spec.title || '')}"${w}>${cap}</figure>`;
    }).join('\n');
  } else if (kind === 'html') {
    const parts = splitHtml(spec.html);
    extraHead = parts.head;
    body = `<div class="msp-html">${parts.body}</div>`;
  } else {
    const runs = spec.runs || [{ t: spec.text || '' }];
    const lines = runsToLines(kind === 'code' && !s.syntax ? runs.map((r) => ({ t: r.t })) : runs);
    if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
    const digits = String(lines.length).length;
    const ln = kind === 'code' && s.lineNumbers;
    const rows = lines.map((line, i) => {
      const inner = line.map((r) => (r.c ? `<span class="${esc(r.c)}">${esc(r.t)}</span>` : esc(r.t))).join('');
      return `<div class="l">${ln ? `<span class="n">${i + 1}</span>` : ''}<span class="t">${inner}</span></div>`;
    }).join('\n');
    body = `<div class="msp-code ${s.wrap ? 'wrap' : 'nowrap'}" style="--msp-ln:${digits}ch">\n${rows}\n</div>`;
  }
  const base = spec.baseUrl ? `<base href="${esc(spec.baseUrl)}">\n` : '';
  const cls = [s.color ? '' : 'msp-gray', s.backgrounds ? '' : 'msp-nobg'].filter(Boolean).join(' ');
  return `<!doctype html>
<html lang="${esc(spec.lang || 'ko')}">
<head>
<meta charset="utf-8">
${base}<title>${title}</title>
${extraHead}
<style id="msp-style">${pageCss(s)}
${contentCss(s)}
</style>
</head>
<body class="${cls}" data-kind="${esc(kind)}">
<div id="msp-src">${body}</div>
</body>
</html>`;
}
