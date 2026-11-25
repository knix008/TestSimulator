// Beam (frame) analysis of structural members: 3D Euler–Bernoulli frame elements, 6 degrees of freedom per joint.
//
// Sections: a profile's outline as polygons (outer counter-clockwise, holes clockwise; circles exact) gives the area,
// centroid and second moments by Green's theorem, the principal axes, the extreme fibres, and the torsion constant —
// Bredt's formula for closed thin-walled tubes, Σ b t³ / 3 for open thin-walled shapes, exact for round and square
// bars, Saint-Venant's A⁴ / (40 I_p) for other solid shapes.
//
// The frame: members are straight lines with a section and its orientation (the section's u axis in space); every
// member end, and every point where another member's end lies on a member's span, is a joint (members are split
// there). Each element's 12 × 12 stiffness in its own axes (x along it, y = u, z = v) is turned to the global axes and
// assembled; supports hold chosen components of a joint ('fixed' all six, 'pinned' the three translations, or a
// list); loads are forces and moments at joints, distributed loads along members (N/mm) and gravity (ρ A g),
// as consistent (fixed-end) loads. The system is solved directly (Cholesky on the free components).
// Results: joint displacements and rotations, each element's end forces (N, V_y, V_z, T, M_y, M_z) and, along it,
// the axial + bending stress at the extreme fibres (|N|/A + |M_y|·c_z/I_y + |M_z|·c_y/I_z), deflection, the support
// reactions. Units: mm, N, MPa (N/mm²), kg/m³, m/s².

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

// ───────────────────────── sections

/** Polygon properties: A, first moments, second moments about the origin (counter-clockwise positive). */
function polyMoments(pts) {
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0, Ixy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], c = x0 * y1 - x1 * y0;
    A += c / 2; Sx += ((x0 + x1) * c) / 6; Sy += ((y0 + y1) * c) / 6;
    Ixx += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12; Iyy += ((x0 * x0 + x0 * x1 + x1 * x1) * c) / 12; Ixy += ((x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c) / 24;
  }
  return { A, Sx, Sy, Ixx, Iyy, Ixy };
}

/**
 * The outline of a built-in profile as loops [{ pts, hole }] or circles [{ circle: r, hole }] centred as
 * structuralProfile draws it, and its torsion kind.
 */
export function profileLoops(kind, w, h, t) {
  const W = Math.max(0.5, Number(w) || 40), H = Math.max(0.5, Number(h) || W), T = Math.max(0.1, Math.min(Math.min(W, H) / 2 - 0.05, Number(t) || 3));
  const rect = (a, b, cx = 0, cy = 0) => [[cx - a / 2, cy - b / 2], [cx + a / 2, cy - b / 2], [cx + a / 2, cy + b / 2], [cx - a / 2, cy + b / 2]];
  switch (kind) {
    case 'pipe': return { loops: [{ circle: W / 2 }, { circle: W / 2 - T, hole: true }], torsion: { kind: 'tube', t: T, mid: Math.PI * (W - T) / 1, area: Math.PI * ((W - T) / 2) ** 2 }, T, W, H: W };
    case 'roundBar': return { loops: [{ circle: W / 2 }], torsion: { kind: 'round' }, T, W, H: W };
    case 'squareBar': return { loops: [{ pts: rect(W, W) }], torsion: { kind: 'square', a: W }, T, W, H: W };
    case 'squareTube': return { loops: [{ pts: rect(W, W) }, { pts: rect(W - 2 * T, W - 2 * T).reverse(), hole: true }], torsion: { kind: 'tube', t: T, mid: 4 * (W - T), area: (W - T) ** 2 }, T, W, H: W };
    case 'rectTube': return { loops: [{ pts: rect(W, H) }, { pts: rect(W - 2 * T, H - 2 * T).reverse(), hole: true }], torsion: { kind: 'tube', t: T, mid: 2 * (W - T) + 2 * (H - T), area: (W - T) * (H - T) }, T, W, H };
    case 'angle': return { loops: [{ pts: [[0, 0], [W, 0], [W, T], [T, T], [T, H], [0, H]] }], torsion: { kind: 'open', parts: [[W, T], [H - T, T]] }, T, W, H };
    case 'channel': return { loops: [{ pts: [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, -H / 2 + T], [-W / 2 + T, -H / 2 + T], [-W / 2 + T, H / 2 - T], [W / 2, H / 2 - T], [W / 2, H / 2], [-W / 2, H / 2]] }], torsion: { kind: 'open', parts: [[W, T], [W, T], [H - 2 * T, T]] }, T, W, H };
    case 'tee': return { loops: [{ pts: [[-W / 2, 0], [-W / 2, -T], [-T / 2, -T], [-T / 2, -H], [T / 2, -H], [T / 2, -T], [W / 2, -T], [W / 2, 0]].reverse() }], torsion: { kind: 'open', parts: [[W, T], [H - T, T]] }, T, W, H };
    case 'ibeam': default: {
      const tw = T, tf = Math.min(H / 3, T * 1.5);
      return { loops: [{ pts: [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, -H / 2 + tf], [tw / 2, -H / 2 + tf], [tw / 2, H / 2 - tf], [W / 2, H / 2 - tf], [W / 2, H / 2], [-W / 2, H / 2], [-W / 2, H / 2 - tf], [-tw / 2, H / 2 - tf], [-tw / 2, -H / 2 + tf], [-W / 2, -H / 2 + tf]] }], torsion: { kind: 'open', parts: [[W, tf], [W, tf], [H - 2 * tf, tw]] }, T, W, H };
    }
  }
}

