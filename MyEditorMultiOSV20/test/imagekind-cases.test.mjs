// Picture / hex / text classification shared by the editor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RASTER_EXT, isSvgName, isHeicName, isDicomName, isBinaryImageName, isImageName,
  restoreAsPicture, openKind, openMode, paneView, MAX_TEXT,
} from '../src/lib/imagekind.js';

for (const ext of [...RASTER_EXT].sort()) {
  test(`raster .${ext} opens as a picture name`, () => {
    const name = `photo.${ext}`;
    assert.equal(isBinaryImageName(name), true);
    assert.equal(isImageName(name), true);
    assert.equal(isSvgName(name), false);
    assert.equal(openKind(name), 'picture');
    assert.equal(openKind(name, { force: true }), 'picture');
    assert.equal(openMode({ name }), 'hex');
    assert.equal(restoreAsPicture({ name, path: `C:/x/${name}` }), true);
  });
}

test('SVG is a text document with a live preview, not a raster fill', () => {
  assert.equal(isSvgName('icon.SVG'), true);
  assert.equal(isBinaryImageName('icon.svg'), false);
  assert.equal(isImageName('icon.svg'), true);
  assert.equal(openKind('icon.svg'), 'svg');
  assert.equal(openMode({ name: 'icon.svg', sniff: { binary: false, size: 100 } }), 'text');
  const view = paneView({ name: 'icon.svg', kind: 'text' }, { imagePreview: true, minimap: true });
  assert.equal(view.svgPreview, true);
  assert.equal(view.fillPicture, false);
});

test('HEIC / HEIF and DICOM names are recognized', () => {
  assert.equal(isHeicName('a.heic'), true);
  assert.equal(isHeicName('a.HEIF'), true);
  assert.equal(isHeicName('a.png'), false);
  assert.equal(isDicomName('scan.dcm'), true);
  assert.equal(isDicomName('scan.dicom'), true);
  assert.equal(isDicomName('scan.png'), false);
});

test('unknown and text names stay unknown until sniffed', () => {
  assert.equal(openKind('a.bin'), 'unknown');
  assert.equal(openKind('a.bin', { force: true }), 'text');
  assert.equal(openKind('a.txt'), 'unknown');
  assert.equal(isImageName('a.txt'), false);
  assert.equal(isBinaryImageName(''), false);
  assert.equal(isSvgName(''), false);
});

test('openMode: sniffed binary is hex; oversized text is too-big', () => {
  assert.equal(openMode({ name: 'a.bin', sniff: { binary: true, size: 10 } }), 'hex');
  assert.equal(openMode({ name: 'a.txt', sniff: { binary: false, size: MAX_TEXT + 1 } }), 'too-big');
  assert.equal(openMode({ name: 'a.txt', sniff: { binary: false, size: 12 } }), 'text');
  assert.equal(openMode({ name: 'a.txt', force: true }), 'text');
  assert.equal(openMode({ name: 'a.txt', encoding: 'cp949' }), 'text');
});

test('paneView: raster hex fills the pane; other binaries are a dump', () => {
  const pic = paneView({ kind: 'hex', name: 'a.png', imageHex: true }, { minimap: true });
  assert.equal(pic.fillPicture, true);
  assert.equal(pic.hexaBeside, true);
  assert.equal(pic.hexDump, false);
  assert.equal(pic.minimap, false);
  assert.equal(pic.canStructure, false);
  const dump = paneView({ kind: 'hex', name: 'a.bin' }, { minimap: true });
  assert.equal(dump.fillPicture, false);
  assert.equal(dump.hexDump, true);
  const md = paneView({ kind: 'text', name: 'a.md', langName: 'Markdown' }, { minimap: true });
  assert.equal(md.minimap, false);
  const js = paneView({ kind: 'text', name: 'a.js', langName: 'JavaScript' }, { minimap: true });
  assert.equal(js.minimap, true);
});

test('restoreAsPicture: drafts stay text; hex kind always restores as picture', () => {
  assert.equal(restoreAsPicture(null), false);
  assert.equal(restoreAsPicture({ draft: 'x', name: 'a.png' }), false);
  assert.equal(restoreAsPicture({ kind: 'hex', name: 'a.bin' }), true);
  assert.equal(restoreAsPicture({ name: 'notes.txt' }), false);
});
