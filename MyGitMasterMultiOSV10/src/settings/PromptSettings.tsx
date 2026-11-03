// Preferences › Prompt (presets, saved prompts, quick options) and Prompt editor
// (segment by segment). Both are MyTerminal's prompt editor (src/promptEditor.js),
// mounted as it is; every change is saved at once and the terminal draws it on its
// next prompt.
import { useEffect, useRef } from "react";
import { promptFromSettings, promptThemeOf } from "../../core/promptSettings.js";
import { translate } from "../i18n";
import { createPromptEditor } from "../promptEditor.js";
import "../promptEditor.css";
import type { SettingsTabProps } from "./types";

export function PromptSettings(props: SettingsTabProps & { pane: "prompt" | "edit" }) {
  const host = useRef<HTMLDivElement>(null);
  const onPrefs = useRef(props.onPrefs);
  onPrefs.current = props.onPrefs;
  // The editor keeps its own state while it is open; it is built from the saved
  // settings when the tab (or the language, or the theme) changes.
  const settings = useRef(props.settings);
  settings.current = props.settings;
  const theme = props.settings.theme;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const saved = settings.current;
    const { config, gitMode } = promptFromSettings(saved);
    const editor = createPromptEditor({
      i18n: {
        lang: props.lang,
        t: (key: string, fallback?: string) => {
          const text = translate(props.lang, key);
          return text === key ? fallback ?? key : text;
        },
      },
      theme: promptThemeOf(theme),
      font: { family: "Consolas, \"Cascadia Mono\", \"Malgun Gothic\", monospace", size: 13 },
      platform: window.mgm?.platform ?? (/Windows/i.test(navigator.userAgent) ? "win32" : /Mac/i.test(navigator.userAgent) ? "darwin" : "linux"),
      config,
      gitMode,
      customPrompts: Array.isArray(saved.customPrompts) ? saved.customPrompts : [],
      onChange: (state) => onPrefs.current({
        promptConfig: state.config,
        promptGitMode: state.gitMode,
        promptPresetId: state.presetId,
        customPrompts: state.customPrompts,
      }),
    });
    const pane = props.pane === "prompt" ? editor.presetsPane : editor.editPane;
    element.replaceChildren(pane);
    return () => element.replaceChildren();
  }, [props.pane, props.lang, theme]);

  return <div className={`prompt-settings prompt-settings-${props.pane}`} ref={host} />;
}
