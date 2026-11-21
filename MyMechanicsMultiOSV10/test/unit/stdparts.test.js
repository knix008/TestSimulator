// The standard parts library: size tables against the standards, the solids' dimensions and volumes on the
// kernel, the stdPart feature (placement, multi-body), fastener sizing for holes and bolt lengths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import {
  METRIC, HEX_BOLT, SOCKET_CAP, HEX_NUT, FLAT_WASHER, SPRING_WASHER, BEARINGS, RETAINING_RINGS, KEYS, PIPES, STD_ITEMS, STD_CATEGORIES, STD_KINDS,
  stdShape, stdDefaults, designation, sizeTable, fastenerSizeForHole, boltLengthFor, boltLengths, gearOutline, gearCircles, polygonArea, bearingBalls,
  pinChamfer, keyForShaft, stdMateRefs, stdProblem,
} from '../../src/cad/stdparts.js';
import { countSolids } from '../../src/cad/part-more.js';
import { springWasherGeometry } from '../../src/cad/stdparts.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const bbox = (s) => { const [lo, hi] = s.boundingBox.bounds; return { lo, hi, size: hi.map((v, i) => v - lo[i]) }; };
const hexArea = (s) => (Math.sqrt(3) / 2) * s * s;
const cyl = (r, h) => Math.PI * r * r * h;

