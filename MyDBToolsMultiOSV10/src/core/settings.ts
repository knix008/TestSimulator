// Port of App/AppSettings.cs + RecentFilesManager.cs
import type { DbTargetType, RelationshipLineStyle } from '../types';
import { DB_TARGET_TYPES } from '../types';
import { ALL_LEVELS, cumulativeLevelsUpTo, type NormalizationLevel } from './analysis/normalization';
import { getHost, type AppSettingsData } from '../platform';
import {
  DEFAULT_THEME_ID,
  isCanvasBackdrop,
  isThemeId,
  normalizeCustomThemes,
  registerCustomThemes,
  type CanvasBackdrop,
  type CustomTheme,
  type ThemeId,
} from '../render/theme';
import type { Language } from '../i18n';
import {
  DEFAULT_REPORT_PREFS,
  normalizeReportPrefs,
  type ReportPrefs,
} from './export/reportOptions';

/** The start screen's moving background (Start screen › Moving background). */
export interface StartBackgroundPrefs {
  /** Animate at all; off leaves a still picture. */
  On: boolean;
  /** One of the twenty animations (components/startBackground.js). */
  Kind: string;
  /** 0–300 %, 100 = as designed. */
  Speed: number;
  /** How opaque the cards over it are, 20–100 %. */
  CardOpacity: number;
  /** Pick a different animation every time the app starts. */
  RandomOnStart: boolean;
  /** Change the animation automatically every so many seconds while the start screen is open (0 = never). */
  Interval: number;
}

/** Where the movable start-screen cards are: their order, width in columns and height. */
export interface StartLayoutPrefs {
  Order: string[];
  /** Columns (1–3) per card. */
  Span: Record<string, number>;
  /** Fixed height in px per card; absent = fit the content. */
  Height: Record<string, number>;
}

export const START_INTERVALS = [0, 15, 30, 60, 120, 300];
export const START_CARDS = ['create', 'recent', 'help', 'samples', 'background'];
export const DEFAULT_START_LAYOUT: StartLayoutPrefs = {
  Order: [...START_CARDS],
  Span: { create: 1, recent: 1, help: 1, samples: 3, background: 3 },
  Height: {},
};
export const DEFAULT_START_BACKGROUND: StartBackgroundPrefs = {
  On: true,
  Kind: 'aurora',
  Speed: 100,
  CardOpacity: 85,
  RandomOnStart: true,
  Interval: 60,
};

const ANIMATION_NAMES = [
  'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'flowchart', 'starfield', 'rain', 'snow',
  'fireflies', 'ripples', 'coderain', 'hexagons', 'orbits', 'lava', 'spiral', 'confetti', 'nodes', 'ribbons',
];

export function normalizeStartBackground(value: unknown): StartBackgroundPrefs {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<StartBackgroundPrefs>;
  const d = DEFAULT_START_BACKGROUND;
  const num = (x: unknown, min: number, max: number, fallback: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.min(max, Math.max(min, x))) : fallback;
  return {
    On: v.On !== false,
    Kind: typeof v.Kind === 'string' && ANIMATION_NAMES.includes(v.Kind) ? v.Kind : d.Kind,
    Speed: num(v.Speed, 0, 300, d.Speed),
    CardOpacity: num(v.CardOpacity, 20, 100, d.CardOpacity),
    RandomOnStart: v.RandomOnStart !== false,
    Interval: START_INTERVALS.includes(Number(v.Interval)) ? Number(v.Interval) : d.Interval,
  };
}

export function normalizeStartLayout(value: unknown): StartLayoutPrefs {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<StartLayoutPrefs>;
  const known = Array.isArray(v.Order) ? v.Order.filter((id) => START_CARDS.includes(id)) : [];
  const order = [...new Set([...known, ...START_CARDS])];
  const span: Record<string, number> = {};
  const height: Record<string, number> = {};
  for (const id of START_CARDS) {
    const s = Number(v.Span?.[id]);
    span[id] = s >= 1 && s <= 3 ? Math.round(s) : DEFAULT_START_LAYOUT.Span[id];
    const h = Number(v.Height?.[id]);
    if (Number.isFinite(h) && h >= 120 && h <= 2000) height[id] = Math.round(h);
  }
  return { Order: order, Span: span, Height: height };
}

