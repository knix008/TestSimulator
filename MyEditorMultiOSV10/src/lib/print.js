// Print HTML for a code listing. Settings › print (and the preview toolbar)
// choose the page chrome and how pretty the listing looks: syntax colour,
// zebra rows, a gutter, wrap, type size. A frame or page numbers split the
// listing into A4 pages so each printed sheet has its own border / footer.
import { highlightTree, tags as t, tagHighlighter } from '@lezer/highlight';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });
}

function pageOf(n, total) { return `${n} / ${total}`; }

export const PRINT_DEFAULTS = {
  printHeader: true,
  printLineNumbers: true,
  printBorder: false,
  printPageNumbers: false,
  printDate: false,
  printSyntax: true,
  printColor: true,
  printZebra: true,
  printGutter: true,
  printWrap: true,
  printFontSize: 9.5,
  printLineHeight: 1.45,
};

export function printOptsOf(settings) {
  const s = settings || {};
  const n = (k, d) => { const v = Number(s[k]); return Number.isFinite(v) && v > 0 ? v : d; };
  return {
    printHeader: s.printHeader !== false,
    printLineNumbers: s.printLineNumbers !== false,
    printBorder: !!s.printBorder,
    printPageNumbers: !!s.printPageNumbers,
    printDate: !!s.printDate,
    printSyntax: s.printSyntax !== false,
    printColor: s.printColor !== false,
    printZebra: s.printZebra !== false,
    printGutter: s.printGutter !== false,
    printWrap: s.printWrap !== false,
    printFontSize: n('printFontSize', 9.5),
    printLineHeight: n('printLineHeight', 1.45),
    tabSize: Math.max(1, Math.min(16, n('tabSize', 4))),
    printFont: String(s.fontFamily || '').trim(),
  };
}

const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const expand = (s, tabSize) => esc(s).replace(/\t/g, ' '.repeat(tabSize || 4));

// Paper-friendly colours (GitHub-like light). Dark theme colours waste ink.
const PRINT_HI = tagHighlighter([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], class: 'k' },
  { tag: [t.string, t.special(t.string), t.character, t.docString, t.attributeValue], class: 's' },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom, t.literal], class: 'n' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.quote], class: 'c' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], class: 'f' },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName), t.standard(t.typeName)], class: 'ty' },
  { tag: [t.propertyName, t.definition(t.propertyName), t.attributeName, t.labelName], class: 'p' },
  { tag: [t.tagName, t.standard(t.tagName)], class: 'tg' },
  { tag: [t.regexp, t.escape, t.special(t.variableName)], class: 're' },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], class: 'h' },
  { tag: [t.link, t.url], class: 'lk' },
  { tag: [t.self, t.constant(t.variableName), t.constant(t.name)], class: 'cn' },
  { tag: t.emphasis, class: 'em' },
  { tag: t.strong, class: 'st' },
]);

// One HTML fragment per source line (escaped, with <span class="k">… when
// the editor has a syntax tree). Used by the listing so toggling colour /
// zebra does not need to re-parse.
export function highlightCodeLines(state, tabSize = 4) {
  if (!state || !state.doc) return null;
  const text = state.doc.toString();
  const tree = ensureSyntaxTree(state, state.doc.length, 800) || syntaxTree(state);
  const marks = [];
  if (tree && tree.length) {
    try { highlightTree(tree, PRINT_HI, (from, to, cls) => { if (cls) marks.push({ from, to, cls }); }); }
    catch { /* a partial tree is fine — the listing stays plain */ }
  }
  const out = [];
  let mi = 0;
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    let html = '', pos = line.from;
    while (mi < marks.length && marks[mi].to <= line.from) mi++;
    for (let j = mi; j < marks.length && marks[j].from < line.to; j++) {
      const m = marks[j];
      const a = Math.max(m.from, line.from), b = Math.min(m.to, line.to);
      if (a > pos) html += expand(text.slice(pos, a), tabSize);
      html += `<span class="${m.cls}">${expand(text.slice(a, b), tabSize)}</span>`;
      pos = b;
    }
    if (pos < line.to) html += expand(text.slice(pos, line.to), tabSize);
    out.push(html || ' ');
  }
  return out;
}

