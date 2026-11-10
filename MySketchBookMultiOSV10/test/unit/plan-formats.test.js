// Import › Floor plan from other programs: PDF drawings (pdf.js), IFC buildings (web-ifc), Sweet Home 3D homes,
// TIFF / TGA plan pictures, the furniture matching and the building → project step. Samples in samples/plans
// (scripts/make-building-samples.mjs, written byte by byte with known answers in <id>.expected.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { zipSync, strToU8 } from 'fflate';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as WebIFC from 'web-ifc';
import { openPdf, readPdfPage, pdfPages, pdfScale, pdfToPlan, scaleFromTexts, bezierArc, paperName, isPdf, POINT_METRES } from '../../src/io/plan-pdf.js';
import { readSh3d, parseXml, sh3dColor, sh3dWallArc } from '../../src/io/plan-sh3d.js';
import { readIfc, minAreaRect, joinWallEnds, bottomOutline, isIfc } from '../../src/io/plan-ifc.js';
import { applyBuilding, openingItem, fitItem, stairsItem, hostPiece } from '../../src/io/plan-building.js';
import { matchLibraryItem, nameWords } from '../../src/io/plan-match.js';
import { decodeRaster, tiffPages, decodeTga } from '../../src/io/plan-raster.js';
import { recognizePlan } from '../../src/io/plan-recognize.js';
import { scalePlanLevel, applyPlan } from '../../src/io/plan-build.js';
import { detectImageWalls } from '../../src/io/plan-image.js';
import { SKIP_LAYER } from '../../src/io/plan-dxf.js';
import { createProject, polygonArea } from '../../src/engine/document.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plans = path.join(root, 'samples', 'plans');
const sample = (file) => new Uint8Array(fs.readFileSync(path.join(plans, file)));
const expectedOf = (id) => JSON.parse(fs.readFileSync(path.join(plans, `${id}.expected.json`), 'utf8'));
const near = (p, q, tol) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
const sameWall = (x, w, tol) => (near(x.a, w.a, tol) && near(x.b, w.b, tol)) || (near(x.a, w.b, tol) && near(x.b, w.a, tol));
const centreOf = (walls, o) => { const w = walls.find((x) => x.id === o.wall); const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); return [w.a[0] + ((w.b[0] - w.a[0]) / L) * o.offset, w.a[1] + ((w.b[1] - w.a[1]) / L) * o.offset]; };

let ifcApi = null;
async function ifc() {
  if (!ifcApi) { ifcApi = new WebIFC.IfcAPI(); await ifcApi.Init(); }
  return ifcApi;
}

// ───────────────────────── PDF

test('PDF: a vector page is read like a DXF — layers, arcs from Bézier curves, Korean texts, the scale and the paper', async () => {
  const expected = expectedOf('apartment-59');
  const bytes = sample('apartment-59.pdf');
  assert.ok(isPdf(bytes));
  const doc = await openPdf(pdfjs, bytes);
  const pages = await pdfPages(doc);
  assert.equal(pages.length, expected.pdf.pages);
  assert.equal(pages[0].paper, 'A3');
  const page = await readPdfPage(pdfjs, doc, expected.pdf.planPage);
  assert.equal(page.raster, false);
  assert.deepEqual(page.layers.filter((l) => l.lines + l.arcs > 0).map((l) => l.name), expected.pdf.layers.filter((name) => name !== 'A-TEXT'));
  assert.equal(page.arcs.length, 4, 'the four door swings are arcs again');
  for (const name of ['거실', '침실1', '주방', '욕실']) assert.ok(page.texts.some((t) => t.text === name), `text ${name}`);
  const scale = pdfScale(page);
  assert.equal(scale.source, 'text');
  assert.equal(scale.denominator, expected.pdf.scale);
  assert.equal(scale.factor, 1);
  // The plan at that scale: the walls of the DXF drawing (moved by the page offset), doors, windows and room names.
  const layers = page.layers.filter((l) => !SKIP_LAYER.test(l.name)).map((l) => l.name);
  const plan = pdfToPlan(page, scale.metres, { layers });
  const r = recognizePlan(plan, {});
  const [dx, dz] = expected.pdf.offset;
  const want = expected.walls.map((w) => ({ ...w, a: [w.a[0] + dx, w.a[1] + dz], b: [w.b[0] + dx, w.b[1] + dz] }));
  const found = want.filter((w) => r.walls.some((x) => sameWall(x, w, 0.03)));
  assert.equal(found.length, want.length, `walls ${found.length}/${want.length}`);
  for (const w of want) assert.ok(Math.abs(r.walls.find((x) => sameWall(x, w, 0.03)).thickness - w.thickness) < 0.01);
  assert.equal(r.stats.doors, expected.openings.filter((o) => o.kind !== 'window').length);
  assert.equal(r.stats.windows, expected.openings.filter((o) => o.kind === 'window').length);
  const project = createProject();
  r.texts = plan.texts;
  const applied = applyPlan(project, r, { target: 'replace', keepLeftovers: false });
  assert.equal(applied.rooms, expected.rooms);
  assert.ok(project.rooms.some((room) => room.name === '거실'));
  doc.destroy();
});

