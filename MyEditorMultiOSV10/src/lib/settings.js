// Default values of the Settings dialog / session (mirrors core/session.js).
// The session file is the source of truth; these fill in until it loads.
import { PROMPT_DEFAULT } from './prompt.js';

export const SETTINGS_DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  customThemes: [],        // user-made themes (settings › theme): [{ id, label, mode, colors }]
  fontFamily: '',
  fontSize: 12,
  lineHeight: 1.55,        // editor line height (× font size)
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
  defaultLanguage: 'auto', // language of a new untitled document: auto (by what is typed / extension when saved) | plain | a language name
  defaultEol: 'lf',
  eolOnSave: 'keep',       // line ending written on save: keep (the file's own) | lf | crlf
  trimTrailingOnSave: false,
  finalNewlineOnSave: false,
  restoreSession: true,
  autoSave: 'off',         // save edited files by itself: off | blur (when the window loses the focus) | delay (autoSaveDelay seconds after the last edit)
  autoSaveDelay: 5,
  reloadChangedFiles: true,
  confirmClose: true,
  sidebarVisible: true,
  treeShowHidden: false,   // the folder tree shows hidden (dot) files
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
  linters: {},             // language name → linter id ('auto' = first installed, 'none' = off for that language)
  formatOnSave: false,
  split: 'none',
  splitX: 0.5,             // editor panes: share of the left column (cols / grid)
  paneCount: 2,            // split = multi (the toolbar button): how many panes, laid out as a balanced grid (2‥9)
  colFracs: [],            // multi: column widths as fractions (empty = equal), dragged on the splitters
  rowFracs: [],            // multi: row heights as fractions
  splitY: 0.5,             // editor panes: share of the top row (rows / grid)
  termVisible: false,
  termHeight: 150,
  termCwd: '',
  termShell: '',
  termColor: true,         // terminal output in colour: the programs' ANSI colours + errors / warnings / links highlighted; off = plain text
  termEol: 'auto',         // line ending Enter sends to a running program: auto (the shell's own) | lf | crlf
  termCr: 'overwrite',     // a lone CR in the output: overwrite (redraw the line, like a terminal) | newline | strip
  prompt: PROMPT_DEFAULT,  // terminal prompt theme (see prompt.js)
  customPrompts: [],       // user-saved prompt themes (settings › terminal): [{ id, label, config }]
  mdPreviewWidth: 0.5,
  htmlPreview: false,      // HTML live preview pane
  imagePreview: true,      // SVG: the picture next to the editor (binary images fill the pane themselves)
};

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS);

// What the Settings dialog's "기본값으로 되돌리기" resets: the preferences the
// dialog edits. Not the UI language (chosen with the flag, a surprise to lose)
// and not the window layout (sidebar, panes, terminal…, set from the View menu).
export const RESET_KEYS = [
  'theme', 'fontFamily', 'fontSize', 'lineHeight', 'autoSave', 'autoSaveDelay', 'defaultLanguage', 'treeShowHidden', 'tabSize', 'insertSpaces', 'wordWrap', 'lineNumbers', 'showWhitespace', 'highlightActiveLine',
  'autoCloseBrackets', 'bracketMatching', 'foldGutter', 'minimap', 'defaultEncoding', 'defaultEol', 'eolOnSave', 'trimTrailingOnSave', 'finalNewlineOnSave',
  'restoreSession', 'reloadChangedFiles', 'confirmClose', 'mdWysiwyg', 'spellCheck', 'spellCodeAll', 'autoIndent', 'lint', 'autocomplete',
  'formatters', 'linters', 'formatOnSave', 'termCwd', 'termShell', 'termColor', 'termEol', 'termCr', 'prompt',
];
export const resetPatch = () => Object.fromEntries(RESET_KEYS.map((k) => [k, k === 'prompt' ? PROMPT_DEFAULT : Array.isArray(SETTINGS_DEFAULTS[k]) ? [] : typeof SETTINGS_DEFAULTS[k] === 'object' && SETTINGS_DEFAULTS[k] ? {} : SETTINGS_DEFAULTS[k]]));

export function pickSettings(obj) {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = obj && obj[k] !== undefined && obj[k] !== null ? obj[k] : SETTINGS_DEFAULTS[k];   // null (the session's "unset" prompt) takes the default too
  return out;
}

// Monospace fonts offered by the font picker (the input is free text too).
export const FONT_SUGGESTIONS = ['Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'D2Coding', 'Nanum Gothic Coding', 'Source Code Pro', 'Menlo', 'Monaco', 'SF Mono', 'DejaVu Sans Mono', 'Ubuntu Mono', 'Noto Sans Mono CJK KR', 'Courier New'];
