import crypto from "node:crypto";
import { BUILTIN_MERGE_TOOL, isBuiltinMergeTool } from "./mergeTool.js";
import { DEFAULT_THEME_ID, isThemeId, setCustomThemes, type CustomTheme } from "./themes.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extensionDefaults, extensionPatch, SETTING_EXTENSIONS } from "./settingsExtensions.js";

export type AppLanguage = "ko" | "en";

export type LastSession = {
  mode: "local" | "remote";
  path: string;
  remoteUrl?: string | null;
};

export type AppSettings = {
  language: AppLanguage;
  theme: string;
  recentRepositoryPaths: string[];
  recentCloneUrls: string[];
  lastSession: LastSession | null;
  commitCategories: string[];
  externalDiffToolPath: string;
  externalDiffToolArguments: string;
  externalMergeToolPath: string;
  externalMergeToolArguments: string;
  gitUsername: string;
  gitTokenProtected: string;
  reuseCredentials: boolean;
  terminalShell: string;
  /** Feature settings (core/settingsExtensions.ts): showTutorial, startScreen, prompt, user themes. */
  [extension: string]: unknown;
};

export const DEFAULT_COMMIT_CATEGORIES = [
  "기능추가",
  "기능변경",
  "기능삭제",
  "버그수정",
  "문서",
  "리팩토링",
  "성능개선",
  "테스트",
  "기타",
];

const MAX_RECENT = 10;

/** The settings folder name; src-tauri/src/main.rs and the installer hooks use it too. */
export const SETTINGS_FOLDER = "MyGitMaster";
/** Written by the Windows installer (src-tauri/windows/hooks.nsh) with the language picked
 *  on its first page; the next start makes it the app's language and deletes it. */
export const INSTALL_LANGUAGE_FILE = "install-language";
/** The folder the Electron build (MyGitJS) used; its settings are copied over once. */
const LEGACY_FOLDER = "MyGitJS";

function configBase(): string {
  const home = os.homedir();
  if (process.platform === "win32") return process.env.APPDATA || path.join(home, "AppData", "Roaming");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support");
  return process.env.XDG_CONFIG_HOME || path.join(home, ".config");
}

function settingsDirectory(): string {
  if (process.env.MGM_SETTINGS_DIR) return process.env.MGM_SETTINGS_DIR;
  const dir = path.join(configBase(), SETTINGS_FOLDER);
  migrateLegacySettings(path.join(configBase(), LEGACY_FOLDER), dir);
  return dir;
}

/** Copies settings.json and the token key of an older install into a folder that has none. */
export function migrateLegacySettings(legacyDir: string, dir: string): boolean {
  if (fs.existsSync(path.join(dir, "settings.json")) || !fs.existsSync(path.join(legacyDir, "settings.json"))) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ["settings.json", ".key"]) {
      const from = path.join(legacyDir, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, name));
    }
    return true;
  } catch {
    return false;
  }
}

export function remoteCacheDirectory(): string {
  if (process.env.MGM_CACHE_DIR) return path.join(process.env.MGM_CACHE_DIR, "remote-cache");
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), SETTINGS_FOLDER, "remote-cache");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Caches", SETTINGS_FOLDER, "remote-cache");
  }
  return path.join(process.env.XDG_CACHE_HOME || path.join(home, ".cache"), SETTINGS_FOLDER, "remote-cache");
}

function defaults(): AppSettings {
  return {
    language: "ko",
    theme: DEFAULT_THEME_ID,
    recentRepositoryPaths: [],
    recentCloneUrls: [],
    lastSession: null,
    commitCategories: [...DEFAULT_COMMIT_CATEGORIES],
    externalDiffToolPath: "",
    externalDiffToolArguments: "\"{left}\" \"{right}\"",
    externalMergeToolPath: BUILTIN_MERGE_TOOL,
    externalMergeToolArguments: "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"",
    gitUsername: "",
    gitTokenProtected: "",
    reuseCredentials: false,
    terminalShell: "",
    ...extensionDefaults(),
  };
}

export class SettingsStore {
  private readonly file: string;
  private readonly keyFile: string;
  private data: AppSettings;

