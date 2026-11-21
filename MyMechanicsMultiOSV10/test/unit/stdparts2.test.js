// The larger standard parts catalogue against the standards: screws (ISO 10642 / 7380 / 4026 / 4029 / 4766,
// DIN 938 / 939), nuts (ISO 4033 / 4035 / 7040), pins (ISO 2338 / 8752), DIN 471 / 472 rings with their lugs,
// EN 1092-1 flange hub and raised face, gears with the generated root fillet (trochoid of the 0.38 m cutter
// tip) and the DIN 6885 keyway, helical and bevel gears, racks and DIN 7721 pulleys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  STD_ITEMS, STD_KINDS, stdShape, stdDefaults, designation, stdProblem, stdThreads, stdMateRefs, stdKey, sizeTable,
  COUNTERSUNK, BUTTON_HEAD, SET_SCREW, HEX_NUT, HEX_NUT2, THIN_NUT, NYLON_NUT, PARALLEL_PIN_C, SPRING_PIN, PIPES, KEYS,
  ringGeometry, studMetalEnd, studThreadLength, hubKeyway, helicalGeometry, bevelGeometry, pulleyGeometry, gearCircles, nutHeight, BEARING_BALLS, BEARINGS,
} from '../../src/cad/stdparts.js';
import { gearProfile, profilePolygon, toothSpaceFlank, rackOutline } from '../../src/cad/gears.js';
import { countSolids } from '../../src/cad/part-more.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-3, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≉ ${b}`);
const bbox = (s) => { const [lo, hi] = s.boundingBox.bounds; return { lo, hi, size: hi.map((v, i) => v - lo[i]) }; };
const vertexBox = (s) => { const ps = s.edges.flatMap((e) => [e.startPoint, e.endPoint]); const ax = (k) => ps.map((p) => p[k]); return { lo: ['x', 'y', 'z'].map((k) => Math.min(...ax(k))), hi: ['x', 'y', 'z'].map((k) => Math.max(...ax(k))) }; };
const polyArea = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };

test('every catalogue item builds with its defaults, has a designation, a size table and no problem', () => {
  for (const kind of STD_KINDS) {
    const p = stdDefaults(kind);
    assert.equal(stdProblem(p), null, kind);
    const s = stdShape(p);
    assert.ok(V(s) > 0, `${kind} volume`);
    assert.ok(designation(p).length > 2, kind);
    const [cols, rows] = sizeTable(kind);
    assert.ok(cols.length >= 2 && rows.length >= 3, `${kind} table`);
    if (STD_ITEMS[kind].threads) assert.ok(stdThreads(p).length >= 1, `${kind} threads`);
  }
  assert.equal(designation({ kind: 'countersunk', size: 'M6', length: 20 }), 'ISO 10642 M6×20');
  assert.equal(designation({ kind: 'nylonNut', size: 'M8' }), 'ISO 7040 M8');
  assert.equal(designation({ kind: 'helicalGear', module: 2, teeth: 30, helixAngle: 20, hand: 'left' }), 'Helical gear mn2 z30 β20° L');
  assert.equal(designation({ kind: 'boreRing', size: '30' }), 'DIN 472 30×1.2');
  assert.notEqual(stdKey({ ...stdDefaults('hexBolt'), threads: 'modelled' }), stdKey(stdDefaults('hexBolt')));
});

test('ISO 10642 countersunk M6×20: 90° head flush at z = 0 (dk), overall length L, socket', () => {
  const s = stdShape({ kind: 'countersunk', size: 'M6', length: 20 });
  const b = bbox(s);
  near(b.size[0], COUNTERSUNK.M6.dk, 1e-4); near(b.hi[2], 0, 1e-6); near(b.lo[2], -20, 1e-6);
  // The head cone: from dk at the top to d at k = (dk − d) / 2 below (90°).
  const k = (COUNTERSUNK.M6.dk - 6) / 2;
  near(k, COUNTERSUNK.M6.k, 0.02, 'head height of the table');
  assert.equal(stdMateRefs({ kind: 'countersunk', size: 'M6' }).bottom.point[2], 0);
});

