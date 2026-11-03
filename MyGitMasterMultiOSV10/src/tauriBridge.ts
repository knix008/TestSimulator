/**
 * The desktop bridge: `window.mgm` on top of the Tauri shell (src-tauri/).
 *
 * Every window — the main one and the Diff / Merge tool windows — loads the same bundle
 * from the core's own loopback server, so this module runs in all of them. Everything
 * that is not a window or OS matter still goes over HTTP to that server, exactly as in
 * the browser build.
 *
 * Imported first by main.tsx; in a browser tab (no Tauri) it does nothing.
 */
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { MgmBridge } from "./global";

type Internals = { __TAURI_INTERNALS__?: unknown };

export function inTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as Internals).__TAURI_INTERNALS__);
}

function platform(): string {
  const agent = navigator.userAgent;
  if (/Windows/i.test(agent)) return "win32";
  if (/Mac OS X|Macintosh/i.test(agent)) return "darwin";
  return "linux";
}

/** Window-scoped listening: an event emitted to one window must not reach the others. */
function onWindowEvent<T>(event: string, listener: (payload: T) => void): () => void {
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
}

function createBridge(): MgmBridge {
  return {
    platform: platform(),
    pickDirectory: () => invoke("pick_directory", { create: false }),
    pickSaveDirectory: () => invoke("pick_directory", { create: true }),
    pickFile: (current) => invoke("pick_program", { current: current || null }),
    openTool: (url, kind) => invoke("tool_open", { url, kind }),
    window: {
      minimize: () => invoke("window_minimize"),
      toggleMaximize: () => invoke("window_toggle_maximize"),
      close: () => invoke("window_close"),
      isMaximized: () => invoke("window_is_maximized"),
      onMaximized: (callback) => onWindowEvent<{ maximized: boolean }>("window:state", (state) => callback(Boolean(state.maximized))),
      themeReady: () => {
        invoke("window_ready").catch(() => {});
      },
    },

    setMinimumSize: (width, height) => invoke("window_min_size", { width, height }),
    setBackgroundColor: (color) => invoke("window_background", { color }),
    broadcastSettings: (settings) => invoke("settings_broadcast", { settings }),
    onSettingsChanged: (listener) => onWindowEvent<unknown>("settings:changed", listener),

    openMenu: (payload, anchor) => invoke("menu_open", { payload, anchor }),
    closeMenu: (openId) => invoke("menu_close", { openId: openId ?? null }),
    menuPayload: () => invoke("menu_payload"),
    menuSize: (size) => invoke("menu_size", { width: size.width, height: size.height, openId: size.openId ?? null }),
    chooseMenu: (commandId) => invoke("menu_choose", { commandId }),
    onMenuPayload: (listener) => onWindowEvent<unknown>("menu:payload", listener),
    onMenuChosen: (listener) => onWindowEvent<{ openId: number; id: string | null }>("menu:chosen", listener),

    openDialog: (name, payload, spec) => invoke("dialog_open", { name, payload: payload ?? null, spec }),
    dialogPayload: () => invoke("dialog_payload"),
    dialogResult: (name, result) => invoke("dialog_result", { name, result: result ?? null }),
    closeDialog: (name) => invoke("dialog_close", { name: name ?? null }),
    closeAllDialogs: () => invoke("dialog_close_all"),
    dialogSize: (size) => invoke("dialog_size", { width: size.width, height: size.height }),
    updateDialog: (name, payload) => invoke("dialog_update", { name, payload: payload ?? null }),
    onDialogPayload: (listener) => onWindowEvent<unknown>("dialog:payload", listener),
    onDialogResult: (listener) => onWindowEvent<{ name: string; result: unknown }>("dialog:result", listener),
    onDialogClosed: (listener) => onWindowEvent<string>("dialog:closed", listener),

    openGuide: (section) => invoke("guide_open", { section: section ?? null }),
    onGuideSection: (listener) => onWindowEvent<string>("guide:section", listener),
  };
}

/* ------------------------------------------------------------------ *
 * Window chrome
 * ------------------------------------------------------------------ */

// The stylesheet marks the title rows with `-webkit-app-region: drag`, which a native
// frame reads but a Tauri webview does not. The same rule is applied here: a press on a
// drag row that is not on one of its controls moves the window.
const DRAG_ROWS = ".menubar, .tool-titlebar, .popup-title, [data-drag-region]";
const NOT_DRAG = [
  "button", "input", "select", "textarea", "a", "label", "[role=button]", "[role=menuitem]",
  ".menu", ".menu-pop", ".tool-pop", ".context", ".window-controls", ".file-title", "[data-no-drag]",
].join(", ");

function installDragRegions(canMaximize: boolean): void {
  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    // The status bar's corner grip resizes the window (it has no OS frame to grab).
    if (target?.closest("[data-resize-grip]")) {
      event.preventDefault();
      invoke("window_start_resize").catch(() => {});
      return;
    }
    if (!target || !target.closest(DRAG_ROWS) || target.closest(NOT_DRAG)) return;
    if (event.detail === 2) {
      if (canMaximize) invoke("window_toggle_maximize").catch(() => {});
      return;
    }
    event.preventDefault();
    invoke("window_start_drag").catch(() => {});
  });
}

export function installTauriBridge(): void {
  if (!inTauri() || window.mgm) return;
  window.mgm = createBridge();
  // A menu popup never moves; a dialog moves but keeps its size.
  const route = window.location.hash.replace(/^#/, "");
  if (!route.startsWith("menu=")) installDragRegions(!route.startsWith("dialog="));
}
