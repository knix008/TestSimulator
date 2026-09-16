// Terminal prompt themes — an oh-my-posh compatible model.
//
// A prompt is a list of blocks, each a list of segments; every segment has a
// type (path, git, session, shell, os, time, status, executiontime, root,
// text), a style (powerline | plain | diamond), colours and a Go-style
// template ({{ .Path }}, {{ if gt .Ahead 0 }}…{{ end }}) rendered against the
// segment's context — the same shape oh-my-posh uses, so its JSON themes can
// be imported (importOmp) and our own exported (the config *is* that JSON).
//
//   renderPrompt(config, ctx) → [{ newline, segments: [{ text, fg, bg, style, symbol, leading, trailing }] }]
//
// Icons: a rendered text may contain [[icon:name]] markers, drawn as inline
// SVG icons by the Prompt component (no Nerd Font needed for the defaults).

export const PROMPT_VERSION = 1;

export const SEGMENT_TYPES = ['path', 'git', 'session', 'shell', 'os', 'time', 'status', 'executiontime', 'root', 'text'];
export const SEGMENT_STYLES = ['powerline', 'plain', 'diamond'];

// Colours by git state (the classic My Editor prompt): used when a git
// segment's background (or foreground) is 'auto'.
export const GIT_STATE_COLORS = { conflict: '#D62828', staged: '#FFD700', modified: '#FF5C5C', ahead: '#FFD700', behind: '#7cc4ff', uptodate: '#7CFC8B', none: '#7CFC8B' };

export function gitState(git) {
  if (!git || !git.repo) return 'none';
  return git.conflicts ? 'conflict' : git.staged ? 'staged' : git.changed ? 'modified' : git.ahead ? 'ahead' : git.behind ? 'behind' : 'uptodate';
}

// ── Presets ───────────────────────────────────────────────

const seg = (type, extra) => ({ type, style: 'powerline', powerline_symbol: '\ue0b0', foreground: '#1b1e24', background: '#4cc9f0', template: '', properties: {}, ...extra });

