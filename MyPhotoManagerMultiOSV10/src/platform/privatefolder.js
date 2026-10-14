// Private folder (password protected). Photos moved here leave their folder
// and are kept encrypted (AES-256-GCM, key from the password with PBKDF2-SHA256)
// in the app's data: desktop → <data>/private/*.bin, web → IndexedDB. While
// unlocked they show as a read-only folder; locking forgets the key.
import { idbDelete, idbGet, idbSet } from './idb.js';
import { invoke, isDesktop } from './native.js';
import { baseName, fs, joinPath, webFs } from './fs.js';

const ITERATIONS = 250000;
const enc = new TextEncoder();
const dec = new TextDecoder();

let dataDir = null;
async function privateDir() {
  if (!dataDir) dataDir = (await invoke('app_info')).dataDir;
  return joinPath(dataDir, 'private');
}

// ───────── storage (desktop files or IndexedDB)

async function storeRead(name) {
  if (isDesktop()) {
    try { return await fs.read(joinPath(await privateDir(), name)); } catch { return null; }
  }
  const value = await idbGet(`private:${name}`).catch(() => null);
  return value ? new Uint8Array(value) : null;
}

async function storeWrite(name, bytes) {
  if (isDesktop()) return fs.write(joinPath(await privateDir(), name), bytes);
  return idbSet(`private:${name}`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

async function storeDelete(name) {
  if (isDesktop()) return fs.remove([joinPath(await privateDir(), name)], false);
  return idbDelete(`private:${name}`);
}

// ───────── crypto

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + body.length);
  out.set(iv, 0);
  out.set(body, 12);
  return out;
}

export async function decryptBytes(key, bytes) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)));
}

// ───────── the folder

const state = { key: null, index: null, root: null };

export const isUnlocked = () => Boolean(state.key);
export const rootPath = () => state.root;

export async function isSetUp() {
  return Boolean(await storeRead('salt.bin'));
}

/** First use: chooses the password. */
export async function setUp(password) {
  if (await isSetUp()) throw new Error('already set up');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await storeWrite('salt.bin', salt);
  state.key = await deriveKey(password, salt);
  state.index = [];
  await saveIndex();
}

/** Unlocks with the password; throws on a wrong password. */
export async function unlock(password) {
  const salt = await storeRead('salt.bin');
  if (!salt) throw new Error('not set up');
  const key = await deriveKey(password, salt);
  const index = await storeRead('index.bin');
  try {
    state.index = index ? JSON.parse(dec.decode(await decryptBytes(key, index))) : [];
  } catch {
    throw new Error('wrong password');
  }
  state.key = key;
}

export function lock() {
  if (state.root) webFs.closeRoot(state.root).catch(() => {});
  state.key = null;
  state.index = null;
  state.root = null;
}

async function saveIndex() {
  await storeWrite('index.bin', await encryptBytes(state.key, enc.encode(JSON.stringify(state.index))));
}

export const list = () => [...(state.index ?? [])];

/** Names stay unique inside the private folder (it is shown as one flat folder). */
function uniqueName(name) {
  const taken = new Set(state.index.map((entry) => entry.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) if (!taken.has(`${stem} (${n})${ext}`.toLowerCase())) return `${stem} (${n})${ext}`;
}

/**
 * Moves files into the private folder: encrypted copy first, then the
 * original is deleted for good. `read(path)` and `remove(paths)` come from the app.
 */
export async function addFiles(paths, { onProgress } = {}) {
  if (!state.key) throw new Error('locked');
  const added = [];
  for (const [i, path] of paths.entries()) {
    onProgress?.(i, paths.length, path);
    const bytes = await fs.read(path);
    const id = crypto.randomUUID();
    await storeWrite(`${id}.bin`, await encryptBytes(state.key, bytes));
    const [info] = await fs.stat([path]).catch(() => [null]);
    state.index.push({ id, name: uniqueName(baseName(path)), size: bytes.length, modified: info?.modified ?? Date.now(), from: path, added: Date.now() });
    added.push(path);
  }
  await saveIndex();
  await fs.remove(added, false);
  return added;
}

/** Writes decrypted copies into `dir` and removes them from the private folder. */
export async function restoreFiles(ids, dir) {
  if (!state.key) throw new Error('locked');
  const restored = [];
  for (const id of ids) {
    const entry = state.index.find((e) => e.id === id);
    if (!entry) continue;
    const bytes = await decryptBytes(state.key, await storeRead(`${id}.bin`));
    const target = joinPath(dir, entry.name);
    await fs.write(target, bytes);
    await storeDelete(`${id}.bin`);
    state.index = state.index.filter((e) => e.id !== id);
    restored.push(target);
  }
  await saveIndex();
  return restored;
}

export async function deleteFiles(ids) {
  for (const id of ids) {
    await storeDelete(`${id}.bin`).catch(() => {});
    state.index = state.index.filter((e) => e.id !== id);
  }
  await saveIndex();
}

/** Decrypts everything into a read-only folder in memory; returns its path. */
export async function mount(name) {
  if (!state.key) throw new Error('locked');
  if (state.root) await webFs.closeRoot(state.root).catch(() => {});
  const files = [];
  for (const entry of state.index) {
    const bytes = await decryptBytes(state.key, await storeRead(`${entry.id}.bin`));
    const file = new File([bytes], entry.name, { lastModified: entry.modified });
    files.push({ file, relativePath: entry.name });
  }
  state.root = webFs.addMemoryFolder(name, files);
  return state.root;
}

/** Private-folder id of a path in the mounted folder (by name). */
export function idOf(path) {
  const name = baseName(path);
  return state.index?.find((entry) => entry.name === name)?.id ?? null;
}
