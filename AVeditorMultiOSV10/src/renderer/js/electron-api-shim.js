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

  /** @type {Map<string, File|{name:string,size:number,remoteUrl?:string}>} */
  const library = new Map();
  /** @type {Map<string, string>} */
  const blobUrls = new Map();
  /** @type {Map<string, object>} */
  const projectCache = new Map();
  /** @type {Map<string, FileSystemFileHandle>} */
  const analysisHandles = new Map();
  /** @type {Map<string, FileSystemWritableFileStream>} */
  const analysisWritables = new Map();
  /** @type {Map<string, string>} */
  const analysisBuffers = new Map();

  function normalizeOllamaBase(baseUrl) {
    let raw = String(baseUrl || '/ollama').trim().replace(/\/+$/, '');
    if (!raw) raw = '/ollama';
    if (raw.startsWith('/')) {
      return `${window.location.origin}${raw}`;
    }
    return raw;
  }

  const LIBRARY_ROOT = '/library';
  const MEDIA_ACCEPT =
    'audio/*,video/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.aac,.flac,.ogg,.m4a';

  function extOf(name) {
    const i = String(name || '').lastIndexOf('.');
    return i >= 0 ? String(name).slice(i).toLowerCase() : '';
  }

  function mimeOf(name) {
    const ext = extOf(name);
    const map = {
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.m4v': 'video/mp4',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
      '.opus': 'audio/opus', '.aiff': 'audio/aiff',
    };
    return map[ext] || 'application/octet-stream';
  }

  function toAbsoluteUrl(url) {
    if (!url) return null;
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return url;
    }
  }

  function entryName(entry) {
    return entry?.name || 'media';
  }

  function entrySize(entry) {
    return Number(entry?.size) || 0;
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
      input.tabIndex = -1;
      input.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;opacity:0;overflow:hidden;pointer-events:none;';
      document.body.appendChild(input);

      let settled = false;
      let openedAt = 0;
      let cancelTimer = null;

      const finish = (files) => {
        if (settled) return;
        settled = true;
        clearTimeout(cancelTimer);
        window.removeEventListener('focus', onFocus);
        input.removeEventListener('change', onChange);
        input.removeEventListener('cancel', onCancel);
        try { input.remove(); } catch { /* ignore */ }
        resolve(Array.isArray(files) ? files : []);
      };

      const onChange = () => {
        clearTimeout(cancelTimer);
        finish(Array.from(input.files || []));
      };

      const onCancel = () => {
        clearTimeout(cancelTimer);
        finish([]);
      };

      // Opening the OS dialog often blurs/focuses the window before the user
      // picks anything. Ignoring early focus + waiting for `change` prevents
      // resolving [] while a real selection is still in progress.
      const onFocus = () => {
        if (Date.now() - openedAt < 500) return;
        clearTimeout(cancelTimer);
        cancelTimer = setTimeout(() => {
          if (settled) return;
          finish(Array.from(input.files || []));
        }, 1200);
      };

      input.addEventListener('change', onChange);
      input.addEventListener('cancel', onCancel);
      window.addEventListener('focus', onFocus);
      openedAt = Date.now();
      input.click();
    });
  }

  function addLibraryFile(file) {
    if (!(file instanceof File) && !(file instanceof Blob)) return null;
    const name = file instanceof File ? file.name : (file.name || 'media.bin');
    const safeName = String(name || 'media').replace(/[\\/]/g, '_');
    let path = `${LIBRARY_ROOT}/${safeName}`;
    let n = 1;
    while (library.has(path)) {
      const stem = safeName.replace(/(\.[^.]+)?$/, '');
      const ext = extOf(safeName);
      path = `${LIBRARY_ROOT}/${stem}-${n}${ext}`;
      n += 1;
    }
    if (blobUrls.has(path)) {
      const prev = blobUrls.get(path);
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    }
    const stored = file instanceof File
      ? file
      : new File([file], safeName, { type: file.type || 'application/octet-stream' });
    library.set(path, stored);
    blobUrls.set(path, URL.createObjectURL(stored));
    return path;
  }

  function addRemoteLibraryFile(name, url, size = 0) {
    const safeName = String(name || 'media').replace(/[\\/]/g, '_');
    let path = `${LIBRARY_ROOT}/${safeName}`;
    if (library.has(path)) return path;
    library.set(path, { name: safeName, size: Number(size) || 0, remoteUrl: url });
    blobUrls.set(path, url);
    return path;
  }

  function notifyLibraryChanged() {
    window.dispatchEvent(new CustomEvent('av-library-changed'));
  }

  function addMediaFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => {
      const ext = extOf(f.name);
      return MEDIA_EXTS.has(ext);
    });
    const paths = files.map(addLibraryFile).filter(Boolean);
    if (paths.length) notifyLibraryChanged();
    return paths;
  }

  function probeMediaSrc(src, name) {
    return new Promise((resolve) => {
      const ext = extOf(name);
      const el = document.createElement(AUDIO_EXTS.has(ext) ? 'audio' : 'video');
      el.preload = 'metadata';
      el.muted = true;
      let settled = false;
      const finish = (info) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { el.removeAttribute('src'); el.load(); } catch { /* ignore */ }
        resolve(info);
      };
      const timer = setTimeout(() => {
        finish({
          name,
          extension: ext,
          isVideo: !AUDIO_EXTS.has(ext),
          isAudio: AUDIO_EXTS.has(ext),
        });
      }, 8000);
      el.addEventListener('loadedmetadata', () => {
        finish({
          name,
          size: 0,
          duration: Number.isFinite(el.duration) ? el.duration : null,
          width: el.videoWidth || null,
          height: el.videoHeight || null,
          isVideo: !AUDIO_EXTS.has(ext),
          isAudio: AUDIO_EXTS.has(ext),
          extension: ext,
          containerFormat: (ext.replace('.', '') || '').toUpperCase() || null,
        });
      }, { once: true });
      el.addEventListener('error', () => {
        finish({
          name,
          extension: ext,
          isVideo: !AUDIO_EXTS.has(ext),
          isAudio: AUDIO_EXTS.has(ext),
        });
      }, { once: true });
      el.src = src;
    });
  }

  function probeMediaFile(file) {
    const url = URL.createObjectURL(file);
    return probeMediaSrc(url, file.name).then((info) => {
      URL.revokeObjectURL(url);
      return enrichBasicMeta({ ...info, size: file.size }, file.size);
    });
  }

  function enrichBasicMeta(info, size) {
    const out = { ...info };
    const sz = Number(size || out.size) || 0;
    out.size = sz || out.size || 0;
    if ((!out.bitrate && !out.overallBitrate) && out.duration && sz > 0) {
      out.overallBitrate = Math.round((sz * 8) / out.duration);
      out.bitrate = out.overallBitrate;
    }
    if (!out.containerFormat && out.extension) {
      out.containerFormat = String(out.extension).replace('.', '').toUpperCase();
    }
    return out;
  }

  function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function getTrackCodec(track) {
    if (!track) return null;
    const parts = [track.Format, track.Format_Profile || track.Format_AdditionalFeatures].filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }

  function normalizeMediaInfo(raw, meta) {
    const tracks = raw?.media?.track || [];
    const general = tracks.find((track) => track['@type'] === 'General') || null;
    const video = tracks.find((track) => track['@type'] === 'Video') || null;
    const audioTracks = tracks.filter((track) => track['@type'] === 'Audio');
    const audio = audioTracks[0] || null;
    const ext = meta.extension || extOf(meta.name);

    return {
      name: meta.name,
      path: meta.path || null,
      size: meta.size || 0,
      extension: ext,
      isVideo: !!video || (!audio && !AUDIO_EXTS.has(ext)),
      isAudio: !video && (!!audio || AUDIO_EXTS.has(ext)),
      containerFormat: general?.Format || (ext ? ext.replace('.', '').toUpperCase() : null),
      duration: toFiniteNumber(video?.Duration ?? audio?.Duration ?? general?.Duration),
      width: toFiniteNumber(video?.Width),
      height: toFiniteNumber(video?.Height),
      fps: toFiniteNumber(video?.FrameRate ?? general?.FrameRate),
      sampleRate: toFiniteNumber(audio?.SamplingRate),
      channels: toFiniteNumber(audio?.Channels),
      bitrate: toFiniteNumber(video?.BitRate ?? audio?.BitRate ?? general?.OverallBitRate),
      overallBitrate: toFiniteNumber(general?.OverallBitRate),
      codec: getTrackCodec(video || audio),
      videoCodec: getTrackCodec(video),
      audioCodec: getTrackCodec(audio),
    };
  }

  let mediaInfoFactoryPromise = null;
  function loadMediaInfoFactory() {
    if (!mediaInfoFactoryPromise) {
      const candidates = [
        '/mediainfo/esm-bundle/index.js',
        './mediainfo/esm-bundle/index.js',
      ];
      mediaInfoFactoryPromise = (async () => {
        for (const url of candidates) {
          try {
            const mod = await import(/* webpackIgnore: true */ url);
            return mod.mediaInfoFactory || mod.default || null;
          } catch {
            /* try next */
          }
        }
        console.warn('[AV Editor] mediainfo.js not available; using HTML5 metadata only');
        return null;
      })();
    }
    return mediaInfoFactoryPromise;
  }

  async function analyzeWithMediaInfo(getSize, readChunk, meta) {
    const factory = await loadMediaInfoFactory();
    if (!factory) return null;
    let mediaInfo;
    try {
      mediaInfo = await factory({
        format: 'object',
        locateFile: (wasmFile) => {
          const name = String(wasmFile || 'MediaInfoModule.wasm').split('/').pop();
          return new URL(`/mediainfo/${name}`, window.location.href).href;
        },
      });
      const raw = await mediaInfo.analyzeData(getSize, readChunk);
      return normalizeMediaInfo(raw, meta);
    } catch (err) {
      console.warn('[AV Editor] mediainfo analyze failed:', err?.message || err);
      return null;
    } finally {
      try { mediaInfo?.close(); } catch { /* ignore */ }
    }
  }

  async function readChunkFromUrl(url, size, offset) {
    const abs = toAbsoluteUrl(url);
    const end = offset + size - 1;
    const res = await fetch(abs, {
      headers: { Range: `bytes=${offset}-${end}` },
      cache: 'force-cache',
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Range fetch failed: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  const mediaInfoCache = new Map();

  async function getMediaInfoForEntry(filePath, entry) {
    const name = entryName(entry);
    const ext = extOf(name);
    const size = entrySize(entry);
    const cacheKey = `${filePath}:${size}:${entry.lastModified || entry.remoteUrl || ''}`;
    if (mediaInfoCache.has(cacheKey)) return mediaInfoCache.get(cacheKey);

    const basic = {
      name,
      path: filePath,
      size,
      extension: ext,
      isVideo: !AUDIO_EXTS.has(ext) && MEDIA_EXTS.has(ext),
      isAudio: AUDIO_EXTS.has(ext),
      containerFormat: (ext.replace('.', '') || '').toUpperCase() || null,
      modified: entry instanceof File && entry.lastModified
        ? new Date(entry.lastModified).toISOString()
        : null,
    };

    let rich = null;
    try {
      if (entry instanceof File || entry instanceof Blob) {
        const file = entry instanceof File
          ? entry
          : new File([entry], name, { type: entry.type || mimeOf(name) });
        rich = await analyzeWithMediaInfo(
          () => file.size,
          async (chunkSize, offset) => new Uint8Array(
            await file.slice(offset, offset + chunkSize).arrayBuffer()
          ),
          basic
        );
      } else if (entry.remoteUrl || blobUrls.get(filePath)) {
        const url = entry.remoteUrl || blobUrls.get(filePath);
        const total = size > 0
          ? size
          : Number((await fetch(toAbsoluteUrl(url), { method: 'HEAD' }).then((r) => r.headers.get('content-length'))) || 0);
        if (total > 0) {
          rich = await analyzeWithMediaInfo(
            () => total,
            (chunkSize, offset) => readChunkFromUrl(url, chunkSize, offset),
            { ...basic, size: total }
          );
        }
      }
    } catch (err) {
      console.warn('[AV Editor] rich metadata failed:', err?.message || err);
    }

    if (rich && (rich.duration || rich.width || rich.videoCodec || rich.audioCodec || rich.sampleRate)) {
      const merged = enrichBasicMeta({ ...basic, ...rich }, rich.size || size);
      mediaInfoCache.set(cacheKey, merged);
      return merged;
    }

    // HTML5 element fallback (duration / resolution)
    let html5 = null;
    const src = blobUrls.get(filePath)
      || (entry.remoteUrl ? toAbsoluteUrl(entry.remoteUrl) : null)
      || (entry instanceof File || entry instanceof Blob ? null : null);
    if (src) {
      html5 = await probeMediaSrc(src, name);
    } else if (entry instanceof File || entry instanceof Blob) {
      html5 = await probeMediaFile(entry);
    }

    const merged = enrichBasicMeta({ ...basic, ...(html5 || {}) }, size || html5?.size);
    mediaInfoCache.set(cacheKey, merged);
    return merged;
  }

  async function seedSampleLibrary() {
    try {
      const res = await fetch('./samples/manifest.json', { cache: 'no-store' });
      if (!res.ok) return;
      const names = await res.json();
      if (!Array.isArray(names) || !names.length) return;
      let added = 0;
      for (const name of names) {
        const url = `./samples/${encodeURIComponent(name)}`;
        try {
          const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          if (!head.ok) continue;
          const size = Number(head.headers.get('content-length')) || 0;
          const before = library.size;
          addRemoteLibraryFile(name, url, size);
          if (library.size > before) added += 1;
        } catch {
          /* skip missing sample */
        }
      }
      if (added) notifyLibraryChanged();
    } catch {
      /* no samples available (static host without samples/) */
    }
  }

  let menuCallback = null;
  let exportProgressCallback = null;

  try {
    document.documentElement.classList.add('is-web');
    document.body?.classList.add('is-web');
  } catch { /* ignore */ }

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
        return Array.from(library.entries()).map(([p, entry]) => {
          const name = entryName(entry);
          const ext = extOf(name);
          return {
            name,
            path: p,
            isDirectory: false,
            isMedia: MEDIA_EXTS.has(ext),
            extension: ext,
            size: entrySize(entry),
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
      const entry = library.get(filePath);
      if (!entry) return null;
      return {
        name: entryName(entry),
        path: filePath,
        size: entrySize(entry),
        extension: extOf(entryName(entry)),
        isDirectory: false,
        modified: entry instanceof File && entry.lastModified
          ? new Date(entry.lastModified).toISOString()
          : null,
        created: null,
      };
    },

    getMediaInfo: async (filePath) => {
      const entry = library.get(filePath);
      if (!entry) return null;
      return getMediaInfoForEntry(filePath, entry);
    },

    resolveMediaUrl: async (filePath) => blobUrls.get(filePath) || null,
    /** Sync URL lookup for immediate <video>/<audio> src assignment in the web build. */
    resolveMediaUrlSync: (filePath) => blobUrls.get(filePath) || null,

    /** Add File/Blob media into the session Library and return library paths. */
    addMediaFiles: async (fileList) => addMediaFiles(fileList),

    /**
     * Sync drag payload for web drag-out (DownloadURL / File).
     * @returns {{ name: string, mime: string, url: string|null, file: File|null }|null}
     */
    getMediaDragInfo: (filePath) => {
      const entry = library.get(filePath);
      if (!entry) return null;
      const name = entryName(entry);
      const url = toAbsoluteUrl(blobUrls.get(filePath) || entry.remoteUrl || null);
      return {
        name,
        mime: (entry instanceof File && entry.type) || mimeOf(name),
        url,
        file: entry instanceof File ? entry : null,
      };
    },

    /** Web: no native OS drag; FileTree uses getMediaDragInfo instead. */
    startDrag: () => {},

    /** Remove a media entry from the session Library (does not delete disk files). */
    deleteMediaFile: async (filePath) => {
      if (!filePath || !library.has(filePath)) {
        return { ok: false, error: 'File not found' };
      }
      library.delete(filePath);
      const url = blobUrls.get(filePath);
      if (url && url.startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }
      blobUrls.delete(filePath);
      for (const key of [...mediaInfoCache.keys()]) {
        if (key.startsWith(`${filePath}:`)) mediaInfoCache.delete(key);
      }
      notifyLibraryChanged();
      return { ok: true };
    },

    openFileDialog: async () => {
      const files = await pickFiles({ accept: MEDIA_ACCEPT, multiple: true });
      return addMediaFiles(files);
    },

    openFolderDialog: async () => {
      // Web: pick multiple media files into the library and reveal Library root.
      const files = await pickFiles({ accept: MEDIA_ACCEPT, multiple: true });
      addMediaFiles(files);
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

    // ── Ollama (browser → same-origin /ollama proxy or direct URL) ─────
    ollamaPing: async (baseUrl) => {
      const base = normalizeOllamaBase(baseUrl);
      try {
        const res = await fetch(`${base}/api/tags`);
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const data = await res.json();
        return { ok: true, models: (data.models || []).map((m) => m.name).filter(Boolean) };
      } catch (e) {
        return { ok: false, error: e.message || 'Cannot reach Ollama' };
      }
    },

    ollamaListModels: async (baseUrl) => {
      const base = normalizeOllamaBase(baseUrl);
      try {
        const res = await fetch(`${base}/api/tags`);
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, models: [] };
        const data = await res.json();
        return {
          ok: true,
          models: (data.models || []).map((m) => ({
            name: m.name,
            size: m.size,
            modifiedAt: m.modified_at || null,
          })),
        };
      } catch (e) {
        return { ok: false, error: e.message || 'Cannot list models', models: [] };
      }
    },

    ollamaChat: async (opts = {}) => {
      const base = normalizeOllamaBase(opts.baseUrl);
      const model = String(opts.model || '').trim();
      if (!model) return { ok: false, error: 'Model is required' };
      const images = Array.isArray(opts.images) ? opts.images.filter(Boolean) : [];
      const messages = [];
      const system = String(opts.system || opts.systemPrompt || '').trim();
      if (system) messages.push({ role: 'system', content: system });
      messages.push({
        role: 'user',
        content: String(opts.prompt || 'Describe this scene.'),
        ...(images.length ? { images } : {}),
      });
      try {
        const res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            messages,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
        return { ok: true, content: String(data?.message?.content || data?.response || ''), raw: data };
      } catch (e) {
        return { ok: false, error: e.message || 'Ollama chat failed' };
      }
    },

    saveAnalysisDialog: async (defaultName) => {
      const suggested = defaultName || 'scene-analysis.jsonl';
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: suggested,
            types: [{
              description: 'JSON Lines',
              accept: { 'application/x-ndjson': ['.jsonl'], 'application/json': ['.json'] },
            }],
          });
          const key = `idb-analysis:${Date.now()}:${suggested}`;
          analysisHandles.set(key, handle);
          analysisBuffers.set(key, '');
          return key;
        } catch (e) {
          if (e && e.name === 'AbortError') return null;
        }
      }
      // Memory session + download on completion (works without File System Access API).
      const key = `mem-analysis:${Date.now()}:${suggested}`;
      analysisBuffers.set(key, '');
      return key;
    },

    openAnalysisDialog: async () => {
      if (window.showOpenFilePicker) {
        try {
          const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [{
              description: 'Scene Analysis',
              accept: {
                'application/x-ndjson': ['.jsonl'],
                'application/json': ['.json'],
              },
            }],
          });
          const key = `idb-analysis-open:${Date.now()}`;
          analysisHandles.set(key, handle);
          return key;
        } catch (e) {
          if (e && e.name === 'AbortError') return null;
        }
      }
      const files = await pickFiles({
        accept: '.jsonl,.json,application/json',
        multiple: false,
      });
      if (!files?.length) return null;
      const file = files[0];
      const key = `blob-analysis:${Date.now()}`;
      analysisBuffers.set(key, await file.text());
      return key;
    },

    writeTextFile: async (filePath, content, options = {}) => {
      try {
        const text = content == null ? '' : String(content);
        if (analysisHandles.has(filePath)) {
          const handle = analysisHandles.get(filePath);
          let writable = analysisWritables.get(filePath);
          if (!writable) {
            writable = await handle.createWritable({ keepExistingData: !!options.append });
            analysisWritables.set(filePath, writable);
          }
          await writable.write(text);
          const prev = analysisBuffers.get(filePath) || '';
          analysisBuffers.set(filePath, options.append ? prev + text : text);
          if (!options.append || String(text).includes('"type":"done"') || String(text).includes('"type":"cancelled"')) {
            await writable.close();
            analysisWritables.delete(filePath);
          }
          return { ok: true };
        }
        // Fallback: accumulate then download on done/cancel.
        const prev = analysisBuffers.get(filePath) || '';
        const next = options.append ? prev + text : text;
        analysisBuffers.set(filePath, next);
        if (!options.append || /"type":"(done|cancelled)"/.test(text)) {
          const name = String(filePath).split(':').pop() || 'scene-analysis.jsonl';
          downloadBlob(new Blob([next], { type: 'application/x-ndjson' }), name);
          // Keep buffer so the viewer can open it after analysis.
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    readTextFile: async (filePath) => {
      try {
        if (!filePath) return { ok: false, error: 'No path' };
        if (analysisBuffers.has(filePath)) {
          return { ok: true, text: analysisBuffers.get(filePath) };
        }
        if (analysisHandles.has(filePath)) {
          const handle = analysisHandles.get(filePath);
          const file = await handle.getFile();
          const text = await file.text();
          analysisBuffers.set(filePath, text);
          return { ok: true, text };
        }
        return { ok: false, error: 'File not found' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    /** @private */
    _webLibrary: library,
    /** @private */
    _addLibraryFile: addLibraryFile,
  };

  console.info('[AV Editor] Web API shim active');

  // Seed after FileTree has attached its library listener.
  const startSeed = () => setTimeout(() => { seedSampleLibrary(); }, 120);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSeed, { once: true });
  } else {
    startSeed();
  }
})();
