// window.ttsBridge for the Tauri build — the same API the Electron preload exposed, so
// main.js and ui/shell.js are unchanged. The program injects this file before the page runs
// (src-tauri/src/lib.rs, initialization_script).
//
// Calls go to one command, `tts`, named by the Electron IPC channel; the program answers
// window / dialog / clipboard channels itself and passes the rest to the Node host
// (src/host/host.mjs). Events arrive as `tts:event` { ch, p }.
//
// Audio crosses as base64 Float32 PCM: as a JSON number array a minute of speech is tens of
// megabytes and long clips could exhaust the page.
(function () {
  'use strict';
  const internals = () => window.__TAURI_INTERNALS__;
  if (!internals() || window.ttsBridge) return;

  const invoke = (ch, a) => internals().invoke('tts', { ch, a: a === undefined ? null : a });

  // ── events ──
  const listeners = new Map();
  let listening = null;
  function startListening() {
    if (listening) return listening;
    const handler = internals().transformCallback((event) => {
      const msg = event && event.payload;
      const set = msg && listeners.get(msg.ch);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(msg.p); } catch (err) { console.error(err); }
      }
    });
    listening = internals().invoke('plugin:event|listen', { event: 'tts:event', target: { kind: 'Any' }, handler });
    return listening;
  }
  const on = (ch, cb) => {
    if (!listeners.has(ch)) listeners.set(ch, new Set());
    listeners.get(ch).add(cb);
    startListening();
    return () => listeners.get(ch)?.delete(cb);
  };

  // ── audio ──
  function encodeAudio(samples) {
    const f32 = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
    const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }
  function decodeAudio(base64) {
    const text = atob(base64 || '');
    const bytes = new Uint8Array(text.length - (text.length % 4));
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = text.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  }
  const withAudio = (payload) => {
    const { audioBuffer, ...rest } = payload || {};
    return { ...rest, audioBase64: encodeAudio(audioBuffer) };
  };

  window.ttsBridge = Object.freeze({
    getModelCatalog: () => invoke('app:getModelCatalog'),
    getCachedModels: () => invoke('app:getCachedModels'),
    getCacheDirectory: () => invoke('app:getCacheDirectory'),
    selectAudioPath: (payload) => invoke('app:selectAudioPath', payload),
    selectWavPath: () => invoke('app:selectWavPath'),
    selectMp3Path: () => invoke('app:selectMp3Path'),
    downloadAndPrepareModel: (modelId) => invoke('app:downloadAndPrepareModel', modelId),
    speak: async (payload) => {
      const { audioBase64, sampleCount, ...rest } = await invoke('app:speak', payload);
      return { ...rest, audioBuffer: decodeAudio(audioBase64) };
    },
    warmModel: (modelId) => invoke('app:warmModel', modelId),
    listModelVoices: (modelId) => invoke('app:listModelVoices', modelId),
    exportWav: (payload) => invoke('app:exportWav', withAudio(payload)),
    exportMp3: (payload) => invoke('app:exportMp3', withAudio(payload)),
    deleteModel: (modelId) => invoke('app:deleteModel', modelId),
    openTextFile: () => invoke('app:openTextFile'),
    readTextFile: (filePath) => invoke('app:readTextFile', filePath),
    windowControl: (action) => invoke('win:control', action),
    windowState: () => invoke('win:state'),
    onWindowState: (callback) => on('win:stateChanged', callback),
    copyText: (text) => invoke('app:copyText', String(text ?? '')),
    readClipboard: () => invoke('app:readClipboard'),
    openGuide: (options) => invoke('app:openGuide', options || {}),
    reportRendererError: (payload) => invoke('app:reportRendererError', payload),
    onModelDownloadProgress: (callback) => on('app:modelDownloadProgress', callback),
    onAppError: (callback) => on('app:error', callback),
    onRedownloadModel: (callback) => {
      const off = on('app:redownloadModel', callback);
      // The host may have recovered from a crash before this page listened.
      startListening().then(() => invoke('app:takeRedownload')).then((id) => { if (id) callback(id); }).catch(() => {});
      return off;
    },
  });

  // ── window ──
  // The window is created hidden; show it once the page has drawn (no white flash).
  window.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(() => requestAnimationFrame(() => invoke('app:ready').catch(() => {})));
  });
  // F12: the inspector, as in the Electron build.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F12') { event.preventDefault(); invoke('win:devtools').catch(() => {}); }
  });
  // Windows moves the frameless window by the CSS app-region; macOS / Linux need a drag call.
  if (!/Windows/i.test(navigator.userAgent)) {
    window.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || !event.target.closest?.('.menubar-drag, .app-brand')) return;
      if (event.detail === 2) invoke('win:control', 'toggleMaximize').catch(() => {});
      else invoke('win:startDragging').catch(() => {});
    });
  }
})();
