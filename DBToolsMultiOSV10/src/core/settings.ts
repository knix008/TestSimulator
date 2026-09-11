// Port of App/AppSettings.cs + RecentFilesManager.cs
import type { DbTargetType, RelationshipLineStyle } from '../types';
import { DB_TARGET_TYPES } from '../types';
import { ALL_LEVELS, cumulativeLevelsUpTo, type NormalizationLevel } from './analysis/normalization';
import { getHost, type AppSettingsData } from '../platform';
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from '../render/theme';
import type { Language } from '../i18n';
import {
  DEFAULT_REPORT_PREFS,
  normalizeReportPrefs,
  type ReportPrefs,
} from './export/reportOptions';

export interface UserPreferences {
  Language: Language;
  Theme: ThemeId;
  DefaultDbType: DbTargetType;
  DefaultLineStyle: RelationshipLineStyle;
  RecentFilesMaxCount: number;
  ShowGrid: boolean;
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
  DefaultDbType: 'SQLite',
  DefaultLineStyle: 'Straight',
  RecentFilesMaxCount: 10,
  ShowGrid: false,
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

  return {
    Language: raw.Language === 'en' ? 'en' : 'ko',
    Theme: isThemeId(raw.Theme) ? raw.Theme : DEFAULT_THEME_ID,
    DefaultDbType: dbType,
    DefaultLineStyle: lineStyle,
    RecentFilesMaxCount: clamp(raw.RecentFilesMaxCount ?? 10, 1, 50),
    ShowGrid: !!raw.ShowGrid,
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
    DefaultDbType: prefs.DefaultDbType,
    DefaultLineStyle: prefs.DefaultLineStyle,
    RecentFilesMaxCount: prefs.RecentFilesMaxCount,
    ShowGrid: prefs.ShowGrid,
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
