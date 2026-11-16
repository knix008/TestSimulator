// Rhino .3dm reading with McNeel's rhino3dm (openNURBS in WebAssembly):
// walks a File3dm and returns plain data — triangle meshes grouped by layer
// and colour for the 3D model import, or curves, edges, points and texts for
// the plan drawing import. No three.js objects: this runs inside the module
// worker (rhino3dm-worker.js), whose results cross postMessage, and directly
// in node for the unit tests. rhino3dm.js turns the data into a model or into
// CAD layer drawings.
//
// Geometry:
//   Mesh                  its triangles
//   Brep, Extrusion       the render meshes saved with the file (per face);
//   Surface, SubD         a face without one (files saved with "Save small",
//                         or written by scripts) is tessellated here: planar
//                         faces exactly from their edge loops, curved faces on
//                         a parameter grid clipped by the loops; SubDs from
//                         their subdivided control net
//   Curve                 sampled polylines (circles and arcs kept as such)
//   Point, TextDot, Text  points and texts (plan only)
//   InstanceReference     the definition's objects with the block transform,
//                         nested up to MAX_DEPTH
// Skipped (counted for the import notes): lights, point clouds, hatches,
// dimensions and leaders, objects in layouts (page space), hidden objects.
//
// Coordinates stay in file units (Z up); `metresPerUnit` comes from the
// model unit system (null when the file says "none").

import { ShapeUtils, Vector2 } from "../vendor/three/three.core.js";

const UNIT_METRES = {
  Angstroms: 1e-10, Nanometers: 1e-9, Microns: 1e-6, Millimeters: 1e-3, Centimeters: 1e-2, Decimeters: 0.1, Meters: 1,
  Dekameters: 10, Hectometers: 100, Kilometers: 1000, Megameters: 1e6, Gigameters: 1e9, Microinches: 2.54e-8, Mils: 2.54e-5,
  Inches: 0.0254, Feet: 0.3048, Yards: 0.9144, Miles: 1609.344, PrinterPoints: 0.0254 / 72, PrinterPicas: 0.0254 / 6,
  NauticalMiles: 1852, AstronomicalUnits: 1.495978707e11, LightYears: 9.4607304725808e15, Parsecs: 3.08567758149137e16,
};
const UNIT_SHORT = { Millimeters: "mm", Centimeters: "cm", Meters: "m", Inches: "in", Feet: "ft" };

const MAX_DEPTH = 10;
const MAX_CURVE_POINTS = 4000;
const MAX_GRID = 96;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// ---------------------------------------------------------------- small helpers

const enumName = (enumObj, v) => {
  if (v === undefined || v === null) return "";
  const val = typeof v === "object" ? v.value : v;
  for (const k of Object.keys(enumObj)) if (enumObj[k] && enumObj[k].value === val) return k;
  return "";
};
const enumIs = (v, e) => !!v && !!e && (v === e || v.value === e.value);

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
// Black (Rhino's default layer colour) is drawn like DXF's "foreground" colour
// so that it stays visible on the dark plan theme.
const isBlack = (c) => !!c && !c.r && !c.g && !c.b;
const colorHex = (c) => (c && !isBlack(c) ? `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}` : "#9aa4b5");
const SHADE_GREY = { r: 200, g: 200, b: 200, a: 255 };

function mul(a, b) { // row-major 4×4
  const o = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
  }
  return o;
}
function apply(m, p) {
  const x = p[0], y = p[1], z = p[2];
  const w = m[12] * x + m[13] * y + m[14] * z + m[15] || 1;
  return [(m[0] * x + m[1] * y + m[2] * z + m[3]) / w, (m[4] * x + m[5] * y + m[6] * z + m[7]) / w, (m[8] * x + m[9] * y + m[10] * z + m[11]) / w];
}
const applyVec = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[4] * v[0] + m[5] * v[1] + m[6] * v[2], m[8] * v[0] + m[9] * v[1] + m[10] * v[2]];
const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
const isIdentity = (m) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-12);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const finite3 = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);

function safe(fn, fallback = null) {
  try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
}

// ---------------------------------------------------------------- curves

// A curve as points along it: corners exactly (knots), curved spans sampled.
export function curvePoints(rh, curve) {
  if (curve instanceof rh.LineCurve || safe(() => curve.isLinear(), false)) {
    const a = safe(() => curve.pointAtStart), b = safe(() => curve.pointAtEnd);
    return finite3(a) && finite3(b) ? [a, b] : [];
  }
  if (curve instanceof rh.PolylineCurve) {
    const n = safe(() => curve.pointCount, 0);
    const out = [];
    for (let i = 0; i < n; i++) { const p = safe(() => curve.point(i)); if (finite3(p)) out.push(p); }
    return out;
  }
  const dom = safe(() => curve.domain);
  if (!dom || !(dom[1] > dom[0])) return [];
  let params = [dom[0], dom[1]];
  let per = 16;
  const nurbs = safe(() => curve.toNurbsCurve());
  if (nurbs) {
    const deg = safe(() => nurbs.degree, 3);
    per = deg <= 1 ? 1 : deg === 2 ? 12 : 16;
    const kl = safe(() => nurbs.knots);
    const nk = kl ? safe(() => kl.count, 0) : 0;
    const set = new Set(params);
    for (let i = 0; i < nk; i++) {
      const k = safe(() => kl.get(i));
      if (Number.isFinite(k) && k > dom[0] && k < dom[1]) set.add(k);
    }
    params = [...set].sort((a, b) => a - b);
    if (per === 1 && nurbs !== curve) safe(() => nurbs.delete());
  }
  const spans = params.length - 1;
  per = Math.max(1, Math.min(per, Math.floor(MAX_CURVE_POINTS / Math.max(1, spans))));
  const out = [];
  for (let s = 0; s < spans; s++) {
    const t0 = params[s], t1 = params[s + 1];
    for (let k = 0; k < per; k++) {
      const p = safe(() => curve.pointAt(t0 + ((t1 - t0) * k) / per));
      if (finite3(p)) out.push(p);
    }
  }
  const end = safe(() => curve.pointAt(dom[1]));
  if (finite3(end)) out.push(end);
  return out;
}

