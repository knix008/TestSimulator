// 3D solids: primitives, features from 2D, placement, booleans, sections, drawing views.
import assert from 'node:assert/strict';
import test from 'node:test';
import { booleanOf, conform } from '../../src/domain/csg.js';
import { createEntity, measure, normalizeEntity, primitives, transformEntity } from '../../src/domain/entities.js';
import {
  ALL_SOLID_KINDS, defaultSolidParams, exactVolume, featureFrom, joinSegments, meshArea, meshBox, meshVolume, normalizeSolidParams, projectEdges, resampleLoop,
  sectionAt, shadedView, SOLID_ICONS, SOLID_KINDS, SOLIDS, solidMesh, solidProperties,
} from '../../src/domain/solids.js';
import { hasIcon } from '../../src/icons.js';
import { prepareStl } from '../../src/domain/stl.js';
import { createDrawing, addEntity } from '../../src/domain/drawing.js';

const near = (a, b, rel = 1e-9, label = '') => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-9, `${label} ${a} ≠ ${b}`);
const solid = (kind, params = {}, place = {}, shape) => createEntity('solid', { kind, params, ...place, ...(shape ? { shape } : {}) });
const square = (s, cx = 0, cy = 0) => [{ x: cx - s, y: cy - s }, { x: cx + s, y: cy - s }, { x: cx + s, y: cy + s }, { x: cx - s, y: cy + s }];

