// Mould analysis on the B-rep: the draft-zero curve traced on curved faces and split by the kernel, the
// undercut analysis with exact areas (silhouette pieces, exact shadows under overhangs, kernel rays for walls),
// which side of the mould forms each piece, and the parting loops (stepped and curved parts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { zeroCurves, silhouetteSplit, undercutBrep, partingLoops, moldSides, faceSamples, moldCacheStats, clearMoldCache, coneSilhouette, coneSilhouetteLines } from '../../src/cad/mold-brep.js';
import { partingSurfaceOf, coreCavity } from '../../src/cad/mold-more.js';
import { regenerate } from '../../src/cad/features.js';
import { ADVANCED_DEFAULTS } from '../../src/cad/advanced.js';
import { undercutAnalysis } from '../../src/cad/evaluate-more.js';
import { undercutCount } from '../../src/cad/mold-more.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const up = [0, 0, 1];
const box = (a, b) => R.makeBox(a, b);
const sideHole = () => box([-20, -10, 0], [20, 10, 10]).cut(R.makeCylinder(3, 60, [-30, 0, 5], [1, 0, 0]));
const rod = () => R.makeCylinder(5, 40, [0, 0, 0], [1, 0, 0]);

test('draft-zero curves: a side hole has two silhouette lines at y = ±r, found to the kernel’s precision', () => {
  const cyl = sideHole().faces.find((f) => f.geomType === 'CYLINDRE');
  const chains = zeroCurves(cyl, up);
  assert.equal(chains.length, 2);
  for (const c of chains) {
    const y = c[0].p[1];
    near(Math.abs(y), 3, 1e-9);
    for (const r of c) { near(r.p[1], y, 1e-9); near(r.p[2], 5, 1e-9); near(r.n[2], 0, 1e-9); }
    near(Math.abs(c.at(-1).p[0] - c[0].p[0]), 40, 1e-9);
  }
  // Planar faces and faces that never turn through the pull have none.
  assert.equal(zeroCurves(sideHole().faces.find((f) => f.geomType === 'PLANE'), up).length, 0);
  assert.equal(zeroCurves(R.makeCylinder(5, 10).faces.find((f) => f.geomType === 'CYLINDRE'), up).length, 0);
});

test('silhouette split: the curved face is cut at the draft-zero curve; pieces keep the area', () => {
  const body = rod();
  const sp = silhouetteSplit(body, up);
  assert.equal(sp.split, 1);
  const cyl = sp.faces.find((f) => f.face.geomType === 'CYLINDRE');
  assert.ok(cyl.pieces.length >= 2);
  near(cyl.pieces.reduce((s, p) => s + R.measureArea(p), 0), 2 * Math.PI * 5 * 40, 1e-6);
  // Every piece faces one way only.
  for (const p of cyl.pieces) {
    const zs = faceSamples(p, 5).map((r) => Math.sign(Math.round(r.n[2] * 1e9)));
    assert.ok(zs.every((z) => z === zs[0]), 'one side of the silhouette');
  }
  // Nothing to split along the rod's axis.
  assert.equal(silhouetteSplit(body, [1, 0, 0]).split, 0);
});

test('undercut on the B-rep: block, through hole, side hole (split, all undercut), pulled along the hole', () => {
  const block = box([-20, -10, 0], [20, 10, 10]);
  const plain = undercutBrep(block, up);
  assert.deepEqual(plain.counts, { cavity: 1, core: 1, straight: 4, undercut: 0 });
  const through = undercutBrep(block.clone().cut(R.makeCylinder(3, 30, [0, 0, -5], [0, 0, 1])), up);
  assert.equal(through.undercut, 0);
  const side = sideHole();
  const s = undercutBrep(side, up);
  assert.equal(s.undercut, 1);
  assert.equal(s.split, 1);
  const hole = side.faces.find((f) => f.geomType === 'CYLINDRE');
  const d = s.details.find((x) => x.hash === hole.hashCode);
  assert.equal(d.cls, 'undercut');
  assert.ok(d.pieces >= 2);
  near(d.fractions.undercut, 1, 1e-12);
  near(d.area, 2 * Math.PI * 3 * 40, 1e-6);
  assert.equal(undercutBrep(side, [1, 0, 0]).undercut, 0, 'pulled along the hole, it releases');
  // The Evaluate tool takes the body and runs this; the mould features count it.
  assert.equal(undercutAnalysis(side, up).faces.get(hole.hashCode), 'undercut');
  assert.equal(undercutCount(side, up), 1);
});

