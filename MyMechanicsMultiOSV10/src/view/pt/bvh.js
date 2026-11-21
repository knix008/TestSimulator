// Bounding volume hierarchy over triangles for the path tracer: a binned surface-area-heuristic build, a flat
// depth-first node array the shader walks with a small stack, and the same traversal in JavaScript (tests,
// picking the focus point or a body on the rendered picture).
//
// Layout of the flat array (8 floats a node, two RGBA texels on the GPU):
//   [minX, minY, minZ, a, maxX, maxY, maxZ, b]
//   leaf:     a = first triangle (index into `order`), b = triangle count (> 0)
//   interior: a = index of the right child (the left child is the next node), b = −(split axis + 1)
// `order` lists the original triangle numbers in leaf order; the scene textures are written in that order so a
// leaf's triangles are contiguous.

export const NODE_FLOATS = 8;
const MAX_DEPTH = 60;

/** Bounds and centroids of the triangles of `positions` (9 floats a triangle). */
function triangleData(positions) {
  const n = Math.floor(positions.length / 9);
  const bounds = new Float32Array(n * 6);
  const centroids = new Float32Array(n * 3);
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    for (let k = 0; k < 3; k++) {
      const a = positions[o + k]; const b = positions[o + 3 + k]; const c = positions[o + 6 + k];
      const lo = Math.min(a, b, c); const hi = Math.max(a, b, c);
      bounds[t * 6 + k] = lo; bounds[t * 6 + 3 + k] = hi;
      centroids[t * 3 + k] = (lo + hi) * 0.5;
    }
  }
  return { n, bounds, centroids };
}

