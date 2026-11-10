// IFC (BIM: Revit, ArchiCAD, Vectorworks, FreeCAD, Allplan …) → a building (plan-building.js).
// The STEP file is read and its shapes are made by web-ifc (MPL-2.0, WebAssembly), passed in
// so the app can load it lazily (with its .wasm as a local file) and the tests in Node.
//
//   IfcBuildingStorey               → levels (elevation; height to the next storey)
//   IfcWall / IfcWallStandardCase   → walls: the footprint of the wall's shape (smallest rectangle
//                                     round it) gives the centre line and the thickness, its height
//                                     the wall height; wall ends are then joined at the centre lines
//   IfcDoor / IfcWindow             → openings in their host wall (IfcRelFillsElement → opening →
//                                     IfcRelVoidsElement → wall), sized by the opening, overall size
//                                     or shape; the operation type picks the library door
//   IfcSpace                        → rooms (outline = the bottom of the space's shape, LongName)
//   IfcStair                        → the library stairs (width, rise, going, climbing direction)
//   IfcFurnishingElement (Furniture)→ library items by name and size, else their own shape
// Model units (mm, m, ft …) come from IfcUnitAssignment; shapes come in metres, Y up, plan z = −IFC y.
import { stairsItem } from './plan-building.js';

export const isIfcName = (name) => /\.ifc$/i.test(name ?? '');

/** True when the bytes start like an IFC STEP file. */
export function isIfc(bytes) {
  const head = new TextDecoder('latin1').decode((bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).subarray(0, 4096));
  return /ISO-10303-21/.test(head) && /FILE_SCHEMA\s*\(\s*\(\s*'IFC/i.test(head);
}

const value = (x) => (x == null ? null : typeof x !== 'object' ? x : x.value ?? x._representationValue ?? (x._internalValue != null ? Number(x._internalValue) : null));
const text = (x) => { const v = value(x); return v == null ? '' : String(v); };
const handle = (x) => (x && typeof x === 'object' ? x.value ?? null : x ?? null);
/** A name people read, not an id (GUIDs, "ACID0000…"): '' for those. */
const readable = (s) => (/^(ACID[0-9A-F-]{8,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{20,}|[0-9A-Za-z_$]{22})$/i.test(s.trim()) ? '' : s.trim());

// ───────────────────────── 2D helpers

function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = []; for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 1e-12) lower.pop(); lower.push(p); }
  const upper = []; for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 1e-12) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Smallest rectangle round points: { center, u (unit, along the long side), length, width }. */
export function minAreaRect(points) {
  const hull = convexHull(points);
  if (hull.length < 2) return null;
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i]; const q = hull[(i + 1) % hull.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1e-9) continue;
    const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; const n = [-u[1], u[0]];
    let s0 = Infinity; let s1 = -Infinity; let t0 = Infinity; let t1 = -Infinity;
    for (const h of hull) { const s = h[0] * u[0] + h[1] * u[1]; const t = h[0] * n[0] + h[1] * n[1]; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const area = (s1 - s0) * (t1 - t0);
    if (!best || area < best.area - 1e-12) best = { area, u, n, s0, s1, t0, t1 };
  }
  if (!best) return null;
  const { u, n, s0, s1, t0, t1 } = best;
  const cs = (s0 + s1) / 2; const ct = (t0 + t1) / 2;
  const center = [u[0] * cs + n[0] * ct, u[1] * cs + n[1] * ct];
  return s1 - s0 >= t1 - t0 ? { center, u, length: s1 - s0, width: t1 - t0 } : { center, u: n, length: t1 - t0, width: s1 - s0 };
}