test('ISO 7380 button head M8×16, set screws ISO 4026 / 4029 / 4766, DIN 938 / 939 studs', () => {
  const bh = bbox(stdShape({ kind: 'buttonHead', size: 'M8', length: 16 }));
  near(bh.size[0], BUTTON_HEAD.M8.dk, 1e-4); near(bh.hi[2], BUTTON_HEAD.M8.k, 1e-4); near(bh.lo[2], -16, 1e-6);
  for (const kind of ['setScrew', 'setScrewCup', 'setScrewSlotted']) {
    const s = stdShape({ kind, size: 'M6', length: 10 });
    const b = bbox(s);
    near(b.lo[2], -10, 1e-6, kind); near(b.hi[2], 0, 1e-6, kind); near(b.size[0], 6, 1e-4, kind);
    // Smaller than the plain cylinder by the point chamfer and the socket / slot (and the cup).
    assert.ok(V(s) < Math.PI * 9 * 10 * 0.97, kind);
  }
  assert.ok(V(stdShape({ kind: 'setScrewCup', size: 'M6', length: 10 })) < V(stdShape({ kind: 'setScrew', size: 'M6', length: 10 })), 'the cup removes material');
  assert.equal(SET_SCREW.M6.dp, 4);
  for (const kind of ['stud', 'stud939']) {
    const s = stdShape({ kind, size: 'M10', length: 40 });
    const b = bbox(s);
    near(b.lo[2], -studMetalEnd(kind, 'M10'), 1e-6, kind); near(b.hi[2], 40, 1e-6, kind);
    const th = stdThreads({ kind, size: 'M10', length: 40 });
    assert.equal(th.length, 2);
    near(th[0].length, studMetalEnd(kind, 'M10'), 1e-12); near(th[1].length, studThreadLength('M10', 40), 1e-12);
  }
  assert.equal(studMetalEnd('stud', 'M10'), 10); assert.equal(studMetalEnd('stud939', 'M10'), 12.5); assert.equal(studThreadLength('M10', 40), 26);
});

test('nuts ISO 4033 / 4035 / 7040: heights, the nylon insert a second solid; mate planes at the height', () => {
  near(bbox(stdShape({ kind: 'hexNut2', size: 'M10' })).size[2], HEX_NUT2.M10, 1e-4);
  near(bbox(stdShape({ kind: 'thinNut', size: 'M10' })).size[2], THIN_NUT.M10, 1e-4);
  const ny = stdShape({ kind: 'nylonNut', size: 'M10' });
  near(bbox(ny).size[2], NYLON_NUT.M10.h, 1e-4); near(bbox(ny).size[0], HEX_NUT.M10.s, 1e-4);
  assert.equal(countSolids(ny), 2);
  for (const k of ['hexNut', 'hexNut2', 'thinNut', 'nylonNut']) assert.equal(stdMateRefs({ kind: k, size: 'M10' }).top.point[2], nutHeight(k, 'M10'));
  // A nut's thread runs through its threaded height (the nylon nut: the hex part).
  near(stdThreads({ kind: 'nylonNut', size: 'M10' })[0].length, NYLON_NUT.M10.m, 1e-12);
});

test('pins: ISO 2338 exact volume with its chamfers; ISO 8752 slotted tube', () => {
  const d = 8; const L = 30; const c = PARALLEL_PIN_C[d]; const r = d / 2;
  const frustum = (Math.PI * c / 3) * (r * r + r * (r - c) + (r - c) ** 2);
  near(V(stdShape({ kind: 'parallelPin', size: '8', length: L })), Math.PI * r * r * (L - 2 * c) + 2 * frustum, 1e-6);
  const sp = stdShape({ kind: 'springPin', size: '8', length: L });
  const tube = Math.PI * (r * r - (r - SPRING_PIN[8].s) ** 2) * L;
  assert.ok(V(sp) < tube && V(sp) > tube * 0.85, `spring pin ${V(sp)} vs ${tube}`);
  near(bbox(sp).size[2], L, 1e-6);
});

