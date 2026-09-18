/* Platform layer — one API for the renderer whether it runs inside Electron (real file system through
 * preload.js) or in a browser (File System Access API / <input type=file> mounted into a virtual tree).
 *
 * Paths: Electron paths are OS paths. Web paths are virtual, '/'-separated: "/<root>/<sub>/<file>".
 */
window.Platform = (function () {
  const api = window.electronAPI || null;
  const isElectron = !!api;
  const sep = isElectron && api.platform === 'win32' ? '\\' : '/';

  /* ── Path helpers (sync) ── */
  const splitPath = (p) => String(p || '').split(/[\\/]+/).filter(Boolean);
  function join(...parts) {
    const flat = parts.filter((p) => p != null && p !== '');
    if (!flat.length) return '';
    let out = flat[0];
    for (const p of flat.slice(1)) out = out.replace(/[\\/]+$/, '') + sep + String(p).replace(/^[\\/]+/, '');
    return out;
  }
  function dirname(p) {
    const s = String(p || '');
    const m = s.match(/^(.*?)[\\/]+[^\\/]+[\\/]*$/);
    if (!m) return isElectron ? s : '/';
    const d = m[1];
    if (/^[A-Za-z]:$/.test(d)) return d + '\\';
    return d === '' ? (isElectron ? s : '/') : d;
  }
  function basename(p) {
    const parts = splitPath(p);
    return parts.length ? parts[parts.length - 1] : String(p || '');
  }
  function extname(p) {
    const b = basename(p);
    const i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i + 1).toLowerCase() : '';
  }

  /* ── Settings ── */
  const settings = {
    cache: null,
    async load() {
      if (isElectron) this.cache = (await api.settingsGet()) || {};
      else { try { this.cache = JSON.parse(localStorage.getItem('dcmviewer.settings') || '{}'); } catch { this.cache = {}; } }
      return this.cache;
    },
    get(key, fallback) { const v = this.cache && this.cache[key]; return v === undefined ? fallback : v; },
    async set(patch) {
      this.cache = { ...(this.cache || {}), ...patch };
      if (isElectron) await api.settingsSet(patch);
      else { try { localStorage.setItem('dcmviewer.settings', JSON.stringify(this.cache)); } catch { /* quota */ } }
    },
  };

  /* ── Web virtual file system ── */
  const web = {
    roots: new Map(),   // "/Name" → { kind: 'handle' | 'files' | 'url', handle, files: Map(path → File), label, writable }
    entries: new Map(), // virtual path → { file: File } | { handle } | { url }
    rootPath(label) {
      let name = `/${label.replace(/[\\/]+/g, '_') || 'Folder'}`;
      let i = 2;
      while (this.roots.has(name)) name = `/${label}_${i++}`;
      return name;
    },
    mountFiles(files, label) {
      const root = this.rootPath(label || 'Files');
      const map = new Map();
      for (const f of files) {
        const rel = f.webkitRelativePath && f.webkitRelativePath.includes('/') ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name;
        const vpath = `${root}/${rel}`;
        map.set(vpath, f);
        this.entries.set(vpath, { file: f });
      }
      this.roots.set(root, { kind: 'files', files: map, label: label || 'Files', writable: false });
      return root;
    },
    mountHandle(handle) {
      const root = this.rootPath(handle.name || 'Folder');
      this.roots.set(root, { kind: 'handle', handle, label: handle.name, writable: true });
      return root;
    },
    mountUrls(label, items) {   // items: [{ name, url }]
      const root = this.rootPath(label);
      const map = new Map();
      for (const it of items) { const vpath = `${root}/${it.name}`; map.set(vpath, it.url); this.entries.set(vpath, { url: it.url }); }
      this.roots.set(root, { kind: 'url', files: map, label, writable: false });
      return root;
    },
    rootOf(vpath) {
      for (const [root, r] of this.roots) if (vpath === root || vpath.startsWith(root + '/')) return { root, r };
      return null;
    },
    async dirHandle(vpath) {
      const hit = this.rootOf(vpath);
      if (!hit || hit.r.kind !== 'handle') return null;
      let h = hit.r.handle;
      const rel = vpath.slice(hit.root.length).split('/').filter(Boolean);
      for (const name of rel) h = await h.getDirectoryHandle(name);
      return h;
    },
    async fileHandle(vpath, create) {
      const dir = await this.dirHandle(dirname(vpath));
      if (!dir) return null;
      return dir.getFileHandle(basename(vpath), { create: !!create });
    },
    async readDir(vpath) {
      const hit = this.rootOf(vpath);
      if (!hit) return [];
      const { root, r } = hit;
      const out = [];
      if (r.kind === 'handle') {
        const h = await this.dirHandle(vpath);
        for await (const [name, child] of h.entries()) {
          if (name.startsWith('.')) continue;
          const p = `${vpath.replace(/\/+$/, '')}/${name}`;
          if (child.kind === 'directory') out.push({ name, path: p, isDir: true, size: 0, mtime: 0 });
          else {
            let size = 0, mtime = 0;
            try { const f = await child.getFile(); size = f.size; mtime = f.lastModified; this.entries.set(p, { file: f, handle: child }); } catch { this.entries.set(p, { handle: child }); }
            out.push({ name, path: p, isDir: false, size, mtime });
          }
        }
      } else {
        const prefix = vpath.replace(/\/+$/, '') + '/';
        const seen = new Set();
        for (const [p, v] of r.files) {
          if (!p.startsWith(prefix)) continue;
          const rest = p.slice(prefix.length);
          const slash = rest.indexOf('/');
          if (slash < 0) out.push({ name: rest, path: p, isDir: false, size: v.size || 0, mtime: v.lastModified || 0 });
          else { const d = rest.slice(0, slash); if (!seen.has(d)) { seen.add(d); out.push({ name: d, path: prefix + d, isDir: true, size: 0, mtime: 0 }); } }
        }
      }
      void root;
      out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.isDir ? -1 : 1));
      return out;
    },
    async readFile(vpath) {
      let e = this.entries.get(vpath);
      if (!e) {
        const hit = this.rootOf(vpath);
        if (hit && hit.r.kind === 'handle') { const h = await this.fileHandle(vpath); e = { handle: h }; this.entries.set(vpath, e); }
      }
      if (!e) throw new Error(`File not found: ${vpath}`);
      if (e.url) { const res = await fetch(e.url); if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); return res.arrayBuffer(); }
      const file = e.file || (e.handle && await e.handle.getFile());
      if (!file) throw new Error(`File not found: ${vpath}`);
      return file.arrayBuffer();
    },
    async writeFile(vpath, bytes) {
      const hit = this.rootOf(vpath);
      if (hit && hit.r.kind === 'handle') {
        const rel = vpath.slice(hit.root.length).split('/').filter(Boolean);
        let dir = hit.r.handle;
        for (const name of rel.slice(0, -1)) dir = await dir.getDirectoryHandle(name, { create: true });
        const fh = await dir.getFileHandle(rel[rel.length - 1], { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        return vpath;
      }
      download(basename(vpath), bytes);
      return null;
    },
    async uniqueDir(base) {
      const hit = this.rootOf(base);
      if (!hit || hit.r.kind !== 'handle') return null;
      const parent = await this.dirHandle(dirname(base));
      let name = basename(base), i = 2;
      const exists = async (n) => { try { await parent.getDirectoryHandle(n); return true; } catch { return false; } };
      while (await exists(name)) name = `${basename(base)}_${i++}`;
      await parent.getDirectoryHandle(name, { create: true });
      return `${dirname(base).replace(/\/+$/, '')}/${name}`;
    },
    writable(vpath) { const hit = this.rootOf(vpath); return !!(hit && hit.r.kind === 'handle'); },
  };

  function download(name, bytes, mime = 'application/octet-stream') {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function pickInput({ multiple, directory, accept } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (directory) { input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', ''); }
      else { input.multiple = !!multiple; if (accept) input.accept = accept; }
      input.style.display = 'none';
      document.body.appendChild(input);
      let done = false;
      const finish = () => { if (done) return; done = true; const files = Array.from(input.files || []); input.remove(); resolve(files); };
      input.addEventListener('change', finish, { once: true });
      input.addEventListener('cancel', finish, { once: true });
      input.click();
    });
  }

  /* ── Public API ── */
  const listeners = { openPath: [], menuAction: [], dirChanged: [] };
  const P = {
    isElectron, sep, join, dirname, basename, extname, settings, web,
    ACCEPT: '.dcm,.dicm,.dicom,.dic,image/*,.tif,.tiff,.ico,.bmp',

    async init() {
      await settings.load();
      if (isElectron) {
        api.onOpenPath((p) => listeners.openPath.forEach((cb) => cb(p)));
        api.onMenuAction((a) => listeners.menuAction.forEach((cb) => cb(a)));
        api.onDirChanged((d) => listeners.dirChanged.forEach((cb) => cb(d)));
      }
    },
    onOpenPath(cb) { listeners.openPath.push(cb); },
    onMenuAction(cb) { listeners.menuAction.push(cb); },
    onDirChanged(cb) { listeners.dirChanged.push(cb); },
    emitOpenPath(p) { listeners.openPath.forEach((cb) => cb(p)); },

    async appInfo() {
      if (isElectron) return api.appInfo();
      return { name: 'DCM Viewer', version: (window.APP_VERSION || '1.0.0'), platform: 'web', packaged: true, userAgent: navigator.userAgent };
    },
    async defaultDir() { return isElectron ? api.defaultDir() : null; },
    async roots() {
      if (isElectron) {
        const drives = await api.listDrives();
        return drives.map((d) => ({ name: d, path: d, isDir: true }));
      }
      return [...web.roots.entries()].map(([p, r]) => ({ name: r.label, path: p, isDir: true, writable: r.writable }));
    },
    readDir: (p) => (isElectron ? api.readDir(p) : web.readDir(p)),
    async stat(p) {
      if (isElectron) return api.stat(p);
      if (web.roots.has(p)) return { exists: true, isDir: true };
      const e = web.entries.get(p);
      if (e) return { exists: true, isDir: false, size: e.file ? e.file.size : 0 };
      try { const h = await web.dirHandle(p); return { exists: !!h, isDir: true }; } catch { return { exists: false }; }
    },
    readFile: (p) => (isElectron ? api.readFile(p) : web.readFile(p)),
    async readFileHead(p, n) {
      if (isElectron) return api.readFileHead(p, n);
      const e = web.entries.get(p);
      const file = e && (e.file || (e.handle && await e.handle.getFile()));
      if (file) return file.slice(0, n).arrayBuffer();
      const buf = await web.readFile(p);
      return buf.slice(0, n);
    },
    writeFile: (p, bytes) => (isElectron ? api.writeFile(p, bytes) : web.writeFile(p, bytes)),
    uniqueDir: (base) => (isElectron ? api.uniqueDir(base) : web.uniqueDir(base)),
    canWriteInto: (dir) => (isElectron ? true : web.writable(dir)),
    trash: (p) => (isElectron ? api.trash(p) : Promise.reject(new Error('Not available in the browser'))),
    copyInto: (sources, dest, move) => (isElectron ? api.copyInto(sources, dest, move) : Promise.reject(new Error('Not available in the browser'))),
    showInFolder: (p) => { if (isElectron) api.showInFolder(p); },
    openExternal: (url) => { if (isElectron) api.openExternal(url); else window.open(url, '_blank', 'noopener'); },
    watchDir: (d) => { if (isElectron) api.watchDir(d); },
    unwatchDir: (d) => { if (isElectron) api.unwatchDir(d); },
    pathForFile: (file) => (isElectron ? api.pathForFile(file) : ''),
    toggleFullscreen() {
      if (isElectron) api.toggleFullscreen();
      else if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
    },
    toggleDevTools() { if (isElectron) api.toggleDevTools(); },

    /** Pick one or more files. Returns paths (Electron) or virtual paths (web). */
    async pickFiles({ multiple = false } = {}) {
      if (isElectron) return api.openFileDialog({ multiple });
      const files = await pickInput({ multiple, accept: P.ACCEPT });
      if (!files.length) return [];
      const root = web.mountFiles(files, files.length === 1 ? files[0].name : `Files (${files.length})`);
      return files.map((f) => `${root}/${f.name}`);
    },
    /** Pick a folder. Returns a path (Electron) or a mounted virtual root (web) — null when cancelled. */
    async pickFolder() {
      if (isElectron) return api.openFolderDialog();
      if (window.showDirectoryPicker) {
        try { const h = await window.showDirectoryPicker({ mode: 'readwrite' }); return web.mountHandle(h); }
        catch (err) { if (err && err.name === 'AbortError') return null; }
      }
      const files = await pickInput({ directory: true });
      if (!files.length) return null;
      const top = (files[0].webkitRelativePath || '').split('/')[0] || 'Folder';
      return web.mountFiles(files, top);
    },
    /** Mount dropped items (web) — returns the paths to open. */
    async mountDropped(dataTransfer) {
      const out = [];
      if (isElectron) {
        for (const f of Array.from(dataTransfer.files || [])) { const p = api.pathForFile(f); if (p) out.push(p); }
        return out;
      }
      const items = Array.from(dataTransfer.items || []);
      const handles = [];
      for (const it of items) {
        if (it.kind !== 'file') continue;
        if (typeof it.getAsFileSystemHandle === 'function') { try { const h = await it.getAsFileSystemHandle(); if (h) { handles.push(h); continue; } } catch { /* fall back */ } }
      }
      if (handles.length) {
        for (const h of handles) {
          if (h.kind === 'directory') out.push(web.mountHandle(h));
          else { const f = await h.getFile(); const root = web.mountFiles([f], f.name); out.push(`${root}/${f.name}`); }
        }
        return out;
      }
      const files = Array.from(dataTransfer.files || []);
      if (files.length) { const root = web.mountFiles(files, files.length === 1 ? files[0].name : `Dropped (${files.length})`); for (const f of files) out.push(`${root}/${f.name}`); }
      return out;
    },
    /** Save bytes: native save dialog in Electron, download in the browser. Returns the saved path (or null). */
    async saveFile({ name, bytes, mime, filters }) {
      if (isElectron) {
        const p = await api.saveDialog({ defaultPath: name, filters });
        if (!p) return null;
        await api.writeFile(p, bytes);
        return p;
      }
      download(name, bytes, mime);
      return name;
    },
    async messageBox({ type = 'info', message, detail, buttons } = {}) {
      if (isElectron) return api.messageBox({ type, message, detail, buttons, cancelId: buttons && buttons.length > 1 ? buttons.length - 1 : -1 });
      if (buttons && buttons.length > 1) return window.confirm([message, detail].filter(Boolean).join('\n\n')) ? 0 : buttons.length - 1;
      window.alert([message, detail].filter(Boolean).join('\n\n'));
      return 0;
    },
    async clipboardWriteImage(canvas) {
      if (isElectron) return api.clipboardWriteImage(canvas.toDataURL('image/png'));
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    },
    async clipboardWriteText(text) {
      if (isElectron) return api.clipboardWriteText(text);
      await navigator.clipboard.writeText(text);
      return true;
    },
    async print(html) {
      if (isElectron) return api.printHtml(html);
      const w = window.open('', '_blank');
      if (!w) throw new Error('Popup blocked');
      w.document.write(html); w.document.close();
      w.focus();
      setTimeout(() => { w.print(); }, 300);
      return { ok: true };
    },
    /** Sample files served by server.js (web only). */
    async mountSamples() {
      if (isElectron) return null;
      try {
        const res = await fetch('/samples.json', { cache: 'no-cache' });
        if (!res.ok) return null;
        const names = await res.json();
        if (!Array.isArray(names) || !names.length) return null;
        return web.mountUrls('Samples', names.map((n) => ({ name: n, url: `/samples/${encodeURIComponent(n)}` })));
      } catch { return null; }
    },
    download,
  };
  return P;
})();
