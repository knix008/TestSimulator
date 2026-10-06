/**
 * The settings model: the shape, the defaults and the validation.
 *
 * Nothing here touches the file system — `settingsStore.ts` does that — because the
 * renderer needs the same types, constants and `sanitize` as the server, and a single
 * `node:fs` import in this module would drag a stub of it into the browser bundle.
 */
import {
  DEFAULT_CUSTOM_THEME,
  DEFAULT_HEADER_COLORS,
  DEFAULT_THEME,
  isThemeId,
  type CustomTheme,
} from "./themes.js";
import type { Language } from "./i18n.js";
import { sanitizeSessions, type SavedSession } from "./sessions.js";

/** Folder names a directory comparison skips unless the user says otherwise. */
export const DEFAULT_EXCLUDES = [
  ".git", "node_modules", "dist", "dist-server", "release", "bin", "obj", "__pycache__",
];

/** What a recent entry points at; the icon and the reopen action follow from it. */
export type RecentKind = "files" | "directories" | "merge" | "conflict" | "repository" | "session";

export type RecentEntry = {
  kind: RecentKind;
  /** One path for conflict/repository/session, two for files/directories, four for a merge. */
  paths: string[];
  /** Milliseconds since the epoch, so the list can be shown newest first. */
  at: number;
};

export type FontSettings = {
  family: string;
  size: number;
  weight: "normal" | "bold";
  style: "normal" | "italic";
};

export type PrintSettings = {
  paper: "A4" | "Letter" | "Legal" | "A3";
  orientation: "portrait" | "landscape";
  /** Millimetres, applied to all four edges. */
  margin: number;
  lineNumbers: boolean;
  colorBackgrounds: boolean;
  headerFooter: boolean;
};

export type WindowSettings = {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
};

export type AppSettings = {
  language: Language;
  theme: string;
  font: FontSettings;
  /** Percent; Ctrl+Wheel and the View menu move it. */
  zoom: number;
  /** The four colours behind the `custom` theme. */
  customTheme: CustomTheme;

  wordWrap: boolean;
  wordHighlight: boolean;
  ignoreWhitespace: boolean;
  /** The grammar rules: what in a line does not count as a difference. */
  ignoreComments: boolean;
  ignoreQuoteStyle: boolean;
  ignoreNumberFormat: boolean;
  /** Colour the code by its grammar. */
  syntaxHighlight: boolean;
  ignoreCase: boolean;
  /** Hide the unchanged stretches of a comparison, keeping a few lines of context. */
  differencesOnly: boolean;
  excludes: string[];
  /** Only compare files matching these masks (empty means everything). */
  includeMasks: string[];
  /** Never compare files matching these masks. */
  excludeMasks: string[];
  /** Pair a file missing on one side with an identical one on the other. */
  detectRenames: boolean;
  /** List every file in one flat list instead of a folder tree. */
  flatView: boolean;
  /** Walk into zip-format archives and compare what is inside them. */
  archives: boolean;

  /** The two side panels, which a merge tab uses and nothing else does. */
  showLeftPanel: boolean;
  showRightPanel: boolean;
  showStatusBar: boolean;
  /** The activity log across the bottom of the window. */
  showLogPanel: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  logPanelHeight: number;
  /** How the git view divides its row, as the left pane's share (0.2–0.8). */
  gitSplit: number;

  confirmExit: boolean;
  restoreSession: boolean;

  headerColors: { base: string; local: string; remote: string; result: string };
  print: PrintSettings;
  window: WindowSettings;

  /** Sessions the user named and kept, newest first. */
  sessions: SavedSession[];
  recent: RecentEntry[];
  /** Directories the file pickers return to, newest first. */
  recentDirectories: string[];
  /** Everything needed to reopen the tabs that were open at exit. */
  lastSession: unknown;
};

