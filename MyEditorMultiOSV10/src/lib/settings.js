// Default values of the Settings dialog / session (mirrors core/session.js).
// The session file is the source of truth; these fill in until it loads.
import { PROMPT_DEFAULT } from './prompt.js';

export const SETTINGS_DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  customThemes: [],        // user-made themes (settings › theme): [{ id, label, mode, colors }]
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
  eolOnSave: 'keep',       // line ending written on save: keep (the file's own) | lf | crlf
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
  autocomplete: true,      // completion popup while typing (the language's own completions + words of the document)
  formatters: {},
  formatOnSave: false,
  split: 'none',
  termVisible: false,
  termHeight: 150,
  termCwd: '',
  termShell: '',
  termEol: 'auto',         // line ending Enter sends to a running program: auto (the shell's own) | lf | crlf
  termCr: 'overwrite',     // a lone CR in the output: overwrite (redraw the line, like a terminal) | newline | strip
  prompt: PROMPT_DEFAULT,  // terminal prompt theme (oh-my-posh compatible, see prompt.js)
  customPrompts: [],       // user-saved prompt themes (settings › terminal): [{ id, label, config }]
  mdPreviewWidth: 0.5,
  htmlPreview: false,      // HTML live preview pane
};

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS);

// What the Settings dialog's "기본값으로 되돌리기" resets: the preferences the
// dialog edits. Not the UI language (chosen with the flag, a surprise to lose)
// and not the window layout (sidebar, panes, terminal…, set from the View menu).
export const RESET_KEYS = [
  'theme', 'fontFamily', 'fontSize', 'tabSize', 'insertSpaces', 'wordWrap', 'lineNumbers', 'showWhitespace', 'highlightActiveLine',
  'autoCloseBrackets', 'bracketMatching', 'foldGutter', 'minimap', 'defaultEncoding', 'defaultEol', 'eolOnSave', 'trimTrailingOnSave', 'finalNewlineOnSave',
  'restoreSession', 'reloadChangedFiles', 'confirmClose', 'mdWysiwyg', 'spellCheck', 'spellCodeAll', 'autoIndent', 'lint', 'autocomplete',
  'formatters', 'formatOnSave', 'termCwd', 'termShell', 'termEol', 'termCr', 'prompt',
];
export const resetPatch = () => Object.fromEntries(RESET_KEYS.map((k) => [k, k === 'prompt' ? PROMPT_DEFAULT : Array.isArray(SETTINGS_DEFAULTS[k]) ? [] : typeof SETTINGS_DEFAULTS[k] === 'object' && SETTINGS_DEFAULTS[k] ? {} : SETTINGS_DEFAULTS[k]]));

export function pickSettings(obj) {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = obj && obj[k] !== undefined && obj[k] !== null ? obj[k] : SETTINGS_DEFAULTS[k];   // null (the session's "unset" prompt) takes the default too
  return out;
}

// Monospace fonts offered by the font picker (the input is free text too).
export const FONT_SUGGESTIONS = ['Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'D2Coding', 'Nanum Gothic Coding', 'Source Code Pro', 'Menlo', 'Monaco', 'SF Mono', 'DejaVu Sans Mono', 'Ubuntu Mono', 'Noto Sans Mono CJK KR', 'Courier New'];
