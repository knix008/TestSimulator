import { isReminder, type Reminder } from "./events";
import { MIN_OPACITY, themes } from "./themes";
import type { Language } from "./messages";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Settings {
  language: Language | null;
  themeId: string;
  opacity: number;
  countryCode: string;
  weekStartsOn: Weekday;
  showLunar: boolean;
  alwaysOnTop: boolean;
  autostart: boolean;
  eventsCollapsed: boolean;
  eventsHeight: number;
  /** Reminder preselected for new events. */
  defaultReminder: Reminder;
  /** Multiplies the date size, which already follows the window width. */
  dateFontScale: number;
  dateFontFamily: DateFontFamily;
  dateFontWeight: DateFontWeight;
  dateFontItalic: boolean;
  /** The date font used in full screen; null until it is first changed there, and meanwhile the window's own. */
  fullscreenDateFont: DateFont | null;
  /** Calendar window size when it was last resized, restored on the next launch. */
  windowSize: { width: number; height: number } | null;
}

export const DATE_FONT_FAMILIES = ["system", "sans", "serif", "rounded", "mono"] as const;
export type DateFontFamily = (typeof DATE_FONT_FAMILIES)[number];
export const DATE_FONT_WEIGHTS = ["regular", "bold", "heavy"] as const;
export type DateFontWeight = (typeof DATE_FONT_WEIGHTS)[number];

export const DATE_FONT_STACKS: Record<DateFontFamily, string> = {
  system: "inherit",
  sans: '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Helvetica Neue", Arial, sans-serif',
  serif: '"Batang", "AppleMyungjo", "Noto Serif KR", Georgia, "Times New Roman", serif',
  rounded: 'ui-rounded, "NanumSquareRound", "Arial Rounded MT Bold", "SF Pro Rounded", "Segoe UI", sans-serif',
  mono: '"Cascadia Mono", "D2Coding", Consolas, "SF Mono", Menlo, "Noto Sans Mono", monospace',
};
export const DATE_FONT_WEIGHT_VALUES: Record<DateFontWeight, number> = { regular: 450, bold: 680, heavy: 850 };

export type DateFont = Pick<Settings, "dateFontScale" | "dateFontFamily" | "dateFontWeight" | "dateFontItalic">;
export const DATE_FONT_KEYS = ["dateFontScale", "dateFontFamily", "dateFontWeight", "dateFontItalic"] as const;

export function pickDateFont(source: DateFont): DateFont {
  return {
    dateFontScale: source.dateFontScale,
    dateFontFamily: source.dateFontFamily,
    dateFontWeight: source.dateFontWeight,
    dateFontItalic: source.dateFontItalic,
  };
}

export function sameDateFont(a: DateFont, b: DateFont): boolean {
  return DATE_FONT_KEYS.every((key) => a[key] === b[key]);
}

function normalizeDateFont(input: Partial<DateFont> | null | undefined): DateFont {
  return {
    dateFontScale: input?.dateFontScale === undefined ? 1 : clampDateFontScale(Number(input.dateFontScale)),
    dateFontFamily: (DATE_FONT_FAMILIES as readonly string[]).includes(input?.dateFontFamily as string)
      ? (input?.dateFontFamily as DateFontFamily)
      : "system",
    dateFontWeight: (DATE_FONT_WEIGHTS as readonly string[]).includes(input?.dateFontWeight as string)
      ? (input?.dateFontWeight as DateFontWeight)
      : "bold",
    dateFontItalic: Boolean(input?.dateFontItalic),
  };
}

/** The date font for the window or for full screen. */
export function dateFontFor(settings: Settings, fullscreen: boolean): DateFont {
  return fullscreen && settings.fullscreenDateFont ? settings.fullscreenDateFont : pickDateFont(settings);
}

/** The settings change that applies a date font change to the window or to full screen. */
export function dateFontPatch(settings: Settings, fullscreen: boolean, patch: Partial<DateFont>): Partial<Settings> {
  return fullscreen ? { fullscreenDateFont: { ...dateFontFor(settings, true), ...patch } } : patch;
}

export const MIN_DATE_FONT_SCALE = 0.6;
export const MAX_DATE_FONT_SCALE = 1.8;

export function clampDateFontScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.round(Math.min(MAX_DATE_FONT_SCALE, Math.max(MIN_DATE_FONT_SCALE, value)) * 100) / 100;
}

function normalizeWindowSize(value: unknown): Settings["windowSize"] {
  if (!value || typeof value !== "object") return null;
  const { width, height } = value as { width?: unknown; height?: unknown };
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 200) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

/** The add-event row plus one event line. */
export const MIN_EVENTS_HEIGHT = 48;
export const MAX_EVENTS_HEIGHT = 1200;

export function clampEventsHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.eventsHeight;
  return Math.round(Math.min(MAX_EVENTS_HEIGHT, Math.max(MIN_EVENTS_HEIGHT, value)));
}

export const STORAGE_KEY = "mycalendar.settings.v1";

/** Whether the calendar is in full screen, so the settings window edits the font that is on screen. */
export const FULLSCREEN_KEY = "mycalendar.fullscreen";

export function readFullscreen(): boolean {
  try {
    return localStorage.getItem(FULLSCREEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFullscreen(on: boolean): void {
  try {
    localStorage.setItem(FULLSCREEN_KEY, on ? "1" : "0");
  } catch {
    // Without storage the settings window simply starts on the window font.
  }
}

export const DEFAULT_SETTINGS: Settings = {
  language: null,
  themeId: "dark-ink",
  opacity: 0.8,
  countryCode: "KR",
  weekStartsOn: 0,
  showLunar: true,
  alwaysOnTop: false,
  autostart: false,
  eventsCollapsed: false,
  eventsHeight: 176,
  defaultReminder: 10,
  dateFontScale: 1,
  dateFontFamily: "system",
  dateFontWeight: "bold",
  dateFontItalic: false,
  fullscreenDateFont: null,
  windowSize: null,
};

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.opacity;
  return Math.min(1, Math.max(MIN_OPACITY, value));
}

/** Settings transparency 0–100 maps onto background opacity 1–MIN_OPACITY. */
export function opacityFromTransparency(transparency: number): number {
  const percent = Math.min(100, Math.max(0, Number.isFinite(transparency) ? transparency : 0));
  return 1 - (percent / 100) * (1 - MIN_OPACITY);
}

export function transparencyFromOpacity(opacity: number): number {
  return Math.round(((1 - clampOpacity(opacity)) / (1 - MIN_OPACITY)) * 100);
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
    weekStartsOn: isWeekday(input?.weekStartsOn) ? input.weekStartsOn : DEFAULT_SETTINGS.weekStartsOn,
    showLunar: typeof input?.showLunar === "boolean" ? input.showLunar : DEFAULT_SETTINGS.showLunar,
    alwaysOnTop: Boolean(input?.alwaysOnTop),
    autostart: Boolean(input?.autostart),
    eventsCollapsed: Boolean(input?.eventsCollapsed),
    eventsHeight: Number(input?.eventsHeight) > 0 ? clampEventsHeight(Number(input?.eventsHeight)) : DEFAULT_SETTINGS.eventsHeight,
    defaultReminder:
      input && "defaultReminder" in input
        ? isReminder(input.defaultReminder)
          ? input.defaultReminder
          : null
        : DEFAULT_SETTINGS.defaultReminder,
    ...normalizeDateFont(input),
    fullscreenDateFont:
      input?.fullscreenDateFont && typeof input.fullscreenDateFont === "object"
        ? normalizeDateFont(input.fullscreenDateFont)
        : null,
    windowSize: normalizeWindowSize(input?.windowSize),
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
