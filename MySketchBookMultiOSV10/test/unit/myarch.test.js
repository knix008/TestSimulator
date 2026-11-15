// MyArchitecture projects (.myarch, src/io/plan-myarch.js) → a building → a project (plan-building.js):
// levels, walls (centre lines in mm), doors / windows at `at` on their wall facing `side` with the hinge at
// the `hinge` end, rooms, stairs, columns and furniture — checked on real MyArchitecture samples
// (test/fixtures/myarch, copied from MyArchitecture V20 and V10) and on small hand-made files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { readMyarch, parseMyarch, isMyarchName, myarchOpeningItem } from '../../src/io/plan-myarch.js';
import { applyBuilding } from '../../src/io/plan-building.js';
import { createProject, normalizeProject } from '../../src/engine/document.js';
import { wallDir, wallNormal } from '../../src/engine/walls.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '../fixtures/myarch');
const V20_SAMPLES = path.join(here, '../../../MyArchitectureMultiOSV20/sample');
const fixture = (name) => readFileSync(path.join(FIXTURES, name));
const ITEMS = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));
const MAT = new THREE.MeshBasicMaterial();
const near = (a, b, tol = 0.002) => Math.abs(a - b) <= tol;

/** The building put into a fresh project, as the app does for File › Open (furniture left to the caller). */
function toProject(building, matchItem = null) {
  const p = createProject();
  const counts = applyBuilding(p, building, { target: 'new', matchItem });
  return { p: normalizeProject(p), counts };
}

/** The world centre of a project opening (wall start + direction × offset). */
function openingCenter(p, o) {
  const w = p.walls.find((x) => x.id === o.wall);
  const d = wallDir(w);
  return [w.a[0] + d[0] * o.offset, w.a[1] + d[1] * o.offset];
}

test('myarch: names, item choice and refusing other files', () => {
  assert.equal(isMyarchName('house.myarch'), true);
  assert.equal(isMyarchName('HOUSE.MYARCH'), true);
  assert.equal(isMyarchName('house.msk'), false);
  assert.equal(myarchOpeningItem('door', 'single', 0.9), 'door-single');
  assert.equal(myarchOpeningItem('door', 'double', 1.6), 'door-double');
  assert.equal(myarchOpeningItem('door', 'sliding', 1.8), 'door-sliding');
  assert.equal(myarchOpeningItem('door', 'garage', 2.4), 'door-garage');
  assert.equal(myarchOpeningItem('window', 'fixed', 1), 'window-fixed');
  assert.equal(myarchOpeningItem('window', 'sliding', 1), 'window-sliding');
  assert.equal(myarchOpeningItem('window', 'casement', 1), 'window-casement');
  assert.equal(myarchOpeningItem('opening', 'none', 1.6), 'door-cased-opening');
  for (const id of ['door-single', 'door-double', 'door-sliding', 'door-garage', 'window-fixed', 'window-sliding', 'window-casement', 'door-cased-opening', 'stairs', 'column']) assert.ok(ITEMS.has(id), `library item ${id}`);
  for (const bad of ['not json', '{"format":"other","walls":[]}', '{"hello":1}', '[]']) {
    assert.throws(() => parseMyarch(bad), (e) => e.code === 'myarch-invalid', bad);
  }
  assert.ok(parseMyarch('﻿{"format":"myarch","version":1,"levels":[],"walls":[]}'), 'a BOM is fine');
});