test('undercut fractions are exact: a rod lying across the pull is half cavity, half core', () => {
  const body = rod();
  const r = undercutBrep(body, up);
  const cyl = r.details.find((x) => x.pieces > 1);
  near(cyl.fractions.cavity, 0.5, 1e-9);
  near(cyl.fractions.core, 0.5, 1e-9);
  near(cyl.fractions.undercut, 0, 1e-12);
  assert.ok(cyl.exact);
  assert.equal(r.undercut, 0);
});

test('undercut shadows are exact: the part of a floor under an overhang', () => {
  // Floor z = 5 from x = 0 to 18 (a post at 18..20 holds a roof over x = 10..20 at z = 8..10).
  const body = box([0, 0, 0], [20, 10, 5]).fuse(box([18, 0, 5], [20, 10, 10])).fuse(box([10, 0, 8], [20, 10, 10]));
  const r = undercutBrep(body, up);
  const floor = body.faces.findIndex((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 5) < 1e-9 && f.normalAt().z > 0.5);
  const d = r.details.find((x) => x.index === floor);
  assert.equal(d.cls, 'undercut');
  assert.ok(d.exact);
  near(d.area, 180, 1e-9);
  near(d.fractions.undercut, 8 / 18, 1e-9);
  near(d.fractions.cavity, 10 / 18, 1e-9);
  // The roof's underside faces down and sees the floor: also an undercut, wholly (the floor is under all of it).
  const roof = body.faces.findIndex((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 8) < 1e-9);
  near(r.details.find((x) => x.index === roof).fractions.undercut, 1, 1e-9);
});

test('mould sides: walls under material belong to the core, outline walls to the cavity', () => {
  const step = box([0, 0, 0], [20, 20, 10]).fuse(box([20, 0, 5], [40, 20, 10]));
  const { pieces } = moldSides(step, up);
  const riser = pieces.find((p) => p.face.geomType === 'PLANE' && Math.abs(p.n[0] - 1) < 1e-9 && Math.abs(p.face.center.x - 20) < 1e-9);
  assert.equal(riser.side, 'core');
  const left = pieces.find((p) => Math.abs(p.n[0] + 1) < 1e-9);
  assert.equal(left.side, 'cavity');
  assert.equal(pieces.filter((p) => p.side === 'core').length, 3, 'the two bottoms and the riser');
});

test('parting loops: stepped bottom → one stepped loop; rod across the pull → equators and lower half circles', () => {
  const step = box([0, 0, 0], [20, 20, 10]).fuse(box([20, 0, 5], [40, 20, 10]));
  const pl = partingLoops(step, up);
  assert.equal(pl.loops.length, 1);
  const loop = pl.loops[pl.outer];
  assert.equal(loop.length, 8);
  const zs = loop.flatMap((r) => [r.edge.startPoint.z, r.edge.endPoint.z]).map((z) => Math.round(z * 1e9) / 1e9);
  assert.deepEqual([...new Set(zs)].sort((a, b) => a - b), [0, 5]);
  near(loop.reduce((s, r) => s + r.edge.length, 0), 20 + 20 + 20 + 20 + 20 + 20 + 5 + 5, 1e-9);
  const r = partingLoops(rod(), up);
  const lo = r.loops[r.outer];
  assert.equal(lo.length, 4);
  assert.equal(r.split, 1);
  const lines = lo.filter((x) => x.edge.geomType !== 'CIRCLE');
  assert.equal(lines.length, 2);
  for (const x of lines) for (const t of [0, 0.3, 0.7, 1]) { const p = x.edge.pointAt(t); near(p.z, 0, 1e-6); near(Math.abs(p.y), 5, 1e-6); }
  near(lo.reduce((s, x) => s + x.edge.length, 0), 2 * 40 + 2 * Math.PI * 5, 1e-5);
});

test('undercut on walls is exact: a back wall half under a roof and over a floor', () => {
  // A slot from the front (x 10..30, z 5..15, 10 deep) whose roof is cut away over x 20..30: the back wall
  // (y = 10) is blocked both ways for x 10..20 (10 × 10) and free upward for x 20..30 (10 × 15).
  const body = box([0, 0, 0], [40, 20, 20]).cut(box([10, -1, 5], [30, 10, 15])).cut(box([20, -1, 15], [30, 10, 21]));
  clearMoldCache();
  const r = undercutBrep(body, up);
  const back = body.faces.findIndex((f) => f.geomType === 'PLANE' && Math.abs(f.center.y - 10) < 1e-9 && f.normalAt().y < -0.5);
  const d = r.details.find((x) => x.index === back);
  assert.ok(d.exact, 'split by the shadow sweeps, not sampled');
  near(d.area, 250, 1e-9);
  near(d.fractions.undercut, 100 / 250, 1e-9);
  near(d.fractions.straight, 150 / 250, 1e-9);
  assert.equal(d.cls, 'undercut');
  // The slot's side wall at x = 10 is under the roof and over the floor all over: wholly an undercut.
  const side = body.faces.findIndex((f) => f.geomType === 'PLANE' && Math.abs(f.center.x - 10) < 1e-9 && f.normalAt().x > 0.5);
  near(r.details.find((x) => x.index === side).fractions.undercut, 1, 1e-9);
  // Outer walls are free both ways.
  const outer = body.faces.findIndex((f) => f.geomType === 'PLANE' && Math.abs(f.center.x) < 1e-9);
  near(r.details.find((x) => x.index === outer).fractions.straight, 1, 1e-9);
});

