// Machining feature recognition (no DOM): the B-rep faces of a part (as the kernel's mesh gives them, one face
// group per face) and its cross-sections → faces to face mill, closed pockets, open pockets / steps, slots,
// bosses, holes (with counterbores and tap candidates) and freeform areas; for a part turned about Z, its
// outer and bore profiles, grooves and the front face.
//
// Each face is classified from its own triangles: planar (one normal), vertical cylinder (horizontal normals
// whose points fit a circle), or other (sloped, curved). Pockets and bosses are found by slicing just above /
// below the up-facing planar faces: a floor enclosed by a hole loop of the section is a closed pocket, a top
// whose section loop grows further down is a boss.
import { weldMesh, sliceMesh, flatLevels, meshBounds, windingOf, loopArea, reverseLoop, cleanLoop, TriangleGrid } from './cam-geom.js';
import { threadForDrill } from './cam-tools.js';

const round = (v, k = 1e4) => Math.round(v * k) / k;

/** Per-face data from a mesh with face groups: [{ faceId, kind, area, normal, centroid, inner, bounds, … }]. */
export function faceInfos(mesh, types = null) {
  const V = mesh.vertices; const T = mesh.triangles;
  const out = [];
  for (const fg of mesh.faceGroups ?? [{ start: 0, count: T.length, faceId: 0 }]) {
    let area = 0; const n = [0, 0, 0]; const c = [0, 0, 0];
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    let planar = true; let horizontal = true; let first = null; let inner = null; let bestA = 0;
    const pts = [];
    for (let t = fg.start; t < fg.start + fg.count; t += 3) {
      const a = 3 * T[t]; const b = 3 * T[t + 1]; const cc = 3 * T[t + 2];
      const ux = V[b] - V[a]; const uy = V[b + 1] - V[a + 1]; const uz = V[b + 2] - V[a + 2];
      const vx = V[cc] - V[a]; const vy = V[cc + 1] - V[a + 1]; const vz = V[cc + 2] - V[a + 2];
      const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
      const A2 = Math.hypot(nx, ny, nz);
      if (A2 < 1e-14) continue;
      const un = [nx / A2, ny / A2, nz / A2];
      if (!first) first = un; else if (un[0] * first[0] + un[1] * first[1] + un[2] * first[2] < 0.99995) planar = false;
      if (Math.abs(un[2]) > 0.01) horizontal = false;
      area += A2 / 2;
      for (let k = 0; k < 3; k++) { n[k] += (A2 / 2) * un[k]; c[k] += ((A2 / 2) * (V[a + k] + V[b + k] + V[cc + k])) / 3; }
      if (A2 > bestA) { bestA = A2; inner = [(V[a] + V[b] + V[cc]) / 3, (V[a + 1] + V[b + 1] + V[cc + 1]) / 3, (V[a + 2] + V[b + 2] + V[cc + 2]) / 3]; }
      for (const i of [a, b, cc]) { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], V[i + k]); hi[k] = Math.max(hi[k], V[i + k]); } pts.push([V[i], V[i + 1], V[i + 2], un[0], un[1]]); }
    }
    if (!(area > 0)) continue;
    const nl = Math.hypot(...n);
    const info = { faceId: fg.faceId, area, normal: n.map((v) => v / nl), centroid: c.map((v) => v / area), inner, bounds: { lo, hi }, kind: 'other', type: types?.get?.(fg.faceId) ?? null };
    if (planar) info.kind = 'plane';
    else if (horizontal) {
      const fit = circleFit(pts);
      if (fit && fit.rms < Math.max(1e-3, fit.r * 2e-3)) {
        // Inner (a hole wall): the normals point at the axis.
        let toward = 0;
        for (const p of pts) toward += (fit.cx - p[0]) * p[3] + (fit.cy - p[1]) * p[4];
        Object.assign(info, { kind: 'vcyl', cx: fit.cx, cy: fit.cy, r: fit.r, internal: toward > 0, coverage: coverageOf(pts, fit) });
      } else info.kind = 'vwall';
    }
    out.push(info);
  }
  return out;
}

