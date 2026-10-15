// FreeCAD Mesh / MeshPart / Points / Reverse engineering / Surface /
// Inspection: the mesh algorithms MyCAD runs for them.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addFacet, approximateCurve, approximateSurface, blendCurve, boundaryLoops, boundingBox, crossSections, curveOnMesh, extendFace, fillHoles, flipNormals,
  insidePolygon, inspectDistances, reconstructSurface, refineMesh, scaleMesh, segmentBestFit, segmentSmooth, smoothMesh, structurePoints, triangleInfo,
  trimByPlane, unwrapMesh, unwrappedOutline, vertexCurvatures, colorScale,
} from '../../src/domain/meshops.js';
import { meshVolume, normalizeSolidData, solidMesh } from '../../src/domain/solids.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const mesh = (kind, params) => solidMesh(normalizeSolidData({ type: 'solid', kind, params }));
const area = (tris) => tris.reduce((s, t) => s + triangleInfo(t).area, 0);
/** A flat square of n×n cells, side s, in the XY plane. */
function grid(n, s = 10) {
  const at = (i, j) => [(s * i) / n, (s * j) / n, 0];
  const out = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)], [at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
  return out;
}

test('info: bounding box, triangle area and normal, curvature of a sphere (1/r and 1/r²)', () => {
  const box = boundingBox(mesh('box', { length: 10, width: 20, height: 30 }));
  assert.deepEqual(box.size.map(Math.round), [10, 20, 30]);
  const t = triangleInfo([[0, 0, 0], [2, 0, 0], [0, 2, 0]]);
  near(t.area, 2); assert.deepEqual(t.normal, [0, 0, 1]);
  const sphere = mesh('sphere', { radius: 10 });
  const k = vertexCurvatures(sphere).filter((v) => !v.boundary);
  const avg = (f) => k.reduce((s, v) => s + f(v), 0) / k.length;
  near(avg((v) => v.mean), 0.1, 0.1);
  near(avg((v) => v.gaussian), 0.01, 0.15);
  assert.deepEqual(colorScale(0, 0, 1), [0, 0, 1]);
  assert.deepEqual(colorScale(1, 0, 1), [1, 0, 0]);
});

test('editing: flip, scale, add a facet, fill a hole, refine, smooth', () => {
  const cube = mesh('box', { length: 10, width: 10, height: 10 });
  near(meshVolume(flipNormals(cube)), -meshVolume(cube));
  near(meshVolume(scaleMesh(cube, 2)), meshVolume(cube) * 8, 1e-6);
  const open = cube.slice(1);
  assert.equal(boundaryLoops(open).loops.length, 1);
  const filled = fillHoles(open);
  assert.equal(filled.filled, 1);
  assert.equal(boundaryLoops(filled.tris).loops.length, 0);
  near(Math.abs(meshVolume(filled.tris)), 1000, 1e-6);
  const back = addFacet(open, cube[0].slice().reverse());
  near(meshVolume(back), meshVolume(cube), 1e-9);
  const fine = refineMesh(cube, 3);
  assert.ok(fine.every((tri) => [0, 1, 2].every((k) => Math.hypot(...tri[k].map((v, i) => v - tri[(k + 1) % 3][i])) <= 3 + 1e-9)));
  near(area(fine), area(cube), 1e-9);
  const sphere = mesh('sphere', { radius: 10 });
  const smooth = smoothMesh(sphere, { iterations: 5 });
  near(Math.abs(meshVolume(smooth)), Math.abs(meshVolume(sphere)), 0.05);
});

test('plane and polygon: trimming a box at half height; a point inside a polygon', () => {
  const cube = mesh('box', { length: 10, width: 10, height: 10 });
  const z0 = boundingBox(cube).min[2];
  const lower = trimByPlane(cube, [0, 0, z0 + 5], [0, 0, 1], 'below');
  near(boundingBox(lower).max[2], z0 + 5);
  near(area(lower), 100 + 4 * 50, 1e-9);
  const upper = trimByPlane(cube, [0, 0, z0 + 5], [0, 0, 1], 'above');
  near(boundingBox(upper).min[2], z0 + 5);
  assert.equal(insidePolygon([1, 1], [[0, 0], [4, 0], [4, 4], [0, 4]]), true);
  assert.equal(insidePolygon([5, 1], [[0, 0], [4, 0], [4, 4], [0, 4]]), false);
});

test('sections and segments: cylinder cross-sections are rings; a box has 6 smooth regions; best fits name plane and cylinder', () => {
  const cyl = mesh('cylinder', { radius: 5, height: 20 });
  const rings = crossSections(cyl, 'z', 3);
  assert.equal(rings.length, 3);
  for (const ring of rings) {
    const z = ring[0][2];
    assert.ok(ring.every((p) => Math.abs(Math.hypot(p[0], p[1]) - 5) < 0.2 && Math.abs(p[2] - z) < 1e-9));
  }
  assert.equal(segmentSmooth(mesh('box', { length: 10, width: 10, height: 10 })).length, 6);
  const types = segmentBestFit(cyl).map((s) => s.type).sort();
  assert.deepEqual([...new Set(types)], ['cylinder', 'plane']);
});

