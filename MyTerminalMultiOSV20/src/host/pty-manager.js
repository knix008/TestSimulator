const fs = require('fs');
const os = require('os');
const path = require('path');
const { MyShell } = require('./myshell');
const { SshSession } = require('./ssh-session');
const {
  PROMPT_DEFAULT,
  DEFAULT_PROMPT_GIT_MODE,
  normalizePrompt,
  normalizePromptGitMode,
  resolvePromptFromSettings,
  customPromptsAsPresets,
} = require('./prompt');
const {
  getCommandHistory,
} = require('./shell-memory');
const {
  DEFAULT_LS_DIRECTORY_COLOR,
  DEFAULT_LS_FILE_COLOR,
  normalizeLsColors,
} = require('./ls-colors');
const { detectShells, resolveShell, shortName } = require('./shells');
const { describeError } = require('../shared/error-format');

let nextId = 1;
/** @type {Map<string, { type: 'local'|'ssh', shell?: any, ssh?: any, win?: any }>} */
const sessions = new Map();
/** @type {Map<string, object>} */
const pendingAdopts = new Map();
let lastOptions = {
  /** Prompt theme (segments; see ../shared/prompt-core.js). */
  promptConfig: normalizePrompt(PROMPT_DEFAULT),
  promptGitMode: DEFAULT_PROMPT_GIT_MODE,
  /** Theme colours the prompt's accent / foreground / background refer to. */
  promptTheme: null,
  cols: 80,
  rows: 24,
  /** Raw configured start directory (empty = home). */
  startDirectory: '',
  lsDirectoryColor: DEFAULT_LS_DIRECTORY_COLOR,
  lsFileColor: DEFAULT_LS_FILE_COLOR,
  /** Command shell (see ./shells.js): '' = platform default. */
  shellId: '',
  shellCustomPath: '',
};

/** @type {import('./shells').ShellDef[] | null} */
let cachedShells = null;

function listShells({ refresh = false } = {}) {
  if (!cachedShells || refresh) cachedShells = detectShells();
  return cachedShells;
}

/** The shell definition for the current preference (or an explicit id). */
function currentShell(shellId = '') {
  return resolveShell(
    { shellId: shellId || lastOptions.shellId, shellCustomPath: lastOptions.shellCustomPath },
    { shells: listShells() }
  );
}

/** Default-shell setting changed: sessions opened with an explicit shell keep it. */
function applyShellToSessions() {
  const shell = currentShell();
  for (const session of sessions.values()) {
    if (session.type === 'local' && session.shell?.setShell && !session.shellId) {
      session.shell.setShell(shell);
    }
  }
  return shell;
}

/** What the renderer shows for a session's shell (tab title, status bar). */
function shellInfoOf(shell) {
  return shell ? { id: shell.id, label: shell.label, short: shortName(shell), path: shell.path } : null;
}

function sanitizeStartDirectory(dir) {
  let next = typeof dir === 'string' ? dir.trim() : '';
  if (
    (next.startsWith('"') && next.endsWith('"') && next.length >= 2) ||
    (next.startsWith("'") && next.endsWith("'") && next.length >= 2)
  ) {
    next = next.slice(1, -1).trim();
  }
  return next;
}

function resolveStartDirectory(cwd) {
  const home = os.homedir();
  let dir = sanitizeStartDirectory(cwd);
  if (!dir || dir === '~') return home;
  if (dir.startsWith('~/') || dir.startsWith('~\\')) {
    dir = path.join(home, dir.slice(2));
  }
  try {
    dir = path.resolve(dir);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  } catch (_) {
    /* fall through */
  }
  // Missing / invalid configured path → default home directory.
  return home;
}

function applyStartDirectoryToSessions(dir) {
  const cwd = resolveStartDirectory(dir);
  for (const session of sessions.values()) {
    if (session.type === 'local' && session.shell?.setStartDirectory) {
      session.shell.setStartDirectory(cwd);
    }
  }
  return cwd;
}

function setStartDirectoryPreference(dir, { applyToSessions = false } = {}) {
  const prev = lastOptions.startDirectory;
  lastOptions.startDirectory = sanitizeStartDirectory(dir);
  if (applyToSessions && lastOptions.startDirectory && lastOptions.startDirectory !== prev) {
    applyStartDirectoryToSessions(lastOptions.startDirectory);
  }
  return lastOptions.startDirectory;
}

