// Application settings: defaults, validation, and persistence in localStorage
// (shared by the main window and the popup windows, which watch it).
import { normalizeCustom, THEME_IDS } from '../themes.js';

export const STORAGE_KEY = 'mykanban.settings.v1';
export const RECENT_KEY = 'mykanban.recent.v1';
export const SESSION_KEY = 'mykanban.session.v1';

export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800];
export const FONT_STYLES = ['normal', 'italic'];
export const FONT_SIZE = { min: 9, max: 28 };
export const ZOOM = { min: 30, max: 300, step: 10 };
export const BACKGROUND_FITS = ['cover', 'contain', 'tile', 'center', 'stretch'];
export const DENSITIES = ['comfortable', 'compact'];

export function defaultSettings(language = 'ko') {
  return {
    language,
    theme: 'light',
    customTheme: normalizeCustom(null),
    fontFamily: '',
    fontSize: 14,
    fontWeight: 400,
    fontStyle: 'normal',
    zoom: 100,
    backgroundImage: null,
    backgroundName: '',
    backgroundOpacity: 35,
    backgroundFit: 'cover',
    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    lastDirectory: null,
    confirmDelete: true,
    restoreSession: true,
    cardDensity: 'comfortable',
    showCardDetails: true,
    newBoardColumns: language === 'en' ? 'To do, Doing, Done' : '할 일, 진행 중, 완료',
    statusClock: true,
  };
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

/** Fills gaps and repairs out-of-range values. */
export function normalizeSettings(raw = {}, language) {
  const base = defaultSettings(raw.language === 'en' || raw.language === 'ko' ? raw.language : language);
  const s = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.language = s.language === 'en' ? 'en' : 'ko';
  s.theme = THEME_IDS.includes(s.theme) ? s.theme : base.theme;
  s.customTheme = normalizeCustom(s.customTheme);
  s.fontFamily = typeof s.fontFamily === 'string' ? s.fontFamily : '';
  s.fontSize = clamp(s.fontSize, FONT_SIZE.min, FONT_SIZE.max, base.fontSize);
  s.fontWeight = FONT_WEIGHTS.includes(Number(s.fontWeight)) ? Number(s.fontWeight) : base.fontWeight;
  s.fontStyle = FONT_STYLES.includes(s.fontStyle) ? s.fontStyle : base.fontStyle;
  delete s.transparency;
  s.zoom = clamp(s.zoom, ZOOM.min, ZOOM.max, 100);
  s.backgroundOpacity = clamp(s.backgroundOpacity, 0, 100, base.backgroundOpacity);
  s.backgroundFit = BACKGROUND_FITS.includes(s.backgroundFit) ? s.backgroundFit : base.backgroundFit;
  s.backgroundImage = typeof s.backgroundImage === 'string' && s.backgroundImage ? s.backgroundImage : null;
  s.cardDensity = DENSITIES.includes(s.cardDensity) ? s.cardDensity : base.cardDensity;
  s.lastDirectory = typeof s.lastDirectory === 'string' && s.lastDirectory ? s.lastDirectory : null;
  for (const key of ['showLeftPanel', 'showRightPanel', 'showStatusBar', 'confirmDelete', 'restoreSession', 'showCardDetails', 'statusClock']) {
    s[key] = typeof s[key] === 'boolean' ? s[key] : base[key];
  }
  s.newBoardColumns = typeof s.newBoardColumns === 'string' ? s.newBoardColumns : base.newBoardColumns;
  return s;
}

const systemLanguage = () => (String(globalThis.navigator?.language ?? 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en');

export function loadSettings(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : {}, systemLanguage());
  } catch {
    return normalizeSettings({}, systemLanguage());
  }
}

export function storeSettings(storage, settings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export const columnTitles = (text) => String(text ?? '').split(',').map((title) => title.trim()).filter(Boolean);
