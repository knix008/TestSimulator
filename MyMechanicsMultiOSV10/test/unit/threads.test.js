// ISO metric threads: the diameters against ISO 724 / ISO 965-1, the 60° profile, the cross-section area in
// closed form against numeric integration, the modelled solids (rod, nut, tapped hole, thread feature) by
// volume against the profile, screw symmetry (pitch and hand), cosmetic thread records and the global option,
// and the drawing representation (ISO 6410: thin lines, thread limit, three-quarter circle).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  isoThread, profileRadius, profilePieces, sectionArea, widthAtRadius, sectionWire, threadSolid, threadFrame, threadVolume,
  parseThreadSize, threadName, cosmeticThread, setModelledThreads, wantsModelled, COARSE_PITCH,
} from '../../src/cad/threads.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';
import { stdShape, stdThreads, METRIC, HEX_NUT } from '../../src/cad/stdparts.js';
import { drawingThreadMarks, threadDiameters } from '../../src/cad/drawing-threads.js';
import { drawingSvg, drawingDxf, viewBasis, projectView } from '../../src/cad/drawing.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} ≉ ${b}`);
const H = (P) => (Math.sqrt(3) / 2) * P;

// ───────────────────────── diameters and profile (no kernel)

test('ISO 724 basic dimensions: pitch, minor (D1) and ISO 965-1 external minor (d3) diameters', () => {
  // [size, P, d2, D1, d3] from the standard's tables (3 decimals).
  const table = [['M3', 0.5, 2.675, 2.459, 2.387], ['M6', 1, 5.350, 4.917, 4.773], ['M8', 1.25, 7.188, 6.647, 6.466], ['M10', 1.5, 9.026, 8.376, 8.160], ['M12', 1.75, 10.863, 10.106, 9.853], ['M16', 2, 14.701, 13.835, 13.546], ['M24', 3, 22.051, 20.752, 20.319]];
  for (const [name, P, d2, D1, d3] of table) {
    const { d, P: p } = parseThreadSize(name);
    assert.equal(p, P, `${name} coarse pitch`);
    assert.equal(METRIC[name].p, P, `${name} in the parts table`);
    const s = isoThread(d, p);
    near(s.d2, d2, 6e-4, `${name} d2`); near(s.d1, D1, 6e-4, `${name} D1`); near(s.d3, d3, 6e-4, `${name} d3`);
    near(s.H, H(P), 1e-12); near(s.rootRadius, H(P) / 6, 1e-12);
  }
  assert.deepEqual(parseThreadSize('M10x1.25'), { d: 10, P: 1.25 });
  assert.equal(parseThreadSize('UNC 1/4'), null);
  assert.equal(threadName(8, 1.25), 'M8'); assert.equal(threadName(10, 1.25), 'M10×1.25');
  assert.throws(() => isoThread(3, 2), /bad thread/);
  assert.equal(COARSE_PITCH[20], 2.5);
});

test('the profiles: 60° flanks, crest / root flats, half the pitch wide at the pitch diameter, external inside internal', () => {
  for (const [d, P] of [[3, 0.5], [8, 1.25], [24, 3]]) {
    const s = isoThread(d, P);
    for (const kind of ['external', 'internal']) {
      // Width of the material at the pitch diameter = P / 2 (the definition of d2).
      near(widthAtRadius(s, s.d2 / 2, kind), P / 2, 2e-3, `${kind} M${d} width at d2`);
      const pieces = profilePieces(s, kind);
      near(pieces.at(-1).z1 - pieces[0].z0, P, 1e-12, 'one pitch');
      // Flanks at 30° to the radial direction (60° included): |dr/dz| = √3.
      for (const p of pieces.filter((x) => x.kind === 'line')) near(Math.abs((p.r1 - p.r0) / (p.z1 - p.z0)), Math.sqrt(3), 1e-9, `${kind} flank slope`);
    }
    const ext = profilePieces(s, 'external'); const int = profilePieces(s, 'internal');
    near(ext[0].z1 - ext[0].z0, P / 8, 1e-12, 'external crest flat P/8'); near(int[2].z1 - int[2].z0, P / 4, 1e-12, 'internal crest flat P/4');
    near(int[2].r0, s.d1 / 2, 1e-12, 'internal crest at D1');
    // The external root arc: radius H/6, tangent to the flanks (continuous), bottom at d3/2.
    const arc = ext[2];
    near(arc.rho, H(P) / 6, 1e-12); near(arc.r((arc.z0 + arc.z1) / 2), s.d3 / 2, 1e-12);
    near(ext[1].r1, arc.r(arc.z0), 1e-12, 'flank meets arc');
    let maxR = 0; let minR = Infinity; let worst = -Infinity;
    for (let i = 0; i <= 4000; i++) {
      const z = (i / 4000) * P;
      const re = profileRadius(s, z, 'external'); const ri = profileRadius(s, z, 'internal');
      maxR = Math.max(maxR, re); minR = Math.min(minR, re); worst = Math.max(worst, re - ri);
    }
    near(maxR, d / 2, 1e-12); near(minR, s.d3 / 2, 1e-9);
    assert.ok(worst <= 1e-12, `external material inside the internal thread (no interference): ${worst}`);
  }
});

