// Open maps (tabs) and their undo history.
//
// A doc: { id, path, name, map, saved (the map object last read or written),
// past: [map], future: [map], kind: 'tmap' | 'import' | 'new', mtime,
// readonly, view: { x, y, k } (camera), sel: [topic ids], selRel, focusId,
// filter, filterMode: 'dim' | 'hide' }
//
// dirty ⇔ map !== saved (edits never change a map in place, model.js).
import { indexOf } from './model.js';

const MAX_UNDO = 300;
const COALESCE_MS = 700;
let seq = 0;

export function createDoc(map, extra = {}) {
  seq += 1;
  return {
    id: `d${Date.now().toString(36)}${seq}`,
    path: '',
    name: '',
    map,
    saved: map,
    past: [],
    future: [],
    kind: 'new',
    mtime: 0,
    readonly: false,
    view: null,
    sel: [map.root.id],
    selRel: null,
    focusId: null,
    filter: null,
    filterMode: 'dim',
    lastKey: '',
    lastAt: 0,
    ...extra,
  };
}

export const isDirty = (doc) => !!doc && doc.map !== doc.saved;

// A new map state for the doc, recorded for undo. Edits with the same `key`
// in quick succession (dragging a slider, typing in a field) are one step.
export function commit(doc, map, { key = '', sel } = {}) {
  if (map === doc.map) return sel ? { ...doc, sel } : doc;
  const now = Date.now();
  const merge = key && key === doc.lastKey && now - doc.lastAt < COALESCE_MS && doc.past.length;
  const past = merge ? doc.past : [...doc.past, doc.map].slice(-MAX_UNDO);
  const next = { ...doc, map, past, future: [], lastKey: key, lastAt: now };
  next.sel = keepSelection(map, sel || doc.sel);
  if (next.selRel && !(map.relationships || []).some((r) => r.id === next.selRel)) next.selRel = null;
  if (next.focusId && !indexOf(map).has(next.focusId)) next.focusId = null;
  return next;
}

export function keepSelection(map, sel) {
  const idx = indexOf(map);
  const kept = (sel || []).filter((id) => idx.has(id));
  return kept.length ? kept : [map.root.id];
}

export function undo(doc) {
  if (!doc.past.length) return doc;
  const map = doc.past[doc.past.length - 1];
  return { ...doc, map, past: doc.past.slice(0, -1), future: [doc.map, ...doc.future], sel: keepSelection(map, doc.sel), lastKey: '' };
}

export function redo(doc) {
  if (!doc.future.length) return doc;
  const map = doc.future[0];
  return { ...doc, map, past: [...doc.past, doc.map], future: doc.future.slice(1), sel: keepSelection(map, doc.sel), lastKey: '' };
}

// The file name a map gets when saved as .tmap ("Name.tmap" from its title).
export function suggestName(doc, title) {
  if (doc.path && doc.kind === 'tmap') return doc.name;
  const base = (doc.name ? doc.name.replace(/\.[^.]+$/, '') : '') || String(title || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 60) || 'Map';
  return `${base}.tmap`;
}
