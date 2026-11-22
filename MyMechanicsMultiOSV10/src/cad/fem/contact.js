// Contact between bodies and against rigid planes for the tetrahedral studies.
//
// bonded        node-to-surface ties: u_s − Σ w_k u_k = 0 (stiff penalty), for non-matching meshes.
// contact       mortar (segment-to-segment) no-penetration: the slave faces are split into linear sub-triangles
//               (a T6 face into 4), each slave node a gets a weighted gap g̃_a = ∫ Ñ_a g dA / ∫ Ñ_a dA with the linear
//               sub-triangle functions Ñ_a, integrated at Gauss points projected onto the master (the other body's faces
//               or the rigid plane). The constraint g̃_a ≥ 0 couples the slave nodes (D_ab = ∫Ñ_a N_b dA) and the master
//               nodes (M_am = ∫Ñ_a N_m dA); its multiplier is the contact pressure at node a, so the pressure is smooth
//               (no node-to-surface checkerboard on quadratic faces).
//               Coulomb friction: tangential multipliers with stick (penalty on the tangential slip) or slip
//               (traction μ·p along the trial direction), by the augmented Lagrangian.
// Constraint record: { type, s (node the multiplier lives on), ids, coef (gap = n·Σ coef·u + g0), n, g0, area, k, mu }.

import { selectFaces, nodalAreas } from './model.js';
import { faceShape, TRI6 } from './elements.js';
import { addEntry } from './sparse.js';

/** Boundary faces of one body (optionally of chosen CAD faces), with a bounding-box hash. */
export function faceIndex(model, body, faceIds = null) {
  const npf = model.faces.npf, list = [];
  const set = faceIds ? new Set(faceIds) : null;
  for (let f = 0; f < model.faces.nf; f++) if (model.faces.body[f] === body && (!set || set.has(model.faces.faceId[f]))) list.push(f);
  const cell = Math.max(1e-6, model.bodies[body].mesh.size);
  const buckets = new Map(), key = (i, j, k) => `${i},${j},${k}`;
  for (const f of list) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let a = 0; a < 3; a++) { const p = 3 * model.faces.nodes[npf * f + a]; for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], model.nodes[p + c]); hi[c] = Math.max(hi[c], model.nodes[p + c]); } }
    for (let i = Math.floor(lo[0] / cell); i <= Math.floor(hi[0] / cell); i++) for (let j = Math.floor(lo[1] / cell); j <= Math.floor(hi[1] / cell); j++) for (let k = Math.floor(lo[2] / cell); k <= Math.floor(hi[2] / cell); k++) {
      const kk = key(i, j, k); let b = buckets.get(kk); if (!b) buckets.set(kk, (b = [])); b.push(f);
    }
  }
  return { list, cell, near(p, r) {
    const out = new Set(), n = Math.ceil(r / cell);
    const ci = Math.floor(p[0] / cell), cj = Math.floor(p[1] / cell), ck = Math.floor(p[2] / cell);
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (let k = ck - n; k <= ck + n; k++) for (const f of buckets.get(key(i, j, k)) ?? []) out.add(f);
    return out;
  } };
}

/** Projection of p onto the straight (corner) triangle of face f: { d, l (area coords), point, normal }. */
export function projectOnFace(model, f, p, pos = model.nodes) {
  const npf = model.faces.npf, P = (a) => { const q = 3 * model.faces.nodes[npf * f + a]; return [pos[q], pos[q + 1], pos[q + 2]]; };
  const A = P(0), B = P(1), C = P(2);
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], w = [p[0] - A[0], p[1] - A[1], p[2] - A[2]];
  const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], uv = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const wu = w[0] * u[0] + w[1] * u[1] + w[2] * u[2], wv = w[0] * v[0] + w[1] * v[1] + w[2] * v[2], den = uu * vv - uv * uv;
  let s = (vv * wu - uv * wv) / den, t = (uu * wv - uv * wu) / den;
  if (s < 0) s = 0; if (t < 0) t = 0; if (s + t > 1) { const k = s + t; s /= k; t /= k; }
  const q = [A[0] + s * u[0] + t * v[0], A[1] + s * u[1] + t * v[1], A[2] + s * u[2] + t * v[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], nl = Math.hypot(...n) || 1;
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), l: [1 - s - t, s, t], point: q, normal: n.map((x) => x / nl) };
}