/** A different animation from `current`, at random. */
export function randomAnimation(current: string, random: () => number = Math.random): string {
  const others = ANIMATION_NAMES.filter((k) => k !== current);
  return others[Math.floor(random() * others.length) % others.length];
}

export interface UserPreferences {
  Language: Language;
  Theme: ThemeId;
  /** Themes the user made (Settings > Custom themes). */
  CustomThemes: CustomTheme[];
  /** What the canvas shows behind the diagram, in the theme's colours. */
  CanvasBackdrop: CanvasBackdrop;
  /** Show the start screen when the app starts. */
  ShowStartScreen: boolean;
  StartBackground: StartBackgroundPrefs;
  StartLayout: StartLayoutPrefs;
  DefaultDbType: DbTargetType;
  DefaultLineStyle: RelationshipLineStyle;
  RecentFilesMaxCount: number;
  ShowGrid: boolean;
  /** Rulers on the canvas edges (with the red pointer line). */
  ShowRulers: boolean;
  /** Where two relationship lines cross, one hops over the other. */
  LineBridges: boolean;
  SnapToGrid: boolean;
  SnapInterval: number;
  NormalizationLevels: NormalizationLevel[];
  RightPanelWidth: number;
  /** Image exports leave the area around the diagram unpainted. */
  ImageExportTransparent: boolean;
  /** Cover page, heading numbering, running header and footer. */
  Report: ReportPrefs;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  Language: 'ko',
  Theme: DEFAULT_THEME_ID,
  CustomThemes: [],
  CanvasBackdrop: 'dots',
  ShowStartScreen: true,
  StartBackground: { ...DEFAULT_START_BACKGROUND },
  StartLayout: { ...DEFAULT_START_LAYOUT },
  DefaultDbType: 'SQLite',
  DefaultLineStyle: 'Straight',
  RecentFilesMaxCount: 10,
  ShowGrid: false,
  ShowRulers: true,
  LineBridges: true,
  SnapToGrid: false,
  SnapInterval: 20,
  NormalizationLevels: ['NF1'],
  RightPanelWidth: 340,
  ImageExportTransparent: true,
  Report: { ...DEFAULT_REPORT_PREFS },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNormalizationLevels(
  levelsValue: string | undefined,
  legacyLevelValue?: string,
): NormalizationLevel[] {
  if (levelsValue && levelsValue.trim()) {
    const levels = levelsValue
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s): s is NormalizationLevel => (ALL_LEVELS as string[]).includes(s));
    return levels.length > 0 ? levels : ['NF1'];
  }
  if (legacyLevelValue && (ALL_LEVELS as string[]).includes(legacyLevelValue)) {
    return cumulativeLevelsUpTo(legacyLevelValue as NormalizationLevel);
  }
  return ['NF1'];
}