export const PRESETS = {
  default: {
    label: '기본 (My Editor)', labelEn: 'Default (My Editor)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('path', { foreground: 'background', background: 'accent', template: '[[icon:folder]] {{ .Path }}', properties: { style: 'full' } }),
        seg('git', { foreground: '#1b1e24', background: 'auto', template: '[[icon:gitBranch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }}' }),
      ] }],
    },
  },
  powerline: {
    label: 'Powerline (사용자 · 경로 · git · 시각)', labelEn: 'Powerline (user · path · git · time)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('session', { foreground: '#ffffff', background: '#c386f1', template: ' {{ .UserName }}@{{ .HostName }} ' }),
        seg('path', { foreground: '#ffffff', background: '#ff479c', template: ' [[icon:folder]] {{ .Path }} ', properties: { style: 'agnoster_short', max_depth: 3 } }),
        seg('git', { foreground: '#193549', background: '#fffb38', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#FF9248{{ end }}', '{{ if and (gt .Ahead 0) (gt .Behind 0) }}#ff4500{{ end }}', '{{ if gt .Ahead 0 }}#B388FF{{ end }}', '{{ if gt .Behind 0 }}#B388FF{{ end }}'], template: ' {{ .HEAD }}{{ if .BranchStatus }} {{ .BranchStatus }}{{ end }}{{ if .Working.Changed }} ✎ {{ .Working.String }}{{ end }}{{ if .Staging.Changed }} ✚ {{ .Staging.String }}{{ end }}{{ if gt .StashCount 0 }} ⚑ {{ .StashCount }}{{ end }} ' }),
        seg('executiontime', { foreground: '#ffffff', background: '#83769c', template: ' ⏱ {{ .FormattedMs }} ', properties: { threshold: 500 } }),
        seg('status', { foreground: '#ffffff', background: '#00897b', background_templates: ['{{ if gt .Code 0 }}#e91e63{{ end }}'], template: ' {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ', properties: { always_enabled: true } }),
        seg('time', { foreground: '#ffffff', background: '#2e9599', template: ' {{ .CurrentDate | date "15:04" }} ' }),
      ] }],
    },
  },
  agnoster: {
    label: 'Agnoster', labelEn: 'Agnoster',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('session', { foreground: '#ffffff', background: '#3a3a3a', template: ' {{ .UserName }}@{{ .HostName }} ' }),
        seg('path', { foreground: '#ffffff', background: '#0087af', template: ' {{ .Path }} ', properties: { style: 'agnoster', folder_separator_icon: ' \u203a ' } }),
        seg('git', { foreground: '#000000', background: '#5faf00', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#d7af00{{ end }}'], template: ' {{ .HEAD }}{{ if or (.Working.Changed) (.Staging.Changed) }} ±{{ end }} ' }),
      ] }],
    },
  },
  paradox: {
    label: 'Paradox (두 줄)', labelEn: 'Paradox (two lines)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [
        { type: 'prompt', alignment: 'left', segments: [
          seg('os', { foreground: '#ffffff', background: '#0077c2', template: ' {{ .Icon }} ' }),
          seg('session', { foreground: '#ffffff', background: '#7a5c9a', template: ' {{ .UserName }} ' }),
          seg('path', { foreground: '#ffffff', background: '#ff8c00', template: ' [[icon:folder]] {{ .Path }} ', properties: { style: 'folder' } }),
          seg('git', { foreground: '#193549', background: '#95ffa4', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#ff9248{{ end }}'], template: ' {{ .HEAD }}{{ if .BranchStatus }} {{ .BranchStatus }}{{ end }} ' }),
        ] },
        { type: 'prompt', alignment: 'left', newline: true, segments: [
          seg('status', { style: 'plain', foreground: '#7CFC8B', background: 'transparent', foreground_templates: ['{{ if gt .Code 0 }}#ff5c5c{{ end }}'], template: '❯', properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
  minimal: {
    label: '최소 (경로 · 브랜치)', labelEn: 'Minimal (path · branch)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('path', { style: 'plain', foreground: 'accent', background: 'transparent', template: '{{ .Path }}', properties: { style: 'folder' } }),
        seg('git', { style: 'plain', foreground: 'auto', background: 'transparent', template: ' ({{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }})' }),
        seg('text', { style: 'plain', foreground: 'foreground', background: 'transparent', template: ' ❯' }),
      ] }],
    },
  },
  plain: {
    label: '단순 텍스트 (색 없음)', labelEn: 'Plain text (no colours)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('session', { style: 'plain', foreground: 'foreground', background: 'transparent', template: '{{ .UserName }}@{{ .HostName }}:' }),
        seg('path', { style: 'plain', foreground: 'foreground', background: 'transparent', template: '{{ .Path }}', properties: { style: 'full' } }),
        seg('git', { style: 'plain', foreground: 'foreground', background: 'transparent', template: ' ({{ .Branch }})' }),
        seg('text', { style: 'plain', foreground: 'foreground', background: 'transparent', template: '$' }),
      ] }],
    },
  },
  bubbles: {
    label: '버블 (둥근 캡슐)', labelEn: 'Bubbles (rounded pills)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('os', { style: 'diamond', foreground: '#ffffff', background: '#546e7a', template: ' {{ .Icon }} ' }),
        seg('path', { style: 'diamond', foreground: '#ffffff', background: '#1e88e5', template: ' [[icon:folder]] {{ .Path }} ', properties: { style: 'agnoster_short', max_depth: 2 } }),
        seg('git', { style: 'diamond', foreground: '#1b1e24', background: 'auto', template: ' [[icon:gitBranch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }} ' }),
        seg('time', { style: 'diamond', foreground: '#ffffff', background: '#8e24aa', template: ' {{ .CurrentDate | date "15:04" }} ' }),
      ] }],
    },
  },
  robbyrussell: {
    label: 'Robby Russell (➜ 경로 git)', labelEn: 'Robby Russell (➜ path git)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('status', { style: 'plain', foreground: '#50fa7b', background: 'transparent', foreground_templates: ['{{ if gt .Code 0 }}#ff5555{{ end }}'], template: '➜', properties: { always_enabled: true } }),
        seg('path', { style: 'plain', foreground: '#8be9fd', background: 'transparent', template: ' {{ .Path }}', properties: { style: 'folder' } }),
        seg('git', { style: 'plain', foreground: '#6272a4', background: 'transparent', template: ' git:({{ .Branch }}){{ if .Working.Changed }} ✗{{ end }}' }),
      ] }],
    },
  },
  pure: {
    label: 'Pure (두 줄 · 담백)', labelEn: 'Pure (two lines, quiet)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [
        { type: 'prompt', alignment: 'left', segments: [
          seg('path', { style: 'plain', foreground: '#6272a4', background: 'transparent', template: '{{ .Path }}', properties: { style: 'full' } }),
          seg('git', { style: 'plain', foreground: '#8be9fd', background: 'transparent', template: ' {{ .Branch }}{{ if .Working.Changed }}*{{ end }}{{ if gt .Ahead 0 }} ⇡{{ end }}{{ if gt .Behind 0 }} ⇣{{ end }}' }),
          seg('executiontime', { style: 'plain', foreground: '#f1fa8c', background: 'transparent', template: ' {{ .FormattedMs }}', properties: { threshold: 5000 } }),
        ] },
        { type: 'prompt', alignment: 'left', newline: true, segments: [
          seg('status', { style: 'plain', foreground: '#ff79c6', background: 'transparent', foreground_templates: ['{{ if gt .Code 0 }}#ff5555{{ end }}'], template: '❯', properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
  star: {
    label: 'Star (두 줄 · 시간 · OS)', labelEn: 'Star (two lines, time, OS)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [
        { type: 'prompt', alignment: 'left', segments: [
          seg('os', { foreground: '#ffffff', background: '#3f51b5', template: ' {{ .Icon }} ' }),
          seg('session', { foreground: '#ffffff', background: '#7b1fa2', template: ' {{ .UserName }} ' }),
          seg('path', { foreground: '#ffffff', background: '#0097a7', template: ' [[icon:folder]] {{ .Path }} ', properties: { style: 'agnoster_short', max_depth: 2 } }),
          seg('git', { foreground: '#1b1e24', background: '#8bc34a', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#ffb74d{{ end }}'], template: ' [[icon:gitBranch]] {{ .Branch }}{{ if .BranchStatus }} {{ .BranchStatus }}{{ end }} ' }),
          seg('time', { foreground: '#ffffff', background: '#455a64', template: ' {{ .CurrentDate | date "Mon 15:04" }} ' }),
        ] },
        { type: 'prompt', alignment: 'left', newline: true, segments: [
          seg('status', { style: 'plain', foreground: '#ffd54f', background: 'transparent', foreground_templates: ['{{ if gt .Code 0 }}#ff5c5c{{ end }}'], template: '★', properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
  slim: {
    label: '슬림 (경로 · 기호만)', labelEn: 'Slim (path, symbols only)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('path', { style: 'plain', foreground: 'accent', background: 'transparent', template: '{{ .Path }}', properties: { style: 'agnoster_short', max_depth: 2 } }),
        seg('git', { style: 'plain', foreground: 'auto', background: 'transparent', template: ' {{ .Branch }}{{ if .Symbols }}{{ .Symbols }}{{ end }}' }),
        seg('text', { style: 'plain', foreground: 'foreground', background: 'transparent', template: ' »' }),
      ] }],
    },
  },
  material: {
    label: 'Material (색 글자)', labelEn: 'Material (coloured text)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('session', { style: 'plain', foreground: '#ffb300', background: 'transparent', template: '{{ .UserName }}' }),
        seg('text', { style: 'plain', foreground: '#90a4ae', background: 'transparent', template: ' in ' }),
        seg('path', { style: 'plain', foreground: '#26c6da', background: 'transparent', template: '{{ .Path }}', properties: { style: 'agnoster_short', max_depth: 3 } }),
        seg('git', { style: 'plain', foreground: '#ab47bc', background: 'transparent', template: ' on {{ .Branch }}{{ if .Working.Changed }} [{{ .Working.String }}]{{ end }}' }),
        seg('status', { style: 'plain', foreground: '#66bb6a', background: 'transparent', foreground_templates: ['{{ if gt .Code 0 }}#ef5350{{ end }}'], template: ' ❯', properties: { always_enabled: true } }),
      ] }],
    },
  },
  classic: {
    label: '클래식 (user@host:path$)', labelEn: 'Classic (user@host:path$)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('session', { style: 'plain', foreground: '#50fa7b', background: 'transparent', template: '{{ .UserName }}@{{ .HostName }}' }),
        seg('text', { style: 'plain', foreground: 'foreground', background: 'transparent', template: ':' }),
        seg('path', { style: 'plain', foreground: '#6272a4', background: 'transparent', template: '{{ .Path }}', properties: { style: 'full' } }),
        seg('git', { style: 'plain', foreground: '#f1fa8c', background: 'transparent', template: ' ({{ .Branch }})' }),
        seg('text', { style: 'plain', foreground: 'foreground', background: 'transparent', template: '$' }),
      ] }],
    },
  },
  rainbow: {
    label: '레인보우 (전체 정보)', labelEn: 'Rainbow (everything)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('os', { foreground: '#ffffff', background: '#d32f2f', template: ' {{ .Icon }} ' }),
        seg('session', { foreground: '#ffffff', background: '#f57c00', template: ' {{ .UserName }}@{{ .HostName }} ' }),
        seg('shell', { foreground: '#1b1e24', background: '#fbc02d', template: ' {{ .Name }} ' }),
        seg('path', { foreground: '#ffffff', background: '#388e3c', template: ' {{ .Path }} ', properties: { style: 'folder' } }),
        seg('git', { foreground: '#ffffff', background: '#1976d2', template: ' {{ .HEAD }}{{ if .Symbols }} {{ .Symbols }}{{ end }} ' }),
        seg('executiontime', { foreground: '#ffffff', background: '#512da8', template: ' {{ .FormattedMs }} ', properties: { threshold: 1000 } }),
        seg('status', { foreground: '#ffffff', background: '#7b1fa2', background_templates: ['{{ if gt .Code 0 }}#c62828{{ end }}'], template: ' {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ', properties: { always_enabled: true } }),
        seg('time', { foreground: '#ffffff', background: '#455a64', template: ' {{ .CurrentDate | date "15:04" }} ' }),
      ] }],
    },
  },
  ocean: {
    label: '오션 (파랑 계열 두 줄)', labelEn: 'Ocean (blues, two lines)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [
        { type: 'prompt', alignment: 'left', segments: [
          seg('session', { foreground: '#e3f2fd', background: '#0d47a1', template: ' {{ .UserName }}@{{ .HostName }} ' }),
          seg('path', { foreground: '#0d47a1', background: '#64b5f6', template: ' [[icon:folder]] {{ .Path }} ', properties: { style: 'agnoster_short', max_depth: 3 } }),
          seg('git', { foreground: '#0d47a1', background: '#b3e5fc', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#ffe082{{ end }}'], template: ' [[icon:gitBranch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }} ' }),
          seg('time', { foreground: '#e3f2fd', background: '#1565c0', template: ' {{ .CurrentDate | date "15:04" }} ' }),
        ] },
        { type: 'prompt', alignment: 'left', newline: true, segments: [
          seg('status', { style: 'plain', foreground: '#64b5f6', background: 'transparent', foreground_templates: ['{{ if gt .Code 0 }}#ff5c5c{{ end }}'], template: '❯', properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
  mono: {
    label: '모노 (회색 파워라인)', labelEn: 'Mono (grey powerline)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('session', { foreground: '#eeeeee', background: '#424242', template: ' {{ .UserName }} ' }),
        seg('path', { foreground: '#eeeeee', background: '#616161', template: ' {{ .Path }} ', properties: { style: 'folder' } }),
        seg('git', { foreground: '#212121', background: '#bdbdbd', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#ffcc80{{ end }}'], template: ' {{ .HEAD }}{{ if .Symbols }} {{ .Symbols }}{{ end }} ' }),
        seg('status', { foreground: '#eeeeee', background: '#757575', background_templates: ['{{ if gt .Code 0 }}#c62828{{ end }}'], template: ' {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ', properties: { always_enabled: true } }),
      ] }],
    },
  },
  forest: {
    label: '포레스트 (녹색 계열)', labelEn: 'Forest (greens)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('os', { foreground: '#e8f5e9', background: '#1b5e20', template: ' {{ .Icon }} ' }),
        seg('path', { foreground: '#e8f5e9', background: '#2e7d32', template: ' [[icon:folder]] {{ .Path }} ', properties: { style: 'agnoster_short', max_depth: 2 } }),
        seg('git', { foreground: '#1b5e20', background: '#a5d6a7', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#ffe082{{ end }}', '{{ if gt .Ahead 0 }}#c5e1a5{{ end }}'], template: ' [[icon:gitBranch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }} ' }),
        seg('executiontime', { foreground: '#e8f5e9', background: '#558b2f', template: ' {{ .FormattedMs }} ', properties: { threshold: 500 } }),
        seg('status', { foreground: '#e8f5e9', background: '#33691e', background_templates: ['{{ if gt .Code 0 }}#c62828{{ end }}'], template: ' {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ', properties: { always_enabled: true } }),
      ] }],
    },
  },
  sunset: {
    label: '선셋 (주황·자주 다이아몬드)', labelEn: 'Sunset (orange · purple diamonds)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('session', { style: 'diamond', foreground: '#ffffff', background: '#ef6c00', template: ' {{ .UserName }} ' }),
        seg('path', { style: 'diamond', foreground: '#ffffff', background: '#d81b60', template: ' [[icon:folder]] {{ .Path }} ', properties: { style: 'folder' } }),
        seg('git', { style: 'diamond', foreground: '#ffffff', background: '#8e24aa', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#f4511e{{ end }}'], template: ' {{ .HEAD }}{{ if .Symbols }} {{ .Symbols }}{{ end }} ' }),
        seg('time', { style: 'diamond', foreground: '#ffffff', background: '#5e35b1', template: ' {{ .CurrentDate | date "15:04" }} ' }),
      ] }],
    },
  },
  nord: {
    label: '노르드 (차분한 파랑·회색)', labelEn: 'Nord (calm blues and greys)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [{ type: 'prompt', alignment: 'left', segments: [
        seg('session', { foreground: '#eceff4', background: '#4c566a', template: ' {{ .UserName }}@{{ .HostName }} ' }),
        seg('path', { foreground: '#2e3440', background: '#88c0d0', template: ' {{ .Path }} ', properties: { style: 'agnoster_short', max_depth: 3 } }),
        seg('git', { foreground: '#2e3440', background: '#a3be8c', background_templates: ['{{ if or (.Working.Changed) (.Staging.Changed) }}#ebcb8b{{ end }}', '{{ if gt .Behind 0 }}#81a1c1{{ end }}'], template: ' [[icon:gitBranch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }} ' }),
        seg('status', { foreground: '#eceff4', background: '#5e81ac', background_templates: ['{{ if gt .Code 0 }}#bf616a{{ end }}'], template: ' {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ', properties: { always_enabled: true } }),
      ] }],
    },
  },
  dev: {
    label: '개발자 (셸 · 경로 · git · 시간, 두 줄)', labelEn: 'Developer (shell · path · git · time, two lines)',
    config: {
      version: PROMPT_VERSION, final_space: true, newline: false, palette: {},
      blocks: [
        { type: 'prompt', alignment: 'left', segments: [
          seg('shell', { foreground: '#1b1e24', background: '#ffb74d', template: ' {{ .Name }} ' }),
          seg('path', { foreground: '#ffffff', background: '#3949ab', template: ' [[icon:folder]] {{ .Path }} ', properties: { style: 'full' } }),
          seg('git', { foreground: '#1b1e24', background: 'auto', template: ' [[icon:gitBranch]] {{ .Branch }}{{ if .Symbols }} {{ .Symbols }}{{ end }}{{ if gt .StashCount 0 }} ⚑{{ .StashCount }}{{ end }} ' }),
          seg('executiontime', { foreground: '#ffffff', background: '#00838f', template: ' ⏱ {{ .FormattedMs }} ', properties: { threshold: 1000 } }),
          seg('time', { foreground: '#ffffff', background: '#546e7a', template: ' {{ .CurrentDate | date "15:04:05" }} ' }),
        ] },
        { type: 'prompt', alignment: 'left', newline: true, segments: [
          seg('status', { style: 'plain', foreground: '#7CFC8B', background: 'transparent', foreground_templates: ['{{ if gt .Code 0 }}#ff5c5c{{ end }}'], template: '{{ if gt .Code 0 }}✘ {{ .Code }} {{ end }}❯', properties: { always_enabled: true } }),
        ] },
      ],
    },
  },
};

