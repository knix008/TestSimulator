// Modelling kernel: SketchUp "sticky geometry" behaviour (src/modeling/mesh.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4 } from 'three';
import { GeoMesh } from '../../src/modeling/mesh.js';
import { box, cylinder } from '../../src/modeling/primitives.js';

const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, msg ?? `${a} ≈ ${b}`);
const ok = (m) => assert.deepEqual(m.validate(), []);
const facesWithHoles = (m) => [...m.faces.values()].filter((f) => f.holes.length);
const centroid = (m) => {
  const b = m.boundingBox();
  return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
};
// every face normal of a convex solid points away from its centre
function assertOutward(m) {
  const c = centroid(m);
  for (const [id, f] of m.faces) {
    const p = m.pos(f.outer[0]);
    const d = (p.x - c.x) * f.normal.x + (p.y - c.y) * f.normal.y + (p.z - c.z) * f.normal.z;
    assert.ok(d > 0, `face ${id} faces inward`);
  }
}
function groundRect(m, x0, z0, x1, z1) {
  return m.addRectangle([x0, 0, z0], [x1, 0, z1]);
}
function makeBox(w = 2, d = 1, h = 0.5) {
  const m = new GeoMesh();
  const r = groundRect(m, 0, 0, w, d);
  const pp = m.pushPull(r.faces[0], h);
  return { m, base: r.faces[0], top: pp.face };
}

test('drawing a rectangle creates one face facing up', () => {
  const m = new GeoMesh();
  const r = groundRect(m, 0, 0, 2, 1);
  assert.equal(m.edges.size, 4);
  assert.equal(m.faces.size, 1);
  assert.equal(r.faces.length, 1);
  const f = m.faces.get(r.faces[0]);
  close(f.normal.y, 1);
  close(m.area(r.faces[0]), 2);
  ok(m);
});

test('the face appears only when the fourth edge closes the loop', () => {
  const m = new GeoMesh();
  m.addEdge([0, 0, 0], [1, 0, 0]);
  m.addEdge([1, 0, 0], [1, 0, 1]);
  m.addEdge([1, 0, 1], [0, 0, 1]);
  assert.equal(m.faces.size, 0);
  const r = m.addEdge([0, 0, 1], [0, 0, 0]);
  assert.equal(r.faces.length, 1);
  assert.equal(m.faces.size, 1);
  close(m.faces.get(r.faces[0]).normal.y, 1);
});

test('a vertical rectangle faces the drawing plane hint', () => {
  const m = new GeoMesh();
  const r = m.addPolyline([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], { closed: true, planeNormal: [0, 0, -1] });
  assert.equal(r.faces.length, 1);
  close(m.faces.get(r.faces[0]).normal.z, -1);
});

test('a line across a face splits it into two faces', () => {
  const m = new GeoMesh();
  const r = groundRect(m, 0, 0, 2, 1);
  const line = m.addEdge([0.5, 0, 0], [0.5, 0, 1]);
  assert.equal(m.faces.size, 2);
  assert.equal(line.faces.length, 1);
  const areas = [...m.faces.keys()].map((f) => m.area(f)).sort();
  close(areas[0], 0.5); close(areas[1], 1.5);
  // the original face id survives as one of the halves and both still face up
  assert.ok(m.faces.has(r.faces[0]));
  for (const f of m.faces.values()) close(f.normal.y, 1);
  assert.equal(m.edges.size, 7); // 4 sides, two of them split, plus the line
  ok(m);
});

test('a diagonal line splits a face into two triangles', () => {
  const m = new GeoMesh();
  groundRect(m, 0, 0, 1, 1);
  m.addEdge([0, 0, 0], [1, 0, 1]);
  assert.equal(m.faces.size, 2);
  for (const f of m.faces.keys()) close(m.area(f), 0.5);
});

