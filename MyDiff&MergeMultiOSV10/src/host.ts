/**
 * One façade over "running in Electron" and "running in a browser tab".
 *
 * In the desktop build a menu or a dialog is a real OS window, which is how a menu can
 * be taller than the app and a dialog can be dragged off it. A browser cannot do that,
 * so the same calls resolve against in-page hosts instead. Callers never branch: they
 * `await host.openDialog("settings")` and get a result either way.
 */
import type { CustomTheme } from "../core/themes.js";
import type { MdmBridge, MenuAnchor } from "./global.js";

export type MenuItem =
  | {
    kind?: "item";
    id: string;
    label: string;
    /** Name from `src/icons.tsx`; every menu row carries one. */
    icon: string;
    shortcut?: string;
    checked?: boolean;
    disabled?: boolean;
    /** Shown at the right edge in a muted tone (a path, a count). */
    hint?: string;
    /** Colour chips drawn beside the icon — how the theme picker shows each theme. */
    swatches?: string[];
  }
  | { kind: "separator"; id?: string }
  | { kind: "header"; id?: string; label: string }
  /**
   * Side-by-side columns of choices, each with its own heading.
   *
   * Forty themes listed one per line is a menu taller than the screen, and forty
   * swatches in two long rows is one wider than the screen. Two columns — light on
   * the left, dark on the right — is twenty lines tall and two choices wide, which
   * fits, and reads as the two kinds it is.
   */
  | {
    kind: "columns";
    id?: string;
    columns: {
      label: string;
      options: { id: string; label: string; colors?: string[]; checked?: boolean }[];
    }[];
  };

export type MenuSpec = {
  /** Identifies the menu so the opener can tell which one answered. */
  menu: string;
  items: MenuItem[];
  /** Theme id and language, so the popup window paints like the app. */
  theme: string;
  /** The custom theme's colours, needed when `theme` is the custom one. */
  customTheme?: CustomTheme;
  language: string;
  fontFamily: string;
  fontSize: number;
};

export type DialogName =
  | "about" | "settings" | "print" | "error" | "progress"
  | "unsaved" | "recent" | "confirm" | "prompt" | "text" | "remote";

type PendingDialog = { name: DialogName; resolve: (value: unknown) => void };

export const isDesktop = (): boolean => Boolean(globalThis.window?.mdm?.desktop);
/** Only called behind an `isDesktop()` check, which is what makes the cast safe. */
const bridge = (): MdmBridge => globalThis.window.mdm as MdmBridge;

/* ------------------------------------------------------------------ *
 * In-page hosts (web build)
 * ------------------------------------------------------------------ */

export type InlineMenuState = { spec: MenuSpec; anchor: MenuAnchor; resolve: (id: string | null) => void } | null;
export type InlineDialogState = { name: DialogName; payload: unknown; resolve: (value: unknown) => void } | null;

type Listener<T> = (value: T) => void;