/** Linear sub-triangles of a face (local node indices) with the area coordinates of their corners on the face. */
const SUB6 = [[0, 3, 5], [3, 1, 4], [5, 4, 2], [3, 4, 5]];
const LOC6 = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]];
const SUB3 = [[0, 1, 2]];

/**
 * Mortar constraints of slave faces against a master (a function projecting a point: → { g0, n, ids, w } or null).
 * `pos` = current node coordinates (finite sliding re-projects with them).
 */
export function mortarConstraints(model, slaveFaces, project, { k, mu = 0, reach = Infinity, pos = model.nodes, tag = null } = {}) {
  const npf = model.faces.npf, order = model.order, subs = npf === 6 ? SUB6 : SUB3, loc = npf === 6 ? LOC6 : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const acc = new Map();          // slave node → { area, g, n[3], coef Map node → value }
  const N = new Float64Array(npf), Xf = new Float64Array(3 * npf);
  for (const f of slaveFaces) {
    const ids = []; for (let a = 0; a < npf; a++) { const id = model.faces.nodes[npf * f + a]; ids.push(id); Xf[3 * a] = pos[3 * id]; Xf[3 * a + 1] = pos[3 * id + 1]; Xf[3 * a + 2] = pos[3 * id + 2]; }
    for (const sub of subs) {
      // Straight sub-triangle area.
      const P = sub.map((a) => [Xf[3 * a], Xf[3 * a + 1], Xf[3 * a + 2]]);
      const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
      const area2 = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
      if (!(area2 > 0)) continue;
      for (let g = 0; g < TRI6.weights.length; g++) {
        const b = TRI6.points[g], w = TRI6.weights[g] * area2;       // ∫ over the sub-triangle (reference area 1/2 → ×2A·½)
        const l = [0, 1, 2].map((c) => b[0] * loc[sub[0]][c] + b[1] * loc[sub[1]][c] + b[2] * loc[sub[2]][c]);
        faceShape(order, l, N);
        const x = [0, 0, 0]; for (let a = 0; a < npf; a++) { x[0] += N[a] * Xf[3 * a]; x[1] += N[a] * Xf[3 * a + 1]; x[2] += N[a] * Xf[3 * a + 2]; }
        const pr = project(x);
        if (!pr || pr.g0 > reach) continue;
        for (let j = 0; j < 3; j++) {
          const sn = ids[sub[j]], Nt = b[j];
          if (!(Nt > 0)) continue;
          let r = acc.get(sn); if (!r) acc.set(sn, (r = { area: 0, g: 0, n: [0, 0, 0], coef: new Map() }));
          const wt = Nt * w;
          r.area += wt; r.g += wt * pr.g0;
          for (let c = 0; c < 3; c++) r.n[c] += wt * pr.n[c];
          for (let a = 0; a < npf; a++) if (N[a]) r.coef.set(ids[a], (r.coef.get(ids[a]) ?? 0) + wt * N[a]);
          for (let m = 0; m < pr.ids.length; m++) if (pr.w[m]) r.coef.set(pr.ids[m], (r.coef.get(pr.ids[m]) ?? 0) - wt * pr.w[m]);
        }
      }
    }
  }
  const out = [];
  for (const [s, r] of acc) {
    if (!(r.area > 0)) continue;
    const nl = Math.hypot(...r.n) || 1;
    const ids = [...r.coef.keys()], coef = ids.map((id) => r.coef.get(id) / r.area);
    out.push({ type: 'contact', mortar: true, s, ids: Int32Array.from(ids), coef: Float64Array.from(coef), n: r.n.map((v) => v / nl), g0: r.g / r.area, area: r.area, k, mu, tag });
  }
  return out;
}