test('a closed loop drawn inside a face makes an inner face and a hole', () => {
  const m = new GeoMesh();
  const outer = groundRect(m, 0, 0, 4, 4);
  const inner = groundRect(m, 1, 1, 2, 2);
  assert.equal(m.faces.size, 2);
  const holed = m.faces.get(outer.faces[0]);
  assert.equal(holed.holes.length, 1);
  close(m.area(outer.faces[0]), 15);
  const innerFace = inner.faces.find((f) => f !== outer.faces[0]);
  close(m.area(innerFace), 1);
  close(m.faces.get(innerFace).normal.y, 1);
  ok(m);
});

test('a rectangle drawn around an existing face gets that face as a hole', () => {
  const m = new GeoMesh();
  const small = groundRect(m, 1, 1, 2, 2);
  const big = groundRect(m, 0, 0, 4, 4);
  assert.equal(m.faces.size, 2);
  const bigFace = big.faces.find((f) => f !== small.faces[0]);
  assert.equal(m.faces.get(bigFace).holes.length, 1);
  close(m.area(bigFace), 15);
});

test('crossing lines split each other and share the crossing vertex', () => {
  const m = new GeoMesh();
  m.addEdge([-1, 0, 0], [1, 0, 0]);
  const r = m.addEdge([0, 0, -1], [0, 0, 1]);
  assert.equal(m.edges.size, 4);
  assert.equal(r.edges.length, 2);
  assert.equal(m.vertices.size, 5);
  const centre = m.findVertex({ x: 0, y: 0, z: 0 });
  assert.equal(m.edgesOfVertex(centre).length, 4);
});

test('lines crossing in 3D split, skew lines do not', () => {
  const m = new GeoMesh();
  m.addEdge([-1, 0, 0], [1, 0, 0]);
  m.addEdge([0, -1, 0], [0, 1, 0]); // crosses
  m.addEdge([0, 1, -1], [0, 1, 1]); // touches the end of the vertical line: T-junction there
  m.addEdge([5, 0, 0], [5, 1, 1]);
  m.addEdge([6, 0, 1], [4, 1, 0.2]); // skew, misses
  assert.equal(m.findVertex({ x: 5, y: 0.5, z: 0.5 }), null);
  const center = m.findVertex({ x: 0, y: 0, z: 0 });
  assert.equal(m.edgesOfVertex(center).length, 4);
  const top = m.findVertex({ x: 0, y: 1, z: 0 });
  assert.equal(m.edgesOfVertex(top).length, 3);
});

test('T-junctions and collinear overlaps reuse existing edges', () => {
  const m = new GeoMesh();
  m.addEdge([0, 0, 0], [2, 0, 0]);
  const t = m.addEdge([1, 0, 0], [1, 0, 1]); // starts on the middle of the first edge
  assert.equal(t.created.length, 1);
  assert.equal(m.edges.size, 3);
  const over = m.addEdge([-1, 0, 0], [3, 0, 0]); // overlaps both halves
  assert.equal(over.created.length, 2); // only the two new ends
  assert.equal(over.edges.length, 4);
  assert.equal(m.edges.size, 5);
  ok(m);
});

test('vertices within the merge tolerance become one vertex', () => {
  const m = new GeoMesh();
  m.addEdge([0, 0, 0], [1, 0, 0]);
  m.addEdge([1 + 4e-6, 0, 0], [1, 0, 1]);
  assert.equal(m.vertices.size, 3);
  const loose = new GeoMesh({ tolerance: 1e-3 });
  loose.addEdge([0, 0, 0], [1, 0, 0]);
  loose.addEdge([1.0005, 0, 0], [1, 0, 1]);
  assert.equal(loose.vertices.size, 3);
});

test('push/pull of a rectangle builds a closed box with outward normals', () => {
  const { m, base, top } = makeBox(2, 1, 0.5);
  assert.equal(m.faces.size, 6);
  assert.equal(m.edges.size, 12);
  assert.ok(m.isSolid());
  close(m.volume(), 2 * 1 * 0.5);
  close(m.faces.get(base).normal.y, -1); // the original face became the bottom
  close(m.faces.get(top).normal.y, 1);
  assertOutward(m);
  ok(m);
});

