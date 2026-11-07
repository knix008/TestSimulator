// Freestyle-style lines: silhouettes, creases and open borders are found on the real geometry, kept where the camera can see
// them and drawn over the finished image. So the lines stay crisp at any resolution, whatever the renderer drew.
import { Matrix3, Vector3 } from 'three';
import { GEOMETRY_TYPES, evaluatedMesh, isVisible, worldMatrix } from './doc.js';
import { edgeMap, faceNormal, v3 } from './mesh.js';
import { buildBVH, intersect } from './pathtracer.js';

export const defaultFreestyle = () => ({ enabled: false, thickness: 1.5, color: [0, 0, 0], crease: 40, silhouette: true, border: true, creases: true });

/** World-space feature edges: [{ a, b, kind }]. `eye` decides what is a silhouette. */
export function featureEdges(doc, eye, settings, frame = doc.frame) {
  const limit = Math.cos((settings.crease * Math.PI) / 180);
  const out = [];
  const p = new Vector3();
  const nv = new Vector3();
  for (const obj of doc.objects) {
    if (!GEOMETRY_TYPES.has(obj.type) || !isVisible(doc, obj) || obj.hideRender) continue;
    const mesh = evaluatedMesh(doc, obj, { frame, render: true });
    if (!mesh?.faces.length) continue;
    const m = worldMatrix(doc, obj);
    const nm = new Matrix3().getNormalMatrix(m);
    const world = mesh.verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(m); return [p.x, p.y, p.z]; });
    const normals = mesh.faces.map((face) => { const n = faceNormal(mesh, face); nv.set(n[0], n[1], n[2]).applyMatrix3(nm).normalize(); return [nv.x, nv.y, nv.z]; });
    for (const e of edgeMap(mesh).values()) {
      const [a, b] = [world[e.a], world[e.b]];
      if (e.faces.length === 1) { if (settings.border) out.push({ a, b, kind: 'BORDER' }); continue; }
      if (e.faces.length !== 2) continue;
      const [n0, n1] = [normals[e.faces[0]], normals[e.faces[1]]];
      const toEye = v3.sub(eye, v3.lerp(a, b, 0.5));
      const facing = (v3.dot(n0, toEye) > 0) !== (v3.dot(n1, toEye) > 0);
      if (facing && settings.silhouette) out.push({ a, b, kind: 'SILHOUETTE' });
      else if (settings.creases && v3.dot(n0, n1) < limit) out.push({ a, b, kind: 'CREASE' });
    }
  }
  return out;
}

/** Projects a world point to pixel coordinates; null behind the camera. Matches the renderer's camera model. */
export function projectToImage(camera, width, height, p) {
  const d = v3.sub(p, camera.position);
  const z = v3.dot(d, camera.forward);
  if (camera.kind === 'ORTHO') {
    const half = camera.orthoScale / 2;
    return [((v3.dot(d, camera.right) / half + 1) * width) / 2, ((1 - (v3.dot(d, camera.up) * (width / height)) / half) * height) / 2, z];
  }
  if (z <= 1e-4) return null;
  const sx = v3.dot(d, camera.right) / (z * camera.tanHalf);
  const sy = (v3.dot(d, camera.up) * (width / height)) / (z * camera.tanHalf);
  return [((sx + 1) * width) / 2, ((1 - sy) * height) / 2, z];
}

/**
 * The coverage of the lines over an image: Float32Array(width × height), 0…1. Each edge is cut into short pieces and each piece
 * is tested against the scene, so a line can go behind something halfway.
 */
export function lineCoverage(scene, edges, { thickness = 1.5, bvh = buildBVH(scene.positions) } = {}) {
  const { width, height, camera } = scene;
  const cover = new Float32Array(width * height);
  const half = thickness / 2;
  const visible = (p) => {
    const d = v3.sub(p, camera.position);
    const dist = v3.len(d);
    if (dist < 1e-6) return true;
    const dir = v3.mul(d, 1 / dist);
    // Stops a hair short of the edge's own faces.
    return !intersect(scene, bvh, camera.position[0], camera.position[1], camera.position[2], dir[0], dir[1], dir[2], dist * 0.998, true);
  };
  const stamp = (a, b) => {
    const [x0, x1] = [Math.max(0, Math.floor(Math.min(a[0], b[0]) - half - 1)), Math.min(width - 1, Math.ceil(Math.max(a[0], b[0]) + half + 1))];
    const [y0, y1] = [Math.max(0, Math.floor(Math.min(a[1], b[1]) - half - 1)), Math.min(height - 1, Math.ceil(Math.max(a[1], b[1]) + half + 1))];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
      const d = Math.hypot(a[0] + dx * t - px, a[1] + dy * t - py);
      const k = Math.max(0, Math.min(1, half + 0.5 - d));
      if (k > cover[y * width + x]) cover[y * width + x] = k;
    }
  };
  for (const { a, b } of edges) {
    const [pa, pb] = [projectToImage(camera, width, height, a), projectToImage(camera, width, height, b)];
    if (!pa || !pb) continue;
    const pixels = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const pieces = Math.max(1, Math.min(64, Math.ceil(pixels / 6)));
    for (let i = 0; i < pieces; i++) {
      const [t0, t1] = [i / pieces, (i + 1) / pieces];
      if (!visible(v3.lerp(a, b, (t0 + t1) / 2))) continue;
      const [q0, q1] = [projectToImage(camera, width, height, v3.lerp(a, b, t0)), projectToImage(camera, width, height, v3.lerp(a, b, t1))];
      if (q0 && q1) stamp(q0, q1);
    }
  }
  return cover;
}

/** Lines over a linear image; returns a new image. */
export function drawFreestyle(doc, scene, image, settings = doc.render.freestyle) {
  if (!settings?.enabled) return image;
  const edges = featureEdges(doc, scene.camera.position, settings);
  const cover = lineCoverage(scene, edges, { thickness: settings.thickness });
  const data = image.data.slice();
  for (let i = 0; i < cover.length; i++) {
    const k = cover[i];
    if (!k) continue;
    for (let c = 0; c < 3; c++) data[i * 4 + c] += (settings.color[c] - data[i * 4 + c]) * k;
    data[i * 4 + 3] = Math.max(data[i * 4 + 3], k);
  }
  return { ...image, data };
}

