/**
 * Settings that belong to one feature each (start screen, tutorial, terminal prompt,
 * user themes). Every feature module describes its keys here — default, sanitiser,
 * and whether "Restore defaults" resets it — and SettingsStore / PUT /api/settings
 * handle them all the same way, so a feature never has to touch the store or the route.
 */
import { CUSTOM_THEME_SETTINGS } from "./customThemes.js";
import { PROMPT_SETTINGS } from "./promptSettings.js";
import { START_SCREEN_SETTINGS } from "./startScreen.js";

export type SettingExtension = {
  key: string;
  defaults: () => unknown;
  /** Turns whatever arrived (file, request body) into a valid value. */
  sanitize: (value: unknown) => unknown;
  /** Reset by Preferences › Restore defaults. */
  resetOnRestore: boolean;
};

export const SHOW_TUTORIAL: SettingExtension = {
  key: "showTutorial",
  defaults: () => true,
  sanitize: (value) => value !== false,
  resetOnRestore: true,
};

export const SETTING_EXTENSIONS: SettingExtension[] = [
  SHOW_TUTORIAL,
  ...START_SCREEN_SETTINGS,
  ...PROMPT_SETTINGS,
  ...CUSTOM_THEME_SETTINGS,
];

export function extensionDefaults(): Record<string, unknown> {
  return Object.fromEntries(SETTING_EXTENSIONS.map((item) => [item.key, item.defaults()]));
}

/** The sanitised extension values found in `source` (keys that are absent are left out). */
export function extensionPatch(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (!source || typeof source !== "object") return patch;
  for (const item of SETTING_EXTENSIONS) {
    if (item.key in source && source[item.key] !== undefined) patch[item.key] = item.sanitize(source[item.key]);
  }
  return patch;
}