test('pushing a face of the box stretches it (no new faces)', () => {
  const { m, top } = makeBox(2, 1, 0.5);
  const r = m.pushPull(top, 0.25);
  assert.equal(r.face, top);
  assert.equal(m.faces.size, 6);
  assert.ok(m.isSolid());
  close(m.volume(), 2 * 1 * 0.75);
  // a side face too
  const side = [...m.faces.keys()].find((f) => Math.abs(m.faces.get(f).normal.x - 1) < 1e-9);
  m.pushPull(side, 1);
  assert.equal(m.faces.size, 6);
  close(m.volume(), 3 * 1 * 0.75);
  m.pushPull(top, -0.5); // push back down
  close(m.volume(), 3 * 1 * 0.25);
  assertOutward(m);
});

test('push/pull with createNew keeps the old face', () => {
  const { m, top } = makeBox(1, 1, 1);
  const r = m.pushPull(top, 0.5, { createNew: true });
  assert.ok(m.faces.has(top));
  assert.notEqual(r.face, top);
  assert.equal(m.faces.size, 11);
});

test('pulling a free face down builds the box below with outward normals', () => {
  const m = new GeoMesh();
  const r = groundRect(m, 0, 0, 1, 1);
  m.pushPull(r.faces[0], -0.3);
  assert.equal(m.faces.size, 6);
  assert.ok(m.isSolid());
  close(m.volume(), 0.3);
  assertOutward(m);
});

test('a rectangle drawn on a box face pulls out into a bump and pushes in as a recess', () => {
  const { m, top } = makeBox(2, 2, 0.5);
  const r = m.addRectangle([0.5, 0.5, 0.5], [1.5, 0.5, 1.5]);
  const inner = r.faces.find((f) => f !== top);
  assert.equal(m.faces.get(top).holes.length, 1);
  const bump = m.pushPull(inner, 0.25);
  assert.equal(m.faces.size, 11); // 6 box faces + 4 sides + cap
  assert.ok(m.isSolid());
  close(m.volume(), 2 * 2 * 0.5 + 0.25);
  // and back in, through the original level into a recess (stretch)
  m.pushPull(bump.face, -0.45);
  assert.ok(m.isSolid());
  close(m.volume(), 2 * 2 * 0.5 - 0.2, 1e-9);
});

test('pushing a face through to the opposite side cuts a hole', () => {
  const { m, top } = makeBox(2, 2, 0.2);
  const r = m.addRectangle([0.5, 0.2, 0.5], [1.5, 0.2, 1.5]);
  const inner = r.faces.find((f) => f !== top);
  const res = m.pushPull(inner, -0.2);
  assert.equal(res.face, null);
  assert.ok(res.pushedThrough);
  assert.equal(m.faces.size, 10); // top & bottom with holes, 4 outer, 4 inner sides
  assert.equal(facesWithHoles(m).length, 2);
  assert.ok(m.isSolid());
  close(m.volume(), 2 * 2 * 0.2 - 1 * 1 * 0.2, 1e-9);
  ok(m);
});

test('push-through also works in two steps (recess, then stretch to the back)', () => {
  const { m, top } = makeBox(2, 2, 0.2);
  const r = m.addRectangle([0.5, 0.2, 0.5], [1.5, 0.2, 1.5]);
  const inner = r.faces.find((f) => f !== top);
  const step = m.pushPull(inner, -0.05);
  assert.ok(m.isSolid());
  const res = m.pushPull(step.face, -0.15);
  assert.ok(res.pushedThrough);
  assert.equal(m.faces.size, 10);
  assert.ok(m.isSolid());
  close(m.volume(), 0.8 - 0.2, 1e-9);
});

