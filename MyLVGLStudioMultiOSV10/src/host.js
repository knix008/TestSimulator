// Everything that reaches the desktop. In a plain browser (npm run dev:web) settings stay in
// localStorage and the native features report that they need the desktop app.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
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
  dirState: (dir) => (isDesktop ? invoke("dir_state", { dir }) : desktopOnly()),
  writeProject: (dir, files, generatedDirs) => (isDesktop ? invoke("write_project", { dir, files, generatedDirs }) : desktopOnly()),

  lvglInstalled: () => (isDesktop ? invoke("lvgl_installed") : Promise.resolve([])),
  lvglReleases: () => (isDesktop ? invoke("lvgl_releases") : desktopOnly()),
  lvglInstall: (version) => (isDesktop ? invoke("lvgl_install", { version }) : desktopOnly()),
  lvglRemove: (version) => (isDesktop ? invoke("lvgl_remove", { version }) : desktopOnly()),

  nativeCheck: () => (isDesktop ? invoke("native_check") : Promise.resolve({})),
  nativeRun: (version, files) => (isDesktop ? invoke("native_run", { version, files }) : desktopOnly()),
  nativeStop: () => (isDesktop ? invoke("native_stop") : Promise.resolve()),

  /** Subscribes to a backend event; returns the function that unsubscribes. */
  on: (name, handler) => {
    if (!isDesktop) return () => {};
    const pending = listen(name, (event) => handler(event.payload));
    return () => void pending.then((off) => off());
  },

  minimize: () => isDesktop && getCurrentWindow().minimize(),
  toggleMaximize: () => isDesktop && getCurrentWindow().toggleMaximize(),
  close: () => isDesktop && getCurrentWindow().close(),
  startDrag: () => isDesktop && getCurrentWindow().startDragging(),
  startResize: () => isDesktop && getCurrentWindow().startResizeDragging("SouthEast"),
  setMinWidth: (width, height) => isDesktop && getCurrentWindow().setMinSize(new LogicalSize(width, height)),
};