for (const [id, p] of Object.entries(PRESETS)) p.config.preset = id;

export const PROMPT_DEFAULT = PRESETS.default.config;

export function clonePrompt(cfg) { return JSON.parse(JSON.stringify(cfg || PROMPT_DEFAULT)); }

// Anything that came from a session file or an import is made whole here.
export function normalizePrompt(cfg) {
  const c = clonePrompt(cfg && typeof cfg === 'object' ? cfg : PROMPT_DEFAULT);
  if (!Array.isArray(c.blocks) || !c.blocks.length) c.blocks = clonePrompt(PROMPT_DEFAULT).blocks;
  c.version = PROMPT_VERSION;
  c.preset = typeof c.preset === 'string' ? c.preset : '';
  c.final_space = c.final_space !== false;
  c.palette = c.palette && typeof c.palette === 'object' ? c.palette : {};
  c.blocks = c.blocks.map((b) => ({ type: b.type || 'prompt', alignment: b.alignment || 'left', newline: !!b.newline, segments: (Array.isArray(b.segments) ? b.segments : []).map((s) => ({
    type: SEGMENT_TYPES.includes(s.type) ? s.type : 'text',
    enabled: s.enabled !== false,   // the simple settings switch segments off without losing them
    style: SEGMENT_STYLES.includes(s.style) ? s.style : 'powerline',
    foreground: s.foreground || 'foreground',
    background: s.background || 'transparent',
    foreground_templates: Array.isArray(s.foreground_templates) ? s.foreground_templates : undefined,
    background_templates: Array.isArray(s.background_templates) ? s.background_templates : undefined,
    powerline_symbol: s.powerline_symbol || '\ue0b0',
    leading_diamond: s.leading_diamond || '',
    trailing_diamond: s.trailing_diamond || '',
    template: typeof s.template === 'string' ? s.template : defaultTemplate(s.type),
    properties: s.properties && typeof s.properties === 'object' ? s.properties : {},
  })) }));
  return c;
}