test('erasing the edge between two coplanar faces heals them into one', () => {
  const m = new GeoMesh();
  groundRect(m, 0, 0, 2, 1);
  const line = m.addEdge([1, 0, 0], [1, 0, 1]);
  assert.equal(m.faces.size, 2);
  const r = m.eraseEdges(line.edges);
  assert.equal(m.faces.size, 1);
  assert.equal(r.faces.length, 1);
  close(m.area([...m.faces.keys()][0]), 2);
  assert.equal(m.edges.size, 4); // the split sides merge back
  assert.equal(m.vertices.size, 4);
  ok(m);
});

test('erasing a hole edge heals the inner face into the outer one', () => {
  const m = new GeoMesh();
  groundRect(m, 0, 0, 4, 4);
  const inner = groundRect(m, 1, 1, 2, 2);
  assert.equal(m.faces.size, 2);
  m.eraseEdges([inner.edges[0]]);
  assert.equal(m.faces.size, 1);
  const f = [...m.faces.values()][0];
  assert.equal(f.holes.length, 0);
  close(m.area([...m.faces.keys()][0]), 16);
});

test('erasing a box edge removes its two faces', () => {
  const { m } = makeBox(1, 1, 1);
  const e = [...m.edges.keys()][0];
  m.eraseEdges([e]);
  assert.equal(m.faces.size, 4);
  assert.equal(m.edges.size, 11);
  assert.ok(!m.isSolid());
  ok(m);
});

test('a circle is one curve; push/pull makes a cylinder with soft sides', () => {
  const m = new GeoMesh();
  const c = m.addCircle([0, 0, 0], [0, 1, 0], 0.5, 24);
  assert.equal(c.faces.length, 1);
  assert.equal(m.curves.get(c.curve).edges.length, 24);
  assert.deepEqual(new Set(m.curveEdges(c.edges[3])), new Set(c.edges));
  m.pushPull(c.faces[0], 1);
  assert.equal(m.faces.size, 26);
  assert.ok(m.isSolid());
  const polyArea = 0.5 * 24 * 0.25 * Math.sin((2 * Math.PI) / 24);
  close(m.volume(), polyArea, 1e-9);
  const soft = [...m.edges.values()].filter((e) => e.soft && e.smooth);
  assert.equal(soft.length, 24); // the vertical side edges
  assert.equal(m.curves.size, 2); // base and cap circles
  // smooth shading: side normals are averaged (horizontal and radial at the seam vertices)
  const t = m.triangulate();
  assert.ok(t.softEdgePositions.length === 24 * 6);
  assert.ok(t.edgePositions.length === 48 * 6);
  let radial = 0;
  for (let i = 0; i < t.normals.length; i += 3) if (Math.abs(t.normals[i + 1]) < 1e-6 && Math.abs(Math.hypot(t.normals[i], t.normals[i + 2]) - 1) < 1e-6) radial++;
  assert.ok(radial >= 24 * 4);
});

test('polygons stay hard; arcs are curves', () => {
  const m = new GeoMesh();
  const p = m.addPolygon([0, 0, 0], [0, 1, 0], 1, 6);
  assert.equal(p.faces.length, 1);
  assert.equal(m.curves.get(p.curve).kind, 'polygon');
  m.pushPull(p.faces[0], 1);
  assert.equal([...m.edges.values()].filter((e) => e.soft).length, 0);
  const a = new GeoMesh();
  const arc = a.addArc([0, 0, 0], [0, 1, 0], 1, 0, Math.PI / 2, { segments: 6 });
  assert.equal(arc.edges.length, 6);
  assert.equal(a.curves.get(arc.curve).kind, 'arc');
  const a3 = new GeoMesh();
  const r3 = a3.addArc3([1, 0, 0], [Math.SQRT1_2, 0, Math.SQRT1_2], [0, 0, 1], { segments: 8 });
  assert.equal(r3.edges.length, 8);
  close(a3.curves.get(r3.curve).radius, 1, 1e-9);
});

