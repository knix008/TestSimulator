// Four more simulation studies on the voxel model of fea.js (no kernel, no DOM):
//
// nonlinearStatic(): large displacements and a bilinear elastic-plastic material. The load is applied in
//   increments; each increment is solved by Newton iterations on the corotational formulation: every voxel
//   element's rigid rotation R is taken from the polar decomposition of its deformation gradient at the centre,
//   the element works in its rotated frame (internal force R·K0·(Rᵀx − X)), so the geometry is updated as the
//   part deforms while the strains stay small. Plasticity is the bilinear curve σ = σy + Et (ε − σy/E) as a secant
//   modulus per element (deformation theory, monotonic loading: no unloading). The tangent used by the Newton
//   step is R·s·K0·Rᵀ (no initial-stress term: a modified Newton), preconditioned by the linear multigrid.
//
// dropTest(): a rigid-floor impact. The part falls from a height h (impact velocity √(2gh)) onto a rigid
//   plane perpendicular to the drop direction (default −Z), touching it with its lowest point. Explicit
//   central-difference time stepping on the voxel model, lumped masses, linear elastic internal forces, penalty
//   contact with the floor; the time step is below the stability limit from a Gershgorin bound of M⁻¹K.
//   Records the contact force, the largest von Mises stress and the largest deformation over time.
//
// combineResults(): pressure-vessel style combination of linear static results computed on the same mesh and
//   resolution: linear (Σ factor·u, stresses from the combined displacement) or SRSS (stress components combined
//   as √Σ(factor·σ)²).
//
// flowField() / flowLattice(): steady incompressible flow by the lattice-Boltzmann method (D3Q19, BGK collision
//   with an optional Smagorinsky sub-grid model so coarse grids stay stable at higher Reynolds numbers). The body
//   is voxelised; external flow runs in a box around it (free-slip sides), internal flow through its open
//   passages (walls around, the outside of the body excluded). Velocity inlet (equilibrium), pressure outlet,
//   bounce-back walls, drag by momentum exchange on the body links. Results: velocity / pressure per cell,
//   drag force and coefficient, pressure drop, section-plane colours and streamlines.
//
// Units as in fea.js: mm, N, MPa, s; density kg/m³ (t/mm³ = 1e-12 kg/m³ inside); flow: m/s, Pa, N.
import { analyse, elementStiffness, stressColor, FEA_INTERNALS } from './fea.js';

const { buildGrid, buildOperator, pcg, clamp, multigrid, vertexMap, interpolate, elasticity, strainMatrix, shapeGradients, GAUSS, faceNodes, tributary, vonMises } = FEA_INTERNALS;

// ───────────────────────── shared helpers

/** Nodal force vector of face loads (forces shared by the face's nodes, pressures by tributary area). */
function loadVector(mesh, loads, grid) {
  const f = new Float64Array(3 * grid.nn);
  for (const load of loads) {
    const { tris, near } = faceNodes(mesh, load.faceId, grid);
    if (!near.size) continue;
    if (load.force) for (const n of near.keys()) for (let c = 0; c < 3; c++) f[3 * n + c] += load.force[c] / near.size;
    else if (load.pressure) tributary(mesh, tris, near, grid, (n, A) => { for (let c = 0; c < 3; c++) f[3 * n + c] -= load.pressure * A[c]; });
  }
  return f;
}

/** ∫ G_ak G_bl over the unit cube (2×2×2 Gauss): I[((a·8 + b)·3 + k)·3 + l] (unit-cube gradients). */
function gradientProducts() {
  const I = new Float64Array(8 * 8 * 9), G = new Float64Array(24);
  for (const xi of GAUSS) for (const eta of GAUSS) for (const zeta of GAUSS) {
    shapeGradients(xi, eta, zeta, G);
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) I[((a * 8 + b) * 3 + k) * 3 + l] += (G[3 * a + k] * G[3 * b + l]) / 8;
  }
  return I;
}

const norm = (v) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); };

/** Element von Mises stresses (centre) from nodal displacements u, optionally scaled per element. */
function elementStresses(grid, u, D, scale = null) {
  const { h, ne, conn } = grid, Bc = strainMatrix(0.5, 0.5, 0.5).map((x) => x / h);
  const out = new Float64Array(ne), ue = new Float64Array(24), eps = new Float64Array(6), sig = new Float64Array(6);
  for (let el = 0; el < ne; el++) {
    for (let a = 0; a < 8; a++) { const d = 3 * conn[8 * el + a]; ue[3 * a] = u[d]; ue[3 * a + 1] = u[d + 1]; ue[3 * a + 2] = u[d + 2]; }
    for (let i = 0; i < 6; i++) { let s = 0; for (let m = 0; m < 24; m++) s += Bc[i * 24 + m] * ue[m]; eps[i] = s; }
    for (let i = 0; i < 6; i++) { let s = 0; for (let m = 0; m < 6; m++) s += D[i * 6 + m] * eps[m]; sig[i] = s; }
    out[el] = vonMises(sig) * (scale ? scale[el] : 1);
  }
  return out;
}

/** Element values averaged to the nodes. */
function toNodes(grid, values) {
  const out = new Float64Array(grid.nn), count = new Uint8Array(grid.nn);
  for (let el = 0; el < grid.ne; el++) for (let a = 0; a < 8; a++) { const n = grid.conn[8 * el + a]; out[n] += values[el]; count[n]++; }
  for (let n = 0; n < grid.nn; n++) if (count[n]) out[n] /= count[n];
  return out;
}

function vertexFields(mesh, grid, u, nodeStress) {
  const map = vertexMap(mesh.vertices, grid);
  const vertexDisplacement = interpolate(map, u, 3), vertexStress = new Float32Array(map.nv);
  for (let v = 0; v < map.nv; v++) if (map.best[v] >= 0) vertexStress[v] = nodeStress[map.best[v]];
  return { vertexDisplacement, vertexStress };
}

function maxOf(grid, u, nodeStress) {
  let maxDisp = 0, maxStress = 0, dn = 0, sn = 0;
  for (let n = 0; n < grid.nn; n++) {
    const m = Math.hypot(u[3 * n], u[3 * n + 1], u[3 * n + 2]);
    if (m > maxDisp) { maxDisp = m; dn = n; }
    if (nodeStress[n] > maxStress) { maxStress = nodeStress[n]; sn = n; }
  }
  const at = (n) => [grid.nodes[3 * n], grid.nodes[3 * n + 1], grid.nodes[3 * n + 2]];
  return { maxDisplacement: maxDisp, maxDisplacementAt: at(dn), maxStress, maxStressAt: at(sn) };
}

