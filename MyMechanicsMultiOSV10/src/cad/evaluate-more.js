// More Evaluate tools on the part's body (no DOM): deviation analysis (the angle between the faces along their
// edges), symmetry check (the body against its mirror image about a plane), geometry check (the kernel's validity
// check, short and degenerate edges, sliver faces, non-manifold and open edges), undercut analysis (faces that a
// mould half pulled along a direction cannot release), comparing two parts (volumes, areas, the material only in
// one of them, which faces changed, the feature lists), a cost estimate (stock material and a machining time) and
// a sustainability report (CO₂e of the material, the machining energy and transport).
// Face results are by face index (body.faces order) with the face's hashCode, so the app can colour its mesh.
import { rep } from './kernel.js';
import { materialOf } from './materials.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const deg = (r) => (r * 180) / Math.PI;
const PERIODIC = new Set(['CYLINDRE', 'CYLINDER', 'CONE', 'SPHERE', 'TORUS', 'TORE', 'REVOLUTION', 'BSPLINE', 'BEZIER', 'EXTRUSION', 'OFFSET']);

/** The size of a shape (its bounding box diagonal). */
export function shapeSize(shape) {
  try { const [lo, hi] = shape.boundingBox.bounds; return Math.max(1e-6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])); } catch { return 1; }
}

/** Edge hash → { edge, faces: [face indices] }, counting a face's seam edge twice (it bounds the face on both sides). */
export function edgeFaceMap(body) {
  const R = rep(); const oc = R.getOC();
  const map = new Map();
  body.faces.forEach((face, fi) => {
    for (const e of face.edges) {
      const k = e.hashCode;
      if (!map.has(k)) map.set(k, { edge: e, faces: [] });
      const rec = map.get(k);
      rec.faces.push(fi);
      let seam = false;
      try { seam = oc.BRep_Tool.IsClosed(e.wrapped, face.wrapped); } catch { seam = PERIODIC.has(face.geomType) && e.geomType === 'LINE'; }
      if (seam) { rec.faces.push(fi); rec.seam = true; }
    }
  });
  return map;
}

const faceNormal = (face, p) => { try { return unit(vec(face.normalAt(p))); } catch { return null; } };

// ───────────────────────── deviation analysis

/**
 * The angle (degrees) between the two faces' normals at points along each edge they share: 0 = tangent, 90 = a
 * square corner. `edges` (optional) limits it to those edge hashes. Returns { edges: [{ hash, faces, min, max, avg,
 * length, type }] (most deviation first), max, avg, tangent (edges under `tangentTol`°), count }.
 */
export function deviationAnalysis(body, { edges = null, samples = 9, tangentTol = 1 } = {}) {
  const faces = body.faces;
  const map = edgeFaceMap(body);
  const out = [];
  for (const [hash, rec] of map) {
    if (edges && !edges.includes(hash)) continue;
    const fs = [...new Set(rec.faces)];
    if (fs.length !== 2 || rec.seam) continue;
    const [fa, fb] = fs.map((i) => faces[i]);
    const vals = [];
    for (let k = 0; k < samples; k++) {
      const t = (k + 0.5) / samples;
      let p;
      try { p = rec.edge.pointAt(t); } catch { continue; }
      const na = faceNormal(fa, p); const nb = faceNormal(fb, p);
      if (!na || !nb || !na.some(Boolean) || !nb.some(Boolean)) continue;
      vals.push(deg(Math.acos(Math.max(-1, Math.min(1, dot(na, nb))))));
    }
    if (!vals.length) continue;
    let length = 0; try { length = rec.edge.length; } catch { /* none */ }
    out.push({ hash, faces: fs, min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((s, v) => s + v, 0) / vals.length, length, type: rec.edge.geomType });
    if (out.length > 600) break;
  }
  out.sort((a, b) => b.max - a.max);
  const max = out.length ? out[0].max : 0;
  const avg = out.length ? out.reduce((s, e) => s + e.avg, 0) / out.length : 0;
  return { edges: out, max, avg, tangent: out.filter((e) => e.max < tangentTol).length, count: out.length };
}

// ───────────────────────── symmetry check