export const MAX_RECENT = 10;
export const MAX_RECENT_DIRECTORIES = 20;
export const MIN_FONT_SIZE = 7;
export const MAX_FONT_SIZE = 32;
/** The two side panels open at the same width and share one floor. */
export const DEFAULT_PANEL_WIDTH = 252;
export const MIN_PANEL_WIDTH = 200;
export const DEFAULT_LOG_HEIGHT = 140;
export const MIN_LOG_HEIGHT = 72;
export const MAX_LOG_HEIGHT = 420;
export const MAX_PANEL_WIDTH = 560;
/** What the comparison itself needs before the window stops being useful. */
export const MIN_WORKSPACE = 520;
export const MIN_ZOOM = 50;
export const MAX_ZOOM = 300;

export const DEFAULT_FONT_FAMILY =
  "Consolas, 'D2Coding', 'Cascadia Mono', 'Nanum Gothic Coding', 'Courier New', monospace";

export function defaultSettings(): AppSettings {
  return {
    language: "ko",
    theme: DEFAULT_THEME,
    font: { family: DEFAULT_FONT_FAMILY, size: 13, weight: "normal", style: "normal" },
    zoom: 100,
    customTheme: { ...DEFAULT_CUSTOM_THEME },

    wordWrap: false,
    wordHighlight: true,
    ignoreWhitespace: false,
    ignoreComments: false,
    ignoreQuoteStyle: false,
    ignoreNumberFormat: false,
    syntaxHighlight: true,
    ignoreCase: false,
    differencesOnly: false,
    excludes: [...DEFAULT_EXCLUDES],
    includeMasks: [],
    excludeMasks: [],
    detectRenames: true,
    flatView: false,
    archives: true,

    showLeftPanel: true,
    showRightPanel: true,
    showStatusBar: true,
    showLogPanel: false,
    leftPanelWidth: MIN_PANEL_WIDTH,
    rightPanelWidth: DEFAULT_PANEL_WIDTH,
    logPanelHeight: DEFAULT_LOG_HEIGHT,
    gitSplit: 0.5,

    confirmExit: true,
    restoreSession: true,

    headerColors: {
      base: DEFAULT_HEADER_COLORS.base,
      local: DEFAULT_HEADER_COLORS.left,
      remote: DEFAULT_HEADER_COLORS.right,
      result: DEFAULT_HEADER_COLORS.result,
    },
    print: {
      paper: "A4",
      orientation: "portrait",
      margin: 12,
      lineNumbers: true,
      colorBackgrounds: true,
      headerFooter: true,
    },
    window: { width: 1360, height: 860, x: null, y: null, maximized: false },

    sessions: [],
    recent: [],
    recentDirectories: [],
    lastSession: null,
  };
}

/**
 * Identity of a recent entry: the same paths opened the same way is one item.
 * The separator is a control character so it cannot occur inside a path.
 */
const RECENT_SEPARATOR = String.fromCharCode(31);

export function recentKey(entry: Pick<RecentEntry, "kind" | "paths">): string {
  return `${entry.kind}:${entry.paths.join(RECENT_SEPARATOR)}`;
}

