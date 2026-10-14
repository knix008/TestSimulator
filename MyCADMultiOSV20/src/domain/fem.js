// FEM for 2D frames (FreeCAD FEM, beam elements): linear static analysis by the
// direct stiffness method. Members are the drawing's lines in the XY plane
// (an elevation), three degrees of freedom per node (ux, uy, rotation).
// Units: mm, N, N·mm, MPa (N/mm²). No DOM.

export const SUPPORT_TYPES = ['free', 'pinned', 'fixed', 'rollerX', 'rollerY'];
export const SECTION_TYPES = ['rect', 'circle', 'tube', 'ibeam', 'custom'];
export const MATERIALS = { steel: { E: 210000, density: 7.85e-6, fy: 235 }, aluminium: { E: 70000, density: 2.7e-6, fy: 160 }, timber: { E: 11000, density: 0.5e-6, fy: 24 }, concrete: { E: 30000, density: 2.4e-6, fy: 20 } };
const G = 9.81; // m/s²; with kg/mm³ · mm³ … gives N per mm via density·A·g

export function defaultFem() {
  return {
    material: 'steel', E: 210000, density: 7.85e-6, fy: 235,
    section: { type: 'rect', b: 50, h: 100, d: 60, t: 5, tw: 6, tf: 10, A: 5000, I: 4166667 },
    q: 0, selfWeight: false, supports: {}, loads: {}, scale: 0,
  };
}

const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pos = (v, d) => Math.max(1e-9, finite(v, d));

export function normalizeFem(raw = {}) {
  const d = defaultFem();
  const s = { ...d.section, ...(raw.section ?? {}) };
  const material = MATERIALS[raw.material] ? raw.material : raw.material === 'custom' ? 'custom' : d.material;
  const base = MATERIALS[material] ?? {};
  return {
    material,
    E: pos(material === 'custom' ? raw.E : base.E, d.E),
    density: Math.max(0, finite(material === 'custom' ? raw.density : base.density, d.density)),
    fy: pos(material === 'custom' ? raw.fy : base.fy, d.fy),
    section: {
      type: SECTION_TYPES.includes(s.type) ? s.type : 'rect',
      b: pos(s.b, d.section.b), h: pos(s.h, d.section.h), d: pos(s.d, d.section.d), t: pos(s.t, d.section.t),
      tw: pos(s.tw, d.section.tw), tf: pos(s.tf, d.section.tf), A: pos(s.A, d.section.A), I: pos(s.I, d.section.I),
    },
    q: finite(raw.q, 0), selfWeight: Boolean(raw.selfWeight),
    supports: Object.fromEntries(Object.entries(raw.supports ?? {}).filter(([, v]) => SUPPORT_TYPES.includes(v) && v !== 'free')),
    loads: Object.fromEntries(Object.entries(raw.loads ?? {}).map(([k, v]) => [k, { fx: finite(v?.fx, 0), fy: finite(v?.fy, 0), m: finite(v?.m, 0) }]).filter(([, v]) => v.fx || v.fy || v.m)),
    scale: Math.max(0, finite(raw.scale, 0)),
  };
}

/** Area, second moment and half depth of a section (bending about the axis normal to the frame plane). */
export function sectionProps(s) {
  switch (s.type) {
    case 'circle': return { A: (Math.PI * s.d ** 2) / 4, I: (Math.PI * s.d ** 4) / 64, c: s.d / 2 };
    case 'tube': {
      const di = Math.max(0, s.d - 2 * s.t);
      return { A: (Math.PI * (s.d ** 2 - di ** 2)) / 4, I: (Math.PI * (s.d ** 4 - di ** 4)) / 64, c: s.d / 2 };
    }
    case 'ibeam': {
      const web = Math.max(0, s.h - 2 * s.tf);
      return { A: 2 * s.b * s.tf + web * s.tw, I: (s.b * s.h ** 3 - (s.b - s.tw) * web ** 3) / 12, c: s.h / 2 };
    }
    case 'custom': return { A: s.A, I: s.I, c: Math.sqrt((12 * s.I) / s.A) / 2 };
    default: return { A: s.b * s.h, I: (s.b * s.h ** 3) / 12, c: s.h / 2 };
  }
}