const fail = (error, extra = {}) => ({ ok: false, error, elements: 0, elementSize: 0, maxDisplacement: 0, maxStress: 0, minFactorOfSafety: Infinity, vertexDisplacement: new Float32Array(0), vertexStress: new Float32Array(0), ...extra });

// ───────────────────────── nonlinear static (corotational, bilinear plasticity)

/** The rotation of the polar decomposition F = R U (3×3 row-major), by the scaled Newton iteration. */
export function polarRotation(F) {
  let R = Array.from(F);
  for (let it = 0; it < 30; it++) {
    const [a, b, c, d, e, f, g, h, i] = R;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (!(Math.abs(det) > 1e-300)) break;
    // R⁻ᵀ = cofactor(R) / det
    const inv = [(e * i - f * h) / det, -(d * i - f * g) / det, (d * h - e * g) / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
    let change = 0;
    const next = R.map((x, k) => { const y = 0.5 * (x + inv[k]); change = Math.max(change, Math.abs(y - x)); return y; });
    R = next;
    if (change < 1e-13) break;
  }
  return R;
}

/**
 * Nonlinear static study. options: { material: { E, nu, yield, tangentModulus (Et, MPa; default E/20), plastic
 * (default true) }, fixtures, loads, resolution, steps (load increments), maxNewton, tol, geometric (default true:
 * corotational geometry update; false = small displacements), onProgress }.
 * Returns the analyse()-like fields (displacement, nodeStress, vertexDisplacement, vertexStress, maxDisplacement,
 * maxStress, minFactorOfSafety …) plus curve: [{ factor, maxDisplacement, maxStress }] per increment,
 * yieldedElements, plasticFraction, newtonIterations.
 */
export function nonlinearStatic(mesh, { material, fixtures = [], loads = [], resolution = 20, steps = 8, maxNewton = 15, tol = 5e-4, geometric = true, onProgress = null } = {}) {
  if (!fixtures.length) return fail('no-fixtures');
  if (!loads.length) return fail('no-loads');
  const grid = buildGrid(mesh, resolution);
  if (!grid) return fail('empty');
  const { h, nn, ne, conn, nodes } = grid, ndof = 3 * nn;
  const { fixed, nFixed } = clamp(mesh, fixtures, grid);
  if (!nFixed) return fail('no-fixtures');
  const F = loadVector(mesh, loads, grid);
  for (let d = 0; d < ndof; d++) if (fixed[d]) F[d] = 0;
  const fNorm = norm(F);
  if (!(fNorm > 0)) return fail('no-loads');
  const E = material.E, nu = material.nu ?? 0.3, sy = material.yield > 0 ? material.yield : Infinity;
  const Et = material.tangentModulus > 0 ? Math.min(E, material.tangentModulus) : E / 20;
  const plastic = material.plastic !== false && Number.isFinite(sy);
  const K0 = elementStiffness(E, nu, h), D = elasticity(E, nu);
  const op = buildOperator(grid, K0, 3);
  const precond = multigrid(grid, op, 3, fixed);
  const G = shapeGradients(0.5, 0.5, 0.5).map((x) => x / h);
  const Bc = strainMatrix(0.5, 0.5, 0.5).map((x) => x / h);
  const Rot = new Float64Array(9 * ne);
  for (let el = 0; el < ne; el++) { Rot[9 * el] = Rot[9 * el + 4] = Rot[9 * el + 8] = 1; }
  const s = new Float64Array(ne).fill(1);              // secant factor per element
  const svm = new Float64Array(ne);                    // elastic-trial von Mises per element
  const sigma = new Float64Array(6 * ne);              // local stress per element (xx yy zz xy yz zx)
  const gab = geometric ? new Float64Array(64 * ne) : null;   // initial-stress coupling g_ab (K_G = g ⊗ I3)
  const IG = geometric ? gradientProducts() : null;
  const u = new Float64Array(ndof);
  const xe = new Float64Array(24), de = new Float64Array(24), ke = new Float64Array(24), pe = new Float64Array(24);

  function updateRotations() {
    if (!geometric) return;
    for (let el = 0; el < ne; el++) {
      const Fm = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let a = 0; a < 8; a++) {
        const n = conn[8 * el + a];
        for (let i = 0; i < 3; i++) { const x = nodes[3 * n + i] + u[3 * n + i]; for (let j = 0; j < 3; j++) Fm[3 * i + j] += x * G[3 * a + j]; }
      }
      const R = polarRotation(Fm);
      for (let k = 0; k < 9; k++) Rot[9 * el + k] = R[k];
    }
  }
  /** Local displacement d = Rᵀx − X of an element into de. */
  function localDisp(el) {
    const o = 9 * el;
    for (let a = 0; a < 8; a++) {
      const n = conn[8 * el + a];
      const x = nodes[3 * n] + u[3 * n], y = nodes[3 * n + 1] + u[3 * n + 1], z = nodes[3 * n + 2] + u[3 * n + 2];
      for (let i = 0; i < 3; i++) de[3 * a + i] = Rot[o + i] * x + Rot[o + 3 + i] * y + Rot[o + 6 + i] * z - nodes[3 * n + i];
    }
  }
  /** Internal forces and the trial stresses. */
  function internal(out) {
    out.fill(0);
    const eps = new Float64Array(6), sig = new Float64Array(6);
    for (let el = 0; el < ne; el++) {
      localDisp(el);
      for (let i = 0; i < 6; i++) { let t = 0; for (let m = 0; m < 24; m++) t += Bc[i * 24 + m] * de[m]; eps[i] = t; }
      for (let i = 0; i < 6; i++) { let t = 0; for (let m = 0; m < 6; m++) t += D[i * 6 + m] * eps[m]; sig[i] = t; }
      svm[el] = vonMises(sig);
      for (let i = 0; i < 6; i++) sigma[6 * el + i] = sig[i] * s[el];
      for (let i = 0; i < 24; i++) { let t = 0; for (let m = 0; m < 24; m++) t += K0[i * 24 + m] * de[m]; ke[i] = t * s[el]; }
      const o = 9 * el;
      for (let a = 0; a < 8; a++) {
        const d = 3 * conn[8 * el + a], fx = ke[3 * a], fy = ke[3 * a + 1], fz = ke[3 * a + 2];
        out[d] += Rot[o] * fx + Rot[o + 1] * fy + Rot[o + 2] * fz;
        out[d + 1] += Rot[o + 3] * fx + Rot[o + 4] * fy + Rot[o + 5] * fz;
        out[d + 2] += Rot[o + 6] * fx + Rot[o + 7] * fy + Rot[o + 8] * fz;
      }
    }
  }
  /** out = K_T p (fixed dofs 0). */
  const tangent = (p, out, mask) => {
    out.fill(0);
    for (let el = 0; el < ne; el++) {
      const o = 9 * el;
      for (let a = 0; a < 8; a++) {
        const d = 3 * conn[8 * el + a], x = p[d], y = p[d + 1], z = p[d + 2];
        pe[3 * a] = Rot[o] * x + Rot[o + 3] * y + Rot[o + 6] * z;
        pe[3 * a + 1] = Rot[o + 1] * x + Rot[o + 4] * y + Rot[o + 7] * z;
        pe[3 * a + 2] = Rot[o + 2] * x + Rot[o + 5] * y + Rot[o + 8] * z;
      }
      const se = s[el];
      if (gab) {
        const g0 = 64 * el;
        for (let a = 0; a < 8; a++) {
          let x = 0, y = 0, z = 0;
          for (let b = 0; b < 8; b++) { const c = gab[g0 + 8 * a + b], d = 3 * conn[8 * el + b]; x += c * p[d]; y += c * p[d + 1]; z += c * p[d + 2]; }
          const d = 3 * conn[8 * el + a];
          out[d] += x; out[d + 1] += y; out[d + 2] += z;
        }
      }
      for (let i = 0; i < 24; i++) { let t = 0; const r = i * 24; for (let m = 0; m < 24; m++) t += K0[r + m] * pe[m]; ke[i] = t * se; }
      for (let a = 0; a < 8; a++) {
        const d = 3 * conn[8 * el + a], fx = ke[3 * a], fy = ke[3 * a + 1], fz = ke[3 * a + 2];
        out[d] += Rot[o] * fx + Rot[o + 1] * fy + Rot[o + 2] * fz;
        out[d + 1] += Rot[o + 3] * fx + Rot[o + 4] * fy + Rot[o + 5] * fz;
        out[d + 2] += Rot[o + 6] * fx + Rot[o + 7] * fy + Rot[o + 8] * fz;
      }
    }
    if (mask) for (let d = 0; d < ndof; d++) if (mask[d]) out[d] = 0;
  };
  /** Initial-stress (geometric) stiffness of every element from its current stress. */
  const updateGeometric = () => {
    if (!gab) return;
    for (let el = 0; el < ne; el++) {
      const o = 6 * el, sg = sigma;
      const T = [sg[o], sg[o + 3], sg[o + 5], sg[o + 3], sg[o + 1], sg[o + 4], sg[o + 5], sg[o + 4], sg[o + 2]];
      for (let ab = 0; ab < 64; ab++) { let t = 0; for (let kl = 0; kl < 9; kl++) t += T[kl] * IG[ab * 9 + kl]; gab[64 * el + ab] = h * t; }
    }
  };
  const updatePlastic = () => {
    if (!plastic) return 0;
    let yielded = 0;
    for (let el = 0; el < ne; el++) {
      const t = svm[el];
      if (t > sy) { s[el] = (sy + (Et / E) * (t - sy)) / t; yielded++; } else s[el] = 1;
    }
    return yielded;
  };

  const fint = new Float64Array(ndof), r = new Float64Array(ndof), du = new Float64Array(ndof);
  const curve = [];
  let newtonTotal = 0, converged = true, yielded = 0;
  const nSteps = Math.max(1, Math.round(steps));
  for (let k = 1; k <= nSteps; k++) {
    const lambda = k / nSteps;
    let stepOk = false;
    for (let it = 0; it < maxNewton; it++) {
      updateRotations();
      internal(fint);
      yielded = updatePlastic();
      if (plastic) internal(fint);               // forces with the updated secant moduli
      updateGeometric();
      for (let d = 0; d < ndof; d++) r[d] = fixed[d] ? 0 : lambda * F[d] - fint[d];
      const rn = norm(r);
      newtonTotal++;
      if (rn <= tol * lambda * fNorm) { stepOk = true; break; }
      du.fill(0);
      pcg(tangent, precond, r, du, { mask: fixed, tol: 2e-3, ref: rn, maxIter: 3000 });
      for (let d = 0; d < ndof; d++) u[d] += du[d];
      onProgress?.(Math.min(0.97, ((k - 1) + (it + 1) / maxNewton) / nSteps));
    }
    if (!stepOk) {
      // One more check after the last update.
      updateRotations(); internal(fint); yielded = updatePlastic(); if (plastic) internal(fint);
      for (let d = 0; d < ndof; d++) r[d] = fixed[d] ? 0 : lambda * F[d] - fint[d];
      if (norm(r) > 1e-2 * lambda * fNorm) converged = false;
    }
    let md = 0;
    for (let n = 0; n < nn; n++) md = Math.max(md, Math.hypot(u[3 * n], u[3 * n + 1], u[3 * n + 2]));
    let ms = 0;
    for (let el = 0; el < ne; el++) ms = Math.max(ms, svm[el] * s[el]);
    curve.push({ factor: lambda, maxDisplacement: md, maxStress: ms, yielded });
    onProgress?.(Math.min(0.97, k / nSteps));
  }
  const elStress = Float64Array.from(svm, (v, el) => v * s[el]);
  const nodeStress = toNodes(grid, elStress);
  const mx = maxOf(grid, u, nodeStress);
  onProgress?.(1);
  return {
    ok: converged, error: converged ? null : 'not-converged',
    nodes, displacement: u, nodeStress, elements: ne, elementSize: h,
    ...mx, minFactorOfSafety: mx.maxStress > 0 && Number.isFinite(sy) ? sy / mx.maxStress : Infinity,
    ...vertexFields(mesh, grid, u, nodeStress),
    curve, yieldedElements: yielded, plasticFraction: yielded / ne, newtonIterations: newtonTotal, iterations: newtonTotal,
  };
}

