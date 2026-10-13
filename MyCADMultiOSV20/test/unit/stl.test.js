// 3D printing output: outlines → watertight extruded STL.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import { createEntity } from '../../src/domain/entities.js';
import { polygonArea } from '../../src/domain/geometry.js';
import {
  buildShapes, circleSegments, collectLoops, extrude, meshVolume, prepareStl, toAsciiStl, toBase64, toBinaryStl, triangulate,
} from '../../src/domain/stl.js';

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

/** Every edge must be used exactly twice, once in each direction (closed, consistently oriented). */
function assertWatertight(triangles) {
  const key = (p) => p.map((v) => v.toFixed(6)).join(',');
  const edges = new Map();
  for (const tri of triangles) {
    for (let i = 0; i < 3; i++) {
      const a = key(tri[i]);
      const b = key(tri[(i + 1) % 3]);
      edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
    }
  }
  for (const [edge, count] of edges) {
    const [a, b] = edge.split('|');
    assert.equal(count, 1, `edge used once per direction: ${edge}`);
    assert.equal(edges.get(`${b}|${a}`), 1, `opposite edge exists: ${edge}`);
  }
}

test('triangulation covers the polygon exactly, holes included', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const area = (tris) => tris.reduce((sum, tri) => sum + polygonArea(tri), 0);
  near(area(triangulate(square)), 100, 1e-9);
  near(area(triangulate([...square].reverse())), 100, 1e-9);
  const hole = [{ x: 3, y: 3 }, { x: 3, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 3 }];
  const withHole = triangulate(square, [hole]);
  near(area(withHole), 84, 1e-9);
  assert.ok(withHole.every((tri) => polygonArea(tri) > 0), 'all counter-clockwise');
  const twoHoles = triangulate(square, [[{ x: 1, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 1 }], [{ x: 6, y: 6 }, { x: 6, y: 9 }, { x: 9, y: 9 }, { x: 9, y: 6 }]]);
  near(area(twoHoles), 100 - 4 - 9, 1e-9);
  // A concave L shape.
  const l = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 10 }, { x: 0, y: 10 }];
  near(area(triangulate(l)), 51, 1e-9);
});

test('outlines: closed shapes, joined lines/arcs; centre lines and dimensions ignored', () => {
  const drawing = createDrawing();
  addEntity(drawing, 'rect', { x: 0, y: 0, width: 40, height: 20 });
  addEntity(drawing, 'line', { x1: 50, y1: 0, x2: 60, y2: 0 });
  addEntity(drawing, 'line', { x1: 60, y1: 0, x2: 60, y2: 10 });
  addEntity(drawing, 'arc', { cx: 55, cy: 10, r: 5, start: 0, end: 180 });
  addEntity(drawing, 'line', { x1: 50, y1: 10, x2: 50, y2: 0 });
  addEntity(drawing, 'line', { x1: -10, y1: 10, x2: 100, y2: 10, layer: 'center' });
  addEntity(drawing, 'dim', { kind: 'horizontal', x1: 0, y1: 0, x2: 40, y2: 0, ox: 20, oy: -10, layer: 'dim' });
  addEntity(drawing, 'line', { x1: 0, y1: 50, x2: 10, y2: 50 });
  const { loops, open } = collectLoops(drawing.entities, drawing);
  assert.equal(loops.length, 2, 'rectangle + the joined lines/arc');
  assert.equal(open.length, 1, 'the loose line stays open');
  assert.ok(circleSegments(0.5) >= 48 && circleSegments(1000) <= 360);
});

test('nesting: holes in plates, islands in holes', () => {
  const ring = (r, cx = 0) => Array.from({ length: 64 }, (_, i) => ({ x: cx + r * Math.cos((i / 64) * 2 * Math.PI), y: r * Math.sin((i / 64) * 2 * Math.PI) }));
  const shapes = buildShapes([ring(50), ring(30), ring(10), ring(5, 100)]);
  assert.equal(shapes.length, 3, 'plate, island inside its hole, separate disc');
  const plate = shapes.find((shape) => shape.holes.length === 1);
  assert.ok(polygonArea(plate.outer) > 0 && polygonArea(plate.holes[0]) < 0, 'outer CCW, hole CW');
});

test('a flange plate prints as one watertight solid with its bolt holes', () => {
  const drawing = createDrawing();
  addEntity(drawing, 'part', { kind: 'flange', x: 0, y: 0, params: { outer: 120, bore: 40, pcd: 90, holes: 6, holeDia: 11 } });
  const result = prepareStl(drawing.entities, drawing, { thickness: 8 });
  assert.equal(result.shapes.length, 1);
  assert.equal(result.holes, 7, 'bore + 6 bolt holes; the pitch circle (centre line) is not a hole');
  assertWatertight(result.triangles);
  near(result.volume, result.area * 8, 1e-6 * result.volume);
  near(result.size.x, 120, 0.01);
  assert.equal(result.size.z, 8);
});

test('gear with keyway bore: watertight, volume = area × thickness', () => {
  const drawing = createDrawing();
  addEntity(drawing, 'part', { kind: 'gear', x: 10, y: 5, angle: 7, params: { module: 2, teeth: 20, bore: 12, keyway: true } });
  const result = prepareStl(drawing.entities, drawing, { thickness: 6 });
  assert.equal(result.shapes.length, 1);
  assert.equal(result.holes, 1);
  assertWatertight(result.triangles);
  near(result.volume, result.area * 6, 1e-6 * result.volume);
});

test('binary and ASCII STL encodings', () => {
  const tris = extrude([{ outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], holes: [] }], 2);
  assert.equal(tris.length, 12, 'a box has 12 triangles');
  near(meshVolume(tris), 200, 1e-9);
  const bytes = toBinaryStl(tris, 'box');
  assert.equal(bytes.length, 84 + 12 * 50);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(80, true), 12);
  assert.ok(new TextDecoder().decode(bytes.subarray(0, 12)).startsWith('MyCAD STL'));
  const normalZ = view.getFloat32(84 + 8, true);
  assert.ok(Math.abs(Math.abs(normalZ) - 1) < 1e-6, 'top/bottom faces have vertical normals');
  const ascii = toAsciiStl(tris, 'box');
  assert.ok(ascii.startsWith('solid box') && ascii.trim().endsWith('endsolid box'));
  assert.equal((ascii.match(/facet normal/g) ?? []).length, 12);
  assert.equal(Buffer.from(toBase64(bytes), 'base64').length, bytes.length);
});

test('nothing closed → an empty mesh, not an error', () => {
  const result = prepareStl([createEntity('line', { x1: 0, y1: 0, x2: 1, y2: 1 })], null, { thickness: 3 });
  assert.equal(result.triangles.length, 0);
  assert.equal(result.size, null);
  assert.equal(result.open, 1);
});
