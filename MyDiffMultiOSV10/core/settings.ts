import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_EXCLUDES } from "./dirCompare.js";
import { DEFAULT_LEFT_HEADER, DEFAULT_RIGHT_HEADER, isThemeId, type ThemeId } from "./themes.js";

export type AppLanguage = "ko" | "en";

export type FilePair = { left: string; right: string };

export type AppSettings = {
  language: AppLanguage;
  theme: ThemeId;
  paneFontSize: number;
  wordWrap: boolean;
  /** Highlight the changed words inside a modified line. */
  wordHighlight: boolean;
  leftHeaderColor: string;
  rightHeaderColor: string;
  /** Folder names skipped by directory compare. */
  excludes: string[];
  /** Re-read git changes periodically while the Git tab is open. */
  autoRefresh: boolean;
  window: { width: number; height: number; maximized: boolean };
  lastFiles: FilePair | null;
  lastDirectories: FilePair | null;
  lastRepository: string | null;
  recentRepositories: string[];
};

export const MIN_FONT_SIZE = 7;
export const MAX_FONT_SIZE = 24;
const MAX_RECENT = 12;

export function defaultSettings(): AppSettings {
  return {
    language: "ko",
    theme: "light",
    paneFontSize: 13,
    wordWrap: false,
    wordHighlight: true,
    leftHeaderColor: DEFAULT_LEFT_HEADER,
    rightHeaderColor: DEFAULT_RIGHT_HEADER,
    excludes: [...DEFAULT_EXCLUDES],
    autoRefresh: true,
    window: { width: 1280, height: 820, maximized: false },
    lastFiles: null,
    lastDirectories: null,
    lastRepository: null,
    recentRepositories: [],
  };
}

export function settingsDirectory(): string {
  const override = process.env.MYDIFF_SETTINGS_DIR;
  if (override) return override;
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "MyDiffJS");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "MyDiffJS");
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(config, "MyDiffJS");
}

export function settingsPath(): string {
  return path.join(settingsDirectory(), "settings.json");
}

/** Reads, validates and writes `settings.json`; unknown or invalid values fall back. */
export class SettingsStore {
  private current: AppSettings;

  constructor() {
    this.current = this.read();
  }

  get(): AppSettings {
    return this.current;
  }

  publicView(): AppSettings & { settingsPath: string } {
    return { ...this.current, settingsPath: settingsPath() };
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.current = sanitize({ ...this.current, ...patch });
    this.write();
    return this.current;
  }

  resetPreferences(): AppSettings {
    const defaults = defaultSettings();
    this.current = sanitize({
      ...defaults,
      lastFiles: this.current.lastFiles,
      lastDirectories: this.current.lastDirectories,
      lastRepository: this.current.lastRepository,
      recentRepositories: this.current.recentRepositories,
    });
    this.write();
    return this.current;
  }

  rememberFiles(pair: FilePair | null): void {
    this.update({ lastFiles: pair });
  }

  rememberDirectories(pair: FilePair | null): void {
    this.update({ lastDirectories: pair });
  }

  rememberRepository(repo: string): void {
    const recent = [repo, ...this.current.recentRepositories.filter((item) => item !== repo)].slice(0, MAX_RECENT);
    this.update({ lastRepository: repo, recentRepositories: recent });
  }

  forgetRepository(repo: string): void {
    this.update({
      recentRepositories: this.current.recentRepositories.filter((item) => item !== repo),
      lastRepository: this.current.lastRepository === repo ? null : this.current.lastRepository,
    });
  }

  private read(): AppSettings {
    try {
      const raw = fs.readFileSync(settingsPath(), "utf8");
      return sanitize({ ...defaultSettings(), ...(JSON.parse(raw) as Partial<AppSettings>) });
    } catch {
      return defaultSettings();
    }
  }

  private write(): void {
    try {
      fs.mkdirSync(settingsDirectory(), { recursive: true });
      fs.writeFileSync(settingsPath(), `${JSON.stringify(this.current, null, 2)}\n`, "utf8");
    } catch {
      /* a read-only profile keeps the in-memory settings */
    }
  }
}

export function sanitize(value: AppSettings): AppSettings {
  const defaults = defaultSettings();
  return {
    language: value.language === "en" ? "en" : "ko",
    theme: isThemeId(value.theme) ? value.theme : defaults.theme,
    paneFontSize: clampFont(value.paneFontSize),
    wordWrap: Boolean(value.wordWrap),
    wordHighlight: value.wordHighlight !== false,
    leftHeaderColor: color(value.leftHeaderColor, defaults.leftHeaderColor),
    rightHeaderColor: color(value.rightHeaderColor, defaults.rightHeaderColor),
    excludes: Array.isArray(value.excludes)
      ? value.excludes.map((item) => String(item).trim()).filter(Boolean).slice(0, 40)
      : defaults.excludes,
    autoRefresh: value.autoRefresh !== false,
    window: {
      width: size(value.window?.width, defaults.window.width),
      height: size(value.window?.height, defaults.window.height),
      maximized: Boolean(value.window?.maximized),
    },
    lastFiles: pair(value.lastFiles),
    lastDirectories: pair(value.lastDirectories),
    lastRepository: typeof value.lastRepository === "string" && value.lastRepository ? value.lastRepository : null,
    recentRepositories: Array.isArray(value.recentRepositories)
      ? value.recentRepositories.filter((item) => typeof item === "string" && item).slice(0, MAX_RECENT)
      : [],
  };
}

function clampFont(value: unknown): number {
  const size = Number(value);
  if (!Number.isFinite(size)) return defaultSettings().paneFontSize;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size * 2) / 2));
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function size(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 480 && number <= 10_000 ? Math.round(number) : fallback;
}

function pair(value: unknown): FilePair | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FilePair>;
  if (typeof candidate.left !== "string" || typeof candidate.right !== "string") return null;
  if (!candidate.left && !candidate.right) return null;
  return { left: candidate.left, right: candidate.right };
}