const area = (b) => { const x = Math.max(0, b[3] - b[0]); const y = Math.max(0, b[4] - b[1]); const z = Math.max(0, b[5] - b[2]); return 2 * (x * y + y * z + z * x); };
const emptyBox = () => [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
function growBox(box, bounds, t) {
  const o = t * 6;
  if (bounds[o] < box[0]) box[0] = bounds[o]; if (bounds[o + 1] < box[1]) box[1] = bounds[o + 1]; if (bounds[o + 2] < box[2]) box[2] = bounds[o + 2];
  if (bounds[o + 3] > box[3]) box[3] = bounds[o + 3]; if (bounds[o + 4] > box[4]) box[4] = bounds[o + 4]; if (bounds[o + 5] > box[5]) box[5] = bounds[o + 5];
}

/**
 * Builds the hierarchy. positions: Float32Array of triangles (9 floats each, world space).
 * Returns { nodes (Float32Array, 8 a node), order (Uint32Array), nodeCount, depth, leaves, triangles }.
 */
export function buildBVH(positions, { leafSize = 4, bins = 16, maxLeaf = 16 } = {}) {
  const { n, bounds, centroids } = triangleData(positions);
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  let cap = Math.max(1, 2 * n);
  let nodes = new Float32Array(cap * NODE_FLOATS);
  let nodeCount = 0;
  let depthMax = 0; let leaves = 0;
  const binCount = new Int32Array(bins);
  const binBox = new Float64Array(bins * 6);
  const rightArea = new Float64Array(bins); const rightCount = new Int32Array(bins);
  const alloc = () => {
    if (nodeCount >= cap) { cap *= 2; const bigger = new Float32Array(cap * NODE_FLOATS); bigger.set(nodes); nodes = bigger; }
    return nodeCount++;
  };
  if (n === 0) {
    alloc();
    nodes.fill(0, 0, NODE_FLOATS); // an empty leaf: the traversal finds nothing
    return { nodes: nodes.slice(0, NODE_FLOATS), order, nodeCount: 1, depth: 0, leaves: 1, triangles: 0, empty: true };
  }
  // Tasks: [start, end, depth, parent node (whose right child this is) or −1].
  const stack = [[0, n, 0, -1]];
  while (stack.length) {
    const [start, end, depth, parent] = stack.pop();
    const node = alloc();
    if (parent >= 0) nodes[parent * NODE_FLOATS + 3] = node;
    const box = emptyBox(); const cbox = emptyBox();
    for (let i = start; i < end; i++) {
      const t = order[i];
      growBox(box, bounds, t);
      const c = t * 3;
      for (let k = 0; k < 3; k++) { const v = centroids[c + k]; if (v < cbox[k]) cbox[k] = v; if (v > cbox[k + 3]) cbox[k + 3] = v; }
    }
    const o = node * NODE_FLOATS;
    nodes[o] = box[0]; nodes[o + 1] = box[1]; nodes[o + 2] = box[2]; nodes[o + 4] = box[3]; nodes[o + 5] = box[4]; nodes[o + 6] = box[5];
    const count = end - start;
    if (depth > depthMax) depthMax = depth;
    const makeLeaf = () => { nodes[o + 3] = start; nodes[o + 7] = count; leaves += 1; };
    if (count <= 1 || depth >= MAX_DEPTH) { makeLeaf(); continue; }
    // Binned SAH: the cheapest split plane of the three axes.
    let bestAxis = -1; let bestBin = -1; let bestCost = Infinity;
    const parentArea = area(box) || 1;
    for (let axis = 0; axis < 3; axis++) {
      const lo = cbox[axis]; const extent = cbox[axis + 3] - lo;
      if (!(extent > 1e-12)) continue;
      const k = bins / extent;
      binCount.fill(0);
      for (let b = 0; b < bins; b++) binBox.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], b * 6);
      for (let i = start; i < end; i++) {
        const t = order[i];
        const b = Math.min(bins - 1, Math.floor((centroids[t * 3 + axis] - lo) * k));
        binCount[b] += 1;
        const bo = b * 6; const to = t * 6;
        for (let q = 0; q < 3; q++) { if (bounds[to + q] < binBox[bo + q]) binBox[bo + q] = bounds[to + q]; if (bounds[to + 3 + q] > binBox[bo + 3 + q]) binBox[bo + 3 + q] = bounds[to + 3 + q]; }
      }
      // Sweep from the right, then from the left.
      let acc = emptyBox(); let cnt = 0;
      for (let b = bins - 1; b > 0; b--) {
        const bo = b * 6;
        if (binCount[b]) { for (let q = 0; q < 3; q++) { acc[q] = Math.min(acc[q], binBox[bo + q]); acc[q + 3] = Math.max(acc[q + 3], binBox[bo + 3 + q]); } }
        cnt += binCount[b];
        rightArea[b] = cnt ? area(acc) : 0; rightCount[b] = cnt;
      }
      acc = emptyBox(); cnt = 0;
      for (let b = 0; b < bins - 1; b++) {
        const bo = b * 6;
        if (binCount[b]) { for (let q = 0; q < 3; q++) { acc[q] = Math.min(acc[q], binBox[bo + q]); acc[q + 3] = Math.max(acc[q + 3], binBox[bo + 3 + q]); } }
        cnt += binCount[b];
        const rc = rightCount[b + 1];
        if (!cnt || !rc) continue;
        const cost = 1 + (area(acc) * cnt + rightArea[b + 1] * rc) / parentArea;
        if (cost < bestCost) { bestCost = cost; bestAxis = axis; bestBin = b; }
      }
    }
    if (bestAxis < 0) {
      if (count <= maxLeaf) { makeLeaf(); continue; }
      // Every centroid at one point: split the list in the middle (keeps leaves small).
      const mid = (start + end) >> 1;
      nodes[o + 7] = -1;
      stack.push([mid, end, depth + 1, node], [start, mid, depth + 1, -1]);
      continue;
    }
    if (bestCost >= count && count <= maxLeaf) { makeLeaf(); continue; }
    // Partition the triangles of the range by the chosen plane.
    const lo = cbox[bestAxis]; const k = bins / (cbox[bestAxis + 3] - lo);
    let i = start; let j = end - 1;
    while (i <= j) {
      const b = Math.min(bins - 1, Math.floor((centroids[order[i] * 3 + bestAxis] - lo) * k));
      if (b <= bestBin) i += 1; else { const tmp = order[i]; order[i] = order[j]; order[j] = tmp; j -= 1; }
    }
    let mid = i;
    if (mid === start || mid === end) mid = (start + end) >> 1;
    nodes[o + 7] = -(bestAxis + 1);
    // The left child is the next node: push the right one first.
    stack.push([mid, end, depth + 1, node], [start, mid, depth + 1, -1]);
  }
  return { nodes: nodes.slice(0, nodeCount * NODE_FLOATS), order, nodeCount, depth: depthMax, leaves, triangles: n };
}