// ───────────────────────── drop test (explicit dynamics)

/**
 * Drop test. options: { material: { E, nu, density (kg/m³), yield }, height (mm) or velocity (mm/s, overrides),
 * direction (unit drop direction, default [0,0,−1]), resolution, duration (s; default 4 × the part's length along
 * the drop / wave speed), samples (time samples kept), gravity (mm/s², default 9810), contactStiffness (× the
 * node's own stiffness), onProgress }.
 */
export function dropTest(mesh, { material, height = 1000, velocity = null, direction = [0, 0, -1], resolution = 24, duration = null, samples = 120, gravity = 9810, contactStiffness = 2, onProgress = null } = {}) {
  const grid = buildGrid(mesh, resolution);
  if (!grid) return fail('empty');
  const { h, nn, ne, conn, nodes } = grid, ndof = 3 * nn;
  const len = Math.hypot(...direction) || 1, dir = direction.map((v) => v / len);
  const E = material.E, nu = material.nu ?? 0.3, rho = (material.density ?? 7850) * 1e-12;   // t/mm³
  const v0 = velocity != null ? velocity : Math.sqrt(2 * gravity * Math.max(0, height));
  const K0 = elementStiffness(E, nu, h), D = elasticity(E, nu);
  const op = buildOperator(grid, K0, 3);
  // Lumped masses and the stability bound (Gershgorin: λmax(M⁻¹K) ≤ max row sum / mass).
  const mass = new Float64Array(nn);
  for (let el = 0; el < ne; el++) for (let a = 0; a < 8; a++) mass[conn[8 * el + a]] += (rho * h ** 3) / 8;
  let lam = 0;
  const kc = new Float64Array(nn);
  for (let n = 0; n < nn; n++) {
    const S = op.nodeStencil[n];
    let row = 0;
    for (let r = 0; r < 3; r++) {
      let t = 0;
      for (let q = 0; q < 27; q++) { if (op.nbr[27 * n + q] < 0) continue; for (let c = 0; c < 3; c++) t += Math.abs(S[9 * q + 3 * r + c]); }
      row = Math.max(row, t);
    }
    kc[n] = contactStiffness * Math.max(op.diag[3 * n], op.diag[3 * n + 1], op.diag[3 * n + 2]);
    lam = Math.max(lam, (row + kc[n]) / mass[n]);
  }
  const dt = (0.8 * 2) / Math.sqrt(lam);
  const c = Math.sqrt(E / rho);
  // Floor: the plane through the node furthest along the drop direction.
  let front = -Infinity, back = Infinity;
  for (let n = 0; n < nn; n++) { const p = nodes[3 * n] * dir[0] + nodes[3 * n + 1] * dir[1] + nodes[3 * n + 2] * dir[2]; front = Math.max(front, p); back = Math.min(back, p); }
  const lengthAlong = Math.max(h, front - back);
  const T = duration > 0 ? duration : (4 * lengthAlong) / c;
  const nSteps = Math.min(200000, Math.max(20, Math.ceil(T / dt)));
  const every = Math.max(1, Math.floor(nSteps / Math.max(10, samples)));
  let totalMass = 0;
  for (let n = 0; n < nn; n++) totalMass += mass[n];

  const u = new Float64Array(ndof), v = new Float64Array(ndof), fi = new Float64Array(ndof);
  for (let n = 0; n < nn; n++) for (let k = 0; k < 3; k++) v[3 * n + k] = v0 * dir[k];
  const time = [], force = [], stress = [], deformation = [];
  const envelope = new Float64Array(ne);
  let peakStress = 0, peakTime = 0, peakDeformation = 0, impulse = 0, firstContact = -1, lastContact = -1, peakU = null;
  const relative = (out) => {   // u minus the mass-weighted mean (rigid translation) — deformation
    const mean = [0, 0, 0];
    for (let n = 0; n < nn; n++) for (let k = 0; k < 3; k++) mean[k] += mass[n] * u[3 * n + k];
    for (let k = 0; k < 3; k++) mean[k] /= totalMass;
    let md = 0;
    for (let n = 0; n < nn; n++) { let m2 = 0; for (let k = 0; k < 3; k++) { const x = u[3 * n + k] - mean[k]; if (out) out[3 * n + k] = x; m2 += x * x; } md = Math.max(md, Math.sqrt(m2)); }
    return md;
  };
  for (let step = 0; step <= nSteps; step++) {
    op.apply(u, fi, null);
    let fc = 0;
    for (let n = 0; n < nn; n++) {
      const pen = (nodes[3 * n] + u[3 * n]) * dir[0] + (nodes[3 * n + 1] + u[3 * n + 1]) * dir[1] + (nodes[3 * n + 2] + u[3 * n + 2]) * dir[2] - front;
      const fn = pen > 0 ? kc[n] * pen : 0;
      fc += fn;
      const inv = 1 / mass[n];
      for (let k = 0; k < 3; k++) {
        const a = (-fi[3 * n + k] - fn * dir[k] + mass[n] * gravity * dir[k]) * inv;
        v[3 * n + k] += dt * a;
      }
    }
    for (let d = 0; d < ndof; d++) u[d] += dt * v[d];
    impulse += fc * dt;
    if (fc > 0) { if (firstContact < 0) firstContact = step * dt; lastContact = (step + 1) * dt; }
    if (step % every === 0 || step === nSteps) {
      const es = elementStresses(grid, u, D);
      let ms = 0;
      for (let el = 0; el < ne; el++) { if (es[el] > envelope[el]) envelope[el] = es[el]; if (es[el] > ms) ms = es[el]; }
      const md = relative(null);
      time.push(step * dt); force.push(fc); stress.push(ms); deformation.push(md);
      if (ms > peakStress) { peakStress = ms; peakTime = step * dt; peakU = new Float64Array(ndof); relative(peakU); }
      peakDeformation = Math.max(peakDeformation, md);
      onProgress?.(Math.min(0.98, step / nSteps));
    }
  }
  // Rebound: the mean velocity against the drop direction at the end.
  let vm = 0;
  for (let n = 0; n < nn; n++) vm -= mass[n] * (v[3 * n] * dir[0] + v[3 * n + 1] * dir[1] + v[3 * n + 2] * dir[2]);
  vm /= totalMass;
  const nodeStress = toNodes(grid, envelope);
  const disp = peakU ?? new Float64Array(ndof);
  onProgress?.(1);
  return {
    ok: true, error: null, nodes, elements: ne, elementSize: h,
    time, force, stress, deformation,
    impactVelocity: v0, reboundVelocity: vm, mass: totalMass, impulse, momentumChange: totalMass * (v0 + vm),
    meanContactForce: lastContact > firstContact && firstContact >= 0 ? impulse / (lastContact - firstContact) : 0,
    contactStart: firstContact, contactDuration: lastContact > firstContact && firstContact >= 0 ? lastContact - firstContact : 0,
    peakStress, peakStressTime: peakTime, peakDeformation, waveSpeed: c, dt, steps: nSteps,
    maxStress: peakStress, maxDisplacement: peakDeformation, minFactorOfSafety: peakStress > 0 && material.yield > 0 ? material.yield / peakStress : Infinity,
    displacement: disp, nodeStress, ...vertexFields(mesh, grid, disp, nodeStress),
  };
}