// Same listing as highlightCodeLines, yielding so a progress popup can paint.
export async function highlightCodeLinesAsync(state, tabSize = 4, onProgress) {
  if (!state || !state.doc) return null;
  if (onProgress) onProgress(0.02);
  await yieldToUi();
  const text = state.doc.toString();
  const tree = ensureSyntaxTree(state, state.doc.length, 800) || syntaxTree(state);
  const marks = [];
  if (tree && tree.length) {
    try { highlightTree(tree, PRINT_HI, (from, to, cls) => { if (cls) marks.push({ from, to, cls }); }); }
    catch { /* a partial tree is fine — the listing stays plain */ }
  }
  if (onProgress) onProgress(0.15);
  await yieldToUi();
  const out = [];
  let mi = 0;
  const total = state.doc.lines;
  for (let i = 1; i <= total; i++) {
    const line = state.doc.line(i);
    let html = '', pos = line.from;
    while (mi < marks.length && marks[mi].to <= line.from) mi++;
    for (let j = mi; j < marks.length && marks[j].from < line.to; j++) {
      const m = marks[j];
      const a = Math.max(m.from, line.from), b = Math.min(m.to, line.to);
      if (a > pos) html += expand(text.slice(pos, a), tabSize);
      html += `<span class="${m.cls}">${expand(text.slice(a, b), tabSize)}</span>`;
      pos = b;
    }
    if (pos < line.to) html += expand(text.slice(pos, line.to), tabSize);
    out.push(html || ' ');
    if (i % 400 === 0) {
      if (onProgress) onProgress(0.15 + 0.55 * (i / total));
      await yieldToUi();
    }
  }
  if (onProgress) onProgress(0.7);
  return out;
}

function linesPerPage(o) {
  const pt = Number(o.printFontSize) || 9.5;
  const lh = Number(o.printLineHeight) || 1.45;
  const lineMm = Math.max(3.2, pt * lh * 0.352778);
  let usable = 297 - 26;
  if (o.printHeader || o.printDate) usable -= 10;
  if (o.printPageNumbers) usable -= 8;
  return Math.max(8, Math.floor(usable / lineMm) - 1);
}

