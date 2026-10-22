/**
 * Desktop bridge. When the page runs inside Tauri this installs window.electronAPI
 * (the same names the renderer already calls) and talks to the app's host
 * (src-tauri/src/host/) through one command, ipc(channel, args).
 * In a plain browser it does nothing, and webAPI.js takes over.
 */
(function initTauriAPI() {
  const tauri = window.__TAURI__;
  if (!tauri || window.electronAPI) return;

  const invoke = tauri.core && typeof tauri.core.invoke === 'function' ? tauri.core.invoke : null;
  const listeners = {};
  let unsaved = false;
  let closing = false;
  let dropped = [];

  function u8ToB64(u8) {
    let bin = '';
    const chunk = 0x4000;
    for (let i = 0; i < u8.length; i += chunk) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function b64ToU8(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encodeArg(value) {
    if (value instanceof Uint8Array) return { __bytes: u8ToB64(value) };
    return value;
  }

  function fileUrlToPath(fileUrl) {
    const q = fileUrl.indexOf('?');
    const base = q >= 0 ? fileUrl.slice(0, q) : fileUrl;
    let p = decodeURIComponent(base.replace(/^file:\/\//i, ''));
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return p;
  }

  function toAsset(fileUrl) {
    const q = fileUrl.indexOf('?');
    const query = q >= 0 ? fileUrl.slice(q) : '';
    const convert = (tauri.core && tauri.core.convertFileSrc) || tauri.convertFileSrc;
    if (typeof convert !== 'function') return fileUrl;
    try { return convert(fileUrlToPath(fileUrl)) + query; }
    catch { return fileUrl; }
  }
  function rewrite(value) {
    if (typeof value === 'string') return value.startsWith('file:') ? toAsset(value) : value;
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') {
      if (typeof value.__bytes === 'string' && Object.keys(value).length === 1) return b64ToU8(value.__bytes);
      const out = {};
      for (const key of Object.keys(value)) out[key] = rewrite(value[key]);
      return out;
    }
    return value;
  }

  async function call(channel, ...args) {
    if (!invoke) throw new Error('Tauri invoke is not available');
    return rewrite(await invoke('ipc', { channel, args: args.map(encodeArg) }));
  }

  /** The bytes of a file as a Uint8Array (a raw ArrayBuffer from the host, no base64);
   *  with `max`, only the first `max` bytes. */
  async function fileBytes(filePath, max) {
    return new Uint8Array(await invoke('read_file_bytes', max ? { path: filePath, max } : { path: filePath }));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(s);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsDataURL(blob);
    });
  }

  /* ── HEIC / HEIF → JPEG in a worker (libheif, the decoder the Node host used through
     heic-convert). Kept for the last few files, so the neighbours app.js converts ahead of
     time open at once. ── */
  const HEIC_MEM_MAX = 8;
  const heicCache = new Map();      // path|size|mtime → data URL
  const heicInflight = new Map();
  let heicWorker = null;
  let heicSeq = 0;
  const heicJobs = new Map();

  function getHeicWorker() {
    if (!heicWorker) {
      heicWorker = new Worker(new URL('js/heicWorker.js', document.baseURI).href);
      heicWorker.onmessage = (e) => {
        const job = heicJobs.get(e.data.id);
        if (!job) return;
        heicJobs.delete(e.data.id);
        if (e.data.error) job.reject(new Error(e.data.error));
        else job.resolve(e.data);
      };
      heicWorker.onerror = (e) => {
        heicJobs.forEach((job) => job.reject(new Error(e.message || 'HEIC worker failed')));
        heicJobs.clear();
        heicWorker = null;
      };
    }
    return heicWorker;
  }

  async function convertHeic(filePath) {
    const note = (percent, message) => dispatch('open-progress', { percent, message });
    note(8, 'reading');
    const st = await call('get-file-stats', filePath);
    if (st && st.error) throw new Error(st.error);
    const key = `${filePath}|${st && st.size}|${st && st.modified}`;
    const hit = heicCache.get(key);
    if (hit) {
      heicCache.delete(key);
      heicCache.set(key, hit);
      note(92, 'displaying');
      return hit;
    }
    if (heicInflight.has(key)) return heicInflight.get(key);
    const work = (async () => {
      note(18, 'reading');
      const bytes = await fileBytes(filePath);
      note(28, 'decoding');
      const buf = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
      const res = await new Promise((resolve, reject) => {
        const id = ++heicSeq;
        heicJobs.set(id, { resolve, reject });
        getHeicWorker().postMessage({ id, bytes: buf, quality: 0.88 }, [buf]);
      });
      note(78, 'caching');
      const url = await blobToDataUrl(new Blob([res.jpeg], { type: 'image/jpeg' }));
      heicCache.set(key, url);
      while (heicCache.size > HEIC_MEM_MAX) heicCache.delete(heicCache.keys().next().value);
      note(94, 'displaying');
      return url;
    })();
    heicInflight.set(key, work);
    try { return await work; } finally { heicInflight.delete(key); }
  }

  function isHeicPath(p) {
    return /\.(heic|heif|hif)$/i.test(String(p || ''));
  }

  /* ── Info panel tags: EXIF / XMP / IPTC / ICC read with exifr, flattened the way the Node
     host did. exifr gets the file's bytes (the first 16 MB of a bigger one — where the
     metadata of a photo is); an asset URL cannot be fetched from the page. ── */
  const EXIF_READ_MAX = 16 * 1024 * 1024;
  let exifrReady = null;
  function getExifr() {
    if (!exifrReady) {
      exifrReady = (window.exifr ? Promise.resolve() : loadScript(new URL('vendor/node_modules/exifr/dist/full.umd.js', document.baseURI).href))
        .then(() => window.exifr)
        .catch((err) => { exifrReady = null; throw err; });
    }
    return exifrReady;
  }

  function viewToMeta(view) {
    const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (!u8.length) return null;
    const text = (enc, bytes) => { try { return new TextDecoder(enc).decode(bytes); } catch { return ''; } };
    if (u8.length >= 8) {
      const head = text('latin1', u8.subarray(0, 8));
      const rest = u8.subarray(8);
      if (head.startsWith('ASCII')) {
        const s = text('utf-8', rest).replace(/\0/g, '').trim();
        if (s) return s;
      } else if (head.startsWith('UNICODE') || head.startsWith('Unicode')) {
        const s = text('utf-16le', rest).replace(/\0/g, '').trim();
        if (s) return s;
      }
    }
    const ascii = text('latin1', u8).replace(/\0/g, '').trim();
    if (ascii && /^[\x20-\x7E]+$/.test(ascii)) return ascii;
    if (u8.length <= 16) return Array.from(u8).join(', ');
    return `[binary ${u8.length} bytes]`;
  }

  function metaJsonSafe(value, depth = 0) {
    if (value == null) return null;
    if (typeof value === 'string') {
      const s = value.replace(/\0/g, '').trim();
      return s || null;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (ArrayBuffer.isView(value)) return viewToMeta(value);
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) {
        return value.map((v) => String(v)).join(', ');
      }
      if (depth > 6) return value.map((v) => String(v)).join(', ');
      const arr = value.map((v) => metaJsonSafe(v, depth + 1)).filter((v) => v != null && v !== '');
      return arr.length ? arr : null;
    }
    if (typeof value === 'object') {
      if (depth > 8) return String(value);
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (/thumbnail/i.test(k)) continue;
        const s = metaJsonSafe(v, depth + 1);
        if (s != null && s !== '') out[k] = s;
      }
      return Object.keys(out).length ? out : null;
    }
    return String(value);
  }

  function flattenMeta(value, prefix, out, depth = 0) {
    if (value == null) return;
    const isPlain = typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !ArrayBuffer.isView(value);
    if (!isPlain || depth > 8) {
      const safe = metaJsonSafe(value, depth);
      if (safe != null && safe !== '' && safe !== false) out[prefix] = safe;
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      if (/thumbnail/i.test(k)) continue;
      flattenMeta(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
    }
  }

  async function readImageMeta(filePath) {
    if (!filePath) return null;
    let out = null;
    try { out = await call('read-image-meta', filePath); } catch { /* host side failed */ }
    if (!out || typeof out !== 'object' || out.error) out = { basic: {}, tags: {}, all: {} };
    out.tags = out.tags || {};
    out.all = out.all || {};
    try {
      const exifr = await getExifr();
      const parsed = await Promise.race([
        exifr.parse(await fileBytes(filePath, EXIF_READ_MAX), {
          tiff: true, xmp: true, icc: true, iptc: true, jfif: true, ihdr: true,
          ifd0: true, ifd1: false, exif: true, gps: true, interop: true,
          makerNote: false, userComment: true, multiSegment: false,
          translateKeys: true, translateValues: true, reviveValues: true,
          mergeOutput: false, sanitize: false, silentErrors: true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('exif timeout')), 4000)),
      ]);
      if (parsed && typeof parsed === 'object') {
        flattenMeta(parsed, '', out.all);
        for (const [k, v] of Object.entries(out.all)) {
          if (v == null || v === '' || v === false) continue;
          const short = k.includes('.') ? k.slice(k.lastIndexOf('.') + 1) : k;
          if (out.tags[short] == null) out.tags[short] = v;
        }
      }
    } catch { /* no tags (or not readable) */ }
    return out;
  }

  /* ── Print: the preview dialog decides paper / orientation / margins / image size; the
     picture is laid out at exactly that size and printed from a hidden frame. ── */
  function printPageHtml(dataUrl, title, {
    marginMm = 10, imgWmm, imgHmm, color, header, footer, headerMm = 0, footerMm = 0,
  } = {}) {
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const imgCss = (imgWmm > 0 && imgHmm > 0)
      ? `width: ${imgWmm}mm; height: ${imgHmm}mm;`
      : 'max-width: 100%; max-height: 100%; object-fit: contain;';
    const filter = color === 'gray' ? 'filter: grayscale(1);' : '';
    const band = (cls, mm, slots) => {
      if (!(mm > 0) || !slots) return '';
      return `<div class="band ${cls}" style="height:${mm}mm">`
        + `<span class="l">${esc(slots.left)}</span>`
        + `<span class="c">${esc(slots.center)}</span>`
        + `<span class="r">${esc(slots.right)}</span></div>`;
    };
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { margin: ${marginMm}mm; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff; }
  body { display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; }
  .band { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center;
          font: 10pt/1.2 "Segoe UI", system-ui, sans-serif; color: #111; }
  .band span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .band .l { text-align: left; } .band .c { text-align: center; } .band .r { text-align: right; }
  .pic { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  img { ${imgCss} ${filter} }
</style></head><body>
${band('hdr', headerMm, header)}
<div class="pic"><img src="${dataUrl}" alt=""></div>
${band('ftr', footerMm, footer)}
</body></html>`;
  }

  function on(channel, cb) {
    if (!listeners[channel]) listeners[channel] = [];
    listeners[channel].push(cb);
  }

  function dispatch(channel, payload) {
    (listeners[channel] || []).forEach((cb) => {
      try { cb(payload); } catch (err) { console.error(err); }
    });
  }

  // What the host pushes (progress, folder / file changes, open-file …)
  if (tauri.event && tauri.event.listen) {
    tauri.event.listen('host-event', (e) => {
      const msg = e && e.payload;
      if (msg && msg.channel) dispatch(msg.channel, msg.payload);
    });
  }

  function getWin() {
    const w = tauri.window;
    if (w && typeof w.getCurrentWindow === 'function') return w.getCurrentWindow();
    if (tauri.webviewWindow && typeof tauri.webviewWindow.getCurrentWebviewWindow === 'function') {
      return tauri.webviewWindow.getCurrentWebviewWindow();
    }
    return null;
  }

  function logicalSize(width, height) {
    const Ctor = tauri.dpi && tauri.dpi.LogicalSize;
    return Ctor ? new Ctor(width, height) : { width, height };
  }

  function logicalPos(x, y) {
    const Ctor = tauri.dpi && tauri.dpi.LogicalPosition;
    return Ctor ? new Ctor(x, y) : { x, y };
  }

  function messageBox(options) {
    const buttons = options.buttons && options.buttons.length ? options.buttons : ['OK'];
    const cancelId = Number.isInteger(options.cancelId) ? options.cancelId : buttons.length - 1;
    const defaultId = Number.isInteger(options.defaultId) ? options.defaultId : 0;
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay visible';
      overlay.style.display = 'flex';
      const box = document.createElement('div');
      box.className = 'dialog-box';
      box.style.minWidth = '360px';
      const title = document.createElement('div');
      title.className = 'dialog-header';
      const titleText = document.createElement('span');
      titleText.className = 'dialog-title';
      titleText.textContent = options.title || 'MyImageViewer';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'dialog-close-btn';
      close.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      close.addEventListener('click', () => finish(cancelId));
      title.append(titleText, close);
      const body = document.createElement('div');
      body.className = 'dialog-body';
      body.style.whiteSpace = 'pre-wrap';
      body.textContent = [options.message, options.detail].filter(Boolean).join('\n\n');
      const footer = document.createElement('div');
      footer.className = 'dialog-footer';
      const finish = (index) => {
        overlay.remove();
        resolve({ response: index });
      };
      buttons.forEach((label, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        if (i === defaultId) btn.classList.add('primary');
        btn.addEventListener('click', () => finish(i));
        footer.appendChild(btn);
      });
      box.append(title, body, footer);
      overlay.appendChild(box);
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') finish(cancelId);
      });
      document.body.appendChild(overlay);
      footer.querySelector('.primary')?.focus();
    });
  }

  function closeCopy() {
    const ko = (document.documentElement.lang || '').toLowerCase().startsWith('ko');
    return ko
      ? { title: '저장되지 않은 변경 사항', message: '저장되지 않은 변경 사항이 있습니다.\n저장하시겠습니까?', buttons: ['저장', '저장 안 함', '취소'] }
      : { title: 'Unsaved Changes', message: 'You have unsaved changes.\nDo you want to save before closing?', buttons: ['Save', "Don't Save", 'Cancel'] };
  }

  async function forceQuit() {
    const win = getWin();
    const invoke = tauri.core && tauri.core.invoke;
    const label = (win && win.label) || 'main';
    if (win && typeof win.destroy === 'function') {
      await win.destroy();
      return;
    }
    if (invoke) {
      await invoke('plugin:window|destroy', { label });
      return;
    }
    if (win && typeof win.close === 'function') {
      await win.close();
    }
  }

  async function doClose() {
    if (closing) return;
    if (unsaved) {
      const answer = await messageBox({ ...closeCopy(), defaultId: 0, cancelId: 2 });
      if (!answer || answer.response === 2) return;
      if (answer.response === 0) {
        dispatch('menu-action', 'save-before-close');
        return;
      }
      unsaved = false;
      try { await call('set-unsaved-changes', false); } catch { /* ignore */ }
    }
    closing = true;
    try {
      await forceQuit();
    } catch (err) {
      closing = false;
      console.error('quit failed', err);
    }
  }

  function printHtml(html) {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('title', 'Print');
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
      iframe.srcdoc = html;
      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => { iframe.remove(); resolve({ success: true }); }, 400);
        } catch (err) {
          iframe.remove();
          resolve({ error: err.message || 'print failed' });
        }
      };
      document.body.appendChild(iframe);
    });
  }

  const ua = navigator.userAgent || '';
  const platform = /Windows/i.test(ua) ? 'win32' : /Mac OS X|Macintosh/i.test(ua) ? 'darwin' : 'linux';

  window.electronAPI = {
    getPathForFile: (file) => {
      const name = file && file.name;
      if (name) {
        const hit = dropped.find((p) => p.endsWith(name) || p.endsWith(`\\${name}`) || p.endsWith(`/${name}`));
        if (hit) return hit;
      }
      return (file && file.path) || '';
    },

    readDirectory: (dirPath) => call('read-directory', dirPath),
    readDirectoryDetailed: (dirPath) => call('read-directory-detailed', dirPath),
    listDrives: () => call('list-drives'),
    pathAncestors: (targetPath) => call('path-ancestors', targetPath),
    getFileStats: (filePath) => call('get-file-stats', filePath),
    readImageMeta: (filePath) => readImageMeta(filePath),
    readMediaMeta: (filePath) => call('read-media-meta', filePath),
    getFileUrl: (filePath) => call('get-file-url', filePath),
    readFileBase64: (filePath) => call('read-file-base64', filePath),
    readHelpDoc: (lang) => call('read-help-doc', lang),
    readFileBytes: async (filePath) => {
      try { return await fileBytes(filePath); } catch (err) { return { error: String((err && err.message) || err) }; }
    },
    thumbCacheLoad: (dirPath) => call('thumb-cache-load', dirPath),
    thumbCachePut: (filePath, bytes, meta) => call('thumb-cache-put', filePath, bytes, meta),
    thumbCacheStats: () => call('thumb-cache-stats'),
    // Host-side thumbnails (sharp): one now, or whole folders in the background
    thumbMake: (filePath) => call('thumb-make', filePath),
    thumbCacheBuild: (dirs, opts) => call('thumb-cache-build', dirs, opts || {}),
    thumbCacheClear: () => call('thumb-cache-clear'),
    // TIFF → PNG in the host; HEIC / HEIF → JPEG here (libheif worker)
    convertToPng: async (filePath) => {
      if (!isHeicPath(filePath)) return call('convert-to-png', filePath);
      try { return await convertHeic(filePath); } catch (err) { return { error: (err && err.message) || 'HEIC convert failed' }; }
    },
    // Playable MP4 / M4A copy (ffmpeg) of media the webview cannot decode
    transcodeMedia: (filePath, kind) => call('media-transcode', filePath, kind),
    rembgRemove: (opts) => call('rembg-remove', opts),
    onRembgProgress: (cb) => { on('rembg-progress', cb); return () => {}; },
    onOpenProgress: (cb) => { on('open-progress', cb); return () => {}; },
    decodeDicom: (filePath) => call('decode-dicom', filePath),
    saveFile: (data) => call('save-file', data),
    showSaveDialog: (data) => call('show-save-dialog', data),
    printImage: async (opts = {}) => {
      const { dataUrl, title, marginMm, imgWmm, imgHmm, color, header, footer, headerMm, footerMm } = opts;
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return { error: 'Nothing to print' };
      const mm = Number.isFinite(marginMm) ? Math.max(0, marginMm) : 10;
      return printHtml(printPageHtml(dataUrl, title, { marginMm: mm, imgWmm, imgHmm, color, header, footer, headerMm, footerMm }));
    },
    getPrinters: () => call('get-printers'),
    writeFile: (data) => call('write-file', data),

    openFileDialog: () => call('open-file-dialog'),
    openFolderDialog: () => call('open-folder-dialog'),
    openSubtitleDialog: (videoPath) => call('open-subtitle-dialog', videoPath),
    setLastOpenDir: (dirPath) => call('set-last-open-dir', dirPath),
    getLastOpenDir: () => call('get-last-open-dir'),
    getSavedLastOpenDir: () => call('get-saved-last-open-dir'),
    showMessageBox: (options) => messageBox(options || {}),

    getHomeDir: () => call('get-home-dir'),
    getPathSep: () => call('get-path-sep'),
    pathJoin: (...parts) => call('path-join', parts),
    pathDirname: (p) => call('path-dirname', p),
    pathBasename: (p) => call('path-basename', p),

    updateMenu: (data) => call('update-menu', data),

    windowMinimize: () => { const w = getWin(); return w ? w.minimize() : null; },
    windowMaximize: async () => {
      const w = getWin();
      if (!w) return false;
      if (await w.isMaximized()) await w.unmaximize();
      else await w.maximize();
      return w.isMaximized();
    },
    windowSetMinSize: (width, height) => {
      const w = getWin();
      if (w && w.setMinSize) return w.setMinSize(logicalSize(width, height));
      return null;
    },
    windowGetBounds: async () => {
      const w = getWin();
      if (!w) return null;
      const pos = await w.outerPosition();
      const size = await w.outerSize();
      const factor = w.scaleFactor ? await w.scaleFactor() : 1;
      const x = pos.x / factor;
      const y = pos.y / factor;
      return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(size.width / factor),
        height: Math.round(size.height / factor),
        maximized: await w.isMaximized(),
      };
    },
    windowApplySize: async (opts = {}) => {
      const w = getWin();
      if (!w) return null;
      const width = Math.round(Number(opts.width) || 0);
      const height = Math.round(Number(opts.height) || 0);
      if (w.setMinSize && opts.minWidth) await w.setMinSize(logicalSize(opts.minWidth, opts.minHeight || height));
      if (!(await w.isMaximized()) && width && height) await w.setSize(logicalSize(width, height));
      return window.electronAPI.windowGetBounds();
    },
    windowSetSize: async (width, height) => {
      const w = getWin();
      if (!w || await w.isMaximized()) return null;
      await w.setSize(logicalSize(width, height));
      return window.electronAPI.windowGetBounds();
    },
    windowClose: () => doClose(),
    windowIsMaximized: () => { const w = getWin(); return w ? w.isMaximized() : false; },
    toggleFullscreen: async () => {
      const w = getWin();
      if (!w) return false;
      const next = !(await w.isFullscreen());
      await w.setFullscreen(next);
      return next;
    },
    onMaximizeChange: (cb) => { on('maximize-change', cb); return () => {}; },

    onOpenFile: (cb) => on('open-file', cb),
    getLaunchFile: () => call('get-launch-file'),
    getAppInfo: () => call('get-app-info'),
    getFileAssocStatus: () => call('get-file-assoc-status'),
    setDefaultImageViewer: () => call('set-default-image-viewer'),
    openDefaultAppsSettings: () => call('open-default-apps-settings'),
    onOpenFolder: (cb) => on('open-folder', cb),
    onMenuAction: (cb) => on('menu-action', cb),

    showItemInFolder: (filePath) => call('show-item-in-folder', filePath),
    openExternal: (target) => call('open-external', target),
    deleteFile: (filePath) => call('delete-file', filePath),
    renamePath: (src, newName) => call('rename-path', { src, newName }),
    transferIntoDir: (opts) => call('transfer-into-dir', opts),
    pickDirectory: (opts) => call('pick-directory', opts),
    startDrag: (filePathOrPaths) => call('start-drag', filePathOrPaths),
    setUnsavedChanges: (value) => { unsaved = !!value; return call('set-unsaved-changes', value); },
    closeWindow: async () => {
      unsaved = false;
      closing = true;
      try { await call('set-unsaved-changes', false); } catch { /* ignore */ }
      try {
        await forceQuit();
      } catch (err) {
        closing = false;
        console.error('quit failed', err);
      }
    },

    // Context menus / drop-downs drawn by the menu overlay window, so they can run past
    // this window's edges (src-tauri main.rs, src/popup.html; contextMenu.js drives them).
    ...(invoke ? {
      popupMenu: (data) => invoke('popup_menu_show', { payload: data }),
      popupMenuHide: () => invoke('popup_menu_hide'),
      popupMenuRefresh: (data) => invoke('popup_menu_refresh', { payload: data }),
      popupMenuVisible: () => invoke('popup_menu_visible'),
      // An in-app drag that left the window becomes an OS file drag (dragdrop.js)
      startFileDrag: (paths) => invoke('start_file_drag', { paths: (Array.isArray(paths) ? paths : [paths]).filter(Boolean) }),
      onPopupMenuEvent: (cb) => {
        if (tauri.event && tauri.event.listen) tauri.event.listen('popup-menu-event', (e) => cb(e.payload));
      },
    } : {}),

    watchDirectory: (dirPath) => call('watch-directory', dirPath),
    unwatchDirectory: (dirPath) => call('unwatch-directory', dirPath),
    watchFile: (filePath) => call('watch-file', filePath),
    unwatchFile: (filePath) => call('unwatch-file', filePath),
    onDirectoryChanged: (cb) => on('directory-changed', cb),
    onFileChanged: (cb) => on('file-changed', cb),
    removeListener: () => {},
    removeAllListeners: () => {},

    platform,
  };

  function remember() {
    window.electronAPI.windowGetBounds().then((b) => {
      if (b && b.width && b.height) call('window-remember', b).catch(() => {});
    }).catch(() => {});
  }

  let rememberTimer = null;
  function queueRemember() {
    clearTimeout(rememberTimer);
    rememberTimer = setTimeout(remember, 400);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    const win = getWin();
    if (!win) return;
    try {
      const saved = await call('window-recall');
      if (saved && saved.width && saved.height) {
        if (Number.isFinite(saved.x) && Number.isFinite(saved.y) && win.setPosition) {
          await win.setPosition(logicalPos(saved.x, saved.y));
        }
        await win.setSize(logicalSize(saved.width, saved.height));
        if (saved.maximized && win.maximize) await win.maximize();
      }
    } catch { /* first launch */ }

    try {
      if (win.onCloseRequested) {
        await win.onCloseRequested((event) => {
          if (closing) return;
          event.preventDefault();
          doClose();
        });
      }
    } catch (err) { console.warn('close request', err); }

    try {
      if (win.onResized) await win.onResized(() => { queueRemember(); win.isMaximized().then((m) => dispatch('maximize-change', !!m)); });
      // A menu in the overlay stays where it was drawn — moving the window closes it.
      if (win.onMoved) await win.onMoved(() => { queueRemember(); window.ContextMenu?.hide?.(); });
    } catch { /* permissions */ }

    try {
      if (win.onDragDropEvent) {
        // Files dragged in from another app. The window owns the drop target, so the page
        // never sees HTML5 drop events: forward enter / over / drop / leave with the real
        // paths and the position in CSS px; app.js decides where the files land.
        let draggedPaths = [];
        await win.onDragDropEvent((event) => {
          const payload = event.payload || event;
          if (!payload) return;
          if (Array.isArray(payload.paths) && payload.paths.length) draggedPaths = payload.paths;
          if (payload.type === 'drop' && Array.isArray(payload.paths)) dropped = payload.paths;
          const dpr = window.devicePixelRatio || 1;
          const pos = payload.position || null;
          window.dispatchEvent(new CustomEvent('native-dragdrop', {
            detail: {
              type: payload.type,
              paths: payload.type === 'leave' ? [] : (payload.paths && payload.paths.length ? payload.paths : draggedPaths),
              x: pos ? pos.x / dpr : null,
              y: pos ? pos.y / dpr : null,
            },
          }));
          if (payload.type === 'drop' || payload.type === 'leave') draggedPaths = [];
        });
      }
    } catch { /* drag-drop permission */ }

    try {
      if (await win.isMaximized()) dispatch('maximize-change', true);
    } catch { /* ignore */ }
  });
})();
