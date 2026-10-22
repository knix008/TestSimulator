/* Virtual path ↔ File / DirectoryHandle registry for browser mode */
window.FileRegistry = (() => {
  const files = new Map();          // absolute virtual path → File
  const dirHandles = new Map();     // absolute virtual path → FileSystemDirectoryHandle
  const dirChildren = new Map();    // absolute virtual path → [{name, path, isDirectory}]
  const blobUrls = new Map();       // path → object URL
  const SEP = '/';

  function norm(p) {
    if (!p) return SEP;
    let s = String(p).replace(/\\/g, SEP);
    if (!s.startsWith(SEP)) s = SEP + s;
    s = s.replace(/\/+/g, SEP);
    if (s.length > 1 && s.endsWith(SEP)) s = s.slice(0, -1);
    return s || SEP;
  }

  function join(...parts) {
    const flat = parts.flat().filter((p) => p !== undefined && p !== null && p !== '');
    return norm(flat.join(SEP));
  }

  function dirname(p) {
    const n = norm(p);
    if (n === SEP) return SEP;
    const i = n.lastIndexOf(SEP);
    return i <= 0 ? SEP : n.slice(0, i);
  }

  function basename(p) {
    const n = norm(p);
    if (n === SEP) return SEP;
    const i = n.lastIndexOf(SEP);
    return i < 0 ? n : n.slice(i + 1);
  }

  function clear() {
    for (const url of blobUrls.values()) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    files.clear();
    dirHandles.clear();
    dirChildren.clear();
    blobUrls.clear();
  }

  function uniquePath(dir, name) {
    let candidate = join(dir, name);
    if (!files.has(candidate) && !dirHandles.has(candidate)) return candidate;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext  = dot > 0 ? name.slice(dot) : '';
    let i = 2;
    while (files.has(join(dir, `${stem} (${i})${ext}`))) i++;
    return join(dir, `${stem} (${i})${ext}`);
  }

  function registerFile(file, dirPath = SEP) {
    const dir = norm(dirPath);
    const p = uniquePath(dir, file.name);
    files.set(p, file);
    _ensureChild(dir, { name: basename(p), path: p, isDirectory: false });
    return p;
  }

  function _ensureChild(dir, entry) {
    if (!dirChildren.has(dir)) dirChildren.set(dir, []);
    const list = dirChildren.get(dir);
    const idx = list.findIndex((e) => e.path === entry.path || e.name === entry.name);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
  }

  async function mountDirectoryHandle(handle, mountPath = SEP) {
    const root = norm(mountPath);
    dirHandles.set(root, handle);
    await _indexDirectory(handle, root);
    return root;
  }

  async function _indexDirectory(handle, dirPath) {
    const entries = [];
    try {
      for await (const [name, child] of handle.entries()) {
        const childPath = join(dirPath, name);
        if (child.kind === 'directory') {
          dirHandles.set(childPath, child);
          entries.push({ name, path: childPath, isDirectory: true });
        } else if (child.kind === 'file') {
          try {
            const file = await child.getFile();
            files.set(childPath, file);
            entries.push({ name, path: childPath, isDirectory: false });
          } catch {}
        }
      }
    } catch (e) {
      console.warn('indexDirectory failed:', dirPath, e);
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    dirChildren.set(dirPath, entries);
    return entries;
  }

  /** Register a folder from <input webkitdirectory> FileList */
  function mountWebkitFiles(fileList) {
    clear();
    const root = SEP;
    dirHandles.set(root, null); // virtual
    const dirs = new Set([root]);

    for (const file of fileList) {
      const rel = (file.webkitRelativePath || file.name).replace(/\\/g, SEP);
      const parts = rel.split(SEP).filter(Boolean);
      if (!parts.length) continue;

      // Ensure parent dirs
      let cur = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const next = join(cur, parts[i]);
        if (!dirs.has(next)) {
          dirs.add(next);
          _ensureChild(cur, { name: parts[i], path: next, isDirectory: true });
          if (!dirChildren.has(next)) dirChildren.set(next, []);
        }
        cur = next;
      }
      const filePath = join(cur, parts[parts.length - 1]);
      files.set(filePath, file);
      _ensureChild(cur, { name: parts[parts.length - 1], path: filePath, isDirectory: false });
    }

    // Sort children
    for (const [k, list] of dirChildren) {
      list.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      dirChildren.set(k, list);
    }
    return root;
  }

  async function readDirectory(dirPath) {
    const dir = norm(dirPath);
    if (dirChildren.has(dir)) {
      return dirChildren.get(dir).map((e) => ({ ...e }));
    }
    const handle = dirHandles.get(dir);
    if (handle) {
      return _indexDirectory(handle, dir);
    }
    // Lazy resolve nested path via ancestors
    if (dir !== SEP) {
      const parent = dirname(dir);
      const parentHandle = dirHandles.get(parent);
      if (parentHandle) {
        try {
          const name = basename(dir);
          const child = await parentHandle.getDirectoryHandle(name);
          dirHandles.set(dir, child);
          return _indexDirectory(child, dir);
        } catch {}
      }
    }
    return [];
  }

  function getFile(filePath) {
    return files.get(norm(filePath)) || null;
  }

  function hasPath(p) {
    const n = norm(p);
    return files.has(n) || dirHandles.has(n) || dirChildren.has(n);
  }

  function getStats(filePath) {
    const n = norm(filePath);
    if (dirHandles.has(n) || dirChildren.has(n)) {
      return { size: 0, isDirectory: true, created: null, modified: null };
    }
    const file = files.get(n);
    if (!file) return { error: 'Not found' };
    return {
      size: file.size,
      isDirectory: false,
      created: null,
      modified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    };
  }

  async function readAsDataUrl(filePath) {
    const file = getFile(filePath);
    if (!file) return { error: 'File not found' };
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function readAsArrayBuffer(filePath) {
    const file = getFile(filePath);
    if (!file) throw new Error('File not found');
    return file.arrayBuffer();
  }

  function getObjectUrl(filePath) {
    const n = norm(filePath);
    if (blobUrls.has(n)) return blobUrls.get(n);
    const file = files.get(n);
    if (!file) return null;
    const url = URL.createObjectURL(file);
    blobUrls.set(n, url);
    return url;
  }

  function ancestors(targetPath) {
    const n = norm(targetPath);
    const parts = n.split(SEP).filter(Boolean);
    const out = [SEP];
    let cur = '';
    for (const part of parts) {
      cur += SEP + part;
      out.push(cur);
    }
    return out;
  }

  return {
    SEP, norm, join, dirname, basename, clear,
    registerFile, mountDirectoryHandle, mountWebkitFiles,
    readDirectory, getFile, hasPath, getStats,
    readAsDataUrl, readAsArrayBuffer, getObjectUrl, ancestors,
  };
})();
