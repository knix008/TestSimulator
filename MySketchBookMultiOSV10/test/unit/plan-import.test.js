// Import › Floor plan: the DXF reader (entities, units, blocks), the SVG reader, wall pair
// detection, door / window recognition on the sample plans (samples/plans, made by
// scripts/make-plan-samples.mjs with known answers) and the picture wall detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readDxf, flattenDxf, dxfUnits, extentOf, dxfToPlan, guessUnits, layerStats, plainText, SKIP_LAYER } from '../../src/io/plan-dxf.js';
import { readSvgPlan, svgUnits, svgToPlan } from '../../src/io/plan-svg.js';
import { recognizePlan, openingDefaults } from '../../src/io/plan-recognize.js';
import { applyPlan, floorForName } from '../../src/io/plan-build.js';
import { detectImageWalls, imageEdgeSegments } from '../../src/io/plan-image.js';
import { underlayToPlan, planToUnderlay } from '../../src/engine/underlay.js';
import { createProject, normalizeProject, History } from '../../src/engine/document.js';
import { packProject, unpackProject } from '../../src/engine/fileformat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plans = path.join(root, 'samples', 'plans');
// doors-variety: sliding, pocket, folding and double doors, a door block without an arc, windows as frame lines + glass,
// a rectangle and blocks (the openings carry their library item).
const SAMPLES = ['apartment-59', 'apartment-84', 'small-office', 'house-2room', 'doors-variety'];
const near = (p, q, tol) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
const sameWall = (x, w, tol) => (near(x.a, w.a, tol) && near(x.b, w.b, tol)) || (near(x.a, w.b, tol) && near(x.b, w.a, tol));

/** A minimal ASCII DXF from entity group lists. */
function dxf({ insunits = null, entities = [], blocks = [], layers = [] } = {}) {
  const g = [];
  const add = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) g.push(String(pairs[i]), String(pairs[i + 1])); };
  add(0, 'SECTION', 2, 'HEADER');
  if (insunits != null) add(9, '$INSUNITS', 70, insunits);
  add(0, 'ENDSEC', 0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER');
  for (const [name, color, flags = 0] of layers) add(0, 'LAYER', 2, name, 70, flags, 62, color);
  add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'BLOCKS');
  for (const b of blocks) { add(0, 'BLOCK', 8, '0', 2, b.name, 70, 0, 10, b.base?.[0] ?? 0, 20, b.base?.[1] ?? 0); g.push(...b.body); add(0, 'ENDBLK'); }
  add(0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  for (const e of entities) g.push(...e);
  add(0, 'ENDSEC', 0, 'EOF');
  return g.join('\n');
}
const LINE = (layer, x1, y1, x2, y2) => ['0', 'LINE', '8', layer, '10', x1, '20', y1, '11', x2, '21', y2].map(String);
const ARC = (layer, cx, cy, r, a0, a1) => ['0', 'ARC', '8', layer, '10', cx, '20', cy, '40', r, '50', a0, '51', a1].map(String);
const INSERT = (layer, name, x, y, sx = 1, sy = 1, rot = 0) => ['0', 'INSERT', '8', layer, '2', name, '10', x, '20', y, '41', sx, '42', sy, '50', rot].map(String);

// ───────────────────────── DXF reader

