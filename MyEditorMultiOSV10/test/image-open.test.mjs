// Opening raster images (picture fills the pane, optional Hexa beside it)
// and the same behaviour in a split: each pane keeps its own picture / Hexa.
//   npm test -- test/image-open.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodeIco } from '../scripts/ico.mjs';
import {
  isBinaryImageName, isSvgName, isImageName, isDicomName, isHeicName,
  openKind, paneView, restoreAsPicture,
} from '../src/lib/imagekind.js';

const require = createRequire(import.meta.url);
const files = require('../core/files');
const dicom = require('../core/dicom');
const png = require('../core/png');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myeditor-img-'));

const RASTER_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'heic', 'heif', 'dcm', 'dicom'];

function rgba(w, h, r = 40, g = 90, b = 200) {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255; }
  return out;
}

function encodeBmp(w, h, px) {
  const stride = (w * 3 + 3) & ~3;
  const buf = Buffer.alloc(54 + stride * h);
  buf.write('BM', 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(stride * h, 34);
  for (let y = 0; y < h; y++) {
    let o = 54 + (h - 1 - y) * stride;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      buf[o++] = px[i + 2]; buf[o++] = px[i + 1]; buf[o++] = px[i];
    }
  }
  return buf;
}

async function writeFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const px = rgba(8, 6);
  const pngBuf = png.encodeRgba(8, 6, px);
  fs.writeFileSync(path.join(dir, 'sample.png'), pngBuf);
  fs.writeFileSync(path.join(dir, 'sample.bmp'), encodeBmp(8, 6, px));
  fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="#3a86ff"/></svg>');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not an image\n');
  fs.writeFileSync(path.join(dir, 'sample.dcm'), dicom.encodeUncompressed({
    width: 8, height: 6, pixels: Uint8Array.from({ length: 48 }, (_, i) => i * 4),
    modality: 'CT', ww: 200, wl: 80, patientName: 'Case^Img',
  }));
  fs.writeFileSync(path.join(dir, 'sample.ico'), Buffer.from(encodeIco([{ size: 8, png: pngBuf }])));

  const sharp = (await import('sharp')).default;
  const jpg = await sharp(pngBuf).jpeg({ quality: 80 }).toBuffer();
  fs.writeFileSync(path.join(dir, 'sample.jpg'), jpg);
  fs.writeFileSync(path.join(dir, 'photo.jpeg'), jpg);
  fs.writeFileSync(path.join(dir, 'sample.webp'), await sharp(pngBuf).webp({ quality: 80 }).toBuffer());
  try {
    fs.writeFileSync(path.join(dir, 'sample.gif'), await sharp(pngBuf).gif().toBuffer());
  } catch {
    fs.writeFileSync(path.join(dir, 'sample.gif'), pngBuf);   // still a file named .gif for classification
  }
  try {
    fs.writeFileSync(path.join(dir, 'sample.avif'), await sharp(pngBuf).avif({ quality: 40 }).toBuffer());
  } catch { /* optional */ }
  return dir;
}

