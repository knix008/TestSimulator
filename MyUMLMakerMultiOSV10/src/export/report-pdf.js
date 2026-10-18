// Model documents as PDF: the report's blocks (src/domain/report.js) laid out
// on A4 sheets as SVG — cover, a table of contents with page numbers, headings
// (a chapter starts a new sheet), wrapped paragraphs, tables whose header row
// repeats on each sheet, diagram pictures scaled to the text width — with a
// running header and page numbers. The app rasterises the sheets and writes
// them with pdfFromJpegs (files.js), so Korean prints without embedded fonts.
// Pure: `measure` lays out text (the app passes a canvas measure; tests an estimate).
import { DEFAULT_FONT, esc, estimateMeasure, wrapText } from '../render/text.js';

const MM = 96 / 25.4;
export const REPORT_PAGE = { width: 210 * MM, height: 297 * MM, margin: 18 * MM };
const COLORS = { text: '#1d2330', muted: '#5f6b7a', line: '#b4bcc8', accent: '#2f6fde', title: '#1f3864', head: '#dce6f2' };
const BODY = { fontSize: 11 };
const LH = 1.45;

/**
 * Sheets: [{ svg, width, height }] (CSS px, A4 portrait).
 * diagramSvg(diagram) → { svg, width, height } or null.
 */
