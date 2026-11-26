// Parasolid XT export and import (src/cad/parasolid-brep.js). Every part is written, then checked twice:
//
//  - against the format reference itself, independently of the reader: each surface and curve is evaluated with the
//    parametric formulas printed in the reference (§5.2), and for every face the normal (natural normal × surface
//    sense × face sense) must point out of the material and the face must lie to the left of each loop (§4.3.7),
//    tested with a solid classifier on the original part; vertices must lie on their curves and surfaces; every edge
//    has two fins of opposite sense, the primary one positive and pointing at the edge's end (§5.3.9);
//  - by reading it back: the same volume, area, box and face count, as text and as neutral binary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { loadFullKernel, shapeFromBrep } from '../../src/cad/occt-full.js';
import { brepToXt, xtToBrep } from '../../src/cad/parasolid-brep.js';
import { readXt, NODE } from '../../src/cad/parasolid.js';
import { flatKnots, curvePoint, surfacePoint } from '../../src/cad/nurbs-eval.js';

await loadKernel();
const R = rep();
const oc = await loadFullKernel();

const PARTS = {
  'block with a bore, a boss and a spherical cap': () => R.makeBox([0, 0, 0], [60, 40, 20]).cut(R.makeCylinder(8, 40, [20, 20, -10], [0, 0, 1])).fuse(R.makeCylinder(10, 15, [45, 20, 20], [0, 0, 1])).fuse(R.makeSphere(10).translate([45, 20, 35])),
  'filleted cylinder (torus)': () => R.makeCylinder(10, 20).fillet(3),
  'filleted box (cylinders and sphere corners)': () => R.makeBox([0, 0, 0], [30, 20, 10]).fillet(2),
  'turned frustum (cones)': () => R.draw([0, 0]).lineTo([12, 0]).lineTo([5, 20]).lineTo([0, 20]).close().sketchOnPlane('XZ').revolve(),
  'turned Bezier profile (spun surface)': () => R.draw([0, 0]).lineTo([8, 0]).cubicBezierCurveTo([7, 26], [16, 8], [10, 24]).lineTo([0, 26]).close().sketchOnPlane('XZ').revolve(),
  'extruded spline outline': () => R.draw([0, 0]).lineTo([30, 0]).smoothSplineTo([24, 14]).smoothSplineTo([4, 18]).close().sketchOnPlane('XY').extrude(12),
  'ellipsoid (doubly curved B-spline)': () => R.makeEllipsoid(20, 12, 8),
  'hollow box (an inner void)': () => R.makeBox([0, 0, 0], [40, 40, 40]).cut(R.makeBox([10, 10, 10], [30, 30, 30])),
  'two separate solids': () => R.makeCompound([R.makeBox([0, 0, 0], [10, 10, 10]), R.makeCylinder(5, 10, [30, 0, 0], [0, 0, 1])]),
  // A chamfered hex (a nut's 30° chamfer): its flats cut the cone in hyperbolas, which XT has no curve for (an
  // unbounded OCCT curve, written as a B-spline over the edge).
  'chamfered hex (plane-cone hyperbolas)': () => R.draw([0, 0]).lineTo([12, 0]).lineTo([12, 8]).lineTo([9, 10]).lineTo([0, 10]).close().sketchOnPlane('XZ').revolve()
    .intersect(R.makeBox([-10.4, -12, -1], [10.4, 12, 11]).intersect(R.makeBox([-10.4, -12, -1], [10.4, 12, 11]).rotate(60, [0, 0, 0], [0, 0, 1])).intersect(R.makeBox([-10.4, -12, -1], [10.4, 12, 11]).rotate(120, [0, 0, 0], [0, 0, 1]))),
};

const facts = (s) => { const [lo, hi] = s.boundingBox.bounds; return { volume: R.measureVolume(s), area: R.measureArea(s), lo, hi, faces: s.faces.length }; };
const near = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);

// ——— the reference's formulas (metres) ———
const add = (a, b) => a.map((x, i) => x + b[i]); const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map((x) => x * k); const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a)); const len = (a) => Math.hypot(...a);