export const nodeKey = (p) => `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;

/** Nodes and members from lines (and polylines): ends that meet (within `tol`) become one node. */
export function frameFrom(entities, tol = 0.01) {
  const nodes = [];
  const find = (p) => {
    let n = nodes.find((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol);
    if (!n) { n = { id: nodes.length, x: p.x, y: p.y }; n.key = nodeKey(n); nodes.push(n); }
    return n.id;
  };
  const members = [];
  const segment = (a, b, source) => {
    if (Math.hypot(b.x - a.x, b.y - a.y) <= tol) return;
    const i = find(a);
    const j = find(b);
    if (i !== j) members.push({ i, j, source });
  };
  for (const e of entities) {
    if (e.construction) continue;
    if (e.type === 'line') segment({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }, e.id);
    else if (e.type === 'polyline') {
      const pts = e.closed ? [...e.points, e.points[0]] : e.points;
      for (let k = 0; k + 1 < pts.length; k++) segment(pts[k], pts[k + 1], e.id);
    }
  }
  return { nodes, members };
}

/** Solves K u = f (dense, Gaussian elimination with partial pivoting); null if singular (a mechanism). */
function solve(K, f) {
  const n = f.length;
  const M = K.map((row, i) => [...row, f[i]]);
  const scale = Math.max(1e-30, ...K.map((row, i) => Math.abs(row[i])));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-11 * scale) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      if (!k) continue;
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const u = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * u[j];
    u[r] = s / M[r][r];
  }
  return u;
}

/** Restrained degrees of freedom of a support: [ux, uy, rz]. */
const RESTRAINT = { free: [0, 0, 0], pinned: [1, 1, 0], fixed: [1, 1, 1], rollerX: [0, 1, 0], rollerY: [1, 0, 0] };

/**
 * Linear static analysis. `frame` = frameFrom(); `options` = normalizeFem().
 * Loads: nodal { fx, fy, m } by node key; q = uniform load on every member that
 * is not vertical, in global −Y per unit length (N/mm, positive downward); self weight adds ρ·A·g on all.
 * Returns { ok, error?, displacements [{ux,uy,rz}], reactions, members [{ N, V1, M1, V2, M2, Mmax, sigma, length }], max }.
 */
export function analyzeFrame(frame, rawOptions) {
  const o = normalizeFem(rawOptions);
  const { A, I, c } = sectionProps(o.section);
  const E = o.E;
  const n = frame.nodes.length;
  if (!frame.members.length) return { ok: false, error: 'noMembers' };
  const dof = 3 * n;
  const K = Array.from({ length: dof }, () => new Array(dof).fill(0));
  const F = new Array(dof).fill(0);
  const own = o.selfWeight ? o.density * A * G : 0; // N/mm downward, every member
  const local = frame.members.map((m) => {
    const a = frame.nodes[m.i];
    const b = frame.nodes[m.j];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const cs = (b.x - a.x) / L;
    const sn = (b.y - a.y) / L;
    // The uniform load q sits on beams and rafters (not on vertical members); self weight on all.
    const w = (Math.abs(cs) > 1e-3 ? o.q : 0) + own;
    // Uniform global load −w ĵ: along the member (−w·sn) and across it (−w·cs).
    const px = -w * sn;
    const py = -w * cs;
    // Fixed-end forces in local axes (the member's share of the load), [N1, V1, M1, N2, V2, M2].
    const fef = [px * L / 2, py * L / 2, py * L * L / 12, px * L / 2, py * L / 2, -py * L * L / 12];
    const k = [
      [E * A / L, 0, 0, -E * A / L, 0, 0],
      [0, 12 * E * I / L ** 3, 6 * E * I / L ** 2, 0, -12 * E * I / L ** 3, 6 * E * I / L ** 2],
      [0, 6 * E * I / L ** 2, 4 * E * I / L, 0, -6 * E * I / L ** 2, 2 * E * I / L],
      [-E * A / L, 0, 0, E * A / L, 0, 0],
      [0, -12 * E * I / L ** 3, -6 * E * I / L ** 2, 0, 12 * E * I / L ** 3, -6 * E * I / L ** 2],
      [0, 6 * E * I / L ** 2, 2 * E * I / L, 0, -6 * E * I / L ** 2, 4 * E * I / L],
    ];
    const T = [
      [cs, sn, 0, 0, 0, 0], [-sn, cs, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0],
      [0, 0, 0, cs, sn, 0], [0, 0, 0, -sn, cs, 0], [0, 0, 0, 0, 0, 1],
    ];
    const idx = [3 * m.i, 3 * m.i + 1, 3 * m.i + 2, 3 * m.j, 3 * m.j + 1, 3 * m.j + 2];
    // Global stiffness Tᵀ k T, global equivalent loads Tᵀ fef.
    for (let r = 0; r < 6; r++) for (let s = 0; s < 6; s++) {
      let v = 0;
      for (let p = 0; p < 6; p++) for (let q = 0; q < 6; q++) v += T[p][r] * k[p][q] * T[q][s];
      K[idx[r]][idx[s]] += v;
    }
    for (let r = 0; r < 6; r++) {
      let v = 0;
      for (let p = 0; p < 6; p++) v += T[p][r] * fef[p];
      F[idx[r]] += v;
    }
    return { m, L, cs, sn, k, T, idx, fef, px, py };
  });
  for (const node of frame.nodes) {
    const load = o.loads[node.key];
    if (load) { F[3 * node.id] += load.fx; F[3 * node.id + 1] += load.fy; F[3 * node.id + 2] += load.m; }
  }
  const restrained = new Array(dof).fill(false);
  for (const node of frame.nodes) {
    const r = RESTRAINT[o.supports[node.key] ?? 'free'];
    r.forEach((v, k) => { if (v) restrained[3 * node.id + k] = true; });
  }
  const freeDofs = [...Array(dof).keys()].filter((i) => !restrained[i]);
  if (freeDofs.length === dof) return { ok: false, error: 'noSupports' };
  const Kff = freeDofs.map((i) => freeDofs.map((j) => K[i][j]));
  const uf = freeDofs.length ? solve(Kff, freeDofs.map((i) => F[i])) : [];
  if (!uf) return { ok: false, error: 'mechanism' };
  const u = new Array(dof).fill(0);
  freeDofs.forEach((i, k) => { u[i] = uf[k]; });
  // Reactions: R = K u − F at the restrained degrees of freedom.
  const reactions = frame.nodes.filter((node) => RESTRAINT[o.supports[node.key] ?? 'free'].some(Boolean)).map((node) => {
    const at = (k) => K[3 * node.id + k].reduce((s, v, j) => s + v * u[j], 0) - F[3 * node.id + k];
    return { node: node.id, key: node.key, fx: at(0), fy: at(1), m: at(2) };
  });
  const members = local.map(({ m, L, k, T, idx, fef, py }) => {
    const ug = idx.map((i) => u[i]);
    const ul = T.map((row) => row.reduce((s, v, j) => s + v * ug[j], 0));
    const f = k.map((row, r) => row.reduce((s, v, j) => s + v * ul[j], 0) - fef[r]);
    // Bending moment along the member (sagging positive): M(x) = −M1 + V1·x + py·x²/2.
    const momentAt = (x) => -f[2] + f[1] * x + (py * x * x) / 2;
    const samples = Array.from({ length: 21 }, (_, s) => (L * s) / 20);
    const moments = samples.map(momentAt);
    // The extreme of a parabola may fall between samples.
    if (py) {
      const x = -f[1] / py;
      if (x > 0 && x < L) { samples.push(x); moments.push(momentAt(x)); }
    }
    const Mmax = moments.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), 0);
    const N = -f[0];
    const sigma = Math.abs(N) / A + (Math.abs(Mmax) * c) / I;
    return { i: m.i, j: m.j, source: m.source, length: L, py, N, V1: f[1], M1: f[2], V2: f[4], M2: f[5], Mmax, sigma, moments: samples.map((x, s) => ({ x, m: moments[s] })).sort((p, q) => p.x - q.x) };
  });
  const displacements = frame.nodes.map((node) => ({ ux: u[3 * node.id], uy: u[3 * node.id + 1], rz: u[3 * node.id + 2] }));
  // The largest displacement anywhere along the members (mid-span sag included).
  const shapes = deformedShape(frame, { members, displacements, E, I }, 1);
  const maxDisp = Math.max(0, ...shapes.flatMap((shape, k) => {
    const a = frame.nodes[members[k].i];
    const b = frame.nodes[members[k].j];
    return shape.map((p, s) => Math.hypot(p.x - (a.x + ((b.x - a.x) * s) / 16), p.y - (a.y + ((b.y - a.y) * s) / 16)));
  }));
  const maxMoment = members.reduce((best, m) => (Math.abs(m.Mmax) > Math.abs(best) ? m.Mmax : best), 0);
  const maxSigma = Math.max(0, ...members.map((m) => m.sigma));
  return {
    ok: true, displacements, reactions, members, E, I, section: { A, I, c }, w: o.q + own,
    max: { displacement: maxDisp, moment: maxMoment, sigma: maxSigma, utilisation: maxSigma / o.fy },
  };
}

/**
 * The deformed shape as polylines, magnified by `scale`: each member bent by its
 * end displacements and rotations (Hermite cubic) plus the sag of its own load
 * between the ends (fixed-ended beam: p·x²(L−x)²/24EI).
 */
export function deformedShape(frame, result, scale) {
  return result.members.map((m) => {
    const a = frame.nodes[m.i];
    const b = frame.nodes[m.j];
    const L = m.length;
    const cs = (b.x - a.x) / L;
    const sn = (b.y - a.y) / L;
    const da = result.displacements[m.i];
    const db = result.displacements[m.j];
    // Local displacements at the ends.
    const u1 = da.ux * cs + da.uy * sn; const v1 = -da.ux * sn + da.uy * cs;
    const u2 = db.ux * cs + db.uy * sn; const v2 = -db.ux * sn + db.uy * cs;
    return Array.from({ length: 17 }, (_, s) => {
      const t = s / 16;
      const x = t * L;
      const h1 = 1 - 3 * t * t + 2 * t ** 3; const h2 = x * (1 - t) ** 2; const h3 = 3 * t * t - 2 * t ** 3; const h4 = x * (t * t - t);
      const v = h1 * v1 + h2 * da.rz + h3 * v2 + h4 * db.rz + ((m.py ?? 0) * x * x * (L - x) ** 2) / (24 * result.E * result.I);
      const uAxial = u1 + (u2 - u1) * t;
      const lx = x + scale * uAxial;
      const ly = scale * v;
      return { x: a.x + lx * cs - ly * sn, y: a.y + lx * sn + ly * cs };
    });
  });
}

/** Moment diagram as polylines drawn off each member (on the tension side), `scale` mm per N·mm. */
export function momentDiagram(frame, result, scale) {
  return result.members.map((m) => {
    const a = frame.nodes[m.i];
    const b = frame.nodes[m.j];
    const cs = (b.x - a.x) / m.length;
    const sn = (b.y - a.y) / m.length;
    const pts = m.moments.map(({ x, m: M }) => ({ x: a.x + x * cs + sn * M * scale, y: a.y + x * sn - cs * M * scale }));
    return [{ x: a.x, y: a.y }, ...pts, { x: b.x, y: b.y }];
  });
}

/** A magnification that makes the largest deflection about a tenth of the frame's size. */
export function autoScale(frame, result) {
  const xs = frame.nodes.map((n) => n.x);
  const ys = frame.nodes.map((n) => n.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  return result.max.displacement > 0 ? (size * 0.1) / result.max.displacement : 1;
}
