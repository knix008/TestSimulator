'use strict';

/**
 * Whether the recycle bin / trash holds anything, and emptying it.
 *
 * Every platform keeps this somewhere different, and only Windows exposes a
 * proper API for it, so each one gets its own probe. A failure always reports
 * "unknown but not empty" rather than throwing: the dock would rather show a
 * full bin it cannot verify than crash a menu.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const POWERSHELL = ['-NoProfile', '-NonInteractive', '-Command'];

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 4 << 20, ...options }, (err, stdout) => {
      resolve({ err, stdout: String(stdout || '') });
    });
  });
}

/* ------------------------------- Windows -------------------------------- */

async function windowsState() {
  // The shell namespace is the only reliable view of the recycle bin; counting
  // files under $Recycle.Bin misses other drives and trips over permissions.
  const script = '$items = (New-Object -ComObject Shell.Application).NameSpace(0xA).Items(); '
    + 'Write-Output $items.Count';
  const { err, stdout } = await run('powershell.exe', [...POWERSHELL, script]);
  if (err) return { empty: false, count: null, known: false };

  const count = parseInt(stdout.trim(), 10);
  if (!Number.isFinite(count)) return { empty: false, count: null, known: false };
  return { empty: count === 0, count, known: true };
}

async function windowsEmpty() {
  const { err } = await run('powershell.exe', [...POWERSHELL, 'Clear-RecycleBin -Force -ErrorAction Stop']);
  if (err) return { ok: false, error: err.message };
  return { ok: true };
}

/* -------------------------------- macOS --------------------------------- */

function macTrashDir() {
  return path.join(os.homedir(), '.Trash');
}

async function macState() {
  try {
    const entries = fs.readdirSync(macTrashDir());
    return { empty: entries.length === 0, count: entries.length, known: true };
  } catch {
    return { empty: false, count: null, known: false };
  }
}

async function macEmpty() {
  const { err } = await run('osascript', ['-e', 'tell application "Finder" to empty trash']);
  if (err) return { ok: false, error: err.message };
  return { ok: true };
}

/* -------------------------------- Linux --------------------------------- */

function linuxTrashDir() {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'Trash');
}

async function linuxState() {
  try {
    const entries = fs.readdirSync(path.join(linuxTrashDir(), 'files'));
    return { empty: entries.length === 0, count: entries.length, known: true };
  } catch {
    return { empty: false, count: null, known: false };
  }
}

async function linuxEmpty() {
  const root = linuxTrashDir();
  try {
    for (const sub of ['files', 'info']) {
      const dir = path.join(root, sub);
      for (const entry of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* -------------------------------- public -------------------------------- */

/** @returns {Promise<{empty:boolean, count:number|null, known:boolean}>} */
function state() {
  if (process.platform === 'win32') return windowsState();
  if (process.platform === 'darwin') return macState();
  return linuxState();
}

/** @returns {Promise<{ok:boolean, error?:string}>} */
function empty() {
  if (process.platform === 'win32') return windowsEmpty();
  if (process.platform === 'darwin') return macEmpty();
  return linuxEmpty();
}

module.exports = { state, empty };
