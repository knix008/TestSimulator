// BIM / Arch objects (FreeCAD BIM workbench): 3D model and floor plan from the
// same object, walls with hosted windows and doors, roofs, stairs, spaces, IFC.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARCH_COLORS, ARCH_FROM_LINES, ARCH_FROM_OUTLINES, ARCH_INSERT_KINDS, ARCH_KINDS, ARCH_SOLIDS, archFrom, archGroups, archPlan, archQuantities,
  axisLines, defaultOpening, EQUIPMENT_SIZES, EQUIPMENT_TYPES, labelPoint, OPENING_TYPES, PLAN_CUT, roofGeometry, wallLayout, wallParts,
} from '../../src/domain/arch.js';
import { createEntity, normalizeEntity, primitives } from '../../src/domain/entities.js';
import { addEntity, createDrawing, dashScaleOf } from '../../src/domain/drawing.js';
import { exportMesh, importMesh } from '../../src/domain/exchange3d.js';
import { decodeIfcString, ifcGuid, ifcString } from '../../src/domain/ifc.js';
import { meshVolume, normalizeSolidParams, SOLID_ICONS, solidMesh, solidMeshGroups, solidProperties } from '../../src/domain/solids.js';
import { DICTIONARIES } from '../../src/i18n.js';
import { hasIcon } from '../../src/icons.js';

import { straightSkeleton } from '../../src/domain/skeleton.js';
import { createBim, normalizeBim, presetMaterials, profileFromLoops, rebarBars, trussMembers, tubeAlong } from '../../src/domain/arch.js';
import { isVisible, isVisible3d, normalizeDrawing } from '../../src/domain/drawing.js';
import { axisUnitFor } from '../../src/domain/units.js';
const near = (a, b, tolerance, label = '') => assert.ok(Math.abs(a - b) <= tolerance, `${label} ${a} ≠ ${b}`);
const bim = (kind, params = {}, shape = {}, place = {}) => createEntity('solid', { kind, params, shape, ...place });
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const wall = (path, openings = [], params = {}, extra = {}) => bim('wall', { width: 200, height: 2700, ...params }, { path, openings, ...extra });
const vol = (tris) => meshVolume(tris);

