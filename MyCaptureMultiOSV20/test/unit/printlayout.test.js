// Print layout (printlayout.js) and the printed page (printwindow.js sheetHtml).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPrintOptions, FOOTER_MM, HEADER_MM, MARGINS, ORIENTATIONS, PAPERS, pageRule, printLayout, pxToMm, sanitizePrintOptions, SCALES,
} from '../../src/domain/printlayout.js';
import { messages } from '../../src/i18n.js';
import { sheetHtml } from '../../src/printwindow.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} ≠ ${expected}`);
const inside = (box, area) => box.x >= area.x - 1e-6 && box.y >= area.y - 1e-6 && box.x + box.width <= area.x + area.width + 1e-6 && box.y + box.height <= area.y + area.height + 1e-6;

test('print options: defaults and validation', () => {
  assert.deepEqual(sanitizePrintOptions(null), { ...defaultPrintOptions });
  assert.deepEqual(sanitizePrintOptions({ paper: 'B9', orientation: 'up', margin: 7, scale: 'huge', percent: 'x', header: 'yes' }), { ...defaultPrintOptions });
  assert.equal(sanitizePrintOptions({ percent: 1000 }).percent, 400);
  assert.equal(sanitizePrintOptions({ percent: 1 }).percent, 10);
  assert.equal(sanitizePrintOptions({ percent: 123 }).percent, 125, 'rounded to the slider step');
  assert.equal(sanitizePrintOptions({ margin: '15' }).margin, 15);
  for (const paper of Object.keys(PAPERS)) assert.equal(sanitizePrintOptions({ paper }).paper, paper);
});

test('print layout: "fit" fills the printable area without cropping, centred', () => {
  const layout = printLayout({ paper: 'A4', orientation: 'portrait', margin: 10, scale: 'fit', header: false, footer: false }, 1920, 1080);
  assert.deepEqual(layout.page, { width: 210, height: 297 });
  assert.deepEqual(layout.area, { x: 10, y: 10, width: 190, height: 277 });
  near(layout.image.width, 190, 'full width');
  near(layout.image.height, 190 * 1080 / 1920, 'aspect kept');
  near(layout.image.y + layout.image.height / 2, 10 + 277 / 2, 'centred vertically');
  assert.equal(layout.clipped, false);
  assert.ok(inside(layout.image, layout.area));
});

test('print layout: "auto" turns the paper to the image shape; header and footer take their rows', () => {
  const wide = printLayout({ orientation: 'auto' }, 1600, 900);
  assert.equal(wide.landscape, true);
  assert.deepEqual(wide.page, { width: 297, height: 210 });
  const tall = printLayout({ orientation: 'auto' }, 900, 1600);
  assert.equal(tall.landscape, false);
  assert.equal(printLayout({ orientation: 'landscape' }, 900, 1600).landscape, true, 'forced landscape');
  assert.equal(printLayout({ orientation: 'portrait' }, 1600, 900).landscape, false, 'forced portrait');
  const both = printLayout({ paper: 'A4', orientation: 'portrait', margin: 10, header: true, footer: true }, 100, 100);
  assert.equal(both.area.y, 10 + HEADER_MM);
  near(both.area.height, 297 - 20 - HEADER_MM - FOOTER_MM, 'area height');
  for (const orientation of ORIENTATIONS) for (const margin of MARGINS) for (const paper of Object.keys(PAPERS)) {
    const layout = printLayout({ paper, orientation, margin, scale: 'fit' }, 1366, 768);
    assert.ok(inside(layout.image, layout.area), `${paper}/${orientation}/${margin}: fit stays inside`);
  }
});

test('print layout: actual size, percent and fill', () => {
  // 96 px = one inch = 25.4 mm.
  near(pxToMm(96), 25.4, '96 px');
  const actual = printLayout({ scale: 'actual', orientation: 'portrait' }, 480, 240);
  near(actual.image.width, pxToMm(480), 'actual width');
  assert.equal(actual.zoom, 1);
  const half = printLayout({ scale: 'percent', percent: 50, orientation: 'portrait' }, 480, 240);
  near(half.image.width, pxToMm(240), '50%');
  // A big screenshot at actual size does not fit: clipped is reported.
  assert.equal(printLayout({ scale: 'actual', orientation: 'portrait' }, 3840, 2160).clipped, true);
  // Fill covers the area in both directions (cropping one).
  const fill = printLayout({ scale: 'fill', orientation: 'portrait', header: false, footer: false, margin: 0 }, 1920, 1080);
  assert.ok(fill.image.width >= fill.area.width - 1e-6 && fill.image.height >= fill.area.height - 1e-6, 'covers');
  near(fill.image.height, fill.area.height, 'one side exactly');
  assert.equal(fill.clipped, true);
  for (const scale of SCALES) assert.ok(Number.isFinite(printLayout({ scale }, 0, 0).zoom), `${scale}: a 0 × 0 image does not break it`);
});

test('printed page: @page rule and the sheet in millimetres', () => {
  const layout = printLayout({ paper: 'A4', orientation: 'landscape', margin: 10, header: true, footer: true, border: true }, 1600, 900);
  assert.equal(pageRule(layout), '@page { size: 297mm 210mm; margin: 0; }');
  const html = sheetHtml(layout, { url: 'asset://x.png', name: 'a<b>.png', date: '2026-11-20' });
  assert.match(html, /^<div class="print-sheet" style="width:297\.000mm;height:210\.000mm">/);
  assert.match(html, /class="print-sheet-head"[^>]*>a&lt;b&gt;\.png<\/div>/, 'file name escaped');
  assert.match(html, /class="print-sheet-image bordered" src="asset:\/\/x\.png"/);
  const image = /class="print-sheet-image[^"]*"[^>]*style="left:([\d.-]+)mm;top:([\d.-]+)mm;width:([\d.]+)mm;height:([\d.]+)mm"/.exec(html);
  near(Number(image[3]), Number(layout.image.width.toFixed(3)), 'image width in mm');
  near(Number(image[1]), Number((layout.image.x - layout.area.x).toFixed(3)), 'image left inside the area');
  assert.match(html, /class="print-sheet-foot"[^>]*><span>2026-11-20<\/span><span>MyCapture<\/span>/);
  const plain = sheetHtml(printLayout({ header: false, footer: false }, 10, 10), { url: 'u', name: 'n', date: 'd' });
  assert.doesNotMatch(plain, /print-sheet-head|print-sheet-foot/);
  assert.doesNotMatch(plain, /bordered/);
});

test('print: every label exists in Korean and English', () => {
  const keys = ['action.print', 'print.title', 'print.button', 'print.preview', 'print.paper', 'print.orientation', 'print.margin', 'print.scale',
    'print.header', 'print.footer', 'print.border', 'print.clipped', 'print.reset', 'print.loading', 'print.loadError', 'print.nothing', 'print.video',
    ...ORIENTATIONS.map((value) => `print.orient.${value}`), ...SCALES.map((value) => `print.scale.${value}`)];
  for (const language of ['ko', 'en']) for (const key of keys) assert.ok(messages[language][key], `${language}: ${key}`);
});