function formatDate() {
  const d = new Date();
  try { return d.toLocaleDateString(); }
  catch { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
}

function lineCell(plain, html, tabSize) {
  if (html != null && html !== '') return html;
  return expand(plain, tabSize) || ' ';
}

function codeTable(rows, startLine, o, digits, lineHtml, htmlFrom) {
  const showLn = o.printLineNumbers;
  const zebra = o.printZebra;
  const body = rows.map((l, i) => {
    const n = startLine + i;
    const z = zebra && n % 2 === 0 ? ' class="z"' : '';
    const src = `<td class="src">${lineCell(l, lineHtml && lineHtml[htmlFrom + i], o.tabSize)}</td>`;
    return showLn ? `<tr${z}><td class="ln">${String(n).padStart(digits)}</td>${src}</tr>` : `<tr${z}>${src}</tr>`;
  }).join('');
  return `<table class="code"><tbody>${body}</tbody></table>`;
}

function pageHead(path, lang, o, date) {
  if (!o.printHeader && !o.printDate) return '';
  const left = o.printHeader ? `${esc(path)}${lang ? `<span class="lang">${esc(lang)}</span>` : ''}` : '';
  const right = o.printDate ? esc(date) : '';
  return `<div class="page-head"><span class="file">${left}</span><span>${right}</span></div>`;
}

function codeCss(o) {
  const pt = Number(o.printFontSize) || 9.5;
  const lh = Number(o.printLineHeight) || 1.45;
  const wrap = o.printWrap !== false;
  const font = o.printFont ? `"${String(o.printFont).replace(/["\\]/g, '')}",` : '';
  const gutter = o.printGutter && o.printLineNumbers;
  return `html,body{margin:0}
body{font-family:Segoe UI,Malgun Gothic,Apple SD Gothic Neo,Noto Sans KR,Helvetica,Arial,sans-serif;color:#1f2328;font-size:12pt}
table.code{width:100%;border-collapse:collapse;font-family:${font}Cascadia Mono,Consolas,D2Coding,Menlo,monospace;font-size:${pt}pt}
table.code td{vertical-align:top;padding:1px 8px;white-space:${wrap ? 'pre-wrap' : 'pre'};word-break:${wrap ? 'break-all' : 'normal'};line-height:${lh}}
table.code td.ln{color:#8b949e;text-align:right;user-select:none;width:1%;border-right:1px solid #d0d7de${gutter ? ';background:#f6f8fa' : ''}}
table.code tr.z td{background:#f6f8fa}
table.code tr.z td.ln{background:${gutter ? '#eef1f4' : '#f6f8fa'}}
.k{color:#6f42c1;font-weight:600}.s{color:#0a3069}.n{color:#0550ae}.c{color:#6e7781;font-style:italic}
.f{color:#8250df}.ty{color:#953800}.p{color:#0550ae}.tg{color:#116329}.re{color:#0a3069}
.h{color:#0550ae;font-weight:700}.lk{color:#0969da;text-decoration:underline}.cn{color:#0550ae}
.em{font-style:italic}.st{font-weight:700}
body.bw .k,body.bw .s,body.bw .n,body.bw .f,body.bw .ty,body.bw .p,body.bw .tg,body.bw .re,body.bw .h,body.bw .lk,body.bw .cn{color:#1f2328}
body.bw .c{color:#6e7781}body.bw .k,body.bw .h,body.bw .st{font-weight:700}
.page-head,.title{font-size:9pt;color:#656d76;border-bottom:1.5px solid #0969da;padding-bottom:4px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
body.bw .page-head,body.bw .title{border-bottom-color:#d0d7de}
.page-head .lang,.title .lang{margin-left:8px;font-size:8pt;color:#8b949e}
.page-foot{font-size:9pt;color:#656d76;text-align:center;padding-top:6px}
.page{width:210mm;height:297mm;box-sizing:border-box;padding:12mm 14mm 10mm;background:#fff;display:flex;flex-direction:column;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
.page-body{flex:1;min-height:0;overflow:hidden}
.page-body.framed{border:1px solid #8b949e;border-radius:2px;padding:5px 6px}
.sheet{margin:16mm 15mm}
.sheet.framed table.code{border:1px solid #8b949e}
@page{size:A4;margin:0}
@media screen{body.paged{background:#c8c8c8;padding:10px 0}body.paged .page{box-shadow:0 1px 6px rgba(0,0,0,.28);margin:0 auto 10px}}
@media print{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
}

// A numbered listing of `text`. `lineHtml` is highlightCodeLines() output.
export function buildCodePrintHtml({ title, path, lang, text, lineHtml, opts }) {
  const o = { ...PRINT_DEFAULTS, tabSize: 4, printFont: '', ...opts };
  const useHi = o.printSyntax && Array.isArray(lineHtml);
  const lines = String(text || '').split('\n');
  const htmlLines = useHi ? lineHtml : null;
  const digits = String(Math.max(1, lines.length)).length;
  const label = path || title || '';
  const date = formatDate();
  const paginate = o.printBorder || o.printPageNumbers;
  const cls = [paginate ? 'paged' : '', o.printColor ? '' : 'bw'].filter(Boolean).join(' ');
  let body;
  if (paginate) {
    const per = linesPerPage(o);
    const chunks = [];
    for (let i = 0; i < lines.length; i += per) chunks.push(lines.slice(i, i + per));
    if (!chunks.length) chunks.push(['']);
    body = chunks.map((rows, i) => {
      const head = pageHead(label, lang, o, date);
      const foot = o.printPageNumbers ? `<div class="page-foot">${pageOf(i + 1, chunks.length)}</div>` : '';
      const frame = o.printBorder ? ' framed' : '';
      return `<div class="page">${head}<div class="page-body${frame}">${codeTable(rows, i * per + 1, o, digits, htmlLines, i * per)}</div>${foot}</div>`;
    }).join('');
  } else {
    const head = (o.printHeader || o.printDate)
      ? `<div class="title"><span class="file">${o.printHeader ? `${esc(label)}${lang ? `<span class="lang">${esc(lang)}</span>` : ''}` : ''}</span><span>${o.printDate ? esc(date) : ''}</span></div>`
      : '';
    body = `<div class="sheet${o.printBorder ? ' framed' : ''}">${head}${codeTable(lines, 1, o, digits, htmlLines, 0)}</div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || '')}</title><style>${codeCss(o)}</style></head><body class="${cls}">${body}</body></html>`;
}

function wrapPrintHtml(title, o, cls, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || '')}</title><style>${codeCss(o)}</style></head><body class="${cls}">${body}</body></html>`;
}