/** Every edge of a closed mesh is shared by two triangles in opposite directions. */
function assertClosed(tris, label) {
  const key = (p) => p.map((v) => Math.round(v * 1000)).join(',');
  const edges = new Map();
  for (const tri of tris) for (let i = 0; i < 3; i++) {
    const k = `${key(tri[i])}>${key(tri[(i + 1) % 3])}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
  for (const [k] of edges) {
    const [a, b] = k.split('>');
    assert.ok(edges.has(`${b}>${a}`), `${label}: open edge`);
  }
}

test('BIM kinds: parameters, icons and both languages for every kind and option', () => {
  for (const kind of ARCH_KINDS) {
    assert.ok(ARCH_SOLIDS[kind], kind);
    assert.ok(hasIcon(SOLID_ICONS[kind]), `${kind} icon`);
    assert.ok(ARCH_COLORS[kind], `${kind} 3D colour`);
    for (const dict of Object.values(DICTIONARIES)) {
      for (const key of [`solid.${kind}`, `solidTip.${kind}`]) assert.ok(dict[key], key);
      for (const param of ARCH_SOLIDS[kind].params) {
        assert.ok(dict[`solidParam.${param.key}`] || dict[`solidParam.${kind}.${param.key}`], `${kind}.${param.key}`);
        for (const option of param.options ?? []) assert.ok(dict[`archOpt.${option}`], `archOpt.${option}`);
      }
    }
  }
  for (const kind of [...ARCH_FROM_LINES, ...ARCH_FROM_OUTLINES]) for (const dict of Object.values(DICTIONARIES)) assert.ok(dict[`featureTip.${kind}`], `featureTip.${kind}`);
  for (const type of OPENING_TYPES) for (const dict of Object.values(DICTIONARIES)) assert.ok(dict[`archOpt.${type}`]);
  for (const type of EQUIPMENT_TYPES) assert.equal(EQUIPMENT_SIZES[type].length, 3);
  // Choices are whole numbers in range.
  assert.equal(normalizeSolidParams('roof', { roofType: 7.6 }).roofType, 3);
  assert.equal(normalizeSolidParams('wall', { align: 1.2 }).align, 1);
  assert.deepEqual(ARCH_INSERT_KINDS.filter((kind) => !ARCH_KINDS.includes(kind)), []);
});

test('every BIM object has a 3D body and a plan; bodies are closed and finite', () => {
  const objects = [
    wall([{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }], [defaultOpening('window', 1000), defaultOpening('door', 6000)]),
    bim('curtainwall', {}, { path: [{ x: 0, y: 0 }, { x: 6000, y: 0 }] }),
    ...[0, 1, 2].map((profile) => bim('column', { profile })),
    bim('beam', {}, { path: [{ x: 0, y: 0 }, { x: 6000, y: 0 }] }),
    bim('slab', {}, { outer: rect(0, 0, 5000, 4000), holes: [rect(1000, 1000, 2000, 2000)] }),
    bim('stairs'),
    ...[0, 1, 2, 3].map((roofType) => bim('roof', { roofType }, { outer: rect(0, 0, 12000, 9000) })),
    bim('space', {}, { outer: rect(0, 0, 5000, 4000) }),
    bim('railing', {}, { path: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }] }),
    ...EQUIPMENT_TYPES.map((type, i) => bim('equipment', { equipment: i })),
    bim('axis'),
  ];
  for (const e of objects) {
    const label = `${e.kind} ${e.params.profile ?? e.params.roofType ?? e.params.equipment ?? ''}`;
    const tris = solidMesh(e);
    assert.ok(tris.every((tri) => tri.flat().every(Number.isFinite)), `${label}: finite`);
    if (!['space', 'axis'].includes(e.kind)) {
      assert.ok(tris.length > 0 && vol(tris) > 0, `${label}: has a body`);
      for (const [name, group] of Object.entries(archGroups(e))) if (group.length && !['wall', 'equipment', 'curtainwall', 'railing'].includes(e.kind)) assertClosed(group, `${label} ${name}`);
    } else assert.equal(tris.length, 0, `${label}: nothing to export`);
    assert.ok(primitives(e).length > 0, `${label}: plan`);
  }
  // A space shows in 3D as a light volume only.
  assert.deepEqual(solidMeshGroups(objects.find((e) => e.kind === 'space')).map((g) => g.material), ['space']);
});

test('wall: body less its openings, frames and glass in them, quantities', () => {
  const w = wall([{ x: 0, y: 0 }, { x: 6000, y: 0 }], [{ type: 'window', at: 1000, width: 1200, height: 1300, sill: 900 }, { type: 'door', at: 4000, width: 900, height: 2100, sill: 0 }]);
  const { main, openings } = wallParts(w);
  const expected = 6000 * 200 * 2700 - 1200 * 1300 * 200 - 900 * 2100 * 200;
  near(vol(main), expected, 1, 'wall body');
  assert.equal(openings.length, 2);
  assert.ok(openings[0].glass.length && openings[0].wood.length, 'window: frame and glass');
  assert.ok(openings[1].wood.length && !openings[1].glass.length, 'door: frame and leaf');
  near(vol(openings[0].void), 1200 * 1300 * 240, 1, 'void reaches past both faces');
  const q = archQuantities(w);
  assert.equal(q.length, 6000);
  assert.equal(q.wallArea, 6000 * 2700 - 1200 * 1300 - 900 * 2100);
  assert.deepEqual([q.windows, q.doors], [1, 1]);
  // Alignment moves the wall to one side of its path.
  const left = wallParts(wall([{ x: 0, y: 0 }, { x: 1000, y: 0 }], [], { align: 1 })).main.flat();
  assert.deepEqual([Math.min(...left.map((p) => p[1])), Math.max(...left.map((p) => p[1]))], [0, 200]);
});

test('wall: closed walls are rings with mitred corners; openings may sit on any side', () => {
  const ring = wall(rect(0, 0, 8000, 6000), [], {}, { closed: true });
  near(vol(solidMesh(ring)), 28000 * 200 * 2700, 1, 'ring');
  const cut = wall(rect(0, 0, 8000, 6000), [defaultOpening('window', 9000), { ...defaultOpening('door'), at: 27000 }], {}, { closed: true });
  const layout = wallLayout(cut);
  assert.equal(layout.openings.length, 2);
  near(vol(wallParts(cut).main), 28000 * 200 * 2700 - 1500 * 1300 * 200 - 900 * 2100 * 200, 1, 'ring with openings');
  // Overlapping openings: the later one is dropped; openings never run past the end.
  const crowded = wallLayout(wall([{ x: 0, y: 0 }, { x: 3000, y: 0 }], [defaultOpening('window', 0), defaultOpening('window', 500), defaultOpening('door', 2900)]));
  assert.equal(crowded.openings.length, 2);
  assert.ok(crowded.openings.every((o) => o.at + o.width <= 3000));
});

test('plan: the cut at 1 m hatches walls, shows windows it cuts and door swings, not high windows', () => {
  const linesOf = (e) => primitives(e);
  const plain = linesOf(wall([{ x: 0, y: 0 }, { x: 4000, y: 0 }]));
  assert.ok(plain.filter((p) => p.thin && p.kind === 'line').length > 10, 'cut wall hatched');
  const low = linesOf(wall([{ x: 0, y: 0 }, { x: 4000, y: 0 }], [], { height: PLAN_CUT - 100 }));
  assert.equal(low.filter((p) => p.thin).length, 0, 'a wall below the cut is not hatched');
  const windowed = wallLayout(wall([{ x: 0, y: 0 }, { x: 4000, y: 0 }], [defaultOpening('window', 1000)]), (o) => o.sill < PLAN_CUT && o.sill + o.height > PLAN_CUT);
  assert.equal(windowed.runs.length, 2, 'the window breaks the cut wall');
  const high = wallLayout(wall([{ x: 0, y: 0 }, { x: 4000, y: 0 }], [{ ...defaultOpening('window', 1000), sill: 1500 }]), (o) => o.sill < PLAN_CUT && o.sill + o.height > PLAN_CUT);
  assert.equal(high.runs.length, 1, 'a window above the cut leaves the wall whole in plan');
  const door = archPlan(wall([{ x: 0, y: 0 }, { x: 4000, y: 0 }], [{ ...defaultOpening('door', 1000), swing: 1 }]));
  const arc = door.find((p) => p.kind === 'poly' && !p.closed && p.points.length > 5);
  assert.ok(arc, 'door swing arc');
  assert.ok(arc.points.every((p) => p.y >= 100 - 1e-6), 'swings to the left of the path');
});

test('plan: placement moves, turns and keeps labels; stairs break at the cut', () => {
  const stairs = bim('stairs', { length: 3500, width: 1100, height: 2700, steps: 14 }, {}, { x: 1000, y: 2000, rz: 90 });
  const prims = primitives(stairs);
  const xs = prims.flatMap((p) => (p.kind === 'line' ? [p.a.x, p.b.x] : []));
  near(Math.min(...xs), -100, 1e-6, 'turned: width along −x');
  assert.ok(prims.some((p) => p.lineType === 'hidden'), 'treads above the cut dashed');
  assert.equal(prims.find((p) => p.kind === 'text').angle, 90);
  const q = archQuantities(stairs);
  near(q.riser, 2700 / 14, 1e-9);
  near(q.tread, 250, 1e-9);
});

test('roof: gable, hip and shed of the same slope have the same area, the true area of the plan', () => {
  const plan = rect(0, 0, 12000, 9000);
  const areas = [0, 1, 2].map((roofType) => archQuantities(bim('roof', { roofType, slope: 30, overhang: 500 }, { outer: plan })).roofArea);
  const expected = (13000 * 10000) / Math.cos(Math.PI / 6);
  for (const area of areas) near(area, expected, 1, 'roof area');
  const hip = roofGeometry(bim('roof', { roofType: 1, slope: 30, overhang: 0 }, { outer: plan }));
  assert.equal(hip.faces.length, 4);
  near(Math.max(...hip.faces.flat().map((p) => p.z)), 4500 * Math.tan(Math.PI / 6), 1e-6, 'ridge height');
  assert.equal(archQuantities(bim('roof', { roofType: 3 }, { outer: plan })).roofArea, 13000 * 10000);
});

test('space: floor area, label inside the room (round a core too)', () => {
  const room = bim('space', {}, { outer: rect(0, 0, 10000, 8000), holes: [rect(3000, 2000, 7000, 6000)] }, { name: 'Office' });
  assert.equal(archQuantities(room).floorArea, 10000 * 8000 - 4000 * 4000);
  const texts = primitives(room).filter((p) => p.kind === 'text');
  assert.deepEqual(texts.map((p) => p.text), ['Office', '64.00 m²']);
  const p = labelPoint(rect(0, 0, 10000, 8000), [rect(3000, 2000, 7000, 6000)]);
  assert.ok(!(p.x > 3000 && p.x < 7000 && p.y > 2000 && p.y < 6000), 'not in the core');
  near(solidProperties(room).floorArea, 64e6, 1e-6);
});

test('BIM from 2D: one wall per wire, slabs keep holes; axes from counts or positions', () => {
  const walls = archFrom('wall', { paths: [{ points: [{ x: 10, y: 20 }, { x: 4010, y: 20 }], closed: false }, { points: rect(0, 0, 3000, 3000), closed: true }] }, { width: 150 }, { normalizeParams: normalizeSolidParams });
  assert.equal(walls.length, 2);
  assert.deepEqual([walls[0].x, walls[0].y, walls[0].shape.path[1].x], [10, 20, 4000]);
  assert.equal(walls[1].shape.closed, true);
  assert.equal(walls[0].params.width, 150);
  const [slab] = archFrom('slab', { shapes: [{ outer: rect(0, 0, 5000, 5000), holes: [rect(1000, 1000, 2000, 2000)] }] }, {});
  assert.equal(slab.shape.holes.length, 1);
  assert.deepEqual(axisLines(bim('axis', { countX: 3, spacingX: 5000, countY: 2, spacingY: 4000 })), { xs: [0, 5000, 10000], ys: [0, 4000] });
  assert.deepEqual(axisLines(bim('axis', {}, { xs: [0, 4900, 7900], ys: [0, 4400] })).xs, [0, 4900, 7900]);
  const bubbles = primitives(bim('axis', { countX: 2, countY: 2 })).filter((p) => p.kind === 'text').map((p) => p.text);
  assert.deepEqual(bubbles, ['1', '2', 'A', 'B']);
});

test('line types: dashes and weights scale with the sheet scale (1:100)', () => {
  assert.equal(dashScaleOf({ sheet: { scale: '1:100' } }), 100);
  assert.equal(dashScaleOf({ sheet: { scale: '2:1' } }), 0.5);
  assert.equal(dashScaleOf({ sheet: { scale: 'NTS' } }), 1);
});

// ───────────────────────── IFC

function bimDrawing() {
  const d = createDrawing({ title: '주택 BIM', author: 'tester' });
  const add = (kind, params, shape, place = {}, name = kind) => addEntity(d, 'solid', { kind, params, shape, name, ...place });
  add('wall', { width: 200, height: 2700 }, { path: rect(0, 0, 8000, 6000), closed: true, openings: [defaultOpening('window', 1000), { ...defaultOpening('door'), at: 5000 }, { ...defaultOpening('doubleDoor'), at: 9000 }] }, {}, '외벽');
  add('slab', { thickness: 200 }, { outer: rect(-100, -100, 8100, 6100) });
  add('column', { profile: 0 }, {}, { x: 4000, y: 3000 });
  add('roof', { roofType: 1 }, { outer: rect(0, 0, 8000, 6000) }, { z: 2700 });
  add('space', {}, { outer: rect(100, 100, 7900, 5900) }, {}, '거실');
  add('stairs', {}, {}, { x: 500, y: 4000 });
  add('equipment', { equipment: EQUIPMENT_TYPES.indexOf('toilet'), length: 700, width: 400, height: 800 }, {}, { x: 7000, y: 5000 });
  add('axis', {}, {}, {});
  add('box', { length: 500, width: 500, height: 500 }, undefined, { x: 9000 });
  return d;
}

test('IFC: names in any language, stable GlobalIds', () => {
  assert.equal(ifcString("It's"), "'It''s'");
  const korean = ifcString('외벽 1');
  assert.match(korean, /^'\\X2\\[0-9A-F]+\\X0\\ 1'$/);
  assert.equal(decodeIfcString(korean.slice(1, -1)), '외벽 1');
  const a = ifcGuid('x');
  assert.equal(a.length, 22);
  assert.match(a, /^[0-3][0-9A-Za-z_$]{21}$/);
  assert.equal(ifcGuid('x'), a);
  assert.notEqual(ifcGuid('y'), a);
});

test('IFC export: IFC 4 classes in a project › site › building › storey tree, openings filled', () => {
  const d = bimDrawing();
  const text = new TextDecoder().decode(exportMesh('ifc', d, d.entities));
  assert.match(text, /FILE_SCHEMA\(\('IFC4'\)\)/);
  for (const cls of ['IFCPROJECT', 'IFCSITE', 'IFCBUILDING(', 'IFCBUILDINGSTOREY', 'IFCWALL(', 'IFCOPENINGELEMENT', 'IFCRELVOIDSELEMENT', 'IFCWINDOW', 'IFCDOOR', 'IFCRELFILLSELEMENT', 'IFCSLAB', 'IFCCOLUMN', 'IFCROOF', 'IFCSPACE', 'IFCSTAIR', 'IFCSANITARYTERMINAL', 'IFCGRID', 'IFCBUILDINGELEMENTPROXY', 'IFCTRIANGULATEDFACESET', 'IFCRELCONTAINEDINSPATIALSTRUCTURE', 'Qto_WallBaseQuantities']) {
    assert.ok(text.includes(cls), cls);
  }
  assert.equal((text.match(/IFCOPENINGELEMENT\(/g) ?? []).length, 3);
  assert.equal((text.match(/IFCDOOR\(/g) ?? []).length, 2);
  // Every #reference points at an entity of the file.
  const ids = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => m[1]));
  for (const m of text.matchAll(/#(\d+)(?!\d|=)/g)) assert.ok(ids.has(m[1]), `#${m[1]} defined`);
});

