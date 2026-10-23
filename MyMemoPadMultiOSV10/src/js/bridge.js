'use strict';

/**
 * The renderer's only way out — window.desktopAPI.
 *
 * Same shape as the Electron build's preload.js, so the renderer code stayed as it was. Every
 * call is a #[tauri::command] in src-tauri/src/lib.rs, and each on* listens to an event that
 * lib.rs post() sends to this window only.
 *
 * Events posted before this window listened are queued by the main side and handed over when
 * listening starts (bridge_listen), so a slow page never misses its first pad:load.
 *
 * In a plain browser (npm run web) there is no Tauri and desktopAPI stays undefined.
 */
(function installBridge() {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals || typeof internals.invoke !== 'function') return;

  const invoke = (command, args = {}) => internals.invoke(command, args);
  /** A call nobody waits for — quiet if the window is already gone. */
  const send = (command, args = {}) => {
    invoke(command, args).catch(() => {});
  };
  /** Listens to an event sent to this window; returns an unsubscribe function. */
  const on = (event) => (callback) => {
    let unlisten = null;
    let stopped = false;
    window.__TAURI__.webviewWindow
      .getCurrentWebviewWindow()
      .listen(event, (message) => callback(message.payload))
      .then((fn) => {
        unlisten = fn;
        if (stopped) fn();
        return invoke('bridge_listen', { event });
      })
      .then((queued) => {
        if (stopped) return;
        for (const payload of queued || []) callback(payload);
      })
      .catch(() => {});
    return () => {
      stopped = true;
      unlisten?.();
    };
  };

  window.desktopAPI = {
    isDesktop: true,
    /** The page finished booting — the main side sends the first payload and shows the window. */
    windowReady: () => send('window_ready'),
    getAppInfo: () => invoke('app_get_info'),
    quitApp: () => invoke('app_quit'),
    copyText: (text) => invoke('clipboard_write_text', { text: String(text ?? '') }),
    readText: () => invoke('clipboard_read_text'),

    getAutoStart: () => invoke('autostart_get'),
    setAutoStart: (enabled) => invoke('autostart_set', { enabled: Boolean(enabled) }),

    minimize: () => invoke('window_minimize'),
    close: () => invoke('window_close'),
    fitSettingsWindow: (height) => send('window_fit_settings', { height: Number(height) || 0 }),
    setWindowOpacity: (opacity) => invoke('window_set_opacity', { opacity: Number(opacity) }),
    /** The OS moves the window while the button is held (Aero snap included). */
    beginWindowDrag: () => send('window_start_drag'),
    updateWindowDrag: () => {},
    endWindowDrag: () => {},

    getMemos: () => invoke('memos_get'),
    saveMemos: (items) => invoke('memos_save', { items: Array.isArray(items) ? items : [] }),
    getSettings: () => invoke('settings_get'),
    saveSettings: (data) => invoke('settings_save', { data: data || {} }),
    getLook: (index) => invoke('look_get', { index: Math.trunc(Number(index)) }),
    setLook: (index, look) => invoke('look_set', { index: Math.trunc(Number(index)), look: look || {} }),
    removeLook: (index) => invoke('look_remove', { index: Math.trunc(Number(index)) }),

    openNewMemo: () => invoke('pad_open_new'),
    openMemoIndex: (index) => invoke('pad_open_index', { index: Math.trunc(Number(index)) }),
    openTextFile: () => invoke('pad_open_file'),
    showList: () => invoke('list_show'),
    openSettings: (context) => invoke('settings_open', { context: context || {} }),
    getSettingsContext: () => invoke('settings_get_context'),
    sendSettingsCommand: (cmd) => send('settings_command', { cmd }),
    onSettingsLoad: on('settings:load'),
    onSettingsCommand: on('settings:command'),
    hidePad: () => invoke('pad_hide'),
    closePad: () => invoke('window_close'),
    notifyPadState: (state) => send('pad_state', { state: state || {} }),
    previewColor: (color) => send('preview_color', { color }),

    onPadLoad: on('pad:load'),
    onMemosChanged: on('memos:changed'),
    onSettingsChanged: on('settings:changed'),
    onPreviewColor: on('settings:previewColor'),
    onRestoreLooks: on('settings:restoreLooks'),
    onLanguageChanged: on('settings:language')
  };
})();