function faceSig(face) {
  const R = rep();
  let area = 0; try { area = R.measureArea(face); } catch { /* 0 */ }
  return { type: face.geomType, area, c: vec(face.center) };
}

/**
 * The body against its mirror image about the plane { point, normal }: a face is symmetric when the mirror image
 * has a face of the same kind, area and place. Returns { faces: [{ index, hash, symmetric }], asymmetric (count),
 * total, volume, common (volume shared with the mirror image), ratio (common / volume), symmetric (all faces) }.
 */
export function symmetryCheck(body, { point = [0, 0, 0], normal = [1, 0, 0], tol = null } = {}) {
  const R = rep();
  const size = shapeSize(body);
  const t = tol ?? Math.max(1e-6, size * 1e-5);
  const mirrored = body.clone().mirror(unit(normal), point);
  const ms = mirrored.faces.map(faceSig);
  const faces = body.faces.map((f, index) => {
    const s = faceSig(f);
    const symmetric = ms.some((m) => m.type === s.type && Math.abs(m.area - s.area) <= Math.max(t * t, s.area * 1e-5) && Math.hypot(...sub(m.c, s.c)) <= t * 10);
    return { index, hash: f.hashCode, symmetric };
  });
  const volume = R.measureVolume(body);
  let common = volume;
  try { common = R.measureVolume(body.clone().intersect(mirrored.clone())); } catch { common = NaN; }
  const asymmetric = faces.filter((f) => !f.symmetric).length;
  return { faces, asymmetric, total: faces.length, volume, common, ratio: volume > 0 ? common / volume : 0, symmetric: asymmetric === 0 };
}

// ───────────────────────── geometry check

/**
 * The kernel's validity check of the body, its faces and edges, plus short and degenerate edges (< minEdge),
 * sliver faces (4πA/P² < sliverRatio, or area < minArea), non-manifold edges (more than two faces) and open edges
 * (one face, not a seam). Returns { valid, solids, invalidFaces, invalidEdges, shortEdges, slivers, nonManifold,
 * openEdges, faces: [{ index, hash, problem }], problems (count) }.
 */
export function geometryCheck(body, { minEdge = 0.01, sliverRatio = 0.02, minArea = 1e-4 } = {}) {
  const R = rep(); const oc = R.getOC();
  const check = (shape) => { let a = null; try { a = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false); return a.IsValid(); } catch { return true; } finally { a?.delete?.(); } };
  const valid = check(body);
  const faces = body.faces;
  const out = { valid, solids: 0, invalidFaces: [], invalidEdges: [], shortEdges: [], slivers: [], nonManifold: [], openEdges: [] };
  try { out.solids = body.solids?.length ?? 0; } catch { out.solids = 0; }
  const problem = new Map();
  const mark = (i, what) => { if (!problem.has(i)) problem.set(i, what); };
  faces.forEach((f, i) => {
    if (!check(f)) { out.invalidFaces.push(i); mark(i, 'invalid'); }
    let area = 0; let per = 0;
    try { area = R.measureArea(f); } catch { /* 0 */ }
    for (const e of f.edges) { try { per += e.length; } catch { /* none */ } }
    const compact = per > 0 ? (4 * Math.PI * area) / (per * per) : 0;
    if (area < minArea || compact < sliverRatio) { out.slivers.push({ index: i, area, compact }); mark(i, 'sliver'); }
  });
  for (const [hash, rec] of edgeFaceMap(body)) {
    const n = rec.faces.length;
    let len = 0; try { len = rec.edge.length; } catch { /* 0 */ }
    let degenerate = false; try { degenerate = oc.BRep_Tool.Degenerated(rec.edge.wrapped); } catch { /* no */ }
    if (degenerate) continue;
    if (!check(rec.edge)) { out.invalidEdges.push({ hash, length: len }); for (const i of rec.faces) mark(i, 'invalid'); }
    if (len < minEdge) { out.shortEdges.push({ hash, length: len }); for (const i of rec.faces) mark(i, 'shortEdge'); }
    if (n > 2) { out.nonManifold.push({ hash, faces: n }); for (const i of rec.faces) mark(i, 'nonManifold'); }
    if (n === 1) { out.openEdges.push({ hash, length: len }); for (const i of rec.faces) mark(i, 'openEdge'); }
  }
  out.faces = faces.map((f, index) => ({ index, hash: f.hashCode, problem: problem.get(index) ?? null }));
  out.problems = (valid ? 0 : 1) + out.invalidFaces.length + out.invalidEdges.length + out.shortEdges.length + out.slivers.length + out.nonManifold.length + out.openEdges.length;
  return out;
}

