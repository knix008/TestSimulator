/**
 * The page side of src-tauri. Every call is one of the commands in src-tauri/src/lib.rs.
 * Events are heard on this window only: Rust sends them with `emit_to(label)`, and a global
 * listener would also hear what other windows were sent.
 */
export function hasTauri(scope = globalThis) {
  return typeof scope.__TAURI_INTERNALS__?.invoke === "function";
}

export function createTauriApi(scope = globalThis) {
  const invoke = (command, args = {}) => scope.__TAURI_INTERNALS__.invoke(command, args);
  const on = (event) => (callback) => {
    const current = scope.__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.();
    if (!current) return;
    void current.listen(event, (message) => callback(message.payload));
  };
  const send = (command, args) => {
    invoke(command, args).catch(() => {
      /* fire-and-forget: the window that would answer may be gone */
    });
  };
  return {
    isDesktop: true,
    resizeWindow: (step) => invoke("window_resize", { step }),
    moveWindow: (step) => invoke("window_move", { step }),
    resizeWindowTo: (size) => invoke("window_size", { size }),
    onWindowState: on("window-state"),
    listFonts: () => invoke("list_fonts"),
    fetch: (url, options) => invoke("fetch_url", { url, options: options || null }),
    openFile: (opts) => invoke("open_file", { opts: opts || null }),
    saveFile: (opts) => invoke("save_file", { opts: opts || {} }),
    readFile: (path) => invoke("read_file", { path }),
    writeFile: (path, text) => invoke("write_file", { path, text: text ?? "" }),
    pickImage: (opts) => invoke("pick_image", { opts: opts || null }),
    print: (payload) => invoke("print", { payload }),
    openExternal: (url) => invoke("open_external", { url }),
    windowControl: (action) => invoke("window_control", { action }),
    confirmQuit: () => invoke("confirm_quit"),
    windowBounds: () => invoke("window_bounds"),
    screenInfo: (point) => invoke("screen_info", { point: point || null }),
    readSettings: () => invoke("read_settings"),
    writeSettings: (data, board) => invoke("write_settings", { data, board: board ?? null }),
    setAutoStart: (on) => invoke("set_auto_start", { on: Boolean(on) }),
    getAutoStart: () => invoke("get_auto_start"),
    beginPopup: (spec, place) => invoke("begin_popup", { spec, place: place || null }),
    updatePopup: (id, patch) => invoke("update_popup", { id, patch }),
    waitPopup: (id) => invoke("wait_popup", { id }),
    endPopup: (id) => invoke("end_popup", { id }),
    takePopupSpec: () => invoke("take_popup_spec"),
    finishPopup: (result) => invoke("finish_popup", { result }),
    resizePopup: (size) => invoke("resize_popup", { size }),
    popupImmediate: (message) => send("popup_immediate", { message }),
    broadcastTheme: (payload) => send("broadcast_theme", { payload }),
    broadcastWallpaper: (payload) => send("broadcast_wallpaper", { payload }),
    onApplyTheme: on("apply-theme"),
    onApplyWallpaper: on("apply-wallpaper"),
    onPopupUpdate: on("popup-update"),
    onPopupImmediate: on("popup-immediate"),
    showMenu: (payload) => invoke("show_menu", { payload }),
    onMenuCommand: on("menu-command"),
    takeMenuSpec: () => invoke("take_menu_spec"),
    fitTrayMenu: (size) => invoke("fit_tray_menu", { size }),
    fitMenu: (size) => invoke("fit_menu", { size }),
    menuCommand: (id) => send("menu_command", { id: id ?? "" }),
    onRequestClose: on("request-close"),
    onSettingsChanged: on("settings-changed"),
    onSecondInstance: on("second-instance"),
    windowBoot: () => invoke("window_boot"),
    newWindow: (board) => invoke("new_window", { board: board ?? null }),
    removeWindow: () => invoke("remove_window"),
    clipboardWrite: (text) => invoke("clipboard_write", { text: String(text ?? "") }),
    clipboardRead: () => invoke("clipboard_read"),
    messageBox: (options) => invoke("message_box", { options }),
    takePrintHtml: () => invoke("take_print_html"),
    closeSelf: () => invoke("close_self"),
  };
}