test('myarch: the studio sample — mm to metres, every wall, opening and room, centred on the origin', () => {
  const src = JSON.parse(fixture('01-studio.myarch'));
  const { building } = readMyarch(fixture('01-studio.myarch'));
  assert.equal(building.format, 'myarch');
  assert.equal(building.levels.length, src.levels.length);
  assert.equal(building.walls.length, src.walls.length);
  assert.equal(building.openings.length, src.openings.length);
  assert.equal(building.rooms.length, src.rooms.length);
  const w0 = src.walls[0]; const b0 = building.walls[0];
  assert.deepEqual(b0.a, [w0.x1 / 1000, w0.y1 / 1000]);
  assert.deepEqual(b0.b, [w0.x2 / 1000, w0.y2 / 1000]);
  assert.ok(near(b0.thickness, w0.thickness / 1000));
  // The opening's centre is `at` mm from its wall's start along the wall
  for (const [i, o] of src.openings.entries()) {
    const w = src.walls.find((x) => x.id === o.wall);
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const c = building.openings[i].center;
    assert.ok(near(c[0], (w.x1 + ((w.x2 - w.x1) / L) * o.at) / 1000) && near(c[1], (w.y1 + ((w.y2 - w.y1) / L) * o.at) / 1000), `opening ${i} centre`);
    assert.ok(near(building.openings[i].width, o.width / 1000) && near(building.openings[i].height, o.height / 1000) && near(building.openings[i].sill, o.sill / 1000));
  }
  const { p } = toProject(building);
  assert.equal(p.openings.length, src.openings.length, 'every opening found its wall');
  assert.equal(p.rooms.length, src.rooms.length);
  assert.ok(p.walls.length >= src.walls.length, 'walls (split where they meet)');
  // Centred: the walls' box is about the origin
  const xs = p.walls.flatMap((w) => [w.a[0], w.b[0]]); const zs = p.walls.flatMap((w) => [w.a[1], w.b[1]]);
  assert.ok(near((Math.min(...xs) + Math.max(...xs)) / 2, 0, 0.01) && near((Math.min(...zs) + Math.max(...zs)) / 2, 0, 0.01));
  // Every opening stays where MyArchitecture put it (shifted like the walls)
  const shift = p.planShift;
  for (const b of building.openings) {
    const want = [b.center[0] + shift[0], b.center[1] + shift[1]];
    const got = p.openings.map((o) => openingCenter(p, o)).sort((x, y) => Math.hypot(x[0] - want[0], x[1] - want[1]) - Math.hypot(y[0] - want[0], y[1] - want[1]))[0];
    assert.ok(Math.hypot(got[0] - want[0], got[1] - want[1]) < 0.02, `opening at ${want}`);
  }
});

test('myarch: a two-storey house — levels by elevation, heights, stairs to the floor above, V10 files too', () => {
  for (const file of ['03-two-storey-house.myarch', '03-two-storey-house.v10.myarch']) {
    const src = JSON.parse(fixture(file));
    const { building, counts } = readMyarch(fixture(file));
    assert.equal(building.levels.length, 2, file);
    const want = [...src.levels].sort((a, b) => a.elevation - b.elevation).map((l) => l.elevation / 1000);
    building.levels.forEach((l, i) => assert.ok(near(l.elevation, want[i], 1e-9), `${file}: level ${i} at ${want[i]} m`));
    assert.ok(building.levels.every((l) => l.height > 2 && l.height < 4));
    const stairs = building.objects.filter((o) => o.item === 'stairs');
    assert.equal(stairs.length, src.stairs.length, `${file}: stairs`);
    for (const s of stairs) assert.ok(near(s.params.rise, building.levels[1].elevation - building.levels[0].elevation, 0.01), 'rises to the next level');
    assert.equal(counts.roofs, src.roofs?.length ?? 0, 'roofs counted (said as left out)');
    const { p } = toProject(building);
    assert.equal(p.levels.length, 2);
    assert.equal(p.openings.length, building.openings.length, `${file}: every opening on its wall`);
    assert.equal(p.objects.filter((o) => o.item === 'stairs').length, stairs.length, `${file}: stairs placed`);
    assert.ok(p.objects.some((o) => o.item === 'stairs'));
    // Doors keep MyArchitecture's type and swing: an outside single door is not swapped for the entrance door
    // (which opens the other way); and every door opens to the side the file says
    for (const o of p.openings.filter((x) => x.item.startsWith('door'))) {
      assert.notEqual(o.item, 'door-entrance', `${file}: door type kept`);
      const w = p.walls.find((x) => x.id === o.wall);
      const c = openingCenter(p, o);
      const b = building.openings.reduce((best, x) => { const d = Math.hypot(x.center[0] + p.planShift[0] - c[0], x.center[1] + p.planShift[1] - c[1]); return !best || d < best.d ? { x, d } : best; }, null).x;
      const n = wallNormal(w);
      const facesLeft = b.facing[0] * n[0] + b.facing[1] * n[1] > 0;
      assert.equal(o.side, facesLeft ? 'left' : 'right', `${file}: door at ${c.map((v) => v.toFixed(2))} faces the file's side`);
    }
    // Each wall on its level; walls lower than the level keep their height
    const lv = new Set(p.levels.map((l) => l.id));
    assert.ok(p.walls.every((w) => lv.has(w.level)));
  }
});

