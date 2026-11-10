// The plan workbench's 2D cleanup (src/io/plan-draft.js): draft ⇄ recogniser result, keeping corners joined and
// openings in place while walls move, squaring up, closing gaps, joining straight runs, removing crumbs,
// calibration, the checks, and a recognised sample plan cleaned up and converted to 3D (applyPlan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fromResult, toResult, cloneDraft, fromProject, moveVertex, moveWalls, splitWall, addWall, deleteItems, addOpening, addText,
  squareUp, joinEnds, mergeCollinear, removeShort, setThickness, setWallLength, scaleDraft, cleanupAll, draftProblems, openEnds,
  snapPoint, openingAt, wallAt, textAt, draftBounds, draftStats, wallLength, pointAlong, openingKind, corners,
  dominantAngle, rotateDraft, backgroundPoint, backgroundCentre,
} from '../../src/io/plan-draft.js';
import { applyPlan } from '../../src/io/plan-build.js';
import { readDxf, flattenDxf, dxfUnits, extentOf, dxfToPlan } from '../../src/io/plan-dxf.js';
import { recognizePlan } from '../../src/io/plan-recognize.js';
import { createProject } from '../../src/engine/document.js';
import { underlayToPlan } from '../../src/engine/underlay.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const near = (p, q, tol = 1e-6) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;

/** A 4 × 3 m box of 0.2 m walls (corners joined), a door on the bottom wall and a window on the right one. */
function box() {
  return fromResult({
    walls: [
      { a: [0, 0], b: [4, 0], thickness: 0.2 },
      { a: [4, 0], b: [4, 3], thickness: 0.2 },
      { a: [4, 3], b: [0, 3], thickness: 0.2 },
      { a: [0, 3], b: [0, 0], thickness: 0.2 },
    ],
    openings: [
      { wall: 0, item: 'door-single', offset: 1, width: 0.9, height: 2.1, sill: 0, side: 'left', hinge: 'left' },
      { wall: 1, item: 'window-casement', offset: 1.5, width: 1.2, height: 1.4, sill: 0.9 },
    ],
    texts: [{ text: '거실', p: [2, 1.5], height: 0.4 }],
    leftovers: [{ a: [1, 1], b: [2, 2] }],
  });
}

test('plan-draft: result → draft → result keeps walls, openings (by index), texts and lines', () => {
  const d = box();
  assert.equal(d.walls.length, 4);
  assert.ok(d.walls.every((w) => typeof w.id === 'string'));
  assert.equal(d.openings[0].wall, d.walls[0].id);
  const r = toResult(d);
  assert.equal(r.walls.length, 4);
  assert.equal(r.openings[0].wall, 0);
  assert.equal(r.openings[1].wall, 1);
  assert.equal(r.texts[0].text, '거실');
  assert.equal(r.leftovers.length, 1);
  assert.ok(!('id' in r.walls[0]) && !('id' in r.openings[0]));
  assert.deepEqual(draftStats(d), { walls: 4, doors: 1, windows: 1, passages: 0, texts: 1 });
  assert.equal(openingKind({ item: 'door-cased-opening' }), 'passage');
  const copy = cloneDraft(d);
  copy.walls[0].a[0] = 9;
  assert.equal(d.walls[0].a[0], 0, 'clone is deep');
});

test('plan-draft: moving a corner moves every wall end there; openings stay where they are in the plan', () => {
  const d = box();
  const doorAt = pointAlong(d.walls[0], d.openings[0].offset);
  assert.equal(moveVertex(d, [0, 0], [-0.5, 0]), 2);
  assert.ok(near(d.walls[0].a, [-0.5, 0]) && near(d.walls[3].b, [-0.5, 0]));
  assert.ok(near(pointAlong(d.walls[0], d.openings[0].offset), doorAt), 'door kept in place');
  assert.equal(openEnds(d).length, 0);
});

test('plan-draft: moving a wall drags the joined ends of its neighbours', () => {
  const d = box();
  moveWalls(d, [d.walls[1].id], [1, 0]);
  assert.ok(near(d.walls[1].a, [5, 0]) && near(d.walls[1].b, [5, 3]));
  assert.ok(near(d.walls[0].b, [5, 0]) && near(d.walls[2].a, [5, 3]));
  assert.equal(d.openings[1].offset, 1.5, 'window moves with its wall');
  assert.equal(openEnds(d).length, 0);
});

