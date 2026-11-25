// What makes a sketch over defined: the relations and dimensions that conflict (the sketch cannot be solved with
// all of them; it can without this one) and the redundant ones (they add no condition the others do not already
// make — removing one leaves the freedoms as they are). Also the driven (reference) dimension switch and the
// baseline dimensions (several dimensions measured from one base entity). Plain numbers on the sketch.
import { analyse, solveSketch, cloneSketch, dimensionFor, addConstraint, measure, DIMENSIONS, byId, geomKind } from './sketch.js';

/**
 * { over, unsolvable, conflicts: [constraint id], redundant: [constraint id] } — conflicts: removing it alone lets the
 * sketch solve; redundant: removing it alone keeps the degrees of freedom and the sketch consistent. Driven and
 * suppressed constraints are not counted (they impose nothing).
 */
export function diagnoseSketch(sketch) {
  const a = analyse(sketch);
  a.redundant = Number(a.redundant) || 0;
  const out = { over: a.over, unsolvable: false, conflicts: [], redundant: [], dof: a.dof };
  if (!a.over && !a.redundant) return out;
  const live = sketch.constraints.filter((c) => !c.driven && !c.suppressed);
  if (a.over) {
    const trial = cloneSketch(sketch);
    out.unsolvable = !solveSketch(trial).ok;
    for (const c of live) {
      const t = cloneSketch(sketch);
      t.constraints = t.constraints.filter((k) => k.id !== c.id);
      const r = solveSketch(t);
      if (r.ok && !r.over) out.conflicts.push(c.id);
    }
  }
  if (a.redundant) {
    for (const c of live) {
      const t = cloneSketch(sketch);
      t.constraints = t.constraints.filter((k) => k.id !== c.id);
      const r = analyse(t);
      if (r.dof === a.dof && (Number(r.redundant) || 0) < a.redundant) out.redundant.push(c.id);
    }
  }
  return out;
}

/** Makes a dimension driven (a reference: it shows the measured value and imposes nothing) or driving again. */
export function setDriven(sketch, id, driven) {
  const c = sketch.constraints.find((k) => k.id === id);
  if (!c || !DIMENSIONS.includes(c.type)) return false;
  if (driven) { c.driven = true; c.value = Math.round(Math.abs(measure(sketch, { ...c, value: 0 })) * 1e6) / 1e6; return true; }
  // Driving again only when the sketch still solves with it.
  const t = cloneSketch(sketch);
  const k = t.constraints.find((x) => x.id === id); delete k.driven;
  if (!solveSketch(t).ok) return false;
  delete c.driven;
  return true;
}

/** Updates the values of the driven dimensions to what they measure now. */
export function refreshDriven(sketch) {
  for (const c of sketch.constraints) if (c.driven && DIMENSIONS.includes(c.type)) c.value = Math.round(Math.abs(measure(sketch, { ...c, value: 0 })) * 1e6) / 1e6;
}

/**
 * Sets where a distance dimension measures a circle or arc from: 'center', 'min' (its nearest point) or 'max' (its
 * farthest point), for the dimension's first (a) or second (b) entity. The value becomes the measured one.
 */
export function setArcCondition(sketch, id, which, cond) {
  const c = sketch.constraints.find((k) => k.id === id);
  if (!c || c.type !== 'distance') return false;
  const e = byId(sketch, which === 'b' ? c.b : c.a);
  if (geomKind(e) !== 'circle') return false;
  const key = which === 'b' ? 'condB' : 'condA';
  if (cond === 'center') delete c[key]; else c[key] = cond;
  c.value = Math.round(Math.abs(measure(sketch, { ...c, value: 0 })) * 1e6) / 1e6;
  return true;
}

/**
 * Baseline dimensions: from the base entity (a line or a point) to each of the others, measured horizontally,
 * vertically or straight ('hdistance' | 'vdistance' | 'distance'; 'auto' takes the base line's normal direction:
 * a vertical base gives horizontal dimensions). Each gets its measured value. Returns the dimensions added.
 */
export function baselineDimensions(sketch, baseId, others, kind = 'auto') {
  const base = byId(sketch, baseId);
  if (!base) return [];
  let k = kind;
  if (k === 'auto') {
    if (base.type === 'line') {
      const a = byId(sketch, base.p1); const b = byId(sketch, base.p2);
      k = Math.abs(b.x - a.x) < Math.abs(b.y - a.y) ? 'hdistance' : 'vdistance';
    } else k = 'hdistance';
  }
  const made = [];
  for (const id of others) {
    if (id === baseId) continue;
    const other = byId(sketch, id);
    // Horizontal / vertical distances run between points: a line's nearer end stands for it.
    let c;
    if (k === 'distance') c = dimensionFor(sketch, [baseId, id], 'distance');
    else {
      const pick = (e) => (e.type === 'point' ? e.id : e.type === 'line' ? e.p1 : e.c ?? e.id);
      const pb = pick(base); const po = pick(other);
      c = dimensionFor(sketch, [pb, po], k);
    }
    if (!c) continue;
    c.baseline = baseId;
    made.push(addConstraint(sketch, c));
  }
  return made;
}