// Circle / arc (ArcCurve, or a NURBS curve that is one): centre, radius,
// turning normal (the curve runs counter-clockwise about n) and end points,
// all from three points along the curve; null when it is neither.
function arcInfo(rh, curve) {
  const circle = curve instanceof rh.ArcCurve ? !!safe(() => curve.isCompleteCircle, false) : !!safe(() => curve.isCircle(), false);
  if (!(curve instanceof rh.ArcCurve) && !circle && !safe(() => curve.isArc(), false)) return null;
  const dom = safe(() => curve.domain);
  if (!dom || !(dom[1] > dom[0])) return null;
  const at = (f) => safe(() => curve.pointAt(dom[0] + (dom[1] - dom[0]) * f));
  const [A, B, C] = circle ? [at(0), at(1 / 3), at(2 / 3)] : [at(0), at(0.5), at(1)];
  if (!finite3(A) || !finite3(B) || !finite3(C)) return null;
  const ab = sub(B, A), ac = sub(C, A), n = cross(ab, ac);
  const n2 = dot(n, n);
  if (!(n2 > 1e-30)) return null;
  const t1 = cross(n, ab).map((v) => v * dot(ac, ac)), t2 = cross(ac, n).map((v) => v * dot(ab, ab));
  const c = [0, 1, 2].map((k) => A[k] + (t1[k] + t2[k]) / (2 * n2));
  const r = Math.sqrt(dist2(c, A));
  const L = Math.sqrt(n2);
  return { c, r, n: [n[0] / L, n[1] / L, n[2] / L], full: circle, p0: A, p1: circle ? A : C };
}

// ---------------------------------------------------------------- meshes

// rhino3dm Mesh → { positions: number[], normals: number[] | null, index: number[] }.
function meshArrays(mesh) {
  const j = safe(() => mesh.toThreejsJSON());
  const d = j && (j.data || j);
  const attr = d && d.attributes;
  if (!attr || !attr.position) return null;
  const positions = Array.from(attr.position.array || []);
  const normals = attr.normal && attr.normal.array && attr.normal.array.length === positions.length ? Array.from(attr.normal.array) : null;
  let index = d.index && d.index.array ? Array.from(d.index.array) : null;
  if (!index) { index = []; for (let i = 0; i < positions.length / 3; i++) index.push(i); }
  return positions.length >= 9 && index.length >= 3 ? { positions, normals, index } : null;
}

// ---------------------------------------------------------------- face tessellation (no render mesh)

// Points of one trim loop, edges chained end to end. `pts.breaks` lists
// where a singular trim (a pole, no 3D edge) sat — the loop jumps across the
// parameter domain there — and `pts.breakAtStart` one between end and start.
function loopPoints(rh, brep, loop) {
  const trims = safe(() => loop.trims);
  const n = trims ? safe(() => trims.count, 0) : 0;
  const pts = [];
  const breaks = [];
  let pending = false, atStart = false;
  const edges = brep.edges();
  for (let i = 0; i < n; i++) {
    const t = safe(() => trims.get(i));
    const ei = t ? safe(() => t.edgeIndex, -1) : -1;
    if (ei < 0) { pending = true; continue; } // singular trim (pole)
    const e = safe(() => edges.get(ei));
    if (!e) continue;
    let sp = curvePoints(rh, e);
    if (sp.length < 2) continue;
    if (pending) { if (pts.length) breaks.push(pts.length); else atStart = true; pending = false; }
    // The trim says which way it runs along its edge (a closed edge, such as
    // a full circle, can only be oriented that way); the end points decide
    // only when the flag does not chain.
    if (safe(() => t.isReversed, false)) sp = sp.reverse();
    if (pts.length) {
      const last = pts[pts.length - 1];
      const closedEdge = dist2(sp[0], sp[sp.length - 1]) < 1e-18;
      if (!closedEdge && dist2(last, sp[sp.length - 1]) < dist2(last, sp[0])) sp = sp.reverse();
      if (dist2(last, sp[0]) < 1e-18) sp = sp.slice(1);
    }
    pts.push(...sp);
  }
  if (pts.length > 2 && dist2(pts[0], pts[pts.length - 1]) < 1e-18) pts.pop();
  pts.breaks = breaks.filter((b) => b < pts.length);
  pts.breakAtStart = atStart || pending;
  return pts;
}