test('DIN 471 / 472 rings: eccentric section (b at the back), lugs of height a with their d5 holes', () => {
  for (const kind of ['retainingRing', 'boreRing']) {
    const g = ringGeometry(kind, '30');
    const s = stdShape({ kind, size: '30' });
    const b = bbox(s);
    near(b.size[2], g.s, 1e-4, kind);
    // Back (−Y): the full radial width b.
    if (kind === 'retainingRing') near(-b.lo[1], g.r3 + g.b, 1e-3, '471 back');
    else near(b.size[0], g.d3, 1e-3, '472 free outside diameter');
    // Two d5 holes: circular edges of that radius (top and bottom of each).
    const holes = s.edges.filter((e) => e.geomType === 'CIRCLE' && Math.abs(R.measureLength(e) - Math.PI * g.d5) < 1e-6);
    assert.equal(holes.length, 4, `${kind} lug holes`);
    assert.equal(countSolids(s), 1, kind);
  }
  // 471 grips a shaft: the free inside diameter is less than the shaft; 472 sits in a bore.
  assert.ok(ringGeometry('retainingRing', '30').r3 * 2 < 30); assert.ok(ringGeometry('boreRing', '30').r3 * 2 > 30);
});

test('EN 1092-1 type 11 flange DN50: raised face d1 × f1, plate, hub fillet, weld end; exact volume by Pappus', () => {
  const p = PIPES.DN50; const f = p.flange;
  const s = stdShape({ kind: 'flange', dn: 'DN50' });
  const b = bbox(s);
  near(b.size[0], f.D, 1e-4); near(b.size[2], f.H, 1e-4);
  // The profile (with the R1 arc sampled finely) revolved: V = 2π ∫ r dA, less the bolt holes through the plate.
  const ri = p.od / 2 - p.wall; const zp = f.f1 + f.C;
  // The fillet: a quarter circle centred at (N/2 + R1, zp + R1) from (N/2 + R1, zp) to (N/2, zp + R1).
  const fil = []; for (let i = 0; i <= 400; i++) { const t = (Math.PI / 2) * (i / 400); fil.push([f.N / 2 + f.R1 - f.R1 * Math.sin(t), zp + f.R1 - f.R1 * Math.cos(t)]); }
  const poly = [[ri, 0], [f.d1 / 2, 0], [f.d1 / 2, f.f1], [f.D / 2, f.f1], [f.D / 2, zp], ...fil, [p.od / 2, f.H - f.H2], [p.od / 2, f.H], [ri, f.H]];
  let A = 0; let Ar = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i]; const [x2, y2] = poly[(i + 1) % poly.length]; const cr = x1 * y2 - x2 * y1; A += cr; Ar += (x1 + x2) * cr; }
  const revolved = Math.abs(Math.PI * Ar / 3);
  const holes = f.n * Math.PI * (f.L / 2) ** 2 * f.C;
  near(V(s), revolved - holes, 1e-5);
});

