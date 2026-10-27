const os = require('os');
const path = require('path');

/**
 * The app's data folder (settings.json, shell-memory.json, backgrounds/):
 * %APPDATA%\MyTerminal, ~/Library/Application Support/MyTerminal or
 * ~/.config/MyTerminal — the folder the Electron build used, so data carries
 * over. The Tauri program passes it in MYTERMINAL_USER_DATA (tests point it at
 * a scratch folder).
 */
function userDataDir() {
  const given = process.env.MYTERMINAL_USER_DATA;
  if (given) return given;
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'MyTerminal');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'MyTerminal');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'MyTerminal');
}

module.exports = { userDataDir };