export function defaultTemplate(type) {
  switch (type) {
    case 'path': return ' [[icon:folder]] {{ .Path }} ';
    case 'git': return ' {{ .HEAD }}{{ if .BranchStatus }} {{ .BranchStatus }}{{ end }}{{ if .Working.Changed }} ✎ {{ .Working.String }}{{ end }}{{ if .Staging.Changed }} ✚ {{ .Staging.String }}{{ end }} ';
    case 'session': return ' {{ .UserName }}@{{ .HostName }} ';
    case 'shell': return ' {{ .Name }} ';
    case 'os': return ' {{ .Icon }} ';
    case 'time': return ' {{ .CurrentDate | date "15:04:05" }} ';
    case 'status': return ' {{ if gt .Code 0 }}✘ {{ .Code }}{{ else }}✔{{ end }} ';
    case 'executiontime': return ' {{ .FormattedMs }} ';
    case 'root': return ' ⚡ ';
    default: return ' text ';
  }
}

// ── Template engine (Go text/template subset) ─────────────
//   {{ .A.B }}  {{ .X | date "15:04" }}  {{ .X | upper }}
//   {{ if COND }} … {{ else if COND }} … {{ else }} … {{ end }}
//   COND: .X | gt/lt/ge/le/eq/ne A B | and … | or … | not A | ( … ) | literals

