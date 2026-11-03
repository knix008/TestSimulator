/* The desktop bridge. In the Tauri build this defines `window.desktop` (every window) and
 * `window.popupHost` (the menu and popup windows) on top of the host's commands in
 * src-tauri/src/lib.rs, with the same names and meaning electron/preload.js had, so
 * src/app.js runs unchanged. In a browser — the web build and the test page — there is no
 * window.__TAURI__ and this file does nothing. */
(function () {
  "use strict";
  var T = window.__TAURI__;
  if (!T || !T.core || !T.webviewWindow) return;

  var current = T.webviewWindow.getCurrentWebviewWindow();
  var label = current.label;
  var isChild = label === "menu" || label === "popup";

  function asError(error) {
    if (error instanceof Error) return error;
    if (error && typeof error === "object" && error.message) return new Error(String(error.message));
    return new Error(String(error));
  }

  function call(command, args) {
    return T.core.invoke(command, args || {}).catch(function (error) { throw asError(error); });
  }

  /* Events sent to this window only (a plain listen() would also hear the other windows'). */
  function on(event, callback) {
    return current.listen(event, function (message) { callback(message.payload); });
  }

  /* ── title bars ──
   * The page marks its title bar with -webkit-app-region: drag, which only Electron reads.
   * A press there moves the window and a double press maximizes it, as a title bar does;
   * buttons and fields inside it (-webkit-app-region: no-drag) keep working. */
  var INTERACTIVE = "button, input, select, textarea, a[href], label, [contenteditable=''], [contenteditable='true'], [data-window], [data-menu]";
  var FALLBACK_DRAG = ".menubar, .popup header";

  function regionOf(target) {
    for (var node = target; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hasAttribute("data-tauri-drag-region")) return "drag";
      var style = window.getComputedStyle(node);
      var value = style.getPropertyValue("app-region") || style.getPropertyValue("-webkit-app-region") || style.webkitAppRegion || style.appRegion || "";
      if (value === "drag" || value === "no-drag") return value;
    }
    return "";
  }

  function wantsDrag(target) {
    if (!target || target.nodeType !== 1 || target.closest(INTERACTIVE)) return false;
    var region = regionOf(target);
    if (region) return region === "drag";
    return Boolean(target.closest(FALLBACK_DRAG));
  }

  document.addEventListener("mousedown", function (event) {
    if (event.button !== 0 || event.defaultPrevented || !wantsDrag(event.target)) return;
    event.preventDefault();
    if (event.detail === 2) {
      if (!isChild) call("window_command", { name: "maximize" });
      return;
    }
    call("window_drag");
  });

  /* The browser's own context menu (Back, Reload, Inspect) never appears; MyPaint draws its
   * own where it has one. */
  document.addEventListener("contextmenu", function (event) { event.preventDefault(); });

  function printFrame() {
    var frame = document.getElementById("printFrame");
    var target = frame && frame.contentWindow ? frame.contentWindow : window;
    target.focus();
    target.print();
  }

  function hookLaunch(callback) {
    var deliver = function () {
      return call("take_launches").then(function (items) {
        (items || []).forEach(function (item) { callback(item); });
      });
    };
    on("launch", function () { deliver(); }).then(deliver);
  }

  window.desktop = Object.freeze({
    platform: "tauri",
    windowCommand: function (name) { return call("window_command", { name: String(name) }); },
    resizeWindow: function (width, height) { return call("resize_window", { width: Number(width) || 0, height: Number(height) || 0 }); },
    pickFiles: function (dir, filters) { return call("pick_files", { dir: dir || null, filters: filters || null }); },
    pickSave: function (filePath, filters) { return call("pick_save", { path: filePath || null, filters: filters || null }); },
    pickDirectory: function (dir) { return call("pick_directory", { dir: dir || null }); },
    writeFile: function (file, text) { return call("write_file", { file: file, text: String(text == null ? "" : text) }); },
    writeBinary: function (file, base64) { return call("write_binary", { file: file, base64: String(base64 || "") }); },
    clipboardWriteImage: function (dataUrl) { return call("clipboard_write_image", { dataUrl: String(dataUrl || "") }); },
    clipboardReadImage: function () { return call("clipboard_read_image"); },
    downloadUrl: function (url) { return call("download_url", { url: String(url || "") }); },
    cancelDownload: function () { return call("cancel_download"); },
    readFile: function (file) { return call("read_file", { file: file }); },
    readBinary: function (file) { return call("read_binary", { file: file }); },
    /* A file dropped from the file manager arrives as an HTML5 File without its path;
     * app.js then reads the File itself. */
    pathForFile: function () { return ""; },
    listFonts: function () { return call("list_fonts"); },
    openExternal: function (url) { return call("open_external", { url: String(url || "") }); },
    print: function () {
      try { printFrame(); } catch (error) { return Promise.reject(asError(error)); }
      return Promise.resolve();
    },
    openMenu: function (payload) { return call("open_menu", { payload: payload || {} }); },
    openPopup: function (payload) { return call("open_popup", { payload: payload || {} }); },
    closePopup: function () { return call("close_popup"); },
    refreshPopup: function (html) { return call("refresh_popup", { html: String(html || "") }); },
    applyTheme: function (css) { return call("apply_theme", { css: String(css || "") }); },
    openWindow: function (options) { return call("open_window", { options: options || {} }); },
    forceClose: function (code) { return call("force_close", { code: Number(code) || 0 }); },
    onCloseRequest: function (callback) {
      on("request-close", function () { callback(); }).then(function () { return call("close_hooked"); });
    },
    onHostAction: function (callback) { on("popup-action", callback); },
    onLaunch: hookLaunch,
    onDownloadProgress: function (callback) { on("download-progress", callback); },
  });

  if (!isChild) return;

  /* ── the menu and popup windows ──
   * The host sends each opening's HTML with a sequence number and shows the window once
   * the page says that opening is drawn, so a reused window never shows the last menu. */
  var htmlCallbacks = [];
  var applied = { seq: -1, html: null };
  var listening = null;

  function showHtml(message) {
    if (!message || typeof message.html !== "string") return;
    if (message.seq === applied.seq && message.html === applied.html) return;
    applied = { seq: message.seq, html: message.html };
    htmlCallbacks.forEach(function (callback) { callback(message.html); });
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { call("child_rendered", { seq: message.seq }); });
    });
  }

  window.popupHost = Object.freeze({
    onHtml: function (callback) {
      htmlCallbacks.push(callback);
      if (!listening) {
        listening = on("popup-html", showHtml).then(function () { return call("child_pull"); }).then(showHtml);
      } else if (applied.html !== null) {
        callback(applied.html);
      }
    },
    onTheme: function (callback) { on("popup-theme", callback); },
    action: function (name, detail) { return call("popup_action", { payload: { name: name, detail: detail || {} } }); },
  });
})();