test('offset makes an inner loop (mitred corners) on convex and concave faces', () => {
  const m = new GeoMesh();
  const L = m.addPolyline([[0, 0, 0], [2, 0, 0], [2, 0, 1], [1, 0, 1], [1, 0, 2], [0, 0, 2]], { closed: true });
  close(m.area(L.faces[0]), 3);
  const r = m.offsetFace(L.faces[0], 0.1);
  assert.equal(r.error, undefined);
  assert.equal(r.edges.length, 6);
  assert.equal(m.faces.size, 2);
  // inner L: 1.8 x 0.8 + 0.8 x 1.0 = 2.24, ring = 0.76
  const areas = [...m.faces.keys()].map((f) => m.area(f)).sort((a, b) => a - b);
  close(areas[0], 0.76, 1e-9); close(areas[1], 2.24, 1e-9);
  // the original face keeps its outline and gets the hole
  assert.equal(m.faces.get(L.faces[0]).holes.length, 1);
  // outward offset surrounds the face
  const out = m.offsetFace(L.faces[0], -0.1);
  assert.equal(out.error, undefined);
  assert.equal(m.faces.size, 3);
  ok(m);
  assert.equal(m.offsetFace(L.faces[0], 5).error, 'offset-too-large');
});

test('offsetting a circle face gives a smaller circle curve', () => {
  const m = new GeoMesh();
  const c = m.addCircle([0, 0, 0], [0, 1, 0], 1, 32);
  const r = m.offsetFace(c.faces[0], 0.2);
  assert.ok(r.curve);
  close(m.curves.get(r.curve).radius, 0.8);
  assert.equal(m.faces.size, 2);
});

test('follow me sweeps a profile around a closed path into a solid frame', () => {
  const m = new GeoMesh();
  const path = m.addPolyline([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], { closed: true });
  m.eraseFaces(path.faces); // keep the path as edges only
  // 0.1 × 0.05 profile standing on the first path edge, outside the square
  const prof = m.addPolyline([[0.5, 0, 0], [0.5, 0, -0.1], [0.5, 0.05, -0.1], [0.5, 0.05, 0]], { closed: true, planeNormal: [1, 0, 0] });
  // the profile corner split the path edge: select the path edges again (like the UI does)
  const pathEdges = [...m.edges.entries()].filter(([, e]) => m.pos(e.a).y === 0 && m.pos(e.b).y === 0 && m.pos(e.a).z >= 0 && m.pos(e.b).z >= 0).map(([id]) => id);
  const r = m.followMe(prof.faces[0], pathEdges);
  assert.equal(r.error, undefined);
  assert.ok(m.isSolid());
  close(m.volume(), (1.2 * 1.2 - 1) * 0.05, 1e-9);
  assert.ok(!m.faces.has(prof.faces[0])); // the profile is consumed
  ok(m);
});

test('follow me along an open path keeps the profile as the start cap', () => {
  const m = new GeoMesh();
  const path = m.addPolyline([[0, 0, 0], [0, 0, 2], [2, 0, 2]]);
  const prof = m.addPolyline([[-0.1, 0, 0], [0.1, 0, 0], [0.1, 0.2, 0], [-0.1, 0.2, 0]], { closed: true, planeNormal: [0, 0, -1] });
  assert.ok(path.edges.every((e) => m.edges.has(e))); // the profile touches the path start only
  const r = m.followMe(prof.faces[0], path.edges);
  assert.equal(r.error, undefined);
  assert.ok(m.faces.has(prof.faces[0]));
  assert.ok(m.isSolid());
  // centre line length 4, cross-section 0.2 × 0.2; a mitred corner keeps the volume exact
  close(m.volume(), 4 * 0.04, 1e-9);
});

