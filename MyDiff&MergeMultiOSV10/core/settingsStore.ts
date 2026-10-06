/**
 * Settings persistence: where `settings.json` lives and how it is read and written.
 *
 * Separate from `settings.ts` so that the model — types, defaults, validation — can be
 * shared with the browser, which has no file system to persist to.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SETTINGS_FOLDER } from "./appInfo.js";
import {
  defaultSettings,
  MAX_RECENT,
  MAX_RECENT_DIRECTORIES,
  recentKey,
  sanitize,
  unique,
  type AppSettings,
  type RecentEntry,
} from "./settings.js";

export function settingsDirectory(): string {
  const override = process.env.MDM_SETTINGS_DIR;
  if (override) return override;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), SETTINGS_FOLDER);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", SETTINGS_FOLDER);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), SETTINGS_FOLDER);
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

  /** Puts the preferences back to their defaults but keeps the history. */
  resetPreferences(): AppSettings {
    const defaults = defaultSettings();
    this.current = sanitize({
      ...defaults,
      recent: this.current.recent,
      recentDirectories: this.current.recentDirectories,
      lastSession: this.current.lastSession,
      window: this.current.window,
    });
    this.write();
    return this.current;
  }

  addRecent(entry: Omit<RecentEntry, "at">): AppSettings {
    const key = recentKey(entry);
    const recent: RecentEntry[] = [
      { ...entry, paths: [...entry.paths], at: Date.now() },
      ...this.current.recent.filter((item) => recentKey(item) !== key),
    ].slice(0, MAX_RECENT);
    // Opening a file also remembers the folder it came from, which is where the
    // next Open dialog starts.
    const directories = [
      ...entry.paths.map((item) => path.dirname(item)),
      ...this.current.recentDirectories,
    ];
    return this.update({
      recent,
      recentDirectories: unique(directories).slice(0, MAX_RECENT_DIRECTORIES),
    });
  }

  removeRecent(key: string): AppSettings {
    return this.update({ recent: this.current.recent.filter((item) => recentKey(item) !== key) });
  }

  clearRecent(): AppSettings {
    return this.update({ recent: [] });
  }

  rememberDirectory(directory: string): AppSettings {
    if (!directory) return this.current;
    return this.update({
      recentDirectories: unique([directory, ...this.current.recentDirectories]).slice(0, MAX_RECENT_DIRECTORIES),
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
      /* a read-only profile keeps the settings in memory for this run */
    }
  }
}