test('PDF: a scanned page is a picture to trace over, with a picture filling the page', async () => {
  const doc = await openPdf(pdfjs, sample('apartment-59.pdf'));
  const page = await readPdfPage(pdfjs, doc, 2);
  assert.equal(page.raster, true);
  assert.equal(page.images, 1);
  assert.ok(page.imageCover > 0.5);
  assert.equal(pdfScale(page).source, 'default');
  doc.destroy();
  await assert.rejects(() => openPdf(pdfjs, new TextEncoder().encode('not a pdf')), (e) => e.code === 'pdf-invalid');
});

test('PDF scale: "1:100" texts, a stated paper bigger than the page, door swings, or 1:100', () => {
  assert.deepEqual(scaleFromTexts([{ text: 'S=1/50' }]).denominator, 50);
  assert.equal(scaleFromTexts([{ text: '축척 1 : 200' }]).denominator, 200);
  assert.equal(scaleFromTexts([{ text: '12:30' }, { text: 'ROOM 1:3' }]), null, 'times and odd ratios are no scale');
  const a3 = [1190.55, 841.89];
  assert.equal(paperName(...a3), 'A3');
  assert.equal(paperName(612, 792), 'Letter');
  // An A1 drawing at 1:100 printed on A3: everything is half size, so 1 pt is twice as long.
  const s = pdfScale({ size: a3, texts: [{ text: 'SCALE 1:100 @ A1' }], arcs: [] });
  assert.equal(s.paper, 'A1');
  assert.ok(Math.abs(s.factor - 841 / 420) < 0.01, `factor ${s.factor}`);
  assert.ok(Math.abs(s.metres - POINT_METRES * 100 * s.factor) < 1e-12);
  // No text: door arcs of 0.9 m drawn with an 18 pt radius → 1:142 → snaps to 1:150.
  const doors = pdfScale({ size: a3, texts: [], arcs: [1, 2, 3].map(() => ({ r: 0.9 / (POINT_METRES * 150), sweep: Math.PI / 2 })) });
  assert.equal(doors.source, 'doors');
  assert.equal(doors.denominator, 150);
  assert.equal(pdfScale({ size: a3, texts: [], arcs: [] }).denominator, 100);
});

test('PDF arcs: a Bézier on a circle is an arc (any direction); other curves are not', () => {
  const k = (4 / 3) * Math.tan(Math.PI / 8);
  const a = bezierArc([10, 0], [10, 10 * k], [10 * k, 10], [0, 10]);
  assert.ok(a && near(a.c, [0, 0], 1e-6) && Math.abs(a.r - 10) < 1e-6 && Math.abs(a.sweep - Math.PI / 2) < 1e-6 && a.ccw);
  const b = bezierArc([0, 10], [10 * k, 10], [10, 10 * k], [10, 0]);
  assert.ok(b && !b.ccw && Math.abs(b.sweep - Math.PI / 2) < 1e-6);
  assert.equal(bezierArc([0, 0], [5, 8], [10, -8], [15, 0]), null);
});

// ───────────────────────── Sweet Home 3D