test('DXF: lines, polylines with bulges, arcs, texts and layers are read', () => {
  const text = dxf({
    insunits: 4,
    layers: [['A-WALL', 7], ['HIDDEN', -3], ['FROZEN', 1, 1]],
    entities: [
      LINE('A-WALL', 0, 0, 1000, 0),
      ['0', 'LWPOLYLINE', '8', 'A-WALL', '90', '3', '70', '1', '10', '0', '20', '0', '10', '2000', '20', '0', '42', '1', '10', '2000', '20', '2000'],
      ARC('A-DOOR', 0, 0, 900, 0, 90),
      ['0', 'TEXT', '8', 'A-TEXT', '10', '500', '20', '500', '40', '250', '1', '거실'],
      ['0', 'MTEXT', '8', 'A-TEXT', '10', '0', '20', '0', '40', '200', '1', '{\\fArial|b0;Bed\\Proom}'],
      LINE('HIDDEN', 0, 0, 5, 5),
      LINE('FROZEN', 0, 0, 5, 5),
    ],
  });
  const doc = readDxf(text);
  assert.equal(doc.header.insunits, 4);
  assert.equal(doc.entities.length, 7);
  assert.ok(doc.layers.get('HIDDEN').off && doc.layers.get('FROZEN').frozen);
  const flat = flattenDxf(doc);
  // 1 line + polyline: 1 straight edge, 1 bulge arc, 1 closing edge; hidden and frozen layers skipped.
  assert.equal(flat.lines.length, 3);
  assert.equal(flat.arcs.length, 2);
  const bulge = flat.arcs.find((a) => a.layer === 'A-WALL');
  assert.ok(Math.abs(bulge.r - 1000) < 1e-6 && near(bulge.c, [2000, 1000], 1e-6), JSON.stringify(bulge));
  assert.deepEqual(flat.texts.map((t) => t.text), ['거실', 'Bed room']);
  assert.equal(plainText('%%c50 \\Pnext'), '⌀50 next');
});

test('DXF: units come from $INSUNITS, the user, or a guess from the extent', () => {
  const doc = readDxf(dxf({ insunits: 5, entities: [LINE('0', 0, 0, 1200, 0)] }));
  assert.deepEqual(dxfUnits(doc, 1200), { units: 'cm', metres: 0.01, guessed: false });
  assert.deepEqual(dxfUnits(doc, 1200, 'in'), { units: 'in', metres: 0.0254, guessed: false });
  const bare = readDxf(dxf({ entities: [LINE('0', 0, 0, 12000, 0)] }));
  assert.equal(dxfUnits(bare, 12000).units, 'mm');
  assert.equal(dxfUnits(bare, 12000).guessed, true);
  assert.equal(guessUnits(12), 'm');
  assert.equal(guessUnits(1200), 'cm');
  assert.equal(guessUnits(12000), 'mm');
  // Plan axes: metres, z = −y.
  const plan = dxfToPlan(flattenDxf(doc), 0.01);
  assert.deepEqual(plan.lines[0].b, [12, -0]);
});

test('DXF: block inserts are transformed (scale, rotation, mirror) and take the insert layer for layer 0', () => {
  const doc = readDxf(dxf({
    blocks: [{ name: 'DOOR', body: [...ARC('0', 0, 0, 1, 0, 90), ...LINE('0', 0, 0, 0, 1), ...LINE('KEEP', 0, 0, 1, 0)] }, { name: 'NEST', body: INSERT('0', 'DOOR', 10, 0) }],
    entities: [INSERT('A-DOOR', 'DOOR', 100, 200, 900, 900, 90), INSERT('A-DOOR', 'DOOR', 0, 0, 800, -800, 0), INSERT('X', 'NEST', 1000, 0, 2, 2, 0)],
  }));
  const flat = flattenDxf(doc);
  assert.equal(flat.arcs.length, 3);
  const [rot, mir, nest] = flat.arcs;
  assert.equal(rot.layer, 'A-DOOR');
  assert.ok(near(rot.c, [100, 200], 1e-6) && Math.abs(rot.r - 900) < 1e-6);
  // Rotated 90°: the arc runs from (100, 1100) to (−800, 200).
  assert.ok(near(rot.p0, [100, 1100], 1e-6) && near(rot.p1, [-800, 200], 1e-6), JSON.stringify(rot));
  // Mirrored in y: still counter-clockwise, from (800·cos(−90°)…) = (0, −800) to (800, 0).
  assert.ok(near(mir.p0, [0, -800], 1e-6) && near(mir.p1, [800, 0], 1e-6), JSON.stringify(mir));
  // Nested: block in a block, scaled 2 and moved.
  assert.ok(near(nest.c, [1020, 0], 1e-6) && Math.abs(nest.r - 2) < 1e-6, JSON.stringify(nest));
  assert.ok(flat.lines.some((l) => l.layer === 'KEEP'), 'entities on their own layer keep it');
  assert.equal(flat.inserts.length, 4, 'three inserts and the door inside the nested one');
  // Layer filter: only A-DOOR.
  assert.equal(flattenDxf(doc, { layers: new Set(['A-DOOR']) }).arcs.length, 2);
});