function nurbsOf(x, nurbs, surface) {
  const verts = x.nodes.get(nurbs.bspline_vertices).vertices; const dim = nurbs.vertex_dim;
  const split = (c) => (nurbs.rational ? { p: c.slice(0, dim - 1).map((v) => v / c[dim - 1]), w: c[dim - 1] } : { p: c, w: 1 });
  if (!surface) {
    const pts = []; const ws = [];
    for (let i = 0; i < nurbs.n_vertices; i++) { const s = split(verts.slice(i * dim, (i + 1) * dim)); pts.push(s.p); ws.push(s.w); }
    const flat = flatKnots(x.nodes.get(nurbs.knots).knots, x.nodes.get(nurbs.knot_mult).mult);
    return { at: (t) => curvePoint(nurbs.degree, flat, pts, nurbs.rational ? ws : null, t), range: [flat[nurbs.degree], flat[flat.length - 1 - nurbs.degree]] };
  }
  const nu = nurbs.n_u_vertices; const nv = nurbs.n_v_vertices; const P = []; const W = [];
  for (let i = 0; i < nu; i++) { const row = []; const wr = []; for (let j = 0; j < nv; j++) { const s = split(verts.slice((i * nv + j) * dim, (i * nv + j + 1) * dim)); row.push(s.p); wr.push(s.w); } P.push(row); W.push(wr); }
  const uf = flatKnots(x.nodes.get(nurbs.u_knots).knots, x.nodes.get(nurbs.u_knot_mult).mult);
  const vf = flatKnots(x.nodes.get(nurbs.v_knots).knots, x.nodes.get(nurbs.v_knot_mult).mult);
  return { at: (u, v) => surfacePoint(nurbs.u_degree, uf, nurbs.v_degree, vf, P, nurbs.rational ? W : null, u, v), range: [uf[nurbs.u_degree], uf[uf.length - 1 - nurbs.u_degree], vf[nurbs.v_degree], vf[vf.length - 1 - nurbs.v_degree]] };
}

