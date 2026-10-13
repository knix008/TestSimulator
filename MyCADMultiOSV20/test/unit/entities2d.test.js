// Points, splines (NURBS), hatches, leaders, elliptical arcs; DXF 2000 and R12 with them;
// DXF files written by ezdxf (an independent library) read back completely.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import { exportDxf, importDxf, tokenize } from '../../src/domain/dxf.js';
import { exportDxf2000 } from '../../src/domain/dxf2000.js';
import { createEntity, explode, grips, measure, moveGrip, normalizeEntity, primitives, transformEntity } from '../../src/domain/entities.js';
import { hatchArea, hatchPrimitives, HATCH_PATTERN_NAMES } from '../../src/domain/hatch.js';
import { bezierChain, clampedKnots, curvePoint, sampleCurve, throughPoints } from '../../src/domain/nurbs.js';
import { createTool } from '../../src/view/tools.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const near = (a, b, eps = 1e-6, label = '') => assert.ok(Math.abs(a - b) <= eps, `${label} ${a} ≠ ${b}`);
const square = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];

test('NURBS: clamped curves start and end on their end points, Bézier chains and curves through points', () => {
  const curve = { degree: 3, points: [[0, 0], [10, 20], [30, 20], [40, 0]] };
  assert.deepEqual(curvePoint(curve, 0), [0, 0]);
  assert.deepEqual(curvePoint(curve, 1).map((v) => Math.round(v * 1e9) / 1e9), [40, 0]);
  near(curvePoint(curve, 0.5)[0], 20);
  near(curvePoint(curve, 0.5)[1], 15, 1e-9, 'Bézier midpoint = (P0 + 3P1 + 3P2 + P3) / 8');
  assert.equal(clampedKnots(5, 3).length, 9);
  // A rational quadratic with weight √½ is an exact quarter circle.
  const quarter = { degree: 2, points: [[1, 0], [1, 1], [0, 1]], weights: [1, Math.SQRT1_2, 1] };
  for (const [x, y] of sampleCurve(quarter, 20)) near(Math.hypot(x, y), 1, 1e-9, 'on the circle');
  const pts = [[0, 0], [10, 5], [20, 0], [30, 5]];
  const through = throughPoints(pts);
  assert.equal(through.points.length, 1 + 3 * 3);
  const chain = bezierChain([[[0, 0], [1, 1], [2, 1], [3, 0]]]);
  assert.deepEqual(chain.knots, [0, 0, 0, 0, 1, 1, 1, 1]);
});

test('entities: point, spline, hatch, leader, elliptical arc — repair, primitives, transforms, grips, explode, measure', () => {
  const point = createEntity('point', { x: 3, y: 4 });
  assert.equal(primitives(point).length, 3);
  assert.deepEqual(measure(point), { x: 3, y: 4 });
  const spline = createEntity('spline', { ...throughPoints([[0, 0], [10, 10], [20, 0]]), points: throughPoints([[0, 0], [10, 10], [20, 0]]).points.map(([x, y]) => ({ x, y })) });
  const line = primitives(spline)[0];
  assert.equal(line.kind, 'poly');
  near(line.points.at(-1).x, 20);
  assert.ok(measure(spline).length > 28 && measure(spline).length < 40);
  assert.equal(grips(spline).length, spline.points.length);
  const moved = normalizeEntity(moveGrip(spline, 'v0', { x: -5, y: 0 }));
  assert.equal(moved.points[0].x, -5);
  assert.equal(normalizeEntity({ type: 'spline', points: [{ x: 0, y: 0 }] }), null, 'one point is not a spline');
  const hatch = createEntity('hatch', { loops: [square(0, 0, 20), square(5, 5, 10)], pattern: 'ansi31' });
  near(measure(hatch).area, 300);
  assert.ok(primitives(hatch).length > 5 && primitives(hatch).every((p) => p.kind === 'line' && p.thin));
  const solid = createEntity('hatch', { loops: [square(0, 0, 20), square(5, 5, 10)], pattern: 'solid' });
  assert.equal(primitives(solid)[0].kind, 'fill');
  assert.equal(primitives(solid)[0].holes.length, 1);
  assert.equal(normalizeEntity({ type: 'hatch', loops: [square(0, 0, 1)], pattern: 'nope' }).pattern, 'ansi31');
  const turned = normalizeEntity(transformEntity(hatch, { type: 'rotate', cx: 0, cy: 0, angle: 90 }));
  assert.equal(turned.angle, 90);
  const leader = createEntity('leader', { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }], text: 'M10' });
  const kinds = primitives(leader).map((p) => p.kind);
  assert.deepEqual(kinds, ['poly', 'fill', 'text']);
  assert.ok(explode(leader).length === 3);
  const arc = createEntity('ellipse', { cx: 0, cy: 0, rx: 10, ry: 5, start: 0, end: 90 });
  const pts = primitives(arc)[0].points;
  assert.equal(primitives(arc)[0].closed, false);
  near(pts[0].x, 10); near(pts.at(-1).y, 5);
  const mirrored = normalizeEntity(transformEntity(arc, { type: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }));
  const mpts = primitives(mirrored)[0].points;
  near(mpts[0].x, 0, 1e-6); near(mpts.at(-1).x, -10, 1e-6);
  assert.equal(createEntity('ellipse', { rx: 5, ry: 2 }).end, 360, 'a whole ellipse by default');
});