test('size tables follow the standards (spot values)', () => {
  assert.deepEqual([METRIC.M8.d, METRIC.M8.p, METRIC.M8.medium, METRIC.M8.tap], [8, 1.25, 9, 6.8]);
  assert.deepEqual([HEX_BOLT.M10.s, HEX_BOLT.M10.k], [16, 6.4]);
  assert.deepEqual([SOCKET_CAP.M6.dk, SOCKET_CAP.M6.k, SOCKET_CAP.M6.s], [10, 6, 5]);
  assert.deepEqual([HEX_NUT.M12.s, HEX_NUT.M12.m], [18, 10.8]);
  assert.deepEqual([FLAT_WASHER.M8.d1, FLAT_WASHER.M8.d2, FLAT_WASHER.M8.h], [8.4, 16, 1.6]);
  assert.deepEqual([BEARINGS[6204].d, BEARINGS[6204].D, BEARINGS[6204].B], [20, 47, 14]);
  assert.deepEqual([BEARINGS[6001].d, BEARINGS[6001].D, BEARINGS[6001].B], [12, 28, 8]);
  assert.deepEqual([KEYS['8x7'].b, KEYS['8x7'].h], [8, 7]);
  assert.deepEqual([PIPES.DN50.od, PIPES.DN50.wall], [60.3, 3.91]);
  // Every catalogue item is in a category and has sizes; sizes M3–M24 for the fasteners.
  assert.deepEqual(STD_CATEGORIES.flatMap((c) => c.items).sort(), [...STD_KINDS].sort());
  for (const k of ['hexBolt', 'socketCap', 'hexNut', 'flatWasher', 'springWasher']) assert.deepEqual(STD_ITEMS[k].sizes, ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24']);
  assert.ok(STD_ITEMS.ballBearing.sizes.includes('6000') && STD_ITEMS.ballBearing.sizes.includes('6206'));
  // Every item has a size table with a row per size (some standards cover fewer sizes: ISO 4766 M3–M12, ISO 7380 M3–M16).
  for (const k of STD_KINDS) { const [cols, rows] = sizeTable(k); assert.ok(cols.length >= 2 && rows.length >= 3, k); assert.ok(rows.every((r) => r.length === cols.length + 1), k); }
});

test('bolt lengths come from the preferred series and the size range', () => {
  assert.deepEqual(boltLengths('M3'), [6, 8, 10, 12, 16, 20, 25, 30]);
  assert.equal(boltLengths('M24')[0], 50);
  assert.equal(boltLengths('M24').at(-1), 200);
  assert.equal(keyForShaft(25), '8x7');
  assert.equal(keyForShaft(40), '12x8');
});

test('hex bolt ISO 4017 M8×30: across flats, head height, length and volume', () => {
  const s = stdShape({ kind: 'hexBolt', size: 'M8', length: 30 });
  const b = bbox(s);
  near(b.size[0], 13, 1e-4); // flats along X
  near(b.size[1], 13 / Math.cos(Math.PI / 6), 1e-3); // corners along Y
  near(b.hi[2], 5.3, 1e-4); near(b.lo[2], -30, 1e-4);
  const upper = hexArea(13) * 5.3 + cyl(4, 30);
  const v = V(s);
  assert.ok(v < upper && v > upper * 0.95, `volume ${v} vs unchamfered ${upper}`);
  assert.equal(countSolids(s), 1);
});

test('socket head cap screw ISO 4762 M6×20: head, socket and shank', () => {
  const s = stdShape({ kind: 'socketCap', size: 'M6', length: 20 });
  const b = bbox(s);
  near(b.size[0], 10, 1e-4); near(b.hi[2], 6, 1e-4); near(b.lo[2], -20, 1e-4);
  const head = cyl(5, 6); const socket = hexArea(5) * 3;
  const v = V(s);
  assert.ok(v < head - socket * 0.9 + cyl(3, 20) && v > (head - socket) * 0.97 + cyl(3, 20) * 0.97, `volume ${v}`);
});

test('hex nut ISO 4032 M10: height, flats and the minor-diameter bore', () => {
  const s = stdShape({ kind: 'hexNut', size: 'M10' });
  const b = bbox(s);
  near(b.size[0], 16, 1e-4); near(b.size[2], 8.4, 1e-4);
  const minor = 10 - 1.0825 * 1.5;
  const upper = hexArea(16) * 8.4 - cyl(minor / 2, 8.4);
  const v = V(s);
  assert.ok(v < upper && v > upper * 0.9, `volume ${v} vs ${upper}`);
});

test('washers: ISO 7089 exact annulus; DIN 127 B twisted split ring (b × s section on a helix, free height h)', () => {
  const w = stdShape({ kind: 'flatWasher', size: 'M8' });
  near(V(w), Math.PI * (8 * 8 - 4.2 * 4.2) * 1.6, 1e-6);
  near(bbox(w).size[2], 1.6, 1e-4);
  const sp = stdShape({ kind: 'springWasher', size: 'M8' });
  const g = springWasherGeometry('M8');
  assert.equal(g.s, SPRING_WASHER.M8.s); assert.equal(g.h, 2 * g.s);
  // Pappus for a screw sweep of an axial-plane section: V = b · s · r_m · swept angle.
  near(V(sp), g.b * g.s * g.rm * g.sweep, 1e-4);
  assert.equal(countSolids(sp), 1);
  // The ends: one at z 0 … s, the other lifted by h − s (vertices, the box of a sweep is not tight).
  const zs = sp.edges.flatMap((e) => [e.startPoint.z, e.endPoint.z]);
  near(Math.min(...zs), 0, 1e-5); near(Math.max(...zs), g.h, 1e-5);
  const rs = sp.edges.flatMap((e) => [Math.hypot(e.startPoint.x, e.startPoint.y), Math.hypot(e.endPoint.x, e.endPoint.y)]);
  near(Math.min(...rs), g.d1 / 2, 1e-5); near(Math.max(...rs), g.d2 / 2, 1e-5);
});

test('deep-groove ball bearing 6204: envelope d × D × B, rings and balls', () => {
  const s = stdShape({ kind: 'ballBearing', size: '6204' });
  const b = bbox(s);
  near(b.size[0], 47, 1e-3); near(b.size[1], 47, 1e-3); near(b.size[2], 14, 1e-4);
  // The catalogue ball set of a 6204: 8 balls of 5/16 in (7.938 mm) on the pitch circle (d + D) / 2.
  const { count, Dw, pitch, innerGroove, outerGroove, innerShoulder, outerShoulder } = bearingBalls('6204');
  assert.equal(count, 8);
  near(Dw, 7.938, 1e-9); near(pitch, 33.5, 1e-9);
  // Raceway conformity 0.52 / 0.53 (a clearance between ball and groove), shoulders clear of the balls.
  assert.ok(innerGroove > Dw / 2 && outerGroove > Dw / 2);
  assert.ok(innerShoulder < pitch - Dw * 0.5 && outerShoulder > pitch + Dw * 0.5 && innerShoulder > pitch - Dw);
  // Inner ring, outer ring, cage and the balls.
  assert.equal(countSolids(s), 3 + count);
  const envelope = Math.PI * (23.5 ** 2 - 10 ** 2) * 14;
  const v = V(s);
  assert.ok(v < envelope * 0.9 && v > envelope * 0.5, `bearing ${v} of ${envelope}`);
  // The bore is clear: a shaft of d − 0.01 does not touch the rings.
  const shaft = R.makeCylinder(9.99, 20, [0, 0, -3], [0, 0, 1]);
  assert.ok(R.measureVolume(shaft.intersect(s)) < 1e-6);
});

test('dowel pin ISO 8734 6×30: exact volume with the end chamfers', () => {
  const s = stdShape({ kind: 'dowelPin', size: '6', length: 30 });
  const c = pinChamfer(6); const r = 3;
  const frustum = (Math.PI * c / 3) * (r * r + r * (r - c) + (r - c) ** 2);
  near(V(s), cyl(r, 30 - 2 * c) + 2 * frustum, 1e-6);
  near(bbox(s).size[2], 30, 1e-6);
});

test('retaining ring DIN 471 for a 20 mm shaft: thickness and the free inside diameter', () => {
  const s = stdShape({ kind: 'retainingRing', size: '20' });
  const g = RETAINING_RINGS[20];
  near(bbox(s).size[2], g.s, 1e-4);
  // The ring grips the groove: a 20 mm shaft overlaps it, an 18.4 mm one does not.
  assert.ok(R.measureVolume(R.makeCylinder(10, 5, [0, 0, -1], [0, 0, 1]).intersect(s.clone())) > 0.1);
  assert.ok(R.measureVolume(R.makeCylinder(g.d3 / 2 - 0.05, 5, [0, 0, -1], [0, 0, 1]).intersect(s.clone())) < 1e-6);
});

test('parallel key DIN 6885 A 8×7×40: rounded-end volume', () => {
  const s = stdShape({ kind: 'parallelKey', size: '8x7', length: 40 });
  near(V(s), 7 * (8 * 32 + Math.PI * 16), 1e-3);
  const b = bbox(s);
  near(b.size[0], 40, 1e-3); near(b.size[1], 8, 1e-3); near(b.size[2], 7, 1e-4);
});

test('spur gear m2 z24: involute outline, tip / root circles and volume', () => {
  const g = { module: 2, teeth: 24 };
  const c = gearCircles(g);
  assert.deepEqual([c.pitch, c.tip, c.root], [48, 52, 43]);
  const pts = gearOutline(g);
  const rMax = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  const rMin = Math.min(...pts.map(([x, y]) => Math.hypot(x, y)));
  near(rMax, 26, 1e-6); near(rMin, 21.5, 1e-6);
  // The teeth fill about half of the ring between root and tip.
  const area = polygonArea(pts);
  assert.ok(area > Math.PI * 21.5 ** 2 + 0.3 * Math.PI * (26 ** 2 - 21.5 ** 2) && area < Math.PI * 21.5 ** 2 + 0.7 * Math.PI * (26 ** 2 - 21.5 ** 2), `area ${area}`);
  const s = stdShape({ kind: 'spurGear', module: 2, teeth: 24, width: 20, bore: 10 });
  near(V(s), (area - Math.PI * 25) * 20, 1e-3);
  near(bbox(s).size[2], 20, 1e-6);
});

test('pipe fittings: elbows by Pappus, tee and flange', () => {
  const p = PIPES.DN25; const ro = p.od / 2; const ri = ro - p.wall;
  const e90 = stdShape({ kind: 'elbow90', dn: 'DN25' });
  near(V(e90), Math.PI * (ro * ro - ri * ri) * p.elbow * (Math.PI / 2), 1e-5);
  // Inlet at the origin along +Z, outlet facing +X at height R.
  const b = bbox(e90);
  near(b.hi[2], p.elbow + ro, 1e-3); near(b.lo[0], -ro, 1e-3); near(b.hi[0], p.elbow, 1e-3);
  const e45 = stdShape({ kind: 'elbow45', dn: 'DN25' });
  near(V(e45), V(e90) / 2, 1e-5);
  const tee = stdShape({ kind: 'pipeTee', dn: 'DN25' });
  const tb = bbox(tee);
  near(tb.size[0], 2 * p.tee, 1e-4); near(tb.hi[2], p.tee, 1e-4);
  const run = Math.PI * (ro * ro - ri * ri) * 2 * p.tee;
  assert.ok(V(tee) > run && V(tee) < run * 1.5);
  const fl = stdShape({ kind: 'flange', dn: 'DN50' });
  const fb = bbox(fl);
  near(fb.size[0], 165, 1e-3); near(fb.size[2], PIPES.DN50.flange.H, 1e-4);
});

test('the stdPart feature places the part (axis, spin, offset) as a body of its own', () => {
  const part = { id: 'p', name: 'P', features: [] };
  part.features.push({ id: 'imp', type: 'import', name: 'Imported1', brep: R.makeBox([-20, -20, -10], [20, 20, 0]).serialize() });
  const f = createFeature(part, 'stdPart', { kind: 'hexBolt', size: 'M6', length: 20, x: 5, y: 0, z: 0, axis: 'z' });
  part.features.push(f);
  let r = regenerate(part);
  assert.ok(r.results.get(f.id).ok, r.results.get(f.id).detail);
  assert.equal(countSolids(r.body), 2);
  assert.ok(r.results.get(f.id).thread, 'cosmetic thread data');
  const vol = V(r.body);
  near(vol, 40 * 40 * 10 + V(stdShape({ kind: 'hexBolt', size: 'M6', length: 20 })), 1e-6);
  // Along +X: the head ends at x = 5 + k.
  f.axis = 'x';
  r = regenerate(part);
  const bolt = stdShape({ kind: 'hexBolt', size: 'M6', length: 20 });
  assert.ok(r.results.get(f.id).ok);
  near(bbox(r.body).hi[0], Math.max(20, 5 + HEX_BOLT.M6.k), 1e-4);
  near(bbox(r.body).lo[0], -20, 1e-4);
  // Merge joins it to the body.
  f.axis = 'z'; f.z = 0; f.merge = true;
  r = regenerate(part);
  assert.equal(countSolids(r.body), 1);
  assert.ok(V(r.body) < 40 * 40 * 10 + V(bolt));
  // A bad size is a rebuild error, not a crash.
  f.size = 'M7';
  r = regenerate(part);
  assert.equal(r.results.get(f.id).error, 'std-size');
});

test('fastener size for a hole: clearance, tapped, loose', () => {
  assert.deepEqual(fastenerSizeForHole(9), { size: 'M8', fit: 'clearance' });
  assert.deepEqual(fastenerSizeForHole(6.6), { size: 'M6', fit: 'clearance' });
  assert.deepEqual(fastenerSizeForHole(13.5), { size: 'M12', fit: 'clearance' });
  assert.deepEqual(fastenerSizeForHole(6.8, { blind: true }), { size: 'M8', fit: 'tapped' });
  assert.deepEqual(fastenerSizeForHole(6.8), { size: 'M6', fit: 'clearance' });
  assert.equal(fastenerSizeForHole(40).fit, 'loose');
  assert.equal(fastenerSizeForHole(2), null);
});

test('bolt length for a joint: through with washer and nut, or into a tapped hole', () => {
  // 10 mm plate, M8: washer 1.6 + nut 6.8 + 2 pitches 2.5 → 20.9 → 25.
  assert.equal(boltLengthFor('M8', 10, { washer: 1.6, nut: 6.8 }), 25);
  assert.equal(boltLengthFor('M8', 10), 12); // the shortest M8
  // Tapped hole 20 deep, no washer: the longest that does not bottom out (≤ 18.75) → 16.
  assert.equal(boltLengthFor('M8', 20, { blind: true }), 16);
});

test('defaults, designations, problems and mate references', () => {
  const d = stdDefaults('hexBolt');
  assert.equal(d.size, 'M8');
  assert.ok(boltLengths('M8').includes(d.length));
  assert.equal(designation({ kind: 'hexBolt', size: 'M8', length: 30 }), 'ISO 4017 M8×30');
  assert.equal(designation({ kind: 'ballBearing', size: '6204' }), '6204');
  assert.equal(designation({ kind: 'parallelKey', size: '8x7', length: 40 }), 'DIN 6885 A 8×7×40');
  assert.equal(designation({ kind: 'flange', dn: 'DN50' }), 'Flange DN50 PN16');
  assert.equal(stdDefaults('elbow90').dn, 'DN25');
  assert.equal(stdDefaults('spurGear').module, 2);
  assert.equal(stdProblem({ kind: 'spurGear', module: 2, teeth: 3, width: 10 }), 'std-gear');
  assert.equal(stdProblem({ kind: 'nope' }), 'std-unknown');
  const refs = stdMateRefs({ kind: 'hexNut', size: 'M8' });
  assert.deepEqual(refs.top, { kind: 'plane', point: [0, 0, 6.8], dir: [0, 0, 1] });
  assert.deepEqual(refs.bottom.dir, [0, 0, -1]);
});

test('smart fastener: a through hole and a blind tapped hole read from the kernel faces', async () => {
  const { holeOfFace, fastenerPlan } = await import('../../src/cad/fastener.js');
  const { isCylinder } = await import('../../src/cad/refs.js');
  const plate = R.makeBox([-30, -30, 0], [30, 30, 10]).cut(R.makeCylinder(4.5, 14, [5, 0, -2], [0, 0, 1]));
  const cylFace = plate.faces.find((f) => isCylinder(f.geomType));
  const hole = holeOfFace(cylFace, plate.faces);
  assert.ok(hole && hole.through && !hole.blind);
  near(hole.diameter, 9, 1e-6); near(hole.depth, 10, 1e-6);
  near(Math.abs(hole.axis.dir[2]), 1, 1e-9);
  const plan = fastenerPlan(hole, { washer: true, nut: true });
  assert.equal(plan.size, 'M8');
  assert.equal(plan.bolt.length, 25);
  assert.ok(plan.washer && plan.nut);
  // The bolt goes in from the top (+Z) face.
  near(hole.ends[plan.entry].centre[2], 10, 1e-6);
  near(hole.ends[plan.entry].normal[2], 1, 1e-9);
  // Blind tapped M8 hole, 15 deep in a 30 mm block: entry at the top, no nut, a bolt that does not bottom out.
  const block = R.makeBox([-30, -30, 0], [30, 30, 30]).cut(R.makeCylinder(3.4, 16, [0, 0, 15], [0, 0, 1]));
  const bf = block.faces.find((f) => isCylinder(f.geomType));
  const blind = holeOfFace(bf, block.faces);
  assert.ok(blind && blind.blind && !blind.through);
  const bp = fastenerPlan(blind, { washer: false, nut: true });
  assert.equal(bp.size, 'M8'); assert.equal(bp.fit, 'tapped'); assert.equal(bp.nut, null);
  assert.ok(bp.bolt.length <= 15);
  // A boss (outside of a cylinder) is not a hole.
  const boss = R.makeCylinder(5, 10);
  assert.equal(holeOfFace(boss.faces.find((f) => isCylinder(f.geomType)), boss.faces), null);
});
