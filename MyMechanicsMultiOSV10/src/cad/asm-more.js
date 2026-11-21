// More assembly tools (no DOM, no kernel unless handed in):
//   component patterns (linear in one or two directions, circular about an axis) and mirrored components —
//   the copies are kept as records in `assembly.patterns` and follow their seeds (updatePatterns());
//   smart mates — the mate type and alignment chosen from the two picked faces (cylinders → concentric,
//   planes → coincident, the alignment the faces already have);
//   collision detection — a move or rotation done in small steps that stops before the first contact
//   (or carries on and reports what touches).
import { quatFromAxisAngle, quatMultiply, quatNormalize, rotate, instanceName, placePoint, placeDir } from './assembly.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? scale(a, 1 / l) : null; };
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

let counter = 0;
const defaultId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

// ───────────────────────── placements of pattern instances

/** Placement of a seed moved by `offset` (linear instance). */
const translated = (c, offset) => ({ position: add(c.position, offset), rotation: [...c.rotation] });

/** Placement of a seed turned by `degrees` about the axis { point, dir } (circular instance). */
function turned(c, axis, degrees) {
  const q = quatFromAxisAngle(axis.dir, degrees);
  return { position: add(axis.point, rotate(q, sub(c.position, axis.point))), rotation: quatNormalize(quatMultiply(q, c.rotation)) };
}

/** Local axis (0 x, 1 y, 2 z) of the part used as its own symmetry plane when mirroring, or −1 to keep the orientation. */
export function mirrorLocalAxis(c, normal, mode = 'auto') {
  if (mode === 'none') return -1;
  if (mode === 'x' || mode === 'y' || mode === 'z') return 'xyz'.indexOf(mode);
  // auto: the local axis most nearly in the mirror plane (the part is taken as symmetric about the plane ⊥ to it).
  const m = rotate([-c.rotation[0], -c.rotation[1], -c.rotation[2], c.rotation[3]], normal);
  const a = m.map(Math.abs);
  return a.indexOf(Math.min(...a));
}

/**
 * Placement of the mirror image of component `c` in plane { point, normal }: the origin is reflected and the
 * orientation is the reflection composed with the part's own reflection across its local plane ⊥ axis k
 * (a proper rotation; exactly the mirror image when the part is symmetric about that plane). k = −1 keeps the rotation.
 */
export function mirroredPlacement(c, plane, k = 0) {
  const n = unit(plane.normal) ?? [1, 0, 0];
  const position = sub(c.position, scale(n, 2 * dot(sub(c.position, plane.point), n)));
  if (k < 0) return { position, rotation: [...c.rotation] };
  // M R S_k = R S_m S_k with m = Rᵀn: the product of two reflections is the rotation by 2∠(m, e_k) about m × e_k
  // (180° about the axis ⊥ to both when they are perpendicular).
  const inv = [-c.rotation[0], -c.rotation[1], -c.rotation[2], c.rotation[3]];
  const m = unit(rotate(inv, n));
  const e = [0, 0, 0]; e[k] = 1;
  // S_m S_k v = m e v e m (pure quaternions), i.e. the rotation q = m·e = (m × e, −m·e).
  const q = quatNormalize([m[1] * e[2] - m[2] * e[1], m[2] * e[0] - m[0] * e[2], m[0] * e[1] - m[1] * e[0], -dot(m, e)]);
  return { position, rotation: quatNormalize(quatMultiply(c.rotation, q)) };
}

/** The instance placements of a pattern record for its seed `c`: [{ position, rotation }] (the seed itself excluded). */
export function patternPlacements(p, c) {
  const out = [];
  if (p.type === 'linear') {
    const d1 = unit(p.dir ?? [1, 0, 0]) ?? [1, 0, 0];
    const d2 = p.dir2 ? unit(p.dir2) : null;
    const n1 = Math.max(1, Math.round(num(p.count, 2))); const n2 = d2 ? Math.max(1, Math.round(num(p.count2, 1))) : 1;
    for (let j = 0; j < n2; j++) for (let i = 0; i < n1; i++) {
      if (!i && !j) continue;
      out.push(translated(c, add(scale(d1, i * num(p.spacing, 10)), d2 ? scale(d2, j * num(p.spacing2, 10)) : [0, 0, 0])));
    }
  } else if (p.type === 'circular') {
    const n = Math.max(1, Math.round(num(p.count, 2)));
    const total = num(p.angle, 360);
    const stepDeg = p.equal !== false ? (Math.abs(total - 360) < 1e-9 ? total / n : total / Math.max(1, n - 1)) : total;
    const axis = { point: p.axis?.point ?? [0, 0, 0], dir: unit(p.axis?.dir ?? [0, 0, 1]) ?? [0, 0, 1] };
    for (let i = 1; i < n; i++) out.push(turned(c, axis, i * stepDeg));
  } else if (p.type === 'mirror') {
    out.push(mirroredPlacement(c, p.plane, p.localAxis ?? 0));
  }
  return out;
}

