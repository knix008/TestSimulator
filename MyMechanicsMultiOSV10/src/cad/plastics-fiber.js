// Fiber orientation (no DOM) of a filled resin during filling: the second-order orientation tensor A (3 × 3,
// symmetric, trace 1) at every cavity node, through the wall thickness in layers, from the Folgar–Tucker equation
//   dA/dt = W·A − A·W + λ (D·A + A·D − 2 D:𝔸) + 2 C_I γ̇ (I − 3A)
// (W vorticity, D rate of deformation, λ = 1 for long fibers, C_I the fiber interaction coefficient, 𝔸 the
// fourth-order tensor from the hybrid closure 𝔸 = (1 − f) 𝔸_lin + f 𝔸_quad, f = 1 − 27 det A).
// The flow at a node: the gap-averaged velocity v̄ from the speed the flow front passed it (cell / Δt_fill) along
// the flow direction, its in-plane gradient by least squares over the neighbours, and through the thickness the
// Hele-Shaw profile u(z) = 1.5 v̄ (1 − (2z/h)²) with the shear ∂u/∂z = −12 v̄ z / h² between the walls. Each layer
// starts random (A = I/3: the fountain flow at the front) when the front passes and is carried until the end of
// filling: near the walls the shear lines fibers up with the flow (skin), at the middle the in-plane stretching
// rules (diverging flow turns them across: core).
// Results: per node the layer tensors, the thickness-averaged tensor, its first eigenvalue (degree of alignment,
// 1/3 random … 1 aligned) and direction, and the flow-direction component a_flow.

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const idx = (i, j) => 3 * i + j;

/** Symmetric 3×3 (9 numbers) eigen-decomposition by Jacobi rotations: { values (descending), vectors (columns) }. */
export function eigenSym3(M) {
  const a = M.slice(), v = I3.slice();
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0; for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) off += a[idx(p, q)] ** 2;
    if (off < 1e-22) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[idx(p, q)]; if (Math.abs(apq) < 1e-300) continue;
      const th = (a[idx(q, q)] - a[idx(p, p)]) / (2 * apq);
      const tt = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
      for (let k = 0; k < 3; k++) { const akp = a[idx(k, p)], akq = a[idx(k, q)]; a[idx(k, p)] = c * akp - s * akq; a[idx(k, q)] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[idx(p, k)], aqk = a[idx(q, k)]; a[idx(p, k)] = c * apk - s * aqk; a[idx(q, k)] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[idx(k, p)], vkq = v[idx(k, q)]; v[idx(k, p)] = c * vkp - s * vkq; v[idx(k, q)] = s * vkp + c * vkq; }
    }
  }
  const order = [0, 1, 2].sort((x, y) => a[idx(y, y)] - a[idx(x, x)]);
  return { values: order.map((k) => a[idx(k, k)]), vectors: order.map((k) => [v[idx(0, k)], v[idx(1, k)], v[idx(2, k)]]) };
}

const det3 = (A) => A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);

/** D:𝔸 with the hybrid closure (3×3 result) for a symmetric D. */
function contractClosure(A, D) {
  const f = Math.max(0, Math.min(1, 1 - 27 * det3(A)));
  const AD = A[0] * D[0] + A[1] * D[1] + A[2] * D[2] + A[3] * D[3] + A[4] * D[4] + A[5] * D[5] + A[6] * D[6] + A[7] * D[7] + A[8] * D[8];
  const trD = D[0] + D[4] + D[8];
  const out = new Array(9);
  // Linear closure 𝔸_lin:D = −(1/35)(δ trD + 2D)… + (1/7)(A trD + 2(AD + DA) + δ (A:D))  [Advani & Tucker].
  const AD_ = mul(A, D), DA_ = mul(D, A);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const k = idx(i, j), dij = i === j ? 1 : 0;
    const lin = (-1 / 35) * (dij * trD + 2 * D[k]) + (1 / 7) * (A[k] * trD + 2 * (AD_[k] + DA_[k]) + dij * AD);
    const quad = A[k] * AD;
    out[k] = (1 - f) * lin + f * quad;
  }
  return out;
}
function mul(X, Y) { const o = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += X[idx(i, k)] * Y[idx(k, j)]; o[idx(i, j)] = s; } return o; }

/** The rate dA/dt for a velocity gradient L (L[i][j] = ∂vᵢ/∂xⱼ, 9 numbers). */
export function folgarTuckerRate(A, L, { CI = 0.01, lambda = 1 } = {}) {
  const D = new Array(9), W = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { D[idx(i, j)] = 0.5 * (L[idx(i, j)] + L[idx(j, i)]); W[idx(i, j)] = 0.5 * (L[idx(i, j)] - L[idx(j, i)]); }
  let DD = 0; for (let k = 0; k < 9; k++) DD += D[k] * D[k];
  const gdot = Math.sqrt(2 * DD);
  const WA = mul(W, A), AW = mul(A, W), DA = mul(D, A), AD = mul(A, D), C = contractClosure(A, D);
  const out = new Array(9);
  for (let k = 0; k < 9; k++) out[k] = WA[k] - AW[k] + lambda * (DA[k] + AD[k] - 2 * C[k]) + 2 * CI * gdot * (I3[k] - 3 * A[k]);
  return { rate: out, gdot };
}