test('SH3D: Home.xml → levels, walls (a curved one), doors and windows, rooms with colours, furniture and models', () => {
  const expected = expectedOf('duplex');
  const { building, models } = readSh3d(sample('duplex.sh3d'));
  assert.deepEqual(building.levels.map((l) => [l.name, l.elevation, l.height]), expected.levels.map((l) => [l.name, l.elevation, l.height]));
  const straight = building.walls.filter((w) => !w.arc);
  assert.equal(straight.length, expected.walls.length);
  for (const w of expected.walls) assert.ok(straight.some((x) => sameWall(x, w, 1e-6) && Math.abs(x.thickness - w.thickness) < 1e-9 && Math.abs(x.height - w.height) < 1e-9), `wall ${JSON.stringify(w)}`);
  const garden = building.walls.find((w) => w.arc);
  const g = expected.sh3d.gardenWall;
  const r = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) / (2 * Math.sin(g.extent / 2));
  assert.ok(Math.abs(garden.arc.r - r) < 1e-3 && Math.abs(garden.arc.a1 - garden.arc.a0 - g.extent) < 1e-3, JSON.stringify(garden.arc));
  assert.equal(building.openings.length, expected.openings.length);
  for (const o of expected.openings) assert.ok(building.openings.some((x) => near(x.center, o.center, 1e-6) && x.kind === o.kind && Math.abs(x.width - o.width) < 1e-9 && Math.abs(x.sill - o.sill) < 1e-9), `opening ${o.item} at ${o.center}`);
  assert.deepEqual(building.rooms.map((x) => x.name).sort(), expected.rooms.map((x) => x.name).sort());
  for (const room of expected.rooms) assert.equal(building.rooms.find((x) => x.name === room.name).floorColor, room.floorColor);
  // Furniture: the group's chairs come out, the staircase is the library stairs, the sculpture brings its OBJ.
  assert.equal(building.objects.length, expected.furniture.length + 1);
  const stairs = building.objects.find((x) => x.item === 'stairs');
  assert.ok(stairs && near(stairs.center, expected.stairs.center, 1e-6) && stairs.params.rise === expected.stairs.size[1]);
  const sculpture = building.objects.find((x) => x.name === 'Bronze sculpture');
  assert.ok(Math.abs(sculpture.rotation - 0.5) < 1e-6);
  const model = models.get(sculpture.model);
  assert.equal(model.name, 'sculpture.obj');
  assert.ok(model.related.has('sculpture.mtl'));
});

test('SH3D: the building goes in as one project — walls joined, openings in their walls, rooms, stairs, furniture', () => {
  const expected = expectedOf('duplex');
  const { building } = readSh3d(sample('duplex.sh3d'));
  const project = createProject();
  const items = PARAMETRIC_ITEMS;
  const counts = applyBuilding(project, building, {
    target: 'new', colorMaterial: (hex) => `mat-${hex}`,
    matchItem: (o) => { const m = matchLibraryItem(o, items); return m ? { item: m.item.id, ...fitItem(m.item, o.size) } : null; },
  });
  assert.equal(project.levels.length, 2);
  assert.equal(counts.openings, expected.openings.length);
  assert.equal(counts.doors, expected.openings.filter((o) => o.kind === 'door').length);
  assert.equal(counts.windows, expected.openings.filter((o) => o.kind === 'window').length);
  assert.equal(counts.rooms, expected.rooms.length);
  assert.ok(project.walls.filter((w) => w.curve).length >= 4, 'the curved wall is a chain of pieces');
  // Openings sit where they were, in a wall of their level (the import shift undone).
  const [sx, sz] = project.planShift;
  for (const o of expected.openings) {
    const level = project.levels[o.level];
    const onLevel = project.openings.filter((x) => project.walls.find((w) => w.id === x.wall).level === level.id);
    assert.ok(onLevel.some((x) => near(centreOf(project.walls, x), [o.center[0] + sx, o.center[1] + sz], 0.01)), `opening at ${o.center} on ${level.name}`);
  }
  assert.ok(project.rooms.some((x) => x.name === '거실' && x.floor === 'mat-#c8a27a'));
  // Furniture: the library items expected (the sculpture has none: it needs its own model).
  for (const f of expected.furniture.filter((x) => x.expect)) {
    const o = project.objects.find((x) => near([x.position[0] - sx, x.position[2] - sz], f.center, 1e-6));
    assert.ok(o, `${f.name} placed`);
    assert.equal(o.item, f.expect, `${f.name} → ${o.item}`);
  }
  assert.equal(counts.skipped, 1, 'only the sculpture is left for its own model');
  const stairs = project.objects.find((x) => x.item === 'stairs');
  assert.equal(stairs.params.rise, 2.7);
});