/**
 * Adds a pattern of the seed components: options { type: 'linear' | 'circular' | 'mirror', … (patternPlacements) }.
 * Each copy is a new fixed component that the pattern places ({ pattern: id }); returns { pattern, components }.
 * `newId(prefix)` makes ids (the app's), `nameOf(comp)` the instance name (default "Part<n>").
 */
export function addComponentPattern(assembly, seedIds, options, { newId = defaultId, nameOf = null } = {}) {
  const seeds = seedIds.map((id) => assembly.components.find((c) => c.id === id)).filter(Boolean);
  if (!seeds.length) throw Object.assign(new Error('no seed'), { code: 'no-seed' });
  const p = { id: newId('pat'), seeds: seeds.map((c) => c.id), instances: [], ...structuredClone(options) };
  if (p.type === 'mirror') p.localAxes = Object.fromEntries(seeds.map((c) => [c.id, mirrorLocalAxis(c, unit(p.plane.normal) ?? [1, 0, 0], p.orientation ?? 'auto')]));
  const made = [];
  for (const c of seeds) {
    const places = p.type === 'mirror' ? patternPlacements({ ...p, localAxis: p.localAxes[c.id] }, c) : patternPlacements(p, c);
    for (const [k, pl] of places.entries()) {
      const copy = { id: newId('cmp'), name: '', position: pl.position, rotation: pl.rotation, fixed: true, pattern: p.id, seed: c.id, index: k + 1 };
      if (c.sub) copy.sub = c.sub; else copy.part = c.part;
      copy.name = nameOf ? nameOf(copy) : instanceName(assembly, c.name.replace(/<\d+>$/, ''), c.sub ?? c.part);
      assembly.components.push(copy);
      p.instances.push(copy.id);
      made.push(copy);
    }
  }
  assembly.patterns = [...(assembly.patterns ?? []), p];
  return { pattern: p, components: made };
}

/** Moves every pattern instance to where its seed puts it now. Returns the number of instances placed. */
export function updatePatterns(assembly) {
  let n = 0;
  for (const p of assembly.patterns ?? []) {
    for (const seedId of p.seeds) {
      const seed = assembly.components.find((c) => c.id === seedId);
      if (!seed) continue;
      const places = p.type === 'mirror' ? patternPlacements({ ...p, localAxis: p.localAxes?.[seedId] ?? 0 }, seed) : patternPlacements(p, seed);
      const mine = assembly.components.filter((c) => c.pattern === p.id && c.seed === seedId).sort((a, b) => a.index - b.index);
      mine.forEach((c, i) => { if (places[i]) { c.position = places[i].position; c.rotation = places[i].rotation; n++; } });
    }
  }
  return n;
}

/** Deletes a pattern record and its instances (the seeds stay). Returns the removed component ids. */
export function removePattern(assembly, patternId) {
  const ids = assembly.components.filter((c) => c.pattern === patternId).map((c) => c.id);
  assembly.components = assembly.components.filter((c) => c.pattern !== patternId);
  assembly.patterns = (assembly.patterns ?? []).filter((p) => p.id !== patternId);
  assembly.mates = (assembly.mates ?? []).filter((m) => ![m.a, m.b, m.c, m.d].some((r) => r && ids.includes(r.comp)));
  return ids;
}

/** Drops pattern records whose seeds are gone and instances whose pattern is gone (after deleting components). */
export function prunePatterns(assembly) {
  const ids = new Set(assembly.components.map((c) => c.id));
  assembly.patterns = (assembly.patterns ?? []).filter((p) => p.seeds.some((s) => ids.has(s)));
  const live = new Set(assembly.patterns.map((p) => p.id));
  assembly.components = assembly.components.filter((c) => !c.pattern || live.has(c.pattern));
  for (const p of assembly.patterns) p.instances = p.instances.filter((i) => assembly.components.some((c) => c.id === i));
}

// ───────────────────────── smart mates

/**
 * The mate a pair of picked references makes by itself (the "smart" mate): two axes (cylindrical / conical faces)
 * → concentric; two planes → coincident, faces against each other unless they already face the same way;
 * an axis and a plane → coincident (axis in the plane); a point with anything → coincident.
 * `a`, `b`: mate references in their parts' coordinates; `ca`, `cb`: their components (for the current alignment).
 * Returns { type, aligned } or null when the pair cannot be mated.
 */
