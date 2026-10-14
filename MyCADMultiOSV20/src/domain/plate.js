// FEM of a flat plate in plane stress (FreeCAD FEM, 2D): a closed outline
// meshed into constant-strain triangles, supports and loads on its sides,
// solved for displacements and stresses (von Mises). No DOM.

import { delaunay } from './points.js';
import { polygonArea } from './geometry.js';
import { MATERIALS } from './fem.js';

export const PLATE_SUPPORTS = ['free', 'fixed', 'rollerX', 'rollerY'];
const RESTRAINT = { free: [0, 0], fixed: [1, 1], rollerX: [1, 0], rollerY: [0, 1] };
// Poisson's ratio of the frame materials.
export const POISSON = { steel: 0.3, aluminium: 0.33, timber: 0.3, concrete: 0.2 };

const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Plate options repaired: material, E, ν, thickness, element size, supports and loads by side. */
export function normalizePlate(raw = {}) {
  const material = [...Object.keys(MATERIALS), 'custom'].includes(raw.material) ? raw.material : 'steel';
  const supports = {};
  for (const [k, v] of Object.entries(raw.supports ?? {})) if (PLATE_SUPPORTS.includes(v) && v !== 'free') supports[k] = v;
  const loads = {};
  for (const [k, v] of Object.entries(raw.loads ?? {})) {
    const fx = finite(v?.fx, 0); const fy = finite(v?.fy, 0);
    if (fx || fy) loads[k] = { fx, fy };
  }
  return {
    material,
    E: Math.max(1, finite(raw.E, MATERIALS[material]?.E ?? 210000)),
    nu: Math.min(0.49, Math.max(0, finite(raw.nu, POISSON[material] ?? 0.3))),
    thickness: Math.max(0.001, finite(raw.thickness, 10)),
    // Element size; 0 = automatic (a thirtieth of the plate).
    size: Math.max(0, finite(raw.size, 0)),
    supports, loads,
  };
}

/**
 * The sides of an outline: runs of its edges that turn less than 30° from one
 * to the next (a rectangle has 4, a round hole is 1). Each side: { loop, from, to, length, mid }.
 */
