/**
 * The terminal prompt's settings (Preferences › Prompt and Prompt editor):
 *
 *   promptConfig    the prompt itself (blocks of segments), or null for the default preset
 *   promptGitMode   how much git the prompt shows: off | branch | status
 *   promptPresetId  the preset the prompt came from, "" once it has been edited
 *   customPrompts   prompts the user saved by name (kept by Restore defaults)
 *
 * Same keys and meaning as MyTerminalMultiOSV10; core/promptCore.js sanitises them.
 */
import {
  customPromptsAsPresets,
  DEFAULT_PROMPT_GIT_MODE,
  normalizeCustomPrompts,
  normalizePrompt,
  normalizePromptGitMode,
  resolvePromptFromSettings,
} from "./promptCore.js";
import type { SettingExtension } from "./settingsExtensions.js";
import { themeById } from "./themes.js";

export const PROMPT_SETTINGS: SettingExtension[] = [
  {
    key: "promptConfig",
    defaults: () => null,
    sanitize: (value) => (value && typeof value === "object" && !Array.isArray(value) ? normalizePrompt(value) : null),
    resetOnRestore: true,
  },
  {
    key: "promptGitMode",
    defaults: () => DEFAULT_PROMPT_GIT_MODE,
    sanitize: (value) => normalizePromptGitMode(value),
    resetOnRestore: true,
  },
  {
    key: "promptPresetId",
    defaults: () => "default",
    sanitize: (value) => (typeof value === "string" ? value.slice(0, 80) : ""),
    resetOnRestore: true,
  },
  {
    key: "customPrompts",
    defaults: () => [],
    sanitize: (value) => normalizeCustomPrompts(value).slice(0, 50),
    resetOnRestore: false,
  },
];

/** The prompt a terminal draws, from saved settings (unknown keys fall back to defaults). */
export function promptFromSettings(settings: Record<string, unknown>): { config: unknown; gitMode: string } {
  const custom = customPromptsAsPresets(settings.customPrompts);
  const { config } = resolvePromptFromSettings(
    { promptConfig: settings.promptConfig, promptPresetId: settings.promptPresetId },
    custom,
  );
  return { config, gitMode: normalizePromptGitMode(settings.promptGitMode) };
}

/** Prompt colours from an app theme: the terminal background and text, and the accent. */
export function promptThemeOf(themeId: unknown): { accent: string; fg: string; bg: string } {
  const vars = themeById(typeof themeId === "string" ? themeId : undefined).vars;
  return {
    accent: vars["--accent"] || "#2563eb",
    fg: vars["--ink"] || "#1f2328",
    bg: vars["--panel"] || "#ffffff",
  };
}