/** Least-squares circle through the XY of points (Kåsa): { cx, cy, r, rms }. */
function circleFit(pts) {
  if (pts.length < 3) return null;
  let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0; let sz = 0; let sxz = 0; let syz = 0;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; }
  const n = pts.length;
  // [sxx sxy sx; sxy syy sy; sx sy n] [a b c] = [sxz syz sz] with x² + y² = a x + b y + c.
  const M = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let i = 0; i < 3; i++) {
    let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let k = i; k < 4; k++) M[r][k] -= f * M[i][k]; }
  }
  const a = M[0][3] / M[0][0]; const b = M[1][3] / M[1][1]; const c = M[2][3] / M[2][2];
  const cx = a / 2; const cy = b / 2; const r = Math.sqrt(Math.max(0, c + cx * cx + cy * cy));
  let e = 0; for (const [x, y] of pts) e += (Math.hypot(x - cx, y - cy) - r) ** 2;
  return { cx, cy, r, rms: Math.sqrt(e / n) };
}

/** Angle covered around the circle (radians). */
function coverageOf(pts, fit) {
  const angs = [...new Set(pts.map((p) => round(Math.atan2(p[1] - fit.cy, p[0] - fit.cx), 1e5)))].sort((a, b) => a - b);
  if (angs.length < 2) return 0;
  let gap = angs[0] + 2 * Math.PI - angs.at(-1);
  for (let i = 1; i < angs.length; i++) gap = Math.max(gap, angs[i] - angs[i - 1]);
  return 2 * Math.PI - gap;
}

/** A model for recognition and toolpaths: the welded mesh, its bounds, faces, flat levels and a section cache. */
export function machiningModel(mesh, { types = null, shape = null } = {}) {
  const welded = weldMesh(mesh);
  const bounds = meshBounds(welded);
  const size = Math.max(1, Math.hypot(bounds.hi[0] - bounds.lo[0], bounds.hi[1] - bounds.lo[1], bounds.hi[2] - bounds.lo[2]));
  const cache = new Map();
  const model = {
    mesh, welded, bounds, size, faces: faceInfos(mesh, types), levels: flatLevels(welded), shape,
    eps: Math.max(1e-3, size * 2e-5),
    slice(z) { const k = round(z, 1e5); if (!cache.has(k)) { if (cache.size > 600) cache.clear(); cache.set(k, sliceMesh(welded, z)); } return cache.get(k); },
    grid: null,
  };
  model.topGrid = () => (model.grid ??= new TriangleGrid(welded));
  return model;
}

/** The smallest loop (by |area|) of `loops` with orientation `sign` around point p. */
function loopAround(loops, p, sign) {
  let best = null; let ba = Infinity;
  for (const l of loops) {
    const a = loopArea(l);
    if (Math.sign(a) !== sign || windingOf(l, p) === 0) continue;
    if (Math.abs(a) < ba) { ba = Math.abs(a); best = l; }
  }
  return best;
}

/** Is p inside material in the section (positive rule)? */
const inMaterial = (loops, p) => loops.reduce((s, l) => s + windingOf(l, p), 0) > 0;

/** Width and length of a loop: its smallest extent over directions, and the extent across that. */
function widthLength(loop) {
  let w = Infinity; let L = 0;
  for (let k = 0; k < 180; k++) {
    const a = (k * Math.PI) / 180; const ux = Math.cos(a); const uy = Math.sin(a);
    let lo = Infinity; let hi = -Infinity; let lo2 = Infinity; let hi2 = -Infinity;
    for (const p of loop) { const s = p[0] * ux + p[1] * uy; const t = -p[0] * uy + p[1] * ux; lo = Math.min(lo, s); hi = Math.max(hi, s); lo2 = Math.min(lo2, t); hi2 = Math.max(hi2, t); }
    if (hi - lo < w) { w = hi - lo; L = hi2 - lo2; }
  }
  return { w, L };
}

/**
 * Recognises machining features. `hints`: { threads: [{ x, y, d, size }] } from the part's thread / tapped hole
 * features. Returns { features, turnable, top, bottom }.
 */