/** Outline of a shape seen from below: the edges of its downward faces at the lowest height, chained (largest loop). */
export function bottomOutline(parts) {
  let y0 = Infinity;
  for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) y0 = Math.min(y0, p.positions[i]);
  const edges = new Map();
  const key = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
  const pts = new Map();
  for (const p of parts) {
    const P = p.positions; const I = p.indices;
    for (let t = 0; t < I.length; t += 3) {
      const ids = [I[t], I[t + 1], I[t + 2]];
      if (ids.some((k) => Math.abs(P[k * 3 + 1] - y0) > 0.01)) continue;
      const k = ids.map((i) => { const kk = key(P[i * 3], P[i * 3 + 2]); pts.set(kk, [P[i * 3], P[i * 3 + 2]]); return kk; });
      for (let e = 0; e < 3; e++) {
        const a = k[e]; const b = k[(e + 1) % 3];
        if (a === b) continue;
        const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(ek, (edges.get(ek) ?? 0) + 1);
      }
    }
  }
  const next = new Map();
  for (const [ek, count] of edges) {
    if (count !== 1) continue;
    const [a, b] = ek.split('|');
    if (!next.has(a)) next.set(a, []);
    if (!next.has(b)) next.set(b, []);
    next.get(a).push(b); next.get(b).push(a);
  }
  const loops = [];
  const used = new Set();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop = [start]; used.add(start);
    let prev = null; let cur = start;
    for (;;) {
      const options = (next.get(cur) ?? []).filter((x) => x !== prev);
      const nxt = options.find((x) => !used.has(x)) ?? (options.includes(start) ? start : null);
      if (!nxt || nxt === start) break;
      loop.push(nxt); used.add(nxt); prev = cur; cur = nxt;
    }
    if (loop.length >= 3) loops.push(loop.map((k) => pts.get(k)));
  }
  const area = (poly) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const best = loops.sort((a, b) => area(b) - area(a))[0];
  if (!best) return null;
  // Points in the middle of straight runs dropped.
  return best.filter((p, i) => { const a = best[(i - 1 + best.length) % best.length]; const b = best[(i + 1) % best.length]; return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-6; });
}

/**
 * Wall ends moved onto the centre line of the wall they meet (corners, T-junctions), like a drawn plan: an end
 * within the other wall's thickness (plus half its own) is put on the crossing of the two centre lines.
 */
export function joinWallEnds(walls) {
  const lineCross = (p, d, q, e) => { const den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-6) return null; const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den; return [p[0] + d[0] * t, p[1] + d[1] * t]; };
  for (const w of walls) {
    if (w.arc) continue;
    for (const end of ['a', 'b']) {
      const p = w[end]; const other = end === 'a' ? w.b : w.a;
      const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
      let best = null;
      for (const v of walls) {
        if (v === w || v.arc || v.level !== w.level) continue;
        const e = [v.b[0] - v.a[0], v.b[1] - v.a[1]];
        const X = lineCross(w.a, d, v.a, e);
        if (!X) continue;
        const Lv = Math.hypot(e[0], e[1]);
        const t = ((X[0] - v.a[0]) * e[0] + (X[1] - v.a[1]) * e[1]) / (Lv * Lv);
        if (t < -0.02 - v.thickness / Lv || t > 1.02 + v.thickness / Lv) continue;
        const move = Math.hypot(X[0] - p[0], X[1] - p[1]);
        // Only short moves along the wall, never past its other end.
        if (move > v.thickness / 2 + w.thickness / 2 + 0.05) continue;
        if (Math.hypot(X[0] - other[0], X[1] - other[1]) < 0.1) continue;
        if (!best || move < best.move) best = { X, move };
      }
      if (best) w[end] = best.X;
    }
  }
  return walls;
}

// ───────────────────────── reading

/**
 * Reads an IFC file with web-ifc: `WebIFC` = the module (type codes), `api` = an initialised IfcAPI.
 * Returns { building, meshes: Map(key → [{ positions, normals, indices, color }]) (object-local metres, for the
 * furniture without a library item), schema, counts }.
 */
export function readIfc(WebIFC, api, bytes, { onProgress = null } = {}) {
  const model = api.OpenModel(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 24 });
  try {
    return readModel(WebIFC, api, model, onProgress);
  } finally {
    api.CloseModel(model);
  }
}

