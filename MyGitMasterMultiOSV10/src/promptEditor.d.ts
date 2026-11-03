// Types for src/promptEditor.js (MyTerminal's prompt editor, plain DOM).
export type PromptEditorState = {
  config: unknown;
  gitMode: string;
  presetId: string;
  customPrompts: unknown[];
};

export function createPromptEditor(options: {
  i18n: { lang: string; t: (key: string, fallback?: string) => string };
  theme: { accent: string; fg: string; bg: string };
  font?: { family: string; size: number } | null;
  platform?: string;
  config: unknown;
  gitMode?: string;
  customPrompts?: unknown[];
  onChange?: (state: PromptEditorState) => void;
}): {
  presetsPane: HTMLElement;
  editPane: HTMLElement;
  getState: () => PromptEditorState;
  setGitMode: (mode: string) => void;
};