export function recognizeFeatures(model, { hints = {}, stockTop = null } = {}) {
  const { bounds, eps } = model;
  const zTop = bounds.hi[2]; const zMin = bounds.lo[2];
  const features = [];
  let n = 0;
  const id = (type) => `${type}${++n}`;
  const upLevels = model.levels.filter((l) => l.up).map((l) => l.z);
  const levelsAbove = (z) => [...new Set([...upLevels.filter((x) => x > z + eps), zTop])].sort((a, b) => a - b);

  // Face milling: the top of the part when the stock stands above it.
  if (stockTop == null || stockTop > zTop + 1e-6) {
    const topFaces = model.faces.filter((f) => f.kind === 'plane' && f.normal[2] > 0.9999 && Math.abs(f.centroid[2] - zTop) < eps * 5);
    features.push({ id: id('face'), type: 'face', z: zTop, area: topFaces.reduce((s, f) => s + f.area, 0), faces: topFaces.map((f) => f.faceId) });
  }

  // Holes: inner vertical cylinders, grouped by axis.
  const cyl = model.faces.filter((f) => f.kind === 'vcyl' && f.internal);
  const groups = [];
  for (const f of cyl) {
    let g = groups.find((x) => Math.hypot(x.cx - f.cx, x.cy - f.cy) < Math.max(0.02, f.r * 0.01));
    if (!g) { g = { cx: f.cx, cy: f.cy, parts: [] }; groups.push(g); }
    g.parts.push(f);
  }
  const holeAxes = [];
  for (const g of groups) {
    // Faces of one radius (a full hole is often two half cylinders) are merged.
    const byR = [];
    for (const f of g.parts) {
      let s = byR.find((x) => Math.abs(x.r - f.r) < Math.max(0.01, f.r * 0.005));
      if (!s) { s = { r: f.r, z0: Infinity, z1: -Infinity, coverage: 0, faces: [] }; byR.push(s); }
      s.z0 = Math.min(s.z0, f.bounds.lo[2]); s.z1 = Math.max(s.z1, f.bounds.hi[2]); s.coverage += f.coverage; s.faces.push(f.faceId);
    }
    const full = byR.filter((s) => s.coverage > 2 * Math.PI * 0.9);
    if (!full.length) continue; // a corner fillet of a pocket, not a hole
    full.sort((a, b) => a.r - b.r);
    const main = full[0];
    // Through when there is no material just under the bottom of the smallest bore.
    const below = main.z0 - eps * 4;
    const through = below < zMin + eps || !inMaterial(model.slice(below), [g.cx, g.cy]);
    const d = 2 * main.r;
    const tap = (hints.threads ?? []).find((h) => Math.hypot(h.x - g.cx, h.y - g.cy) < Math.max(0.5, main.r)) ?? null;
    const feature = {
      id: id('hole'), type: 'hole', x: round(g.cx), y: round(g.cy), d: round(d), top: round(Math.max(...full.map((s) => s.z1))), bottom: round(main.z0),
      through, depth: round(Math.max(...full.map((s) => s.z1)) - main.z0),
      counterbore: full.length > 1 ? { d: round(2 * full.at(-1).r), depth: round(full.at(-1).z1 - full.at(-1).z0) } : null,
      thread: tap?.size ?? null, tapCandidate: threadForDrill(d), faces: full.flatMap((s) => s.faces),
    };
    features.push(feature);
    holeAxes.push({ x: g.cx, y: g.cy, r: full.at(-1).r });
  }
  const inHole = (p) => holeAxes.some((h) => Math.hypot(p[0] - h.x, p[1] - h.y) <= h.r + eps);

  // Floors and boss tops: up-facing planar faces under the top.
  const ups = model.faces.filter((f) => f.kind === 'plane' && f.normal[2] > 0.9999 && f.centroid[2] < zTop - eps * 5);
  for (const f of ups) {
    const z = f.centroid[2];
    const c = f.inner;
    if (!c || inHole(c)) continue;
    const above = model.slice(z + eps * 4);
    if (inMaterial(above, c)) continue;
    const hole = loopAround(above, c, -1);
    const below = model.slice(z - eps * 4);
    const mat = loopAround(below, c, 1);
    if (!mat) continue;
    const a0 = Math.abs(loopArea(mat));
    // A boss top: the material under it is a loop of its own (inside the pocket around it, if any) that
    // grows further down. A floor: the material under it holds the pocket's outline.
    const matInsideHole = hole ? windingOf(hole, mat[0]) !== 0 && a0 < Math.abs(loopArea(hole)) : true;
    let base = null;
    if (matInsideHole) {
      const downs = [...new Set(model.levels.map((l) => l.z).filter((x) => x < z - eps))].sort((a, b) => b - a);
      for (const zl of downs) {
        if (zl <= zMin + eps) break;
        const sl = model.slice(zl - eps * 4);
        const m = loopAround(sl, c, 1);
        if (!m || Math.abs(loopArea(m)) > a0 * 1.02) { base = zl; break; }
      }
    }
    if (base != null) {
      features.push({ id: id('boss'), type: 'boss', seed: [c[0], c[1]], top: round(z), base: round(base), height: round(z - base), outline: cleanLoop(mat), area: a0, faces: [f.faceId] });
      continue;
    }
    if (hole) {
      // Closed pocket: the hole loop above the floor; its top where it stops enclosing the floor.
      let top = zTop;
      for (const zl of levelsAbove(z)) { if (zl >= zTop) break; const sl = model.slice(zl + eps * 4); if (!loopAround(sl, c, -1) || inMaterial(sl, c)) { top = zl; break; } }
      const outline = cleanLoop(reverseLoop(hole));
      const islands = above.filter((l) => loopArea(l) > 0 && windingOf(outline, l[0]) !== 0).map((l) => l);
      const { w, L } = widthLength(outline);
      const slot = L > 2.5 * w && islands.length === 0;
      features.push({ id: id(slot ? 'slot' : 'pocket'), type: slot ? 'slot' : 'pocket', seed: [c[0], c[1]], floor: round(z), top: round(top), depth: round(top - z), outline, islands, area: Math.abs(loopArea(outline)), width: round(w), length: round(L), faces: [f.faceId] });
      continue;
    }
    features.push({ id: id('step'), type: 'step', seed: [c[0], c[1]], floor: round(z), top: round(zTop), depth: round(zTop - z), outline: faceOutline(model.mesh, f.faceId), area: f.area, faces: [f.faceId] });
  }

  // Freeform: faces that are neither planar nor vertical, outside holes.
  const free = model.faces.filter((f) => f.kind === 'other' && !inHole(f.centroid) && !(f.normal[2] < -0.5));
  if (free.length) {
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (const f of free) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], f.bounds.lo[k]); hi[k] = Math.max(hi[k], f.bounds.hi[k]); }
    features.push({ id: id('surface'), type: 'surface3d', bounds: { lo, hi }, area: free.reduce((s, f) => s + f.area, 0), faces: free.map((f) => f.faceId) });
  }
  return { features, turnable: isTurnable(model), top: zTop, bottom: zMin };
}

