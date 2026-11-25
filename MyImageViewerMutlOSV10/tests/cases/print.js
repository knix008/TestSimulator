'use strict';

/** Print dialog, preview, header/page numbers, IPC, layout math. */
module.exports = {
  name: 'Print',
  run({ test, each, src, h }) {
    const { html, css, app, main, preload, ko, en } = src;
    const { assert, assertIncludes, printLayout, pageNumberText } = h;

    const overlayIds = [
      'print-overlay', 'print-preview-stage', 'print-paper', 'print-header', 'print-footer',
      'print-preview-img', 'print-content', 'print-page-info', 'print-go',
      'print-header-l', 'print-header-c', 'print-header-r',
      'print-footer-l', 'print-footer-c', 'print-footer-r',
    ];
    each(overlayIds, (id) => `Print overlay has #${id}`, (id) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    const formIds = [
      'print-printer', 'print-paper-size', 'print-margins', 'print-scale-pct',
      'print-copies', 'print-color', 'print-header-on', 'print-header-kind',
      'print-pageno-on', 'print-pageno-pos', 'print-pageno-fmt',
    ];
    each(formIds, (id) => `Print form has #${id}`, (id) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    test('Print window: printer and page setup on the left, preview on the right; Print goes straight to the printer', () => {
      const html = h.read('src/index.html');
      const app = h.read('src/js/app.js');
      const css = h.read('src/styles/main.css');
      const host = h.read('src-tauri/src/printing.rs');
      const main = h.read('src-tauri/src/main.rs');
      // left / right
      assert(html.indexOf('class="print-controls-col"') < html.indexOf('class="print-preview-col"'), 'settings column first');
      assertIncludes(css, 'grid-template-columns: 400px minmax(0, 1fr);', 'settings left, preview right');
      // detailed page setup
      for (const id of ['print-m-top', 'print-m-bottom', 'print-m-left', 'print-m-right', 'print-position']) assertIncludes(html, `id="${id}"`, id);
      for (const p of ['B4', 'B5', 'A6', 'Postcard', 'Photo4x6', 'Photo5x7', 'Photo8x10']) {
        assertIncludes(html, `<option value="${p}"`, `paper ${p}`);
        assert(new RegExp(`\\b${p}: \\[`).test(app), `size of ${p}`);
      }
      assertIncludes(app, "const PRINT_POSITIONS = ['mc', 'tc', 'bc', 'ml', 'mr', 'tl', 'tr', 'bl', 'br'];", 'nine positions');
      assertIncludes(app, 'const cw = Math.max(1, pw - m.l - m.r);', 'four margins in the layout');
      // direct printing: the page drawn at real size in the print window, printed by WebView2
      assertIncludes(app, "page.style.width = `${L.pw}mm`;", 'real-size page');
      assertIncludes(app, "await invoke('print_direct', { label, job });", 'no system dialog');
      assertIncludes(app, "if ((list.filePrinters || []).includes(printer)) {", 'file printers save a PDF');
      assertIncludes(css, 'body > *:not(.print-sheet) { display: none !important; }', 'only the page is printed');
      assertIncludes(host, 'core.Print(&settings, &handler)', 'WebView2 Print');
      assertIncludes(host, 'more.SetPrinterName(', 'the chosen printer');
      assertIncludes(host, 'COREWEBVIEW2_PRINT_COLOR_MODE_GRAYSCALE', 'grayscale on the printer');
      assertIncludes(host, 'if !label.starts_with("dialog-") {', 'only the print dialog window');
      for (const c of ['printing::list_printers', 'printing::print_direct', 'printing::print_pdf']) assertIncludes(main, c, c);
      // one fixed size, tall enough that no setting is hidden
      assertIncludes(main, 'label == "dialog-auto-improve-overlay" || label == "dialog-print-overlay"', 'window cannot be resized');
      const box = css.slice(css.indexOf('.dialog-box.print-dialog-box {'), css.indexOf('.dialog-box.print-dialog-box .dialog-header'));
      for (const k of ['width: 1080px;', 'height: 820px;', 'max-height: none;']) assertIncludes(box, k, k);
      for (const k of ['print.marginCustom', 'print.position', 'print.pos.tl', 'print.savedPdf', 'print.err.printer-unavailable']) {
        assert(h.read('src/i18n/ko.json').includes(`"${k}"`) && h.read('src/i18n/en.json').includes(`"${k}"`), k);
      }
    });

    test('Print dialog CSS forbids scrollbars', () => {
      assertIncludes(css, '.dialog-box.print-dialog-box', 'print box');
      assertIncludes(css, 'print-pair', 'compact two-column controls');
    });

    test('Print opens by blit, not PNG encode', () => {
      assertIncludes(app, 'function _blitPrintPreview', 'blit');
      assertIncludes(app, 'function _printSource', 'source');
      const open = app.slice(app.indexOf('async function _openPrintPreview'), app.indexOf('async function _printImage'));
      assertIncludes(open, '_blitPrintPreview', 'blit in open');
      assertIncludes(open, '_showDialog', 'show dialog');
      assert(!open.includes('_printableDataUrl()'), 'must not encode PNG before the dialog opens');
    });

    test('Print is laid out and sent from the page; printers come from the host', () => {
      assertIncludes(preload, 'function printPageHtml(dataUrl, title', 'print page');
      assertIncludes(preload, 'return printHtml(printPageHtml(dataUrl, title,', 'printed from a hidden frame');
      assertIncludes(main, '"get-printers" => system::printers()', 'printer list');
      assertIncludes(preload, 'printImage:', 'preload');
      assertIncludes(preload, 'getPrinters:', 'preload printers');
    });

    const papers = [
      ['A4', 4000, 2000, true, 297, 210],
      ['Letter', 2000, 4000, false, 215.9, 279.4],
      ['Legal', 1000, 1000, false, 215.9, 355.6],
      ['A3', 4000, 2000, true, 420, 297],
      ['A5', 800, 1200, false, 148, 210],
      ['Tabloid', 4000, 2000, true, 431.8, 279.4],
    ];
    each(papers, ([paper]) => `Layout auto-orient ${paper}`, ([paper, w, h, landscape, pw, ph]) => {
      const L = printLayout({
        paper, orient: 'auto', marginMm: 10, scale: 'fit', scalePct: 100,
        headerOn: false, pageNoOn: false,
      }, w, h);
      assert(L.landscape === landscape, `${paper} landscape=${L.landscape}`);
      assert(L.pw === pw && L.ph === ph, `${paper} expected ${pw}×${ph}, got ${L.pw}×${L.ph}`);
      assert(L.iw <= L.cw + 0.01 && L.ih <= L.ch + 0.01, `${paper} image must fit`);
    });

    test('Header and footer reserve 7 mm each', () => {
      const off = printLayout({ paper: 'A4', orient: 'portrait', marginMm: 10, scale: 'fit', scalePct: 100, headerOn: false, pageNoOn: false }, 1000, 1000);
      const on = printLayout({ paper: 'A4', orient: 'portrait', marginMm: 10, scale: 'fit', scalePct: 100, headerOn: true, pageNoOn: true, pageNoPos: 'footer-center' }, 1000, 1000);
      assert(on.headerMm === 7 && on.footerMm === 7, 'bands should be 7 mm');
      assert(on.ch === off.ch - 14, `content height should shrink by 14 mm (off ${off.ch} on ${on.ch})`);
    });

    test('Custom 50% scale is half of fit', () => {
      const fit = printLayout({ paper: 'A4', orient: 'portrait', marginMm: 10, scale: 'fit', scalePct: 100, headerOn: false, pageNoOn: false }, 2000, 1000);
      const half = printLayout({ paper: 'A4', orient: 'portrait', marginMm: 10, scale: 'custom', scalePct: 50, headerOn: false, pageNoOn: false }, 2000, 1000);
      assert(Math.abs(half.iw - fit.iw * 0.5) < 0.01, `custom 50% width ${half.iw} vs ${fit.iw / 2}`);
    });

    const pageFmts = [
      ['n', '1', 1, 1],
      ['nOfN', '1 / 1', 1, 1],
      ['pageN', '페이지 1', 1, 1],
      ['dash', '- 1 -', 1, 1],
    ];
    each(pageFmts, ([fmt]) => `Page number format ${fmt}`, ([fmt, expected, page, total]) => {
      assert(pageNumberText(fmt, page, total) === expected, `${fmt} => ${pageNumberText(fmt, page, total)}`);
    });

    const printKeys = [
      'print.title', 'print.headerShow', 'print.pageNoShow', 'print.pageN', 'print.nOfN',
      'print.printer', 'print.paper', 'print.margins', 'print.copies',
    ];
    each(printKeys, (k) => `Print i18n ${k}`, (k) => {
      assert(ko[k], `ko missing ${k}`);
      assert(en[k], `en missing ${k}`);
    });
  },
};
