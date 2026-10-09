import { FONT_FLAGS, FONT_STYLES, fontStyleOf } from "./fonts.js";
import { DEFAULT_CUSTOM_THEME, DEFAULT_THEME_ID, isTheme, sanitizeCustomTheme } from "./themes.js";
import { CURRENCIES, findMarket } from "../market/markets.js";
import { SOURCE_IDS } from "../market/providers.js";

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

/** The board the app opens with: Korea, a short watchlist, prices against the won. */
export const DEFAULT_BOARD = {
  marketCode: "KR",
  countryKo: "대한민국",
  countryEn: "South Korea",
  marketKo: "한국거래소",
  marketEn: "Korea Exchange",
  currency: "KRW",
  index: "^KS11",
  indexKo: "코스피",
  indexEn: "KOSPI",
  baseCurrency: "KRW",
  symbols: [
    { symbol: "005930.KS", code: "005930", marketCode: "KR", nameKo: "삼성전자", nameEn: "Samsung Electronics" },
    { symbol: "000660.KS", code: "000660", marketCode: "KR", nameKo: "SK하이닉스", nameEn: "SK hynix" },
    { symbol: "035420.KS", code: "035420", marketCode: "KR", nameKo: "NAVER", nameEn: "NAVER" },
  ],
  activeSymbol: "005930.KS",
};

export const DEFAULT_SETTINGS = {
  language: "ko",
  theme: DEFAULT_THEME_ID,
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  transparency: 30,
  fontFamily: "Segoe UI",
  fontSize: 14,
  fontStyle: "normal",
  fontBold: false,
  fontItalic: false,
  fontUnderline: false,
  fontStrike: false,
  backgroundImage: "",
  backgroundName: "",
  backgroundOpacity: 40,
  lastDirectory: "",
  imageDirectory: "",
  recentFiles: [],
  defaultBoard: cloneBoard(DEFAULT_BOARD),
  enabledSources: [...SOURCE_IDS],
  zoom: 100,
  units: "native",
  rateCurrencies: ["USD", "JPY", "EUR", "CNY"],
  sceneMode: "single",
  rotateSeconds: 0,
  baseCurrency: "KRW",
  displayPriority: "average",
  startAtLogin: false,
  updateMinutes: 10,
  windowSize: null,
  windowPosition: null,
  windowMaximized: false,
};

/**
 * How often prices are fetched again. Quotes move all day, so the choice
 * starts at a minute; the long ends are for leaving the window open.
 */
export const UPDATE_MINUTES = [1, 2, 5, 10, 15, 30, 60, 120, 240, 360, 720, 1440];

export const DISPLAY_PRIORITIES = ["average", ...SOURCE_IDS];

/** Prices either keep their own currency or are converted to the base currency. */
export const PRICE_UNITS = ["native", "base"];

/** The window shows one watched symbol at a time, or the whole watchlist. */
export const SCENE_MODES = ["single", "all"];

/** How often the single-symbol window moves to the next symbol. 0 turns it off. */
export const ROTATE_SECONDS = [0, 3, 5, 10, 30, 60];

export const MAX_SYMBOLS = 20;

/**
 * Each window keeps its own board and its own place on the screen; everything
 * else - language, theme, font, sources - is one setting for every window.
 */
export const WINDOW_FIELDS = ["defaultBoard", "windowSize", "windowPosition", "windowMaximized"];

/** The main process owns this list, so a window never writes it back. */
export const WINDOW_LIST_FIELD = "windows";

/** At most this many windows besides the first. */
export const MAX_EXTRA_WINDOWS = 15;

/** Settings without the per-window part, for telling the other windows what changed. */
export function sharedSettings(settings) {
  const shared = { ...(settings && typeof settings === "object" ? settings : {}) };
  for (const field of WINDOW_FIELDS) delete shared[field];
  delete shared[WINDOW_LIST_FIELD];
  return shared;
}

/**
 * The windows opened besides the first one. A slot is an id, a board, and the
 * last rectangle; a slot that lost its id or its board is dropped.
 */
export function sanitizeWindowSlots(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const slots = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const id = String(entry.id || "").trim();
    if (!/^w[0-9a-z]+$/i.test(id) || seen.has(id)) continue;
    seen.add(id);
    const bounds = entry.bounds && typeof entry.bounds === "object" ? entry.bounds : null;
    const rect =
      bounds && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(bounds[key])))
        ? {
            x: Math.round(Number(bounds.x)),
            y: Math.round(Number(bounds.y)),
            width: Math.round(Number(bounds.width)),
            height: Math.round(Number(bounds.height)),
          }
        : null;
    slots.push({ id, board: sanitizeBoard(entry.board), bounds: rect });
    if (slots.length >= MAX_EXTRA_WINDOWS) break;
  }
  return slots;
}