test('myarch: a stair climbing along MyArchitecture +x climbs the same way in the app (library stairs climb −z)', () => {
  for (const rot of [0, 90, 180, 270]) {
    const doc = { format: 'myarch', levels: [{ id: 'a', elevation: 0, height: 3000 }, { id: 'b', elevation: 3000, height: 3000 }], walls: [{ id: 'w', level: 'a', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200 }], stairs: [{ id: 's', level: 'a', x: 2000, y: 2000, rot, length: 3600, width: 1000, steps: 16 }] };
    const { building } = readMyarch(JSON.stringify(doc));
    const s = building.objects.find((o) => o.item === 'stairs');
    const up = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rotation);
    const a = (rot * Math.PI) / 180;
    assert.ok(near(up.x, Math.cos(a), 1e-9) && near(up.z, Math.sin(a), 1e-9), `rot ${rot}: climbs (${up.x.toFixed(2)}, ${up.z.toFixed(2)})`);
  }
});

test('myarch: doors open to the side MyArchitecture shows (side) with the hinge at the same jamb (hinge)', () => {
  const item = ITEMS.get('door-single');
  for (const [x1, y1, x2, y2] of [[0, 0, 4000, 0], [0, 0, 0, 4000], [4000, 4000, 0, 4000]]) {
    for (const side of [1, -1]) {
      for (const hinge of ['start', 'end']) {
        const doc = { format: 'myarch', levels: [{ id: 'a', elevation: 0, height: 2800 }], walls: [{ id: 'w', level: 'a', x1, y1, x2, y2, thickness: 200 }], openings: [{ id: 'o', wall: 'w', kind: 'door', type: 'single', at: 2000, width: 900, height: 2100, sill: 0, side, hinge }] };
        const { building } = readMyarch(JSON.stringify(doc));
        const { p } = toProject(building);
        const o = p.openings[0]; const w = p.walls.find((x) => x.id === o.wall);
        // The door built like the scene builder, opened 90°
        const content = item.build({ ...Object.fromEntries(item.params.map((q) => [q.key, q.default])), ...o.params, open: 90, width: o.width, height: o.height }, { quality: 'low', wallThickness: w.thickness, material: () => MAT, THREE });
        if (o.flip) content.scale.x = -1;
        const g = new THREE.Group(); g.add(content);
        const d = wallDir(w); const n = wallNormal(w);
        g.position.set(w.a[0] + d[0] * o.offset, 0, w.a[1] + d[1] * o.offset);
        g.rotation.y = Math.atan2(n[0], n[1]) + (o.side === 'right' ? Math.PI : 0);
        g.updateMatrixWorld(true);
        const box = new THREE.Box3();
        content.traverse((m) => { if (m.isMesh && m.userData.role === 'leaf') box.union(new THREE.Box3().setFromObject(m)); });
        const c = box.getCenter(new THREE.Vector3());
        const centre = [w.a[0] + d[0] * o.offset, w.a[1] + d[1] * o.offset];
        const rel = [c.x - centre[0], c.z - centre[1]];
        // MyArchitecture's left normal (−dy, dx) in mm is the app's wallNormal for the same direction
        const L = Math.hypot(x2 - x1, y2 - y1); const u = [(x2 - x1) / L, (y2 - y1) / L]; const nm = [-u[1], u[0]];
        const out = rel[0] * nm[0] + rel[1] * nm[1];
        const along = rel[0] * u[0] + rel[1] * u[1];
        const label = `wall ${[x1, y1, x2, y2]} side ${side} hinge ${hinge}`;
        assert.ok(Math.sign(out) === side && Math.abs(out) > 0.3, `${label}: opens to side ${side} (${out.toFixed(2)})`);
        assert.ok(Math.sign(along) === (hinge === 'start' ? -1 : 1) && Math.abs(along) > 0.25, `${label}: hinged at the ${hinge} jamb (${along.toFixed(2)})`);
      }
    }
  }
});