test('cross-section area in closed form equals the numeric integral π/P ∫ r² dz', () => {
  for (const [d, P] of [[4, 0.7], [10, 1.5], [16, 2]]) {
    const s = isoThread(d, P);
    for (const kind of ['external', 'internal']) {
      const N = 200000; let I = 0;
      for (let i = 0; i < N; i++) { const z = ((i + 0.5) / N) * P; I += profileRadius(s, z, kind) ** 2; }
      near(sectionArea(s, kind), (Math.PI / P) * I * (P / N), 1e-7, `M${d} ${kind}`);
    }
    // Between the minor and the major circle.
    assert.ok(sectionArea(s, 'external') < Math.PI * (d / 2) ** 2 && sectionArea(s, 'external') > Math.PI * (s.d3 / 2) ** 2);
  }
});

// ───────────────────────── modelled solids

test('the kernel cross-section has the analytic area (exact arcs, 1e-6 splines)', () => {
  const s = isoThread(8, 1.25);
  for (const kind of ['external', 'internal']) {
    const face = R.makeFace(sectionWire(s, kind, threadFrame([0, 0, 0], [0, 0, 1])));
    near(R.measureArea(face), sectionArea(s, kind), 1e-6, kind);
  }
});

test('modelled external thread M6: volume = section area × length; pitch and right hand (screw symmetry)', () => {
  const s = isoThread(6, 1);
  const L = 6;
  const rod = threadSolid(s, 'external', { origin: [0, 0, 0], dir: [0, 0, 1], length: L });
  near(V(rod), threadVolume(s, 'external', L), 1e-4, 'volume');
  // Probe just inside / outside the flank at two heights: the profile turns 360° per pitch, counter-clockwise
  // going up (right hand). A point at angle θ and height z sees the axial profile at z − Pθ/2π.
  const fr = threadFrame([0, 0, 0], [0, 0, 1]);
  const probe = (r, theta, z) => {
    const c = [0, 1, 2].map((k) => fr.x[k] * r * Math.cos(theta) + fr.y[k] * r * Math.sin(theta) + fr.z[k] * z);
    const e = 0.02;
    return V(rod.clone().intersect(R.makeBox(c.map((v) => v - e), c.map((v) => v + e)), { simplify: false })) > (2 * e) ** 3 * 0.5;
  };
  const rMid = s.d2 / 2;
  for (const [theta, z] of [[0, 3], [Math.PI / 2, 3.1], [Math.PI, 2.9]]) {
    const u = z - (s.P * theta) / (2 * Math.PI);
    const inside = profileRadius(s, u, 'external') > rMid + 0.05;
    const outside = profileRadius(s, u, 'external') < rMid - 0.05;
    if (inside) assert.equal(probe(rMid, theta, z), true, `material at θ=${theta.toFixed(2)} z=${z}`);
    if (outside) assert.equal(probe(rMid, theta, z), false, `no material at θ=${theta.toFixed(2)} z=${z}`);
  }
});

