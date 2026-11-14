// npm run clean     — web and installer build output.
// npm run clean:all — that, plus node_modules and the tutorial video.
// Neither touches the workspace (AppData / Application Support / MCC_USER_DATA).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const DIRS = [
  'dist',
  'build',
  '.vite',
  path.join('src-tauri', 'target'),
  path.join('src-tauri', 'gen'),
  path.join('src-tauri', 'icons'),
  path.join('src-tauri', 'sidecar'),
  path.join('ide', 'vscode', 'dist'),
];

const ALL_DIRS = ['node_modules', path.join('docs', 'video'), 'coverage'];
const ALL_FILES = ['.eslintcache'];

const ROOT_INSTALLER = /\.(exe|msi|dmg|deb|AppImage)$/i;
const ROOT_MEDIA = /\.(mp4|webm)$/i;
const LOCKED = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY']);
const SHELLS = new Set(['powershell.exe', 'pwsh.exe', 'cmd.exe', 'conhost.exe', 'windowsterminal.exe', 'openconsole.exe', 'explorer.exe']);
const EDITOR_MARKERS = ['\\cursor\\', '\\microsoft vs code\\', 'tsserver.js', 'typingsinstaller.js'];

const dirPrefix = (dir) => {
  const resolved = path.resolve(dir).replace(/[\\/]+$/, '');
  return resolved + path.sep;
};

function processName(proc) {
  return (proc.name || path.win32.basename(proc.exe || '')).toLowerCase();
}

function isEditor(proc) {
  const blob = `${proc.exe || ''}\n${proc.cmd || ''}`.toLowerCase();
  return EDITOR_MARKERS.some((mark) => blob.includes(mark));
}

/**
 * Processes to end before a locked folder can be removed.
 * Keeps the current process, shells, and the editor. Includes a program whose
 * file sits in dir, one whose command line names dir, a node process that has
 * a file in dir open, and the node or npm parent that launched it.
 */
export function pidsToStop(processes, dir, selfPid = process.pid, lockPids = []) {
  const prefix = dirPrefix(dir).toLowerCase();
  const rootKey = prefix.slice(0, -1);
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]));
  const stop = new Set();

  const consider = (proc) => {
    if (!proc || !proc.pid || proc.pid === selfPid || isEditor(proc)) return;
    const exe = (proc.exe || '').toLowerCase();
    const cmd = (proc.cmd || '').toLowerCase();
    if (exe === rootKey || exe.startsWith(prefix) || cmd.includes(rootKey)) stop.add(proc.pid);
  };
  for (const proc of processes) consider(proc);

  for (const pid of lockPids) {
    const proc = byPid.get(pid);
    if (!proc || proc.pid === selfPid || isEditor(proc)) continue;
    const name = processName(proc);
    if (name === 'node.exe' || name === 'esbuild.exe') stop.add(proc.pid);
  }

  for (const pid of [...stop]) {
    let cur = byPid.get(pid);
    for (let hop = 0; hop < 15 && cur; hop += 1) {
      const parent = byPid.get(cur.ppid);
      if (!parent || parent.pid === selfPid || isEditor(parent)) break;
      const name = processName(parent);
      if (SHELLS.has(name) || (name !== 'node.exe' && name !== 'npm.exe')) break;
      stop.add(parent.pid);
      cur = parent;
    }
  }
  return [...stop];
}

function powershell(script, env) {
  return execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, env });
}

function winProcesses() {
  if (process.platform !== 'win32') return [];
  let out = '';
  try {
    out = powershell("$ProgressPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress");
  } catch {
    return [];
  }
  let rows;
  try { rows = JSON.parse(out.replace(/^\uFEFF/, '')); } catch { return []; }
  if (!rows) return [];
  if (!Array.isArray(rows)) rows = [rows];
  return rows.map((row) => ({
    pid: Number(row.ProcessId),
    ppid: Number(row.ParentProcessId) || 0,
    name: row.Name || '',
    exe: row.ExecutablePath || '',
    cmd: row.CommandLine || '',
  })).filter((proc) => proc.pid);
}

