// Default values of the Settings dialog / session (mirrors core/session.js).
// The session file is the source of truth; these fill in until it loads.
export const SETTINGS_DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  fontFamily: '',
  fontSize: 14,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: false,
  lineNumbers: true,
  showWhitespace: false,
  highlightActiveLine: true,
  autoCloseBrackets: true,
  bracketMatching: true,
  foldGutter: true,
  defaultEncoding: 'utf8',
  defaultEol: 'lf',
  trimTrailingOnSave: false,
  finalNewlineOnSave: false,
  restoreSession: true,
  reloadChangedFiles: true,
  confirmClose: true,
  sidebarVisible: true,
  sidebarWidth: 240,
  toolbarVisible: true,
  statusBarVisible: true,
  mdPreview: false,
  mdWysiwyg: true,
  mdPreviewWidth: 0.5,
};

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS);

export function pickSettings(obj) {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = obj && obj[k] !== undefined ? obj[k] : SETTINGS_DEFAULTS[k];
  return out;
}

// Monospace fonts offered by the font picker (the input is free text too).
export const FONT_SUGGESTIONS = ['Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'D2Coding', 'Nanum Gothic Coding', 'Source Code Pro', 'Menlo', 'Monaco', 'SF Mono', 'DejaVu Sans Mono', 'Ubuntu Mono', 'Noto Sans Mono CJK KR', 'Courier New'];
