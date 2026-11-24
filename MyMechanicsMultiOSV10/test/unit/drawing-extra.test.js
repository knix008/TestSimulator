// Drawing additions: aligned section views (the second leg turned into the first leg's plane), area hatch,
// revision cloud, datum target and bend table annotations (sheet primitives, SVG and DXF).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { projectView, alignedLegs, annotationPrimitives, polygonHatch, annotationSvg, drawingDxf, createDrawing } from '../../src/cad/drawing.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const triArea = (tris) => tris.reduce((s, [x0, y0, x1, y1, x2, y2]) => s + Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2, 0);

/** A section view of a 100 × 60 × 20 box across x = 50, seen from the front view (legs up and down). */
const sectionOf = (angle) => ({
  id: 's', kind: 'section', type: 'custom', dir: [1, 0, 0], plane: { point: [50, 30, 10], normal: [1, 0, 0] },
  ...(angle == null ? {} : { aligned: { angle, axis: [0, -1, 0], along: [0, 0, 1] } }),
});

test('aligned section: the second leg (turned by 30°) is cut along its own plane and laid into the first', () => {
  const box = R.makeBox([0, 0, 0], [100, 60, 20]);
  const plain = projectView(box, 'custom', sectionOf(null));
  near(triArea(plain.section.triangles), 20 * 60, 1e-6);
  const p = projectView(box, 'custom', sectionOf(30));
  assert.equal(p.aligned, true);
  // Up from the centre: 10 high; down along the turned leg: 10 / cos 30° to the bottom face. Both 60 deep.
  near(triArea(p.section.triangles), (10 + 10 / Math.cos(Math.PI / 6)) * 60, 1e-4);
  const L = alignedLegs(sectionOf(30));
  // The second leg points down, turned 30° about the line of sight.
  near(L.u2[2], -Math.cos(Math.PI / 6), 1e-12); near(Math.abs(L.u2[0]), 0.5, 1e-12);
  near(L.n1[0] * L.n2[0] + L.n1[2] * L.n2[2], Math.cos(Math.PI / 6), 1e-12);
});

test('aligned section with 0° is the plain section', () => {
  const box = R.makeBox([0, 0, 0], [100, 60, 20]);
  near(triArea(projectView(box, 'custom', sectionOf(0)).section.triangles), 1200, 1e-6);
});

test('area hatch: lines clipped to the region (even–odd), patterns and a solid fill', () => {
  // A 30 × 20 rectangle hatched at 0° every 2.5: lines at y = 2.5 … 17.5 (y 0 and 20 graze the edges), 30 long.
  const segs = polygonHatch([[0, 0], [30, 0], [30, 20], [0, 20]], 2.5, 0);
  const inner = segs.filter(([[, y]]) => y > 1e-9 && y < 20 - 1e-9);
  assert.equal(inner.length, 7);
  for (const [[x0], [x1]] of inner) near(Math.abs(x1 - x0), 30);
  // A square ring (an L-shaped outline would do too): the hole is skipped.
  const ring = polygonHatch([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0], [3, 3], [3, 7], [7, 7], [7, 3], [3, 3]], 5, 0);
  const mid = ring.filter(([[, y]]) => Math.abs(y - 5) < 1e-9);
  assert.equal(mid.length, 2);
  near(mid.reduce((s, [[a], [b]]) => s + Math.abs(b - a), 0), 6);
  const a = { id: 'h', kind: 'hatch', x: 10, y: 10, w: 30, h: 20, pattern: 'ansi37', spacing: 2.5, angle: 0 };
  const prims = annotationPrimitives(a);
  assert.ok(prims.length > 7 * 2);
  assert.ok(prims.every((q) => q.pts.every(([x, y]) => x >= 10 - 1e-9 && x <= 40 + 1e-9 && y >= 10 - 1e-9 && y <= 30 + 1e-9)));
  const solid = annotationPrimitives({ ...a, pattern: 'solid' });
  assert.equal(solid.length, 1); assert.equal(solid[0].t, 'fill');
  assert.ok(annotationSvg(a).includes('ann-hatch'));
});