/**
 * Section properties of loops: { A, cu, cv (centroid in the profile's coordinates), Iu, Iv, Iuv (about the centroid,
 * along the profile's x = u and y = v), I1, I2, angle (principal), J, cu/cv extremes (umax, vmax: the farthest
 * fibre from the centroid along u and v) }.
 */
export function sectionProperties(loops, torsion = null) {
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0, Ixy = 0;
  const pts = [];
  for (const l of loops) {
    const s = l.hole ? -1 : 1;
    if (l.circle != null) {
      const r = l.circle, a = Math.PI * r * r, i = (Math.PI * r ** 4) / 4;
      A += s * a; Ixx += s * i; Iyy += s * i;
      for (let k = 0; k < 72; k++) pts.push([r * Math.cos((k * Math.PI) / 36), r * Math.sin((k * Math.PI) / 36)]);
    } else {
      const m = polyMoments(l.pts);
      // Either winding: the moments taken counter-clockwise, a hole's taken away.
      const sg = (l.hole ? -1 : 1) * (Math.sign(m.A) || 1);
      A += sg * m.A; Sx += sg * m.Sx; Sy += sg * m.Sy; Ixx += sg * m.Ixx; Iyy += sg * m.Iyy; Ixy += sg * m.Ixy;
      if (!l.hole) pts.push(...l.pts);
    }
  }
  const cu = Sx / A, cv = Sy / A;
  // About the centroid: Iu = ∫ v² dA (bending about u), Iv = ∫ u² dA, Iuv = ∫ u v dA.
  const Iu = Ixx - A * cv * cv, Iv = Iyy - A * cu * cu, Iuv = Ixy - A * cu * cv;
  const ang = 0.5 * Math.atan2(-2 * Iuv, Iv - Iu);
  const mid = (Iu + Iv) / 2, rad = Math.hypot((Iu - Iv) / 2, Iuv);
  const umax = Math.max(...pts.map((p) => Math.abs(p[0] - cu))), vmax = Math.max(...pts.map((p) => Math.abs(p[1] - cv)));
  const Ip = Iu + Iv;
  let J;
  const tk = torsion?.kind;
  if (tk === 'round') J = Ip;
  else if (tk === 'tube') J = (4 * torsion.area ** 2 * torsion.t) / torsion.mid;
  else if (tk === 'open') J = torsion.parts.reduce((s, [b, t]) => s + (b * t ** 3) / 3, 0);
  else if (tk === 'square') J = 0.1406 * torsion.a ** 4;
  else J = A ** 4 / (40 * Ip);
  if (tk === 'tube' && loops[0]?.circle != null) J = Ip; // a pipe: exact (thick or thin)
  return { A, cu, cv, Iu, Iv, Iuv, I1: mid + rad, I2: mid - rad, angle: ang, J, umax, vmax, pts: pts.map((p) => [p[0] - cu, p[1] - cv]) };
}