class Signal<T> {
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

export const inlineMenu = new Signal<InlineMenuState>(null);
export const inlineDialogs = new Signal<InlineDialogState[]>([]);

/**
 * Settings saved from anywhere — the main window, a settings dialog in its own OS
 * window, a toolbar slider — arrive here. In the browser that is the same JavaScript
 * context; in Electron the main process relays them between renderers, excluding the
 * one that made the change so an update cannot echo back and forth.
 */
export const settingsChanged = new Signal<unknown>(null);

let settingsWired = false;
function wireSettings(): void {
  if (settingsWired || !isDesktop()) return;
  settingsWired = true;
  bridge().onSettingsChanged((value) => settingsChanged.set(value));
}

/** Call after writing settings so every other window follows. */
export function publishSettings(saved: unknown): void {
  settingsChanged.set(saved);
  if (isDesktop()) bridge().broadcastSettings(saved).catch(() => {});
}

/** Subscribe to settings written by another window. */
export function onSettingsPublished(listener: (saved: unknown) => void): () => void {
  wireSettings();
  return settingsChanged.subscribe(listener);
}

/* ------------------------------------------------------------------ *
 * Menus
 * ------------------------------------------------------------------ */

let menuCancel: (() => void) | null = null;

/** Opens a dropdown or context menu at `anchor` and resolves with the chosen id. */
export function openMenu(spec: MenuSpec, anchor: MenuAnchor): Promise<string | null> {
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
      inlineMenu.set({ spec, anchor, resolve: finish });
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
    const off = bridge().onMenuChosen((commandId) => finish(commandId));
    menuCancel = () => finish(null);
    bridge().openMenu(spec, anchor).catch(() => finish(null));
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

const pending = new Map<string, PendingDialog>();
let dialogWired = false;

function wireDialogs(): void {
  if (dialogWired || !isDesktop()) return;
  dialogWired = true;
  bridge().onDialogResult(({ name, result }) => {
    const entry = pending.get(name);
    if (!entry) return;
    pending.delete(name);
    entry.resolve(result);
  });
  bridge().onDialogClosed((name) => {
    const entry = pending.get(name);
    if (!entry) return;
    pending.delete(name);
    entry.resolve(null);
  });
}

/** Opens `name` as a popup window (desktop) or an in-page modal (web). */
export function openDialog<T = unknown>(name: DialogName, payload?: unknown): Promise<T | null> {
  if (!isDesktop()) {
    return new Promise<T | null>((resolve) => {
      const entry: InlineDialogState = {
        name,
        payload,
        resolve: (value) => {
          inlineDialogs.set(inlineDialogs.get().filter((item) => item !== entry));
          resolve(value as T | null);
        },
      };
      inlineDialogs.set([...inlineDialogs.get().filter((item) => item?.name !== name), entry]);
    });
  }

  wireDialogs();
  return new Promise<T | null>((resolve) => {
    const previous = pending.get(name);
    if (previous) previous.resolve(null);
    pending.set(name, { name, resolve: resolve as (value: unknown) => void });
    bridge().openDialog(name, payload).catch(() => {
      pending.delete(name);
      resolve(null);
    });
  });
}

export function closeDialog(name: DialogName): void {
  if (!isDesktop()) {
    const entry = inlineDialogs.get().find((item) => item?.name === name);
    if (entry) entry.resolve(null);
    return;
  }
  bridge().closeDialog(name).catch(() => {});
}

export function closeAllDialogs(): void {
  if (!isDesktop()) {
    for (const entry of inlineDialogs.get()) entry?.resolve(null);
    inlineDialogs.set([]);
    return;
  }
  bridge().closeAllDialogs().catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Window, clipboard, shell
 * ------------------------------------------------------------------ */

export function setTitle(title: string): void {
  document.title = title;
  if (isDesktop()) bridge().setTitle(title).catch(() => {});
}

export function setMinimumSize(width: number, height: number): void {
  if (isDesktop()) bridge().setMinimumSize(width, height).catch(() => {});
  document.documentElement.style.setProperty("--min-app-width", `${Math.ceil(width)}px`);
}

export function minimizeWindow(): void {
  if (isDesktop()) bridge().minimizeWindow().catch(() => {});
}

/** Sets the window's outer size outright — what the corner grip drags. */
export function resizeWindowTo(width: number, height: number): void {
  if (isDesktop()) bridge().resizeWindowTo(width, height).catch(() => {});
}

export function toggleMaximizeWindow(): void {
  if (isDesktop()) bridge().toggleMaximizeWindow().catch(() => {});
}

export function isMaximized(): Promise<boolean> {
  return isDesktop() ? bridge().isMaximized() : Promise.resolve(false);
}

export function onWindowState(listener: (state: { maximized: boolean }) => void): () => void {
  if (!isDesktop()) return () => {};
  return bridge().onWindowState(listener);
}

export function setBackgroundColor(color: string): void {
  if (isDesktop()) bridge().setBackgroundColor(color).catch(() => {});
}

export function setNativeTheme(kind: "light" | "dark"): void {
  if (isDesktop()) bridge().setNativeTheme(kind).catch(() => {});
}

export async function copyText(value: string): Promise<boolean> {
  if (isDesktop()) return bridge().copyText(value);
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Clipboard permission can be refused; the textarea trick still works everywhere.
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export async function readText(): Promise<string> {
  if (isDesktop()) return bridge().readText();
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

export function openExternal(target: string): void {
  if (isDesktop()) {
    bridge().openExternal(target).catch(() => {});
    return;
  }
  window.open(target, "_blank", "noopener");
}

export function revealInFolder(target: string): void {
  if (isDesktop()) bridge().revealInFolder(target).catch(() => {});
}

export function reportMergeSaved(): void {
  if (isDesktop()) bridge().mergeSaved().catch(() => {});
}

export function quit(): void {
  if (isDesktop()) {
    bridge().quit().catch(() => {});
    return;
  }
  window.close();
}

export function broadcastSettings(settings: unknown): void {
  if (isDesktop()) bridge().broadcastSettings(settings).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * File pickers
 * ------------------------------------------------------------------ */

export type FileFilter = { name: string; extensions: string[] };

/** Native dialog on the desktop; the in-app browser (a `prompt` dialog) on the web. */
export async function pickFile(options: {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
} = {}): Promise<string | null> {
  if (isDesktop()) {
    const result = await bridge().pickFile(options);
    return typeof result === "string" ? result : null;
  }
  return openDialog<string>("prompt", { mode: "file", ...options });
}

export async function pickDirectory(options: { title?: string; defaultPath?: string } = {}): Promise<string | null> {
  if (isDesktop()) return bridge().pickDirectory(options);
  return openDialog<string>("prompt", { mode: "directory", ...options });
}

export async function pickSave(options: {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
} = {}): Promise<string | null> {
  if (isDesktop()) return bridge().pickSave(options);
  return openDialog<string>("prompt", { mode: "save", ...options });
}
/** Asks for one line of text. Resolves to null when the question is dismissed. */
export function askText(options: {
  title?: string;
  label?: string;
  value?: string;
  placeholder?: string;
  hint?: string;
}): Promise<string | null> {
  return openDialog<string>("text", options);
}


/* ------------------------------------------------------------------ *
 * Printing
 * ------------------------------------------------------------------ */

export async function printCurrentWindow(options: { landscape: boolean; printBackground: boolean }): Promise<boolean> {
  if (isDesktop()) {
    const result = await bridge().print(options);
    return result.ok;
  }
  window.print();
  return true;
}

/* ------------------------------------------------------------------ *
 * Anchors
 * ------------------------------------------------------------------ */

/**
 * Where a menu should appear for a trigger element.
 *
 * The desktop popup is its own OS window, so it needs screen coordinates; the web
 * popup lives in the page and needs viewport coordinates. Both are "just below the
 * element", and `height` is carried along so the popup can flip above it when there
 * is no room underneath.
 */
export function anchorFor(element: Element, placement: "below" | "at" = "below"): MenuAnchor {
  const rect = element.getBoundingClientRect();
  const x = placement === "below" ? rect.left : rect.left;
  const y = placement === "below" ? rect.bottom : rect.top;
  if (!isDesktop()) return { x, y, width: rect.width, height: rect.height };
  return {
    x: Math.round(window.screenX + x),
    y: Math.round(window.screenY + y + (window.outerHeight - window.innerHeight)),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/** Where a context menu should appear for a pointer event. */
export function anchorForPoint(clientX: number, clientY: number): MenuAnchor {
  if (!isDesktop()) return { x: clientX, y: clientY, width: 0, height: 0 };
  return {
    x: Math.round(window.screenX + clientX),
    y: Math.round(window.screenY + clientY + (window.outerHeight - window.innerHeight)),
    width: 0,
    height: 0,
  };
}
