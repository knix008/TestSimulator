import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS, ICO_SIZES, alignObject, backgroundSvg, bbox, cloneObject, createObject, exportSizes, filterDef, gradientDef, moveObject, normalizeBox,
  objToSvg, resizeObject, serializeSvg, shade, snap, transformOf,
} from '../src/lib/iconCanvas.js';
import { ALL_SHAPE_IDS } from '../src/lib/shapes.js';
import { emptyDesign } from '../src/lib/project.js';

const box = (o, x, y, w, h) => ({ ...o, x, y, w, h });

test('tools create the right kind of object', () => {
  assert.equal(createObject('rect', 1, 2).type, 'rect');
  assert.equal(createObject('roundRect', 1, 2).rx, 64);
  const arrow = createObject('arrowLine', 5, 6);
  assert.equal(arrow.type, 'line');
  assert.equal(arrow.arrowEnd, true);
  const brush = createObject('brush', 0, 0, { fill: '#ff0000', stroke: '#000000', strokeWidth: 8 });
  assert.equal(brush.type, 'pen');
  assert.equal(brush.stroke, '#ff0000');
  assert.ok(brush.strokeWidth >= 24 && brush.opacity < 1);
  assert.deepEqual(createObject('poly', 3, 4).points, [[3, 4]]);
  for (const id of ALL_SHAPE_IDS) {
    const o = createObject(id, 0, 0);
    assert.equal(o.type, 'shape');
    assert.equal(o.shape, id);
  }
  assert.notEqual(createObject('rect', 0, 0).id, createObject('rect', 0, 0).id);
});

test('every shape draws as SVG without NaN', () => {
  for (const id of ALL_SHAPE_IDS) {
    const o = box(createObject(id, 0, 0), 50, 60, 200, 180);
    const svg = objToSvg(o);
    assert.ok(svg.length > 30, id);
    assert.doesNotMatch(svg, /NaN|undefined/, id);
  }
});

test('boxes drawn backwards become positive', () => {
  const o = normalizeBox(box(createObject('rect', 0, 0), 100, 100, -40, -30));
  assert.deepEqual([o.x, o.y, o.w, o.h], [60, 70, 40, 30]);
  const line = createObject('line', 0, 0);
  assert.equal(normalizeBox(line), line, 'lines are left alone');
});

test('move, resize, align and clone work for boxes, lines and point objects', () => {
  const rect = box(createObject('rect', 0, 0), 10, 10, 100, 50);
  assert.deepEqual(bbox(moveObject(rect, 5, -5)), { x: 15, y: 5, w: 100, h: 50 });
  assert.deepEqual(bbox(resizeObject(rect, { x: 0, y: 0, w: 200, h: 100 })), { x: 0, y: 0, w: 200, h: 100 });
  const pen = { ...createObject('pen', 0, 0), points: [[0, 0], [10, 20], [20, 10]] };
  assert.deepEqual(bbox(resizeObject(pen, { x: 100, y: 100, w: 40, h: 40 })), { x: 100, y: 100, w: 40, h: 40 });
  const line = { ...createObject('line', 0, 0), x1: 0, y1: 0, x2: 100, y2: 50 };
  assert.deepEqual(bbox(alignObject(line, 'right')), { x: CANVAS - 100, y: 0, w: 100, h: 50 });
  assert.deepEqual(bbox(alignObject(rect, 'hcenter')), { x: (CANVAS - 100) / 2, y: 10, w: 100, h: 50 });
  assert.deepEqual(bbox(alignObject(rect, 'bottom')), { x: 10, y: CANVAS - 50, w: 100, h: 50 });
  const copy = cloneObject(rect);
  assert.notEqual(copy.id, rect.id);
  assert.deepEqual(bbox(copy), { x: 34, y: 34, w: 100, h: 50 });
  const text = { ...box(createObject('text', 0, 0), 0, 0, 200, 100), fontSize: 80 };
  assert.equal(resizeObject(text, { x: 0, y: 0, w: 400, h: 200 }).fontSize, 160, 'text grows with its box');
});

test('snap rounds to the grid step', () => {
  assert.equal(snap(13, 8), 16);
  assert.equal(snap(13, 0), 13);
});

test('rotation and flips turn around the centre of the box', () => {
  const o = box(createObject('rect', 0, 0), 0, 0, 100, 100);
  assert.equal(transformOf(o), '');
  assert.equal(transformOf({ ...o, rotate: 45, flipX: true }), 'translate(50 50) rotate(45) scale(-1 1) translate(-50 -50)');
});

test('effects become one SVG filter; gradients and gloss get definitions', () => {
  const o = box(createObject('ellipse', 0, 0), 0, 0, 100, 100);
  assert.equal(filterDef(o), '');
  const fx = { ...o, fx: { ...o.fx, threeD: true, shadow: true, glow: true, blur: 2 } };
  const f = filterDef(fx);
  for (const part of ['feSpecularLighting', 'feDropShadow', 'feMorphology', 'feGaussianBlur']) assert.match(f, new RegExp(part));
  assert.match(objToSvg(fx), new RegExp(`filter="url\\(#f-${o.id}\\)"`));
  const g = { ...o, fillType: 'linear', fill: '#ff0000', fill2: '#0000ff' };
  assert.match(gradientDef(g), /linearGradient/);
  assert.match(objToSvg(g), new RegExp(`fill="url\\(#g-${o.id}\\)"`));
  assert.match(gradientDef({ ...g, fillType: 'radial' }), /radialGradient/);
  const glossy = { ...o, fx: { ...o.fx, gloss: true } };
  assert.match(objToSvg(glossy), new RegExp(`url\\(#gl-${o.id}\\)`));
});

test('hidden objects are not drawn; text is escaped', () => {
  const o = box(createObject('rect', 0, 0), 0, 0, 10, 10);
  assert.equal(objToSvg({ ...o, hidden: true }), '');
  const t = { ...box(createObject('text', 0, 0), 0, 0, 10, 10), text: '<a&b>' };
  assert.match(objToSvg(t), /&lt;a&amp;b&gt;/);
});

test('the background can be a colour, a gradient, a circle or nothing', () => {
  const d = emptyDesign();
  assert.equal(backgroundSvg(d), '');
  assert.match(backgroundSvg({ ...d, background: '#ffffff', bgPad: 10, bgRadius: 20 }), /<rect x="51.2" y="51.2" width="409.6" height="409.6" rx="81.92" fill="#ffffff"/);
  assert.match(backgroundSvg({ ...d, background: '#ffffff', bgShape: 'circle' }), /<circle/);
  assert.match(backgroundSvg({ ...d, background: '#ffffff', bgGradient: true, background2: '#000000' }), /bg-grad/);
});

test('the whole design serializes to a standalone SVG of any size', () => {
  const d = { ...emptyDesign(), objects: [box(createObject('star', 0, 0), 10, 10, 100, 100)], exportOpacity: 50 };
  const svg = serializeSvg(d, 64);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 512 512" width="64" height="64">/);
  assert.match(svg, /<g opacity="0.5">/);
});

test('export sizes are sorted, unique and limited to the format', () => {
  assert.deepEqual(exportSizes([256, 16, 16, 999, 32], ICO_SIZES), [16, 32, 256]);
  assert.throws(() => exportSizes([], ICO_SIZES), /NO_SIZES/);
});

test('shade lightens and darkens colours', () => {
  assert.equal(shade('#000000', 50), '#808080');
  assert.equal(shade('#ffffff', -50), '#808080');
  assert.equal(shade('nonsense', 0), '#94a3b8');
});
