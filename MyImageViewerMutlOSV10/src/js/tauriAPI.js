/**
 * Desktop bridge. When the page runs inside Tauri this installs window.electronAPI
 * (the same names the renderer already calls) and talks to host/server.js.
 * In a plain browser it does nothing, and webAPI.js takes over.
 */
(function initTauriAPI() {
  const tauri = window.__TAURI__;
  if (!tauri || window.electronAPI) return;

  const HOST = 'http://127.0.0.1:17810';
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
    const res = await fetch(`${HOST}/ipc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, args: args.map(encodeArg) }),
    });
    if (!res.ok) throw new Error(`host ${res.status}`);
    const data = await res.json();
    return rewrite(data ? data.result : null);
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

  const es = new EventSource(`${HOST}/events`);
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      dispatch(msg.channel, msg.payload);
    } catch { /* keepalive or noise */ }
  };

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
    readImageMeta: (filePath) => call('read-image-meta', filePath),
    readMediaMeta: (filePath) => call('read-media-meta', filePath),
    getFileUrl: (filePath) => call('get-file-url', filePath),
    readFileBase64: (filePath) => call('read-file-base64', filePath),
    readHelpDoc: (lang) => call('read-help-doc', lang),
    readFileBytes: (filePath) => call('read-file-bytes', filePath),
    thumbCacheLoad: (dirPath) => call('thumb-cache-load', dirPath),
    thumbCachePut: (filePath, bytes, meta) => call('thumb-cache-put', filePath, bytes, meta),
    thumbCacheStats: () => call('thumb-cache-stats'),
    thumbCacheClear: () => call('thumb-cache-clear'),
    convertToPng: (filePath) => call('convert-to-png', filePath),
    rembgRemove: (opts) => call('rembg-remove', opts),
    onRembgProgress: (cb) => { on('rembg-progress', cb); return () => {}; },
    onOpenProgress: (cb) => { on('open-progress', cb); return () => {}; },
    decodeDicom: (filePath) => call('decode-dicom', filePath),
    saveFile: (data) => call('save-file', data),
    showSaveDialog: (data) => call('show-save-dialog', data),
    printImage: async (data) => {
      const res = await call('print-image', data);
      if (res && res.html) return printHtml(res.html);
      return res;
    },
    getPrinters: () => call('get-printers'),
    writeFile: (data) => call('write-file', data),

    openFileDialog: () => call('open-file-dialog'),
    openFolderDialog: () => call('open-folder-dialog'),
    openSubtitleDialog: (videoPath) => call('open-subtitle-dialog', videoPath),
    setLastOpenDir: (dirPath) => call('set-last-open-dir', dirPath),
    getLastOpenDir: () => call('get-last-open-dir'),
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
      if (win.onMoved) await win.onMoved(() => queueRemember());
    } catch { /* permissions */ }

    try {
      if (win.onDragDropEvent) {
        await win.onDragDropEvent((event) => {
          const payload = event.payload || event;
          if (payload && payload.type === 'drop' && Array.isArray(payload.paths)) dropped = payload.paths;
        });
      }
    } catch { /* drag-drop permission */ }

    try {
      if (await win.isMaximized()) dispatch('maximize-change', true);
    } catch { /* ignore */ }
  });
})();
