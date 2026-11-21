// More drawing tools, on top of drawing.js:
//   sheets — a drawing holds several sheets ({ sheets: [{ id, name }], activeSheet }); views and annotations
//     carry `sheet` (none = the first sheet). sheetDrawing() is the drawing as the active sheet shows it, so the
//     screen, printing and export all use that one sheet;
//   view changes — crop view (`view.crop`: only a rectangle of the view is kept), break view (`view.break`: a
//     middle span along x or y is taken out and break lines mark the gap; dimensions keep the true length) and
//     broken-out section (`view.brokenOut`: material inside a rectangle is removed to a depth, the cut is hatched);
//   tables — hole table (`drawing.holeTable`: the holes seen end-on in a view, tagged, with X / Y from the view's
//     lower-left corner and their size) and revision table (`drawing.revisions`, at the top right of the sheet).
// Model 2D coordinates of a view are the projection's (x right, y up); SVG path coordinates are (x, −y).
import { rep } from './kernel.js';
import { drawingSvg, drawingDxf, layoutViews, viewBasis, hatchSegments, SHEETS, projectView } from './drawing.js';
import { axisOfFace } from './assembly.js';
import { isCylinder } from './refs.js';

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n2 = (v) => String(Math.round(v * 1000) / 1000);
const fmt = (v) => { const r = Math.round(v * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, ''); };
const finite = (...v) => v.every((x) => Number.isFinite(Number(x)));

// ───────────────────────── sheets

export const DEFAULT_SHEET = 'sheet1';

/** The drawing's sheets (at least one). */
export function sheetsOf(d) {
  return Array.isArray(d?.sheets) && d.sheets.length ? d.sheets : [{ id: DEFAULT_SHEET, name: '' }];
}

/** Id of the sheet shown (the first one when unset or gone). */
export function activeSheetId(d) {
  const list = sheetsOf(d);
  return list.some((s) => s.id === d?.activeSheet) ? d.activeSheet : list[0].id;
}

const onSheet = (item, d) => (item?.sheet ?? sheetsOf(d)[0].id);

/**
 * Gives the views and annotations that have no sheet yet (made since the last call) the active sheet. Call it
 * before drawing; it changes `d`. Returns the number of items it placed.
 */
export function adoptToActiveSheet(d) {
  if (!Array.isArray(d.sheets) || d.sheets.length < 2) return 0;
  const id = activeSheetId(d); let n = 0;
  for (const v of d.views ?? []) if (!v.sheet) { v.sheet = id; n++; }
  for (const a of d.annotations ?? []) if (!a.sheet) { a.sheet = id; n++; }
  return n;
}

/** The drawing as its active sheet shows it: a shallow copy with only that sheet's views, annotations and tables. */
export function sheetDrawing(d) {
  const id = activeSheetId(d);
  const list = sheetsOf(d);
  const index = list.findIndex((s) => s.id === id);
  const first = list[0].id;
  const tableOn = (t) => t && (t.sheet ?? first) === id;
  return {
    ...d,
    views: (d.views ?? []).filter((v) => onSheet(v, d) === id),
    annotations: (d.annotations ?? []).filter((a) => onSheet(a, d) === id),
    bom: tableOn(d.bom) ? d.bom : { ...(d.bom ?? {}), show: false },
    holeTable: tableOn(d.holeTable) ? d.holeTable : null,
    revisionsShown: (d.revisionTable?.sheet ?? first) === id,
    sheetIndex: index, sheetCount: list.length, sheetName: list[index]?.name ?? '',
  };
}

/** Adds a sheet (after the others) and makes it active; the existing items keep their sheet. Returns it. */
export function addSheet(d, name, id = null) {
  const list = sheetsOf(d).map((s) => ({ ...s }));
  const first = list[0].id;
  for (const v of d.views ?? []) v.sheet ??= first;
  for (const a of d.annotations ?? []) a.sheet ??= first;
  const sheet = { id: id ?? `sheet${Date.now().toString(36)}${list.length + 1}`, name: name || `${list.length + 1}` };
  if (!list[0].name) list[0].name = '1';
  list.push(sheet);
  d.sheets = list;
  d.activeSheet = sheet.id;
  return sheet;
}

