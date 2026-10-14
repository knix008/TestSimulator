// One file API for both builds.
//
// Desktop (Tauri): real paths; the Rust backend lists folders and does the file
// operations; pictures load through the asset protocol.
//
// Web: folders the user opened. With the File System Access API (Chrome, Edge)
// they are writable and remembered between visits ("@3:Photos/2024/a.jpg");
// elsewhere (Firefox, Safari) or for dropped / picked files they are read-only
// copies in memory for this visit. Saving then downloads the file.
import { idbGet, idbSet } from './idb.js';
import { assetUrl, errorText, invoke, isDesktop } from './native.js';
import { baseName, joinPath, parentOf } from '../catalog/catalog.js';
import { extensionOf, isMedia } from '../formats/types.js';

export { baseName, joinPath, parentOf };

// ───────────────────────── desktop

const versions = new Map();

const desktop = {
  kind: 'desktop',
  caps: { write: true, trash: true, reveal: true, wallpaper: true, originals: true, setTime: true, rename: true, move: true, mkdir: true, open: true },
  places: () => invoke('list_places'),
  async list(path, { hidden = false, probe = true } = {}) {
    const listing = await invoke('list_dir', { path, hidden, probe });
    return { dirs: listing.dirs, files: listing.files };
  },
  // A version query makes the engine reload a file that changed (rotate, edit).
  url: (path) => (versions.has(path) ? `${assetUrl(path)}?v=${versions.get(path)}` : assetUrl(path)),
  releaseUrl: (path) => { versions.set(path, (versions.get(path) ?? 0) + 1); },
  async read(path) {
    const response = await fetch(desktop.url(path), { cache: 'no-store' });
    if (!response.ok) throw new Error(`${baseName(path)}: ${response.status} ${response.statusText}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  async write(path, bytes) {
    await invoke('write_file', bytes, { headers: { 'x-path': encodeURIComponent(path) } });
    desktop.releaseUrl(path);
    return 'saved';
  },
  stat: (paths) => invoke('stat_paths', { paths }),
  copy: (paths, dir, conflict = 'rename') => invoke('copy_paths', { sources: paths, dir, conflict }),
  move: (paths, dir, conflict = 'rename') => invoke('move_paths', { sources: paths, dir, conflict }),
  rename: (path, name) => invoke('rename_path', { path, name }),
  remove: (paths, trash = true) => invoke('delete_paths', { paths, trash }),
  mkdir: (parent, name) => invoke('create_dir', { parent, name }),
  setModified: (path, millis) => invoke('set_modified', { path, millis }),
  walk: (path, extensions, limit = 100000, hidden = false) => invoke('walk_files', { path, hidden, extensions, limit }),
  reveal: (path) => invoke('reveal_path', { path }),
  openExternal: (path) => invoke('open_path', { path }),
  openUrl: (url) => invoke('open_url', { url }),
  setWallpaper: (path) => invoke('set_wallpaper', { path }),
  backupOriginal: (path) => invoke('backup_original', { path }),
  hasOriginals: (paths) => invoke('has_originals', { paths }),
  restoreOriginal: (path) => invoke('restore_original', { path }),
  discardOriginal: (path) => invoke('discard_original', { path }),
  readData: (name) => invoke('data_read', { name }),
  writeData: (name, content) => invoke('data_write', { name, content }),
};

// ───────────────────────── web

const roots = new Map(); // id → { id, name, type: 'handle' | 'memory', handle?, tree?, granted }
const handles = new Map(); // path → FileSystemHandle (web, handle roots)
const urls = new Map(); // path → object URL
// Folder ids are never reused, so catalog entries of a closed folder never land on another one.
const ID_KEY = 'myphotomanager.nextFolderId';
let nextId = Math.max(1, Number(globalThis.localStorage?.getItem(ID_KEY)) || 1);
function newId() {
  const id = nextId++;
  try { globalThis.localStorage?.setItem(ID_KEY, String(nextId)); } catch { /* storage blocked */ }
  return id;
}

export const hasFolderAccess = () => typeof globalThis.showDirectoryPicker === 'function';

function split(path) {
  const match = /^@(\d+):([^/]*)(?:\/(.*))?$/.exec(path);
  if (!match) throw new Error(`not a web path: ${path}`);
  const root = roots.get(Number(match[1]));
  if (!root) throw new Error(`folder is no longer open: ${match[2]}`);
  return { root, parts: match[3] ? match[3].split('/') : [] };
}

const rootPath = (root) => `@${root.id}:${root.name}`;

async function persistRoots() {
  const list = [...roots.values()].filter((root) => root.type === 'handle').map(({ id, name, handle }) => ({ id, name, handle }));
  await idbSet('webRoots', list).catch(() => {});
}

async function ensurePermission(root, write = false) {
  if (root.type !== 'handle') return;
  const mode = write ? 'readwrite' : 'read';
  if ((await root.handle.queryPermission?.({ mode })) === 'granted') { root.granted = true; return; }
  const state = await root.handle.requestPermission?.({ mode });
  root.granted = state === 'granted';
  if (!root.granted) throw new Error('permission denied');
}

async function dirHandle(path) {
  if (handles.has(path) && handles.get(path).kind === 'directory') return handles.get(path);
  const { root, parts } = split(path);
  let dir = root.handle;
  let current = rootPath(root);
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
    current = `${current}/${part}`;
    handles.set(current, dir);
  }
  return dir;
}

async function fileHandle(path) {
  if (handles.has(path) && handles.get(path).kind === 'file') return handles.get(path);
  const dir = await dirHandle(parentOf(path));
  const handle = await dir.getFileHandle(baseName(path));
  handles.set(path, handle);
  return handle;
}

/** Memory tree node for a folder path: { dirs: Map(name → node), files: Map(name → File) }. */
function memoryNode(path) {
  const { root, parts } = split(path);
  let node = root.tree;
  for (const part of parts) {
    node = node.dirs.get(part);
    if (!node) throw new Error(`no such folder: ${path}`);
  }
  return node;
}

const newNode = () => ({ dirs: new Map(), files: new Map() });

function entryOfFile(path, file) {
  return { name: file.name, path, isDir: false, size: file.size, modified: file.lastModified, created: file.lastModified, hidden: false, hasDirs: false };
}

async function webFile(path) {
  const { root } = split(path);
  if (root.type === 'memory') {
    const node = memoryNode(parentOf(path));
    const file = node.files.get(baseName(path));
    if (!file) throw new Error(`no such file: ${baseName(path)}`);
    return file;
  }
  return (await fileHandle(path)).getFile();
}

function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function copyHandleInto(source, targetDir, name) {
  if (source.kind === 'directory') {
    const created = await targetDir.getDirectoryHandle(name, { create: true });
    for await (const [childName, child] of source.entries()) await copyHandleInto(child, created, childName);
    return;
  }
  const file = await source.getFile();
  const target = await targetDir.getFileHandle(name, { create: true });
  const writable = await target.createWritable();
  await writable.write(file);
  await writable.close();
}

async function exists(dir, name) {
  try { await dir.getFileHandle(name); return true; } catch { /* not a file */ }
  try { await dir.getDirectoryHandle(name); return true; } catch { return false; }
}

async function uniqueName(dir, name) {
  if (!(await exists(dir, name))) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await exists(dir, candidate))) return candidate;
  }
}

function forgetHandles(path) {
  for (const key of [...handles.keys()]) if (key === path || key.startsWith(`${path}/`)) handles.delete(key);
  web.releaseUrl(path);
}

async function transfer(paths, dir, conflict, moving) {
  const results = [];
  const { root: targetRoot } = split(dir);
  if (targetRoot.type !== 'handle') throw new Error('read-only folder');
  await ensurePermission(targetRoot, true);
  const target = await dirHandle(dir);
  for (const path of paths) {
    const result = { source: path, target: null, error: null, skipped: false };
    try {
      if (moving && parentOf(path) === dir) { result.skipped = true; result.target = path; results.push(result); continue; }
      if (dir === path || dir.startsWith(`${path}/`)) throw new Error('A folder cannot be copied or moved into itself.');
      const { root } = split(path);
      let name = baseName(path);
      if (await exists(target, name)) {
        if (conflict === 'skip') { result.skipped = true; results.push(result); continue; }
        if (conflict === 'rename' || parentOf(path) === dir) name = await uniqueName(target, name);
        else await target.removeEntry(name, { recursive: true });
      }
      if (root.type === 'memory') {
        const file = await webFile(path);
        const created = await target.getFileHandle(name, { create: true });
        const writable = await created.createWritable();
        await writable.write(file);
        await writable.close();
      } else {
        const source = handles.get(path) ?? (await fileHandle(path).catch(() => dirHandle(path)));
        if (moving && typeof source.move === 'function' && root === targetRoot) {
          await source.move(target, name);
        } else {
          await copyHandleInto(source, target, name);
          if (moving) {
            await ensurePermission(root, true);
            await (await dirHandle(parentOf(path))).removeEntry(baseName(path), { recursive: true });
          }
        }
        if (moving) forgetHandles(path);
      }
      result.target = joinPath(dir, name);
    } catch (error) {
      result.error = errorText(error);
    }
    results.push(result);
  }
  return results;
}

async function walkWeb(path, extensions, limit, out) {
  const listing = await web.list(path, { probe: false });
  for (const file of listing.files) {
    if (!extensions.length || extensions.includes(extensionOf(file.name))) out.push(file);
    if (out.length >= limit) return out;
  }
  for (const dir of listing.dirs) {
    await walkWeb(dir.path, extensions, limit, out);
    if (out.length >= limit) return out;
  }
  return out;
}

const web = {
  kind: 'web',
  get caps() {
    return { write: hasFolderAccess(), trash: false, reveal: false, wallpaper: false, originals: false, setTime: false, rename: hasFolderAccess(), move: hasFolderAccess(), mkdir: hasFolderAccess(), open: false };
  },

  async restore() {
    const saved = (await idbGet('webRoots').catch(() => null)) ?? [];
    for (const { id, name, handle } of saved) {
      const granted = (await handle.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt')) === 'granted';
      roots.set(id, { id, name, type: 'handle', handle, granted });
      nextId = Math.max(nextId, id + 1);
    }
  },

  async places() {
    return [...roots.values()].map((root) => ({ name: root.name, path: rootPath(root), kind: root.type === 'handle' ? 'webfolder' : 'memory', granted: root.granted !== false, readOnly: root.type !== 'handle' }));
  },

  /** Asks again for access to a remembered folder (needs a click). */
  async reconnect(path) {
    const { root } = split(path);
    await ensurePermission(root, true);
    return root.granted;
  },

  /** Folder picker (File System Access API). Returns the folder's path or null. */
  async openFolder() {
    let handle;
    try {
      handle = await globalThis.showDirectoryPicker({ id: 'myphotomanager', mode: 'readwrite' });
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
    for (const root of roots.values()) {
      if (root.type === 'handle' && (await root.handle.isSameEntry?.(handle))) { root.granted = true; return rootPath(root); }
    }
    const root = { id: newId(), name: handle.name, type: 'handle', handle, granted: true };
    roots.set(root.id, root);
    await persistRoots();
    return rootPath(root);
  },

  /** Read-only folder of File objects (input[webkitdirectory], dropped files, samples). */
  addMemoryFolder(name, files, { stripRoot = false } = {}) {
    const root = { id: newId(), name: name.replace(/[/:@]/g, '_') || 'Files', type: 'memory', tree: newNode(), granted: true };
    for (const { file, relativePath } of files) {
      const parts = (relativePath || file.name).split('/').filter(Boolean);
      // webkitRelativePath starts with the picked folder's own name.
      if (stripRoot && parts.length > 1) parts.shift();
      let node = root.tree;
      for (const part of parts.slice(0, -1)) {
        if (!node.dirs.has(part)) node.dirs.set(part, newNode());
        node = node.dirs.get(part);
      }
      node.files.set(file.name, file);
    }
    roots.set(root.id, root);
    return rootPath(root);
  },

  /** Adds a folder handle from drag and drop (Chrome: DataTransferItem.getAsFileSystemHandle). */
  async addHandleFolder(handle) {
    for (const root of roots.values()) if (root.type === 'handle' && (await root.handle.isSameEntry?.(handle))) return rootPath(root);
    const root = { id: newId(), name: handle.name, type: 'handle', handle, granted: (await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted' };
    roots.set(root.id, root);
    await persistRoots();
    return rootPath(root);
  },

  async closeRoot(path) {
    const { root } = split(path);
    roots.delete(root.id);
    forgetHandles(rootPath(root));
    await persistRoots();
  },

  isReadOnly(path) {
    try { return split(path).root.type !== 'handle'; } catch { return true; }
  },

  async list(path) {
    const { root } = split(path);
    if (root.type === 'memory') {
      const node = memoryNode(path);
      const dirs = [...node.dirs.entries()].map(([name, child]) => ({ name, path: joinPath(path, name), isDir: true, size: 0, modified: 0, created: 0, hidden: false, hasDirs: child.dirs.size > 0 }));
      const files = [...node.files.values()].map((file) => entryOfFile(joinPath(path, file.name), file));
      return { dirs, files };
    }
    if (!root.granted) await ensurePermission(root, false);
    const dir = await dirHandle(path);
    const dirs = [];
    const files = [];
    const pending = [];
    for await (const [name, handle] of dir.entries()) {
      const child = joinPath(path, name);
      handles.set(child, handle);
      if (handle.kind === 'directory') {
        if (!name.startsWith('.')) dirs.push({ name, path: child, isDir: true, size: 0, modified: 0, created: 0, hidden: false, hasDirs: true });
      } else if (!name.startsWith('.')) {
        pending.push(handle.getFile().then((file) => files.push(entryOfFile(child, file))).catch(() => {}));
      }
    }
    await Promise.all(pending);
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return { dirs: dirs.sort(byName), files: files.sort(byName) };
  },

  async url(path) {
    if (urls.has(path)) return urls.get(path);
    const url = URL.createObjectURL(await webFile(path));
    urls.set(path, url);
    if (urls.size > 300) {
      const [oldest, oldUrl] = urls.entries().next().value;
      URL.revokeObjectURL(oldUrl);
      urls.delete(oldest);
    }
    return url;
  },

  releaseUrl(path) {
    for (const [key, url] of [...urls]) {
      if (key === path || key.startsWith(`${path}/`)) { URL.revokeObjectURL(url); urls.delete(key); }
    }
  },

  async read(path) {
    return new Uint8Array(await (await webFile(path)).arrayBuffer());
  },

  /** Writes into the opened folder, or downloads when the folder is read-only. Returns 'saved' | 'downloaded'. */
  async write(path, bytes) {
    const { root } = split(path);
    if (root.type !== 'handle') { download(baseName(path), bytes); return 'downloaded'; }
    await ensurePermission(root, true);
    const dir = await dirHandle(parentOf(path));
    const handle = await dir.getFileHandle(baseName(path), { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    handles.set(path, handle);
    web.releaseUrl(path);
    return 'saved';
  },

  async stat(paths) {
    return Promise.all(paths.map(async (path) => {
      try { return entryOfFile(path, await webFile(path)); } catch { return null; }
    }));
  },

  copy: (paths, dir, conflict = 'rename') => transfer(paths, dir, conflict, false),
  move: (paths, dir, conflict = 'rename') => transfer(paths, dir, conflict, true),

  async rename(path, name) {
    const { root } = split(path);
    if (root.type !== 'handle') throw new Error('read-only folder');
    await ensurePermission(root, true);
    const parent = parentOf(path);
    const dir = await dirHandle(parent);
    if (name.toLowerCase() !== baseName(path).toLowerCase() && (await exists(dir, name))) throw new Error(`An item with that name already exists: ${name}`);
    const handle = handles.get(path) ?? (await fileHandle(path).catch(() => dirHandle(path)));
    if (typeof handle.move === 'function') {
      await handle.move(name);
    } else {
      await copyHandleInto(handle, dir, name);
      await dir.removeEntry(baseName(path), { recursive: true });
    }
    forgetHandles(path);
    return joinPath(parent, name);
  },

  async remove(paths) {
    const results = [];
    for (const path of paths) {
      const result = { source: path, target: null, error: null, skipped: false };
      try {
        const { root } = split(path);
        if (root.type === 'memory') {
          memoryNode(parentOf(path)).files.delete(baseName(path));
          memoryNode(parentOf(path)).dirs.delete(baseName(path));
        } else {
          await ensurePermission(root, true);
          await (await dirHandle(parentOf(path))).removeEntry(baseName(path), { recursive: true });
        }
        forgetHandles(path);
      } catch (error) {
        result.error = errorText(error);
      }
      results.push(result);
    }
    return results;
  },

  async mkdir(parent, name) {
    const { root } = split(parent);
    if (root.type !== 'handle') throw new Error('read-only folder');
    await ensurePermission(root, true);
    const dir = await dirHandle(parent);
    if (await exists(dir, name)) throw new Error(`An item with that name already exists: ${name}`);
    await dir.getDirectoryHandle(name, { create: true });
    return joinPath(parent, name);
  },

  setModified: async () => { throw new Error('not available in the browser'); },
  walk: (path, extensions, limit = 100000) => walkWeb(path, extensions, limit, []),
  reveal: async () => {},
  openExternal: async () => {},
  openUrl: async (url) => { globalThis.open(url, '_blank', 'noopener'); },
  setWallpaper: async () => { throw new Error('not available in the browser'); },
  backupOriginal: async () => false,
  hasOriginals: async (paths) => paths.map(() => false),
  restoreOriginal: async () => { throw new Error('not available in the browser'); },
  discardOriginal: async () => {},
  readData: (name) => idbGet(`data:${name}`).then((value) => value ?? null),
  writeData: (name, content) => idbSet(`data:${name}`, content),
};

// ───────────────────────── desktop with virtual folders
//
// In the desktop app, "@id:Name/…" paths are folders held in memory: ZIP
// archives opened as folders, the unlocked private folder, dropped files.
// They are read-only; copying out of them writes real files.

const isVirtual = (path) => typeof path === 'string' && path.startsWith('@');

function partition(paths) {
  return { virtual: paths.filter(isVirtual), real: paths.filter((path) => !isVirtual(path)) };
}

async function copyOut(paths, dir, conflict) {
  const results = [];
  const existing = new Set(((await desktop.list(dir, { hidden: true, probe: false }).catch(() => ({ files: [] }))).files ?? []).map((f) => f.name.toLowerCase()));
  for (const path of paths) {
    const result = { source: path, target: null, error: null, skipped: false };
    try {
      let name = baseName(path);
      if (existing.has(name.toLowerCase())) {
        if (conflict === 'skip') { result.skipped = true; results.push(result); continue; }
        if (conflict === 'rename') {
          const dot = name.lastIndexOf('.');
          const stem = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : '';
          for (let n = 2; existing.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`;
        }
      }
      const target = joinPath(dir, name);
      await desktop.write(target, await web.read(path));
      existing.add(name.toLowerCase());
      result.target = target;
    } catch (error) {
      result.error = errorText(error);
    }
    results.push(result);
  }
  return results;
}

