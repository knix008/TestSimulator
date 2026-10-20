// First-page pictures for the gallery, keyed by file path.
//
// Kept in IndexedDB (a few hundred JPEGs would not fit in localStorage next to
// the settings) with an in-memory copy in front. Where IndexedDB is missing
// (tests, a locked-down browser) the memory copy is all there is.
const DB_NAME = 'mypdfviewer-thumbs';
const STORE = 'thumbs';

const memory = new Map();
const listeners = new Map();   // key → Set<fn>
let dbPromise = null;

function key(path) {
  return String(path || '').replace(/\\/g, '/').toLowerCase();
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function notify(k, url) {
  for (const fn of listeners.get(k) || []) {
    try { fn(url); } catch { /* a card that went away */ }
  }
}

// The picture for a path, or '' when there is none yet.
export async function getThumb(path) {
  const k = key(path);
  if (!k) return '';
  if (memory.has(k)) return memory.get(k);
  const url = await tx('readonly', (s) => s.get(k));
  const v = typeof url === 'string' ? url : '';
  if (v) memory.set(k, v);
  return v;
}

export function peekThumb(path) {
  return memory.get(key(path)) || '';
}

export async function setThumb(path, url) {
  const k = key(path);
  if (!k || typeof url !== 'string' || !url.startsWith('data:image/')) return;
  memory.set(k, url);
  notify(k, url);
  await tx('readwrite', (s) => s.put(url, k));
}

export async function deleteThumb(path) {
  const k = key(path);
  if (!k) return;
  memory.delete(k);
  notify(k, '');
  await tx('readwrite', (s) => s.delete(k));
}

// Calls fn(url) whenever the picture for `path` changes. Returns an unsubscribe.
export function subscribeThumb(path, fn) {
  const k = key(path);
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k).add(fn);
  return () => {
    const set = listeners.get(k);
    set?.delete(fn);
    if (set && !set.size) listeners.delete(k);
  };
}

// Tests only.
export function __resetThumbs() {
  memory.clear();
  listeners.clear();
}
