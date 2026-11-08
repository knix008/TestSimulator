// Recent files and folders (newest first, no duplicates, at most MAX), kept in localStorage.
export const MAX_RECENT = 20;
const FILES_KEY = 'mytextmaster.recent';
const DIRS_KEY = 'mytextmaster.recentDirs';
const SESSION_KEY = 'mytextmaster.session';

const same = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();

/** The list with `entry` first (an entry is { path, web? }). */
export function addRecent(list, entry) {
  const item = typeof entry === 'string' ? { path: entry } : entry;
  if (!item?.path) return list;
  return [{ ...item, at: Date.now() }, ...list.filter((other) => !same(other.path, item.path))].slice(0, MAX_RECENT);
}

export const removeRecent = (list, path) => list.filter((item) => !same(item.path, path));

function read(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item.path === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}
const write = (storage, key, value) => { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

export const loadRecent = (storage) => read(storage, FILES_KEY);
export const storeRecent = (storage, list) => write(storage, FILES_KEY, list);
export const loadRecentDirs = (storage) => read(storage, DIRS_KEY);
export const storeRecentDirs = (storage, list) => write(storage, DIRS_KEY, list);

/**
 * The open documents at the last exit: paths of saved files, and the text of unsaved ones
 * (each at most 2 MB, so the session never fills the storage).
 */
export function sessionOf(docs, activeId) {
  const LIMIT = 2 * 1024 * 1024;
  return {
    active: Math.max(0, docs.findIndex((doc) => doc.id === activeId)),
    docs: docs.map((doc) => (doc.path && !doc.dirty && !doc.web
      ? { path: doc.path, kind: doc.kind }
      : { name: doc.name, kind: doc.kind, path: doc.web ? null : doc.path, text: doc.text.length <= LIMIT ? doc.text : '', eol: doc.eol, dirty: true })),
  };
}

export function loadSession(storage) {
  try {
    const value = JSON.parse(storage?.getItem(SESSION_KEY) ?? 'null');
    return value && Array.isArray(value.docs) ? value : null;
  } catch {
    return null;
  }
}
export const storeSession = (storage, session) => write(storage, SESSION_KEY, session);