/** A short name for a window in the tray: its market and the first symbols it watches. */
export function windowLabel(board, language, index) {
  const safe = sanitizeBoard(board);
  const ko = language !== "en";
  const market = ko ? safe.marketKo : safe.marketEn;
  const names = safe.symbols.slice(0, 2).map((entry) => (ko ? entry.nameKo : entry.nameEn));
  const more = safe.symbols.length > 2 ? (ko ? ` 외 ${safe.symbols.length - 2}` : ` +${safe.symbols.length - 2}`) : "";
  const list = names.length ? ` · ${names.join(", ")}${more}` : "";
  return `${index + 1}. ${market}${list}`;
}

/** The rate panel grows with its list, so the list has a ceiling the screen can hold. */
export const MAX_RATE_CURRENCIES = 12;

export function normalizeDisplayPriority(value) {
  return DISPLAY_PRIORITIES.includes(value) ? value : DEFAULT_SETTINGS.displayPriority;
}

export function normalizeUpdateMinutes(value) {
  const minutes = Number(value);
  if (UPDATE_MINUTES.includes(minutes)) return minutes;
  // Not one of the offered steps: take the nearest, so a hand-edited or
  // older settings file still lands on something sensible.
  if (Number.isFinite(minutes) && minutes > 0) {
    return UPDATE_MINUTES.reduce((best, step) => (Math.abs(step - minutes) < Math.abs(best - minutes) ? step : best));
  }
  return DEFAULT_SETTINGS.updateMinutes;
}

export function normalizeSceneMode(value) {
  return SCENE_MODES.includes(value) ? value : DEFAULT_SETTINGS.sceneMode;
}

export function normalizeRotateSeconds(value) {
  const seconds = Number(value);
  return ROTATE_SECONDS.includes(seconds) ? seconds : DEFAULT_SETTINGS.rotateSeconds;
}

export function normalizeCurrency(value) {
  const code = String(value || "").toUpperCase();
  return CURRENCIES.includes(code) ? code : DEFAULT_SETTINGS.baseCurrency;
}

/** Known codes only, no repeats, never the base itself, and never more than the panel can show. */
export function normalizeRateCurrencies(value, base) {
  const home = String(base || "").toUpperCase();
  const seen = new Set();
  const list = [];
  for (const entry of Array.isArray(value) ? value : DEFAULT_SETTINGS.rateCurrencies) {
    const code = String(entry || "").toUpperCase();
    if (!CURRENCIES.includes(code) || code === home || seen.has(code)) continue;
    seen.add(code);
    list.push(code);
    if (list.length >= MAX_RATE_CURRENCIES) break;
  }
  return list;
}

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function cloneBoard(board) {
  return {
    ...board,
    symbols: (board.symbols || []).map((entry) => ({ ...entry })),
  };
}

export function sanitizeBoard(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const market = findMarket(source.marketCode) || findMarket(DEFAULT_BOARD.marketCode);
  const symbols = Array.isArray(source.symbols)
    ? source.symbols
        .filter((entry) => entry && typeof entry === "object" && entry.symbol)
        .map((entry) => ({
          symbol: String(entry.symbol),
          code: String(entry.code || String(entry.symbol).split(".")[0]),
          marketCode: String(entry.marketCode || market.marketCode),
          nameKo: String(entry.nameKo || entry.nameEn || entry.symbol),
          nameEn: String(entry.nameEn || entry.nameKo || entry.symbol),
        }))
    : cloneBoard(DEFAULT_BOARD).symbols;
  const unique = [];
  const seen = new Set();
  for (const entry of symbols) {
    if (seen.has(entry.symbol) || unique.length >= MAX_SYMBOLS) continue;
    seen.add(entry.symbol);
    unique.push(entry);
  }
  const active = unique.some((entry) => entry.symbol === source.activeSymbol) ? String(source.activeSymbol) : unique[0]?.symbol || "";
  return {
    marketCode: market.marketCode,
    countryKo: market.countryKo,
    countryEn: market.countryEn,
    marketKo: market.marketKo,
    marketEn: market.marketEn,
    currency: market.currency,
    index: market.index,
    indexKo: market.indexKo,
    indexEn: market.indexEn,
    baseCurrency: normalizeCurrency(source.baseCurrency || market.currency),
    symbols: unique,
    activeSymbol: active,
  };
}

