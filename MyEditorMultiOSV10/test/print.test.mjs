import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCodePrintHtml, isPagedPrint, printOptsOf, pageSizeMm, paperOf } from '../src/lib/print.js';
import { buildPrintDialogHtml, normalizePrinters, printerOptionsHtml } from '../electron/print-dialog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const text = 'int x = 1;\nint y = 2;';

test('print options default to a pretty listing', () => {
  const o = printOptsOf({});
  assert.equal(o.printHeader, true);
  assert.equal(o.printLineNumbers, true);
  assert.equal(o.printSyntax, true);
  assert.equal(o.printColor, true);
  assert.equal(o.printZebra, true);
  assert.equal(o.printGutter, true);
  assert.equal(o.printWrap, true);
  assert.equal(o.printBorder, false);
  assert.equal(o.printPaper, 'a4');
  assert.equal(o.printLandscape, false);
  assert.equal(o.printMargin, 12);
});

test('a code listing can drop line numbers and the header', () => {
  const html = buildCodePrintHtml({ title: 't.c', path: 't.c', text, opts: { printHeader: false, printLineNumbers: false, printBorder: false, printPageNumbers: false, printDate: false } });
  assert.equal(html.includes('class="ln"'), false);
  assert.equal(html.includes('class="title"'), false);
  assert.equal(isPagedPrint(html), true);
  assert.match(html, /<tr>/);
});

test('syntax spans and zebra rows are used when asked', () => {
  const html = buildCodePrintHtml({
    title: 't.c', path: 't.c', lang: 'C', text,
    lineHtml: ['<span class="k">int</span> x = <span class="n">1</span>;', 'int y = 2;'],
    opts: { printSyntax: true, printZebra: true, printColor: true, printHeader: true, printLineNumbers: true },
  });
  assert.match(html, /class="k"/);
  assert.match(html, /class="z"/);
  assert.match(html, /<body class="paged">/);
  const bw = buildCodePrintHtml({ title: 't.c', path: 't.c', text, opts: { printColor: false, printSyntax: false } });
  assert.match(bw, /<body class="paged bw">/);
});

test('a listing is always split into separate A4 pages', () => {
  const long = Array.from({ length: 90 }, (_, i) => `line ${i + 1};`).join('\n');
  const html = buildCodePrintHtml({ title: 't.c', path: '/tmp/t.c', text: long, opts: { printHeader: true, printLineNumbers: true, printBorder: false, printPageNumbers: false, printDate: false } });
  assert.equal(isPagedPrint(html), true);
  assert.match(html, /class="page"/);
  assert.match(html, /break-after:page/);
  assert.match(html, /data-n="1 \/ /);
  const pages = html.match(/class="page"/g) || [];
  assert.ok(pages.length >= 2, `expected more than one sheet, got ${pages.length}`);
  assert.doesNotMatch(html, /class="sheet"/);
  const framed = buildCodePrintHtml({ title: 't.c', path: '/tmp/t.c', text, opts: { printHeader: true, printLineNumbers: true, printBorder: true, printPageNumbers: true, printDate: false } });
  assert.match(framed, /class="ln"/);
  assert.match(framed, /\/tmp\/t\.c/);
  assert.match(framed, /framed/);
  assert.match(framed, /class="page-foot"/);
  assert.match(framed, /has-foot/);
});

test('paper size, orientation and margin change the page box', () => {
  const letter = printOptsOf({ printPaper: 'letter', printLandscape: true, printMargin: 8 });
  assert.equal(letter.printPaper, 'letter');
  assert.equal(paperOf('letter').electron, 'Letter');
  const size = pageSizeMm(letter);
  assert.equal(size.w, 279.4);
  assert.equal(size.h, 215.9);
  const html = buildCodePrintHtml({ title: 't.c', path: 't.c', text, opts: letter });
  assert.match(html, /width:279.4mm/);
  assert.match(html, /height:215.9mm/);
  assert.match(html, /padding:8mm/);
  assert.match(html, /size:279.4mm 215.9mm/);
});

test('a wider margin splits a listing into more pages', () => {
  const long = Array.from({ length: 70 }, (_, i) => `line ${i + 1};`).join('\n');
  const pages = (opts) => (buildCodePrintHtml({ title: 't.c', path: 't.c', text: long, opts: { printHeader: false, printPageNumbers: false, printDate: false, ...opts } }).match(/class="page"/g) || []).length;
  assert.ok(pages({ printMargin: 25 }) >= pages({ printMargin: 6 }));
});

test('settings print tab lists paper, orientation and margin', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'dialogs', 'SettingsDialog.jsx'), 'utf8');
  assert.match(src, /set_print_page_setup/);
  assert.match(src, /printPaper/);
  assert.match(src, /printLandscape/);
  assert.match(src, /printMargin/);
  const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  assert.match(main, /pageSize: \(\{ a4:/);
});

test('the printer dialog embeds the page preview and destination list', () => {
  const printers = normalizePrinters([
    { name: 'Office', displayName: 'Office Laser', isDefault: false },
    { name: 'Home', displayName: 'Home Inkjet', isDefault: true },
  ]);
  assert.equal(printers[1].isDefault, true);
  assert.match(printerOptionsHtml(printers), /selected[^>]*>Home Inkjet/);
  const page = buildPrintDialogHtml({
    title: '인쇄',
    html: '<!doctype html><html><body><h1>Hello print</h1></body></html>',
    printers,
    labels: { print: '인쇄', close: '취소', destination: '프린터' },
  });
  assert.match(page, /id="med-print-dialog"/);
  assert.match(page, /id="med-preview"/);
  assert.match(page, /id="med-printer"/);
  assert.match(page, /Hello print/);
  assert.match(page, /Office Laser/);
  assert.match(page, /Home Inkjet/);
  assert.doesNotMatch(page, /window\.print\s*\(/);
});

test('an empty printer list still offers the default destination', () => {
  const page = buildPrintDialogHtml({ title: 'Print', html: '<p>x</p>', printers: [] });
  assert.match(page, /id="med-noprinter"/);
  assert.match(page, /<option value="">/);
});

test('the desktop print dialog is a separate window, not an overlay on the editor', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'src', 'PopupWindow.jsx'), 'utf8');
  const preview = fs.readFileSync(path.join(root, 'src', 'dialogs', 'PrintPreviewDialog.jsx'), 'utf8');
  assert.match(app, /openPrintWindow\(job\)/);
  assert.match(main, /print:\s*\{\s*width:/);
  assert.match(main, /function openPrint\(/);
  assert.match(popup, /kind === 'print'/);
  assert.match(popup, /<PrintPreviewDialog embedded/);
  assert.match(preview, /print-pv-side/);
  assert.match(preview, /embedded=\{embedded\}/);
});
