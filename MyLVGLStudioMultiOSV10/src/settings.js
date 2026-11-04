// The app's settings: what is stored, its limits and its validation. Pure, so anything read
// from settings.json can be made valid here and the rules can be tested without the UI.
import { CUSTOM_THEME_PREFIX, THEME_COLOR_KEYS, isThemeId, themeById, themeColors } from "./themes.js";
import { BACKGROUND_KINDS, isBackgroundKind } from "./start/backgrounds.js";

export const MAX_CUSTOM_THEMES = 24;
export const MAX_RECENT = 12;
export const SPEED_MIN = 0;
export const SPEED_MAX = 300;
export const SPEED_STEP = 10;
export const DEFAULT_SPEED = 100;
/** The default speed when the system asks for reduced motion: slower, never stopped. */
export const REDUCED_MOTION_SPEED = 40;
export const OPACITY_MIN = 20;
export const OPACITY_MAX = 100;
export const OPACITY_STEP = 5;
export const SHUFFLE_SECONDS = 20;
export const START_CARDS = ["hero", "actions", "recent", "theme", "options", "background"];

export const DEFAULT_START_SCREEN = {
  showOnStartup: true,
  background: BACKGROUND_KINDS[0],
  speed: null,
  shuffle: false,
  cardOpacity: 85,
  order: START_CARDS,
};

const stepped = (value, min, max, step) => Math.max(min, Math.min(max, Math.round(value / step) * step));

export const effectiveSpeed = (speed, reducedMotion) => speed ?? (reducedMotion ? REDUCED_MOTION_SPEED : DEFAULT_SPEED);

/** Every known card exactly once, the saved order first. */
export function sanitizeCardOrder(value) {
  const saved = Array.isArray(value) ? value.filter((id, index) => START_CARDS.includes(id) && value.indexOf(id) === index) : [];
  return [...saved, ...START_CARDS.filter((id) => !saved.includes(id))];
}

export function sanitizeStartScreen(value) {
  const v = value && typeof value === "object" ? value : {};
  const speed = v.speed === undefined || v.speed === null ? NaN : Number(v.speed);
  const opacity = v.cardOpacity === undefined || v.cardOpacity === null ? NaN : Number(v.cardOpacity);
  return {
    showOnStartup: v.showOnStartup !== false,
    background: isBackgroundKind(v.background) ? v.background : DEFAULT_START_SCREEN.background,
    speed: Number.isFinite(speed) ? stepped(speed, SPEED_MIN, SPEED_MAX, SPEED_STEP) : null,
    shuffle: v.shuffle === true,
    cardOpacity: Number.isFinite(opacity) ? stepped(opacity, OPACITY_MIN, OPACITY_MAX, OPACITY_STEP) : DEFAULT_START_SCREEN.cardOpacity,
    order: sanitizeCardOrder(v.order),
  };
}

const ID = /^custom-[a-z0-9][a-z0-9-]{0,39}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** Keeps only well-formed user themes: unique ids, #rrggbb colours, a name. */
export function sanitizeCustomThemes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
    if (!ID.test(id) || seen.has(id)) continue;
    const mode = raw.mode === "dark" ? "dark" : "light";
    const fallback = themeColors(themeById(mode === "dark" ? "dark-midnight" : "light-classic"));
    const colors = {};
    for (const key of THEME_COLOR_KEYS) {
      const color = raw.colors?.[key];
      colors[key] = typeof color === "string" && HEX.test(color) ? color.toLowerCase() : fallback[key];
    }
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : id;
    seen.add(id);
    result.push({ id, name, mode, colors });
    if (result.length >= MAX_CUSTOM_THEMES) break;
  }
  return result;
}

export function newCustomThemeId(existing) {
  for (let index = existing.length + 1; ; index++) {
    const id = `${CUSTOM_THEME_PREFIX}${index}`;
    if (!existing.some((item) => item.id === id)) return id;
  }
}

/** A new user theme copied from any theme, built-in or user. */
export function customThemeFrom(baseId, name, existing) {
  const base = themeById(baseId);
  return { id: newCustomThemeId(existing), name: String(name).trim().slice(0, 40) || base.nameEn, mode: base.mode, colors: themeColors(base) };
}

export function sanitizeRecent(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    if (typeof item !== "string" || !item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= MAX_RECENT) break;
  }
  return result;
}

/** The newest first; the same file (in any case) appears once. */
export const addRecent = (list, file) => sanitizeRecent([file, ...list]);
export const removeRecent = (list, file) => list.filter((item) => item.toLowerCase() !== file.toLowerCase());

/** Anything read from settings.json, made valid. Keys this module does not know are kept. */
export function sanitizeSettings(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const customThemes = sanitizeCustomThemes(v.customThemes);
  return {
    ...v,
    language: v.language === "en" ? "en" : "ko",
    theme: isThemeId(v.theme, customThemes) ? v.theme : "light-classic",
    customThemes,
    startScreen: sanitizeStartScreen(v.startScreen),
    recent: sanitizeRecent(v.recent),
  };
}
