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
  minimapLike: false,
  defaultEncoding: 'utf8',
  defaultEol: process.platform === 'win32' ? 'crlf' : 'lf',
  trimTrailingOnSave: false,
  finalNewlineOnSave: false,
  restoreSession: true,
  reloadChangedFiles: true,
  confirmClose: true,
  sidebarVisible: true,
  sidebarWidth: 240,
  toolbarVisible: true,
  statusBarVisible: true,
  mdPreview: false,        // Markdown live preview pane
  mdWysiwyg: true,         // Markdown rendered in place while editing
  spellCheck: true,        // English spell checking (bundled en_US dictionary)
  spellCodeAll: false,     // in code files check every word, not only comments / strings
  autoIndent: true,        // Enter keeps the indentation; Tab inserts spaces (insertSpaces) or a tab, tabSize wide
  termVisible: false,      // terminal panel shown
  termHeight: 240,
  userWords: [],           // words added to the dictionary by the user
  mdPreviewWidth: 0.5,     // fraction of the editor area
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
