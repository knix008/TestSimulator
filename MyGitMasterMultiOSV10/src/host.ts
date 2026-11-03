/**
 * One façade over "running in the desktop app" (Tauri, see tauriBridge.ts) and
 * "running in a browser tab".
 *
 * On the desktop a menu, a dialog and the user's guide are real OS windows, which is
 * how a menu can be taller than the app and a dialog can be dragged off it. A browser
 * cannot do that, so the same calls resolve against in-page hosts instead
 * (src/popupWindow.tsx `InlinePopups`). Callers never branch:
 *
 *   const id = await host.openMenu("list", { items }, host.anchorFor(button));
 *   const ok = await host.openDialog<boolean>("confirm", { message });
 */
import type { Settings } from "./api";
import { dialogSpec } from "./dialogSpecs";
import type { MenuAnchor, MgmBridge } from "./global";

export const isDesktop = (): boolean => typeof window !== "undefined" && typeof window.mgm?.openDialog === "function";
/** Only called behind an `isDesktop()` check, which is what makes the cast safe. */
const bridge = (): MgmBridge => window.mgm as MgmBridge;

/* ------------------------------------------------------------------ *
 * Signals (in-page state the web build's hosts render)
 * ------------------------------------------------------------------ */

type Listener<T> = (value: T) => void;

export class Signal<T> {
  private value: T;
  private readonly listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    this.value = next;
    for (const listener of this.listeners) listener(next);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export type InlineMenuState = { name: string; payload: unknown; anchor: MenuAnchor; resolve: (id: string | null) => void } | null;
export type InlineDialogState = { name: string; payload: unknown; resolve: (value: unknown) => void };

export const inlineMenu = new Signal<InlineMenuState>(null);
export const inlineDialogs = new Signal<InlineDialogState[]>([]);

/* ------------------------------------------------------------------ *
 * Settings shared between windows
 * ------------------------------------------------------------------ */

/**
 * Settings saved from anywhere — the main window or a dialog in its own OS window —
 * arrive here. In the browser that is one JavaScript context; on the desktop the shell
 * relays them between windows, skipping the one that made the change.
 */
const settingsChanged = new Signal<Settings | null>(null);
let settingsWired = false;

function wireSettings(): void {
  if (settingsWired || !isDesktop()) return;
  settingsWired = true;
  bridge().onSettingsChanged((value) => settingsChanged.set(value as Settings));
}

/** Call after writing settings so every other window follows. */
export function publishSettings(saved: Settings): void {
  settingsChanged.set(saved);
  if (isDesktop()) bridge().broadcastSettings(saved).catch(() => {});
}

/** Settings written by another window (or by a popup in this page). */
export function onSettingsPublished(listener: (saved: Settings) => void): () => void {
  wireSettings();
  return settingsChanged.subscribe((value) => {
    if (value) listener(value);
  });
}

export async function loadSettings(): Promise<Settings> {
  const response = await fetch("/api/settings");
  if (!response.ok) throw new Error(`/api/settings ${response.status}`);
  return response.json() as Promise<Settings>;
}

/** Saves a partial settings change and publishes the result to every window. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`/api/settings ${response.status}`);
  const saved = await response.json() as Settings;
  publishSettings(saved);
  return saved;
}

/* ------------------------------------------------------------------ *
 * Menus
 * ------------------------------------------------------------------ */

let menuCancel: (() => void) | null = null;

/**
 * Opens the registered menu `name` (src/popupRegistry.ts) at `anchor` and resolves with
 * the chosen id, or null when it is dismissed.
 */
export function openMenu(name: string, payload: unknown, anchor: MenuAnchor): Promise<string | null> {
  closeMenu();
  if (!isDesktop()) {
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (id: string | null) => {
        if (settled) return;
        settled = true;
        inlineMenu.set(null);
        menuCancel = null;
        resolve(id);
      };
      menuCancel = () => finish(null);
      inlineMenu.set({ name, payload, anchor, resolve: finish });
    });
  }

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (id: string | null) => {
      if (settled) return;
      settled = true;
      off();
      menuCancel = null;
      resolve(id);
    };
    const offChosen = bridge().onMenuChosen((commandId) => finish(commandId));
    // A press anywhere in this window means the user went elsewhere. The menu window
    // normally learns that from losing focus, but the OS does not always give it focus.
    const onPress = () => closeMenu();
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", onPress, true), 0);
    const off = () => {
      offChosen();
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPress, true);
    };
    menuCancel = () => finish(null);
    bridge().openMenu({ menu: name, payload }, anchor).catch(() => finish(null));
  });
}

export function closeMenu(): void {
  const cancel = menuCancel;
  menuCancel = null;
  if (isDesktop()) bridge().closeMenu().catch(() => {});
  if (cancel) cancel();
}

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

const pending = new Map<string, (value: unknown) => void>();
let dialogWired = false;

function wireDialogs(): void {
  if (dialogWired || !isDesktop()) return;
  dialogWired = true;
  bridge().onDialogResult(({ name, result }) => {
    const resolve = pending.get(name);
    if (!resolve) return;
    pending.delete(name);
    resolve(result);
  });
  bridge().onDialogClosed((name) => {
    const resolve = pending.get(name);
    if (!resolve) return;
    pending.delete(name);
    resolve(null);
  });
}

