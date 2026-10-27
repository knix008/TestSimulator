/**
 * MyTerminal's Node host. The Tauri program (src-tauri) starts it with pipes
 * and forwards every renderer call it does not answer itself (see rpc.js for
 * the protocol). It owns what the Electron main process did besides windows:
 * settings.json, the wallpaper library, the MyShell / SSH sessions and their
 * window ownership (detach / merge), prompt and shell preferences.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const rpc = require('./rpc');
const { windowFor, forgetWindow } = require('./windows');
const {
  createPty,
  writePty,
  resizePty,
  killPty,
  setPromptTemplate,
  loadDirectoryPrefsFromSettings,
  setStartDirectoryPreference,
  connectSsh,
  disconnectSsh,
  getSessionInfo,
  killSessionsForWindow,
  reattachSession,
  stashAdopt,
  takeAdopt,
  countSessionsForWindow,
  listShells,
  currentShell,
} = require('./pty-manager');
const { PRESETS, DEFAULT_PROMPT_GIT_MODE } = require('./prompt');
const { defaultShellId, shortName } = require('./shells');
const { readSettings, updateSettings, sanitizeSettingsPatch } = require('./settings');
const backgrounds = require('./backgrounds');
const { describeError } = require('../shared/error-format');

function reportError(err, context = 'main') {
  try {
    const info = describeError(err, { context });
    console.error(`[${context}]`, info.details);
    rpc.notify('reportError', { message: info.message, details: info.details, context });
  } catch (e) {
    console.error('reportError failed', e);
  }
}

process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err);
  reportError(err, 'main');
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason);
  reportError(reason, 'main');
});

/** The program's folder (and resources): the installer leaves installer-options.json there. */
function readInstallerOptions() {
  const dirs = [process.env.MYTERMINAL_RESOURCE_DIR, process.env.MYTERMINAL_APP_DIR].filter(Boolean);
  for (const dir of dirs) {
    const file = path.join(dir, 'installer-options.json');
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

/** Seed showTrayIcon from the installer choice when unset. */
function bootstrapSettings() {
  const settings = readSettings();
  if (typeof settings.showTrayIcon === 'boolean') return settings;

  const installer = readInstallerOptions();
  const showTrayIcon =
    installer && typeof installer.showTrayIcon === 'boolean'
      ? installer.showTrayIcon
      : false;
  return updateSettings({ showTrayIcon });
}

/** The tray icon follows settings (the program draws it). */
function applyTrayFromSettings(settings = {}) {
  rpc.notify('tray.apply', {
    enabled: !!settings.showTrayIcon,
    lang: settings.lang === 'ko' ? 'ko' : 'en',
  });
}

/** True until a window size has been saved: the renderer fits the terminal to its default cols × rows. */
let firstLaunch = false;

function appInfo() {
  return {
    name: 'MyTerminal',
    version: process.env.MYTERMINAL_VERSION || '1.0.0',
    author: 'SHKWON',
    email: 'knix008@naver.com',
    platform: process.platform,
    arch: process.arch,
    tauri: process.env.MYTERMINAL_TAURI || '',
    webview: process.env.MYTERMINAL_WEBVIEW || '',
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${os.type()} ${os.release()}`,
    buildDate: process.env.MYTERMINAL_BUILD_DATE || '',
    firstLaunch,
    homepage: 'https://github.com/knix008',
  };
}

const win = (ctx) => windowFor(ctx.win);

rpc.handle('app:getInfo', () => appInfo());

rpc.handle('settings:get', () => readSettings());
rpc.handle('settings:set', (settings) => {
  // Merge so windowBounds / windowMaximized persisted by the program are kept.
  const patch = sanitizeSettingsPatch(settings, {
    setStartDirectory: (dir) => setStartDirectoryPreference(dir, { applyToSessions: true }),
  });
  const next = updateSettings(patch);
  loadDirectoryPrefsFromSettings(next);
  applyTrayFromSettings(next);
  return true;
});
// Window placement from the program (moves, resizes, maximise).
rpc.handle('settings:update', (patch) => {
  updateSettings(patch && typeof patch === 'object' ? patch : {});
  return true;
});

rpc.handle('background:import', (payload = {}) => backgrounds.importBackground(String(payload.path || '')));
rpc.handle('background:list', async () => {
  try {
    return await backgrounds.listBackgroundLibrary();
  } catch (err) {
    return { ok: false, error: err.message || 'list_failed', items: [], activeId: '' };
  }
});
rpc.handle('background:select', async (id) => {
  try {
    return await backgrounds.selectBackground(id);
  } catch (err) {
    return { ok: false, error: err.message || 'select_failed' };
  }
});
rpc.handle('background:remove', async (id) => {
  try {
    return await backgrounds.removeBackground(id);
  } catch (err) {
    return { ok: false, error: err.message || 'remove_failed' };
  }
});
rpc.handle('background:load', async () => {
  try {
    return await backgrounds.loadBackground();
  } catch (err) {
    return { ok: false, error: err.message || 'load_failed' };
  }
});
rpc.handle('background:clear', () => backgrounds.clearBackground());
rpc.handle('background:extensions', () => backgrounds.BG_EXTENSIONS);

rpc.handle('pty:start', (options, ctx) => {
  const w = win(ctx);
  if (!w) return { ok: false, error: 'No window' };
  try {
    return createPty(w, options || {});
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
rpc.handle('pty:write', (payload) => {
  writePty(payload);
  return true;
});
rpc.handle('pty:resize', (payload) => {
  resizePty(payload);
  return true;
});
rpc.handle('pty:kill', (payload) => killPty(payload || {}));

rpc.handle('prompt:getPresets', () => ({ presets: PRESETS }));
rpc.handle('prompt:set', (payload) => {
  const result = setPromptTemplate(payload);
  updateSettings({
    promptConfig: result.config,
    promptGitMode: result.gitMode || DEFAULT_PROMPT_GIT_MODE,
    promptPresetId: result.presetId,
  });
  return result;
});

// Command shells installed on this machine (settings › general › command shell).
rpc.handle('shells:list', (payload = {}) => {
  const shells = listShells({ refresh: !!payload?.refresh }).map((s) => ({ ...s, short: shortName(s) }));
  return {
    shells,
    defaultId: defaultShellId(process.platform, shells),
    current: currentShell(),
    platform: process.platform,
  };
});

rpc.handle('ssh:connect', (config, ctx) => {
  const w = win(ctx);
  if (!w) return { ok: false, error: 'No window' };
  return connectSsh(w, config || {});
});
rpc.handle('ssh:disconnect', (payload) => disconnectSsh(payload || {}));
rpc.handle('ssh:status', (payload) => getSessionInfo(payload || {}));

rpc.handle('session:takeAdopt', (sessionId) => takeAdopt(sessionId));
// Detach / merge bookkeeping; the program moves the tab between windows.
rpc.handle('session:stashAdopt', (payload = {}) => {
  const sessionId = String(payload.sessionId || '');
  const info = getSessionInfo({ sessionId });
  if (!info.exists) return { ok: false, error: 'Session not found' };
  const meta = {
    title: payload.title || info.title || `Terminal ${sessionId}`,
    mode: payload.mode || info.mode || 'local',
    serialized: payload.serialized || '',
    fontSize: payload.fontSize || 13,
    fontFamily: payload.fontFamily || '',
  };
  stashAdopt(sessionId, meta);
  return { ok: true, meta };
});
rpc.handle('session:reattach', (payload = {}) => reattachSession(String(payload.sessionId || ''), windowFor(payload.win)));
rpc.handle('session:count', (payload = {}) => countSessionsForWindow(windowFor(payload.win)));

// Quit: end every shell (taskkill of whole trees on Windows) before the program exits.
rpc.handle('host:quit', () => {
  killPty();
  return true;
});

rpc.on('win-closed', (msg) => {
  const w = forgetWindow(msg.win);
  if (w) killSessionsForWindow(w);
});
rpc.on('eof', () => {
  try {
    killPty();
  } catch (_) {
    /* ignore */
  }
});

function boot() {
  firstLaunch = !readSettings().windowBounds;
  const settings = bootstrapSettings();
  backgrounds.syncBackgroundSelectionFromSettings(settings);
  loadDirectoryPrefsFromSettings(readSettings());
  applyTrayFromSettings(readSettings());
  rpc.start();
  rpc.notify('ready', { pid: process.pid });
}

boot();
