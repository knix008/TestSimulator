// Printing packets: the lines of the chosen packets (summary, details, bytes — built by the main
// window, analysis-bridge.js printModel) laid out on sheets of paper. Monospaced text, so a page
// holds a fixed number of lines and a line a fixed number of characters; longer lines wrap. Every
// sheet has an optional header (title, date) and footer (page n / N). Always black on white.
// Pure: returns HTML strings that the print window previews and prints.

/** Paper sizes in millimetres (portrait). */
export const PAPERS = { A3: { width: 297, height: 420 }, A4: { width: 210, height: 297 }, A5: { width: 148, height: 210 }, B4: { width: 250, height: 353 }, B5: { width: 176, height: 250 }, Letter: { width: 215.9, height: 279.4 }, Legal: { width: 215.9, height: 355.6 }, Tabloid: { width: 279.4, height: 431.8 } };
export const MARGINS = { narrow: 6, normal: 12, wide: 20 };
export const FONT_SIZES = [7, 8, 9, 10, 11, 12];
export const PRINT_RANGES = ['all', 'displayed', 'selected', 'marked', 'custom'];
export const PRINT_DETAILS = ['none', 'collapsed', 'displayed', 'expanded'];
const MM = 96 / 25.4;
const PT = 96 / 72;
/** Width of one character of the print font, in em (Consolas / D2Coding / Cascadia Mono are ~0.55). */
const CHAR_EM = 0.6;
const LINE_EM = 1.3;

export function defaultPrintOptions() {
  return {
    printer: '', copies: 1, paper: 'A4', orientation: 'portrait', margin: 'normal', fontSize: 9,
    header: true, footer: true, headerText: '', footerText: '',
    range: 'displayed', custom: '', summary: true, columnHeader: true, details: 'expanded', bytes: false, newPage: false,
  };
}

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The paper in millimetres after the orientation. */
export function paperSize(options) {
  const paper = PAPERS[options.paper] ?? PAPERS.A4;
  return options.orientation === 'landscape' ? { width: paper.height, height: paper.width } : { width: paper.width, height: paper.height };
}

/** Lines per page and characters per line for the options. */
export function pageMetrics(options) {
  const o = { ...defaultPrintOptions(), ...options };
  const paper = paperSize(o);
  const margin = (MARGINS[o.margin] ?? 12) * MM;
  const fontPx = o.fontSize * PT;
  const lineH = fontPx * LINE_EM;
  const headH = o.header ? lineH * 2 : 0;
  const footH = o.footer ? lineH * 2 : 0;
  const width = paper.width * MM;
  const height = paper.height * MM;
  const areaW = width - margin * 2;
  const areaH = height - margin * 2 - headH - footH;
  return { paper, width, height, margin, fontPx, lineH, headH, footH, lines: Math.max(5, Math.floor(areaH / lineH)), chars: Math.max(20, Math.floor(areaW / (fontPx * CHAR_EM))) };
}

/** Splits a line into pieces of at most `chars` characters (continuations keep the indentation). */
export function wrapLine(line, chars) {
  const text = String(line ?? '').replace(/\t/g, '    ');
  if (text.length <= chars) return [text];
  const indent = Math.min(chars / 2, (/^\s*/.exec(text)?.[0].length ?? 0) + 2);
  const out = [text.slice(0, chars)];
  let rest = text.slice(chars);
  while (rest.length) {
    const room = chars - indent;
    out.push(' '.repeat(indent) + rest.slice(0, room));
    rest = rest.slice(room);
  }
  return out;
}

/**
 * The sheets. model: { title, packets: [{ no, lines: [text] }] }.
 * Returns { paper (mm), pages: [{ html }], count, metrics }.
 */
export function layoutPrint(model, options, { now = new Date(), language = 'ko', t = (key, p) => (p ? `${key} ${JSON.stringify(p)}` : key) } = {}) {
  const o = { ...defaultPrintOptions(), ...options };
  const m = pageMetrics(o);
  const pagesLines = [];
  let current = [];
  const flush = () => { if (current.length) pagesLines.push(current); current = []; };
  for (const [index, packet] of (model.packets ?? []).entries()) {
    if (index > 0 && o.newPage) flush();
    const block = packet.lines.flatMap((line) => wrapLine(line, m.chars));
    if (index > 0 && !o.newPage && current.length) block.unshift('');
    // A packet that fits on a page is not split over two pages when it can start a new one.
    if (current.length && current.length + block.length > m.lines && block.length <= m.lines) flush();
    for (const line of block) {
      if (current.length >= m.lines) flush();
      if (!current.length && line === '') continue;
      current.push(line);
    }
  }
  flush();
  const date = now.toLocaleString(language === 'en' ? 'en-US' : 'ko-KR');
  const title = o.headerText || model.title || '';
  const count = pagesLines.length;
  const pages = pagesLines.map((lines, i) => {
    const footer = o.footerText ? `${o.footerText} · ` : '';
    return {
      html: `<div class="pp-sheet" style="width:${m.width}px;height:${m.height}px;padding:${m.margin}px;font-size:${m.fontPx}px;line-height:${m.lineH}px">
        ${o.header ? `<div class="pp-head" style="height:${m.headH}px"><span>${esc(title)}</span><span>${esc(date)}</span></div>` : ''}
        <pre class="pp-body">${lines.map(esc).join('\n')}</pre>
        ${o.footer ? `<div class="pp-foot" style="height:${m.footH}px">${esc(footer)}${esc(t('print.page', { n: i + 1, total: count }))}</div>` : ''}
      </div>`,
    };
  });
  return { paper: m.paper, pages, count, metrics: m };
}