function readModel(W, api, model, onProgress) {
  const ids = (type) => { if (type == null) return []; const v = api.GetLineIDsWithType(model, type, true); const out = []; for (let i = 0; i < v.size(); i++) out.push(v.get(i)); return out; };
  const line = (id) => { if (id == null) return null; try { return api.GetLine(model, id, false); } catch { return null; } };
  const schema = api.GetModelSchema?.(model) ?? '';
  const warnings = [];

  // Length unit of the attributes (shapes come in metres already).
  let unit = 1;
  const PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 100, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 0.001, MICRO: 1e-6 };
  for (const pid of ids(W.IFCPROJECT)) {
    const p = line(pid);
    const ua = line(handle(p?.UnitsInContext));
    for (const u of ua?.Units ?? []) {
      const ul = line(handle(u));
      if (text(ul?.UnitType) !== 'LENGTHUNIT') continue;
      if (ul.type === W.IFCSIUNIT) unit = PREFIX[text(ul.Prefix)] ?? 1;
      else {
        const name = text(ul.Name).toUpperCase();
        unit = /FOOT|FEET/.test(name) ? 0.3048 : /INCH/.test(name) ? 0.0254 : /YARD/.test(name) ? 0.9144 : unit;
      }
    }
  }

  // Shapes (world metres, Y up).
  const meshOf = (id) => {
    const parts = [];
    let flat;
    try { flat = api.GetFlatMesh(model, id); } catch { return parts; }
    for (let i = 0; i < flat.geometries.size(); i++) {
      const g = flat.geometries.get(i);
      const geo = api.GetGeometry(model, g.geometryExpressID);
      const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
      const ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
      const m = g.flatTransformation;
      const n = v.length / 6;
      const positions = new Float32Array(n * 3); const normals = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        const x = v[k * 6]; const y = v[k * 6 + 1]; const z = v[k * 6 + 2];
        positions[k * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
        positions[k * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        positions[k * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        const nx = v[k * 6 + 3]; const ny = v[k * 6 + 4]; const nz = v[k * 6 + 5];
        const wx = m[0] * nx + m[4] * ny + m[8] * nz; const wy = m[1] * nx + m[5] * ny + m[9] * nz; const wz = m[2] * nx + m[6] * ny + m[10] * nz;
        const L = Math.hypot(wx, wy, wz) || 1;
        normals[k * 3] = wx / L; normals[k * 3 + 1] = wy / L; normals[k * 3 + 2] = wz / L;
      }
      parts.push({ positions, normals, indices: Uint32Array.from(ix), color: [g.color.x, g.color.y, g.color.z, g.color.w] });
      geo.delete?.();
    }
    flat.delete?.();
    return parts;
  };
  const extent = (parts) => {
    const xz = []; let y0 = Infinity; let y1 = -Infinity;
    for (const p of parts) for (let k = 0; k < p.positions.length; k += 3) { xz.push([p.positions[k], p.positions[k + 2]]); y0 = Math.min(y0, p.positions[k + 1]); y1 = Math.max(y1, p.positions[k + 1]); }
    return { xz, y0, y1 };
  };
  // The element's own x axis on the plan (IFC placements: x = IFC x, z = −IFC y).
  const placementX = (id) => {
    let pl = line(handle(line(id)?.ObjectPlacement));
    let R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let depth = 0; pl && depth < 32; depth++) {
      const ap = line(handle(pl.RelativePlacement));
      const zv = ap?.Axis ? line(handle(ap.Axis))?.DirectionRatios?.map(value) : null;
      const xv = ap?.RefDirection ? line(handle(ap.RefDirection))?.DirectionRatios?.map(value) : null;
      const Z = norm3(zv ?? [0, 0, 1]); let X = xv ? norm3(xv) : [1, 0, 0];
      const dz = X[0] * Z[0] + X[1] * Z[1] + X[2] * Z[2]; X = norm3([X[0] - Z[0] * dz, X[1] - Z[1] * dz, X[2] - Z[2] * dz]);
      const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
      const local = [[X[0], Y[0], Z[0]], [X[1], Y[1], Z[1]], [X[2], Y[2], Z[2]]];
      R = mul3(local, R);
      pl = line(handle(pl.PlacementRelTo));
    }
    return [R[0][0], -R[1][0]];
  };

  // Storeys and what they hold.
  // Storeys are named by Name ("Erdgeschoss", "Level 1"); some programs put an id into LongName (ArchiCAD: "ACID…").
  const storeys = ids(W.IFCBUILDINGSTOREY).map((id) => { const s = line(id); return { id, key: `st${id}`, name: readable(text(s?.Name)) || readable(text(s?.LongName)), elevation: (value(s?.Elevation) ?? 0) * unit }; });
  const storeyOf = new Map();
  for (const rid of ids(W.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const r = line(rid); const s = handle(r?.RelatingStructure);
    for (const e of r?.RelatedElements ?? []) storeyOf.set(handle(e), s);
  }
  const parts = new Map(); // aggregate → its parts
  for (const rid of ids(W.IFCRELAGGREGATES)) {
    const r = line(rid); const whole = handle(r?.RelatingObject);
    for (const e of r?.RelatedObjects ?? []) { storeyOf.set(handle(e), storeyOf.get(handle(e)) ?? whole); if (!parts.has(whole)) parts.set(whole, []); parts.get(whole).push(handle(e)); }
  }
  // Storeys without a usable elevation: from what stands on them.
  const storeyById = new Map(storeys.map((s) => [s.id, s]));
  const nearestStorey = (y) => [...storeys].sort((a, b) => a.elevation - b.elevation).reduce((best, s) => (s.elevation <= y + 0.05 ? s : best), storeys[0]);
  const levelKeyOf = (id, y0) => { let s = storeyOf.get(id); for (let i = 0; i < 4 && s != null && !storeyById.has(s); i++) s = storeyOf.get(s); return (storeyById.get(s) ?? (storeys.length ? nearestStorey(y0) : null))?.key ?? '_'; };

  const building = { format: 'ifc', name: '', levels: [], walls: [], openings: [], rooms: [], objects: [], warnings };
  const meshes = new Map();
  const counts = { walls: 0, complexWalls: 0, doors: 0, windows: 0, spaces: 0, stairs: 0, furniture: 0, slabs: ids(W.IFCSLAB).length };
  const levelElevation = (key) => storeys.find((s) => s.key === key)?.elevation ?? 0;

  // Walls
  const wallIds = [...new Set([...ids(W.IFCWALL), ...ids(W.IFCWALLSTANDARDCASE), ...ids(W.IFCWALLELEMENTEDCASE)])];
  const wallByIfc = new Map();
  const tops = new Map();
  wallIds.forEach((id, i) => {
    onProgress?.(0.1 + (0.5 * i) / Math.max(1, wallIds.length));
    const shape = meshOf(id);
    const { xz, y0, y1 } = extent(shape);
    const rect = xz.length >= 3 ? minAreaRect(xz) : null;
    if (!rect || rect.length < 0.05) return;
    if (rect.width > 0.9 && rect.width > rect.length * 0.25) { counts.complexWalls += 1; return; } // curved / L-shaped: not one straight wall
    const level = levelKeyOf(id, y0);
    const a = [rect.center[0] - (rect.u[0] * rect.length) / 2, rect.center[1] - (rect.u[1] * rect.length) / 2];
    const b = [rect.center[0] + (rect.u[0] * rect.length) / 2, rect.center[1] + (rect.u[1] * rect.length) / 2];
    const wall = { key: `w${id}`, level, a, b, thickness: Math.max(0.02, rect.width), height: y1 - levelElevation(level) };
    building.walls.push(wall);
    wallByIfc.set(id, wall);
    tops.set(level, Math.max(tops.get(level) ?? -Infinity, y1));
    counts.walls += 1;
  });
  for (const key of new Set(building.walls.map((w) => w.level))) joinWallEnds(building.walls.filter((w) => w.level === key));

  // Levels: storeys with their height up to the next one.
  const sorted = [...storeys].sort((a, b) => a.elevation - b.elevation);
  building.levels = sorted.map((s, i) => {
    const next = sorted[i + 1];
    // Up to the walls' tops (the slab above is not part of the level), at most to the next storey.
    const top = tops.has(s.key) ? tops.get(s.key) - s.elevation : null;
    const height = next ? Math.min(next.elevation - s.elevation, top ?? Infinity) : Math.max(2.1, top ?? 2.7);
    return { key: s.key, name: s.name || `${i + 1}F`, elevation: s.elevation, height: Math.round(height * 1000) / 1000 };
  });
  // Walls as tall as their level: no own height.
  for (const w of building.walls) { const l = building.levels.find((x) => x.key === w.level); if (l && Math.abs(w.height - l.height) < 0.02) w.height = null; }

  // Doors and windows in their host walls.
  const openingOfFill = new Map(); const wallOfOpening = new Map();
  for (const rid of ids(W.IFCRELFILLSELEMENT)) { const r = line(rid); openingOfFill.set(handle(r?.RelatedBuildingElement), handle(r?.RelatingOpeningElement)); }
  for (const rid of ids(W.IFCRELVOIDSELEMENT)) { const r = line(rid); wallOfOpening.set(handle(r?.RelatedOpeningElement), handle(r?.RelatingBuildingElement)); }
  const fills = [...new Set([...ids(W.IFCDOOR), ...ids(W.IFCDOORSTANDARDCASE)])].map((id) => ['door', id]).concat([...new Set([...ids(W.IFCWINDOW), ...ids(W.IFCWINDOWSTANDARDCASE)])].map((id) => ['window', id]));
  for (const [kind, id] of fills) {
    const el = line(id);
    const opening = openingOfFill.get(id);
    const hostWall = wallByIfc.get(wallOfOpening.get(opening));
    // The opening's void when it has a shape, else the door / window itself.
    let shape = opening != null ? meshOf(opening) : [];
    if (!shape.length) shape = meshOf(id);
    const { xz, y0, y1 } = extent(shape);
    if (!xz.length) continue;
    const level = hostWall?.level ?? levelKeyOf(id, y0);
    const elev = levelElevation(level);
    let u = hostWall ? [hostWall.b[0] - hostWall.a[0], hostWall.b[1] - hostWall.a[1]] : null;
    if (u) { const L = Math.hypot(u[0], u[1]); u = [u[0] / L, u[1] / L]; } else u = minAreaRect(xz)?.u ?? [1, 0];
    const along = xz.map((p) => p[0] * u[0] + p[1] * u[1]);
    const s0 = Math.min(...along); const s1 = Math.max(...along);
    const n = [-u[1], u[0]];
    const across = xz.map((p) => p[0] * n[0] + p[1] * n[1]);
    const mid = (s0 + s1) / 2; const midN = (Math.min(...across) + Math.max(...across)) / 2;
    const center = [u[0] * mid + n[0] * midN, u[1] * mid + n[1] * midN];
    const overallW = value(el?.OverallWidth) != null ? value(el.OverallWidth) * unit : null;
    const overallH = value(el?.OverallHeight) != null ? value(el.OverallHeight) * unit : null;
    const operation = text(el?.OperationType) || text(el?.PartitioningType) || text(el?.PredefinedType);
    const width = overallW && Math.abs(overallW - (s1 - s0)) < 0.3 ? overallW : s1 - s0;
    const height = overallH && Math.abs(overallH - (y1 - y0)) < 0.3 ? overallH : y1 - y0;
    building.openings.push({
      level, wall: hostWall?.key ?? null, kind, name: `${kind} ${text(el?.Name)} ${text(el?.ObjectType)} ${operation}`.replace(/_/g, ' ').trim(),
      center, width: Math.round(width * 1000) / 1000, height: Math.round(height * 1000) / 1000, sill: Math.max(0, Math.round((y0 - elev) * 1000) / 1000),
      ...(/RIGHT/.test(operation) ? { hinge: 'right' } : /LEFT/.test(operation) ? { hinge: 'left' } : {}),
    });
    counts[kind === 'door' ? 'doors' : 'windows'] += 1;
  }

  // Spaces → rooms
  for (const id of ids(W.IFCSPACE)) {
    const el = line(id);
    const shape = meshOf(id);
    if (!shape.length) continue;
    const outline = bottomOutline(shape);
    if (!outline || outline.length < 3) continue;
    const { y0 } = extent(shape);
    building.rooms.push({ level: levelKeyOf(id, y0), name: readable(text(el?.LongName)) || readable(text(el?.Name)), points: outline });
    counts.spaces += 1;
  }

  // Stairs (with their flights) → the library stairs
  const stairIds = ids(W.IFCSTAIR);
  const flightOwned = new Set(stairIds.flatMap((id) => parts.get(id) ?? []));
  for (const id of [...stairIds, ...ids(W.IFCSTAIRFLIGHT).filter((f) => !flightOwned.has(f))]) {
    const shape = [...meshOf(id), ...(parts.get(id) ?? []).flatMap((p) => meshOf(p))];
    const { xz, y0, y1 } = extent(shape);
    const rect = xz.length >= 3 ? minAreaRect(xz) : null;
    if (!rect || y1 - y0 < 0.3) continue;
    const level = levelKeyOf(id, y0);
    // Climbing direction: towards the high points.
    let hi = [0, 0]; let lo = [0, 0]; let nh = 0; let nl = 0;
    for (const p of shape) for (let k = 0; k < p.positions.length; k += 3) {
      const y = p.positions[k + 1];
      if (y > y0 + (y1 - y0) * 0.8) { hi[0] += p.positions[k]; hi[1] += p.positions[k + 2]; nh++; } else if (y < y0 + (y1 - y0) * 0.2) { lo[0] += p.positions[k]; lo[1] += p.positions[k + 2]; nl++; }
    }
    hi = nh ? [hi[0] / nh, hi[1] / nh] : rect.center; lo = nl ? [lo[0] / nl, lo[1] / nl] : rect.center;
    const s = (hi[0] - lo[0]) * rect.u[0] + (hi[1] - lo[1]) * rect.u[1] >= 0 ? 1 : -1;
    const dir = [rect.u[0] * s, rect.u[1] * s];
    const fit = stairsItem([rect.width, y1 - y0, rect.length]);
    building.objects.push({ level, name: text(line(id)?.Name) || 'Stair', hints: 'stairs', center: rect.center, elevation: Math.max(0, y0 - levelElevation(level)), rotation: Math.atan2(-dir[0], -dir[1]), size: [rect.width, y1 - y0, rect.length], ...fit });
    counts.stairs += 1;
  }

  // Furniture
  for (const id of ids(W.IFCFURNISHINGELEMENT)) {
    const el = line(id);
    const shape = meshOf(id);
    const { xz, y0, y1 } = extent(shape);
    if (!xz.length) continue;
    const level = levelKeyOf(id, y0);
    const [xx, xzDir] = placementX(id);
    const r = Math.atan2(-xzDir, xx);
    const ux = [Math.cos(r), -Math.sin(r)]; const uz = [Math.sin(r), Math.cos(r)];
    const a = xz.map((p) => p[0] * ux[0] + p[1] * ux[1]); const b = xz.map((p) => p[0] * uz[0] + p[1] * uz[1]);
    const a0 = Math.min(...a); const a1 = Math.max(...a); const b0 = Math.min(...b); const b1 = Math.max(...b);
    const ca = (a0 + a1) / 2; const cb = (b0 + b1) / 2;
    const center = [ux[0] * ca + uz[0] * cb, ux[1] * ca + uz[1] * cb];
    const key = `f${id}`;
    // The shape in the object's own frame (bottom centre at the origin, front +z), for an imported model.
    meshes.set(key, shape.map((p) => {
      const positions = new Float32Array(p.positions.length); const normals = new Float32Array(p.normals.length);
      for (let k = 0; k < p.positions.length; k += 3) {
        const dx = p.positions[k] - center[0]; const dz = p.positions[k + 2] - center[1];
        positions[k] = dx * ux[0] + dz * ux[1]; positions[k + 1] = p.positions[k + 1] - y0; positions[k + 2] = dx * uz[0] + dz * uz[1];
        const nx = p.normals[k]; const nz = p.normals[k + 2];
        normals[k] = nx * ux[0] + nz * ux[1]; normals[k + 1] = p.normals[k + 1]; normals[k + 2] = nx * uz[0] + nz * uz[1];
      }
      return { positions, normals, indices: p.indices, color: p.color };
    }));
    building.objects.push({ level, name: text(el?.Name), hints: `${text(el?.ObjectType)} ${text(el?.Description)} ${text(el?.PredefinedType)}`, center, elevation: Math.max(0, y0 - levelElevation(level)), rotation: r, size: [a1 - a0, y1 - y0, b1 - b0], model: key });
    counts.furniture += 1;
  }
  if (counts.complexWalls) warnings.push({ code: 'ifc-complex-walls', count: counts.complexWalls });
  onProgress?.(1);
  if (!building.levels.length) building.levels.push({ key: '_', name: '1F', elevation: 0, height: 2.7 });
  return { building, meshes, schema, unit, counts };
}

const norm3 = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
const mul3 = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