test('DXF: files that are not DXF are refused with a code', () => {
  assert.throws(() => readDxf('hello\nworld\n'), (e) => e.code === 'dxf-bad');
  // Binary DXF is read (plan-import-more.test.js); a cut-off one is refused like a damaged file.
  assert.throws(() => readDxf('AutoCAD Binary DXF\r\n'), (e) => e.code === 'dxf-bad');
});

// ───────────────────────── wall pairs

test('walls: two parallel lines a wall thickness apart give a centre line and the thickness', () => {
  const lines = [
    { a: [0, 0], b: [5, 0] }, { a: [0, 0.2], b: [5, 0.2] }, // a 5 m wall, 200 mm
    { a: [0, 3], b: [2, 3] }, { a: [0.5, 3.1], b: [2, 3.1] }, // overlapping only over 1.5 m, 100 mm
    { a: [8, 0], b: [8, 4] }, // a lone line: no wall
    { a: [10, 0], b: [12, 0] }, { a: [10, 0.9], b: [12, 0.9] }, // 900 mm apart: too far for a wall
  ];
  const r = recognizePlan({ lines }, { mode: 'pairs' });
  assert.equal(r.walls.length, 2, JSON.stringify(r.walls));
  const w = r.walls.find((x) => Math.abs(x.thickness - 0.2) < 1e-9);
  assert.ok(sameWall(w, { a: [0, 0.1], b: [5, 0.1] }, 1e-6), JSON.stringify(w));
  const v = r.walls.find((x) => Math.abs(x.thickness - 0.1) < 1e-9);
  assert.ok(sameWall(v, { a: [0.5, 3.05], b: [2, 3.05] }, 1e-6), JSON.stringify(v));
});

test('walls: corners and T-junctions join at the centre lines and close a room', () => {
  // A 4 × 3 m room (outer faces 0…4.2, 0…3.2, walls 200 mm) with a partition at x = 2.1 (100 mm).
  const lines = [
    { a: [0, 0], b: [4.2, 0] }, { a: [4.2, 0], b: [4.2, 3.2] }, { a: [4.2, 3.2], b: [0, 3.2] }, { a: [0, 3.2], b: [0, 0] },
    { a: [0.2, 0.2], b: [2.05, 0.2] }, { a: [2.15, 0.2], b: [4, 0.2] }, { a: [4, 0.2], b: [4, 3] }, { a: [4, 3], b: [2.15, 3] }, { a: [2.05, 3], b: [0.2, 3] }, { a: [0.2, 3], b: [0.2, 0.2] },
    { a: [2.05, 0.2], b: [2.05, 3] }, { a: [2.15, 0.2], b: [2.15, 3] },
  ];
  const r = recognizePlan({ lines });
  assert.equal(r.walls.length, 5, JSON.stringify(r.walls));
  const corners = [[0.1, 0.1], [4.1, 0.1], [4.1, 3.1], [0.1, 3.1]];
  for (const c of corners) assert.ok(r.walls.filter((w) => near(w.a, c, 1e-6) || near(w.b, c, 1e-6)).length === 2, `corner ${c}`);
  const partition = r.walls.find((w) => Math.abs(w.thickness - 0.1) < 1e-6);
  assert.ok(sameWall(partition, { a: [2.1, 0.1], b: [2.1, 3.1] }, 1e-6), JSON.stringify(partition));
  const p = createProject();
  const applied = applyPlan(p, r, { keepLeftovers: false });
  assert.equal(applied.rooms, 2);
});

