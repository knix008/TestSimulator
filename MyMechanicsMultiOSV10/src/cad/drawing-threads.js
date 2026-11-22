// Cosmetic threads on drawing views, the ISO 6410-1 way (a modelled thread is in the solid and needs no marks):
//   external, side view   thin continuous lines at the minor diameter over the threaded length, a thick line
//                         across the major diameter where the thread ends (the thread limit); where the thread
//                         is hidden behind other material (a bolt inside a plate) the same lines dashed
//   external, end view    a thin circle of about three quarters at the minor diameter (only when the threaded
//                         end faces the viewer)
//   internal, side view   the hole is inside the material: the major-diameter lines and the limit, dashed
//   internal, end view    the three-quarter thin circle at the major diameter (when the entry faces the viewer)
//   section views         a thread the cutting plane runs through (its axis in the plane): external — thin lines at
//                         the minor diameter, the thick limit (the cut shank is hatched to the major diameter);
//                         internal — thin lines at the major diameter, the thick limit across it (the cut part is
//                         hatched to the minor diameter, the drilled hole); threads behind the plane as side views,
//                         those in the removed part not at all
// Oblique (pictorial) views show no marks. Paths are in the projection's own coordinates — (p·x, −p·y) with the
// view basis of drawing.js viewBasis — so they go with the projected lines. Hidden parts: occlusion() samples
// the thread's front surface along its length with the kernel (a short ray toward the viewer).
import { viewBasis } from './drawing.js';
import { rep } from './kernel.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const num = (v) => String(Math.round(v * 1e4) / 1e4);
const SAMPLES = 6;

/** Major / minor diameters of a thread record (old records only have the modelled radius and the pitch). */
export function threadDiameters(th) {
  if (th.major && th.minor) return { major: th.major, minor: th.minor };
  const P = Number(th.pitch) || 1;
  const r = Number(th.radius) || 1;
  return th.internal ? { minor: 2 * r, major: 2 * r + 1.0825 * P } : { major: 2 * r, minor: 2 * r - 1.2269 * P };
}

/**
 * Which stretches of a thread are hidden in a view: SAMPLES intervals along its length, each `true` when the
 * thread's front surface (the major diameter, toward the viewer) has other material in front of it — a ray from
 * just outside it toward the viewer touches the shape. `shape`: the drawing's model.
 */
export function occlusion(shape, th, viewDir) {
  const R = rep();
  const ax = unit(th.dir); const v = unit(viewDir);
  const r = threadDiameters(th).major / 2;
  // The direction toward the viewer, square to the axis (for a side view it is the view direction itself).
  const k = dot(v, ax); const out = unit([v[0] - ax[0] * k, v[1] - ax[1] * k, v[2] - ax[2] * k]);
  let size = 1000;
  try { const [lo, hi] = shape.boundingBox.bounds; size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 2 + 10; } catch { /* default */ }
  const res = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = ((i + 0.5) / SAMPLES) * th.length;
    const p = [0, 1, 2].map((j) => th.centre[j] + ax[j] * t + out[j] * (r + 0.05 + 0.02 * r));
    const q = p.map((x, j) => x + v[j] * size);
    let hidden = false;
    try { const ray = R.makeLine(p, q); hidden = R.measureDistanceBetween(ray, shape) < 1e-4; ray.delete?.(); } catch { hidden = false; }
    res.push(hidden);
  }
  return res;
}

/**
 * The marks of `threads` (cosmetic thread records in the model's coordinates) on a view: { thin, thick, hidden }
 * — lists of SVG path strings in projection coordinates. `view`: a view object (or a basis { dir, x, y }).
 * `hiddenOf(th)`: SAMPLES booleans (occlusion) or null (all visible); `section`: { point, normal } of a section view.
 */