/** R(u, v) of an XT surface node, as printed in the reference, and an inverse (point → u, v). */
function surfaceModel(x, s) {
  const frame = (A, X) => [X, cross(A, X)];
  switch (s.type) {
    case NODE.PLANE: { const [X, Y] = frame(s.normal, s.x_axis); return { R: (u, v) => add(s.pvec, add(mul(X, u), mul(Y, v))), inv: (q) => { const d = sub(q, s.pvec); return [dot(d, X), dot(d, Y)]; } }; }
    case NODE.CYLINDER: { const [X, Y] = frame(s.axis, s.x_axis); return { R: (u, v) => add(add(s.pvec, mul(add(mul(X, Math.cos(u)), mul(Y, Math.sin(u))), s.radius)), mul(s.axis, v)), inv: (q) => { const d = sub(q, s.pvec); return [Math.atan2(dot(d, Y), dot(d, X)), dot(d, s.axis)]; } }; }
    case NODE.CONE: { const [X, Y] = frame(s.axis, s.x_axis); const tan = s.sin_half_angle / s.cos_half_angle; return { R: (u, v) => add(sub(s.pvec, mul(s.axis, v)), mul(add(mul(X, Math.cos(u)), mul(Y, Math.sin(u))), s.radius + v * tan)), inv: (q) => { const d = sub(q, s.pvec); return [Math.atan2(dot(d, Y), dot(d, X)), -dot(d, s.axis)]; } }; }
    case NODE.SPHERE: { const [X, Y] = frame(s.axis, s.x_axis); return { R: (u, v) => add(s.centre, add(mul(add(mul(X, Math.cos(u)), mul(Y, Math.sin(u))), s.radius * Math.cos(v)), mul(s.axis, s.radius * Math.sin(v)))), inv: (q) => { const d = sub(q, s.centre); return [Math.atan2(dot(d, Y), dot(d, X)), Math.asin(Math.max(-1, Math.min(1, dot(d, s.axis) / s.radius)))]; } }; }
    case NODE.TORUS: { const [X, Y] = frame(s.axis, s.x_axis); const a = s.major_radius; const b = s.minor_radius; return { R: (u, v) => add(s.centre, add(mul(add(mul(X, Math.cos(u)), mul(Y, Math.sin(u))), a + b * Math.cos(v)), mul(s.axis, b * Math.sin(v)))), inv: (q) => { const d = sub(q, s.centre); const h = dot(d, s.axis); const rho = Math.hypot(dot(d, X), dot(d, Y)); return [Math.atan2(dot(d, Y), dot(d, X)), Math.atan2(h, rho - a)]; } }; }
    case NODE.B_SURFACE: {
      const m = nurbsOf(x, x.nodes.get(s.nurbs), true); const [u0, u1, v0, v1] = m.range;
      return { R: m.at, inv: (q) => invert2(m.at, q, u0, u1, v0, v1) };
    }
    case NODE.SWEPT_SURF: {
      // R(u, v) = C(u) + v D.
      const c = curveModel(x, x.nodes.get(s.section)); const D = s.sweep;
      const flat = (q, u) => { const d = sub(q, c.C(u)); return sub(d, mul(D, dot(d, D))); };
      return { R: (u, v) => add(c.C(u), mul(D, v)), inv: (q) => { const u = argmin((u) => len(flat(q, u)), c.range); return [u, dot(sub(q, c.C(u)), D)]; } };
    }
    case NODE.SPUN_SURF: {
      // R(u, v) = Z(u) + (C(u) − Z(u)) cos v + A × (C(u) − Z(u)) sin v, Z(u) the projection of C(u) on the axis.
      const c = curveModel(x, x.nodes.get(s.profile)); const A = s.axis;
      const Z = (p) => add(s.base, mul(A, dot(sub(p, s.base), A)));
      const R2 = (u, v) => { const p = c.C(u); const z = Z(p); const r = sub(p, z); return add(z, add(mul(r, Math.cos(v)), mul(cross(A, r), Math.sin(v)))); };
      const rh = (p) => [len(sub(p, Z(p))), dot(sub(p, s.base), A)];
      return {
        R: R2,
        inv: (q) => {
          const [rq, hq] = rh(q);
          const u = argmin((u) => { const [r, h] = rh(c.C(u)); return Math.hypot(r - rq, h - hq); }, c.range);
          const a = sub(c.C(u), Z(c.C(u))); const b = sub(q, Z(q));
          return [u, Math.atan2(dot(A, cross(a, b)), dot(a, b))];
        },
      };
    }
    default: throw new Error(`no reference formula for surface type ${s.type}`);
  }
}
/** The t in [t0, t1] where f is least: sampling, then a narrowing search. */
function argmin(f, [t0, t1]) {
  let bt = t0; let bd = Infinity;
  for (let i = 0; i <= 400; i++) { const t = t0 + ((t1 - t0) * i) / 400; const d = f(t); if (d < bd) { bd = d; bt = t; } }
  let lo = Math.max(t0, bt - (t1 - t0) / 400); let hi = Math.min(t1, bt + (t1 - t0) / 400);
  for (let k = 0; k < 80; k++) { const a = lo + (hi - lo) / 3; const b = hi - (hi - lo) / 3; if (f(a) < f(b)) hi = b; else lo = a; }
  return (lo + hi) / 2;
}
/** Closest (u, v): a grid, then Gauss–Newton on finite differences. */
function invert2(f, q, u0, u1, v0, v1) {
  let best = [u0, v0]; let bd = Infinity;
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) { const u = u0 + ((u1 - u0) * i) / 40; const v = v0 + ((v1 - v0) * j) / 40; const d = len(sub(f(u, v), q)); if (d < bd) { bd = d; best = [u, v]; } }
  let [u, v] = best; const hu = (u1 - u0) * 1e-6; const hv = (v1 - v0) * 1e-6;
  for (let k = 0; k < 30; k++) {
    const p = f(u, v); const r = sub(q, p);
    const du = mul(sub(f(u + hu, v), f(u - hu, v)), 1 / (2 * hu)); const dv = mul(sub(f(u, v + hv), f(u, v - hv)), 1 / (2 * hv));
    const a = dot(du, du); const b = dot(du, dv); const c = dot(dv, dv); const det = a * c - b * b; if (!(Math.abs(det) > 1e-30)) break;
    const g1 = dot(du, r); const g2 = dot(dv, r);
    u = Math.min(u1, Math.max(u0, u + (c * g1 - b * g2) / det)); v = Math.min(v1, Math.max(v0, v + (a * g2 - b * g1) / det));
  }
  return [u, v];
}
/** Natural normal of a surface at the point nearest q: R_u × R_v. */
function naturalNormal(m, q) {
  const [u, v] = m.inv(q); const h = 1e-6;
  return norm(cross(sub(m.R(u + h, v), m.R(u - h, v)), sub(m.R(u, v + h), m.R(u, v - h))));
}
/** C(t) of an XT curve node, as printed, an inverse, and its period (or 0). */
function curveModel(x, c) {
  switch (c.type) {
    case NODE.LINE: return { C: (t) => add(c.pvec, mul(c.direction, t)), inv: (q) => dot(sub(q, c.pvec), c.direction), period: 0, range: [-1, 1] };
    case NODE.CIRCLE: case NODE.ELLIPSE: {
      const X = c.x_axis; const Y = cross(c.normal, X); const a = c.radius ?? c.major_radius; const b = c.radius ?? c.minor_radius;
      return { C: (t) => add(c.centre, add(mul(X, a * Math.cos(t)), mul(Y, b * Math.sin(t)))), inv: (q) => { const d = sub(q, c.centre); return Math.atan2(dot(d, Y) / b, dot(d, X) / a); }, period: 2 * Math.PI, range: [-Math.PI, Math.PI] };
    }
    case NODE.B_CURVE: {
      const m = nurbsOf(x, x.nodes.get(c.nurbs), false); const [t0, t1] = m.range;
      const inv = (q) => { let bt = t0; let bd = Infinity; for (let i = 0; i <= 400; i++) { const t = t0 + ((t1 - t0) * i) / 400; const d = len(sub(m.at(t), q)); if (d < bd) { bd = d; bt = t; } } let lo = Math.max(t0, bt - (t1 - t0) / 400); let hi = Math.min(t1, bt + (t1 - t0) / 400); for (let k = 0; k < 60; k++) { const a = lo + (hi - lo) / 3; const b = hi - (hi - lo) / 3; if (len(sub(m.at(a), q)) < len(sub(m.at(b), q))) hi = b; else lo = a; } return (lo + hi) / 2; };
      return { C: m.at, inv, period: x.nodes.get(c.nurbs).periodic ? t1 - t0 : 0, range: [t0, t1] };
    }
    default: throw new Error(`no reference formula for curve type ${c.type}`);
  }
}