/** Load directory + prompt prefs from settings.json into runtime options. */
function loadDirectoryPrefsFromSettings(settings = {}) {
  if (typeof settings.startDirectory === 'string') {
    lastOptions.startDirectory = sanitizeStartDirectory(settings.startDirectory);
  }
  if (settings.promptConfig || settings.promptPresetId) {
    const resolved = resolvePromptFromSettings(settings, customPromptsAsPresets(settings.customPrompts));
    lastOptions.promptConfig = resolved.config;
    for (const session of sessions.values()) {
      if (session.type === 'local' && session.shell?.setPromptConfig) {
        session.shell.setPromptConfig(lastOptions.promptConfig);
      }
    }
  }
  if (settings.promptGitMode != null) {
    lastOptions.promptGitMode = normalizePromptGitMode(settings.promptGitMode);
  }
  if (settings.promptTheme && typeof settings.promptTheme === 'object') {
    lastOptions.promptTheme = { ...settings.promptTheme };
    for (const session of sessions.values()) {
      if (session.type === 'local' && session.shell?.setPromptTheme) {
        session.shell.setPromptTheme(lastOptions.promptTheme);
      }
    }
  }
  if (
    settings.lsDirectoryColor != null ||
    settings.lsFileColor != null ||
    settings.lsColors
  ) {
    const colors = normalizeLsColors({
      directory: settings.lsDirectoryColor ?? settings.lsColors?.directory,
      file: settings.lsFileColor ?? settings.lsColors?.file,
    });
    lastOptions.lsDirectoryColor = colors.directory;
    lastOptions.lsFileColor = colors.file;
    for (const session of sessions.values()) {
      if (session.type === 'local' && session.shell?.setLsColors) {
        session.shell.setLsColors(colors);
      }
    }
  }
  if (typeof settings.shellId === 'string' || typeof settings.shellCustomPath === 'string') {
    if (typeof settings.shellId === 'string') lastOptions.shellId = settings.shellId;
    if (typeof settings.shellCustomPath === 'string') {
      lastOptions.shellCustomPath = settings.shellCustomPath.trim();
    }
    applyShellToSessions();
  }
  return {
    startDirectory: lastOptions.startDirectory,
    promptConfig: lastOptions.promptConfig,
    promptGitMode: lastOptions.promptGitMode,
    lsDirectoryColor: lastOptions.lsDirectoryColor,
    lsFileColor: lastOptions.lsFileColor,
    shellId: lastOptions.shellId,
    shellCustomPath: lastOptions.shellCustomPath,
  };
}

function preferredStartDirectory(optionsCwd) {
  // New tabs always start in the configured default directory.
  const fromSettings = sanitizeStartDirectory(lastOptions.startDirectory);
  if (fromSettings) return fromSettings;
  const fromCaller = sanitizeStartDirectory(optionsCwd);
  if (fromCaller) return fromCaller;
  return '';
}

function bindWin(target, win) {
  if (!target) return;
  target.win = win;
}

function createPty(win, options = {}) {
  const requested = preferredStartDirectory(
    options.cwd !== undefined && options.cwd !== null ? options.cwd : undefined
  );
  const cwd = resolveStartDirectory(requested);
  if (options.cols > 0) lastOptions.cols = options.cols;
  if (options.rows > 0) lastOptions.rows = options.rows;
  if (options.promptConfig && typeof options.promptConfig === 'object') {
    lastOptions.promptConfig = normalizePrompt(options.promptConfig);
  }
  if (options.promptGitMode != null) {
    lastOptions.promptGitMode = normalizePromptGitMode(options.promptGitMode);
  }

  let sessionId;
  if (options.sessionId != null) {
    sessionId = String(options.sessionId);
    const n = Number(sessionId);
    if (!Number.isNaN(n) && n >= nextId) nextId = n + 1;
  } else {
    sessionId = String(nextId++);
  }
  destroySession(sessionId);

  // A tab opened from the "+" menu carries its own shell; otherwise the default applies.
  const shellId = typeof options.shellId === 'string' ? options.shellId : '';
  const shellDef = currentShell(shellId);
  const shell = new MyShell(win, {
    sessionId,
    cwd,
    cols: options.cols || lastOptions.cols || 80,
    rows: options.rows || lastOptions.rows || 24,
    promptConfig: lastOptions.promptConfig,
    promptGitMode: lastOptions.promptGitMode,
    promptTheme: lastOptions.promptTheme,
    lsDirectoryColor: lastOptions.lsDirectoryColor,
    lsFileColor: lastOptions.lsFileColor,
    shell: shellDef,
    history: getCommandHistory(),
  });
  sessions.set(sessionId, { type: 'local', shell, win, shellId });
  shell.start();
  return { ok: true, mode: 'myshell', sessionId, shell: shellInfoOf(shellDef) };
}