// ───────────────────────── undercut analysis (on the display mesh)

function basisOf(dir) {
  const d = unit(dir);
  const a = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(a, d)); const v = cross(d, u);
  return { d, u, v };
}

/**
 * Which faces a two-part mould pulled apart along `dir` can release. Every triangle centre is tested: facing the
 * pull (+dir) it must see out along +dir, facing away along −dir; a wall parallel to the pull either way. Faces are
 * 'cavity' (released by the +dir half), 'core' (by the −dir half), 'straight' (parallel walls: need draft) or
 * 'undercut' (blocked both ways — the mould needs a side action). mesh = body.mesh() (faceGroups give the faces).
 * Returns { faces: Map faceId → class, counts: { cavity, core, straight, undercut }, undercut (count) }.
 */
export function undercutAnalysis(mesh, dir, { angle = 0.5 } = {}) {
  const V = mesh.vertices; const T = mesh.triangles;
  const { d, u, v } = basisOf(dir);
  const nT = T.length / 3;
  const P = (i) => [V[3 * i], V[3 * i + 1], V[3 * i + 2]];
  // Triangles projected onto the plane across the pull, with their depth along it, binned on a grid.
  const tri = new Float64Array(nT * 9);
  let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity; let wMin = Infinity; let wMax = -Infinity;
  for (let t = 0; t < nT; t++) {
    for (let k = 0; k < 3; k++) {
      const p = P(T[3 * t + k]);
      const pu = dot(p, u); const pv = dot(p, v); const pw = dot(p, d);
      tri.set([pu, pv, pw], t * 9 + k * 3);
      u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); wMin = Math.min(wMin, pw); wMax = Math.max(wMax, pw);
    }
  }
  const size = Math.max(1e-9, Math.hypot(u1 - u0, v1 - v0, wMax - wMin));
  const N = Math.max(1, Math.min(160, Math.ceil(Math.sqrt(nT) * 1.5)));
  const cu = Math.max(1e-9, (u1 - u0) / N); const cv = Math.max(1e-9, (v1 - v0) / N);
  const grid = Array.from({ length: N * N }, () => []);
  for (let t = 0; t < nT; t++) {
    const o = t * 9;
    const tu0 = Math.min(tri[o], tri[o + 3], tri[o + 6]); const tu1 = Math.max(tri[o], tri[o + 3], tri[o + 6]);
    const tv0 = Math.min(tri[o + 1], tri[o + 4], tri[o + 7]); const tv1 = Math.max(tri[o + 1], tri[o + 4], tri[o + 7]);
    const area2 = (tri[o + 3] - tri[o]) * (tri[o + 7] - tri[o + 1]) - (tri[o + 6] - tri[o]) * (tri[o + 4] - tri[o + 1]);
    if (Math.abs(area2) < 1e-14 * size * size) continue; // seen edge-on: blocks nothing
    const i0 = Math.max(0, Math.floor((tu0 - u0) / cu)); const i1 = Math.min(N - 1, Math.floor((tu1 - u0) / cu));
    const j0 = Math.max(0, Math.floor((tv0 - v0) / cv)); const j1 = Math.min(N - 1, Math.floor((tv1 - v0) / cv));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[i * N + j].push(t);
  }
  const eps = size * 1e-6;
  /** Is something in front of (side +1) or behind (−1) the point (pu, pv, pw)? */
  const blocked = (pu, pv, pw, self, side) => {
    const i = Math.min(N - 1, Math.max(0, Math.floor((pu - u0) / cu))); const j = Math.min(N - 1, Math.max(0, Math.floor((pv - v0) / cv)));
    for (const t of grid[i * N + j]) {
      if (t === self) continue;
      const o = t * 9;
      const ax = tri[o]; const ay = tri[o + 1]; const bx = tri[o + 3]; const by = tri[o + 4]; const cx = tri[o + 6]; const cy = tri[o + 7];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-18) continue;
      const l1 = ((by - cy) * (pu - cx) + (cx - bx) * (pv - cy)) / den;
      const l2 = ((cy - ay) * (pu - cx) + (ax - cx) * (pv - cy)) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < 1e-9 || l2 < 1e-9 || l3 < 1e-9) continue;
      const w = l1 * tri[o + 2] + l2 * tri[o + 5] + l3 * tri[o + 8];
      if (side > 0 ? w > pw + eps : w < pw - eps) return true;
    }
    return false;
  };
  const s = Math.sin((angle * Math.PI) / 180);
  const faces = new Map();
  const counts = { cavity: 0, core: 0, straight: 0, undercut: 0 };
  for (const fg of mesh.faceGroups ?? [{ start: 0, count: T.length, faceId: 0 }]) {
    const tally = { cavity: 0, core: 0, straight: 0, undercut: 0 };
    const first = fg.start / 3; const n = fg.count / 3;
    const step = Math.max(1, Math.floor(n / 80));
    for (let t = first; t < first + n; t += step) {
      const a = P(T[3 * t]); const b = P(T[3 * t + 1]); const c = P(T[3 * t + 2]);
      const nn = unit(cross(sub(b, a), sub(c, a)));
      if (!nn.some(Boolean)) continue;
      const ctr = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      // Nudged a little out across the pull, so a wall is not hidden by the faces it meets at its ends.
      const across = sub(nn, d.map((x) => x * dot(nn, d)));
      const al = Math.hypot(...across);
      const q = al > 1e-9 ? ctr.map((x, k) => x + (across[k] / al) * size * 1e-4) : ctr;
      const pu = dot(q, u); const pv = dot(q, v); const pw = dot(ctr, d);
      const nd = dot(nn, d);
      let cls;
      if (nd > s) cls = blocked(pu, pv, pw, t, 1) ? 'undercut' : 'cavity';
      else if (nd < -s) cls = blocked(pu, pv, pw, t, -1) ? 'undercut' : 'core';
      else cls = blocked(pu, pv, pw, t, 1) && blocked(pu, pv, pw, t, -1) ? 'undercut' : 'straight';
      tally[cls]++;
    }
    const total = tally.cavity + tally.core + tally.straight + tally.undercut;
    let cls = 'straight';
    if (total) {
      if (tally.undercut / total > 0.3) cls = 'undercut';
      else cls = ['cavity', 'core', 'straight'].reduce((m, k) => (tally[k] > tally[m] ? k : m), 'cavity');
    }
    faces.set(fg.faceId, cls);
    counts[cls]++;
  }
  return { faces, counts, undercut: counts.undercut };
}