export function sanitizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...source,
    defaultBoard: sanitizeBoard(source.defaultBoard || DEFAULT_SETTINGS.defaultBoard),
  };
  delete settings.opacity;
  delete settings.panels;
  delete settings.defaultLocation;
  settings.language = settings.language === "en" ? "en" : "ko";
  const migrated = LEGACY_THEMES[settings.theme] || settings.theme;
  settings.theme = isTheme(migrated) ? migrated : DEFAULT_SETTINGS.theme;
  settings.customTheme = sanitizeCustomTheme(settings.customTheme);
  settings.transparency = clamp(settings.transparency ?? DEFAULT_SETTINGS.transparency, 0, 100);
  settings.backgroundOpacity = clamp(settings.backgroundOpacity ?? DEFAULT_SETTINGS.backgroundOpacity, 0, 100);
  settings.fontSize = clamp(settings.fontSize || 14, 8, 72);
  settings.fontStyle = FONT_STYLES.includes(settings.fontStyle) ? settings.fontStyle : "normal";
  // Before the four switches there was one style choice; it still decides bold
  // and italic for a file that has never stored the switches.
  if (source.fontBold == null) settings.fontBold = settings.fontStyle === "bold" || settings.fontStyle === "bolditalic";
  if (source.fontItalic == null) settings.fontItalic = settings.fontStyle === "italic" || settings.fontStyle === "bolditalic";
  for (const flag of FONT_FLAGS) settings[flag] = Boolean(settings[flag]);
  settings.fontStyle = fontStyleOf(settings.fontBold, settings.fontItalic);
  settings.fontFamily = String(settings.fontFamily || DEFAULT_SETTINGS.fontFamily);
  settings.zoom = clamp(settings.zoom || 100, 50, 200);
  settings.units = PRICE_UNITS.includes(settings.units) ? settings.units : DEFAULT_SETTINGS.units;
  settings.sceneMode = normalizeSceneMode(settings.sceneMode);
  settings.rotateSeconds = normalizeRotateSeconds(settings.rotateSeconds);
  settings.baseCurrency = normalizeCurrency(settings.baseCurrency);
  settings.rateCurrencies = normalizeRateCurrencies(settings.rateCurrencies, settings.baseCurrency);
  settings.displayPriority = normalizeDisplayPriority(settings.displayPriority);
  // Settings written before the interval moved to minutes stored whole hours.
  // The defaults always carry `updateMinutes`, so the raw input decides.
  const legacyHours = Number(source.updateHours);
  const chosenMinutes =
    source.updateMinutes != null
      ? source.updateMinutes
      : Number.isFinite(legacyHours) && legacyHours > 0
        ? legacyHours * 60
        : DEFAULT_SETTINGS.updateMinutes;
  settings.updateMinutes = normalizeUpdateMinutes(chosenMinutes);
  delete settings.updateHours;
  settings.backgroundImage = typeof settings.backgroundImage === "string" ? settings.backgroundImage : "";
  settings.backgroundName = typeof settings.backgroundName === "string" ? settings.backgroundName : "";
  settings.lastDirectory = typeof settings.lastDirectory === "string" ? settings.lastDirectory : "";
  settings.imageDirectory = typeof settings.imageDirectory === "string" ? settings.imageDirectory : "";
  settings.recentFiles = Array.isArray(settings.recentFiles) ? settings.recentFiles.filter(Boolean).slice(0, 10) : [];
  const known = new Set(SOURCE_IDS);
  settings.enabledSources = Array.isArray(settings.enabledSources)
    ? settings.enabledSources.filter((id) => known.has(id))
    : [...DEFAULT_SETTINGS.enabledSources];
  settings.startAtLogin = Boolean(settings.startAtLogin);
  // The "reopen last file" switch never reopened anything; it is gone.
  delete settings.reopenLast;
  // Any real size is kept; the window's own minimum is applied where it is used,
  // so a window shrunk to that minimum still comes back at that minimum.
  const size = settings.windowSize;
  settings.windowSize =
    size && Number.isFinite(Number(size.width)) && Number.isFinite(Number(size.height)) && Number(size.width) >= 1 && Number(size.height) >= 1
      ? { width: Math.round(Number(size.width)), height: Math.round(Number(size.height)) }
      : null;
  const position = settings.windowPosition;
  settings.windowPosition =
    position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))
      ? { x: Math.round(Number(position.x)), y: Math.round(Number(position.y)) }
      : null;
  settings.windowMaximized = Boolean(settings.windowMaximized);
  settings.defaultBoard.baseCurrency = settings.baseCurrency;
  return settings;
}