export function drawingThreadMarks(threads, view, { hiddenOf = null, section = null } = {}) {
  const b = view?.dir && view?.x && view?.y ? view : viewBasis(view);
  const out = { thin: [], thick: [], hidden: [] };
  if (!b || !Array.isArray(threads)) return out;
  const P = (p) => [dot(p, b.x), -dot(p, b.y)];
  const line = (a, c) => `M ${num(a[0])} ${num(a[1])} L ${num(c[0])} ${num(c[1])}`;
  for (const th of threads) {
    if (!th || th.modelled || !Array.isArray(th.centre) || !Array.isArray(th.dir) || !(th.length > 0)) continue;
    const ax = unit(th.dir);
    const { major, minor } = threadDiameters(th);
    const k = dot(ax, b.dir);
    const start = th.centre; const at = (t) => th.centre.map((v, i) => v + ax[i] * t);
    const end = at(th.length);
    // A section view: cut through (axis in the plane), in the removed part (skip), or behind it (as usual).
    let cut = false; let across = false;
    if (section) {
      const n = unit(section.normal);
      const ds = dot(start.map((v, i) => v - section.point[i]), n); const de = dot(end.map((v, i) => v - section.point[i]), n);
      const inPlane = Math.abs(dot(ax, n)) < 1e-3;
      if (inPlane && Math.abs(ds) < minor / 2) cut = true;
      else if (!inPlane && Math.min(ds, de) < 0 && Math.max(ds, de) > 0) across = true;
      else if (Math.max(ds, de) > 1e-9) continue; // in the part the section takes away
    }
    if (Math.abs(k) > 0.999) {
      // End view: the threaded end must face the viewer (the thread runs away from it) — or, in a section, the
      // plane cuts across the thread: the same three-quarter circle where it is cut.
      if (k > 1e-9 && !across) continue;
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
    const a2 = P(ax); const o2 = P([0, 0, 0]);
    let u = [a2[0] - o2[0], a2[1] - o2[1]]; const ul = Math.hypot(u[0], u[1]) || 1; u = [u[0] / ul, u[1] / ul];
    const nrm = [-u[1], u[0]];
    const off = (p, r) => [p[0] + nrm[0] * r, p[1] + nrm[1] * r];
    const s1 = P(end);
    if (cut) {
      const r = (th.internal ? major : minor) / 2;
      const s0 = P(start);
      out.thin.push(line(off(s0, r), off(s1, r)), line(off(s0, -r), off(s1, -r)));
      out.thick.push(line(off(s1, major / 2), off(s1, -major / 2)));
      continue;
    }
    if (th.internal) {
      const r = major / 2; const s0 = P(start);
      out.hidden.push(line(off(s0, r), off(s1, r)), line(off(s0, -r), off(s1, -r)), line(off(s1, r), off(s1, -r)));
      continue;
    }
    // External: each stretch visible (thin) or hidden behind other material (dashed); the limit likewise.
    const hid = hiddenOf?.(th) ?? null;
    const r = minor / 2;
    let i = 0;
    while (i < SAMPLES) {
      const h = Boolean(hid?.[i]); let j = i;
      while (j + 1 < SAMPLES && Boolean(hid?.[j + 1]) === h) j++;
      const a = P(at((i / SAMPLES) * th.length)); const c = P(at(((j + 1) / SAMPLES) * th.length));
      (h ? out.hidden : out.thin).push(line(off(a, r), off(c, r)), line(off(a, -r), off(c, -r)));
      i = j + 1;
    }
    (hid?.[SAMPLES - 1] ? out.hidden : out.thick).push(line(off(s1, major / 2), off(s1, -major / 2)));
  }
  return out;
}

/**
 * The projection with the thread marks added (`threads` — see drawingThreadMarks). A new object; the cached
 * projection stays as it was. `shape`: the drawing's model, for the hidden stretches (optional).
 */
export function withThreadMarks(projection, view, threads, { shape = null, cache = null } = {}) {
  if (!projection || !threads?.length || view?.kind === 'detail') return projection;
  const basis = projection.basis ?? viewBasis(view);
  if (!basis) return projection;
  const hiddenOf = shape ? (th) => {
    const key = JSON.stringify([th.centre, th.dir, th.length, basis.dir]);
    if (cache?.has(key)) return cache.get(key);
    const h = occlusion(shape, th, basis.dir);
    cache?.set(key, h);
    return h;
  } : null;
  const section = view?.kind === 'section' && view.plane ? { point: view.plane.point ?? [0, 0, 0], normal: view.plane.normal } : null;
  const marks = drawingThreadMarks(threads, basis, { hiddenOf, section });
  if (!marks.thin.length && !marks.thick.length && !marks.hidden.length) return projection;
  return { ...projection, threads: marks };
}