/** The outline of one face (its boundary edges chained), CCW. */
export function faceOutline(mesh, faceId) {
  const fg = mesh.faceGroups.find((g) => g.faceId === faceId);
  if (!fg) return [];
  const V = mesh.vertices; const T = mesh.triangles;
  const key = (i) => `${round(V[3 * i], 1e5)},${round(V[3 * i + 1], 1e5)}`;
  const pos = new Map();
  const edges = new Map();
  for (let t = fg.start; t < fg.start + fg.count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = T[t + k]; const b = T[t + ((k + 1) % 3)];
      const ka = key(a); const kb = key(b);
      pos.set(ka, [V[3 * a], V[3 * a + 1]]); pos.set(kb, [V[3 * b], V[3 * b + 1]]);
      const back = `${kb}>${ka}`;
      if (edges.has(back)) edges.delete(back); else edges.set(`${ka}>${kb}`, [ka, kb]);
    }
  }
  const next = new Map([...edges.values()].map(([a, b]) => [a, b]));
  const loops = []; const used = new Set();
  for (const [a0] of next) {
    if (used.has(a0)) continue;
    const loop = []; let a = a0; let guard = next.size + 2;
    while (guard-- > 0 && !used.has(a)) { used.add(a); loop.push(pos.get(a)); a = next.get(a); if (a == null) break; }
    const c = cleanLoop(loop);
    if (c.length >= 3) loops.push(c);
  }
  loops.sort((x, y) => Math.abs(loopArea(y)) - Math.abs(loopArea(x)));
  const outer = loops[0] ?? [];
  return loopArea(outer) < 0 ? reverseLoop(outer) : outer;
}

