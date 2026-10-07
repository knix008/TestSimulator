/**
 * Terminal prompt themes.
 *
 * A prompt is a list of blocks, each a list of segments; every segment has a type
 * (path, git, session, shell, os, time, status, executiontime, root, text), a style
 * (powerline | plain | diamond), colours and a Go-style template (`{{ .Path }}`,
 * `{{ if gt .Ahead 0 }}…{{ end }}`) rendered against the segment's own context. The
 * config is plain JSON, so it lives in the settings file like everything else.
 *
 *     renderPrompt(config, state, theme) → { blocks, finalSpace, gitState }
 *
 * Icons: a rendered text may contain `[[icon:name]]` markers, drawn as inline SVG by
 * `src/Prompt.tsx` — so a prompt needs no Nerd Font to show a folder or a branch.
 *
 * Nothing here touches the file system or the DOM: the settings store sanitises prompts
 * with `normalizePrompt`, and the renderer and the editor both draw with `renderPrompt`.
 */

export const PROMPT_VERSION = 1;

export const SEGMENT_TYPES = [
  "path", "git", "session", "shell", "os", "time", "status", "executiontime", "root", "text",
] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

export const SEGMENT_STYLES = ["powerline", "plain", "diamond"] as const;
export type SegmentStyle = (typeof SEGMENT_STYLES)[number];

/** Colours by repository state, used when a git segment's colour is `auto`. */
export const GIT_STATE_COLORS: Record<string, string> = {
  conflict: "#d62828",
  staged: "#ffd700",
  modified: "#ff5c5c",
  ahead: "#ff9f43",
  behind: "#7cc4ff",
  uptodate: "#7cfc8b",
  none: "#7cfc8b",
};

/** The states that colour the git (branch) segment, a clean pushed repository included. */
export const GIT_STATE_NAMES = ["conflict", "staged", "modified", "ahead", "behind", "uptodate"] as const;
export type GitStateName = (typeof GIT_STATE_NAMES)[number] | "none";

export type PromptSegment = {
  type: SegmentType;
  enabled: boolean;
  style: SegmentStyle;
  foreground: string;
  background: string;
  foreground_templates?: string[];
  background_templates?: string[];
  powerline_symbol: string;
  leading_diamond: string;
  trailing_diamond: string;
  template: string;
  properties: Record<string, unknown>;
};

export type PromptBlock = {
  type: string;
  alignment: string;
  newline: boolean;
  segments: PromptSegment[];
};

export type PromptConfig = {
  version: number;
  /** Id of the preset (built-in or custom) this prompt came from; '' once edited freely. */
  preset: string;
  final_space: boolean;
  /** The git segment takes the repository-state colour whatever its preset says. */
  git_state_colors: boolean;
  git_colors: Record<string, string>;
  palette: Record<string, string>;
  blocks: PromptBlock[];
};

/** A prompt the user saved under a name, offered beside the built-in presets. */
export type CustomPrompt = { id: string; label: string; config: PromptConfig };

/** The terminal state a prompt is drawn from. */
export type PromptState = {
  cwd: string;
  home?: string;
  git?: GitSummary | null;
  user?: string;
  host?: string;
  shell?: string;
  platform?: string;
  rc?: number;
  ms?: number;
  now?: Date;
  root?: boolean;
};

export type GitSummary = {
  repo: boolean;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  staged?: number;
  changed?: number;
  untracked?: number;
  conflicts?: number;
  stashes?: number;
};

export type PromptTheme = { accent: string; fg: string; bg: string };

export type RenderedSegment = {
  type: SegmentType;
  text: string;
  fg: string | null;
  bg: string | null;
  style: SegmentStyle;
  symbol: string;
  leading: string;
  trailing: string;
};

export type RenderedPrompt = {
  blocks: { newline: boolean; segments: RenderedSegment[] }[];
  finalSpace: boolean;
  gitState: GitStateName;
};

/** A prompt's state colours: its own `git_colors` over the defaults. */
export const gitColorsOf = (config: PromptConfig | null | undefined): Record<string, string> =>
  ({ ...GIT_STATE_COLORS, ...((config && config.git_colors) || {}) });

