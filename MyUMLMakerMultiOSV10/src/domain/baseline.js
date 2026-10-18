// Baselines (Model › Baselines…): named snapshots of the whole project or one
// package, with a date and a note, kept inside the project file under
// project.baselines = [{ _id, name, note, date, scopeId, scopeName, scopeType,
// elements, snapshot }]. The snapshot is the JSON text of the model at that
// time (without baselines), so nothing walks into it, its ids never clash with
// the live model and older readers simply carry it along. A baseline can be
// compared with the current model (diff.js), exported as its own .myuml, and
// single elements restored from it. StarUML export leaves baselines out. Pure.
import { compareModels } from './diff.js';
import { serialize } from './format.js';
import { buildIndex, findById, insertElement, linkParents, newId, refId, removeDeadViews, walk } from './model.js';
import { isDiagramType } from './meta.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const countElements = (root) => { let n = 0; walk(root, () => { n += 1; }); return n; };

/** A new baseline record of the project, or of the element scopeId (a package). Does not add it. */
export function createBaseline(project, { name = '', note = '', scopeId = '', date = new Date() } = {}) {
  const root = (scopeId && findById(project, scopeId)) || project;
  const copy = clone(root);
  delete copy.baselines;
  return {
    _id: newId(), name: String(name || root.name || 'Baseline'), note: String(note ?? ''), date: (date instanceof Date ? date : new Date(date)).toISOString(),
    scopeId: root === project ? '' : root._id, scopeName: root.name ?? '', scopeType: root._type, elements: countElements(root), snapshot: JSON.stringify(copy),
  };
}

/** Adds a baseline to the project (in place). Returns it. */
export function addBaseline(project, baseline) {
  project.baselines = [...(Array.isArray(project.baselines) ? project.baselines : []), baseline];
  return baseline;
}

/** Removes a baseline by id (in place). Returns whether one was removed. */
export function removeBaseline(project, id) {
  const before = project.baselines?.length ?? 0;
  project.baselines = (project.baselines ?? []).filter((b) => b._id !== id);
  if (!project.baselines.length) delete project.baselines;
  return before !== (project.baselines?.length ?? 0);
}

/** The baselines without their snapshots (for lists). */
export const listBaselines = (project) => (Array.isArray(project?.baselines) ? project.baselines : []).filter((b) => b && typeof b.snapshot === 'string').map(({ snapshot, ...rest }) => ({ ...rest, size: snapshot.length }));
export const findBaseline = (project, id) => (project?.baselines ?? []).find((b) => b._id === id) ?? null;

/** The model stored in a baseline (a fresh copy each call). */
export const baselineRoot = (baseline) => JSON.parse(baseline.snapshot);

/** What the baseline is compared with in the current project: the project or the same package (null if it is gone). */
export const currentScope = (project, baseline) => (baseline.scopeId ? findById(project, baseline.scopeId) : project);

/** compareModels(baseline, current). A package that no longer exists compares with nothing (all removed). */
export function compareWithBaseline(project, baseline, options = {}) {
  const root = currentScope(project, baseline) ?? { _type: baseline.scopeType ?? 'UMLPackage', _id: baseline.scopeId, name: baseline.scopeName, ownedElements: [] };
  const current = root === project ? { ...project, baselines: undefined } : root;
  return compareModels(baselineRoot(baseline), current, options);
}

/** The baseline as a stand-alone project (a package baseline goes into a new project). */
export function baselineAsProject(baseline) {
  const root = baselineRoot(baseline);
  if (root._type === 'Project') return root;
  const project = { _type: 'Project', _id: newId(), name: baseline.name, ownedElements: [root] };
  return linkParents(project);
}
/** .myuml text of a baseline. */
export const exportBaselineText = (baseline) => serialize(baselineAsProject(baseline));

/**
 * Puts element `id` back as it was in `oldRoot` (a baseline model): a changed
 * element gets its old fields, features and views (its owned elements stay —
 * they are restored one by one); a removed element is inserted again (with
 * what it owned) into its old owner, or the nearest owner that still exists.
 * Ids that meanwhile exist elsewhere get new ones. Views of missing elements
 * are dropped. Changes `project` in place; returns the restored element or null.
 */
export function restoreElement(project, oldRoot, id) {
  const oldIndex = buildIndex(oldRoot);
  const old = oldIndex.get(id);
  if (!old) return null;
  const index = buildIndex(project);
  const current = index.get(id);
  const copy = clone(old);
  delete copy.baselines;
  let restored;
  if (current) {
    const keep = current.ownedElements;
    const baselines = current.baselines;
    const parent = index.parent(id);
    for (const key of Object.keys(current)) delete current[key];
    Object.assign(current, copy);
    if (copy.ownedElements || keep) current.ownedElements = keep ?? [];
    if (baselines) current.baselines = baselines;
    linkParents(current, parent);
    restored = current;
  } else {
    let owner = null;
    for (let p = oldIndex.parent(id); p && !owner; p = oldIndex.parent(p._id)) owner = index.get(p._id);
    owner ??= project;
    restored = insertElement(owner, copy);
  }
  // New ids for restored parts whose ids are now used elsewhere.
  const inside = new Set();
  walk(restored, (e) => { inside.add(e); }, { views: true });
  const elsewhere = new Set();
  walk(project, (e) => { if (!inside.has(e) && e._id) elsewhere.add(e._id); }, { views: true });
  const renamed = new Map();
  for (const e of inside) if (e !== restored && e._id && elsewhere.has(e._id)) { const fresh = newId(); renamed.set(e._id, fresh); e._id = fresh; }
  if (renamed.size) {
    const fix = (value) => {
      if (Array.isArray(value)) value.forEach(fix);
      else if (value && typeof value === 'object') {
        if (typeof value.$ref === 'string' && renamed.has(value.$ref)) value.$ref = renamed.get(value.$ref);
        for (const [k, v] of Object.entries(value)) if (k !== '_parent' && v && typeof v === 'object') fix(v);
      }
    };
    fix(restored);
    linkParents(restored);
  }
  // Views whose element is gone.
  const live = buildIndex(project);
  walk(project, (e) => {
    if (!isDiagramType(e._type)) return;
    const gone = new Set((e.ownedViews ?? []).map((v) => refId(v.model)).filter((m) => m && !live.get(m)));
    if (gone.size) removeDeadViews(e, gone);
  });
  return restored;
}
