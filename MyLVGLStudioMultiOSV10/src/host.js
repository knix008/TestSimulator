// Everything that reaches the desktop. In a plain browser (npm run dev:web) settings stay in
// localStorage and the native features report that they need the desktop app.
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { documentDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { FILE_EXTENSION } from "./lvgl/project.js";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const STORE = "mylvglstudio.settings";

function browserSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

const desktopOnly = () => Promise.reject(new Error("desktop app only"));

export const host = {
  loadSettings: () => (isDesktop ? invoke("load_settings") : Promise.resolve(browserSettings())),
  saveSettings: (patch) => {
    if (isDesktop) return invoke("save_settings", { patch });
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...browserSettings(), ...patch }));
    } catch { /* blocked storage: the settings last for this session */ }
    return Promise.resolve();
  },
  ready: () => (isDesktop ? invoke("window_ready") : Promise.resolve()),

  openProjectDialog: () => (isDesktop ? open({ filters: [{ name: "My LVGL Studio", extensions: [FILE_EXTENSION] }] }) : desktopOnly()),
  pickFolder: (defaultPath) => (isDesktop ? open({ directory: true, defaultPath: defaultPath || undefined }) : desktopOnly()),
  defaultLocation: () => (isDesktop ? documentDir() : Promise.resolve("")),
  /** The project file the app was started with (a double-click in the file manager). */
  startupFile: () => (isDesktop ? invoke("startup_file") : Promise.resolve(null)),
  readText: (path) => (isDesktop ? invoke("read_text", { path }) : desktopOnly()),
  /** The application code (src/app) of a project folder: { "src/app/app.c": text, ... }. */
  readAppCode: (dir) => (isDesktop ? invoke("read_app_code", { dir }) : Promise.resolve({})),
  /** The code editor's file operations: only inside src/app of `dir`. */
  appFileWrite: (dir, path, text) => (isDesktop ? invoke("app_file_write", { dir, path, text }) : desktopOnly()),
  appFileDelete: (dir, path) => (isDesktop ? invoke("app_file_delete", { dir, path }) : desktopOnly()),
  appFileRename: (dir, from, to) => (isDesktop ? invoke("app_file_rename", { dir, from, to }) : desktopOnly()),
  appFilesInit: (dir, files) => (isDesktop ? invoke("app_files_init", { dir, files }) : desktopOnly()),
  /** A folder for the application code of a project not saved yet; `from` is copied into it. */
  appDraft: (from = null) => (isDesktop ? invoke("app_draft", { from }) : desktopOnly()),
  dirState: (dir) => (isDesktop ? invoke("dir_state", { dir }) : desktopOnly()),
  /** `userFiles` (the application code in src/app) are written only when they do not exist yet;
   *  `appFrom` is the folder whose src/app a Save As takes along. */
  writeProject: (dir, files, binaries, generatedDirs, userFiles = {}, appFrom = null) => (isDesktop ? invoke("write_project", { dir, files, binaries, generatedDirs, userFiles, appFrom }) : desktopOnly()),
  pickImage: () => (isDesktop ? open({ filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp", "gif", "webp", "svg"] }] }) : desktopOnly()),
  pickFont: () => (isDesktop ? open({ filters: [{ name: "TrueType / OpenType", extensions: ["ttf", "otf", "ttc", "otc"] }] }) : desktopOnly()),
  readBase64: (path) => (isDesktop ? invoke("read_base64", { path }) : desktopOnly()),

  lvglInstalled: () => (isDesktop ? invoke("lvgl_installed") : Promise.resolve([])),
  lvglReleases: () => (isDesktop ? invoke("lvgl_releases") : desktopOnly()),
  lvglInstall: (version, again = false) => (isDesktop ? invoke("lvgl_install", { version, again }) : desktopOnly()),
  lvglItem: (version) => (isDesktop ? invoke("lvgl_item", { version }) : desktopOnly()),
  lvglCancel: () => (isDesktop ? invoke("lvgl_cancel") : Promise.resolve()),
  lvglRemove: (version) => (isDesktop ? invoke("lvgl_remove", { version }) : desktopOnly()),
  /** The lv_conf_template.h of an installed version, as { path, text }; null when not installed. */
  lvglConfTemplate: (version) => (isDesktop ? invoke("lvgl_conf_template", { version }) : Promise.resolve(null)),

  nativeCheck: () => (isDesktop ? invoke("native_check") : Promise.resolve({})),
  toolsPlan: () => (isDesktop ? invoke("tools_plan") : Promise.resolve([])),
  toolsItems: (only = null) => (isDesktop ? invoke("tools_items", { only }) : desktopOnly()),
  toolsInstall: (only = null) => (isDesktop ? invoke("tools_install", { only }) : desktopOnly()),
  nativeClean: (version) => (isDesktop ? invoke("native_clean", { version }) : desktopOnly()),
  samplesList: () => (isDesktop ? invoke("samples_list") : Promise.resolve({ dir: "", items: [] })),
  /** Builds with the application code of `projectDir` (src/app), or `userFiles` where it has none,
   *  and runs the program unless `buildOnly`. */
  nativeRun: (version, files, binaries = {}, userFiles = {}, projectDir = null, buildOnly = false) => (isDesktop ? invoke("native_run", { version, files, binaries, userFiles, projectDir, buildOnly }) : desktopOnly()),
  nativeStop: () => (isDesktop ? invoke("native_stop") : Promise.resolve()),

  runOpen: (payload, width, height) => (isDesktop ? invoke("run_open", { payload, width, height }) : desktopOnly()),
  runPayload: () => invoke("run_payload"),
  runClose: () => (isDesktop ? invoke("run_close") : Promise.resolve()),
  emit: (name, payload) => (isDesktop ? emit(name, payload) : Promise.resolve()),

  /** Subscribes to a backend event; returns the function that unsubscribes. */
  on: (name, handler) => {
    if (!isDesktop) return () => {};
    const pending = listen(name, (event) => handler(event.payload));
    return () => void pending.then((off) => off());
  },

  minimize: () => isDesktop && getCurrentWindow().minimize(),
  toggleMaximize: () => isDesktop && getCurrentWindow().toggleMaximize(),
  close: () => isDesktop && getCurrentWindow().close(),
  // The main window's own close, once the page has dealt with unsaved work.
  closeMain: () => (isDesktop ? invoke("main_close") : Promise.resolve()),
  closeGuardReady: () => (isDesktop ? invoke("close_guard_ready") : Promise.resolve()),
  popoutInline: () => (isDesktop ? invoke("popout_inline") : Promise.resolve(true)),
  popoutReset: () => (isDesktop ? invoke("popout_reset") : Promise.resolve()),
  popoutShow: (options) => invoke("popout_show", { options }),
  popoutDrag: (label) => invoke("popout_drag", { label }),
  // The marker in a window's corner was pressed: the corner follows the mouse.
  popoutResize: (label) => invoke("plugin:window|start_resize_dragging", { label, value: "SouthEast" }),
  popoutMinimize: (label) => invoke("popout_minimize", { label }),
  popoutFocus: (label) => invoke("popout_focus", { label }),
  popoutClose: (label) => invoke("popout_close", { label }),
  startDrag: () => isDesktop && getCurrentWindow().startDragging(),
  startResize: () => isDesktop && getCurrentWindow().startResizeDragging("SouthEast"),
  setMinimumSize: (width, height) => (isDesktop ? invoke("window_min_size", { width, height }) : Promise.resolve()),
};
