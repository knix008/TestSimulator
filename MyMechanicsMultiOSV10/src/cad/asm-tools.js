// More assembly tools (no DOM, no kernel — the app hands in what needs geometry):
//   replace components — the chosen instances (or every instance of their part) use another part; each mate
//     reference on them is found again on the new part (`remap`), and a mate whose reference has no match is
//     suppressed and marked, so the solve does not pull on a face that is gone;
//   copy with mates — a copy of a component with its mates repeated: each one kept (the same reference on the
//     other component), given a new reference on the other side, or left out;
//   hole alignment — holes of different components on parallel axes that overlap along the axis and side by
//     side but are not on one axis (off by more than the tolerance);
//   clearance verification — pairs of components (or of the chosen ones against the rest) closer than a minimum
//     clearance, with the closest gap of each pair (touching or overlapping: 0);
//   envelopes — reference components (shown see-through, left out of the BOM, mass and interference) and the
//     components inside / crossing an envelope's box.
import { mateTouches } from './assembly.js';

const REF_KEYS = ['a', 'b', 'c', 'd'];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ───────────────────────── replace components

/**
 * Replaces the part of the components `ids` (all instances of their parts with `allInstances`) by `partId`.
 * `remap(ref, comp)` returns the reference on the new part (or null when nothing matches). Returns
 * { replaced: [compId], remapped: n, lost: [mateId] }.
 */
export function replaceComponents(asm, ids, partId, remap, { allInstances = false } = {}) {
  const chosen = asm.components.filter((c) => ids.includes(c.id) && !c.pattern);
  const parts = new Set(chosen.map((c) => c.part));
  const targets = allInstances ? asm.components.filter((c) => parts.has(c.part) && !c.pattern && c.part) : chosen;
  const replaced = [];
  for (const c of targets) {
    if (c.part === partId) continue;
    c.part = partId;
    replaced.push(c.id);
  }
  // Pattern instances follow their seeds' parts.
  for (const c of asm.components) if (c.pattern && c.seed && replaced.includes(c.seed)) c.part = partId;
  let remapped = 0; const lost = [];
  for (const m of asm.mates ?? []) {
    if (!replaced.some((id) => mateTouches(m, id))) continue;
    let ok = true;
    for (const k of REF_KEYS) {
      const r = m[k];
      if (!r || !replaced.includes(r.comp)) continue;
      const comp = asm.components.find((c) => c.id === r.comp);
      const next = remap(r, comp);
      if (next) { m[k] = { ...next, comp: r.comp, ...(r.path ? { path: r.path } : {}) }; remapped += 1; } else ok = false;
    }
    if (!ok) { m.suppressed = true; m.lostReference = true; lost.push(m.id); }
    else if (m.lostReference) { delete m.lostReference; delete m.suppressed; }
  }
  return { replaced, remapped, lost };
}

/**
 * The face of the new part a mate reference most likely meant: same kind (plane / axis), the direction parallel,
 * then the nearest by position (planes: distance along the normal, then across; axes: distance between the axes).
 * `candidates` = [{ kind, point, dir, sig }] in the part's frame. Null when nothing is within `limit` (that distance).
 */
export function bestReference(ref, candidates, { limit = Infinity, angle = 1e-3 } = {}) {
  let best = null; let score = Infinity;
  for (const c of candidates) {
    if (c.kind !== ref.kind) continue;
    const par = Math.abs(dot(c.dir, ref.dir));
    if (par < 1 - angle) continue;
    // Planes keep their facing (a mate to the top face should not jump to the bottom one).
    if (ref.kind === 'plane' && dot(c.dir, ref.dir) < 0) continue;
    const d = sub(c.point, ref.point);
    const along = dot(d, ref.dir);
    const across = len(sub(d, scale(ref.dir, along)));
    const primary = ref.kind === 'plane' ? Math.abs(along) : across;
    if (primary > limit) continue;
    const s = ref.kind === 'plane' ? Math.abs(along) * 10 + across * 0.01 : across * 10 + Math.abs(along) * 0.01;
    // Same radius wins among axes when known.
    const r = ref.sig?.radius != null && c.sig?.radius != null ? Math.abs(ref.sig.radius - c.sig.radius) : 0;
    const total = s + r;
    if (total < score) { score = total; best = c; }
  }
  return best;
}

// ───────────────────────── copy with mates

/**
 * A copy of the component `compId` placed at `offset` from it, with its mates repeated per `plan`:
 * { [mateId]: { mode: 'repeat' | 'new' | 'skip', other } } — 'repeat' (the default) keeps the other side's
 * reference, 'new' uses `other` (left out while none is picked). Returns { component, mates }.
 */
export function copyWithMates(asm, compId, plan, { newId, nameOf, mateName = (m) => m.name, offset = [0, 0, 0] }) {
  const src = asm.components.find((c) => c.id === compId);
  if (!src) throw new Error('no component');
  const copy = clone(src);
  copy.id = newId('cmp');
  copy.name = nameOf(src);
  copy.position = add(src.position, offset);
  copy.fixed = false;
  delete copy.pattern; delete copy.seed; delete copy.envelope;
  asm.components.push(copy);
  const made = [];
  for (const m of [...(asm.mates ?? [])]) {
    if (!mateTouches(m, compId) || m.suppressed) continue;
    const p = plan?.[m.id] ?? { mode: 'repeat' };
    if (p.mode === 'skip') continue;
    if (p.mode === 'new' && !p.other) continue;
    const nm = clone(m);
    nm.id = newId('mate');
    let fine = true;
    for (const k of REF_KEYS) {
      const r = nm[k];
      if (!r) continue;
      if (r.comp === compId) r.comp = copy.id;
      else if (p.mode === 'new') {
        if (p.other.comp === compId) { fine = false; break; }
        nm[k] = clone(p.other);
      }
    }
    if (!fine) continue;
    delete nm.lockedTransform;
    nm.name = mateName(nm);
    made.push(nm);
  }
  asm.mates.push(...made);
  return { component: copy, mates: made };
}

