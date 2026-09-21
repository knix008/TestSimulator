// Session / settings persistence: one JSON file in the config directory
// (Electron: userData; web: --config or ~/.config/my-editor).
//
// Everything the UI wants to remember lives here — settings, window bounds,
// the open tabs (with unsaved "untitled" drafts), the recent-files list and
// the folder shown in the sidebar.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  customThemes: [],        // user-made themes (settings > theme): [{ id, label, mode, colors }]
  fontFamily: '',
  fontSize: 12,
  lineHeight: 1.55,        // editor line height (x font size)
  tabSize: 4,
  insertSpaces: true,
  wordWrap: false,
  lineNumbers: true,
  showWhitespace: false,
  indentGuides: true,      // vertical lines at every tab stop of the indent
  highlightActiveLine: true,
  autoCloseBrackets: true,
  bracketMatching: true,
  foldGutter: true,
  minimapLike: false,
  defaultEncoding: 'utf8',
  defaultLanguage: 'auto', // language of a new untitled document
  defaultEol: process.platform === 'win32' ? 'crlf' : 'lf',
  eolOnSave: 'keep',       // line ending written on save: keep (the file's own) | lf | crlf
  trimTrailingOnSave: false,
  finalNewlineOnSave: false,
  restoreSession: true,
  autoSave: 'off',         // off | blur | delay
  autoSaveDelay: 5,        // seconds after the last edit (autoSave = delay)
  reloadChangedFiles: true,
  confirmClose: true,
  sidebarVisible: true,
  treeShowHidden: false,   // the folder tree shows hidden files
  sidebarWidth: 240,
  searchVisible: false,    // the search section under the folder tree
  searchRatio: 0.5,        // the search section's share of the sidebar column (the folder tree gets the rest)
  toolbarVisible: true,
  statusBarVisible: true,
  mdPreview: false,        // Markdown live preview pane
  mdOutline: false,        // Markdown structure panel (the headings as a tree)
  mdWysiwyg: true,         // Markdown rendered in place while editing
  spellCheck: true,        // English spell checking (bundled en_US dictionary)
  spellCodeAll: false,     // in code files check every word, not only comments / strings
  autoIndent: true,        // Enter keeps the indentation; Tab inserts spaces (insertSpaces) or a tab, tabSize wide
  lint: true,              // run the language's checker in the background and mark its findings
  autocomplete: true,      // completion popup while typing (the language's completions + words of the document)
  minimap: true,           // the document drawn small at the right edge of the editor (click / hover to go there)
  formatters: {},          // language name → formatter id ('auto' = first installed, 'indent' = editor re-indent only, 'none')
  linters: {},             // language name → linter id ('auto' = first installed, 'none' = off for that language)
  formatOnSave: false,     // format the document before every save
  split: 'none',           // editor panes: none · cols · rows · grid
  splitX: 0.5,             // share of the left column (cols / grid), dragged on the splitter
  paneCount: 2,            // split = multi: how many panes (2..9), a balanced grid
  colFracs: [],            // multi: column widths as fractions (empty = equal)
  rowFracs: [],            // multi: row heights as fractions
  splitY: 0.5,             // share of the top row (rows / grid)
  paneDocs: [],            // which tab each pane showed (indices into tabs)
  activePane: 0,
  termVisible: false,      // any of the three bottom tabs is on
  showTerminal: false,     // toolbar 터미널 — independent of log / problems
  showLog: false,          // toolbar 로그
  showLint: false,         // toolbar Problems
  bottomTab: 'terminal',   // which of the open bottom tabs is in front
  termHeight: 195,         // ~8 output lines (12.5px × 1.45) + header, splitter, padding
  sessionVersion: 6,       // see the migrations in load()
  termCwd: '',             // where new terminals start; '' = the folder open in the sidebar (else the document's folder)
  termShell: '',           // shell of a new terminal (id from term.shells); '' = the first one offered
  termColor: true,         // terminal output in colour (ANSI + error / warning / link highlighting); false = plain
  termEol: 'auto',         // line ending Enter sends to a running program: auto (the shell's own) | lf | crlf
  termCr: 'overwrite',     // a lone CR in the output: overwrite (redraw the line, like a terminal) | newline | strip
  prompt: null,            // terminal prompt theme (JSON, src/lib/prompt.js); null = the default preset
  customPrompts: [],       // user-saved prompt themes: [{ id, label, config }]
  htmlPreview: false,      // HTML live preview pane
  imagePreview: true,      // SVG: the picture next to the editor (binary images fill the pane themselves)
  userWords: [],           // words added to the dictionary by the user
  mdPreviewWidth: 0.5,     // fraction of the editor area
  printHeader: true,       // code print: file name / path at the top of the page
  printLineNumbers: true,  // code print: a line-number column
  printBorder: false,      // code print: a frame around each page
  printPageNumbers: false, // code print: "n / total" at the bottom of each page
  printDate: false,        // code print: the date in the header
  printSyntax: true,       // code print: keyword / string / comment colours
  printColor: true,        // code print: colour (off: grayscale, bold kept)
  printZebra: true,        // code print: alternating row tint
  printGutter: true,       // code print: shaded line-number column
  printWrap: true,         // code print: wrap long lines
  printFontSize: 9.5,      // code print: type size in pt
  printLineHeight: 1.45,   // code print: line height
  folder: '',
  windowBounds: null,
  tabs: [],          // [{ path, name, cursor, scrollTop, draft, encoding, eol, language }]
  activeTab: 0,
  recent: [],        // most recent first, absolute paths
  themeBg: '#12161c',
};

