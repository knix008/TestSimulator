// Sketcher constraints (FreeCAD Sketcher) on lines, circles, arcs and points,
// kept in drawing.constraints and solved numerically after every change.
//
//   { id, type, refs: [{ id, at }], value }      at: 'p1' 'p2' (line), 'c' (circle/arc),
//                                                'start' 'end' (arc), 'p' (point)
// The solver is Gauss–Newton with weighted minimum-norm steps: each step fixes
// the constraints while moving the lightest variables least — geometry the user
// just edited is heavy, so the rest follows it.

export const CONSTRAINT_TYPES = [
  'coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'equal', 'tangent', 'concentric',
  'pointOnObject', 'symmetric', 'fixed', 'distance', 'distanceX', 'distanceY', 'radius', 'diameter', 'angle',
];
/** Constraints that carry a value (dimensional constraints). */
export const DIMENSIONAL = ['distance', 'distanceX', 'distanceY', 'radius', 'diameter', 'angle'];

const PARAMS = { line: ['x1', 'y1', 'x2', 'y2'], circle: ['cx', 'cy', 'r'], arc: ['cx', 'cy', 'r', 'start', 'end'], point: ['x', 'y'] };
export const isConstrainable = (e) => Boolean(e && PARAMS[e.type]);
const isRound = (e) => e?.type === 'circle' || e?.type === 'arc';
const POINTS = { line: ['p1', 'p2'], circle: ['c'], arc: ['c', 'start', 'end'], point: ['p'] };
export const pointsOf = (e) => POINTS[e?.type] ?? [];

