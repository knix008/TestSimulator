import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCodePrintHtml, isPagedPrint, printOptsOf } from '../src/lib/print.js';

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
});

test('a code listing can drop line numbers and the header', () => {
  const html = buildCodePrintHtml({ title: 't.c', path: 't.c', text, opts: { printHeader: false, printLineNumbers: false, printBorder: false, printPageNumbers: false, printDate: false } });
  assert.equal(html.includes('class="ln"'), false);
  assert.equal(html.includes('class="title"'), false);
  assert.equal(isPagedPrint(html), false);
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
  assert.match(html, /<body class="">/);
  const bw = buildCodePrintHtml({ title: 't.c', path: 't.c', text, opts: { printColor: false, printSyntax: false } });
  assert.match(bw, /<body class="bw">/);
});

test('a page border or page numbers split the listing into A4 pages', () => {
  const html = buildCodePrintHtml({ title: 't.c', path: '/tmp/t.c', text, opts: { printHeader: true, printLineNumbers: true, printBorder: true, printPageNumbers: true, printDate: false } });
  assert.equal(isPagedPrint(html), true);
  assert.match(html, /class="page"/);
  assert.match(html, /class="ln"/);
  assert.match(html, /\/tmp\/t\.c/);
  assert.match(html, /framed/);
});
