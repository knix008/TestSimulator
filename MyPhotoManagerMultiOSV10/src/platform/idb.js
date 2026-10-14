// Small IndexedDB wrapper. Stores:
//   kv      settings-like values, folder handles of the web build, the web catalog
//   thumbs  thumbnail cache: key "path|size|modified" → { blob, width, height, hash }
const DB = 'myphotomanager';
const VERSION = 1;
const STORES = ['kv', 'thumbs'];

let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB is not available'));
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      for (const store of STORES) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    request.onerror = () => { opening = null; reject(request.error); };
    return undefined;
  });
  return opening;
}

async function run(store, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = action(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const idbGet = (key, store = 'kv') => run(store, 'readonly', (s) => s.get(key));
export const idbSet = (key, value, store = 'kv') => run(store, 'readwrite', (s) => s.put(value, key));
export const idbDelete = (key, store = 'kv') => run(store, 'readwrite', (s) => s.delete(key));
export const idbClear = (store) => run(store, 'readwrite', (s) => s.clear());
export const idbCount = (store) => run(store, 'readonly', (s) => s.count());

/** Deletes every key of `store` that starts with `prefix`. */
export async function idbDeletePrefix(prefix, store = 'thumbs') {
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  return run(store, 'readwrite', (s) => s.delete(range));
}
