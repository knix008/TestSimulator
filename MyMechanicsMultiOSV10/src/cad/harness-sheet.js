// The flattened harness on a drawing sheet (no DOM, no imports: drawing-annot.js draws it). harnessSheet()
// lays out, on a sheet of W × H mm, one 'drwHarness' annotation (the formboard layout at a standard scale:
// bundle lines with their diameters, true branch lengths, connectors, clips) and general tables ('drwTable', the
// drawing module's own) for the wire list and every connector. harnessPrimitives() turns the annotation into the
// sheet primitives (poly / circle / text, sheet mm, y down) that the drawing's SVG, DXF and print use.

/** Options of a harness sheet (the annotation's `opts`) with their defaults. */
export const HARNESS_SHEET_DEFAULTS = { scale: 'auto', rotate: 0, mirror: false, showWires: true, showConnectors: true, rowH: 6, auto: true };
export const harnessSheetOptions = (o = {}) => ({ ...HARNESS_SHEET_DEFAULTS, ...Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v != null)) });

/**
 * The flat layout turned on the sheet: rotated by `rotate` degrees (counter-clockwise) and mirrored top to
 * bottom when `mirror`; lengths unchanged. Returns a new flat with its bounds.
 */
export function transformFlat(flat, { rotate = 0, mirror = false } = {}) {
  const a = (Number(rotate) * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
  const T = ([x, y]) => { const yy = mirror ? -y : y; return [x * c - yy * s, x * s + yy * c]; };
  const nodes = flat.nodes.map((n) => { const [x, y] = T([n.x, n.y]); return { ...n, x, y }; });
  const segments = flat.segments.map((g) => {
    const points = g.points.map(T);
    return { ...g, points, angle: (Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0]) * 180) / Math.PI };
  });
  const xs = nodes.map((n) => n.x); const ys = nodes.map((n) => n.y);
  return { ...flat, nodes, segments, bounds: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] };
}

/** Standard drawing scales tried, largest first (sheet mm per model mm). */
export const HARNESS_SCALES = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
const r1 = (v) => Math.round(v * 10) / 10;

/** The flat layout's points (model mm, y up) → sheet (mm, y down) for annotation `a`. */
export function harnessToSheet(a) {
  const [[x0], [, y1]] = a.flat.bounds;
  const k = Number(a.scale) || 1;
  return (p) => [(Number(a.x) || 0) + (p[0] - x0) * k, (Number(a.y) || 0) + (y1 - p[1]) * k];
}