export function renameSheet(d, id, name) {
  d.sheets = sheetsOf(d).map((s) => (s.id === id ? { ...s, name: String(name) } : s));
}

export function setActiveSheet(d, id) {
  if (sheetsOf(d).some((s) => s.id === id)) d.activeSheet = id;
}

/** Deletes a sheet and everything on it (not the last one). Returns false when it is the only sheet. */
export function deleteSheet(d, id) {
  const list = sheetsOf(d);
  if (list.length < 2 || !list.some((s) => s.id === id)) return false;
  const first = list[0].id;
  const gone = (item) => (item?.sheet ?? first) === id;
  const goneViews = new Set((d.views ?? []).filter(gone).map((v) => v.id));
  d.views = (d.views ?? []).filter((v) => !goneViews.has(v.id) && !goneViews.has(v.parent));
  d.annotations = (d.annotations ?? []).filter((a) => !gone(a));
  d.sheets = list.filter((s) => s.id !== id);
  const newFirst = d.sheets[0].id;
  // Items that relied on "no sheet = first sheet" stay where they were.
  if (id === first) for (const x of [...d.views, ...d.annotations]) x.sheet ??= newFirst;
  for (const k of ['bom', 'holeTable', 'revisionTable']) if (d[k] && (d[k].sheet ?? first) === id) d[k] = { ...d[k], sheet: newFirst, ...(k === 'bom' ? { show: false } : {}) };
  if (d.holeTable && goneViews.has(d.holeTable.view)) d.holeTable = null;
  if (d.activeSheet === id || !d.sheets.some((s) => s.id === d.activeSheet)) d.activeSheet = newFirst;
  return true;
}

// ───────────────────────── SVG path flattening (with elliptical arcs)

/** SVG path data (absolute M L H V C Q A Z) → polylines; arcs and curves are flattened. */
export function flattenPath(d) {
  const tokens = String(d).match(/[MLHVCQAZmlhvcqaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out = []; let cur = null; let x = 0; let y = 0; let sx = 0; let sy = 0; let cmd = null; let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': x = num(); y = num(); sx = x; sy = y; cur = [[x, y]]; out.push(cur); cmd = 'L'; break;
      case 'L': x = num(); y = num(); cur?.push([x, y]); break;
      case 'H': x = num(); cur?.push([x, y]); break;
      case 'V': y = num(); cur?.push([x, y]); break;
      case 'C': { const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()]; for (let k = 1; k <= 16; k++) { const t = k / 16; const u = 1 - t; cur?.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]); } x = x3; y = y3; break; }
      case 'Q': { const [x1, y1, x2, y2] = [num(), num(), num(), num()]; for (let k = 1; k <= 12; k++) { const t = k / 12; const u = 1 - t; cur?.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]); } x = x2; y = y2; break; }
      case 'A': {
        const rx0 = num(); const ry0 = num(); const phi = (num() * Math.PI) / 180; const large = num(); const sweep = num(); const ex = num(); const ey = num();
        for (const p of arcPoints(x, y, rx0, ry0, phi, large, sweep, ex, ey)) cur?.push(p);
        x = ex; y = ey; break;
      }
      case 'Z': case 'z': cur?.push([sx, sy]); x = sx; y = sy; cmd = null; break;
      default: i++;
    }
  }
  return out.filter((p) => p.length > 1);
}

/** Points along an SVG endpoint arc (the end point included, the start not). */
function arcPoints(x1, y1, rx, ry, phi, large, sweep, x2, y2) {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!(rx > 0 && ry > 0)) return [[x2, y2]];
  const c = Math.cos(phi); const s = Math.sin(phi);
  const dx = (x1 - x2) / 2; const dy = (y1 - y2) / 2;
  const xp = c * dx + s * dy; const yp = -s * dx + c * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let k = den > 0 ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (Number(large) === Number(sweep)) k = -k;
  const cxp = (k * rx * yp) / ry; const cyp = (-k * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2; const cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!Number(sweep) && dt > 0) dt -= 2 * Math.PI;
  if (Number(sweep) && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 24)));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    out.push(i === n ? [x2, y2] : [cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]);
  }
  return out;
}

/** Polylines → path data (one sub-path per polyline). */
const polylinesPath = (polys) => polys.filter((p) => p.length > 1).map((p) => `M ${p.map((q) => `${n2(q[0])} ${n2(q[1])}`).join(' L ')}`).join(' ');

