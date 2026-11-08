// Seam-based unwrapping: faces split into islands along the seams, each island is flattened by least-squares conformal
// maps (LSCM: the angles stay as close to the originals as the shape allows), and the islands are packed into the unit
// square at one common scale. Closed islands cannot lie flat, so a closed island with no seams is first cut by normal.
import { edgeKey, edgeMap, faceArea, faceNormal, triangulateFace, v3 } from './mesh.js';

/** The faces connected across edges that are not seams. Returns arrays of face indices. */
export function findIslands(mesh, faces = null) {
  const wanted = faces ? new Set(faces) : null;
  const edges = edgeMap(mesh);
  const seams = mesh.marks?.seam ?? {};
  const parent = new Map();
  for (let f = 0; f < mesh.faces.length; f++) if (!wanted || wanted.has(f)) parent.set(f, f);
  const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
  for (const [key, e] of edges) {
    if (seams[key] || e.faces.length !== 2) continue;
    const [f, g] = e.faces;
    if (parent.has(f) && parent.has(g)) parent.set(find(f), find(g));
  }
  const groups = new Map();
  for (const f of parent.keys()) { const r = find(f); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); }
  return [...groups.values()];
}

/** Whether an island has an open border (a seam counts as a border): only then can it flatten. */
function isOpen(mesh, island, edges) {
  const inside = new Set(island);
  const seams = mesh.marks?.seam ?? {};
  for (const f of island) {
    const face = mesh.faces[f];
    for (let i = 0; i < face.length; i++) {
      const key = edgeKey(face[i], face[(i + 1) % face.length]);
      const e = edges.get(key);
      if (seams[key] || e.faces.filter((g) => inside.has(g)).length < 2) return true;
    }
  }
  return false;
}