/** Every edge of a closed mesh is shared by exactly two triangles, in opposite directions. */
function assertClosed(tris, label) {
  const key = (p) => p.map((v) => Math.round(v * 1e6)).join(',');
  const edges = new Map();
  for (const tri of tris) for (let i = 0; i < 3; i++) {
    const k = `${key(tri[i])}>${key(tri[(i + 1) % 3])}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
  for (const [k, n] of edges) {
    const [a, b] = k.split('>');
    assert.equal(n, 1, `${label}: edge used ${n}× in one direction`);
    assert.ok(edges.has(`${b}>${a}`), `${label}: open edge`);
  }
}

test('ten primitives (FreeCAD Part) with icons; every mesh closed, outward and as big as the formula', () => {
  assert.deepEqual(SOLID_KINDS, ['box', 'cylinder', 'sphere', 'cone', 'torus', 'tube', 'wedge', 'prism', 'ellipsoid', 'helix']);
  for (const kind of ALL_SOLID_KINDS) assert.ok(hasIcon(SOLID_ICONS[kind]), `${kind} icon`);
  for (const kind of SOLID_KINDS) {
    const e = solid(kind, defaultSolidParams(kind));
    const tris = solidMesh(e);
    assert.ok(tris.length >= 12, kind);
    if (kind !== 'helix') assertClosed(tris, kind);
    const v = meshVolume(tris);
    assert.ok(v > 0, `${kind}: outward faces (positive volume)`);
    const exact = exactVolume(e);
    if (exact) near(v, exact, 0.012, kind);
  }
});

test('parameters are clamped (tube inner < outer, torus tube < ring, helix wire fits the pitch)', () => {
  assert.equal(normalizeSolidParams('box', { length: -5, width: 'x' }).length, 0.01);
  assert.equal(normalizeSolidParams('box', { width: 'x' }).width, 10);
  assert.ok(normalizeSolidParams('tube', { outer: 5, inner: 9 }).inner < 5);
  assert.ok(normalizeSolidParams('torus', { radius1: 4, radius2: 10 }).radius2 < 4);
  assert.ok(normalizeSolidParams('helix', { pitch: 2, wire: 5 }).wire < 1);
  assert.equal(normalizeSolidParams('prism', { sides: 6.6 }).sides, 7);
  assert.equal(normalizeEntity({ type: 'solid', kind: 'teapot' }), null);
});

test('placement: rotations X → Y → Z, mirror, scale, position', () => {
  const box = (place) => meshBox(solidMesh(solid('box', { length: 30, width: 20, height: 10 }, place)));
  assert.deepEqual(box({ x: 5, y: 6, z: 7 }).min.map((v) => Math.round(v * 1e6) / 1e6), [5, 6, 7]);
  const turned = box({ rz: 90 });
  near(turned.size[0], 20); near(turned.size[1], 30);
  const tipped = box({ rx: 90 });
  near(tipped.size[1], 10); near(tipped.size[2], 20);
  const mirrored = solid('box', { length: 30, width: 20, height: 10 }, { flip: true });
  near(meshVolume(solidMesh(mirrored)), 6000, 1e-9, 'a mirrored solid stays outward');
  near(meshBox(solidMesh(mirrored)).min[1], -20);
  near(meshVolume(solidMesh(solid('box', { length: 1, width: 1, height: 1 }, { scale: 3 }))), 27);
});

test('2D drawing: move, rotate, scale and mirror a solid; footprint, grips and measurements', () => {
  const e = solid('cylinder', { radius: 5, height: 8 }, { x: 10, y: 0 });
  assert.equal(primitives(e)[0].kind, 'circle', 'top view of a cylinder: its circle');
  const moved = normalizeEntity(transformEntity(e, { type: 'move', dx: 5, dy: 3 }));
  assert.deepEqual([moved.x, moved.y], [15, 3]);
  const turned = normalizeEntity(transformEntity(solid('box', { length: 10, width: 2, height: 1 }), { type: 'rotate', cx: 0, cy: 0, angle: 90 }));
  assert.equal(turned.rz, 90);
  const scaled = normalizeEntity(transformEntity(e, { type: 'scale', cx: 0, cy: 0, factor: 2 }));
  near(meshVolume(solidMesh(scaled)), meshVolume(solidMesh(e)) * 8, 1e-9);
  const mirrored = normalizeEntity(transformEntity(solid('box', { length: 10, width: 2, height: 1 }, { x: 5 }), { type: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }));
  const box = meshBox(solidMesh(mirrored));
  near(box.min[0], -15); near(box.max[0], -5);
  near(meshVolume(solidMesh(mirrored)), 20);
  const m = measure(e);
  near(m.volume, Math.PI * 25 * 8);
  assert.ok(m.area > 0 && m.triangles > 0);
});

test('features from 2D: pad with holes, revolve about four axes, loft, sweep', () => {
  const pad = normalizeEntity(featureFrom('pad', { shapes: [{ outer: square(10), holes: [square(3)] }] }, { height: 5 }));
  near(meshVolume(solidMesh(pad)), (400 - 36) * 5, 1e-9, 'pad');
  near(exactVolume(pad), (400 - 36) * 5);
  assertClosed(solidMesh(pad), 'pad');
  // A 3 × 4 rectangle 5…8 from the axis turned all the way round: π (8² − 5²) · 4.
  const ring = [{ x: 5, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 5, y: 4 }];
  for (const axis of ['yAxis', 'xAxis', 'left', 'bottom']) {
    const loop = axis === 'xAxis' ? ring.map((p) => ({ x: p.y, y: p.x })) : ring;
    const e = normalizeEntity(featureFrom('revolution', { loop }, { angle: 360 }, { axis }));
    const v = meshVolume(solidMesh(e));
    if (axis === 'yAxis' || axis === 'xAxis') near(v, Math.PI * (64 - 25) * 4, 0.003, axis);
    else assert.ok(v > 0, axis);
  }
  const yRev = meshBox(solidMesh(normalizeEntity(featureFrom('revolution', { loop: ring }, {}, { axis: 'yAxis' }))));
  near(yRev.size[1], 4, 1e-6, 'about the Y axis the height runs along y');
  near(yRev.max[0], 8, 1e-6);
  const loft = normalizeEntity(featureFrom('loft', { bottom: square(8), top: square(8) }, { height: 10 }));
  near(meshVolume(solidMesh(loft)), 2560, 1e-6, 'a loft between equal squares is a prism');
  const sweep = normalizeEntity(featureFrom('sweep', { path: [{ x: 0, y: 0 }, { x: 50, y: 0 }] }, { radius: 2 }));
  near(meshVolume(solidMesh(sweep)), Math.PI * 4 * 50, 0.01, 'a straight sweep is a cylinder');
  // Resampling keeps the shape and starts on the +x side.
  const r = resampleLoop(square(8), 32);
  assert.equal(r.length, 32);
  near(r[0].x, 8); near(r[0].y, 0, 1e-9);
});

test('booleans (Fuse, Cut, Common): volumes, and the result is one closed shell', () => {
  const box = solidMesh(solid('box', { length: 10, width: 10, height: 10 }));
  const pin = solidMesh(solid('cylinder', { radius: 3, height: 20 }, { x: 5, y: 5, z: -5 }));
  const pinInside = meshVolume(solidMesh(solid('cylinder', { radius: 3, height: 10 }, { x: 5, y: 5 })));
  const cut = booleanOf('cut', [box, pin]);
  near(meshVolume(cut), 1000 - pinInside, 1e-6, 'cut');
  near(meshVolume(booleanOf('union', [box, pin])), 1000 + meshVolume(pin) - pinInside, 1e-6, 'union');
  near(meshVolume(booleanOf('common', [box, pin])), pinInside, 1e-6, 'common');
  assertClosed(cut, 'cut result');
  assert.deepEqual(booleanOf('common', [box, solidMesh(solid('box', {}, { x: 100 }))]), [], 'no overlap: nothing in common');
  assert.throws(() => booleanOf('xor', [box, pin]));
  // conform() splits T-junctions: a big square next to two small ones.
  const tris = conform([[[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]], [[2, 0, 0], [3, 0, 0], [3, 1, 0], [2, 1, 0]], [[2, 1, 0], [3, 1, 0], [3, 2, 0], [2, 2, 0]]]);
  assert.ok(tris.some((tri) => tri.some((p) => p[0] === 2 && p[1] === 1)), 'the big square gets the T-junction vertex');
  near(meshArea(tris), 6);
});

test('section: a cylinder cut across is a circle; an empty height gives nothing', () => {
  const tris = solidMesh(solid('cylinder', { radius: 10, height: 20 }));
  const chains = joinSegments(sectionAt(tris, 7), 1e-6);
  assert.equal(chains.length, 1);
  assert.ok(chains[0].closed);
  for (const p of chains[0].points) near(Math.hypot(p.x, p.y), 10, 0.002);
  assert.equal(sectionAt(tris, 25).length, 0);
});

test('drawing views: smooth outlines, sharp edges, hidden lines (dashed in the drawing)', () => {
  const box = solidMesh(solid('box', { length: 10, width: 10, height: 10 }));
  const iso = projectEdges(box, 'iso', { hidden: true });
  assert.equal(iso.length, 12, 'twelve edges');
  assert.equal(iso.filter((seg) => seg.hidden).length, 3, 'three hidden edges behind the box');
  const front = projectEdges(box, 'front', { hidden: true });
  assert.ok(front.every((seg) => !seg.hidden), 'hidden edges right behind visible ones are not repeated');
  const sphere = projectEdges(solidMesh(solid('sphere', { radius: 12 })), 'iso', { hidden: true });
  assert.ok(sphere.length > 20 && sphere.every((seg) => !seg.hidden), 'the outline of a sphere is all visible');
  // An isometric drawing keeps true lengths along the axes, so a sphere's outline is a circle of r·√(3/2).
  for (const seg of sphere) for (const p of seg) near(Math.hypot(p.x, p.y), 12 * Math.sqrt(1.5), 0.01, 'and round');
  const iso2 = projectEdges(solidMesh(solid('cylinder', { radius: 5, height: 10 })), 'iso', { hidden: true });
  assert.ok(iso2.some((seg) => seg.hidden), 'the back of the bottom rim of a cylinder is hidden in the isometric view');
  const shaded = shadedView(box, 'iso');
  assert.equal(shaded.length, 6, 'three faces (six triangles) face the viewer');
  assert.ok(shaded.every((tri) => tri.light >= 0.25 && tri.light <= 1));
});

test('3D printing and the 3D view: solids join the extruded 2D outlines', () => {
  const d = createDrawing();
  addEntity(d, 'rect', { x: 0, y: 0, width: 10, height: 10 });
  addEntity(d, 'solid', { kind: 'box', params: { length: 5, width: 5, height: 5 }, x: 20 });
  const mesh = prepareStl(d.entities, d, { thickness: 2 });
  assert.equal(mesh.solids, 1);
  near(mesh.volume, 200 + 125);
  const only = prepareStl(d.entities, d, { thickness: 2, outlines: false });
  near(only.volume, 125);
  near(solidProperties(d.entities[1]).volume, 125);
  for (const kind of ALL_SOLID_KINDS) assert.ok(SOLIDS[kind], kind);
});