/** Applies a segment transform `seg(a, b) → [[a', b'], …]` (path coordinates) to every path; joins the pieces again. */
function mapPaths(paths, seg) {
  const out = [];
  for (const d of paths) {
    const polys = [];
    for (const poly of flattenPath(d)) {
      let run = null;
      for (let k = 1; k < poly.length; k++) {
        for (const [a, b] of seg(poly[k - 1], poly[k])) {
          if (run && Math.hypot(run.at(-1)[0] - a[0], run.at(-1)[1] - a[1]) < 1e-9) run.push(b);
          else { run = [a, b]; polys.push(run); }
        }
      }
    }
    const p = polylinesPath(polys);
    if (p) out.push(p);
  }
  return out;
}

/** Part of segment a–b with coordinate c (0 x, 1 y) in [lo, hi], or null. */
function clipAxis(a, b, c, lo, hi) {
  const va = a[c]; const vb = b[c];
  let t0 = 0; let t1 = 1;
  if (Math.abs(vb - va) < 1e-15) { if (va < lo || va > hi) return null; } else {
    const ta = (lo - va) / (vb - va); const tb = (hi - va) / (vb - va);
    t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
    if (t1 - t0 < 1e-12) return null;
  }
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return [at(t0), at(t1)];
}

// ───────────────────────── crop, break, broken-out section

/** A crop rectangle of a view in model 2D coordinates { x0, y0, x1, y1 } (sorted), or null. */
export function cropRect(v) {
  const c = v?.crop;
  if (!c || !finite(c.x0, c.y0, c.x1, c.y1)) return null;
  return { x0: Math.min(c.x0, c.x1), y0: Math.min(c.y0, c.y1), x1: Math.max(c.x0, c.x1), y1: Math.max(c.y0, c.y1) };
}

/** Crops a projection to the rectangle: lines outside it are removed, the box is the rectangle (within the old box). */
export function cropProjection(p, rect) {
  const seg = (a, b) => { const s1 = clipAxis(a, b, 0, rect.x0, rect.x1); if (!s1) return []; const s2 = clipAxis(s1[0], s1[1], 1, -rect.y1, -rect.y0); return s2 ? [s2] : []; };
  const box = { x0: Math.max(p.box.x0, rect.x0), y0: Math.max(p.box.y0, rect.y0), x1: Math.min(p.box.x1, rect.x1), y1: Math.min(p.box.y1, rect.y1) };
  if (!(box.x1 > box.x0 && box.y1 > box.y0)) return { ...p, visible: [], hidden: [], box: { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 }, cropped: rect };
  const map2 = (X, Y) => (X >= rect.x0 && X <= rect.x1 && Y >= rect.y0 && Y <= rect.y1 ? [X, Y] : null);
  return { ...p, visible: mapPaths(p.visible, seg), hidden: mapPaths(p.hidden, seg), box, cropped: rect, map2: chain(p.map2, map2), trueW: p.trueW, trueH: p.trueH };
}

const chain = (first, second) => (first ? (X, Y) => { const q = first(X, Y); return q ? second(q[0], q[1]) : null; } : second);

/** The break of a view, sorted and inside its box: { axis: 'x' | 'y', from, to } or null. */
export function breakSpan(v, box) {
  const b = v?.break;
  if (!b || !finite(b.from, b.to)) return null;
  const axis = b.axis === 'y' ? 'y' : 'x';
  const [lo, hi] = axis === 'x' ? [box.x0, box.x1] : [box.y0, box.y1];
  const from = Math.max(lo, Math.min(b.from, b.to)); const to = Math.min(hi, Math.max(b.from, b.to));
  return to > from ? { axis, from, to } : null;
}

/** Default break of a box: the middle 60 % of its longer side. */
export function defaultBreak(box) {
  const w = box.x1 - box.x0; const h = box.y1 - box.y0;
  const axis = w >= h ? 'x' : 'y';
  const [lo, hi] = axis === 'x' ? [box.x0, box.x1] : [box.y0, box.y1];
  return { axis, from: lo + 0.2 * (hi - lo), to: hi - 0.2 * (hi - lo) };
}