test('SH3D: older files without Home.xml are refused with a code; the XML reader copes with DOCTYPE and entities', () => {
  assert.throws(() => readSh3d(zipSync({ Home: new Uint8Array([0xac, 0xed, 0, 5]) })), (e) => e.code === 'sh3d-old');
  assert.throws(() => readSh3d(new Uint8Array([1, 2, 3])), (e) => e.code === 'sh3d-invalid');
  const x = parseXml("<?xml version='1.0'?>\n<!DOCTYPE home [<!ELEMENT home (room*)> <!ATTLIST home name CDATA #IMPLIED>]>\n<!-- c -->\n<home name='a &amp; b'><room name=\"R&#233;\"><point x='1' y='2'/></room></home>");
  assert.equal(x.attrs.name, 'a & b');
  assert.equal(x.children[0].attrs.name, 'Ré');
  assert.equal(x.children[0].children[0].attrs.y, '2');
  assert.equal(sh3dColor('FF8090A0'), '#8090a0');
  assert.equal(sh3dColor('-16777216'), '#000000');
  // A half circle the other way round: the centre is on the chord's middle.
  const arc = sh3dWallArc([0, 0], [4, 0], -Math.PI);
  assert.ok(near(arc.c, [2, 0], 1e-6) && Math.abs(arc.r - 2) < 1e-6);
  // A minimal home without levels: one level of the home's wall height.
  const home = zipSync({ 'Home.xml': strToU8("<home wallHeight='260'><wall xStart='0' yStart='0' xEnd='400' yEnd='0' thickness='20'/></home>") });
  const { building } = readSh3d(home);
  assert.equal(building.levels.length, 1);
  assert.equal(building.levels[0].height, 2.6);
  assert.equal(building.walls[0].thickness, 0.2);
});

// ───────────────────────── IFC

test('IFC: storeys, walls, openings in their host walls, spaces, stairs and furniture (web-ifc)', async () => {
  const expected = expectedOf('duplex');
  const bytes = sample('duplex.ifc');
  assert.ok(isIfc(bytes));
  const { building, meshes, schema, unit, counts } = readIfc(WebIFC, await ifc(), bytes);
  assert.equal(schema, 'IFC4');
  assert.equal(unit, 0.001);
  assert.deepEqual(building.levels.map((l) => [l.name, l.elevation, l.height]), expected.levels.map((l) => [l.name, l.elevation, l.height]));
  assert.equal(counts.walls, expected.walls.length);
  for (const w of expected.walls) assert.ok(building.walls.some((x) => sameWall(x, w, 0.005) && Math.abs(x.thickness - w.thickness) < 0.005), `wall ${JSON.stringify(w)}`);
  assert.equal(building.openings.length, expected.openings.length);
  for (const o of expected.openings) {
    const x = building.openings.find((y) => y.level === building.levels[o.level].key && near(y.center, o.center, 0.01));
    assert.ok(x, `opening at ${o.center}`);
    assert.equal(x.kind, o.kind);
    assert.ok(Math.abs(x.width - o.width) < 0.005 && Math.abs(x.height - o.height) < 0.005 && Math.abs(x.sill - o.sill) < 0.005, JSON.stringify(x));
    assert.ok(x.wall, 'host wall from IfcRelVoidsElement / IfcRelFillsElement');
  }
  assert.equal(building.rooms.length, expected.rooms.length);
  for (const room of expected.rooms) {
    const x = building.rooms.find((y) => y.name === room.name);
    assert.ok(x, room.name);
    assert.ok(Math.abs(polygonArea(x.points) - room.area) < 0.01, `${room.name} ${polygonArea(x.points)} ≈ ${room.area}`);
  }
  const stairs = building.objects.find((x) => x.item === 'stairs');
  assert.ok(stairs && near(stairs.center, expected.stairs.center, 0.01) && Math.abs(stairs.params.rise - 2.7) < 0.01);
  for (const f of expected.furniture) {
    const x = building.objects.find((y) => y.name === f.name && near(y.center, f.center, 0.01));
    assert.ok(x, f.name);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(x.size[i] - f.size[i]) < 0.01, `${f.name} size ${x.size}`);
    const turn = Math.abs(((x.rotation - f.rotation + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    assert.ok(turn < 0.01, `${f.name} rotation ${x.rotation} ≈ ${f.rotation}`);
    assert.ok(meshes.get(x.model)?.length, `${f.name} has its shape for an own model`);
  }
  // Into a project: the same counts as the Sweet Home 3D copy of the house.
  const project = createProject();
  const applied = applyBuilding(project, building, { matchItem: (o) => { const m = matchLibraryItem(o, PARAMETRIC_ITEMS); return m ? { item: m.item.id } : null; } });
  assert.equal(applied.walls, expected.walls.length);
  assert.equal(applied.openings, expected.openings.length);
  assert.equal(applied.rooms, expected.rooms.length);
  assert.ok(project.walls.every((w) => w.height == null), 'walls as tall as their level');
});

test('IFC helpers: the smallest rectangle round a wall, wall ends joined at the centre lines, the outline of a space', () => {
  const r = minAreaRect([[0, 0], [4, 1], [3.9, 1.4], [-0.1, 0.4]]);
  assert.ok(Math.abs(r.length - Math.hypot(4, 1)) < 0.02 && Math.abs(r.width - 0.41) < 0.03, JSON.stringify(r));
  // An L corner drawn with both walls running to the outer face: the ends move onto the centre lines.
  const walls = joinWallEnds([{ level: 'L', a: [-0.1, 0], b: [5.1, 0], thickness: 0.2 }, { level: 'L', a: [0, -0.1], b: [0, 4], thickness: 0.2 }]);
  assert.ok(near(walls[0].a, [0, 0], 1e-9) && near(walls[1].a, [0, 0], 1e-9), JSON.stringify(walls));
  assert.ok(near(walls[0].b, [5.1, 0], 1e-9), 'a free end stays');
  // A box 2 × 1 seen from below.
  const P = new Float32Array([0, 0, 0, 2, 0, 0, 2, 0, 1, 0, 0, 1, 0, 3, 0, 2, 3, 0, 2, 3, 1, 0, 3, 1]);
  const outline = bottomOutline([{ positions: P, indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]) }]);
  assert.equal(outline.length, 4);
  assert.ok(Math.abs(polygonArea(outline) - 2) < 1e-6);
});

