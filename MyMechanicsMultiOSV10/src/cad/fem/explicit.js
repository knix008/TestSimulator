// Explicit dynamics on the tetrahedral model: the drop test (no kernel, no DOM).
//
// Central differences (velocity Verlet) with HRZ-lumped masses. Internal forces are total Lagrangian (Green–Lagrange
// strain, second Piola–Kirchhoff stress) with the J2 elastic–plastic material of nonlinear.js, so large rotations,
// unloading and plastic dissipation are handled; linear tets (default, one point) or quadratic tets (four points).
// Stable step: Δt = safety · min_e h_e / c_d (h_e the smallest element altitude, c_d = √((λ+2μ)/ρ) the dilatational
// wave speed; half of it for quadratic elements).
//
// Floor contact: a plane perpendicular to the drop direction through the part's lowest point. Each surface node
// that penetrates gets a normal penalty force k·g + c·ġ with k = β·m/Δt² (β = 0.25: a stiff, still stable,
// near-kinematic constraint), or the elastic floor's own stiffness (E_floor / thickness × the node's area, a Winkler
// layer) when that is softer; c is a viscous ratio ζ of the critical 2√(k·m). Coulomb friction μ·|f_n| opposes the
// tangential velocity, capped by the force that stops it within the step (no reversal).
//
// Energy balance is tracked incrementally: kinetic, internal (elastic stored + plastic dissipation), contact
// (floor stored, damping + friction dissipation) and the work of gravity; the reported error is the imbalance over
// the largest energy.
//
// Units: mm, N, MPa, t/mm³, s. Gravity in mm/s².

import { buildModel, lumpedMass, elementX, modelGraph, surfaceField, nodalAreas, recoverNodal, vonMisesField } from './model.js';
import { ruleOf, ruleDerivatives, gradients, tetVolume, FACES, faceShape as faceShapeOf } from './elements.js';
import { j2Update } from './nonlinear.js';
import { faceIndex, projectOnFace, tangents } from './contact.js';

/** A box surface (6 faces, ids 0…5) spanning lo…hi in the frame (e1, e2, e3), counter-clockwise from outside. */
function frameBox(lo, hi, e) {
  const vertices = [], triangles = [], faceGroups = [];
  const P = (a, b, c) => [0, 1, 2].map((k) => a * e[0][k] + b * e[1][k] + c * e[2][k]);
  const [L, W, H] = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const faces = [[[0, 0, 0], [0, 0, H], [0, W, 0]], [[L, 0, 0], [0, W, 0], [0, 0, H]], [[0, 0, 0], [L, 0, 0], [0, 0, H]], [[0, W, 0], [0, 0, H], [L, 0, 0]], [[0, 0, 0], [0, W, 0], [L, 0, 0]], [[0, 0, H], [L, 0, 0], [0, W, 0]]];
  faces.forEach(([o, a, b], id) => {
    const base = vertices.length / 3, start = triangles.length;
    for (const [i, j] of [[0, 0], [1, 0], [1, 1], [0, 1]]) vertices.push(...P(lo[0] + o[0] + a[0] * i + b[0] * j, lo[1] + o[1] + a[1] * i + b[1] * j, lo[2] + o[2] + a[2] * i + b[2] * j));
    triangles.push(base, base + 1, base + 2, base, base + 2, base + 3);
    faceGroups.push({ start, count: 6, faceId: id });
  });
  return { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles), faceGroups };
}

const fail = (error, extra = {}) => ({ ok: false, error, elements: 0, elementSize: 0, maxDisplacement: 0, maxStress: 0, minFactorOfSafety: Infinity, vertexDisplacement: new Float32Array(0), vertexStress: new Float32Array(0), time: [], force: [], stress: [], deformation: [], ...extra });

/**
 * Drop test. input: { bodies (one part), mesh ({ order: 1 | 2, size, resolution }), height (mm), velocity (mm/s, overrides
 * height), direction (unit drop direction, default [0,0,−1]), gravity (mm/s², default 9810), duration (s; default the
 * time for 3 wave passes after impact, or until rebound), floor: { type: 'rigid' | 'elastic', E (MPa), thickness (mm),
 * friction μ, damping ζ }, plastic (material plasticity, default true when the material has a yield), samples,
 * frames (snapshots kept for playback), safety (Δt factor, default 0.8), onProgress, cancel }.
 */