/** Möller–Trumbore: distance along the ray to triangle t of `positions`, or Infinity; sets out.u / out.v. */
export function intersectTriangle(positions, t, ro, rd, out = {}) {
  const o = t * 9;
  const ax = positions[o]; const ay = positions[o + 1]; const az = positions[o + 2];
  const e1x = positions[o + 3] - ax; const e1y = positions[o + 4] - ay; const e1z = positions[o + 5] - az;
  const e2x = positions[o + 6] - ax; const e2y = positions[o + 7] - ay; const e2z = positions[o + 8] - az;
  const px = rd[1] * e2z - rd[2] * e2y; const py = rd[2] * e2x - rd[0] * e2z; const pz = rd[0] * e2y - rd[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-20) return Infinity;
  const inv = 1 / det;
  const sx = ro[0] - ax; const sy = ro[1] - ay; const sz = ro[2] - az;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = sy * e1z - sz * e1y; const qy = sz * e1x - sx * e1z; const qz = sx * e1y - sy * e1x;
  const v = (rd[0] * qx + rd[1] * qy + rd[2] * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (d <= 0) return Infinity;
  out.u = u; out.v = v;
  return d;
}

/** Entry distance of a ray into a node's box (slab test), or Infinity. */
function boxHit(nodes, o, ro, inv, tMax) {
  let t0 = 0; let t1 = tMax;
  for (let k = 0; k < 3; k++) {
    let a = (nodes[o + k] - ro[k]) * inv[k]; let b = (nodes[o + 4 + k] - ro[k]) * inv[k];
    if (a > b) { const tmp = a; a = b; b = tmp; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/**
 * The closest hit of a ray: { t, triangle (original number), u, v, steps } or null. The same walk as the
 * shader: nearer child first by the ray's sign on the split axis, boxes tested when popped.
 */
export function intersectBVH(bvh, positions, ro, rd, tMax = Infinity) {
  const { nodes, order } = bvh;
  if (!bvh.triangles) return null;
  const inv = [1 / rd[0], 1 / rd[1], 1 / rd[2]];
  const stack = new Int32Array(64);
  let sp = 0; stack[sp++] = 0;
  let best = tMax; let hit = -1; let hu = 0; let hv = 0; let steps = 0;
  const out = {};
  while (sp > 0) {
    const node = stack[--sp];
    const o = node * NODE_FLOATS;
    steps += 1;
    if (boxHit(nodes, o, ro, inv, best) === Infinity) continue;
    const b = nodes[o + 7];
    if (b > 0) {
      const first = nodes[o + 3];
      for (let i = first; i < first + b; i++) {
        const t = order[i];
        const d = intersectTriangle(positions, t, ro, rd, out);
        if (d < best) { best = d; hit = t; hu = out.u; hv = out.v; }
      }
    } else {
      const axis = -b - 1;
      const left = node + 1; const right = nodes[o + 3];
      if (rd[axis] < 0) { stack[sp++] = left; stack[sp++] = right; } else { stack[sp++] = right; stack[sp++] = left; }
    }
  }
  return hit < 0 ? null : { t: best, triangle: hit, u: hu, v: hv, steps };
}

/** The closest hit by testing every triangle (the reference for the tests). */
export function intersectBrute(positions, ro, rd, tMax = Infinity) {
  const n = Math.floor(positions.length / 9);
  let best = tMax; let hit = -1; const out = {}; let hu = 0; let hv = 0;
  for (let t = 0; t < n; t++) { const d = intersectTriangle(positions, t, ro, rd, out); if (d < best) { best = d; hit = t; hu = out.u; hv = out.v; } }
  return hit < 0 ? null : { t: best, triangle: hit, u: hu, v: hv };
}

/** Structure checks: every triangle in exactly one leaf, children inside their parents, the stack depth bound. */
export function validateBVH(bvh, positions) {
  const { nodes, order, nodeCount } = bvh;
  const seen = new Uint8Array(order.length);
  const problems = [];
  const visit = (node, depth, parent) => {
    const o = node * NODE_FLOATS;
    if (parent >= 0) {
      const p = parent * NODE_FLOATS;
      for (let k = 0; k < 3; k++) if (nodes[o + k] < nodes[p + k] - 1e-4 || nodes[o + 4 + k] > nodes[p + 4 + k] + 1e-4) problems.push(`node ${node} outside parent ${parent}`);
    }
    const b = nodes[o + 7];
    if (b > 0) {
      for (let i = nodes[o + 3]; i < nodes[o + 3] + b; i++) {
        const t = order[i];
        seen[i] += 1;
        for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) {
          const x = positions[t * 9 + v * 3 + k];
          if (x < nodes[o + k] - 1e-4 || x > nodes[o + 4 + k] + 1e-4) problems.push(`triangle ${t} outside leaf ${node}`);
        }
      }
      return depth;
    }
    if (nodes[o + 3] <= node + 1 || nodes[o + 3] >= nodeCount) problems.push(`bad right child of ${node}`);
    return Math.max(visit(node + 1, depth + 1, node), visit(nodes[o + 3], depth + 1, node));
  };
  const depth = bvh.triangles ? visit(0, 0, -1) : 0;
  for (let i = 0; i < seen.length; i++) if (seen[i] !== 1) { problems.push(`slot ${i} in ${seen[i]} leaves`); break; }
  return { ok: problems.length === 0, problems: problems.slice(0, 10), depth };
}