test('IFC: real-world files (buildingSMART / ArchiCAD samples) when MYSKETCHBOOK_IFC_SAMPLE points at one', { skip: !process.env.MYSKETCHBOOK_IFC_SAMPLE }, async () => {
  const { building, counts } = readIfc(WebIFC, await ifc(), new Uint8Array(fs.readFileSync(process.env.MYSKETCHBOOK_IFC_SAMPLE)));
  assert.ok(building.levels.length >= 1 && counts.walls > 0, JSON.stringify(counts));
  const project = createProject();
  const applied = applyBuilding(project, building, {});
  assert.ok(applied.walls > 0 && applied.openings > 0, JSON.stringify(applied));
});

// ───────────────────────── matching, openings, stairs, calibration

test('furniture: names in several languages and catalogue ids find the library item of their size', () => {
  const pick = (name, size, hints = '') => matchLibraryItem({ name, hints, size }, PARAMETRIC_ITEMS)?.item.id ?? null;
  assert.equal(pick('Lit double', [1.6, 0.5, 2]), 'bed');
  assert.equal(pick('Canapé', [2.1, 0.8, 0.9]), 'sofa-modern');
  assert.equal(pick('Chair', [0.45, 0.9, 0.5], 'eTeks#chair'), 'dining-chair');
  assert.equal(pick('WC', [0.4, 0.75, 0.65]), 'toilet');
  assert.equal(pick('Coffee table', [1, 0.4, 0.6]), 'coffee-table');
  assert.equal(pick('M_Bed-Standard:1525x2007mm', [1.5, 0.6, 2]), 'bed');
  assert.equal(pick('Strange sculpture', [0.5, 1.2, 0.5]), null);
  assert.deepEqual(nameWords('eTeks#bed140x190'), ['bed']);
  // Doors and windows are never furniture.
  assert.ok(!['doors', 'windows'].includes(matchLibraryItem({ name: 'Door', size: [0.9, 2.1, 0.1] }, PARAMETRIC_ITEMS)?.item.category));
});

test('openings: the library door or window from kind, width, height and name', () => {
  assert.equal(openingItem('door', 0.9, 'Door'), 'door-single');
  assert.equal(openingItem('door', 1.6, 'Door DOUBLE DOOR SINGLE SWING'), 'door-double');
  assert.equal(openingItem('door', 1.8, 'door SLIDING TO LEFT'), 'door-sliding');
  assert.equal(openingItem('door', 2.6, 'Garage door'), 'door-garage');
  assert.equal(openingItem('door', 1.0, 'Front door'), 'door-entrance');
  assert.equal(openingItem('window', 1.2, 'Window', 1.2), 'window-casement');
  assert.equal(openingItem('window', 1.8, 'Sliding window', 1.4), 'window-sliding');
  assert.equal(openingItem('window', 1.4, 'French window', 2.1), 'door-french');
  assert.equal(openingItem('window', 0.6, 'Round window', 0.6), 'window-round');
  // An opening is put in the piece of wall it lies in, on the side its front faces.
  const pieces = [{ key: 'a', a: [0, 0], b: [4, 0], thickness: 0.2 }, { key: 'b', a: [4, 0], b: [4, 3], thickness: 0.2 }];
  const host = hostPiece(pieces, { center: [4.05, 1.5], width: 0.9, facing: [-1, 0] });
  assert.equal(host.index, 1);
  assert.ok(Math.abs(host.offset - 1.5) < 1e-9);
  assert.equal(host.side, 'left');
});