const readOnlyError = () => Promise.reject(new Error('read-only folder'));

const routed = {
  kind: 'desktop',
  caps: desktop.caps,
  async places() {
    return [...(await desktop.places()), ...(await web.places())];
  },
  list: (path, options) => (isVirtual(path) ? web.list(path, options) : desktop.list(path, options)),
  url: (path) => (isVirtual(path) ? web.url(path) : desktop.url(path)),
  releaseUrl: (path) => (isVirtual(path) ? web.releaseUrl(path) : desktop.releaseUrl(path)),
  read: (path) => (isVirtual(path) ? web.read(path) : desktop.read(path)),
  write: (path, bytes) => (isVirtual(path) ? web.write(path, bytes) : desktop.write(path, bytes)),
  async stat(paths) {
    const { virtual, real } = partition(paths);
    const [a, b] = await Promise.all([virtual.length ? web.stat(virtual) : [], real.length ? desktop.stat(real) : []]);
    const map = new Map([...virtual.map((p, i) => [p, a[i]]), ...real.map((p, i) => [p, b[i]])]);
    return paths.map((p) => map.get(p) ?? null);
  },
  async copy(paths, dir, conflict = 'rename') {
    if (isVirtual(dir)) return readOnlyError();
    const { virtual, real } = partition(paths);
    return [...(virtual.length ? await copyOut(virtual, dir, conflict) : []), ...(real.length ? await desktop.copy(real, dir, conflict) : [])];
  },
  async move(paths, dir, conflict = 'rename') {
    if (isVirtual(dir)) return readOnlyError();
    const { virtual, real } = partition(paths);
    return [...(virtual.length ? await copyOut(virtual, dir, conflict) : []), ...(real.length ? await desktop.move(real, dir, conflict) : [])];
  },
  rename: (path, name) => (isVirtual(path) ? readOnlyError() : desktop.rename(path, name)),
  async remove(paths, trash = true) {
    const { virtual, real } = partition(paths);
    return [...(virtual.length ? await web.remove(virtual) : []), ...(real.length ? await desktop.remove(real, trash) : [])];
  },
  mkdir: (parent, name) => (isVirtual(parent) ? readOnlyError() : desktop.mkdir(parent, name)),
  setModified: (path, millis) => (isVirtual(path) ? readOnlyError() : desktop.setModified(path, millis)),
  walk: (path, extensions, limit, hidden) => (isVirtual(path) ? web.walk(path, extensions, limit) : desktop.walk(path, extensions, limit, hidden)),
  reveal: (path) => (isVirtual(path) ? Promise.resolve() : desktop.reveal(path)),
  openExternal: (path) => (isVirtual(path) ? Promise.resolve() : desktop.openExternal(path)),
  openUrl: (url) => desktop.openUrl(url),
  setWallpaper: (path) => (isVirtual(path) ? readOnlyError() : desktop.setWallpaper(path)),
  backupOriginal: (path) => (isVirtual(path) ? Promise.resolve(false) : desktop.backupOriginal(path)),
  hasOriginals: (paths) => desktop.hasOriginals(paths.map((p) => (isVirtual(p) ? '' : p))),
  restoreOriginal: (path) => desktop.restoreOriginal(path),
  discardOriginal: (path) => desktop.discardOriginal(path),
  originalPath: (path) => (isVirtual(path) ? Promise.resolve(null) : invoke('original_path', { path })),
  readData: (name) => desktop.readData(name),
  writeData: (name, content) => desktop.writeData(name, content),
  isReadOnly: (path) => isVirtual(path),
  closeRoot: (path) => web.closeRoot(path),
  addMemoryFolder: (...args) => web.addMemoryFolder(...args),
  openWith: (path) => invoke('open_with', { path }),
  scan: (target) => invoke('scan_image', { target }),
  sync: (source, target, mirror, extensions) => invoke('sync_dirs', { source, target, mirror, extensions }),
};

