// Unit tests for the SketchUp-style geometry kernel: meshes (src/core/mesh.js),
// triangulation with holes (src/core/earcut.js) and the boolean solid tools
// and push/pull (src/core/csg.js) — closed results, exact volumes, coplanar
// and degenerate cases.
// Run: node --test test/unit/mesh.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  prismMesh, boxMesh, surfaceMesh, meshVolume, isClosed, faceNormal, faceArea, footprint, triangulateLoops, extrudeFace, offsetFace,
  imprintLoop, splitFace, followMe, terrainGrid, terrainFromContours, smoove, heightAt, normalizeMesh, weld, meshEdges, transformMesh,
  rotateMesh, mergeMeshes, meshBounds, stretchInfo, meshFromPolygons, insideFace, newell, len,
} from "../../src/core/mesh.js";
import { earcut } from "../../src/core/earcut.js";
import { union, subtract, intersect, imprint, split, pushPull, isSolid } from "../../src/core/csg.js";
import { polygonArea } from "../../src/core/geom.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const topFace = (m) => m.f.findIndex((_, i) => faceNormal(m, i)[2] > 0.99);
const faceWith = (m, fn) => m.f.findIndex((_, i) => fn(faceNormal(m, i), i));
const solid = (m, vol, tol = 1e-3) => { assert.ok(isClosed(m), "closed"); near(meshVolume(m), vol, tol, "volume"); };

describe("triangulation (earcut)", () => {
  test("a square with a square hole: the triangles cover exactly the ring", () => {
    const tris = earcut([0, 0, 10, 0, 10, 10, 0, 10, 3, 3, 3, 7, 7, 7, 7, 3], [4]);
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 3], [3, 7], [7, 7], [7, 3]];
    let a = 0;
    for (let i = 0; i < tris.length; i += 3) a += Math.abs(polygonArea([pts[tris[i]], pts[tris[i + 1]], pts[tris[i + 2]]]));
    near(a, 100 - 16);
  });
  test("a concave L and collinear points triangulate without gaps", () => {
    const loop = [[0, 0, 0], [5, 0, 0], [10, 0, 0], [10, 4, 0], [4, 4, 0], [4, 10, 0], [0, 10, 0]];
    const tris = triangulateLoops([loop], [0, 0, 1]);
    let a = 0;
    for (const t of tris) a += polygonArea(t.map((k) => loop[k]));
    near(a, 40 + 24);
  });
});

describe("meshes", () => {
  test("a prism mesh is closed, faces outwards and has the right volume; taper 0 is a pyramid", () => {
    const sq = [[0, 0], [3000, 0], [3000, 3000], [0, 3000]];
    solid(prismMesh(sq, 500, 3500), 3000 ** 3);
    solid(prismMesh(sq.slice().reverse(), 0, 3000), 3000 ** 3, 1); // clockwise input too
    solid(prismMesh(sq, 0, 3000, 0), 3000 ** 3 / 3, 1);
    const fru = prismMesh(sq, 0, 3000, 0.5);
    solid(fru, (3000 / 3) * (9e6 + 2.25e6 + Math.sqrt(9e6 * 2.25e6)), 10);
  });
  test("the footprint of an L-shaped mass is the L (not its hull)", () => {
    const L = [[0, 0], [6000, 0], [6000, 2000], [2000, 2000], [2000, 5000], [0, 5000]];
    near(Math.abs(polygonArea(footprint(prismMesh(L, 0, 3000)))), 6000 * 2000 + 2000 * 3000, 1);
  });
  test("a vertical surface still has a usable plan footprint", () => {
    const m = surfaceMesh([[0, 0, 0], [1000, 0, 0], [1000, 0, 1000], [0, 0, 1000]], { towards: [0, -1, 0] });
    assert.ok(faceNormal(m, 0)[1] < -0.99);
    assert.ok(footprint(m).length >= 3);
  });
  test("normalizeMesh drops broken loops and indices; weld joins duplicate vertices", () => {
    assert.equal(normalizeMesh(null), null);
    assert.equal(normalizeMesh({ v: [[0, 0, 0]], f: [{ l: [0, 0, 7] }] }), null);
    const m = normalizeMesh({ v: [[0, 0, 0], [1, 0, "x"], [1, 1, 0], [9, 9, 9]], f: [{ l: [0, 1, 2, 2, 0], m: "brick" }, { l: [1, 2] }], e: [[0, 3], [5, 6]] });
    assert.equal(m.f.length, 1);
    assert.deepEqual(m.f[0].l, [0, 1, 2]);
    assert.equal(m.e.length, 1);
    const w = weld(mergeMeshes([boxMesh(0, 0, 0, 1000, 1000, 1000), boxMesh(1000, 0, 0, 1000, 1000, 1000)]));
    assert.equal(w.v.length, 12);
  });
  test("transform, mirror and rotate keep a closed mesh closed and outwards", () => {
    const b = boxMesh(0, 0, 0, 1000, 2000, 3000);
    solid(transformMesh(b, ([x, y, z]) => [-x, y, z], { mirror: true }), 6e9, 1);
    const r = rotateMesh(b, [0, 0, 0], [1, 1, 0], 37);
    solid(r, 6e9, 10);
  });
});

