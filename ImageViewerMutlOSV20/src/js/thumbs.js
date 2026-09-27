/* Background thumbnail generation + in-memory cache.
   Opening a folder queues every image in it; tiles ask for what they need first.
   A finished thumbnail fires a `thumb-ready` window event so any view can redraw. */
window.Thumbs = (() => {
  const SIZE        = 256;   // longest edge of a stored thumbnail
  const CONCURRENCY = 3;     // decoders running at once
  const MAX_CACHE   = 800;   // entries kept before the oldest are dropped

  const _cache   = new Map();   // key → { url, w, h }
  const _failed  = new Set();   // keys we already tried and could not decode
  const _pending = new Map();   // key → { path, resolvers[] }
  const _queue   = [];          // keys, front = next
  let _running   = 0;
  let _paused    = false;

  const _key = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();

  function get(path) {
    return _cache.get(_key(path)) || null;
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
      if (oldest !== undefined) _cache.delete(oldest);
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

  function _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode'));
      img.src = src;
    });
  }

  /** Source a decoder can read: a file URL for native formats, a data URL otherwise. */
  async function _sourceFor(path) {
    if (FormatSupport.isNativeImage(path)) {
      try {
        const url = await window.electronAPI.getFileUrl(path);
        if (url && typeof url === 'string') return url;
      } catch { /* fall through to the generic loader */ }
    }
    const result = await FormatSupport.loadImageFile(path);
    if (result && (result.type === 'image' || result.type === 'animated') && result.dataUrl) {
      return result.dataUrl;
    }
    return null;
  }

  async function _generate(path) {
    const src = await _sourceFor(path);
    if (!src) return null;
    const img = await _loadImage(src);
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
    return { url: canvas.toDataURL('image/jpeg', 0.72), w, h, tw, th };
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
   */
  function request(path, { front = false } = {}) {
    if (!canThumbnail(path)) return Promise.resolve(null);
    const key = _key(path);
    const cached = _cache.get(key);
    if (cached) return Promise.resolve(cached);
    if (_failed.has(key)) return Promise.resolve(null);

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

  /** Warm the cache for a folder in the background, newest request wins. */
  async function prefetchDir(dirPath, { replaceQueue = true } = {}) {
    if (!dirPath) return 0;
    if (replaceQueue) cancelPending();
    let entries = [];
    try {
      const result = await window.electronAPI.readDirectory(dirPath);
      if (Array.isArray(result)) entries = result;
    } catch { return 0; }

    const files = entries.filter((e) => !e.isDirectory && canThumbnail(e.path));
    for (const file of files) request(file.path);
    return files.length;
  }

  /** Drop everything still waiting; work already running finishes. */
  function cancelPending() {
    for (const key of _queue) _settle(key, null);
    _queue.length = 0;
  }

  function forget(path) {
    const key = _key(path);
    _cache.delete(key);
    _failed.delete(key);
  }

  function clear() {
    cancelPending();
    _cache.clear();
    _failed.clear();
  }

  function setPaused(value) {
    _paused = !!value;
    if (!_paused) _pump();
  }

  function stats() {
    return { cached: _cache.size, queued: _queue.length, running: _running, failed: _failed.size };
  }

  return { SIZE, get, request, prefetchDir, cancelPending, canThumbnail, failed, forget, clear, setPaused, stats };
})();