/** Cuts a closed island by the main direction of each face's normal: up to six open pieces. */
function cutClosedIsland(mesh, island) {
  const groups = new Map();
  for (const f of island) {
    const n = faceNormal(mesh, mesh.faces[f]);
    const axis = [0, 1, 2].reduce((best, k) => (Math.abs(n[k]) > Math.abs(n[best]) ? k : best), 0);
    const key = axis * 2 + (n[axis] < 0 ? 1 : 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  // A piece may fall apart into several; each must be connected for the solver.
  const out = [];
  for (const piece of groups.values()) {
    const inside = new Set(piece);
    const seen = new Set();
    const byEdge = new Map();
    for (const f of piece) {
      const face = mesh.faces[f];
      for (let i = 0; i < face.length; i++) {
        const key = edgeKey(face[i], face[(i + 1) % face.length]);
        if (!byEdge.has(key)) byEdge.set(key, []);
        byEdge.get(key).push(f);
      }
    }
    for (const start of piece) {
      if (seen.has(start)) continue;
      const part = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const f = stack.pop();
        part.push(f);
        const face = mesh.faces[f];
        for (let i = 0; i < face.length; i++) {
          for (const g of byEdge.get(edgeKey(face[i], face[(i + 1) % face.length])) ?? []) {
            if (inside.has(g) && !seen.has(g)) { seen.add(g); stack.push(g); }
          }
        }
      }
      out.push(part);
    }
  }
  return out;
}

/**
 * Flattens one open island. Returns per-face UVs: Map face → [[u,v], …], at the size of the 3D surface.
 * The corners of faces that meet across a seam get separate UV vertices.
 */
/**
 * Angle Based Flattening (Sheffer and de Sturler): the angles nearest the 3D ones, weighted by 1/angle², that can lie flat. Each triangle's angles sum to π, those
 * around an inner vertex to 2π, and the sines around one multiply out the same each way (the wheel condition, in logs). Gauss-Newton on these constraints, with
 * the normal equations solved by conjugate gradients. Returns three angles per triangle, or null when it does not settle, and the caller goes on with the 3D shape.
 */
function flatAngles(triangles, position, vertexCount) {
  const T = triangles.length;
  const beta = new Float64Array(T * 3);
  const angle = (a, b, c) => { const [u, w] = [v3.norm(v3.sub(b, a)), v3.norm(v3.sub(c, a))]; return Math.acos(Math.max(-1, Math.min(1, v3.dot(u, w)))); };
  triangles.forEach(([a, b, c], t) => {
    beta[t * 3] = Math.max(1e-3, angle(position[a], position[b], position[c]));
    beta[t * 3 + 1] = Math.max(1e-3, angle(position[b], position[c], position[a]));
    beta[t * 3 + 2] = Math.max(1e-3, angle(position[c], position[a], position[b]));
  });
  // Inner vertices: every edge around them has two triangles.
  const edgeUse = new Map();
  triangles.forEach((tri) => tri.forEach((v, k) => { const w = tri[(k + 1) % 3]; const key = v < w ? `${v}_${w}` : `${w}_${v}`; edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1); }));
  const border = new Uint8Array(vertexCount);
  for (const [key, count] of edgeUse) if (count !== 2) for (const v of key.split('_')) border[Number(v)] = 1;
  const around = Array.from({ length: vertexCount }, () => []);
  triangles.forEach((tri, t) => tri.forEach((v, k) => around[v].push(t * 3 + k)));
  const inner = [];
  for (let v = 0; v < vertexCount; v++) if (!border[v] && around[v].length) inner.push(v);
  // The goal at an inner vertex: its angles scaled to fill the circle.
  for (const v of inner) {
    const sum = around[v].reduce((x, a) => x + beta[a], 0);
    for (const a of around[v]) beta[a] *= (2 * Math.PI) / sum;
  }
  const weight = beta.map((b) => 1 / (b * b));
  const x = Float64Array.from(beta);
  const next = (a) => (a % 3 === 2 ? a - 2 : a + 1);
  const previous = (a) => (a % 3 === 0 ? a + 2 : a - 1);
  const C = T + inner.length * 2;
  const residual = new Float64Array(C);
  const evaluate = () => {
    for (let t = 0; t < T; t++) residual[t] = x[t * 3] + x[t * 3 + 1] + x[t * 3 + 2] - Math.PI;
    inner.forEach((v, i) => {
      let [sum, wheel] = [-2 * Math.PI, 0];
      for (const a of around[v]) {
        sum += x[a];
        wheel += Math.log(Math.max(1e-9, Math.sin(x[next(a)]))) - Math.log(Math.max(1e-9, Math.sin(x[previous(a)])));
      }
      residual[T + i * 2] = sum;
      residual[T + i * 2 + 1] = wheel;
    });
  };
  /** J·v and Jᵀ·v for the constraints at the current angles. */
  const times = (v, out) => {
    for (let t = 0; t < T; t++) out[t] = v[t * 3] + v[t * 3 + 1] + v[t * 3 + 2];
    inner.forEach((vertex, i) => {
      let [sum, wheel] = [0, 0];
      for (const a of around[vertex]) {
        sum += v[a];
        wheel += v[next(a)] / Math.tan(x[next(a)]) - v[previous(a)] / Math.tan(x[previous(a)]);
      }
      out[T + i * 2] = sum;
      out[T + i * 2 + 1] = wheel;
    });
  };
  const timesT = (v, out) => {
    out.fill(0);
    for (let t = 0; t < T; t++) { out[t * 3] += v[t]; out[t * 3 + 1] += v[t]; out[t * 3 + 2] += v[t]; }
    inner.forEach((vertex, i) => {
      for (const a of around[vertex]) {
        out[a] += v[T + i * 2];
        out[next(a)] += v[T + i * 2 + 1] / Math.tan(x[next(a)]);
        out[previous(a)] -= v[T + i * 2 + 1] / Math.tan(x[previous(a)]);
      }
    });
  };
  const [gradient, step, jt] = [new Float64Array(T * 3), new Float64Array(T * 3), new Float64Array(T * 3)];
  const [lambda, right, r, p, q] = Array.from({ length: 5 }, () => new Float64Array(C));
  const apply = (input, output) => {
    timesT(input, jt);
    for (let a = 0; a < jt.length; a++) jt[a] /= 2 * weight[a];
    times(jt, output);
    for (let c = 0; c < C; c++) output[c] += 1e-10 * input[c];
  };
  for (let round = 0; round < 8; round++) {
    evaluate();
    if (Math.max(...residual.map(Math.abs)) < 1e-6 && round > 0) break;
    for (let a = 0; a < gradient.length; a++) gradient[a] = 2 * weight[a] * (x[a] - beta[a]);
    // Solve J H⁻¹ Jᵀ λ = J H⁻¹ g − c for the multipliers.
    for (let a = 0; a < gradient.length; a++) step[a] = gradient[a] / (2 * weight[a]);
    times(step, right);
    for (let c = 0; c < C; c++) right[c] -= residual[c];
    lambda.fill(0);
    r.set(right);
    p.set(r);
    let rr = r.reduce((sum, value) => sum + value * value, 0);
    const start = rr || 1;
    for (let i = 0; i < Math.min(2000, C * 4 + 20) && rr > start * 1e-16; i++) {
      apply(p, q);
      let pq = 0;
      for (let c = 0; c < C; c++) pq += p[c] * q[c];
      if (Math.abs(pq) < 1e-30) break;
      const alpha = rr / pq;
      let nextR = 0;
      for (let c = 0; c < C; c++) { lambda[c] += alpha * p[c]; r[c] -= alpha * q[c]; nextR += r[c] * r[c]; }
      const b = nextR / rr;
      rr = nextR;
      for (let c = 0; c < C; c++) p[c] = r[c] + b * p[c];
    }
    timesT(lambda, jt);
    for (let a = 0; a < x.length; a++) x[a] = Math.max(1e-3, Math.min(Math.PI - 1e-3, x[a] - (gradient[a] - jt[a]) / (2 * weight[a])));
    if (x.some(Number.isNaN)) return null;
  }
  evaluate();
  return Math.max(...residual.map(Math.abs)) < 0.05 ? x : null;
}