test('follow me of a circle around a circle path makes a smooth ring', () => {
  const m = new GeoMesh();
  const path = m.addCircle([0, 0, 0], [0, 1, 0], 1, 16);
  m.eraseFaces(path.faces);
  const prof = m.addCircle([1, 0, 0], [0, 0, 1], 0.1, 8);
  const pathEdges = m.curves.get(path.curve).edges;
  const r = m.followMe(prof.faces[0], pathEdges);
  assert.equal(r.error, undefined);
  m.eraseEdges(pathEdges.filter((e) => !m.facesOfEdge(e).length)); // the path stays, like SketchUp
  assert.ok(m.isSolid());
  // Pappus: 2π R · area (polygon approximations on both sides)
  const ring = 16 * Math.sin(Math.PI / 16) * 2, sec = 0.5 * 8 * 0.01 * Math.sin(Math.PI / 4);
  assert.ok(Math.abs(m.volume() - ring * sec) / (ring * sec) < 0.05, String(m.volume()));
  assert.ok([...m.edges.values()].filter((e) => e.soft).length >= 16 * 8);
});

test('intersect faces adds the intersection edges of two boxes', () => {
  const m = box(1, 1, 1, { anchor: 'corner' });
  const a = [...m.faces.keys()];
  const merged = m.merge(box(1, 1, 1, { anchor: 'corner', at: [0.5, 0.5, 0.5] }));
  assert.equal(m.faces.size, 12);
  const r = m.intersectFaces(a, merged.faces);
  assert.equal(r.edges.length, 6);
  assert.equal(m.faces.size, 18); // 3 faces of each box split in two
  ok(m);
  // intersecting with the whole model again adds nothing
  const again = m.intersectFaces([...m.faces.keys()]);
  assert.equal(again.edges.length, 0);
});

test('moving a face stretches the connected geometry; autoFold keeps faces planar', () => {
  const { m, top } = makeBox(1, 1, 1);
  m.moveEntities({ faces: [top] }, [0, 1, 0]);
  close(m.volume(), 2);
  assert.ok(m.isSolid());
  // drag one top corner up: the top and two sides fold
  const v = m.findVertex({ x: 1, y: 2, z: 1 });
  const r = m.moveEntities({ vertices: [v] }, [0, 0.5, 0], { autoFold: true });
  assert.ok(r.folded.length >= 2);
  for (const f of m.faces.keys()) assert.ok(m._isPlanar(f), `face ${f} not planar`);
  assert.ok(m.isSolid());
  ok(m);
});

test('transforms rotate and mirror without turning faces inside out', () => {
  const { m } = makeBox(2, 1, 0.5);
  const all = [...m.faces.keys()];
  m.transformEntities(all, new Matrix4().makeRotationY(0.7));
  close(m.volume(), 1, 1e-9);
  m.transformEntities(all, new Matrix4().makeScale(-1, 2, 1));
  close(m.volume(), 2, 1e-9);
  assert.ok(m.isSolid());
  assertOutward(m);
});

test('copyEntities makes an independent moved copy', () => {
  const { m } = makeBox(1, 1, 1);
  const r = m.copyEntities([...m.faces.keys()], new Matrix4().makeTranslation(3, 0, 0));
  assert.equal(r.faces.length, 6);
  assert.equal(m.faces.size, 12);
  close(m.volume(), 2);
  assert.ok(m.isSolid());
  assert.equal(m.connected(r.faces[0]).faces.length, 6);
  // a copy that touches the original shares its vertices (sticky)
  const m2 = makeBox(1, 1, 1).m;
  m2.copyEntities([...m2.faces.keys()], new Matrix4().makeTranslation(1, 0, 0));
  assert.equal(m2.vertices.size, 12);
});

test('flip, materials and soften', () => {
  const { m, top } = makeBox(1, 1, 1);
  m.setMaterial([top], 'wood-oak');
  m.setMaterial([top], 'paint-white', { back: true });
  m.flipFaces([top]);
  const f = m.faces.get(top);
  close(f.normal.y, -1);
  assert.equal(f.material, 'paint-white');
  assert.equal(f.backMaterial, 'wood-oak');
  m.flipFaces([top]);
  const c = cylinder(0.5, 1, { segments: 12 });
  c.setEdgeFlags([...c.edges.keys()], { soft: false, smooth: false });
  const softened = c.softenEdges(null, 40);
  assert.equal(softened.length, 12);
  c.softenEdges(null, 10);
  assert.equal([...c.edges.values()].filter((e) => e.soft).length, 0);
});

