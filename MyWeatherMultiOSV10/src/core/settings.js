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

/** Weather lines that can each carry their own font and base size. The window chrome stays on the default face. */
export const FONT_PARTS = ["city", "date", "temp", "cond", "range", "dust"];
export const FONT_BASE = { city: 44, date: 16, temp: 68, cond: 16, range: 16, dust: 16 };
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 68, 72, 80, 96, 112, 128];

export function sanitizeFontSize(value, part) {
  const number = Math.round(Number(value));
  const base = FONT_BASE[part] || 16;
  if (!Number.isFinite(number)) return base;
  return Math.min(FONT_SIZES[FONT_SIZES.length - 1], Math.max(FONT_SIZES[0], number));
}

export function sanitizeFonts(raw, fallback = "Segoe UI") {
  const source = raw && typeof raw === "object" ? raw : {};
  const base = String(source.fontFamily || fallback || "Segoe UI").trim() || "Segoe UI";
  const sizes = source.sizes && typeof source.sizes === "object" ? source.sizes : {};
  const fonts = { sizes: {} };
  for (const part of FONT_PARTS) {
    const value = source[part];
    const family = value && typeof value === "object" ? value.family || value.fontFamily : value;
    const size = value && typeof value === "object" ? value.size : sizes[part];
    fonts[part] = String(family || "").trim() || base;
    fonts.sizes[part] = sanitizeFontSize(size, part);
  }
  return fonts;
}

/** The first window reads settings.fonts. Another window reads the fonts stored with its own entry. */
export function fontsForWindow(settings, { primary = true, windowKey = "" } = {}) {
  const fallback = String(settings?.fontFamily || "Segoe UI");
  if (primary === false && windowKey) {
    const slot = (settings?.extraWindows || []).find((entry) => entry.key === windowKey);
    if (slot?.fonts) return sanitizeFonts(slot.fonts, fallback);
  }
  return sanitizeFonts(settings?.fonts || { fontFamily: fallback }, fallback);
}

export const DEFAULT_SETTINGS = {
  language: "ko",
  theme: DEFAULT_THEME_ID,
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  transparency: 30,
  fontFamily: "Segoe UI",
  backgroundImage: "",
  backgroundName: "",
  backgroundOpacity: 40,
  lastDirectory: "",
  imageDirectory: "",
  recentFiles: [],
  defaultLocation: { ...DEFAULT_LOCATION },
  cities: [{ ...DEFAULT_LOCATION }],
  extraCities: [],
  rotateSeconds: 0,
  enabledSources: ["ecmwf", "gfs", "jma", "metno", "wttr"],
  zoom: 100,
  units: "C",
  dateFormat: "long",
  displayPriority: "average",
  openAtLogin: false,
  updateHours: 1,
  windowSize: null,
  windowPosition: null,
  windowMaximized: false,
};

export const UPDATE_HOURS = [1, 2, 4, 6, 12, 24];

/** Seconds between automatic city changes in the main window. 0 keeps the shown city. */
export const ROTATE_SECONDS = [0, 3, 5, 10, 30, 60, 300, 600];

export const MAX_CITIES = 12;

/** Cities found by searching online are remembered so the pickers keep offering them. */
export const MAX_EXTRA_CITIES = 60;

export const DISPLAY_PRIORITIES = ["average", "ecmwf", "gfs", "jma", "metno", "wttr"];

export const DATE_FORMATS = ["long", "iso", "dot", "slash", "weekday"];

export function normalizeDateFormat(value) {
  return DATE_FORMATS.includes(value) ? value : DEFAULT_SETTINGS.dateFormat;
}

export function normalizeDisplayPriority(value) {
  return DISPLAY_PRIORITIES.includes(value) ? value : DEFAULT_SETTINGS.displayPriority;
}

export function normalizeRotateSeconds(value) {
  const seconds = Number(value);
  return ROTATE_SECONDS.includes(seconds) ? seconds : DEFAULT_SETTINGS.rotateSeconds;
}

export function normalizePlace(raw, fallback = DEFAULT_LOCATION) {
  const source = raw && typeof raw === "object" ? raw : {};
  const lat = Number(source.lat);
  const lon = Number(source.lon);
  return {
    countryCode: String(source.countryCode || fallback.countryCode),
    countryKo: String(source.countryKo || source.countryEn || fallback.countryKo),
    countryEn: String(source.countryEn || source.countryKo || fallback.countryEn),
    cityKo: String(source.cityKo || source.cityEn || fallback.cityKo),
    cityEn: String(source.cityEn || source.cityKo || fallback.cityEn),
    lat: Number.isFinite(lat) ? lat : Number(fallback.lat),
    lon: Number.isFinite(lon) ? lon : Number(fallback.lon),
  };
}

export function samePlace(one, other) {
  if (!one || !other) return false;
  return one.countryCode === other.countryCode && one.cityEn === other.cityEn;
}

/** The shown city list always holds at least one place so the window never renders empty. */
/** Other weather windows, each keeping the cities that were moved out of the first window. */
function savedWindowBox(entry) {
  const box = {};
  for (const key of ["x", "y", "width", "height"]) {
    const value = Number(entry?.[key]);
    if (Number.isFinite(value)) box[key] = Math.round(value);
  }
  return box;
}

