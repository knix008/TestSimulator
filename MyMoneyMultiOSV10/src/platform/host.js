import { createDesktopPlatform } from "./desktop.js";
import { createTauriApi, hasTauri } from "./tauri-bridge.js";
import { createWebPlatform } from "./web.js";

export function createHostPlatform() {
  if (hasTauri()) return createDesktopPlatform(createTauriApi());
  return createWebPlatform();
}