/** A carried through the velocity gradient L for a time t (Heun steps; strain per step ≤ 0.05, at most `maxSteps`). */
export function integrateOrientation(A0, L, t, opts = {}) {
  let A = A0.slice();
  const g = folgarTuckerRate(A, L, opts).gdot;
  const strain = Math.min(g * t, opts.maxStrain ?? 60);
  if (!(strain > 0)) return A;
  const n = Math.min(opts.maxSteps ?? 400, Math.max(1, Math.ceil(strain / 0.05)));
  const dt = strain / Math.max(g, 1e-30) / n;
  for (let s = 0; s < n; s++) {
    const k1 = folgarTuckerRate(A, L, opts).rate;
    const B = A.map((v, k) => v + dt * k1[k]);
    const k2 = folgarTuckerRate(B, L, opts).rate;
    A = A.map((v, k) => v + 0.5 * dt * (k1[k] + k2[k]));
    // Keep it a symmetric tensor of trace 1 (round-off).
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) { const m = 0.5 * (A[idx(i, j)] + A[idx(j, i)]); A[idx(i, j)] = A[idx(j, i)] = m; }
    const tr = A[0] + A[4] + A[8]; for (let k = 0; k < 9; k++) A[k] /= tr;
  }
  return A;
}

/** The gap-averaged velocity (mm/s) at each node from the fill time field: the front moves along ∇t at the speed
 * 1 / |∇t|, so v = ∇t / |∇t|² (∇t by least squares over the filled neighbours). */
export function flowVelocity(domain, t) {
  const nodes = domain.nodes, n = nodes.length, E = domain.edges;
  const nb = (i) => domain.adj[i].map((e) => (E[e][0] === i ? E[e][1] : E[e][0]));
  const vel = new Array(n);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(t[i])) { vel[i] = [0, 0, 0]; continue; }
    const M = new Array(9).fill(0), r = [0, 0, 0];
    for (const j of nb(i)) {
      if (!Number.isFinite(t[j])) continue;
      const d = [0, 1, 2].map((k) => nodes[j].c[k] - nodes[i].c[k]); const dt = t[j] - t[i];
      for (let a = 0; a < 3; a++) { r[a] += d[a] * dt; for (let b = 0; b < 3; b++) M[idx(a, b)] += d[a] * d[b]; }
    }
    const tr = M[0] + M[4] + M[8];
    if (!(tr > 0)) { vel[i] = [0, 0, 0]; continue; }
    for (let a = 0; a < 3; a++) M[idx(a, a)] += 1e-6 * tr;
    const Mi = inv3(M);
    const g = [0, 1, 2].map((b) => Mi[idx(b, 0)] * r[0] + Mi[idx(b, 1)] * r[1] + Mi[idx(b, 2)] * r[2]);
    const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    vel[i] = g2 > 1e-30 ? g.map((x) => x / g2) : [0, 0, 0];
  }
  return vel;
}

/** Interaction coefficient by fiber volume fraction and aspect ratio (Bay's fit, C_I = 0.0184 e^(−0.7148 φ r)). */
export const interactionCoefficient = (phi, aspect = 20) => Math.max(1e-4, 0.0184 * Math.exp(-0.7148 * phi * aspect));

/**
 * Fiber orientation over the cavity after filling. domain: { nodes [{ c, h }], adj, edges }; fill: the fill
 * result { fillTime }; fiber: { fraction (weight 0..1), aspect, density (g/cm³), resinDensity }; layers through
 * the half thickness (symmetric about the mid-plane).
 */