// ───────────────────────── the frame

/**
 * Joints and elements of members. Members are split where other members' ends lie on them. A member end that meets
 * nothing (welded members meet at their faces, not their centre lines) is tied to the nearest other member within
 * reach — the two sections' half diagonals — by a rigid link (an element flagged `link`) to the nearest point of that
 * member's line, which splits it there.
 */
export function frameModel(members, { tol = 1e-6, connect = true } = {}) {
  const joints = [];
  const jointAt = (p) => { let i = joints.findIndex((q) => Math.hypot(...sub(p, q)) <= tol); if (i < 0) { joints.push([...p]); i = joints.length - 1; } return i; };
  const ends = members.map((m) => [jointAt(m.a), jointAt(m.b)]);
  const links = [];
  if (connect) {
    const uses = new Map(); for (const [a, b] of ends) { uses.set(a, (uses.get(a) ?? 0) + 1); uses.set(b, (uses.get(b) ?? 0) + 1); }
    const half = (m) => (m.section ? Math.hypot(m.section.umax ?? 0, m.section.vmax ?? 0) : 0);
    members.forEach((m, mi) => {
      for (const ji of ends[mi]) {
        if ((uses.get(ji) ?? 0) > 1) continue;
        const E = joints[ji];
        let best = null;
        members.forEach((o, oi) => {
          if (oi === mi) return;
          const d = sub(o.b, o.a), L2 = dot(d, d); if (!(L2 > 0)) return;
          const tt = Math.max(0, Math.min(1, dot(sub(E, o.a), d) / L2)), P = add(o.a, mul(d, tt));
          const dist = Math.hypot(...sub(E, P)), reach = half(m) + half(o) + tol;
          if (dist <= reach && (!best || dist < best.dist)) best = { P, dist };
        });
        if (!best) continue;
        if (best.dist <= tol) continue; // already on it: split by the member's own joints below
        const jp = jointAt(best.P);
        links.push({ i: ji, j: jp, member: mi });
      }
    });
  }
  const elements = [];
  members.forEach((m, mi) => {
    const d = sub(m.b, m.a), L = Math.hypot(...d), dir = mul(d, 1 / L);
    // Joints on this member's span (strictly inside), in order along it.
    const inner = joints.map((p, j) => ({ j, s: dot(sub(p, m.a), dir) })).filter(({ j, s }) => s > tol && s < L - tol && Math.hypot(...sub(joints[j], add(m.a, mul(dir, s)))) <= tol * Math.max(1, L) * 1e3).sort((x, y) => x.s - y.s);
    const stops = [{ j: ends[mi][0], s: 0 }, ...inner, { j: ends[mi][1], s: L }];
    for (let k = 1; k < stops.length; k++) elements.push({ member: mi, i: stops[k - 1].j, j: stops[k].j, s0: stops[k - 1].s, s1: stops[k].s });
  });
  for (const l of links) if (l.i !== l.j) elements.push({ member: l.member, i: l.i, j: l.j, link: true });
  return { joints, elements };
}

/** The element's axes: x along it, y = the section's u (made square to x), z = x × y. */
export function elementAxes(xa, xb, u) {
  const ex = norm(sub(xb, xa));
  let ey = sub(u, mul(ex, dot(u, ex)));
  if (Math.hypot(...ey) < 1e-9) ey = Math.abs(ex[2]) < 0.9 ? cross([0, 0, 1], ex) : cross([0, 1, 0], ex);
  ey = norm(ey);
  return { ex, ey, ez: cross(ex, ey) };
}