test('ISO 4032 M5 nut, modelled: removes exactly (internal section − π D1²/4) × m more than the cosmetic bore', () => {
  const s = isoThread(5, 0.8);
  const m = HEX_NUT.M5.m;
  const cosmetic = stdShape({ kind: 'hexNut', size: 'M5' }, { modelled: false });
  const modelled = stdShape({ kind: 'hexNut', size: 'M5' }, { modelled: true });
  near(V(cosmetic) - V(modelled), (sectionArea(s, 'internal') - Math.PI * (s.d1 / 2) ** 2) * m, 2e-4, 'thread volume');
  const [lo, hi] = modelled.boundingBox.bounds;
  near(hi[2] - lo[2], m, 1e-3, 'height');
  const [th] = stdThreads({ kind: 'hexNut', size: 'M5' }, { modelled: true });
  assert.equal(th.internal, true); assert.equal(th.modelled, true); near(th.minor, s.d1, 1e-12); near(th.length, m, 1e-12);
});

test('ISO 4762 M4×8 screw, modelled: same envelope, the thread lowers the volume by the profile (chamfered end)', () => {
  const cos = stdShape({ kind: 'socketCap', size: 'M4', length: 8 }, { modelled: false });
  const mod = stdShape({ kind: 'socketCap', size: 'M4', length: 8 }, { modelled: true });
  const s = isoThread(4, 0.7);
  const [th] = stdThreads({ kind: 'socketCap', size: 'M4', length: 8 });
  near(th.length, 8 - 2 * 0.7, 1e-12, 'thread to the head minus the runout');
  // Over the threaded length, the cylinder at d less the thread section (the chamfered end is common to both).
  const expect = (Math.PI * 2 * 2 - sectionArea(s, 'external')) * th.length;
  const diff = V(cos) - V(mod);
  assert.ok(diff > expect * 0.9 && diff < expect * 1.02, `thread volume ${diff} vs ${expect}`);
  const [a0, a1] = cos.boundingBox.bounds; const [b0, b1] = mod.boundingBox.bounds;
  near(b0[2], a0[2], 1e-3); near(b1[2], a1[2], 1e-3);
});

/** A 30 × 30 × 12 block (z 0 … 12) with one sketch point on its top face for a hole. */
function blockWithPoint() {
  const part = { id: 'p', name: 'P', features: [] };
  part.features.push({ id: 'imp', type: 'import', name: 'Imported1', brep: R.makeBox([-15, -15, 0], [15, 15, 12]).serialize() });
  const top = { kind: 'face', sig: null };
  const r0 = regenerate(part);
  const face = r0.body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 12) < 1e-6);
  top.sig = faceSignature(face);
  const sk = createFeature(part, 'sketch', { plane: { kind: 'face', sig: top.sig }, ...createSketchGeometry() });
  sk.entities.push({ id: 'h1', type: 'point', x: 0, y: 0 });
  part.features.push(sk);
  return { part, sketch: sk };
}

test('Hole Wizard tapped hole M8: tap drill, cosmetic thread record, modelled thread removes the profile', () => {
  const s = isoThread(8, 1.25);
  const build = (mode, through = false) => {
    const { part, sketch } = blockWithPoint();
    const f = createFeature(part, 'hole', { sketch: sketch.id, kind: 'tapped', threadSize: 'M8', diameter: 6.8, through, depth: 12, threadDepth: 10, threadMode: mode });
    part.features.push(f);
    const r = regenerate(part);
    assert.ok(r.results.get(f.id).ok, r.results.get(f.id).detail);
    return { r, res: r.results.get(f.id) };
  };
  const cos = build('cosmetic');
  const th = cos.res.thread;
  assert.ok(th && th.internal && !th.modelled);
  near(th.major, 8, 1e-12); near(th.minor, s.d1, 1e-12); near(th.length, 10, 1e-9); assert.equal(th.size, 'M8');
  near(Math.abs(th.dir[2]), 1, 1e-9); near(th.centre[2], 12, 1e-6);
  const mod = build('modelled');
  assert.equal(mod.res.thread.modelled, true);
  // The material between the drill (Ø6.8) and the internal profile over the thread depth.
  const rd = 3.4; const N = 100000; let I = 0;
  for (let i = 0; i < N; i++) { const z = ((i + 0.5) / N) * s.P; const r = profileRadius(s, z, 'internal'); if (r > rd) I += r * r - rd * rd; }
  near(V(cos.r.body) - V(mod.r.body), Math.PI * (I / N) * 10, 3e-4, 'thread volume');
  // A through tapped hole is threaded through the block.
  const thr = build('cosmetic', true);
  near(thr.res.thread.length, 12, 1e-3, 'through thread length');
});

