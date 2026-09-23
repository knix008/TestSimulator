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
  // The handle, not just the process id: raising a window needs the handle.
  const script = `Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | `
    + `Where-Object { try { $_.Path -eq ${psQuote(target)} } catch { $false } } | `
    + `ForEach-Object { "$([int64]$_.MainWindowHandle)|$($_.MainWindowTitle)" }`;

  const { err, stdout } = await run('powershell.exe', [...POWERSHELL, script]);
  if (err) return [];

  const windows = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const split = trimmed.indexOf('|');
    if (split < 1) continue;
    const handle = trimmed.slice(0, split);
    const title = trimmed.slice(split + 1).trim();
    if (!/^\d+$/.test(handle)) continue;
    windows.push({ id: handle, title: title || `#${handle}` });
  }
  return windows;
}

/**
 * Win32 sequence for raising someone else's window.
 *
 * SetForegroundWindow on its own is refused unless the caller already owns the
 * foreground, so the call is bracketed by AttachThreadInput: while attached to
 * the foreground thread's input queue, the restriction does not apply. The
 * window is un-minimised first, since restoring it afterwards would put it
 * behind whatever is in front.
 */
const ACTIVATE_SOURCE = `
using System;
using System.Runtime.InteropServices;
public static class DockActivate {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  const int SW_RESTORE = 9;

  public static bool Activate(IntPtr h) {
    if (h == IntPtr.Zero) return false;
    if (IsIconic(h)) ShowWindowAsync(h, SW_RESTORE);

    uint foreground = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint self = GetCurrentThreadId();
    uint owner = GetWindowThreadProcessId(h, IntPtr.Zero);

    AttachThreadInput(self, foreground, true);
    AttachThreadInput(owner, foreground, true);

    BringWindowToTop(h);
    bool ok = SetForegroundWindow(h);

    AttachThreadInput(owner, foreground, false);
    AttachThreadInput(self, foreground, false);

    return ok || GetForegroundWindow() == h;
  }
}`;

async function windowsFocus(id) {
  const handle = String(Number(id));
  const script = `Add-Type @'${ACTIVATE_SOURCE}\n'@; `
    + `if ([DockActivate]::Activate([IntPtr]${handle})) { 'ok' } else { 'failed' }`;

  const { err, stdout } = await run('powershell.exe', [...POWERSHELL, script]);
  if (err) {
    console.warn('[app-windows] could not raise window:', err.message);
    return false;
  }
  return stdout.includes('ok');
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
 * Enumerating windows means spawning a shell, which is far too slow to sit
 * between a click and the window coming forward. Results are cached briefly
 * and the cache is warmed on hover, so the click itself reads memory.
 */
const cache = new Map();
const CACHE_MS = 4000;

async function lookup(target) {
  if (process.platform === 'win32') return windowsList(target);
  // macOS activation is handled by `open -a`, so there is nothing to choose.
  if (process.platform === 'darwin') return [];
  return linuxList(target);
}

/**
 * @param {string} target the executable path the dock entry points at
 * @param {{maxAge?:number}} [options] how stale an answer may be; 0 forces a
 *        fresh lookup
 * @returns {Promise<Array<{id:string, title:string}>>}
 */
async function list(target, options = {}) {
  if (!target) return [];

  const maxAge = options.maxAge === undefined ? CACHE_MS : options.maxAge;
  const hit = cache.get(target);
  if (hit && Date.now() - hit.at < maxAge) return hit.windows;
  // A lookup already in flight is shared rather than duplicated.
  if (hit && hit.pending) return hit.pending;

  const pending = lookup(target).then((windows) => {
    cache.set(target, { at: Date.now(), windows });
    return windows;
  }).catch(() => []);

  cache.set(target, { at: hit ? hit.at : 0, windows: hit ? hit.windows : [], pending });
  return pending;
}

/** Warm the cache without waiting for the answer. */
function prefetch(target) {
  if (target) list(target).catch(() => {});
}

/** @returns {Promise<boolean>} whether the window was raised */
async function focus(id) {
  if (!id) return false;
  if (process.platform === 'win32') return windowsFocus(id);
  if (process.platform === 'linux') return linuxFocus(id);
  return false;
}

module.exports = { list, prefetch, focus, psQuote };
