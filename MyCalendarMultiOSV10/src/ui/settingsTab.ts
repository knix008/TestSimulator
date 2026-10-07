export type SettingsTab = "general" | "appearance" | "calendar" | "about";

const SETTINGS_TABS: SettingsTab[] = ["general", "appearance", "calendar", "about"];

/** The settings window may live in another webview, so the wanted tab travels through storage. */
export const SETTINGS_TAB_KEY = "mycalendar.settings-tab";

export function requestSettingsTab(tab: SettingsTab): void {
  localStorage.setItem(SETTINGS_TAB_KEY, `${tab}:${Date.now()}`);
}

export function parseSettingsTab(value: string | null): SettingsTab | null {
  const tab = value?.split(":")[0] as SettingsTab | undefined;
  return tab && SETTINGS_TABS.includes(tab) ? tab : null;
}

export function takeRequestedTab(): SettingsTab | null {
  const tab = parseSettingsTab(localStorage.getItem(SETTINGS_TAB_KEY));
  localStorage.removeItem(SETTINGS_TAB_KEY);
  return tab;
}