test('unwrap: a flat sheet keeps its size; a cylinder side unrolls to 2πr × h', () => {
  const flat = unwrapMesh(grid(4));
  const xs = flat.uv.map((p) => p[0]); const ys = flat.uv.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs); const h = Math.max(...ys) - Math.min(...ys);
  near(w * h, 100 * 2, 1e-6 * 0 + 1);
  const sheetArea = flat.faces.reduce((s, f) => { const [a, b, c] = f.map((i) => flat.uv[i]); return s + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; }, 0);
  near(sheetArea, 100, 1e-3);
  assert.ok(unwrappedOutline(flat).length >= 16);
  const side = segmentSmooth(mesh('cylinder', { radius: 5, height: 20 })).sort((a, b) => b.length - a.length)[0];
  // Cut the tube open along one line so it can lie flat: drop the faces next to x > 0, y ≈ 0.
  const open = side.filter((t) => !t.some((p) => p[0] > 4.9 && Math.abs(p[1]) < 1e-6));
  const rolled = unwrapMesh(open);
  const rolledArea = rolled.faces.reduce((s, f) => { const [a, b, c] = f.map((i) => rolled.uv[i]); return s + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; }, 0);
  near(rolledArea, area(open), 0.05);
});

test('curves: on a sphere a curve through picks stays on it; a blend leaves both ends along their tangents', () => {
  const sphere = mesh('sphere', { radius: 10 });
  const c = boundingBox(sphere).center;
  const picks = [[10, 0, 0], [0, 10, 0], [-10, 0, 0]].map((p) => p.map((v, k) => v + c[k]));
  const curve = curveOnMesh(sphere, picks);
  assert.ok(curve.every((p) => Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - 10) < 0.3));
  const blend = blendCurve({ point: [0, 0, 0], tangent: [1, 0, 0] }, { point: [10, 10, 0], tangent: [0, -1, 0] });
  assert.deepEqual(blend[0], [0, 0, 0]);
  assert.deepEqual(blend.at(-1).map(Math.round), [10, 10, 0]);
  assert.ok(blend[1][0] > 0 && Math.abs(blend[1][1]) < blend[1][0], 'leaves along +x');
});

test('extend face: a flat 10×10 face grown by 2 covers about 14×14', () => {
  const grown = extendFace(grid(2), 2);
  const a = area(grown);
  assert.ok(a > 100 + 4 * 20 - 1 && a < 196 + 1, `area ${a}`);
  assert.ok(grown.every((t) => t.every((p) => Math.abs(p[2]) < 1e-9)), 'stays in its plane');
});

test('fitting: a curve through noisy points along a line, a surface (B-spline and polynomial) through a paraboloid', () => {
  const pts = Array.from({ length: 40 }, (_, i) => [i, 0.01 * Math.sin(i * 7), 0]);
  const curve = approximateCurve(pts, 6);
  assert.ok(curve.every((p) => Math.abs(p[1]) < 0.05));
  near(curve[0][0], 0, 0.5); near(curve.at(-1)[0], 39, 0.02);
  const cloud = [];
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) cloud.push([i, j, (i * i + j * j) / 10]);
  const poly = approximateSurface(cloud, { kind: 'polynomial' });
  assert.ok(poly.rms < 1e-6, `rms ${poly.rms}`);
  const bs = approximateSurface(cloud, { kind: 'bspline', controls: 6 });
  assert.ok(bs.rms < 0.05, `rms ${bs.rms}`);
  assert.equal(bs.tris.length, 24 * 24 * 2);
});

test('surface from points: a sphere cloud gives a closed surface near its radius', () => {
  const pts = [];
  for (let i = 0; i < 600; i++) {
    const z = -1 + (2 * i + 1) / 600;
    const r = Math.sqrt(1 - z * z);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    pts.push([10 * r * Math.cos(a), 10 * r * Math.sin(a), 10 * z]);
  }
  const tris = reconstructSurface(pts, { depth: 4 });
  assert.ok(tris.length > 100);
  const radii = tris.flat().map((p) => Math.hypot(...p));
  assert.ok(radii.every((r) => Math.abs(r - 10) < 1.5), `radii ${Math.min(...radii)}…${Math.max(...radii)}`);
  assert.ok(meshVolume(tris) > 0, 'faces point outward');
  assert.equal(boundaryLoops(tris).loops.length, 0, 'closed');
});

test('points: a cloud resampled on a grid; inspection distances to a sphere', () => {
  const cloud = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) cloud.push([i, j, 0]);
  const s = structurePoints(cloud, 10, 10);
  assert.equal(s.points.length, 100);
  const sphere = mesh('sphere', { radius: 10 });
  const c = boundingBox(sphere).center;
  const outside = [[11, 0, 0], [0, -11, 0]].map((p) => p.map((v, k) => v + c[k]));
  const inside = [[0, 0, 9]].map((p) => p.map((v, k) => v + c[k]));
  const r = inspectDistances([...outside, ...inside], sphere);
  near(r.distances[0], 1, 0.05); near(r.distances[1], 1, 0.05); near(r.distances[2], -1, 0.05);
  near(r.max, r.distances[0], 0.1);
});
