// Print pages for caricatures: paper, orientation, margins, how many pictures on a sheet, fit or
// fill, names under the pictures, header and footer. Pure: the print window draws the result as
// HTML sheets (preview and the pages the printer gets). Sizes are in millimetres.
export const PAPERS = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [250, 353], B5: [176, 250],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6], Photo4x6: [101.6, 152.4], Photo5x7: [127, 177.8],
};
export const MARGINS = { none: 0, narrow: 6.35, normal: 12.7, wide: 25.4 };
export const PER_PAGE = [1, 2, 4, 6, 9];
export const FITS = ['fit', 'fill'];
export const ORIENTATIONS = ['auto', 'portrait', 'landscape'];
export const SCOPES = ['selected', 'all', 'sheet'];
export const PRINT_KEY = 'myphotocut.print.v1';

export function defaultPrintOptions(language = 'ko') {
  return {
    printer: '', copies: 1, paper: language === 'ko' ? 'A4' : 'Letter', orientation: 'auto', margin: 'normal', perPage: 1, fit: 'fit',
    gap: 6, captions: true, border: false, grayscale: false, header: false, headerText: '', footer: true, footerText: '', scope: 'selected',
  };
}

export function normalizePrintOptions(raw = {}, language = 'ko') {
  const base = defaultPrintOptions(language);
  const o = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!PAPERS[o.paper]) o.paper = base.paper;
  if (!ORIENTATIONS.includes(o.orientation)) o.orientation = base.orientation;
  if (!(o.margin in MARGINS)) o.margin = base.margin;
  o.perPage = PER_PAGE.includes(Number(o.perPage)) ? Number(o.perPage) : 1;
  if (!FITS.includes(o.fit)) o.fit = base.fit;
  if (!SCOPES.includes(o.scope)) o.scope = base.scope;
  o.copies = Math.max(1, Math.min(99, Math.round(Number(o.copies) || 1)));
  o.gap = Math.max(0, Math.min(30, Math.round(Number(o.gap) || 0)));
  for (const key of ['captions', 'border', 'grayscale', 'header', 'footer']) o[key] = Boolean(o[key]);
  o.printer = typeof o.printer === 'string' ? o.printer : '';
  o.headerText = String(o.headerText ?? '').slice(0, 120);
  o.footerText = String(o.footerText ?? '').slice(0, 120);
  return o;
}

/** Columns × rows for a number of pictures on a sheet (more columns on landscape paper). */
export function gridOf(perPage, landscape) {
  const g = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 9: [3, 3] }[perPage] ?? [1, 1];
  return landscape ? [g[1], g[0]] : g;
}

/**
 * The sheets: { paper: { width, height }, pages: [{ cells: [{ image, x, y, w, h, caption }], header, footer }] }.
 * `images` = [{ name, url, width, height }] (pixels: only the proportion matters).
 */
export function layoutPages(images, raw, { title = '', footerDefault = 'MyPhotoCut' } = {}) {
  const o = normalizePrintOptions(raw);
  const [pw, ph] = PAPERS[o.paper];
  let landscape = o.orientation === 'landscape';
  if (o.orientation === 'auto') {
    // One picture per sheet: the paper turns like the picture; several: like their grid would fill best.
    const first = images[0];
    landscape = o.perPage === 1 && first ? first.width > first.height : false;
  }
  const paper = landscape ? { width: ph, height: pw } : { width: pw, height: ph };
  const m = MARGINS[o.margin];
  const headerH = o.header ? 8 : 0;
  const footerH = o.footer ? 7 : 0;
  const [cols, rows] = gridOf(o.perPage, landscape);
  const areaW = paper.width - 2 * m;
  const areaH = paper.height - 2 * m - headerH - footerH;
  const cellW = (areaW - (cols - 1) * o.gap) / cols;
  const cellH = (areaH - (rows - 1) * o.gap) / rows;
  const captionH = o.captions ? Math.min(7, cellH * 0.12) : 0;
  const pages = [];
  const total = Math.max(1, Math.ceil(images.length / o.perPage));
  for (let p = 0; p < images.length; p += o.perPage) {
    const cells = images.slice(p, p + o.perPage).map((image, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = m + col * (cellW + o.gap);
      const y = m + headerH + row * (cellH + o.gap);
      const boxH = cellH - captionH;
      let w = cellW;
      let h = boxH;
      if (o.fit === 'fit') {
        const scale = Math.min(cellW / image.width, boxH / image.height);
        w = image.width * scale;
        h = image.height * scale;
      }
      return { image, x: x + (cellW - w) / 2, y: y + (boxH - h) / 2, w, h, cell: { x, y, w: cellW, h: boxH }, caption: o.captions ? { x, y: y + boxH, w: cellW, h: captionH, text: image.name } : null };
    });
    const n = pages.length + 1;
    pages.push({
      cells,
      header: o.header ? { x: m, y: m, w: areaW, h: headerH, text: o.headerText || title } : null,
      footer: o.footer ? { x: m, y: paper.height - m - footerH, w: areaW, h: footerH, text: `${o.footerText || footerDefault}`, number: `${n} / ${total}` } : null,
    });
  }
  return { paper, landscape, options: o, pages };
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** One sheet as HTML in millimetres (`.pp-page`): the same markup for the preview and the printer. */
export function pageHtml(page, layout) {
  const { paper, options: o } = layout;
  const mm = (v) => `${v.toFixed(2)}mm`;
  const cells = page.cells.map((c) => `
    <div class="pp-cell${o.border ? ' border' : ''}" style="left:${mm(c.cell.x)};top:${mm(c.cell.y)};width:${mm(c.cell.w)};height:${mm(c.cell.h)}">
      <img src="${esc(c.image.url)}" alt="" style="left:${mm(c.x - c.cell.x)};top:${mm(c.y - c.cell.y)};width:${mm(c.w)};height:${mm(c.h)};object-fit:${o.fit === 'fill' ? 'cover' : 'contain'}${o.grayscale ? ';filter:grayscale(1)' : ''}" />
    </div>${c.caption ? `<div class="pp-caption" style="left:${mm(c.caption.x)};top:${mm(c.caption.y)};width:${mm(c.caption.w)};height:${mm(c.caption.h)};font-size:${(c.caption.h * 0.55).toFixed(2)}mm">${esc(c.caption.text)}</div>` : ''}`).join('');
  const header = page.header ? `<div class="pp-header" style="left:${mm(page.header.x)};top:${mm(page.header.y)};width:${mm(page.header.w)};height:${mm(page.header.h)}">${esc(page.header.text)}</div>` : '';
  const footer = page.footer ? `<div class="pp-footer" style="left:${mm(page.footer.x)};top:${mm(page.footer.y)};width:${mm(page.footer.w)};height:${mm(page.footer.h)}"><span>${esc(page.footer.text)}</span><span>${esc(page.footer.number)}</span></div>` : '';
  return `<div class="pp-page" style="width:${mm(paper.width)};height:${mm(paper.height)}">${header}${cells}${footer}</div>`;
}