function flattenIsland(mesh, island, method = 'ANGLE_BASED') {
  const seams = mesh.marks?.seam ?? {};
  // UV vertices: corners joined across the edges of this island that are not seams.
  const offset = new Map();
  let count = 0;
  for (const f of island) { offset.set(f, count); count += mesh.faces[f].length; }
  const parent = new Int32Array(count).map((_, i) => i);
  const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; } return r; };
  const byEdge = new Map();
  for (const f of island) {
    const face = mesh.faces[f];
    for (let i = 0; i < face.length; i++) {
      const key = edgeKey(face[i], face[(i + 1) % face.length]);
      if (seams[key]) continue;
      if (!byEdge.has(key)) byEdge.set(key, []);
      byEdge.get(key).push([f, i, (i + 1) % face.length]);
    }
  }
  for (const list of byEdge.values()) {
    if (list.length !== 2) continue;
    const [[f, i0, i1], [g, j0, j1]] = list;
    const [A, B] = [mesh.faces[f], mesh.faces[g]];
    const [cf, cg] = [offset.get(f), offset.get(g)];
    if (A[i0] === B[j0]) { parent[find(cf + i0)] = find(cg + j0); parent[find(cf + i1)] = find(cg + j1); } else { parent[find(cf + i0)] = find(cg + j1); parent[find(cf + i1)] = find(cg + j0); }
  }
  const idOf = new Map();
  const position = [];
  const uvVert = new Int32Array(count);
  for (const f of island) {
    const face = mesh.faces[f];
    face.forEach((v, k) => {
      const root = find(offset.get(f) + k);
      if (!idOf.has(root)) { idOf.set(root, position.length); position.push(mesh.verts[v]); }
      uvVert[offset.get(f) + k] = idOf.get(root);
    });
  }
  const n = position.length;

  // The two pinned UV vertices: as far apart as can quickly be found.
  const farthest = (from) => { let best = 0; let d = -1; position.forEach((p, i) => { const x = v3.dist(p, from); if (x > d) { d = x; best = i; } }); return best; };
  const pinA = farthest(position[0]);
  const pinB = farthest(position[pinA]);
  const span = v3.dist(position[pinA], position[pinB]) || 1;

  // Angle based: first the angles a flat layout would ideally have; each triangle's target shape comes from them.
  const triangles = [];
  for (const f of island) for (const t of triangulateFace(mesh, mesh.faces[f])) triangles.push(t.map((k) => uvVert[offset.get(f) + k]));
  const targets = method === 'ANGLE_BASED' ? flatAngles(triangles, position, n) : null;
  let triangleIndex = -1;

  // LSCM energy as rows of a sparse complex matrix: for each triangle Σ (Wk)·zk, in real form.
  const rows = [];
  for (const f of island) {
    const face = mesh.faces[f];
    for (const t of triangulateFace(mesh, face)) {
      triangleIndex++;
      const [a, b, c] = t.map((k) => position[uvVert[offset.get(f) + k]]);
      const ids = t.map((k) => uvVert[offset.get(f) + k]);
      const e1 = v3.sub(b, a);
      const e2 = v3.sub(c, a);
      const x2 = v3.len(e1);
      if (x2 < 1e-12) continue;
      const ex = v3.mul(e1, 1 / x2);
      let x3 = v3.dot(e2, ex);
      let y3 = v3.len(v3.sub(e2, v3.mul(ex, x3)));
      if (targets) {
        // The triangle with the angles asked for, at the same long side: by the law of sines.
        const [angleA, angleB, angleC] = targets.slice(triangleIndex * 3, triangleIndex * 3 + 3);
        const across = (x2 * Math.sin(angleB)) / Math.max(1e-6, Math.sin(angleC));
        x3 = across * Math.cos(angleA);
        y3 = across * Math.sin(angleA);
      }
      const area2 = x2 * y3;
      if (area2 < 1e-14) continue;
      const s = 1 / Math.sqrt(area2);
      // W = (x3 − x2 + i·y3, −x3 − i·y3, x2) in the triangle's own frame.
      rows.push({ ids, wr: [(x3 - x2) * s, -x3 * s, x2 * s], wi: [y3 * s, -y3 * s, 0] });
    }
  }

  // Unknowns: u and v for every vertex that is not pinned.
  const pinned = new Map([[pinA, [0, 0]], [pinB, [span, 0]]]);
  const index = new Int32Array(n).fill(-1);
  let unknowns = 0;
  for (let i = 0; i < n; i++) if (!pinned.has(i)) index[i] = unknowns++;
  const size = unknowns * 2;
  const u = new Float64Array(n);
  const w = new Float64Array(n);
  pinned.forEach(([x, y], i) => { u[i] = x; w[i] = y; });

  // A rough start (projection on the island's own plane) keeps the conjugate gradients short.
  let normal = [0, 0, 0];
  for (const f of island) normal = v3.add(normal, v3.mul(faceNormal(mesh, mesh.faces[f]), faceArea(mesh, mesh.faces[f])));
  normal = v3.norm(normal);
  const axisU = v3.norm(v3.sub(position[pinB], position[pinA]));
  let axisV = v3.cross(normal, axisU);
  if (v3.len(axisV) < 1e-6) axisV = v3.cross(axisU, Math.abs(axisU[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
  axisV = v3.norm(axisV);

  const x = new Float64Array(size);
  for (let i = 0; i < n; i++) {
    if (index[i] < 0) continue;
    const r = v3.sub(position[i], position[pinA]);
    x[index[i] * 2] = v3.dot(r, axisU);
    x[index[i] * 2 + 1] = v3.dot(r, axisV);
  }

  // Applies AᵀA (with the pinned vertices held at zero) to a vector.
  const multiply = (input, output) => {
    output.fill(0);
    for (const row of rows) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < 3; k++) {
        const j = index[row.ids[k]];
        if (j < 0) continue;
        const [a, b] = [input[j * 2], input[j * 2 + 1]];
        re += row.wr[k] * a - row.wi[k] * b;
        im += row.wi[k] * a + row.wr[k] * b;
      }
      for (let k = 0; k < 3; k++) {
        const j = index[row.ids[k]];
        if (j < 0) continue;
        output[j * 2] += row.wr[k] * re + row.wi[k] * im;
        output[j * 2 + 1] += -row.wi[k] * re + row.wr[k] * im;
      }
    }
  };
  // Right side: −Aᵀ·(what the pinned vertices contribute).
  const b = new Float64Array(size);
  for (const row of rows) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < 3; k++) {
      const id = row.ids[k];
      if (index[id] >= 0) continue;
      re += row.wr[k] * u[id] - row.wi[k] * w[id];
      im += row.wi[k] * u[id] + row.wr[k] * w[id];
    }
    for (let k = 0; k < 3; k++) {
      const j = index[row.ids[k]];
      if (j < 0) continue;
      b[j * 2] -= row.wr[k] * re + row.wi[k] * im;
      b[j * 2 + 1] -= -row.wi[k] * re + row.wr[k] * im;
    }
  }
  // Jacobi-preconditioned conjugate gradients.
  const diag = new Float64Array(size);
  for (const row of rows) for (let k = 0; k < 3; k++) {
    const j = index[row.ids[k]];
    if (j < 0) continue;
    const d = row.wr[k] * row.wr[k] + row.wi[k] * row.wi[k];
    diag[j * 2] += d;
    diag[j * 2 + 1] += d;
  }
  if (size) {
    const r = new Float64Array(size);
    const q = new Float64Array(size);
    multiply(x, q);
    for (let i = 0; i < size; i++) r[i] = b[i] - q[i];
    const z = new Float64Array(size);
    const p = new Float64Array(size);
    for (let i = 0; i < size; i++) { z[i] = r[i] / (diag[i] || 1); p[i] = z[i]; }
    let rz = 0;
    for (let i = 0; i < size; i++) rz += r[i] * z[i];
    const start = Math.sqrt(r.reduce((s, c) => s + c * c, 0)) || 1;
    for (let iter = 0, limit = Math.min(4000, size * 4 + 50); iter < limit; iter++) {
      multiply(p, q);
      let pq = 0;
      for (let i = 0; i < size; i++) pq += p[i] * q[i];
      if (Math.abs(pq) < 1e-30) break;
      const alpha = rz / pq;
      let norm = 0;
      for (let i = 0; i < size; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; norm += r[i] * r[i]; }
      if (Math.sqrt(norm) < 1e-9 * start) break;
      let next = 0;
      for (let i = 0; i < size; i++) { z[i] = r[i] / (diag[i] || 1); next += r[i] * z[i]; }
      const beta = next / rz;
      rz = next;
      for (let i = 0; i < size; i++) p[i] = z[i] + beta * p[i];
    }
  }
  for (let i = 0; i < n; i++) if (index[i] >= 0) { u[i] = x[index[i] * 2]; w[i] = x[index[i] * 2 + 1]; }

  // Front faces stay counter-clockwise in UV space, and the size matches the 3D surface.
  let area2D = 0;
  let area3D = 0;
  const out = new Map();
  for (const f of island) {
    const face = mesh.faces[f];
    const uv = face.map((_, k) => { const id = uvVert[offset.get(f) + k]; return [u[id], w[id]]; });
    out.set(f, uv);
    for (let i = 0; i < uv.length; i++) { const [p, q] = [uv[i], uv[(i + 1) % uv.length]]; area2D += p[0] * q[1] - q[0] * p[1]; }
    area3D += faceArea(mesh, face);
  }
  area2D /= 2;
  const flip = area2D < 0 ? -1 : 1;
  const scale = Math.sqrt(area3D / Math.max(1e-12, Math.abs(area2D)));
  for (const uv of out.values()) for (const p of uv) { p[0] *= scale; p[1] *= scale * flip; }
  return out;
}