export function dropStudy(input) {
  const { bodies, mesh = {}, height = 1000, velocity = null, direction = [0, 0, -1], gravity = 9810, duration = null,
    floor = {}, plastic = true, samples = 200, frames = 24, safety = 0.8, maxSteps = 400000, onProgress = null, cancel = null,
    initialVelocity = null, model: given = null } = input;
  const report = (f, st) => onProgress?.(Math.min(1, Math.max(0, f)), st);
  const len = Math.hypot(...direction) || 1, dir = direction.map((v) => v / len);
  // A meshed elastic floor slab (floor.type 'slab'): a second body under the part, its far face held.
  const slab = floor.type === 'slab' && !given;
  let allBodies = bodies;
  if (slab) {
    const V = bodies[0].mesh.vertices, e = [...tangents(dir), dir];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) { const p = V[i] * e[k][0] + V[i + 1] * e[k][1] + V[i + 2] * e[k][2]; lo[k] = Math.min(lo[k], p); hi[k] = Math.max(hi[k], p); }
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1]), margin = floor.margin ?? 0.5 * span, th = floor.thickness ?? Math.max(5, 0.3 * span);
    const box = frameBox([lo[0] - margin, lo[1] - margin, hi[2]], [hi[0] + margin, hi[1] + margin, hi[2] + th], e);
    allBodies = [...bodies, { mesh: box, material: { E: floor.E ?? 30000, nu: floor.nu ?? 0.2, density: floor.density ?? 2400, yield: 0, plastic: false }, name: 'floor', meshOptions: { size: floor.elementSize ?? Math.max(th / 3, (mesh.size ?? span / 8)), refine: [] } }];
  }
  const model = given ?? buildModel(allBodies, { order: 1, ...mesh }, (f) => report(0.1 * f, 'mesh'));
  if (!model.ok) return fail(model.error);
  const nPart = model.bodies[0].nodeEnd;
  const nn = model.nn, ndof = 3 * nn, npe = model.npe;
  const mats = model.bodies.map((p) => {
    const m = p.material, E = m.E, Et = m.tangentModulus > 0 ? m.tangentModulus : E / 20, H = (E * Et) / Math.max(1e-9, E - Et);
    return { ...m, isotropic: m.isotropic ?? 0.5 * H, kinematic: m.kinematic ?? 0.5 * H, plastic: plastic && m.yield > 0 && m.plastic !== false };
  });
  const mass = lumpedMass(model);
  let totalMass = 0; for (let n = 0; n < nPart; n++) totalMass += mass[n];
  // Stable time step.
  const rule = ruleOf(model.order), ng = rule.weights.length, dNs = ruleDerivatives(model.order, rule);
  const X = new Float64Array(3 * npe), C = new Float64Array(12);
  let dt = Infinity;
  for (let e = 0; e < model.ne; e++) {
    const m = mats[model.elemBody[e]], cd = Math.sqrt((m.lambda + 2 * m.mu) / m.rho);
    for (let a = 0; a < 4; a++) { const p = 3 * model.elements[npe * e + a]; C[3 * a] = model.nodes[p]; C[3 * a + 1] = model.nodes[p + 1]; C[3 * a + 2] = model.nodes[p + 2]; }
    const V = tetVolume(C);
    let amax = 0;
    for (const [a, b, c] of FACES) {
      const ux = C[3 * b] - C[3 * a], uy = C[3 * b + 1] - C[3 * a + 1], uz = C[3 * b + 2] - C[3 * a + 2], vx = C[3 * c] - C[3 * a], vy = C[3 * c + 1] - C[3 * a + 1], vz = C[3 * c + 2] - C[3 * a + 2];
      amax = Math.max(amax, 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx));
    }
    const h = (3 * V) / Math.max(1e-30, amax);
    dt = Math.min(dt, (model.order === 2 ? 0.5 : 1) * h / cd);
  }
  dt *= safety;
  const cBar = Math.sqrt(mats[0].E / mats[0].rho);

  // Floor: the plane through the node furthest along the drop direction; contact nodes = surface nodes with areas.
  let front = -Infinity, back = Infinity;
  for (let n = 0; n < nPart; n++) { const p = model.nodes[3 * n] * dir[0] + model.nodes[3 * n + 1] * dir[1] + model.nodes[3 * n + 2] * dir[2]; front = Math.max(front, p); back = Math.min(back, p); }
  const allFaces = Array.from({ length: model.faces.nf }, (_, f) => f).filter((q) => model.faces.body[q] === 0);
  // Slab: its top faces (outward normal against the drop) are the master surface; the far face is held.
  const slabTop = slab ? faceIndex(model, 1) : null;
  if (slabTop) slabTop.top = new Set(slabTop.list.filter((q) => { const r = projectOnFace(model, q, [0, 0, 0]); return r.normal[0] * dir[0] + r.normal[1] * dir[1] + r.normal[2] * dir[2] < -0.5; }));
  const held = new Uint8Array(nn);
  if (slab) { let far = -Infinity; for (let n = nPart; n < nn; n++) far = Math.max(far, model.nodes[3 * n] * dir[0] + model.nodes[3 * n + 1] * dir[1] + model.nodes[3 * n + 2] * dir[2]); for (let n = nPart; n < nn; n++) if (far - (model.nodes[3 * n] * dir[0] + model.nodes[3 * n + 1] * dir[1] + model.nodes[3 * n + 2] * dir[2]) < 1e-6 * model.size) held[n] = 1; }
  const { area } = nodalAreas(model, allFaces);
  const cNodes = Int32Array.from(area.keys()), cArea = Float64Array.from(area.values());
  const beta = floor.beta ?? 0.25, zeta = floor.damping ?? 0.0, mu = floor.friction ?? 0;
  const kc = new Float64Array(cNodes.length), cc = new Float64Array(cNodes.length);
  for (let i = 0; i < cNodes.length; i++) {
    const m = mass[cNodes[i]];
    let k = (beta * m) / (dt * dt);
    if (floor.type === 'elastic' && floor.E > 0) k = Math.min(k, (floor.E / Math.max(1e-6, floor.thickness ?? 10)) * cArea[i]);
    kc[i] = k; cc[i] = 2 * zeta * Math.sqrt(k * m);
  }
  const v0 = velocity != null ? velocity : Math.sqrt(2 * gravity * Math.max(0, height));
  const lengthAlong = Math.max(model.size, front - back);
  // Default duration: a few wave passes through the part (and through the slab, which may be much softer).
  const cSlab = slab ? Math.sqrt(mats[1].E / mats[1].rho) : Infinity, thSlab = slab ? (floor.thickness ?? 0) : 0;
  const T = duration > 0 ? duration : Math.max((5 * lengthAlong) / cBar + (slab ? (12 * Math.max(thSlab, model.bodies[1].mesh.size)) / cSlab : 0), 1e-6);
  const nSteps = Math.min(maxSteps, Math.max(20, Math.ceil(T / dt)));
  const every = Math.max(1, Math.floor(nSteps / Math.max(10, samples))), frameEvery = Math.max(1, Math.floor(nSteps / Math.max(1, frames)));

  // State.
  const u = new Float64Array(ndof), v = new Float64Array(ndof), a = new Float64Array(ndof), fint = new Float64Array(ndof), fext = new Float64Array(ndof);
  for (let n = 0; n < nPart; n++) for (let k = 0; k < 3; k++) v[3 * n + k] = (initialVelocity ? initialVelocity[k] : 0) + v0 * dir[k];
  const nq = ng * model.ne;
  let state = { ep: new Float64Array(6 * nq), alpha: new Float64Array(6 * nq), eqp: new Float64Array(nq), S: new Float64Array(6 * nq), yielded: new Uint8Array(nq) };
  const G = new Float64Array(3 * npe), F = new Float64Array(9), E = new Float64Array(6), out = { S: new Float64Array(6), D: new Float64Array(36) }, st = { ep: [0, 0, 0, 0, 0, 0], alpha: [0, 0, 0, 0, 0, 0], eqp: 0 };
  const W0 = new Float64Array(nq * 0 + model.ne * ng);   // Gauss weights × det
  const gradCache = new Float64Array(model.ne * ng * 3 * npe);
  for (let e = 0; e < model.ne; e++) {
    elementX(model, e, X);
    for (let g = 0; g < ng; g++) { W0[ng * e + g] = rule.weights[g] * gradients(npe, X, dNs[g], G); gradCache.set(G, (ng * e + g) * 3 * npe); }
  }
  let elasticEnergy = 0;
  const internalForce = () => {
    fint.fill(0); elasticEnergy = 0;
    for (let e = 0; e < model.ne; e++) {
      const mat = mats[model.elemBody[e]], base = npe * e;
      for (let g = 0; g < ng; g++) {
        const q = ng * e + g, w = W0[q], go = q * 3 * npe;
        F[0] = 1; F[1] = 0; F[2] = 0; F[3] = 0; F[4] = 1; F[5] = 0; F[6] = 0; F[7] = 0; F[8] = 1;
        for (let a2 = 0; a2 < npe; a2++) {
          const d = 3 * model.elements[base + a2], gx = gradCache[go + 3 * a2], gy = gradCache[go + 3 * a2 + 1], gz = gradCache[go + 3 * a2 + 2];
          for (let k = 0; k < 3; k++) { const uk = u[d + k]; F[3 * k] += uk * gx; F[3 * k + 1] += uk * gy; F[3 * k + 2] += uk * gz; }
        }
        const Cm = (i, j) => F[i] * F[j] + F[3 + i] * F[3 + j] + F[6 + i] * F[6 + j];
        E[0] = 0.5 * (Cm(0, 0) - 1); E[1] = 0.5 * (Cm(1, 1) - 1); E[2] = 0.5 * (Cm(2, 2) - 1); E[3] = Cm(0, 1); E[4] = Cm(1, 2); E[5] = Cm(2, 0);
        for (let i = 0; i < 6; i++) { st.ep[i] = state.ep[6 * q + i]; st.alpha[i] = state.alpha[6 * q + i]; }
        st.eqp = state.eqp[q];
        j2Update(E, st, mat, out);
        const S = out.S;
        // Commit immediately (explicit: one evaluation per step).
        for (let i = 0; i < 6; i++) { state.S[6 * q + i] = S[i]; state.ep[6 * q + i] = out.ep[i]; state.alpha[6 * q + i] = out.alpha[i]; }
        state.eqp[q] = out.eqp; if (out.yielded) state.yielded[q] = 1;
        // Elastic energy ½ S:(E − Eᵖ).
        let we = 0; for (let i = 0; i < 6; i++) we += S[i] * (E[i] - out.ep[i]);
        elasticEnergy += 0.5 * we * w;
        // f_a,k = Σ_ij F_ki S_ij G_aj w
        const P00 = F[0] * S[0] + F[1] * S[3] + F[2] * S[5], P01 = F[0] * S[3] + F[1] * S[1] + F[2] * S[4], P02 = F[0] * S[5] + F[1] * S[4] + F[2] * S[2];
        const P10 = F[3] * S[0] + F[4] * S[3] + F[5] * S[5], P11 = F[3] * S[3] + F[4] * S[1] + F[5] * S[4], P12 = F[3] * S[5] + F[4] * S[4] + F[5] * S[2];
        const P20 = F[6] * S[0] + F[7] * S[3] + F[8] * S[5], P21 = F[6] * S[3] + F[7] * S[1] + F[8] * S[4], P22 = F[6] * S[5] + F[7] * S[4] + F[8] * S[2];
        for (let a2 = 0; a2 < npe; a2++) {
          const d = 3 * model.elements[base + a2], gx = gradCache[go + 3 * a2], gy = gradCache[go + 3 * a2 + 1], gz = gradCache[go + 3 * a2 + 2];
          fint[d] += w * (P00 * gx + P01 * gy + P02 * gz);
          fint[d + 1] += w * (P10 * gx + P11 * gy + P12 * gz);
          fint[d + 2] += w * (P20 * gx + P21 * gy + P22 * gz);
        }
      }
    }
  };
  // Contact forces at the current u, v.
  const contact = { fn: 0, stored: 0, active: 0 };
  const fc = new Float64Array(ndof);
  let dampWork = 0, frictionWork = 0;
  const contactForce = () => {
    fc.fill(0); contact.fn = 0; contact.stored = 0; contact.active = 0;
    const pos = slab ? Float64Array.from(model.nodes, (x, q) => x + u[q]) : null;
    for (let i = 0; i < cNodes.length; i++) {
      const n = cNodes[i], d = 3 * n;
      let pen, vn, masters = null, weights = null, nrm = dir;
      if (slab) {
        // Node-to-surface against the slab's top faces (current positions), relative velocity.
        const x = [pos[d], pos[d + 1], pos[d + 2]];
        let best = null;
        for (const q of slabTop.near(x, 2 * model.size)) { if (!slabTop.top.has(q)) continue; const r = projectOnFace(model, q, x, pos); const g = (x[0] - r.point[0]) * r.normal[0] + (x[1] - r.point[1]) * r.normal[1] + (x[2] - r.point[2]) * r.normal[2]; if (g < 0 && g > -0.5 * model.size && r.d < 0.5 * model.size + Math.abs(g) && (!best || g < best.g)) best = { q, r, g }; }
        if (!best) continue;
        pen = -best.g; nrm = best.r.normal.map((c) => -c);       // along the drop
        const npf = model.faces.npf, Nf = faceShapeOf(model.order, best.r.l);
        masters = []; weights = [];
        for (let a2 = 0; a2 < npf; a2++) { masters.push(model.faces.nodes[npf * best.q + a2]); weights.push(Nf[a2]); }
        vn = v[d] * nrm[0] + v[d + 1] * nrm[1] + v[d + 2] * nrm[2];
        for (let m = 0; m < masters.length; m++) { const dm = 3 * masters[m]; vn -= weights[m] * (v[dm] * nrm[0] + v[dm + 1] * nrm[1] + v[dm + 2] * nrm[2]); }
      } else {
        pen = (model.nodes[d] + u[d]) * dir[0] + (model.nodes[d + 1] + u[d + 1]) * dir[1] + (model.nodes[d + 2] + u[d + 2]) * dir[2] - front;
        if (pen <= 0) continue;
        vn = v[d] * dir[0] + v[d + 1] * dir[1] + v[d + 2] * dir[2];     // > 0: moving further in
      }
      let f = kc[i] * pen + cc[i] * vn;
      if (f < 0) f = 0;                                                     // never pulls
      contact.fn += f; contact.stored += 0.5 * kc[i] * pen * pen; contact.active++;
      for (let k = 0; k < 3; k++) fc[d + k] -= f * nrm[k];
      if (masters) for (let m = 0; m < masters.length; m++) for (let k = 0; k < 3; k++) fc[3 * masters[m] + k] += weights[m] * f * nrm[k];
      if (mu > 0) {
        // Relative tangential velocity (slave minus the master point).
        const vr = [v[d], v[d + 1], v[d + 2]];
        if (masters) for (let m = 0; m < masters.length; m++) for (let k = 0; k < 3; k++) vr[k] -= weights[m] * v[3 * masters[m] + k];
        const vrn = vr[0] * nrm[0] + vr[1] * nrm[1] + vr[2] * nrm[2];
        const vt = [vr[0] - vrn * nrm[0], vr[1] - vrn * nrm[1], vr[2] - vrn * nrm[2]], vtl = Math.hypot(...vt);
        if (vtl > 1e-12) {
          const ft = Math.min(mu * f, (mass[n] * vtl) / dt);
          for (let k = 0; k < 3; k++) fc[d + k] -= (ft * vt[k]) / vtl;
          if (masters) for (let m = 0; m < masters.length; m++) for (let k = 0; k < 3; k++) fc[3 * masters[m] + k] += (weights[m] * ft * vt[k]) / vtl;
        }
      }
    }
  };
  // Gravity.
  for (let n = 0; n < nPart; n++) for (let k = 0; k < 3; k++) fext[3 * n + k] = mass[n] * gravity * dir[k];

  const time = [], force = [], stress = [], deformation = [], kinetic = [], internalE = [], plasticE = [], contactE = [], balance = [];
  const envelope = new Float64Array(nn), snapshots = [];
  let peakStress = 0, peakTime = 0, peakDeformation = 0, impulse = 0, firstContact = -1, lastContact = -1, peakU = null;
  let Wint = 0, Wext = 0, Wcont = 0;
  const KE0 = 0.5 * totalMass * (v0 * v0 + (initialVelocity ? initialVelocity.reduce((s, x, i) => s + x * x + 2 * x * v0 * dir[i], 0) : 0));
  const relative = (outArr) => {
    const mean = [0, 0, 0];
    for (let n = 0; n < nPart; n++) for (let k = 0; k < 3; k++) mean[k] += mass[n] * u[3 * n + k];
    for (let k = 0; k < 3; k++) mean[k] /= totalMass;
    let md = 0;
    for (let n = 0; n < nPart; n++) { let m2 = 0; for (let k = 0; k < 3; k++) { const x = u[3 * n + k] - mean[k]; if (outArr) outArr[3 * n + k] = x; m2 += x * x; } md = Math.max(md, Math.sqrt(m2)); }
    return md;
  };
  const kineticEnergy = () => { let s = 0; for (let n = 0; n < nn; n++) s += 0.5 * mass[n] * (v[3 * n] ** 2 + v[3 * n + 1] ** 2 + v[3 * n + 2] ** 2); return s; };
  internalForce(); contactForce();
  for (let d = 0; d < ndof; d++) a[d] = (fext[d] - fint[d] + fc[d]) / mass[(d / 3) | 0];
  const vHalf = new Float64Array(ndof);
  let rebounded = false;
  for (let step = 0; step <= nSteps; step++) {
    // Velocity Verlet: v½ = v + ½Δt a; u += Δt v½; forces; v = v½ + ½Δt a.
    for (let d = 0; d < ndof; d++) { vHalf[d] = v[d] + 0.5 * dt * a[d]; }
    // Work increments use the mid-step velocity: ΔW = f·v½·Δt (f at the start, then the end, averaged).
    let w0i = 0, w0e = 0, w0c = 0;
    for (let d = 0; d < ndof; d++) { const du = dt * vHalf[d]; w0i += fint[d] * du; w0e += fext[d] * du; w0c += fc[d] * du; u[d] += du; }
    internalForce();
    for (let d = 0; d < ndof; d++) v[d] = vHalf[d];
    contactForce();
    let w1i = 0, w1e = 0, w1c = 0;
    for (let d = 0; d < ndof; d++) { const du = dt * vHalf[d]; w1i += fint[d] * du; w1e += fext[d] * du; w1c += fc[d] * du; }
    Wint += 0.5 * (w0i + w1i); Wext += 0.5 * (w0e + w1e); Wcont += 0.5 * (w0c + w1c);
    for (let d = 0; d < ndof; d++) { if (held[(d / 3) | 0]) { a[d] = 0; v[d] = 0; continue; } a[d] = (fext[d] - fint[d] + fc[d]) / mass[(d / 3) | 0]; v[d] = vHalf[d] + 0.5 * dt * a[d]; }
    impulse += contact.fn * dt;
    if (contact.fn > 0) { if (firstContact < 0) firstContact = step * dt; lastContact = (step + 1) * dt; }
    if (step % every === 0 || step === nSteps) {
      const nodal = recoverNodal(model, state.S, 6), vm = vonMisesField(nodal, nn);
      let ms = 0; for (let n = 0; n < nn; n++) { if (vm[n] > envelope[n]) envelope[n] = vm[n]; if (n < nPart && vm[n] > ms) ms = vm[n]; }
      const md = relative(null), KE = kineticEnergy();
      let plasticW = Wint - elasticEnergy;
      time.push(step * dt); force.push(contact.fn); stress.push(ms); deformation.push(md); kinetic.push(KE); internalE.push(elasticEnergy); plasticE.push(Math.max(0, plasticW)); contactE.push(-Wcont);
      const scale = Math.max(KE0, KE, Wext, Math.abs(Wint), 1e-30);
      balance.push((KE - KE0 - Wext + Wint - Wcont) / scale);
      if (ms > peakStress) { peakStress = ms; peakTime = step * dt; peakU = new Float64Array(ndof); relative(peakU); }
      peakDeformation = Math.max(peakDeformation, md);
      report(0.1 + 0.88 * Math.min(1, step / nSteps), 'solve');
      if (cancel?.()) return fail('cancelled', { model });
    }
    if (step % frameEvery === 0 && snapshots.length < frames + 1) snapshots.push({ time: step * dt, displacement: surfaceField(model, u, 3, 0) });
    if (!Number.isFinite(u[0])) return fail('unstable', { model, dt });
    // Stop once separated after a full contact and moving away (unless a duration was asked for).
    if (!duration && firstContact >= 0 && contact.fn === 0 && lastContact >= 0 && step * dt > lastContact + (2 * lengthAlong) / cBar) {
      let vmean = 0; for (let n = 0; n < nPart; n++) vmean += mass[n] * (v[3 * n] * dir[0] + v[3 * n + 1] * dir[1] + v[3 * n + 2] * dir[2]);
      if (vmean < 0 || !slab) { rebounded = true; break; }       // moving away (a soft slab may let go and catch the part again)
    }
  }
  let vm = 0;
  for (let n = 0; n < nPart; n++) vm -= mass[n] * (v[3 * n] * dir[0] + v[3 * n + 1] * dir[1] + v[3 * n + 2] * dir[2]);
  vm /= totalMass;
  const disp = peakU ?? new Float64Array(ndof);
  const KEend = kinetic.at(-1) ?? 0;
  const eqpNodal = recoverNodal(model, state.eqp, 1);
  let maxEqp = 0; for (let n = 0; n < nn; n++) maxEqp = Math.max(maxEqp, eqpNodal[n]);
  report(1, 'done');
  const yieldOf = mats[0].yield;
  const maxBalance = balance.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  return {
    ok: true, error: null, solver: 'tet-explicit', model, nodes: model.nodes, elements: model.ne, nodeCount: nn, elementSize: model.size,
    time, force, stress, deformation, kinetic, internalEnergy: internalE, plasticDissipation: plasticE, contactEnergy: contactE, energyError: balance,
    energy: { initialKinetic: KE0, finalKinetic: KEend, gravityWork: Wext, internalWork: Wint, elasticStored: elasticEnergy, plastic: Math.max(0, Wint - elasticEnergy), contactAbsorbed: -Wcont, maxImbalance: maxBalance },
    impactVelocity: v0, reboundVelocity: vm, restitution: v0 > 0 ? vm / v0 : 0, mass: totalMass, impulse, momentumChange: totalMass * (v0 + vm),
    meanContactForce: lastContact > firstContact && firstContact >= 0 ? impulse / (lastContact - firstContact) : 0,
    contactStart: firstContact, contactDuration: lastContact > firstContact && firstContact >= 0 ? lastContact - firstContact : 0,
    peakStress, peakStressTime: peakTime, peakDeformation, waveSpeed: cBar, dt, steps: Math.round((time.at(-1) ?? 0) / dt), rebounded,
    maxPlasticStrain: maxEqp, vertexPlasticStrain: surfaceField(model, eqpNodal, 1, 0),
    maxStress: peakStress, maxDisplacement: peakDeformation, minFactorOfSafety: peakStress > 0 && yieldOf > 0 ? yieldOf / peakStress : Infinity,
    displacement: disp, nodeStress: envelope, vertexDisplacement: surfaceField(model, disp, 3, 0), vertexStress: surfaceField(model, envelope, 1, 0),
    frames: snapshots,
  };
}

export { modelGraph };