/** Opens the registered dialog `name` as a popup window (desktop) or an in-page modal (web). */
export function openDialog<T = unknown>(name: string, payload?: unknown): Promise<T | null> {
  if (!isDesktop()) {
    return new Promise<T | null>((resolve) => {
      const entry: InlineDialogState = {
        name,
        payload,
        resolve: (value) => {
          inlineDialogs.set(inlineDialogs.get().filter((item) => item !== entry));
          resolve((value ?? null) as T | null);
        },
      };
      for (const previous of inlineDialogs.get().filter((item) => item.name === name)) previous.resolve(null);
      inlineDialogs.set([...inlineDialogs.get(), entry]);
    });
  }

  wireDialogs();
  return new Promise<T | null>((resolve) => {
    const previous = pending.get(name);
    if (previous) previous(null);
    pending.set(name, resolve as (value: unknown) => void);
    bridge().openDialog(name, payload ?? null, dialogSpec(name)).catch(() => {
      pending.delete(name);
      resolve(null);
    });
  });
}

/**
 * Sends a new payload to a dialog that is already open (a progress popup's percent),
 * without waiting for an answer. Opens it when it is not.
 */
export function updateDialog(name: string, payload: unknown): void {
  if (!isDesktop()) {
    const list = inlineDialogs.get();
    const index = list.findIndex((item) => item.name === name);
    if (index < 0) {
      void openDialog(name, payload);
      return;
    }
    // The same entry (its resolve removes it by identity), with the new payload.
    list[index].payload = payload;
    inlineDialogs.set([...list]);
    return;
  }
  if (!pending.has(name)) {
    void openDialog(name, payload);
    return;
  }
  // No show, no focus: the dialog's window just gets the new payload.
  bridge().updateDialog(name, payload ?? null).then((open) => {
    if (!open) void openDialog(name, payload);
  }).catch(() => {});
}

/** Whether a dialog opened from this window is still open (waiting for its answer). */
export function isDialogOpen(name: string): boolean {
  if (!isDesktop()) return inlineDialogs.get().some((item) => item.name === name);
  return pending.has(name);
}

export function closeDialog(name: string): void {
  if (!isDesktop()) {
    for (const entry of inlineDialogs.get().filter((item) => item.name === name)) entry.resolve(null);
    return;
  }
  bridge().closeDialog(name).catch(() => {});
}

export function closeAllDialogs(): void {
  if (!isDesktop()) {
    for (const entry of inlineDialogs.get()) entry.resolve(null);
    inlineDialogs.set([]);
    return;
  }
  bridge().closeAllDialogs().catch(() => {});
}

/* ------------------------------------------------------------------ *
 * The user's guide
 * ------------------------------------------------------------------ */

/** Opens the user's guide in a window of its own, optionally at a section id. */
export function openGuide(section?: string): void {
  if (isDesktop()) {
    bridge().openGuide(section).catch(() => {});
    return;
  }
  const hash = section ? `#guide=${encodeURIComponent(section)}` : "#guide";
  const opened = window.open(`${location.origin}${location.pathname}${hash}`, "mgm-guide", "popup=yes,width=1000,height=720");
  opened?.focus();
}

/* ------------------------------------------------------------------ *
 * Window
 * ------------------------------------------------------------------ */

/**
 * The window's minimum size — the toolbar's natural width, so no button is ever hidden.
 * The shell clamps it to the display and widens a narrower window. Browser: no-op.
 */
export function setMinimumSize(width: number, height: number): Promise<number> {
  if (isDesktop()) return bridge().setMinimumSize(width, height).catch(() => width);
  document.documentElement.style.setProperty("--min-app-width", `${Math.ceil(width)}px`);
  return Promise.resolve(width);
}

/** The window's own background (and, from the main window, every popup's). */
export function setBackgroundColor(color: string): void {
  if (isDesktop() && /^#[0-9a-f]{6}$/i.test(color)) bridge().setBackgroundColor(color).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Anchors
 * ------------------------------------------------------------------ */

/**
 * Where a menu should appear for a trigger element: just below it. The desktop popup
 * is its own OS window and needs screen coordinates; the web popup lives in the page
 * and needs viewport coordinates. `height` lets the popup flip above the trigger when
 * there is no room underneath.
 */
export function anchorFor(element: Element): MenuAnchor {
  const rect = element.getBoundingClientRect();
  if (!isDesktop()) return { x: rect.left, y: rect.bottom, width: rect.width, height: rect.height };
  return {
    x: Math.round(window.screenX + rect.left),
    y: Math.round(window.screenY + rect.bottom + (window.outerHeight - window.innerHeight)),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/** Where a context menu should appear for a pointer position (client coordinates). */
export function anchorForPoint(clientX: number, clientY: number): MenuAnchor {
  if (!isDesktop()) return { x: clientX, y: clientY, width: 0, height: 0 };
  return {
    x: Math.round(window.screenX + clientX),
    y: Math.round(window.screenY + clientY + (window.outerHeight - window.innerHeight)),
    width: 0,
    height: 0,
  };
}