// ───────────────────────── combination of static results

/**
 * Combines linear static results (from analyse(), same mesh and resolution): cases [{ result, factor }],
 * method 'linear' (default) or 'srss'. Returns an analyse()-like result.
 */
export function combineResults(mesh, { material, resolution = 24, cases = [], method = 'linear' } = {}) {
  const usable = cases.filter((x) => x?.result?.displacement?.length);
  if (!usable.length) return fail('no-cases');
  const grid = buildGrid(mesh, resolution);
  if (!grid) return fail('empty');
  const ndof = 3 * grid.nn;
  if (usable.some((x) => x.result.displacement.length !== ndof)) return fail('mismatch');
  const D = elasticity(material.E, material.nu ?? 0.3);
  const u = new Float64Array(ndof);
  let elStress;
  if (method === 'srss') {
    for (let d = 0; d < ndof; d++) {
      let s2 = 0, dom = 0;
      for (const cse of usable) { const x = cse.factor * cse.result.displacement[d]; s2 += x * x; if (Math.abs(x) > Math.abs(dom)) dom = x; }
      u[d] = Math.sign(dom) * Math.sqrt(s2);
    }
    // Stress tensors per case, combined component by component.
    const { h, ne, conn } = grid, Bc = strainMatrix(0.5, 0.5, 0.5).map((x) => x / h);
    const acc = new Float64Array(6 * ne), ue = new Float64Array(24), eps = new Float64Array(6);
    for (const cse of usable) {
      const uc = cse.result.displacement;
      for (let el = 0; el < ne; el++) {
        for (let a = 0; a < 8; a++) { const d = 3 * conn[8 * el + a]; ue[3 * a] = uc[d]; ue[3 * a + 1] = uc[d + 1]; ue[3 * a + 2] = uc[d + 2]; }
        for (let i = 0; i < 6; i++) { let t = 0; for (let m = 0; m < 24; m++) t += Bc[i * 24 + m] * ue[m]; eps[i] = t; }
        for (let i = 0; i < 6; i++) { let t = 0; for (let m = 0; m < 6; m++) t += D[i * 6 + m] * eps[m]; acc[6 * el + i] += (cse.factor * t) ** 2; }
      }
    }
    elStress = new Float64Array(ne);
    const sg = new Float64Array(6);
    for (let el = 0; el < ne; el++) { for (let i = 0; i < 6; i++) sg[i] = Math.sqrt(acc[6 * el + i]); elStress[el] = vonMises(sg); }
  } else {
    for (const cse of usable) for (let d = 0; d < ndof; d++) u[d] += cse.factor * cse.result.displacement[d];
    elStress = elementStresses(grid, u, D);
  }
  const nodeStress = toNodes(grid, elStress);
  const mx = maxOf(grid, u, nodeStress);
  return {
    ok: true, error: null, nodes: grid.nodes, displacement: u, nodeStress, elements: grid.ne, elementSize: grid.h, method, cases: usable.length,
    ...mx, minFactorOfSafety: mx.maxStress > 0 ? material.yield / mx.maxStress : Infinity,
    ...vertexFields(mesh, grid, u, nodeStress),
  };
}

