// Z up: every sample, built now, is the Y-up baseline (test/fixtures/samples-yup-baseline.json, measured before
// the switch) turned by R = +90° about X — same volumes and areas, boxes = R(old boxes), component placements
// R·M·Rᵀ, drawing views the same — and the document migration turns old files once (idempotent). Parts with
// modelled threads (basClevis, basCapScrew, hsgBottle) were re-measured on 2026-11-25 when every thread form became
// an exact screw solid (it had been a faceted groove); their boxes are the original ones.
// ZUP_ONLY=id1,id2 limits the samples (for quick runs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { SAMPLES, buildSample } from '../../src/cad/samples.js';
import { regenerate, STD_PLANES, createFeature, AXES } from '../../src/cad/features.js';
import { solveMates, placeShape, flattenAssembly, rotate, quatFromAxisAngle } from '../../src/cad/assembly.js';
import { projectView, VIEW_CAMERAS, viewBasis } from '../../src/cad/drawing.js';
import { createProject, createPart, normalizeProject, unpackProject, packProject } from '../../src/cad/document.js';
import { migrateProject, turnProject, turnOf } from '../../src/cad/zup.js';
import { toZUp, withYUp, isYUp, worldUp } from '../../src/cad/frame.js';
import { rotateXYZ } from '../../src/cad/part-more.js';

const baseline = JSON.parse(readFileSync(new URL('../fixtures/samples-yup-baseline.json', import.meta.url), 'utf8'));
const only = process.env.ZUP_ONLY ? new Set(process.env.ZUP_ONLY.split(',')) : null;
// OpenCASCADE's booleans and approximations are not bit-for-bit the same for a turned model; measures agree
// within this (relative) — seen up to 8e-5 on fillets, lofts and structural joints.
const REL = 2e-4;
/**
 * Parts whose old (Y-up) result came from a fragile boolean: cutting the ends off a helix sweep. Even in the old
 * frame the cut and the intersection disagree (8290 − common = 7955 vs the cut's 7838), so the baseline volume is
 * not a true value; the box must still match, the volume within FRAGILE_REL.
 */
const FRAGILE = new Set(['Compression spring (closed, ground ends)', 'Compression spring']);
const FRAGILE_REL = 0.08;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const nearVec = (a, b, tol, msg) => a.forEach((x, i) => near(x, b[i], tol, `${msg}[${i}]`));
/** R applied to an axis-aligned box [[lo], [hi]]: x stays, y′ = −z, z′ = y. */
const turnBox = ([lo, hi]) => [[lo[0], -hi[2], lo[1]], [hi[0], -lo[2], hi[1]]];
const s = Math.SQRT1_2;
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const turnQ = (q) => qmul(qmul([s, 0, 0, s], q), [-s, 0, 0, s]);
const sameRotation = (a, b, tol, msg) => {
  const d = Math.abs(a.reduce((sum, x, i) => sum + x * b[i], 0));
  assert.ok(1 - d <= tol, `${msg}: ${a} vs ${b}`);
};

await loadKernel();
const R = rep();

// ───────────────────────── the frame

test('standard planes are Z up', () => {
  assert.deepEqual(STD_PLANES.top.normal, [0, 0, 1]);
  assert.deepEqual(STD_PLANES.front.normal, [0, -1, 0]);
  assert.deepEqual(STD_PLANES.right.normal, [1, 0, 0]);
  assert.deepEqual(worldUp(), [0, 0, 1]);
  // The front and right planes' sketch y runs up.
  const yOf = (f) => [f.normal[1] * f.xDir[2] - f.normal[2] * f.xDir[1], f.normal[2] * f.xDir[0] - f.normal[0] * f.xDir[2], f.normal[0] * f.xDir[1] - f.normal[1] * f.xDir[0]];
  assert.deepEqual(yOf(STD_PLANES.front).map((v) => v + 0), [0, 0, 1]);
  assert.deepEqual(yOf(STD_PLANES.right).map((v) => v + 0), [0, 0, 1]);
  assert.deepEqual(yOf(STD_PLANES.top).map((v) => v + 0), [0, 1, 0]);
  // Drawing cameras: front from −Y, top from +Z, right from +X; the sheet's up is +Z in the side views.
  assert.deepEqual(VIEW_CAMERAS.front.dir, [0, -1, 0]);
  assert.deepEqual(VIEW_CAMERAS.top.dir, [0, 0, 1]);
  assert.deepEqual(VIEW_CAMERAS.right.dir, [1, 0, 0]);
  for (const v of ['front', 'right', 'back', 'left']) nearVec(viewBasis({ type: v }).y, [0, 0, 1], 1e-12, `${v} view up`);
  nearVec(viewBasis({ type: 'top' }).y, [0, 1, 0], 1e-12, 'top view up');
});