const MAX_RECENT = 12;
const MAX_DRAFT = 512 * 1024;   // an unsaved untitled document larger than this is not kept across restarts

function defaultConfigDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'My Editor');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'My Editor');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'my-editor');
}

function createSession(configDir) {
  const dir = configDir || defaultConfigDir();
  const file = path.join(dir, 'session.json');
  let data = null;

  function load() {
    if (data) return data;
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { /* first run */ }
    data = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
    if (!Array.isArray(data.tabs)) data.tabs = [];
    if (!Array.isArray(data.recent)) data.recent = [];
    // One-off migrations of saved values whose default changed (the session
    // file keeps every key, so a new default alone would not reach an
    // existing installation).
    const savedVersion = saved && typeof saved === 'object' ? Number(saved.sessionVersion) || 1 : 1;
    if (savedVersion < 2 && data.termHeight === 240) data.termHeight = DEFAULTS.termHeight;   // v2: the panel starts lower
    if (savedVersion < 3 && data.termHeight === 180) data.termHeight = DEFAULTS.termHeight;   // v3: lower still
    if (savedVersion < 4 && data.termHeight === 150) data.termHeight = DEFAULTS.termHeight;   // v4: half of the previous default
    if (savedVersion < 5 && data.termHeight === 75) data.termHeight = DEFAULTS.termHeight;    // v5: about eight output lines
    if (savedVersion < 6 && data.showTerminal == null && data.showLog == null && data.showLint == null) {
      if (data.termVisible) {
        const tab = data.bottomTab || 'terminal';
        data.showTerminal = tab === 'terminal';
        data.showLog = tab === 'log';
        data.showLint = tab === 'lint';
      } else {
        data.showTerminal = false;
        data.showLog = false;
        data.showLint = false;
      }
    }
    data.sessionVersion = DEFAULTS.sessionVersion;
    return data;
  }

  function write() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    dir,
    file,
    defaults: DEFAULTS,
    get: () => ({ ...load() }),
    save(patch) {
      load();
      Object.assign(data, patch || {});
      if (Array.isArray(data.tabs)) {
        data.tabs = data.tabs.map((t) => (t && typeof t.draft === 'string' && t.draft.length > MAX_DRAFT ? { ...t, draft: '', draftTooLarge: true } : t));
      }
      write();
      return { ...data };
    },
    touchRecent(p) {
      load();
      const list = data.recent.filter((x) => x !== p);
      list.unshift(p);
      data.recent = list.slice(0, MAX_RECENT);
      write();
      return data.recent.slice();
    },
    removeRecent(p) {
      load();
      data.recent = data.recent.filter((x) => x !== p);
      write();
      return data.recent.slice();
    },
    clearRecent() {
      load();
      data.recent = [];
      write();
      return [];
    },
  };
}

module.exports = { createSession, DEFAULTS, defaultConfigDir };
