// Exports and drops: the picture formats (PNG, JPEG, WebP, BMP, TIFF, SVG, PDF) and which of
// them may keep a transparent background, the BMP and TIFF encoders byte by byte (TIFF read back
// with sharp), the painted-box scan that makes a picture as small as its shapes, the framing box
// of the SVG, and the files dropped on the browser page — XMind and MindManager unpacked by the
// host's zip.readData — opening as maps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { EXPORTS, availableExports, readDroppedMap, OPEN_EXT } from '../src/lib/formats/index.js';
import { encodeBmp, encodeTiff } from '../src/lib/formats/image.js';
import { paintedBox } from '../src/lib/exportimg.js';
import { renderMapSvg } from '../src/lib/render.js';
import { layoutMap } from '../src/lib/layout.js';
import { resolveMapStyle } from '../src/lib/mapstyles.js';
import { mapFromSample } from '../src/lib/samples.js';
import { exportXmind } from '../src/lib/formats/xmind.js';
import { exportFreeMind } from '../src/lib/formats/freemind.js';
import { SETTINGS_DEFAULTS } from '../src/lib/settings.js';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');
const { writeZip } = require('../core/zip.js');
const sharp = require('sharp');

const measure = (text, font) => { const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]); return [...String(text)].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x2e80 ? size * 0.98 : size * 0.55), 0); };

// 3 × 2 pixels: red, green, blue / white, half-transparent black, fully transparent
const W = 3, H = 2;
const RGBA = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 128, 0, 0, 0, 0]);