export function smartMateFor(a, b, ca = null, cb = null) {
  if (!a || !b) return null;
  if (a.kind === 'axis' && b.kind === 'axis') return { type: 'concentric', aligned: 'anti' };
  if (a.kind === 'plane' && b.kind === 'plane') {
    const na = ca ? placeDir(ca, a.dir) : a.dir; const nb = cb ? placeDir(cb, b.dir) : b.dir;
    return { type: 'coincident', aligned: dot(na, nb) > 0.5 ? 'aligned' : 'anti' };
  }
  if ((a.kind === 'axis' && b.kind === 'plane') || (a.kind === 'plane' && b.kind === 'axis')) return { type: 'coincident', aligned: 'anti' };
  if (a.kind === 'point' || b.kind === 'point') return { type: 'coincident', aligned: 'anti' };
  return null;
}

// ───────────────────────── collision detection

/**
 * A rigid move of components `ids` in `steps` equal steps: `move` = { translate?: [x, y, z], rotate?: { axis, degrees,
 * point? (default: the first component's origin) } }. After each step `collides(assembly)` (→ [compId, …] of
 * the components now touching a moved one, or []) is asked. mode 'stop': the move ends at the last free step
 * (it never goes into contact); mode 'highlight': the whole move is done and every contact met is collected.
 * The assembly is changed in place. Returns { stopped, steps (done), fraction (0 … 1 of the move done), hits: [compId] }.
 */
export function moveWithCollision(assembly, ids, move, collides, { steps = 12, mode = 'stop' } = {}) {
  const comps = ids.map((id) => assembly.components.find((c) => c.id === id)).filter((c) => c && !c.fixed);
  if (!comps.length) return { stopped: false, steps: 0, fraction: 0, hits: [] };
  const n = Math.max(1, Math.round(steps));
  const t = move.translate ? scale(move.translate, 1 / n) : null;
  const pivot = move.rotate ? (move.rotate.point ?? [...comps[0].position]) : null;
  const q = move.rotate ? quatFromAxisAngle(move.rotate.axis, num(move.rotate.degrees, 0) / n) : null;
  const hits = new Set();
  let done = 0;
  for (let i = 0; i < n; i++) {
    const saved = comps.map((c) => ({ c, position: [...c.position], rotation: [...c.rotation] }));
    let pv = pivot;
    for (const c of comps) {
      if (t) c.position = add(c.position, t);
      if (q) { c.position = add(pv, rotate(q, sub(c.position, pv))); c.rotation = quatNormalize(quatMultiply(q, c.rotation)); }
    }
    if (t && pv) pv = add(pv, t);
    const now = collides(assembly) ?? [];
    if (now.length) {
      now.forEach((id) => hits.add(id));
      if (mode === 'stop') { for (const s of saved) { s.c.position = s.position; s.c.rotation = s.rotation; } return { stopped: true, steps: done, fraction: done / n, hits: [...hits] }; }
    }
    done++;
  }
  return { stopped: false, steps: done, fraction: 1, hits: [...hits] };
}

/**
 * Collision test with the kernel: the components (other than `moving`) whose placed solids come closer than
 * `tolerance` to a moving one. `shapeOf(comp)` → the placed solid (or null), `distance(a, b)` → their distance
 * (R.measureDistanceBetween), `boxOf(comp)` (optional) → [[lo], [hi]] to skip far pairs quickly.
 */
export function kernelCollisions(assembly, moving, { shapeOf, distance, boxOf = null, tolerance = 1e-3 }) {
  const ids = new Set(moving);
  const movers = assembly.components.filter((c) => ids.has(c.id));
  const others = assembly.components.filter((c) => !ids.has(c.id) && !c.hidden && !c.suppressed);
  const out = [];
  for (const o of others) {
    for (const m of movers) {
      if (boxOf) {
        const [alo, ahi] = boxOf(m); const [blo, bhi] = boxOf(o);
        if (![0, 1, 2].every((k) => alo[k] <= bhi[k] + tolerance && blo[k] <= ahi[k] + tolerance)) continue;
      }
      const sa = shapeOf(m); const sb = shapeOf(o);
      if (!sa || !sb) continue;
      let d = Infinity;
      try { d = distance(sa, sb); } catch { d = Infinity; }
      if (d <= tolerance) { out.push(o.id); break; }
    }
  }
  return out;
}

/** World box of a local box [[lo], [hi]] placed by a component (the 8 corners transformed). */
export function placedBox(box, c) {
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 8; k++) {
    const p = placePoint(c, [box[k & 1 ? 1 : 0][0], box[k & 2 ? 1 : 0][1], box[k & 4 ? 1 : 0][2]]);
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  }
  return [lo, hi];
}