function faceLoops(rh, brep, face) {
  const list = safe(() => face.loops);
  const n = list ? safe(() => list.count, 0) : 0;
  let outer = null;
  const inner = [];
  for (let i = 0; i < n; i++) {
    const loop = safe(() => list.get(i));
    if (!loop) continue;
    const type = safe(() => loop.loopType);
    const pts = loopPoints(rh, brep, loop);
    if (pts.length < 3) continue;
    if (enumIs(type, rh.BrepLoopType.Outer) && !outer) outer = pts;
    else if (enumIs(type, rh.BrepLoopType.Inner)) inner.push(pts);
    else if (!outer) outer = pts;
  }
  return { outer, inner };
}

function pushTriangles(out, pts3, tris) {
  const base = out.positions.length / 3;
  for (const p of pts3) out.positions.push(p[0], p[1], p[2]);
  for (const t of tris) out.index.push(base + t[0], base + t[1], base + t[2]);
}

// Planar face: triangulate the outer loop and its holes in the face plane.
function planarFace(face, loops, out) {
  const dom0 = face.domain(0), dom1 = face.domain(1);
  const fr = safe(() => face.frameAt((dom0[0] + dom0[1]) / 2, (dom1[0] + dom1[1]) / 2));
  const plane = Array.isArray(fr) ? fr[1] : fr;
  if (!plane || !finite3(plane.origin)) return false;
  const o = plane.origin, X = plane.xAxis, Y = plane.yAxis;
  let Z = plane.zAxis;
  if (safe(() => face.orientationIsReversed, false)) Z = [-Z[0], -Z[1], -Z[2]];
  const to2 = (p) => { const d = sub(p, o); return new Vector2(dot(d, X), dot(d, Y)); };
  const contour = loops.outer.map(to2);
  const holes = loops.inner.map((h) => h.map(to2));
  const tris = ShapeUtils.triangulateShape(contour, holes);
  if (!tris.length) return false;
  const all = [loops.outer, ...loops.inner].flat();
  const all2 = [contour, ...holes].flat();
  const up = dot(cross(X, Y), Z) >= 0;
  const oriented = tris.map(([a, b, c]) => {
    const A = all2[a], B = all2[b], C = all2[c];
    const ccw = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) > 0;
    return ccw === up ? [a, b, c] : [a, c, b];
  });
  pushTriangles(out, all, oriented);
  return true;
}

// Surface.isPlanar() of this rhino3dm build also says yes to spheres, so the
// face is checked here: samples over the domain and the loop within 1e-6 of
// its size from the mid-domain tangent plane.
function isFlat(face, outer) {
  const du = face.domain(0), dv = face.domain(1);
  const fr = face.frameAt((du[0] + du[1]) / 2, (dv[0] + dv[1]) / 2);
  const plane = Array.isArray(fr) ? fr[1] : fr;
  if (!plane || !finite3(plane.origin) || !finite3(plane.zAxis)) return false;
  const pts = [...outer];
  for (let j = 0; j <= 6; j++) for (let i = 0; i <= 6; i++) {
    const p = face.pointAt(du[0] + ((du[1] - du[0]) * i) / 6, dv[0] + ((dv[1] - dv[0]) * j) / 6);
    if (finite3(p)) pts.push(p);
  }
  let size = 0, dev = 0;
  for (const p of pts) {
    size = Math.max(size, Math.sqrt(dist2(p, plane.origin)));
    dev = Math.max(dev, Math.abs(dot(sub(p, plane.origin), plane.zAxis)));
  }
  return dev <= Math.max(1e-6 * size, 1e-9);
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polyArea = (poly) => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; return Math.abs(a / 2); };

