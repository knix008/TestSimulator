// Rebuilds the Electron preload's window.desktopAPI on Tauri. Injected into every app page
// (player, spectrum, play list) before the page's own scripts. Every call is the single
// `vp` command with the old IPC channel name (src-tauri/src/lib.rs); events keep the old names.
(() => {
  if (window.desktopAPI) return;
  const VP = window.__VP__ || {};

  const invoke = (channel, ...args) =>
    window.__TAURI_INTERNALS__.invoke("vp", { channel, args });
  const send = (channel, ...args) => {
    invoke(channel, ...args).catch(() => {});
  };

  /** Subscribe to an app event; `ready` runs once the listener is registered. */
  const listen = (name, callback, ready) => {
    let unlisten = null;
    let dead = false;
    window.__TAURI__.event
      .listen(name, (e) => callback(e.payload))
      .then((fn) => {
        if (dead) fn();
        else unlisten = fn;
        ready?.();
      });
    return () => {
      dead = true;
      unlisten?.();
    };
  };

  // Settings must be readable synchronously while modules load (settings.js, recent.js).
  let persist = {};
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", VP.persistPath, false);
    xhr.send();
    if (xhr.status === 200) persist = JSON.parse(xhr.responseText) || {};
  } catch {
    /* start empty; persist.js falls back to localStorage */
  }
  const persistListen = () =>
    listen("persist:changed", (p) => {
      if (!p || typeof p.key !== "string") return;
      if (p.value == null) delete persist[p.key];
      else persist[p.key] = String(p.value);
    });
  if (window.__TAURI__?.event) persistListen();
  else document.addEventListener("DOMContentLoaded", persistListen, { once: true });

  /** Message listeners for a child window also receive the payload it was opened with. */
  const withInit = (name) => (callback) =>
    listen(name, callback, () => {
      invoke("init:take").then((payload) => {
        if (payload) callback(payload);
      });
    });

  // An element going full screen (video) takes the whole window full screen with it —
  // WebView2 alone only fills the window.
  document.addEventListener("fullscreenchange", () => {
    send("window:setFullscreen", Boolean(document.fullscreenElement));
  });

  // window.close() is ignored for windows a script didn't open; close this window for real.
  window.close = () => send("window:closeSelf");

  window.desktopAPI = {
    isElectron: true,
    isTauri: true,
    getAppInfo: () => invoke("app:getInfo"),
    minimize: () => invoke("window:minimize"),
    maximizeToggle: () => invoke("window:maximizeToggle"),
    close: () => invoke("window:close"),
    isMaximized: () => invoke("window:isMaximized"),
    setMinimumSize: (width, height) => invoke("window:setMinimumSize", width, height),
    getBounds: () => invoke("window:getBounds"),
    setBounds: (bounds) => invoke("window:setBounds", bounds),
    setWindowOpacity: (opacity) => invoke("window:setOpacity", opacity),
    getWindowOpacity: () => invoke("window:getOpacity"),
    setSpectrumOpacity: (opacity) => invoke("spectrum:setOpacity", opacity),
    getSpectrumOpacity: () => invoke("spectrum:getOpacity"),
    beginWindowDrag: () => send("window:beginDrag"),
    updateWindowDrag: (screenX, screenY) => send("window:updateDrag", screenX, screenY),
    endWindowDrag: () => send("window:endDrag"),
    openMedia: () => invoke("dialog:openMedia"),
    openMediaPath: (filePath) => invoke("media:openPath", filePath),
    makeMediaCompatible: (filePath, options) =>
      invoke("media:makeCompatible", filePath, options || {}),
    onMediaCompatProgress: (callback) => listen("media:compatProgress", callback),
    openSubtitle: () => invoke("dialog:openSubtitle"),
    findSubtitle: (mediaPath) => invoke("fs:findSubtitle", mediaPath),
    /** clip.srt, clip.ko.srt, clip.en.srt … with their text. */
    listSubtitles: (mediaPath) => invoke("fs:listSubtitles", mediaPath),
    // Dropped files arrive as paths through onOpenMediaPaths instead.
    getPathForFile: () => "",
    openExternal: (url) => invoke("shell:openExternal", url),
    getSystemTheme: () => invoke("theme:getSystem"),
    setThemeSource: (source) => invoke("theme:setSource", source),
    parseYouTube: (input) => invoke("youtube:parse", input),
    getYouTubeInfo: (input) => invoke("youtube:info", input),
    downloadYouTube: (payload) => invoke("youtube:download", payload),
    cancelYouTubeDownload: (options) =>
      invoke("youtube:cancelDownload", options || { discard: true }),
    stopYouTubeDownload: (options) =>
      invoke("youtube:cancelDownload", options || { discard: false }),
    isSupportedRemoteUrl: (input) => invoke("remote:isSupportedUrl", input),
    getRemoteVideoInfo: (input) => invoke("remote:info", input),
    openRemoteVideo: (payload) => invoke("remote:open", payload || {}),
    downloadRemoteVideo: (payload) => invoke("remote:download", payload || {}),
    cancelRemoteDownload: (options) =>
      invoke("remote:cancelDownload", options || { discard: true }),
    openRtsp: (input) => invoke("rtsp:open", input),
    stopRtsp: () => invoke("rtsp:stop"),
    getActiveRtsp: () => invoke("rtsp:getActive"),
    isRtspUrl: (input) => invoke("rtsp:isUrl", input),
    startRtspRecord: (payload) => invoke("rtsp:startRecord", payload || {}),
    stopRtspRecord: (options) => invoke("rtsp:stopRecord", options || {}),
    getRtspRecording: () => invoke("rtsp:getRecording"),
    onRtspRecordProgress: (callback) => listen("rtsp:recordProgress", callback),
    /** Durable key/value store in the app data folder (survives the random UI port). */
    persistGetItem: (key) => (Object.hasOwn(persist, key) ? persist[key] : null),
    persistSetItem: (key, value) => {
      persist[key] = String(value);
      send("persist:setItem", key, String(value));
      return true;
    },
    persistRemoveItem: (key) => {
      delete persist[key];
      send("persist:removeItem", key);
      return true;
    },
    openSpectrumWindow: (initPayload) => invoke("spectrum:open", initPayload || {}),
    closeSpectrumWindow: () => invoke("spectrum:close"),
    focusSpectrumWindow: () => invoke("spectrum:focus"),
    sendSpectrumMessage: (message) => send("spectrum:toWindow", message),
    sendSpectrumHostMessage: (message) => send("spectrum:toHost", message),
    onSpectrumMessage: withInit("spectrum:message"),
    onSpectrumWindowEvent: (callback) => listen("spectrum:hostEvent", callback),
    openHistoryWindow: (initPayload) => invoke("history:open", initPayload || {}),
    closeHistoryWindow: () => invoke("history:close"),
    focusHistoryWindow: () => invoke("history:focus"),
    sendHistoryMessage: (message) => send("history:toWindow", message),
    sendHistoryHostMessage: (message) => send("history:toHost", message),
    onHistoryMessage: withInit("history:message"),
    onHistoryWindowEvent: (callback) => listen("history:hostEvent", callback),
    onYouTubeDownloadProgress: (callback) => listen("youtube:downloadProgress", callback),
    onRemoteDownloadProgress: (callback) => listen("remote:downloadProgress", callback),
    /** Subtitles arrived for a file that is already playing ({ path, count }). */
    onSubtitlesReady: (callback) => listen("media:subtitlesReady", callback),
    onWindowState: (callback) => listen("window:state", callback),
    /** Files from the command line, a second launch, or dropped on the window. */
    onOpenMediaPaths: (callback) =>
      listen("app:openMediaPaths", callback, () => {
        invoke("open:takePending").then((paths) => {
          if (Array.isArray(paths) && paths.length) callback(paths);
        });
      }),
  };
})();
