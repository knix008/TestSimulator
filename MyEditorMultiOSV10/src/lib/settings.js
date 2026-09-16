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
  minimap: true,
  defaultEncoding: 'utf8',
  defaultEol: 'lf',
  trimTrailingOnSave: false,
  finalNewlineOnSave: false,
  restoreSession: true,
  reloadChangedFiles: true,
  confirmClose: true,
  sidebarVisible: true,
  sidebarWidth: 240,
  searchVisible: false,
  searchRatio: 0.5,
  toolbarVisible: true,
  statusBarVisible: true,
  mdPreview: false,
  mdOutline: false,
  mdWysiwyg: true,
  spellCheck: true,
  spellCodeAll: false,
  autoIndent: true,
  lint: true,
  formatters: {},
  formatOnSave: false,
  split: 'none',
  termVisible: false,
  termHeight: 150,
  termCwd: '',
  termShell: '',
  mdPreviewWidth: 0.5,
};

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS);

// What the Settings dialog's "기본값으로 되돌리기" resets: the preferences the
// dialog edits. Not the UI language (chosen with the flag, a surprise to lose)
// and not the window layout (sidebar, panes, terminal…, set from the View menu).
export const RESET_KEYS = [
  'theme', 'fontFamily', 'fontSize', 'tabSize', 'insertSpaces', 'wordWrap', 'lineNumbers', 'showWhitespace', 'highlightActiveLine',
  'autoCloseBrackets', 'bracketMatching', 'foldGutter', 'minimap', 'defaultEncoding', 'defaultEol', 'trimTrailingOnSave', 'finalNewlineOnSave',
  'restoreSession', 'reloadChangedFiles', 'confirmClose', 'mdWysiwyg', 'spellCheck', 'spellCodeAll', 'autoIndent', 'lint',
  'formatters', 'formatOnSave', 'termCwd', 'termShell',
];
export const resetPatch = () => Object.fromEntries(RESET_KEYS.map((k) => [k, Array.isArray(SETTINGS_DEFAULTS[k]) ? [] : typeof SETTINGS_DEFAULTS[k] === 'object' && SETTINGS_DEFAULTS[k] ? {} : SETTINGS_DEFAULTS[k]]));

export function pickSettings(obj) {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = obj && obj[k] !== undefined ? obj[k] : SETTINGS_DEFAULTS[k];
  return out;
}

// Monospace fonts offered by the font picker (the input is free text too).
export const FONT_SUGGESTIONS = ['Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'D2Coding', 'Nanum Gothic Coding', 'Source Code Pro', 'Menlo', 'Monaco', 'SF Mono', 'DejaVu Sans Mono', 'Ubuntu Mono', 'Noto Sans Mono CJK KR', 'Courier New'];