// Curved face: parameter grid, cells kept when their centre lies inside the
// trim loops (mapped to parameter space by nearest sample + refinement).
function gridFace(face, loops, out) {
  const du = face.domain(0), dv = face.domain(1);
  if (!(du[1] > du[0]) || !(dv[1] > dv[0])) return false;
  const res = (dir, trimmed) => {
    const deg = safe(() => face.degree(dir), 3), spans = Math.max(1, safe(() => face.spanCount(dir), 1));
    let n = deg > 1 ? Math.min(MAX_GRID / 2, Math.max(8, spans * 4)) : spans;
    if (trimmed) n = Math.max(n, 32);
    return Math.min(MAX_GRID, n);
  };
  const sample = (nu, nv) => {
    const g = { nu, nv, U: (i) => du[0] + ((du[1] - du[0]) * i) / nu, V: (j) => dv[0] + ((dv[1] - dv[0]) * j) / nv, pts: [] };
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const p = safe(() => face.pointAt(g.U(i), g.V(j)));
      if (!finite3(p)) return null;
      g.pts.push(p);
    }
    return g;
  };
  let grid = sample(res(0, false), res(1, false));
  if (!grid) return false;

  let keep = null;
  let uvLoops = null;
  if (loops.outer) {
    const base = grid;
    // Closed in a direction: by the flag, or because both sides of the domain
    // meet (proxy faces of revolved surfaces can say "open" and still wrap).
    const size = Math.sqrt(base.pts.reduce((m, p) => Math.max(m, dist2(p, base.pts[0])), 0)) || 1;
    const meets = (dir) => {
      for (let k = 0; k <= 4; k++) {
        const t = dir === 0 ? dv[0] + ((dv[1] - dv[0]) * k) / 4 : du[0] + ((du[1] - du[0]) * k) / 4;
        const a = dir === 0 ? safe(() => face.pointAt(du[0], t)) : safe(() => face.pointAt(t, dv[0]));
        const b = dir === 0 ? safe(() => face.pointAt(du[1], t)) : safe(() => face.pointAt(t, dv[1]));
        if (!finite3(a) || !finite3(b) || Math.sqrt(dist2(a, b)) > 1e-5 * size) return false;
      }
      return true;
    };
    const closedU = !!safe(() => face.isClosed(0), false) || meets(0), closedV = !!safe(() => face.isClosed(1), false) || meets(1);
    const PU = du[1] - du[0], PV = dv[1] - dv[0];
    const toUV = (p, prev) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k < base.pts.length; k++) { const d = dist2(base.pts[k], p); if (d < bd) { bd = d; best = k; } }
      let u = base.U(best % (base.nu + 1)), v = base.V(Math.floor(best / (base.nu + 1)));
      // Refine with a few finite-difference Gauss-Newton steps.
      const hu = PU * 1e-4, hv = PV * 1e-4;
      for (let it = 0; it < 5; it++) {
        const s = safe(() => face.pointAt(u, v)), su = safe(() => face.pointAt(u + hu, v)), sv = safe(() => face.pointAt(u, v + hv));
        if (!finite3(s) || !finite3(su) || !finite3(sv)) break;
        const a = sub(su, s).map((x) => x / hu), b = sub(sv, s).map((x) => x / hv), r = sub(p, s);
        const aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), det = aa * bb - ab * ab;
        if (!(Math.abs(det) > 1e-30)) break;
        const ar = dot(a, r), br = dot(b, r);
        u = Math.min(du[1], Math.max(du[0], u + (bb * ar - ab * br) / det));
        v = Math.min(dv[1], Math.max(dv[0], v + (aa * br - ab * ar) / det));
      }
      if (prev) { // stay on the same side of a seam
        if (closedU) { while (u - prev[0] > PU / 2) u -= PU; while (prev[0] - u > PU / 2) u += PU; }
        if (closedV) { while (v - prev[1] > PV / 2) v -= PV; while (prev[1] - v > PV / 2) v += PV; }
      }
      return [u, v];
    };
    // Each run between poles is unwrapped continuously; across a pole the
    // runs are shifted by whole periods so that the loop encloses the most area.
    const mapLoop = (pts) => {
      const cuts = [...(pts.breakAtStart ? [0] : []), ...(pts.breaks || [])];
      let runs = [pts];
      if (cuts.length) {
        runs = cuts.map((a, k) => pts.slice(a, k + 1 < cuts.length ? cuts[k + 1] : pts.length));
        if (cuts[0] > 0) runs[runs.length - 1] = runs[runs.length - 1].concat(pts.slice(0, cuts[0]));
      }
      runs = runs.filter((r) => r.length);
      const xyz = runs.flat();
      const tag = (uv) => { uv.xyz = xyz; return uv; };
      const uvRuns = runs.map((r) => { const uv = []; for (const p of r) uv.push(toUV(p, uv[uv.length - 1])); return uv; });
      if (uvRuns.length < 2 || (!closedU && !closedV) || uvRuns.length > 4) return tag(uvRuns.flat());
      const opts = [];
      for (const su of closedU ? [0, PU, -PU] : [0]) for (const sv of closedV ? [0, PV, -PV] : [0]) opts.push([su, sv]);
      let best = uvRuns.flat(), bestA = polyArea(best);
      const k = uvRuns.length - 1;
      for (let c = 0; c < opts.length ** k; c++) {
        let x = c;
        const poly = [...uvRuns[0]];
        for (let r = 1; r <= k; r++) { const [a, b] = opts[x % opts.length]; x = Math.floor(x / opts.length); for (const [u, v] of uvRuns[r]) poly.push([u + a, v + b]); }
        const A = polyArea(poly);
        if (A > bestA + 1e-12) { bestA = A; best = poly; }
      }
      return tag(best);
    };
    const outer = mapLoop(loops.outer);
    const holes = loops.inner.map(mapLoop);
    uvLoops = [outer, ...holes];
    // Untrimmed: the outer loop runs along the domain boundary only (seams of
    // closed surfaces included), or covers the whole domain.
    const eu = PU * 2e-3, ev = PV * 2e-3;
    const near = (x, a, e, P, closed) => Math.abs(x - a) < e || (closed && (Math.abs(x - a - P) < e || Math.abs(x - a + P) < e));
    const onBorder = ([u, v]) => near(u, du[0], eu, PU, closedU) || near(u, du[1], eu, PU, closedU) || near(v, dv[0], ev, PV, closedV) || near(v, dv[1], ev, PV, closedV);
    const area = polyArea(outer);
    const outerFull = (outer.every(onBorder) && area >= 0.5 * PU * PV) || area >= 0.97 * PU * PV;
    if (!outerFull || holes.length) {
      grid = sample(res(0, true), res(1, true)) || grid;
      const shifts = [];
      for (const su of closedU ? [0, PU, -PU] : [0]) for (const sv of closedV ? [0, PV, -PV] : [0]) shifts.push([su, sv]);
      const within = (poly, u, v) => shifts.some(([a, b]) => pointInPoly(u + a, v + b, poly));
      keep = (i, j) => {
        const u = (grid.U(i) + grid.U(i + 1)) / 2, v = (grid.V(j) + grid.V(j + 1)) / 2;
        return (outerFull || within(outer, u, v)) && !holes.some((h) => within(h, u, v));
      };
    }
  }
  const { nu, nv } = grid;
  const rev = !!safe(() => face.orientationIsReversed, false);
  const tris = [];
  const id = (i, j) => j * (nu + 1) + i;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    if (keep && !keep(i, j)) continue;
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
    if (rev) tris.push([a, c, b], [a, d, c]); else tris.push([a, b, c], [a, c, d]);
  }
  // A face narrower than the grid (a fillet strip, a small trimmed patch):
  // triangulate its loops in parameter space, with the exact 3D loop points.
  if (tris.length < 12 && uvLoops) {
    const [o, ...hs] = uvLoops;
    const V2 = (l) => l.map(([u, v]) => new Vector2(u, v));
    const tri = safe(() => ShapeUtils.triangulateShape(V2(o), hs.map(V2)), []);
    if (tri.length) {
      const pts3 = [o.xyz, ...hs.map((h) => h.xyz)].flat();
      const flat2 = [o, ...hs].flat();
      const sign = rev ? -1 : 1;
      const oriented = tri.map(([a, b, c]) => {
        const A = flat2[a], B = flat2[b], C = flat2[c];
        const ccw = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) > 0;
        return ccw === (sign > 0) ? [a, b, c] : [a, c, b];
      });
      pushTriangles(out, pts3, oriented);
      return true;
    }
  }
  if (!tris.length) return false;
  pushTriangles(out, grid.pts, tris);
  return true;
}

