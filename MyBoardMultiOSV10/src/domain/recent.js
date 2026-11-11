// Recently opened boards and projects (at most 10, newest first, no duplicates) and recently used
// databases (also 10). Managed from the File menu, the start page and Settings › Recent.
//
// An entry: { path, title, kind ('board' | 'project'), project (name), icon (IconRef), db (label), at }.
// `path` is '<kind>:<id>@<db label>' so the same board id in two databases stays apart.
import { RECENT_DIRS_KEY, RECENT_KEY } from './settings.js';

export const MAX_RECENT = 10;

const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();

/** The path of a board / project in a database. */
export const recentPath = (kind, id, db = '') => `${kind}:${id}${db ? `@${db}` : ''}`;

/** { kind, id, db } of a recent path (null when it is not one). */
export function parseRecentPath(path) {
  const m = /^(board|project):([^@]+)(?:@(.*))?$/.exec(String(path ?? ''));
  return m ? { kind: m[1], id: m[2], db: m[3] ?? '' } : null;
}

export function addRecent(list, entry, max = MAX_RECENT) {
  const item = {
    path: entry.path, title: entry.title ?? '', web: Boolean(entry.web), at: entry.at ?? Date.now(),
    kind: entry.kind ?? parseRecentPath(entry.path)?.kind ?? '', project: entry.project ?? '', icon: entry.icon ?? '', db: entry.db ?? '',
  };
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
/** Recently used databases: { path: '<type>:<label>', title }. */
export const loadRecentDirs = (storage) => load(storage, RECENT_DIRS_KEY);
export const storeRecentDirs = (storage, list) => store(storage, RECENT_DIRS_KEY, list);