// ───────────────────────── hole alignment

/**
 * Clearance verification: `items` = [{ id, shape, box: [lo, hi] }] placed in assembly space; `distance(a, b)` the
 * minimum distance between two shapes (0 when they touch or overlap). Pairs closer than `min` are listed with their
 * gap, smallest first. `among`: only pairs with at least one of these ids (the chosen components against the
 * rest); `ignoreEqual`: a gap equal to the minimum (within 1e-6) is not reported; `ignoreTouching`: gap 0 (touching or
 * interfering) is left to the interference check. Pairs whose boxes are farther apart than `min` are not measured.
 * Returns { checked, items: [{ a, b, gap }] }.
 */
export function clearances(items, distance, { min = 1, among = null, ignoreEqual = false, ignoreTouching = false } = {}) {
  const out = []; let checked = 0;
  const pick = among?.length ? new Set(among) : null;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i]; const B = items[j];
    if (!A.shape || !B.shape || A.id === B.id) continue;
    if (pick && !pick.has(A.id) && !pick.has(B.id)) continue;
    if (A.box && B.box && boxGap(A.box, B.box) > min + 1e-6) continue;
    checked++;
    let gap;
    try { gap = Math.max(0, distance(A.shape, B.shape)); } catch { continue; }
    if (!(gap < min + (ignoreEqual ? -1e-6 : 1e-6))) continue;
    if (ignoreTouching && gap < 1e-6) continue;
    out.push({ a: A.id, b: B.id, gap });
  }
  out.sort((x, y) => x.gap - y.gap);
  return { checked, items: out };
}

/** The gap between two boxes [lo, hi] (0 when they overlap). */
export function boxGap([alo, ahi], [blo, bhi]) {
  let s = 0;
  for (let k = 0; k < 3; k++) { const d = Math.max(0, blo[k] - ahi[k], alo[k] - bhi[k]); s += d * d; }
  return Math.sqrt(s);
}

/**
 * Misaligned holes: `holes` = [{ comp, point, dir (unit), radius, lo, hi }] in assembly space, lo / hi the hole's
 * extent along dir from point. Two holes of different components are checked when their axes are parallel (within
 * `angle` radians), they meet or nearly meet along the axis (gap ≤ `gap`), and they overlap side by side (axis
 * distance < r1 + r2): off by more than `tolerance` they are misaligned. Returns { checked, aligned, misaligned:
 * [{ a, b, offset, radiusA, radiusB, at }] } (most off first).
 */
export function holeAlignment(holes, { tolerance = 0.01, gap = 0.5, angle = 0.0175 } = {}) {
  const out = []; let checked = 0; let aligned = 0;
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
    const A = holes[i]; const B = holes[j];
    if (A.comp === B.comp) continue;
    const c = dot(A.dir, B.dir);
    if (Math.abs(c) < Math.cos(angle)) continue;
    const u = A.dir;
    const d = sub(B.point, A.point);
    const along = dot(d, u);
    const offset = len(sub(d, scale(u, along)));
    if (offset >= A.radius + B.radius) continue;
    // Extents along A's axis.
    const a0 = A.lo; const a1 = A.hi;
    const s = Math.sign(c) || 1;
    const bl = along + s * B.lo; const bh = along + s * B.hi;
    const b0 = Math.min(bl, bh); const b1 = Math.max(bl, bh);
    const sep = Math.max(b0 - a1, a0 - b1);
    if (sep > gap) continue;
    checked += 1;
    if (offset <= tolerance) { aligned += 1; continue; }
    const mid = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
    out.push({ a: A.comp, b: B.comp, offset, radiusA: A.radius, radiusB: B.radius, at: add(A.point, scale(u, mid)) });
  }
  out.sort((x, y) => y.offset - x.offset);
  return { checked, aligned, misaligned: out };
}

// ───────────────────────── envelopes

export const isEnvelope = (c) => Boolean(c?.envelope);

/**
 * The components an envelope selects: `boxes` Map compId → [lo, hi] (assembly space), `envelope` its own box.
 * mode 'inside': wholly inside; 'crossing': inside or crossing its boundary; 'outside': wholly outside.
 */
export function envelopeSelection(envelopeId, boxes, mode = 'inside') {
  const env = boxes.get(envelopeId);
  if (!env) return [];
  const [elo, ehi] = env;
  const out = [];
  for (const [id, [lo, hi]] of boxes) {
    if (id === envelopeId) continue;
    const inside = [0, 1, 2].every((k) => lo[k] >= elo[k] - 1e-9 && hi[k] <= ehi[k] + 1e-9);
    const apart = [0, 1, 2].some((k) => hi[k] < elo[k] || lo[k] > ehi[k]);
    if (mode === 'inside' ? inside : mode === 'crossing' ? !apart : apart) out.push(id);
  }
  return out;
}
