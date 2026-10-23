// The desktop build's window.mycircuit: the commands of the Tauri host
// (src-tauri/src/lib.rs) in the shape src/ui/platform.js expects. A classic
// script that runs before the modules; in a browser it does nothing, and the
// page falls back to its web code paths.
(function () {
  "use strict";
  const T = window.__TAURI__;
  const boot = window.__MYCIRCUIT_BOOT__;
  if (!T || !T.core || !boot) return;
  const invoke = T.core.invoke;
  const listen = T.event.listen;

  // Smoke tests set MYCIRCUIT_INLINE_DIALOGS=1 so dialogs stay in the main
  // page, where the test can see them. Real sessions open each dialog as its
  // own window.
  window.mycircuitInlineDialogs = !!boot.inlineDialogs;

  const isWindows = boot.platform === "win32";
  const isMac = boot.platform === "darwin";

  const api = {
    isDesktop: true,
    isTauri: true,
    platform: boot.platform,
    arch: boot.arch,
    versions: { tauri: boot.tauri, webview: boot.webview },
    getVersion: () => Promise.resolve(boot.version),
    loadSettings: () => invoke("load_settings"),
    saveSettings: (settings) => invoke("save_settings", { settings: settings || {} }),
    openFile: (opts) => invoke("open_file", { opts: opts || {} }),
    readPath: (filePath) => invoke("read_path", { filePath: String(filePath || "") }),
    saveFile: (opts) => invoke("save_file", { opts: opts || {} }),
    writeFile: (filePath, content) => invoke("write_file", { opts: { filePath, content } }),
    print: () => invoke("print_page"),
    openExternal: (url) => invoke("open_external", { url: String(url || "") }),
    // The window starts in the theme's background, which the manual then takes over.
    openManual: (lang) => invoke("open_manual", { lang: lang === "en" ? "en" : "ko", background: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || null }),
    // A dialog window passes its label: its own webview is zoomed, not this one.
    setZoom: (factor, label) => invoke("set_zoom", { factor: Number(factor) || 1, label: label || null }),
    // The page registers once at start-up; that also tells the host the page is
    // up (the window is shown then) and collects files named on the command line.
    onOpenPath: (cb) => {
      listen("open-path", (e) => cb(e.payload)).then(() => invoke("window_ready")).then((paths) => (paths || []).forEach((p) => cb(p)));
    },
    onRequestClose: (cb) => { listen("request-close", () => cb()); },
    confirmClose: (allow) => invoke("confirm_close", { allow: !!allow }),
    closeWindow: () => invoke("request_close"),
    setMinSize: (width, height) => invoke("set_min_size", { width: Number(width) || 0, height: Number(height) || 0 }),
    setTitleBar: (colors) => invoke("set_title_bar", { colors: colors || {} }),
    // Dialog windows (see hostDialog in src/ui/widgets.js).
    fitDialog: (label, width, height) => invoke("fit_dialog", { label, width, height }),
    closeDialog: (label) => invoke("close_dialog", { label }),
    // The page's own window buttons (Windows and Linux; macOS keeps its traffic lights).
    windowControls: !isMac,
    minimize: () => invoke("win_minimize"),
    toggleMaximize: () => invoke("win_toggle_maximize"),
    isMaximized: () => invoke("win_is_maximized"),
    startDragging: (label) => invoke("win_start_dragging", { label: label || null }),
    // Windows moves the window by the title bar's CSS `app-region: drag`; the
    // other webviews need the page to ask.
    nativeDragRegions: isWindows,
  };
  // WebView2 prints the window straight into a PDF; macOS and Linux only print.
  if (isWindows) {
    api.printToPDF = (opts) => invoke("print_to_pdf", { opts: opts || {} });
  }
  window.mycircuit = Object.freeze(api);
})();