test('selection queries: connected, boundary edges, faces of an edge', () => {
  const { m, top } = makeBox(1, 1, 1);
  const loose = m.addEdge([5, 0, 0], [6, 0, 0]);
  assert.equal(m.boundaryEdges(top).length, 4);
  for (const e of m.boundaryEdges(top)) assert.equal(m.facesOfEdge(e).length, 2);
  const c = m.connected(top);
  assert.equal(c.faces.length, 6);
  assert.equal(c.edges.length, 12);
  assert.equal(m.connected(loose.edges[0]).edges.length, 1);
  const bb = m.boundingBox();
  close(bb.max.x, 6); close(bb.max.y, 1);
  assert.ok(!m.isSolid()); // a stray edge makes it not a solid
});

test('triangulate: sizes, material groups, metre UVs, picking ids, edges', () => {
  const { m, top } = makeBox(2, 1, 0.5);
  m.setMaterial([top], 'wood-oak');
  const t = m.triangulate();
  assert.equal(t.positions.length, 6 * 4 * 3);
  assert.equal(t.normals.length, t.positions.length);
  assert.equal(t.uvs.length, 6 * 4 * 2);
  assert.equal(t.indices.length, 12 * 3);
  assert.equal(t.faceOfTriangle.length, 12);
  assert.equal(t.groups.length, 2);
  assert.equal(t.groups.reduce((s, g) => s + g.count, 0), 36);
  const wood = t.groups.find((g) => g.material === 'wood-oak');
  assert.equal(wood.count, 6);
  for (let i = wood.start / 3; i < (wood.start + wood.count) / 3; i++) assert.equal(t.faceOfTriangle[i], top);
  // UVs are metres: the 2 m wide top spans 2 units in u
  const us = [];
  for (let i = 0; i < t.indices.length; i++) if (t.faceOfTriangle[Math.floor(i / 3)] === top) us.push(t.uvs[t.indices[i] * 2]);
  close(Math.max(...us) - Math.min(...us), 2, 1e-6);
  assert.equal(t.edgePositions.length, 12 * 6);
  assert.equal(t.softEdgePositions.length, 0);
  // triangles wind with the face normal
  for (let k = 0; k < t.indices.length; k += 3) {
    const P = (i) => [t.positions[t.indices[k + i] * 3], t.positions[t.indices[k + i] * 3 + 1], t.positions[t.indices[k + i] * 3 + 2]];
    const [a, b, c] = [P(0), P(1), P(2)];
    const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const N = t.normals.slice(t.indices[k] * 3, t.indices[k] * 3 + 3);
    assert.ok(n[0] * N[0] + n[1] * N[1] + n[2] * N[2] > 0);
  }
  // uvTransform scales the texture
  m.setUVTransform([top], { scale: [0.5, 0.5] });
  const t2 = m.triangulate();
  const us2 = [];
  for (let i = 0; i < t2.indices.length; i++) if (t2.faceOfTriangle[Math.floor(i / 3)] === top) us2.push(t2.uvs[t2.indices[i] * 2]);
  close(Math.max(...us2) - Math.min(...us2), 4, 1e-6);
});

