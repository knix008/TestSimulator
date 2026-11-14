import { isDesktop, readTextFile, workspaceFile, writeTextFile } from './native.js';

const KEY = 'myworkforce-workspace';

function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('no-idb')); return; }
    const request = indexedDB.open('myworkforce', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('kv').objectStore('kv').get(KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('kv', 'readwrite').objectStore('kv').put(value, KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadLocal() {
  let fromDisk = null;
  if (isDesktop()) {
    try {
      fromDisk = JSON.parse(await readTextFile(await workspaceFile()));
    } catch { /* first launch, or the file is not there yet */ }
  }
  let fromBrowser = null;
  try { fromBrowser = await idbGet(); } catch { /* private mode */ }
  if (!fromBrowser) {
    try { fromBrowser = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  }
  const diskTime = Date.parse(fromDisk?.savedAt || '') || 0;
  const browserTime = Date.parse(fromBrowser?.savedAt || '') || 0;
  if (diskTime || browserTime) return diskTime >= browserTime ? fromDisk : fromBrowser;
  return fromDisk || fromBrowser;
}

export async function saveLocal(ws) {
  ws.savedAt = new Date().toISOString();
  const text = JSON.stringify(ws);
  try { await idbSet(ws); } catch { /* the file copy still counts on the desktop */ }
  try {
    if (text.length < 4_000_000) localStorage.setItem(KEY, text);
  } catch { /* quota */ }
  if (isDesktop()) await writeTextFile(await workspaceFile(), text);
}
