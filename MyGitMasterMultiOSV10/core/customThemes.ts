/**
 * User-defined themes (Preferences › Theme › My themes).
 *
 * A user theme is a name, a mode and the ten base colours every theme is built from
 * (core/themes.ts buildTheme); the other variables are derived exactly as for the
 * built-in themes. They live in settings.customThemes; the theme id is `custom-…`, so
 * it never collides with a built-in one.
 */
import type { SettingExtension } from "./settingsExtensions.js";
import {
  CUSTOM_THEME_PREFIX,
  THEME_COLOR_KEYS,
  themeById,
  themeColors,
  type CustomTheme,
  type ThemeColors,
} from "./themes.js";

export type { CustomTheme };

export const MAX_CUSTOM_THEMES = 24;
const ID = /^custom-[a-z0-9][a-z0-9-]{0,39}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** Keeps only well-formed themes (unique ids, #rrggbb colours, a name). */
export function sanitizeCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CustomTheme[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<CustomTheme> & { colors?: Partial<ThemeColors> };
    const id = typeof item.id === "string" ? item.id.trim().toLowerCase() : "";
    if (!ID.test(id) || seen.has(id)) continue;
    const mode = item.mode === "dark" ? "dark" : "light";
    const fallback = themeColors(themeById(mode === "dark" ? "dark-midnight" : "light-classic"));
    const colors = {} as ThemeColors;
    for (const key of THEME_COLOR_KEYS) {
      const color = item.colors?.[key];
      colors[key] = typeof color === "string" && HEX.test(color) ? color.toLowerCase() : fallback[key];
    }
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 40) : id;
    seen.add(id);
    result.push({ id, name, mode, colors });
    if (result.length >= MAX_CUSTOM_THEMES) break;
  }
  return result;
}

/** A new user theme copied from `baseId` (any theme, built-in or user). */
export function customThemeFrom(baseId: string, name: string, existing: readonly CustomTheme[]): CustomTheme {
  const base = themeById(baseId);
  return { id: newCustomThemeId(existing), name: name.trim().slice(0, 40) || base.nameEn, mode: base.mode, colors: themeColors(base) };
}

export function newCustomThemeId(existing: readonly { id: string }[]): string {
  for (let index = existing.length + 1; ; index++) {
    const id = `${CUSTOM_THEME_PREFIX}${index}`;
    if (!existing.some((item) => item.id === id)) return id;
  }
}

export const CUSTOM_THEME_SETTINGS: SettingExtension[] = [
  { key: "customThemes", defaults: () => [], sanitize: sanitizeCustomThemes, resetOnRestore: false },
];
