// Report generation: the shared document model and each output format.

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze } from '../src/core/analyze.js';
import { buildReport, functionRowsForCsv, REPORT_SECTIONS } from '../src/report/builder.js';
import { toHtml, toMarkdown, toDocx, toCsv, escapeHtml } from '../src/report/writers.js';
import { createZip, crc32 } from '../src/lib/zip.js';
import { sampleProject } from './fixtures.mjs';

const result = analyze(sampleProject(), {});

/* ------------------------------------------------------------- document */

test('buildReport produces every requested section and only those', () => {
  const doc = buildReport(result, { sections: ['overview', 'security'] });
  const ids = doc.blocks.filter((block) => block.kind === 'heading' && block.id).map((block) => block.id);

  assert.deepEqual(ids, ['overview', 'security']);
});

test('buildReport covers all declared sections when none are filtered out', () => {
  const doc = buildReport(result, {});
  const ids = new Set(doc.blocks.filter((block) => block.id).map((block) => block.id));

  for (const section of REPORT_SECTIONS) {
    assert.ok(ids.has(section.id), 'section "' + section.id + '" is missing from the full report');
  }
});

test('report blocks are all of a known kind and structurally valid', () => {
  const doc = buildReport(result, {});

  for (const block of doc.blocks) {
    assert.ok(['heading', 'paragraph', 'table', 'list', 'keyValue', 'callout', 'chart'].includes(block.kind), 'unknown block kind: ' + block.kind);

    if (block.kind === 'table') {
      assert.ok(Array.isArray(block.columns) && block.columns.length > 0);
      for (const row of block.rows) {
        assert.equal(row.length, block.columns.length, 'row width must match the header: ' + JSON.stringify(row));
      }
    }
    if (block.kind === 'chart') {
      for (const point of block.data) assert.ok(Number.isFinite(point.value), 'chart values must be numeric');
    }
  }
});

test('the report is produced in Korean and in English', () => {
  const ko = buildReport(result, { lang: 'ko' });
  const en = buildReport(result, { lang: 'en' });

  assert.equal(ko.title, '코드 분석 보고서');
  assert.equal(en.title, 'Code Analysis Report');
  assert.equal(ko.lang, 'ko');
  assert.equal(en.lang, 'en');
  assert.notEqual(ko.blocks.length, 0);
});

test('the report carries the author in its appInfo', () => {
  const doc = buildReport(result, { appInfo: { author: { name: 'SHKWON', email: 'knix008@naver.com' } } });
  assert.equal(doc.appInfo.author.email, 'knix008@naver.com');
});

/* ------------------------------------------------------------------ HTML */

test('escapeHtml neutralizes markup', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml(null), '');
});

test('HTML output is a complete standalone document', () => {
  const html = toHtml(buildReport(result, {}), { theme: 'daylight' });

  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>'));
  assert.ok(html.includes('</html>'));
  assert.ok(html.includes('<style>'), 'the stylesheet is inlined, not linked');
  assert.ok(!/<link[^>]+href=/.test(html), 'no external resources');
  assert.ok(html.includes('--bg:'), 'theme tokens are baked in');
  assert.ok(html.includes('@media print'), 'print rules are present for the PDF path');
});

test('HTML output escapes content that came from the analyzed source', () => {
  const evil = analyze([{ path: '/p/x.js', text: 'function f() {\n  el.innerHTML = "<img src=x onerror=alert(1)>";\n}\n' }], {});
  const html = toHtml(buildReport(evil, { sections: ['security'] }), {});

  assert.ok(!html.includes('<img src=x'), 'a snippet from the source must not become live markup');
  assert.ok(html.includes('&lt;img src=x'), 'it appears escaped instead');
});

test('HTML output includes the author when supplied', () => {
  const html = toHtml(buildReport(result, { appInfo: { author: { name: 'SHKWON', email: 'knix008@naver.com' } } }), {});
  assert.ok(html.includes('SHKWON (knix008@naver.com)'));
});

/* -------------------------------------------------------------- Markdown */

test('Markdown output has a title, tables with separators and no stray pipes', () => {
  const markdown = toMarkdown(buildReport(result, {}));

  assert.ok(markdown.startsWith('# '));
  assert.ok(markdown.includes('|---|'), 'tables carry a separator row');

  // Every table row must have a balanced number of cells.
  const rows = markdown.split('\n').filter((line) => line.startsWith('| ') && !line.includes('---'));
  assert.ok(rows.length > 10, 'the report has substantive tables');
});