/** Solves each load case with analyse() and combines them: cases [{ loads, factor }] (same fixtures). */
export function combinationStudy(mesh, { material, fixtures, cases, resolution = 24, method = 'linear', onProgress = null } = {}) {
  const solved = [];
  for (let i = 0; i < cases.length; i++) {
    const r = analyse(mesh, { material, fixtures, loads: cases[i].loads, resolution, onProgress: onProgress && ((f) => onProgress((i + f) / (cases.length + 0.2))) });
    if (r.error && r.error !== 'not-converged') return { ...fail(r.error), caseResults: solved };
    solved.push({ result: r, factor: cases[i].factor ?? 1, name: cases[i].name });
  }
  const combined = combineResults(mesh, { material, resolution, cases: solved, method });
  onProgress?.(1);
  return { ...combined, caseResults: solved.map((x) => ({ name: x.name, factor: x.factor, maxStress: x.result.maxStress, maxDisplacement: x.result.maxDisplacement })) };
}

// ───────────────────────── flow (lattice Boltzmann, D3Q19)

const CX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const CY = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
const CZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];
const W = CX.map((_, i) => (i === 0 ? 1 / 3 : i < 7 ? 1 / 18 : 1 / 36));
const Q = 19;
const dirIndex = (x, y, z) => CX.findIndex((_, i) => CX[i] === x && CY[i] === y && CZ[i] === z);
const OPP = CX.map((_, i) => dirIndex(-CX[i], -CY[i], -CZ[i]));
export const D3Q19 = { CX, CY, CZ, W, OPP };

/** feq for one cell into out (offset o). */
function equilibrium(rho, ux, uy, uz, out, o) {
  const usq = 1.5 * (ux * ux + uy * uy + uz * uz);
  for (let i = 0; i < Q; i++) {
    const cu = 3 * (CX[i] * ux + CY[i] * uy + CZ[i] * uz);
    out[o + i] = W[i] * rho * (1 + cu + 0.5 * cu * cu - usq);
  }
}

/**
 * The lattice solver. dims [nx, ny, nz]; solid (Uint8Array, 1 = body: counted for the drag, 2 = wall);
 * flowAxis 0/1/2 and flowSign ±1 (inlet on the upstream face); lateral 'slip' | 'wall'; tau (≥ 0.5), uLat
 * (inlet velocity, lattice units), smagorinsky (Cs, 0 = plain BGK), maxSteps, minSteps, tol, onProgress.
 * Returns { dims, rho (Float32Array), vel (Float32Array 3 per cell, world-axis order), force [3] (lattice, on the
 * body), steps, converged, unstable, inletRho, outletRho, frontCells }.
 */
