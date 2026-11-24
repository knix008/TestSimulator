// Flexible sub-assemblies: a sub-assembly component marked `flexible` is not one rigid body in its parent — its own
// components keep their degrees of freedom and are solved together with the parent's, so a mate or a motor in the
// parent can move a part inside it (a cylinder's rod mated to a lever of the parent assembly).
//
// The solve works on an expanded copy of the assembly: every component of a flexible sub-assembly becomes a
// "virtual" component `<sub comp id>/<inner id>` placed in assembly space, the sub-assembly's own mates act on
// them, and a parent mate that refers to a part inside the sub-assembly (a ref with a path) refers to that virtual
// component instead. The sub-assembly component itself stays as the frame its fixed components are locked to
// (fixed with it when it is fixed). Where the inner components end up is kept on the parent's component as
// `flexPose: { [innerId]: placement in the component's frame }` — the sub-assembly document is not changed.
import { composePlacement, relativePlacement } from './assembly.js';

export const FLEX_SEP = '/';
const REF_KEYS = ['a', 'b', 'c', 'd'];
const clone = (p) => ({ position: [...p.position], rotation: [...p.rotation] });

/** Where inner component `ic` of flexible component `c` is, in c's frame (its own placement in the sub-assembly until moved). */
export function flexInner(c, ic) {
  const p = c.flexible ? c.flexPose?.[ic.id] : null;
  return clone(p ?? { position: ic.position ?? [0, 0, 0], rotation: ic.rotation ?? [0, 0, 0, 1] });
}

/** The flexible sub-assembly components of an assembly with their sub-assembly documents. */
export function flexibleComponents(asm, project) {
  const out = [];
  for (const c of asm?.components ?? []) {
    if (!c.sub || !c.flexible || c.suppressed) continue;
    const sub = project?.assemblies?.find((a) => a.id === c.sub);
    if (sub && sub.id !== asm.id) out.push({ c, sub });
  }
  return out;
}

/**
 * The expanded assembly to solve (or to run a motion study on), or null when nothing is flexible. Returns
 * { assembly, virtual: Map vid → { c, ic, sub }, entity(resolve) → entity function, writeBack(solved), status(map) }.
 * `assembly.components` holds the parent's own component objects (solved in place) and the virtual ones.
 */
export function expandFlexible(asm, project) {
  const flex = flexibleComponents(asm, project);
  if (!flex.length) return null;
  const byComp = new Map(flex.map((x) => [x.c.id, x]));
  const virtual = new Map();
  const comps = [...asm.components];
  const mates = [];
  const vid = (cid, iid) => `${cid}${FLEX_SEP}${iid}`;
  for (const { c, sub } of flex) {
    const inner = sub.components.filter((ic) => !ic.suppressed);
    const innerIds = new Set(inner.map((ic) => ic.id));
    for (const ic of inner) {
      const rel = flexInner(c, ic);
      const w = composePlacement(c, rel);
      const v = { id: vid(c.id, ic.id), name: `${c.name ?? c.id}/${ic.name ?? ic.id}`, position: w.position, rotation: w.rotation, flexOf: c.id, inner: ic.id };
      if (ic.part) v.part = ic.part;
      if (ic.sub) v.sub = ic.sub;
      if (c.fixed && ic.fixed) v.fixed = true;
      comps.push(v);
      virtual.set(v.id, { c, ic, sub });
      // The sub-assembly's fixed components stay where they are in it: locked to its frame (the component).
      if (ic.fixed && !c.fixed) mates.push({ id: `flexlock:${v.id}`, type: 'lock', a: { comp: c.id }, b: { comp: v.id }, relative: rel });
    }
    // The sub-assembly's own mates act on the virtual components.
    for (const m of sub.mates ?? []) {
      if (m.suppressed) continue;
      if (!REF_KEYS.every((k) => !m[k] || innerIds.has(m[k].comp))) continue;
      const copy = { ...m, id: `${c.id}${FLEX_SEP}${m.id}` };
      for (const k of REF_KEYS) if (m[k]) copy[k] = { ...m[k], comp: vid(c.id, m[k].comp) };
      mates.push(copy);
    }
  }
  // The parent's mates: a ref to a part inside a flexible sub-assembly goes to its virtual component.
  for (const m of asm.mates ?? []) {
    const refs = REF_KEYS.filter((k) => m[k] && byComp.has(m[k].comp) && m[k].path?.length);
    if (!refs.length) { mates.push(m); continue; }
    const copy = { ...m };
    for (const k of refs) {
      const r = m[k];
      const { path, ...rest } = r;
      copy[k] = { ...rest, comp: vid(r.comp, path[0]), ...(path.length > 1 ? { path: path.slice(1) } : {}) };
    }
    mates.push(copy);
  }
  const assembly = { ...asm, components: comps, mates };
  return {
    assembly,
    virtual,
    /** The solver's entity function: a virtual component's refs are read on the inner component (in its own frame). */
    entity: (resolve) => (ref) => {
      const v = virtual.get(ref.comp);
      if (!v) return resolve(ref);
      const e = resolve({ ...ref, comp: v.ic.id }, v.sub);
      return e ? { ...e, comp: ref.comp, ...(ref.path ? { path: ref.path } : {}) } : null;
    },
    /** Keeps where the virtual components of `solved` (the expanded assembly or its moved clone) are, on the parent's components. */
    writeBack(solved = assembly) {
      const byId = new Map(solved.components.map((x) => [x.id, x]));
      for (const { c, sub } of flex) {
        const frame = byId.get(c.id) ?? c;
        const pose = {};
        for (const ic of sub.components) {
          const v = byId.get(vid(c.id, ic.id));
          if (v) pose[ic.id] = relativePlacement(frame, v);
        }
        c.flexPose = pose;
      }
    },
    /** Solver status by the parent's components: a flexible one is fully defined when it and all inside are. */
    status(map) {
      const out = new Map();
      for (const c of asm.components) out.set(c.id, map.get(c.id) ?? (c.fixed ? 'fixed' : 'under'));
      for (const { c } of flex) {
        const all = [c.id, ...[...virtual.keys()].filter((id) => virtual.get(id).c === c)].map((id) => map.get(id));
        out.set(c.id, all.every((s) => s === 'fixed') ? 'fixed' : all.every((s) => s === 'fixed' || s === 'defined') ? 'defined' : 'under');
      }
      return out;
    },
  };
}

/**
 * The world placement of a leaf of flexible component `c` (leaf from flattening its sub-assembly: path, placement
 * in c's frame) given a pose map that has the virtual components (a motion study's frame).
 */
export function flexLeafPlacement(c, sub, leaf, poses) {
  const ic = sub?.components.find((x) => x.id === leaf.path[0]);
  const vp = ic && poses?.get(`${c.id}${FLEX_SEP}${ic.id}`);
  if (!vp) return null;
  const innerRel = relativePlacement(flexInner(c, ic), leaf.placement);
  return composePlacement(vp, innerRel);
}
