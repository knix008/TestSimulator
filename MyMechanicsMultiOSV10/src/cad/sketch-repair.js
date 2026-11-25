// Repair Sketch: finds and fixes what keeps a sketch from making clean profiles —
//   • lines of no length, and curves shorter than the gap tolerance between two other curves (removed);
//   • exact duplicates (the same curve twice: removed) and collinear lines that overlap (merged into one line);
//   • small gaps: curve ends closer than the tolerance that are not joined (the points merged, so the curves
//     share them);
// and then lists what it cannot decide: open ends (a curve end no other curve meets) and points where more
// than two curves meet. Construction geometry is left alone. Plain numbers on the sketch — no DOM, no kernel.
import { arcGeometry, byId, pointsOf, removeEntities, mergePoints, ORIGIN } from './sketch.js';

const ENDS = new Set(['line', 'arc', 'spline', 'ellipseArc', 'conic', 'equation']);
const endIds = (e) => (e.type === 'spline' ? [e.pts[0], e.pts[e.pts.length - 1]] : [e.p1, e.p2]);
const XY = (s, id) => { const p = byId(s, id); return p ? [p.x, p.y] : null; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const live = (s) => s.entities.filter((e) => ENDS.has(e.type) && !e.construction);

/** A curve's length (lines and arcs exactly, others along their points). */
function curveLength(s, e) {
  if (e.type === 'line') return dist(XY(s, e.p1), XY(s, e.p2));
  if (e.type === 'arc') { const g = arcGeometry(s, e); return g.r * (g.a1 - g.a0); }
  const ids = pointsOf(e); let L = 0;
  for (let i = 0; i + 1 < ids.length; i++) L += dist(XY(s, ids[i]), XY(s, ids[i + 1]));
  return L;
}

/** What is wrong with a sketch, without changing it: { gaps, duplicates, overlaps, tiny, openEnds, branches }. */
export function checkSketch(sketch, { gap = 0.01 } = {}) {
  const curves = live(sketch);
  const out = { gaps: [], duplicates: [], overlaps: [], tiny: [], openEnds: [], branches: [] };
  // Tiny curves.
  for (const e of curves) if (curveLength(sketch, e) <= gap) out.tiny.push(e.id);
  // Duplicates and collinear overlaps (lines); duplicate arcs and circles.
  const lines = curves.filter((e) => e.type === 'line' && !out.tiny.includes(e.id));
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    const a1 = XY(sketch, a.p1), a2 = XY(sketch, a.p2), b1 = XY(sketch, b.p1), b2 = XY(sketch, b.p2);
    const same = (dist(a1, b1) <= gap && dist(a2, b2) <= gap) || (dist(a1, b2) <= gap && dist(a2, b1) <= gap);
    if (same) { out.duplicates.push([a.id, b.id]); continue; }
    const L = dist(a1, a2); const d = [(a2[0] - a1[0]) / L, (a2[1] - a1[1]) / L];
    const off = (p) => Math.abs(d[0] * (p[1] - a1[1]) - d[1] * (p[0] - a1[0]));
    if (off(b1) > gap || off(b2) > gap) continue;
    const t = (p) => d[0] * (p[0] - a1[0]) + d[1] * (p[1] - a1[1]);
    const lo = Math.max(0, Math.min(t(b1), t(b2))); const hi = Math.min(L, Math.max(t(b1), t(b2)));
    if (hi - lo > gap) out.overlaps.push([a.id, b.id]);
  }
  const arcs = sketch.entities.filter((e) => (e.type === 'arc' || e.type === 'circle') && !e.construction);
  for (let i = 0; i < arcs.length; i++) for (let j = i + 1; j < arcs.length; j++) {
    const a = arcs[i], b = arcs[j];
    if (a.type !== b.type) continue;
    if (a.type === 'circle') { if (dist(XY(sketch, a.c), XY(sketch, b.c)) <= gap && Math.abs(a.r - b.r) <= gap) out.duplicates.push([a.id, b.id]); continue; }
    if (dist(XY(sketch, a.c), XY(sketch, b.c)) <= gap && dist(XY(sketch, a.p1), XY(sketch, b.p1)) <= gap && dist(XY(sketch, a.p2), XY(sketch, b.p2)) <= gap) out.duplicates.push([a.id, b.id]);
  }
  // Ends: how many curves use each end point; ends within the gap of another end that are not the same point.
  const use = new Map();
  for (const e of curves) for (const p of endIds(e)) use.set(p, (use.get(p) ?? 0) + 1);
  const pts = [...use.keys()];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = dist(XY(sketch, pts[i]), XY(sketch, pts[j]));
    if (d <= gap) out.gaps.push([pts[i], pts[j], d]);
  }
  const gapped = new Set(out.gaps.flatMap(([a, b]) => [a, b]));
  for (const [p, n] of use) { if (n === 1 && !gapped.has(p)) out.openEnds.push(p); if (n > 2) out.branches.push(p); }
  return out;
}

