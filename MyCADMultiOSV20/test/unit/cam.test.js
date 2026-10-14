// CAM: tool paths (profile, pocket, drill, engrave) and the G-code made from them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { camPaths, camSource, camStats, offsetOutline, parseGcode, passDepths, toGcode } from '../../src/domain/cam.js';
import { createEntity } from '../../src/domain/entities.js';
import { polygonArea } from '../../src/domain/geometry.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
const part = () => [createEntity('rect', { x: 0, y: 0, width: 100, height: 50 }), createEntity('circle', { cx: 30, cy: 25, r: 8 }), createEntity('circle', { cx: 70, cy: 25, r: 4 })];

/** Shortest distance from a point to a closed outline. */
function toOutline(p, loop) {
  let best = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return best;
}

test('offsets: outside rounds the corners, inside keeps the tool radius, too small vanishes', () => {
  near(polygonArea(offsetOutline(square, 3)), 106 * 56 - (4 - Math.PI) * 9, 0.5);
  near(polygonArea(offsetOutline(square, -3)), 94 * 44);
  assert.equal(offsetOutline([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], -3), null);
  for (const p of offsetOutline(square, 3)) near(toOutline(p, square), 3, 1e-6);
  assert.deepEqual(passDepths({ top: 0, depth: 5, stepDown: 2 }), [-2, -4, -5]);
});

test('profile: outside of the part, inside its holes, in passes; climb direction', () => {
  const job = camPaths(camSource(part()), { operation: 'profile', side: 'outside', tool: 6, depth: 3, stepDown: 1 });
  assert.equal(job.paths.length, 9, '3 outlines × 3 passes');
  const outer = job.paths.find((p) => p.points.some((q) => q.x < 0));
  assert.ok(polygonArea(outer.points.slice(0, -1)) < 0, 'climb: round the outside clockwise');
  const hole = job.paths.find((p) => p.points.every((q) => Math.hypot(q.x - 30, q.y - 25) < 8));
  assert.ok(hole, 'the hole is cut from inside');
  for (const q of hole.points) near(Math.hypot(q.x - 30, q.y - 25), 5, 0.2);
  assert.ok(polygonArea(hole.points.slice(0, -1)) > 0, 'climb: inside a hole counter-clockwise');
});

test('pocket: the tool never comes nearer the outline or the holes than its radius', () => {
  const ents = [createEntity('rect', { x: 0, y: 0, width: 100, height: 50 }), createEntity('circle', { cx: 50, cy: 25, r: 10 })];
  const source = camSource(ents);
  const job = camPaths(source, { operation: 'pocket', tool: 6, depth: 2, stepDown: 2, stepOver: 0.5 });
  const [outer, island] = [...source.loops].sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  for (const path of job.paths) for (const p of path.points) {
    assert.ok(toOutline(p, outer) >= 3 - 1e-6, `outline ${JSON.stringify(p)}`);
    assert.ok(Math.hypot(p.x - 50, p.y - 25) >= 13 - 0.05, `island ${JSON.stringify(p)}`);
  }
  assert.ok(island);
  // Rows a step over apart cover the whole width.
  const ys = [...new Set(job.paths.filter((p) => p.points.length === 2).map((p) => p.points[0].y.toFixed(3)))].map(Number).sort((a, b) => a - b);
  assert.ok(ys.length >= 14);
  for (let i = 1; i < ys.length; i++) near(ys[i] - ys[i - 1], 3, 1e-6);
});

test('G-code: units, spindle, plunge then cut, peck drilling, and it reads back', () => {
  const source = camSource(part());
  const profile = toGcode(camPaths(source, { operation: 'profile', tool: 6, depth: 3, stepDown: 1, safeZ: 5, feed: 800, plunge: 100, spindle: 10000 }), { title: 'Plate' });
  assert.match(profile, /^%\n\(Plate — MyCAD CAM\)/);
  assert.match(profile, /\nG21 G90 G94 G17/);
  assert.match(profile, /\nM3 S10000\n/);
  assert.match(profile, /\nG1 Z-1 F100\n/);
  assert.match(profile, /F800\n/);
  assert.match(profile, /\nM5\nM30\n%\n$/);
  const moves = parseGcode(profile);
  near(Math.min(...moves.map((m) => m.to.z)), -3);
  assert.ok(moves.filter((m) => m.rapid).every((m) => m.to.z >= 5 - 1e-9 || m.from.z >= 5 - 1e-9), 'rapids only at the safe height');
  const drill = toGcode(camPaths(source, { operation: 'drill', depth: 6, peck: 2 }));
  assert.match(drill, /\nG98 G83 Q2 X30 Y25 Z-6 R1 F150\nX70 Y25\nG80\n/);
  const holes = parseGcode(drill).filter((m) => !m.rapid);
  assert.deepEqual(holes.map((m) => [m.to.x, m.to.y, m.to.z]), [[30, 25, -6], [70, 25, -6]]);
  const stats = camStats(camPaths(source, { operation: 'engrave', depth: 1, stepDown: 1, feed: 1000 }));
  assert.ok(stats.cut > 300 && stats.minutes > 0);
});
