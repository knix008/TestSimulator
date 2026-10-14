import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import UTIF from 'utif';
import { IMAGE_FORMATS, encodeBmp, encodeTiff, imageFormat, toSvg } from '../src/imageExport.js';

const I18N = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');

const RED_GREEN_BLUE_WHITE = Uint8Array.from([
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
  255, 255, 255, 255, 10, 20, 30, 255, 40, 50, 60, 255,
]);

test('export formats have labels and translated hints', () => {
  const ids = IMAGE_FORMATS.map((format) => format.id);
  assert.deepEqual(ids, ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg']);
  for (const format of IMAGE_FORMATS) {
    assert.ok(format.label && format.extension && format.mime, format.id);
    assert.equal(imageFormat(format.id), format);
    const translations = I18N.match(new RegExp(`^  ${format.hint}: '.+',$`, 'gm')) ?? [];
    assert.equal(translations.length, 2, `${format.hint} in ko and en`);
  }
  assert.equal(imageFormat('gif'), null);
});

test('bmp is a 24-bit bottom-up bitmap with padded rows', () => {
  const bytes = encodeBmp(RED_GREEN_BLUE_WHITE, 3, 2);
  const view = new DataView(bytes.buffer);
  const rowSize = 12;
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'BM');
  assert.equal(view.getUint32(2, true), 54 + rowSize * 2);
  assert.equal(view.getInt32(18, true), 3);
  assert.equal(view.getInt32(22, true), 2);
  assert.equal(view.getUint16(28, true), 24);
  const topRow = 54 + rowSize;
  assert.deepEqual([...bytes.subarray(topRow, topRow + 9)], [0, 0, 255, 0, 255, 0, 255, 0, 0]);
  assert.deepEqual([...bytes.subarray(54, 54 + 9)], [255, 255, 255, 30, 20, 10, 60, 50, 40]);
});

test('tiff decodes back to the same pixels', () => {
  const bytes = encodeTiff(RED_GREEN_BLUE_WHITE, 3, 2);
  const [page] = UTIF.decode(bytes.buffer);
  UTIF.decodeImage(bytes.buffer, page);
  assert.equal(page.width, 3);
  assert.equal(page.height, 2);
  assert.deepEqual([...UTIF.toRGBA8(page)], [...RED_GREEN_BLUE_WHITE]);
});

test('svg keeps the source aspect ratio and colors each glyph', () => {
  const result = {
    text: '#@\n<&',
    cols: 2,
    rows: 2,
    imageWidth: 400,
    imageHeight: 200,
    fontFamily: '"Cascadia Mono", monospace',
    colors: Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 16, 32, 48]),
  };
  const svg = toSvg(result, { cellWidth: 10 });
  assert.match(svg, /width="20" height="10"/);
  assert.match(svg, /fill="#ff0000">#</);
  assert.match(svg, /fill="#102030">&amp;</);
  assert.match(svg, />&lt;</);
  assert.match(svg, /font-family="&quot;Cascadia Mono&quot;, monospace"/);
});

test('the toolbar has print and export but no png button', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /btn-png/);
  const order = ['btn-file', 'btn-print', 'btn-edit', 'btn-copy', 'btn-txt', 'btn-html', 'btn-export', 'btn-theme'];
  const positions = order.map((id) => html.indexOf(`id="${id}"`));
  for (const [index, position] of positions.entries()) assert.ok(position > 0, order[index]);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.ok(html.indexOf('toolbar-end') < html.indexOf('id="btn-theme"'));
  assert.ok(html.indexOf('toolbar-end') > html.indexOf('id="btn-export"'));
});