/** The local 12 × 12 stiffness (dofs: u1 v1 w1 θx1 θy1 θz1, u2 …); bending about z uses Iz (∫ y² dA), about y Iy. */
export function localStiffness(E, G, A, Iy, Iz, J, L) {
  const K = Array.from({ length: 12 }, () => new Float64Array(12));
  const s = (i, j, v) => { K[i][j] += v; if (i !== j) K[j][i] += v; };
  const EA = (E * A) / L, GJ = (G * J) / L;
  s(0, 0, EA); s(6, 6, EA); s(0, 6, -EA);
  s(3, 3, GJ); s(9, 9, GJ); s(3, 9, -GJ);
  // Bending in the x–y plane (v, θz) with Iz.
  const a = (12 * E * Iz) / L ** 3, b = (6 * E * Iz) / L ** 2, c = (4 * E * Iz) / L, d = (2 * E * Iz) / L;
  s(1, 1, a); s(7, 7, a); s(1, 7, -a); s(1, 5, b); s(1, 11, b); s(5, 7, -b); s(7, 11, -b); s(5, 5, c); s(11, 11, c); s(5, 11, d);
  // Bending in the x–z plane (w, θy) with Iy (signs: θy = −dw/dx).
  const e = (12 * E * Iy) / L ** 3, f = (6 * E * Iy) / L ** 2, g = (4 * E * Iy) / L, h = (2 * E * Iy) / L;
  s(2, 2, e); s(8, 8, e); s(2, 8, -e); s(2, 4, -f); s(2, 10, -f); s(4, 8, f); s(8, 10, f); s(4, 4, g); s(10, 10, g); s(4, 10, h);
  return K;
}

/** Fixed-end forces (local) of a uniform load q = [qx, qy, qz] (N/mm) over the element. */
function fixedEndForces(q, L) {
  const f = new Float64Array(12);
  f[0] = f[6] = (q[0] * L) / 2;
  f[1] = f[7] = (q[1] * L) / 2; f[5] = (q[1] * L * L) / 12; f[11] = -(q[1] * L * L) / 12;
  f[2] = f[8] = (q[2] * L) / 2; f[4] = -(q[2] * L * L) / 12; f[10] = (q[2] * L * L) / 12;
  return f;
}

/** Cholesky solve of a dense symmetric positive definite system (in place on a copy). */
function choleskySolve(A, b) {
  const n = b.length, L = A.map((r) => Float64Array.from(r));
  for (let j = 0; j < n; j++) {
    let s = L[j][j]; for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
    if (!(s > 1e-300)) return null;
    L[j][j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) { let t = L[i][j]; for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k]; L[i][j] = t / L[j][j]; }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let t = b[i]; for (let k = 0; k < i; k++) t -= L[i][k] * y[k]; y[i] = t / L[i][i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let t = y[i]; for (let k = i + 1; k < n; k++) t -= L[k][i] * x[k]; x[i] = t / L[i][i]; }
  return x;
}

const DOF_SETS = { fixed: [0, 1, 2, 3, 4, 5], pinned: [0, 1, 2] };

/**
 * The frame study. input: { members: [{ a, b, u (section u axis in space), section (sectionProperties), material:
 * { E (MPa), nu, density (kg/m³), yield } }], supports: [{ point, dofs: 'fixed' | 'pinned' | [0..5] }],
 * loads: [{ point, force?, moment? (N·mm) }], memberLoads: [{ member, q: [qx, qy, qz] (N/mm, global) }],
 * gravity: [gx, gy, gz] (m/s²) | null, samples (points along each element for the results, default 11) }.
 */
