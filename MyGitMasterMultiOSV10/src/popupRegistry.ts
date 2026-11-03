/**
 * What a popup window can show.
 *
 * A dialog or a menu is opened by name (src/host.ts `openDialog("about")`,
 * `openMenu("theme", …)`); the window that shows it — a popup OS window on the desktop,
 * an in-page layer in the browser — looks the name up here. Registration happens in
 * src/popupRegistrations.ts, which every window imports before it renders, so the main
 * window and the popup windows always agree on the table.
 *
 * Components get the saved settings, the language and the translator, so a popup in a
 * window of its own paints and speaks like the app. A dialog answers with `resolve` (the
 * opener's `openDialog` promise gets the value) or goes away with `close` (null); a menu
 * answers with `choose(id)`.
 */
import type { ComponentType } from "react";
import type { Settings } from "./api";
import type { Lang } from "./i18n";
import type { IconName } from "./icons";

export type PopupContext = {
  settings: Settings;
  lang: Lang;
  t: (key: string) => string;
  /** Saves a settings change and tells every other window (see host.publishSettings). */
  onPrefs: (patch: Partial<Settings>) => void;
};

export type DialogComponentProps = PopupContext & {
  payload: unknown;
  resolve: (value: unknown) => void;
  close: () => void;
};

export type MenuComponentProps = PopupContext & {
  payload: unknown;
  choose: (id: string) => void;
  dismiss: () => void;
};

export type DialogEntry = {
  component: ComponentType<DialogComponentProps>;
  /** Every popup's title bar carries an icon and a title. */
  icon: IconName | ((payload: unknown, t: (key: string) => string) => IconName);
  title: (t: (key: string) => string, payload: unknown) => string;
};

export type MenuEntry = { component: ComponentType<MenuComponentProps> };

const dialogs = new Map<string, DialogEntry>();
const menus = new Map<string, MenuEntry>();

export function registerDialog(name: string, entry: DialogEntry): void {
  dialogs.set(name, entry);
}

export function registerMenu(name: string, entry: MenuEntry): void {
  menus.set(name, entry);
}

export function dialogEntry(name: string): DialogEntry | undefined {
  return dialogs.get(name);
}

export function menuEntry(name: string): MenuEntry | undefined {
  return menus.get(name);
}

export function registeredDialogs(): string[] {
  return [...dialogs.keys()];
}

export function registeredMenus(): string[] {
  return [...menus.keys()];
}

export function dialogIcon(entry: DialogEntry, payload: unknown, t: (key: string) => string): IconName {
  return typeof entry.icon === "function" ? entry.icon(payload, t) : entry.icon;
}
