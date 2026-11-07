// NURBS surfaces: a grid of weighted control points, tessellated by Cox-de Boor into a smooth mesh.
// data = { pointsU, pointsV, points: [[x,y,z,w], …] (u first), orderU, orderV, cyclicU, cyclicV, resolutionU, resolutionV }.
import { createMesh } from './mesh.js';

/** Open uniform knots: the surface reaches its end points. Cyclic ones wrap. */
export function knotVector(count, order, cyclic) {
  const knots = [];
  if (cyclic) {
    for (let i = 0; i < count + order * 2; i++) knots.push(i);
    return knots;
  }
  const spans = count - order + 1;
  for (let i = 0; i < order; i++) knots.push(0);
  for (let i = 1; i < spans; i++) knots.push(i);
  for (let i = 0; i < order; i++) knots.push(spans);
  return knots;
}

/** Basis function values for parameter t: N[i] for every control point. */
function basisAt(knots, count, order, t) {
  const size = knots.length - 1;
  let N = new Float64Array(size);
  for (let i = 0; i < size; i++) N[i] = t >= knots[i] && t < knots[i + 1] ? 1 : 0;
  // The very end of an open curve belongs to the last span.
  if (t >= knots[size]) { for (let i = size - 1; i >= 0; i--) if (knots[i] < knots[i + 1]) { N[i] = 1; break; } }
  for (let p = 2; p <= order; p++) {
    const next = new Float64Array(size);
    for (let i = 0; i + p <= size; i++) {
      const a = knots[i + p - 1] - knots[i];
      const b = knots[i + p] - knots[i + 1];
      next[i] = (a > 0 ? ((t - knots[i]) / a) * N[i] : 0) + (b > 0 ? ((knots[i + p] - t) / b) * N[i + 1] : 0);
    }
    N = next;
  }
  return N;
}

function sampling(count, order, cyclic, resolution) {
  const spans = cyclic ? count : count - order + 1;
  const steps = Math.max(1, spans * resolution);
  const knots = knotVector(count, order, cyclic);
  const [t0, t1] = cyclic ? [order - 1, order - 1 + count] : [0, spans];
  const samples = [];
  const total = cyclic ? steps : steps + 1;
  for (let s = 0; s < total; s++) {
    const t = t0 + ((t1 - t0) * s) / steps;
    const N = basisAt(knots, cyclic ? count + order : count, order, t);
    samples.push(N);
  }
  return { samples, total };
}

/** The surface as a mesh. Faces wind counter-clockwise looking at +U × +V. */
export function surfaceToMesh(data) {
  const { pointsU: nu, pointsV: nv, points, orderU = 4, orderV = 4, cyclicU = false, cyclicV = false, resolutionU = 6, resolutionV = 6 } = data;
  const orderUse = [Math.min(orderU, cyclicU ? nu : nu), Math.min(orderV, cyclicV ? nv : nv)];
  const U = sampling(nu, orderUse[0], cyclicU, resolutionU);
  const V = sampling(nv, orderUse[1], cyclicV, resolutionV);
  const verts = [];
  const pointAt = (i, j) => points[(i % nu) + (j % nv) * nu];
  for (const Nv of V.samples) {
    for (const Nu of U.samples) {
      let [x, y, z, sum] = [0, 0, 0, 0];
      for (let j = 0; j < Nv.length; j++) {
        if (!Nv[j]) continue;
        for (let i = 0; i < Nu.length; i++) {
          if (!Nu[i]) continue;
          const p = pointAt(i, j);
          const w = Nu[i] * Nv[j] * (p[3] ?? 1);
          x += p[0] * w; y += p[1] * w; z += p[2] * w; sum += w;
        }
      }
      verts.push(sum > 0 ? [x / sum, y / sum, z / sum] : [0, 0, 0]);
    }
  }
  const faces = [];
  const uvs = [];
  const at = (i, j) => (j % V.total) * U.total + (i % U.total);
  const [iMax, jMax] = [cyclicU ? U.total : U.total - 1, cyclicV ? V.total : V.total - 1];
  for (let j = 0; j < jMax; j++) {
    for (let i = 0; i < iMax; i++) {
      faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      const [a, b, c, d] = [i / iMax, (i + 1) / iMax, j / jMax, (j + 1) / jMax];
      uvs.push([[a, c], [b, c], [b, d], [a, d]]);
    }
  }
  return createMesh(verts, faces, { uvs, smooth: true });
}

const grid = (nu, nv, fn) => {
  const points = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) points.push(fn(i, j));
  return points;
};

/** Ready-made surfaces. The circular ones use the rational weights that make true circles from 8 spans of order 3. */
export function nurbsPrimitive(kind = 'PATCH') {
  const base = { orderU: 4, orderV: 4, cyclicU: false, cyclicV: false, resolutionU: 6, resolutionV: 6 };
  switch (kind) {
    case 'CYLINDER': {
      const nu = 8;
      return { ...base, pointsU: nu, pointsV: 4, orderU: 4, cyclicU: true, points: grid(nu, 4, (i, j) => { const a = (i / nu) * Math.PI * 2; return [Math.cos(a) * 1.15, Math.sin(a) * 1.15, j / 3 * 2 - 1, 1]; }) };
    }
    case 'SPHERE': {
      const [nu, nv] = [8, 7];
      return { ...base, pointsU: nu, pointsV: nv, cyclicU: true, points: grid(nu, nv, (i, j) => { const a = (i / nu) * Math.PI * 2; const b = (j / (nv - 1)) * Math.PI; const r = Math.sin(b) * 1.2; return [Math.cos(a) * r, Math.sin(a) * r, -Math.cos(b) * 1.1, 1]; }) };
    }
    case 'TORUS': {
      const [nu, nv] = [12, 6];
      return { ...base, pointsU: nu, pointsV: nv, cyclicU: true, cyclicV: true, points: grid(nu, nv, (i, j) => { const a = (i / nu) * Math.PI * 2; const b = (j / nv) * Math.PI * 2; const r = 1 + 0.35 * Math.cos(b); return [Math.cos(a) * r, Math.sin(a) * r, 0.35 * Math.sin(b), 1]; }) };
    }
    default:
      return { ...base, pointsU: 4, pointsV: 4, points: grid(4, 4, (i, j) => [i / 3 * 2 - 1, j / 3 * 2 - 1, 0, 1]) };
  }
}
