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
    settings: copy.settings,
    about: copy.about,
    quit: copy.quit,
    tooltip: copy.trayTooltip,
  });
  await invoke("set_main_always_on_top", { on: settings.alwaysOnTop });
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const autostart = await import("@tauri-apps/plugin-autostart");
  if (enabled) await autostart.enable();
  else await autostart.disable();
}

export async function openAux(label: "settings" | "about"): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_aux_window", { label });
}

export async function hideMain(): Promise<void> {
  if (!isTauri()) return;
  await invoke("hide_main");
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

export async function resizeWindow(direction: "East" | "South" | "SouthEast"): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startResizeDragging(direction);
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