// ---------------------------------------------------------------- reader

export function extract3dm(rh, bytes, { mode = "model" } = {}) {
  const plan = mode === "plan";
  const doc = rh.File3dm.fromByteArray(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (!doc) throw new Error("The file is not a Rhino .3dm model, or it is damaged.");
  const warnings = [];
  const counts = {};
  const skipped = {};
  const skip = (what, n = 1) => { skipped[what] = (skipped[what] || 0) + n; };
  let approxFaces = 0;
  let subds = 0;
  let planarFaces = 0;

  // Units.
  const us = safe(() => doc.settings().modelUnitSystem);
  const unitSystem = enumName(rh.UnitSystem, us) || "None";
  const metresPerUnit = UNIT_METRES[unitSystem] || null;

  // Layers, effective visibility through the parent chain.
  const layerTable = doc.layers();
  const layers = [];
  const byId = new Map();
  for (let i = 0; i < layerTable.count; i++) {
    const l = layerTable.get(i);
    const rec = {
      index: safe(() => l.index, i), name: safe(() => l.name, `Layer ${i}`) || `Layer ${i}`, path: safe(() => l.fullPath, "") || safe(() => l.name, `Layer ${i}`),
      color: colorHex(safe(() => l.color)), rgb: safe(() => l.color), ownVisible: safe(() => l.visible, true) !== false,
      parent: safe(() => l.parentLayerId, ""), id: safe(() => l.id, ""), material: safe(() => l.renderMaterialIndex, -1),
    };
    layers.push(rec);
    byId.set(rec.id, rec);
  }
  for (const l of layers) {
    let vis = l.ownVisible, p = byId.get(l.parent), guard = 0;
    while (vis && p && guard++ < 64) { vis = p.ownVisible; p = byId.get(p.parent); }
    l.visible = vis;
  }
  const layerAt = (i) => layers.find((l) => l.index === i) || layers[i] || null;

  // Materials → display colour (PBR base colour shows as the preview colour).
  const matTable = doc.materials();
  const materials = [];
  for (let i = 0; i < matTable.count; i++) {
    const m = matTable.get(i);
    const pbr = safe(() => m.physicallyBased().supported, false);
    const c = pbr ? safe(() => m.previewColor) : safe(() => m.diffuseColor);
    const tr = safe(() => m.transparency, 0);
    materials.push({ name: safe(() => m.name, "") || "", rgb: c, opacity: Number.isFinite(tr) ? Math.max(0.05, 1 - tr) : 1 });
  }

  // Text height for annotations without their own style: the first dim style.
  const dims = safe(() => doc.dimstyles());
  const dimHeights = new Map();
  let defaultTextHeight = 0;
  for (let i = 0; dims && i < safe(() => dims.count, 0); i++) {
    const d = safe(() => dims.get(i));
    const h = d ? safe(() => d.textHeight, 0) * (safe(() => d.dimScale, 1) || 1) : 0;
    if (d && h > 0) { dimHeights.set(safe(() => d.id, ""), h); if (!defaultTextHeight) defaultTextHeight = h; }
  }

  const objects = doc.objects();
  const byObjectId = (id) => safe(() => objects.findId(id));
  const idefs = doc.instanceDefinitions();

  // Output accumulators.
  const meshGroups = new Map(); // key → { layer, rgb, opacity, name, positions, normals, index }
  const curves = [];
  const points = [];
  const texts = [];
  const usedLayers = new Set();

  const meshTarget = (layer, rgb, opacity, matName) => {
    const key = `${layer ? layer.index : -1}|${rgb ? `${rgb.r},${rgb.g},${rgb.b}` : "-"}|${opacity}`;
    let g = meshGroups.get(key);
    if (!g) {
      g = { layer: layer ? layer.index : -1, name: layer ? layer.path : "", material: matName || "", rgb, opacity, positions: [], normals: [], index: [], hasNormals: true };
      meshGroups.set(key, g);
    }
    return g;
  };
  const addMesh = (g, arrays, m) => {
    const base = g.positions.length / 3;
    const n = arrays.positions.length / 3;
    const flip = det3(m) < 0;
    for (let i = 0; i < n; i++) {
      const p = apply(m, [arrays.positions[i * 3], arrays.positions[i * 3 + 1], arrays.positions[i * 3 + 2]]);
      g.positions.push(p[0], p[1], p[2]);
    }
    if (arrays.normals && g.hasNormals) {
      for (let i = 0; i < n; i++) {
        const v = applyVec(m, [arrays.normals[i * 3], arrays.normals[i * 3 + 1], arrays.normals[i * 3 + 2]]);
        const L = Math.hypot(v[0], v[1], v[2]) || 1;
        const s = flip ? -1 : 1;
        g.normals.push((s * v[0]) / L, (s * v[1]) / L, (s * v[2]) / L);
      }
    } else if (g.hasNormals) { g.hasNormals = false; g.normals = []; }
    const idx = arrays.index;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      if (flip) g.index.push(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
      else g.index.push(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
    }
  };

  const addCurve = (rec, curve, m, edge = false) => {
    const pts = curvePoints(rh, curve).map((p) => apply(m, p));
    if (pts.length < 2) return;
    const c = { layer: rec.layer ? rec.layer.index : -1, color: rec.hex, pts, closed: !!safe(() => curve.isClosed(), false) && pts.length > 2 };
    if (c.closed && dist2(pts[0], pts[pts.length - 1]) < 1e-18) pts.pop();
    if (edge) c.edge = true;
    const a = arcInfo(rh, curve);
    if (a && isRigidish(m)) {
      const sg = det3(m) < 0 ? -1 : 1; // a mirror reverses the turning sense
      c.arc = { c: apply(m, a.c), r: a.r * scaleOf(m), n: applyVec(m, a.n).map((v) => v * sg), full: a.full, p0: a.p0 ? apply(m, a.p0) : null, p1: a.p1 ? apply(m, a.p1) : null };
    }
    curves.push(c);
    if (rec.layer) usedLayers.add(rec.layer.index);
  };

  // Brep: render meshes, else tessellation; plan: its edges.
  const doBrep = (rec, brep, m) => {
    if (plan) {
      const edges = brep.edges();
      for (let i = 0; i < safe(() => edges.count, 0); i++) { const e = safe(() => edges.get(i)); if (e) addCurve(rec, e, m, true); }
      return;
    }
    const faces = brep.faces();
    const g = meshTarget(rec.layer, rec.rgb, rec.opacity, rec.matName);
    for (let i = 0; i < safe(() => faces.count, 0); i++) {
      const face = safe(() => faces.get(i));
      if (!face) continue;
      const rm = safe(() => face.getMesh(rh.MeshType.Any));
      const arrays = rm ? meshArrays(rm) : null;
      if (arrays) { addMesh(g, arrays, m); continue; }
      const out = { positions: [], index: [] };
      const loops = faceLoops(rh, brep, face);
      let ok = false;
      if (loops.outer && safe(() => isFlat(face, loops.outer), false)) ok = safe(() => planarFace(face, loops, out), false);
      if (ok) planarFaces++;
      else { out.positions = []; out.index = []; ok = safe(() => gridFace(face, loops, out), false); if (ok) approxFaces++; }
      if (ok) addMesh(g, { positions: out.positions, normals: null, index: out.index }, m);
      else skip("faces that could not be tessellated");
    }
  };

  // Resolved drawing style of an object (colour, material, layer).
  const styleOf = (attrs, parent) => {
    const layer = layerAt(safe(() => attrs.layerIndex, 0)) || (parent && parent.layer) || null;
    const cs = safe(() => attrs.colorSource);
    let rgb;
    if (enumIs(cs, rh.ObjectColorSource.ColorFromObject)) rgb = safe(() => attrs.objectColor);
    else if (enumIs(cs, rh.ObjectColorSource.ColorFromParent) && parent) rgb = parent.rgb;
    let mat = null;
    const ms = safe(() => attrs.materialSource);
    if (enumIs(ms, rh.ObjectMaterialSource.MaterialFromObject)) mat = materials[safe(() => attrs.materialIndex, -1)] || null;
    else if (enumIs(ms, rh.ObjectMaterialSource.MaterialFromParent) && parent) mat = parent.mat;
    else if (layer && layer.material >= 0) mat = materials[layer.material] || null;
    if (enumIs(cs, rh.ObjectColorSource.ColorFromMaterial)) rgb = mat ? mat.rgb : null;
    if (!rgb) rgb = layer ? layer.rgb : null;
    // Shaded colour: the material's when one is assigned, else the display colour.
    // A black display colour without material (Rhino's default) shades light grey.
    const shade = mat && mat.rgb ? mat.rgb : isBlack(rgb) ? SHADE_GREY : rgb;
    return { layer, rgb, mat, hex: colorHex(rgb), shadeRgb: shade, opacity: mat ? mat.opacity : 1, matName: mat ? mat.name : "" };
  };

  const visit = (obj, m, parent, depth) => {
    const attrs = safe(() => obj.attributes());
    const geo = safe(() => obj.geometry());
    if (!attrs || !geo) return;
    if (safe(() => attrs.visible, true) === false) { skip("hidden objects"); return; }
    if (rh.ActiveSpace && enumIs(safe(() => attrs.activeSpace), rh.ActiveSpace.PageSpace)) { skip("objects in layouts"); return; }
    const st = styleOf(attrs, parent);
    if (st.layer && !st.layer.visible && !plan) { skip("objects on hidden layers"); return; }
    const type = geo.constructor && geo.constructor.name ? geo.constructor.name : "Geometry";
    counts[type] = (counts[type] || 0) + 1;
    const rec = { layer: st.layer, rgb: st.shadeRgb, hex: st.hex, opacity: st.opacity, matName: st.matName };

    if (geo instanceof rh.InstanceReference) {
      if (depth >= MAX_DEPTH) { skip("blocks nested too deeply"); return; }
      const def = safe(() => idefs.findId(geo.parentIdefId));
      const ids = def ? safe(() => def.getObjectIds(), []) : [];
      const xf = safe(() => geo.xform.toFloatArray(true));
      const mm = xf && xf.length === 16 ? mul(m, Array.from(xf)) : m;
      const parentStyle = { layer: st.layer, rgb: st.rgb, mat: st.mat };
      for (const id of ids || []) { const child = byObjectId(id); if (child) visit(child, mm, parentStyle, depth + 1); }
      return;
    }
    if (geo instanceof rh.Mesh) {
      if (plan) { const a = meshArrays(geo); if (a) meshEdgesForPlan(rec, a, m); return; }
      const a = meshArrays(geo);
      if (a) addMesh(meshTarget(st.layer, rec.rgb, rec.opacity, rec.matName), a, m);
      return;
    }
    if (geo instanceof rh.Brep) return doBrep(rec, geo, m);
    if (geo instanceof rh.Extrusion) {
      if (!plan) {
        const rm = safe(() => geo.getMesh(rh.MeshType.Any));
        const a = rm ? meshArrays(rm) : null;
        if (a) { addMesh(meshTarget(st.layer, rec.rgb, rec.opacity, rec.matName), a, m); return; }
      }
      const b = safe(() => geo.toBrep(true));
      if (b) doBrep(rec, b, m); else skip("extrusions that could not be read");
      return;
    }
    if (geo instanceof rh.SubD) {
      safe(() => geo.subdivide(plan ? 1 : 3));
      const mesh = safe(() => rh.Mesh.createFromSubDControlNet(geo, false));
      const a = mesh ? meshArrays(mesh) : null;
      if (!a) { skip("SubD objects that could not be meshed"); return; }
      if (plan) meshEdgesForPlan(rec, a, m);
      else { addMesh(meshTarget(st.layer, rec.rgb, rec.opacity, rec.matName), a, m); subds++; }
      return;
    }
    if (geo instanceof rh.Surface) {
      const b = safe(() => rh.Brep.createFromSurface(geo));
      if (b) doBrep(rec, b, m); else skip("surfaces that could not be read");
      return;
    }
    if (geo instanceof rh.Curve) {
      if (plan) addCurve(rec, geo, m); else skip("curves (import as a plan drawing to get them)");
      return;
    }
    if (geo instanceof rh.Point) {
      if (plan) { const p = safe(() => geo.location); if (finite3(p)) { points.push({ layer: st.layer ? st.layer.index : -1, color: st.hex, p: apply(m, p) }); if (st.layer) usedLayers.add(st.layer.index); } }
      else skip("points");
      return;
    }
    if (geo instanceof rh.TextDot || geo instanceof rh.Text) {
      if (!plan) { skip("texts and text dots"); return; }
      let p, text, height, xAxis = [1, 0, 0];
      if (geo instanceof rh.TextDot) { p = safe(() => geo.point); text = safe(() => geo.text, ""); height = defaultTextHeight; }
      else {
        const pl = safe(() => geo.plane);
        p = pl && pl.origin; xAxis = (pl && pl.xAxis) || xAxis;
        text = safe(() => geo.plainText, "") || "";
        height = dimHeights.get(safe(() => geo.dimensionStyleId, "")) || defaultTextHeight;
      }
      if (finite3(p) && String(text).trim()) {
        texts.push({ layer: st.layer ? st.layer.index : -1, color: st.hex, p: apply(m, p), x: applyVec(m, xAxis), text: String(text), height: (height || 0) * scaleOf(m), dot: geo instanceof rh.TextDot });
        if (st.layer) usedLayers.add(st.layer.index);
      }
      return;
    }
    if (geo instanceof rh.Light) { skip("lights"); return; }
    if (geo instanceof rh.PointCloud) { skip("point clouds"); return; }
    if (geo instanceof rh.Hatch) { skip("hatches"); return; }
    if (rh.AnnotationBase && geo instanceof rh.AnnotationBase) { skip("dimensions and leaders"); return; }
    skip(`other objects (${type})`);
  };

  // Plan mode: a mesh contributes its creases, open edges and top-view
  // silhouette (edges between an upward and a downward facing triangle).
  const meshEdgesForPlan = (rec, a, m) => {
    const P = [];
    for (let i = 0; i < a.positions.length; i += 3) P.push(apply(m, [a.positions[i], a.positions[i + 1], a.positions[i + 2]]));
    // Weld coincident vertices.
    const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
    const weld = new Map(), W = [];
    const wi = P.map((p) => { const k = key(p); let v = weld.get(k); if (v === undefined) { v = W.length; W.push(p); weld.set(k, v); } return v; });
    const normals = [];
    const edgeFaces = new Map();
    for (let t = 0; t + 2 < a.index.length; t += 3) {
      const i0 = wi[a.index[t]], i1 = wi[a.index[t + 1]], i2 = wi[a.index[t + 2]];
      if (i0 === i1 || i1 === i2 || i0 === i2) continue;
      const n = cross(sub(W[i1], W[i0]), sub(W[i2], W[i0]));
      const L = Math.hypot(...n);
      if (!(L > 0)) continue;
      const f = normals.length;
      normals.push([n[0] / L, n[1] / L, n[2] / L]);
      for (const [x, y] of [[i0, i1], [i1, i2], [i2, i0]]) {
        const k = x < y ? `${x}_${y}` : `${y}_${x}`;
        const list = edgeFaces.get(k);
        if (list) list.push(f); else edgeFaces.set(k, [f]);
      }
    }
    const segs = [];
    const COS = Math.cos((30 * Math.PI) / 180);
    for (const [k, fs] of edgeFaces) {
      let take = fs.length !== 2;
      if (!take) {
        const n1 = normals[fs[0]], n2 = normals[fs[1]];
        take = dot(n1, n2) < COS || (n1[2] > 1e-3 && n2[2] < -1e-3) || (n1[2] < -1e-3 && n2[2] > 1e-3);
      }
      if (take) { const [x, y] = k.split("_").map(Number); segs.push([W[x], W[y]]); }
    }
    for (const pts of chainSegments(segs)) {
      curves.push({ layer: rec.layer ? rec.layer.index : -1, color: rec.hex, pts, closed: false, edge: true });
    }
    if (rec.layer) usedLayers.add(rec.layer.index);
  };

  for (let i = 0; i < objects.count; i++) {
    const obj = objects.get(i);
    const attrs = safe(() => obj.attributes());
    if (attrs && safe(() => attrs.isInstanceDefinitionObject, false)) continue;
    visit(obj, IDENTITY, null, 0);
  }

  const toRgb01 = (c) => (c ? [c.r / 255, c.g / 255, c.b / 255] : [0.8, 0.8, 0.8]);
  const meshes = [];
  for (const g of meshGroups.values()) {
    if (!g.index.length) continue;
    meshes.push({
      layer: g.layer, name: g.name, material: g.material, color: toRgb01(g.rgb), opacity: g.opacity,
      positions: Float64Array.from(g.positions), normals: g.hasNormals && g.normals.length === g.positions.length ? Float32Array.from(g.normals) : null,
      index: Uint32Array.from(g.index),
    });
    if (g.layer >= 0) usedLayers.add(g.layer);
  }
  if (approxFaces) warnings.push(`${approxFaces} curved surface(s) had no render mesh saved in the file and were tessellated approximately${planarFaces ? ` (${planarFaces} flat one(s) exactly)` : ""}; save the file in Rhino with render meshes for Rhino's own tessellation.`);
  if (subds) warnings.push(`${subds} SubD object(s) were meshed from their subdivided control net (close to, not exactly, Rhino's limit surface).`);
  for (const [what, n] of Object.entries(skipped)) warnings.push(`${n} ${what} skipped.`);

  const outLayers = layers.map((l) => ({ index: l.index, name: l.name, path: l.path, color: l.color, visible: l.visible, used: usedLayers.has(l.index) }));
  safe(() => doc.delete());
  return { unitSystem, unit: UNIT_SHORT[unitSystem] || null, metresPerUnit, layers: outLayers, meshes, curves, points, texts, counts, warnings };
}

function scaleOf(m) { return Math.cbrt(Math.abs(det3(m))) || 1; }
function isRigidish(m) {
  const s = scaleOf(m);
  const c0 = [m[0], m[4], m[8]], c1 = [m[1], m[5], m[9]];
  return Math.abs(Math.hypot(...c0) - s) < 1e-6 * s && Math.abs(Math.hypot(...c1) - s) < 1e-6 * s && Math.abs(dot(c0, c1)) < 1e-6 * s * s;
}

// Join 2-point segments into polylines at shared end points.
export function chainSegments(segs) {
  const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
  const at = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); const l = at.get(k); if (l) l.push(i); else at.set(k, [i]); } });
  const used = new Uint8Array(segs.length);
  const out = [];
  const extend = (line) => {
    for (;;) {
      const end = line[line.length - 1];
      const next = (at.get(key(end)) || []).find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const s = segs[next];
      line.push(key(s[0]) === key(end) ? s[1] : s[0]);
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    extend(line);
    line.reverse();
    extend(line);
    out.push(line);
  }
  return out;
}

// For the unit tests.
export const _internal = { faceLoops, planarFace, gridFace, isFlat };