export function sanitize(value: AppSettings): AppSettings {
  const defaults = defaultSettings();
  const font = value.font ?? defaults.font;
  const print = value.print ?? defaults.print;
  const colors = value.headerColors ?? defaults.headerColors;

  return {
    language: value.language === "en" ? "en" : "ko",
    theme: isThemeId(value.theme) ? value.theme : defaults.theme,
    font: {
      family: typeof font.family === "string" && font.family.trim() ? font.family.trim() : defaults.font.family,
      size: clamp(Number(font.size), MIN_FONT_SIZE, MAX_FONT_SIZE, defaults.font.size),
      weight: font.weight === "bold" ? "bold" : "normal",
      style: font.style === "italic" ? "italic" : "normal",
    },
    zoom: clamp(Number(value.zoom), MIN_ZOOM, MAX_ZOOM, defaults.zoom),
    customTheme: {
      kind: value.customTheme?.kind === "dark" ? "dark" : "light",
      bg: hexColor(value.customTheme?.bg, defaults.customTheme.bg),
      panel: hexColor(value.customTheme?.panel, defaults.customTheme.panel),
      text: hexColor(value.customTheme?.text, defaults.customTheme.text),
      accent: hexColor(value.customTheme?.accent, defaults.customTheme.accent),
    },

    wordWrap: Boolean(value.wordWrap),
    wordHighlight: value.wordHighlight !== false,
    ignoreWhitespace: Boolean(value.ignoreWhitespace),
    ignoreComments: Boolean(value.ignoreComments),
    ignoreQuoteStyle: Boolean(value.ignoreQuoteStyle),
    ignoreNumberFormat: Boolean(value.ignoreNumberFormat),
    syntaxHighlight: value.syntaxHighlight !== false,
    ignoreCase: Boolean(value.ignoreCase),
    differencesOnly: Boolean(value.differencesOnly),
    excludes: Array.isArray(value.excludes)
      ? value.excludes.map((item) => String(item).trim()).filter(Boolean).slice(0, 60)
      : defaults.excludes,
    includeMasks: masks(value.includeMasks),
    excludeMasks: masks(value.excludeMasks),
    detectRenames: value.detectRenames !== false,
    flatView: value.flatView === true,
    archives: value.archives !== false,

    showLeftPanel: value.showLeftPanel !== false,
    showRightPanel: value.showRightPanel !== false,
    showStatusBar: value.showStatusBar !== false,
    showLogPanel: value.showLogPanel === true,
    // The floor is what the panels' own labels need to stay on one line.
    leftPanelWidth: clamp(Number(value.leftPanelWidth), MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, defaults.leftPanelWidth),
    rightPanelWidth: clamp(Number(value.rightPanelWidth), MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, defaults.rightPanelWidth),
    logPanelHeight: clamp(Number(value.logPanelHeight), MIN_LOG_HEIGHT, MAX_LOG_HEIGHT, defaults.logPanelHeight),
    gitSplit: clamp(Number(value.gitSplit), 0.2, 0.8, defaults.gitSplit),

    confirmExit: value.confirmExit !== false,
    restoreSession: value.restoreSession !== false,

    headerColors: {
      base: hexColor(colors.base, defaults.headerColors.base),
      local: hexColor(colors.local, defaults.headerColors.local),
      remote: hexColor(colors.remote, defaults.headerColors.remote),
      result: hexColor(colors.result, defaults.headerColors.result),
    },
    print: {
      paper: ["A4", "Letter", "Legal", "A3"].includes(print.paper) ? print.paper : "A4",
      orientation: print.orientation === "landscape" ? "landscape" : "portrait",
      margin: clamp(Number(print.margin), 0, 50, defaults.print.margin),
      lineNumbers: print.lineNumbers !== false,
      colorBackgrounds: print.colorBackgrounds !== false,
      headerFooter: print.headerFooter !== false,
    },
    window: {
      width: clamp(Number(value.window?.width), 640, 20000, defaults.window.width),
      height: clamp(Number(value.window?.height), 480, 20000, defaults.window.height),
      // `null` means "let the window manager place it"; Number(null) is 0, which
      // would silently pin every new window to the top-left corner.
      x: position(value.window?.x),
      y: position(value.window?.y),
      maximized: Boolean(value.window?.maximized),
    },

    sessions: sanitizeSessions(value.sessions),
    recent: Array.isArray(value.recent)
      ? value.recent
        .filter((item): item is RecentEntry =>
          Boolean(item) && Array.isArray(item.paths) && item.paths.every((p) => typeof p === "string"))
        .map((item) => ({ kind: recentKind(item.kind), paths: item.paths, at: Number(item.at) || 0 }))
        .slice(0, MAX_RECENT)
      : [],
    recentDirectories: Array.isArray(value.recentDirectories)
      ? unique(value.recentDirectories.filter((item) => typeof item === "string" && item))
        .slice(0, MAX_RECENT_DIRECTORIES)
      : [],
    lastSession: value.lastSession ?? null,
  };
}

const RECENT_KINDS: RecentKind[] = ["files", "directories", "merge", "conflict", "repository", "session"];

function recentKind(value: unknown): RecentKind {
  return RECENT_KINDS.includes(value as RecentKind) ? (value as RecentKind) : "files";
}

function position(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function clamp(value: number, low: number, high: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(high, Math.max(low, Math.round(value * 10) / 10));
}

function masks(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 40)
    : [];
}

function hexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

export function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
