/* Background thumbnail generation + caches.
   Opening a folder first loads that folder's on-disk cache (one per directory, kept
   by the main process), then queues only the images that are new or changed; tiles
   ask for what they need first. Common formats are decoded and downscaled in a Web
   Worker, so the UI thread never stalls on a big photo; formats that need the app's
   own decoders (TIFF / HEIC / DICOM / SVG) run on the UI thread only while it is idle.
   A finished thumbnail fires a `thumb-ready` window event so any view can redraw. */
window.Thumbs = (() => {
  const SIZE        = 256;   // longest edge of a stored thumbnail
  const CONCURRENCY = 4;     // thumbnails in flight at once
  const MAX_CACHE   = 800;   // generated entries kept in memory before the oldest are dropped

  // Formats Chromium can decode inside a worker (createImageBitmap on a Blob)
  const WORKER_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico', 'avif']);
  const MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp',
    webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
  };

  const _cache   = new Map();   // key → { url, w, h, tw, th } generated this session
  const _disk    = new Map();   // key → { url, w, h, tw, th } from the per-directory disk cache
  const _dirLoads = new Map();  // dir key → Promise (that directory's disk cache is loaded)
  const _failed  = new Set();   // keys we already tried and could not decode
  const _pending = new Map();   // key → { path, resolvers[] }
  const _queue   = [];          // keys, front = next
  let _running   = 0;
  let _paused    = false;

  const _key = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
  const _ext = (p) => (String(p || '').split('.').pop() || '').toLowerCase();

  function _dirOf(p) {
    const s = String(p || '');
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    if (i < 0) return '';
    // Keep the separator on a drive / filesystem root ("C:\", "/")
    return /^[A-Za-z]:$/.test(s.slice(0, i)) || i === 0 ? s.slice(0, i + 1) : s.slice(0, i);
  }

  function _join(dir, name) {
    const sep = dir.includes('\\') ? '\\' : '/';
    return /[\\/]$/.test(dir) ? dir + name : dir + sep + name;
  }

  const _api = () => window.electronAPI || {};
  const _hasDiskCache = () => typeof _api().thumbCacheLoad === 'function';

  function get(path) {
    const key = _key(path);
    return _cache.get(key) || _disk.get(key) || null;
  }

  function failed(path) {
    return _failed.has(_key(path));
  }

  /** Images we can turn into a thumbnail. Video / audio keep their format icon. */
  function canThumbnail(path) {
    return !!path && FormatSupport.isImage(path);
  }

  function _remember(key, thumb) {
    _cache.set(key, thumb);
    if (_cache.size > MAX_CACHE) {
      const oldest = _cache.keys().next().value;
      if (oldest !== undefined) {
        const url = _cache.get(oldest)?.url;
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
        _cache.delete(oldest);
      }
    }
  }

  function _settle(key, thumb) {
    const entry = _pending.get(key);
    _pending.delete(key);
    if (entry) for (const done of entry.resolvers) done(thumb);
    if (thumb) {
      window.dispatchEvent(new CustomEvent('thumb-ready', {
        detail: { path: entry ? entry.path : key, thumb },
      }));
    }
  }

  /* ── Per-directory disk cache ── */

  /** Load one directory's cache once; every later call shares the same promise. */
  function _ensureDir(dir) {
    if (!dir || !_hasDiskCache()) return Promise.resolve();
    const dk = _key(dir);
    let p = _dirLoads.get(dk);
    if (!p) {
      p = _api().thumbCacheLoad(dir)
        .then((entries) => {
          if (!entries || entries.error) return;
          for (const [name, thumb] of Object.entries(entries)) {
            if (thumb && thumb.url) _disk.set(_key(_join(dir, name)), thumb);
          }
        })
        .catch(() => { /* no cache: everything is generated */ });
      _dirLoads.set(dk, p);
    }
    return p;
  }

  /** Hand the JPEG to the main process; the cached file URL replaces the in-memory one. */
  async function _persist(path, bytes, meta) {
    if (!_hasDiskCache() || typeof _api().thumbCachePut !== 'function') return null;
    try {
      const saved = await _api().thumbCachePut(path, bytes, meta);
      return saved && saved.url ? saved : null;
    } catch { return null; }
  }

  /* ── Worker path (common formats) ── */

  let _worker = null;
  let _workerBroken = false;
  let _workerSeq = 0;
  const _workerJobs = new Map();   // id → { resolve, reject }

  function _getWorker() {
    if (_worker || _workerBroken) return _worker;
    try {
      _worker = new Worker('./js/thumbWorker.js');
      _worker.onmessage = (e) => {
        const job = _workerJobs.get(e.data?.id);
        if (!job) return;
        _workerJobs.delete(e.data.id);
        if (e.data.ok) job.resolve(e.data);
        else job.reject(new Error(e.data.error || 'decode'));
      };
      _worker.onerror = () => {
        // A worker that cannot start falls back to the UI-thread path for good
        _workerBroken = true;
        _worker = null;
        for (const job of _workerJobs.values()) job.reject(new Error('worker'));
        _workerJobs.clear();
      };
    } catch {
      _workerBroken = true;
      _worker = null;
    }
    return _worker;
  }

  async function _generateInWorker(path) {
    const worker = _getWorker();
    if (!worker || typeof _api().readFileBytes !== 'function') return undefined;   // not available
    const data = await _api().readFileBytes(path);
    if (!data || data.error || !data.byteLength) return null;
    // Transfer a buffer that holds exactly the file
    const buf = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
      ? data.buffer : data.slice().buffer;
    const ext = _ext(path);
    const res = await new Promise((resolve, reject) => {
      const id = ++_workerSeq;
      _workerJobs.set(id, { resolve, reject });
      worker.postMessage({ id, bytes: buf, type: MIME[ext] || '', size: SIZE }, [buf]);
    });
    const meta = { w: res.w, h: res.h, tw: res.tw, th: res.th };
    const jpeg = new Uint8Array(res.jpeg);
    const saved = await _persist(path, jpeg, meta);
    if (saved) return saved;
    return { url: URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' })), ...meta };
  }

  /* ── UI-thread path (formats that need the app's decoders) ── */

  function _idle() {
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 600 });
      else setTimeout(resolve, 16);
    });
  }

  function _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';   // asset-protocol URLs: toDataURL needs an untainted canvas
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode'));
      img.src = src;
    });
  }

  /**
   * Something drawImage can take: a URL for native formats, otherwise whatever the
   * generic loader produced — a data URL, or a canvas (DICOM renders straight to one).
   */
  async function _sourceFor(path) {
    if (FormatSupport.isNativeImage(path)) {
      try {
        const url = await window.electronAPI.getFileUrl(path);
        if (url && typeof url === 'string') return url;
      } catch { /* fall through to the generic loader */ }
    }
    const result = await FormatSupport.loadImageFile(path);
    if (!result || (result.type !== 'image' && result.type !== 'animated')) return null;
    if (result.dataUrl) return result.dataUrl;
    if (result.canvas && result.canvas.width && result.canvas.height) return result.canvas;
    return null;
  }

  async function _generateOnMainThread(path) {
    await _idle();   // stay out of the way of scrolling / opening images
    const src = await _sourceFor(path);
    if (!src) return null;
    const img = typeof src === 'string' ? await _loadImage(src) : src;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    const k = Math.min(1, SIZE / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * k));
    const th = Math.max(1, Math.round(h * k));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, tw, th);
    const url = canvas.toDataURL('image/jpeg', 0.72);
    const meta = { w, h, tw, th };
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return (await _persist(path, bytes, meta)) || { url, ...meta };
  }

  async function _generate(path) {
    // Desktop: the host makes it natively (no image bytes cross the IPC); null / unsupported
    // means a format it cannot read, which the page's own decoders handle below.
    if (typeof _api().thumbMake === 'function') {
      try {
        const made = await _api().thumbMake(path);
        if (made && made.url) return made;
      } catch { /* host busy or gone — fall through */ }
    }
    if (WORKER_EXTS.has(_ext(path)) && !_workerBroken) {
      try {
        const thumb = await _generateInWorker(path);
        if (thumb !== undefined) return thumb;
      } catch { /* e.g. a codec the worker lacks — try the full loader below */ }
    }
    return _generateOnMainThread(path);
  }

  function _pump() {
    if (_paused) return;
    while (_running < CONCURRENCY && _queue.length) {
      const key = _queue.shift();
      const entry = _pending.get(key);
      if (!entry) continue;
      _running++;
      _generate(entry.path)
        .then((thumb) => {
          if (thumb) _remember(key, thumb);
          else _failed.add(key);
          _settle(key, thumb);
        })
        .catch(() => { _failed.add(key); _settle(key, null); })
        .finally(() => { _running--; _pump(); });
    }
  }

  /**
   * Ask for one thumbnail. Resolves with the thumbnail, or null when the file
   * cannot be decoded. `front: true` jumps the queue (a tile now on screen).
   * The file's directory cache is consulted before anything is generated.
   */
  async function request(path, { front = false } = {}) {
    if (!canThumbnail(path)) return null;
    const key = _key(path);
    const hit = get(path);
    if (hit) return hit;
    if (_failed.has(key)) return null;

    await _ensureDir(_dirOf(path));
    const disk = _disk.get(key);
    if (disk) return disk;

    const existing = _pending.get(key);
    if (existing) {
      if (front) {
        const at = _queue.indexOf(key);
        if (at > 0) { _queue.splice(at, 1); _queue.unshift(key); }
      }
      return new Promise((resolve) => existing.resolvers.push(resolve));
    }

    return new Promise((resolve) => {
      _pending.set(key, { path, resolvers: [resolve] });
      if (front) _queue.unshift(key);
      else _queue.push(key);
      _pump();
    });
  }

  /**
   * Warm a folder in the background, newest request wins: load its disk cache,
   * then generate (and store) only what is missing or out of date.
   */
  async function prefetchDir(dirPath, { replaceQueue = true } = {}) {
    if (!dirPath) return 0;
    if (replaceQueue) cancelPending();
    // The host builds the whole folder's thumbnail DB in the background, even after
    // the user moves on; requests below for tiles on screen jump ahead of it.
    if (typeof _api().thumbCacheBuild === 'function') {
      _api().thumbCacheBuild(dirPath, { front: true }).catch(() => {});
    }
    let entries = [];
    try {
      const [result] = await Promise.all([window.electronAPI.readDirectory(dirPath), _ensureDir(dirPath)]);
      if (Array.isArray(result)) entries = result;
    } catch { return 0; }

    const files = entries.filter((e) => !e.isDirectory && canThumbnail(e.path) && !get(e.path));
    for (const file of files) request(file.path);
    return files.length;
  }

  /** Start-up: let the host warm recently opened folders, after the current one. */
  function warmDirs(dirs) {
    const list = (dirs || []).filter(Boolean);
    if (!list.length || typeof _api().thumbCacheBuild !== 'function') return;
    _api().thumbCacheBuild(list).catch(() => {});
  }

  /** Drop everything still waiting; work already running finishes. */
  function cancelPending() {
    for (const key of _queue) _settle(key, null);
    _queue.length = 0;
  }

  /** A file changed or went away: forget it here (the disk index revalidates by mtime). */
  function forget(path) {
    const key = _key(path);
    const url = _cache.get(key)?.url;
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    _cache.delete(key);
    _disk.delete(key);
    _failed.delete(key);
    // Reload the directory's index next time, so a rewritten file is checked again
    _dirLoads.delete(_key(_dirOf(path)));
  }

  function clear() {
    cancelPending();
    for (const t of _cache.values()) if (t.url && t.url.startsWith('blob:')) URL.revokeObjectURL(t.url);
    _cache.clear();
    _disk.clear();
    _dirLoads.clear();
    _failed.clear();
  }

  /** Empty the on-disk cache too (Settings ▸ General). */
  async function clearDiskCache() {
    clear();
    if (typeof _api().thumbCacheClear === 'function') return _api().thumbCacheClear();
    return { success: true };
  }

  async function diskStats() {
    if (typeof _api().thumbCacheStats !== 'function') return null;
    try { return await _api().thumbCacheStats(); } catch { return null; }
  }

  function setPaused(value) {
    _paused = !!value;
    if (!_paused) _pump();
  }

  function stats() {
    return {
      cached: _cache.size, disk: _disk.size, queued: _queue.length, running: _running,
      failed: _failed.size, worker: !!_worker && !_workerBroken,
    };
  }

  return {
    SIZE, get, request, prefetchDir, warmDirs, cancelPending, canThumbnail, failed, forget, clear,
    clearDiskCache, diskStats, setPaused, stats,
  };
})();