test('myarch: inactive design options and demolished items are left out; columns, furniture, lamps come in', () => {
  const doc = {
    format: 'myarch', version: 1,
    designOptions: [{ id: 'set', name: 'Kitchen', active: 'optA', options: [{ id: 'optA', name: 'A' }, { id: 'optB', name: 'B' }] }],
    levels: [{ id: 'g', name: 'GF', elevation: 0, height: 3000 }],
    walls: [
      { id: 'w1', level: 'g', x1: 0, y1: 0, x2: 6000, y2: 0, thickness: 200 },
      { id: 'w2', level: 'g', x1: 0, y1: 3000, x2: 6000, y2: 3000, thickness: 200, phase: 'demolish' },
      { id: 'w3', level: 'g', x1: 0, y1: 5000, x2: 6000, y2: 5000, thickness: 200, option: 'optB' },
      { id: 'w4', level: 'g', x1: 0, y1: 6000, x2: 6000, y2: 6000, thickness: 200, option: 'optA' },
      { id: 'w5', level: 'g', x1: 7000, y1: 0, x2: 7000, y2: 4000, type: 'typed' },
    ],
    wallTypes: [{ id: 'typed', layers: [{ thickness: 100 }, { thickness: 150 }] }],
    openings: [{ id: 'o3', wall: 'w3', kind: 'window', type: 'fixed', at: 1000, width: 1000, height: 1200, sill: 900 }],
    columns: [{ id: 'c', level: 'g', x: 3000, y: 1500, w: 400, d: 400, rot: 0, shape: 'rect' }, { id: 'c2', level: 'g', x: 4000, y: 1500, w: 300, rot: 0, shape: 'round', height: 2500 }],
    furniture: [
      { id: 'f', level: 'g', kind: 'doubleBed', x: 2000, y: 1500, rot: 90, w: 1600, d: 2000, h: 500, elevation: 0 },
      { id: 'l', level: 'g', kind: 'ceilingLight', x: 1000, y: 1000, rot: 0, w: 500, d: 500, h: 120, elevation: 2680, light: { on: true } },
      { id: 'm', level: 'g', kind: 'model', x: 1000, y: 1000, rot: 0, w: 500, d: 500, h: 500, model: 'x' },
    ],
  };
  const { building } = readMyarch(JSON.stringify(doc));
  assert.deepEqual(building.walls.map((w) => w.key), ['w1', 'w4', 'w5'], 'demolished and option-B walls left out');
  assert.equal(building.openings.length, 0, 'the window of a hidden wall too');
  assert.ok(near(building.walls.find((w) => w.key === 'w5').thickness, 0.25), 'typed wall: the sum of its layers');
  const cols = building.objects.filter((o) => o.item === 'column');
  assert.deepEqual(cols.map((c) => c.params.shape), ['square', 'round']);
  assert.equal(cols[0].params.fitLevel, true); assert.ok(near(cols[1].params.height, 2.5));
  assert.ok(building.objects.every((o) => o.name === ''), 'no internal kind ids as names');
  const bed = building.objects.find((o) => o.hints === 'doubleBed');
  assert.ok(near(bed.rotation, -Math.PI / 2, 1e-9) && near(bed.size[0], 1.6) && near(bed.size[2], 2.0) && near(bed.size[1], 0.5));
  const lamp = building.objects.find((o) => o.hints === 'ceilingLight');
  assert.ok(near(lamp.elevation, 2.68));
  assert.ok(building.warnings.includes('furniture-model'), 'an embedded model is reported, not placed');
  // Into a project: columns placed; furniture by the matcher
  const placed = [];
  const { p } = toProject(building, (o) => { placed.push(o.hints); return { item: 'armchair' }; });
  assert.equal(p.objects.filter((o) => o.item === 'column').length, 2);
  assert.deepEqual(placed.sort(), ['ceilingLight', 'doubleBed']);
});

test('myarch: every MyArchitecture V20 sample reads and becomes a project (when the samples are next to this app)', { skip: !existsSync(V20_SAMPLES) && 'MyArchitectureMultiOSV20/sample not found' }, () => {
  const files = readdirSync(V20_SAMPLES).filter(isMyarchName);
  assert.ok(files.length >= 30, `samples (${files.length})`);
  for (const f of files) {
    const src = JSON.parse(readFileSync(path.join(V20_SAMPLES, f), 'utf8'));
    const { building } = readMyarch(readFileSync(path.join(V20_SAMPLES, f)));
    assert.equal(building.levels.length, Math.max(1, src.levels?.length ?? 0), `${f}: levels`);
    if (!building.walls.length) continue; // bridges, towers and massing studies (members, solids) have no walls
    const { p } = toProject(building);
    assert.ok(p.walls.length > 0, `${f}: walls`);
    assert.equal(p.openings.length, building.openings.length, `${f}: every opening on its wall`);
    for (const o of p.openings) {
      const w = p.walls.find((x) => x.id === o.wall);
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      assert.ok(o.offset >= o.width / 2 - 0.01 && o.offset <= L - o.width / 2 + 0.01, `${f}: opening inside its wall (${o.offset.toFixed(2)} of ${L.toFixed(2)})`);
    }
  }
});