/**
 * Repairs a sketch (see the file header). `gap`: the largest gap closed and the shortest curve kept. Returns
 * { removedTiny, removedDuplicates, mergedOverlaps, closedGaps, openEnds, branches } (counts, and the point ids
 * still open / branching).
 */
export function repairSketch(sketch, { gap = 0.01 } = {}) {
  const report = { removedTiny: 0, removedDuplicates: 0, mergedOverlaps: 0, closedGaps: 0, openEnds: [], branches: [] };
  // 1. Tiny curves: their two ends become one point (so the neighbours stay joined), then the curve goes.
  for (const id of checkSketch(sketch, { gap }).tiny) {
    const e = byId(sketch, id); if (!e) continue;
    const [a, b] = endIds(e);
    removeEntities(sketch, [id]);
    if (byId(sketch, a) && byId(sketch, b) && a !== b) mergePoints(sketch, b === ORIGIN ? a : b, b === ORIGIN ? b : a);
    report.removedTiny++;
  }
  // 2. Duplicates go.
  for (const [, b] of checkSketch(sketch, { gap }).duplicates) {
    if (!byId(sketch, b)) continue;
    const e = byId(sketch, b);
    const keep = new Set(sketch.entities.filter((x) => x.id !== b && x.type !== 'point').flatMap(pointsOf));
    sketch.entities = sketch.entities.filter((x) => x.id !== b);
    sketch.constraints = sketch.constraints.filter((c) => ![c.a, c.b, c.c].includes(b));
    for (const p of pointsOf(e)) if (!keep.has(p) && p !== ORIGIN) sketch.entities = sketch.entities.filter((x) => x.id !== p);
    report.removedDuplicates++;
  }
  // 3. Overlapping collinear lines: one line over both (its ends the outermost of the four).
  for (let guard = 0; guard < 1000; guard++) {
    const ov = checkSketch(sketch, { gap }).overlaps[0];
    if (!ov) break;
    const [ia, ib] = ov; const a = byId(sketch, ia); const b = byId(sketch, ib);
    const a1 = XY(sketch, a.p1), a2 = XY(sketch, a.p2);
    const L = dist(a1, a2); const d = [(a2[0] - a1[0]) / L, (a2[1] - a1[1]) / L];
    const t = (id) => { const p = XY(sketch, id); return d[0] * (p[0] - a1[0]) + d[1] * (p[1] - a1[1]); };
    const ends = [a.p1, a.p2, b.p1, b.p2].sort((x, y) => t(x) - t(y));
    const lo = ends[0], hi = ends[3];
    // b's points: kept where another curve uses them (they stay on the merged line).
    a.p1 = lo; a.p2 = hi;
    sketch.entities = sketch.entities.filter((x) => x.id !== ib);
    sketch.constraints = sketch.constraints.filter((c) => ![c.a, c.b, c.c].includes(ib));
    const used = new Set(sketch.entities.filter((x) => x.type !== 'point').flatMap(pointsOf));
    for (const p of [b.p1, b.p2, ...ends]) if (!used.has(p) && p !== ORIGIN && !byId(sketch, p)?.standalone) sketch.entities = sketch.entities.filter((x) => x.id !== p);
    report.mergedOverlaps++;
  }
  // 4. Small gaps: the end points merge (into the origin when one of them is it).
  for (let guard = 0; guard < 10000; guard++) {
    const g = checkSketch(sketch, { gap }).gaps[0];
    if (!g) break;
    const [p, q] = g;
    if (q === ORIGIN) mergePoints(sketch, p, q); else mergePoints(sketch, q, p);
    report.closedGaps++;
  }
  const after = checkSketch(sketch, { gap });
  report.openEnds = after.openEnds; report.branches = after.branches;
  return report;
}