test('walls: single-line plans become centre-line walls of the default thickness', () => {
  const lines = [{ a: [0, 0], b: [4, 0] }, { a: [4, 0], b: [4, 3] }, { a: [4, 3], b: [0, 3] }, { a: [0, 3], b: [0, 0] }];
  const r = recognizePlan({ lines }, { defaultThickness: 0.18 });
  assert.equal(r.mode, 'single');
  assert.equal(r.walls.length, 4);
  assert.ok(r.walls.every((w) => w.thickness === 0.18));
});

test('openings: item, height and sill follow the width like the templates', () => {
  assert.equal(openingDefaults('door', 0.9).item, 'door-single');
  assert.equal(openingDefaults('double', 1.6).item, 'door-double');
  assert.equal(openingDefaults('passage', 1.2).item, 'door-cased-opening');
  assert.deepEqual(openingDefaults('window', 3.0), { item: 'window-sliding', height: 2.1, sill: 0.1 });
  assert.deepEqual(openingDefaults('window', 1.8), { item: 'window-casement', height: 1.4, sill: 0.9 });
  assert.equal(floorForName('욕실'), 'tile-grey');
  assert.equal(floorForName('Kitchen'), 'floor-tile-large');
});

// ───────────────────────── the sample plans

for (const id of SAMPLES) {
  test(`sample ${id}.dxf: every wall, door and window is found where it is drawn`, () => {
    const expected = JSON.parse(fs.readFileSync(path.join(plans, `${id}.expected.json`), 'utf8'));
    const doc = readDxf(fs.readFileSync(path.join(plans, `${id}.dxf`)));
    const layers = new Set(layerStats(doc).filter((l) => !SKIP_LAYER.test(l.name)).map((l) => l.name));
    assert.ok(!layers.has('A-DIMS') && !layers.has('A-FURN') && layers.has('A-WALL'));
    const flat = flattenDxf(doc, { layers });
    const units = dxfUnits(doc, extentOf(flat).size);
    assert.equal(units.units, 'mm');
    const plan = dxfToPlan(flat, units.metres);
    const r = recognizePlan(plan);
    assert.equal(r.walls.length, expected.walls.length, 'wall count');
    for (const w of expected.walls) {
      const hit = r.walls.find((x) => sameWall(x, w, 0.02));
      assert.ok(hit, `wall ${JSON.stringify(w)}`);
      assert.ok(Math.abs(hit.thickness - w.thickness) < 0.005, `thickness ${hit.thickness} ≠ ${w.thickness}`);
    }
    assert.equal(r.openings.length, expected.openings.length, 'opening count');
    for (const e of expected.openings) {
      const hit = r.openings.find((op) => {
        const w = r.walls[op.wall];
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        return near([w.a[0] + ((w.b[0] - w.a[0]) * op.offset) / L, w.a[1] + ((w.b[1] - w.a[1]) * op.offset) / L], e.center, 0.03);
      });
      assert.ok(hit, `opening ${JSON.stringify(e)}`);
      assert.equal(hit.kind, e.kind);
      assert.ok(Math.abs(hit.width - e.width) < 0.02, `width ${hit.width} ≠ ${e.width}`);
      if (e.kind === 'door') { assert.equal(hit.side, e.side, 'door swing side'); assert.equal(hit.hinge, e.hinge, 'hinge'); }
      else assert.equal(hit.item, e.item);
    }
    // Into a project: rooms closed by the walls and named from the texts.
    const p = createProject();
    const applied = applyPlan(p, { ...r, texts: plan.texts });
    assert.equal(applied.rooms, expected.rooms, 'rooms');
    assert.ok(p.rooms.every((room) => room.name), 'every room has a name');
    assert.equal(p.openings.filter((o) => o.item === 'door-entrance').length, expected.openings.filter((o) => o.item === 'door-entrance').length, 'entrance door');
    assert.equal(normalizeProject(JSON.parse(JSON.stringify(p))).openings.length, p.openings.length, 'openings survive a save/load');
  });
}