web.originalPath = async () => null;
web.openWith = async () => false;
web.scan = async () => { throw new Error('not available in the browser'); };
web.sync = async () => { throw new Error('not available in the browser'); };

export const fs = isDesktop() ? routed : web;
export const webFs = web;

/** Media files of a dropped DataTransfer (web): folders become read-only memory folders. */
export async function filesFromDrop(dataTransfer) {
  const items = [...(dataTransfer.items ?? [])].filter((item) => item.kind === 'file');
  const out = { folders: [], files: [] };
  // Chrome: real handles → writable folders.
  if (items.length && typeof items[0].getAsFileSystemHandle === 'function') {
    const handlesList = await Promise.all(items.map((item) => item.getAsFileSystemHandle().catch(() => null)));
    for (const handle of handlesList) {
      if (handle?.kind === 'directory') out.folders.push(await web.addHandleFolder(handle));
      else if (handle?.kind === 'file') out.files.push({ file: await handle.getFile(), relativePath: handle.name });
    }
  } else {
    const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    for (const entry of entries) {
      if (entry.isDirectory) {
        const files = [];
        await readEntry(entry, '', files);
        out.folders.push(web.addMemoryFolder(entry.name, files));
      } else {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        out.files.push({ file, relativePath: file.name });
      }
    }
  }
  return out;
}

async function readEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    if (isMedia(file.name)) out.push({ file, relativePath: prefix + file.name });
    return;
  }
  const reader = entry.createReader();
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) await readEntry(child, child.isDirectory ? `${prefix}${child.name}/` : prefix, out);
  }
}
