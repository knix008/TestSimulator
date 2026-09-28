'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Two related jobs:
 *
 *  - `names`: every running executable, used for the "this app is running" dot
 *    under a pinned icon.
 *  - `apps`: the running applications that actually own a window, so the dock
 *    can show their icons the way the macOS Dock and the taskbar do.
 *
 * Both are polled, because there is no portable event for either.
 */
class RunningWatch {
  constructor(onChange) {
    this.onChange = onChange;
    this.timer = null;
    this.names = new Set();
    this.apps = [];
    this.intervalMs = 5000;
    this.busy = false;
    this.wantApps = false;
  }

  /** @param {{apps:boolean}} options whether windowed apps are needed too */
  start(options = {}) {
    this.wantApps = !!options.apps;
    if (this.timer) { this.poll(); return; }
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.names.size || this.apps.length) {
      this.names = new Set();
      this.apps = [];
      this.onChange({ names: [], apps: [] });
    }
  }

  poll() {
    if (this.busy) return;
    this.busy = true;

    let pending = this.wantApps ? 2 : 1;
    let changed = false;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      this.busy = false;
      if (changed) this.onChange({ names: [...this.names], apps: this.apps });
    };

    listNames((names) => {
      if (names && !sameSet(names, this.names)) {
        this.names = names;
        changed = true;
      }
      done();
    });

    if (this.wantApps) {
      listWindowedApps((apps) => {
        if (apps && !sameApps(apps, this.apps)) {
          this.apps = apps;
          changed = true;
        }
        done();
      });
    }
  }
}

/* ---------------------------- every process ----------------------------- */

function listNames(done) {
  if (process.platform === 'win32') {
    execFile('tasklist.exe', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 << 20 }, (err, stdout) => {
      if (err) return done(null);
      const names = new Set();
      for (const line of stdout.split(/\r?\n/)) {
        const match = /^"([^"]+)"/.exec(line);
        if (match) names.add(match[1].toLowerCase());
      }
      done(names);
    });
    return;
  }

  execFile('ps', ['-A', '-o', 'comm='], { maxBuffer: 8 << 20 }, (err, stdout) => {
    if (err) return done(null);
    const names = new Set();
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      names.add(path.basename(trimmed).toLowerCase());
      const appMatch = /([^/]+)\.app\//.exec(trimmed);
      if (appMatch) names.add(`${appMatch[1].toLowerCase()}.app`);
    }
    done(names);
  });
}

/* ------------------------ applications with a window --------------------- */

function listWindowedApps(done) {
  if (process.platform === 'win32') return windowsApps(done);
  if (process.platform === 'darwin') return macApps(done);
  return linuxApps(done);
}

/**
 * Shell and OS surfaces that own a window but are not applications a user
 * would ever want an icon for.
 */
const WINDOWS_SYSTEM_PROCESSES = new Set([
  'applicationframehost', 'systemsettings', 'shellexperiencehost',
  'startmenuexperiencehost', 'searchhost', 'searchapp', 'searchui',
  'textinputhost', 'lockapp', 'explorer', 'dwm', 'csrss', 'winlogon',
  'sihost', 'ctfmon', 'runtimebroker', 'taskhostw', 'dllhost',
  'wudfhost', 'fontdrvhost', 'smartscreen', 'usoclient', 'widgets',
  'widgetboard', 'phoneexperiencehost', 'crossdeviceresume', 'openwith',
]);

/**
 * The dock must never list itself. Both the packaged executable and, in
 * development, the Electron binary that is hosting it count as "self".
 */
function isSelf(target) {
  const own = [process.execPath].filter(Boolean).map((p) => p.toLowerCase());
  const lower = String(target || '').toLowerCase();
  return own.includes(lower) || /[\\/]mydockbar\.exe$/i.test(lower)
    || /[\\/]electron\.exe$/i.test(lower);
}

/** True for binaries that live in the Windows directory, i.e. the OS itself. */
function isSystemPath(target) {
  const lower = String(target || '').toLowerCase().replace(/\//g, '\\');
  const root = (process.env.SystemRoot || 'C:\\Windows').toLowerCase();
  if (!lower.startsWith(root + '\\')) return false;
  // WindowsApps holds real Store applications, which do belong on the dock.
  return !lower.includes('\\windowsapps\\');
}

function windowsApps(done) {
  // Only processes that own a top-level window are "open applications".
  // SessionId 0 is the services session; everything the signed-in user
  // launched lives in their own interactive session.
  const script = "$s = (Get-Process -Id $PID).SessionId; "
    + "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.SessionId -eq $s } | "
    + "ForEach-Object { try { $_.ProcessName + '|' + $_.Path } catch { } }";

  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, maxBuffer: 8 << 20 }, (err, stdout) => {
      if (err) return done(null);
      const apps = [];
      const seen = new Set();
      for (const line of stdout.split(/\r?\n/)) {
        const [name, target] = line.trim().split('|');
        if (!target || seen.has(target.toLowerCase())) continue;
        if (WINDOWS_SYSTEM_PROCESSES.has(String(name || '').toLowerCase())) continue;
        if (isSystemPath(target) || isSelf(target)) continue;
        seen.add(target.toLowerCase());
        apps.push({ name, path: target });
      }
      done(apps);
    });
}

function macApps(done) {
  execFile('ps', ['-A', '-o', 'comm='], { maxBuffer: 8 << 20 }, (err, stdout) => {
    if (err) return done(null);
    const apps = [];
    const seen = new Set();
    for (const line of stdout.split('\n')) {
      // /Applications/Safari.app/Contents/MacOS/Safari -> the bundle itself.
      const match = /^(.*?\/([^/]+)\.app)\/Contents\/MacOS\//.exec(line.trim());
      if (!match) continue;
      const bundle = match[1];
      // System agents and embedded helper bundles are not user applications.
      if (bundle.startsWith('/System/')) continue;
      if (isSelf(bundle) || /MyDockBar/i.test(bundle)) continue;
      if (bundle.includes('.framework/') || bundle.includes('.app/Contents/')) continue;
      if (seen.has(bundle)) continue;
      seen.add(bundle);
      apps.push({ name: match[2], path: bundle });
    }
    done(apps);
  });
}

function linuxApps(done) {
  // wmctrl maps windows to pids; /proc then gives the executable. Without
  // wmctrl there is no portable way to tell a windowed process from a daemon,
  // so the feature simply reports nothing rather than guessing.
  execFile('wmctrl', ['-lp'], { maxBuffer: 4 << 20 }, (err, stdout) => {
    if (err) return done([]);
    const apps = [];
    const seen = new Set();
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[2]);
      if (!pid) continue;
      let target;
      try {
        target = fs.readlinkSync(`/proc/${pid}/exe`);
      } catch {
        continue;
      }
      if (seen.has(target)) continue;
      // /usr/libexec and /usr/lib hold the desktop shell, not applications.
      if (target.startsWith('/usr/libexec/') || target.startsWith('/usr/lib/')) continue;
      if (isSelf(target)) continue;
      seen.add(target);
      apps.push({ name: path.basename(target), path: target });
    }
    done(apps);
  });
}

/* -------------------------------- helpers -------------------------------- */

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function sameApps(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i].path !== b[i].path) return false;
  return true;
}

module.exports = {
  RunningWatch, listWindowedApps, isSystemPath, isSelf, WINDOWS_SYSTEM_PROCESSES,
};