test('IFC import: MyCAD files come back as the same parametric objects', () => {
  const d = bimDrawing();
  const back = importMesh('ifc', exportMesh('ifc', d, d.entities));
  assert.deepEqual(back.warnings, []);
  const kinds = (list) => list.map((e) => e.kind).sort();
  assert.deepEqual(kinds(back.entities), kinds(d.entities));
  const total = (list) => list.reduce((sum, e) => sum + Math.abs(meshVolume(solidMesh(normalizeEntity(e)))), 0);
  near(total(back.entities), total(d.entities), 1, 'volume');
  assert.equal(back.entities.find((e) => e.kind === 'wall').name, '외벽');
});

test('IFC import: other IFC files arrive as named meshes, openings cut, spaces as rooms', () => {
  const d = bimDrawing();
  const text = new TextDecoder().decode(exportMesh('ifc', d, d.entities)).replace(/'MyCAD',\$/g, "'Other',$");
  const back = importMesh('ifc', new TextEncoder().encode(text));
  const wallMesh = back.entities.find((e) => /IFCWALL/.test(e.name));
  assert.ok(wallMesh && wallMesh.kind === 'mesh');
  const ours = wallParts(d.entities.find((e) => e.kind === 'wall')).main;
  near(Math.abs(meshVolume(solidMesh(normalizeEntity(wallMesh)))), vol(ours), 1e6, 'wall with its openings subtracted');
  const room = back.entities.find((e) => e.kind === 'space');
  assert.equal(room.name, '거실');
  near(archQuantities(normalizeEntity(room)).floorArea, 7800 * 5800, 1, 'room area');
  assert.ok(back.entities.some((e) => /IFCWINDOW/.test(e.name)) && back.entities.some((e) => /IFCDOOR/.test(e.name)));
});