const rad = (d) => (d * Math.PI) / 180;
let counter = 0;
const newId = () => `k-${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Constraints read from a file (unknown types and broken refs dropped). */
export function normalizeConstraints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && CONSTRAINT_TYPES.includes(c.type) && Array.isArray(c.refs) && c.refs.length && c.refs.every((r) => r && typeof r.id === 'string'))
    .map((c) => ({
      id: typeof c.id === 'string' && c.id ? c.id : newId(),
      type: c.type,
      refs: c.refs.map((r) => ({ id: r.id, ...(typeof r.at === 'string' ? { at: r.at } : {}) })),
      ...(DIMENSIONAL.includes(c.type) && Number.isFinite(Number(c.value)) ? { value: Number(c.value) } : {}),
    }));
}

// ───────────────────────── measuring (also used for a new dimensional constraint's value)

/** A point of an entity from a parameter getter g(key). */
function pointWith(type, at, g) {
  switch (type) {
    case 'line': return at === 'p2' ? { x: g('x2'), y: g('y2') } : { x: g('x1'), y: g('y1') };
    case 'point': return { x: g('x'), y: g('y') };
    case 'circle': return { x: g('cx'), y: g('cy') };
    case 'arc': {
      if (at === 'start' || at === 'end') {
        const a = rad(g(at));
        return { x: g('cx') + g('r') * Math.cos(a), y: g('cy') + g('r') * Math.sin(a) };
      }
      return { x: g('cx'), y: g('cy') };
    }
    default: return { x: 0, y: 0 };
  }
}

const getterOf = (e) => (key) => e[key];

/** A named point of an entity ('p1', 'c', 'start' …). */
export const entityPoint = (e, at) => pointWith(e.type, at, getterOf(e));

/** The current value of a dimensional constraint (mm or degrees). */
export function measureConstraint(drawing, type, refs) {
  const ents = refs.map((r) => drawing.entities.find((e) => e.id === r.id));
  if (ents.some((e) => !e)) return null;
  const [a, b] = ents;
  if (type === 'radius') return isRound(a) ? a.r : null;
  if (type === 'diameter') return isRound(a) ? a.r * 2 : null;
  if (type === 'distance') {
    if (refs.length === 1 && a.type === 'line') return Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
    if (refs.length === 2) {
      const p = pointWith(a.type, refs[0].at, getterOf(a));
      const q = pointWith(b.type, refs[1].at, getterOf(b));
      return Math.hypot(q.x - p.x, q.y - p.y);
    }
    return null;
  }
  if (type === 'distanceX' || type === 'distanceY') {
    // Signed, as FreeCAD: from the first point to the second (or along the line).
    const key = type === 'distanceX' ? 'x' : 'y';
    if (refs.length === 1 && a.type === 'line') return type === 'distanceX' ? a.x2 - a.x1 : a.y2 - a.y1;
    if (refs.length === 2) return pointWith(b.type, refs[1].at, getterOf(b))[key] - pointWith(a.type, refs[0].at, getterOf(a))[key];
    return null;
  }
  if (type === 'angle' && a.type === 'line' && b?.type === 'line') {
    const d1 = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
    const d2 = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
    let deg = (((d2 - d1) * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    return deg;
  }
  return null;
}

/** Is this a valid combination of type and referenced entities? */
export function canConstrain(type, ents, refs = []) {
  const [a, b] = ents;
  const n = ents.length;
  const L = (e) => e?.type === 'line';
  const hasPoints = refs.length === n && refs.every((r, i) => pointsOf(ents[i]).includes(r.at));
  switch (type) {
    case 'coincident': return n === 2 && hasPoints;
    case 'horizontal': case 'vertical': return (n === 1 && L(a)) || (n === 2 && hasPoints);
    case 'parallel': case 'perpendicular': case 'angle': return n === 2 && L(a) && L(b);
    case 'equal': return n === 2 && ((L(a) && L(b)) || (isRound(a) && isRound(b)));
    case 'tangent': return n === 2 && ((L(a) && isRound(b)) || (isRound(a) && L(b)) || (isRound(a) && isRound(b)));
    case 'concentric': return n === 2 && isRound(a) && isRound(b);
    case 'pointOnObject': return n === 2 && pointsOf(a).includes(refs[0]?.at) && (L(b) || isRound(b));
    case 'fixed': return n >= 1 && ents.every(isConstrainable);
    case 'distance': case 'distanceX': case 'distanceY': return (n === 1 && L(a)) || (n === 2 && hasPoints);
    case 'symmetric': return n === 3 && L(ents[2]) && pointsOf(a).includes(refs[0]?.at) && pointsOf(b).includes(refs[1]?.at) && !refs[2]?.at;
    case 'radius': case 'diameter': return n === 1 && isRound(a);
    default: return false;
  }
}

// ───────────────────────── residuals

/** Residual functions of one constraint, given point(ref) and param(ref, key) accessors. */
function residuals(c, ents, P, V) {
  const [a, b] = ents;
  const [ra, rb] = c.refs;
  const dir = (ref) => {
    const p = P({ ...ref, at: 'p1' });
    const q = P({ ...ref, at: 'p2' });
    return { x: q.x - p.x, y: q.y - p.y };
  };
  const len = (v) => Math.hypot(v.x, v.y) || 1e-12;
  switch (c.type) {
    case 'coincident': {
      const p = P(ra); const q = P(rb);
      return [p.x - q.x, p.y - q.y];
    }
    case 'horizontal': case 'vertical': {
      const [p, q] = c.refs.length === 1 ? [P({ ...ra, at: 'p1' }), P({ ...ra, at: 'p2' })] : [P(ra), P(rb)];
      return [c.type === 'horizontal' ? q.y - p.y : q.x - p.x];
    }
    case 'parallel': {
      const u = dir(ra); const v = dir(rb);
      return [(u.x * v.y - u.y * v.x) / Math.sqrt(len(u) * len(v))];
    }
    case 'perpendicular': {
      const u = dir(ra); const v = dir(rb);
      return [(u.x * v.x + u.y * v.y) / Math.sqrt(len(u) * len(v))];
    }
    case 'equal':
      if (a.type === 'line') return [len(dir(ra)) - len(dir(rb))];
      return [V(ra, 'r') - V(rb, 'r')];
    case 'concentric': {
      const p = P({ ...ra, at: 'c' }); const q = P({ ...rb, at: 'c' });
      return [p.x - q.x, p.y - q.y];
    }
    case 'tangent': {
      if (isRound(a) && isRound(b)) {
        const p = P({ ...ra, at: 'c' }); const q = P({ ...rb, at: 'c' });
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        const r1 = V(ra, 'r'); const r2 = V(rb, 'r');
        // Outside each other, or one inside the other: whichever is nearer now.
        return [Math.abs(d - (r1 + r2)) <= Math.abs(d - Math.abs(r1 - r2)) ? d - (r1 + r2) : d - Math.abs(r1 - r2)];
      }
      const [lineRef, roundRef] = a.type === 'line' ? [ra, rb] : [rb, ra];
      const p = P({ ...lineRef, at: 'p1' }); const u = dir(lineRef);
      const cpt = P({ ...roundRef, at: 'c' });
      const dist = Math.abs(u.x * (cpt.y - p.y) - u.y * (cpt.x - p.x)) / len(u);
      return [dist - V(roundRef, 'r')];
    }
    case 'pointOnObject': {
      const p = P(ra);
      if (b.type === 'line') {
        const q = P({ ...rb, at: 'p1' }); const u = dir(rb);
        return [(u.x * (p.y - q.y) - u.y * (p.x - q.x)) / len(u)];
      }
      const cpt = P({ ...rb, at: 'c' });
      return [Math.hypot(p.x - cpt.x, p.y - cpt.y) - V(rb, 'r')];
    }
    case 'distance': {
      if (c.refs.length === 1) return [len(dir(ra)) - c.value];
      const p = P(ra); const q = P(rb);
      return [Math.hypot(q.x - p.x, q.y - p.y) - c.value];
    }
    case 'distanceX': case 'distanceY': {
      const key = c.type === 'distanceX' ? 'x' : 'y';
      if (c.refs.length === 1) return [P({ ...ra, at: 'p2' })[key] - P({ ...ra, at: 'p1' })[key] - c.value];
      return [P(rb)[key] - P(ra)[key] - c.value];
    }
    case 'symmetric': {
      // The middle of the two points on the line, and the two points square across it.
      const p = P(ra); const q = P(rb);
      const lineRef = c.refs[2];
      const o = P({ ...lineRef, at: 'p1' }); const u = dir(lineRef);
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      return [(u.x * (m.y - o.y) - u.y * (m.x - o.x)) / len(u), ((q.x - p.x) * u.x + (q.y - p.y) * u.y) / len(u)];
    }
    case 'radius': return [V(ra, 'r') - c.value];
    case 'diameter': return [2 * V(ra, 'r') - c.value];
    case 'angle': {
      const u = dir(ra); const v = dir(rb);
      const want = rad(c.value);
      // Rotate u by the wanted angle: it must then point along v.
      const w = { x: u.x * Math.cos(want) - u.y * Math.sin(want), y: u.x * Math.sin(want) + u.y * Math.cos(want) };
      return [Math.atan2(w.x * v.y - w.y * v.x, w.x * v.x + w.y * v.y) * Math.sqrt(len(u) * len(v))];
    }
    default: return [];
  }
}

// ───────────────────────── linear algebra

/** Solves A x = b (A n×n, copied) by Gaussian elimination with partial pivoting; null if singular. */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-14) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      if (!f) continue;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Rank of a matrix (rows × cols), with a relative tolerance. */
function rankOf(J) {
  const M = J.map((row) => [...row]);
  const rows = M.length;
  const cols = rows ? M[0].length : 0;
  const scale = Math.max(1e-12, ...M.flat().map(Math.abs));
  let rank = 0;
  for (let col = 0; col < cols && rank < rows; col++) {
    let pivot = rank;
    for (let r = rank + 1; r < rows; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-9 * scale) continue;
    [M[rank], M[pivot]] = [M[pivot], M[rank]];
    for (let r = rank + 1; r < rows; r++) {
      const f = M[r][col] / M[rank][col];
      for (let k = col; k < cols; k++) M[r][k] -= f * M[rank][k];
    }
    rank++;
  }
  return rank;
}

// ───────────────────────── solver

/**
 * The system for a drawing: variables, residual function, Jacobian. Entities in
 * `held` are constants like fixed ones; `moved` ones are heavy (move least).
 * Constraints on constants only are not equations (`settled` checks them).
 */
function buildSystem(drawing, { moved = new Set(), held = new Set() } = {}) {
  const byId = new Map(drawing.entities.map((e) => [e.id, e]));
  const fixed = new Set([...(drawing.constraints ?? []).filter((c) => c.type === 'fixed').flatMap((c) => c.refs.map((r) => r.id)), ...held]);
  const usable = (drawing.constraints ?? []).filter((c) => c.refs.every((r) => isConstrainable(byId.get(r.id))) && c.type !== 'fixed'
    && canConstrain(c.type, c.refs.map((r) => byId.get(r.id)), c.refs) && (!DIMENSIONAL.includes(c.type) || Number.isFinite(c.value)));
  const constraints = usable.filter((c) => c.refs.some((r) => !fixed.has(r.id)));
  const settledOnes = usable.filter((c) => c.refs.every((r) => fixed.has(r.id)));
  const ids = [...new Set(constraints.flatMap((c) => c.refs.map((r) => r.id)))].filter((id) => !fixed.has(id));
  const index = new Map();
  const x0 = [];
  const weight = [];
  for (const id of ids) {
    const e = byId.get(id);
    for (const key of PARAMS[e.type]) {
      index.set(`${id}.${key}`, x0.length);
      x0.push(e[key]);
      // Angles are in degrees: about a hundredth of a unit length per degree.
      weight.push((moved.has(id) ? 1e4 : 1) * (key === 'start' || key === 'end' ? 0.01 : 1));
    }
  }
  const evaluateList = (list, x) => {
    const V = (ref, key) => {
      const i = index.get(`${ref.id}.${key}`);
      return i === undefined ? byId.get(ref.id)[key] : x[i];
    };
    const P = (ref) => pointWith(byId.get(ref.id).type, ref.at, (key) => V(ref, key));
    return list.flatMap((c) => residuals(c, c.refs.map((r) => byId.get(r.id)), P, V));
  };
  const evaluate = (x) => evaluateList(constraints, x);
  const jacobian = (x) => {
    const base = evaluate(x);
    const J = base.map(() => new Array(x.length).fill(0));
    for (let j = 0; j < x.length; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(x[j]));
      const xp = x.slice(); xp[j] += h;
      const xm = x.slice(); xm[j] -= h;
      const rp = evaluate(xp);
      const rm = evaluate(xm);
      for (let i = 0; i < base.length; i++) J[i][j] = (rp[i] - rm[i]) / (2 * h);
    }
    return J;
  };
  const settled = () => norm(evaluateList(settledOnes, x0));
  return { constraints, usable, ids, index, x0, weight, evaluate, jacobian, byId, settled };
}

const norm = (r) => Math.sqrt(r.reduce((s, v) => s + v * v, 0));

/** Gauss–Newton with weighted minimum-norm steps. Returns { x, residual }. */
function runSolver(sys, iterations) {
  let x = sys.x0.slice();
  let r = sys.evaluate(x);
  let res = norm(r);
  const invW = sys.weight.map((w) => 1 / w);
  for (let it = 0; it < iterations && res > 1e-10; it++) {
    const J = sys.jacobian(x);
    // dx = −W⁻¹Jᵀ (J W⁻¹ Jᵀ + εI)⁻¹ r
    const m = r.length;
    const A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, k) => {
      let s = 0;
      for (let j = 0; j < x.length; j++) s += J[i][j] * invW[j] * J[k][j];
      return s + (i === k ? 1e-10 : 0);
    }));
    const y = solveLinear(A, r);
    if (!y) break;
    const dx = x.map((_, j) => -invW[j] * J.reduce((s, row, i) => s + row[j] * y[i], 0));
    // Halve the step until the residual drops.
    let step = 1;
    let next = null;
    for (let k = 0; k < 12; k++) {
      const trial = x.map((v, j) => v + step * dx[j]);
      const tr = sys.evaluate(trial);
      const n = norm(tr);
      if (n < res) { next = trial; res = n; r = tr; break; }
      step /= 2;
    }
    if (!next) break;
    x = next;
  }
  return { x, residual: res };
}

/** Writes solved values back as new objects (views cache by object; radii stay positive, arc angles 0…360). */
function writeBack(drawing, sys, x) {
  const patches = new Map();
  for (const [key, i] of sys.index) {
    const [id, param] = key.split('.');
    let v = x[i];
    if (param === 'r') v = Math.max(1e-6, Math.abs(v));
    if (param === 'start' || param === 'end') v = ((v % 360) + 360) % 360;
    if (Math.abs(v - sys.byId.get(id)[param]) < 1e-12) continue;
    if (!patches.has(id)) patches.set(id, {});
    patches.get(id)[param] = v;
  }
  if (patches.size) drawing.entities = drawing.entities.map((e) => (patches.has(e.id) ? { ...e, ...patches.get(e.id) } : e));
}

/** Degrees of freedom and health of the sketch as it is now. */
export function constraintStatus(drawing) {
  const sys = buildSystem(drawing);
  if (!sys.usable.length) return { ok: true, residual: 0, dof: 0, equations: 0, rank: 0, status: 'none' };
  const r = sys.evaluate(sys.x0);
  const residual = Math.hypot(norm(r), sys.settled());
  const J = sys.x0.length ? sys.jacobian(sys.x0) : [];
  const rank = J.length ? rankOf(J) : 0;
  const equations = r.length;
  const dof = sys.x0.length - rank;
  const ok = residual < 1e-6;
  const status = !ok ? 'conflict' : equations > rank ? 'over' : dof === 0 ? 'full' : 'under';
  return { ok, residual, dof, equations, rank, status };
}

/**
 * Solves the drawing's constraints in place. `moved` = ids of entities the user
 * just changed: first they are held where they are (like dragging in FreeCAD);
 * if that cannot work they only weigh more. Returns constraintStatus().
 */
export function solveConstraints(drawing, { moved = new Set(), iterations = 60 } = {}) {
  dropBroken(drawing);
  if (moved.size) {
    const held = buildSystem(drawing, { held: moved });
    const tryHeld = runSolver(held, iterations);
    if (tryHeld.residual < 1e-9 && held.settled() < 1e-9) {
      writeBack(drawing, held, tryHeld.x);
      return constraintStatus(drawing);
    }
  }
  const sys = buildSystem(drawing, { moved });
  if (sys.constraints.length) writeBack(drawing, sys, runSolver(sys, iterations).x);
  return constraintStatus(drawing);
}

/** Constraints whose entities are gone are dropped. */
function dropBroken(drawing) {
  if (!drawing.constraints?.length) return;
  const ids = new Set(drawing.entities.map((e) => e.id));
  drawing.constraints = drawing.constraints.filter((c) => c.refs.every((r) => ids.has(r.id)));
}

/**
 * Adds a constraint (a dimensional one takes the current measure unless a
 * value is given) and solves. Returns the constraint or null when the
 * combination does not make sense.
 */
export function addConstraint(drawing, type, refs, value = null) {
  const ents = refs.map((r) => drawing.entities.find((e) => e.id === r.id));
  if (ents.some((e) => !e) || !canConstrain(type, ents, refs)) return null;
  const c = { id: newId(), type, refs: refs.map((r) => ({ id: r.id, ...(r.at ? { at: r.at } : {}) })) };
  if (DIMENSIONAL.includes(type)) c.value = Number.isFinite(value) ? value : measureConstraint(drawing, type, refs);
  drawing.constraints = [...(drawing.constraints ?? []), c];
  return c;
}

/**
 * The nearest pair of points of two entities (for coincident / point-to-point
 * constraints picked by selecting two entities).
 */
export function nearestPoints(a, b) {
  let best = null;
  for (const pa of pointsOf(a)) for (const pb of pointsOf(b)) {
    const p = pointWith(a.type, pa, getterOf(a));
    const q = pointWith(b.type, pb, getterOf(b));
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (!best || d < best.d) best = { d, refs: [{ id: a.id, at: pa }, { id: b.id, at: pb }] };
  }
  return best?.refs ?? null;
}

/** The point a constraint is shown at, and its label (for the canvas). */
export function constraintGlyph(drawing, c) {
  const ents = c.refs.map((r) => drawing.entities.find((e) => e.id === r.id));
  if (ents.some((e) => !e)) return null;
  const mid = (e) => (e.type === 'line' ? { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 } : pointWith(e.type, 'c', getterOf(e)));
  const at = c.refs[0].at ? pointWith(ents[0].type, c.refs[0].at, getterOf(ents[0])) : mid(ents[0]);
  const fmt = (v) => String(Math.round(v * 100) / 100);
  const label = {
    coincident: '●', horizontal: 'H', vertical: 'V', parallel: '∥', perpendicular: '⊥', equal: '=', tangent: 'T', concentric: '◎',
    pointOnObject: '⊙', symmetric: '⋈', fixed: '🔒', distanceX: c.value !== undefined ? `↔${fmt(c.value)}` : '', distanceY: c.value !== undefined ? `↕${fmt(c.value)}` : '',
    distance: c.value !== undefined ? fmt(c.value) : '', radius: `R${fmt(c.value ?? 0)}`, diameter: `⌀${fmt(c.value ?? 0)}`, angle: `${fmt(c.value ?? 0)}°`,
  }[c.type];
  return { at, label, dimensional: DIMENSIONAL.includes(c.type) };
}
