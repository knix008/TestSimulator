// Runs in the page before its own scripts. `window.desktop` is how the renderer tells it is inside
// the desktop app; the web version has no such object.
(() => {
  if (location.hostname !== '127.0.0.1') return;

  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);

  window.desktop = {
    getOpenFile: () => invoke('take_open_file'),
    saveKprj: (defaultName, jsonContent) => invoke('save_kprj', { defaultName, jsonContent }),
    saveReportFile: (defaultName, base64Content, mime) => invoke('save_report', { defaultName, base64Content, mime }),
    openKprjDialog: (startDir) => invoke('open_kprj_dialog', { startDir: startDir || null }),
    openSqliteDialog: () => invoke('open_sqlite_dialog'),
    openAttachment: (filename) => invoke('open_attachment', { filename }),
    onOpenKprj: (callback) => window.__TAURI__.event.listen('open-kprj', (event) => callback(event.payload)),
    startResize: () => invoke('start_resize'),
    isMaximized: () => invoke('is_maximized'),
  };

  // WebView2 would offer the browser's own menu (Back, Reload, Save as...). The app draws its own,
  // and text fields keep cut/copy/paste.
  window.addEventListener('contextmenu', (event) => {
    if (!event.target.closest?.('input, textarea, [contenteditable="true"]')) event.preventDefault();
  });

  // The browser's shortcuts mean nothing in this app: print, find, history, downloads, reload...
  // (Ctrl+S, Ctrl+Z, Ctrl+Y and F5 are the app's own, in js/app.js.)
  const BROWSER_KEYS = new Set(['d', 'e', 'f', 'g', 'h', 'j', 'k', 'l', 'n', 'o', 'p', 'r', 't', 'u', 'w']);
  window.addEventListener('keydown', (event) => {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key?.toLowerCase();
    if ((ctrl && !event.altKey && BROWSER_KEYS.has(key)) || event.key === 'F3' || event.key === 'F7') {
      event.preventDefault();
    }
  }, true);
})();