// Mirrors App.jsx: openPath → picture/hex vs SVG text; split panes; Hexa per document.
function createEditor() {
  let nextId = 1;
  const docs = [];
  let panes = [{ key: 1, docId: null }];
  let activePane = 0;
  const same = (a, b) => String(a || '').replace(/\\/g, '/').toLowerCase() === String(b || '').replace(/\\/g, '/').toLowerCase();

  const get = (id) => docs.find((d) => d.id === id) || null;
  const paneOf = (id) => panes.findIndex((p) => p.docId === id);

  function activate(id) {
    const pi = paneOf(id);
    if (pi >= 0) activePane = pi;
    else panes[activePane].docId = id;
  }
  function focusPane(i) { if (panes[i]) activePane = i; }

  function open(filePath, { force = false } = {}) {
    const name = path.basename(filePath);
    const existing = docs.find((d) => same(d.path, filePath));
    if (existing && !force) { activate(existing.id); return existing; }
    const kind = openKind(name, { force });
    const doc = {
      id: nextId++, name, path: filePath,
      kind: kind === 'picture' ? 'hex' : 'text',
      imageHex: false, readonly: kind === 'picture', langName: kind === 'svg' ? 'XML' : null,
    };
    docs.push(doc);
    activate(doc.id);
    return doc;
  }

  function setSplit(mode) {
    const count = mode === 'grid' ? 4 : mode === 'cols' || mode === 'rows' || mode === 'multi' ? 2 : 1;
    const shown = new Set(panes.map((p) => p.docId));
    const free = docs.map((d) => d.id).filter((id) => !shown.has(id));
    while (panes.length < count) panes.push({ key: panes.length + 1, docId: free.shift() ?? null });
    if (panes.length > count) panes = panes.slice(0, count);
    if (activePane >= panes.length) activePane = 0;
  }

  function showInPane(i, id) {
    const from = paneOf(id);
    if (from >= 0 && from !== i) panes[from].docId = null;
    panes[i].docId = id;
    activePane = i;
  }

  function toggleHex(id) {
    const d = get(id);
    if (!d || d.kind !== 'hex' || !isBinaryImageName(d.name)) return false;
    d.imageHex = !d.imageHex;
    return true;
  }

  function views(settings = { minimap: true, imagePreview: true }) {
    return panes.map((p, i) => {
      const doc = get(p.docId);
      return { i, active: i === activePane, doc, ...paneView(doc, settings) };
    });
  }

  return { docs, get panes() { return panes; }, get activePane() { return activePane; }, open, setSplit, showInPane, focusPane, toggleHex, views, activate, get };
}

const fixtures = await writeFixtures(path.join(tmp, 'img'));

test('raster extensions open as a picture; SVG stays text', () => {
  for (const ext of RASTER_EXTS) {
    assert.equal(isBinaryImageName(`a.${ext}`), true, ext);
    assert.equal(isSvgName(`a.${ext}`), false, ext);
    assert.equal(openKind(`photo.${ext}`), 'picture', ext);
  }
  assert.equal(isBinaryImageName('logo.svg'), false);
  assert.equal(isSvgName('logo.svg'), true);
  assert.equal(openKind('logo.svg'), 'svg');
  assert.equal(openKind('logo.SVG'), 'svg');
  assert.equal(openKind('notes.txt'), 'unknown');
  assert.equal(openKind('sample.png', { force: true }), 'text');
  assert.equal(isImageName('x.png'), true);
  assert.equal(isImageName('x.svg'), true);
  assert.equal(isImageName('x.js'), false);
  assert.equal(isDicomName('scan.dcm'), true);
  assert.equal(isHeicName('IMG.HEIC'), true);
});

test('a picture pane fills with the image: no minimap, Hexa optional beside it', () => {
  const off = paneView({ kind: 'hex', name: 'a.png', imageHex: false }, { minimap: true });
  assert.equal(off.fillPicture, true);
  assert.equal(off.hexaBeside, false);
  assert.equal(off.hexDump, false);
  assert.equal(off.minimap, false);
  assert.equal(off.canStructure, false);

  const on = paneView({ kind: 'hex', name: 'a.jpg', imageHex: true }, { minimap: true });
  assert.equal(on.fillPicture, true);
  assert.equal(on.hexaBeside, true);
  assert.equal(on.minimap, false);

  const svg = paneView({ kind: 'text', name: 'logo.svg' }, { imagePreview: true, minimap: true });
  assert.equal(svg.fillPicture, false);
  assert.equal(svg.hexaBeside, false);
  assert.equal(svg.svgPreview, true);
  assert.equal(svg.minimap, true);

  const bin = paneView({ kind: 'hex', name: 'app.exe' }, { minimap: true });
  assert.equal(bin.fillPicture, false);
  assert.equal(bin.hexDump, true);
});