test('a pattern of a tapped hole copies its threads (cosmetic records at every instance)', () => {
  const { part, sketch } = blockWithPoint();
  const hole = createFeature(part, 'hole', { sketch: sketch.id, kind: 'tapped', threadSize: 'M5', diameter: 4.2, through: false, depth: 10, threadDepth: 8, threadMode: 'cosmetic' });
  part.features.push(hole);
  const lp = createFeature(part, 'linearPattern', { seeds: [hole.id], direction: { kind: 'axis', axis: 'x' }, spacing: 8, count: 3 });
  const cp = createFeature(part, 'circularPattern', { seeds: [hole.id], axis: { kind: 'axis', axis: 'z' }, count: 4, angle: 360, equal: true });
  part.features.push(lp);
  let r = regenerate(part);
  assert.ok(r.results.get(lp.id).ok, r.results.get(lp.id).detail);
  const ts = r.results.get(lp.id).threads;
  assert.equal(ts.length, 2);
  assert.deepEqual(ts.map((t) => Math.round(t.centre[0])).sort((a, b) => a - b), [8, 16]);
  for (const t of ts) { near(t.length, 8, 1e-9); near(t.centre[2], 12, 1e-6); assert.equal(t.internal, true); }
  // A circular pattern about the hole's own axis puts the copies on it (turned): same centres, same thread.
  part.features.pop(); part.features.push(cp);
  r = regenerate(part);
  assert.equal(r.results.get(cp.id).threads.length, 3);
});

test('thread feature (ISO form): cosmetic record from the shaft, modelled external thread = (πR² − section) × L', () => {
  const make = (mode) => {
    const part = { id: 'p', name: 'P', features: [] };
    part.features.push({ id: 'imp', type: 'import', name: 'Imported1', brep: R.makeCylinder(5, 30, [0, 0, 0], [0, 0, 1]).serialize() });
    const body = regenerate(part).body;
    const edge = body.edges.find((e) => e.geomType === 'CIRCLE' && Math.abs(e.startPoint.z - 30) < 1e-6);
    const f = createFeature(part, 'thread', { edge: edgeSignature(edge), size: 'M10', pitch: 1.5, length: 12, mode });
    part.features.push(f);
    const r = regenerate(part);
    assert.ok(r.results.get(f.id).ok, `${mode}: ${r.results.get(f.id).detail}`);
    return { r, res: r.results.get(f.id) };
  };
  const s = isoThread(10, 1.5);
  const cos = make('cosmetic');
  assert.equal(cos.res.thread.internal, false); near(cos.res.thread.major, 10, 1e-9); near(cos.res.thread.minor, s.d3, 1e-12);
  near(V(cos.r.body), Math.PI * 25 * 30, 1e-6, 'cosmetic changes no geometry');
  const mod = make('modelled');
  near(Math.PI * 25 * 30 - V(mod.r.body), (Math.PI * 25 - sectionArea(s, 'external')) * 12, 2e-4, 'removed');
  // 'auto' follows the global option.
  setModelledThreads(false); assert.equal(wantsModelled('auto'), false); assert.equal(wantsModelled('modelled'), true);
  setModelledThreads(true); assert.equal(wantsModelled('auto'), true); assert.equal(wantsModelled('cosmetic'), false);
  setModelledThreads(false);
});

test('the stdPart feature follows the global modelled-threads option ("auto") and its own choice', () => {
  const run = (threads, global) => {
    setModelledThreads(global);
    const part = { id: 'p', name: 'P', features: [] };
    const f = createFeature(part, 'stdPart', { kind: 'thinNut', size: 'M3', threads });
    part.features.push(f);
    const r = regenerate(part);
    setModelledThreads(false);
    assert.ok(r.results.get(f.id).ok, r.results.get(f.id).detail);
    return { v: V(r.body), res: r.results.get(f.id) };
  };
  const a = run('auto', false); const b = run('auto', true); const c = run('cosmetic', true); const d = run('modelled', false);
  assert.equal(a.res.std.modelled, false); assert.equal(b.res.std.modelled, true); assert.equal(c.res.std.modelled, false); assert.equal(d.res.std.modelled, true);
  assert.ok(b.v < a.v); near(b.v, d.v, 1e-9); near(a.v, c.v, 1e-9);
  assert.equal(a.res.threads.length, 1);
});