test('the B-rep analysis is cached per body and pull: Evaluate and the mold features of one rebuild reuse it', () => {
  const body = sideHole();
  clearMoldCache();
  const a = undercutBrep(body, up);
  assert.equal(moldCacheStats.hits, 0);
  const misses = moldCacheStats.misses;
  const b = undercutBrep(body.clone(), up);
  assert.equal(b, a, 'the same result object for the same kernel shape');
  assert.equal(moldCacheStats.hits, 1);
  assert.equal(moldCacheStats.misses, misses);
  assert.equal(undercutAnalysis(body, up), a, 'the Evaluate tool hits the cache too');
  assert.notEqual(undercutBrep(body, [1, 0, 0]), a, 'another pull is another analysis');
  // Another shape with the same look is not the same kernel shape: computed again.
  assert.notEqual(undercutBrep(sideHole(), up), a);
  // One rebuild: the parting line, the parting surface and the tooling split share the split and the analysis.
  clearMoldCache();
  const plate = box([0, 0, 0], [40, 20, 10]).cut(R.makeCylinder(4, 30, [20, 10, -10], [0, 0, 1]));
  const res = regenerate({ id: 'p', name: 'P', features: [
    { id: 'im', type: 'import', name: 'I', brep: plate.serialize() },
    { id: 'pl', type: 'partingLine', name: 'PL', dir: 'z' },
    { id: 'ps', type: 'partingSurface', name: 'PS', ...ADVANCED_DEFAULTS.partingSurface(), distance: 40 },
    { id: 'ts', type: 'toolingSplit', name: 'TS', ...ADVANCED_DEFAULTS.toolingSplit(), dir: 'z', gap: 0, margin: 10 },
  ] });
  for (const id of ['pl', 'ps', 'ts']) assert.equal(res.results.get(id).ok, true, `${id}: ${res.results.get(id).error ?? ''}`);
  assert.ok(moldCacheStats.hits >= 2, `cache hits in one rebuild: ${moldCacheStats.hits}`);
});

// A cone (base radius 10, height 40, apex up) tilted 30° about X, and a frustum tilted the same way.
const tiltedCone = () => R.draw([0, 0]).lineTo([10, 0]).lineTo([0, 40]).close().sketchOnPlane('XZ').revolve().rotate(30, [0, 0, 0], [1, 0, 0]);
const tiltedFrustum = () => R.draw([0, 0]).lineTo([10, 0]).lineTo([4, 30]).lineTo([0, 30]).close().sketchOnPlane('XZ').revolve().rotate(30, [0, 0, 0], [1, 0, 0]);
// The share of a cone's side facing up: n·d > 0 where cos(φ − ψ) > tan β (A·d) / |d across A| (A: apex → base).
const beta = Math.atan(10 / 40);
const upShare = Math.acos((Math.tan(beta) * -Math.cos(Math.PI / 6)) / Math.sin(Math.PI / 6)) / Math.PI;
const preciseVolume = (s) => { const oc = R.getOC(); const g = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s.wrapped, g, 1e-9, false, false); const v = Math.abs(g.Mass()); g.delete(); return v; };
const blockVol = (body, m) => { const [lo, hi] = body.boundingBox.bounds; return (hi[0] - lo[0] + 2 * m) * (hi[1] - lo[1] + 2 * m) * (hi[2] - lo[2] + 2 * m); };

test('cone silhouette: both generators through the apex on one plane', () => {
  const side = tiltedCone().faces.find((f) => f.geomType === 'CONE');
  const sl = coneSilhouetteLines(side, up);
  const apex = [0, -40 * Math.sin(Math.PI / 6), 40 * Math.cos(Math.PI / 6)];
  for (let k = 0; k < 3; k++) near(sl.apex[k], apex[k], 1e-9);
  near(sl.beta, beta, 1e-12);
  assert.equal(sl.gens.length, 2);
  // On the silhouette the cone's normal is square to the pull; the plane holds both generators.
  for (const g of sl.gens) {
    const p = sl.apex.map((x, i) => x + g[i] * 20);
    near(side.normalAt(p).normalize().z, 0, 1e-9);
    near(g[0] * sl.normal[0] + g[1] * sl.normal[1] + g[2] * sl.normal[2], 0, 1e-12);
  }
  assert.equal(coneSilhouette(side, null, up, 50).length, 1);
  // Seen along its own axis a cone faces one way all round: no split.
  const straight = R.draw([0, 0]).lineTo([10, 0]).lineTo([0, 40]).close().sketchOnPlane('XZ').revolve().faces.find((f) => f.geomType === 'CONE');
  assert.equal(coneSilhouette(straight, null, up, 50).length, 0);
});

