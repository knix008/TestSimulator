// Opens an HTML file in a real browser (Edge, Chrome, Firefox, Brave, Safari).
// The OS default for .html may be this editor, so the file is handed to a
// browser executable. Relative stylesheets, scripts and images then load
// from the file's own folder.
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function fileExists(p) {
  try { return !!(p && fs.existsSync(p)); } catch { return false; }
}

function candidates() {
  const list = [];
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    list.push(
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'Mozilla Firefox', 'firefox.exe'),
      path.join(pf86, 'Mozilla Firefox', 'firefox.exe'),
      path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    );
  } else if (process.platform === 'darwin') {
    list.push(
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Firefox.app/Contents/MacOS/firefox',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Safari.app/Contents/MacOS/Safari',
    );
  }
  return list.filter(Boolean);
}

function whichNames() {
  if (process.platform === 'win32') return ['msedge', 'chrome', 'firefox', 'brave'];
  if (process.platform === 'darwin') return [];
  return ['microsoft-edge', 'microsoft-edge-stable', 'google-chrome', 'google-chrome-stable', 'firefox', 'brave-browser', 'chromium', 'chromium-browser'];
}

function findBrowser(probe = fileExists) {
  for (const p of candidates()) if (probe(p)) return p;
  const names = whichNames();
  if (!names.length) return null;
  const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
  for (const name of names) {
    try {
      const r = spawnSync(cmd, [name], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      const line = r.stdout && r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (r.status === 0 && line && probe(line)) return line;
    } catch { /* the next name */ }
  }
  return null;
}

function fileUrl(p) {
  return pathToFileURL(path.resolve(String(p))).href;
}

function launch(spawnFn, bin, args) {
  const child = spawnFn(bin, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  if (child.unref) child.unref();
  return child;
}

// Opens `filePath` in a browser. Returns { browser, url }. `browser` is empty
// when the OS default handler was used because no browser executable was found.
function openInBrowser(filePath, deps = {}) {
  const p = path.resolve(String(filePath || ''));
  if (!fileExists(p)) {
    const e = new Error('File not found');
    e.code = 'ENOENT';
    e.path = p;
    throw e;
  }
  const url = fileUrl(p);
  const bin = deps.find ? deps.find() : findBrowser();
  const spawnFn = deps.spawn || spawn;
  if (bin) {
    launch(spawnFn, bin, [url]);
    return { browser: bin, url };
  }
  if (process.platform === 'win32') {
    launch(spawnFn, 'cmd.exe', ['/c', 'start', '', url]);
    return { browser: '', url };
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  launch(spawnFn, opener, [url]);
  return { browser: opener, url };
}

module.exports = { findBrowser, openInBrowser, fileUrl, candidates };