export function fiberOrientation(domain, fill, { fraction = 0.3, aspect = 20, fiberDensity = 2.55, resinDensity = 1.14, layers = 5, CI = null, maxSteps = 120 } = {}) {
  const nodes = domain.nodes, n = nodes.length, t = fill.fillTime;
  const phi = (fraction / fiberDensity) / (fraction / fiberDensity + (1 - fraction) / resinDensity);
  const ci = CI ?? interactionCoefficient(phi, aspect);
  let tEnd = 0; for (const v of t) if (Number.isFinite(v)) tEnd = Math.max(tEnd, v);
  const E = domain.edges;
  const nb = (i) => domain.adj[i].map((e) => (E[e][0] === i ? E[e][1] : E[e][0]));
  const vel = flowVelocity(domain, t);
  // In-plane velocity gradient ∂vᵢ/∂xⱼ by least squares over the neighbours (in 3D: the full gradient).
  const grad = new Array(n);
  for (let i = 0; i < n; i++) {
    const M = new Array(9).fill(0), R = [new Array(3).fill(0), new Array(3).fill(0), new Array(3).fill(0)];
    for (const j of nb(i)) {
      const d = [0, 1, 2].map((k) => nodes[j].c[k] - nodes[i].c[k]);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[idx(a, b)] += d[a] * d[b];
      for (let comp = 0; comp < 3; comp++) { const dv = vel[j][comp] - vel[i][comp]; for (let a = 0; a < 3; a++) R[comp][a] += d[a] * dv; }
    }
    // Regularise the directions without neighbours (the thickness direction of a mid-plane grid).
    const tr = M[0] + M[4] + M[8]; for (let a = 0; a < 3; a++) M[idx(a, a)] += 1e-6 * (tr || 1);
    const Mi = inv3(M);
    const G = new Array(9).fill(0);
    for (let comp = 0; comp < 3; comp++) for (let b = 0; b < 3; b++) { let s = 0; for (let a = 0; a < 3; a++) s += Mi[idx(b, a)] * R[comp][a]; G[idx(comp, b)] = s; }
    grad[i] = G;
  }
  const L = Math.max(1, layers);
  const out = { phi, CI: ci, layers: L, tensor: new Float64Array(9 * n), layerTensors: new Float64Array(9 * n * L), alignment: new Float64Array(n), direction: new Float64Array(3 * n), flowComponent: new Float64Array(n), skin: new Float64Array(n), core: new Float64Array(n) };
  const opts = { CI: ci, maxSteps };
  for (let i = 0; i < n; i++) {
    const avg = new Array(9).fill(0);
    const vi = vel[i], speed = Math.hypot(...vi);
    const e = speed > 0 ? vi.map((x) => x / speed) : [1, 0, 0];
    // The thickness direction: the mid-plane normal (z) for a mid-plane domain; otherwise the direction across the flow with the least extent (z by default).
    const nz = [0, 0, 1];
    const dur = Number.isFinite(t[i]) ? Math.max(0, tEnd - t[i]) : 0;
    const h = nodes[i].h;
    for (let l = 0; l < L; l++) {
      const zeta = (l + 0.5) / L;                       // 0 at the mid-plane … 1 at the wall (half thickness)
      const z = (zeta * h) / 2;
      const scale = 1.5 * (1 - zeta * zeta);            // u(z) / v̄
      const shear = (-12 * speed * z) / (h * h);        // ∂u/∂z (1/s)
      const Lg = grad[i].map((g) => g * scale);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) Lg[idx(a, b)] += shear * e[a] * nz[b];
      const A = dur > 0 ? integrateOrientation([1 / 3, 0, 0, 0, 1 / 3, 0, 0, 0, 1 / 3], Lg, dur, opts) : [1 / 3, 0, 0, 0, 1 / 3, 0, 0, 0, 1 / 3];
      out.layerTensors.set(A, 9 * (n * l + i));
      for (let k = 0; k < 9; k++) avg[k] += A[k] / L;
      const af = e[0] * (A[0] * e[0] + A[1] * e[1] + A[2] * e[2]) + e[1] * (A[3] * e[0] + A[4] * e[1] + A[5] * e[2]) + e[2] * (A[6] * e[0] + A[7] * e[1] + A[8] * e[2]);
      if (l === L - 1) out.skin[i] = af;
      if (l === 0) out.core[i] = af;
    }
    out.tensor.set(avg, 9 * i);
    const eg = eigenSym3(avg);
    out.alignment[i] = eg.values[0];
    out.direction.set(eg.vectors[0], 3 * i);
    out.flowComponent[i] = e[0] * (avg[0] * e[0] + avg[1] * e[1] + avg[2] * e[2]) + e[1] * (avg[3] * e[0] + avg[4] * e[1] + avg[5] * e[2]) + e[2] * (avg[6] * e[0] + avg[7] * e[1] + avg[8] * e[2]);
  }
  out.flowDirection = vel.map((v) => { const s = Math.hypot(...v); return s > 0 ? v.map((x) => x / s) : [0, 0, 0]; });
  return out;
}

function inv3(M) {
  const d = det3(M) || 1e-30;
  return [
    (M[4] * M[8] - M[5] * M[7]) / d, (M[2] * M[7] - M[1] * M[8]) / d, (M[1] * M[5] - M[2] * M[4]) / d,
    (M[5] * M[6] - M[3] * M[8]) / d, (M[0] * M[8] - M[2] * M[6]) / d, (M[2] * M[3] - M[0] * M[5]) / d,
    (M[3] * M[7] - M[4] * M[6]) / d, (M[1] * M[6] - M[0] * M[7]) / d, (M[0] * M[4] - M[1] * M[3]) / d,
  ];
}