test('sample plans: the leftovers become guides when the other layers are used too', () => {
  const doc = readDxf(fs.readFileSync(path.join(plans, 'apartment-59.dxf')));
  const plan = dxfToPlan(flattenDxf(doc), 0.001);
  const r = recognizePlan(plan);
  assert.equal(r.walls.length, 8);
  assert.ok(r.leftovers.length >= 10, `furniture and dimension lines kept (${r.leftovers.length})`);
  const p = createProject();
  const applied = applyPlan(p, r, { keepLeftovers: true });
  assert.equal(applied.guides, r.leftovers.length);
  assert.ok(p.guides.every((g) => g.source === 'plan' && g.a.length === 3));
  // Replacing the level takes the plan guides away again.
  applyPlan(p, r, { keepLeftovers: false });
  assert.equal(p.guides.length, 0);
  assert.equal(p.walls.length, 8);
});

test('sample plans: a second plan goes on a new level above, lined up with the first', () => {
  const read = (id) => { const doc = readDxf(fs.readFileSync(path.join(plans, `${id}.dxf`))); const plan = dxfToPlan(flattenDxf(doc, { layers: new Set(['A-WALL', 'A-DOOR', 'A-WIND', 'A-TEXT']) }), 0.001); return { ...recognizePlan(plan), texts: plan.texts }; };
  const p = createProject();
  applyPlan(p, read('house-2room'));
  const second = applyPlan(p, read('house-2room'), { target: 'level', wallHeight: 2.7 });
  assert.equal(p.levels.length, 2);
  assert.equal(p.levels[1].height, 2.7);
  assert.equal(p.activeLevel, second.level);
  const a = p.walls.filter((w) => w.level === p.levels[0].id).map((w) => JSON.stringify(w.a)).sort();
  const b = p.walls.filter((w) => w.level === p.levels[1].id).map((w) => JSON.stringify(w.a)).sort();
  assert.deepEqual(a, b);
});

test('SVG: lines, arcs and texts with the size of a user unit from width + viewBox', () => {
  const svg = readSvgPlan(fs.readFileSync(path.join(plans, 'house-2room.svg'), 'utf8'));
  const units = svgUnits(svg);
  assert.equal(units.guessed, false);
  assert.ok(Math.abs(units.metres - 0.001) < 1e-9);
  const plan = svgToPlan(svg, units.metres);
  const r = recognizePlan(plan);
  const expected = JSON.parse(fs.readFileSync(path.join(plans, 'house-2room.expected.json'), 'utf8'));
  assert.equal(r.walls.length, expected.walls.length);
  assert.equal(r.stats.doors, expected.openings.filter((o) => o.kind === 'door').length);
  assert.equal(r.stats.windows, expected.openings.filter((o) => o.kind === 'window').length);
  assert.ok(svg.texts.some((t) => t.text === '거실'));
  const p = createProject();
  assert.equal(applyPlan(p, { ...r, texts: plan.texts }).rooms, expected.rooms);
  // Transforms and path commands.
  const small = readSvgPlan('<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10 20) scale(2)"><path d="M0 0 H5 v5 Z"/><path d="M0 10 A 3 3 0 0 1 3 13"/></g></svg>');
  assert.equal(small.lines.length, 3);
  assert.ok(near(small.lines[0].b, [20, 20], 1e-9));
  assert.equal(small.arcs.length, 1);
  assert.ok(near(small.arcs[0].c, [10, 46], 1e-6) && Math.abs(small.arcs[0].r - 6) < 1e-6, JSON.stringify(small.arcs[0]));
  assert.throws(() => readSvgPlan('<html></html>'), (e) => e.code === 'svg-bad');
});

// ───────────────────────── pictures

test('underlay: picture pixels and plan points map both ways (scale, rotation, position)', () => {
  const u = { width: 800, height: 600, position: [2, -1], rotation: 0.3, scale: 0.0125 };
  for (const px of [[0, 0], [800, 600], [123, 456]]) assert.ok(near(planToUnderlay(u, underlayToPlan(u, px)), px, 1e-9));
  assert.ok(near(underlayToPlan(u, [400, 300]), [2, -1], 1e-12), 'the centre is the position');
});