export function gitState(git: GitSummary | null | undefined): GitStateName {
  if (!git || !git.repo) return "none";
  if (git.conflicts) return "conflict";
  if (git.staged) return "staged";
  if (git.changed) return "modified";
  if (git.ahead) return "ahead";
  if (git.behind) return "behind";
  return "uptodate";
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

type SegmentSeed = Partial<PromptSegment> & { type: SegmentType };

const seg = (type: SegmentType, extra: Partial<PromptSegment> = {}): SegmentSeed => ({
  type,
  style: "powerline",
  powerline_symbol: "\ue0b0",
  foreground: "#1b1e24",
  background: "#4cc9f0",
  template: "",
  properties: {},
  ...extra,
});

type PresetSeed = {
  label: string;
  labelEn: string;
  config: {
    version: number;
    final_space: boolean;
    palette: Record<string, string>;
    blocks: { type: string; alignment: string; newline?: boolean; segments: SegmentSeed[] }[];
    preset?: string;
  };
};

export type Preset = { label: string; labelEn: string; config: PromptConfig; custom?: boolean };

const SEEDS: Record<string, PresetSeed> = {
  default: {
    label: "기본 (My Diff & Merge)", labelEn: "Default (My Diff & Merge)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("path", { foreground: "background", background: "accent", template: "[[icon:folder]] {{ .Path }}", properties: { style: "full" } }),
        seg("git", { foreground: "#1b1e24", background: "auto", template: "[[icon:branch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }}" }),
      ] }],
    },
  },
  powerline: {
    label: "Powerline (사용자 · 경로 · git · 시각)", labelEn: "Powerline (user · path · git · time)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("session", { foreground: "#ffffff", background: "#c386f1", template: " {{ .UserName }}@{{ .HostName }} " }),
        seg("path", { foreground: "#ffffff", background: "#ff479c", template: " [[icon:folder]] {{ .Path }} ", properties: { style: "agnoster_short", max_depth: 3 } }),
        seg("git", { foreground: "#193549", background: "#fffb38", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#ff9248{{ end }}", "{{ if and (gt .Ahead 0) (gt .Behind 0) }}#ff4500{{ end }}", "{{ if gt .Ahead 0 }}#b388ff{{ end }}", "{{ if gt .Behind 0 }}#b388ff{{ end }}"], template: " {{ .HEAD }}{{ if .BranchStatus }} {{ .BranchStatus }}{{ end }}{{ if .Working.Changed }} ✎ {{ .Working.String }}{{ end }}{{ if .Staging.Changed }} ✚ {{ .Staging.String }}{{ end }}{{ if gt .StashCount 0 }} ⚑ {{ .StashCount }}{{ end }} " }),
        seg("executiontime", { foreground: "#ffffff", background: "#83769c", template: " ⏱ {{ .FormattedMs }} ", properties: { threshold: 500 } }),
        seg("status", { foreground: "#ffffff", background: "#00897b", background_templates: ["{{ if gt .Code 0 }}#e91e63{{ end }}"], template: " {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ", properties: { always_enabled: true } }),
        seg("time", { foreground: "#ffffff", background: "#2e9599", template: ' {{ .CurrentDate | date "15:04" }} ' }),
      ] }],
    },
  },
  agnoster: {
    label: "Agnoster", labelEn: "Agnoster",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("session", { foreground: "#ffffff", background: "#3a3a3a", template: " {{ .UserName }}@{{ .HostName }} " }),
        seg("path", { foreground: "#ffffff", background: "#0087af", template: " {{ .Path }} ", properties: { style: "agnoster", folder_separator_icon: " \u203a " } }),
        seg("git", { foreground: "#000000", background: "#5faf00", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#d7af00{{ end }}"], template: " {{ .HEAD }}{{ if or (.Working.Changed) (.Staging.Changed) }} ±{{ end }} " }),
      ] }],
    },
  },
  paradox: {
    label: "Paradox (두 줄)", labelEn: "Paradox (two lines)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [
        { type: "prompt", alignment: "left", segments: [
          seg("os", { foreground: "#ffffff", background: "#0077c2", template: " {{ .Icon }} " }),
          seg("session", { foreground: "#ffffff", background: "#7a5c9a", template: " {{ .UserName }} " }),
          seg("path", { foreground: "#ffffff", background: "#ff8c00", template: " [[icon:folder]] {{ .Path }} ", properties: { style: "folder" } }),
          seg("git", { foreground: "#193549", background: "#95ffa4", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#ff9248{{ end }}"], template: " {{ .HEAD }}{{ if .BranchStatus }} {{ .BranchStatus }}{{ end }} " }),
        ] },
        { type: "prompt", alignment: "left", newline: true, segments: [
          seg("status", { style: "plain", foreground: "#7cfc8b", background: "transparent", foreground_templates: ["{{ if gt .Code 0 }}#ff5c5c{{ end }}"], template: "❯", properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
  minimal: {
    label: "최소 (경로 · 브랜치)", labelEn: "Minimal (path · branch)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("path", { style: "plain", foreground: "accent", background: "transparent", template: "{{ .Path }}", properties: { style: "folder" } }),
        seg("git", { style: "plain", foreground: "auto", background: "transparent", template: " ({{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }})" }),
        seg("text", { style: "plain", foreground: "foreground", background: "transparent", template: " ❯" }),
      ] }],
    },
  },
  plain: {
    label: "단순 텍스트 (색 없음)", labelEn: "Plain text (no colours)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("session", { style: "plain", foreground: "foreground", background: "transparent", template: "{{ .UserName }}@{{ .HostName }}:" }),
        seg("path", { style: "plain", foreground: "foreground", background: "transparent", template: "{{ .Path }}", properties: { style: "full" } }),
        seg("git", { style: "plain", foreground: "foreground", background: "transparent", template: " ({{ .Branch }})" }),
        seg("text", { style: "plain", foreground: "foreground", background: "transparent", template: "$" }),
      ] }],
    },
  },
  bubbles: {
    label: "버블 (둥근 캡슐)", labelEn: "Bubbles (rounded pills)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("os", { style: "diamond", foreground: "#ffffff", background: "#546e7a", template: " {{ .Icon }} " }),
        seg("path", { style: "diamond", foreground: "#ffffff", background: "#1e88e5", template: " [[icon:folder]] {{ .Path }} ", properties: { style: "agnoster_short", max_depth: 2 } }),
        seg("git", { style: "diamond", foreground: "#1b1e24", background: "auto", template: " [[icon:branch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }} " }),
        seg("time", { style: "diamond", foreground: "#ffffff", background: "#8e24aa", template: ' {{ .CurrentDate | date "15:04" }} ' }),
      ] }],
    },
  },
  robbyrussell: {
    label: "Robby Russell (➜ 경로 git)", labelEn: "Robby Russell (➜ path git)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("status", { style: "plain", foreground: "#50fa7b", background: "transparent", foreground_templates: ["{{ if gt .Code 0 }}#ff5555{{ end }}"], template: "➜", properties: { always_enabled: true } }),
        seg("path", { style: "plain", foreground: "#8be9fd", background: "transparent", template: " {{ .Path }}", properties: { style: "folder" } }),
        seg("git", { style: "plain", foreground: "#6272a4", background: "transparent", template: " git:({{ .Branch }}){{ if .Working.Changed }} ✗{{ end }}" }),
      ] }],
    },
  },
  pure: {
    label: "Pure (두 줄 · 담백)", labelEn: "Pure (two lines, quiet)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [
        { type: "prompt", alignment: "left", segments: [
          seg("path", { style: "plain", foreground: "#6272a4", background: "transparent", template: "{{ .Path }}", properties: { style: "full" } }),
          seg("git", { style: "plain", foreground: "#8be9fd", background: "transparent", template: " {{ .Branch }}{{ if .Working.Changed }}*{{ end }}{{ if gt .Ahead 0 }} ⇡{{ end }}{{ if gt .Behind 0 }} ⇣{{ end }}" }),
          seg("executiontime", { style: "plain", foreground: "#f1fa8c", background: "transparent", template: " {{ .FormattedMs }}", properties: { threshold: 5000 } }),
        ] },
        { type: "prompt", alignment: "left", newline: true, segments: [
          seg("status", { style: "plain", foreground: "#ff79c6", background: "transparent", foreground_templates: ["{{ if gt .Code 0 }}#ff5555{{ end }}"], template: "❯", properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
  star: {
    label: "Star (두 줄 · 시간 · OS)", labelEn: "Star (two lines, time, OS)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [
        { type: "prompt", alignment: "left", segments: [
          seg("os", { foreground: "#ffffff", background: "#3f51b5", template: " {{ .Icon }} " }),
          seg("session", { foreground: "#ffffff", background: "#7b1fa2", template: " {{ .UserName }} " }),
          seg("path", { foreground: "#ffffff", background: "#0097a7", template: " [[icon:folder]] {{ .Path }} ", properties: { style: "agnoster_short", max_depth: 2 } }),
          seg("git", { foreground: "#1b1e24", background: "#8bc34a", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#ffb74d{{ end }}"], template: " [[icon:branch]] {{ .Branch }}{{ if .BranchStatus }} {{ .BranchStatus }}{{ end }} " }),
          seg("time", { foreground: "#ffffff", background: "#455a64", template: ' {{ .CurrentDate | date "Mon 15:04" }} ' }),
        ] },
        { type: "prompt", alignment: "left", newline: true, segments: [
          seg("status", { style: "plain", foreground: "#ffd54f", background: "transparent", foreground_templates: ["{{ if gt .Code 0 }}#ff5c5c{{ end }}"], template: "★", properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
  slim: {
    label: "슬림 (경로 · 기호만)", labelEn: "Slim (path, symbols only)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("path", { style: "plain", foreground: "accent", background: "transparent", template: "{{ .Path }}", properties: { style: "agnoster_short", max_depth: 2 } }),
        seg("git", { style: "plain", foreground: "auto", background: "transparent", template: " {{ .Branch }}{{ if .Symbols }}{{ .Symbols }}{{ end }}" }),
        seg("text", { style: "plain", foreground: "foreground", background: "transparent", template: " »" }),
      ] }],
    },
  },
  material: {
    label: "Material (색 글자)", labelEn: "Material (coloured text)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("session", { style: "plain", foreground: "#ffb300", background: "transparent", template: "{{ .UserName }}" }),
        seg("text", { style: "plain", foreground: "#90a4ae", background: "transparent", template: " in " }),
        seg("path", { style: "plain", foreground: "#26c6da", background: "transparent", template: "{{ .Path }}", properties: { style: "agnoster_short", max_depth: 3 } }),
        seg("git", { style: "plain", foreground: "#ab47bc", background: "transparent", template: " on {{ .Branch }}{{ if .Working.Changed }} [{{ .Working.String }}]{{ end }}" }),
        seg("status", { style: "plain", foreground: "#66bb6a", background: "transparent", foreground_templates: ["{{ if gt .Code 0 }}#ef5350{{ end }}"], template: " ❯", properties: { always_enabled: true } }),
      ] }],
    },
  },
  classic: {
    label: "클래식 (user@host:path$)", labelEn: "Classic (user@host:path$)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("session", { style: "plain", foreground: "#50fa7b", background: "transparent", template: "{{ .UserName }}@{{ .HostName }}" }),
        seg("text", { style: "plain", foreground: "foreground", background: "transparent", template: ":" }),
        seg("path", { style: "plain", foreground: "#6272a4", background: "transparent", template: "{{ .Path }}", properties: { style: "full" } }),
        seg("git", { style: "plain", foreground: "#f1fa8c", background: "transparent", template: " ({{ .Branch }})" }),
        seg("text", { style: "plain", foreground: "foreground", background: "transparent", template: "$" }),
      ] }],
    },
  },
  rainbow: {
    label: "레인보우 (전체 정보)", labelEn: "Rainbow (everything)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("os", { foreground: "#ffffff", background: "#d32f2f", template: " {{ .Icon }} " }),
        seg("session", { foreground: "#ffffff", background: "#f57c00", template: " {{ .UserName }}@{{ .HostName }} " }),
        seg("shell", { foreground: "#1b1e24", background: "#fbc02d", template: " {{ .Name }} " }),
        seg("path", { foreground: "#ffffff", background: "#388e3c", template: " {{ .Path }} ", properties: { style: "folder" } }),
        seg("git", { foreground: "#ffffff", background: "#1976d2", template: " {{ .HEAD }}{{ if .Symbols }} {{ .Symbols }}{{ end }} " }),
        seg("executiontime", { foreground: "#ffffff", background: "#512da8", template: " {{ .FormattedMs }} ", properties: { threshold: 1000 } }),
        seg("status", { foreground: "#ffffff", background: "#7b1fa2", background_templates: ["{{ if gt .Code 0 }}#c62828{{ end }}"], template: " {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ", properties: { always_enabled: true } }),
        seg("time", { foreground: "#ffffff", background: "#455a64", template: ' {{ .CurrentDate | date "15:04" }} ' }),
      ] }],
    },
  },
  ocean: {
    label: "오션 (파랑 계열 두 줄)", labelEn: "Ocean (blues, two lines)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [
        { type: "prompt", alignment: "left", segments: [
          seg("session", { foreground: "#e3f2fd", background: "#0d47a1", template: " {{ .UserName }}@{{ .HostName }} " }),
          seg("path", { foreground: "#0d47a1", background: "#64b5f6", template: " [[icon:folder]] {{ .Path }} ", properties: { style: "agnoster_short", max_depth: 3 } }),
          seg("git", { foreground: "#0d47a1", background: "#b3e5fc", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#ffe082{{ end }}"], template: " [[icon:branch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }} " }),
          seg("time", { foreground: "#e3f2fd", background: "#1565c0", template: ' {{ .CurrentDate | date "15:04" }} ' }),
        ] },
        { type: "prompt", alignment: "left", newline: true, segments: [
          seg("status", { style: "plain", foreground: "#64b5f6", background: "transparent", foreground_templates: ["{{ if gt .Code 0 }}#ff5c5c{{ end }}"], template: "❯", properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
  mono: {
    label: "모노 (회색 파워라인)", labelEn: "Mono (grey powerline)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("session", { foreground: "#eeeeee", background: "#424242", template: " {{ .UserName }} " }),
        seg("path", { foreground: "#eeeeee", background: "#616161", template: " {{ .Path }} ", properties: { style: "folder" } }),
        seg("git", { foreground: "#212121", background: "#bdbdbd", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#ffcc80{{ end }}"], template: " {{ .HEAD }}{{ if .Symbols }} {{ .Symbols }}{{ end }} " }),
        seg("status", { foreground: "#eeeeee", background: "#757575", background_templates: ["{{ if gt .Code 0 }}#c62828{{ end }}"], template: " {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ", properties: { always_enabled: true } }),
      ] }],
    },
  },
  forest: {
    label: "포레스트 (녹색 계열)", labelEn: "Forest (greens)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("os", { foreground: "#e8f5e9", background: "#1b5e20", template: " {{ .Icon }} " }),
        seg("path", { foreground: "#e8f5e9", background: "#2e7d32", template: " [[icon:folder]] {{ .Path }} ", properties: { style: "agnoster_short", max_depth: 2 } }),
        seg("git", { foreground: "#1b5e20", background: "#a5d6a7", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#ffe082{{ end }}", "{{ if gt .Ahead 0 }}#c5e1a5{{ end }}"], template: " [[icon:branch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }} " }),
        seg("executiontime", { foreground: "#e8f5e9", background: "#558b2f", template: " {{ .FormattedMs }} ", properties: { threshold: 500 } }),
        seg("status", { foreground: "#e8f5e9", background: "#33691e", background_templates: ["{{ if gt .Code 0 }}#c62828{{ end }}"], template: " {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ", properties: { always_enabled: true } }),
      ] }],
    },
  },
  sunset: {
    label: "선셋 (주황·자주 다이아몬드)", labelEn: "Sunset (orange · purple diamonds)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("session", { style: "diamond", foreground: "#ffffff", background: "#ef6c00", template: " {{ .UserName }} " }),
        seg("path", { style: "diamond", foreground: "#ffffff", background: "#d81b60", template: " [[icon:folder]] {{ .Path }} ", properties: { style: "folder" } }),
        seg("git", { style: "diamond", foreground: "#ffffff", background: "#8e24aa", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#f4511e{{ end }}"], template: " {{ .HEAD }}{{ if .Symbols }} {{ .Symbols }}{{ end }} " }),
        seg("time", { style: "diamond", foreground: "#ffffff", background: "#5e35b1", template: ' {{ .CurrentDate | date "15:04" }} ' }),
      ] }],
    },
  },
  nord: {
    label: "노르드 (차분한 파랑·회색)", labelEn: "Nord (calm blues and greys)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [{ type: "prompt", alignment: "left", segments: [
        seg("session", { foreground: "#eceff4", background: "#4c566a", template: " {{ .UserName }}@{{ .HostName }} " }),
        seg("path", { foreground: "#2e3440", background: "#88c0d0", template: " {{ .Path }} ", properties: { style: "agnoster_short", max_depth: 3 } }),
        seg("git", { foreground: "#2e3440", background: "#a3be8c", background_templates: ["{{ if or (.Working.Changed) (.Staging.Changed) }}#ebcb8b{{ end }}", "{{ if gt .Behind 0 }}#81a1c1{{ end }}"], template: " [[icon:branch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }} " }),
        seg("status", { foreground: "#eceff4", background: "#5e81ac", background_templates: ["{{ if gt .Code 0 }}#bf616a{{ end }}"], template: " {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ", properties: { always_enabled: true } }),
      ] }],
    },
  },
  dev: {
    label: "개발자 (셸 · 경로 · git · 시간, 두 줄)", labelEn: "Developer (shell · path · git · time, two lines)",
    config: {
      version: PROMPT_VERSION, final_space: true, palette: {},
      blocks: [
        { type: "prompt", alignment: "left", segments: [
          seg("shell", { foreground: "#1b1e24", background: "#ffb74d", template: " {{ .Name }} " }),
          seg("path", { foreground: "#ffffff", background: "#3949ab", template: " [[icon:folder]] {{ .Path }} ", properties: { style: "full" } }),
          seg("git", { foreground: "#1b1e24", background: "auto", template: " [[icon:branch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }}{{ if gt .StashCount 0 }} ⚑{{ .StashCount }}{{ end }} " }),
          seg("executiontime", { foreground: "#ffffff", background: "#00838f", template: " ⏱ {{ .FormattedMs }} ", properties: { threshold: 1000 } }),
          seg("time", { foreground: "#ffffff", background: "#546e7a", template: ' {{ .CurrentDate | date "15:04:05" }} ' }),
        ] },
        { type: "prompt", alignment: "left", newline: true, segments: [
          seg("status", { style: "plain", foreground: "#7cfc8b", background: "transparent", foreground_templates: ["{{ if gt .Code 0 }}#ff5c5c{{ end }}"], template: "{{ if gt .Code 0 }}✘ {{ .Code }} {{ end }}❯", properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
};

/** The built-in presets, each already normalised and tagged with its own id. */
export const PRESETS: Record<string, Preset> = Object.fromEntries(
  Object.entries(SEEDS).map(([id, seed]) => [id, {
    label: seed.label,
    labelEn: seed.labelEn,
    config: normalizePrompt({ ...seed.config, preset: id } as unknown as PromptConfig),
  }]),
);

export const PROMPT_DEFAULT: PromptConfig = PRESETS.default.config;

export function clonePrompt(config: PromptConfig | null | undefined): PromptConfig {
  return JSON.parse(JSON.stringify(config ?? PROMPT_DEFAULT)) as PromptConfig;
}

/** Anything that came out of the settings file or an import is made whole here. */
export function normalizePrompt(source: unknown): PromptConfig {
  const raw = (source && typeof source === "object" ? source : {}) as Partial<PromptConfig>;
  const blocks = Array.isArray(raw.blocks) && raw.blocks.length ? raw.blocks : defaultBlocks();
  return {
    version: PROMPT_VERSION,
    preset: typeof raw.preset === "string" ? raw.preset : "",
    final_space: raw.final_space !== false,
    git_state_colors: raw.git_state_colors !== false,
    git_colors: Object.fromEntries(GIT_STATE_NAMES.map((name) => [
      name,
      (raw.git_colors && typeof raw.git_colors[name] === "string" && raw.git_colors[name]) || GIT_STATE_COLORS[name],
    ])),
    palette: raw.palette && typeof raw.palette === "object" ? { ...raw.palette } : {},
    blocks: blocks.map((block) => ({
      type: block?.type || "prompt",
      alignment: block?.alignment || "left",
      newline: Boolean(block?.newline),
      segments: (Array.isArray(block?.segments) ? block.segments : []).map(normalizeSegment),
    })),
  };
}

function normalizeSegment(source: Partial<PromptSegment>): PromptSegment {
  const type = (SEGMENT_TYPES as readonly string[]).includes(String(source?.type))
    ? source.type as SegmentType
    : "text";
  return {
    type,
    // The quick settings switch segments off without losing their colours.
    enabled: source?.enabled !== false,
    style: (SEGMENT_STYLES as readonly string[]).includes(String(source?.style))
      ? source.style as SegmentStyle
      : "powerline",
    foreground: source?.foreground || "foreground",
    background: source?.background || "transparent",
    foreground_templates: Array.isArray(source?.foreground_templates) ? source.foreground_templates : undefined,
    background_templates: Array.isArray(source?.background_templates) ? source.background_templates : undefined,
    powerline_symbol: source?.powerline_symbol || "\ue0b0",
    leading_diamond: source?.leading_diamond || "",
    trailing_diamond: source?.trailing_diamond || "",
    template: typeof source?.template === "string" ? source.template : defaultTemplate(type),
    properties: source?.properties && typeof source.properties === "object" ? { ...source.properties } : {},
  };
}

/**
 * The default prompt's blocks, read from the seed rather than from `PROMPT_DEFAULT`:
 * `normalizePrompt` runs while the presets are still being built, so the exported
 * constant does not exist yet.
 */
function defaultBlocks(): PromptBlock[] {
  return JSON.parse(JSON.stringify(SEEDS.default.config.blocks)) as PromptBlock[];
}

export function defaultTemplate(type: SegmentType | string): string {
  switch (type) {
    case "path": return " [[icon:folder]] {{ .Path }} ";
    case "git": return " {{ .HEAD }}{{ if .BranchStatus }} {{ .BranchStatus }}{{ end }}{{ if .Working.Changed }} ✎ {{ .Working.String }}{{ end }}{{ if .Staging.Changed }} ✚ {{ .Staging.String }}{{ end }} ";
    case "session": return " {{ .UserName }}@{{ .HostName }} ";
    case "shell": return " {{ .Name }} ";
    case "os": return " {{ .Icon }} ";
    case "time": return ' {{ .CurrentDate | date "15:04:05" }} ';
    case "status": return " {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ";
    case "executiontime": return " {{ .FormattedMs }} ";
    case "root": return " ⚡ ";
    default: return " text ";
  }
}

/* ------------------------------------------------------------------ *
 * The template engine: a subset of Go's text/template
 * ------------------------------------------------------------------ *
 *   {{ .A.B }}  {{ .X | date "15:04" }}  {{ .X | upper }}
 *   {{ if COND }} … {{ else if COND }} … {{ else }} … {{ end }}
 *   COND: .X | gt/lt/ge/le/eq/ne A B | and … | or … | not A | ( … ) | literals
 */

type Token = { k: "str" | "num"; v: string | number } | { k: "field" | "id"; v: string } | { k: "(" | ")" | "|" };
type Context = Record<string, unknown>;

function tokenize(source: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(?:("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|(\.[A-Za-z_][\w.]*|\.)|([A-Za-z_]\w*)|(\(|\)|\|))/y;
  re.lastIndex = 0;
  while (re.lastIndex < source.length) {
    const match = re.exec(source);
    // Trailing whitespace or an unknown character ends the scan.
    if (!match) break;
    if (match[1] !== undefined) out.push({ k: "str", v: JSON.parse(match[1]) as string });
    else if (match[2] !== undefined) out.push({ k: "num", v: Number(match[2]) });
    else if (match[3] !== undefined) out.push({ k: "field", v: match[3] });
    else if (match[4] !== undefined) out.push({ k: "id", v: match[4] });
    else if (match[5] !== undefined) out.push({ k: match[5] as "(" | ")" | "|" });
  }
  return out;
}

const FUNCS = new Set(["gt", "lt", "ge", "le", "eq", "ne", "and", "or", "not", "len", "date", "upper", "lower", "trunc", "default", "printf"]);

function lookup(ctx: Context, field: string): unknown {
  if (field === ".") return ctx;
  let value: unknown = ctx;
  for (const part of field.slice(1).split(".")) {
    if (value == null) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/**
 * Parses one expression from `tokens[pos]`; a function call takes every following
 * argument up to the end of the group, the way Go templates do.
 */
function parseExpr(tokens: Token[], pos: number, ctx: Context): [unknown, number] {
  const token = tokens[pos];
  if (!token) return [undefined, pos];
  if (token.k === "(") {
    const [first, next] = parseExpr(tokens, pos + 1, ctx);
    let at = next;
    let value = first;
    // Absorb a pipeline inside the group.
    while (tokens[at] && tokens[at].k === "|") {
      const [piped, after] = parsePipe(tokens, at + 1, value, ctx);
      value = piped;
      at = after;
    }
    return [value, tokens[at] && tokens[at].k === ")" ? at + 1 : at];
  }
  if (token.k === "str" || token.k === "num") return [token.v, pos + 1];
  if (token.k === "field") return [lookup(ctx, token.v), pos + 1];
  if (token.k === "id") {
    if (token.v === "true") return [true, pos + 1];
    if (token.v === "false") return [false, pos + 1];
    if (token.v === "nil") return [null, pos + 1];
    if (FUNCS.has(token.v)) {
      const args: unknown[] = [];
      let at = pos + 1;
      while (tokens[at] && tokens[at].k !== ")" && tokens[at].k !== "|") {
        const [value, after] = parseExpr(tokens, at, ctx);
        args.push(value);
        if (after === at) break;
        at = after;
      }
      return [callFunc(token.v, args), at];
    }
    return [undefined, pos + 1];
  }
  return [undefined, pos + 1];
}

function parsePipe(tokens: Token[], pos: number, input: unknown, ctx: Context): [unknown, number] {
  const token = tokens[pos];
  if (!token || token.k !== "id") return [input, pos];
  const args: unknown[] = [];
  let at = pos + 1;
  while (tokens[at] && tokens[at].k !== ")" && tokens[at].k !== "|") {
    const [value, after] = parseExpr(tokens, at, ctx);
    args.push(value);
    if (after === at) break;
    at = after;
  }
  return [callFunc(token.v, [...args, input]), at];
}

function truthy(value: unknown): boolean {
  return !(value === undefined || value === null || value === false || value === 0 || value === ""
    || (Array.isArray(value) && value.length === 0));
}

function callFunc(name: string, args: unknown[]): unknown {
  switch (name) {
    case "gt": return Number(args[0]) > Number(args[1]);
    case "lt": return Number(args[0]) < Number(args[1]);
    case "ge": return Number(args[0]) >= Number(args[1]);
    case "le": return Number(args[0]) <= Number(args[1]);
    case "eq": return args.slice(1).some((value) => value === args[0]);
    case "ne": return args[0] !== args[1];
    case "and": return args.every(truthy) ? args[args.length - 1] : args.find((value) => !truthy(value));
    case "or": {
      const hit = args.find(truthy);
      return hit === undefined ? args[args.length - 1] : hit;
    }
    case "not": return !truthy(args[0]);
    case "len": {
      const value = args[0];
      if (value == null) return 0;
      const sized = value as { length?: number };
      return sized.length !== undefined ? sized.length : Object.keys(value as object).length;
    }
    case "upper": return String(args[args.length - 1] ?? "").toUpperCase();
    case "lower": return String(args[args.length - 1] ?? "").toLowerCase();
    case "trunc": return String(args[1] ?? "").slice(0, Number(args[0]) || 0);
    case "default": return truthy(args[1]) ? args[1] : args[0];
    case "printf": return String(args[0] ?? "").replace(/%[sdv]/g, () => String(args.splice(1, 1)[0] ?? ""));
    case "date": return goDate(args[args.length - 1], String(args[0] ?? "15:04"));
    default: return "";
  }
}

/** Go reference-time layouts (2006-01-02 15:04:05 Mon Jan PM) → a formatted date. */
export function goDate(value: unknown, layout: string): string {
  const date = value instanceof Date ? value : new Date((value as string | number) || Date.now());
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const hour12 = date.getHours() % 12 || 12;
  const map: [string, string][] = [
    ["2006", String(date.getFullYear())], ["January", months[date.getMonth()]], ["Monday", days[date.getDay()]],
    ["Jan", months[date.getMonth()].slice(0, 3)], ["Mon", days[date.getDay()].slice(0, 3)],
    ["01", pad(date.getMonth() + 1)], ["02", pad(date.getDate())], ["_2", String(date.getDate()).padStart(2, " ")],
    ["15", pad(date.getHours())], ["03", pad(hour12)], ["04", pad(date.getMinutes())], ["05", pad(date.getSeconds())],
    ["PM", date.getHours() >= 12 ? "PM" : "AM"], ["pm", date.getHours() >= 12 ? "pm" : "am"],
    ["06", String(date.getFullYear()).slice(-2)], ["1", String(date.getMonth() + 1)], ["2", String(date.getDate())],
    ["3", String(hour12)], ["4", String(date.getMinutes())], ["5", String(date.getSeconds())],
  ];
  let out = "";
  let i = 0;
  while (i < layout.length) {
    const hit = map.find(([key]) => layout.startsWith(key, i));
    if (hit) {
      out += hit[1];
      i += hit[0].length;
    } else {
      out += layout[i];
      i++;
    }
  }
  return out;
}

/** Renders a template against a context. An unknown field renders as ''. */
export function renderTemplate(template: string, ctx: Context): string {
  const source = String(template || "");
  const parts: { text?: string; action?: string }[] = [];
  const re = /\{\{-?\s*([\s\S]*?)\s*-?\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (match.index > last) parts.push({ text: source.slice(last, match.index) });
    parts.push({ action: match[1].trim() });
    last = re.lastIndex;
  }
  if (last < source.length) parts.push({ text: source.slice(last) });

  let i = 0;
  const evalExpr = (expression: string): unknown => {
    const tokens = tokenize(expression);
    let [value, at] = parseExpr(tokens, 0, ctx);
    while (tokens[at] && tokens[at].k === "|") {
      const [piped, after] = parsePipe(tokens, at + 1, value, ctx);
      value = piped;
      at = after;
    }
    return value;
  };

  /** Renders until an `{{ else }}` / `{{ end }}` at this nesting level. */
  const render = (): [string, string | undefined] => {
    let out = "";
    while (i < parts.length) {
      const part = parts[i++];
      if (part.text !== undefined) {
        out += part.text;
        continue;
      }
      const action = part.action as string;
      if (action === "end") return [out, "end"];
      if (action === "else") return [out, "else"];
      if (action.startsWith("else if ")) return [out, action];
      if (action.startsWith("if ")) {
        let condition = truthy(evalExpr(action.slice(3)));
        let taken = false;
        for (;;) {
          const [body, stop] = render();
          if (condition && !taken) {
            out += body;
            taken = true;
          }
          if (stop === "end" || stop === undefined) break;
          if (stop === "else") condition = !taken;
          else if (stop.startsWith("else if ")) condition = !taken && truthy(evalExpr(stop.slice(8)));
        }
        continue;
      }
      const value = evalExpr(action);
      out += value === undefined || value === null || value === false
        ? ""
        : (value instanceof Date ? goDate(value, "2006-01-02 15:04:05") : String(value));
    }
    return [out, undefined];
  };
  return render()[0];
}

/* ------------------------------------------------------------------ *
 * Segment contexts
 * ------------------------------------------------------------------ */

function splitPath(target: string): { parts: string[]; win: boolean; sep: string; absolute: boolean } {
  const text = String(target || "");
  const parts = text.split(/[\\/]+/).filter(Boolean);
  const win = /^[a-zA-Z]:$/.test(parts[0] || "");
  const sep = text.includes("\\") ? "\\" : "/";
  return { parts, win, sep, absolute: text.startsWith("/") };
}

/** Path styles: full, folder, agnoster, agnoster_full, agnoster_short, agnoster_left, letter, mixed, unique. */
export function formatPath(cwd: string, home: string | undefined, props: Record<string, unknown> = {}): string {
  const style = String(props.style || "full");
  const homeIcon = props.home_icon !== undefined ? String(props.home_icon) : "~";
  const sepIcon = props.folder_separator_icon !== undefined ? String(props.folder_separator_icon) : null;
  const maxDepth = Number(props.max_depth) > 0 ? Number(props.max_depth) : 1;
  const maxWidth = Number(props.max_width) > 0 ? Number(props.max_width) : 0;
  let target = String(cwd || "");
  const homeDir = String(home || "").replace(/[\\/]+$/, "");
  let inHome = false;
  if (homeDir && (target === homeDir
    || target.toLowerCase() === homeDir.toLowerCase()
    || target.toLowerCase().startsWith(`${homeDir.toLowerCase()}\\`)
    || target.toLowerCase().startsWith(`${homeDir.toLowerCase()}/`))) {
    inHome = true;
    target = target.slice(homeDir.length);
  }
  const { parts, win, sep } = splitPath(target);
  const head = inHome ? [homeIcon] : (win ? [parts[0]] : (target.startsWith("/") ? [""] : []));
  const rest = inHome ? parts : (win ? parts.slice(1) : parts);
  const join = (list: string[]) => (sepIcon !== null
    ? list.join(sepIcon)
    : (list.length && list[0] === "" ? `/${list.slice(1).join("/")}` : list.join(sep)));
  const all = [...head, ...rest];
  const folder = rest.length ? rest[rest.length - 1] : (head[0] || target || sep);
  const initials = () => join([...head, ...rest.slice(0, -1).map((part) => part.slice(0, 1)), ...(rest.length ? [folder] : [])]);
  switch (style) {
    case "folder": return folder;
    case "agnoster": return initials();
    case "letter": return initials();
    case "unique": return initials();
    case "agnoster_left":
      return join([
        ...head,
        ...(rest.length ? [rest[0]] : []),
        ...rest.slice(1, -1).map((part) => part.slice(0, 1)),
        ...(rest.length > 1 ? [folder] : []),
      ]);
    case "agnoster_short":
      return join(rest.length > maxDepth ? [...head, "…", ...rest.slice(-maxDepth)] : all);
    case "mixed": {
      const full = join(all);
      return maxWidth && full.length > maxWidth ? join([...head, "…", folder]) : full;
    }
    case "agnoster_full":
    case "full":
    default:
      return sepIcon !== null ? join(all) : (inHome ? [homeIcon, ...rest].join(sep) : (target || sep));
  }
}

function workingString(git: GitSummary | null): string {
  if (!git || !git.repo) return "";
  const bits: string[] = [];
  if (git.changed) bits.push(`~${git.changed}`);
  if (git.untracked) bits.push(`?${git.untracked}`);
  if (git.conflicts) bits.push(`!${git.conflicts}`);
  return bits.join(" ");
}

const OS_ICONS: Record<string, string> = { win32: "⊞", darwin: "", linux: "🐧" };

/** Builds the template context of one segment from the terminal's state. */
export function segmentContext(type: string, state: PromptState, props: Record<string, unknown> = {}): Context {
  const git = state.git && state.git.repo ? state.git : null;
  switch (type) {
    case "path": {
      const formatted = formatPath(state.cwd, state.home, props);
      const { parts } = splitPath(state.cwd || "");
      return {
        Path: formatted,
        Location: state.cwd || "",
        Folder: parts[parts.length - 1] || state.cwd || "",
        Parent: parts.slice(0, -1).join(state.cwd && state.cwd.includes("\\") ? "\\" : "/"),
        Writable: true,
        RootDir: parts.length <= 1,
      };
    }
    case "git": {
      if (!git) return { Repo: false };
      const icon = props.branch_icon !== undefined ? String(props.branch_icon) : "⎇ ";
      const ahead = git.ahead ?? 0;
      const behind = git.behind ?? 0;
      const staged = git.staged ?? 0;
      const changed = git.changed ?? 0;
      const untracked = git.untracked ?? 0;
      const conflicts = git.conflicts ?? 0;
      const symbols = [
        ahead > 0 ? "↑" : "", behind > 0 ? "↓" : "", staged > 0 ? "+" : "",
        changed > 0 ? "~" : "", untracked > 0 ? "?" : "", conflicts > 0 ? "!" : "",
      ].join("");
      const branchStatus = ahead && behind
        ? `↕ ↑${ahead} ↓${behind}`
        : ahead ? `↑${ahead}` : behind ? `↓${behind}` : (git.upstream ? "≡" : "");
      return {
        Repo: true,
        HEAD: `${icon}${git.branch || "(detached)"}`,
        Branch: git.branch || "(detached)",
        Ref: git.branch || "",
        Upstream: git.upstream || "",
        UpstreamIcon: git.upstream ? "☁ " : "",
        Ahead: ahead,
        Behind: behind,
        BranchStatus: branchStatus,
        StashCount: git.stashes ?? 0,
        State: gitState(git),
        Symbols: symbols,
        Working: {
          Changed: changed + untracked + conflicts > 0,
          Modified: changed,
          Untracked: untracked,
          Unmerged: conflicts,
          Added: 0,
          Deleted: 0,
          String: workingString(git),
        },
        Staging: { Changed: staged > 0, Added: staged, Modified: 0, Deleted: 0, String: staged ? `+${staged}` : "" },
        Detached: /^@/.test(git.branch || ""),
        Merge: false,
        Rebase: false,
        CherryPick: false,
      };
    }
    case "session":
      return { UserName: state.user || "", HostName: state.host || "", SSHSession: false, Root: Boolean(state.root), DefaultUserName: "" };
    case "shell":
      return { Name: state.shell || "", Version: "" };
    case "os": {
      const key = state.platform === "win32" ? "windows" : state.platform === "darwin" ? "macos" : "linux";
      return { Icon: String(props[key] || OS_ICONS[state.platform || ""] || ""), OS: state.platform || "" };
    }
    case "time":
      return { CurrentDate: state.now || new Date(), Format: String(props.time_format || "15:04:05") };
    case "status": {
      const code = Number(state.rc) || 0;
      return { Code: code, Error: code !== 0, String: code ? String(code) : "" };
    }
    case "executiontime": {
      const ms = Number(state.ms) || 0;
      return { Ms: ms, FormattedMs: formatMs(ms) };
    }
    case "root":
      return { Root: Boolean(state.root) };
    default:
      return {};
  }
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

const NAMED: Record<string, string> = {
  black: "#000000", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c", blue: "#6272a4",
  magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2", lightGreen: "#7cfc8b",
  darkGray: "#555555", lightGray: "#aaaaaa",
};

/**
 * A colour spec → a CSS colour. `accent` / `foreground` / `background` follow the app's
 * theme, `auto` the repository state, `p:name` the prompt's palette, `transparent` none.
 */
export function resolveColor(spec: string, options: {
  theme: PromptTheme;
  gitStateName?: GitStateName;
  palette?: Record<string, string>;
  parentBackground?: string | null;
  gitColors?: Record<string, string>;
}): string | null {
  const value = String(spec || "").trim();
  if (!value || value === "transparent") return null;
  if (value === "accent") return options.theme.accent;
  if (value === "foreground") return options.theme.fg;
  if (value === "background") return options.theme.bg;
  if (value === "parentBackground") return options.parentBackground || null;
  if (value === "auto") return (options.gitColors || GIT_STATE_COLORS)[options.gitStateName || "none"];
  if (value.startsWith("p:")) {
    return resolveColor((options.palette || {})[value.slice(2)] || "", { ...options, palette: {} });
  }
  if (NAMED[value]) return NAMED[value];
  return value;
}

function firstTemplate(list: string[] | undefined, ctx: Context): string {
  if (!Array.isArray(list)) return "";
  for (const template of list) {
    const rendered = renderTemplate(template, ctx).trim();
    if (rendered) return rendered;
  }
  return "";
}

/** Segments that should not appear at all in some states. */
function segmentVisible(type: string, ctx: Context, props: Record<string, unknown>): boolean {
  if (type === "git") return Boolean(ctx.Repo);
  if (type === "root") return Boolean(ctx.Root);
  if (type === "executiontime") {
    const threshold = props.threshold !== undefined ? Number(props.threshold) : 500;
    return Number(ctx.Ms) >= threshold;
  }
  // The exit code only shows on an error unless the segment says otherwise.
  if (type === "status") return props.always_enabled ? true : ctx.Code !== 0;
  return true;
}

export const DEFAULT_PROMPT_THEME: PromptTheme = { accent: "#4cc9f0", fg: "#e6edf3", bg: "#12161c" };

export function renderPrompt(
  config: PromptConfig | null | undefined,
  state: PromptState,
  theme?: PromptTheme,
): RenderedPrompt {
  const cfg = normalizePrompt(config);
  const palette = theme || DEFAULT_PROMPT_THEME;
  const stateName = gitState(state.git);
  const gitColors = gitColorsOf(cfg);
  const blocks: RenderedPrompt["blocks"] = [];
  for (const block of cfg.blocks) {
    // Right-aligned blocks are not drawn: an inline prompt has no right edge.
    if (block.type && block.type !== "prompt") continue;
    const segments: RenderedSegment[] = [];
    let previousBackground: string | null = null;
    for (const segment of block.segments) {
      if (segment.enabled === false) continue;
      const props = segment.properties || {};
      const ctx = segmentContext(segment.type, state, props);
      if (!segmentVisible(segment.type, ctx, props)) continue;
      // A text segment may name anything, so it gets the session and path contexts too.
      const text = segment.type === "text"
        ? renderTemplate(segment.template, {
          ...ctx,
          ...segmentContext("session", state),
          ...segmentContext("path", state, props),
        })
        : renderTemplate(segment.template, ctx);
      if (!text.trim() && segment.type !== "text") continue;
      if (!text) continue;
      const backgroundSpec = firstTemplate(segment.background_templates, ctx) || segment.background;
      const foregroundSpec = firstTemplate(segment.foreground_templates, ctx) || segment.foreground;
      const colorOptions = {
        theme: palette,
        gitStateName: stateName,
        palette: cfg.palette,
        parentBackground: previousBackground,
        gitColors,
      };
      let background = resolveColor(backgroundSpec, colorOptions);
      let foreground = resolveColor(foregroundSpec, colorOptions) || palette.fg;
      // The git (branch) segment alone is coloured by the repository state — green clean
      // → red modified → yellow staged → orange committed → green pushed, blue behind,
      // crimson conflicts — on its background when it has one, else on its text. Every
      // other segment keeps the theme's colours, and `git_state_colors: false` switches
      // this off for the git segment too.
      if (segment.type === "git" && cfg.git_state_colors !== false && stateName !== "none") {
        if (background) {
          background = gitColors[stateName];
          foreground = "#1b1e24";
        } else {
          foreground = gitColors[stateName];
        }
      }
      segments.push({
        type: segment.type,
        text,
        fg: foreground,
        bg: background,
        style: segment.style,
        symbol: segment.powerline_symbol,
        leading: segment.leading_diamond,
        trailing: segment.trailing_diamond,
      });
      previousBackground = background;
    }
    if (segments.length) blocks.push({ newline: Boolean(block.newline), segments });
  }
  return { blocks, finalSpace: cfg.final_space !== false, gitState: stateName };
}

/** The sample states the settings preview and the preset cards are drawn with. */
const SAMPLE_NOW = new Date(2026, 8, 16, 10, 5, 42);

export const SAMPLE_STATES: Record<"mini" | "clean" | "dirty" | "plain", PromptState> = {
  mini: {
    cwd: "C:\\Users\\me\\src", home: "C:\\Users\\me",
    git: { repo: true, branch: "main", upstream: "origin/main", ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, stashes: 0 },
    user: "me", host: "pc", shell: "pwsh", platform: "win32", rc: 0, ms: 1500, now: SAMPLE_NOW,
  },
  clean: {
    cwd: "C:\\Home\\Projects\\MyDiffMerge", home: "C:\\Users\\user",
    git: { repo: true, branch: "main", upstream: "origin/main", ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, stashes: 0 },
    user: "user", host: "desktop", shell: "pwsh", platform: "win32", rc: 0, ms: 120, now: SAMPLE_NOW,
  },
  dirty: {
    cwd: "C:\\Home\\Projects\\MyDiffMerge\\src\\views", home: "C:\\Users\\user",
    git: { repo: true, branch: "feature/terminal", upstream: "origin/feature/terminal", ahead: 2, behind: 0, staged: 1, changed: 3, untracked: 1, conflicts: 0, stashes: 1 },
    user: "user", host: "desktop", shell: "pwsh", platform: "win32", rc: 1, ms: 3200, now: SAMPLE_NOW,
  },
  plain: {
    cwd: "C:\\Users\\user\\Downloads", home: "C:\\Users\\user",
    git: { repo: false },
    user: "user", host: "desktop", shell: "pwsh", platform: "win32", rc: 0, ms: 40, now: SAMPLE_NOW,
  },
};

/** Keeps a list of saved prompts inside what the settings file is allowed to hold. */
export function sanitizeCustomPrompts(value: unknown): CustomPrompt[] {
  if (!Array.isArray(value)) return [];
  const out: CustomPrompt[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Partial<CustomPrompt>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || out.some((kept) => kept.id === id)) continue;
    out.push({
      id,
      label: (typeof item.label === "string" && item.label.trim()) || id,
      config: { ...normalizePrompt(item.config), preset: id },
    });
    if (out.length >= 40) break;
  }
  return out;
}