export function reportPdfPages(report, { measure = estimateMeasure, diagramSvg = null, noPicture = '(no picture)' } = {}) {
  const { width: W, height: H, margin: M } = REPORT_PAGE;
  const CW = W - M * 2;
  const top = M + 18;
  const bottom = H - M - 16;
  const pages = [];
  let page = null;
  let y = 0;
  const newPage = (kind = 'body') => { page = { items: [], kind }; pages.push(page); y = top; };
  const room = () => bottom - y;
  const ensure = (needed) => { if (!page || room() < needed) newPage(); };
  const text = (value, px, py, style, fill = COLORS.text, anchor = 'start') => page.items.push(`<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" font-size="${style.fontSize}"${style.bold ? ' font-weight="700"' : ''}${style.italic ? ' font-style="italic"' : ''} fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(value)}</text>`);
  const lines = (value, width, style) => wrapText(String(value ?? ''), width, style, measure);
  const paragraph = (value, style, fill, indent = 0, gapAfter = 6) => {
    const lh = style.fontSize * LH;
    for (const line of lines(value, CW - indent, style)) {
      ensure(lh);
      y += lh;
      text(line, M + indent, y - lh * 0.28, style, fill);
    }
    y += gapAfter;
  };
  const headings = [];
  let tocBlock = null;

  for (const b of report.blocks) {
    switch (b.kind) {
      case 'cover': {
        newPage('cover');
        y = H * 0.32;
        const titleStyle = { fontSize: 30, bold: true };
        for (const line of lines(b.title, CW, titleStyle)) { y += 40; text(line, M, y, titleStyle, COLORS.title); }
        y += 14;
        page.items.push(`<rect x="${M}" y="${y.toFixed(1)}" width="${CW.toFixed(1)}" height="3" fill="${COLORS.accent}"/>`);
        y += 34;
        text(b.subtitle, M, y, { fontSize: 17 }, COLORS.muted);
        y += 40;
        for (const [k, v] of b.rows) { y += 22; text(`${k}:`, M, y, { fontSize: 13, bold: true }, COLORS.text); text(v, M + 110, y, { fontSize: 13 }, COLORS.text); }
        page = null;
        break;
      }
      case 'toc':
        tocBlock = b;
        page = null;
        break;
      case 'heading': {
        const style = b.level === 1 ? { fontSize: 19, bold: true } : b.level === 2 ? { fontSize: 15, bold: true } : { fontSize: 12, bold: true };
        if (b.level === 1) { if (!page || page.kind !== 'body' || y > top) newPage(); } else ensure(style.fontSize * 2 + 40);
        y += b.level === 1 ? 6 : b.level === 2 ? 14 : 8;
        paragraph(b.text, style, b.level === 1 ? COLORS.title : b.level === 2 ? COLORS.accent : COLORS.muted, 0, b.level === 1 ? 2 : 3);
        if (b.level === 1) { page.items.push(`<rect x="${M}" y="${y.toFixed(1)}" width="${CW.toFixed(1)}" height="1.5" fill="${COLORS.accent}"/>`); y += 10; }
        if (b.level <= 2) headings.push({ text: b.text, level: b.level, page: pages.length });
        break;
      }
      case 'paragraph':
        ensure(BODY.fontSize * LH);
        paragraph(b.text, b.style === 'meta' ? { fontSize: 9.5 } : BODY, b.style === 'meta' ? COLORS.muted : COLORS.text);
        break;
      case 'list':
        ensure(BODY.fontSize * LH);
        for (const item of b.items) {
          const lh = BODY.fontSize * LH;
          ensure(lh);
          text('•', M + 3, y + lh * 0.72, BODY, COLORS.muted);
          paragraph(item, BODY, COLORS.text, 14, 1);
        }
        y += 5;
        break;
      case 'table': layoutTable(b); break;
      case 'image': {
        ensure(60);
        let drawing = null;
        if (typeof diagramSvg === 'function') { try { drawing = diagramSvg(b.diagram); } catch { drawing = null; } }
        if (drawing?.svg) {
          const maxH = bottom - top - 30;
          const scale = Math.min(1, CW / drawing.width, maxH / drawing.height);
          const w = drawing.width * scale;
          const hgt = drawing.height * scale;
          if (room() < hgt + 24) newPage();
          const inner = drawing.svg.replace(/^<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} x="${(M + (CW - w) / 2).toFixed(1)}" y="${(y + 4).toFixed(1)}" width="${w.toFixed(1)}" height="${hgt.toFixed(1)}" preserveAspectRatio="xMidYMid meet">`);
          page.items.push(`<rect x="${(M + (CW - w) / 2 - 1).toFixed(1)}" y="${(y + 3).toFixed(1)}" width="${(w + 2).toFixed(1)}" height="${(hgt + 2).toFixed(1)}" fill="#ffffff" stroke="${COLORS.line}" stroke-width="0.6"/>`, inner);
          y += hgt + 10;
        } else paragraph(noPicture, { fontSize: 9.5 }, COLORS.muted);
        ensure(16);
        y += 12;
        text(b.caption, W / 2, y, { fontSize: 9.5, italic: true }, COLORS.muted, 'middle');
        y += 12;
        break;
      }
      case 'pagebreak': page = null; break;
      default: break;
    }
  }

  function layoutTable(b) {
    const cols = Math.max(1, b.head.length);
    const style = { fontSize: 9 };
    const headStyle = { fontSize: 9, bold: true };
    const pad = 4;
    const weight = b.head.map((hText, c) => Math.min(40, Math.max(4, String(hText).length, ...b.rows.map((r) => Math.max(...String(r[c] ?? '').split('\n').map((l) => l.length))))));
    const sum = weight.reduce((a, w) => a + w, 0) || 1;
    const widths = weight.map((w) => (w / sum) * CW);
    const lh = style.fontSize * 1.35;
    const rowOf = (cells, st) => {
      const wrapped = Array.from({ length: cols }, (_, c) => lines(cells[c] ?? '', widths[c] - pad * 2, st));
      return { wrapped, height: Math.max(1, ...wrapped.map((l) => l.length)) * lh + pad * 2, style: st };
    };
    const head = rowOf(b.head, headStyle);
    const draw = (row, header) => {
      let cx = M;
      for (let c = 0; c < cols; c++) {
        page.items.push(`<rect x="${cx.toFixed(1)}" y="${y.toFixed(1)}" width="${widths[c].toFixed(1)}" height="${row.height.toFixed(1)}" fill="${header ? COLORS.head : '#ffffff'}" stroke="${COLORS.line}" stroke-width="0.6"/>`);
        row.wrapped[c].forEach((line, i) => text(line, cx + pad, y + pad + lh * (i + 1) - lh * 0.28, row.style));
        cx += widths[c];
      }
      y += row.height;
    };
    ensure(head.height + lh * 2 + pad * 2);
    draw(head, true);
    for (const cells of b.rows) {
      const row = rowOf(cells, style);
      if (room() < row.height) { newPage(); draw(head, true); }
      draw(row, false);
    }
    y += 10;
  }

  // Table of contents (after the cover, before the body), with page numbers.
  let tocPages = [];
  if (tocBlock) {
    const perPage = Math.floor((bottom - top - 50) / 19);
    const count = Math.max(1, Math.ceil(headings.length / perPage));
    const coverCount = pages.length && pages[0].kind === 'cover' ? 1 : 0;
    tocPages = Array.from({ length: count }, (_, i) => {
      const items = [];
      const t = (value, px, py, st, fill, anchor = 'start') => items.push(`<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" font-size="${st.fontSize}"${st.bold ? ' font-weight="700"' : ''} fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(value)}</text>`);
      let ty = top + 24;
      if (i === 0) { t(tocBlock.title, M, ty, { fontSize: 20, bold: true }, COLORS.title); }
      ty += 26;
      for (const hd of headings.slice(i * perPage, (i + 1) * perPage)) {
        const st = hd.level === 1 ? { fontSize: 11.5, bold: true } : { fontSize: 10.5 };
        const indent = hd.level === 1 ? 0 : 16;
        const number = String(hd.page + count);
        let label = hd.text;
        const room2 = CW - indent - 40;
        while (label.length > 1 && measure(label, st) > room2) label = `${label.slice(0, -2)}…`;
        t(label, M + indent, ty, st, COLORS.text);
        const dotsFrom = M + indent + measure(label, st) + 6;
        const dotsTo = W - M - measure(number, st) - 6;
        if (dotsTo > dotsFrom) items.push(`<line x1="${dotsFrom.toFixed(1)}" y1="${(ty - 2).toFixed(1)}" x2="${dotsTo.toFixed(1)}" y2="${(ty - 2).toFixed(1)}" stroke="${COLORS.line}" stroke-dasharray="1 3"/>`);
        t(number, W - M, ty, st, COLORS.text, 'end');
        ty += 19;
      }
      return { items, kind: 'toc' };
    });
    pages.splice(coverCount, 0, ...tocPages);
  }

  const total = pages.length;
  return pages.map((p, i) => {
    const chrome = p.kind === 'cover' ? '' : `<text x="${M}" y="${(M + 2).toFixed(1)}" font-size="9" fill="${COLORS.muted}">${esc(report.title)}</text><text x="${(W - M).toFixed(1)}" y="${(M + 2).toFixed(1)}" font-size="9" fill="${COLORS.muted}" text-anchor="end">${esc(report.subtitle)}</text><line x1="${M}" y1="${(M + 8).toFixed(1)}" x2="${(W - M).toFixed(1)}" y2="${(M + 8).toFixed(1)}" stroke="${COLORS.line}" stroke-width="0.6"/><text x="${(W / 2).toFixed(1)}" y="${(H - M + 6).toFixed(1)}" font-size="9" fill="${COLORS.muted}" text-anchor="middle">${i + 1} / ${total}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" font-family="${esc(DEFAULT_FONT)}"><rect width="100%" height="100%" fill="#ffffff"/>${chrome}${p.items.join('')}</svg>`;
    return { svg, width: W, height: H };
  });
}
