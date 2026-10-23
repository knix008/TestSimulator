// The results report: the same blocks as Word, Markdown, CSV and PDF, pictures included; sections can be left out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectedBlocks, toCsv, toDocx, toMarkdown, toPdf } from '../../src/report/report.js';

// A 1×1 PNG and a tiny JPEG as data URLs.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';

const report = {
  title: '숫자 인식 — 학습 결과 보고서', date: '2026-10-23',
  blocks: [
    { kind: 'heading', level: 1, text: '개요', section: 'overview' },
    { kind: 'kv', rows: [['프로젝트', '숫자 인식'], ['클래스', '0, 1, 2']] },
    { kind: 'heading', level: 1, text: '학습 결과', section: 'results' },
    { kind: 'image', name: 'loss.png', dataUrl: PNG, width: 760, height: 300, caption: '손실' },
    { kind: 'table', head: ['에포크', '손실'], rows: [[1, '0.5'], [2, '0.2, "좋음"']] },
  ],
};

const unzip = async (blob) => {
  // Stored entries only (MyTrainer's zip writer): walk the local headers.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const files = {};
  for (let at = 0; view.getUint32(at, true) === 0x04034b50;) {
    const size = view.getUint32(at + 18, true); const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    files[name] = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    at += 30 + nameLength + size;
  }
  return files;
};

test('Word (.docx): the document, the content types and the picture embedded', async () => {
  const files = await unzip(toDocx(report));
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/media/image1.png']) assert.ok(files[part], part);
  const doc = new TextDecoder().decode(files['word/document.xml']);
  assert.match(doc, /숫자 인식/);
  assert.match(doc, /r:embed="rImg1"/);
  assert.match(doc, /<w:tbl>/);
  assert.equal((doc.match(/<w:p>/g) ?? []).length, (doc.match(/<\/w:p>/g) ?? []).length, 'paragraphs closed');
});

test('Markdown and CSV: the text and the pictures as files; CSV cells quoted', () => {
  const md = toMarkdown(report);
  assert.ok(md['images/loss.png']?.length > 0);
  assert.match(md['report.md'], /!\[손실\]\(images\/loss\.png\)/);
  assert.match(md['report.md'], /\| 에포크 \| 손실 \|/);
  const csv = toCsv(report);
  assert.ok(csv['report.csv'].startsWith('﻿'), 'BOM for Excel');
  assert.match(csv['report.csv'], /2,"0\.2, ""좋음"""/);
  assert.ok(csv['images/loss.png']);
});

test('sections can be left out', () => {
  const blocks = selectedBlocks(report, { results: false });
  assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'kv']);
  assert.ok(!toMarkdown(report, { sections: { results: false } })['images/loss.png']);
});

test('PDF: one page per drawn page, each a JPEG picture the size of the paper', () => {
  const page = (w, h) => ({ width: 300, height: 400, page: { width: w, height: h }, toDataURL: () => JPEG });
  const pdf = toPdf([page(595.28, 841.89), page(841.89, 595.28)], 'Report');
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.equal((text.match(/\/Type \/Page /g) ?? []).length, 2);
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.equal((text.match(/\/Filter \/DCTDecode/g) ?? []).length, 2);
  const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref', 'the cross-reference table is where the trailer says');
});
