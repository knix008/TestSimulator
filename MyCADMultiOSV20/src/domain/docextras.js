// Document-level objects of FreeCAD's Std commands that are not drawn
// entities: groups (Std_Group, Std_Part), saved camera views (Std_FreezeViews,
// Std_StoreWorkingView), variable sets (Std_VarSet) and text documents
// (Std_TextDocument). Sketcher sketches are groups with a plane (frame).

import { apply as apply3, rotationOf } from './transform3d.js';

const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
const id = (value) => (typeof value === 'string' && value ? value.slice(0, 64) : null);
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

/** Groups: { id, name, parent, hidden, part, placement }. A Std_Part group carries a placement. */
export function normalizeGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const groups = raw.filter((g) => g && id(g.id)).map((g) => ({
    id: id(g.id),
    name: text(g.name) || 'Group',
    parent: id(g.parent),
    ...(g.hidden ? { hidden: true } : {}),
    // PartDesign_Body: a body, and its tip (the features after it are not shown).
    ...(g.body ? { body: true, ...(typeof g.tip === 'string' && g.tip ? { tip: g.tip } : {}) } : {}),
    ...(g.part ? { part: true, placement: { x: finite(g.placement?.x), y: finite(g.placement?.y), z: finite(g.placement?.z), rz: finite(g.placement?.rz) } } : {}),
    // Assembly_CreateAssembly: an assembly (its parts are the solids in it). FEM: the group of result meshes.
    ...(g.assembly ? { assembly: true } : {}),
    ...(g.femResults ? { femResults: true } : {}),
    // Arch_Reference: the drawing its solids were copied from (reloaded on demand).
    ...(g.reference && typeof g.reference.source === 'string' ? { reference: { source: g.reference.source.slice(0, 200) } } : {}),
    // TechDraw: a view (how to make it again) and a clip group's window.
    ...(g.view && typeof g.view === 'object' ? { view: normalizeViewSpec(g.view) } : {}),
    ...(g.clip && ['minX', 'minY', 'maxX', 'maxY'].every((k) => Number.isFinite(g.clip[k])) ? { clip: { minX: g.clip.minX, minY: g.clip.minY, maxX: g.clip.maxX, maxY: g.clip.maxY } } : {}),
    // Sketcher_NewSketch: its geometry lies on this plane (origin and turn of its XY).
    ...(g.sketch ? { sketch: true, frame: Object.fromEntries(['x', 'y', 'z', 'rx', 'ry', 'rz'].map((k) => [k, finite(g.frame?.[k])])) } : {}),
  }));
  const ids = new Set(groups.map((g) => g.id));
  // A parent that does not exist, or a loop, makes the group top-level.
  for (const group of groups) {
    if (group.parent && !ids.has(group.parent)) group.parent = null;
    let at = group.parent;
    for (let guard = 0; at; guard++) {
      if (at === group.id || guard > groups.length) { group.parent = null; break; }
      at = groups.find((g) => g.id === at)?.parent ?? null;
    }
  }
  return groups;
}

/** A TechDraw view group's recipe: a projection (solids, direction, scale, place) or a static view. */
function normalizeViewSpec(v) {
  if (v.kind !== 'projection') return { kind: 'static' };
  const dir = Array.isArray(v.dir) && v.dir.length === 3 && v.dir.every(Number.isFinite) ? v.dir.slice() : [0, -1, 0];
  return { kind: 'projection', source: (Array.isArray(v.source) ? v.source : []).filter((s) => typeof s === 'string'), dir, scale: finite(v.scale, 1) || 1, x: finite(v.x), y: finite(v.y) };
}

/** A camera: position, target and up, plus projection. */
export function normalizeCamera(raw) {
  const v = (a) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) ? a.slice() : null);
  const position = v(raw?.position);
  const target = v(raw?.target);
  if (!position || !target) return null;
  return { position, target, up: v(raw?.up) ?? [0, 0, 1], projection: raw?.projection === 'ortho' ? 'ortho' : 'perspective', zoom: finite(raw?.zoom, 1) || 1 };
}

/** Saved views: [{ name, camera }]. */
export function normalizeViews(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((view) => ({ name: text(view?.name, 80) || 'View', camera: normalizeCamera(view?.camera) })).filter((view) => view.camera).slice(0, 50);
}

/** Variable sets: [{ id, name, variables: [{ name, value, unit }] }]. Names are expression identifiers. */
export function normalizeVarSets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((set) => set && id(set.id)).map((set) => ({
    id: id(set.id),
    name: text(set.name, 80) || 'VarSet',
    variables: (Array.isArray(set.variables) ? set.variables : [])
      .filter((v) => typeof v?.name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v.name))
      .map((v) => ({ name: v.name, value: finite(Number(v.value)), unit: text(v.unit, 12) })),
  }));
}

/** Text documents: [{ id, name, text }]. */
export function normalizeTextDocs(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((doc) => doc && id(doc.id)).map((doc) => ({ id: id(doc.id), name: text(doc.name, 80) || 'Text document', text: text(doc.text, 200000) }));
}

/** Every variable of every set, as name → value (for expressions: VarSet.Name or just Name). */
export function variableScope(drawing) {
  const scope = {};
  for (const set of drawing?.varSets ?? []) {
    for (const v of set.variables) {
      scope[v.name] = v.value;
      scope[`${set.name}.${v.name}`] = v.value;
    }
  }
  return scope;
}

/**
 * Where a sketch's 2D geometry lies in 3D: a function [x, y] → [x, y, z], or
 * null when the entity is not in a sketch or its sketch is the XY plane.
 */
export function sketchFrameOf(drawing, entity) {
  const sketch = entity?.group ? drawing.groups?.find((g) => g.id === entity.group && g.sketch) : null;
  const f = sketch?.frame;
  if (!f || ['x', 'y', 'z', 'rx', 'ry', 'rz'].every((k) => !f[k])) return null;
  const R = rotationOf(f);
  return (x, y, z = 0) => { const p = apply3(R, [x, y, z]); return [p[0] + f.x, p[1] + f.y, p[2] + f.z]; };
}

/** The ids of a group and all its sub-groups. */
export function groupTree(drawing, groupId) {
  const out = new Set([groupId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of drawing.groups ?? []) if (g.parent && out.has(g.parent) && !out.has(g.id)) { out.add(g.id); grew = true; }
  }
  return out;
}