export async function buildCodePrintHtmlAsync({ title, path, lang, text, lineHtml, opts }, onProgress) {
  const o = { ...PRINT_DEFAULTS, tabSize: 4, printFont: '', ...opts };
  const useHi = o.printSyntax && Array.isArray(lineHtml);
  const lines = String(text || '').split('\n');
  const htmlLines = useHi ? lineHtml : null;
  const digits = String(Math.max(1, lines.length)).length;
  const label = path || title || '';
  const date = formatDate();
  const paginate = o.printBorder || o.printPageNumbers;
  const cls = [paginate ? 'paged' : '', o.printColor ? '' : 'bw'].filter(Boolean).join(' ');
  if (onProgress) onProgress(0.7);
  await yieldToUi();
  const total = Math.max(1, lines.length);
  let done = 0;
  const tick = async (n) => {
    done += n;
    if (onProgress) onProgress(0.7 + 0.28 * Math.min(1, done / total));
    if (done % 200 < n) await yieldToUi();
  };
  let body;
  if (paginate) {
    const per = linesPerPage(o);
    const chunks = [];
    for (let i = 0; i < lines.length; i += per) chunks.push(lines.slice(i, i + per));
    if (!chunks.length) chunks.push(['']);
    const pages = [];
    for (let i = 0; i < chunks.length; i++) {
      const rows = chunks[i];
      const head = pageHead(label, lang, o, date);
      const foot = o.printPageNumbers ? `<div class="page-foot">${pageOf(i + 1, chunks.length)}</div>` : '';
      const frame = o.printBorder ? ' framed' : '';
      pages.push(`<div class="page">${head}<div class="page-body${frame}">${codeTable(rows, i * per + 1, o, digits, htmlLines, i * per)}</div>${foot}</div>`);
      await tick(rows.length);
    }
    body = pages.join('');
  } else {
    const head = (o.printHeader || o.printDate)
      ? `<div class="title"><span class="file">${o.printHeader ? `${esc(label)}${lang ? `<span class="lang">${esc(lang)}</span>` : ''}` : ''}</span><span>${o.printDate ? esc(date) : ''}</span></div>`
      : '';
    const parts = [];
    const step = 250;
    for (let i = 0; i < lines.length; i += step) {
      const slice = lines.slice(i, i + step);
      parts.push(codeTable(slice, i + 1, o, digits, htmlLines, i).replace(/^<table class="code"><tbody>/, '').replace(/<\/tbody><\/table>$/, ''));
      await tick(slice.length);
    }
    body = `<div class="sheet${o.printBorder ? ' framed' : ''}">${head}<table class="code"><tbody>${parts.join('')}</tbody></table></div>`;
  }
  if (onProgress) onProgress(1);
  return wrapPrintHtml(title, o, cls, body);
}

export function isPagedPrint(html) {
  return /\bpaged\b/.test(String(html || '').match(/<body[^>]*class="([^"]*)"/)?.[1] || '');
}
