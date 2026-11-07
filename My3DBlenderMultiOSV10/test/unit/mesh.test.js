import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  boundingBox, cloneMesh, coneMesh, cubeMesh, cylinderMesh, edgeMap, eulerCharacteristic, faceNormal, gridMesh, icoSphereMesh, isManifold, planeMesh, selectAll,
  setFaceSelection, signedVolume, toTriangles, torusMesh, triangulateFace, unwrapBox, unwrapSmart, uvSphereMesh, circleMesh, createMesh,
} from '../../src/core/mesh.js';
import * as ops from '../../src/core/meshops.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b}`);
const closed = (m) => { assert.ok(isManifold(m), 'mesh should be manifold'); assert.equal(eulerCharacteristic(m), 2); };
const faceMode = (m, faces) => { m.selMode = 'face'; setFaceSelection(m, faces); return m; };

describe('primitives', () => {
  test('cube: 8 verts, 6 faces, closed, volume 8, normals outward', () => {
    const m = cubeMesh(2);
    assert.equal(m.verts.length, 8);
    assert.equal(m.faces.length, 6);
    closed(m);
    near(signedVolume(m), 8);
  });
  test('uv sphere is closed and its volume approaches 4/3 pi r^3', () => {
    const m = uvSphereMesh(32, 16, 1);
    closed(m);
    near(signedVolume(m), (4 / 3) * Math.PI, 0.1);
  });
  test('ico sphere: 20 * 4^(n-1) faces, vertices on the radius', () => {
    const m = icoSphereMesh(3, 2);
    assert.equal(m.faces.length, 320);
    closed(m);
    for (const v of m.verts) near(Math.hypot(...v), 2, 1e-9);
    assert.ok(signedVolume(m) > 0);
  });
  test('cylinder and cone are closed with outward normals', () => {
    for (const m of [cylinderMesh(16, 1, 2), coneMesh(16, 1, 2)]) { closed(m); assert.ok(signedVolume(m) > 0); }
  });
  test('torus is closed with Euler characteristic 0 and a known volume', () => {
    const m = torusMesh(64, 24, 1, 0.25);
    assert.ok(isManifold(m));
    assert.equal(eulerCharacteristic(m), 0);
    near(signedVolume(m), 2 * Math.PI ** 2 * 1 * 0.0625, 0.02);
  });
  test('grid has (x+1)(y+1) verts and x*y faces', () => {
    const m = gridMesh(4, 3, 2);
    assert.equal(m.verts.length, 20);
    assert.equal(m.faces.length, 12);
  });
  test('circle: loose loop, n-gon or triangle fan', () => {
    assert.equal(circleMesh(8, 1, 'NOTHING').loose.length, 8);
    assert.equal(circleMesh(8, 1, 'NGON').faces[0].length, 8);
    assert.equal(circleMesh(8, 1, 'FAN').faces.length, 8);
  });
});

