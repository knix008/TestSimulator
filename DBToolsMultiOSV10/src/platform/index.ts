import { ElectronHost } from './electronHost';
import type { Host } from './host';
import { WebHost } from './webHost';

let cached: Host | null = null;

export function getHost(): Host {
  if (cached) return cached;
  cached =
    typeof window !== 'undefined' && window.dbtools
      ? new ElectronHost(window.dbtools)
      : new WebHost();
  return cached;
}

export function isElectron(): boolean {
  return getHost().kind === 'electron';
}

export * from './host';
