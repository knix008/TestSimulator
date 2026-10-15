// FreeCAD CAM job: operations (adaptive, face, helix, thread milling,
// tapping, slot, deburr, V-carve, probe, custom, array, compound), dress-ups,
// the whole job posted as G-code, tool bit files and the sanity check.
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDressups, jobGcode, normalizeCamJob, normalizeController, normalizeOp, normalizeTool, opPaths, sanityCheck, toolFromFctb, toolToFctb } from '../../src/domain/camjob.js';

const square = (s = 40) => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }];
const src = (extra = {}) => ({ loops: [square()], chains: [], circles: [], ...extra });
const tool = normalizeTool({ id: 't1', name: 'EM6', kind: 'endmill', diameter: 6 });
const ctx = (extra = {}) => ({ source: src(), tool, controller: normalizeController({ id: 'c1', tool: 't1' }), ...extra });
const op = (type, options = {}, more = {}) => normalizeOp({ id: `o-${type}`, type, name: type, controller: 'c1', options: { depth: 3, stepDown: 1.5, stepOver: 0.5, top: 0, ...options }, ...more });
const zs = (paths) => [...new Set(paths.flatMap((p) => p.points.map((q) => q.z)))].sort((a, b) => a - b);

test('adaptive clearing: rings from the middle out, every one inside the outline by the tool radius', () => {
  const paths = opPaths(op('adaptive'), ctx());
  assert.ok(paths.length > 4);
  assert.deepEqual(zs(paths), [-3, -1.5]);
  for (const p of paths) for (const q of p.points) assert.ok(q.x >= 3 - 1e-6 && q.x <= 37 + 1e-6 && q.y >= 3 - 1e-6 && q.y <= 37 + 1e-6);
  const first = paths[0].points; const last = paths.filter((p) => p.points[0].z === -1.5).at(-1).points;
  assert.ok(Math.max(...first.map((q) => q.x)) - Math.min(...first.map((q) => q.x)) < Math.max(...last.map((q) => q.x)) - Math.min(...last.map((q) => q.x)), 'inner ring first');
});

test('face milling covers the box and more; helix bores a hole; thread milling climbs at the pitch; tapping is a cycle', () => {
  const face = opPaths(op('millFace', { depth: 1, stepDown: 1, extra: 2 }), ctx());
  const xs = face.flatMap((p) => p.points.map((q) => q.x));
  assert.ok(Math.min(...xs) <= -5 && Math.max(...xs) >= 45);
  const hole = { x: 50, y: 50, r: 5 };
  const helix = opPaths(op('helix', { depth: 6, stepDown: 2 }), ctx({ source: src({ loops: [], circles: [hole] }) }));
  const pts = helix[0].points;
  assert.ok(pts.every((q) => Math.abs(Math.hypot(q.x - 50, q.y - 50) - 2) < 1e-6), 'tool centre on radius 5 − 3');
  assert.equal(Math.min(...pts.map((q) => q.z)), -6);
  const thread = opPaths(op('threadMilling', { depth: 6, pitch: 1.5 }), ctx({ source: src({ loops: [], circles: [hole] }) }))[0].points;
  assert.equal(thread[0].z, -6);
  assert.equal(thread.at(-1).z, 0);
  const tap = opPaths(op('tapping', { depth: 8, pitch: 1.25 }), ctx({ source: src({ loops: [], circles: [hole] }) }));
  assert.equal(tap[0].kind, 'tap');
  assert.equal(tap[0].pitch, 1.25);
});

test('slot, deburr and V-carve: along the line, at the chamfer depth, deeper towards the middle', () => {
  const slot = opPaths(op('slot', { extend: 2 }), ctx({ source: src({ loops: [], chains: [[{ x: 0, y: 0 }, { x: 10, y: 0 }]] }) }));
  assert.deepEqual([slot[0].points[0].x, slot[0].points.at(-1).x], [-2, 12]);
  const vbit = normalizeTool({ id: 't2', kind: 'vbit', diameter: 6, angle: 90 });
  const deburr = opPaths(op('deburr', { width: 0.5 }), ctx({ tool: vbit }));
  assert.ok(Math.abs(deburr[0].points[0].z + 0.5) < 1e-9);
  const carve = opPaths(op('vcarve', { step: 2, maxDepth: 50 }), ctx({ tool: vbit, source: src({ loops: [square(20)] }) }));
  const depths = carve.map((p) => p.points[0].z);
  assert.equal(depths[0], 0);
  assert.ok(depths.at(-1) < -7, `deepest ${depths.at(-1)}`);
});