// ───────────────────────── compare two parts

/** Sample points on each face (triangle centres of its mesh), by face hashCode. */
function faceSamples(mesh, per = 3) {
  const V = mesh.vertices; const T = mesh.triangles;
  const out = new Map();
  for (const fg of mesh.faceGroups ?? []) {
    const first = fg.start / 3; const n = fg.count / 3;
    const pts = [];
    for (let k = 0; k < Math.min(per, n); k++) {
      const t = first + Math.floor(((k + 0.5) * n) / Math.min(per, n));
      const c = [0, 0, 0];
      for (let j = 0; j < 3; j++) for (let x = 0; x < 3; x++) c[x] += V[3 * T[3 * t + j] + x] / 3;
      pts.push(c);
    }
    out.set(fg.faceId, pts);
  }
  return out;
}

/** The feature lists side by side: names only in A (added), only in B (removed), in both with other values (changed). */
export function compareFeatures(fa = [], fb = []) {
  const key = (f) => `${f.type}|${f.name ?? f.id}`;
  const strip = (f) => JSON.stringify({ ...f, id: undefined, name: undefined });
  const mb = new Map(fb.map((f) => [key(f), f]));
  const ma = new Map(fa.map((f) => [key(f), f]));
  return {
    added: fa.filter((f) => !mb.has(key(f))).map((f) => f.name ?? f.id),
    removed: fb.filter((f) => !ma.has(key(f))).map((f) => f.name ?? f.id),
    changed: fa.filter((f) => mb.has(key(f)) && strip(f) !== strip(mb.get(key(f)))).map((f) => f.name ?? f.id),
  };
}