/** Every check against the reference for one written part; returns counts for the report. */
function checkAgainstReference(x, solid) {
  const N = x.nodes; const nodesOf = (t) => [...N.values()].filter((n) => n.type === t);
  const classify = (p) => { const c = new oc.BRepClass3d_SolidClassifier_3(solid, new oc.gp_Pnt_3(p[0] * 1000, p[1] * 1000, p[2] * 1000), 1e-6); const s = c.State(); c.delete(); return s; };
  const IN = oc.TopAbs_State.TopAbs_IN; const OUT = oc.TopAbs_State.TopAbs_OUT;
  const ids = new Set();
  for (const n of N.values()) if (n.node_id) { assert.ok(!ids.has(n.node_id), `node id ${n.node_id} used twice`); ids.add(n.node_id); }
  assert.equal(x.root.highest_node_id, Math.max(...ids), 'the body records the highest node id');
  // Regions: one infinite void region first, solid regions after it.
  const regions = []; for (let r = x.root.region; r; r = N.get(r).next) regions.push(N.get(r));
  assert.equal(regions[0].region_type, 'V', 'the first region is the infinite void');
  assert.ok(regions.some((r) => r.region_type === 'S'), 'a solid region');
  // Edges: two fins of opposite sense; the primary is positive and points at the end vertex.
  for (const e of nodesOf(NODE.EDGE)) {
    const p = N.get(e.halfedge); const o = N.get(p.other);
    assert.equal(p.sense, '+', 'primary fin positive'); assert.equal(o.sense, '-');
    assert.equal(o.other, p.index, 'two fins ring round the edge');
    assert.ok(p.loop && o.loop, 'both fins in loops (a solid has no dummy fins)');
    const c = curveModel(x, N.get(e.curve));
    for (const v of [p.vertex, o.vertex]) { const q = N.get(N.get(v).point).pvec; assert.ok(len(sub(c.C(c.inv(q)), q)) < 1e-9, 'vertex on its edge curve'); }
  }
  // Faces: normal out of the material, face on the left of each loop.
  let checked = 0;
  for (const f of nodesOf(NODE.FACE)) {
    const surf = N.get(f.surface); const m = surfaceModel(x, surf);
    const sign = (surf.sense === '-' ? -1 : 1) * (f.sense === '-' ? -1 : 1);
    for (let l = f.loop; l; l = N.get(l).next) {
      let h = N.get(l).halfedge; const first = h; let guard = 0;
      do {
        const fin = N.get(h); const e = N.get(fin.edge); const cnode = N.get(e.curve); const c = curveModel(x, cnode);
        const q = N.get(N.get(fin.vertex).point).pvec;
        assert.ok(len(sub(m.R(...m.inv(q)), q)) < 1e-9, 'loop vertex on the face surface');
        // The middle of the edge, the fin's direction there, and a step to its left on the face.
        const ends = [N.get(N.get(e.halfedge).other).vertex, N.get(e.halfedge).vertex].map((v) => N.get(N.get(v).point).pvec);
        let t0 = c.inv(ends[0]); let t1 = c.inv(ends[1]);
        const along = cnode.sense === '-' ? -1 : 1;
        if (c.period) { if (along > 0) { while (t1 <= t0 + 1e-12) t1 += c.period; } else { while (t1 >= t0 - 1e-12) t1 -= c.period; } }
        const tm = (t0 + t1) / 2; const M = c.C(tm);
        const T = mul(norm(sub(c.C(tm + 1e-6), c.C(tm - 1e-6))), along * (fin.sense === '-' ? -1 : 1));
        const n = mul(naturalNormal(m, M), sign);
        const side = norm(cross(n, T));
        const onFace = m.R(...m.inv(add(M, mul(side, 1e-5))));
        const nn = mul(naturalNormal(m, onFace), sign);
        assert.equal(classify(sub(onFace, mul(nn, 2e-6))), IN, `material behind face ${f.node_id} (type ${surf.type}), left of its loop`);
        assert.equal(classify(add(onFace, mul(nn, 2e-6))), OUT, `void in front of face ${f.node_id} (type ${surf.type})`);
        checked++;
        h = fin.forward;
      } while (h !== first && ++guard < 10000);
    }
  }
  return checked;
}