/** Primitives of a 'drwHarness' annotation: bundles (two outlines at their diameter, or one line), lengths, clips, connectors. */
export function harnessPrimitives(a) {
  if (!a?.flat?.segments) return [];
  const S = harnessToSheet(a);
  const k = Number(a.scale) || 1;
  const out = [];
  for (const s of a.flat.segments) {
    const [p, q] = s.points.map(S);
    const dx = q[0] - p[0]; const dy = q[1] - p[1]; const L = Math.hypot(dx, dy) || 1;
    const n = [-dy / L, dx / L];
    const half = (s.diameter * k) / 2;
    if (half > 0.35) {
      for (const sg of [1, -1]) out.push({ t: 'poly', pts: [[p[0] + n[0] * half * sg, p[1] + n[1] * half * sg], [q[0] + n[0] * half * sg, q[1] + n[1] * half * sg]], cls: 'dx-line' });
      out.push({ t: 'poly', pts: [p, q], cls: 'dx-center' });
    } else out.push({ t: 'poly', pts: [p, q], cls: 'dx-line' });
    // The true length, beside the middle, along the bundle.
    const off = half + 2.2;
    let rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (rot > 90) rot -= 180; if (rot < -90) rot += 180;
    out.push({ t: 'text', x: (p[0] + q[0]) / 2 + n[0] * off, y: (p[1] + q[1]) / 2 + n[1] * off, text: String(r1(s.length)), size: 2.5, anchor: 'middle', rot, kind: 'length', value: s.length });
    for (const c of s.clips ?? []) {
      const t = s.length > 0 ? c.at / s.length : 0;
      const m = [p[0] + dx * t, p[1] + dy * t];
      const h = half + 1.5;
      out.push({ t: 'poly', pts: [[m[0] - n[0] * h, m[1] - n[1] * h], [m[0] + n[0] * h, m[1] + n[1] * h]], cls: 'dx-line' });
      out.push({ t: 'text', x: m[0] - n[0] * (h + 2.5), y: m[1] - n[1] * (h + 2.5), text: c.name, size: 2.2, anchor: 'middle' });
    }
  }
  for (const nd of a.flat.nodes) {
    const [x, y] = S([nd.x, nd.y]);
    if (nd.kind === 'connector') {
      out.push({ t: 'poly', pts: [[x - 4, y - 3], [x + 4, y - 3], [x + 4, y + 3], [x - 4, y + 3]], closed: true, cls: 'dx-line' });
      out.push({ t: 'text', x, y: y - 4.5, text: nd.name, size: 3, anchor: 'middle', bold: true });
    } else if (nd.kind === 'junction') out.push({ t: 'circle', c: [x, y], r: 0.8, fill: true });
  }
  if (a.title) out.push({ t: 'text', x: Number(a.x) || 0, y: (Number(a.y) || 0) - 4, text: `${a.title} (${a.scaleLabel ?? ''})`, size: 3.5, bold: true });
  // Out of date (the harness changed and the sheet is not updated automatically): a marked note above it.
  if (a.stale) {
    const x = Number(a.x) || 0; const y = (Number(a.y) || 0) - 9.5;
    const text = String(a.staleText || 'OUT OF DATE');
    const w = text.length * 2.1 + 6;
    out.push({ t: 'poly', pts: [[x, y - 3.6], [x + w, y - 3.6], [x + w, y + 1.4], [x, y + 1.4]], closed: true, cls: 'dx-dash', kind: 'stale' });
    out.push({ t: 'text', x: x + 3, y, text, size: 3, bold: true, kind: 'stale' });
  }
  return out;
}

const table = (id, x, y, title, rows, colW, rowH = 6, role = '') => ({ id, kind: 'drwTable', x, y, title, rows: rows.length, cols: colW.length, cells: rows.map((r) => r.map((v) => (v == null ? '' : String(v)))), colW: colW.map((w) => (w * rowH) / 6), rowH, role });
const tableH = (t) => (t.title ? t.rowH : 0) + t.rowH * t.rows;
const tableW = (t) => t.colW.reduce((s, w) => s + w, 0);

/**
 * The sheet content for a flattened harness: { annotations, scale, scaleLabel, area }. `W`, `H` (sheet mm),
 * `margin`, `titleBlock` ([w, h] kept free in the bottom right), `labels` (table headings), `ids` (a function
 * giving new ids), `title`.
 */