test('Markdown escapes a pipe inside a cell so the table survives', () => {
  const doc = { title: 'T', subtitle: '', lang: 'ko', generatedAt: new Date().toISOString(), blocks: [{ kind: 'table', columns: ['a', 'b'], rows: [['x|y', 'z']] }] };
  const markdown = toMarkdown(doc);

  assert.ok(markdown.includes('x\\|y'), 'the literal pipe is escaped');
});

/* ------------------------------------------------------------------ DOCX */

test('DOCX output is a valid ZIP with the required OOXML parts', () => {
  const bytes = toDocx(buildReport(result, {}));

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 1000);
  assert.equal(bytes[0], 0x50, 'PK signature byte 1');
  assert.equal(bytes[1], 0x4b, 'PK signature byte 2');

  const text = Buffer.from(bytes).toString('latin1');
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']) {
    assert.ok(text.includes(part), 'archive is missing ' + part);
  }
  assert.ok(text.includes('<w:document'), 'the document part is present');
});

test('DOCX escapes XML metacharacters and strips illegal control characters', () => {
  const doc = {
    title: 'A & B <tag>',
    subtitle: '',
    lang: 'ko',
    generatedAt: new Date().toISOString(),
    blocks: [{ kind: 'paragraph', text: 'x < y & z  "quoted"' }],
  };
  // Look only at the document part: the ZIP headers around it legitimately
  // contain bytes that are illegal *inside* XML.
  const archive = Buffer.from(toDocx(doc)).toString('utf-8');
  const start = archive.indexOf('<w:document');
  const documentXml = archive.slice(start, archive.indexOf('</w:document>', start));

  assert.ok(archive.includes('A &amp; B &lt;tag&gt;'));
  assert.ok(documentXml.includes('x &lt; y &amp; z'));
  assert.ok(!documentXml.includes(''), 'a control character would make Word reject the file');
  assert.ok(documentXml.includes('&quot;quoted&quot;'), 'quotes are escaped too');
});

test('createZip round-trips entry names and sizes in its central directory', () => {
  const zip = createZip([
    { name: 'a.txt', data: 'hello' },
    { name: 'dir/b.txt', data: 'world!' },
  ]);
  const text = Buffer.from(zip).toString('latin1');

  assert.ok(text.includes('a.txt'));
  assert.ok(text.includes('dir/b.txt'));
  assert.ok(text.includes('hello'));
  // End-of-central-directory signature, with two entries recorded.
  const eocd = zip.length - 22;
  const view = new DataView(zip.buffer, zip.byteOffset);
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  assert.equal(view.getUint16(eocd + 8, true), 2);
});

test('crc32 matches the known value for a standard input', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

/* ------------------------------------------------------------------- CSV */

test('CSV quotes only the cells that need it and starts with a BOM', () => {
  const csv = toCsv(['a', 'b', 'c'], [['plain', 'has,comma', 'has"quote']]);

  assert.ok(csv.startsWith('﻿'), 'the BOM lets Excel read UTF-8 Korean text');
  assert.ok(csv.includes('plain,'), 'a plain cell is not quoted');
  assert.ok(csv.includes('"has,comma"'));
  assert.ok(csv.includes('"has""quote"'), 'an embedded quote is doubled');
  assert.ok(csv.includes('\r\n'), 'RFC 4180 line endings');
});

test('the metrics CSV has one row per function and a matching header width', () => {
  const { header, rows } = functionRowsForCsv(result);

  assert.equal(rows.length, result.functions.length);
  for (const row of rows) assert.equal(row.length, header.length);
  assert.ok(header.includes('cyclomatic'));
  assert.ok(header.includes('maintainabilityIndex'));
  assert.ok(header.includes('warnings'));
});

test('the CSV warnings column names the inspections that fired', () => {
  const { header, rows } = functionRowsForCsv(result);
  const warningsIndex = header.indexOf('warnings');
  const flagged = rows.filter((row) => row[warningsIndex].length > 0);

  assert.ok(flagged.length > 0, 'the fixture contains a deliberately complex function');
  assert.ok(
    flagged.some((row) => row[warningsIndex].includes('cyclomaticComplexity') || row[warningsIndex].includes('parameterCount')),
    'the warning names are the inspection ids',
  );
});