function tokenize(src) {
  const out = [];
  const re = /\s*(?:("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|(\.[A-Za-z_][\w.]*|\.)|([A-Za-z_]\w*)|(\(|\)|\|))/y;
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    const m = re.exec(src);
    if (!m) break;   // trailing whitespace or an unknown character ends the scan
    if (m[1] !== undefined) out.push({ k: 'str', v: JSON.parse(m[1]) });
    else if (m[2] !== undefined) out.push({ k: 'num', v: Number(m[2]) });
    else if (m[3] !== undefined) out.push({ k: 'field', v: m[3] });
    else if (m[4] !== undefined) out.push({ k: 'id', v: m[4] });
    else if (m[5] !== undefined) out.push({ k: m[5] });
  }
  return out;
}

const FUNCS = new Set(['gt', 'lt', 'ge', 'le', 'eq', 'ne', 'and', 'or', 'not', 'len', 'date', 'upper', 'lower', 'trunc', 'default', 'printf']);

function lookup(ctx, field) {
  if (field === '.') return ctx;
  let v = ctx;
  for (const part of field.slice(1).split('.')) { if (v == null) return undefined; v = v[part]; }
  return v;
}

// Parses one expression from tokens[pos]; a function call takes every
// following argument up to the end of the group (like Go templates).
function parseExpr(tokens, pos, ctx) {
  const tk = tokens[pos];
  if (!tk) return [undefined, pos];
  if (tk.k === '(') {
    const [v, p] = parseExpr(tokens, pos + 1, ctx);
    let q = p;
    // absorb a pipeline inside the group
    let val = v;
    while (tokens[q] && tokens[q].k === '|') { const [nv, np] = parsePipe(tokens, q + 1, val, ctx); val = nv; q = np; }
    return [val, tokens[q] && tokens[q].k === ')' ? q + 1 : q];
  }
  if (tk.k === 'str' || tk.k === 'num') return [tk.v, pos + 1];
  if (tk.k === 'field') return [lookup(ctx, tk.v), pos + 1];
  if (tk.k === 'id') {
    if (tk.v === 'true') return [true, pos + 1];
    if (tk.v === 'false') return [false, pos + 1];
    if (tk.v === 'nil') return [null, pos + 1];
    if (FUNCS.has(tk.v)) {
      const args = [];
      let p = pos + 1;
      while (tokens[p] && tokens[p].k !== ')' && tokens[p].k !== '|') { const [v, np] = parseExpr(tokens, p, ctx); args.push(v); if (np === p) break; p = np; }
      return [callFunc(tk.v, args), p];
    }
    return [undefined, pos + 1];
  }
  return [undefined, pos + 1];
}

function parsePipe(tokens, pos, input, ctx) {
  const tk = tokens[pos];
  if (!tk || tk.k !== 'id') return [input, pos];
  const args = [];
  let p = pos + 1;
  while (tokens[p] && tokens[p].k !== ')' && tokens[p].k !== '|') { const [v, np] = parseExpr(tokens, p, ctx); args.push(v); if (np === p) break; p = np; }
  return [callFunc(tk.v, [...args, input]), p];
}

function truthy(v) { return !(v === undefined || v === null || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length)); }

function callFunc(name, a) {
  switch (name) {
    case 'gt': return Number(a[0]) > Number(a[1]);
    case 'lt': return Number(a[0]) < Number(a[1]);
    case 'ge': return Number(a[0]) >= Number(a[1]);
    case 'le': return Number(a[0]) <= Number(a[1]);
    case 'eq': return a.slice(1).some((x) => x === a[0]);
    case 'ne': return a[0] !== a[1];
    case 'and': return a.every(truthy) ? a[a.length - 1] : a.find((x) => !truthy(x));
    case 'or': { const hit = a.find(truthy); return hit === undefined ? a[a.length - 1] : hit; }
    case 'not': return !truthy(a[0]);
    case 'len': return a[0] == null ? 0 : (a[0].length !== undefined ? a[0].length : Object.keys(a[0]).length);
    case 'upper': return String(a[a.length - 1] ?? '').toUpperCase();
    case 'lower': return String(a[a.length - 1] ?? '').toLowerCase();
    case 'trunc': return String(a[1] ?? '').slice(0, Number(a[0]) || 0);
    case 'default': return truthy(a[1]) ? a[1] : a[0];
    case 'printf': return String(a[0] ?? '').replace(/%[sdv]/g, () => { const v = a.splice(1, 1)[0]; return String(v ?? ''); });
    case 'date': return goDate(a[a.length - 1], String(a[0] ?? '15:04'));
    default: return '';
  }
}

// Go reference-time layouts (2006-01-02 15:04:05 Mon Jan PM) → formatted date.
export function goDate(d, layout) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  const p2 = (n) => String(n).padStart(2, '0');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const h12 = dt.getHours() % 12 || 12;
  const map = [
    ['2006', String(dt.getFullYear())], ['January', months[dt.getMonth()]], ['Monday', days[dt.getDay()]],
    ['Jan', months[dt.getMonth()].slice(0, 3)], ['Mon', days[dt.getDay()].slice(0, 3)],
    ['01', p2(dt.getMonth() + 1)], ['02', p2(dt.getDate())], ['_2', String(dt.getDate()).padStart(2, ' ')],
    ['15', p2(dt.getHours())], ['03', p2(h12)], ['04', p2(dt.getMinutes())], ['05', p2(dt.getSeconds())],
    ['PM', dt.getHours() >= 12 ? 'PM' : 'AM'], ['pm', dt.getHours() >= 12 ? 'pm' : 'am'],
    ['06', String(dt.getFullYear()).slice(-2)], ['1', String(dt.getMonth() + 1)], ['2', String(dt.getDate())], ['3', String(h12)], ['4', String(dt.getMinutes())], ['5', String(dt.getSeconds())],
  ];
  let out = '';
  let i = 0;
  while (i < layout.length) {
    const hit = map.find(([k]) => layout.startsWith(k, i));
    if (hit) { out += hit[1]; i += hit[0].length; } else { out += layout[i]; i++; }
  }
  return out;
}