test('withYUp switches the tables and restores them', () => {
  const inside = withYUp(() => ({ yUp: isYUp(), top: [...STD_PLANES.top.normal], front: [...VIEW_CAMERAS.front.dir], up: worldUp() }));
  assert.equal(inside.yUp, true);
  assert.deepEqual(inside.top, [0, 1, 0]);
  assert.deepEqual(inside.front, [0, 0, 1]);
  assert.deepEqual(inside.up, [0, 1, 0]);
  assert.equal(isYUp(), false);
  assert.deepEqual(STD_PLANES.top.normal, [0, 0, 1]);
  assert.throws(() => withYUp(() => { throw new Error('x'); }));
  assert.equal(isYUp(), false);
  assert.deepEqual(STD_PLANES.top.normal, [0, 0, 1]);
});

test('new documents and new features are Z up', () => {
  const p = createProject({ name: 'P' });
  assert.equal(p.up, 'z');
  assert.equal(normalizeProject(JSON.parse(packProject(p))).up, 'z');
  const part = createPart('A');
  assert.deepEqual(createFeature(part, 'circularPattern').axis, { kind: 'axis', axis: 'z' });
  assert.equal(createFeature(part, 'moveBody').axis, 'z');
  assert.equal(createFeature(part, 'partingLine').dir, 'z');
  assert.equal(createFeature(part, 'refAxis').axis, 'z');
  // Inside the Y-up builders the defaults are the old ones.
  withYUp(() => {
    assert.deepEqual(createFeature(part, 'circularPattern').axis, { kind: 'axis', axis: 'y' });
    assert.equal(createFeature(part, 'moveBody').axis, 'y');
    assert.equal(createFeature(part, 'flex').toward, 'y');
    assert.deepEqual(createFeature(part, 'sketch3d').points, [[0, 0, 0], [50, 0, 0], [50, 50, 0], [50, 50, 50]]);
    assert.deepEqual(createFeature(part, 'tablePattern').points, [[30, 0, 0], [0, 0, 30]]);
  });
});

// ───────────────────────── migration of a hand-made old (Y-up) project

