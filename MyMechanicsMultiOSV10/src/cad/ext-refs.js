// External references (top-down design): a part edited in the context of an assembly can put a sketch on a face of
// another component. The reference keeps where that face is, in the edited part's own frame, so the part builds
// on its own; when the assembly changes, updating the references moves the planes to where the faces are now
// (a locked reference keeps its place; a broken one becomes a plain fixed plane and forgets the assembly).
//   part.externalRefs = [{ id, asm, at (this part's component), comp (the referenced component), sig (its face, in its
//   part), frame: { origin, xDir, normal } (this part's frame), locked }]
//   a plane reference to one: { kind: 'ext', id }; a broken one: { kind: 'frame', origin, xDir, normal }.
import { relativePlacement, placePoint, placeDir } from './assembly.js';

const round = (v) => Math.round(v * 1e9) / 1e9;

/** A frame given in component B's part frame, expressed in component A's part frame. */
export function frameBetween(frame, placeA, placeB) {
  const rel = relativePlacement(placeA, placeB);
  return { origin: placePoint(rel, frame.origin).map(round), xDir: placeDir(rel, frame.xDir).map(round), normal: placeDir(rel, frame.normal).map(round) };
}

/** Adds an external reference (or finds the same one). Returns its id. */
export function addExternalRef(part, { asm, at, comp, sig, frame }, newId) {
  part.externalRefs ??= [];
  const same = part.externalRefs.find((r) => r.asm === asm && r.at === at && r.comp === comp && JSON.stringify(r.sig) === JSON.stringify(sig));
  if (same) { if (!same.locked) same.frame = frame; return same.id; }
  const id = newId();
  part.externalRefs.push({ id, asm, at, comp, sig, frame });
  return id;
}

/**
 * Moves the references of `part` that are not locked to where their faces are now: `faceFrameOf(ref)` gives the
 * referenced face's frame in its own part (null when it is gone), `placementOf(asmId, compId)` a component's
 * placement. Returns { updated, missing: [ids] }.
 */
export function updateExternalRefs(part, faceFrameOf, placementOf) {
  let updated = 0; const missing = [];
  for (const r of part.externalRefs ?? []) {
    if (r.locked) continue;
    const A = placementOf(r.asm, r.at); const B = placementOf(r.asm, r.comp);
    const f = A && B ? faceFrameOf(r) : null;
    if (!f) { missing.push(r.id); continue; }
    const next = frameBetween(f, A, B);
    if (JSON.stringify(next) !== JSON.stringify(r.frame)) { r.frame = next; updated++; }
  }
  return { updated, missing };
}

/** Breaks references: the features that used them keep a fixed plane where the reference was; the reference goes. */
export function breakExternalRefs(part, ids = null) {
  const gone = new Set((part.externalRefs ?? []).filter((r) => !ids || ids.includes(r.id)).map((r) => r.id));
  const frameOf = new Map((part.externalRefs ?? []).map((r) => [r.id, r.frame]));
  const fix = (ref) => (ref?.kind === 'ext' && gone.has(ref.id) ? { kind: 'frame', ...frameOf.get(ref.id) } : ref);
  for (const f of part.features ?? []) for (const k of ['plane', 'base', 'base2', 'neutral', 'upToPlane']) if (f[k]?.kind === 'ext') f[k] = fix(f[k]);
  part.externalRefs = (part.externalRefs ?? []).filter((r) => !gone.has(r.id));
  return gone.size;
}

/** The features of a part that use external references (in-context features). */
export const inContextFeatures = (part) => (part.features ?? []).filter((f) => ['plane', 'base', 'base2', 'neutral', 'upToPlane'].some((k) => f[k]?.kind === 'ext'));