// Renders a template against a context. Unknown fields render as ''.
export function renderTemplate(tpl, ctx) {
  const src = String(tpl || '');
  const parts = [];
  const re = /\{\{-?\s*([\s\S]*?)\s*-?\}\}/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index) });
    parts.push({ action: m[1].trim() });
    last = re.lastIndex;
  }
  if (last < src.length) parts.push({ text: src.slice(last) });

  let i = 0;
  const evalExpr = (s) => { const tokens = tokenize(s); let [v, p] = parseExpr(tokens, 0, ctx); while (tokens[p] && tokens[p].k === '|') { const [nv, np] = parsePipe(tokens, p + 1, v, ctx); v = nv; p = np; } return v; };
  // Renders until an {{ else }} / {{ end }} at this nesting level; returns [text, stopper].
  const render = () => {
    let out = '';
    while (i < parts.length) {
      const p = parts[i++];
      if (p.text !== undefined) { out += p.text; continue; }
      const a = p.action;
      if (a === 'end') return [out, 'end'];
      if (a === 'else') return [out, 'else'];
      if (a.startsWith('else if ')) return [out, a];
      if (a.startsWith('if ')) {
        let cond = truthy(evalExpr(a.slice(3)));
        let taken = false;
        for (;;) {
          const [body, stop] = render();
          if (cond && !taken) { out += body; taken = true; }
          if (stop === 'end' || stop === undefined) break;
          if (stop === 'else') cond = !taken; // else branch
          else if (stop.startsWith('else if ')) cond = !taken && truthy(evalExpr(stop.slice(8)));
        }
        continue;
      }
      const v = evalExpr(a);
      out += v === undefined || v === null || v === false ? '' : (v instanceof Date ? goDate(v, '2006-01-02 15:04:05') : String(v));
    }
    return [out, undefined];
  };
  return render()[0];
}

// ── Contexts ──────────────────────────────────────────────

function splitPath(p) {
  const s = String(p || '');
  const parts = s.split(/[\\/]+/).filter(Boolean);
  const win = /^[a-zA-Z]:$/.test(parts[0] || '');
  const sep = s.includes('\\') ? '\\' : '/';
  return { parts, win, sep, absolute: s.startsWith('/') };
}

// oh-my-posh path styles: full, folder, agnoster, agnoster_full, agnoster_short, agnoster_left, letter, mixed, unique
export function formatPath(cwd, home, props = {}) {
  const style = props.style || 'full';
  const homeIcon = props.home_icon !== undefined ? props.home_icon : '~';
  const sepIcon = props.folder_separator_icon !== undefined ? props.folder_separator_icon : null;
  const maxDepth = Number(props.max_depth) > 0 ? Number(props.max_depth) : 1;
  const maxWidth = Number(props.max_width) > 0 ? Number(props.max_width) : 0;
  let p = String(cwd || '');
  const h = String(home || '').replace(/[\\/]+$/, '');
  let inHome = false;
  if (h && (p === h || p.toLowerCase() === h.toLowerCase() || p.toLowerCase().startsWith(h.toLowerCase() + '\\') || p.toLowerCase().startsWith(h.toLowerCase() + '/'))) { inHome = true; p = p.slice(h.length); }
  const { parts, win, sep } = splitPath(p);
  const head = inHome ? [homeIcon] : (win ? [parts[0]] : (p.startsWith('/') ? [''] : []));
  const rest = inHome ? parts : (win ? parts.slice(1) : parts);
  const join = (arr) => (sepIcon !== null ? arr.join(sepIcon) : (arr.length && arr[0] === '' ? '/' + arr.slice(1).join('/') : arr.join(sep)));
  const all = [...head, ...rest];
  const folder = rest.length ? rest[rest.length - 1] : (head[0] || p || sep);
  switch (style) {
    case 'folder': return folder;
    case 'agnoster': return join([...head, ...rest.slice(0, -1).map((x) => x.slice(0, 1)), ...(rest.length ? [folder] : [])]);
    case 'agnoster_left': return join([...head, ...(rest.length ? [rest[0]] : []), ...rest.slice(1, -1).map((x) => x.slice(0, 1)), ...(rest.length > 1 ? [folder] : [])]);
    case 'agnoster_short': return join(rest.length > maxDepth ? [...head, '…', ...rest.slice(-maxDepth)] : all);
    case 'letter': return join([...head, ...rest.slice(0, -1).map((x) => x.slice(0, 1)), ...(rest.length ? [folder] : [])]);
    case 'unique': return join([...head, ...rest.slice(0, -1).map((x) => x.slice(0, 1)), ...(rest.length ? [folder] : [])]);
    case 'mixed': { const full = join(all); return maxWidth && full.length > maxWidth ? join([...head, '…', folder]) : full; }
    case 'agnoster_full':
    case 'full':
    default: return sepIcon !== null ? join(all) : (inHome ? [homeIcon, ...rest].join(sep) : (p || sep));
  }
}

function workingString(git) {
  if (!git || !git.repo) return '';
  const bits = [];
  if (git.changed) bits.push(`~${git.changed}`);
  if (git.untracked) bits.push(`?${git.untracked}`);
  if (git.conflicts) bits.push(`!${git.conflicts}`);
  return bits.join(' ');
}