/**
 * Contact constraints of a model: bonded ties (node-to-surface) and mortar no-penetration constraints between bodies
 * and against rigid walls. contacts 'bonded' | 'contact' | 'none' (every touching pair) or [{ a, b, type, facesA,
 * facesB, friction }]; walls [{ point, normal, body?, faceIds?, friction? }]; friction μ (default for all).
 * Returns { list, pairs (node pairs for the matrix pattern) }.
 */
export function contactConstraints(model, { contacts = 'none', walls = [], tolerance = null, contactStiffness = 200, bondedStiffness = 300, friction = 0, pos = model.nodes, method = 'node' } = {}) {
  const list = [], pairs = [];
  const bodyCount = model.bodies.length;
  let specs = [];
  if (Array.isArray(contacts)) specs = contacts.filter((c) => c && c.type !== 'none');
  else if (contacts && contacts !== 'none') for (let a = 0; a < bodyCount; a++) for (let b = a + 1; b < bodyCount; b++) specs.push({ a, b, type: contacts });
  const addPairs = (c) => { const ids = c.ids ?? [c.s, ...c.m]; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push(ids[i], ids[j]); };
  for (const sp of specs) {
    let A = sp.a, B = sp.b, facesA = sp.facesA ?? null, facesB = sp.facesB ?? null;
    if (model.bodies[A].mesh.size > model.bodies[B].mesh.size * 1.0001) { [A, B] = [B, A]; [facesA, facesB] = [facesB, facesA]; }
    const hA = model.bodies[A].mesh.size, hB = model.bodies[B].mesh.size, tol = tolerance ?? 0.35 * Math.min(hA, hB);
    const master = faceIndex(model, B, facesB);
    const slaveFaces = faceIndex(model, A, facesA).list;
    const E = Math.max(model.bodies[A].material.E, model.bodies[B].material.E);
    if (sp.type === 'bonded') {
      const { area } = nodalAreas(model, slaveFaces);
      const k = (bondedStiffness * E) / Math.min(hA, hB);
      for (const [s, aS] of area) {
        const p = [pos[3 * s], pos[3 * s + 1], pos[3 * s + 2]];
        let best = null;
        for (const f of master.near(p, tol)) { const r = projectOnFace(model, f, p, pos); if (r.d <= tol && (!best || r.d < best.r.d)) best = { f, r }; }
        if (!best) continue;
        const npf = model.faces.npf, m = [], w = [];
        const N = faceShape(model.order, best.r.l);
        for (let a = 0; a < npf; a++) { m.push(model.faces.nodes[npf * best.f + a]); w.push(N[a]); }
        const c = { type: 'bonded', s, m, w, n: best.r.normal, g0: 0, area: aS, k, pair: [A, B] };
        list.push(c); addPairs(c);
      }
      continue;
    }
    const k = (contactStiffness * E) / Math.min(hA, hB), mu = sp.friction ?? friction;
    const npf = model.faces.npf;
    const project = (x) => {
      let best = null;
      for (const f of master.near(x, tol)) { const r = projectOnFace(model, f, x, pos); if (r.d <= tol && (!best || r.d < best.r.d)) best = { f, r }; }
      if (!best) return null;
      const g0 = (x[0] - best.r.point[0]) * best.r.normal[0] + (x[1] - best.r.point[1]) * best.r.normal[1] + (x[2] - best.r.point[2]) * best.r.normal[2];
      const N = faceShape(model.order, best.r.l), ids = [];
      for (let a = 0; a < npf; a++) ids.push(model.faces.nodes[npf * best.f + a]);
      return { g0, n: best.r.normal, ids, w: Array.from(N) };
    };
    if (method === 'mortar') { for (const c of mortarConstraints(model, slaveFaces, project, { k, mu, pos, tag: [A, B] })) { list.push(c); addPairs(c); } continue; }
    // Node-to-surface: each slave node against its projection.
    const { area } = nodalAreas(model, slaveFaces);
    for (const [sN, aS] of area) {
      const pr = project([pos[3 * sN], pos[3 * sN + 1], pos[3 * sN + 2]]);
      if (!pr) continue;
      const c = { type: 'contact', s: sN, m: pr.ids, w: pr.w, n: pr.n, g0: pr.g0, area: aS, k, mu, tag: [A, B] };
      list.push(c); addPairs(c);
    }
  }
  for (const wall of walls ?? []) {
    const nl = Math.hypot(...wall.normal) || 1, n = wall.normal.map((x) => x / nl);
    const bodies = wall.body != null ? [wall.body] : model.bodies.map((_, b) => b);
    for (const b of bodies) {
      const faces = wall.faceIds ? selectFaces(model, wall.faceIds.map((faceId) => ({ body: b, faceId }))) : faceIndex(model, b).list;
      const h = model.bodies[b].mesh.size, k = (contactStiffness * model.bodies[b].material.E) / h, reach = wall.reach ?? 0.25 * h;
      const project = (x) => ({ g0: (x[0] - wall.point[0]) * n[0] + (x[1] - wall.point[1]) * n[1] + (x[2] - wall.point[2]) * n[2], n, ids: [], w: [] });
      if (method === 'mortar') { for (const c of mortarConstraints(model, faces, project, { k, mu: wall.friction ?? friction, reach, pos, tag: 'wall' })) { c.wall = true; list.push(c); addPairs(c); } continue; }
      const { area } = nodalAreas(model, faces);
      for (const [sN, aS] of area) {
        const pr = project([pos[3 * sN], pos[3 * sN + 1], pos[3 * sN + 2]]);
        if (pr.g0 > reach) continue;
        list.push({ type: 'contact', s: sN, m: [], w: [], n, g0: pr.g0, area: aS, k, mu: wall.friction ?? friction, wall: true, tag: 'wall' });
      }
    }
  }
  return { list, pairs: pairs.length ? Int32Array.from(pairs) : null };
}