for (const [name, make] of Object.entries(PARTS)) {
  test(`Parasolid XT: ${name} — written as the reference describes, read back the same`, async () => {
    const s = make(); const want = facts(s);
    const text = await brepToXt(s.serialize(), { file: 'part.x_t' });
    const x = readXt(text);
    assert.equal(x.root.type, NODE.BODY); assert.equal(x.root.body_type, 1, 'a solid body');
    const solid = shapeFromBrep(oc, s.serialize());
    const checked = checkAgainstReference(x, solid);
    assert.ok(checked >= want.faces, `${checked} fin checks for ${want.faces} faces`);
    for (const [label, data] of [['text', text], ['binary', await brepToXt(s.serialize(), { binary: true })]]) {
      const back = await xtToBrep(data);
      assert.equal(back.failed, 0, `${label}: every face built`);
      const got = facts(R.deserializeShape(back.brep));
      near(got.volume, want.volume, 1e-6, `${label} volume`); near(got.area, want.area, 1e-6, `${label} area`);
      for (let k = 0; k < 3; k++) { near(got.lo[k], want.lo[k], 1e-6, `${label} box`); near(got.hi[k], want.hi[k], 1e-6, `${label} box`); }
      assert.equal(got.faces, want.faces, `${label} faces`);
      assert.equal(back.solids, s.solids?.length ?? (name.startsWith('two') ? 2 : 1), `${label} solids`);
    }
  });
}

test('other schemas: a part in the V31 plain layout (as an Inventor 2020 file) and in embedded schemas reads back the same', async () => {
  const s = PARTS['block with a bore, a boss and a spherical cap'](); const want = facts(s);
  const { XT_LAYOUTS } = await import('../../src/cad/parasolid.js');
  // V31: a 34-field body and an 8-field region, no layouts in the file — the reader must find them.
  const v31 = { 12: XT_LAYOUTS.variant(12, 31000), 19: XT_LAYOUTS.variant(19, 30000) };
  const files = {
    'V31 text': await brepToXt(s.serialize(), { key: 'SCH_3100154_31001', modeller: ': TRANSMIT FILE created by modeller version 3100154', layouts: v31 }),
    'V31 binary': await brepToXt(s.serialize(), { key: 'SCH_3100154_31001', layouts: v31, binary: true }),
    'embedded, base layouts (255)': await brepToXt(s.serialize(), { embedded: true }),
    'embedded, V31 layouts as edits': await brepToXt(s.serialize(), { embedded: true, key: 'SCH_3100154_31001_13006', layouts: v31 }),
    'embedded binary': await brepToXt(s.serialize(), { embedded: true, key: 'SCH_3100154_31001_13006', layouts: v31, binary: true }),
  };
  for (const [label, data] of Object.entries(files)) {
    const x = readXt(data);
    assert.equal(x.root.type, NODE.BODY, label);
    if (label.startsWith('V31')) assert.ok('mesh_offset_data' in x.root && 'lowest_node_id' in x.root, `${label}: read with the V31 body layout`);
    const back = await xtToBrep(data);
    const got = facts(R.deserializeShape(back.brep));
    near(got.volume, want.volume, 1e-6, `${label} volume`); assert.equal(got.faces, want.faces, `${label} faces`);
  }
  assert.match(files['embedded, V31 layouts as edits'], /SCH_3100154_31001_13006255 0/, 'the key, the highest node type, no user fields');
});

