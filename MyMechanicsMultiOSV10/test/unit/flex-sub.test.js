// Flexible sub-assemblies: the parts inside one are solved in the parent assembly (a parent mate moves a rod
// inside a cylinder sub-assembly), their places kept on the parent's component, and a motion study in the parent
// drives them too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { expandFlexible, flexInner, flexLeafPlacement, FLEX_SEP } from '../../src/cad/flex-sub.js';
import { solveMates, flattenAssembly, motionFrame, quatIdentity } from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const at = (position) => ({ position, rotation: quatIdentity() });
const plane = (comp, point, dir, extra = {}) => ({ comp, kind: 'plane', point, dir, ...extra });
const axis = (comp, point, dir, extra = {}) => ({ comp, kind: 'axis', point, dir, ...extra });

// The cylinder: a fixed body and a rod on its axis (free to slide along z and turn).
const cylinder = () => ({
  id: 'cyl', name: 'Cylinder',
  components: [{ id: 'body', part: 'pBody', fixed: true, ...at([0, 0, 0]) }, { id: 'rod', part: 'pRod', ...at([0, 0, 5]) }],
  mates: [{ id: 'm1', type: 'concentric', a: axis('rod', [0, 0, 0], [0, 0, 1]), b: axis('body', [0, 0, 0], [0, 0, 1]) }],
});
// The parent: a fixed bracket whose underside (z = 40 in its frame) the rod's top face (z = 0 in the rod) touches,
// the cylinder placed at x = 100.
const parentOf = (flexible) => ({
  id: 'top', name: 'Top',
  components: [
    { id: 'br', part: 'pBr', fixed: true, ...at([100, 0, 0]) },
    { id: 'S', sub: 'cyl', fixed: true, ...(flexible ? { flexible: true } : {}), ...at([100, 0, 0]) },
  ],
  mates: [{ id: 'pm', type: 'coincident', a: plane('S', [0, 0, 0], [0, 0, 1], { path: ['rod'] }), b: plane('br', [0, 0, 40], [0, 0, -1]) }],
});
const project = (top) => ({ parts: [], assemblies: [top, cylinder()] });
const entity = (ref) => ref;

test('rigid: the parent mate cannot move the rod (the fixed sub-assembly is one body) — the mate fails', () => {
  const top = parentOf(false);
  const prj = project(top);
  assert.equal(expandFlexible(top, prj), null);
  // The rigid sub-assembly referred to with a path: the entity in the component's frame (as the app gives it).
  const ent = (ref) => (ref.path ? { ...ref, point: [0, 0, 5] } : ref);
  const r = solveMates(top, { entity: ent });
  assert.deepEqual(r.failed, ['pm']);
});

test('flexible: the rod slides up to the bracket inside the sub-assembly; the body stays; the sub-assembly is unchanged', () => {
  const top = parentOf(true);
  const prj = project(top);
  const ex = expandFlexible(top, prj);
  assert.ok(ex);
  assert.deepEqual([...ex.virtual.keys()], [`S${FLEX_SEP}body`, `S${FLEX_SEP}rod`]);
  // Body: fixed with the fixed component; the sub-assembly's mate and the redirected parent mate act on virtuals.
  assert.equal(ex.assembly.components.find((c) => c.id === `S${FLEX_SEP}body`).fixed, true);
  assert.ok(ex.assembly.mates.some((m) => m.id === `S${FLEX_SEP}m1` && m.a.comp === `S${FLEX_SEP}rod`));
  const pm = ex.assembly.mates.find((m) => m.id === 'pm');
  assert.equal(pm.a.comp, `S${FLEX_SEP}rod`);
  assert.equal(pm.a.path, undefined);
  const r = solveMates(ex.assembly, { entity: ex.entity(entity) });
  assert.deepEqual(r.failed, []);
  ex.writeBack();
  const rod = top.components[1].flexPose.rod;
  near(rod.position[0], 0); near(rod.position[1], 0); near(rod.position[2], 40);
  near(top.components[1].flexPose.body.position[2], 0);
  // The sub-assembly document keeps its own placement.
  assert.deepEqual(prj.assemblies[1].components[1].position, [0, 0, 5]);
  // Everything that flattens the parent sees the moved rod.
  const leaves = flattenAssembly(prj, top);
  const rodLeaf = leaves.find((l) => l.part === 'pRod');
  near(rodLeaf.placement.position[0], 100); near(rodLeaf.placement.position[2], 40);
  assert.deepEqual(flexInner(top.components[1], prj.assemblies[1].components[1]).position.map((v) => Math.round(v * 1e6) / 1e6), [0, 0, 40]);
  // Fully defined? The rod can still turn about its axis: under defined.
  assert.equal(ex.status(r.status).get('S'), 'under');
});