export const idsOf = (c) => c.ids ?? [c.s, ...c.m];
export const coefOf = (c) => c.coef ?? [1, ...c.w.map((x) => -x)];

/** Adds kA·(d⊗c)(d⊗c)ᵀ for direction d (bonded: every direction). */
export function addPenalty(K, c, dir = c.n, kA = c.k * c.area) {
  const ids = idsOf(c), coef = coefOf(c);
  if (c.type === 'bonded') {
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) { const v = kA * coef[i] * coef[j]; if (v) for (let d = 0; d < 3; d++) addEntry(K, 3 * ids[i] + d, 3 * ids[j] + d, v); }
    return;
  }
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
    const v = kA * coef[i] * coef[j];
    if (!v) continue;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { const x = v * dir[a] * dir[b]; if (x) addEntry(K, 3 * ids[i] + a, 3 * ids[j] + b, x); }
  }
}

/** d·Σ coef·u (the gap change along d). */
export function jump(c, u, dir = c.n) {
  const ids = idsOf(c), coef = coefOf(c);
  let x = 0;
  for (let i = 0; i < ids.length; i++) { const d = 3 * ids[i]; x += coef[i] * (u[d] * dir[0] + u[d + 1] * dir[1] + u[d + 2] * dir[2]); }
  return x;
}
/** Σ coef·u (vector). */
export function vectorJump(c, u) {
  const ids = idsOf(c), coef = coefOf(c), g = [0, 0, 0];
  for (let i = 0; i < ids.length; i++) for (let d = 0; d < 3; d++) g[d] += coef[i] * u[3 * ids[i] + d];
  return g;
}
/** Adds s·(d⊗c) to b (a force along d spread over the constraint's nodes). */
export function addForce(b, c, dir, s) {
  const ids = idsOf(c), coef = coefOf(c);
  for (let q = 0; q < ids.length; q++) for (let a = 0; a < 3; a++) b[3 * ids[q] + a] += s * coef[q] * dir[a];
}
/** Two unit tangents of a normal. */
export function tangents(n) {
  const t0 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = t0[0] * n[0] + t0[1] * n[1] + t0[2] * n[2];
  let t1 = [t0[0] - d * n[0], t0[1] - d * n[1], t0[2] - d * n[2]];
  const l = Math.hypot(...t1); t1 = t1.map((v) => v / l);
  return [t1, [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]]];
}