for (const id of ['apartment-84', 'house-2room']) {
  test(`picture ${id}.png: the walls are found (Sobel/Hough edges and ink outlines)`, async () => {
    const expected = JSON.parse(fs.readFileSync(path.join(plans, `${id}.expected.json`), 'utf8'));
    const { data, info } = await sharp(path.join(plans, `${id}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const image = { data, width: info.width, height: info.height };
    const r = detectImageWalls(image, { metresPerPixel: 1 / expected.image.pxPerMetre });
    const [x0, z0] = expected.image.topLeft;
    const walls = r.walls.map((w) => ({ ...w, a: [w.a[0] + x0, w.a[1] + z0], b: [w.b[0] + x0, w.b[1] + z0] }));
    const found = expected.walls.filter((w) => walls.some((x) => sameWall(x, w, 0.08)));
    assert.ok(found.length >= expected.walls.length - 1, `walls found ${found.length}/${expected.walls.length}`);
    assert.ok(walls.length <= expected.walls.length + 3, `few extra walls (${walls.length})`);
    for (const w of found) {
      const x = walls.find((y) => sameWall(y, w, 0.08));
      assert.ok(Math.abs(x.thickness - w.thickness) < 0.04, `thickness ${x.thickness} ≈ ${w.thickness}`);
    }
    assert.ok(r.stats.doors >= expected.openings.filter((o) => o.kind === 'door').length - 1, `doors ${r.stats.doors}`);
    // Door swings read from the drawn arcs: hinge end and opening side as in the CAD drawing.
    const doc = readDxf(fs.readFileSync(path.join(plans, `${id}.dxf`)));
    const cad = recognizePlan(dxfToPlan(flattenDxf(doc, { layers: new Set(['A-WALL', 'A-DOOR', 'A-WIND']) }), 0.001));
    const swings = (res, shift) => res.openings.filter((o) => o.kind === 'door').map((o) => {
      const w = res.walls[o.wall]; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
      const side = o.side === 'left' ? 1 : -1; const hs = o.hinge === 'left' ? -1 : 1;
      return { c: [w.a[0] + u[0] * o.offset + shift[0], w.a[1] + u[1] * o.offset + shift[1]], hinge: [Math.round(u[0] * side * hs), Math.round(u[1] * side * hs)], swing: [Math.round(-u[1] * side), Math.round(u[0] * side)] };
    });
    const want = swings(cad, [0, 0]);
    const got = swings(r, [x0, z0]);
    const same = want.filter((d) => got.some((g) => near(g.c, d.c, 0.1) && g.hinge.join() === d.hinge.join() && g.swing.join() === d.swing.join()));
    assert.ok(same.length >= want.length - 1, `door swings ${same.length}/${want.length}`);
    // The 3DArchitecture edge pipeline finds the straight edges of the walls too.
    const edges = imageEdgeSegments(image, { minSegment: 8 });
    assert.ok(edges.segments.length > expected.walls.length * 2, `edge segments ${edges.segments.length}`);
    const sobel = detectImageWalls(image, { metresPerPixel: 1 / expected.image.pxPerMetre, method: 'edges' });
    assert.ok(sobel.walls.length >= expected.walls.length / 2, `edge method walls ${sobel.walls.length}`);
  });
}

test('underlays: saved in the .msk with the picture bytes, and part of undo', () => {
  const p = createProject();
  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const history = new History(p);
  p.assets.as1 = { name: 'plan', ext: 'png', mime: 'image/png', kind: 'underlay', pixels: [800, 600] };
  p.underlays.push({ id: 'ul1', level: p.levels[0].id, asset: 'as1', name: 'plan', width: 800, height: 600, position: [0, 0], rotation: 0, scale: 0.015, opacity: 0.6, hidden: false });
  history.commit(p, 'add', null);
  const back = unpackProject(packProject(p, new Map([['as1', bytes]])));
  assert.equal(back.project.underlays.length, 1);
  assert.deepEqual([...back.assets.get('as1')], [...bytes]);
  history.undo(p);
  assert.equal(p.underlays.length, 0);
  assert.deepEqual(normalizeProject({ levels: [] }).underlays, []);
});
