/**
 * Stand-ins for Electron BrowserWindows. MyShell, SshSession and pty-manager
 * keep a `win` per session and call `win.isDestroyed()` and
 * `win.webContents.send(channel, payload)`; here a window is its Tauri label
 * and send() becomes an event the program delivers to that window.
 */
const rpc = require('./rpc');

/** @type {Map<string, object>} */
const windows = new Map();

function windowFor(label) {
  if (!label) return null;
  let win = windows.get(label);
  if (!win) {
    let destroyed = false;
    win = {
      label,
      isDestroyed: () => destroyed,
      markDestroyed() {
        destroyed = true;
      },
      webContents: {
        send: (channel, payload) => {
          if (!destroyed) rpc.emit(label, channel, payload);
        },
      },
    };
    windows.set(label, win);
  }
  return win;
}

function forgetWindow(label) {
  const win = windows.get(label);
  if (!win) return null;
  windows.delete(label);
  win.markDestroyed();
  return win;
}

module.exports = { windowFor, forgetWindow };