export function flowLattice({ dims, solid, flowAxis = 0, flowSign = 1, lateral = 'slip', tau = 0.8, uLat = 0.05, smagorinsky = 0, maxSteps = 4000, minSteps = 200, tol = 1e-5, onProgress = null } = {}) {
  const [nx, ny, nz] = dims, N = nx * ny * nz, n = dims;
  let f = new Float32Array(Q * N), g = new Float32Array(Q * N);
  const uin = [0, 0, 0]; uin[flowAxis] = flowSign * uLat;
  for (let s = 0; s < N; s++) equilibrium(1, solid[s] ? 0 : uin[0], solid[s] ? 0 : uin[1], solid[s] ? 0 : uin[2], f, Q * s);
  // Streaming table: dest ≥ 0 → index in g; −1 dropped (open boundary); −2 bounce from the body; −3 bounce from a wall.
  const dest = new Int32Array(Q * N);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = i + nx * (j + ny * k), base = Q * s;
    if (solid[s]) { for (let q = 0; q < Q; q++) dest[base + q] = -1; continue; }
    for (let q = 0; q < Q; q++) {
      const c = [CX[q], CY[q], CZ[q]], p = [i + c[0], j + c[1], k + c[2]], cc = c.slice();
      let drop = false, wall = false;
      for (let a = 0; a < 3; a++) {
        if (p[a] >= 0 && p[a] < n[a]) continue;
        if (a === flowAxis) { drop = true; break; }
        if (lateral === 'wall') { wall = true; break; }
        p[a] -= c[a]; cc[a] = -c[a];        // free slip: mirror the velocity component
      }
      if (drop) { dest[base + q] = -1; continue; }
      if (wall) { dest[base + q] = -3; continue; }
      const t = p[0] + nx * (p[1] + ny * p[2]);
      if (solid[t]) { dest[base + q] = solid[t] === 1 ? -2 : -3; continue; }
      dest[base + q] = Q * t + dirIndex(cc[0], cc[1], cc[2]);
    }
  }
  // Inlet / outlet planes (fluid cells), with the neighbouring plane for extrapolation.
  const plane = (pos) => {
    const list = [];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = [i, j, k];
      if (c[flowAxis] !== pos) continue;
      const s = i + nx * (j + ny * k);
      if (solid[s]) continue;
      const d = c.slice(); d[flowAxis] += pos === 0 ? 1 : -1;
      const t = d[0] + nx * (d[1] + ny * d[2]);
      list.push([s, solid[t] ? s : t]);
    }
    return list;
  };
  const up = flowSign > 0 ? 0 : n[flowAxis] - 1, down = flowSign > 0 ? n[flowAxis] - 1 : 0;
  const inlet = plane(up), outlet = plane(down);
  const omega0 = 1 / tau, cs2 = smagorinsky > 0 ? 18 * Math.SQRT2 * smagorinsky * smagorinsky : 0;
  const feq = new Float64Array(Q), force = [0, 0, 0], sumForce = [0, 0, 0];
  let prev = 0, steps = 0, converged = false, unstable = false, averaged = 0;
  const avgWindow = 100;
  const moments = (arr, s) => {
    let r = 0, x = 0, y = 0, z = 0;
    const o = Q * s;
    for (let q = 0; q < Q; q++) { const v = arr[o + q]; r += v; x += v * CX[q]; y += v * CY[q]; z += v * CZ[q]; }
    return [r, x / r, y / r, z / r];
  };
  const fluidList = [];
  for (let s = 0; s < N; s++) if (!solid[s]) fluidList.push(s);
  const fluid = Int32Array.from(fluidList);
  const cx = Float64Array.from(CX), cy = Float64Array.from(CY), cz = Float64Array.from(CZ), w = Float64Array.from(W), opp = Int32Array.from(OPP);
  const post = new Float64Array(Q);
  for (; steps < maxSteps; steps++) {
    let fx = 0, fy = 0, fz = 0;
    for (let m = 0; m < fluid.length; m++) {
      const s = fluid[m], o = Q * s;
      let r = 0, mx = 0, my = 0, mz = 0;
      for (let q = 0; q < Q; q++) { const v = f[o + q]; r += v; mx += v * cx[q]; my += v * cy[q]; mz += v * cz[q]; }
      const ux = mx / r, uy = my / r, uz = mz / r, usq = 1.5 * (ux * ux + uy * uy + uz * uz);
      for (let q = 0; q < Q; q++) { const cu = 3 * (cx[q] * ux + cy[q] * uy + cz[q] * uz); feq[q] = w[q] * r * (1 + cu + 0.5 * cu * cu - usq); }
      let omega = omega0;
      if (cs2) {
        let pxx = 0, pyy = 0, pzz = 0, pxy = 0, pyz = 0, pzx = 0;
        for (let q = 0; q < Q; q++) { const d = f[o + q] - feq[q], a1 = cx[q], b1 = cy[q], c1 = cz[q]; pxx += a1 * a1 * d; pyy += b1 * b1 * d; pzz += c1 * c1 * d; pxy += a1 * b1 * d; pyz += b1 * c1 * d; pzx += c1 * a1 * d; }
        const Pi = Math.sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2 * (pxy * pxy + pyz * pyz + pzx * pzx));
        omega = 2 / (tau + Math.sqrt(tau * tau + (cs2 * Pi) / r));
      }
      for (let q = 0; q < Q; q++) post[q] = f[o + q] - omega * (f[o + q] - feq[q]);
      for (let q = 0; q < Q; q++) {
        const d = dest[o + q];
        if (d >= 0) g[d] = post[q];
        else if (d === -2) { g[o + opp[q]] = post[q]; fx += 2 * post[q] * cx[q]; fy += 2 * post[q] * cy[q]; fz += 2 * post[q] * cz[q]; }
        else if (d === -3) g[o + opp[q]] = post[q];
      }
    }
    force[0] = fx; force[1] = fy; force[2] = fz;
    // Velocity inlet (density from the next plane) and pressure outlet (ρ = 1, velocity from the previous plane).
    for (const [s, t] of inlet) { const m = moments(g, t); equilibrium(m[0], uin[0], uin[1], uin[2], g, Q * s); }
    for (const [s, t] of outlet) { const m = moments(g, t); equilibrium(1, m[1], m[2], m[3], g, Q * s); }
    const tmp = f; f = g; g = tmp;
    if (steps >= maxSteps - avgWindow || averaged) { for (let a = 0; a < 3; a++) sumForce[a] += force[a]; averaged++; }
    if (steps % 50 === 49) {
      let mon = 0;
      for (let s = 0; s < N; s += 7) { if (solid[s]) continue; const o = Q * s; let x = 0, r = 0; for (let q = 0; q < Q; q++) { r += f[o + q]; x += f[o + q] * (CX[q] + 2 * CY[q] + 3 * CZ[q]); } mon += x / r; }
      if (!Number.isFinite(mon)) { unstable = true; break; }
      const change = Math.abs(mon - prev) / Math.max(1e-12, Math.abs(mon));
      prev = mon;
      onProgress?.(Math.min(0.97, steps / maxSteps));
      if (steps > minSteps && change < tol && !averaged) { averaged = 1; for (let a = 0; a < 3; a++) sumForce[a] = force[a]; }
      if (averaged >= avgWindow) { converged = true; steps++; break; }
    }
  }
  if (averaged > 0) for (let a = 0; a < 3; a++) force[a] = sumForce[a] / averaged;
  const rho = new Float32Array(N), vel = new Float32Array(3 * N);
  for (let s = 0; s < N; s++) {
    if (solid[s]) { rho[s] = 1; continue; }
    const m = moments(f, s);
    rho[s] = m[0]; vel[3 * s] = m[1]; vel[3 * s + 1] = m[2]; vel[3 * s + 2] = m[3];
  }
  const avgRho = (list) => (list.length ? list.reduce((t, [s]) => t + rho[s], 0) / list.length : 1);
  // Frontal area: body cells projected along the flow axis.
  const front = new Set();
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (solid[i + nx * (j + ny * k)] !== 1) continue;
    const c = [i, j, k]; c[flowAxis] = 0; front.add(c.join(','));
  }
  onProgress?.(1);
  return { dims, rho, vel, force, steps, converged, unstable, inletRho: avgRho(inlet), outletRho: avgRho(outlet), frontCells: front.size, inletCells: inlet.length, uLat, tau, flowAxis, flowSign };
}

