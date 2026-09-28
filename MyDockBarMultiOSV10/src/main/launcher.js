'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { shell, app } = require('electron');
const { splitExec } = require('./app-scanner');

/** Fire-and-forget: the dock must never keep a launched process attached. */
function detach(command, args, options = {}) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    ...options,
  });
  child.on('error', (err) => console.error(`[launcher] ${command}:`, err.message));
  child.unref();
}

const SPECIAL = {
  'dock:settings': null,      // handled by the caller (needs the window)
  'dock:quit': () => app.quit(),
  'system:show-desktop': showDesktop,
  'system:trash': openTrash,
  'system:home': () => shell.openPath(app.getPath('home')),
  'system:documents': () => shell.openPath(app.getPath('documents')),
  'system:downloads': () => shell.openPath(app.getPath('downloads')),
};

function showDesktop() {
  if (process.platform === 'win32') {
    // The shell's "minimize all" verb, invoked through its COM automation object.
    detach('powershell.exe', [
      '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
      '(New-Object -ComObject Shell.Application).MinimizeAll()',
    ], { windowsHide: true });
  } else if (process.platform === 'darwin') {
    detach('osascript', ['-e', 'tell application "System Events" to key code 103']);
  } else {
    detach('sh', ['-c', 'wmctrl -k on || xdotool key super+d']);
  }
}

function openTrash() {
  if (process.platform === 'win32') shell.openPath('shell:RecycleBinFolder');
  else if (process.platform === 'darwin') detach('open', [`${process.env.HOME}/.Trash`]);
  else shell.openPath(path.join(app.getPath('home'), '.local', 'share', 'Trash', 'files'));
}

/**
 * Launch a dock item. Returns `{ ok }` or `{ ok: false, error }` so the
 * renderer can shake the icon instead of failing silently.
 */
async function launch(item) {
  if (!item || item.type === 'separator') return { ok: true };

  if (item.type === 'special' || (item.path || '').startsWith('dock:') || (item.path || '').startsWith('system:')) {
    const key = item.path;
    const handler = SPECIAL[key];
    if (handler) {
      handler();
      return { ok: true };
    }
    return { ok: false, error: `Unknown action: ${key}` };
  }

  if (item.type === 'url') {
    await shell.openExternal(item.path);
    return { ok: true };
  }

  const target = item.path;
  if (!target) return { ok: false, error: 'No target set' };

  if (!fs.existsSync(target) && item.type !== 'command') {
    return { ok: false, error: `Not found: ${target}` };
  }

  try {
    if (item.type === 'folder' || (fs.existsSync(target) && fs.statSync(target).isDirectory() && process.platform !== 'darwin')) {
      const err = await shell.openPath(target);
      return err ? { ok: false, error: err } : { ok: true };
    }

    const args = item.args ? splitExec(item.args) : [];

    if (process.platform === 'darwin' && target.endsWith('.app')) {
      detach('open', args.length ? ['-a', target, '--args', ...args] : ['-a', target]);
      return { ok: true };
    }

    if (!args.length) {
      // Let the OS pick the right verb (handles .lnk, documents, bundles).
      const err = await shell.openPath(target);
      if (!err) return { ok: true };
      // openPath refuses plain executables on some Linux setups; fall through.
      if (process.platform !== 'linux') return { ok: false, error: err };
    }

    detach(target, args, { cwd: item.cwd || path.dirname(target) });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function revealInFileManager(target) {
  if (!target) return;
  shell.showItemInFolder(target);
}

module.exports = { launch, revealInFileManager, detach, SPECIAL };