test('the picture formats: PNG, JPEG, WebP, BMP, TIFF, SVG and PDF; the ones that can be transparent ask', () => {
  const ids = EXPORTS.filter((e) => e.picture).map((e) => e.id);
  for (const id of ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg', 'pdf']) assert.ok(ids.includes(id), id);
  // exactly the formats that can store a transparent background offer it
  assert.deepEqual(EXPORTS.filter((e) => e.alpha).map((e) => e.id).sort(), ['png', 'svg', 'tiff', 'webp']);
  for (const id of ['jpeg', 'bmp', 'pdf']) assert.ok(!EXPORTS.find((e) => e.id === id).alpha, `${id} has no transparency`);
  // every pixel format takes a scale; SVG does not
  assert.deepEqual(EXPORTS.filter((e) => e.raster).map((e) => e.id).sort(), ['bmp', 'jpeg', 'pdf', 'png', 'tiff', 'webp']);
  // WebP only where the engine can write it
  assert.ok(!availableExports({ webp: false }).some((e) => e.id === 'webp'));
  assert.ok(availableExports({ webp: true }).some((e) => e.id === 'webp'));
  assert.equal(new Set(EXPORTS.map((e) => e.ext)).size, EXPORTS.length, 'one extension each');
});

test('a picture holds every shape with a little room around it by default', () => {
  assert.equal(SETTINGS_DEFAULTS.exportMargin, 20);
  assert.equal(SETTINGS_DEFAULTS.exportPadding, undefined, 'the old 40 px setting is gone');
});

test('BMP: 24-bit, bottom-up rows padded to 4 bytes, BGR', () => {
  const b = encodeBmp(RGBA, W, H);
  const v = new DataView(b.buffer);
  assert.equal(String.fromCharCode(b[0], b[1]), 'BM');
  const row = 12;                                  // 3 px × 3 bytes = 9, padded to 12
  assert.equal(b.length, 54 + row * H);
  assert.equal(v.getUint32(2, true), b.length);
  assert.equal(v.getInt32(18, true), W);
  assert.equal(v.getInt32(22, true), H);
  assert.equal(v.getUint16(28, true), 24);
  // the last row of the file is the top row of the picture: red, green, blue as BGR
  const top = 54 + row;
  assert.deepEqual([...b.subarray(top, top + 9)], [0, 0, 255, 0, 255, 0, 255, 0, 0]);
  assert.deepEqual([...b.subarray(54, 57)], [255, 255, 255], 'bottom row first: white');
});

test('TIFF: RGB, or RGBA with its alpha, read back the same by sharp', async () => {
  const rgb = encodeTiff(RGBA, W, H);
  const a = await sharp(Buffer.from(rgb)).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([a.info.width, a.info.height, a.info.channels], [W, H, 3]);
  assert.deepEqual([...a.data.subarray(0, 9)], [255, 0, 0, 0, 255, 0, 0, 0, 255]);
  const rgba = encodeTiff(RGBA, W, H, { alpha: true });
  const b = await sharp(Buffer.from(rgba)).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([b.info.width, b.info.height, b.info.channels], [W, H, 4]);
  assert.deepEqual([...b.data], [...RGBA], 'every pixel, alpha too');
});

test('the painted box: the smallest box holding every drawn pixel', () => {
  const w = 10, h = 8;
  const data = new Uint8ClampedArray(w * h * 4);
  assert.equal(paintedBox(data, w, h), null, 'nothing drawn');
  const dot = (x, y, a = 255) => { data[(y * w + x) * 4 + 3] = a; };
  dot(3, 2); dot(7, 5, 1); dot(4, 6, 20);          // a faint antialiased pixel still counts
  assert.deepEqual(paintedBox(data, w, h), { x0: 3, y0: 2, x1: 7, y1: 6 });
  dot(0, 0); dot(9, 7);
  assert.deepEqual(paintedBox(data, w, h), { x0: 0, y0: 0, x1: 9, y1: 7 });
});

test('the SVG frames exactly the box it is given, plus the margin', () => {
  const map = mapFromSample('churn-fishbone', 'en');
  const ms = resolveMapStyle(map, {});
  const L = layoutMap(map, { ms, measure });
  const box = { x0: -812, y0: -230, x1: 140, y1: 260 };
  const tight = renderMapSvg(map, L, ms, { padding: 0, box, measure });
  assert.deepEqual(tight.viewBox, { x: -812, y: -230, w: 952, h: 490 });
  assert.match(tight.svg, /width="952" height="490" viewBox="-812 -230 952 490"/);
  const wide = renderMapSvg(map, L, ms, { padding: 20, box, measure });
  assert.deepEqual(wide.viewBox, { x: -832, y: -250, w: 992, h: 530 });
  // transparent: no background rectangle; opaque: one filling the frame
  assert.ok(!/<rect x="-812" y="-230" width="952" height="490"/.test(renderMapSvg(map, L, ms, { padding: 0, box, measure, transparent: true }).svg));
  assert.ok(/<rect x="-812" y="-230" width="952" height="490"/.test(tight.svg));
});

test('files dropped on the browser page open as maps: XMind and MindManager through zip.readData', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtm-drop-'));
  const api = createApi({ configDir: dir });
  const call = (name, args) => api.call(name, args);
  const file = (name, bytes) => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), text: async () => Buffer.from(bytes).toString('utf8') });
  const src = mapFromSample('churn-fishbone', 'en');
  const count = (m) => { let n = 0; const walk = (t) => { n++; (t.children || []).forEach(walk); }; walk(m.root); return n; };

  const xmind = writeZip(exportXmind(src).map((f) => ({ name: f.name, data: f.text != null ? f.text : Buffer.from(f.base64, 'base64') })));
  const fromXmind = await readDroppedMap(file('causes.xmind', new Uint8Array(xmind)), call);
  assert.equal(count(fromXmind), count(src), 'XMind: every topic');

  const mmapXml = '<?xml version="1.0"?><ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003"><ap:OneTopic><ap:Topic><ap:SubTopics><ap:Topic><ap:Text PlainText="A"/></ap:Topic><ap:Topic><ap:Text PlainText="B"/></ap:Topic></ap:SubTopics><ap:Text PlainText="Root"/></ap:Topic></ap:OneTopic></ap:Map>';
  const mmap = writeZip([{ name: 'Document.xml', data: mmapXml }]);
  const fromMmap = await readDroppedMap(file('plan.mmap', new Uint8Array(mmap)), call);
  assert.deepEqual([fromMmap.root.text, ...fromMmap.root.children.map((c) => c.text)], ['Root', 'A', 'B']);

  const fromMm = await readDroppedMap(file('causes.mm', new Uint8Array(Buffer.from(exportFreeMind(src)))), call);
  assert.equal(count(fromMm), count(src), 'FreeMind');
  const fromTmap = await readDroppedMap(file('causes.tmap', new Uint8Array(Buffer.from(JSON.stringify(src)))), call);
  assert.equal(fromTmap.layout, 'fishbone');
  await assert.rejects(readDroppedMap(file('notes.docx', new Uint8Array(4)), call), /Unsupported/);
  for (const ext of ['tmap', 'mm', 'xmind', 'mmap', 'opml', 'md', 'txt']) assert.ok(OPEN_EXT.includes(ext), ext);
  // a bad container is an error, not a crash; an oversized one is refused
  await assert.rejects(call('zip.readData', { base64: Buffer.from('not a zip').toString('base64') }));
  fs.rmSync(dir, { recursive: true, force: true });
});
