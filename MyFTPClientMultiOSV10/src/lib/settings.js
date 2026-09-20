// Default values of the Settings dialog / session (mirrors core/session.js).
export const DEFAULT_SHELL_PROMPTS = {
  cmd: '{path}>',
  powershell: 'PS {path}> ',
  pwsh: 'pwsh {path}> ',
  'git-bash': 'MINGW64 {path}$ ',
  msys2: 'MSYS {path}$ ',
  cygwin: '{path}$ ',
  nu: '{shell} {path}> ',
  fish: '{path}> ',
  posix: '{shell}:{path}$ ',
  wsl: '{shell}:{path}$ ',
};

export const SETTINGS_DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  fontSize: 13,
  terminalFont: '',
  terminalFontSize: 13,
  confirmDelete: true,
  restoreLocalPath: true,
  sounds: true,
  showConnectedDialog: true,
  transferConcurrency: 3,
  skipUnchanged: true,
  terminalStartDir: '',
  powershellPrompt: DEFAULT_SHELL_PROMPTS.powershell,
  shellPrompts: { ...DEFAULT_SHELL_PROMPTS },
  terminalMaxLines: 10000,
};

export function defaultPromptFor(shell) {
  const id = (shell && shell.id) || '';
  const kind = (shell && shell.kind) || '';
  if (DEFAULT_SHELL_PROMPTS[id]) return DEFAULT_SHELL_PROMPTS[id];
  if (String(id).startsWith('wsl:')) return DEFAULT_SHELL_PROMPTS.wsl;
  if (kind && DEFAULT_SHELL_PROMPTS[kind]) return DEFAULT_SHELL_PROMPTS[kind];
  return DEFAULT_SHELL_PROMPTS.posix;
}

export function pickSettingsValues(values = {}, extra = {}) {
  const src = values || {};
  const picked = {};
  for (const k of Object.keys(SETTINGS_DEFAULTS)) {
    if (k === 'shellPrompts') continue;
    picked[k] = src[k] !== undefined ? src[k] : SETTINGS_DEFAULTS[k];
  }
  picked.shellPrompts = { ...DEFAULT_SHELL_PROMPTS, ...(src.shellPrompts || {}) };
  if (src.powershellPrompt && picked.shellPrompts.powershell === DEFAULT_SHELL_PROMPTS.powershell) {
    picked.shellPrompts.powershell = src.powershellPrompt;
    picked.shellPrompts.pwsh = src.powershellPrompt;
  }
  picked.lastLocalPath = extra.localDir || src.lastLocalPath || '';
  return picked;
}

export function terminalFontStack(name) {
  const n = String(name || '').replace(/[\r\n"'\\;]/g, '').trim().slice(0, 80);
  const quoted = !n ? '' : (/\s/.test(n) || /[^\w-]/.test(n) ? `"${n}"` : n);
  const rest = '"Cascadia Mono", Consolas, D2Coding, "Noto Sans Mono CJK KR", monospace';
  return quoted ? `${quoted}, ${rest}` : rest;
}
