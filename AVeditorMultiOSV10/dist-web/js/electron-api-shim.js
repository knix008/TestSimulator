/**
 * Browser shim for window.electronAPI.
 * Loaded only in the web build (not in Electron — preload provides the real API).
 */
(function initAvEditorWebApi() {
  'use strict';

  if (typeof window === 'undefined') return;
  // Electron preload already exposed a real bridge.
  if (window.electronAPI && window.electronAPI.isElectron) return;

  const MEDIA_EXTS = new Set([
    '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.ts', '.mts',
    '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.opus', '.aiff',
  ]);
  const AUDIO_EXTS = new Set([
    '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.opus', '.aiff',
  ]);

  /** @type {Map<string, File>} */
  const library = new Map();
  /** @type {Map<string, string>} */
  const blobUrls = new Map();
  /** @type {Map<string, object>} */
  const projectCache = new Map();

  const LIBRARY_ROOT = '/library';

  function extOf(name) {
    const i = String(name || '').lastIndexOf('.');
    return i >= 0 ? String(name).slice(i).toLowerCase() : '';
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function pickFiles({ accept = '', multiple = true } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = !!multiple;
      if (accept) input.accept = accept;
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

  function addLibraryFile(file) {
    const safeName = String(file.name || 'media').replace(/[\\/]/g, '_');
    let path = `${LIBRARY_ROOT}/${safeName}`;
    let n = 1;
    while (library.has(path)) {
      const stem = safeName.replace(/(\.[^.]+)?$/, '');
      const ext = extOf(safeName);
      path = `${LIBRARY_ROOT}/${stem}-${n}${ext}`;
      n += 1;
    }
    if (blobUrls.has(path)) URL.revokeObjectURL(blobUrls.get(path));
    library.set(path, file);
    blobUrls.set(path, URL.createObjectURL(file));
    return path;
  }

  function notifyLibraryChanged() {
    window.dispatchEvent(new CustomEvent('av-library-changed'));
  }

  function probeMediaFile(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const ext = extOf(file.name);
      const el = document.createElement(AUDIO_EXTS.has(ext) ? 'audio' : 'video');
      el.preload = 'metadata';
      const done = (info) => {
        URL.revokeObjectURL(url);
        resolve(info);
      };
      el.addEventListener('loadedmetadata', () => {
        done({
          name: file.name,
          size: file.size,
          duration: Number.isFinite(el.duration) ? el.duration : null,
          width: el.videoWidth || null,
          height: el.videoHeight || null,
          isVideo: !AUDIO_EXTS.has(ext),
          isAudio: AUDIO_EXTS.has(ext),
          extension: ext,
        });
      }, { once: true });
      el.addEventListener('error', () => {
        done({ name: file.name, size: file.size, extension: ext });
      }, { once: true });
      el.src = url;
    });
  }

  let menuCallback = null;
  let exportProgressCallback = null;

  window.electronAPI = {
    isElectron: false,
    isWeb: true,
    platform: 'web',

    getPathSep: async () => '/',
    getHomeDir: async () => LIBRARY_ROOT,
    getSpecialFolders: async () => [{ name: 'Library', path: LIBRARY_ROOT }],

    getDrives: async () => [{ name: 'Library', path: LIBRARY_ROOT, isDrive: true }],
    listDrives: async () => [{ name: 'Library', path: LIBRARY_ROOT, isDrive: true }],

    readDirectory: async (dirPath) => {
      if (!dirPath || dirPath === LIBRARY_ROOT || dirPath === `${LIBRARY_ROOT}/`) {
        return Array.from(library.entries()).map(([p, file]) => {
          const ext = extOf(file.name);
          return {
            name: file.name,
            path: p,
            isDirectory: false,
            isMedia: MEDIA_EXTS.has(ext),
            extension: ext,
            size: file.size,
          };
        });
      }
      return [];
    },

    pathAncestors: async (targetPath) => {
      if (!targetPath) return [LIBRARY_ROOT];
      if (targetPath === LIBRARY_ROOT) return [LIBRARY_ROOT];
      return [LIBRARY_ROOT, targetPath];
    },

    getFileInfo: async (filePath) => {
      if (!filePath || filePath === LIBRARY_ROOT || filePath === `${LIBRARY_ROOT}/`) {
        return { name: 'Library', path: LIBRARY_ROOT, isDirectory: true, size: 0 };
      }
      const file = library.get(filePath);
      if (!file) return null;
      return {
        name: file.name,
        path: filePath,
        size: file.size,
        extension: extOf(file.name),
        isDirectory: false,
        modified: null,
        created: null,
      };
    },

    getMediaInfo: async (filePath) => {
      const file = library.get(filePath);
      if (!file) return null;
      return probeMediaFile(file);
    },

    resolveMediaUrl: async (filePath) => blobUrls.get(filePath) || null,

    openFileDialog: async () => {
      const files = await pickFiles({
        accept: 'audio/*,video/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.aac,.flac,.ogg,.m4a',
        multiple: true,
      });
      const paths = files.map(addLibraryFile);
      if (paths.length) notifyLibraryChanged();
      return paths;
    },

    openFolderDialog: async () => {
      // Web: pick multiple media files into the library and reveal Library root.
      const files = await pickFiles({
        accept: 'audio/*,video/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.aac,.flac,.ogg,.m4a',
        multiple: true,
      });
      files.forEach(addLibraryFile);
      if (files.length) notifyLibraryChanged();
      return LIBRARY_ROOT;
    },

    openProjectDialog: async () => {
      const files = await pickFiles({ accept: '.avp,application/json', multiple: false });
      if (!files.length) return null;
      try {
        const text = await files[0].text();
        const data = JSON.parse(text);
        const id = `/projects/${files[0].name}`;
        projectCache.set(id, data);
        return id;
      } catch {
        return null;
      }
    },

    saveProjectDialog: async (defaultPath) => {
      const name = (defaultPath || 'untitled.avp').split(/[\\/]/).pop();
      return name.endsWith('.avp') ? name : `${name}.avp`;
    },

    saveProjectFile: async (filePath, data) => {
      try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, String(filePath || 'project.avp').split(/[\\/]/).pop());
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    },

    loadProjectFile: async (filePath) => {
      const data = projectCache.get(filePath);
      if (!data) return { ok: false, error: 'Project not found' };
      return { ok: true, data };
    },

    exportDialog: async () => 'AV-Editor-export.txt',

    exportMedia: async (opts) => {
      // Placeholder export (matches Electron stub behavior).
      const steps = 10;
      for (let i = 1; i <= steps; i += 1) {
        await new Promise((r) => setTimeout(r, 80));
        exportProgressCallback?.({ percent: (i / steps) * 100, message: 'Exporting…' });
      }
      const blob = new Blob(
        ['AV Editor web export placeholder.\nReal encode is not available in the browser build yet.\n'],
        { type: 'text/plain' }
      );
      downloadBlob(blob, (opts?.outPath || 'export.txt').split(/[\\/]/).pop());
      return { ok: true };
    },

    cancelExport: async () => {},

    showMessageBox: async (opts) => {
      window.alert(opts?.message || opts?.title || '');
      return { response: 0 };
    },

    showItemInFolder: async () => {},

    setMenuLocale: async () => {},

    onMenuAction: (callback) => { menuCallback = callback; },
    removeMenuActionListener: () => { menuCallback = null; },
    onExportProgress: (callback) => { exportProgressCallback = callback; },

    /** @private test helper */
    _webLibrary: library,
  };

  console.info('[AV Editor] Web API shim active');
})();