/**
 * Takes the span out of a projection: lines inside it are removed, the far side moves up to a small gap.
 * The result keeps the true size for its dimensions (trueW / trueH) and lists the gap in `breaks` (model 2D).
 */
export function breakProjection(p, span) {
  const ext = span.axis === 'x' ? p.box.x1 - p.box.x0 : p.box.y1 - p.box.y0;
  const gap = Math.min(span.to - span.from, Math.max(ext * 0.04, 1e-3));
  const shift = span.to - span.from - gap;
  // Path coordinate c and the model value: x = X; y = −Y (so the span in path y is [−to, −from], and "far" is smaller y).
  const c = span.axis === 'x' ? 0 : 1;
  const seg = (a, b) => {
    const out = [];
    if (c === 0) {
      const near = clipAxis(a, b, 0, -Infinity, span.from); if (near) out.push(near);
      const far = clipAxis(a, b, 0, span.to, Infinity); if (far) out.push(far.map((q) => [q[0] - shift, q[1]]));
    } else {
      const near = clipAxis(a, b, 1, -span.from, Infinity); if (near) out.push(near);
      const far = clipAxis(a, b, 1, -Infinity, -span.to); if (far) out.push(far.map((q) => [q[0], q[1] + shift]));
    }
    return out;
  };
  const box = { ...p.box };
  if (c === 0) box.x1 -= shift; else box.y1 -= shift;
  const map2 = (X, Y) => {
    const v = c === 0 ? X : Y;
    if (v > span.from && v < span.to) return null;
    return v >= span.to ? (c === 0 ? [X - shift, Y] : [X, Y - shift]) : [X, Y];
  };
  return {
    ...p, visible: mapPaths(p.visible, seg), hidden: mapPaths(p.hidden, seg), box,
    trueW: p.trueW ?? (p.box.x1 - p.box.x0), trueH: p.trueH ?? (p.box.y1 - p.box.y0),
    breaks: [...(p.breaks ?? []), { axis: span.axis, at: span.from, gap }],
    map2: chain(p.map2, map2),
  };
}

/** The broken-out region of a view { x0, y0, x1, y1, depth } (model 2D + depth from the front), or null. */
export function brokenOutRegion(v) {
  const b = v?.brokenOut;
  if (!b || !finite(b.x0, b.y0, b.x1, b.y1, b.depth) || !(Number(b.depth) > 0)) return null;
  return { x0: Math.min(b.x0, b.x1), y0: Math.min(b.y0, b.y1), x1: Math.max(b.x0, b.x1), y1: Math.max(b.y0, b.y1), depth: Number(b.depth) };
}

/** Extent of a shape along a direction: [min, max] of p·dir over its bounding box corners. */
function extentAlong(shape, dir) {
  const [lo, hi] = shape.boundingBox.bounds;
  let a = Infinity; let b = -Infinity;
  for (let k = 0; k < 8; k++) { const p = [k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]]; const d = dot3(p, dir); a = Math.min(a, d); b = Math.max(b, d); }
  return [a, b];
}

/** Model depth of a view (front − back along its direction), for the broken-out section's default depth. */
export function viewDepth(shape, v) {
  const b = viewBasis(v);
  const [a, c] = extentAlong(shape, b.dir);
  return c - a;
}

/**
 * Projection of a view with a broken-out section: the shape minus a prism over the region, from the front of the
 * model down to `depth`; the faces left at the bottom of the cut are the hatched area (`section.triangles`, path
 * coordinates). The input shape is not changed. Needs the kernel.
 */