test('probe, custom, comment, stop; array and compound of other operations', () => {
  const probe = opPaths(op('probe', { nx: 3, ny: 2 }), ctx());
  assert.equal(probe.length, 6);
  assert.equal(probe[0].kind, 'probe');
  assert.deepEqual(opPaths(op('custom', { gcode: 'G4 P1\n\nM8' }), ctx())[0].lines, ['G4 P1', 'M8']);
  assert.deepEqual(opPaths(op('stop', { optional: true }), ctx())[0].lines, ['M1']);
  const base = op('profile', { side: 'outside' });
  const opsById = new Map([[base.id, base]]);
  const pathsOf = (o) => opPaths(o, ctx());
  const arr = opPaths(normalizeOp({ id: 'a', type: 'array', base: base.id, options: { count: 3, dx: 100 } }), { ...ctx(), opsById, pathsOf });
  assert.equal(arr.length, 2 * pathsOf(base).length);
  assert.ok(arr.at(-1).points.every((q) => q.x > 150));
  const comp = opPaths(normalizeOp({ id: 'k', type: 'compound', children: [base.id] }), { ...ctx(), opsById, pathsOf });
  assert.equal(comp.length, pathsOf(base).length);
});

test('dress-ups: tags lift the path, ramp entry slopes in, lead-in arcs, dogbone pokes the corners, boundary clips, Z correction tilts', () => {
  const ringPath = { op: 'x', kind: 'cut', points: [...square(), square()[0]].map((p) => ({ ...p, z: -3 })) };
  const opts = { tool, options: { stepDown: 1.5 } };
  const tagged = applyDressups([ringPath], [{ type: 'tag', params: { count: 4, width: 6, height: 2 } }], opts)[0];
  assert.ok(tagged.points.some((q) => q.z === -1) && tagged.points.some((q) => q.z === -3));
  const ramped = applyDressups([ringPath], [{ type: 'rampEntry', params: { angle: 10 } }], opts)[0];
  assert.equal(ramped.points[0].z, -1.5);
  assert.ok(ramped.points.length > ringPath.points.length);
  const led = applyDressups([ringPath], [{ type: 'leadInOut', params: { radius: 3 } }], opts)[0];
  assert.ok(Math.hypot(led.points[0].x - 0, led.points[0].y - 0) > 2, 'starts off the path');
  const dog = applyDressups([ringPath], [{ type: 'dogbone', params: { side: 'left' } }], opts)[0];
  assert.equal(dog.points.length, ringPath.points.length + 2 * 4, 'all four corners of the closed square');
  const bound = applyDressups([ringPath], [{ type: 'boundary', params: { boundary: [{ x: -1, y: -1 }, { x: 20, y: -1 }, { x: 20, y: 50 }, { x: -1, y: 50 }] } }], opts);
  assert.ok(bound.every((p) => p.points.every((q) => q.x <= 20 + 1e-9)));
  const tilted = applyDressups([ringPath], [{ type: 'zCorrect', params: { a: 0.1, b: 0.01, c: 0 } }], opts)[0];
  assert.ok(tilted.points.some((q) => Math.abs(q.z - (-3 + 0.1 + 0.4)) < 1e-9));
  const mapped = applyDressups([ringPath], [{ type: 'axisMap', params: { radius: 10 } }], opts)[0];
  assert.ok(Math.abs(mapped.points[2].a - (40 / 10) * (180 / Math.PI)) < 1e-9);
});

test('the job posted: fixture, tool changes, every active operation, probing and tapping cycles; tool bits and sanity', () => {
  const job = normalizeCamJob({
    name: 'J', fixtures: ['G55'], propertyBag: { Material: 'Al' },
    tools: [tool, normalizeTool({ id: 't3', kind: 'tap', diameter: 5, pitch: 0.8 })],
    controllers: [normalizeController({ id: 'c1', tool: 't1', number: 1, spindle: 10000 }), normalizeController({ id: 'c3', tool: 't3', number: 3, spindle: 500 })],
    ops: [op('profile', { side: 'outside' }), op('comment', { text: 'flip' }), { ...op('tapping', { depth: 8, pitch: 0.8 }), controller: 'c3' }, { ...op('millFace'), active: false }],
  });
  const ctxOf = (o) => ({ source: src({ circles: [{ x: 10, y: 10, r: 2.5 }] }), tool: job.tools.find((x) => x.id === job.controllers.find((c) => c.id === o.controller)?.tool), controller: job.controllers.find((c) => c.id === o.controller) });
  const g = jobGcode(job, ctxOf, { date: new Date('2026-01-01T00:00:00Z') });
  assert.match(g, /^%\n/);
  assert.match(g, /\(Material = Al\)/);
  assert.match(g, /\nG55\n/);
  assert.match(g, /T1 M6[\s\S]*S10000 M3[\s\S]*\(flip\)[\s\S]*T3 M6[\s\S]*G84 X10 Y10 Z-8 R1 F400/);
  assert.doesNotMatch(g, /millFace/);
  const back = toolFromFctb(toolToFctb(normalizeTool({ name: 'V60', kind: 'vbit', diameter: 12, angle: 60 })));
  assert.deepEqual([back.kind, back.diameter, back.angle, back.name], ['vbit', 12, 60, 'V60']);
  const issues = sanityCheck(normalizeCamJob({ tools: [], controllers: [normalizeController({ id: 'c9', tool: 'missing' })], ops: [op('pocket', {}, { controller: 'nope' })] }), () => ({ source: src({ loops: [] }) }));
  assert.deepEqual(issues.map((i) => i.key).sort(), ['opNoController', 'opNoGeometry', 'tcNoTool']);
});