test('a floating flexible sub-assembly: its fixed parts are locked to its frame, which a parent mate moves', () => {
  const top = parentOf(true);
  top.components[1].fixed = false;
  // The frame (whole sub-assembly) sits on the bracket's left face: the body's base plane z = 0 on plane z = -10.
  top.mates.push({ id: 'pf', type: 'coincident', a: plane('S', [0, 0, 0], [0, 0, -1], { path: ['body'] }), b: plane('br', [0, 0, -10], [0, 0, 1]) });
  const prj = project(top);
  const ex = expandFlexible(top, prj);
  assert.ok(ex.assembly.mates.some((m) => m.type === 'lock' && m.a.comp === 'S' && m.b.comp === `S${FLEX_SEP}body`));
  const r = solveMates(ex.assembly, { entity: ex.entity(entity) });
  assert.deepEqual(r.failed, []);
  ex.writeBack();
  // The frame moved down by 10 with the body; the rod reaches z = 40 in the world: 50 in the frame.
  near(top.components[1].position[2], -10, 1e-4);
  near(top.components[1].flexPose.body.position[2], 0, 1e-4);
  near(top.components[1].flexPose.rod.position[2], 50, 1e-4);
});

test('a motion study in the parent drives a part inside the flexible sub-assembly', () => {
  // A slider in the parent pushes the rod: the rod's top touches the slider's underside; the slider moves up 2 mm/s.
  const top = parentOf(true);
  top.components.push({ id: 'sl', part: 'pSl', ...at([100, 0, 40]) });
  top.mates = [
    { id: 'pm', type: 'coincident', a: plane('S', [0, 0, 0], [0, 0, 1], { path: ['rod'] }), b: plane('sl', [0, 0, 0], [0, 0, -1]) },
    { id: 'g', type: 'concentric', a: axis('sl', [0, 0, 0], [0, 0, 1]), b: axis('br', [0, 0, 0], [0, 0, 1]) },
  ];
  top.motion = { duration: 5, motors: [{ id: 'mo', comp: 'sl', kind: 'linear', speed: 2, ref: axis('sl', [0, 0, 0], [0, 0, 1]) }] };
  const prj = project(top);
  const ex = expandFlexible(top, prj);
  solveMates(ex.assembly, { entity: ex.entity(entity) });
  ex.writeBack();
  // Solved at rest: slider and rod meet (both free along z); from there the slider pushes the rod 6 mm in 3 s.
  const z0 = top.components[2].position[2];
  near(top.components[1].flexPose.rod.position[2], z0, 1e-4);
  const ex2 = expandFlexible(top, prj);
  const f = motionFrame(ex2.assembly, 3, { entity: ex2.entity(entity) });
  const rod = f.placements.get(`S${FLEX_SEP}rod`);
  near(rod.position[2], z0 + 6, 1e-4);
  // The leaf placement the view uses while playing.
  const leaf = flattenAssembly(prj, prj.assemblies[1], undefined, [], new Set(), top.components[1].flexPose).find((l) => l.part === 'pRod');
  const w = flexLeafPlacement(top.components[1], prj.assemblies[1], leaf, f.placements);
  near(w.position[0], 100, 1e-4); near(w.position[2], z0 + 6, 1e-4);
});