export async function loadPreferences(): Promise<UserPreferences> {
  const raw = (await getHost().readSettings()) as
    | (Partial<AppSettingsData> & { NormalizationLevel?: string })
    | null;
  if (!raw) return { ...DEFAULT_PREFERENCES };

  const dbType = DB_TARGET_TYPES.includes(raw.DefaultDbType as DbTargetType)
    ? (raw.DefaultDbType as DbTargetType)
    : DEFAULT_PREFERENCES.DefaultDbType;
  const lineStyle = ['Straight', 'Curved', 'Orthogonal'].includes(raw.DefaultLineStyle ?? '')
    ? (raw.DefaultLineStyle as RelationshipLineStyle)
    : DEFAULT_PREFERENCES.DefaultLineStyle;

  // Registered before the theme is looked up, so a custom theme id resolves.
  const customThemes = normalizeCustomThemes(raw.CustomThemes);
  registerCustomThemes(customThemes);
  const themeKnown =
    isThemeId(raw.Theme) &&
    (!raw.Theme.startsWith('custom-') || customThemes.some((c) => c.id === raw.Theme));

  return {
    Language: raw.Language === 'en' ? 'en' : 'ko',
    Theme: themeKnown ? (raw.Theme as ThemeId) : DEFAULT_THEME_ID,
    CustomThemes: customThemes,
    CanvasBackdrop: isCanvasBackdrop(raw.CanvasBackdrop) ? raw.CanvasBackdrop : DEFAULT_PREFERENCES.CanvasBackdrop,
    ShowStartScreen: raw.ShowStartScreen !== false,
    StartBackground: (() => {
      const bg = normalizeStartBackground(raw.StartBackground);
      // "Random on start": every launch begins with a different animation.
      return bg.RandomOnStart ? { ...bg, Kind: randomAnimation(bg.Kind) } : bg;
    })(),
    StartLayout: normalizeStartLayout(raw.StartLayout),
    DefaultDbType: dbType,
    DefaultLineStyle: lineStyle,
    RecentFilesMaxCount: clamp(raw.RecentFilesMaxCount ?? 10, 1, 50),
    ShowGrid: !!raw.ShowGrid,
    ShowRulers: raw.ShowRulers !== false,
    LineBridges: raw.LineBridges !== false,
    SnapToGrid: !!raw.SnapToGrid,
    SnapInterval: raw.SnapInterval ? clamp(raw.SnapInterval, 5, 100) : 20,
    NormalizationLevels: parseNormalizationLevels(raw.NormalizationLevels, raw.NormalizationLevel),
    RightPanelWidth: clamp(raw.RightPanelWidth ?? 340, 260, 720),
    // Absent in settings written by an older build, and the default is on.
    ImageExportTransparent: raw.ImageExportTransparent !== false,
    // Settings written by an older build have no Report block; normalize fills
    // in every field from the defaults rather than leaving holes.
    Report: normalizeReportPrefs(raw.Report),
  };
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  await getHost().writeSettings({
    Language: prefs.Language,
    Theme: prefs.Theme,
    CustomThemes: prefs.CustomThemes,
    CanvasBackdrop: prefs.CanvasBackdrop,
    ShowStartScreen: prefs.ShowStartScreen,
    StartBackground: { ...prefs.StartBackground },
    StartLayout: prefs.StartLayout,
    DefaultDbType: prefs.DefaultDbType,
    DefaultLineStyle: prefs.DefaultLineStyle,
    RecentFilesMaxCount: prefs.RecentFilesMaxCount,
    ShowGrid: prefs.ShowGrid,
    ShowRulers: prefs.ShowRulers,
    LineBridges: prefs.LineBridges,
    SnapToGrid: prefs.SnapToGrid,
    SnapInterval: prefs.SnapInterval,
    NormalizationLevels: prefs.NormalizationLevels.join(','),
    RightPanelWidth: prefs.RightPanelWidth,
    ImageExportTransparent: prefs.ImageExportTransparent,
    Report: { ...prefs.Report },
  });
}

/** Port of RecentFilesManager — most-recent-first, de-duplicated, capped. */
export async function loadRecentFiles(): Promise<string[]> {
  return getHost().readRecentFiles();
}

export async function pushRecentFile(path: string, maxCount: number): Promise<string[]> {
  const host = getHost();
  const existing = await host.readRecentFiles();
  const next = [path, ...existing.filter((p) => p !== path)].slice(0, Math.max(1, maxCount));
  await host.writeRecentFiles(next);
  return next;
}

export async function clearRecentFiles(): Promise<string[]> {
  await getHost().writeRecentFiles([]);
  return [];
}
