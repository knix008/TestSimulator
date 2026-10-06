import { themes } from "./themes";
import type { Language } from "./messages";

export interface Settings {
  language: Language | null;
  themeId: string;
  opacity: number;
  countryCode: string;
  weekStartsOn: 0 | 1;
  alwaysOnTop: boolean;
  autostart: boolean;
}

export const STORAGE_KEY = "mycalendar.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  language: null,
  themeId: "dark-ink",
  opacity: 0.78,
  countryCode: "KR",
  weekStartsOn: 0,
  alwaysOnTop: false,
  autostart: false,
};

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.opacity;
  return Math.min(1, Math.max(0.15, value));
}

export function normalizeSettings(input: Partial<Settings> | null | undefined): Settings {
  const themeId =
    typeof input?.themeId === "string" && themes.some((theme) => theme.id === input.themeId)
      ? input.themeId
      : DEFAULT_SETTINGS.themeId;
  const countryCode =
    typeof input?.countryCode === "string" && /^[A-Za-z]{2}$/.test(input.countryCode)
      ? input.countryCode.toUpperCase()
      : DEFAULT_SETTINGS.countryCode;
  const language = input?.language === "ko" || input?.language === "en" ? input.language : null;
  return {
    language,
    themeId,
    opacity: clampOpacity(Number(input?.opacity)),
    countryCode,
    weekStartsOn: input?.weekStartsOn === 1 ? 1 : 0,
    alwaysOnTop: Boolean(input?.alwaysOnTop),
    autostart: Boolean(input?.autostart),
  };
}

export function readStoredSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeSettings(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return null;
  }
}

export function writeStoredSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("mycalendar-settings"));
}