export function brokenOutProjection(shape, v, region) {
  const R = rep();
  const b = viewBasis(v);
  const [, front] = extentAlong(shape, b.dir);
  const size = Math.hypot(...shape.boundingBox.bounds[1].map((x, i) => x - shape.boundingBox.bounds[0][i])) || 1;
  const cx = (region.x0 + region.x1) / 2; const cy = (region.y0 + region.y1) / 2;
  const bottom = front - region.depth;
  const origin = [0, 1, 2].map((i) => cx * b.x[i] + cy * b.y[i] + bottom * b.dir[i]);
  const plane = new R.Plane(origin, b.x, b.dir);
  const tool = R.drawRectangle(region.x1 - region.x0, region.y1 - region.y0).sketchOnPlane(plane).extrude(region.depth + size);
  let cut;
  try { cut = shape.clone().cut(tool); } catch { return null; }
  const out = projectView(cut, v.type, { ...v, brokenOut: undefined });
  const triangles = [];
  for (const f of cut.faces) {
    try {
      if (f.geomType !== 'PLANE') continue;
      if (dot3(f.normalAt().toTuple(), b.dir) < 0.999) continue;
      const c = f.center.toTuple();
      if (Math.abs(dot3(c, b.dir) - bottom) > size * 1e-5 + 1e-6) continue;
      const m = f.mesh({ tolerance: Math.max(size * 5e-4, 0.01), angularTolerance: 0.15 });
      const pt = (i) => { const q = [m.vertices[i * 3], m.vertices[i * 3 + 1], m.vertices[i * 3 + 2]]; return [dot3(q, b.x), -dot3(q, b.y)]; };
      for (let i = 0; i + 2 < m.triangles.length; i += 3) triangles.push([...pt(m.triangles[i]), ...pt(m.triangles[i + 1]), ...pt(m.triangles[i + 2])]);
    } catch { /* skip that face */ }
  }
  try { cut.delete(); } catch { /* fine */ }
  return { ...out, brokenOut: { region, triangles } };
}

/**
 * Projections with every view's crop / break / broken-out section applied (`projections`: view id → projectView()).
 * `shape` (the drawing's model) is needed for broken-out sections; `cache` (a Map) keeps those between calls,
 * keyed by `key` (the model's) and the view.
 */
export function adjustProjections(d, projections, { shape = null, key = '', cache = null } = {}) {
  const out = new Map(projections);
  for (const v of d.views ?? []) {
    let p = out.get(v.id);
    if (!p || v.kind === 'detail') continue;
    const region = !v.kind && v.type !== 'custom' ? brokenOutRegion(v) : null;
    if (region && shape) {
      const k = `${key}|bo|${v.type}|${JSON.stringify(region)}`;
      let q = cache?.get(k);
      if (!q) { q = brokenOutProjection(shape, v, region); if (q) cache?.set(k, q); }
      if (q) p = { ...q, box: p.box };
    }
    const rect = cropRect(v);
    if (rect) p = cropProjection(p, rect);
    const span = breakSpan(v, p.box);
    if (span) p = breakProjection(p, span);
    out.set(v.id, p);
  }
  return out;
}

// ───────────────────────── holes and the hole table

/**
 * Round holes of a solid: concave cylindrical faces, grouped by axis (a counterbored hole is one hole with the
 * smallest diameter). [{ center (on the axis, mid of the faces), dir (unit), diameter }]. Needs the kernel.
 */
export function findHoles(shape) {
  const found = [];
  for (const f of shape.faces) {
    try {
      if (!isCylinder(f.geomType)) continue;
      const axis = axisOfFace(f);
      if (!axis) continue;
      const on = f.pointOnSurface(0.5, 0.5); const p = [on.x, on.y, on.z];
      const n = f.normalAt(on); const nn = [n.x, n.y, n.z];
      const rel = p.map((x, i) => x - axis.point[i]);
      const along = dot3(rel, axis.dir);
      const radial = rel.map((x, i) => x - axis.dir[i] * along);
      const r = Math.hypot(...radial);
      if (!(r > 1e-9)) continue;
      if (dot3(nn, radial) >= 0) continue;                 // normal away from the axis: a boss, not a hole
      found.push({ point: axis.point, dir: axis.dir, diameter: 2 * r });
    } catch { /* not measurable */ }
  }
  const holes = [];
  for (const h of found) {
    const same = holes.find((o) => Math.abs(Math.abs(dot3(o.dir, h.dir)) - 1) < 1e-6 && Math.hypot(...[0, 1, 2].map((i) => { const d = h.point.map((x, k) => x - o.center[k]); const a = dot3(d, o.dir); return d[i] - o.dir[i] * a; })) < 1e-4);
    if (same) same.diameter = Math.min(same.diameter, h.diameter);
    else holes.push({ center: [...h.point], dir: [...h.dir], diameter: h.diameter });
  }
  return holes;
}