test('IFC import: extrusions, faceted B-reps and placements of other programs, in metres', () => {
  const text = `ISO-10303-21;
HEADER;FILE_DESCRIPTION((''),'2;1');FILE_NAME('a.ifc','',(''),(''),'','','');FILE_SCHEMA(('IFC2X3'));ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCCARTESIANPOINT((0.,0.,0.));
#3=IFCDIRECTION((0.,0.,1.));
#4=IFCDIRECTION((1.,0.,0.));
#5=IFCAXIS2PLACEMENT3D(#2,#3,#4);
#6=IFCCARTESIANPOINT((10.,0.,0.));
#7=IFCAXIS2PLACEMENT3D(#6,#3,#4);
#8=IFCLOCALPLACEMENT($,#5);
#9=IFCLOCALPLACEMENT(#8,#7);
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4.,0.2);
#11=IFCEXTRUDEDAREASOLID(#10,#5,#3,3.);
#12=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#11));
#13=IFCPRODUCTDEFINITIONSHAPE($,$,(#12));
#14=IFCWALLSTANDARDCASE('0abc',$,'W1',$,$,#9,#13,$);
ENDSEC;
END-ISO-10303-21;`;
  const { entities } = importMesh('ifc', new TextEncoder().encode(text));
  assert.equal(entities.length, 1);
  const tris = solidMesh(normalizeEntity(entities[0]));
  near(Math.abs(meshVolume(tris)), 4000 * 200 * 3000, 1, 'metres → mm');
  near(Math.min(...tris.flat().map((p) => p[0])), 8000, 1e-6, 'placement chain');
  // An extruded wall comes in as a wall (its parameters), named as in the file.
  assert.equal(entities[0].kind, 'wall');
  assert.equal(entities[0].name, 'W1');
  near(entities[0].params.width, 200, 1e-6, 'width');
});

