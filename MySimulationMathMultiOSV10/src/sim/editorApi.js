// The open model editors, for the app's side panels (블록 라이브러리, 모델 구조,
// 블록 속성 in src/sim/SidePanes.jsx). Every ModelEditor publishes a small API
// after each render; the panels read it and act only through it, so edits go
// through the editor's own change() (Undo / Redo, dirty state, sim.edit).
//
//   publishSimEditor(docId, api) / withdrawSimEditor(docId)   (ModelEditor)
//   simEditor(docId) → api | null                            (side panes)
//   subscribeSimEditors(fn) → unsubscribe                    (fn() after any publish, batched)
//
// api: {
//   docId, name, model, crumbs: [subsystem block ids], selected: [block ids], status, running,
//   addItem(libraryItem)                 add a library block at the view centre (like a double-click)
//   openPath(crumbs)                     show that system level (like the breadcrumbs)
//   select(ids)                          select blocks of the current level
//   setBlock(id, { params, name })       apply a block's parameters / name (one Undo step)
//   setStyle(ids, { fg, bg, color })     colours of blocks (outline+icon / fill) and lines; null = theme colour
//   tune(id, params)                     live parameter change while running (sim.tune)
//   setSettings(patch)                   change the model settings (one Undo step)
//   openSettings() / openBlock(id)       the full model settings / block parameter dialog
// }
const editors = new Map();
const subs = new Set();
let pending = false;

function notify() {
  if (pending) return;
  pending = true;
  Promise.resolve().then(() => { pending = false; for (const fn of [...subs]) { try { fn(); } catch (e) { console.error(e); } } });
}

export function publishSimEditor(docId, api) { editors.set(docId || 'default', api); notify(); }
export function withdrawSimEditor(docId, api) { const k = docId || 'default'; if (!api || editors.get(k) === api) { editors.delete(k); notify(); } }
export function simEditor(docId) { return editors.get(docId || 'default') || null; }
export function subscribeSimEditors(fn) { subs.add(fn); return () => subs.delete(fn); }
