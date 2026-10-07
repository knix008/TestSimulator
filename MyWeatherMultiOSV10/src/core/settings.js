import { FONT_STYLES } from "./fonts.js";
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
  recentFiles: [],
  defaultLocation: { ...DEFAULT_LOCATION },
  enabledSources: ["ecmwf", "gfs", "jma", "metno", "wttr"],
  zoom: 100,
  units: "C",
  reopenLast: false,
  windowSize: null,
};

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
  settings.backgroundOpacity = clamp(settings.backgroundOpacity, 0, 100);
  settings.fontSize = clamp(settings.fontSize || 14, 8, 72);
  settings.fontStyle = FONT_STYLES.includes(settings.fontStyle) ? settings.fontStyle : "normal";
  settings.fontFamily = String(settings.fontFamily || DEFAULT_SETTINGS.fontFamily);
  settings.zoom = clamp(settings.zoom || 100, 50, 200);
  settings.units = settings.units === "F" ? "F" : "C";
  settings.backgroundImage = typeof settings.backgroundImage === "string" ? settings.backgroundImage : "";
  settings.backgroundName = typeof settings.backgroundName === "string" ? settings.backgroundName : "";
  settings.lastDirectory = typeof settings.lastDirectory === "string" ? settings.lastDirectory : "";
  settings.recentFiles = Array.isArray(settings.recentFiles) ? settings.recentFiles.filter(Boolean).slice(0, 10) : [];
  const known = new Set(["ecmwf", "gfs", "jma", "metno", "wttr"]);
  settings.enabledSources = Array.isArray(settings.enabledSources)
    ? settings.enabledSources.filter((id) => known.has(id))
    : [...DEFAULT_SETTINGS.enabledSources];
  settings.reopenLast = Boolean(settings.reopenLast);
  const size = settings.windowSize;
  settings.windowSize =
    size && Number(size.width) >= 200 && Number(size.height) >= 200
      ? { width: Math.round(Number(size.width)), height: Math.round(Number(size.height)) }
      : null;
  settings.defaultLocation.lat = Number(settings.defaultLocation.lat);
  settings.defaultLocation.lon = Number(settings.defaultLocation.lon);
  return settings;
}