// ───────────────────────── levels, materials, layered walls, rebar, truss, panel, pipe, any-outline roofs, sketch windows

const area2 = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);

test('straight skeleton: faces tile the footprint and lie on their edges\' planes (L, U, T, pentagon, mixed slopes)', () => {
  const shapes = {
    L: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }],
    U: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 8 }, { x: 0, y: 8 }],
    T: [{ x: 0, y: 6 }, { x: 0, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 6 }],
    pentagon: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 10, y: 5 }, { x: 4, y: 9 }, { x: -2, y: 5 }],
    clockwise: [{ x: 0, y: 6 }, { x: 10, y: 6 }, { x: 10, y: 0 }, { x: 0, y: 0 }],
  };
  for (const [name, pts] of Object.entries(shapes)) {
    for (const slopes of [pts.map(() => 45), pts.map((_, i) => [30, 60, 45, 90][i % 4])]) {
      const r = straightSkeleton(pts, slopes);
      near(r.faces.reduce((s, f) => s + area2(f.points), 0), area2(pts), 1e-6, `${name} area`);
      for (const f of r.faces) {
        const e = r.edges[f.edge];
        if (!e.speed) continue;
        for (const p of f.points) near(((p.x - e.a.x) * e.m.x + (p.y - e.a.y) * e.m.y) / e.speed, p.z, 1e-6, `${name} plane`);
      }
    }
  }
});

