import { createElectronPlatform } from "./electron.js";
import { createWebPlatform } from "./web.js";

export function createHostPlatform() {
  if (globalThis.electronAPI?.isElectron) return createElectronPlatform(globalThis.electronAPI);
  return createWebPlatform();
}
