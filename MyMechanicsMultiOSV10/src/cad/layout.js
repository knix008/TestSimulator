// Layout-based (top-down) assembly design: a layout part — sketches with blocks, inserted in the assembly as a
// fixed component — drives the parts. Make Part from Block makes, for each block, a part whose first sketch is
// the block's geometry and puts a component of it where each instance of the block sits in the layout (its
// sketch plane, position and turn); the component keeps a link. Updating from the layout moves the linked
// components to where their instances are now and gives the parts the blocks' current geometry.
//   component.layoutLink = { layout (component id), sketch (feature id in the layout part), instance }
//   part.fromBlock = { block (id), sketch (the part's block sketch feature id) }
import { quatFromAxisAngle, quatMultiply, quatNormalize, composePlacement } from './assembly.js';
import { frame as makeFrame, STD_PLANES } from './features.js';
import { createSketchGeometry, newSketchId as sketchId } from './sketch.js';

const round = (v) => Math.round(v * 1e9) / 1e9;

/** The points of a block instance in its sketch, matched to the block's own points (by source id, else by order). */
function matchedPoints(sketch, block, instance) {
  const inst = sketch.entities.filter((e) => e.block?.instance === instance && e.type === 'point');
  const own = block.entities.filter((e) => e.type === 'point');
  const pairs = [];
  own.forEach((b, i) => { const q = inst.find((e) => e.block.src === b.id) ?? (inst.every((e) => !e.block.src) ? inst[i] : null); if (q) pairs.push([[b.x, b.y], [q.x, q.y]]); });
  return pairs;
}

/**
 * Where a block instance sits in its sketch: the similarity (turn, scale, move) that best takes the block's points
 * to the instance's (least squares) — { x, y, angle (radians), scale, ok }. An instance that was moved or turned
 * as a whole in the sketch gives its new place.
 */
export function instancePlacement(sketch, block, instance) {
  const pairs = matchedPoints(sketch, block, instance);
  if (!pairs.length) return { x: 0, y: 0, angle: 0, scale: 1, ok: false };
  const n = pairs.length;
  const ca = pairs.reduce((s, [a]) => [s[0] + a[0] / n, s[1] + a[1] / n], [0, 0]);
  const cb = pairs.reduce((s, [, b]) => [s[0] + b[0] / n, s[1] + b[1] / n], [0, 0]);
  let sxx = 0, sxy = 0, saa = 0;
  for (const [a, b] of pairs) {
    const p = [a[0] - ca[0], a[1] - ca[1]]; const q = [b[0] - cb[0], b[1] - cb[1]];
    sxx += p[0] * q[0] + p[1] * q[1]; sxy += p[0] * q[1] - p[1] * q[0]; saa += p[0] * p[0] + p[1] * p[1];
  }
  const angle = n > 1 && saa > 1e-18 ? Math.atan2(sxy, sxx) : 0;
  const scale = n > 1 && saa > 1e-18 ? Math.hypot(sxx, sxy) / saa : 1;
  const c = Math.cos(angle) * scale, s = Math.sin(angle) * scale;
  // The block's origin (its base point) goes to: cb − R·ca.
  const x = cb[0] - (c * ca[0] - s * ca[1]); const y = cb[1] - (s * ca[0] + c * ca[1]);
  return { x: round(x), y: round(y), angle: round(angle), scale: round(scale), ok: true };
}

/** A quaternion turning the frame (xDir, yDir, normal) of the world axes onto `fr`'s axes. */
function frameQuat(fr) {
  const m = [[fr.xDir[0], fr.yDir[0], fr.normal[0]], [fr.xDir[1], fr.yDir[1], fr.normal[1]], [fr.xDir[2], fr.yDir[2], fr.normal[2]]];
  const tr = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]; }
  else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]; }
  else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]; }
  return quatNormalize(q);
}
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const rot = (q, v) => { const [x, y, z, w] = q; const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x]; };

/**
 * The placement of a component whose part has the block's sketch on its Top plane, so that sketch lies on the
 * instance: the layout component's placement ∘ the layout sketch's frame ∘ the instance's move and turn ∘ the
 * inverse of the part's Top frame. (The block's scale is not a placement: a scaled instance is reported.)
 */
export function linkedPlacement(layoutPlacement, layoutFrame, inst) {
  const top = makeFrame(STD_PLANES.top);
  const qL = frameQuat(layoutFrame); const qT = frameQuat(top);
  const qI = quatFromAxisAngle([0, 0, 1], (inst.angle * 180) / Math.PI);
  // In the layout part's frame: q = qL · qI · qT⁻¹ ; origin = layout origin + x·xDir + y·yDir − q·(top origin).
  const q = quatNormalize(quatMultiply(quatMultiply(qL, qI), conj(qT)));
  const o = [0, 1, 2].map((i) => layoutFrame.origin[i] + inst.x * layoutFrame.xDir[i] + inst.y * layoutFrame.yDir[i]);
  const t = rot(q, top.origin);
  const local = { position: [0, 1, 2].map((i) => round(o[i] - t[i])), rotation: q.map(round) };
  return composePlacement(layoutPlacement, local);
}