/**
 * Prompt change from the renderer: `{ config, gitMode }` (either optional).
 * Applies to every local shell and redraws their prompt.
 */
function setPromptTemplate(payload) {
  const config =
    payload && typeof payload === 'object' && payload.config && typeof payload.config === 'object'
      ? normalizePrompt(payload.config)
      : null;
  const gitMode =
    payload && typeof payload === 'object' && payload.gitMode != null
      ? normalizePromptGitMode(payload.gitMode)
      : null;
  if (config) lastOptions.promptConfig = config;
  if (gitMode != null) lastOptions.promptGitMode = gitMode;

  for (const session of sessions.values()) {
    if (session.type !== 'local' || !session.shell) continue;
    if (config) session.shell.setPromptConfig(config);
    if (gitMode != null) session.shell.setPromptGitMode(gitMode);
    // Git-only toggle: redraw the prompt without restarting the shell.
    if (!config && gitMode != null && typeof session.shell.prompt === 'function') {
      try {
        session.shell.prompt();
      } catch (_) {
        /* ignore */
      }
    }
  }

  return {
    ok: true,
    config: lastOptions.promptConfig,
    gitMode: lastOptions.promptGitMode,
    presetId: lastOptions.promptConfig.preset || '',
  };
}

function writePty(payload) {
  const sessionId = typeof payload === 'object' ? payload.sessionId : null;
  const data = typeof payload === 'object' ? payload.data : payload;
  const session = sessions.get(String(sessionId));
  if (!session) return false;
  if (session.type === 'ssh' && session.ssh) session.ssh.write(data);
  else if (session.shell) session.shell.write(data);
  return true;
}

function resizePty(payload) {
  const sessionId = payload?.sessionId;
  const cols = payload?.cols;
  const rows = payload?.rows;
  if (cols > 0) lastOptions.cols = cols;
  if (rows > 0) lastOptions.rows = rows;
  const session = sessions.get(String(sessionId));
  if (!session) return false;
  if (session.type === 'ssh' && session.ssh) session.ssh.resize(cols, rows);
  else if (session.shell) session.shell.resize(cols, rows);
  return true;
}

function destroySession(sessionId) {
  const id = String(sessionId);
  const session = sessions.get(id);
  if (!session) return false;
  try {
    if (session.type === 'ssh' && session.ssh) session.ssh.disconnect();
    if (session.shell) session.shell.kill();
  } catch (_) {
    /* ignore */
  }
  sessions.delete(id);
  return true;
}

function killPty(payload = {}) {
  if (payload?.sessionId) {
    destroySession(payload.sessionId);
    return { ok: true };
  }
  for (const id of [...sessions.keys()]) destroySession(id);
  return { ok: true };
}

function killSessionsForWindow(win) {
  if (!win) return;
  for (const [id, session] of [...sessions.entries()]) {
    if (session.win === win) destroySession(id);
  }
}

function reattachSession(sessionId, win) {
  const session = sessions.get(String(sessionId));
  if (!session || !win) return false;
  session.win = win;
  bindWin(session.shell, win);
  bindWin(session.ssh, win);
  return true;
}

function countSessionsForWindow(win) {
  if (!win) return 0;
  let n = 0;
  for (const session of sessions.values()) {
    if (session.win === win) n++;
  }
  return n;
}

function getSessionOwner(sessionId) {
  return sessions.get(String(sessionId))?.win || null;
}

function stashAdopt(sessionId, meta) {
  pendingAdopts.set(String(sessionId), meta || {});
}

function takeAdopt(sessionId) {
  const id = String(sessionId);
  const meta = pendingAdopts.get(id) || null;
  pendingAdopts.delete(id);
  return meta;
}

