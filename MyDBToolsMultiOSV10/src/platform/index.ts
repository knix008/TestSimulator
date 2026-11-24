import type { Host } from './host';
import { isTauriShell, TauriHost } from './tauriHost';
import { WebHost } from './webHost';

let cached: Host | null = null;

export function getHost(): Host {
  if (cached) return cached;
  cached = isTauriShell() ? new TauriHost() : new WebHost();
  return cached;
}

/** The Tauri desktop shell (native files, a real file system), not a browser tab. */
export function isDesktop(): boolean {
  return getHost().kind === 'desktop';
}

export * from './host';