/** Fluid cells of the inlet and the hydraulic diameter (cells) of that cross-section: 4A/P. */
function hydraulicDiameter(dims, solid, axis, pos) {
  const [a1, a2] = [0, 1, 2].filter((a) => a !== axis);
  let area = 0, perim = 0;
  const at = (c) => solid[c[0] + dims[0] * (c[1] + dims[1] * c[2])];
  for (let p = 0; p < dims[a1]; p++) for (let q = 0; q < dims[a2]; q++) {
    const c = [0, 0, 0]; c[axis] = pos; c[a1] = p; c[a2] = q;
    if (at(c)) continue;
    area++;
    for (const [da, d] of [[a1, 1], [a1, -1], [a2, 1], [a2, -1]]) { const e = c.slice(); e[da] += d; if (e[da] < 0 || e[da] >= dims[da] || at(e)) perim++; }
  }
  return { area, diameter: perim ? (4 * area) / perim : 0 };
}

export const FLUIDS = { air: { density: 1.204, viscosity: 1.516e-5 }, water: { density: 998.2, viscosity: 1.004e-6 } };

/**
 * Flow around (external) or through (internal) a body mesh. options: { mode 'external' | 'internal',
 * axis 'x' | 'y' | 'z' and sign ±1 (flow direction), resolution (cells along the body's longest side), velocity
 * (m/s), fluid { density kg/m³, viscosity m²/s } or 'air' | 'water', uLat, maxSteps, smagorinsky, onProgress }.
 * Returns the lattice result plus { origin, h (mm), solid, reynolds (requested), reynoldsSimulated, dragForce (N),
 * dragCoefficient, frontalArea (mm²), pressureDrop (Pa), meanVelocity (m/s at the inlet), maxVelocity (m/s) }.
 */
export function flowField(mesh, { mode = 'external', axis = 'x', sign = 1, resolution = 16, velocity = 1, fluid = 'air', uLat = 0.08, maxSteps = 3000, smagorinsky = 0.14, tauMin = 0.505, onProgress = null } = {}) {
  const grid = buildGrid(mesh, resolution);
  if (!grid) return { ok: false, error: 'empty' };
  const fa = { x: 0, y: 1, z: 2 }[axis] ?? 0;
  const props = typeof fluid === 'string' ? FLUIDS[fluid] ?? FLUIDS.air : fluid;
  const body = [grid.nx, grid.ny, grid.nz], h = grid.h;
  // Margins (cells): external flow gets room up- and downstream and to the sides; internal flow one cell at the ends.
  const L = Math.max(...body);
  const pad = [0, 1, 2].map((a) => (mode === 'internal' ? (a === fa ? [1, 1] : [1, 1]) : a === fa ? (sign > 0 ? [Math.ceil(0.6 * L), Math.ceil(1.6 * L)] : [Math.ceil(1.6 * L), Math.ceil(0.6 * L)]) : [Math.ceil(0.5 * L), Math.ceil(0.5 * L)]));
  const dims = body.map((b, a) => b + pad[a][0] + pad[a][1]);
  const N = dims[0] * dims[1] * dims[2], solid = new Uint8Array(N);
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    if (!grid.solid[i + grid.nx * (j + grid.ny * k)]) continue;
    solid[(i + pad[0][0]) + dims[0] * ((j + pad[1][0]) + dims[1] * (k + pad[2][0]))] = 1;
  }
  if (mode === 'internal') {
    // The pad cells on the sides are walls; fluid outside the body (reachable from the sides) is closed off.
    const idx = (c) => c[0] + dims[0] * (c[1] + dims[1] * c[2]);
    const stack = [];
    for (let k = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) {
      const c = [i, j, k];
      const side = [0, 1, 2].some((a) => a !== fa && (c[a] === 0 || c[a] === dims[a] - 1));
      if (side) { const s = idx(c); if (!solid[s]) { solid[s] = 2; stack.push(c); } }
    }
    // The end pads: fluid only where the body's end section is open.
    for (const pos of [0, dims[fa] - 1]) {
      for (let k = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) {
        const c = [i, j, k]; if (c[fa] !== pos) continue;
        const e = c.slice(); e[fa] = pos === 0 ? 1 : dims[fa] - 2;
        if (solid[idx(e)]) solid[idx(c)] = 2;
      }
    }
    while (stack.length) {
      const c = stack.pop();
      for (let a = 0; a < 3; a++) for (const d of [-1, 1]) {
        const e = c.slice(); e[a] += d;
        if (e[a] < 0 || e[a] >= dims[a]) continue;
        // Within each cross-section only: the passage is closed off from the outside by the body's walls.
        const s = idx(e);
        if (solid[s]) continue;
        if (a === fa) continue;
        solid[s] = 2; stack.push(e);
      }
    }
  }
  let fluidCells = 0;
  for (let s = 0; s < N; s++) if (!solid[s]) fluidCells++;
  if (!fluidCells) return { ok: false, error: 'no-fluid' };
  const inletPos = sign > 0 ? 0 : dims[fa] - 1;
  const hd = hydraulicDiameter(dims, solid, fa, mode === 'internal' ? Math.min(dims[fa] - 1, Math.max(0, inletPos + (sign > 0 ? 1 : -1))) : inletPos);
  if (mode === 'internal' && !hd.area) return { ok: false, error: 'no-passage' };
  // Characteristic length (cells): the body's size across the flow (external) or the hydraulic diameter (internal).
  const lc = mode === 'internal' ? Math.max(1, hd.diameter) : Math.max(...[0, 1, 2].filter((a) => a !== fa).map((a) => body[a]));
  const lcM = (lc * h) / 1000;
  const reynolds = (velocity * lcM) / props.viscosity;
  const nuLat = (uLat * lc) / Math.max(1e-9, reynolds);
  const tau = Math.max(tauMin, 3 * nuLat + 0.5);
  const reynoldsSimulated = (uLat * lc) / ((tau - 0.5) / 3);
  const lat = flowLattice({ dims, solid, flowAxis: fa, flowSign: sign, lateral: mode === 'internal' ? 'wall' : 'slip', tau, uLat, smagorinsky, maxSteps, onProgress });
  if (lat.unstable) return { ok: false, error: 'unstable', ...lat };
  const dx = h / 1000, scaleV = velocity / uLat, q = props.density * scaleV * scaleV;
  const dragLat = lat.force[fa] * sign;
  const dragForce = dragLat * q * dx * dx;
  const frontalArea = lat.frontCells * h * h;
  const dragCoefficient = lat.frontCells ? dragLat / (0.5 * uLat * uLat * lat.frontCells) : 0;
  const pressureDrop = ((lat.inletRho - lat.outletRho) / 3) * q;
  let vmax = 0;
  for (let s = 0; s < N; s++) vmax = Math.max(vmax, Math.hypot(lat.vel[3 * s], lat.vel[3 * s + 1], lat.vel[3 * s + 2]));
  const origin = [0, 1, 2].map((a) => grid.o[a] - pad[a][0] * h);
  return {
    ok: true, error: lat.converged ? null : 'not-converged', ...lat, mode, axis, sign, origin, h, solid, fluidCells,
    reynolds, reynoldsSimulated, capped: reynoldsSimulated < reynolds * 0.98, velocity, fluid: props,
    dragForce, dragCoefficient, frontalArea, pressureDrop, meanVelocity: velocity, maxVelocity: vmax * scaleV,
    hydraulicDiameter: hd.diameter * h, characteristicLength: lc * h, elements: lat.steps ? fluidCells : 0, elementSize: h,
  };
}