function legacyProject() {
  const q = quatFromAxisAngle([0, 1, 0], 30);
  return {
    format: 'mymechanics', version: 1, name: 'Old', units: 'mm',
    parts: [{
      id: 'p1', name: 'Old part',
      features: [
        { id: 's1', type: 'sketch', name: 'Sketch1', plane: { kind: 'std', name: 'front' }, entities: [{ id: 'e', type: 'point', x: 1, y: 2 }], constraints: [] },
        { id: 'f1', type: 'fillet', name: 'Fillet1', radius: 2, edges: [{ type: 'LINE', mid: [1, 2, 3], dir: [0, 1, 0], length: 4, start: [1, 0, 3], end: [1, 4, 3] }] },
        { id: 'c1', type: 'circularPattern', name: 'C', seeds: [], axis: { kind: 'axis', axis: 'z' }, count: 4, angle: 360, equal: true, reverse: false },
        { id: 'c2', type: 'circularPattern', name: 'C2', seeds: [], axis: { kind: 'axis', axis: 'y' }, count: 4, angle: 360, equal: true, reverse: false },
        { id: 'l1', type: 'linearPattern', name: 'L', seeds: [], direction: { kind: 'axis', axis: 'x' }, direction2: { kind: 'axis', axis: 'z' }, spacing: 5, count: 2, reverse: false, reverse2: false, spacing2: 5, count2: 2 },
        { id: 'm1', type: 'moveBody', name: 'M', dx: 1, dy: 2, dz: 3, axis: 'z', angle: 30, exprs: { dy: 'H', dz: 'W' } },
        { id: 'k1', type: 'sketch', name: 'Sk', plane: { kind: 'face', sig: { type: 'PLANE', center: [0, 5, 0], normal: [0, 1, 0], area: 10 }, origin: [0, 5, 0], xDir: [0, 0, 1] }, entities: [], constraints: [] },
        { id: 'cs', type: 'coordSys', name: 'CS', x: 0, y: 10, z: 0, rx: 10, ry: 20, rz: 30 },
        { id: 't1', type: 'tablePattern', name: 'T', seeds: [], points: [[0, 0, 30]], cs: null },
        { id: 't2', type: 'tablePattern', name: 'T2', seeds: [], points: [[0, 0, 30]], cs: 'cs' },
        { id: 'r1', type: 'refAxis', name: 'A', kind: 'std', axis: 'z', x1: 0, y1: 0, z1: 0, x2: 0, y2: 10, z2: 0 },
        { id: 'ts', type: 'toolingSplit', name: 'TS', dir: 'z', auto: false, height: 4 },
        { id: 'im', type: 'import', name: 'I', brep: 'x', source: 'a.step' },
      ],
      configurations: [{ id: 'cf', name: 'C', values: { 'm1.dy': 5, 'm1.angle': 10 } }],
    }],
    assemblies: [{
      id: 'a1', name: 'Asm',
      components: [{ id: 'cA', part: 'p1', name: 'A<1>', position: [1, 2, 3], rotation: q, fixed: true }],
      mates: [{ id: 'mt', type: 'lock', a: { comp: 'cA', kind: 'axis', point: [0, 1, 0], dir: [0, 1, 0], sig: { type: 'CYLINDRE', center: [0, 1, 0], normal: [1, 0, 0], area: 3 } }, b: { comp: 'cA' }, relative: { position: [0, 0, 5], rotation: q } }],
      explode: { steps: [{ id: 'x', comps: ['cA'], dir: [0, 1, 0], distance: 10 }], on: false },
      patterns: [{ id: 'pt', type: 'mirror', seeds: ['cA'], instances: [], plane: { point: [0, 0, 0], normal: [0, 0, 1] }, localAxes: { cA: 1 } }],
    }],
    drawings: [{ id: 'd1', name: 'D', source: { kind: 'part', id: 'p1' }, views: [{ id: 'v1', type: 'front' }, { id: 'v2', type: 'right', kind: 'section', plane: { point: [5, 0, 0], normal: [0, 0, 1] } }, { id: 'v3', type: 'custom', dir: [0, 1, 0], x: [1, 0, 0] }] }],
    camera: { target: [0, 10, 0], dir: [1, 1, 1], up: [0, 1, 0], distance: 300, ortho: true },
    lights: { lights: [{ id: 'L', kind: 'spot', position: [0, 100, 50], target: [0, 0, 0] }] },
  };
}