/**
 * Hole table rows of a view: the holes seen end-on, tagged A1, A2 … from the lower left, with X / Y measured
 * from the view's lower-left corner (model 2D of the original projection `box`). [{ tag, x, y, diameter, X, Y }]
 * (X, Y: the hole centre in model 2D, for the tags).
 */
export function holeTableRows(holes, view, box) {
  const b = viewBasis(view);
  if (!b) return [];
  const rows = holes.filter((h) => Math.abs(dot3(h.dir, b.dir)) > 0.999).map((h) => ({ X: dot3(h.center, b.x), Y: dot3(h.center, b.y), diameter: h.diameter }));
  // Holes seen end-on that line up (one above the other in depth) are one row.
  const unique = [];
  for (const r of rows) if (!unique.some((u) => Math.hypot(u.X - r.X, u.Y - r.Y) < 1e-4)) unique.push(r);
  unique.sort((p, q) => (Math.abs(p.Y - q.Y) > 1e-6 ? p.Y - q.Y : p.X - q.X));
  return unique.map((r, i) => ({ tag: `A${i + 1}`, x: r.X - box.x0, y: r.Y - box.y0, diameter: r.diameter, X: r.X, Y: r.Y }));
}

// ───────────────────────── revisions

/** Next revision letter after the ones in the list (A, B … Z, AA …). */
export function nextRevision(list = []) {
  const used = new Set(list.map((r) => r.rev));
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  for (let i = 0; i < 200; i++) { const s = i < letters.length ? letters[i] : `${letters[Math.floor(i / letters.length) - 1]}${letters[i % letters.length]}`; if (!used.has(s)) return s; }
  return String(list.length + 1);
}

/** Adds a revision row { rev, description, date, by } and sets the title block's revision. Returns the row. */
export function addRevision(d, { description = '', date = new Date().toISOString().slice(0, 10), by = '' } = {}) {
  d.revisions = Array.isArray(d.revisions) ? d.revisions : [];
  const row = { rev: nextRevision(d.revisions), description: String(description), date, by: String(by) };
  d.revisions.push(row);
  d.title = { ...(d.title ?? {}), revision: row.rev };
  d.revisionTable = { ...(d.revisionTable ?? {}), show: true };
  return row;
}

export function removeRevision(d, rev) {
  d.revisions = (d.revisions ?? []).filter((r) => r.rev !== rev);
  d.title = { ...(d.title ?? {}), revision: d.revisions.at(-1)?.rev ?? 'A' };
  if (!d.revisions.length && d.revisionTable) d.revisionTable.show = false;
}

// ───────────────────────── overlay (break lines, broken-out outlines, tables, sheet name)

function table(x, y, cols, rows, title, cls) {
  const rowH = 6; const w = cols.reduce((s, c) => s + c.w, 0);
  const h = rowH * (rows.length + 1 + (title ? 1 : 0));
  const out = [`<g class="${cls}"><rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" class="tbl-frame"/>`];
  let yy = y;
  if (title) { out.push(`<text x="${n2(x + w / 2)}" y="${n2(yy + 4.3)}" class="tbl-head" text-anchor="middle">${esc(title)}</text><line x1="${n2(x)}" y1="${n2(yy + rowH)}" x2="${n2(x + w)}" y2="${n2(yy + rowH)}" class="tbl-grid"/>`); yy += rowH; }
  const all = [cols.map((c) => c.label), ...rows];
  all.forEach((r, i) => {
    let xx = x;
    cols.forEach((c, j) => {
      out.push(`<text x="${n2(xx + (c.align === 'start' ? 1.2 : c.w / 2))}" y="${n2(yy + 4.2)}" class="${i ? 'tbl-cell' : 'tbl-head'}" text-anchor="${c.align ?? 'middle'}">${esc(r[j])}</text>`);
      xx += c.w;
      if (j < cols.length - 1) out.push(`<line x1="${n2(xx)}" y1="${n2(yy)}" x2="${n2(xx)}" y2="${n2(yy + rowH)}" class="tbl-grid"/>`);
    });
    yy += rowH;
    if (i < all.length - 1) out.push(`<line x1="${n2(x)}" y1="${n2(yy)}" x2="${n2(x + w)}" y2="${n2(yy)}" class="tbl-grid"/>`);
  });
  out.push('</g>');
  return { svg: out.join(''), w, h };
}