test('hatch patterns: lines stay inside the region and out of holes; every pattern draws', () => {
  for (const name of HATCH_PATTERN_NAMES) assert.ok(hatchPrimitives([square(0, 0, 20)], name).length > 0, name);
  const prims = hatchPrimitives([square(0, 0, 20), square(5, 5, 10)], 'ansi31', 0, 1);
  for (const { a, b } of prims) {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    assert.ok(m.x >= -1e-9 && m.x <= 20 + 1e-9 && m.y >= -1e-9 && m.y <= 20 + 1e-9, 'inside');
    assert.ok(!(m.x > 5 + 1e-6 && m.x < 15 - 1e-6 && m.y > 5 + 1e-6 && m.y < 15 - 1e-6), 'not in the hole');
  }
  near(hatchArea([square(0, 0, 20), square(5, 5, 10)]), 300);
});

test('drawing tools: point, spline through clicks, leader, elliptical arc, hatch inside an outline', () => {
  const drawing = createDrawing();
  addEntity(drawing, 'rect', { x: 0, y: 0, width: 40, height: 30 });
  const added = [];
  const api = {
    drawing: () => drawing, settings: () => ({ textHeight: 3.5 }), options: { hatchPattern: 'ansi37', hatchScale: 2, hatchAngle: 0 }, t: (k) => k,
    layerFor: () => '0', add: (type, data) => { const e = addEntity(drawing, type, data); added.push(e); return e; }, select: () => {}, notify: () => {}, done: () => {},
    regionAt: () => [square(0, 0, 40)],
  };
  createTool('point', api).click({ x: 1, y: 2 });
  const spline = createTool('spline', api);
  for (const p of [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]) spline.click(p);
  assert.equal(spline.finish(), true);
  const leader = createTool('leader', api);
  leader.click({ x: 0, y: 0 }); leader.click({ x: 10, y: 10 });
  leader.finish();
  const arc = createTool('ellipseArc', api);
  for (const p of [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 0 }, { x: 0, y: 5 }]) arc.click(p);
  createTool('hatch', api).click({ x: 5, y: 5 });
  assert.deepEqual(added.map((e) => e.type), ['point', 'spline', 'leader', 'ellipse', 'hatch']);
  near(added[3].start, 0); near(added[3].end, 90);
  assert.equal(added[4].pattern, 'ansi37');
  assert.equal(added[1].points.length, 7, 'a spline through three points: two cubic pieces');
});