/** Shelf packing into the unit square: tallest islands first, one common scale so that texel density stays even. */
export function packIslands(islands, margin = 0.01) {
  const boxes = islands.map((uvs) => {
    const min = [Infinity, Infinity];
    const max = [-Infinity, -Infinity];
    for (const uv of uvs.values()) for (const p of uv) for (let k = 0; k < 2; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    return { uvs, min, w: max[0] - min[0], h: max[1] - min[1] };
  }).sort((a, b) => b.h - a.h);
  const totalArea = boxes.reduce((s, b) => s + b.w * b.h, 0) || 1;
  const tryPack = (width) => {
    let [x, y, shelf] = [0, 0, 0];
    let used = 0;
    const places = [];
    for (const b of boxes) {
      if (x > 0 && x + b.w > width) { y += shelf + margin * width; x = 0; shelf = 0; }
      places.push([x, y]);
      x += b.w + margin * width;
      shelf = Math.max(shelf, b.h);
      used = Math.max(used, x - margin * width);
    }
    return { places, size: Math.max(used, y + shelf) };
  };
  // A square shelf layout: try widths around the square root of the total area.
  let best = null;
  const widest = Math.max(...boxes.map((b) => b.w), 0);
  for (const k of [0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2, 2.5, 3]) {
    const packed = tryPack(Math.max(widest, Math.sqrt(totalArea) * k));
    if (!best || packed.size < best.size) best = packed;
  }
  const scale = best && best.size > 0 ? (1 - margin * 2) / best.size : 1;
  boxes.forEach((b, i) => {
    const [ox, oy] = best.places[i];
    for (const uv of b.uvs.values()) for (const p of uv) {
      p[0] = margin + (p[0] - b.min[0] + ox) * scale;
      p[1] = margin + (p[1] - b.min[1] + oy) * scale;
    }
  });
  return scale;
}

/**
 * Unwraps the mesh (or just `faces`) along its seams. Other faces keep their UVs.
 * Returns { islands, autoCut }; `autoCut` counts closed islands that had to be cut because no seam opened them.
 */
export function unwrapSeams(mesh, { faces = null, margin = 0.01, method = 'ANGLE_BASED' } = {}) {
  const edges = edgeMap(mesh);
  let autoCut = 0;
  const pieces = [];
  for (const island of findIslands(mesh, faces)) {
    if (isOpen(mesh, island, edges)) pieces.push(island);
    else { autoCut++; pieces.push(...cutClosedIsland(mesh, island)); }
  }
  const flat = pieces.map((island) => flattenIsland(mesh, island, method));
  // An island with pins stays where its pins are; only the others are packed around.
  const held = [];
  const free = [];
  flat.forEach((uvs) => { (holdToPins(mesh, uvs) ? held : free).push(uvs); });
  packIslands(free, margin);
  mesh.uvs ??= mesh.faces.map(() => null);
  for (const uvs of [...free, ...held]) for (const [f, uv] of uvs) mesh.uvs[f] = uv;
  return { islands: flat.length, autoCut };
}

/** Fits an unwrapped island onto its pinned corners' old places: moved for one pin, also turned and scaled for more. Pins land exactly. */
function holdToPins(mesh, uvs) {
  const pins = mesh.uvPins;
  if (!pins || !mesh.uvs) return false;
  const pairs = [];
  for (const [f, uv] of uvs) uv.forEach((now, i) => { const was = mesh.uvs[f]?.[i]; if (pins[`${f}:${i}`] && was) pairs.push({ f, i, now, was }); });
  if (!pairs.length) return false;
  const mean = (list) => [list.reduce((s, x) => s + x[0], 0) / list.length, list.reduce((s, x) => s + x[1], 0) / list.length];
  const [mNow, mWas] = [mean(pairs.map((p) => p.now)), mean(pairs.map((p) => p.was))];
  let [a, b, d] = [0, 0, 0];
  for (const { now, was } of pairs) {
    const [x, y] = [now[0] - mNow[0], now[1] - mNow[1]];
    const [u, v] = [was[0] - mWas[0], was[1] - mWas[1]];
    a += x * u + y * v;
    b += x * v - y * u;
    d += x * x + y * y;
  }
  const [ca, cb] = d > 1e-12 ? [a / d, b / d] : [1, 0];
  for (const [f, uv] of uvs) uv.forEach((p, i) => {
    const [x, y] = [p[0] - mNow[0], p[1] - mNow[1]];
    uv[i] = [x * ca - y * cb + mWas[0], x * cb + y * ca + mWas[1]];
    void f;
  });
  for (const { f, i, was } of pairs) uvs.get ? (uvs.get(f)[i] = [...was]) : (uvs.find(([g]) => g === f)[1][i] = [...was]);
  return true;
}

const cornersOf = (list) => list.map(([f, i]) => [Math.round(f), Math.round(i)]);

/** Marks corners so a later unwrap keeps them where they are. */
export function pinUVs(mesh, corners, on = true) {
  mesh.uvPins ??= {};
  for (const [f, i] of cornersOf(corners)) { if (on) mesh.uvPins[`${f}:${i}`] = true; else delete mesh.uvPins[`${f}:${i}`]; }
}

/** All the given corners to their common middle. */
export function weldUVs(mesh, corners) {
  const list = cornersOf(corners).filter(([f, i]) => mesh.uvs?.[f]?.[i]);
  if (!list.length) return;
  const mid = [0, 1].map((k) => list.reduce((s, [f, i]) => s + mesh.uvs[f][i][k], 0) / list.length);
  for (const [f, i] of list) mesh.uvs[f][i] = [...mid];
}

/** The given corners onto one line, at their mean. */
export function alignUVs(mesh, corners, axis = 'U') {
  const list = cornersOf(corners).filter(([f, i]) => mesh.uvs?.[f]?.[i]);
  if (!list.length) return;
  const k = axis === 'U' ? 0 : 1;
  const mid = list.reduce((s, [f, i]) => s + mesh.uvs[f][i][k], 0) / list.length;
  for (const [f, i] of list) mesh.uvs[f][i][k] = mid;
}

/** Faces whose UVs meet at shared corners: UV-connected islands. */
function uvIslands(mesh) {
  const parent = mesh.faces.map((_, f) => f);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const at = new Map();
  mesh.faces.forEach((face, f) => {
    const uv = mesh.uvs?.[f];
    if (!uv) return;
    face.forEach((v, i) => {
      const key = `${v}|${uv[i][0].toFixed(5)}|${uv[i][1].toFixed(5)}`;
      if (at.has(key)) parent[find(f)] = find(at.get(key)); else at.set(key, f);
    });
  });
  return mesh.faces.map((_, f) => find(f));
}

/**
 * Brings another island to the one holding the first given corner: whichever island shares mesh vertices with the selected corners is moved, turned and
 * scaled so that those vertices land on the selected corners, and then they are the same UV points.
 */
export function stitchUVs(mesh, corners) {
  const list = cornersOf(corners).filter(([f, i]) => mesh.uvs?.[f]?.[i]);
  if (!list.length) return 0;
  const islands = uvIslands(mesh);
  const home = islands[list[0][0]];
  const targets = new Map();
  for (const [f, i] of list) if (islands[f] === home) targets.set(mesh.faces[f][i], mesh.uvs[f][i]);
  const moved = new Map();
  mesh.faces.forEach((face, f) => {
    if (!mesh.uvs[f] || islands[f] === home) return;
    face.forEach((v, i) => { if (targets.has(v)) { if (!moved.has(islands[f])) moved.set(islands[f], []); moved.get(islands[f]).push({ now: mesh.uvs[f][i], was: targets.get(v) }); } });
  });
  for (const [island, pairs] of moved) {
    const mean = (name) => [0, 1].map((k) => pairs.reduce((s, p) => s + p[name][k], 0) / pairs.length);
    const [mNow, mWas] = [mean('now'), mean('was')];
    let [a, b, d] = [0, 0, 0];
    for (const { now, was } of pairs) {
      const [x, y, u, v] = [now[0] - mNow[0], now[1] - mNow[1], was[0] - mWas[0], was[1] - mWas[1]];
      a += x * u + y * v;
      b += x * v - y * u;
      d += x * x + y * y;
    }
    const [ca, cb] = d > 1e-12 ? [a / d, b / d] : [1, 0];
    mesh.faces.forEach((_, f) => {
      if (islands[f] !== island || !mesh.uvs[f]) return;
      mesh.uvs[f] = mesh.uvs[f].map((p) => { const [x, y] = [p[0] - mNow[0], p[1] - mNow[1]]; return [x * ca - y * cb + mWas[0], x * cb + y * ca + mWas[1]]; });
    });
  }
  return moved.size;
}

/**
 * Evens out the UVs: UV edges act as springs towards their length on the model at the island's own scale. Pinned corners stay. Returns how uneven the
 * edges were, before and after, as the spread of (UV length / 3D length).
 */
export function minimizeStretch(mesh, { iterations = 50 } = {}) {
  if (!mesh.uvs) return null;
  const points = new Map(); // UV point: { x, y, corners: [[f, i]], held }
  const idOf = (f, i) => `${mesh.faces[f][i]}|${mesh.uvs[f][i][0].toFixed(5)}|${mesh.uvs[f][i][1].toFixed(5)}`;
  mesh.faces.forEach((face, f) => {
    if (!mesh.uvs[f]) return;
    face.forEach((_, i) => {
      const key = idOf(f, i);
      if (!points.has(key)) points.set(key, { x: mesh.uvs[f][i][0], y: mesh.uvs[f][i][1], corners: [], held: false });
      const p = points.get(key);
      p.corners.push([f, i]);
      if (mesh.uvPins?.[`${f}:${i}`]) p.held = true;
    });
  });
  const seen = new Set();
  const springs = [];
  mesh.faces.forEach((face, f) => {
    if (!mesh.uvs[f]) return;
    face.forEach((_, i) => {
      const j = (i + 1) % face.length;
      const [ka, kb] = [idOf(f, i), idOf(f, j)];
      const key = ka < kb ? `${ka}/${kb}` : `${kb}/${ka}`;
      if (seen.has(key)) return;
      seen.add(key);
      springs.push({ a: points.get(ka), b: points.get(kb), length: v3.dist(mesh.verts[face[i]], mesh.verts[face[j]]) });
    });
  });
  const spread = () => {
    const ratios = springs.filter((s) => s.length > 1e-9).map((s) => Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y) / s.length);
    if (!ratios.length) return 0;
    const mean = ratios.reduce((x, y) => x + y, 0) / ratios.length;
    return Math.sqrt(ratios.reduce((x, y) => x + (y - mean) ** 2, 0) / ratios.length) / (mean || 1);
  };
  const before = spread();
  // A common scale, so that the springs neither shrink nor grow the layout.
  const scale = (() => { let [u, m] = [0, 0]; for (const s of springs) { u += Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y); m += s.length; } return m > 0 ? u / m : 1; })();
  for (let it = 0; it < iterations; it++) {
    for (const s of springs) {
      const [dx, dy] = [s.b.x - s.a.x, s.b.y - s.a.y];
      const l = Math.hypot(dx, dy) || 1e-9;
      const k = ((l - s.length * scale) / l) * 0.25;
      if (!s.a.held) { s.a.x += dx * k; s.a.y += dy * k; }
      if (!s.b.held) { s.b.x -= dx * k; s.b.y -= dy * k; }
    }
  }
  for (const p of points.values()) for (const [f, i] of p.corners) mesh.uvs[f][i] = [p.x, p.y];
  return { before, after: spread() };
}