export function harnessSheet(rawFlat, { W = 420, H = 297, margin = 15, titleBlock = [180, 56], labels = {}, ids = (k) => `hs-${k}`, title = '', opts = {} } = {}) {
  const o = harnessSheetOptions(opts);
  const flat = transformFlat(rawFlat, o);
  const L = { wireList: 'Wire list', wire: 'Wire', from: 'From', to: 'To', colour: 'Colour', size: 'mm²', length: 'Length', pin: 'Pin', clips: 'Clips', ...labels };
  const rh = Math.max(3, Math.min(12, Number(o.rowH) || 6));
  const wires = table(ids('wires'), 0, 0, L.wireList, [[L.wire, L.from, L.to, L.colour, L.size, L.length, L.clips], ...flat.wires.map((w) => [w.wire, `${w.from}:${w.fromPin}`, `${w.to}:${w.toPin}`, w.color, w.gauge, r1(w.length), (w.clips ?? []).join(' ')])], [14, 18, 18, 14, 12, 18, 22], rh, 'wires');
  const conns = flat.tables.map((tb, i) => table(ids(`conn${i}`), 0, 0, tb.connector, [[L.pin, L.wire, L.colour, L.size, L.to], ...tb.rows.map((r) => [r.pin, r.wire, r.color, r.gauge ?? '', r.to])], [10, 14, 14, 12, 18], rh, `conn:${tb.connector}`));
  // Tables along the bottom (left of the title block), wrapping upward when they do not fit.
  const tables = [...(o.showWires ? [wires] : []), ...(o.showConnectors ? conns : [])];
  const bottom = H - margin;
  let x = margin; let rowTop = bottom; let rowH = 0; let top = bottom;
  const placeRow = [];
  const flush = () => { for (const t of placeRow) t.y = rowTop - rowH; top = Math.min(top, rowTop - rowH); rowTop = rowTop - rowH - 6; rowH = 0; placeRow.length = 0; x = margin; };
  for (const t of tables) {
    const limit = rowTop > H - margin - titleBlock[1] - 1 ? W - margin - titleBlock[0] - 6 : W - margin;
    if (x + tableW(t) > limit && placeRow.length) flush();
    t.x = x; x += tableW(t) + 6; rowH = Math.max(rowH, tableH(t)); placeRow.push(t);
  }
  if (placeRow.length) flush();
  // The layout above the tables, at the largest standard scale that fits.
  const area = { x: margin + 4, y: margin + 10, w: W - 2 * margin - 8, h: top - margin - 24 };
  const [[x0, y0], [x1, y1]] = flat.bounds;
  const fit = Math.min(area.w / Math.max(1e-6, x1 - x0), area.h / Math.max(1e-6, y1 - y0));
  const fixed = Number(o.scale);
  const scale = o.scale !== 'auto' && fixed > 0 ? fixed : HARNESS_SCALES.find((s) => s <= fit) ?? fit;
  const scaleLabel = scale >= 1 ? `${r1(scale)}:1` : `1:${r1(1 / scale)}`;
  const w = (x1 - x0) * scale; const h = (y1 - y0) * scale;
  const flatAnn = { id: ids('flat'), kind: 'drwHarness', x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, scale, scaleLabel, title, flat, opts: o };
  return { annotations: [flatAnn, ...tables], scale, scaleLabel, area, fits: w <= area.w + 1e-6 && h <= area.h + 1e-6 };
}

/**
 * What a harness sheet depends on (the route's harness inputs and, for a route along a 3D sketch, its points):
 * equal keys mean the sheet is up to date.
 */
export function harnessKey(f, features = []) {
  const path = f.path ? features.find((x) => x.id === f.path)?.points ?? null : null;
  const pick = ['points', 'branches', 'connectors', 'clips', 'wires', 'bendRadius', 'fill', 'endAllowance', 'diameter', 'path'];
  return JSON.stringify([Object.fromEntries(pick.map((k) => [k, f[k] ?? null])), path]);
}

/**
 * Puts a (re)built harness sheet on drawing `d`: the annotation `ann` (kept: its id, and its place unless the
 * scale changed) gets the new layout, its tables (`harness` = its id) are replaced, each keeping the place the
 * user gave it (by `role`). `sheet` = harnessSheet(...). Returns the annotation.
 */
export function applyHarnessSheet(d, ann, sheet, { source = null, key = null } = {}) {
  const [flatAnn, ...tables] = sheet.annotations;
  const old = (d.annotations ?? []).filter((x) => x.kind === 'drwTable' && x.harness === ann.id);
  const keepPlace = ann.flat && ann.scale === flatAnn.scale && JSON.stringify(ann.opts ?? {}) === JSON.stringify(flatAnn.opts ?? {});
  Object.assign(ann, { ...flatAnn, id: ann.id, x: keepPlace ? ann.x : flatAnn.x, y: keepPlace ? ann.y : flatAnn.y, source: source ?? ann.source, key: key ?? ann.key, stale: false });
  for (const t of tables) {
    t.harness = ann.id;
    const prev = old.find((x) => x.role === t.role);
    if (prev) { t.id = prev.id; t.x = prev.x; t.y = prev.y; if (prev.sheet) t.sheet = prev.sheet; }
    if (ann.sheet) t.sheet = ann.sheet;
  }
  d.annotations = [...(d.annotations ?? []).filter((x) => !(x.kind === 'drwTable' && x.harness === ann.id)), ...tables];
  return ann;
}