async function connectSsh(win, config = {}) {
  const sessionId = String(config.sessionId || nextId++);

  const prev = sessions.get(sessionId);
  if (prev) {
    try {
      if (prev.type === 'ssh' && prev.ssh) prev.ssh.disconnect();
      if (prev.shell) prev.shell.kill();
    } catch (_) {
      /* ignore */
    }
    sessions.delete(sessionId);
  }

  const ssh = new SshSession(win, {
    ...config,
    sessionId,
    cols: config.cols || lastOptions.cols || 80,
    rows: config.rows || lastOptions.rows || 24,
  });

  try {
    const info = await ssh.connect();
    sessions.set(sessionId, { type: 'ssh', ssh, win });
    return { ok: true, sessionId, ...info };
  } catch (err) {
    const shell = new MyShell(win, {
      sessionId,
      cwd: resolveStartDirectory(preferredStartDirectory(null)),
      cols: config.cols || lastOptions.cols || 80,
      rows: config.rows || lastOptions.rows || 24,
      promptConfig: lastOptions.promptConfig,
      promptGitMode: lastOptions.promptGitMode,
      promptTheme: lastOptions.promptTheme,
      lsDirectoryColor: lastOptions.lsDirectoryColor,
      lsFileColor: lastOptions.lsFileColor,
      shell: currentShell(),
      history: getCommandHistory(),
    });
    sessions.set(sessionId, { type: 'local', shell, win });
    shell.writeln(`\x1b[31m[ssh]\x1b[0m connect failed: ${err.message || err}`);
    shell.start();
    return { ok: false, sessionId, error: String(err.message || err), details: describeError(err, { context: 'ssh' }).details };
  }
}

function disconnectSsh(payload = {}) {
  const sessionId = payload.sessionId != null ? String(payload.sessionId) : null;
  const targets = sessionId
    ? [sessionId]
    : [...sessions.entries()].filter(([, s]) => s.type === 'ssh').map(([id]) => id);

  for (const id of targets) {
    const session = sessions.get(id);
    if (!session || session.type !== 'ssh') continue;
    const win = session.win;
    try {
      session.ssh?.disconnect();
    } catch (_) {
      /* ignore */
    }
    const shell = new MyShell(win, {
      sessionId: id,
      cwd: resolveStartDirectory(preferredStartDirectory(null)),
      cols: lastOptions.cols || 80,
      rows: lastOptions.rows || 24,
      promptConfig: lastOptions.promptConfig,
      promptGitMode: lastOptions.promptGitMode,
      promptTheme: lastOptions.promptTheme,
      lsDirectoryColor: lastOptions.lsDirectoryColor,
      lsFileColor: lastOptions.lsFileColor,
      shell: currentShell(),
      history: getCommandHistory(),
    });
    sessions.set(id, { type: 'local', shell, win });
    shell.start();
  }
  return { ok: true };
}

function getSessionInfo(payload = {}) {
  const sessionId = payload.sessionId != null ? String(payload.sessionId) : null;
  if (sessionId) {
    const session = sessions.get(sessionId);
    return {
      sessionId,
      mode: session?.type || 'none',
      connected: session?.type === 'ssh' && !!(session.ssh && session.ssh.alive),
      promptPreset: lastOptions.promptConfig.preset || '',
      title:
        session?.type === 'ssh'
          ? `${session.ssh.username}@${session.ssh.host}`
          : null,
      exists: !!session,
    };
  }
  return {
    sessions: [...sessions.entries()].map(([id, s]) => ({
      sessionId: id,
      mode: s.type,
      connected: s.type === 'ssh' && !!(s.ssh && s.ssh.alive),
      title: s.type === 'ssh' ? `${s.ssh.username}@${s.ssh.host}` : null,
    })),
    promptPreset: lastOptions.promptConfig.preset || '',
  };
}

module.exports = {
  listShells,
  currentShell,
  shellInfoOf,
  createPty,
  writePty,
  resizePty,
  killPty,
  setPromptTemplate,
  setStartDirectoryPreference,
  loadDirectoryPrefsFromSettings,
  connectSsh,
  disconnectSsh,
  getSessionInfo,
  destroySession,
  killSessionsForWindow,
  reattachSession,
  getSessionOwner,
  countSessionsForWindow,
  stashAdopt,
  takeAdopt,
};