// ───────────────────────── drawings

test('drawing marks (ISO 6410): side view thin minor lines and the limit, end view a three-quarter circle', () => {
  const ext = cosmeticThread({ centre: [0, 0, -30], dir: [0, 0, 1], length: 20, internal: false, d: 8, P: 1.25 });
  const s = isoThread(8, 1.25);
  const front = drawingThreadMarks([ext], { type: 'front' });
  assert.equal(front.thin.length, 2); assert.equal(front.thick.length, 1); assert.equal(front.hidden.length, 0);
  // The thin lines run at ±d3/2 across the sheet x (the axis is the sheet's y).
  const xs = front.thin.map((d) => Number(d.split(' ')[1]));
  near(Math.max(...xs), s.d3 / 2, 1e-4); near(Math.min(...xs), -s.d3 / 2, 1e-4);
  // Bottom view looks at the threaded end: a three-quarter circle of d3; the top view does not see it.
  const bottom = drawingThreadMarks([ext], { type: 'bottom' });
  assert.equal(bottom.thin.length, 1);
  const pts = bottom.thin[0].match(/-?\d+(\.\d+)?/g).map(Number);
  const radii = []; for (let i = 0; i < pts.length; i += 2) radii.push(Math.hypot(pts[i], pts[i + 1]));
  for (const r of radii) near(r, s.d3 / 2, 1e-3);
  assert.equal(drawingThreadMarks([ext], { type: 'top' }).thin.length, 0);
  // Pictorial views show nothing; modelled threads show nothing.
  assert.equal(drawingThreadMarks([ext], { type: 'iso' }).thin.length, 0);
  assert.equal(drawingThreadMarks([{ ...ext, modelled: true }], { type: 'front' }).thin.length, 0);
  // Internal (tapped hole from the top face down): hidden major lines in the side view, the circle from above.
  const int = cosmeticThread({ centre: [0, 0, 12], dir: [0, 0, -1], length: 10, internal: true, d: 8, P: 1.25 });
  const side = drawingThreadMarks([int], { type: 'front' });
  assert.equal(side.hidden.length, 3); assert.equal(side.thin.length, 0);
  assert.equal(drawingThreadMarks([int], { type: 'top' }).thin.length, 1);
  assert.deepEqual(threadDiameters({ internal: true, radius: 3.4, pitch: 1.25 }).minor, 6.8);
  assert.ok(viewBasis({ type: 'front' }));
});

test('drawing SVG and DXF carry the thread marks (thin lines, THREADS layer)', () => {
  const ext = cosmeticThread({ centre: [0, 0, -30], dir: [0, 0, 1], length: 20, internal: false, d: 8, P: 1.25 });
  const drawing = { id: 'd', name: 'D', source: { kind: 'part', id: 'p' }, sheet: 'A3', projection: 'third', scale: 1, autoScale: true, views: [{ id: 'v1', type: 'front' }], title: {}, annotations: [], bom: { show: false } };
  const shaft = R.makeCylinder(4, 30, [0, 0, -30], [0, 0, 1]);
  const p = projectView(shaft, 'front');
  const marks = drawingThreadMarks([ext], { type: 'front' });
  const projections = new Map([['v1', { ...p, threads: marks }]]);
  const svg = drawingSvg(drawing, projections);
  assert.equal((svg.match(/class="thread-line"/g) ?? []).length, 2);
  assert.equal((svg.match(/class="thread-limit"/g) ?? []).length, 1);
  const dxf = drawingDxf(drawing, projections);
  assert.match(dxf, /\nTHREADS\n/);
  assert.ok((dxf.match(/\n8\nTHREADS\n/g) ?? []).length >= 2);
});