test('triangulate handles faces with holes', () => {
  const m = new GeoMesh();
  groundRect(m, 0, 0, 4, 4);
  groundRect(m, 1, 1, 2, 2);
  const t = m.triangulate();
  let area = 0;
  for (let k = 0; k < t.indices.length; k += 3) {
    const P = (i) => [t.positions[t.indices[k + i] * 3], t.positions[t.indices[k + i] * 3 + 2]];
    const [a, b, c] = [P(0), P(1), P(2)];
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  close(area, 16, 1e-6);
});

test('JSON round trip keeps everything and clones are independent', () => {
  const m = new GeoMesh();
  const c = m.addCircle([0, 0, 0], [0, 1, 0], 0.5, 12);
  m.pushPull(c.faces[0], 1);
  m.setMaterial([c.faces[0]], 'metal-steel');
  const text = JSON.stringify(m.toJSON());
  const back = GeoMesh.fromJSON(JSON.parse(text));
  assert.equal(back.vertices.size, m.vertices.size);
  assert.equal(back.edges.size, m.edges.size);
  assert.equal(back.faces.size, m.faces.size);
  assert.equal(back.curves.size, m.curves.size);
  assert.equal(back.faces.get(c.faces[0]).material, 'metal-steel');
  assert.equal([...back.edges.values()].filter((e) => e.soft).length, 12);
  close(back.volume(), m.volume());
  assert.ok(back.isSolid());
  ok(back);
  // new ids never clash with loaded ones
  const r = back.addEdge([3, 0, 0], [4, 0, 0]);
  assert.ok(r.edges[0] > Math.max(...m.edges.keys()));
  const copy = m.clone();
  copy.pushPull([...copy.faces.keys()].find((f) => copy.faces.get(f).normal.y > 0.99), 1);
  close(m.volume(), back.volume());
  assert.ok(copy.volume() > m.volume());
});

test('revision and takeChanges report what changed', () => {
  const m = new GeoMesh();
  const r0 = m.revision;
  const r = groundRect(m, 0, 0, 1, 1);
  assert.ok(m.revision > r0);
  const ch = m.takeChanges();
  assert.ok(ch.faces.includes(r.faces[0]));
  assert.equal(ch.edges.length >= 4, true);
  assert.equal(m.takeChanges().faces.length, 0);
  const rev = m.revision;
  m.pushPull(r.faces[0], 1);
  assert.ok(m.revision > rev);
  const ch2 = m.takeChanges();
  assert.equal(ch2.faces.length, 6);
  assert.ok(m.changed.size === 0);
});

test('a box drawn edge by edge gets six faces oriented outward', () => {
  const m = new GeoMesh();
  const P = (x, y, z) => [x, y, z];
  const lines = [
    [P(0, 0, 0), P(1, 0, 0)], [P(1, 0, 0), P(1, 0, 1)], [P(1, 0, 1), P(0, 0, 1)], [P(0, 0, 1), P(0, 0, 0)],
    [P(0, 1, 0), P(1, 1, 0)], [P(1, 1, 0), P(1, 1, 1)], [P(1, 1, 1), P(0, 1, 1)], [P(0, 1, 1), P(0, 1, 0)],
    [P(0, 0, 0), P(0, 1, 0)], [P(1, 0, 0), P(1, 1, 0)], [P(1, 0, 1), P(1, 1, 1)], [P(0, 0, 1), P(0, 1, 1)],
  ];
  for (const [a, b] of lines) m.addEdge(a, b);
  assert.equal(m.faces.size, 6);
  assert.ok(m.isSolid());
  close(m.volume(), 1);
  assertOutward(m);
});

test('floor faces next to a box still face up; rectangles on walls push out', () => {
  const { m } = makeBox(1, 1, 1);
  const g = groundRect(m, 1, 0, 2, 1);
  close(m.faces.get(g.faces[0]).normal.y, 1);
  const w = makeBox(1, 1, 1).m;
  const s = w.addPolyline([[0, 0.25, 0.25], [0, 0.75, 0.25], [0, 0.75, 0.75], [0, 0.25, 0.75]], { closed: true });
  const inner = s.faces.find((f) => w.area(f) < 0.3);
  close(w.faces.get(inner).normal.x, -1); // inherits the wall's orientation
  const p = w.pushPull(inner, 0.5);
  assert.ok(w.isSolid());
  close(w.volume(), 1 + 0.25 * 0.5);
  close(w.faces.get(p.face).normal.x, -1);
});

test('a line drawn up a box side splits that side', () => {
  const { m } = makeBox(1, 1, 1);
  m.addEdge([0.5, 1, 1], [0.5, 0, 1]);
  assert.equal(m.faces.size, 7);
  assert.ok(m.isSolid());
  close(m.volume(), 1);
});
