// The desktop build's window.myarch: the commands of the Tauri host
// (src-tauri/src/lib.rs) in the shape src/ui/platform.js expects. A classic
// script that runs before the modules; in a browser it does nothing, and the
// page falls back to its web code paths.
(function () {
  "use strict";
  const T = window.__TAURI__;
  const boot = window.__MYARCH_BOOT__;
  if (!T || !T.core || !boot) return;
  const invoke = T.core.invoke;
  const listen = T.event.listen;

  const isWindows = boot.platform === "win32";
  const isMac = boot.platform === "darwin";

  const api = {
    isDesktop: true,
    isTauri: true,
    // GUI tests (MYARCH_INLINE_DIALOGS=1) keep the dialogs inside the main window.
    inlineDialogs: !!boot.inlineDialogs,
    platform: boot.platform,
    arch: boot.arch,
    versions: { tauri: boot.tauri, webview: boot.webview },
    getVersion: () => Promise.resolve(boot.version),
    loadSettings: () => invoke("load_settings"),
    saveSettings: (settings) => invoke("save_settings", { settings: settings || {} }),
    openFile: (opts) => invoke("open_file", { opts: opts || {} }),
    readPath: (filePath, opts) => invoke("read_path", { filePath: String(filePath || ""), opts: opts || {} }),
    saveFile: (opts) => invoke("save_file", { opts: opts || {} }),
    writeFile: (filePath, content) => invoke("write_file", { opts: { filePath, content } }),
    print: () => invoke("print_page"),
    // The page's own print window sends the sheets straight to a printer
    // (Windows); elsewhere the system print dialog opens instead.
    listPrinters: () => (isWindows ? invoke("list_printers") : Promise.resolve([])),
    printSheets: (opts) => invoke("print_sheets", { opts: opts || {} }),
    openExternal: (url) => invoke("open_external", { url: String(url || "") }),
    openManual: (lang) => invoke("open_manual", { lang: lang === "en" ? "en" : "ko" }),
    setZoom: (factor) => invoke("set_zoom", { factor: Number(factor) || 1 }),
    listSamples: () => invoke("list_samples"),
    readSample: (file) => invoke("read_sample", { file: String(file || "") }),
    // The page registers once at start-up; that also tells the host the page is
    // up (the window is shown then) and collects files named on the command line.
    onOpenPath: (cb) => {
      listen("open-path", (e) => cb(e.payload)).then(() => invoke("window_ready")).then((paths) => (paths || []).forEach((p) => cb(p)));
    },
    onRequestClose: (cb) => { listen("request-close", () => cb()); },
    confirmClose: (allow) => invoke("confirm_close", { allow: !!allow }),
    closeWindow: () => invoke("request_close"),
    setMinSize: (width, height) => invoke("set_min_size", { width: Number(width) || 0, height: Number(height) || 0 }),
    // Resize grip in the status bar.
    windowSize: () => invoke("window_size"),
    resizeWindow: (width, height) => { invoke("resize_window", { width: Number(width), height: Number(height) }).catch(() => {}); },
    onWindowState: (cb) => { listen("window-state", (e) => cb(e.payload)); },
    setTitleBar: (colors) => invoke("set_title_bar", { colors: colors || {} }),
    // Dialog windows (src/ui/widgets.js openDialogWindow), closed by label.
    closeDialog: (label) => invoke("close_dialog", { label: String(label || "") }),
    moveDialog: (label, x, y) => invoke("move_dialog", { label: String(label || ""), x: Number(x), y: Number(y) }),
    // The page's own window buttons (Windows and Linux; macOS keeps its traffic lights).
    windowControls: !isMac,
    minimize: () => invoke("win_minimize"),
    toggleMaximize: () => invoke("win_toggle_maximize"),
    isMaximized: () => invoke("win_is_maximized"),
    startDragging: (label) => invoke("win_start_dragging", { label: label || null }),
    // Windows moves the window by the title bar's CSS `app-region: drag`; the
    // other webviews need the page to ask.
    nativeDragRegions: isWindows,
    // A dropped file has no path in a webview: it opens by its contents.
    pathForFile: () => "",
  };
  // WebView2 prints the window straight into a PDF; macOS and Linux write the
  // PDF in JavaScript (io/pdfwrite.js) instead.
  if (isWindows) {
    api.printToPDF = (opts) => invoke("print_to_pdf", { opts: opts || {} });
  }
  window.myarch = Object.freeze(api);

  // The webview's own browser menu (Back, Refresh, Save as, Print, Inspect …)
  // has nothing to do in a program: right-click shows MyArchitecture's menus
  // only. Text fields keep it for cut, copy and paste. Dialog windows get the
  // same through blockBrowserMenu (src/ui/widgets.js).
  const blockBrowserMenu = (doc) => doc.addEventListener("contextmenu", (e) => {
    const el = e.target;
    const editable = el && el.closest && el.closest("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable=''], [contenteditable='true']");
    if (!editable) e.preventDefault();
  }, true);
  blockBrowserMenu(document);
  window.myarchBlockBrowserMenu = blockBrowserMenu;
})();