test('roof over an L: hip with gable ends from per-edge slopes; closed body', () => {
  const L = [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 6000 }, { x: 6000, y: 6000 }, { x: 6000, y: 10000 }, { x: 0, y: 10000 }];
  const hip = bim('roof', { roofType: 1, slope: 30, overhang: 0 }, { outer: L });
  const gabled = bim('roof', { roofType: 1, slope: 30, overhang: 0 }, { outer: L, slopes: [null, 90, null, null, 90, null] });
  near(archQuantities(hip).roofArea, 96e6 / Math.cos(Math.PI / 6), 1, 'hip area = plan / cos');
  assert.equal(roofGeometry(hip).faces.length, 6, 'a plane per edge');
  assert.equal(roofGeometry(gabled).faces.length, 4, 'the gable ends stand upright (no roof plane)');
  near(archQuantities(gabled).roofArea, archQuantities(hip).roofArea, 1, 'the same plan covered either way');
  assertClosed(solidMesh(gabled), 'L roof');
  assert.ok(primitives(hip).filter((p) => p.lineType === 'hidden' && p.thin).length >= 5, 'hips and valleys in plan');
});

test('materials and layered walls: bands in plan, a colour per layer in 3D, width = sum', () => {
  const M = Object.fromEntries(presetMaterials('ko').map((m) => [m.id, m]));
  const layers = [{ material: M.brick, thickness: 90 }, { material: M.insulation, thickness: 100 }, { material: M.concrete, thickness: 200 }];
  const w = wall([{ x: 0, y: 0 }, { x: 4000, y: 0 }], [], { width: 999 }, { layers });
  near(vol(solidMesh(w)), 4000 * 390 * 2700, 1, 'layered volume');
  const groups = solidMeshGroups(w).map((g) => g.material);
  for (const m of [M.brick, M.insulation, M.concrete]) assert.ok(groups.includes(`color:${m.color}`), m.name);
  const polys = primitives(w).filter((p) => p.kind === 'poly' && p.closed);
  assert.equal(polys.length, 3, 'one band per layer in plan');
  const steel = bim('column', { profile: 0 }, {}, { material: M.steel });
  assert.ok(primitives(steel).some((p) => p.kind === 'fill'), 'steel is cut solid black');
  assert.equal(normalizeEntity({ type: 'solid', kind: 'column', material: { id: 'x', name: 'X', color: '#123456', pattern: 'net' } }).material.pattern, 'net');
});