/**
 * Two parts compared: { volumeA, volumeB, areaA, areaB, onlyA (volume of A outside B), onlyB, common, faces:
 * [{ index, hash, same }] (A's faces lying on B's surface are the same), changedFaces, features }.
 */
export function compareParts(a, b, { featuresA = [], featuresB = [], tol = null } = {}) {
  const R = rep();
  const size = Math.max(shapeSize(a), shapeSize(b));
  const t = tol ?? Math.max(1e-5, size * 1e-5);
  const vol = (s) => { try { return R.measureVolume(s); } catch { return NaN; } };
  const area = (s) => { try { return R.measureArea(s); } catch { return NaN; } };
  const out = { volumeA: vol(a), volumeB: vol(b), areaA: area(a), areaB: area(b) };
  try { out.onlyA = vol(a.clone().cut(b.clone())); } catch { out.onlyA = NaN; }
  try { out.onlyB = vol(b.clone().cut(a.clone())); } catch { out.onlyB = NaN; }
  try { out.common = vol(a.clone().intersect(b.clone())); } catch { out.common = NaN; }
  const samples = faceSamples(a.mesh({ tolerance: Math.max(0.01, size * 0.002), angularTolerance: 0.4 }));
  // A face is unchanged when it lies on B's surface and B has a face of its kind, area and centre.
  const sigB = b.faces.map(faceSig);
  out.faces = a.faces.map((f, index) => {
    const pts = samples.get(f.hashCode) ?? [vec(f.center)];
    const s = faceSig(f);
    const twin = sigB.some((m) => m.type === s.type && Math.abs(m.area - s.area) <= Math.max(t * t, s.area * 1e-5) && Math.hypot(...sub(m.c, s.c)) <= t * 10);
    const same = twin && pts.every((p) => { let dd = Infinity; try { dd = R.measureDistanceBetween(R.makeVertex(p), b); } catch { /* far */ } return dd <= t; });
    return { index, hash: f.hashCode, same };
  });
  out.changedFaces = out.faces.filter((f) => !f.same).length;
  out.features = compareFeatures(featuresA, featuresB);
  out.identical = out.changedFaces === 0 && Math.abs(out.volumeA - out.volumeB) <= t * size * size && !(out.onlyB > t * size * size);
  return out;
}

// ───────────────────────── costing and sustainability

/** Starting values of the cost estimate (editable; prices per kg in the user's currency, rates per hour). */
export const COST_DEFAULTS = {
  pricePerKg: { steel: 1.2, iron: 0.9, aluminium: 3.5, copper: 9, titanium: 30, plastic: 2.5, other: 2 },
  removalRate: { steel: 15, iron: 20, aluminium: 60, copper: 30, titanium: 5, plastic: 80, other: 40 }, // cm³/min
  rate: 60, setup: 30, finishRate: 50, allowance: 2, currency: '$',
};

/** Starting values of the CO₂e estimate: kg CO₂e per kg of material, machine power (kW), grid (kg/kWh), transport. */
export const CO2_DEFAULTS = {
  perKg: { steel: 1.9, iron: 1.5, aluminium: 8.2, copper: 3.8, titanium: 35, plastic: 3.2, other: 2 },
  power: 7.5, grid: 0.45, distance: 500, perTonneKm: 0.1,
};

const pick = (table, group) => Number(table?.[group] ?? table?.other ?? 0);

/**
 * Cost of a machined part: the stock (bounding box + allowance on every side) bought by weight, and the time to
 * cut away what is not the part (removal rate) and to finish its surface, plus the setup, at the shop rate.
 * volume mm³, area mm², bbox [[x,y,z],[x,y,z]] mm, material id. Settings as COST_DEFAULTS (overrides merged).
 */