/** Zig-zag break line across a view on the sheet, from a to b (sheet mm). */
function zigzag(a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!(L > 0)) return '';
  const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; const n = [-d[1], d[0]];
  const m = L / 2; const pts = [a, [a[0] + d[0] * (m - 2), a[1] + d[1] * (m - 2)], [a[0] + d[0] * (m - 1) + n[0] * 2, a[1] + d[1] * (m - 1) + n[1] * 2], [a[0] + d[0] * (m + 1) - n[0] * 2, a[1] + d[1] * (m + 1) - n[1] * 2], [a[0] + d[0] * (m + 2), a[1] + d[1] * (m + 2)], b];
  return `<path d="M ${pts.map((p) => `${n2(p[0])} ${n2(p[1])}`).join(' L ')}" class="break-line"/>`;
}

/** Wavy closed outline of a rectangle (sheet mm), like a hand-drawn spline. */
function wavyRect(x0, y0, x1, y1) {
  const pts = [];
  const side = (a, b, k) => { for (let i = 0; i < 12; i++) { const t = i / 12; const w = Math.sin(t * Math.PI * 2 + k) * 0.8; const d = [b[0] - a[0], b[1] - a[1]]; const L = Math.hypot(...d) || 1; pts.push([a[0] + d[0] * t - (d[1] / L) * w, a[1] + d[1] * t + (d[0] / L) * w]); } };
  side([x0, y0], [x1, y0], 0); side([x1, y0], [x1, y1], 1); side([x1, y1], [x0, y1], 2); side([x0, y1], [x0, y0], 3);
  return `<path d="M ${pts.map((p) => `${n2(p[0])} ${n2(p[1])}`).join(' L ')} Z" class="brokenout-line"/>`;
}

const OVERLAY_CSS = `<style>
    .break-line{fill:none;stroke:#000;stroke-width:.35}.brokenout-line{fill:none;stroke:#000;stroke-width:.35}
    .tbl-frame{fill:#fff;stroke:#000;stroke-width:.5}.tbl-grid{stroke:#000;stroke-width:.2}
    .tbl-head{font:bold 2.8px sans-serif;fill:#000}.tbl-cell{font:2.8px sans-serif;fill:#000}
    .hole-tag{font:2.6px sans-serif;fill:#000}.sheet-name{font:3px sans-serif;fill:#444}
  </style>`;

/**
 * Everything drawn over the sheet: break lines, broken-out outlines and hatching, hole tags and the hole table,
 * the revision table and the sheet name. `sd` = sheetDrawing(), `projections` adjusted, `holeRows` from
 * holeTableRows() (or null), `labels` for the table titles. Returns SVG (no <svg> element) or ''.
 */
