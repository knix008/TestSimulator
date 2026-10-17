// Printing: the project's diagrams laid out on sheets of paper. Each diagram is
// either fitted to one sheet, or printed at its actual size / a percentage and
// tiled over as many sheets as it needs. Every sheet has an optional header
// (project, diagram name, date) and footer (sheet number). Always on white,
// whatever the theme. Pure SVG strings (the print popup previews and prints them).
import { renderDiagramSvg } from '../render/notation.js';
import { esc, DEFAULT_FONT } from '../render/text.js';
import { allDiagrams } from '../domain/model.js';

/** Paper sizes in millimetres (portrait). */
export const PAPERS = { A3: { width: 297, height: 420 }, A4: { width: 210, height: 297 }, A5: { width: 148, height: 210 }, B4: { width: 250, height: 353 }, B5: { width: 176, height: 250 }, Letter: { width: 215.9, height: 279.4 }, Legal: { width: 215.9, height: 355.6 }, Tabloid: { width: 279.4, height: 431.8 } };
export const MARGINS = { none: 0, narrow: 6, normal: 12, wide: 20 };
export const RANGES = ['all', 'current', 'custom'];
export const FITS = ['fit', 'actual', 'percent'];
const MM = 96 / 25.4;

export function defaultPrintOptions() {
  return { paper: 'A4', orientation: 'landscape', margin: 'normal', fit: 'fit', scale: 100, header: true, footer: true, headerText: '', footerText: '', background: true, center: true, range: 'all', from: 1, to: 999 };
}

/** The diagrams chosen by the range: all, the current one, or from…to (1-based). */
export function selectPages(project, options, currentPageId = null) {
  const pages = allDiagrams(project);
  if (options.range === 'current') return pages.filter((page) => page._id === currentPageId).slice(0, 1);
  if (options.range === 'custom') {
    const from = Math.max(1, Math.round(Number(options.from) || 1));
    const to = Math.max(from, Math.round(Number(options.to) || from));
    return pages.slice(from - 1, to);
  }
  return pages;
}

/**
 * Sheets to print: { pages: [{ svg, width, height, pageName }], count, sheetsPerPage }.
 * `measure` lays out text (the app passes a canvas measure; tests an estimate).
 */
export function renderPrintSheets(doc, options, { measure, currentPageId = null, language = 'ko', t = (key) => key, now = new Date(), theme = 'classic', lineStyle = 'rectilinear' } = {}) {
  const o = { ...defaultPrintOptions(), ...options };
  const paper = PAPERS[o.paper] ?? PAPERS.A4;
  const landscape = o.orientation === 'landscape';
  const W = (landscape ? paper.height : paper.width) * MM;
  const H = (landscape ? paper.width : paper.height) * MM;
  const margin = (MARGINS[o.margin] ?? 12) * MM;
  const headH = o.header ? 26 : 0;
  const footH = o.footer ? 22 : 0;
  const area = { x: margin, y: margin + headH, w: W - margin * 2, h: H - margin * 2 - headH - footH };
  const chosen = selectPages(doc, o, currentPageId);
  const sheets = [];
  const date = now.toLocaleDateString(language === 'en' ? 'en-US' : 'ko-KR');
  for (const page of chosen) {
    const rendered = renderDiagramSvg(doc, page, { measure, language, theme, lineStyle, background: o.background ? undefined : 'none' });
    const drawing = { svg: rendered.svg, box: rendered.bounds };
    void now;
    const dw = drawing.box.w;
    const dh = drawing.box.h;
    const tiles = [];
    if (o.fit === 'fit') {
      const scale = Math.min(area.w / dw, area.h / dh);
      tiles.push({ vx: drawing.box.x, vy: drawing.box.y, vw: dw, vh: dh, w: dw * scale, h: dh * scale });
    } else {
      const scale = o.fit === 'actual' ? 1 : Math.max(0.1, (Number(o.scale) || 100) / 100);
      const tw = area.w / scale;
      const th = area.h / scale;
      const cols = Math.max(1, Math.ceil(dw / tw - 0.001));
      const rows = Math.max(1, Math.ceil(dh / th - 0.001));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const vw = Math.min(tw, dw - c * tw);
        const vh = Math.min(th, dh - r * th);
        tiles.push({ vx: drawing.box.x + c * tw, vy: drawing.box.y + r * th, vw, vh, w: vw * scale, h: vh * scale, tile: `${r + 1}-${c + 1}` });
      }
    }
    const inner = drawing.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    for (const tile of tiles) {
      const x = o.center ? area.x + (area.w - tile.w) / 2 : area.x;
      const y = o.center && o.fit === 'fit' ? area.y + (area.h - tile.h) / 2 : area.y;
      sheets.push({ page, tile, x, y });
      sheets[sheets.length - 1].inner = inner;
    }
  }
  const count = sheets.length;
  const pages = sheets.map((sheet, index) => {
    const { tile, x, y, page } = sheet;
    const header = o.header ? `<text x="${margin}" y="${margin + 14}" font-size="12" font-weight="700" fill="#111">${esc(o.headerText || doc.name || '')}</text><text x="${W - margin}" y="${margin + 14}" font-size="11" fill="#555" text-anchor="end">${esc(`${page.name} · ${date}`)}</text><line x1="${margin}" y1="${margin + headH - 6}" x2="${W - margin}" y2="${margin + headH - 6}" stroke="#bbb"/>` : '';
    const footer = o.footer ? `<line x1="${margin}" y1="${H - margin - footH + 4}" x2="${W - margin}" y2="${H - margin - footH + 4}" stroke="#ddd"/><text x="${margin}" y="${H - margin - 4}" font-size="10" fill="#777">${esc(o.footerText || 'MyUMLMaker')}</text><text x="${W - margin}" y="${H - margin - 4}" font-size="10" fill="#777" text-anchor="end">${esc(t('print.sheetOf', { n: index + 1, total: count }))}${tile.tile ? ` (${esc(tile.tile)})` : ''}</text>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" font-family="${esc(DEFAULT_FONT)}"><rect width="100%" height="100%" fill="#ffffff"/>${header}<svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${tile.w.toFixed(2)}" height="${tile.h.toFixed(2)}" viewBox="${tile.vx.toFixed(2)} ${tile.vy.toFixed(2)} ${tile.vw.toFixed(2)} ${tile.vh.toFixed(2)}" preserveAspectRatio="xMidYMid meet" overflow="hidden">${sheet.inner}</svg>${footer}</svg>`;
    return { svg, width: W, height: H, pageName: page.name };
  });
  return { pages, count, paper: { width: landscape ? paper.height : paper.width, height: landscape ? paper.width : paper.height } };
}