test('DXF 2000: real entities, handles, Unicode names; read back the same', () => {
  const d = createDrawing({ title: 'dxf2000' });
  d.layers[0].name = '외형선';
  addEntity(d, 'polyline', { points: square(0, 0, 10), closed: true });
  addEntity(d, 'ellipse', { cx: 50, cy: 0, rx: 4, ry: 8, start: 0, end: 180 });
  addEntity(d, 'point', { x: 1, y: 1 });
  addEntity(d, 'spline', { points: [{ x: 0, y: 20 }, { x: 10, y: 30 }, { x: 20, y: 20 }, { x: 30, y: 30 }], degree: 3 });
  addEntity(d, 'hatch', { loops: [square(0, 40, 20), square(5, 45, 5)], pattern: 'net' });
  addEntity(d, 'leader', { points: [{ x: 60, y: 40 }, { x: 70, y: 50 }], text: '노트' });
  addEntity(d, 'text', { x: 0, y: -10, text: 'two\nlines' });
  addEntity(d, 'solid', { kind: 'box', params: { length: 5, width: 5, height: 5 } });
  const text = exportDxf2000(d);
  assert.match(text, /AC1015/);
  for (const type of ['LWPOLYLINE', 'ELLIPSE', 'POINT', 'SPLINE', 'HATCH', 'LEADER', 'MTEXT', '3DFACE']) assert.match(text, new RegExp(`\\n${type}\\n`), type);
  assert.ok(!/[^\x00-\x7f]/.test(text), 'pre-2007 DXF: non-ASCII written as \\U+XXXX');
  const handles = tokenize(text).filter((pair) => pair.code === 5 || pair.code === 105).map((pair) => pair.value);
  assert.ok(handles.length > 20);
  assert.equal(new Set(handles).size, handles.length, 'unique handles');
  const back = importDxf(text).drawing;
  const types = back.entities.map((e) => e.type);
  for (const type of ['polyline', 'ellipse', 'point', 'spline', 'hatch', 'leader', 'text', 'solid']) assert.ok(types.includes(type), type);
  assert.ok(back.layers.some((layer) => layer.name === '외형선'));
  const ellipse = back.entities.find((e) => e.type === 'ellipse');
  const original = d.entities.find((e) => e.type === 'ellipse');
  const a = primitives(ellipse)[0].points;
  const b = primitives(original)[0].points;
  near(a[0].x, b[0].x, 1e-4); near(a[0].y, b[0].y, 1e-4); near(a.at(-1).x, b.at(-1).x, 1e-4); near(a.at(-1).y, b.at(-1).y, 1e-4);
  assert.match(exportDxf(d), /\nPOINT\n/, 'R12 writes points as POINT');
});

test('DXF written by ezdxf (R12, R2000, R2018, binary, cp949): every entity read, nothing skipped', async () => {
  const { importDrawingBytes, isBinaryDxf } = await import('../../src/domain/import2d.js');
  const dir = path.join(root, 'samples', 'dxf');
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'ezdxf-expected.json'), 'utf8'));
  for (const [file, info] of Object.entries(expected)) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(dir, file)));
    assert.equal(isBinaryDxf(bytes), info.format === 'bin', `${file}: binary or text`);
    const result = importDrawingBytes(file, bytes);
    assert.equal(result.format, 'dxf');
    assert.deepEqual(result.skipped, {}, `${file}: ${JSON.stringify(result.skipped)}`);
    const types = new Set(result.drawing.entities.map((e) => e.type));
    const want = { LINE: 'line', CIRCLE: 'circle', ARC: 'arc', POINT: 'point', TEXT: 'text', MTEXT: 'text', LWPOLYLINE: 'polyline', ELLIPSE: 'ellipse', SPLINE: 'spline', HATCH: 'hatch', LEADER: 'leader', '3DFACE': 'solid' };
    for (const [dxfType, type] of Object.entries(want)) if (info.entities[dxfType]) assert.ok(types.has(type), `${file}: ${dxfType} → ${type}`);
    assert.ok(result.drawing.layers.some((layer) => layer.name === '외형선'), `${file}: Korean layer name (${info.encoding ?? 'utf-8'})`);
    assert.ok(result.drawing.entities.some((e) => e.type === 'text' && e.text.includes('한글')), `${file}: Korean text`);
  }
});