test('plan-draft: adding a wall onto another splits it (a T joint) and openings go to the right piece', () => {
  const d = box();
  const w = addWall(d, [2, 0], [2, 3], 0.1);
  assert.ok(w);
  assert.equal(d.walls.length, 7, 'bottom and top split + the new wall');
  assert.equal(openEnds(d).length, 0);
  const door = d.openings[0];
  const host = d.walls.find((x) => x.id === door.wall);
  assert.ok(near(pointAlong(host, door.offset), [1, 0]));
  assert.equal(addWall(d, [1, 1], [1, 1.01]), null, 'too short');
  const piece = splitWall(d, d.walls[1], [4, 0.001]);
  assert.equal(piece, null, 'no split at an end');
});

test('plan-draft: deleting a wall removes its openings; openings, texts by id', () => {
  const d = box();
  assert.equal(deleteItems(d, [d.walls[0].id]), 2);
  assert.equal(d.openings.length, 1);
  assert.equal(deleteItems(d, [d.openings[0].id, d.texts[0].id]), 2);
  assert.equal(d.openings.length + d.texts.length, 0);
});

test('plan-draft: openings are kept inside their wall; labels added', () => {
  const d = box();
  const op = addOpening(d, d.walls[2], 0, 'window');
  assert.equal(op.item, 'window-casement');
  assert.ok(op.offset >= op.width / 2);
  const door = addOpening(d, d.walls[3], 99, 'door');
  assert.ok(door.offset <= wallLength(d.walls[3]) - door.width / 2);
  assert.equal(door.item, 'door-single');
  assert.equal(addOpening(d, { id: 'x', a: [0, 0], b: [0.2, 0], thickness: 0.1 }, 0.1), null);
  addText(d, [1, 1], '침실');
  assert.equal(d.texts.length, 2);
});

test('plan-draft: squareUp makes nearly straight walls exact and keeps corners joined', () => {
  const d = fromResult({ walls: [
    { a: [0, 0], b: [4, 0.15], thickness: 0.2 },
    { a: [4, 0.15], b: [3.9, 3], thickness: 0.2 },
    { a: [3.9, 3], b: [0.05, 3.1], thickness: 0.2 },
    { a: [0.05, 3.1], b: [0, 0], thickness: 0.2 },
    { a: [0, 0], b: [-2, -2], thickness: 0.2 }, // 45°: left alone
  ], openings: [] });
  const turned = squareUp(d, { tolDeg: 6 });
  assert.equal(turned, 4);
  for (const w of d.walls.slice(0, 4)) assert.ok(Math.abs(w.a[0] - w.b[0]) < 1e-9 || Math.abs(w.a[1] - w.b[1]) < 1e-9, 'axis aligned');
  assert.equal(openEnds(d).length, 1, 'only the diagonal wall end is free');
  assert.ok(near(d.walls[4].b, [-2, -2]));
});

test('plan-draft: joinEnds closes corner gaps at the walls crossing and runs ends on to walls (T)', () => {
  const d = fromResult({ walls: [
    { a: [0, 0], b: [3.9, 0], thickness: 0.2 }, // gap at the corner (4, 0)
    { a: [4, 0.1], b: [4, 3], thickness: 0.2 },
    { a: [2, 2.8], b: [2, 0.2], thickness: 0.1 }, // stops 0.2 short of the bottom wall
  ], openings: [] });
  const n = joinEnds(d, { tol: 0.3 });
  assert.ok(n >= 3);
  // The bottom wall was split at the T: its right piece ends at the corner.
  assert.equal(d.walls.filter((w) => near(w.a, [4, 0]) || near(w.b, [4, 0])).length, 2, 'corner at the crossing');
  const inner = d.walls.find((w) => near(w.a, [2, 2.8]));
  assert.ok(near(inner.b, [2, 0], 1e-6), 'T joint on the bottom wall');
  assert.equal(d.walls.length, 4, 'the bottom wall is split at the T');
});

test('plan-draft: mergeCollinear joins straight runs (openings move over), not corners or T joints', () => {
  const d = fromResult({ walls: [
    { a: [0, 0], b: [2, 0], thickness: 0.2 },
    { a: [2, 0], b: [5, 0.01], thickness: 0.2 },
    { a: [5, 0.01], b: [5, 3], thickness: 0.2 },
  ], openings: [{ wall: 1, item: 'window-casement', offset: 1.5, width: 1, height: 1.4, sill: 0.9 }] });
  const at = pointAlong(d.walls[1], 1.5);
  assert.equal(mergeCollinear(d), 1);
  assert.equal(d.walls.length, 2);
  assert.equal(d.openings[0].wall, d.walls[0].id);
  assert.ok(near(pointAlong(d.walls[0], d.openings[0].offset), at, 0.02));
  const t = box();
  addWall(t, [2, 0], [2, 3], 0.1);
  assert.equal(mergeCollinear(t), 0, 'pieces at a T joint stay apart');
});

