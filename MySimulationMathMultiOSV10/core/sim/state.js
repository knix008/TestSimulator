// Per-session simulation state (ctx.state.sim): loaded models, running
// simulations, block handles, the current system / block, and the coalesced
// "model changed by M code" notification to the editor (sim.model reason
// 'engine').
import { MError } from '../value.js';
import { newModel, splitPath, joinPath, resolvePath, walk, clone } from './model.js';
import { readModelFile, findModelFile, absPath } from './files.js';

export function simState(ctx) {
  let st = ctx.state.sim;
  if (!st || !st.models) {
    st = ctx.state.sim = { models: new Map(), runs: new Map(), handles: new Map(), byHandle: new Map(), nextHandle: 1, cur: { system: '', block: '' }, changed: new Set(), timer: null };
  }
  return st;
}
export const E = (id, msg) => new MError(id.startsWith('sim:') ? id : `sim:${id}`, msg);
export const post = (ctx, msg) => { try { if (ctx && ctx.host && typeof ctx.host.post === 'function') ctx.host.post(msg); } catch { /* no GUI */ } };

/** The entry { model, path } of a loaded model, or null. */
export const entryOf = (ctx, name) => simState(ctx).models.get(String(name)) || null;
export function addModel(ctx, model, path = '') {
  const st = simState(ctx);
  st.models.set(model.name, { model, path });
  if (!st.cur.system) st.cur.system = model.name;
  return st.models.get(model.name);
}

/** Loads a model by name or file path (already loaded → that one). */
export function loadModel(ctx, nameOrPath, { create = false } = {}) {
  const st = simState(ctx);
  const s = String(nameOrPath).trim();
  const root = splitPath(s)[0];
  if (st.models.has(s)) return st.models.get(s);
  if (!/[\\/.]/.test(s) && st.models.has(root)) return st.models.get(root);
  const file = findModelFile(ctx.fs, s);
  if (file) {
    const model = readModelFile(ctx.fs, file);
    if (st.models.has(model.name)) return st.models.get(model.name);
    return addModel(ctx, model, file);
  }
  if (st.models.has(root)) return st.models.get(root);
  if (create) return addModel(ctx, newModel(root), '');
  throw E('sim:load:notFound', `There is no model or model file named '${s}'.`);
}

/** Notifies the editor that M code changed a model (once per tick). */
export function markChanged(ctx, name) {
  const st = simState(ctx);
  st.changed.add(name);
  if (st.timer) return;
  const flush = () => {
    st.timer = null;
    for (const n of st.changed) { const e = st.models.get(n); if (e) post(ctx, { type: 'sim.model', name: n, path: e.path, model: clone(e.model), reason: 'engine' }); }
    st.changed.clear();
  };
  if (typeof setTimeout === 'function') st.timer = setTimeout(flush, 0); else flush();
}

// ------------------------------------------------------------ handles
export function handleOf(ctx, modelName, id) {
  const st = simState(ctx);
  const key = `${modelName}\u0000${id}`;
  let h = st.handles.get(key);
  if (!h) { h = st.nextHandle++ + 0.0001220703125; st.handles.set(key, h); st.byHandle.set(h, { model: modelName, id }); }
  return h;
}

/**
 * Resolves a path ('m', 'm/Sub/Gain') or a handle to
 * { entry, model, block|null, system, parent|null, path }.
 */
export function resolveObj(ctx, obj, { load = true } = {}) {
  const st = simState(ctx);
  if (typeof obj === 'number') {
    const r = st.byHandle.get(obj);
    if (!r) throw E('sim:handle:invalid', `Invalid block handle ${obj}.`);
    const entry = st.models.get(r.model);
    if (!entry) throw E('sim:handle:invalid', `The model of handle ${obj} is not loaded.`);
    if (r.id === 'root') return { entry, model: entry.model, block: null, system: entry.model.root, parent: null, path: entry.model.name };
    let found = null;
    walk(entry.model, (b, sys, p) => { if (b.id === r.id) { found = { block: b, parent: sys, path: joinPath(p) }; return false; } return true; });
    if (!found) throw E('sim:handle:invalid', `The block of handle ${obj} no longer exists.`);
    return { entry, model: entry.model, block: found.block, system: found.block.system || null, parent: found.parent, path: found.path };
  }
  const s = String(obj);
  const parts = splitPath(s);
  let entry = st.models.get(parts[0]);
  if (!entry && load) entry = loadModel(ctx, parts[0]);
  if (!entry) throw E('sim:path:notLoaded', `The model '${parts[0]}' is not loaded.`);
  const r = resolvePath(entry.model, parts);
  if (!r) throw E('sim:path:invalid', `There is no block named '${s}'.`);
  return { entry, model: entry.model, block: r.block, system: r.system, parent: r.parent, path: joinPath(parts) };
}

export { absPath };
