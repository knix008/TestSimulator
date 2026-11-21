// Where a vault keeps its files (cad/vault.js talks to one of these stores):
//   desktop — a folder the user picks (local or shared drive) through the Rust backend (src-tauri/src/vault.rs:
//     paths checked to stay inside the folder, locks by exclusive create, only lock files removed);
//   web     — IndexedDB ('mymechanics-vaults'): every vault is a name, its files are keys "<vault>/<path>";
//     add() refuses an existing key, so a lock is still taken by one tab only.
import { invoke, isDesktop } from './native.js';

export function desktopVaultStore(root) {
  return {
    kind: 'folder', root, label: root,
    read: (rel) => invoke('vault_read', { root, rel }),
    write: (rel, content) => invoke('vault_write', { root, rel, content }),
    createExclusive: (rel, content) => invoke('vault_create_exclusive', { root, rel, content }),
    removeLock: (rel) => invoke('vault_remove_lock', { root, rel }),
    rename: (from, to) => invoke('vault_rename', { root, from, to }),
    list: (rel) => invoke('vault_list', { root, rel }),
    exportFiles: (dir, entries) => invoke('vault_export', { dir, entries }),
    exportZip: (path, entries) => invoke('vault_zip', { path, entries }),
  };
}

export const vaultInfo = (root) => invoke('vault_info', { root });

// ───────────────────────── web: IndexedDB

const DB = 'mymechanics-vaults';
const STORE = 'files';
const VAULTS = 'vaults';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); request.result.createObjectStore(VAULTS); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(stores, mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let result;
      Promise.resolve(work(t, (r) => { result = r; })).catch(reject);
      t.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('aborted'));
    });
  } finally { db.close(); }
}
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const clean = (rel) => {
  const parts = String(rel).split(/[\\/]/);
  if (!rel || parts.some((p) => !p || p === '.' || p === '..')) throw new Error(`unsafe path: ${rel}`);
  return parts.join('/');
};

/** The web vaults (names) kept in this browser. */
export async function webVaults() {
  try { return await tx([VAULTS], 'readonly', async (t, done) => { const keys = await req(t.objectStore(VAULTS).getAllKeys()); done(keys.map(String).sort()); }); } catch { return []; }
}

export function webVaultStore(name) {
  const vault = String(name).trim();
  if (!vault || /[\\/]/.test(vault)) throw new Error('bad vault name');
  const key = (rel) => `${vault}/${clean(rel)}`;
  const files = (mode, fn) => tx([STORE], mode, (t, done) => fn(t.objectStore(STORE), done));
  return {
    kind: 'web', root: vault, label: vault,
    read: (rel) => files('readonly', async (s, done) => { const v = await req(s.get(key(rel))); done(v ?? null); }),
    async write(rel, content) {
      await tx([STORE, VAULTS], 'readwrite', (t) => { t.objectStore(STORE).put(String(content), key(rel)); if (rel === 'vault.json') t.objectStore(VAULTS).put(Date.now(), vault); });
    },
    async createExclusive(rel, content) {
      try { await files('readwrite', (s) => { s.add(String(content), key(rel)); }); return true; } catch (error) { if (error?.name === 'ConstraintError') return false; throw error; }
    },
    async removeLock(rel) {
      if (!/^\.locks\/[^/]+\.lock$/.test(clean(rel))) throw new Error(`not a lock: ${rel}`);
      return files('readwrite', async (s, done) => { const had = (await req(s.count(key(rel)))) > 0; s.delete(key(rel)); done(had); });
    },
    async rename(from, to) {
      if (!/^files\/[^/]+$/.test(clean(from)) || !/^files\/[^/]+$/.test(clean(to))) throw new Error('rename outside files/');
      await files('readwrite', async (s) => {
        const v = await req(s.get(key(from)));
        if (v == null) throw new Error(`missing: ${from}`);
        if (from.toLowerCase() !== to.toLowerCase() && (await req(s.count(key(to)))) > 0) throw new Error(`exists: ${to}`);
        s.delete(key(from));
        s.put(v, key(to));
      });
    },
    list: (rel) => files('readonly', async (s, done) => {
      const prefix = rel ? `${vault}/${clean(rel)}/` : `${vault}/`;
      const keys = await req(s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)));
      done(keys.map(String).map((k) => k.slice(prefix.length)).filter((k) => !k.includes('/')).sort());
    }),
  };
}

/** The store of a vault location: { kind: 'folder', root } on the desktop, { kind: 'web', root: name } in a browser. */
export const storeFor = (location) => (location?.kind === 'folder' && isDesktop() ? desktopVaultStore(location.root) : webVaultStore(location?.root ?? 'Vault'));
