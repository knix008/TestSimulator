// Texture coordinates from the B-rep: the UVs of every meshed vertex come from its face's surface parameters
// (scaled to millimetres), so mapping a vertex's UV back through the surface lands on the vertex; planes give
// their size in mm, a cylinder's side its circumference × height.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { meshFaceUVs } from '../../src/view/pt/uv.js';

/** A build entry like app.js makes it: mesh, faces, faceIndex. */
function entryOf(shape, tolerance = 0.05) {
  const mesh = shape.mesh({ tolerance, angularTolerance: 0.2 });
  const faces = shape.faces;
  return { mesh, faces, faceIndex: new Map(faces.map((f, i) => [f.hashCode, i])) };
}

/** UV extents (max − min) of each face group of an entry. */
function spans(entry, uv) {
  const T = entry.mesh.triangles;
  return entry.mesh.faceGroups.map((fg) => {
    let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity;
    for (let k = fg.start; k < fg.start + fg.count; k++) { const i = T[k]; u0 = Math.min(u0, uv[i * 2]); u1 = Math.max(u1, uv[i * 2]); v0 = Math.min(v0, uv[i * 2 + 1]); v1 = Math.max(v1, uv[i * 2 + 1]); }
    return [u1 - u0, v1 - v0].sort((a, b) => a - b);
  });
}

test('B-rep UVs: a box gives every face its size in millimetres, from the triangulation', async () => {
  await loadKernel();
  const R = rep();
  const box = R.makeBaseBox(100, 50, 20);
  const e = entryOf(box);
  const r = meshFaceUVs(e);
  assert.ok(r, 'uvs');
  assert.equal(r.faces, 6);
  assert.equal(r.fromTriangulation, 6, 'all faces read the triangulation');
  assert.ok(r.ok.every((x) => x === 1));
  const got = spans(e, r.uv).map(([a, b]) => `${Math.round(a)}x${Math.round(b)}`).sort();
  assert.deepEqual(got, ['100x20', '100x20', '20x50', '20x50', '50x100', '50x100'].map((s) => s.split('x').map(Number).sort((a, b) => a - b).join('x')).sort());
});

test('B-rep UVs: a cylinder side unrolls to circumference × height; every UV maps back onto its vertex', async () => {
  await loadKernel();
  const R = rep();
  const cyl = R.makeCylinder(10, 30);
  const e = entryOf(cyl, 0.01);
  const r = meshFaceUVs(e);
  const sp = spans(e, r.uv);
  const side = sp.find(([a, b]) => Math.abs(b - 2 * Math.PI * 10) < 0.5 || Math.abs(a - 2 * Math.PI * 10) < 0.5);
  assert.ok(side, JSON.stringify(sp));
  assert.ok(side.some((x) => Math.abs(x - 30) < 0.01), `height ${side}`);
  // Round trip: the surface at the vertex's parameters is the vertex (parameters = uv / metric).
  const { getOC } = await import('replicad');
  const oc = getOC();
  const V = e.mesh.vertices; const T = e.mesh.triangles;
  let worst = 0;
  for (const fg of e.mesh.faceGroups) {
    const face = e.faces[e.faceIndex.get(fg.faceId)];
    const s = new oc.BRepAdaptor_Surface(face.wrapped, false); const p = new oc.gp_Pnt();
    const { uMin, uMax, vMin, vMax } = face.UVBounds;
    const um = (uMin + uMax) / 2; const vm = (vMin + vMax) / 2; const du = (uMax - uMin) * 1e-3; const dv = (vMax - vMin) * 1e-3;
    const at = (u, v) => { s.D0(u, v, p); return [p.X(), p.Y(), p.Z()]; };
    const p0 = at(um, vm); const pu = at(um + du, vm); const pv = at(um, vm + dv);
    const su = Math.hypot(...pu.map((x, k) => x - p0[k])) / du; const sv = Math.hypot(...pv.map((x, k) => x - p0[k])) / dv;
    for (let k = fg.start; k < fg.start + fg.count; k++) {
      const i = T[k];
      const q = at(r.uv[i * 2] / su, r.uv[i * 2 + 1] / sv);
      worst = Math.max(worst, Math.hypot(q[0] - V[i * 3], q[1] - V[i * 3 + 1], q[2] - V[i * 3 + 2]));
    }
    p.delete(); s.delete();
  }
  assert.ok(worst < 1e-3, `worst ${worst} mm`);
});