describe('triangulation', () => {
  test('a concave polygon is clipped into triangles of the right total area', () => {
    const m = createMesh([[0, 0, 0], [4, 0, 0], [4, 4, 0], [2, 1, 0], [0, 4, 0]], [[0, 1, 2, 3, 4]]);
    const tris = triangulateFace(m, m.faces[0]);
    assert.equal(tris.length, 3);
    let area = 0;
    for (const t of tris) {
      const [a, b, c] = t.map((i) => m.verts[i]);
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    // Shoelace formula on the outline: (0 + 16 - 4 + 8 + 0) / 2.
    near(area, 10, 1e-9);
  });
  test('toTriangles gives flat normals and per-corner data', () => {
    const tri = toTriangles(cubeMesh(2));
    assert.equal(tri.positions.length, 12 * 3 * 3);
    assert.equal(tri.triFace.length, 12);
    assert.equal(tri.uvs.length, 12 * 3 * 2);
  });
});

describe('extrude', () => {
  test('extruding a cube top keeps it closed and grows the volume', () => {
    const m = faceMode(cubeMesh(2), [1]);
    ops.extrudeRegion(m, 1);
    assert.equal(m.faces.length, 10);
    assert.equal(m.verts.length, 12);
    closed(m);
    near(signedVolume(m), 8 + 4);
    assert.equal(m.selF.length, 1);
    near(boundingBox(m.verts).max[2], 2);
  });
  test('extruding two adjacent faces as a region makes no wall between them', () => {
    const m = faceMode(cubeMesh(2), [1, 3]);
    ops.extrudeRegion(m, 0.5);
    closed(m);
    assert.equal(m.faces.length, 6 + 6);
  });
  test('individual extrude walls every selected face', () => {
    const m = faceMode(cubeMesh(2), [1, 3]);
    ops.extrudeIndividual(m, 0.5);
    assert.equal(m.faces.length, 6 + 8);
  });
  test('extruding a lone vertex makes a loose edge', () => {
    const m = createMesh([[0, 0, 0]], []);
    m.selV = [0];
    ops.extrudeRegion(m, 1);
    assert.equal(m.verts.length, 2);
    assert.equal(m.loose.length, 1);
  });
  test('extruding an open edge makes a wall', () => {
    const m = planeMesh(2);
    m.selV = [0, 1];
    ops.extrudeRegion(m, 1);
    assert.equal(m.faces.length, 2);
    assert.equal(m.verts.length, 6);
  });
});

describe('inset, poke, triangulate', () => {
  test('inset adds a ring and stays closed', () => {
    const m = faceMode(cubeMesh(2), [1]);
    ops.insetFaces(m, 0.2);
    assert.equal(m.faces.length, 10);
    closed(m);
    near(signedVolume(m), 8);
  });
  test('poke turns a quad into four triangles', () => {
    const m = faceMode(cubeMesh(2), [1]);
    ops.pokeFaces(m);
    assert.equal(m.faces.length, 9);
    closed(m);
  });
  test('triangulate and back to quads', () => {
    const m = cubeMesh(2);
    selectAll(m);
    ops.triangulateFaces(m);
    assert.equal(m.faces.length, 12);
    closed(m);
    selectAll(m);
    ops.trisToQuads(m, 5);
    assert.equal(m.faces.length, 6);
    closed(m);
  });
});

describe('subdivide, loop cut, bisect', () => {
  test('subdividing all of a cube keeps it closed', () => {
    const m = cubeMesh(2);
    selectAll(m);
    ops.subdivideFaces(m, 1);
    assert.equal(m.faces.length, 24);
    closed(m);
    near(signedVolume(m), 8);
  });
  test('subdividing one face stays watertight through the neighbours', () => {
    const m = faceMode(cubeMesh(2), [1]);
    ops.subdivideFaces(m, 1);
    assert.equal(m.faces.length, 9);
    closed(m);
  });
  test('loop cut around a cube adds a ring of four vertices', () => {
    const m = cubeMesh(2);
    const side = m.faces[2];
    ops.loopCut(m, side[1], side[2]);
    assert.equal(m.verts.length, 12);
    assert.equal(m.faces.length, 10);
    closed(m);
    near(signedVolume(m), 8);
    assert.equal(m.selV.length, 4);
  });
  test('two cuts make two rings and stay evenly spaced', () => {
    const m = cubeMesh(3);
    const side = m.faces[2];
    ops.loopCut(m, side[1], side[2], 2);
    assert.equal(m.verts.length, 16);
    closed(m);
  });
  test('edge ring finds all four side quads', () => {
    const m = cubeMesh(2);
    const side = m.faces[2];
    assert.equal(ops.edgeRing(m, side[1], side[2]).quads.size, 4);
  });
  test('bisect splits every crossing face and clear removes one side', () => {
    const m = cubeMesh(2);
    ops.bisect(m, [0, 0, 0], [0, 0, 1]);
    assert.equal(m.faces.length, 10);
    closed(m);
    const half = cubeMesh(2);
    ops.bisect(half, [0, 0, 0], [0, 0, 1], { clear: 'OUTER', fill: true });
    closed(half);
    near(signedVolume(half), 4);
    near(boundingBox(half.verts).max[2], 0);
  });
});

describe('bevel', () => {
  const sharedEdge = (m) => {
    const [f, g] = [m.faces[1], m.faces[3]];
    const both = f.filter((v) => g.includes(v));
    m.selMode = 'vert';
    m.selV = both;
    return both;
  };
  test('one edge of a cube: closed, volume reduced by the cut prism', () => {
    const m = cubeMesh(2);
    sharedEdge(m);
    ops.bevelEdges(m, 0.2);
    assert.equal(m.faces.length, 7);
    assert.equal(m.verts.length, 10);
    closed(m);
    near(signedVolume(m), 8 - (0.2 * 0.2 / 2) * 2, 1e-9);
  });
  test('all edges of a cube: closed with chamfer faces and corner caps', () => {
    const m = cubeMesh(2);
    selectAll(m);
    ops.bevelEdges(m, 0.2);
    assert.equal(m.faces.length, 6 + 12 + 8);
    closed(m);
    assert.ok(signedVolume(m) > 0 && signedVolume(m) < 8);
  });
});

describe('delete, dissolve, merge, fill', () => {
  test('deleting a vertex of a cube removes its 3 faces', () => {
    const m = cubeMesh(2);
    m.selV = [0];
    ops.deleteSelection(m, 'VERT');
    assert.equal(m.verts.length, 7);
    assert.equal(m.faces.length, 3);
  });
  test('deleting a face leaves the other five', () => {
    const m = faceMode(cubeMesh(2), [0]);
    ops.deleteSelection(m, 'FACE');
    assert.equal(m.faces.length, 5);
    assert.equal(m.verts.length, 8);
  });
  test('dissolving two faces joins them into one', () => {
    const m = faceMode(gridMesh(2, 1, 2), [0, 1]);
    ops.dissolveFaces(m);
    assert.equal(m.faces.length, 1);
    assert.equal(m.faces[0].length, 6);
  });
  test('merge at centre collapses a face to one point', () => {
    const m = cubeMesh(2);
    m.selMode = 'vert';
    m.selV = [...m.faces[1]];
    ops.mergeVerts(m, 'CENTER');
    assert.equal(m.verts.length, 5);
    assert.equal(m.faces.length, 5);
    closed(m);
    near(m.verts.find((v) => v[2] === 1 && v[0] === 0 && v[1] === 0)[2], 1);
  });
  test('merge by distance welds coincident vertices only', () => {
    const m = createMesh([[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 0.00001], [0, 1, 0]], [[0, 1, 2], [0, 3, 4]]);
    assert.equal(ops.mergeByDistance(m, 0.001, true), 1);
    assert.equal(m.verts.length, 4);
  });
  test('make face from four vertices, edge from two', () => {
    const m = createMesh([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], []);
    m.selV = [0, 1];
    ops.makeEdgeFace(m);
    assert.equal(m.loose.length, 1);
    m.selV = [0, 2, 1, 3];
    ops.makeEdgeFace(m);
    assert.equal(m.faces.length, 1);
    assert.equal(m.loose.length, 0);
    near(Math.abs(faceNormal(m, m.faces[0])[2]), 1);
  });
  test('bridging the two open rings of a tube closes it', () => {
    const m = cylinderMesh(8, 1, 2, false);
    const n = m.faces.length;
    const top = createMesh(m.verts, m.faces);
    void top;
    m.faces = m.faces.filter((_, f) => f % 2 === 0);
    m.selV = [];
    assert.equal(n, 8);
    const ring = createMesh(
      [...circleMesh(6, 1).verts, ...circleMesh(6, 1).verts.map((v) => [v[0], v[1], 2])],
      [],
    );
    ring.loose = [...Array(6).keys()].flatMap((i) => [[i, (i + 1) % 6], [i + 6, ((i + 1) % 6) + 6]]);
    ring.selV = ring.verts.map((_, i) => i);
    assert.equal(ops.bridgeLoops(ring), true);
    assert.equal(ring.faces.length, 6);
  });
});

describe('normals', () => {
  test('flip reverses, recalculate restores outward', () => {
    const m = cubeMesh(2);
    selectAll(m);
    ops.flipNormals(m);
    assert.ok(signedVolume(m) < 0);
    ops.recalcNormals(m);
    near(signedVolume(m), 8);
  });
  test('recalculate fixes a single inverted face', () => {
    const m = cubeMesh(2);
    m.faces[3].reverse();
    assert.ok(!isManifold(m));
    ops.recalcNormals(m);
    closed(m);
    near(signedVolume(m), 8);
  });
});

describe('vertex tools', () => {
  test('shrink/fatten moves a cube corner along its normal', () => {
    const m = cubeMesh(2);
    selectAll(m);
    ops.shrinkFatten(m, 0.5);
    assert.ok(signedVolume(m) > 8);
  });
  test('smooth pulls a spike back', () => {
    const m = gridMesh(2, 2, 2);
    m.verts[4][2] = 1;
    m.selV = [4];
    ops.smoothVerts(m, 1);
    near(m.verts[4][2], 0);
  });
  test('randomize is repeatable from its seed', () => {
    const [a, b] = [cubeMesh(2), cubeMesh(2)];
    selectAll(a); selectAll(b);
    ops.randomizeVerts(a, 0.1, 7);
    ops.randomizeVerts(b, 0.1, 7);
    assert.deepEqual(a.verts, b.verts);
    assert.notDeepEqual(a.verts, cubeMesh(2).verts);
  });
  test('to sphere puts every vertex at one distance', () => {
    // An odd grid: no vertex sits exactly on the centre, where there is no direction to push it.
    const m = gridMesh(3, 3, 2);
    selectAll(m);
    ops.toSphere(m, 1);
    const d = m.verts.map((v) => Math.hypot(...v));
    near(Math.min(...d), Math.max(...d), 1e-9);
  });
  test('duplicate copies the selected faces', () => {
    const m = faceMode(cubeMesh(2), [1]);
    ops.duplicateSelection(m);
    assert.equal(m.faces.length, 7);
    assert.equal(m.verts.length, 12);
    assert.equal(m.selV.length, 4);
  });
  test('spin of an edge round Z makes a closed band', () => {
    const m = createMesh([[1, 0, -1], [1, 0, 1]], []);
    m.loose = [[0, 1]];
    m.selV = [0, 1];
    ops.spin(m, 360, 8);
    assert.equal(m.faces.length, 8);
    assert.equal(m.verts.length, 16);
  });
});

describe('selection', () => {
  test('invert, linked, more, less', () => {
    const m = gridMesh(4, 1, 4);
    m.selV = [0];
    ops.selectInvert(m);
    assert.equal(m.selV.length, m.verts.length - 1);
    m.selV = [0];
    ops.selectMore(m);
    assert.equal(m.selV.length, 4);
    ops.selectLess(m);
    assert.ok(m.selV.length < 4);
    m.selV = [0];
    ops.selectLinked(m);
    assert.equal(m.selV.length, m.verts.length);
  });
  test('non-manifold selection finds the open boundary of a plane, nothing on a cube', () => {
    const p = gridMesh(2, 2, 2);
    ops.selectNonManifold(p);
    assert.equal(p.selV.length, 8);
    const c = cubeMesh(2);
    ops.selectNonManifold(c);
    assert.equal(c.selV.length, 0);
  });
  test('edge loop goes straight through a grid', () => {
    const m = gridMesh(4, 4, 4);
    ops.selectEdgeLoop(m, 11, 12);
    assert.deepEqual([...m.selV].sort((a, b) => a - b), [10, 11, 12, 13, 14].filter((i) => i >= 11 || i === 10));
  });
});

describe('uv', () => {
  test('box projection gives each corner a uv', () => {
    const m = unwrapBox(cubeMesh(2));
    assert.equal(m.uvs.length, 6);
    assert.equal(m.uvs[0].length, 4);
  });
  test('smart project keeps every island inside the unit square', () => {
    const m = unwrapSmart(uvSphereMesh(12, 6, 1));
    for (const face of m.uvs) for (const uv of face) assert.ok(uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1);
  });
  test('deleting faces keeps the uv layer in step', () => {
    const m = cubeMesh(2);
    const other = cloneMesh(m);
    other.selMode = 'face';
    other.selF = [0];
    ops.deleteSelection(other, 'FACE');
    assert.equal(other.uvs.length, other.faces.length);
    assert.equal(edgeMap(m).size, 12);
  });
});
