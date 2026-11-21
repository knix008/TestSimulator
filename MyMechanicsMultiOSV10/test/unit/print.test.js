// The print window's page geometry and page SVG (src/print/layout.js, sheet.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSize, drawingPlacement, initialSetup, loadStored, MAX_CAPTURE_PX, modelBoxes, normalizeSetup, pageGeometry, PAPERS, storeSetup } from '../../src/print/layout.js';
import { pageSvg, placeDrawingSvg } from '../../src/print/sheet.js';
import { SHEETS } from '../../src/cad/drawing.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('every drawing sheet size is a paper, and the same size both ways', () => {
  for (const [name, [w, h]] of Object.entries(SHEETS)) {
    assert.ok(PAPERS[name], name);
    assert.equal(Math.max(PAPERS[name].width, PAPERS[name].height), Math.max(w, h), name);
    assert.equal(Math.min(PAPERS[name].width, PAPERS[name].height), Math.min(w, h), name);
  }
});

test('a drawing opens on its own sheet at 1:1 with no margins and prints to scale', () => {
  const setup = initialSetup({}, { mode: 'drawing', sheet: 'A2' });
  assert.deepEqual([setup.paper, setup.orientation, setup.margin, setup.scale], ['A2', 'landscape', 'none', 'actual']);
  const g = pageGeometry(setup);
  assert.deepEqual([g.width, g.height], SHEETS.A2);
  const place = drawingPlacement(...SHEETS.A2, g, 'actual');
  assert.deepEqual([place.x, place.y, place.w, place.h, place.scale, place.clipped], [0, 0, 594, 420, 1, false]);
});

test('1:1 on smaller paper is centred and marked clipped; fit scales it into the printable area', () => {
  const g = pageGeometry({ paper: 'A4', orientation: 'landscape', margin: 'normal' });
  assert.deepEqual(g.area, { x: 10, y: 10, w: 277, h: 190 });
  const actual = drawingPlacement(420, 297, g, 'actual');
  assert.equal(actual.clipped, true);
  assert.equal(actual.scale, 1);
  const fit = drawingPlacement(420, 297, g, 'fit');
  assert.equal(fit.clipped, false);
  assert.ok(fit.w <= 277 + 1e-9 && fit.h <= 190 + 1e-9);
  assert.ok(Math.abs(fit.scale - Math.min(277 / 420, 190 / 297)) < 1e-12);
});

test('the model picture box sits under the title line and its pixel size is capped', () => {
  const g = pageGeometry({ paper: 'A0', orientation: 'portrait', margin: 'none' });
  const { title, picture } = modelBoxes(g);
  assert.ok(picture.y > title.y + title.h);
  assert.ok(Math.abs(picture.y + picture.h - g.height) < 1e-9);
  const size = captureSize(picture);
  assert.ok(Math.max(size.w, size.h) <= MAX_CAPTURE_PX);
  assert.ok(Math.abs(size.w / size.h - picture.w / picture.h) < 0.01);
});

test('stored choices: printer, copies and colour always; paper only from models', () => {
  const storage = memory();
  storeSetup(storage, { ...normalizeSetup({}), printer: 'P1', copies: 3, color: 'mono', paper: 'A1' }, 'drawing');
  let stored = loadStored(storage);
  assert.deepEqual([stored.printer, stored.copies, stored.color, stored.paper], ['P1', 3, 'mono', 'A4']);
  storeSetup(storage, { ...stored, paper: 'A3', orientation: 'portrait' }, 'model');
  stored = loadStored(storage);
  assert.deepEqual([stored.paper, stored.orientation], ['A3', 'portrait']);
  assert.equal(initialSetup(stored, { mode: 'drawing', sheet: 'A1' }).paper, 'A1');
  assert.equal(normalizeSetup({ copies: 500, paper: 'B9' }).copies, 99);
  assert.equal(normalizeSetup({ paper: 'B9' }).paper, 'A4');
});

test('the page SVG places the drawing sheet with its size inline and greys black-and-white pages', () => {
  const drawing = '<svg xmlns="http://www.w3.org/2000/svg" class="drawing-sheet" viewBox="0 0 420 297" width="420mm" height="297mm"><rect/></svg>';
  const placed = placeDrawingSvg(drawing, { x: 5, y: 6, w: 210, h: 148.5 });
  assert.match(placed, /^<svg x="5" y="6" width="210" height="148.5" style="width:210px;height:148.5px"/);
  assert.doesNotMatch(placed, /420mm/);
  assert.match(placed, /viewBox="0 0 420 297"/);
  const g = pageGeometry({ paper: 'A3', orientation: 'landscape', margin: 'none' });
  const page = pageSvg({ mode: 'drawing', geometry: g, setup: { scale: 'actual', color: 'mono' }, content: { svg: drawing, sheetW: 420, sheetH: 297 } });
  assert.match(page, /viewBox="0 0 420 297"/);
  assert.match(page, /filter="url\(#print-mono\)"/);
  const model = pageSvg({ mode: 'model', geometry: g, setup: { color: 'color' }, content: { url: 'data:image/png;base64,AAAA' }, info: { name: 'A & B', kindLabel: 'Part' } });
  assert.match(model, /<image href="data:image\/png;base64,AAAA"/);
  assert.match(model, /A &amp; B/);
  assert.doesNotMatch(model, /filter="url/);
});