/** A new part from a block: one sketch on its Top plane holding the block's entities and relations. */
export function partFromBlock(block, { createPart, createFeature, newSketchId = sketchId }) {
  const part = createPart(block.name);
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry(), name: block.name });
  copyBlockInto(sk, block, newSketchId);
  part.features.push(sk);
  part.fromBlock = { block: block.id, sketch: sk.id };
  return part;
}

/** Puts the block's entities and relations into a sketch (its own geometry replaced; the origin kept). */
export function copyBlockInto(sketch, block, newSketchId = sketchId) {
  const map = new Map(block.entities.map((e) => [e.id, newSketchId(e.type === 'point' ? 'p' : e.type[0])]));
  const keep = sketch.entities.filter((e) => e.origin);
  sketch.entities = [...keep, ...block.entities.map((e) => {
    const n = JSON.parse(JSON.stringify(e)); n.id = map.get(e.id);
    for (const k of ['p1', 'p2', 'c', 'pc']) if (n[k]) n[k] = map.get(n[k]) ?? n[k];
    if (n.pts) n.pts = n.pts.map((id) => map.get(id) ?? id);
    return n;
  })];
  sketch.constraints = (block.constraints ?? []).map((c) => { const n = JSON.parse(JSON.stringify(c)); for (const k of ['a', 'b', 'c']) if (n[k]) n[k] = map.get(n[k]) ?? n[k]; n.id = newSketchId('k'); return n; });
  sketch.blockVersion = blockSignature(block);
}

/** A signature of a block's geometry (to see whether the part's copy is out of date). */
export const blockSignature = (block) => JSON.stringify([block.entities.map((e) => [e.type, e.x, e.y, e.r, e.p1, e.p2, e.c, e.pts]), block.constraints?.map((c) => [c.type, c.value])]);

/**
 * Makes parts for the block instances of a layout component that have no component yet (one part per block,
 * reused by every instance of it) and places a linked component on each. Returns { parts, comps }.
 */
export function makePartsFromBlocks(project, asm, layoutComp, { createPart, createFeature, newSketchId = sketchId, newId, blockInstances, frames }) {
  const layoutPart = project.parts.find((p) => p.id === layoutComp.part);
  const blocks = project.sketchBlocks ?? [];
  const made = { parts: [], comps: [] };
  for (const sk of (layoutPart?.features ?? []).filter((f) => f.type === 'sketch')) {
    for (const [instance, info] of blockInstances(sk)) {
      if (asm.components.some((c) => c.layoutLink?.layout === layoutComp.id && c.layoutLink.instance === instance)) continue;
      const block = blocks.find((b) => b.id === info.block);
      if (!block) continue;
      let part = project.parts.find((p) => p.fromBlock?.block === block.id);
      if (!part) { part = partFromBlock(block, { createPart, createFeature, newSketchId }); project.parts.push(part); made.parts.push(part); }
      const inst = instancePlacement(sk, block, instance);
      const pl = linkedPlacement(layoutComp, frames(sk), inst);
      const n = asm.components.filter((c) => c.part === part.id).length + 1;
      const comp = { id: newId('cmp'), name: `${part.name}<${n}>`, part: part.id, position: pl.position, rotation: pl.rotation, fixed: true, layoutLink: { layout: layoutComp.id, sketch: sk.id, instance } };
      asm.components.push(comp);
      made.comps.push(comp);
    }
  }
  return made;
}

/**
 * Brings the linked components and parts up to date with their layouts: placements from the instances' places
 * now, block sketches from the blocks' geometry now. Returns { moved, updated, lost: [component ids whose
 * instance is gone] }.
 */
export function updateFromLayout(project, asm, { frames, newSketchId = sketchId }) {
  const out = { moved: 0, updated: 0, lost: [] };
  const blocks = project.sketchBlocks ?? [];
  for (const c of asm.components) {
    const link = c.layoutLink;
    if (!link) continue;
    const lc = asm.components.find((x) => x.id === link.layout);
    const lp = lc && project.parts.find((p) => p.id === lc.part);
    const sk = lp?.features.find((f) => f.id === link.sketch);
    const ent = sk?.entities.find((e) => e.block?.instance === link.instance);
    const block = ent && blocks.find((b) => b.id === ent.block.id);
    if (!block) { out.lost.push(c.id); continue; }
    const pl = linkedPlacement(lc, frames(sk), instancePlacement(sk, block, link.instance));
    const moved = pl.position.some((v, i) => Math.abs(v - c.position[i]) > 1e-9) || pl.rotation.some((v, i) => Math.abs(v - c.rotation[i]) > 1e-9);
    if (moved) { c.position = pl.position; c.rotation = pl.rotation; out.moved++; }
  }
  for (const p of project.parts) {
    if (!p.fromBlock) continue;
    const block = blocks.find((b) => b.id === p.fromBlock.block);
    const sk = p.features.find((f) => f.id === p.fromBlock.sketch);
    if (!block || !sk) continue;
    if (sk.blockVersion !== blockSignature(block)) { copyBlockInto(sk, block, newSketchId); out.updated++; }
  }
  return out;
}
