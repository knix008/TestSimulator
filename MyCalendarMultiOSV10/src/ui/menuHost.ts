let token = 0;
let active = false;
let pendingHost: number | null = null;
let pendingTimer = 0;

function applyMenuHost(width: number, height: number, padLeft: number, padTop: number): void {
  const root = document.documentElement;
  root.dataset.menuHost = "true";
  root.style.setProperty("--menu-host-width", `${width}px`);
  root.style.setProperty("--menu-host-height", `${height}px`);
  root.style.setProperty("--menu-host-pad-x", `${padLeft}px`);
  root.style.setProperty("--menu-host-pad-y", `${padTop}px`);
}

/** True while the calendar window is temporarily larger than the calendar, to hold an open context menu. */
export function menuHostActive(): boolean {
  return active;
}

/**
 * Pins the calendar at its current size and shifts it by the padding the window is about to gain.
 * A strict-mode remount cancels the restore scheduled by the previous cleanup and keeps this hold.
 */
export function holdMenuHost(width: number, height: number, padLeft: number, padTop: number): number {
  applyMenuHost(width, height, padLeft, padTop);
  active = true;
  if (pendingHost !== null) {
    window.clearTimeout(pendingTimer);
    const host = pendingHost;
    pendingHost = null;
    return host;
  }
  token += 1;
  return token;
}

/** Restores the window on the next turn, unless another hold claims this one first. */
export function releaseMenuHost(host: number, restore: () => Promise<void>): void {
  window.clearTimeout(pendingTimer);
  pendingHost = host;
  pendingTimer = window.setTimeout(() => {
    if (pendingHost !== host) return;
    pendingHost = null;
    void restore().finally(() => endMenuHost(host));
  }, 0);
}

export function endMenuHost(host: number): void {
  if (host !== token) return;
  active = false;
  pendingHost = null;
  const root = document.documentElement;
  delete root.dataset.menuHost;
  root.style.removeProperty("--menu-host-width");
  root.style.removeProperty("--menu-host-height");
  root.style.removeProperty("--menu-host-pad-x");
  root.style.removeProperty("--menu-host-pad-y");
}