test('plan-draft: removeShort collapses crumbs to their middle so neighbours stay joined', () => {
  const d = fromResult({ walls: [
    { a: [0, 0], b: [3, 0], thickness: 0.2 },
    { a: [3, 0], b: [3.06, 0.05], thickness: 0.2 },
    { a: [3.06, 0.05], b: [3.06, 3], thickness: 0.2 },
  ], openings: [] });
  assert.equal(removeShort(d, { min: 0.12 }), 1);
  assert.equal(d.walls.length, 2);
  assert.ok(near(d.walls[0].b, d.walls[1].a));
});

test('plan-draft: thickness, length, scale (calibration)', () => {
  const d = box();
  assert.equal(setThickness(d, null, 0.15), 4);
  assert.equal(setThickness(d, [d.walls[0].id], 0.3), 1);
  assert.ok(setWallLength(d, d.walls[0], 5));
  assert.ok(near(d.walls[0].b, [5, 0]) && near(d.walls[1].a, [5, 0]));
  const e = box();
  scaleDraft(e, [0, 0], 2);
  assert.ok(near(e.walls[1].b, [8, 6]));
  assert.equal(e.walls[0].thickness, 0.4);
  assert.equal(e.openings[0].offset, 2);
  assert.equal(e.openings[0].width, 1.8);
  assert.ok(near(e.texts[0].p, [4, 3]));
  assert.ok(near(e.leftovers[0].b, [4, 4]));
  assert.equal(scaleDraft(e, [0, 0], 1), false);
});

test('plan-draft: problems — free ends, crumbs, overlaps, openings too wide or on top of each other', () => {
  const ok = box();
  assert.deepEqual(draftProblems(ok), []);
  const d = fromResult({ walls: [
    { a: [0, 0], b: [3, 0], thickness: 0.2 },
    { a: [1, 0], b: [2, 0], thickness: 0.2 },
    { a: [5, 5], b: [5.05, 5], thickness: 0.2 },
    { a: [8, 0], b: [8, 0.8], thickness: 0.2 },
  ], openings: [
    { wall: 0, item: 'window-casement', offset: 1, width: 1, height: 1, sill: 1 },
    { wall: 0, item: 'window-casement', offset: 1.5, width: 1, height: 1, sill: 1 },
    { wall: 3, item: 'door-single', offset: 0.4, width: 0.9, height: 2.1, sill: 0 },
  ] });
  const kinds = new Set(draftProblems(d).map((p) => p.kind));
  for (const k of ['open-end', 'short-wall', 'overlap', 'opening-wide', 'opening-overlap']) assert.ok(kinds.has(k), k);
});

test('plan-draft: snapping and picking', () => {
  const d = box();
  assert.equal(snapPoint(d, [0.05, 0.05], 0.1).kind, 'end');
  assert.deepEqual(snapPoint(d, [2.02, 0.03], 0.1).p, [2, 0]);
  assert.equal(snapPoint(d, [2.02, 0.03], 0.1).kind, 'mid');
  const on = snapPoint(d, [3, 0.05], 0.1);
  assert.equal(on.kind, 'on');
  assert.ok(near(on.p, [3, 0]));
  assert.equal(snapPoint(d, [2, 1.5], 0.1).kind, null);
  assert.equal(openingAt(d, [1.2, 0.05], 0.05)?.id, d.openings[0].id);
  assert.equal(openingAt(d, [3, 0], 0.05), null);
  assert.equal(wallAt(d, [3, 0.08], 0.02)?.id, d.walls[0].id);
  assert.equal(textAt(d, [2, 1.5], 0.1)?.text, '거실');
  assert.deepEqual(draftBounds(d), { min: [0, 0], max: [4, 3] });
  assert.equal(corners(d).points.length, 4);
});