test('spur gear: the generated tooth — involute flank, trochoid root fillet, tooth thickness πm/2 at the pitch circle', () => {
  const m = 2; const z = 24; const rp = m * z / 2;
  const f = toothSpaceFlank({ rp, pitch: Math.PI * m, alpha: (20 * Math.PI) / 180, ha: m, hf: 1.25 * m, rho: 0.38 * m });
  assert.equal(f.undercut, false);
  near(f.rf, rp - 1.25 * m, 1e-12); near(f.ra, rp + m, 1e-12);
  // The space at the pitch circle is half the circular pitch (so is the tooth).
  const at = (curve, r) => { for (let i = 1; i < curve.length; i++) { const [r0, w0] = curve[i - 1]; const [r1, w1] = curve[i]; if ((r0 - r) * (r1 - r) <= 0) return w0 + ((w1 - w0) * (r - r0)) / (r1 - r0); } return NaN; };
  near(at(f.involute, rp), Math.PI / (2 * z), 1e-5, 'half space at rp');
  // The flank is the involute of the base circle above the form circle: inv(αr) − inv(α) offset.
  const inv = (a) => Math.tan(a) - a; const rb = rp * Math.cos((20 * Math.PI) / 180);
  for (const r of [rp - 0.6, rp + 0.5, rp + 0.9]) near(at(f.involute, r), Math.PI / z - (Math.PI / (2 * z) + inv((20 * Math.PI) / 180) - inv(Math.acos(rb / r))), 1e-5, `involute at r=${r}`);
  assert.ok(f.involute[0][0] > rb, 'the form circle is above the base circle');
  // The fillet runs from the root circle (tangent to it) up to the involute, inside the 0.38 m cutter round.
  near(f.fillet[0][0], f.rf, 1e-9); near(f.fillet.at(-1)[0], f.involute[0][0], 1e-9);
  for (let i = 1; i < f.fillet.length; i++) assert.ok(f.fillet[i][0] >= f.fillet[i - 1][0] - 1e-9, 'fillet runs outward');
  // The solid: area of the outline × width.
  const prof = gearProfile({ module: m, teeth: z });
  const area = polyArea(profilePolygon(prof));
  const s = stdShape({ kind: 'spurGear', module: m, teeth: z, width: 20, bore: 0 });
  near(V(s), area * 20, 2e-4);
  const c = gearCircles({ module: m, teeth: z });
  near(bbox(s).size[0], c.tip, 1e-3);
  // Few teeth: undercut, cut out of the involute.
  assert.equal(gearProfile({ module: m, teeth: 12 }).undercut, true);
});

test('gear keyway DIN 6885: bore 20 takes the 6×6 key, the hub groove width b to t2 above the bore', () => {
  const k = hubKeyway(20);
  assert.deepEqual(k, { key: '6x6', b: 6, t2: KEYS['6x6'].t2 });
  const plain = stdShape({ kind: 'spurGear', module: 2, teeth: 30, width: 15, bore: 20, keyway: false });
  const keyed = stdShape({ kind: 'spurGear', module: 2, teeth: 30, width: 15, bore: 20, keyway: true });
  // The rectangle b × (d/2 + t2) less the part of it inside the bore circle.
  const r = 10; const hb = k.b / 2;
  const F = (x) => x * Math.sqrt(r * r - x * x) / 2 + (r * r / 2) * Math.asin(x / r);
  const groove = k.b * (r + k.t2) - (F(hb) - F(-hb));
  near(V(plain) - V(keyed), groove * 15, 1e-5);
});

test('helical gear: transverse module mn / cos β, volume = transverse section × width; lead and twist', () => {
  const g = helicalGeometry({ module: 2, teeth: 20, width: 20, helixAngle: 15 });
  near(g.mt, 2 / Math.cos((15 * Math.PI) / 180), 1e-12);
  near(g.lead, (Math.PI * g.pitchDiameter) / Math.tan((15 * Math.PI) / 180), 1e-9);
  near(g.twist, (360 * 20) / g.lead, 1e-12);
  const s = stdShape({ kind: 'helicalGear', module: 2, teeth: 20, width: 20, bore: 0, helixAngle: 15, hand: 'right' });
  const prof = gearProfile({ module: g.mt, teeth: 20, pressureAngle: g.alphaT, ha: 2, hf: 2.5, rho: 0.76 });
  near(V(s), polyArea(profilePolygon(prof)) * 20, 5e-4);
  near(vertexBox(s).hi[2] - vertexBox(s).lo[2], 20, 1e-6);
  // Left and right hand: the same volume, mirrored.
  near(V(stdShape({ kind: 'helicalGear', module: 2, teeth: 20, width: 20, bore: 0, helixAngle: 15, hand: 'left' })), V(s), 1e-4);
});