test('tilted cone: split at the silhouette through the apex, undercut areas exact', () => {
  const body = tiltedCone();
  const sp = silhouetteSplit(body, up);
  assert.deepEqual(sp.failed, [], 'no face that needed a split was left whole');
  const cone = sp.faces.find((f) => f.face.geomType === 'CONE');
  assert.ok(cone.pieces.length >= 2 && !cone.unsplit);
  const r = undercutBrep(body, up, { cache: false });
  const side = r.details.find((x) => body.faces[x.index].geomType === 'CONE');
  assert.ok(side.exact);
  near(side.area, Math.PI * 10 * Math.hypot(10, 40), 1e-6);
  near(side.fractions.cavity, upShare, 1e-9);
  near(side.fractions.core, 1 - upShare, 1e-9);
  near(side.fractions.undercut, 0, 1e-12);
  const base = r.details.find((x) => body.faces[x.index].geomType === 'PLANE');
  near(base.fractions.core, 1, 1e-12);
  assert.equal(r.undercut, 0);
});

test('parting line over a tilted cone’s apex and on a tilted frustum; both part the block', () => {
  const cone = tiltedCone();
  const pl = partingLoops(cone, up, { cache: false });
  assert.deepEqual(pl.failed, []);
  const loop = pl.loops[pl.outer];
  const L = Math.hypot(10, 40);
  const lines = loop.filter((x) => x.edge.geomType === 'LINE');
  assert.equal(lines.length, 2, 'the two silhouette generators');
  for (const x of lines) near(x.edge.length, L, 1e-6);
  // The rest is the base circle on the side that faces up: 2π·10 · its share.
  // (the arc ends come from the kernel's fuzzy section: within 1e-4)
  near(loop.reduce((s, x) => s + x.edge.length, 0), 2 * L + 2 * Math.PI * 10 * upShare, 1e-4);
  for (const body of [cone, tiltedFrustum()]) {
    const ps = partingSurfaceOf(body, up, 30);
    assert.equal(ps.planar, false);
    const cc = coreCavity(body, { dir: up, surface: ps.surface, margin: 10 });
    const expect = blockVol(body, 10) - preciseVolume(body);
    assert.ok(Math.abs(preciseVolume(cc.core) + preciseVolume(cc.cavity) - expect) < expect * 1e-6, 'core + cavity = block − part');
  }
});

test('rays against the fine mesh give the kernel’s answer: hit, miss or (where unsure) the kernel itself', async () => {
  const { buildSample } = await import('../../src/cad/samples.js');
  const { rayCaster } = await import('../../src/cad/mold-brep.js');
  const project = buildSample('hsgCover', 'en');
  const part = project.parts[0];
  const upTo = part.features.findIndex((f) => f.type === 'toolingSplit');
  const body = regenerate({ ...part, features: part.features.slice(0, upTo) }, { project }).body;
  const R = rep();
  const [lo, hi] = body.boundingBox.bounds;
  const size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const L = size * 3 + 10;
  for (const d of [[0, 0, 1], [1, 0, 0]]) {
    const rays = rayCaster(body, d);
    const q = new R.DistanceQuery(body);
    try {
      // Points on the faces (just off them, as the analysis casts) and points scattered through the box.
      const pts = [];
      for (const face of body.faces) for (const r of faceSamples(face, 3, size)) pts.push(r.p.map((x, k) => x + r.n[k] * rays.eps));
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 300; i++) pts.push([0, 1, 2].map((k) => lo[k] + (hi[k] - lo[k]) * rnd()));
      let checked = 0;
      for (const p of pts) for (const side of [1, -1]) {
        const want = q.distanceTo(R.makeLine(p, p.map((x, k) => x + d[k] * side * L))) < rays.eps * 0.5;
        assert.equal(rays.blocked(p, side), want, `ray from ${p.map((x) => x.toFixed(3))} along ${side > 0 ? '+' : '−'}${JSON.stringify(d)}`);
        checked++;
      }
      assert.ok(checked > 600, `${checked} rays`);
    } finally { rays.delete(); q.delete(); }
  }
});
