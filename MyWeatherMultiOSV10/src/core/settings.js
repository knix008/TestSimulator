import { FONT_STYLES } from "./fonts.js";
import { WINDOW_MIN } from "../ui/window-spec.js";
import { DEFAULT_CUSTOM_THEME, DEFAULT_THEME_ID, isTheme, sanitizeCustomTheme } from "./themes.js";

const LEGACY_THEMES = {
  light: "light-paper",
  dark: "dark-ink",
  ocean: "light-sky",
  sunset: "light-peach",
  forest: "dark-forest",
  midnight: "dark-midnight",
  contrast: "dark-obsidian",
  aurora: "dark-aurora",
};

export const DEFAULT_LOCATION = {
  countryCode: "KR",
  countryKo: "대한민국",
  countryEn: "South Korea",
  cityKo: "서울",
  cityEn: "Seoul",
  lat: 37.5665,
  lon: 126.978,
};

export const DEFAULT_SETTINGS = {
  language: "ko",
  theme: DEFAULT_THEME_ID,
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  transparency: 30,
  fontFamily: "Segoe UI",
  fontSize: 14,
  fontStyle: "normal",
  backgroundImage: "",
  backgroundName: "",
  backgroundOpacity: 40,
  lastDirectory: "",
  imageDirectory: "",
  recentFiles: [],
  defaultLocation: { ...DEFAULT_LOCATION },
  enabledSources: ["ecmwf", "gfs", "jma", "metno", "wttr"],
  zoom: 100,
  units: "C",
  displayPriority: "average",
  reopenLast: false,
  updateHours: 1,
  windowSize: null,
  windowPosition: null,
  windowMaximized: false,
};

export const UPDATE_HOURS = [1, 2, 4, 6, 12, 24];

export const DISPLAY_PRIORITIES = ["average", "ecmwf", "gfs", "jma", "metno", "wttr"];

export function normalizeDisplayPriority(value) {
  return DISPLAY_PRIORITIES.includes(value) ? value : DEFAULT_SETTINGS.displayPriority;
}

export function normalizeUpdateHours(value) {
  const hours = Number(value);
  return UPDATE_HOURS.includes(hours) ? hours : DEFAULT_SETTINGS.updateHours;
}

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function sanitizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...source,
    defaultLocation: { ...DEFAULT_LOCATION, ...(source.defaultLocation || {}) },
  };
  delete settings.opacity;
  delete settings.panels;
  settings.language = settings.language === "en" ? "en" : "ko";
  const migrated = LEGACY_THEMES[settings.theme] || settings.theme;
  settings.theme = isTheme(migrated) ? migrated : DEFAULT_SETTINGS.theme;
  settings.customTheme = sanitizeCustomTheme(settings.customTheme);
  settings.transparency = clamp(settings.transparency ?? DEFAULT_SETTINGS.transparency, 0, 100);
  settings.backgroundOpacity = clamp(settings.backgroundOpacity ?? DEFAULT_SETTINGS.backgroundOpacity, 0, 100);
  settings.fontSize = clamp(settings.fontSize || 14, 8, 72);
  settings.fontStyle = FONT_STYLES.includes(settings.fontStyle) ? settings.fontStyle : "normal";
  settings.fontFamily = String(settings.fontFamily || DEFAULT_SETTINGS.fontFamily);
  settings.zoom = clamp(settings.zoom || 100, 50, 200);
  settings.units = settings.units === "F" ? "F" : "C";
  settings.displayPriority = normalizeDisplayPriority(settings.displayPriority);
  settings.updateHours = normalizeUpdateHours(settings.updateHours);
  settings.backgroundImage = typeof settings.backgroundImage === "string" ? settings.backgroundImage : "";
  settings.backgroundName = typeof settings.backgroundName === "string" ? settings.backgroundName : "";
  settings.lastDirectory = typeof settings.lastDirectory === "string" ? settings.lastDirectory : "";
  settings.imageDirectory = typeof settings.imageDirectory === "string" ? settings.imageDirectory : "";
  settings.recentFiles = Array.isArray(settings.recentFiles) ? settings.recentFiles.filter(Boolean).slice(0, 10) : [];
  const known = new Set(["ecmwf", "gfs", "jma", "metno", "wttr"]);
  settings.enabledSources = Array.isArray(settings.enabledSources)
    ? settings.enabledSources.filter((id) => known.has(id))
    : [...DEFAULT_SETTINGS.enabledSources];
  settings.reopenLast = Boolean(settings.reopenLast);
  const size = settings.windowSize;
  settings.windowSize =
    size && Number(size.width) >= WINDOW_MIN.width && Number(size.height) >= WINDOW_MIN.height
      ? { width: Math.round(Number(size.width)), height: Math.round(Number(size.height)) }
      : null;
  const position = settings.windowPosition;
  settings.windowPosition =
    position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))
      ? { x: Math.round(Number(position.x)), y: Math.round(Number(position.y)) }
      : null;
  settings.windowMaximized = Boolean(settings.windowMaximized);
  settings.defaultLocation.lat = Number(settings.defaultLocation.lat);
  settings.defaultLocation.lon = Number(settings.defaultLocation.lon);
  return settings;
}