export function plateSides(loops) {
  const sides = [];
  loops.forEach((loop, l) => {
    const n = loop.length;
    const dir = (i) => { const a = loop[i]; const b = loop[(i + 1) % n]; return Math.atan2(b.y - a.y, b.x - a.x); };
    const turn = (i) => { let d = Math.abs(dir(i) - dir((i - 1 + n) % n)); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
    const corners = [];
    for (let i = 0; i < n; i++) if (turn(i) >= Math.PI / 6) corners.push(i);
    if (!corners.length) corners.push(0);
    corners.forEach((from, k) => {
      const to = corners[(k + 1) % corners.length];
      const count = ((to - from + n) % n) || n;
      let length = 0;
      for (let j = 0; j < count; j++) { const a = loop[(from + j) % n]; const b = loop[(from + j + 1) % n]; length += Math.hypot(b.x - a.x, b.y - a.y); }
      // The middle of the side, along it.
      let walked = 0;
      let mid = loop[from];
      for (let j = 0; j < count; j++) {
        const a = loop[(from + j) % n]; const b = loop[(from + j + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (walked + len >= length / 2) { const t = (length / 2 - walked) / (len || 1); mid = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; break; }
        walked += len;
      }
      sides.push({ loop: l, from, count, length, mid });
    });
  });
  return sides;
}

const inside = (p, loop) => {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]; const b = loop[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};

/**
 * Triangles over the plate: the sides split to about `size`, a staggered grid
 * inside. Returns { nodes: [[x, y]], tris: [[i, j, k]] (counter-clockwise), sideNodes: [[node, …] per side] }.
 */
export function meshPlate(outer, holes = [], size = 0) {
  const loops = [outer, ...holes];
  const box = { minX: Math.min(...outer.map((p) => p.x)), maxX: Math.max(...outer.map((p) => p.x)), minY: Math.min(...outer.map((p) => p.y)), maxY: Math.max(...outer.map((p) => p.y)) };
  const extent = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  // Never finer than a 300th of the plate (a mistyped size must not hang the app).
  const step = Math.max(size > 0 ? size : extent / 30, extent / 300);
  const nodes = [];
  const index = new Map();
  const nodeAt = (x, y) => {
    const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
    if (!index.has(key)) { index.set(key, nodes.length); nodes.push([x, y]); }
    return index.get(key);
  };
  const sides = plateSides(loops);
  const sideNodes = sides.map((side) => {
    const loop = loops[side.loop];
    const list = [];
    for (let j = 0; j < side.count; j++) {
      const a = loop[(side.from + j) % loop.length]; const b = loop[(side.from + j + 1) % loop.length];
      const parts = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let k = 0; k <= parts; k++) {
        const id = nodeAt(a.x + ((b.x - a.x) * k) / parts, a.y + ((b.y - a.y) * k) / parts);
        if (list[list.length - 1] !== id) list.push(id);
      }
    }
    return list;
  });
  const inMaterial = (p) => inside(p, outer) && !holes.some((h) => inside(p, h));
  // Nodes by grid cell, for "is there a node closer than r?".
  const cells = new Map();
  const cellOf = (x, y) => `${Math.floor(x / step)},${Math.floor(y / step)}`;
  const file = (id) => { const key = cellOf(nodes[id][0], nodes[id][1]); if (!cells.has(key)) cells.set(key, []); cells.get(key).push(id); };
  nodes.forEach((_, id) => file(id));
  const near = (x, y, r) => {
    const cx = Math.floor(x / step); const cy = Math.floor(y / step);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (const id of cells.get(`${i},${j}`) ?? []) if (Math.hypot(nodes[id][0] - x, nodes[id][1] - y) < r) return true;
    return false;
  };
  const place = (x, y, r) => { if (inMaterial({ x, y }) && !near(x, y, r)) { const before = nodes.length; const id = nodeAt(x, y); if (id === before) file(id); } };
  // Finely divided edges (a round hole) grade out to the element size in rings
  // of nodes, each a little coarser — a fine edge next to coarse elements makes slivers.
  loops.forEach((loop) => {
    const n = loop.length;
    for (let e = 0; e < n; e++) {
      const a = loop[e]; const b = loop[(e + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!len || len >= step * 0.7) continue;
      const nx = -(b.y - a.y) / len; const ny = (b.x - a.x) / len;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dir = inMaterial({ x: mid.x + nx * len * 0.1, y: mid.y + ny * len * 0.1 }) ? 1 : -1;
      let h = len; let d = 0;
      while (h < step * 0.9) {
        d += h * 0.87;
        h = Math.min(step, h * 1.35);
        const parts = Math.max(1, Math.round(len / h));
        for (let k = 0; k <= parts; k++) {
          const t = k / parts;
          place(a.x + (b.x - a.x) * t + dir * nx * d, a.y + (b.y - a.y) * t + dir * ny * d, h * 0.6);
        }
      }
    }
  });
  const rowH = (step * Math.sqrt(3)) / 2;
  let row = 0;
  for (let y = box.minY + rowH / 2; y < box.maxY; y += rowH, row++) {
    for (let x = box.minX + (row % 2 ? step : step / 2); x < box.maxX; x += step) place(x, y, step * 0.55);
  }
  const tris = delaunay(nodes).filter((t) => {
    const c = { x: (nodes[t[0]][0] + nodes[t[1]][0] + nodes[t[2]][0]) / 3, y: (nodes[t[0]][1] + nodes[t[1]][1] + nodes[t[2]][1]) / 3 };
    return inMaterial(c);
  }).map((t) => {
    const [a, b, c] = t.map((i) => nodes[i]);
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0 ? t : [t[0], t[2], t[1]];
  });
  return { nodes, tris, sides, sideNodes };
}

/** Sparse symmetric matrix as rows of Map(column → value). */
const sparse = (n) => Array.from({ length: n }, () => new Map());
const addTo = (K, i, j, v) => K[i].set(j, (K[i].get(j) ?? 0) + v);

/** Conjugate gradients with a diagonal preconditioner. */
function solveCG(K, f, tol = 1e-10) {
  const n = f.length;
  const rows = K.map((r) => [...r]);
  const mulK = (x) => rows.map((r) => r.reduce((s, [j, v]) => s + v * x[j], 0));
  const diag = K.map((r, i) => r.get(i) || 1);
  const x = new Array(n).fill(0);
  const r = f.slice();
  const z = r.map((v, i) => v / diag[i]);
  const p = z.slice();
  let rz = r.reduce((s, v, i) => s + v * z[i], 0);
  const norm = Math.sqrt(f.reduce((s, v) => s + v * v, 0)) || 1;
  for (let it = 0; it < 4 * n; it++) {
    const Kp = mulK(p);
    const alpha = rz / (p.reduce((s, v, i) => s + v * Kp[i], 0) || 1e-300);
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * Kp[i]; }
    if (Math.sqrt(r.reduce((s, v) => s + v * v, 0)) < tol * norm) break;
    for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
    const next = r.reduce((s, v, i) => s + v * z[i], 0);
    const beta = next / rz;
    rz = next;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return x;
}

/**
 * Plane-stress analysis. Loads are totals (N) spread over each side by length.
 * Returns { ok, error?, mesh, u: [[ux, uy]], stress: [{ sx, sy, txy, vm }] per triangle,
 * nodal von Mises, max: { displacement, vm }, reactions: { fx, fy } }.
 */
export function analyzePlate(outer, holes, rawOptions) {
  const o = normalizePlate(rawOptions);
  if (!outer || outer.length < 3 || Math.abs(polygonArea(outer)) < 1e-12) return { ok: false, error: 'noOutline' };
  const mesh = meshPlate(outer, holes, o.size);
  const { nodes, tris, sideNodes } = mesh;
  if (!tris.length) return { ok: false, error: 'noOutline', mesh };
  const n = nodes.length * 2;
  const E = o.material === 'custom' ? o.E : MATERIALS[o.material].E;
  const nu = o.nu;
  const k = E / (1 - nu * nu);
  const D = [[k, k * nu, 0], [k * nu, k, 0], [0, 0, (k * (1 - nu)) / 2]];
  const K = sparse(n);
  const Bs = tris.map(([i, j, m]) => {
    const [x1, y1] = nodes[i]; const [x2, y2] = nodes[j]; const [x3, y3] = nodes[m];
    const A2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
    const b = [y2 - y3, y3 - y1, y1 - y2].map((v) => v / A2);
    const c = [x3 - x2, x1 - x3, x2 - x1].map((v) => v / A2);
    const B = [[b[0], 0, b[1], 0, b[2], 0], [0, c[0], 0, c[1], 0, c[2]], [c[0], b[0], c[1], b[1], c[2], b[2]]];
    const DB = D.map((row) => B[0].map((_, col) => row[0] * B[0][col] + row[1] * B[1][col] + row[2] * B[2][col]));
    const dofs = [2 * i, 2 * i + 1, 2 * j, 2 * j + 1, 2 * m, 2 * m + 1];
    const vol = (A2 / 2) * o.thickness;
    for (let r = 0; r < 6; r++) for (let s = 0; s < 6; s++) addTo(K, dofs[r], dofs[s], vol * (B[0][r] * DB[0][s] + B[1][r] * DB[1][s] + B[2][r] * DB[2][s]));
    return { B, dofs };
  });
  // Loads: each side's total, spread by the length each node carries.
  const f = new Array(n).fill(0);
  for (const [side, load] of Object.entries(o.loads)) {
    const list = sideNodes[Number(side)];
    if (!list) continue;
    let total = 0;
    const share = list.map(() => 0);
    for (let q = 0; q + 1 < list.length; q++) {
      const a = nodes[list[q]]; const b = nodes[list[q + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      share[q] += len / 2; share[q + 1] += len / 2; total += len;
    }
    list.forEach((id, q) => { f[2 * id] += (load.fx * share[q]) / (total || 1); f[2 * id + 1] += (load.fy * share[q]) / (total || 1); });
  }
  // Supports: held dofs.
  const held = new Set();
  for (const [side, type] of Object.entries(o.supports)) {
    for (const id of sideNodes[Number(side)] ?? []) RESTRAINT[type].forEach((r, d) => { if (r) held.add(2 * id + d); });
  }
  // Nodes in no triangle (none expected) carry nothing: held so the matrix stays regular.
  const used = new Set(tris.flat());
  nodes.forEach((_, i) => { if (!used.has(i)) { held.add(2 * i); held.add(2 * i + 1); } });
  const xs = new Set([...held].filter((d) => d % 2 === 0)); const ys = new Set([...held].filter((d) => d % 2 === 1));
  if (!xs.size || !ys.size || held.size < 3) return { ok: false, error: 'unstable', mesh };
  // Held dofs: identity rows and columns, so the free ones solve alone.
  const original = K.map((r) => new Map(r));
  for (const d of held) {
    for (const [j] of K[d]) if (j !== d) K[j].delete(d);
    K[d] = new Map([[d, 1]]);
    f[d] = 0;
  }
  const x = solveCG(K, f);
  const u = nodes.map((_, i) => [x[2 * i], x[2 * i + 1]]);
  // Reactions at the supports: K·u − f there.
  const reaction = { fx: 0, fy: 0 };
  for (const d of held) {
    let s = 0;
    for (const [j, v] of original[d]) s += v * x[j];
    if (d % 2) reaction.fy += s; else reaction.fx += s;
  }
  const stress = Bs.map(({ B, dofs }) => {
    const e = [0, 1, 2].map((r) => dofs.reduce((s, d, c) => s + B[r][c] * x[d], 0));
    const [sx, sy, txy] = D.map((row) => row[0] * e[0] + row[1] * e[1] + row[2] * e[2]);
    return { sx, sy, txy, vm: Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * txy * txy) };
  });
  // Nodal von Mises: area-weighted mean of the triangles round the node.
  const sum = nodes.map(() => 0); const weight = nodes.map(() => 0);
  tris.forEach((t, e) => {
    const [a, b, c] = t.map((i) => nodes[i]);
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    for (const i of t) { sum[i] += stress[e].vm * area; weight[i] += area; }
  });
  const nodalVm = sum.map((s, i) => (weight[i] ? s / weight[i] : 0));
  const fy = o.material === 'custom' ? null : MATERIALS[o.material].fy;
  const vmMax = Math.max(...stress.map((s) => s.vm));
  return {
    ok: true, options: o, mesh, u, stress, nodalVm, reaction,
    max: { displacement: Math.max(...u.map(([a, b]) => Math.hypot(a, b))), vm: vmMax, utilisation: fy ? vmMax / fy : 0 },
  };
}

/** A displacement scale that makes the largest one about 8 % of the plate. */
export function plateScale(result) {
  if (!result.ok || !result.max.displacement) return 1;
  const xs = result.mesh.nodes.map((p) => p[0]); const ys = result.mesh.nodes.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return (size * 0.08) / result.max.displacement;
}

/** Blue → green → red for 0 … 1. */
export function stressColor(v) {
  const t = Math.max(0, Math.min(1, v));
  const stops = [[38, 84, 214], [32, 178, 170], [96, 196, 64], [240, 196, 40], [220, 50, 40]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `#${c.map((v2) => v2.toString(16).padStart(2, '0')).join('')}`;
}

const signedArea = (loop) => loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;

/**
 * The plate from closed outlines: the largest is the plate (counter-clockwise),
 * the outlines inside it are holes (clockwise); the rest are left out. null when there is none.
 */
export function plateSource(loops) {
  const list = loops.filter((l) => l.length >= 3 && Math.abs(signedArea(l)) > 1e-9);
  if (!list.length) return null;
  const outer = list.reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
  const ccw = (l, want) => ((signedArea(l) > 0) === want ? l.map((p) => ({ x: p.x, y: p.y })) : [...l].reverse().map((p) => ({ x: p.x, y: p.y })));
  const holes = list.filter((l) => l !== outer && l.every((p) => inside(p, outer))).map((l) => ccw(l, false));
  return { outer: ccw(outer, true), holes };
}

/** The outlines (outer first, then holes) of the plate moved by the displacements × scale, as closed point lists. */
export function plateDeformed(result, scale) {
  const { mesh, u } = result;
  const loops = new Map();
  mesh.sides.forEach((side, s) => {
    const list = loops.get(side.loop) ?? [];
    for (const id of mesh.sideNodes[s]) if (list[list.length - 1] !== id) list.push(id);
    loops.set(side.loop, list);
  });
  return [...loops.keys()].sort((a, b) => a - b).map((key) => {
    const list = loops.get(key);
    if (list.length > 1 && list[0] === list[list.length - 1]) list.pop();
    return list.map((id) => ({ x: mesh.nodes[id][0] + u[id][0] * scale, y: mesh.nodes[id][1] + u[id][1] * scale }));
  });
}

/** Where the von Mises stress peaks (a node), and its value. */
export function platePeak(result) {
  let best = 0;
  result.nodalVm.forEach((v, i) => { if (v > result.nodalVm[best]) best = i; });
  return { x: result.mesh.nodes[best][0], y: result.mesh.nodes[best][1], vm: result.nodalVm[best] };
}