test('opening each raster fixture is sniffed as binary and yields a data URL', async () => {
  const names = fs.readdirSync(fixtures).filter((n) => isBinaryImageName(n));
  assert.ok(names.length >= 6, `expected several rasters, got ${names.join(', ')}`);
  for (const name of names) {
    const p = path.join(fixtures, name);
    const sniff = await files.sniff(p);
    assert.equal(sniff.binary, true, `${name} should be binary`);
    const url = await files.dataUrl(p);
    assert.match(url.dataUrl, /^data:/, name);
    assert.ok(url.size > 0, name);
    const range = await files.readRange(p, 0, 16);
    assert.ok(range.base64.length > 0, name);
    assert.equal(range.size, url.size, name);
    if (isDicomName(name)) {
      const prev = await files.imagePreview(p);
      assert.equal(prev.kind, 'dicom');
      assert.match(prev.src, /^data:image\/png;base64,/);
    }
  }
});

test('SVG is text, not a binary picture, and is not served as a raster fill', async () => {
  const p = path.join(fixtures, 'logo.svg');
  const sniff = await files.sniff(p);
  assert.equal(sniff.binary, false);
  const r = await files.read(p);
  assert.match(r.text, /<svg/);
  assert.equal(openKind('logo.svg'), 'svg');
  const view = paneView({ kind: 'text', name: 'logo.svg' }, { imagePreview: true });
  assert.equal(view.fillPicture, false);
  assert.equal(view.svgPreview, true);
});

test('opening images in one pane: picture fill, Hexa toggles beside that picture', () => {
  const ed = createEditor();
  const pngDoc = ed.open(path.join(fixtures, 'sample.png'));
  assert.equal(pngDoc.kind, 'hex');
  let [a] = ed.views();
  assert.equal(a.fillPicture, true);
  assert.equal(a.hexaBeside, false);
  assert.equal(a.minimap, false);
  assert.equal(ed.toggleHex(pngDoc.id), true);
  [a] = ed.views();
  assert.equal(a.hexaBeside, true);
  ed.toggleHex(pngDoc.id);
  [a] = ed.views();
  assert.equal(a.hexaBeside, false);
});

test('the same path is not opened twice', () => {
  const ed = createEditor();
  const p = path.join(fixtures, 'sample.png');
  const first = ed.open(p);
  const second = ed.open(p);
  assert.equal(first.id, second.id);
  assert.equal(ed.docs.length, 1);
});

test('split: each pane shows its own image with its own Hexa', () => {
  const ed = createEditor();
  const png = ed.open(path.join(fixtures, 'sample.png'));
  const jpg = ed.open(path.join(fixtures, 'sample.jpg'));
  const svg = ed.open(path.join(fixtures, 'logo.svg'));
  ed.setSplit('cols');
  assert.equal(ed.panes.length, 2);
  ed.showInPane(0, png.id);
  ed.showInPane(1, jpg.id);
  let views = ed.views();
  assert.equal(views[0].fillPicture, true);
  assert.equal(views[1].fillPicture, true);
  assert.equal(views[0].doc.id, png.id);
  assert.equal(views[1].doc.id, jpg.id);
  assert.equal(views[0].hexaBeside, false);
  assert.equal(views[1].hexaBeside, false);
  assert.equal(views.every((v) => v.minimap === false), true);

  ed.toggleHex(jpg.id);
  views = ed.views();
  assert.equal(views[0].hexaBeside, false, 'Hexa on the other pane stays off');
  assert.equal(views[1].hexaBeside, true);
  assert.equal(views[0].fillPicture, true);
  assert.equal(views[1].fillPicture, true);

  ed.showInPane(1, svg.id);
  views = ed.views();
  assert.equal(views[0].fillPicture, true);
  assert.equal(views[1].fillPicture, false);
  assert.equal(views[1].svgPreview, true);
  assert.equal(views[0].hexaBeside, false);
});

test('split grid: four rasters each fill their pane independently', () => {
  const ed = createEditor();
  const names = ['sample.png', 'sample.jpg', 'sample.webp', 'sample.bmp'];
  const opened = names.map((n) => ed.open(path.join(fixtures, n)));
  ed.setSplit('grid');
  assert.equal(ed.panes.length, 4);
  opened.forEach((d, i) => ed.showInPane(i, d.id));
  const views = ed.views();
  assert.equal(views.length, 4);
  for (const v of views) {
    assert.equal(v.fillPicture, true, v.doc && v.doc.name);
    assert.equal(v.hexaBeside, false);
    assert.equal(v.minimap, false);
    assert.equal(v.canStructure, false);
  }
  ed.toggleHex(opened[0].id);
  ed.toggleHex(opened[2].id);
  const later = ed.views();
  assert.deepEqual(later.map((v) => v.hexaBeside), [true, false, true, false]);
});

