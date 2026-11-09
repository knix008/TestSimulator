// Printing the site: each page is drawn at a device width (desktop, tablet, phone) and laid on
// sheets of paper. "Page width" scales the page to the paper's width and cuts it into as many
// sheets as it needs; "whole page" shrinks it onto one sheet; a percentage scales the
// page-width size. Every sheet can have a header (site · page, date) and a footer (sheet number).
// Pure arithmetic: the print window measures the pages' heights and draws the sheets.

/** The print window reads the job (pages as HTML) from IndexedDB under this key. */
export const PRINT_JOB_KEY = 'print-job';
/** The print window's own choices (paper, margins …) in localStorage. */
export const PRINT_SETUP_KEY = 'myhomemaker.print';

/** Paper sizes in millimetres (portrait). */
export const PAPERS = { A3: { width: 297, height: 420 }, A4: { width: 210, height: 297 }, A5: { width: 148, height: 210 }, B4: { width: 250, height: 353 }, B5: { width: 176, height: 250 }, Letter: { width: 215.9, height: 279.4 }, Legal: { width: 215.9, height: 355.6 } };
export const MARGINS = { none: 0, narrow: 6, normal: 12, wide: 20 };
export const RANGES = ['all', 'current', 'custom'];
export const FITS = ['width', 'page', 'percent'];
export const PRINT_DEVICES = { desktop: 1280, tablet: 820, mobile: 390 };
/** Height of the header and of the footer band, in millimetres. */
export const BAND_MM = 8;
/** No print job runs away with the printer (and the window): at most this many sheets. */
export const MAX_SHEETS = 300;
export const PX_PER_MM = 96 / 25.4;

export function defaultPrintOptions() {
  return { printer: '', copies: 1, paper: 'A4', orientation: 'portrait', margin: 'normal', fit: 'width', scale: 100, device: 'desktop', header: true, footer: true, headerText: '', footerText: '', background: true, range: 'all', from: 1, to: 999 };
}

/** Options as given, with every value inside what it may be. */
export function normalizePrintOptions(options = {}) {
  const o = { ...defaultPrintOptions(), ...options };
  const int = (value, min, max, fallback) => { const n = Math.round(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
  return {
    ...o,
    paper: PAPERS[o.paper] ? o.paper : 'A4',
    orientation: o.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin: o.margin in MARGINS ? o.margin : 'normal',
    fit: FITS.includes(o.fit) ? o.fit : 'width',
    scale: int(o.scale, 10, 400, 100),
    device: o.device in PRINT_DEVICES ? o.device : 'desktop',
    range: RANGES.includes(o.range) ? o.range : 'all',
    copies: int(o.copies, 1, 99, 1),
    from: int(o.from, 1, 9999, 1),
    to: int(o.to, 1, 9999, 999),
    header: Boolean(o.header), footer: Boolean(o.footer), background: Boolean(o.background),
    headerText: String(o.headerText ?? ''), footerText: String(o.footerText ?? ''), printer: String(o.printer ?? ''),
  };
}

/** The pages chosen by the range: all, the current one, or from…to (1-based, in site order). */
export function selectPrintPages(pages, options, currentPageId = null) {
  const o = normalizePrintOptions(options);
  if (o.range === 'current') return pages.filter((page) => page.id === currentPageId).slice(0, 1);
  if (o.range === 'custom') return pages.slice(o.from - 1, Math.max(o.from, o.to));
  return pages.slice();
}

/** The paper as it lies (landscape swaps the sides), in millimetres. */
export function paperSize(options) {
  const o = normalizePrintOptions(options);
  const paper = PAPERS[o.paper];
  return o.orientation === 'landscape' ? { width: paper.height, height: paper.width } : { ...paper };
}

/**
 * The sheets for pages whose heights (CSS px at the device width) are known:
 * { paper, margin, area: { width, height } (mm), deviceWidth, sheets: [{ pageId, pageName, pageIndex, part, parts, number,
 *   scale, offset (px of the page at the top of the sheet), left (mm, centring) }], count, truncated }.
 */
export function layoutSheets(pages, options) {
  const o = normalizePrintOptions(options);
  const paper = paperSize(o);
  const margin = MARGINS[o.margin];
  const bands = (o.header ? BAND_MM : 0) + (o.footer ? BAND_MM : 0);
  const area = { width: paper.width - 2 * margin, height: Math.max(20, paper.height - 2 * margin - bands) };
  const deviceWidth = PRINT_DEVICES[o.device];
  const areaWidthPx = area.width * PX_PER_MM;
  const areaHeightPx = area.height * PX_PER_MM;
  const sheets = [];
  let truncated = false;
  pages.forEach((page, pageIndex) => {
    const height = Math.max(1, Number(page.height) || 1);
    let scale = areaWidthPx / deviceWidth;
    if (o.fit === 'page') scale = Math.min(scale, areaHeightPx / height);
    if (o.fit === 'percent') scale *= o.scale / 100;
    // Content wider than the paper (a percentage over 100) is cut at the right edge, as a browser prints it.
    const step = areaHeightPx / scale;
    const parts = o.fit === 'page' ? 1 : Math.max(1, Math.ceil((height - 0.5) / step));
    const left = Math.max(0, (areaWidthPx - deviceWidth * scale) / 2) / PX_PER_MM;
    for (let part = 0; part < parts; part += 1) {
      if (sheets.length >= MAX_SHEETS) { truncated = true; return; }
      sheets.push({ pageId: page.id, pageName: page.name, pageIndex, part, parts, number: sheets.length + 1, scale, offset: part * step, left });
    }
  });
  return { paper, margin, area, deviceWidth, sheets, count: sheets.length, truncated };
}

/**
 * A page's HTML as it is printed: no scripts (they do not run in the print frames anyway), every picture loaded at
 * once (lazy ones would print empty), and, without backgrounds, plain colours on white.
 */
export function printableHtml(html, { background = true } = {}) {
  let out = String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\sloading=(["'])lazy\1/gi, '');
  const extra = `<style data-print>html,body{overflow:hidden!important}*{animation:none!important;transition:none!important}${background ? '' : '*{background:transparent!important;box-shadow:none!important;color:#000!important}'}</style>`;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${extra}</head>`) : extra + out;
  return out;
}

/** The text of a sheet's header and footer. `t` is the i18n function. */
export function bandTexts(sheet, layout, options, { siteName = '', date = new Date(), t = (key, values) => `${key} ${JSON.stringify(values ?? {})}` } = {}) {
  const o = normalizePrintOptions(options);
  const title = o.headerText.trim() || [siteName, sheet.pageName].filter(Boolean).join(' · ');
  const page = sheet.parts > 1 ? `${sheet.pageName} (${sheet.part + 1}/${sheet.parts})` : sheet.pageName;
  return {
    headerLeft: o.headerText.trim() ? title : [siteName, page].filter(Boolean).join(' · '),
    headerRight: date.toLocaleDateString(),
    footer: o.footerText.trim() ? `${o.footerText.trim()} — ${t('print.sheetOf', { n: sheet.number, total: layout.count })}` : t('print.sheetOf', { n: sheet.number, total: layout.count }),
  };
}