test('plan-draft: a floor of a project comes back as a draft and converts again with its finishes kept', () => {
  const p = createProject();
  const level = p.levels[0].id;
  applyPlan(p, toResult(box()), { target: 'replace', shift: [0, 0] });
  const wall = p.walls.find((w) => w.level === level);
  wall.material = { left: 'paint-sage' };
  wall.height = 2.7;
  p.rooms[0].floor = 'floor-walnut';
  const d = fromProject(p, level);
  assert.equal(d.walls.length, 4);
  assert.equal(d.openings.length, 2);
  assert.equal(d.texts[0].text, '거실');
  squareUp(d);
  const applied = applyPlan(p, toResult(d), { target: 'replace', shift: [0, 0] });
  assert.equal(applied.walls, 4);
  assert.equal(applied.rooms, 1);
  assert.equal(p.rooms[0].floor, 'floor-walnut', 'room finish kept');
  assert.equal(p.rooms[0].name, '거실');
  const again = p.walls.find((w) => w.material?.left === 'paint-sage');
  assert.ok(again && again.height === 2.7, 'wall material and height kept');
});

test('plan-draft: a recognised sample drawing is cleaned up without losing walls and still makes rooms', () => {
  const file = path.join(root, 'samples', 'plans', 'apartment-59.dxf');
  if (!fs.existsSync(file)) return;
  const doc = readDxf(fs.readFileSync(file));
  const flat = flattenDxf(doc);
  const u = dxfUnits(doc, extentOf(flat).size, 'auto');
  const plan = dxfToPlan(flat, u.metres);
  const result = recognizePlan(plan);
  result.texts = plan.texts;
  const d = fromResult(result);
  const before = draftStats(d);
  const report = cleanupAll(d);
  assert.ok(report && typeof report.merged === 'number');
  const after = draftStats(d);
  assert.equal(after.doors, before.doors, 'doors kept');
  assert.equal(after.windows, before.windows, 'windows kept');
  assert.ok(draftProblems(d).filter((x) => x.kind === 'open-end').length <= draftProblems(fromResult(result)).filter((x) => x.kind === 'open-end').length);
  const p = createProject();
  const applied = applyPlan(p, toResult(d), { target: 'replace' });
  assert.ok(applied.rooms >= 4, `rooms ${applied.rooms}`);
});

test('plan-draft: straightening — the tilt of a turned plan, turning it back square, the background follows', () => {
  const d = box();
  assert.ok(Math.abs(dominantAngle(d)) < 1e-9, 'a square plan has no tilt');
  const tilt = (7 * Math.PI) / 180;
  rotateDraft(d, [2, 1.5], tilt);
  assert.ok(Math.abs(dominantAngle(d) - tilt) < 1e-9, 'tilt found');
  rotateDraft(d, [2, 1.5], -dominantAngle(d));
  for (const w of d.walls) assert.ok(Math.abs(w.a[0] - w.b[0]) < 1e-9 || Math.abs(w.a[1] - w.b[1]) < 1e-9, 'square again');
  assert.ok(near(d.walls[0].a, [0, 0], 1e-9));
  assert.ok(near(d.texts[0].p, [2, 1.5], 1e-9));
  assert.equal(rotateDraft(d, [0, 0], 0), false);
  // A 100 × 50 px picture, 0.1 m per pixel, top-left at (1, 2), turned 90° about its centre (6, 4.5).
  const bg = { offset: [1, 2], k: 0.1, rotation: Math.PI / 2, centre: [50, 25] };
  assert.ok(near(backgroundCentre(bg), [6, 4.5]));
  assert.ok(near(backgroundPoint(bg, [50, 25]), [6, 4.5]));
  assert.ok(near(backgroundPoint(bg, [100, 25]), [6, 9.5], 1e-9), 'right edge turns to below the centre');
  assert.ok(near(backgroundPoint({ ...bg, rotation: 0 }, [100, 50]), [11, 7]));
});

test('plan-draft: a turned plan picture (underlay) and the workbench background put every pixel at the same plan point', () => {
  const u = { width: 800, height: 600, position: [2, -1], rotation: 0.3, scale: 0.0125 };
  // As ui/plan-import.js underlayBackground: unturned top-left, rotation the other way round.
  const bg = { offset: underlayToPlan({ ...u, rotation: 0 }, [0, 0]), k: u.scale, rotation: -u.rotation, centre: [u.width / 2, u.height / 2] };
  for (const q of [[0, 0], [800, 0], [123, 456], [800, 600]]) assert.ok(near(backgroundPoint(bg, q), underlayToPlan(u, q), 1e-9), String(q));
  assert.ok(near(backgroundCentre(bg), u.position, 1e-9));
});