test('stairs and sizes: a flight → the library stairs; items fitted by parameters, else by scale', () => {
  const s = stairsItem([1.0, 2.7, 3.4]);
  assert.deepEqual(s.params, { width: 1, rise: 2.7, run: 0.243 });
  const sofa = PARAMETRIC_ITEMS.find((i) => i.id === 'sofa-modern');
  const fit = fitItem(sofa, [2.0, 0.8, 0.92]);
  assert.equal(fit.params.width, 2);
  assert.equal(fit.scale[0], 1);
  const toilet = PARAMETRIC_ITEMS.find((i) => i.id === 'toilet');
  const t2 = fitItem(toilet, [toilet.size[0] * 1.1, toilet.size[1], toilet.size[2]]);
  assert.ok(Math.abs(t2.scale[0] - 1.1) < 0.002 && t2.scale[1] === 1);
});

test('calibration of an imported drawing: the level is scaled about the first point (walls, openings, rooms, guides)', () => {
  const p = createProject();
  const level = p.activeLevel;
  p.walls.push({ id: 'w1', level, a: [1, 1], b: [3, 1], thickness: 0.1, height: null, material: {} });
  p.openings.push({ id: 'o1', wall: 'w1', item: 'door-single', offset: 1, width: 0.45, height: 2.1, sill: 0 });
  p.rooms.push({ id: 'r1', level, name: '', points: [[1, 1], [3, 1], [3, 2], [1, 2]] });
  p.guides.push({ id: 'g1', level, source: 'plan', a: [1, 0, 1], b: [2, 0, 1] });
  scalePlanLevel(p, level, [1, 1], 2);
  assert.deepEqual(p.walls[0].b, [5, 1]);
  assert.equal(p.walls[0].thickness, 0.2);
  assert.deepEqual([p.openings[0].offset, p.openings[0].width, p.openings[0].height], [2, 0.9, 2.1]);
  assert.deepEqual(p.rooms[0].points[2], [5, 3]);
  assert.deepEqual(p.guides[0].b, [3, 0, 1]);
});

// ───────────────────────── pictures

test('pictures: TGA (run-length) and TIFF (two pages, PackBits; black and white, LZW) decode to the plan picture', async () => {
  const ref = await sharp(path.join(plans, 'house-2room.png')).greyscale().raw().toBuffer({ resolveWithObject: true });
  const same = (img) => { let diff = 0; for (let i = 0; i < ref.data.length; i++) if (Math.abs(img.data[i * 4] - ref.data[i]) > 1) diff++; return diff; };
  const tga = decodeTga(sample('house-2room.tga'));
  assert.deepEqual([tga.width, tga.height], [ref.info.width, ref.info.height]);
  assert.equal(same(tga), 0);
  const pages = tiffPages(sample('house-2room-2p.tif'));
  assert.deepEqual(pages.map((p) => [p.width, p.height]), [[400, 300], [ref.info.width, ref.info.height]]);
  const page2 = decodeRaster('house-2room-2p.tif', sample('house-2room-2p.tif'), { page: 1 });
  assert.equal(page2.pages, 2);
  assert.equal(same(page2), 0);
  // The decoded picture is a plan the wall detection reads like the PNG.
  const expected = expectedOf('house-2room');
  const r = detectImageWalls({ data: tga.data, width: tga.width, height: tga.height }, { metresPerPixel: 1 / expected.image.pxPerMetre });
  assert.ok(r.walls.length >= expected.walls.length - 1, `walls ${r.walls.length}`);
  const bw = decodeRaster('apartment-59-bw.tif', sample('apartment-59-bw.tif'));
  assert.ok(bw.width > 500 && [...bw.data.subarray(0, 4000)].every((v, i) => i % 4 === 3 || v === 0 || v === 255), 'black and white only');
  assert.throws(() => decodeTga(new Uint8Array(10)), (e) => e.code === 'raster-invalid');
});
