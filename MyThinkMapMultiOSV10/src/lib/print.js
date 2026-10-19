// Printing a map: the standalone map SVG placed on pages — the whole map on
// one page, or cut into a grid of tiles (2, 4, 6 or 9 pages) — with the
// title at the top and the date and page number at the bottom. The same
// HTML is the preview (an iframe) and what goes to the printer.
import { PAPER_MM } from './formats/pdf.js';
import { esc } from './render.js';

export const PRINT_PAPERS = Object.keys(PAPER_MM);

export function pageSizeMm(paper, landscape) {
  const [w, h] = PAPER_MM[paper] || PAPER_MM.a4;
  return landscape ? { w: h, h: w } : { w, h };
}

// The grid for n pages, matching the map's shape on the page's shape.
export function tileGrid(n, mapW, mapH, pageW, pageH) {
  if (n <= 1) return { cols: 1, rows: 1 };
  const options = [];
  for (let c = 1; c <= n; c++) if (n % c === 0) options.push({ cols: c, rows: n / c });
  const want = (mapW / mapH) / (pageW / pageH);
  return options.reduce((a, b) => (Math.abs(Math.log(b.cols / b.rows / want)) < Math.abs(Math.log(a.cols / a.rows / want)) ? b : a));
}

/**
 * pic: { svg, width, height, viewBox: { x, y, w, h } } from renderMapSvg / mapPicture
 * opts: { title, paper, landscape, margin (mm), header, footer, pages, color, lang, date }
 * → { html, pages, size: { w, h } (mm) }
 */
export function printDocument(pic, opts = {}) {
  const size = pageSizeMm(opts.paper || 'a4', !!opts.landscape);
  const m = Number(opts.margin ?? 10);
  const headH = opts.header ? 9 : 0;
  const footH = opts.footer ? 7 : 0;
  const areaW = size.w - m * 2, areaH = size.h - m * 2 - headH - footH;
  const vb = pic.viewBox;
  const { cols, rows } = tileGrid(Number(opts.pages) || 1, vb.w, vb.h, areaW, areaH);
  const tw = vb.w / cols, th = vb.h / rows;
  const inner = pic.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const date = opts.date || new Date().toLocaleDateString(opts.lang === 'ko' ? 'ko-KR' : 'en-US');
  const total = cols * rows;
  const pages = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c + 1;
      const box = `${vb.x + c * tw} ${vb.y + r * th} ${tw} ${th}`;
      pages.push(`<section class="page">
${opts.header ? `<header>${esc(opts.title || '')}</header>` : ''}
<div class="area"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" preserveAspectRatio="xMidYMid meet">${inner}</svg></div>
${opts.footer ? `<footer><span>${esc(date)}</span><span>${n} / ${total}</span></footer>` : ''}
</section>`);
    }
  }
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(opts.title || 'Map')}</title>
<style>
@page{size:${size.w}mm ${size.h}mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:-apple-system,'Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif}
.page{width:${size.w}mm;height:${size.h}mm;padding:${m}mm;display:flex;flex-direction:column;page-break-after:always;break-after:page;overflow:hidden}
.page:last-child{page-break-after:auto;break-after:auto}
header{height:${headH}mm;font-size:11pt;font-weight:700;color:#1f2933;border-bottom:0.3mm solid #c5ccd6;display:flex;align-items:center;margin-bottom:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.area{flex:1;min-height:0;display:flex}
.area svg{width:100%;height:100%;display:block}
footer{height:${footH}mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:8pt;color:#6b7785}
${opts.color === false ? 'html,body{filter:grayscale(1)}' : ''}
@media screen{body{background:#e9ecef}.page{background:#fff;margin:0 auto 8mm;box-shadow:0 1mm 4mm rgba(0,0,0,.25)}}
</style></head><body>
${pages.join('\n')}
</body></html>`;
  return { html, pages: total, size, grid: { cols, rows } };
}
