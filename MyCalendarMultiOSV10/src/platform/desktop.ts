import type { Messages } from "../domain/messages";
import type { Settings } from "../domain/settings";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(command, args);
}

export async function readInstallLanguage(): Promise<"ko" | "en" | null> {
  if (!isTauri()) return null;
  try {
    const value = await invoke<string | null>("install_language");
    return value === "ko" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

export async function syncShell(settings: Settings, copy: Messages): Promise<void> {
  if (!isTauri()) return;
  await invoke("update_tray_labels", {
    show: copy.showHide,
    events: copy.manageEvents,
    settings: copy.settings,
    about: copy.about,
    quit: copy.quit,
    tooltip: copy.trayTooltip,
    language: settings.language ?? "en",
    languageSwitch: copy.languageSwitch,
  });
  await invoke("set_main_always_on_top", { on: settings.alwaysOnTop });
}

export async function onTrayLanguage(handler: (language: "ko" | "en") => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("tray-language", (event) => {
    if (event.payload === "ko" || event.payload === "en") handler(event.payload);
  });
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const autostart = await import("@tauri-apps/plugin-autostart");
  if (enabled) await autostart.enable();
  else await autostart.disable();
}

/** The tray's About item opens the settings window on its About tab, which the calendar window arranges. */
export async function onTrayAbout(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("tray-about", () => handler());
}

export async function openAux(label: "settings" | "events" | "print" | "editor"): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_aux_window", { label });
}

export async function showReminderWindow(): Promise<void> {
  if (!isTauri()) return;
  await invoke("show_reminder_window");
}

/** Sizes the reminder popup to its content and pins it to the bottom-right of the work area. */
export async function fitReminderWindow(height: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("fit_reminder_window", { height: Math.ceil(height) });
}

/** Sets the event editor window's height, in CSS pixels, keeping its width. */
export async function fitEditorWindow(height: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("fit_editor_window", { height: Math.ceil(height) });
}

export async function hideCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

export async function hideMain(): Promise<void> {
  if (!isTauri()) return;
  await invoke("hide_main");
}

export async function minimizeMain(): Promise<void> {
  if (!isTauri()) return;
  await invoke("minimize_main");
}

/** Resolves to whether the window is maximized afterwards. */
export async function toggleMaximizeMain(): Promise<boolean> {
  if (!isTauri()) return false;
  return Boolean(await invoke<boolean>("toggle_maximize_main"));
}

/** Reports the maximized state now and whenever the window is resized, including by the OS (Win+Up, snapping). */
export async function onMaximizedChange(handler: (maximized: boolean) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const current = getCurrentWindow();
  const report = async () => handler(await current.isMaximized());
  // Asked once the size settles so a live drag is not slowed by a native round trip per frame.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unlisten = await current.onResized(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void report(), 120);
  });
  await report();
  return () => {
    clearTimeout(timer);
    unlisten();
  };
}

export async function openHolidaySource(): Promise<void> {
  const url = "https://date.nager.at";
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke("open_external", { url });
}

export async function dragWindow(event: { button: number; target: EventTarget | null }): Promise<void> {
  if (!isTauri() || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest("button, input, select, textarea, a, label")) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export async function resizeWindow(direction: "East" | "South" | "SouthEast"): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startResizeDragging(direction);
}

/**
 * Ignored while maximized: on Windows sizing a maximized window un-maximizes it, and a fit queued by the resize
 * that maximizing itself causes would otherwise leave a screen-sized normal window.
 */
export async function setWindowSize(width: number, height: number): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const current = getCurrentWindow();
  if (await current.isMaximized()) return;
  await current.setSize(new LogicalSize(Math.round(width), Math.ceil(height)));
}

/**
 * Matches `minWidth` in tauri.conf.json, the width the default Korean toolbar needs. The calendar measures its
 * toolbar after layout and raises or lowers the minimum for the language and year-month format on screen.
 */
export const MIN_WINDOW_WIDTH = 366;

/** Ignored while maximized, where the minimum measured from the screen-wide grid would outlast the full screen. */
export async function setWindowMinSize(width: number, height: number): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const current = getCurrentWindow();
  if (await current.isMaximized()) return;
  await current.setMinSize(new LogicalSize(Math.round(width), Math.ceil(height)));
}

export async function setWindowTitle(title: string): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

export async function closeCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

export async function currentWindowLabel(): Promise<string> {
  if (!isTauri()) return "main";
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().label;
}