describe("push/pull", () => {
  test("pulling a drawn rectangle makes a closed box, either way", () => {
    const s = surfaceMesh([[0, 0, 0], [2000, 0, 0], [2000, 1000, 0], [0, 1000, 0]]);
    solid(extrudeFace(s, 0, 3000), 6e9, 1);
    const down = extrudeFace(s, 0, -3000);
    solid(down, 6e9, 1);
    near(meshBounds(down).z1, -3000);
  });
  test("the top of a box stretches (same faces, new height) and cannot collapse", () => {
    const b = boxMesh(0, 0, 0, 1000, 1000, 3000);
    const r = pushPull(b, topFace(b), 1500);
    assert.equal(r.mode, "stretch");
    assert.equal(r.mesh.f.length, 6);
    solid(r.mesh, 4.5e9, 1);
    const flat = pushPull(b, topFace(b), -5000);
    assert.ok(meshVolume(flat.mesh) > 0 && meshBounds(flat.mesh).z2 >= 1 - 1e-6, "kept at least 1 mm");
  });
  test("a side face of a box stretches too", () => {
    const b = boxMesh(0, 0, 0, 1000, 1000, 1000);
    const fi = faceWith(b, (n) => n[0] > 0.99);
    solid(pushPull(b, fi, 500).mesh, 1.5e9, 1);
  });
  test("offset a loop into the top face, then pull it up and push it in (recess) and through (hole)", () => {
    const b = boxMesh(0, 0, 0, 4000, 4000, 1000);
    const o = offsetFace(b, topFace(b), 1000);
    assert.ok(o, "offset");
    assert.equal(o.mesh.f.length, 7);
    near(faceArea(o.mesh, o.face), 2000 * 2000, 1e-3);
    assert.ok(isClosed(o.mesh));
    const up = pushPull(o.mesh, o.face, 500);
    assert.equal(up.mode, "extrude");
    solid(up.mesh, 16e9 + 4e6 * 500, 10);
    const rec = pushPull(o.mesh, o.face, -400);
    assert.equal(rec.mode, "carve");
    solid(rec.mesh, 16e9 - 4e6 * 400, 10);
    const hole = pushPull(o.mesh, o.face, -1000);
    solid(hole.mesh, 16e9 - 4e9, 10);
    assert.ok(hole.mesh.f.some((f) => f.h && f.h.length), "a face with a hole");
  });
  test("offset that would turn the loop inside out is refused", () => {
    const b = boxMesh(0, 0, 0, 1000, 1000, 1000);
    assert.equal(offsetFace(b, topFace(b), 600), null);
    assert.equal(offsetFace(b, topFace(b), -100), null, "outwards only on a lone face");
    const s = surfaceMesh([[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [0, 1000, 0]]);
    near(faceArea(offsetFace(s, 0, -100).mesh, 1), 1200 * 1200 - 1000 * 1000, 1e-3);
  });
  test("Ctrl push/pull always starts a new extrusion", () => {
    const b = boxMesh(0, 0, 0, 1000, 1000, 1000);
    const r = pushPull(b, topFace(b), 500, { copy: true });
    assert.equal(r.mode, "extrude");
    solid(r.mesh, 1.5e9, 1);
    assert.equal(r.mesh.f.length, 10);
  });
  test("a stretch is only offered when every touching face is perpendicular", () => {
    const fru = prismMesh([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], 0, 1000, 0.5);
    assert.equal(stretchInfo(fru, topFace(fru)).ok, false);
    solid(pushPull(fru, topFace(fru), 1000).mesh, meshVolume(fru) + 500 * 500 * 1000, 10);
  });
});

describe("drawing on faces", () => {
  test("a rectangle drawn inside a face becomes its own face (and a hole in the old one)", () => {
    const b = boxMesh(0, 0, 0, 4000, 4000, 1000);
    const t = topFace(b);
    const r = imprintLoop(b, t, [[1000, 1000, 1000], [2000, 1000, 1000], [2000, 2000, 1000], [1000, 2000, 1000]]);
    assert.ok(r);
    assert.ok(isClosed(r.mesh));
    near(faceArea(r.mesh, r.face), 1e6, 1e-3);
    near(faceArea(r.mesh, t), 16e6 - 1e6, 1e-3);
    assert.equal(imprintLoop(b, t, [[-1000, 0, 1000], [100, 0, 1000], [100, 100, 1000]]), null, "outside the face");
    assert.equal(imprintLoop(b, t, [[1000, 1000, 1500], [2000, 1000, 1500], [2000, 2000, 1500]]), null, "off the plane");
  });
  test("a line across a face splits it in two; pulling one half up keeps the solid closed", () => {
    const b = boxMesh(0, 0, 0, 4000, 2000, 1000);
    const t = topFace(b);
    const r = splitFace(b, t, [[1500, 0, 1000], [1500, 2000, 1000]]);
    assert.ok(r);
    assert.ok(isClosed(r.mesh), "closed after split (edge vertices shared)");
    near(faceArea(r.mesh, r.faces[0]) + faceArea(r.mesh, r.faces[1]), 8e6, 1e-3);
    const half = r.faces.find((fi) => Math.abs(faceArea(r.mesh, fi) - 3e6) < 1);
    const up = pushPull(r.mesh, half, 1000);
    solid(up.mesh, 8e9 + 3e9, 10);
  });
  test("insideFace knows the outer loop and the holes", () => {
    const b = boxMesh(0, 0, 0, 4000, 4000, 1000);
    const r = imprintLoop(b, topFace(b), [[1000, 1000, 1000], [3000, 1000, 1000], [3000, 3000, 1000], [1000, 3000, 1000]]);
    assert.equal(insideFace(r.mesh, topFace(b), [500, 500, 1000]), true);
    assert.equal(insideFace(r.mesh, topFace(b), [2000, 2000, 1000]), false);
  });
});

describe("follow me", () => {
  const sq = (c, s, plane) => plane === "x" ? [[c[0], c[1] - s, c[2] - s], [c[0], c[1] + s, c[2] - s], [c[0], c[1] + s, c[2] + s], [c[0], c[1] - s, c[2] + s]] : null;
  test("a square profile along an L path: closed, volume = area × centre-line length", () => {
    const m = followMe(sq([0, 0, 0], 50, "x"), [[0, 0, 0], [1000, 0, 0], [1000, 2000, 0]]);
    solid(m, 100 * 100 * 3000, 1);
  });
  test("around a closed rectangle (a cornice): closed ring without caps", () => {
    const m = followMe(sq([0, 0, 3000], 100, "x"), [[0, 0, 3000], [10000, 0, 3000], [10000, 6000, 3000], [0, 6000, 3000]], { closed: true });
    solid(m, 200 * 200 * 32000, 10);
    assert.equal(m.f.length, 16);
  });
  test("collinear path points are skipped; a path that doubles back is refused", () => {
    const m = followMe(sq([0, 0, 0], 50, "x"), [[0, 0, 0], [500, 0, 0], [1000, 0, 0]]);
    solid(m, 100 * 100 * 1000, 1);
    assert.equal(m.f.length, 6);
    assert.throws(() => followMe(sq([0, 0, 0], 50, "x"), [[0, 0, 0], [1000, 0, 0], [0, 0, 0], [0, 0, 1]]));
  });
  test("a profile with a hole sweeps into a hollow tube", () => {
    const outer = sq([0, 0, 0], 100, "x"), inner = sq([0, 0, 0], 50, "x");
    const m = followMe([outer, inner], [[0, 0, 0], [2000, 0, 0]]);
    solid(m, (200 * 200 - 100 * 100) * 2000, 1);
  });
  test("a vertical path: a column from a circle", () => {
    const circle = Array.from({ length: 24 }, (_, i) => [300 * Math.cos((i / 24) * 2 * Math.PI), 300 * Math.sin((i / 24) * 2 * Math.PI), 0]);
    const m = followMe(circle, [[0, 0, 0], [0, 0, 3000]]);
    solid(m, Math.abs(len(newell(circle))) * 3000, 1);
  });
});

describe("solid tools (CSG)", () => {
  const A = () => boxMesh(0, 0, 0, 1000, 1000, 1000);
  test("union of overlapping boxes", () => {
    const u = union(A(), boxMesh(500, 500, 500, 1000, 1000, 1000));
    solid(u, 2e9 - 125e6, 10);
  });
  test("union of boxes sharing a face merges the coplanar faces (one box)", () => {
    const u = union(A(), boxMesh(1000, 0, 0, 1000, 1000, 1000));
    solid(u, 2e9, 10);
    assert.equal(u.f.length, 6, "six faces, not ten");
  });
  test("union of identical boxes is the box", () => {
    const u = union(A(), A());
    solid(u, 1e9, 10);
    assert.equal(u.f.length, 6);
  });
  test("subtract with coplanar faces: a slot cut from the top", () => {
    const s = subtract(boxMesh(0, 0, 0, 3000, 1000, 1000), boxMesh(1000, 0, 500, 1000, 1000, 500));
    solid(s, 3e9 - 0.5e9, 10);
  });
  test("subtract a cylinder right through: a hole in the top face", () => {
    const circle = Array.from({ length: 16 }, (_, i) => [500 + 200 * Math.cos((i / 16) * 2 * Math.PI), 500 + 200 * Math.sin((i / 16) * 2 * Math.PI)]);
    const cyl = prismMesh(circle, -100, 1100);
    const s = subtract(A(), cyl);
    solid(s, 1e9 - Math.abs(polygonArea(circle)) * 1000, 100);
    assert.ok(s.f.some((f) => f.h && f.h.length), "the top face has a hole");
  });
  test("subtract / intersect of disjoint solids", () => {
    solid(subtract(A(), boxMesh(5000, 0, 0, 1000, 1000, 1000)), 1e9, 1);
    assert.equal(intersect(A(), boxMesh(5000, 0, 0, 1000, 1000, 1000)).f.length, 0);
  });
  test("intersect of overlapping boxes and of touching boxes", () => {
    solid(intersect(A(), boxMesh(500, 500, 500, 1000, 1000, 1000)), 125e6, 10);
    assert.ok(Math.abs(meshVolume(intersect(A(), boxMesh(1000, 0, 0, 1000, 1000, 1000)))) < 1);
  });
  test("split gives the three parts", () => {
    const s = split(A(), boxMesh(500, 0, 0, 1000, 1000, 1000));
    solid(s.aOnly, 0.5e9, 10); solid(s.bOnly, 0.5e9, 10); solid(s.both, 0.5e9, 10);
  });
  test("imprint (intersect faces) adds edges but keeps the solid", () => {
    const a = A();
    const r = imprint(a, boxMesh(500, 500, 500, 1000, 1000, 1000));
    solid(r, 1e9, 10);
    assert.ok(r.f.length > a.f.length, `${r.f.length} faces`);
  });
  test("materials of both solids survive a union", () => {
    const u = union(A(), boxMesh(500, 0, 0, 1000, 1000, 2000), { ma: "brick", mb: "glass" });
    const ms = new Set(u.f.map((f) => f.m));
    assert.ok(ms.has("brick") && ms.has("glass"));
  });
  test("isSolid knows open and inside-out meshes", () => {
    assert.ok(isSolid(A()));
    assert.ok(!isSolid(surfaceMesh([[0, 0, 0], [1, 0, 0], [1, 1, 0]])));
    assert.ok(!isSolid(transformMesh(A(), (p) => [-p[0], p[1], p[2]])));
  });
  test("meshFromPolygons merges split triangles of one face back into one face", () => {
    const m = meshFromPolygons([{ pts: [[0, 0, 0], [10, 0, 0], [10, 10, 0]] }, { pts: [[0, 0, 0], [10, 10, 0], [0, 10, 0]] }]);
    assert.equal(m.f.length, 1);
    assert.equal(m.f[0].l.length, 4);
  });
});

describe("sandbox", () => {
  test("a terrain grid, its height and smoove", () => {
    const t = terrainGrid({ x0: 0, y0: 0, w: 10000, d: 10000, nx: 10, ny: 10, z: 0 });
    assert.equal(t.v.length, 121);
    assert.equal(t.f.length, 200);
    near(heightAt(t, 5000, 5000), 0);
    const s = smoove(t, 5000, 5000, 3000, 1000);
    near(heightAt(s, 5000, 5000), 1000, 1e-6);
    near(heightAt(s, 0, 0), 0);
    assert.ok(faceNormal(t, 0)[2] > 0.99, "faces up");
    assert.equal(meshEdges(t).length, 10 * 11 * 2 + 100);
  });
  test("terrain from contours lies between the contour heights", () => {
    const c = [{ pts: [[0, 0], [10000, 0]], z: 0 }, { pts: [[0, 4000], [10000, 4000]], z: 2000 }];
    const t = terrainFromContours(c, { cell: 500, margin: 0 });
    near(heightAt(t, 5000, 2000), 1000, 60);
    near(heightAt(t, 5000, 0), 0, 1e-6);
    near(heightAt(t, 5000, 4000), 2000, 1e-6);
    assert.throws(() => terrainFromContours([]));
  });
});