/** True when every triangle's normal lies in the plane through the Z axis (a part to turn about Z). */
export function isTurnable(model) {
  const V = model.welded.vertices; const T = model.welded.triangles;
  const cx = (model.bounds.lo[0] + model.bounds.hi[0]) / 2; const cy = (model.bounds.lo[1] + model.bounds.hi[1]) / 2;
  let bad = 0; let total = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t]; const b = 3 * T[t + 1]; const c = 3 * T[t + 2];
    const ux = V[b] - V[a]; const uy = V[b + 1] - V[a + 1]; const uz = V[b + 2] - V[a + 2];
    const vx = V[c] - V[a]; const vy = V[c + 1] - V[a + 1]; const vz = V[c + 2] - V[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const A = Math.hypot(...n);
    if (A < 1e-12) continue;
    const px = (V[a] + V[b] + V[c]) / 3 - cx; const py = (V[a + 1] + V[b + 1] + V[c + 1]) / 3 - cy;
    const pr = Math.hypot(px, py);
    total += A;
    if (pr < 1e-6) continue;
    // Tangential component of the normal.
    const tang = Math.abs((-py * n[0] + px * n[1]) / (pr * A));
    if (tang > 0.08) bad += A;
  }
  return total > 0 && bad / total < 0.005;
}

/**
 * The profile of a part turned about Z (axis through the XY centre of its box): samples [{ z, outer, inner }]
 * from the front (top, max z) to the back, outer the largest radius, inner the bore radius (0 = solid), plus
 * grooves (outer dips between higher shoulders) and the front face height.
 */
export function turningProfile(model, { step = null } = {}) {
  const { lo, hi } = model.bounds;
  const cx = (lo[0] + hi[0]) / 2; const cy = (lo[1] + hi[1]) / 2;
  const L = hi[2] - lo[2];
  const dz = step ?? Math.max(0.05, Math.min(0.5, L / 400));
  const zs = new Set();
  for (let z = hi[2] - dz / 2; z > lo[2]; z -= dz) zs.add(round(z, 1e5));
  for (const l of model.levels) { for (const s of [-1, 1]) { const z = l.z + s * model.eps * 4; if (z > lo[2] && z < hi[2]) zs.add(round(z, 1e5)); } }
  const samples = [];
  for (const z of [...zs].sort((a, b) => b - a)) {
    const loops = model.slice(z);
    if (!loops.length) continue;
    let outer = 0; let inner = Infinity;
    for (const l of loops) {
      const a = loopArea(l);
      for (const p of l) {
        const r = Math.hypot(p[0] - cx, p[1] - cy);
        if (a > 0) outer = Math.max(outer, r);
      }
      if (a < 0 && windingOf(l, [cx, cy]) !== 0) for (const p of l) inner = Math.min(inner, Math.hypot(p[0] - cx, p[1] - cy));
    }
    samples.push({ z, outer, inner: Number.isFinite(inner) ? inner : 0 });
  }
  // Grooves: runs where the outer radius sits clearly below the shoulders on both sides.
  const grooves = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const r = samples[i].outer;
    let j = i;
    while (j + 1 < samples.length && Math.abs(samples[j + 1].outer - r) < 1e-3) j++;
    const before = samples[i - 1].outer; const after = samples[j + 1]?.outer ?? 0;
    const width = samples[i].z - samples[j].z + dz;
    if (j + 1 < samples.length && before > r + 0.2 && after > r + 0.2 && width < Math.max(12, r)) grooves.push({ z0: samples[j].z, z1: samples[i].z, r, depth: Math.min(before, after) - r, width });
    i = j;
  }
  return { cx, cy, front: hi[2], back: lo[2], samples, grooves, maxR: Math.max(0, ...samples.map((s) => s.outer)), bore: boreOf(samples) };
}

/** The smallest bore radius along the part (0 when it is solid somewhere along the axis). */
function boreOf(samples) {
  let b = Infinity;
  for (const s of samples) b = Math.min(b, s.inner > 0 ? s.inner : 0);
  return Number.isFinite(b) ? b : 0;
}

/** Thread hints from the part's features (tapped holes, cosmetic threads): [{ x, y, d, size }]. */
export function threadHints(part) {
  const out = [];
  for (const f of part?.features ?? []) {
    if (f.suppressed) continue;
    const size = typeof f.size === 'string' && /^M\d/.test(f.size) ? f.size : typeof f.thread === 'string' ? f.thread : null;
    const tapped = f.kind === 'tapped' || f.tapped || f.type === 'thread' || f.type === 'cosmeticThread';
    if (!tapped || !size) continue;
    for (const p of f.points ?? f.holePoints ?? []) if (Array.isArray(p) && p.length >= 2) out.push({ x: Number(p[0]), y: Number(p[1]), d: Number(f.diameter) || 0, size });
    if (Number.isFinite(Number(f.x)) && Number.isFinite(Number(f.y))) out.push({ x: Number(f.x), y: Number(f.y), d: Number(f.diameter) || 0, size });
  }
  return out;
}
