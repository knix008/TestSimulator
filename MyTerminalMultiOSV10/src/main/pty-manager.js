const fs = require('fs');
const os = require('os');
const path = require('path');
const { MyShell } = require('./myshell');
const { SshSession } = require('./ssh-session');
const {
  DEFAULT_PROMPT,
  DEFAULT_PROMPT_GIT_MODE,
  PROMPT_PRESETS,
  syncBuiltinPromptTemplate,
  normalizePromptGitMode,
  asciiSafePromptGlyphs,
  findPromptPresetId,
} = require('./prompt');
const {
  getLastWorkingDirectory,
  getCommandHistory,
} = require('./shell-memory');

let nextId = 1;
/** @type {Map<string, { type: 'local'|'ssh', shell?: any, ssh?: any, win?: any }>} */
const sessions = new Map();
/** @type {Map<string, object>} */
const pendingAdopts = new Map();
let lastOptions = {
  promptTemplate: DEFAULT_PROMPT,
  promptGitMode: DEFAULT_PROMPT_GIT_MODE,
  cols: 80,
  rows: 24,
  /** Raw configured start directory (empty = home). */
  startDirectory: '',
};

function resolveStartDirectory(cwd) {
  const home = os.homedir();
  let dir = typeof cwd === 'string' ? cwd.trim() : '';
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

function setStartDirectoryPreference(dir) {
  lastOptions.startDirectory = typeof dir === 'string' ? dir.trim() : '';
  return lastOptions.startDirectory;
}

/** Load directory + prompt prefs from settings.json into runtime options. */
function loadDirectoryPrefsFromSettings(settings = {}) {
  if (typeof settings.startDirectory === 'string') {
    lastOptions.startDirectory = settings.startDirectory.trim();
  }
  if (typeof settings.promptTemplate === 'string' && settings.promptTemplate.length) {
    lastOptions.promptTemplate = asciiSafePromptGlyphs(settings.promptTemplate);
  }
  // Built-in presets always refresh from prompt.js so OMZ theme fixes ship on upgrade.
  if (typeof settings.promptPresetId === 'string' && settings.promptPresetId) {
    lastOptions.promptTemplate = syncBuiltinPromptTemplate(
      settings.promptPresetId,
      lastOptions.promptTemplate
    );
  }
  if (settings.promptGitMode != null) {
    lastOptions.promptGitMode = normalizePromptGitMode(settings.promptGitMode);
  }
  return {
    startDirectory: lastOptions.startDirectory,
    promptTemplate: lastOptions.promptTemplate,
    promptGitMode: lastOptions.promptGitMode,
  };
}

function preferredStartDirectory(optionsCwd) {
  // Explicit non-empty cwd from caller wins.
  if (optionsCwd !== undefined && optionsCwd !== null) {
    const trimmed = String(optionsCwd).trim();
    if (trimmed) return trimmed;
  }
  // Settings → Terminal start directory.
  if (lastOptions.startDirectory) return lastOptions.startDirectory;
  // Otherwise restore the last directory the user worked in.
  return getLastWorkingDirectory() || '';
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
  if (typeof options.promptTemplate === 'string' && options.promptTemplate.length) {
    lastOptions.promptTemplate = asciiSafePromptGlyphs(options.promptTemplate);
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

  const shell = new MyShell(win, {
    sessionId,
    cwd,
    cols: options.cols || lastOptions.cols || 80,
    rows: options.rows || lastOptions.rows || 24,
    promptTemplate: lastOptions.promptTemplate,
    promptGitMode: lastOptions.promptGitMode,
    history: getCommandHistory(),
  });
  sessions.set(sessionId, { type: 'local', shell, win });
  shell.start();
  return { ok: true, mode: 'myshell', sessionId };
}

function setPromptTemplate(payload) {
  const templateRaw =
    typeof payload === 'string'
      ? payload
      : payload && typeof payload.template === 'string'
        ? payload.template
        : null;
  const template =
    typeof templateRaw === 'string' && templateRaw.length
      ? asciiSafePromptGlyphs(templateRaw)
      : null;
  const gitMode =
    payload && typeof payload === 'object' && payload.gitMode != null
      ? normalizePromptGitMode(payload.gitMode)
      : null;
  const presetId =
    payload && typeof payload === 'object' && typeof payload.presetId === 'string'
      ? payload.presetId
      : template
        ? findPromptPresetId(template)
        : '';

  if (template) {
    lastOptions.promptTemplate = syncBuiltinPromptTemplate(presetId, template);
  }
  if (gitMode != null) {
    lastOptions.promptGitMode = gitMode;
  }

  for (const session of sessions.values()) {
    if (session.type !== 'local' || !session.shell) continue;
    if (template) session.shell.setPromptTemplate(lastOptions.promptTemplate);
    if (gitMode != null) session.shell.setPromptGitMode(gitMode);
  }

  return {
    ok: true,
    template: lastOptions.promptTemplate,
    gitMode: lastOptions.promptGitMode,
    presetId,
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
      promptTemplate: lastOptions.promptTemplate,
      promptGitMode: lastOptions.promptGitMode,
      history: getCommandHistory(),
    });
    sessions.set(sessionId, { type: 'local', shell, win });
    shell.writeln(`\x1b[31m[ssh]\x1b[0m connect failed: ${err.message || err}`);
    shell.start();
    return { ok: false, sessionId, error: String(err.message || err) };
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
      promptTemplate: lastOptions.promptTemplate,
      promptGitMode: lastOptions.promptGitMode,
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
      promptTemplate: lastOptions.promptTemplate,
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
    promptTemplate: lastOptions.promptTemplate,
  };
}

module.exports = {
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
  stashAdopt,
  takeAdopt,
};
