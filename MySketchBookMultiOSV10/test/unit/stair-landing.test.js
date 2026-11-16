// A stair keeps a floor landing at the doors. Opening a door on a multi-storey plan steps onto
// that floor, and the floor joins the landing to the flight (the opening is only the flight itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplate } from '../../src/engine/templates.js';
import { buildPlan } from '../../src/engine/plans.js';
import { buildSampleProject } from '../../src/engine/samples.js';
import { pointInPolygon, wallNormal } from '../../src/engine/walls.js';
import { holePolygons } from '../../src/engine/stairs.js';
import { polygonArea } from '../../src/engine/document.js';
import { stairClimb } from '../../src/engine/tour.js';

const projects = [
  ['duplex', () => buildTemplate('duplex')],
  ['loft', () => buildTemplate('loft')],
  ['house3', () => buildTemplate('house3')],
  ['building', () => buildTemplate('building')],
  ['house-2f', () => buildPlan('house-2f')],
  ['duplex-a', () => buildSampleProject('duplex-a', 'ko')],
  ['loft-a', () => buildSampleProject('loft-a', 'ko')],
  ['plan-house-2f', () => buildSampleProject('plan-house-2f', 'ko')],
];

const built = projects.map(([id, make]) => [id, make()]);

/** 'floor' inside a room and clear of every stair opening, 'hole' in an opening, 'void' inside a room rectangle that has no floor, 'out' elsewhere. */
function ground(project, level, pt) {
  const rooms = project.rooms.filter((r) => r.level === level && pointInPolygon(pt, r.points));
  if (rooms.length) return rooms.some((r) => holePolygons(r.holes).some((h) => pointInPolygon(pt, h))) ? 'hole' : 'floor';
  const inRect = (project.rects ?? []).some((r) => r.level === level && pt[0] > r.x0 + 0.05 && pt[0] < r.x1 - 0.05 && pt[1] > r.z0 + 0.05 && pt[1] < r.z1 - 0.05);
  return inRect ? 'void' : 'out';
}

/** True when `to` can be walked from `from` on this room's floor, skirting the stair opening. */
function reaches(room, from, to) {
  const holes = holePolygons(room.holes);
  const open = (p) => pointInPolygon(p, room.points) && !holes.some((h) => pointInPolygon(p, h));
  if (!open(from) || !open(to)) return false;
  const step = 0.2;
  const key = (p) => `${Math.round(p[0] / step)}:${Math.round(p[1] / step)}`;
  const seen = new Set([key(from)]);
  const queue = [from];
  while (queue.length) {
    const p = queue.pop();
    if (Math.hypot(p[0] - to[0], p[1] - to[1]) < step) return true;
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const n = [p[0] + dx, p[1] + dz];
      const k = key(n);
      if (seen.has(k) || !open(n)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return false;
}

test('every door on a multi-storey plan opens onto a floor, not the stair opening', () => {
  for (const [id, p] of built) {
    for (const o of p.openings.filter((op) => (op.sill ?? 0) <= 0.25 && op.height >= 1.6)) {
      const w = p.walls.find((x) => x.id === o.wall);
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
      const d = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
      const n = wallNormal(w);
      const cx = w.a[0] + d[0] * o.offset;
      const cz = w.a[1] + d[1] * o.offset;
      for (const along of [-o.width / 2, 0, o.width / 2]) {
        for (const dist of [0.35, 0.7]) {
          for (const s of [1, -1]) {
            const pt = [cx + d[0] * along + n[0] * s * dist, cz + d[1] * along + n[1] * s * dist];
            const kind = ground(p, w.level, pt);
            assert.ok(kind === 'floor' || kind === 'out', `${id}: a door steps onto ${kind}`);
          }
        }
      }
    }
  }
});

test('the upper stair hall keeps a floor, and its doors reach the flight', () => {
  for (const [id, p] of built) {
    const levels = [...p.levels].sort((a, b) => a.elevation - b.elevation);
    for (const stair of p.objects.filter((o) => o.item === 'stairs')) {
      const from = levels.find((l) => l.id === stair.level);
      const up = levels.find((l) => l.elevation > from.elevation + 0.3);
      if (!up) continue;
      const climb = stairClimb(stair);
      const hall = p.rooms.find((r) => r.level === up.id && pointInPolygon(climb.to, r.points));
      assert.ok(hall, `${id}: the flight arrives in no room`);
      assert.equal(holePolygons(hall.holes).some((h) => pointInPolygon(climb.to, h)), false, `${id}: the flight arrives in its own opening`);
      const floor = polygonArea(hall.points) - holePolygons(hall.holes).reduce((s, h) => s + polygonArea(h), 0);
      assert.ok(floor > 1, `${id}: the landing is ${floor.toFixed(2)} m²`);
      for (const o of p.openings.filter((op) => (op.sill ?? 0) <= 0.25 && op.height >= 1.6 && p.walls.find((w) => w.id === op.wall)?.level === up.id)) {
        const w = p.walls.find((x) => x.id === o.wall);
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
        const dir = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
        const n = wallNormal(w);
        const c = [w.a[0] + dir[0] * o.offset, w.a[1] + dir[1] * o.offset];
        for (const s of [1, -1]) {
          const pt = [c[0] + n[0] * s * 0.45, c[1] + n[1] * s * 0.45];
          if (!pointInPolygon(pt, hall.points)) continue;
          assert.ok(reaches(hall, pt, climb.to), `${id}: a door on ${up.name} does not reach the stair`);
        }
      }
    }
  }
});