const OS_ICONS = { win32: '⊞', darwin: '', linux: '🐧' };

// Builds the template context of one segment from the terminal's state.
export function segmentContext(type, s, props = {}) {
  const git = s.git && s.git.repo ? s.git : null;
  switch (type) {
    case 'path': {
      const path = formatPath(s.cwd, s.home, props);
      const { parts } = splitPath(s.cwd || '');
      return { Path: path, Location: s.cwd || '', Folder: parts[parts.length - 1] || s.cwd || '', Parent: parts.slice(0, -1).join(s.cwd && s.cwd.includes('\\') ? '\\' : '/'), Writable: true, RootDir: parts.length <= 1 };
    }
    case 'git': {
      if (!git) return { Repo: false };
      const icon = props.branch_icon !== undefined ? props.branch_icon : '⎇ ';
      const symbols = [git.ahead > 0 ? '↑' : '', git.behind > 0 ? '↓' : '', git.staged > 0 ? '+' : '', git.changed > 0 ? '~' : '', git.untracked > 0 ? '?' : '', git.conflicts > 0 ? '!' : ''].join('');
      const branchStatus = git.ahead && git.behind ? `↕ ↑${git.ahead} ↓${git.behind}` : git.ahead ? `↑${git.ahead}` : git.behind ? `↓${git.behind}` : (git.upstream ? '≡' : '');
      return {
        Repo: true, HEAD: `${icon}${git.branch || '(detached)'}`, Branch: git.branch || '(detached)', Ref: git.branch || '', Upstream: git.upstream || '', UpstreamIcon: git.upstream ? '☁ ' : '',
        Ahead: git.ahead || 0, Behind: git.behind || 0, BranchStatus: branchStatus, StashCount: git.stashes || 0, State: gitState(git), Symbols: symbols,
        Working: { Changed: (git.changed + git.untracked + git.conflicts) > 0, Modified: git.changed || 0, Untracked: git.untracked || 0, Unmerged: git.conflicts || 0, Added: 0, Deleted: 0, String: workingString(git) },
        Staging: { Changed: git.staged > 0, Added: git.staged || 0, Modified: 0, Deleted: 0, String: git.staged ? `+${git.staged}` : '' },
        Detached: /^@/.test(git.branch || ''), Merge: false, Rebase: false, CherryPick: false,
      };
    }
    case 'session': return { UserName: s.user || '', HostName: s.host || '', SSHSession: false, Root: !!s.root, DefaultUserName: '' };
    case 'shell': return { Name: s.shell || '', Version: '' };
    case 'os': return { Icon: props[s.platform === 'win32' ? 'windows' : s.platform === 'darwin' ? 'macos' : 'linux'] || OS_ICONS[s.platform] || '', OS: s.platform || '' };
    case 'time': return { CurrentDate: s.now || new Date(), Format: props.time_format || '15:04:05' };
    case 'status': { const code = Number(s.rc) || 0; return { Code: code, Error: code !== 0, String: code ? String(code) : '' }; }
    case 'executiontime': { const ms = Number(s.ms) || 0; return { Ms: ms, FormattedMs: formatMs(ms) }; }
    case 'root': return { Root: !!s.root };
    default: return {};
  }
}

export function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
  const m = Math.floor(ms / 60000), sec = Math.round((ms % 60000) / 1000);
  return `${m}m ${sec}s`;
}

// ── Rendering ─────────────────────────────────────────────