export function frameStudy(input) {
  const { members, supports = [], loads = [], memberLoads = [], gravity = null, samples = 11 } = input;
  if (!members?.length) return { ok: false, error: 'no-members' };
  const { joints, elements } = frameModel(members);
  const n = 6 * joints.length;
  const K = Array.from({ length: n }, () => new Float64Array(n));
  const F = new Float64Array(n);
  const nearJoint = (p) => { let best = -1, bd = Infinity; joints.forEach((q, i) => { const d = Math.hypot(...sub(p, q)); if (d < bd) { bd = d; best = i; } }); return best; };
  const data = elements.map((el) => {
    const m = members[el.member], mat = m.material;
    // A rigid link: the member's section a hundred times stiffer (no weight, no stress result).
    const sec = el.link ? { ...m.section, A: m.section.A * 100, Iu: m.section.Iu * 100, Iv: m.section.Iv * 100, J: m.section.J * 100 } : m.section;
    const xa = joints[el.i], xb = joints[el.j], L = Math.hypot(...sub(xb, xa));
    const ax = elementAxes(xa, xb, Math.abs(dot(norm(sub(xb, xa)), m.u ?? [0, 0, 1])) > 0.99 ? m.v ?? cross(sub(xb, xa), m.u) : m.u ?? [0, 0, 1]);
    // Local y is the section's u: bending about z (in the x–y plane) uses ∫ u² dA = Iv; about y uses Iu.
    const E = mat.E, G = mat.E / (2 * (1 + (mat.nu ?? 0.3)));
    const Kl = localStiffness(E, G, sec.A, sec.Iu, sec.Iv, sec.J, L);
    const T = [ax.ex, ax.ey, ax.ez];  // rows: local axes in global
    // Global element stiffness: Rᵀ K R blockwise.
    const Kg = Array.from({ length: 12 }, () => new Float64Array(12));
    for (let I = 0; I < 4; I++) for (let J = 0; J < 4; J++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      let v = 0; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) v += T[p][a] * Kl[3 * I + p][3 * J + q] * T[q][b];
      Kg[3 * I + a][3 * J + b] = v;
    }
    const dofs = [...[0, 1, 2, 3, 4, 5].map((k) => 6 * el.i + k), ...[0, 1, 2, 3, 4, 5].map((k) => 6 * el.j + k)];
    for (let p = 0; p < 12; p++) for (let q = 0; q < 12; q++) K[dofs[p]][dofs[q]] += Kg[p][q];
    // Distributed loads (global N/mm): self weight ρ A g and member loads, as fixed-end forces.
    let qg = [0, 0, 0];
    if (gravity && !el.link) qg = add(qg, mul(gravity, (mat.density ?? 7850) * 1e-9 * sec.A)); // kg/m³ · mm² · m/s² → N/mm
    if (!el.link) for (const ml of memberLoads) if (ml.member === el.member) qg = add(qg, ml.q);
    const ql = T.map((r) => dot(r, qg));
    const fe = fixedEndForces(ql, L);
    for (let I = 0; I < 4; I++) for (let a = 0; a < 3; a++) { let v = 0; for (let p = 0; p < 3; p++) v += T[p][a] * fe[3 * I + p]; F[dofs[3 * I + a]] += v; }
    return { el, m, sec, mat, L, T, Kl, dofs, ql, fe };
  });
  for (const l of loads) {
    const j = nearJoint(l.point); if (j < 0) continue;
    for (let k = 0; k < 3; k++) { F[6 * j + k] += l.force?.[k] ?? 0; F[6 * j + 3 + k] += l.moment?.[k] ?? 0; }
  }
  const fixed = new Uint8Array(n);
  for (const s of supports) { const j = nearJoint(s.point); if (j < 0) continue; for (const k of Array.isArray(s.dofs) ? s.dofs : DOF_SETS[s.dofs] ?? DOF_SETS.fixed) fixed[6 * j + k] = 1; }
  if (!fixed.some(Boolean)) return { ok: false, error: 'no-fixtures', joints, elements };
  const free = []; for (let d = 0; d < n; d++) if (!fixed[d]) free.push(d);
  const Kf = free.map((r) => Float64Array.from(free.map((c) => K[r][c])));
  const x = choleskySolve(Kf, Float64Array.from(free.map((d) => F[d])));
  if (!x) return { ok: false, error: 'unstable', joints, elements };
  const U = new Float64Array(n); free.forEach((d, i) => { U[d] = x[i]; });
  // Reactions: K U − F at the held components.
  const reactions = [];
  for (let j = 0; j < joints.length; j++) {
    const held = [0, 1, 2, 3, 4, 5].filter((k) => fixed[6 * j + k]);
    if (!held.length) continue;
    const r = [0, 0, 0, 0, 0, 0];
    for (const k of held) { let v = -F[6 * j + k]; for (let c = 0; c < n; c++) v += K[6 * j + k][c] * U[c]; r[k] = v; }
    reactions.push({ joint: j, point: joints[j], force: r.slice(0, 3), moment: r.slice(3) });
  }
  // Element results.
  let maxStress = 0, maxDisp = 0, maxStressAt = null;
  const results = data.filter((d) => !d.el.link).map((d) => {
    const ug = Float64Array.from(d.dofs.map((k) => U[k]));
    const ul = new Float64Array(12);
    for (let I = 0; I < 4; I++) for (let p = 0; p < 3; p++) ul[3 * I + p] = d.T[p][0] * ug[3 * I] + d.T[p][1] * ug[3 * I + 1] + d.T[p][2] * ug[3 * I + 2];
    // End forces on the element (local): K u − fixed-end loads.
    const fl = new Float64Array(12);
    for (let p = 0; p < 12; p++) { let v = -d.fe[p]; for (let q = 0; q < 12; q++) v += d.Kl[p][q] * ul[q]; fl[p] = v; }
    const L = d.L, sec = d.sec, out = [];
    let smax = 0;
    for (let k = 0; k < samples; k++) {
      const s = (k / (samples - 1)) * L;
      // Internal forces at s (from the first end, the distributed load added).
      const N = -fl[0] - d.ql[0] * s, Vy = fl[1] + d.ql[1] * s, Vz = fl[2] + d.ql[2] * s, Tq = -fl[3];
      const Mz = -fl[5] + fl[1] * s + (d.ql[1] * s * s) / 2, My = -fl[4] - fl[2] * s - (d.ql[2] * s * s) / 2;
      // Extreme-fibre stress: the largest over the section's outline (y = u, z = v from the centroid).
      let sb = 0;
      for (const [uu, vv] of sec.pts) sb = Math.max(sb, Math.abs(N / sec.A - (Mz * uu) / sec.Iv + (My * vv) / sec.Iu));
      // Deflection: Hermite interpolation of the end displacements and rotations in the local frame.
      const xi = s / L, h1 = 1 - 3 * xi * xi + 2 * xi ** 3, h2 = L * (xi - 2 * xi * xi + xi ** 3), h3 = 3 * xi * xi - 2 * xi ** 3, h4 = L * (-xi * xi + xi ** 3);
      const wq = (L ** 4 / 24) * xi * xi * (1 - xi) * (1 - xi); // the distributed load's own deflection (clamped–clamped shape)
      const v = h1 * ul[1] + h2 * ul[5] + h3 * ul[7] + h4 * ul[11] + (d.ql[1] * wq) / (d.mat.E * sec.Iv);
      const w = h1 * ul[2] - h2 * ul[4] + h3 * ul[8] - h4 * ul[10] + (d.ql[2] * wq) / (d.mat.E * sec.Iu);
      const u = ul[0] + (ul[6] - ul[0]) * xi;
      const dg = add(add(mul(d.T[0], u), mul(d.T[1], v)), mul(d.T[2], w));
      const pos = add(joints[d.el.i], mul(d.T[0], s));
      out.push({ s, pos, N, Vy, Vz, T: Tq, My, Mz, stress: sb, disp: dg });
      if (sb > smax) smax = sb;
      if (sb > maxStress) { maxStress = sb; maxStressAt = pos; }
      maxDisp = Math.max(maxDisp, Math.hypot(...dg));
    }
    return { member: d.el.member, i: d.el.i, j: d.el.j, length: L, ends: { N1: -fl[0], N2: fl[6], T: fl[9], My1: fl[4], Mz1: fl[5], My2: fl[10], Mz2: fl[11], Vy1: fl[1], Vz1: fl[2] }, maxStress: smax, factorOfSafety: d.mat.yield ? d.mat.yield / Math.max(smax, 1e-12) : Infinity, samples: out };
  });
  const jointDisp = joints.map((_, j) => [U[6 * j], U[6 * j + 1], U[6 * j + 2]]);
  const jointRot = joints.map((_, j) => [U[6 * j + 3], U[6 * j + 4], U[6 * j + 5]]);
  const minFos = Math.min(...results.map((r) => r.factorOfSafety));
  return { ok: true, joints, elements, displacement: jointDisp, rotation: jointRot, results, reactions, maxStress, maxStressAt, maxDisplacement: maxDisp, minFactorOfSafety: minFos };
}
