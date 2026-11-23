// A 2D CAD drawing (DWG through dwg/read.js, DXF through dxf-read.js — the same plain model) as a sketch: the
// model-space geometry with block inserts expanded, in millimetres, on the XY plane. Lines, arcs and circles
// share their end points where they meet, so closed outlines become profiles a boss or cut can use.
//
//   LINE, ARC, CIRCLE        → line, arc, circle
//   LWPOLYLINE, POLYLINE     → lines, and arcs where a vertex has a bulge
//   ELLIPSE                  → ellipse (whole), spline (an arc of it)
//   SPLINE                   → spline through its fit points, or through points of its NURBS
//   POINT, TEXT, MTEXT       → point, text
//   SOLID / TRACE            → its outline
//   INSERT                   → the block's geometry, placed (dimension blocks are left out)
import { createSketchGeometry, addLine, addCircle, addArc, addText, ORIGIN } from './sketch.js';
import { addSpline, addEllipse } from './sketchtools.js';
import { curvePoint } from './nurbs-eval.js';

/** Millimetres per drawing unit by INSUNITS (0 unitless → millimetres). */
export const UNIT_MM = { 0: 1, 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 2.54e-5, 9: 0.0254, 10: 914.4, 11: 1e-7, 12: 1e-6, 13: 1e-3, 14: 100, 15: 1e4, 16: 1e5, 17: 1e12, 18: 1.495978707e14, 19: 9.4607304725808e18, 20: 3.0856776e19 };

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; // x' = a x + c y + e, y' = b x + d y + f
const apply = (m, [x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
const compose = (m, n) => ({ a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f });
const det = (m) => m.a * m.d - m.b * m.c;

/** Model-space entities as flat 2D items in drawing units: [{ kind, …, layer }], inserts expanded. */
export function flattenDrawing(model, { includeDimensions = false, maxDepth = 8 } = {}) {
  const out = []; const skipped = {};
  const blockOf = (e) => (e.block !== undefined ? model.blocks.get(e.block) : [...model.blocks.values()].find((b) => b.name === e.blockName) ?? model.blocks.get(e.blockName));
  const walk = (entities, m, depth) => {
    for (const e of entities) {
      // An entity drawn in a mirrored object coordinate system (extrusion −Z) is its mirror image in X.
      const ocs = (e.extrusion?.[2] ?? 1) < 0 ? compose(m, { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }) : m;
      switch (e.name) {
        case 'LINE': out.push({ kind: 'line', a: apply(m, e.start), b: apply(m, e.end), layer: e.layerName }); break;
        case 'CIRCLE': out.push({ kind: 'circle', c: apply(ocs, e.center), r: e.radius * Math.sqrt(Math.abs(det(m))), layer: e.layerName }); break;
        case 'ARC': {
          let a0 = e.startAngle; let a1 = e.endAngle; while (a1 <= a0) a1 += 2 * Math.PI;
          const pts = [a0, (a0 + a1) / 2, a1].map((t) => apply(ocs, [e.center[0] + e.radius * Math.cos(t), e.center[1] + e.radius * Math.sin(t)]));
          out.push({ kind: 'arc3', pts, layer: e.layerName });
          break;
        }
        case 'LWPOLYLINE': case 'POLYLINE_2D': case 'POLYLINE_3D': {
          const verts = e.name === 'LWPOLYLINE' ? e.points.map((p, i) => ({ p, bulge: e.bulges?.[i] ?? 0 })) : (e.vertexList ?? []).map((v) => ({ p: v.point, bulge: v.bulge ?? 0 }));
          const mm = e.name === 'POLYLINE_3D' ? m : ocs;
          const n = verts.length; const closed = Boolean(e.closed);
          for (let i = 0; i < (closed ? n : n - 1); i++) {
            const A = verts[i]; const B = verts[(i + 1) % n];
            if (Math.abs(A.bulge) > 1e-12) {
              // A bulge is tan(θ/4) of the arc's included angle θ, positive counter-clockwise.
              const [x0, y0] = A.p; const [x1, y1] = B.p; const th = 4 * Math.atan(A.bulge);
              const chord = Math.hypot(x1 - x0, y1 - y0); const r = chord / (2 * Math.sin(Math.abs(th) / 2));
              const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2; const s = A.bulge * chord / 2; // sagitta, signed
              const nx = (y1 - y0) / chord; const ny = -(x1 - x0) / chord;
              const mid = [mx + nx * s, my + ny * s];
              out.push({ kind: 'arc3', pts: [A.p, mid, B.p].map((p) => apply(mm, p)), layer: e.layerName });
              void r;
            } else out.push({ kind: 'line', a: apply(mm, A.p), b: apply(mm, B.p), layer: e.layerName });
          }
          break;
        }
        case 'ELLIPSE': {
          const c = apply(m, e.center); const ax = [e.majorAxis[0], e.majorAxis[1]];
          const whole = Math.abs((e.endParam ?? 2 * Math.PI) - (e.startParam ?? 0)) >= 2 * Math.PI - 1e-9;
          const rx = Math.hypot(...ax); const ry = rx * e.ratio;
          const tip = apply(m, [e.center[0] + ax[0], e.center[1] + ax[1]]);
          const scale = Math.sqrt(Math.abs(det(m)));
          if (whole && det(m) > 0) { out.push({ kind: 'ellipse', c, rx: rx * scale, ry: ry * scale, rot: Math.atan2(tip[1] - c[1], tip[0] - c[0]), layer: e.layerName }); break; }
          let t0 = e.startParam ?? 0; let t1 = e.endParam ?? 2 * Math.PI; while (t1 <= t0) t1 += 2 * Math.PI;
          const ux = ax.map((v) => v / rx); const vy = [-ux[1], ux[0]];
          const n = Math.max(8, Math.ceil(((t1 - t0) / (2 * Math.PI)) * 32));
          const pts = Array.from({ length: n + 1 }, (_, k) => { const t = t0 + ((t1 - t0) * k) / n; return apply(m, [e.center[0] + rx * Math.cos(t) * ux[0] + ry * Math.sin(t) * vy[0], e.center[1] + rx * Math.cos(t) * ux[1] + ry * Math.sin(t) * vy[1]]); });
          out.push({ kind: 'spline', pts, closed: whole, layer: e.layerName });
          break;
        }
        case 'SPLINE': {
          let pts;
          if (e.fit?.length >= 2) pts = e.fit.map((p) => apply(m, p));
          else if (e.control?.length >= 2 && e.knots?.length) {
            const flat = e.knots; const p = e.degree; const t0 = flat[p]; const t1 = flat[flat.length - 1 - p];
            const n = Math.max(8, e.control.length * 4);
            pts = Array.from({ length: n + 1 }, (_, k) => apply(m, curvePoint(p, flat, e.control.map((q) => [q[0], q[1], q[2] ?? 0]), e.weights?.length ? e.weights : null, t0 + ((t1 - t0) * k) / n)));
          }
          if (pts) out.push({ kind: 'spline', pts, closed: Boolean(e.closed) || (pts.length > 2 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-9), layer: e.layerName });
          break;
        }
        case 'POINT': out.push({ kind: 'point', p: apply(m, e.point), layer: e.layerName }); break;
        case 'TEXT': case 'MTEXT': {
          const text = e.name === 'MTEXT' ? plainMtext(e.text) : String(e.text ?? '');
          if (!text.trim()) break;
          const at = e.name === 'TEXT' && (e.halign || e.valign) && e.align ? e.align : e.insert;
          const rot = e.name === 'MTEXT' ? Math.atan2(e.xAxis?.[1] ?? 0, e.xAxis?.[0] ?? 1) : e.rotation ?? 0;
          const p = apply(m, at); const q = apply(m, [at[0] + Math.cos(rot), at[1] + Math.sin(rot)]);
          out.push({ kind: 'text', p, text: text.split('\n')[0], size: (e.height ?? 2.5) * Math.sqrt(Math.abs(det(m))), rot: Math.atan2(q[1] - p[1], q[0] - p[0]), layer: e.layerName });
          break;
        }
        case 'SOLID': {
          // Corner order 1-2-4-3 is the outline.
          const c = e.corners.map((p) => apply(m, p)); const ring = [c[0], c[1], c[3], c[2]];
          for (let i = 0; i < 4; i++) { const a = ring[i]; const b = ring[(i + 1) % 4]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-12) out.push({ kind: 'line', a, b, layer: e.layerName }); }
          break;
        }
        case 'INSERT': {
          if (e.dimension && !includeDimensions) { skipped.DIMENSION = (skipped.DIMENSION ?? 0) + 1; break; }
          const block = blockOf(e);
          if (!block || depth >= maxDepth) { skipped.INSERT = (skipped.INSERT ?? 0) + 1; break; }
          const [sx, sy] = e.scale ?? [1, 1, 1]; const r = e.rotation ?? 0; const cr = Math.cos(r); const sr = Math.sin(r);
          const base = block.base ?? [0, 0, 0];
          // Insert: translate(insert) · rotate(r) · scale(sx, sy) · translate(−base).
          const t = { a: cr * sx, b: sr * sx, c: -sr * sy, d: cr * sy, e: e.insert[0], f: e.insert[1] };
          const local = compose(t, { a: 1, b: 0, c: 0, d: 1, e: -base[0], f: -base[1] });
          walk(block.entities, compose(ocs, local), depth + 1);
          break;
        }
        default: skipped[e.name] = (skipped[e.name] ?? 0) + 1;
      }
    }
  };
  walk(model.modelSpace, IDENTITY, 0);
  return { items: out, skipped };
}

/** MTEXT without its formatting codes (\P paragraphs as new lines, {\f…; …} groups, \S stacks). */
export function plainMtext(s) {
  return String(s ?? '')
    .replace(/\\P/g, '\n').replace(/\\[ACcFfHhQqTtWw][^;]*;/g, '').replace(/\\S([^;]*);/g, (_, x) => x.replace(/[#^]/g, '/'))
    .replace(/\\[LlOoKk]/g, '').replace(/[{}]/g, '').replace(/\\\\/g, '\\');
}

/**
 * The sketch geometry (entities, no constraints) of flattened items, scaled by `scale` (to millimetres). End
 * points within `tol` of each other become one point.
 */
export function itemsToSketch(items, { scale = 1, tol = 1e-6 } = {}) {
  const sketch = createSketchGeometry();
  const pool = new Map(); // grid key → point id
  const key = (x, y) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  const pointAt = ([x, y]) => {
    const X = x * scale; const Y = y * scale; const k = key(X, Y);
    if (pool.has(k)) return pool.get(k);
    if (Math.hypot(X, Y) < tol) { pool.set(k, ORIGIN); return ORIGIN; }
    const id = `p${sketch.entities.length}_${pool.size}`;
    sketch.entities.push({ id, type: 'point', x: X, y: Y });
    pool.set(k, id);
    return id;
  };
  let count = 0;
  for (const it of items) {
    if (it.kind === 'line') {
      if (Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]) * scale < tol) continue;
      const from = pointAt(it.a); const to = pointAt(it.b); if (from === to) continue;
      addLine(sketch, 0, 0, 0, 0, { from, to }); count++;
    } else if (it.kind === 'circle') {
      const c = pointAt(it.c); addCircle(sketch, 0, 0, it.r * scale, { center: c }); count++;
    } else if (it.kind === 'arc3') {
      const [p0, pm, p1] = it.pts;
      const centre = circumcentre(p0, pm, p1);
      if (!centre) { addLine(sketch, 0, 0, 0, 0, { from: pointAt(p0), to: pointAt(p1) }); count++; continue; }
      // Sketch arcs run counter-clockwise from p1 to p2: a clockwise one is stored the other way round.
      const ccw = (pm[0] - p0[0]) * (p1[1] - p0[1]) - (pm[1] - p0[1]) * (p1[0] - p0[0]) > 0;
      const c = pointAt(centre); const a = pointAt(ccw ? p0 : p1); const b = pointAt(ccw ? p1 : p0);
      const r = Math.hypot(p0[0] - centre[0], p0[1] - centre[1]) * scale;
      addArc(sketch, 0, 0, r, 0, 0, { center: c, from: a, to: b }); count++;
    } else if (it.kind === 'ellipse') {
      const c = pointAt(it.c); addEllipse(sketch, 0, 0, it.rx * scale, it.ry * scale, it.rot, { center: c }); count++;
    } else if (it.kind === 'spline') {
      // A closed spline repeats its first point itself: a repeated last point is dropped here.
      const src = it.closed && it.pts.length > 2 && Math.hypot(it.pts[0][0] - it.pts.at(-1)[0], it.pts[0][1] - it.pts.at(-1)[1]) * scale < tol ? it.pts.slice(0, -1) : it.pts;
      if (src.length < 2) continue;
      const pts = src.map(([x, y]) => [x * scale, y * scale]);
      const ids = pts.map((p, i) => (i === 0 || (!it.closed && i === pts.length - 1) ? pointAt(src[i]) : undefined));
      addSpline(sketch, pts, { closed: it.closed, ids }); count++;
    } else if (it.kind === 'point') { pointAt(it.p); count++; }
    else if (it.kind === 'text') { addText(sketch, it.p[0] * scale, it.p[1] * scale, it.text, it.size * scale, it.rot); count++; }
  }
  return { sketch, count };
}

function circumcentre([x1, y1], [x2, y2], [x3, y3]) {
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-14 * Math.max(1, Math.abs(x1) + Math.abs(y1))) return null;
  const s1 = x1 * x1 + y1 * y1; const s2 = x2 * x2 + y2 * y2; const s3 = x3 * x3 + y3 * y3;
  return [(s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / d, (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / d];
}