test('an old Y-up project is turned once when it is opened', () => {
  const old = legacyProject();
  const p = normalizeProject(structuredClone(old));
  assert.equal(p.up, 'z');
  const f = Object.fromEntries(p.parts[0].features.map((x) => [x.id, x]));
  assert.deepEqual(f.s1.plane, { kind: 'std', name: 'front' });
  assert.deepEqual(f.s1.entities, old.parts[0].features[0].entities);
  assert.deepEqual(f.f1.edges[0].mid, [1, -3, 2]);
  assert.deepEqual(f.f1.edges[0].dir, [0, 0, 1]);
  // Old z (toward the front viewer) is −Y now: the axis name and a reverse flag.
  assert.deepEqual(f.c1.axis, { kind: 'axis', axis: 'y' });
  assert.equal(f.c1.reverse, true);
  assert.deepEqual(f.c2.axis, { kind: 'axis', axis: 'z' });
  assert.equal(f.c2.reverse, false);
  assert.equal(f.l1.direction.axis, 'x'); assert.equal(f.l1.reverse, false);
  assert.equal(f.l1.direction2.axis, 'y'); assert.equal(f.l1.reverse2, true);
  // Move: the offset turned, the rotation about −Y written as −30° about Y; equations and configurations follow.
  assert.deepEqual([f.m1.dx, f.m1.dy, f.m1.dz], [1, -3, 2]);
  assert.equal(f.m1.axis, 'y'); assert.equal(f.m1.angle, -30);
  assert.deepEqual(f.m1.exprs, { dy: '-(W)', dz: 'H' });
  assert.deepEqual(p.parts[0].configurations[0].values, { 'm1.dz': 5, 'm1.angle': -10 });
  assert.deepEqual(f.k1.plane.origin, [0, 0, 5]);
  assert.deepEqual(f.k1.plane.xDir, [0, -1, 0]);
  assert.deepEqual(f.k1.plane.sig.normal, [0, 0, 1]);
  // The coordinate system's axes are the old ones turned by R.
  const axesOf = (c) => [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => rotateXYZ(v, c.rx, c.ry, c.rz));
  const oldCs = old.parts[0].features.find((x) => x.id === 'cs');
  axesOf(f.cs).forEach((a, i) => nearVec(a, toZUp(axesOf(oldCs)[i]), 1e-9, `cs axis ${i}`));
  assert.deepEqual([f.cs.x, f.cs.y, f.cs.z], [0, 0, 10]);
  assert.deepEqual(f.t1.points, [[0, -30, 0]]);
  assert.deepEqual(f.t2.points, [[0, 0, 30]], 'points in a coordinate system stay');
  assert.equal(f.r1.axis, '-y');
  assert.deepEqual([f.r1.x2, f.r1.y2, f.r1.z2], [0, 0, 10]);
  assert.equal(f.ts.dir, '-y'); assert.equal(f.ts.height, -4);
  assert.equal(f.im.turnX, 90);
  // Assembly: placements R·M·Rᵀ, references and captures turned.
  const a = p.assemblies[0]; const c = a.components[0];
  assert.deepEqual(c.position, [1, -3, 2]);
  const q0 = old.assemblies[0].components[0].rotation;
  for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) nearVec(rotate(c.rotation, toZUp(v)), toZUp(rotate(q0, v)), 1e-12, 'rotation');
  assert.deepEqual(a.mates[0].a.dir, [0, 0, 1]);
  assert.deepEqual(a.mates[0].a.sig.center, [0, 0, 1]);
  assert.deepEqual(a.mates[0].relative.position, [0, -5, 0]);
  assert.deepEqual(a.explode.steps[0].dir, [0, 0, 1]);
  assert.deepEqual(a.patterns[0].plane.normal, [0, -1, 0]);
  assert.equal(a.patterns[0].localAxes.cA, 2);
  // Drawing: the section plane and the auxiliary view turned; standard views keep their names.
  const d = p.drawings[0];
  assert.equal(d.views[0].type, 'front');
  assert.deepEqual(d.views[1].plane.normal, [0, -1, 0]);
  assert.deepEqual(d.views[2].dir, [0, 0, 1]);
  assert.deepEqual(p.camera.up, [0, 0, 1]);
  assert.deepEqual(p.lights.lights[0].position, [0, -50, 100]);
  // Opening it again changes nothing.
  const again = normalizeProject(JSON.parse(packProject(p)));
  const strip = (x) => { const o = JSON.parse(JSON.stringify(x)); delete o.saved; return o; };
  assert.deepEqual(strip(again), strip(p));
  assert.deepEqual(strip(unpackProject(packProject(again))), strip(p));
});

test('turning to Z up and back gives the old project', () => {
  const old = legacyProject();
  const p = turnProject(structuredClone(old), turnOf(1));
  turnProject(p, turnOf(-1));
  const clean = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 + 0 : v)));
  const back = clean(p);
  // The import keeps the turn it was given (0 net) and quaternions may come back as −q.
  back.parts[0].features.find((x) => x.id === 'im').turnX = undefined;
  const o = clean(old); o.parts[0].features.find((x) => x.id === 'im').turnX = undefined;
  back.assemblies[0].components[0].rotation = o.assemblies[0].components[0].rotation;
  back.assemblies[0].mates[0].relative.rotation = o.assemblies[0].mates[0].relative.rotation;
  const csB = back.parts[0].features.find((x) => x.id === 'cs'); const csO = o.parts[0].features.find((x) => x.id === 'cs');
  [csB.rx, csB.ry, csB.rz].forEach((v, i) => near(v, [csO.rx, csO.ry, csO.rz][i], 1e-7, 'euler'));
  [csB.rx, csB.ry, csB.rz] = [csO.rx, csO.ry, csO.rz];
  assert.deepEqual(back, o);
});

test('migrateProject leaves a Z-up project alone', () => {
  const p = { ...legacyProject(), up: 'z' };
  const before = JSON.stringify(p);
  assert.equal(JSON.stringify(migrateProject(p)), before);
  assert.deepEqual(AXES['-y'], [0, -1, 0]);
});

