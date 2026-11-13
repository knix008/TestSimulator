// The user's own library (kept across projects): their categories and their items (imported 3D models).
// Metadata is one record, each model's GLB bytes another (IndexedDB: any size, also in the desktop WebView).
// A placed item is copied into the project (app.js adoptLibraryItem), so saved projects never depend on it.
//
//   meta = { categories: [{ id: 'ucat-…', name, icon }], items: [{ id: 'ulib-…', name, category, size, triangles, source, placement, folder }] }
import { idbDelete, idbGet, idbSet } from '../platform/idb.js';

const META_KEY = 'userLibrary.meta.v1';
const MODEL_KEY = (id) => `userLibrary.model:${id}`;

/** Icons a user category can take (icons-3d.js / icons.js names). */
export const USER_CATEGORY_ICONS = ['libMine', 'libAccessories', 'libDecor', 'libLiving', 'libOffice', 'libOfficeProps', 'libComputer', 'libServerRoom', 'libSecurity', 'libLandscape', 'libLighting', 'libStorage', 'libPlants', 'libKitchen', 'libAppliances', 'libWorkplace'];

const empty = () => ({ categories: [], items: [] });
let cache = null;

export function normalizeMeta(meta) {
  const out = empty();
  for (const c of meta?.categories ?? []) if (c?.id && c.name) out.categories.push({ id: String(c.id), name: String(c.name), icon: USER_CATEGORY_ICONS.includes(c.icon) ? c.icon : 'libMine' });
  for (const i of meta?.items ?? []) if (i?.id && i.name) out.items.push({ id: String(i.id), name: String(i.name), category: i.category ?? 'mine', size: Array.isArray(i.size) ? i.size : [1, 1, 1], triangles: i.triangles ?? 0, source: i.source ?? '', placement: i.placement ?? 'floor', folder: i.folder ?? '' });
  return out;
}

export async function loadUserLibrary() {
  if (cache) return cache;
  try { cache = normalizeMeta(await idbGet(META_KEY)); } catch { cache = empty(); }
  return cache;
}

async function save() { await idbSet(META_KEY, cache); }

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A new category; a name already used returns that category. */
export async function addUserCategory(name, icon = 'libMine') {
  const lib = await loadUserLibrary();
  const clean = String(name).trim().slice(0, 40);
  if (!clean) return null;
  const same = lib.categories.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (same) return same;
  const category = { id: newId('ucat'), name: clean, icon: USER_CATEGORY_ICONS.includes(icon) ? icon : 'libMine' };
  lib.categories.push(category);
  await save();
  return category;
}

export async function updateUserCategory(id, patch) {
  const lib = await loadUserLibrary();
  const c = lib.categories.find((x) => x.id === id);
  if (!c) return null;
  if (patch.name?.trim()) c.name = patch.name.trim().slice(0, 40);
  if (patch.icon && USER_CATEGORY_ICONS.includes(patch.icon)) c.icon = patch.icon;
  await save();
  return c;
}

/** Removes a category; its items go to My objects, or are deleted with `deleteItems`. → ids of deleted items. */
export async function removeUserCategory(id, { deleteItems = false } = {}) {
  const lib = await loadUserLibrary();
  lib.categories = lib.categories.filter((c) => c.id !== id);
  const gone = [];
  for (const item of lib.items) if (item.category === id) { if (deleteItems) gone.push(item.id); else item.category = 'mine'; }
  lib.items = lib.items.filter((i) => !gone.includes(i.id));
  await save();
  await Promise.all(gone.map((g) => idbDelete(MODEL_KEY(g)).catch(() => {})));
  return gone;
}

/** Stores a model (GLB bytes) as a library item. → the item. */
export async function addUserItem({ name, category = 'mine', glb, size, triangles = 0, source = '', placement = 'floor', folder = '' }) {
  const lib = await loadUserLibrary();
  const item = { id: newId('ulib'), name: String(name).slice(0, 80), category, size: size ?? [1, 1, 1], triangles, source, placement, folder };
  await idbSet(MODEL_KEY(item.id), glb);
  lib.items.push(item);
  await save();
  return item;
}

export async function updateUserItem(id, patch) {
  const lib = await loadUserLibrary();
  const item = lib.items.find((x) => x.id === id);
  if (!item) return null;
  for (const key of ['name', 'category', 'placement']) if (patch[key] != null) item[key] = patch[key];
  await save();
  return item;
}

export async function removeUserItem(id) {
  const lib = await loadUserLibrary();
  lib.items = lib.items.filter((i) => i.id !== id);
  await save();
  await idbDelete(MODEL_KEY(id)).catch(() => {});
}

export const userItemModel = (id) => idbGet(MODEL_KEY(id));

/**
 * Groups files of a folder for import: model files with their companions (same folder: .mtl, textures, .bin),
 * the sub-folder each lies in (relative to the chosen folder) — for one category per sub-folder.
 *   files: [{ name, path | relativePath }] → [{ file, related: [file…], folder }]
 */
export function groupFolderFiles(files, isModel, root = '') {
  const dirOf = (f) => (f.relativePath ?? f.path ?? f.name).replace(/\\/g, '/').replace(/\/[^/]*$/, '');
  const base = root.replace(/\\/g, '/').replace(/\/$/, '');
  const byDir = new Map();
  for (const f of files) { const d = dirOf(f); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(f); }
  const out = [];
  for (const [dir, list] of byDir) {
    let rel = base && dir.toLowerCase().startsWith(base.toLowerCase()) ? dir.slice(base.length).replace(/^\//, '') : dir;
    // web folders: the first part of relativePath is the chosen folder itself
    if (!base && files[0]?.relativePath) rel = rel.split('/').slice(1).join('/');
    const folder = rel.split('/')[0] ?? '';
    for (const f of list) if (isModel(f.name)) out.push({ file: f, related: list.filter((o) => o !== f && !isModel(o.name)), folder });
  }
  return out;
}