test('levels: Site › Building › Level, plan shows one level, 3D all', () => {
  const bimData = normalizeBim({ levels: [{ id: 'B', name: '2층', elevation: 3000 }, { id: 'A', name: '1층', elevation: 0 }], planLevel: 'A' });
  assert.deepEqual(bimData.levels.map((l) => l.id), ['A', 'B'], 'sorted by elevation');
  assert.equal(createBim('en').levels[0].name, 'Level 1');
  const d = normalizeDrawing({ entities: [{ type: 'solid', kind: 'column', level: 'A' }, { type: 'solid', kind: 'column', level: 'B', z: 3000 }, { type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 }], bim: bimData });
  assert.deepEqual(d.entities.map((e) => isVisible(d, e)), [true, false, true]);
  assert.deepEqual(d.entities.map((e) => isVisible3d(d, e)), [true, true, true]);
  d.bim.levels[1].visible = false;
  assert.equal(isVisible3d(d, d.entities[1]), false, 'a hidden level is hidden in 3D too');
});

test('pipe, truss, panel, rebar: bodies and quantities', () => {
  near(vol(tubeAlong([[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]], 50, false, 96)), 2 * Math.PI * 2500 * 1000, 2e5, 'mitred bend keeps the volume');
  near(vol(tubeAlong([[0, 0, 0], [1000, 0, 0]], 50, false, 96, 10)), Math.PI * (2500 - 1600) * 1000, 2e4, 'hollow pipe');
  assert.equal(trussMembers(bim('truss', { trussType: 0, panels: 6 }, { path: [{ x: 0, y: 0 }, { x: 9000, y: 0 }] })).length, 15);
  assert.equal(trussMembers(bim('truss', { trussType: 2, panels: 6 }, { path: [{ x: 0, y: 0 }, { x: 9000, y: 0 }] })).length, 10);
  const sheet = (waves) => bim('panel', { thickness: 1, waveLength: waves ? 200 : 0, waveHeight: waves ? 30 : 0 }, { outer: rect(0, 0, 2000, 1000) });
  near(vol(solidMesh(sheet(true))), vol(solidMesh(sheet(false))), 1, 'waves keep the volume');
  const column = bim('rebar', { bars: 3, spacing: 200, cover: 40 }, { host: { kind: 'column', params: { width: 400, depth: 400, height: 3000, profile: 0 } } });
  const bars = rebarBars(column);
  assert.equal(bars.filter((b) => b.points.length === 2).length, 8, '3 per side round a square = 8 main bars');
  assert.ok(bars.filter((b) => b.points.length === 5).length >= 14, 'ties every 200');
  near(archQuantities(column).weight, bars.reduce((s, b) => s + (b.length / 1000) * 0.00617 * (2 * b.radius) ** 2, 0), 1e-9);
  const slab = bim('rebar', { spacing: 250, cover: 30 }, { host: { kind: 'slab', params: { thickness: 200 }, outer: rect(0, 0, 5000, 4000), holes: [rect(1000, 1000, 2000, 2000)] } });
  assert.ok(rebarBars(slab).some((b) => b.points[0][1] > 1000 && b.points[0][1] < 2000 && b.points[1][0] < 1000), 'bars stop at the hole');
});

