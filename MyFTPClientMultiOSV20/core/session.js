// Session / settings persistence: one JSON file in the app's config folder
// (the WinForms original kept the same things in settings.json).
//
//   lastLocalPath  — the local folder to restore on the next start
//   lastProfile    — the profile that was selected last
//   language       — 'ko' | 'en'
//   theme          — one of src/themes.js ids
//   serverWidth    — width of the server panel as a fraction of the file area
//   logHeight      — height of the log area in px
//   windowBounds   — Electron window position/size
//
// Electron passes app.getPath('userData'); the web server uses the XDG /
// AppData equivalent so a browser session survives a server restart too.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { DEFAULT_SHELL_PROMPTS, sanitizePromptMap } = require('./prompts');
const { sanitizeFontName, clampFontSize } = require('./fonts');

const DEFAULTS = {
  lastLocalPath: '',
  lastProfile: '',
  language: 'ko',
  theme: 'midnight',
  themeBg: '',
  fontSize: 13,
  terminalFont: '',
  terminalFontSize: 13,
  serverWidth: 0.5,
  logHeight: 170,
  confirmDelete: true,
  restoreLocalPath: true,
  sounds: true,
  showConnectedDialog: true,
  // How many files to transfer at once (extra logins). 1–4.
  transferConcurrency: 3,
  skipUnchanged: true,
  lastTerminalShell: '',
  terminalStartDir: '',
  powershellPrompt: DEFAULT_SHELL_PROMPTS.powershell,
  shellPrompts: { ...DEFAULT_SHELL_PROMPTS },
  terminalMaxLines: 10000,
  windowBounds: null,
};

function defaultConfigDir(appName = 'My FTP Client') {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', appName);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName);
}

class Session {
  constructor(configDir) {
    this.configDir = configDir || defaultConfigDir();
    this.file = path.join(this.configDir, 'session.json');
    this.data = { ...DEFAULTS, shellPrompts: { ...DEFAULT_SHELL_PROMPTS } };
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      this.data = { ...DEFAULTS, ...raw, shellPrompts: { ...DEFAULT_SHELL_PROMPTS, ...(raw.shellPrompts || {}) } };
    } catch {
      this.data = { ...DEFAULTS, shellPrompts: { ...DEFAULT_SHELL_PROMPTS } };
    }
    return this.get();
  }

  get() {
    const d = { ...this.data };
    // Only restore a folder that still exists — else the home folder.
    if (!d.lastLocalPath || !isDir(d.lastLocalPath)) d.lastLocalPath = os.homedir();
    if (d.terminalStartDir && !isDir(d.terminalStartDir)) d.terminalStartDir = '';
    d.shellPrompts = sanitizePromptMap(d.shellPrompts, d.powershellPrompt);
    d.powershellPrompt = d.shellPrompts.powershell || DEFAULT_SHELL_PROMPTS.powershell;
    d.terminalMaxLines = clampLines(d.terminalMaxLines);
    d.terminalFont = sanitizeFontName(d.terminalFont);
    d.terminalFontSize = clampFontSize(d.terminalFontSize, 13);
    const n = Math.round(Number(d.transferConcurrency));
    d.transferConcurrency = Number.isFinite(n) ? Math.max(1, Math.min(4, n)) : 3;
    d.skipUnchanged = d.skipUnchanged !== false;
    return d;
  }

  save(patch) {
    const prevPrompts = this.data.shellPrompts;
    this.data = { ...this.data, ...(patch || {}) };
    if (patch && patch.shellPrompts && typeof patch.shellPrompts === 'object') {
      this.data.shellPrompts = { ...DEFAULT_SHELL_PROMPTS, ...(prevPrompts || {}), ...patch.shellPrompts };
    } else if (patch && patch.powershellPrompt != null) {
      this.data.shellPrompts = {
        ...DEFAULT_SHELL_PROMPTS,
        ...(prevPrompts || {}),
        powershell: patch.powershellPrompt,
        pwsh: patch.powershellPrompt,
      };
    }
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

function clampLines(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 10000;
  return Math.max(500, Math.min(100000, x));
}

module.exports = { Session, DEFAULTS, defaultConfigDir, clampLines };
