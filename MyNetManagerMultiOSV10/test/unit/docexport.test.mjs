import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, exportDocument, textWidth, toDocx, toHtml, toLines, toMarkdown, toPdf, zipStored } from '../../src/domain/export/docexport.js';
import { encodeGif, quantize } from '../../src/domain/export/images.js';

const dec = new TextDecoder();
const DOC = {
  title: '전문가 정보',
  subtitle: 'sample.pcapng',
  note: '3 items',
  columns: [{ label: 'Severity' }, { label: 'Summary' }, { label: 'Count', num: true }],
  rows: [
    { depth: 0, cells: ['경고', 'TCP', '2'] },
    { depth: 1, cells: ['Retransmission', 'tcp', '12'] },
    { depth: 0, cells: ['Note', 'DNS | A', '1'] },
  ],
};

/** The entries of a stored ZIP: name → bytes (and checks each CRC). */
function unzipStored(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    assert.equal(crc32(data), crc, `CRC of ${name}`);
    files.set(name, data);
    at += 30 + nameLen + size;
  }
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50, 'end of central directory');
  return files;
}

test('docexport: CRC-32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('docexport: a stored ZIP lists every entry with its size and CRC', () => {
  const zip = zipStored([{ name: 'a.txt', data: 'hello' }, { name: '폴더/b.bin', data: Uint8Array.of(1, 2, 3) }]);
  const files = unzipStored(zip);
  assert.deepEqual([...files.keys()], ['a.txt', '폴더/b.bin']);
  assert.equal(dec.decode(files.get('a.txt')), 'hello');
});

test('docexport: Markdown has the title, a right-aligned number column and escaped pipes', () => {
  const md = toMarkdown(DOC);
  assert.match(md, /^# 전문가 정보\n/);
  assert.match(md, /\| Severity \| Summary \| Count \|\n\| --- \| --- \| ---: \|/);
  assert.match(md, /DNS \\\| A/);
  assert.match(md, /(&nbsp;){4}Retransmission/, 'a child row is indented');
});

test('docexport: Markdown pictures are embedded or linked by name', () => {
  const img = { dataUrl: 'data:image/png;base64,AAAA', caption: 'I/O [graph]' };
  assert.match(toMarkdown({ title: 'g', images: [img] }), /!\[I\/O graph\]\(data:image\/png;base64,AAAA\)/);
  assert.match(toMarkdown({ title: 'g', images: [{ ...img, href: 'g-1.png' }] }), /!\[I\/O graph\]\(g-1\.png\)/);
});

test('docexport: HTML is a whole page with escaped cells and banded rows', () => {
  const html = toHtml(DOC, { lang: 'en' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<td class="num">12<\/td>/);
  assert.match(html, /nth-child\(even\)/);
  assert.match(toHtml({ title: '<x>', pre: ['a < b'] }), /<pre>a &lt; b<\/pre>/);
});

test('docexport: print lines line up even with Hangul (two columns wide)', () => {
  assert.equal(textWidth('경고a'), 5);
  const lines = toLines(DOC);
  const head = lines.find((l) => l.startsWith('Severity'));
  const row = lines.find((l) => l.startsWith('경고'));
  assert.ok(head && row);
  // The Count column ends in the same display column on every row (right-aligned).
  assert.equal(textWidth(head), textWidth(row));
});

test('docexport: the Word file has a document, a table with a repeated header and the title', () => {
  const files = unzipStored(toDocx(DOC));
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml']) assert.ok(files.has(name), name);
  const xml = dec.decode(files.get('word/document.xml'));
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:tblHeader\/>/);
  assert.match(xml, /전문가 정보/);
  assert.match(xml, /DNS \| A/);
  assert.equal((xml.match(/<w:tr>/g) ?? []).length, 4, 'header + 3 rows');
});

test('docexport: a PNG picture goes into the Word file as a media part', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';
  const files = unzipStored(toDocx({ title: 'g', images: [{ dataUrl: `data:image/png;base64,${png}`, caption: 'graph' }] }));
  assert.ok(files.has('word/media/image1.png'));
  assert.match(dec.decode(files.get('word/_rels/document.xml.rels')), /media\/image1\.png/);
  assert.match(dec.decode(files.get('word/document.xml')), /r:embed="rImg1"/);
});

test('docexport: the PDF has a page per screenful, the Korean font and a valid cross-reference table', () => {
  const many = { ...DOC, rows: Array.from({ length: 200 }, (_, i) => ({ cells: ['경고', `row ${i}`, String(i)] })) };
  const pdf = toPdf(many);
  const text = Array.from(pdf, (b) => String.fromCharCode(b)).join('');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /HYGoThic-Medium-UniKS-UCS2-H/);
  const count = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)[1]);
  assert.ok(count >= 3, `pages: ${count}`);
  // Every xref offset points at "<n> 0 obj".
  const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1]);
  const entries = text.slice(xrefAt).split('\n').slice(3).filter((l) => / 00000 n $/.test(l));
  entries.forEach((line, i) => assert.equal(text.slice(Number(line.slice(0, 10)), Number(line.slice(0, 10)) + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});

test('docexport: every format comes out of exportDocument, an unknown one is refused', () => {
  assert.equal(typeof exportDocument(DOC, 'html'), 'string');
  assert.equal(typeof exportDocument(DOC, 'markdown'), 'string');
  assert.ok(exportDocument(DOC, 'pdf') instanceof Uint8Array);
  assert.ok(exportDocument(DOC, 'docx') instanceof Uint8Array);
  assert.throws(() => exportDocument(DOC, 'odt'));
});

test('images: a GIF is GIF89a with the size, a palette and the trailer', () => {
  const width = 4;
  const height = 3;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set(i % 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
  const gif = encodeGif(width, height, rgba);
  assert.equal(dec.decode(gif.subarray(0, 6)), 'GIF89a');
  assert.equal(gif[6] | (gif[7] << 8), width);
  assert.equal(gif[8] | (gif[9] << 8), height);
  assert.equal(gif[gif.length - 1], 0x3b);
});

test('images: more than 256 colours are reduced to a 256-colour palette', () => {
  const n = 4096;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) rgba.set([i & 255, (i >> 4) & 255, (i * 7) & 255, 255], i * 4);
  const q = quantize(rgba, 256);
  assert.ok(q.count <= 256 && q.count > 16);
  assert.equal(q.indices.length, n);
});
