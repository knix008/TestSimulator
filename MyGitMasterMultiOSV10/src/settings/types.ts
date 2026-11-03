import type { Settings } from "../api";
import type { Lang } from "../i18n";

/** What every Preferences tab gets: the saved settings and a way to change them (applied at once). */
export type SettingsTabProps = {
  settings: Settings;
  lang: Lang;
  t: (key: string) => string;
  onPrefs: (patch: Partial<Settings>) => void;
};

export const PREFS_TABS = ["general", "theme", "start", "prompt", "promptEdit", "tools"] as const;
export type PrefsTab = (typeof PREFS_TABS)[number];
