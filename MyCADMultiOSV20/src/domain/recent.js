// Recently used files: at most 10, newest first, no duplicates.
import { RECENT_KEY } from './settings.js';

export const MAX_RECENT = 10;

const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();

export function addRecent(list, entry, max = MAX_RECENT) {
  const item = { path: entry.path, title: entry.title ?? '', web: Boolean(entry.web), at: entry.at ?? Date.now() };
  return [item, ...list.filter((other) => !samePath(other.path, item.path))].slice(0, max);
}

export const removeRecent = (list, path) => list.filter((item) => !samePath(item.path, path));

export function loadRecent(storage) {
  try {
    const list = JSON.parse(storage?.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item.path === 'string' && item.path).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function storeRecent(storage, list) {
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch { /* storage full or blocked */ }
}