test('windows: pane grids and windows drawn as a sketch', () => {
  const grid = wallParts(wall([{ x: 0, y: 0 }, { x: 4000, y: 0 }], [{ type: 'window', at: 500, width: 2400, height: 1500, sill: 900, cols: 3, rows: 2 }]));
  assert.equal(new Set(grid.openings[0].glass.map((tri) => tri.block)).size, 6, '3 × 2 panes');
  const found = profileFromLoops([rect(100, 100, 1300, 1900), rect(200, 200, 1200, 1000), rect(200, 1100, 1200, 1800)]);
  assert.deepEqual([found.width, found.height, found.profile.holes.length], [1200, 1800, 2]);
  const sketch = wallParts(wall([{ x: 0, y: 0 }, { x: 4000, y: 0 }], [{ type: 'custom', at: 1000, width: 1200, height: 1800, sill: 700, profile: found.profile }]));
  assert.ok(sketch.openings[0].wood.length && sketch.openings[0].glass.length, 'frame and glass from the sketch');
});

test('IFC: levels as storeys, materials and layer sets, rebar and the new classes; back as levels', () => {
  const M = Object.fromEntries(presetMaterials('ko').map((m) => [m.id, m]));
  const d = createDrawing({ title: 'levels' });
  d.bim = normalizeBim({ levels: [{ id: 'L1', name: '1층', elevation: 0 }, { id: 'L2', name: '2층', elevation: 3000 }], materials: presetMaterials('ko') });
  const put = (kind, params, shape, extra = {}) => addEntity(d, 'solid', { kind, params, shape, name: kind, ...extra });
  put('wall', { height: 3000 }, { path: rect(0, 0, 6000, 4000), closed: true, layers: [{ material: M.brick, thickness: 90 }, { material: M.concrete, thickness: 200 }], openings: [] }, { level: 'L1' });
  put('slab', { thickness: 200 }, { outer: rect(0, 0, 6000, 4000) }, { level: 'L2', z: 3000, material: M.concrete });
  put('rebar', {}, { host: { kind: 'slab', params: { thickness: 200 }, outer: rect(0, 0, 6000, 4000) } }, { level: 'L2', z: 3000 });
  put('truss', {}, { path: [{ x: 0, y: 0 }, { x: 6000, y: 0 }] }, { level: 'L2', z: 3000 });
  put('panel', {}, { outer: rect(0, 0, 1000, 1000) }, { level: 'L1' });
  put('pipe', {}, { path: [{ x: 0, y: 0 }, { x: 3000, y: 0 }] }, { level: 'L1' });
  const text = new TextDecoder().decode(exportMesh('ifc', d, d.entities));
  for (const cls of ['IFCBUILDINGSTOREY(', 'IFCMATERIALLAYERSET(', 'IFCMATERIALLAYERSETUSAGE(', 'IFCRELASSOCIATESMATERIAL(', 'IFCREINFORCINGBAR(', 'IFCMEMBER(', 'IFCPLATE(', 'IFCPIPESEGMENT(']) assert.ok(text.includes(cls), cls);
  assert.equal(text.split('IFCBUILDINGSTOREY(').length - 1, 2);
  const back = importMesh('ifc', exportMesh('ifc', d, d.entities));
  assert.deepEqual(back.bim.levels.map((l) => l.name), ['1층', '2층']);
  assert.equal(back.entities.find((e) => e.kind === 'wall').shape.layers.length, 2);
  const generic = importMesh('ifc', new TextEncoder().encode(text.replace(/'MyCAD',\$/g, "'Other',$")));
  assert.deepEqual(generic.bim.levels.map((l) => [l.name, l.elevation]), [['1층', 0], ['2층', 3000]]);
  assert.ok(generic.entities.every((e) => e.level), 'every element on its storey');
});

test('3D axes: a unit that keeps the numbers short', () => {
  assert.equal(axisUnitFor(12000, 'mm'), 'm');
  assert.equal(axisUnitFor(300, 'mm'), 'mm');
  assert.equal(axisUnitFor(300, 'cm'), 'mm');
  assert.equal(axisUnitFor(5000, 'in'), 'ft');
  assert.equal(axisUnitFor(500, 'ft'), 'in');
});

test('triangulation: two holes reaching as far right join without crossing bridges', async () => {
  const { triangulate } = await import('../../src/domain/triangulate.js');
  const outer = rect(0, 0, 1200, 1800);
  const holes = [rect(100, 100, 1100, 900).reverse(), rect(100, 1000, 1100, 1700).reverse()];
  const tris = triangulate(outer, holes);
  const area = tris.reduce((s, [a, b, c]) => s + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2, 0);
  near(area, 1200 * 1800 - 1000 * 800 - 1000 * 700, 1e-6, 'frame area');
});