  constructor(directory?: string) {
    const dir = directory || settingsDirectory();
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "settings.json");
    this.keyFile = path.join(dir, ".key");
    this.data = this.load();
    this.applyInstallLanguage(path.join(dir, INSTALL_LANGUAGE_FILE));
    // The core draws with themes too (the terminal prompt): it must know the user's.
    setCustomThemes(this.data.customThemes as CustomTheme[] | undefined);
  }

  get(): AppSettings {
    return this.data;
  }

  publicView() {
    const token = this.getToken();
    return {
      language: this.data.language,
      theme: this.data.theme,
      recentRepositoryPaths: this.data.recentRepositoryPaths,
      recentCloneUrls: this.data.recentCloneUrls,
      lastSession: this.data.lastSession,
      commitCategories: this.data.commitCategories,
      externalDiffToolPath: this.data.externalDiffToolPath,
      externalDiffToolArguments: this.data.externalDiffToolArguments,
      externalMergeToolPath: this.data.externalMergeToolPath,
      externalMergeToolArguments: this.data.externalMergeToolArguments,
      gitUsername: this.data.gitUsername,
      hasCredentials: Boolean(token),
      reuseCredentials: this.data.reuseCredentials,
      terminalShell: this.data.terminalShell,
      ...Object.fromEntries(SETTING_EXTENSIONS.map((item) => [item.key, this.data[item.key]])),
      settingsPath: this.file,
    };
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.data, ...patch, ...extensionPatch(patch) };
    if (patch.commitCategories) {
      next.commitCategories = normalizeCategories(patch.commitCategories);
    }
    this.data = next;
    this.save();
    return this.data;
  }

  resetPreferences(): AppSettings {
    const fresh = defaults();
    this.data = {
      ...this.data,
      language: fresh.language,
      theme: fresh.theme,
      terminalShell: fresh.terminalShell,
      externalDiffToolPath: fresh.externalDiffToolPath,
      externalDiffToolArguments: fresh.externalDiffToolArguments,
      externalMergeToolPath: fresh.externalMergeToolPath,
      externalMergeToolArguments: fresh.externalMergeToolArguments,
      ...Object.fromEntries(SETTING_EXTENSIONS.filter((item) => item.resetOnRestore).map((item) => [item.key, fresh[item.key]])),
    };
    this.save();
    return this.data;
  }

  rememberRepository(repoPath: string, session: LastSession): void {
    const recent = [repoPath, ...this.data.recentRepositoryPaths.filter((p) => !samePath(p, repoPath))].slice(0, MAX_RECENT);
    this.data = { ...this.data, recentRepositoryPaths: recent, lastSession: session };
    this.save();
  }

  removeRepository(repoPath: string): void {
    this.data = {
      ...this.data,
      recentRepositoryPaths: this.data.recentRepositoryPaths.filter((item) => !samePath(item, repoPath)),
    };
    this.save();
  }

  clearRepositories(): void {
    this.data = { ...this.data, recentRepositoryPaths: [] };
    this.save();
  }

  rememberCloneUrl(url: string): void {
    const trimmed = url.trim();
    if (!trimmed) return;
    const recent = [trimmed, ...this.data.recentCloneUrls.filter((u) => u !== trimmed)].slice(0, MAX_RECENT);
    this.data = { ...this.data, recentCloneUrls: recent };
    this.save();
  }

  removeCloneUrl(url: string): void {
    this.data = { ...this.data, recentCloneUrls: this.data.recentCloneUrls.filter((u) => u !== url) };
    this.save();
  }

  setCredentials(username: string, token: string, reuse: boolean): void {
    this.data = {
      ...this.data,
      gitUsername: username.trim(),
      gitTokenProtected: token.trim() ? this.encrypt(token.trim()) : "",
      reuseCredentials: reuse && Boolean(token.trim()),
    };
    this.save();
  }

  markCredentialFailure(): void {
    this.data = { ...this.data, reuseCredentials: false };
    this.save();
  }

  markCredentialSuccess(): void {
    if (this.data.gitTokenProtected) {
      this.data = { ...this.data, reuseCredentials: true };
      this.save();
    }
  }

  getToken(): string {
    if (!this.data.gitTokenProtected) return "";
    try {
      return this.decrypt(this.data.gitTokenProtected);
    } catch {
      return "";
    }
  }

  private load(): AppSettings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<AppSettings>;
      const merged = { ...defaults(), ...parsed, ...extensionPatch(parsed) } as AppSettings;
      if (!merged.commitCategories?.length) merged.commitCategories = [...DEFAULT_COMMIT_CATEGORIES];
      if (!isThemeId(merged.theme, merged.customThemes as { id: string }[])) merged.theme = DEFAULT_THEME_ID;
      if (merged.terminalShell && !fs.existsSync(merged.terminalShell)) merged.terminalShell = "";
      if (!merged.externalMergeToolPath?.trim()) merged.externalMergeToolPath = BUILTIN_MERGE_TOOL;
      else if (isBuiltinMergeTool(merged.externalMergeToolPath)) merged.externalMergeToolPath = BUILTIN_MERGE_TOOL;
      merged.recentRepositoryPaths = (Array.isArray(merged.recentRepositoryPaths) ? merged.recentRepositoryPaths : [])
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .slice(0, MAX_RECENT);
      return merged;
    } catch {
      return defaults();
    }
  }

  /** Once per install: the language chosen in the installer wins over the saved one. */
  private applyInstallLanguage(file: string): void {
    let chosen: string;
    try {
      chosen = fs.readFileSync(file, "utf8").replace(/^﻿/, "").trim();
    } catch {
      return;
    }
    if (chosen === "ko" || chosen === "en") {
      this.data = { ...this.data, language: chosen };
      this.save();
    }
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* read-only folder: it is applied again next start, which is harmless */
    }
  }

  private save(): void {
    setCustomThemes(this.data.customThemes as CustomTheme[] | undefined);
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
  }

  private key(): Buffer {
    if (!fs.existsSync(this.keyFile)) {
      fs.writeFileSync(this.keyFile, crypto.randomBytes(32));
    }
    const raw = fs.readFileSync(this.keyFile);
    return raw.length === 32 ? raw : crypto.createHash("sha256").update(raw).digest();
  }

  private encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key(), iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
  }

  private decrypt(payload: string): string {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  }
}

function normalizeCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const category of categories) {
    const value = category.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    result.push(value);
    if (result.length >= 30) break;
  }
  return result.length ? result : [...DEFAULT_COMMIT_CATEGORIES];
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
