'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const LINUX_ENTRY = path.join(os.homedir(), '.config', 'autostart', 'mydockbar.desktop');

/** The command that actually relaunches us, accounting for `electron .` in dev. */
function launchCommand() {
  const exe = process.execPath;
  const packaged = app.isPackaged;
  const args = packaged ? [] : [path.resolve(__dirname, '..', '..')];
  return { exe, args };
}

function setLinux(enabled) {
  if (!enabled) {
    try {
      fs.unlinkSync(LINUX_ENTRY);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    return;
  }

  const { exe, args } = launchCommand();
  const exec = [exe, ...args].map((p) => (p.includes(' ') ? `"${p}"` : p)).join(' ');
  const body = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=MyDockBar',
    'Comment=Application dock',
    `Exec=${exec}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    'NoDisplay=false',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(LINUX_ENTRY), { recursive: true });
  fs.writeFileSync(LINUX_ENTRY, body, 'utf8');
}

function set(enabled) {
  try {
    if (process.platform === 'linux') {
      setLinux(enabled);
      return true;
    }
    const { exe, args } = launchCommand();
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      path: exe,
      args,
    });
    return true;
  } catch (err) {
    console.error('[autostart] failed:', err.message);
    return false;
  }
}

function isEnabled() {
  if (process.platform === 'linux') return fs.existsSync(LINUX_ENTRY);
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

module.exports = { set, isEnabled };