// ───────────────────────── every sample against the Y-up baseline

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const boxOf = (sh) => { const [lo, hi] = sh.boundingBox.bounds; return [lo.map(r6), hi.map(r6)]; };

for (const sample of SAMPLES) {
  if (only && !only.has(sample.id)) continue;
  test(`sample ${sample.id} is the Y-up baseline turned to Z up`, () => {
    const base = baseline[sample.id];
    assert.ok(base, 'baseline entry');
    const project = buildSample(sample.id, 'en');
    assert.equal(project.up, 'z');
    const bodies = new Map();
    for (const [i, part] of project.parts.entries()) {
      const b = base.parts[`${part.name}#${i}`];
      assert.ok(b, `baseline part ${part.name}`);
      const r = regenerate(part, { project });
      const failed = part.features.filter((f) => !r.results.get(f.id)?.ok).map((f) => `${f.name}: ${r.results.get(f.id)?.error} ${r.results.get(f.id)?.detail ?? ''}`);
      assert.deepEqual(failed, b.failed, `${part.name}: failed features`);
      bodies.set(part.id, r.body);
      const size = Math.max(1, ...b.box[1].map((x, k) => x - b.box[0][k]));
      const rel = FRAGILE.has(part.name) ? FRAGILE_REL : REL;
      near(R.measureVolume(r.body), b.volume, Math.max(1e-3, Math.abs(b.volume) * rel), `${part.name} volume`);
      near(R.measureArea(r.body), b.area, Math.max(1e-3, Math.abs(b.area) * rel), `${part.name} area`);
      const want = turnBox(b.box); const got = boxOf(r.body);
      const tol = Math.max(1e-3, size * 1e-4);
      nearVec(got[0], want[0], tol, `${part.name} box min`); nearVec(got[1], want[1], tol, `${part.name} box max`);
    }
    for (const [i, asm] of project.assemblies.entries()) {
      const b = base.assemblies[`${asm.name}#${i}`];
      assert.ok(b, `baseline assembly ${asm.name}`);
      const size = b.box ? Math.max(1, ...b.box[1].map((x, k) => x - b.box[0][k])) : 100;
      const check = (list, comps, what, tol) => comps.forEach((c, k) => {
        assert.equal(c.name, list[k].name);
        nearVec(c.position, toZUp(list[k].position), tol * size, `${what} ${c.name} position`);
        sameRotation(c.rotation, turnQ(list[k].rotation), tol, `${what} ${c.name} rotation`);
      });
      check(b.built, asm.components, 'built', 1e-6);
      const clone = structuredClone(asm);
      const solved = solveMates(clone, { size: 150 });
      assert.equal(solved.failed.length, b.failedMates, `${asm.name}: mates`);
      check(b.resolved, clone.components, 'solved', 1e-5);
      if (b.box) {
        const leaves = flattenAssembly(project, asm).filter((l) => bodies.get(l.part));
        const got = boxOf(R.makeCompound(leaves.map((l) => placeShape(bodies.get(l.part), l.placement))));
        const want = turnBox(b.box);
        nearVec(got[0], want[0], size * 1e-4 + 1e-3, `${asm.name} box min`); nearVec(got[1], want[1], size * 1e-4 + 1e-3, `${asm.name} box max`);
      }
    }
    for (const [i, d] of project.drawings.entries()) {
      const b = base.drawings[`${d.name}#${i}`];
      assert.ok(b, `baseline drawing ${d.name}`);
      let body;
      if (d.source.kind === 'assembly') {
        const src = project.assemblies.find((a) => a.id === d.source.id);
        body = R.makeCompound(flattenAssembly(project, src).map((leaf) => placeShape(bodies.get(leaf.part), leaf.placement)));
      } else body = bodies.get(d.source.id);
      for (const v of d.views) {
        if (v.kind === 'detail') continue;
        const want = b[v.id];
        const p = projectView(body, v.type, v);
        const size = Math.max(1, want.x1 - want.x0, want.y1 - want.y0);
        for (const k of ['x0', 'y0', 'x1', 'y1']) near(p.box[k], want[k], size * 1e-4 + 1e-3, `${d.name} view ${v.id} ${k}`);
        // The same view: the projected outline may split one curve differently (a seam), so ±2 paths.
        assert.ok(Math.abs(p.visible.length - want.lines) <= 2, `${d.name} view ${v.id} lines ${p.visible.length} vs ${want.lines}`);
      }
    }
  });
}
