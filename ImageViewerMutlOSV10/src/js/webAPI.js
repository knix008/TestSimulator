/**
 * Browser shim for window.electronAPI (used when not running under Electron).
 * Loaded only in web mode — see index.html.
 */
(function initWebAPI() {
  if (window.electronAPI) return; // Electron preload already present

  const R = () => window.FileRegistry;
  const listeners = {
    'open-file': [],
    'open-folder': [],
    'menu-action': [],
    'directory-changed': [],
    'file-changed': [],
  };
  let lastOpenDir = localStorage.getItem('webLastOpenDir') || '/';
  let unsaved = false;

  function emit(channel, payload) {
    (listeners[channel] || []).forEach((cb) => {
      try { cb(payload); } catch (e) { console.error(e); }
    });
  }

  function on(channel, cb) {
    if (!listeners[channel]) listeners[channel] = [];
    listeners[channel].push(cb);
  }

  function pickFiles({ multiple = false, directory = false } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (directory) {
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');
      } else {
        input.accept = [
          'image/*', 'video/*', 'audio/*',
          '.dcm', '.dicom', '.heic', '.heif', '.tif', '.tiff', '.svg', '.ico',
        ].join(',');
        input.multiple = multiple;
      }
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);
        input.remove();
        resolve(files);
      }, { once: true });
      input.click();
    });
  }

  async function openFolderViaPicker() {
    if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        R().clear();
        const root = await R().mountDirectoryHandle(handle, '/');
        lastOpenDir = root;
        localStorage.setItem('webLastOpenDir', root);
        localStorage.setItem('webRootLabel', handle.name || 'Local Files');
        emit('open-folder', root);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        console.warn('showDirectoryPicker failed, falling back to input', e);
      }
    }
    const files = await pickFiles({ directory: true });
    if (!files.length) return;
    const root = R().mountWebkitFiles(files);
    lastOpenDir = root;
    localStorage.setItem('webLastOpenDir', root);
    const top = files[0]?.webkitRelativePath?.split(/[/\\]/)[0] || 'Local Files';
    localStorage.setItem('webRootLabel', top);
    emit('open-folder', root);
  }

  async function openFileViaPicker() {
    const files = await pickFiles({ multiple: true });
    if (!files.length) return;
    // Ensure a root exists
    if (!R().hasPath('/')) {
      R().clear();
      // virtual root listing
    }
    for (const file of files) {
      const p = R().registerFile(file, '/');
      emit('open-file', p);
    }
  }

  function dataUrlToBlob(dataUrl) {
    const [header, b64] = dataUrl.split(',');
    const mime = (header.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  async function downloadDataUrl(dataUrl, fileName) {
    const blob = dataUrlToBlob(dataUrl);
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName || 'image.png',
          types: [{
            description: 'Image',
            accept: {
              'image/png': ['.png'],
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/webp': ['.webp'],
              'image/bmp': ['.bmp'],
            },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { filePath: fileName || handle.name, success: true };
      } catch (e) {
        if (e && e.name === 'AbortError') return { canceled: true };
      }
    }
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName || 'image.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { filePath: fileName || 'image.png', success: true };
  }

  window.addEventListener('beforeunload', (e) => {
    if (!unsaved) return;
    e.preventDefault();
    e.returnValue = '';
  });

  window.electronAPI = {
    getPathForFile: () => '',

    readDirectory: async (dirPath) => {
      try { return await R().readDirectory(dirPath); }
      catch (e) { return { error: e.message }; }
    },

    listDrives: async () => {
      const label = localStorage.getItem('webRootLabel') || 'Local Files';
      return [{
        name: label,
        path: '/',
        isDirectory: true,
        isDrive: true,
      }];
    },

    pathAncestors: async (targetPath) => R().ancestors(targetPath),

    getFileStats: async (filePath) => R().getStats(filePath),

    getFileUrl: async (filePath) => {
      const url = R().getObjectUrl(filePath);
      if (!url) throw new Error('File not found');
      return url;
    },

    readFileBase64: async (filePath) => {
      try { return await R().readAsDataUrl(filePath); }
      catch (e) { return { error: e.message }; }
    },

    convertToPng: async (filePath) => {
      // Prefer client-side decoders in FormatSupport (called by loadImageFile fallback)
      try {
        const buf = await R().readAsArrayBuffer(filePath);
        if (window.FormatSupport) {
          if (FormatSupport.isTiff(filePath) && window.UTIF) {
            // decode via FormatSupport internals through load path — signal fallback
            return { error: 'client-decode' };
          }
          if (FormatSupport.isHeic(filePath) && window.heic2any) {
            return { error: 'client-decode' };
          }
        }
        // Try creating Image from blob (some browsers decode TIFF/HEIC natively)
        const file = R().getFile(filePath);
        if (!file) return { error: 'File not found' };
        const url = URL.createObjectURL(file);
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth;
              c.height = img.naturalHeight;
              c.getContext('2d').drawImage(img, 0, 0);
              resolve(c.toDataURL('image/png'));
            };
            img.onerror = () => reject(new Error('Browser cannot decode this image'));
            img.src = url;
          });
          return dataUrl;
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        return { error: e.message || 'convert failed' };
      }
    },

    decodeDicom: async (filePath) => {
      try {
        const buf = await R().readAsArrayBuffer(filePath);
        // Use FormatSupport client parser if available via temporary exposure
        if (window.FormatSupport && typeof window.FormatSupport.decodeDicomBuffer === 'function') {
          return await window.FormatSupport.decodeDicomBuffer(buf);
        }
        return { error: 'DICOM decoder not available in web mode' };
      } catch (e) {
        return { error: e.message };
      }
    },

    saveFile: async ({ defaultPath, dataUrl }) => {
      const name = (defaultPath || 'image.png').split(/[/\\]/).pop();
      return downloadDataUrl(dataUrl, name);
    },

    showSaveDialog: async ({ defaultPath }) => {
      const name = (defaultPath || 'image.png').split(/[/\\]/).pop();
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: name,
            types: [{
              description: 'Image',
              accept: {
                'image/png': ['.png'],
                'image/jpeg': ['.jpg', '.jpeg'],
                'image/webp': ['.webp'],
                'image/bmp': ['.bmp'],
              },
            }],
          });
          // Store handle for subsequent writeFile
          window.__webSaveHandle = handle;
          return { filePath: handle.name || name };
        } catch (e) {
          if (e && e.name === 'AbortError') return { canceled: true };
        }
      }
      window.__webSaveHandle = null;
      window.__webSaveName = name;
      return { filePath: name };
    },

    writeFile: async ({ filePath, dataUrl }) => {
      try {
        const blob = dataUrlToBlob(dataUrl);
        if (window.__webSaveHandle) {
          const writable = await window.__webSaveHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          window.__webSaveHandle = null;
          return { success: true, filePath };
        }
        const name = (filePath || window.__webSaveName || 'image.png').split(/[/\\]/).pop();
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return { success: true, filePath: name };
      } catch (e) {
        return { error: e.message };
      }
    },

    openFileDialog: async () => { await openFileViaPicker(); },
    openFolderDialog: async () => {
      await openFolderViaPicker();
      // Refresh drive label after mount
    },

    setLastOpenDir: async (dirPath) => {
      lastOpenDir = dirPath || '/';
      localStorage.setItem('webLastOpenDir', lastOpenDir);
      return lastOpenDir;
    },
    getLastOpenDir: async () => lastOpenDir,

    showMessageBox: async (options = {}) => {
      const msg = [options.message, options.detail].filter(Boolean).join('\n\n');
      if (options.buttons && options.buttons.length > 1) {
        const ok = window.confirm(msg || options.title || 'Confirm');
        return { response: ok ? 0 : (options.cancelId ?? 1) };
      }
      window.alert(msg || options.title || '');
      return { response: 0 };
    },

    getHomeDir: async () => '/',
    getPathSep: async () => '/',
    pathJoin: async (...parts) => R().join(...parts.flat()),
    pathDirname: async (p) => R().dirname(p),
    pathBasename: async (p) => R().basename(p),

    updateMenu: async () => {},

    onOpenFile: (cb) => on('open-file', cb),
    onOpenFolder: (cb) => on('open-folder', cb),
    onMenuAction: (cb) => on('menu-action', cb),
    onDirectoryChanged: (cb) => on('directory-changed', cb),
    onFileChanged: (cb) => on('file-changed', cb),

    showItemInFolder: async () => ({ error: 'Not available in web mode' }),
    deleteFile: async () => ({ error: 'Delete is not available in web mode' }),

    setUnsavedChanges: async (value) => { unsaved = !!value; },
    closeWindow: async () => { window.close(); },

    startDrag: () => {},
    watchDirectory: async () => {},
    unwatchDirectory: async () => {},
    watchFile: async () => {},
    unwatchFile: async () => {},
    removeListener: () => {},
    removeAllListeners: () => {},

    platform: 'web',
    isWeb: true,
  };

  console.info('[webAPI] Browser mode ready');
})();
