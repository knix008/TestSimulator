/**
 * The desktop bridge: `window.mcm` on top of the Tauri shell (src-tauri/).
 *
 * Every window — the app, the menu popup, each dialog — loads the same bundle from the
 * core's own server, so this module runs in all of them and installs the same surface
 * the renderer has always called. Everything that is not a window or OS matter still
 * goes over HTTP to that server, exactly as in the browser build.
 *
 * Imported first by main.tsx; in a browser tab (no Tauri) it does nothing.
 */
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { dialogSpec } from "./dialogSpecs.js";
import type { McmBridge } from "./global.js";

type Internals = { __TAURI_INTERNALS__?: unknown };

export function inTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as Internals).__TAURI_INTERNALS__);
}

function platform(): NodeJS.Platform {
  const agent = navigator.userAgent;
  if (/Windows/i.test(agent)) return "win32";
  if (/Mac OS X|Macintosh/i.test(agent)) return "darwin";
  return "linux";
}

/**
 * Window-scoped listening: an event emitted to one window must not reach the others
 * (global `listen` hears every target).
 */
function on<T>(event: string) {
  return (listener: (payload: T) => void): (() => void) => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    getCurrentWebviewWindow()
      .listen<T>(event, (message) => listener(message.payload))
      .then((off) => {
        if (cancelled) off();
        else unlisten = off;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  };
}

function createBridge(): McmBridge {
  return {
    desktop: true,
    platform: platform(),

    info: () => invoke("app_info"),
    quit: () => invoke("app_quit"),

    setTitle: (title) => invoke("window_title", { title: String(title || "") }),
    setMinimumSize: (width, height) => invoke("window_min_size", { width, height }),
    setBackgroundColor: (color) => invoke("window_background", { color }),
    minimizeWindow: () => invoke("window_minimize"),
    resizeWindowTo: (width, height) => invoke("window_resize_to", { width, height }),
    toggleMaximizeWindow: () => invoke("window_toggle_maximize"),
    isMaximized: () => invoke("window_is_maximized"),
    onWindowState: on<{ maximized: boolean }>("window:state"),
    setNativeTheme: (kind) => invoke("window_native_theme", { kind }),
    resetZoom: () => {
      invoke("window_reset_zoom").catch(() => {});
    },

    pickFile: (options) => invoke("pick_file", { options: options ?? {} }),
    pickDirectory: (options) => invoke("pick_directory", { options: options ?? {} }),
    pickSave: (options) => invoke("pick_save", { options: options ?? {} }),

    copyText: (value) => invoke("clipboard_write", { value: String(value ?? "") }),
    readText: () => invoke("clipboard_read"),
    openExternal: (target) => invoke("shell_open", { target: String(target ?? "") }),
    revealInFolder: (target) => invoke("shell_reveal", { target: String(target ?? "") }),

    mergeSaved: () => invoke("merge_saved"),
    print: () => invoke("print_window"),

    openMenu: (payload, anchor) => invoke("menu_open", { payload, anchor }),
    closeMenu: () => invoke("menu_close"),
    menuPayload: () => invoke("menu_payload"),
    menuSize: (size) => invoke("menu_size", { width: size.width, height: size.height }),
    chooseMenu: (commandId) => invoke("menu_choose", { commandId }),
    onMenuPayload: on<unknown>("menu:payload"),
    onMenuChosen: on<string>("menu:chosen"),

    openDialog: (name, payload) => invoke("dialog_open", { name, payload: payload ?? null, spec: dialogSpec(name) }),
    dialogPayload: () => invoke("dialog_payload"),
    dialogResult: (name, result) => invoke("dialog_result", { name, result: result ?? null }),
    closeDialog: (name) => invoke("dialog_close", { name: name ?? null }),
    closeAllDialogs: () => invoke("dialog_close_all"),
    dialogSize: (size) => invoke("dialog_size", { width: size.width, height: size.height }),
    onDialogPayload: on<unknown>("dialog:payload"),
    onDialogResult: on<{ name: string; result: unknown }>("dialog:result"),
    onDialogClosed: on<string>("dialog:closed"),

    broadcastSettings: (settings) => invoke("settings_broadcast", { settings }),
    onSettingsChanged: on<unknown>("settings:changed"),
    onOpenRequest: on<string[]>("app:open-request"),
    onFileDrop: (listener) => {
      // A browser drop carries no paths; the OS drop Tauri reports does.
      let unlisten: UnlistenFn | null = null;
      let cancelled = false;
      getCurrentWebview()
        .onDragDropEvent(({ payload }) => {
          if (payload.type === "drop") listener({ type: "drop", paths: payload.paths });
          else if (payload.type === "leave") listener({ type: "leave", paths: [] });
          else listener({ type: "over", paths: payload.type === "enter" ? payload.paths : [] });
        })
        .then((off) => {
          if (cancelled) off();
          else unlisten = off;
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        if (unlisten) unlisten();
      };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Window chrome
 * ------------------------------------------------------------------ */

// The stylesheet marks the title rows with `-webkit-app-region: drag`, which a native
// frame reads but a Tauri webview does not. The same rule is applied here: a press on a
// drag row that is not on one of its controls moves the window.
const DRAG_ROWS = ".menubar, .dialog-title, [data-drag-region]";
const NOT_DRAG = [
  "button", "input", "select", "textarea", "a", "label", "[role=button]", "[role=menuitem]",
  ".menubar-item", ".window-controls", ".icon-button", ".resize-grip", "[data-no-drag]",
].join(", ");

function installDragRegions(isMain: boolean): void {
  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    if (!target || !target.closest(DRAG_ROWS) || target.closest(NOT_DRAG)) return;
    if (event.detail === 2) {
      if (isMain) invoke("window_toggle_maximize").catch(() => {});
      return;
    }
    event.preventDefault();
    invoke("window_start_drag").catch(() => {});
  });
}

export function installTauriBridge(): void {
  if (!inTauri() || (window as unknown as { mcm?: unknown }).mcm) return;
  (window as unknown as { mcm: McmBridge }).mcm = createBridge();
  const route = window.location.hash.replace(/^#/, "");
  if (!route.startsWith("menu=")) installDragRegions(!route.startsWith("dialog="));
}