test('opening a raster into an empty split pane does not steal the other pane\'s document', () => {
  const ed = createEditor();
  const png = ed.open(path.join(fixtures, 'sample.png'));
  ed.setSplit('cols');
  assert.equal(ed.panes[0].docId, png.id);
  assert.equal(ed.panes[1].docId, null);
  ed.focusPane(1);
  ed.open(path.join(fixtures, 'sample.jpg'));
  assert.equal(ed.panes[0].docId, png.id);
  assert.equal(ed.get(ed.panes[1].docId).name, 'sample.jpg');
  const views = ed.views();
  assert.equal(views[0].fillPicture, true);
  assert.equal(views[1].fillPicture, true);
});

test('App.jsx keeps picture + Hexa inside each pane, not beside the whole split', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  assert.match(src, /className="pane-media"/);
  assert.match(src, /<ImagePreview fill/);
  assert.match(src, /pd\.imageHex && ensureHexReader\(pd\)/);
  assert.match(src, /minimap=\{settings\.minimap && !\(pd && \(pd\.langName === 'Markdown' \|\| isBinaryImageName\(pd\.name\)\)\)\}/);
  assert.equal(/isBinaryImage && cur\.imageHex/.test(src), false, 'Hexa must not sit next to the whole panes grid');
  const media = src.slice(src.indexOf('className="pane-media"'));
  assert.match(media, /<HexView /);
  assert.match(src, /onToggleHex=/);
});

test('ImagePreview fill mode exposes a Hexa toggle on the picture itself', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'components', 'ImagePreview.jsx'), 'utf8');
  assert.match(src, /fill && onToggleHex/);
  assert.match(src, /t\('img_hex'\)/);
});

test('session restore of an already-open image is a picture, not file.read text', () => {
  assert.equal(restoreAsPicture({ path: 'C:\\a\\sample.png', name: 'sample.png', encoding: 'utf8' }), true);
  assert.equal(restoreAsPicture({ path: 'C:\\a\\photo.jpg', name: 'photo.jpg', kind: 'hex', encoding: 'utf8' }), true);
  assert.equal(restoreAsPicture({ path: 'C:\\a\\app.bin', name: 'app.bin', kind: 'hex' }), true);
  assert.equal(restoreAsPicture({ path: 'C:\\a\\logo.svg', name: 'logo.svg', encoding: 'utf8' }), false);
  assert.equal(restoreAsPicture({ path: 'C:\\a\\notes.txt', name: 'notes.txt', encoding: 'utf8' }), false);
  assert.equal(restoreAsPicture({ path: 'C:\\a\\sample.png', name: 'sample.png', draft: 'x', encoding: 'utf8' }), false);
});

test('samples/images rasters (when present) open the same way', async () => {
  const dir = path.join(root, 'samples', 'images');
  if (!fs.existsSync(dir)) return;
  const rasters = fs.readdirSync(dir).filter((n) => isBinaryImageName(n));
  if (!rasters.length) return;
  const ed = createEditor();
  ed.setSplit('cols');
  for (const name of rasters) {
    const p = path.join(dir, name);
    const sniff = await files.sniff(p);
    assert.equal(sniff.binary, true, name);
    const url = await files.dataUrl(p);
    assert.match(url.dataUrl, /^data:/, name);
    const doc = ed.open(p);
    assert.equal(doc.kind, 'hex', name);
    assert.equal(paneView(doc, { minimap: true }).fillPicture, true, name);
    assert.equal(paneView(doc, { minimap: true }).minimap, false, name);
  }
  const svg = path.join(dir, 'logo.svg');
  if (fs.existsSync(svg)) {
    const doc = ed.open(svg);
    assert.equal(doc.kind, 'text');
    assert.equal(paneView(doc).fillPicture, false);
  }
});
