// Hole callouts: the hole wizard's text for each kind, and the circles a view sees grouped by hole feature.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel } from '../../src/cad/kernel.js';
import { createFeature, regenerate, newSketchId } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { holeCalloutLines, holeCalloutItems } from '../../src/cad/drawing-dims.js';

await loadKernel();

test('callout text: through, blind, counterbore, countersink, tapped', () => {
  assert.deepEqual(holeCalloutLines({ type: 'hole', kind: 'simple', diameter: 6.6, through: true }, 4), ['4× ⌀6.6 THRU']);
  assert.deepEqual(holeCalloutLines({ type: 'hole', kind: 'simple', diameter: 5, depth: 12 }), ['⌀5 ↧ 12']);
  assert.deepEqual(holeCalloutLines({ type: 'hole', kind: 'counterbore', diameter: 6.6, through: true, cbDiameter: 11, cbDepth: 6.5 }, 2), ['2× ⌀6.6 THRU', '⌴ ⌀11 ↧ 6.5']);
  assert.deepEqual(holeCalloutLines({ type: 'hole', kind: 'countersink', diameter: 6.6, through: true, csDiameter: 13, csAngle: 90 }), ['⌀6.6 THRU', '⌵ ⌀13 × 90°']);
  assert.deepEqual(holeCalloutLines({ type: 'hole', kind: 'tapped', diameter: 6.8, depth: 20, threadSize: 'M8', threadDepth: 16 }), ['⌀6.8 ↧ 20', 'M8 ↧ 16']);
});

test('a plate with four counterbored holes, seen from the top: one callout for the four', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 80, 60); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 12 }));
  const pl = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 12 }); part.features.push(pl);
  const pts = createFeature(part, 'sketch', { plane: { kind: 'ref', id: pl.id }, ...createSketchGeometry() });
  for (const [x, y] of [[10, 10], [70, 10], [10, 50], [70, 50]]) pts.entities.push({ id: newSketchId('p'), type: 'point', x, y, standalone: true });
  part.features.push(pts);
  const hole = createFeature(part, 'hole', { sketch: pts.id, kind: 'counterbore', diameter: 6.6, through: true, cbDiameter: 11, cbDepth: 6.5 }); part.features.push(hole);
  const body = regenerate(part).body;
  const items = holeCalloutItems(body, { id: 'v', type: 'top' }, [hole]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].lines, ['4× ⌀6.6 THRU', '⌴ ⌀11 ↧ 6.5']);
  assert.ok(Math.abs(items[0].r - 5.5) < 1e-6);
});

import { projectView } from '../../src/cad/drawing.js';

test('removed section: only the cut outline — the step behind the plane is not drawn', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const top = { kind: 'std', name: 'top' };
  const a = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addRectangle(a, 0, 0, 60, 40); part.features.push(a);
  part.features.push(createFeature(part, 'extrude', { sketch: a.id, depth: 10 }));
  const b = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addRectangle(b, 0, 0, 20, 40); part.features.push(b);
  part.features.push(createFeature(part, 'extrude', { sketch: b.id, depth: 30 }));
  const body = regenerate(part).body;
  // Cut square to X at x = 40 (through the low part only), looking back toward the tall step at x 0 … 20.
  const plane = { point: [40, 20, 5], normal: [1, 0, 0] };
  const full = projectView(body, 'right', { id: 's', kind: 'section', type: 'right', plane });
  const removed = projectView(body, 'right', { id: 'r', kind: 'section', type: 'right', plane, removed: true });
  const height = (p) => p.box.y1 - p.box.y0;
  // The full section shows the 30 high step behind; the removed one only the 10 high cut.
  assert.ok(Math.abs(height(full) - 30) < 1e-3, `${height(full)}`);
  assert.ok(Math.abs(height(removed) - 10) < 1e-3, `${height(removed)}`);
  assert.ok(removed.section.triangles.length > 0);
});

import { turnedView, viewBasis } from '../../src/cad/drawing.js';

test('3D drawing view: the front view turned 90° left and right becomes a side view', () => {
  const v = turnedView({ type: 'front' }, 90, 0);
  const b = viewBasis(v); const right = viewBasis({ type: 'right' }); const left = viewBasis({ type: 'left' });
  const same = (p, q) => p.every((x, i) => Math.abs(x - q[i]) < 1e-9);
  assert.ok(same(b.dir, right.dir) || same(b.dir, left.dir), JSON.stringify(b.dir));
  const u = turnedView({ type: 'front' }, 0, 90);
  const bu = viewBasis(u);
  assert.ok(Math.abs(Math.abs(bu.dir[2]) - 1) < 1e-9, JSON.stringify(bu.dir));
});