test('revision cloud: one closed scalloped line around the region, every point on or outside it; the revision triangle', () => {
  const a = { id: 'c', kind: 'cloud', x: 20, y: 30, w: 60, h: 30, arc: 6, rev: 'B' };
  const prims = annotationPrimitives(a);
  const cloud = prims.find((q) => q.cls === 'ann-cloud');
  assert.ok(cloud.closed);
  // 10 arcs along each 60 side, 5 along each 30 side: 30 arcs of 8 steps.
  assert.equal(cloud.pts.length, 30 * 8 + 1);
  const inside = (x, y) => x > 20 + 1e-6 && x < 80 - 1e-6 && y > 30 + 1e-6 && y < 60 - 1e-6;
  assert.ok(cloud.pts.every(([x, y]) => !inside(x, y)), 'the arcs bulge outward');
  // The bulge: 0.35 × the 6 mm chord past the outline at most.
  const ys = cloud.pts.map((q) => q[1]);
  near(Math.min(...ys), 30 - 0.35 * 6, 1e-3);
  assert.ok(prims.some((q) => q.t === 'text' && q.text === 'B'));
  // Drawn the other way round (clockwise points), still outward.
  const cw = annotationPrimitives({ id: 'c2', kind: 'cloud', pts: [[20, 30], [20, 60], [80, 60], [80, 30]], arc: 6 }).find((q) => q.cls === 'ann-cloud');
  assert.ok(cw.pts.every(([x, y]) => !inside(x, y)));
});

test('datum target: split circle with size above and label below, an X at a point target, a circle for an area', () => {
  const pt = annotationPrimitives({ id: 'd', kind: 'datumTarget', x: 50, y: 50, size: 5, label: 'A1', area: 'Ø6', target: [70, 60] });
  assert.ok(pt.some((q) => q.t === 'circle' && q.r === 5));
  assert.deepEqual(pt.filter((q) => q.t === 'text').map((q) => q.text), ['Ø6', 'A1']);
  const leader = pt.find((q) => q.t === 'poly' && q.pts.length === 2 && q.pts[1][0] === 70);
  assert.ok(leader);
  const ar = annotationPrimitives({ id: 'd2', kind: 'datumTarget', x: 50, y: 50, target: [70, 60], targetKind: 'area', areaSize: 8 });
  assert.ok(ar.some((q) => q.t === 'circle' && q.r === 4 && q.cls === 'ann-phantom'));
});

test('bend table: a header and a row per bend; written to SVG and DXF', () => {
  const a = { id: 'b', kind: 'bendTable', x: 20, y: 20, rows: [{ no: 1, dir: 'UP', angle: 90, radius: 2, k: 0.44, allowance: 4.53 }, { no: 2, dir: 'DOWN', angle: 45, radius: 2, k: 0.44, allowance: 2.26 }] };
  const prims = annotationPrimitives(a);
  const texts = prims.filter((q) => q.t === 'text').map((q) => q.text);
  assert.deepEqual(texts.slice(0, 6), ['No.', 'Dir.', 'Angle', 'R', 'K', 'BA']);
  assert.ok(texts.includes('90°') && texts.includes('DOWN') && texts.includes('4.53'));
  const d = createDrawing({ id: 'dr', name: 'D', source: { kind: 'part', id: 'p' } });
  d.views = []; d.annotations = [a];
  const dxf = drawingDxf(d, new Map());
  assert.ok(dxf.includes('DOWN') && dxf.includes('4.53'));
});

test('phantom (alternate position) and bend lines go on their own DXF layers', () => {
  const d = createDrawing({ id: 'dr2', name: 'D', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: 'v1', type: 'front' }]; d.annotations = [];
  const proj = new Map([['v1', { visible: ['M 0 0 L 10 0'], hidden: [], box: { x0: 0, y0: -5, x1: 10, y1: 5 }, phantom: ['M 0 2 L 10 2'], bendLines: { up: ['M 5 -5 L 5 5'], down: [] } }]]);
  const dxf = drawingDxf(d, proj);
  assert.ok(/\nLAYER\n2\nPHANTOM\n/.test(dxf), 'PHANTOM layer');
  assert.ok(/\nLAYER\n2\nBENDS\n/.test(dxf), 'BENDS layer');
  assert.ok(/\n8\nPHANTOM\n/.test(dxf) && /\n8\nBENDS\n/.test(dxf), 'entities on them');
});