test('straight bevel gear (90° shafts): pitch angle, outer tip diameter, teeth toward the apex', () => {
  const g = bevelGeometry({ module: 2, teeth: 20, mateTeeth: 40 });
  near(g.delta, Math.atan(0.5), 1e-12); near(g.Re, 20 / Math.sin(Math.atan(0.5)), 1e-12);
  near(g.tipDiameter, 40 + 4 * Math.cos(Math.atan(0.5)), 1e-12);
  const s = stdShape({ kind: 'bevelGear', module: 2, teeth: 20, mateTeeth: 40, width: 12, bore: 0 });
  near(vertexBox(s).hi[0] * 2, g.tipDiameter, 2e-3, 'outer tip');
  near(vertexBox(s).hi[2], 12 * Math.cos(g.delta), 1e-4, 'face width along the cone');
  assert.equal(countSolids(s), 1);
});

test('rack: the basic rack (pitch πm, flanks 20°, root fillets 0.38 m), length = teeth × πm', () => {
  const pts = rackOutline({ module: 2, count: 10, height: 20 });
  assert.equal(pts.filter((c) => c.r > 0).length, 20);
  near(pts.filter((c) => c.r > 0)[0].r, 0.76, 1e-12);
  const s = stdShape({ kind: 'gearRack', module: 2, teeth: 10, width: 15, height: 20 });
  const b = bbox(s);
  near(b.size[0], 10 * Math.PI * 2, 1e-4); near(b.hi[1], 2, 1e-4); near(b.lo[1], -20, 1e-4); near(b.size[2], 15, 1e-6);
  // Half the pitch is tooth at the pitch line: the volume lies between the sharp and the unrounded outline.
  const sharp = polyArea(pts.map((c) => c.p)) * 15;
  assert.ok(Math.abs(V(s) - sharp) < 0.02 * sharp);
});

test('DIN 7721 T5 pulley z20: outside diameter d0 − 2·PLD, 20 grooves', () => {
  const g = pulleyGeometry('T5', 20);
  near(g.d0, 100 / Math.PI, 1e-12); near(g.da, 100 / Math.PI - 0.85, 1e-12);
  const s = stdShape({ kind: 'timingPulley', size: 'T5', teeth: 20, width: 12, bore: 8 });
  const ring = (r) => s.edges.filter((e) => e.geomType === 'CIRCLE' && Math.abs(Math.hypot(e.startPoint.x, e.startPoint.y) - r) < 1e-6 && Math.abs(Math.hypot(e.endPoint.x, e.endPoint.y) - r) < 1e-6);
  assert.equal(ring(g.da / 2).length, 40, 'tip arcs on the outside circle, top and bottom');
  const bottoms = s.edges.filter((e) => e.geomType === 'CIRCLE' && Math.abs(Math.hypot(e.startPoint.x, e.startPoint.y) - (g.da / 2 - g.hg)) < 1e-6);
  assert.equal(bottoms.length, 40, 'a groove bottom arc top and bottom');
  assert.equal(stdProblem({ kind: 'timingPulley', size: 'T5', teeth: 20, width: 12, bore: 40 }), 'std-bore');
});

test('bearings: every size has its catalogue ball set that fits between the rings', () => {
  for (const [size, [count, Dw]] of Object.entries(BEARING_BALLS)) {
    const b = BEARINGS[size]; const dm = (b.d + b.D) / 2;
    assert.ok(Dw < b.B && Dw < (b.D - b.d) / 2, `${size} ball fits`);
    // The balls do not touch each other on the pitch circle.
    assert.ok(Math.PI * dm / count > Dw * 1.15, `${size} spacing`);
    assert.ok(count >= 7 && count <= 11, size);
  }
});
