// Session / settings persistence: one JSON file in the app's config folder.
//
//   left, right   — the panel paths to restore on the next start
//   splitter      — position of the panel divider (fraction of the width)
//   language      — 'ko' | 'en'
//   theme         — 'dark' | 'light' | 'system'
//   showHidden    — list dot-files
//   dockVisible, dockHeight — the bottom dock (log + terminal tabs)
//
// Electron passes app.getPath('userData'); the web server uses the XDG /
// AppData equivalent so a browser session survives a server restart too.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  left: '',
  right: '',
  splitter: 0.5,
  language: 'ko',
  theme: 'midnight',   // one of src/themes.js ids
  themeBg: '',         // the theme's window colour (for the native window before the UI paints)
  titleBg: '',         // the theme's title-bar colours (the native window controls are drawn in them)
  titleFg: '',
  showHidden: false,
  leftSort: { column: 'name', asc: true },
  rightSort: { column: 'name', asc: true },
  windowBounds: null,
  dockVisible: false,  // bottom dock (log + terminals)
  dockHeight: 220,
  termShell: '',       // shell of a new terminal (id from term.shells); '' = the first one offered
  termCwd: '',         // where new terminals start; '' = the active panel's folder
  termColor: true,     // terminal output in colour (ANSI + error / warning / link highlighting); false = plain
  termEol: 'auto',     // line ending Enter sends to a running program: auto (the shell's own) | lf | crlf
  termCr: 'overwrite', // a lone CR in the output: overwrite (redraw the line, like a terminal) | newline | strip
  termScrollback: 10000, // lines kept per terminal transcript
};

function defaultConfigDir(appName = 'CommandCenter') {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', appName);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName);
}

class Session {
  constructor(configDir) {
    this.configDir = configDir || defaultConfigDir();
    this.file = path.join(this.configDir, 'session.json');
    this.data = { ...DEFAULTS };
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      this.data = { ...DEFAULTS, ...raw };
    } catch {
      this.data = { ...DEFAULTS };
    }
    return this.get();
  }

  get() {
    const d = { ...this.data };
    // Only restore folders that still exist.
    for (const k of ['left', 'right']) {
      if (d[k] && !isDir(d[k])) d[k] = '';
    }
    if (!d.left) d.left = os.homedir();
    if (!d.right) d.right = os.homedir();
    return d;
  }

  save(patch) {
    this.data = { ...this.data, ...(patch || {}) };
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch { /* best effort */ }
    return this.get();
  }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

module.exports = { Session, DEFAULTS, defaultConfigDir };