test('the hollow box keeps its inner void as a void region of its own', async () => {
  const x = readXt(await brepToXt(PARTS['hollow box (an inner void)']().serialize()));
  const regions = []; for (let r = x.root.region; r; r = x.nodes.get(r).next) regions.push(x.nodes.get(r).region_type);
  assert.deepEqual(regions.sort(), ['S', 'V', 'V'], 'the infinite void, the solid and the cavity');
});

test('a file in metres: a 60 mm block measures 0.06', async () => {
  const x = readXt(await brepToXt(R.makeBox([0, 0, 0], [60, 40, 20]).serialize()));
  const xs = [...x.nodes.values()].filter((n) => n.type === NODE.POINT).map((n) => n.pvec[0]);
  assert.ok(Math.abs(Math.max(...xs) - 0.06) < 1e-12, `largest x ${Math.max(...xs)}`);
  assert.equal(x.root.res_size, 1000); assert.equal(x.root.res_linear, 1e-8);
});

test('the format reference example (a sheet circle) is read as a face', async () => {
  const example = 'T51 : TRANSMIT FILE created by modeller version 120000017 SCH_1200000_120060 12 1 12 0 2 0 0 0 0 1e3 1e-8 0 0 0 1 0 3 1 3 4 5 0 6 7 0 70 2 0 1 0 0 4 1 20 8 8 8 1 T13 3 3 0 1 0 9 0 0 6 9 50 4 11 0 9 0 0 0 +0 0 0 0 0 1 1 0 0 31 5 10 0 7 0 0 0 +0 0 0 0 0 1 1 0 0 1 19 6 5 0 1 0 0 3 V16 7 6 0 ?10 0 0 5 0 0 1 17 10 0 11 10 10 0 12 7 0 0 +15 11 7 0 10 9 0 17 12 0 0 0 0 0 10 7 0 0 -14 9 2 13 ?0 0 11 3 4 +0 0 0 0 3 81 1 13 12 14 9 0 0 0 0 15 80 1 14 0 16 8001 0 0 0 0 3 5 0 0 FFFFTFTFFFFFF2 83 3 15 1 2 3 79 15 16 SDL/TYSA_COLOUR74 20 8 1 0 13 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0';
  const back = await xtToBrep(example);
  assert.equal(back.faces, 1); assert.equal(back.solids, 0, 'a sheet, not a solid');
  const shape = R.deserializeShape(back.brep);
  near(R.measureArea(shape), Math.PI * 1000 * 1000, 1e-6, 'a disc of radius 1 m');
});

test('files that are not XT are refused with a code', async () => {
  await assert.rejects(() => xtToBrep('not a parasolid file'), (e) => ['xt-read', 'xt-schema'].includes(e.code));
});

test('the spur gear sample: faces split from one surface keep their common edge (two fins of opposite sense on every edge)', async () => {
  // Its hub cylinder is two faces on one surface: OCCT reports their common edge as "closed" on both faces, which
  // the writer once took for a seam and left out of both loops (an independent XT reader refused the file).
  const { buildSample } = await import('../../src/cad/samples.js');
  const { regenerate } = await import('../../src/cad/features.js');
  const p = buildSample('mchSpurGear', 'en', { stage: false });
  const body = regenerate(p.parts[0], { project: p }).body;
  const x = readXt(await brepToXt(body.serialize(), { file: 'gear.x_t' }));
  const bad = [];
  for (const e of [...x.nodes.values()].filter((n) => n.type === NODE.EDGE)) {
    const fins = []; const seen = new Set();
    for (let f = e.halfedge; f && !seen.has(f); f = x.nodes.get(f).other) { seen.add(f); const fin = x.nodes.get(f); if (fin.loop) fins.push(fin.sense); }
    if (fins.length !== 2 || fins[0] === fins[1]) bad.push(`${e.index}:${fins.join('')}`);
  }
  assert.deepEqual(bad, []);
});
