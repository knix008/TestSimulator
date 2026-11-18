// Recently used Markdown files and saved documents, and recently added folders (at most 10 each, newest
// first, no duplicates). Managed from the File menu, the start page and Settings › Recent. Desktop only:
// a browser gives no paths to come back to.
//
// An entry: { path, title, kind ('file' | 'folder'), at }.
import { RECENT_DIRS_KEY, RECENT_KEY } from './settings.js';

export const MAX_RECENT = 10;

const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();

export function addRecent(list, entry, max = MAX_RECENT) {
  const item = { path: entry.path, title: entry.title ?? '', kind: entry.kind === 'folder' ? 'folder' : 'file', at: entry.at ?? Date.now() };
  return [item, ...list.filter((other) => !samePath(other.path, item.path))].slice(0, max);
}

export const removeRecent = (list, path) => list.filter((item) => !samePath(item.path, path));

function load(storage, key) {
  try {
    const list = JSON.parse(storage?.getItem(key) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item.path === 'string' && item.path).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function store(storage, key, list) {
  try {
    storage?.setItem(key, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch { /* storage full or blocked */ }
}

export const loadRecent = (storage) => load(storage, RECENT_KEY);
export const storeRecent = (storage, list) => store(storage, RECENT_KEY, list);
export const loadRecentDirs = (storage) => load(storage, RECENT_DIRS_KEY);
export const storeRecentDirs = (storage, list) => store(storage, RECENT_DIRS_KEY, list);