export function sanitizeExtraWindows(raw, fallback = DEFAULT_LOCATION) {
  if (!Array.isArray(raw)) return [];
  const windows = [];
  for (const entry of raw) {
    const list = Array.isArray(entry?.cities) ? entry.cities : [];
    const cities = list
      .filter((item) => item && typeof item === "object" && (item.cityEn || item.cityKo))
      .slice(0, MAX_CITIES)
      .map((item) => normalizePlace(item, fallback));
    const key = String(entry?.key || "");
    if (!key || !cities.length) continue;
    const fonts = entry?.fonts ? sanitizeFonts(entry.fonts) : null;
    windows.push({ key, cities, ...savedWindowBox(entry), ...(fonts ? { fonts } : {}) });
    if (windows.length >= MAX_CITIES) break;
  }
  return windows;
}

/**
 * Remember a city that left one window for a new one. The source window's saved list
 * loses that city, and the new window is stored under its own key.
 */
export function moveCityToWindow(extraWindows, { cities, windowKey, sourceKey, moved } = {}, fallback = DEFAULT_LOCATION) {
  const extra = sanitizeExtraWindows(extraWindows, fallback);
  if (sourceKey && moved) {
    const slot = extra.find((entry) => entry.key === sourceKey);
    if (slot) slot.cities = slot.cities.filter((place) => !samePlace(place, moved));
    const empty = extra.findIndex((entry) => entry.key === sourceKey && !entry.cities.length);
    if (empty >= 0) extra.splice(empty, 1);
  }
  const places = (Array.isArray(cities) ? cities : [])
    .filter((item) => item && typeof item === "object" && (item.cityEn || item.cityKo))
    .slice(0, MAX_CITIES)
    .map((item) => normalizePlace(item, fallback));
  const key = String(windowKey || "");
  if (key && places.length && !extra.some((entry) => entry.key === key)) extra.push({ key, cities: places });
  return extra.slice(0, MAX_CITIES);
}

/**
 * Drop the weather window the user is looking at. The last one stays.
 * Closing the first window hands its place to the oldest other window.
 */
export function removeWeatherWindow(settings, { primary = true, windowKey = "" } = {}) {
  const fallback = settings?.defaultLocation || DEFAULT_LOCATION;
  const extra = sanitizeExtraWindows(settings?.extraWindows, fallback);
  if (1 + extra.length <= 1) return null;
  if (primary === false) {
    const key = String(windowKey || "");
    if (!key || !extra.some((entry) => entry.key === key)) return null;
    return { extraWindows: extra.filter((entry) => entry.key !== key), promoted: null };
  }
  const [promoted, ...rest] = extra;
  return { extraWindows: rest, promoted, cities: promoted.cities, fonts: promoted.fonts || null };
}

export function sanitizeCities(raw, fallback = DEFAULT_LOCATION) {
  const list = Array.isArray(raw) ? raw : [];
  const cities = list
    .filter((entry) => entry && typeof entry === "object" && (entry.cityEn || entry.cityKo))
    .slice(0, MAX_CITIES)
    .map((entry) => normalizePlace(entry, fallback));
  return cities.length ? cities : [normalizePlace(fallback, DEFAULT_LOCATION)];
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
  settings.fontFamily = String(settings.fontFamily || DEFAULT_SETTINGS.fontFamily);
  settings.fonts = sanitizeFonts(source.fonts || { fontFamily: settings.fontFamily }, settings.fontFamily);
  settings.zoom = clamp(settings.zoom || 100, 50, 200);
  settings.units = settings.units === "F" ? "F" : "C";
  settings.dateFormat = normalizeDateFormat(settings.dateFormat);
  settings.displayPriority = normalizeDisplayPriority(settings.displayPriority);
  settings.updateHours = normalizeUpdateHours(settings.updateHours);
  settings.rotateSeconds = normalizeRotateSeconds(settings.rotateSeconds);
  settings.backgroundImage = typeof settings.backgroundImage === "string" ? settings.backgroundImage : "";
  settings.backgroundName = typeof settings.backgroundName === "string" ? settings.backgroundName : "";
  settings.lastDirectory = typeof settings.lastDirectory === "string" ? settings.lastDirectory : "";
  settings.imageDirectory = typeof settings.imageDirectory === "string" ? settings.imageDirectory : "";
  settings.recentFiles = Array.isArray(settings.recentFiles) ? settings.recentFiles.filter(Boolean).slice(0, 10) : [];
  const known = new Set(["ecmwf", "gfs", "jma", "metno", "wttr"]);
  settings.enabledSources = Array.isArray(settings.enabledSources)
    ? settings.enabledSources.filter((id) => known.has(id))
    : [...DEFAULT_SETTINGS.enabledSources];
  settings.openAtLogin = Boolean(settings.openAtLogin);
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
  settings.defaultLocation = normalizePlace(settings.defaultLocation);
  settings.cities = sanitizeCities(source.cities, settings.defaultLocation);
  settings.extraWindows = sanitizeExtraWindows(source.extraWindows, settings.defaultLocation);
  settings.extraCities = (Array.isArray(source.extraCities) ? source.extraCities : [])
    .filter((entry) => entry && typeof entry === "object" && entry.countryCode && (entry.cityEn || entry.cityKo))
    .slice(0, MAX_EXTRA_CITIES)
    .map((entry) => normalizePlace(entry, settings.defaultLocation));
  return settings;
}