/**
 * How much of the used UV area lies under more than one face (0…1). Painting needs this near 0: a shared texel shows on
 * every face that uses it. Rasterized on a coarse grid, which is plenty to tell a layout from a stack of faces.
 */
export function uvOverlap(mesh, resolution = 128) {
  if (!mesh.uvs) return 0;
  const cover = new Uint16Array(resolution * resolution);
  mesh.faces.forEach((face, f) => {
    const uv = mesh.uvs[f];
    if (!uv) return;
    for (const t of triangulateFace(mesh, face)) {
      const [a, b, c] = t.map((k) => [uv[k][0] * resolution, uv[k][1] * resolution]);
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(det) < 1e-9) continue;
      const [x0, x1] = [Math.floor(Math.min(a[0], b[0], c[0])), Math.ceil(Math.max(a[0], b[0], c[0]))];
      const [y0, y1] = [Math.floor(Math.min(a[1], b[1], c[1])), Math.ceil(Math.max(a[1], b[1], c[1]))];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const [px, py] = [x + 0.5, y + 0.5];
        const l0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det;
        const l1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det;
        // Strictly inside: two faces that only share a border are not an overlap.
        if (l0 <= 1e-6 || l1 <= 1e-6 || 1 - l0 - l1 <= 1e-6) continue;
        const [wx, wy] = [((x % resolution) + resolution) % resolution, ((y % resolution) + resolution) % resolution];
        cover[wy * resolution + wx]++;
      }
    }
  });
  let used = 0;
  let twice = 0;
  for (const n of cover) { if (n) used++; if (n > 1) twice++; }
  return used ? twice / used : 0;
}

/** Largest deviation of the UV corner angles from the 3D ones, in degrees: 0 for a perfect conformal map. */
export function angleDistortion(mesh, faces = null) {
  const angleAt = (a, b, c, sub, dot, len) => {
    const [u, w] = [sub(a, b), sub(c, b)];
    return Math.acos(Math.max(-1, Math.min(1, dot(u, w) / ((len(u) * len(w)) || 1))));
  };
  const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
  const len2 = (a) => Math.hypot(a[0], a[1]);
  let worst = 0;
  for (const f of faces ?? mesh.faces.map((_, i) => i)) {
    const face = mesh.faces[f];
    const uv = mesh.uvs?.[f];
    if (!uv) continue;
    for (let i = 0; i < face.length; i++) {
      const [p, q, r] = [(i + face.length - 1) % face.length, i, (i + 1) % face.length];
      const in3 = angleAt(mesh.verts[face[p]], mesh.verts[face[q]], mesh.verts[face[r]], v3.sub, v3.dot, v3.len);
      const in2 = angleAt(uv[p], uv[q], uv[r], sub2, dot2, len2);
      worst = Math.max(worst, Math.abs(in3 - in2));
    }
  }
  return (worst * 180) / Math.PI;
}
