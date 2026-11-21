// Cosmetic threads on drawing views, the ISO 6410-1 way (a modelled thread is in the solid and needs no marks):
//   external, side view   thin continuous lines at the minor diameter over the threaded length, a thick line
//                         across the major diameter where the thread ends (the thread limit)
//   external, end view    a thin circle of about three quarters at the minor diameter (only when the threaded
//                         end faces the viewer)
//   internal, side view   the hole is inside the material: the major-diameter lines and the limit, dashed
//   internal, end view    the three-quarter thin circle at the major diameter (when the entry faces the viewer)
// Oblique (pictorial) views show no marks. Paths are in the projection's own coordinates — (p·x, −p·y) with the
// view basis of drawing.js viewBasis — so they go with the projected lines. No DOM, no kernel.
import { viewBasis } from './drawing.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const num = (v) => String(Math.round(v * 1e4) / 1e4);

/** Major / minor diameters of a thread record (old records only have the modelled radius and the pitch). */
export function threadDiameters(th) {
  if (th.major && th.minor) return { major: th.major, minor: th.minor };
  const P = Number(th.pitch) || 1;
  const r = Number(th.radius) || 1;
  return th.internal ? { minor: 2 * r, major: 2 * r + 1.0825 * P } : { major: 2 * r, minor: 2 * r - 1.2269 * P };
}

/**
 * The marks of `threads` (cosmetic thread records in the model's coordinates) on a view: { thin, thick, hidden }
 * — lists of SVG path strings in projection coordinates. `basis`: { dir, x, y } (viewBasis), or a view object.
 */
export function drawingThreadMarks(threads, viewOrBasis) {
  const b = viewOrBasis?.dir && viewOrBasis?.x && viewOrBasis?.y ? viewOrBasis : viewBasis(viewOrBasis);
  const out = { thin: [], thick: [], hidden: [] };
  if (!b || !Array.isArray(threads)) return out;
  const P = (p) => [dot(p, b.x), -dot(p, b.y)];
  const line = (a, c) => `M ${num(a[0])} ${num(a[1])} L ${num(c[0])} ${num(c[1])}`;
  for (const th of threads) {
    if (!th || th.modelled || !Array.isArray(th.centre) || !Array.isArray(th.dir) || !(th.length > 0)) continue;
    const ax = unit(th.dir);
    const { major, minor } = threadDiameters(th);
    const k = dot(ax, b.dir);
    const start = th.centre; const end = th.centre.map((v, i) => v + ax[i] * th.length);
    if (Math.abs(k) > 0.999) {
      // End view: the threaded end must face the viewer (the thread runs away from it).
      if (k > 1e-9) continue;
      const r = (th.internal ? major : minor) / 2;
      const c = P(start);
      // About three quarters of a circle, open in the upper right quadrant (sheet y is down in path space).
      const a0 = 0.1; const a1 = 1.5 * Math.PI - 0.1; const n = 36;
      const pts = Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
      out.thin.push(`M ${num(pts[0][0])} ${num(pts[0][1])}${pts.slice(1).map(([x, y]) => ` L ${num(x)} ${num(y)}`).join('')}`);
      continue;
    }
    if (Math.abs(k) > 1e-3) continue; // pictorial
    // Side view: the radial direction in the sheet, perpendicular to the axis.
    const a2 = P(ax.map((v) => v)); const o2 = P([0, 0, 0]);
    let u = [a2[0] - o2[0], a2[1] - o2[1]]; const ul = Math.hypot(u[0], u[1]) || 1; u = [u[0] / ul, u[1] / ul];
    const nrm = [-u[1], u[0]];
    const s0 = P(start); const s1 = P(end);
    const off = (p, r) => [p[0] + nrm[0] * r, p[1] + nrm[1] * r];
    if (th.internal) {
      const r = major / 2;
      out.hidden.push(line(off(s0, r), off(s1, r)), line(off(s0, -r), off(s1, -r)), line(off(s1, r), off(s1, -r)));
    } else {
      const r = minor / 2;
      out.thin.push(line(off(s0, r), off(s1, r)), line(off(s0, -r), off(s1, -r)));
      out.thick.push(line(off(s1, major / 2), off(s1, -major / 2)));
    }
  }
  return out;
}

/** The projection with the thread marks added (`threads` — see drawingThreadMarks). A new object; the cached projection stays as it was. */
export function withThreadMarks(projection, view, threads) {
  if (!projection || !threads?.length || view?.kind === 'detail') return projection;
  const marks = drawingThreadMarks(threads, projection.basis ?? view);
  if (!marks.thin.length && !marks.thick.length && !marks.hidden.length) return projection;
  return { ...projection, threads: marks };
}