export function overlaySvg(sd, projections, { labels = {}, holeRows = null } = {}) {
  const [W] = SHEETS[sd.sheet] ?? SHEETS.A3;
  const { scale, places } = layoutViews(sd, projections);
  const parts = [];
  for (const v of sd.views ?? []) {
    const p = projections.get(v.id); const place = places.get(v.id);
    if (!p || !place || v.kind === 'detail') continue;
    const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2;
    const toSheet = (X, Y) => [place.cx + (X - cx) * scale, place.cy + (cy - Y) * scale];
    for (const br of p.breaks ?? []) {
      if (br.axis === 'x') { for (const X of [br.at, br.at + br.gap]) parts.push(zigzag(toSheet(X, p.box.y1 + 0.03 * (p.box.y1 - p.box.y0)), toSheet(X, p.box.y0 - 0.03 * (p.box.y1 - p.box.y0)))); }
      else for (const Y of [br.at, br.at + br.gap]) parts.push(zigzag(toSheet(p.box.x0 - 0.03 * (p.box.x1 - p.box.x0), Y), toSheet(p.box.x1 + 0.03 * (p.box.x1 - p.box.x0), Y)));
    }
    if (p.brokenOut) {
      const r = p.brokenOut.region;
      const m = p.map2 ?? ((X, Y) => [X, Y]);
      const a = m(r.x0, r.y0); const b = m(r.x1, r.y1);
      if (a && b) { const A = toSheet(a[0], a[1]); const B = toSheet(b[0], b[1]); parts.push(wavyRect(Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[0], B[0]), Math.max(A[1], B[1]))); }
      const segs = hatchSegments(p.brokenOut.triangles, 2.5 / scale, Number(v.hatchAngle) || 45);
      const lines = [];
      for (const s of segs) {
        const a2 = m(s[0], -s[1]); const b2 = m(s[2], -s[3]);
        if (!a2 || !b2) continue;
        const A = toSheet(a2[0], a2[1]); const B = toSheet(b2[0], b2[1]);
        lines.push(`M ${n2(A[0])} ${n2(A[1])} L ${n2(B[0])} ${n2(B[1])}`);
      }
      if (lines.length) parts.push(`<path d="${lines.join(' ')}" class="hatch" style="fill:none;stroke:#000;stroke-width:.18"/>`);
    }
    if (holeRows && sd.holeTable?.view === v.id) {
      const m = p.map2 ?? ((X, Y) => [X, Y]);
      for (const r of holeRows) { const q = m(r.X, r.Y); if (!q) continue; const [x, y] = toSheet(q[0], q[1]); parts.push(`<text x="${n2(x + 1.2)}" y="${n2(y - 1.2)}" class="hole-tag">${esc(r.tag)}</text>`); }
    }
  }
  if (holeRows && sd.holeTable) {
    const ht = sd.holeTable;
    const cols = [{ label: labels['holeTable.tag'] ?? 'TAG', w: 14 }, { label: labels['holeTable.x'] ?? 'X LOC', w: 22 }, { label: labels['holeTable.y'] ?? 'Y LOC', w: 22 }, { label: labels['holeTable.size'] ?? 'SIZE', w: 26 }];
    const t = table(Number.isFinite(ht.x) ? ht.x : 16, Number.isFinite(ht.y) ? ht.y : 16, cols, holeRows.map((r) => [r.tag, fmt(r.x), fmt(r.y), `⌀${fmt(r.diameter)}`]), labels['holeTable.title'] ?? 'HOLE TABLE', 'hole-table');
    parts.push(t.svg);
  }
  if (sd.revisionsShown && sd.revisionTable?.show && sd.revisions?.length) {
    const cols = [{ label: labels['rev.rev'] ?? 'REV', w: 12 }, { label: labels['rev.description'] ?? 'DESCRIPTION', w: 62, align: 'start' }, { label: labels['rev.date'] ?? 'DATE', w: 22 }, { label: labels['rev.by'] ?? 'BY', w: 16 }];
    const w = cols.reduce((s, c) => s + c.w, 0);
    const rt = sd.revisionTable;
    parts.push(table(Number.isFinite(rt.x) ? rt.x : W - 12 - w, Number.isFinite(rt.y) ? rt.y : 12, cols, sd.revisions.map((r) => [r.rev, r.description, r.date, r.by]), labels['rev.title'] ?? 'REVISIONS', 'revision-table').svg);
  }
  if (sd.sheetCount > 1) {
    const [, H] = SHEETS[sd.sheet] ?? SHEETS.A3;
    parts.push(`<text x="${n2(W - 12)}" y="${n2(H - 52)}" class="sheet-name" text-anchor="end">${esc(`${labels['sheet.label'] ?? 'SHEET'} ${sd.sheetIndex + 1} / ${sd.sheetCount}${sd.sheetName ? ` — ${sd.sheetName}` : ''}`)}</text>`);
  }
  const body = parts.filter(Boolean).join('');
  return body ? `${OVERLAY_CSS}<g class="drawing-more">${body}</g>` : '';
}

/** The active sheet as SVG: drawingSvg() of sheetDrawing() with the overlay. Options as drawingSvg() plus holeRows. */
export function sheetSvg(d, projections, opts = {}) {
  const sd = d.sheetCount != null ? d : sheetDrawing(d);
  const svg = drawingSvg(sd, projections, opts);
  const extra = overlaySvg(sd, projections, opts);
  return extra ? svg.replace(/<\/svg>\s*$/, `${extra}\n</svg>`) : svg;
}

/** The active sheet as DXF (the views and annotations of that sheet). */
export function sheetDxf(d, projections, opts = {}) {
  return drawingDxf(d.sheetCount != null ? d : sheetDrawing(d), projections, opts);
}
