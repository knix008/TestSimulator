// Where the gallery lives.
//
// The first version of the shelf kept everything in the settings file,
// thumbnails included. That works for a few dozen books and for nothing more:
// a 12 KB cover inside a JSON string is 16 KB of base64, so a hundred thousand
// books would be 1.5 GB of settings — and the whole of it parsed at startup,
// for a screen showing forty cards.
//
// So the shelf is split in two:
//
//   • the index — one small record per book (path, title, author, format,
//     size, how far the reading got, when) — held in one file, or in one
//     IndexedDB store on the web. 100,000 books is about 17 MB and parses in
//     well under a tenth of a second;
//   • the covers — one file each, never loaded by the shelf itself. In the
//     desktop app they are served over `app://covers/…`, so a card is an
//     ordinary <img> and the browser loads, caches and forgets it as it
//     scrolls. On the web they come out of IndexedDB one at a time, for the
//     cards that are actually on screen.
//
// Nothing here knows about React; the gallery asks, this answers.
import { api, isElectron } from './platform.js';

export const COVER_HOST = 'app://covers';
const DB_NAME = 'myebookreader-gallery';
const DB_VERSION = 1;
const ENTRIES = 'entries';
const COVERS = 'covers';

/** How long to sit on changes before writing the index out again. */
export const SAVE_DELAY = 1200;

/**
 * And how long for reading positions, which change every time a page is turned.
 *
 * They are kept in a file of their own for the same reason the covers are: a
 * position is a number, and rewriting a 23 MB index because someone turned a
 * page blocked the renderer for long enough to be felt — the gallery took a
 * second and a half to appear instead of twenty milliseconds.
 */
export const POSITION_DELAY = 4000;

/**
 * A short, stable, file-safe name for a book's cover.
 * FNV-1a: a few lines, no dependency, and collisions at this scale cost one
 * book the wrong thumbnail rather than anything that matters.
 */