const NAMED = { black: '#000000', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#6272a4', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2', lightGreen: '#7CFC8B', darkGray: '#555555', lightGray: '#aaaaaa' };

// A colour spec → CSS colour. 'accent' / 'foreground' / 'background' follow the
// theme, 'auto' the git state, 'p:name' the palette, 'transparent' is none.
export function resolveColor(spec, { theme, gitStateName, palette, parentBackground }) {
  const v = String(spec || '').trim();
  if (!v || v === 'transparent') return null;
  if (v === 'accent') return theme.accent;
  if (v === 'foreground') return theme.fg;
  if (v === 'background') return theme.bg;
  if (v === 'parentBackground') return parentBackground || null;
  if (v === 'auto') return GIT_STATE_COLORS[gitStateName || 'none'];
  if (v.startsWith('p:')) return resolveColor((palette || {})[v.slice(2)] || '', { theme, gitStateName, palette: {} , parentBackground });
  if (NAMED[v]) return NAMED[v];
  return v;
}

function firstTemplate(list, ctx) {
  if (!Array.isArray(list)) return '';
  for (const tpl of list) { const r = renderTemplate(tpl, ctx).trim(); if (r) return r; }
  return '';
}

// Segments that should not appear at all in some states (as in oh-my-posh).
function segmentVisible(type, ctx, props, state) {
  if (type === 'git') return !!ctx.Repo;
  if (type === 'root') return !!ctx.Root;
  if (type === 'executiontime') { const th = props.threshold !== undefined ? Number(props.threshold) : 500; return ctx.Ms >= th; }
  if (type === 'status') return props.always_enabled ? true : ctx.Code !== 0;   // oh-my-posh: only on error unless always_enabled
  return true;
}

// state: { cwd, home, git, user, host, shell, platform, rc, ms, now, root }
// theme: { accent, fg, bg }
export function renderPrompt(config, state, theme) {
  const cfg = normalizePrompt(config);
  const th = theme || { accent: '#4cc9f0', fg: '#e6edf3', bg: '#12161c' };
  const gs = gitState(state.git);
  const blocks = [];
  for (const b of cfg.blocks) {
    if (b.type && b.type !== 'prompt') continue;   // rprompt blocks are not drawn (no right edge in an inline prompt)
    const segments = [];
    let prevBg = null;
    for (const s of b.segments) {
      if (s.enabled === false) continue;
      const ctx = segmentContext(s.type, state, s.properties || {});
      if (!segmentVisible(s.type, ctx, s.properties || {}, gs)) continue;
      const text = s.type === 'text' ? renderTemplate(s.template, { ...ctx, ...segmentContext('session', state), ...segmentContext('path', state, s.properties || {}) }) : renderTemplate(s.template, ctx);
      if (!text.trim() && s.type !== 'text') continue;
      if (!text) continue;
      const bgSpec = firstTemplate(s.background_templates, ctx) || s.background;
      const fgSpec = firstTemplate(s.foreground_templates, ctx) || s.foreground;
      const bg = resolveColor(bgSpec, { theme: th, gitStateName: gs, palette: cfg.palette, parentBackground: prevBg });
      const fg = resolveColor(fgSpec, { theme: th, gitStateName: gs, palette: cfg.palette, parentBackground: prevBg }) || th.fg;
      segments.push({ type: s.type, text, fg, bg, style: s.style, symbol: s.powerline_symbol, leading: s.leading_diamond, trailing: s.trailing_diamond });
      prevBg = bg;
    }
    if (segments.length) blocks.push({ newline: !!b.newline, segments });
  }
  return { blocks, finalSpace: cfg.final_space !== false, gitState: gs };
}

// ── oh-my-posh import ─────────────────────────────────────
// Takes a theme object (parsed JSON) and returns { config, mapped, skipped }.
// Segment types oh-my-posh has that we cannot draw (battery, node, python, …)
// are dropped and listed in `skipped`.

const OMP_TYPE_MAP = { path: 'path', git: 'git', session: 'session', shell: 'shell', os: 'os', time: 'time', status: 'status', exit: 'status', executiontime: 'executiontime', root: 'root', text: 'text' };

export function importOmp(theme) {
  const src = typeof theme === 'string' ? JSON.parse(theme) : theme;
  if (!src || !Array.isArray(src.blocks)) throw new Error('Not an oh-my-posh theme: no "blocks" array');
  const skipped = [];
  let mapped = 0;
  const blocks = src.blocks.map((b) => ({
    type: b.type === 'rprompt' ? 'rprompt' : 'prompt',
    alignment: b.alignment || 'left',
    newline: !!b.newline,
    segments: (b.segments || []).map((s) => {
      const type = OMP_TYPE_MAP[s.type];
      if (!type) { skipped.push(s.type); return null; }
      mapped++;
      const props = { ...(s.properties || s.options || {}) };
      let template = typeof s.template === 'string' ? s.template : defaultTemplate(type);
      if (s.type === 'exit') template = template.replace(/\.Text\b/g, '.String');
      return {
        type, style: SEGMENT_STYLES.includes(s.style) ? s.style : (s.style === 'accordion' ? 'powerline' : 'powerline'),
        foreground: s.foreground || 'foreground', background: s.background || 'transparent',
        foreground_templates: s.foreground_templates, background_templates: s.background_templates,
        powerline_symbol: s.powerline_symbol || '\ue0b0', leading_diamond: s.leading_diamond || '', trailing_diamond: s.trailing_diamond || '',
        template, properties: props,
      };
    }).filter(Boolean),
  })).filter((b) => b.segments.length);
  const config = normalizePrompt({ version: PROMPT_VERSION, final_space: src.final_space !== false, palette: src.palette || {}, blocks });
  return { config, mapped, skipped: Array.from(new Set(skipped)) };
}

export function exportOmp(config) {
  const c = normalizePrompt(config);
  const out = { $schema: 'https://raw.githubusercontent.com/JanDeDobbeleer/oh-my-posh/main/themes/schema.json', version: 2, final_space: c.final_space, palette: c.palette, blocks: c.blocks.map((b) => ({ type: b.type, alignment: b.alignment, ...(b.newline ? { newline: true } : {}), segments: b.segments.filter((s) => s.enabled !== false).map((s) => { const o = { type: s.type, style: s.style, foreground: s.foreground, background: s.background, template: s.template }; if (s.foreground_templates) o.foreground_templates = s.foreground_templates; if (s.background_templates) o.background_templates = s.background_templates; if (s.style === 'powerline') o.powerline_symbol = s.powerline_symbol; if (s.style === 'diamond') { o.leading_diamond = s.leading_diamond; o.trailing_diamond = s.trailing_diamond; } if (Object.keys(s.properties || {}).length) o.properties = s.properties; return o; }) })) };
  return JSON.stringify(out, null, 2);
}

// Sample states for the settings preview.
export const SAMPLE_STATES = {
  // short values for the small preset cards
  mini: { cwd: 'C:\\Users\\me\\src', home: 'C:\\Users\\me', git: { repo: true, branch: 'main', upstream: 'origin/main', ahead: 1, behind: 0, staged: 0, changed: 2, untracked: 0, conflicts: 0, stashes: 0 }, user: 'me', host: 'pc', shell: 'pwsh', platform: 'win32', rc: 0, ms: 1500, now: new Date(2026, 8, 16, 10, 5, 42) },
  clean: { cwd: 'C:\\Home\\Projects\\MyEditor', home: 'C:\\Users\\user', git: { repo: true, branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, stashes: 0 }, user: 'user', host: 'desktop', shell: 'pwsh', platform: 'win32', rc: 0, ms: 120, now: new Date(2026, 8, 16, 10, 5, 42) },
  dirty: { cwd: 'C:\\Home\\Projects\\MyEditor\\src\\components', home: 'C:\\Users\\user', git: { repo: true, branch: 'feature/tabs', upstream: 'origin/feature/tabs', ahead: 2, behind: 0, staged: 1, changed: 3, untracked: 1, conflicts: 0, stashes: 1 }, user: 'user', host: 'desktop', shell: 'pwsh', platform: 'win32', rc: 1, ms: 3200, now: new Date(2026, 8, 16, 10, 5, 42) },
  plain: { cwd: 'C:\\Users\\user\\Downloads', home: 'C:\\Users\\user', git: { repo: false }, user: 'user', host: 'desktop', shell: 'pwsh', platform: 'win32', rc: 0, ms: 40, now: new Date(2026, 8, 16, 10, 5, 42) },
};
