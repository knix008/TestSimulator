'use strict';

/**
 * Finding and activating the windows an application already has open, so
 * clicking a dock icon raises what is running instead of starting another copy.
 *
 * Deliberately built on what each platform offers without a native module:
 *
 *  - Windows: `Get-Process` reports one top-level window per process, which
 *    covers the usual case where a second window means a second process
 *    (browsers, editors, Explorer). Activation goes through WScript.Shell
 *    rather than SetForegroundWindow, so nothing has to be compiled at runtime.
 *  - macOS: `open -a` already activates a running application instead of
 *    launching another instance, so the launcher needs no help.
 *  - Linux: wmctrl when it is installed; without it, no window list.
 */

const { execFile } = require('child_process');

const POWERSHELL = ['-NoProfile', '-NonInteractive', '-Command'];

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 4 << 20, ...options }, (err, stdout) => {
      resolve({ err, stdout: String(stdout || '') });
    });
  });
}

/** PowerShell string literal: single quotes, with internal ones doubled. */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/* ------------------------------- Windows -------------------------------- */

async function windowsList(target) {
  const script = `Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | `
    + `Where-Object { try { $_.Path -eq ${psQuote(target)} } catch { $false } } | `
    + `ForEach-Object { "$($_.Id)|$($_.MainWindowTitle)" }`;

  const { err, stdout } = await run('powershell.exe', [...POWERSHELL, script]);
  if (err) return [];

  const windows = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const split = trimmed.indexOf('|');
    if (split < 1) continue;
    const pid = Number(trimmed.slice(0, split));
    const title = trimmed.slice(split + 1).trim();
    if (!Number.isFinite(pid)) continue;
    windows.push({ id: String(pid), title: title || `#${pid}` });
  }
  return windows;
}

async function windowsFocus(id) {
  // AppActivate takes a process id and raises that process's main window.
  const script = `$s = New-Object -ComObject WScript.Shell; $s.AppActivate([int]${Number(id)})`;
  const { err } = await run('powershell.exe', [...POWERSHELL, script]);
  return !err;
}

/* -------------------------------- Linux --------------------------------- */

async function linuxList(target) {
  const { err, stdout } = await run('wmctrl', ['-lp']);
  if (err) return [];

  const fs = require('fs');
  const windows = [];
  for (const line of stdout.split('\n')) {
    const match = /^(0x[0-9a-f]+)\s+\S+\s+(\d+)\s+\S+\s+(.*)$/.exec(line.trim());
    if (!match) continue;
    let exe;
    try {
      exe = fs.readlinkSync(`/proc/${match[2]}/exe`);
    } catch {
      continue;
    }
    if (exe !== target) continue;
    windows.push({ id: match[1], title: match[3].trim() || match[1] });
  }
  return windows;
}

async function linuxFocus(id) {
  const { err } = await run('wmctrl', ['-i', '-a', id]);
  return !err;
}

/* -------------------------------- public -------------------------------- */

/**
 * @param {string} target the executable path the dock entry points at
 * @returns {Promise<Array<{id:string, title:string}>>}
 */
async function list(target) {
  if (!target) return [];
  if (process.platform === 'win32') return windowsList(target);
  // macOS activation is handled by `open -a`, so there is nothing to choose.
  if (process.platform === 'darwin') return [];
  return linuxList(target);
}

/** @returns {Promise<boolean>} whether the window was raised */
async function focus(id) {
  if (!id) return false;
  if (process.platform === 'win32') return windowsFocus(id);
  if (process.platform === 'linux') return linuxFocus(id);
  return false;
}

module.exports = { list, focus, psQuote };