export function coverName(key) {
  let hash = 0x811c9dc5;
  const text = String(key || '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // The length goes in too, so two different paths of the same hash are rarer.
  return `${hash.toString(16).padStart(8, '0')}${text.length.toString(36)}.png`;
}

function dataUrlToBase64(dataUrl) {
  const at = String(dataUrl || '').indexOf(',');
  return at < 0 ? '' : dataUrl.slice(at + 1);
}

// ── The desktop shelf: one index file, one file per cover ──
/** Takes the bridge rather than reaching for it, so it can be tested. */
export function electronGalleryStore(bridge) {
  let pending = null;
  let timer = 0;
  const positions = new Map();
  let positionTimer = 0;

  const flush = async () => {
    if (!pending) return;
    const text = JSON.stringify(pending);
    pending = null;
    await bridge.gallery.save(text);
  };

  const flushPositions = async () => {
    positionTimer = 0;
    if (!positions.size) return;
    const payload = Object.fromEntries(positions);
    positions.clear();
    await bridge.gallery.savePositions(JSON.stringify(payload));
  };

  return {
    kind: 'electron',

    async load() {
      const [text, marks] = await Promise.all([
        bridge.gallery.load(),
        bridge.gallery.loadPositions?.() ?? '',
      ]);
      if (!text) return [];
      let rows;
      try {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
      // Where the reading got to is kept apart from the index and put back on
      // the way in; a damaged or missing file simply means no positions.
      try {
        const saved = marks ? JSON.parse(marks) : null;
        if (saved && typeof saved === 'object') {
          for (const entry of rows) {
            const mark = saved[entry.path || entry.name];
            if (!mark) continue;
            entry.section = mark.section ?? entry.section;
            entry.sections = mark.sections ?? entry.sections;
            entry.openedAt = mark.openedAt ?? entry.openedAt;
          }
        }
      } catch { /* the index is still good without them */ }
      return rows;
    },

    // One book changing does not justify writing a 17 MB file, so the whole
    // index is written once the changes stop coming — and a page turn does not
    // touch the index at all.
    write(entries, changed) {
      pending = entries;
      if (changed?.position && changed.put) {
        const key = changed.put.path || changed.put.name;
        if (key) {
          positions.set(key, {
            section: changed.put.section,
            sections: changed.put.sections,
            openedAt: changed.put.openedAt,
          });
          if (!positionTimer) positionTimer = setTimeout(flushPositions, POSITION_DELAY);
          return;
        }
      }
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY);
    },

    async flush() {
      await flush();
      await flushPositions();
    },

    async putCover(key, dataUrl) {
      const name = coverName(key);
      const ok = await bridge.gallery.putCover(name, dataUrlToBase64(dataUrl));
      return ok ? `${COVER_HOST}/${name}` : '';
    },

    coverSrc(entry) {
      return entry?.cover ? `${COVER_HOST}/${coverName(entry.path || entry.name)}` : '';
    },

    async loadCover(entry) {
      return this.coverSrc(entry);
    },

    async clear() {
      pending = null;
      positions.clear();
      clearTimeout(timer);
      clearTimeout(positionTimer);
      positionTimer = 0;
      await bridge.gallery.clear();
    },
  };
}

// ── The web shelf: IndexedDB, a record per book and a blob per cover ──
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(COVERS)) db.createObjectStore(COVERS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function indexedDbStore() {
  let dbPromise = null;
  const db = () => {
    dbPromise = dbPromise || openDb();
    return dbPromise;
  };

  return {
    kind: 'indexeddb',

    async load() {
      const handle = await db();
      const tx = handle.transaction(ENTRIES, 'readonly');
      const rows = await asPromise(tx.objectStore(ENTRIES).getAll());
      return rows.map(({ key, ...entry }) => entry);
    },

    // A change is one record, not the whole shelf — the point of a database.
    async write(entries, changed) {
      const handle = await db();
      const tx = handle.transaction(ENTRIES, 'readwrite');
      const store = tx.objectStore(ENTRIES);
      if (changed?.removed) store.delete(changed.removed);
      if (changed?.put) store.put({ key: changed.put.path || changed.put.name, ...changed.put });
      if (!changed) {
        store.clear();
        for (const entry of entries) store.put({ key: entry.path || entry.name, ...entry });
      }
      return asPromise(tx);
    },

    async flush() {},

    async putCover(key, dataUrl) {
      const handle = await db();
      const tx = handle.transaction(COVERS, 'readwrite');
      tx.objectStore(COVERS).put(dataUrl, key);
      await asPromise(tx);
      return dataUrl;
    },

    // Nothing to give synchronously: a cover is fetched when its card appears.
    coverSrc() {
      return '';
    },

    async loadCover(entry) {
      if (!entry?.cover) return '';
      const handle = await db();
      const tx = handle.transaction(COVERS, 'readonly');
      const value = await asPromise(tx.objectStore(COVERS).get(entry.path || entry.name));
      return value || '';
    },

    async clear() {
      const handle = await db();
      const tx = handle.transaction([ENTRIES, COVERS], 'readwrite');
      tx.objectStore(ENTRIES).clear();
      tx.objectStore(COVERS).clear();
      return asPromise(tx);
    },
  };
}

// ── No storage at all (tests, a private window with IndexedDB blocked) ──
function memoryStore() {
  let rows = [];
  const covers = new Map();
  return {
    kind: 'memory',
    async load() { return rows; },
    async write(entries) { rows = entries; },
    async flush() {},
    async putCover(key, dataUrl) { covers.set(key, dataUrl); return dataUrl; },
    coverSrc() { return ''; },
    async loadCover(entry) { return covers.get(entry?.path || entry?.name) || ''; },
    async clear() { rows = []; covers.clear(); },
  };
}

let store = null;

/** The shelf's storage for wherever this is running. */
export function galleryStore() {
  if (store) return store;
  if (isElectron && api?.gallery) store = electronGalleryStore(api);
  else if (typeof indexedDB !== 'undefined') store = indexedDbStore();
  else store = memoryStore();
  return store;
}

/** Test seam: swap the storage, or drop back to whatever the platform gives. */
export function setGalleryStore(next) {
  store = next || null;
  return store;
}