/** Velocity (lattice) at a world point by trilinear interpolation of the cell centres (null outside / in solid). */
export function velocityAt(flow, p) {
  const { dims, origin, h, vel, solid } = flow;
  const c = [0, 1, 2].map((a) => (p[a] - origin[a]) / h - 0.5);
  const i0 = c.map(Math.floor);
  if (i0.some((v, a) => v < 0 || v + 1 >= dims[a])) return null;
  const out = [0, 0, 0];
  let wsum = 0;
  for (let b = 0; b < 8; b++) {
    const ii = [i0[0] + (b & 1), i0[1] + ((b >> 1) & 1), i0[2] + ((b >> 2) & 1)];
    const s = ii[0] + dims[0] * (ii[1] + dims[1] * ii[2]);
    if (solid[s]) continue;
    const w = [0, 1, 2].reduce((t, a) => t * ((b >> a) & 1 ? c[a] - i0[a] : 1 - (c[a] - i0[a])), 1);
    wsum += w;
    for (let a = 0; a < 3; a++) out[a] += w * vel[3 * s + a];
  }
  if (wsum < 0.25) return null;
  return out.map((v) => v / wsum);
}

/**
 * A section plane through the flow domain, coloured by speed or pressure: { mesh (vertices, normals, triangles,
 * faceGroups []), colors, min, max } in world units. normalAxis 0/1/2, at (world coordinate along it; default the
 * middle), quantity 'velocity' | 'pressure'.
 */
export function flowSection(flow, { normalAxis = 1, at = null, quantity = 'velocity' } = {}) {
  const { dims, origin, h, vel, rho, solid } = flow;
  const [a1, a2] = [0, 1, 2].filter((a) => a !== normalAxis);
  const mid = at == null ? Math.floor(dims[normalAxis] / 2) : Math.min(dims[normalAxis] - 1, Math.max(0, Math.round((at - origin[normalAxis]) / h - 0.5)));
  const n1 = dims[a1], n2 = dims[a2];
  const scaleV = flow.velocity / flow.uLat, q = flow.fluid.density * scaleV * scaleV;
  const value = (s) => (quantity === 'pressure' ? ((rho[s] - 1) / 3) * q : Math.hypot(vel[3 * s], vel[3 * s + 1], vel[3 * s + 2]) * scaleV);
  const cell = new Float64Array(n1 * n2), inSolid = new Uint8Array(n1 * n2);
  let min = Infinity, max = -Infinity;
  for (let q2 = 0; q2 < n2; q2++) for (let q1 = 0; q1 < n1; q1++) {
    const c = [0, 0, 0]; c[normalAxis] = mid; c[a1] = q1; c[a2] = q2;
    const s = c[0] + dims[0] * (c[1] + dims[1] * c[2]);
    inSolid[q1 + n1 * q2] = solid[s] ? 1 : 0;
    if (solid[s]) continue;
    const v = value(s);
    cell[q1 + n1 * q2] = v;
    min = Math.min(min, v); max = Math.max(max, v);
  }
  if (!Number.isFinite(min)) { min = 0; max = 1; }
  const vertices = [], normals = [], triangles = [], colors = [];
  const nrm = [0, 0, 0]; nrm[normalAxis] = 1;
  const pos = origin[normalAxis] + (mid + 0.5) * h;
  for (let q2 = 0; q2 < n2; q2++) for (let q1 = 0; q1 < n1; q1++) {
    const k = q1 + n1 * q2;
    if (inSolid[k]) continue;   // solid cells: left out (the body shows there)
    const base = vertices.length / 3;
    for (const [d1, d2] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = [0, 0, 0]; p[normalAxis] = pos; p[a1] = origin[a1] + (q1 + d1) * h; p[a2] = origin[a2] + (q2 + d2) * h;
      vertices.push(...p); normals.push(...nrm);
      colors.push(...stressColor(cell[k], min, max));
    }
    triangles.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { mesh: { vertices: Float32Array.from(vertices), normals: Float32Array.from(normals), triangles: Uint32Array.from(triangles), faceGroups: [] }, colors: Float32Array.from(colors), min, max, quantity, normalAxis, index: mid };
}

/** Streamlines from seeds spread over the inlet: line segments [x,y,z, x,y,z, …] (world) and per-segment speed. */
export function streamlines(flow, { count = 7, maxSteps = 600 } = {}) {
  const { dims, origin, h, flowAxis: fa, flowSign: sign } = flow;
  const [a1, a2] = [0, 1, 2].filter((a) => a !== fa);
  const seeds = [];
  const start = sign > 0 ? origin[fa] + 1.6 * h : origin[fa] + (dims[fa] - 1.6) * h;
  for (let p = 1; p <= count; p++) for (let q = 1; q <= count; q++) {
    const s = [0, 0, 0]; s[fa] = start;
    s[a1] = origin[a1] + (dims[a1] * h * p) / (count + 1);
    s[a2] = origin[a2] + (dims[a2] * h * q) / (count + 1);
    seeds.push(s);
  }
  const segments = [], speed = [];
  const step = 0.5 * h;
  for (const seed of seeds) {
    let p = seed.slice();
    for (let n = 0; n < maxSteps; n++) {
      const v1 = velocityAt(flow, p);
      if (!v1) break;
      const m1 = Math.hypot(...v1);
      if (m1 < 1e-6) break;
      const mid = p.map((x, a) => x + (0.5 * step * v1[a]) / m1);
      const v2 = velocityAt(flow, mid) ?? v1;
      const m2 = Math.hypot(...v2) || m1;
      const q = p.map((x, a) => x + (step * v2[a]) / m2);
      segments.push(...p, ...q); speed.push(m2 / flow.uLat);
      p = q;
    }
  }
  return { segments, speed };
}

export { stressColor };