const LOCK_QUERY = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class MccRm {
  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS {
    public int dwProcessId;
    public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
  }
  const int CCH_RM_MAX_APP_NAME = 255;
  const int CCH_RM_MAX_SVC_NAME = 63;
  enum RM_APP_TYPE { RmUnknownApp = 0, RmMainWindow = 1, RmOtherWindow = 2, RmService = 3, RmExplorer = 4, RmConsole = 5, RmCritical = 1000 }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)]
    public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)]
    public string strServiceShortName;
    public RM_APP_TYPE ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)]
    public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
  [DllImport("rstrtmgr.dll")]
  static extern int RmEndSession(uint pSessionHandle);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
  [DllImport("rstrtmgr.dll")]
  static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);
  public static int[] Pids(string path) {
    uint handle;
    int rc = RmStartSession(out handle, 0, Guid.NewGuid().ToString("N"));
    if (rc != 0) return new int[0];
    try {
      rc = RmRegisterResources(handle, 1, new string[] { path }, 0, null, 0, null);
      if (rc != 0) return new int[0];
      uint needed = 0, count = 0, reason = 0;
      rc = RmGetList(handle, out needed, ref count, null, ref reason);
      if (rc == 0 || needed == 0) return new int[0];
      if (rc != 234) return new int[0];
      var info = new RM_PROCESS_INFO[needed];
      count = needed;
      rc = RmGetList(handle, out needed, ref count, info, ref reason);
      if (rc != 0) return new int[0];
      var list = new List<int>();
      for (int i = 0; i < count; i++) list.Add(info[i].Process.dwProcessId);
      return list.ToArray();
    } finally { RmEndSession(handle); }
  }
}
"@
[MccRm]::Pids($env:MCC_CLEAN_FILE) | ForEach-Object { $_ }
`;

function fileLockPids(file) {
  if (process.platform !== 'win32' || !file || !fs.existsSync(file)) return [];
  let out = '';
  try {
    out = powershell(LOCK_QUERY, { ...process.env, MCC_CLEAN_FILE: file });
  } catch {
    return [];
  }
  return out.split(/\r?\n/).map((line) => Number(line.trim())).filter((pid) => pid > 0);
}

function releaseLocks(dir, lockedFile) {
  const all = winProcesses();
  const locks = fileLockPids(lockedFile);
  const pids = pidsToStop(all, dir, process.pid, locks);
  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
      console.log(`[clean] stopped process ${pid}`);
    } catch { /* already gone */ }
  }
  if (pids.length) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  const stopped = new Set(pids);
  return all.filter((proc) => locks.includes(proc.pid) && !stopped.has(proc.pid) && proc.pid !== process.pid);
}

function removePath(full) {
  if (!fs.existsSync(full)) return false;
  const opts = { recursive: true, force: true, maxRetries: 3, retryDelay: 200 };
  try {
    fs.rmSync(full, opts);
    return true;
  } catch (err) {
    if (!LOCKED.has(err.code)) throw err;
    const held = releaseLocks(full, err.path || full);
    try {
      fs.rmSync(full, opts);
      return true;
    } catch (again) {
      if (!LOCKED.has(again.code)) throw again;
      const where = again.path || full;
      const who = held.map((proc) => `${processName(proc) || 'process'} (${proc.pid})`).join(', ');
      const still = who ? ` Still open in ${who}.` : '';
      const error = new Error(`[clean] Could not remove ${where}.${still} Close MyCodeChecker and any dev server, then run this again.`);
      error.code = again.code;
      error.path = where;
      throw error;
    }
  }
}

/** Delete generated build folders and installers copied to the project root. */
export function cleanBuild(projectRoot) {
  const removed = [];
  for (const rel of DIRS) {
    const dir = path.join(projectRoot, rel);
    if (removePath(dir)) removed.push(dir);
  }
  for (const name of fs.readdirSync(projectRoot)) {
    const full = path.join(projectRoot, name);
    let stat;
    try { stat = fs.lstatSync(full); } catch { continue; }
    if (stat.isSymbolicLink()) continue;
    const installer = (stat.isDirectory() && name.endsWith('.app')) || (stat.isFile() && ROOT_INSTALLER.test(name));
    if (!installer) continue;
    if (removePath(full)) removed.push(full);
  }
  return removed;
}

function removeRel(projectRoot, rel, removed) {
  const full = path.join(projectRoot, rel);
  if (removePath(full)) removed.push(full);
}

/** clean, then dependencies and generated tutorial video. */
export function cleanAll(projectRoot) {
  const removed = cleanBuild(projectRoot);
  for (const rel of ALL_DIRS) removeRel(projectRoot, rel, removed);
  for (const rel of ALL_FILES) removeRel(projectRoot, rel, removed);
  for (const name of fs.readdirSync(projectRoot)) {
    if (!ROOT_MEDIA.test(name)) continue;
    const full = path.join(projectRoot, name);
    let stat;
    try { stat = fs.lstatSync(full); } catch { continue; }
    if (!stat.isFile()) continue;
    fs.rmSync(full, { force: true });
    removed.push(full);
  }
  return removed;
}

function main() {
  const all = process.argv.includes('--all');
  const removed = (all ? cleanAll : cleanBuild)(root);
  const tag = all ? 'clean:all' : 'clean';
  if (!removed.length) console.log(`[${tag}] Nothing to remove.`);
  else for (const file of removed) console.log(`[${tag}] removed ${path.relative(root, file)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