export function costEstimate({ volume, area, bbox, material }, settings = {}) {
  const s = { ...COST_DEFAULTS, ...settings, pricePerKg: { ...COST_DEFAULTS.pricePerKg, ...(settings.pricePerKg ?? {}) }, removalRate: { ...COST_DEFAULTS.removalRate, ...(settings.removalRate ?? {}) } };
  const m = materialOf(material);
  const group = m.group ?? 'other';
  const al = Math.max(0, Number(s.allowance) || 0);
  const size = bbox ? bbox[1].map((v, i) => v - bbox[0][i] + 2 * al) : [0, 0, 0];
  const stockVolume = size[0] * size[1] * size[2];
  const kg = (mm3) => mm3 * 1e-9 * m.density;
  const partMass = kg(volume); const stockMass = kg(stockVolume);
  const price = s.price != null && s.price !== '' ? Number(s.price) : pick(s.pricePerKg, group);
  const removalRate = s.removal != null && s.removal !== '' ? Number(s.removal) : pick(s.removalRate, group);
  const materialCost = stockMass * price;
  const removed = Math.max(0, stockVolume - volume) / 1000; // cm³
  const roughMin = removalRate > 0 ? removed / removalRate : 0;
  const finishMin = s.finishRate > 0 ? area / 100 / s.finishRate : 0;
  const timeMin = (Number(s.setup) || 0) + roughMin + finishMin;
  const machiningCost = (timeMin / 60) * (Number(s.rate) || 0);
  return { group, price, removalRate, partMass, stockMass, stockVolume, removed, roughMin, finishMin, setupMin: Number(s.setup) || 0, timeMin, materialCost, machiningCost, total: materialCost + machiningCost, currency: s.currency };
}

/**
 * CO₂e of making the part: the stock material (kg × factor), the machining energy (time × power × grid factor)
 * and transport of the part (tonnes × km × factor). Settings as CO2_DEFAULTS. All in kg CO₂e.
 */
export function sustainabilityReport({ partMass, stockMass, timeMin, material }, settings = {}) {
  const s = { ...CO2_DEFAULTS, ...settings, perKg: { ...CO2_DEFAULTS.perKg, ...(settings.perKg ?? {}) } };
  const group = materialOf(material).group ?? 'other';
  const factor = s.factor != null && s.factor !== '' ? Number(s.factor) : pick(s.perKg, group);
  const materialCO2 = (stockMass ?? partMass) * factor;
  const energy = ((Number(timeMin) || 0) / 60) * (Number(s.power) || 0);
  const machiningCO2 = energy * (Number(s.grid) || 0);
  const transportCO2 = ((partMass || 0) / 1000) * (Number(s.distance) || 0) * (Number(s.perTonneKm) || 0);
  return { group, factor, materialCO2, energy, machiningCO2, transportCO2, total: materialCO2 + machiningCO2 + transportCO2, perKgPart: partMass > 0 ? (materialCO2 + machiningCO2 + transportCO2) / partMass : 0 };
}

// ───────────────────────── colours

export const RESULT_COLOURS = {
  ok: [0.35, 0.72, 0.42], bad: [0.88, 0.22, 0.2], warn: [0.96, 0.66, 0.15], info: [0.3, 0.55, 0.9], muted: [0.7, 0.72, 0.75],
  cavity: [0.25, 0.55, 0.92], core: [0.35, 0.75, 0.4], straight: [0.95, 0.8, 0.2], undercut: [0.9, 0.2, 0.2],
};

/** Per-vertex colours of a mesh from a colour per face (faceId → [r, g, b]); faces without one get `rest`. */
export function faceColours(mesh, colourOf, rest = RESULT_COLOURS.muted) {
  const out = new Float32Array(mesh.vertices.length);
  for (let i = 0; i < out.length; i += 3) out.set(rest, i);
  const T = mesh.triangles;
  for (const fg of mesh.faceGroups ?? []) {
    const c = colourOf(fg.faceId) ?? rest;
    for (let k = fg.start; k < fg.start + fg.count; k++) out.set(c, 3 * T[k]);
  }
  return out;
}

/** A colour from green (0) through yellow to red (1). */
export const rampColour = (x) => { const t = Math.max(0, Math.min(1, x)); return t < 0.5 ? [0.3 + 1.3 * t, 0.75, 0.35 - 0.3 * t] : [0.95, 0.75 - 1.1 * (t - 0.5), 0.2]; };
