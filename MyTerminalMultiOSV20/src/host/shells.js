'use strict';
/**
 * Command shells — the program MyShell hands each command line to when the
 * line is not one of its own built-ins (`cd`, `ls`, `cat`, `prompt` …).
 *
 * MyShell keeps its own prompt, line editing, history and working directory;
 * the selected shell only interprets the line (`cmd /c`, `powershell -Command`,
 * `bash -c` …). Every line runs in a fresh instance of that shell, so shell
 * variables do not persist between lines — `cd` and the environment do,
 * because MyShell tracks them.
 *
 * Windows: Command Prompt (default), Windows PowerShell, PowerShell 7, Git Bash,
 * WSL. macOS: zsh (default), bash, fish, sh … Linux: bash (default), zsh, fish,
 * sh, dash … plus the login shell ($SHELL) and a user-supplied program.
 */

const fs = require('fs');
const path = require('path');

/** @typedef {'cmd'|'powershell'|'posix'|'wsl'} ShellKind */
/** @typedef {{ id: string, label: string, path: string, kind: ShellKind }} ShellDef */

const POSIX_DIRS = ['/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin'];
const POSIX_SHELLS = [
  ['bash', 'Bash'],
  ['zsh', 'Zsh'],
  ['fish', 'Fish'],
  ['sh', 'sh (POSIX shell)'],
  ['dash', 'Dash'],
  ['ksh', 'Korn shell (ksh)'],
  ['tcsh', 'tcsh'],
];

function firstExisting(candidates, exists) {
  for (const candidate of candidates) {
    if (candidate && exists(candidate)) return candidate;
  }
  return '';
}

// Candidate paths are built with the target platform's path rules so the
// tables (and their tests) behave the same on every host.
const winPath = path.win32;
const posixPath = path.posix;

/** Windows candidates (paths to probe, in preference order). */
function windowsCandidates(env) {
  const sysRoot = env.SystemRoot || env.windir || 'C:\\Windows';
  const pf = env.ProgramFiles || 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = env.LOCALAPPDATA || '';
  const pathDirs = String(env.PATH || env.Path || '').split(';').filter(Boolean);
  const onPath = (exe) => pathDirs.map((dir) => winPath.join(dir, exe));
  // Git for Windows: <root>\cmd\git.exe on PATH → <root>\bin\bash.exe
  const gitBashFromPath = pathDirs
    .filter((dir) => /\\git\\cmd$/i.test(dir) || /\\git\\bin$/i.test(dir))
    .map((dir) => winPath.join(winPath.dirname(dir), 'bin', 'bash.exe'));
  return [
    {
      id: 'cmd',
      label: 'Command Prompt (cmd.exe)',
      kind: 'cmd',
      candidates: [env.ComSpec, winPath.join(sysRoot, 'System32', 'cmd.exe')],
    },
    {
      id: 'powershell',
      label: 'Windows PowerShell',
      kind: 'powershell',
      candidates: [winPath.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')],
    },
    {
      id: 'pwsh',
      label: 'PowerShell 7 (pwsh)',
      kind: 'powershell',
      candidates: [winPath.join(pf, 'PowerShell', '7', 'pwsh.exe'), ...onPath('pwsh.exe')],
    },
    {
      id: 'gitbash',
      label: 'Git Bash',
      kind: 'posix',
      candidates: [
        ...gitBashFromPath,
        winPath.join(pf, 'Git', 'bin', 'bash.exe'),
        winPath.join(pf86, 'Git', 'bin', 'bash.exe'),
        local ? winPath.join(local, 'Programs', 'Git', 'bin', 'bash.exe') : '',
      ],
    },
    {
      id: 'wsl',
      label: 'WSL (Linux)',
      kind: 'wsl',
      candidates: [winPath.join(sysRoot, 'System32', 'wsl.exe')],
    },
  ];
}

function posixCandidates(env) {
  const list = POSIX_SHELLS.map(([name, label]) => ({
    id: name,
    label,
    kind: 'posix',
    candidates: POSIX_DIRS.map((dir) => posixPath.join(dir, name)),
  }));
  if (env.SHELL) {
    list.unshift({
      id: 'system',
      label: `Login shell (${posixPath.basename(env.SHELL)})`,
      kind: 'posix',
      candidates: [env.SHELL],
    });
  }
  return list;
}

function defaultExists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (_) {
    return false;
  }
}

/**
 * Shells installed on this machine, in menu order.
 * @returns {ShellDef[]}
 */
function detectShells({ platform = process.platform, env = process.env, exists = defaultExists } = {}) {
  const table = platform === 'win32' ? windowsCandidates(env) : posixCandidates(env);
  const found = [];
  for (const entry of table) {
    const file = firstExisting(entry.candidates, exists);
    if (!file) continue;
    found.push({ id: entry.id, label: entry.label, path: file, kind: entry.kind });
  }
  return found;
}

/** The shell used when nothing is configured: cmd / zsh / bash, else the first one found. */
function defaultShellId(platform = process.platform, shells = []) {
  const ids = new Set(shells.map((s) => s.id));
  const prefer = platform === 'win32' ? ['cmd'] : platform === 'darwin' ? ['zsh', 'bash', 'system', 'sh'] : ['bash', 'system', 'zsh', 'sh'];
  return prefer.find((id) => ids.has(id)) || shells[0]?.id || (platform === 'win32' ? 'cmd' : 'sh');
}

/** Kind of a user-supplied program, from its file name. */
function kindOfProgram(file, platform = process.platform) {
  const base = path.basename(String(file || '')).toLowerCase();
  if (platform === 'win32') {
    if (base === 'cmd.exe' || base === 'cmd') return 'cmd';
    if (base === 'powershell.exe' || base === 'pwsh.exe' || base === 'powershell' || base === 'pwsh') return 'powershell';
    if (base === 'wsl.exe' || base === 'wsl') return 'wsl';
  }
  return 'posix';
}

/**
 * Resolve the configured shell to a definition (falls back to the default).
 * @returns {ShellDef}
 */
function resolveShell(
  { shellId = '', shellCustomPath = '' } = {},
  { platform = process.platform, shells = null, exists = defaultExists } = {}
) {
  const list = shells || detectShells({ platform, exists });
  if (shellId === 'custom' && shellCustomPath && exists(shellCustomPath)) {
    return {
      id: 'custom',
      label: path.basename(shellCustomPath),
      path: shellCustomPath,
      kind: kindOfProgram(shellCustomPath, platform),
    };
  }
  const chosen = list.find((s) => s.id === shellId);
  if (chosen) return chosen;
  const fallbackId = defaultShellId(platform, list);
  const fallback = list.find((s) => s.id === fallbackId);
  if (fallback) return fallback;
  // Nothing detected (unusual): spawn through the platform default.
  return platform === 'win32'
    ? { id: 'cmd', label: 'Command Prompt (cmd.exe)', path: 'cmd.exe', kind: 'cmd' }
    : { id: 'sh', label: 'sh', path: '/bin/sh', kind: 'posix' };
}

/**
 * How to spawn one command line in a shell.
 * @param {ShellDef} shell
 * @param {string} line the raw command line
 * @returns {{ file: string, args: string[], options: object }}
 */
function buildShellSpawn(shell, line) {
  const text = String(line ?? '');
  switch (shell.kind) {
    case 'cmd':
      // Same shape Node uses for shell:true on Windows.
      return {
        file: shell.path,
        args: ['/d', '/s', '/c', `"${text}"`],
        options: { windowsVerbatimArguments: true, windowsHide: true },
      };
    case 'powershell':
      return {
        file: shell.path,
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', text],
        options: { windowsHide: true },
      };
    case 'wsl':
      return { file: shell.path, args: ['-e', 'sh', '-c', text], options: { windowsHide: true } };
    default:
      return { file: shell.path, args: ['-c', text], options: { windowsHide: true } };
  }
}

/** Short display name for tabs / prompt (cmd, PowerShell, pwsh, Git Bash, WSL, bash …). */
function shortName(shell) {
  const sh = shell || {};
  switch (sh.id) {
    case 'cmd':
      return 'cmd';
    case 'powershell':
      return 'PowerShell';
    case 'pwsh':
      return 'pwsh';
    case 'gitbash':
      return 'Git Bash';
    case 'wsl':
      return 'WSL';
    case 'custom':
    case 'system':
      return path.basename(String(sh.path || '')).replace(/\.exe$/i, '') || 'shell';
    default:
      return sh.id || 'shell';
  }
}

module.exports = {
  shortName,
  POSIX_SHELLS,
  detectShells,
  defaultShellId,
  kindOfProgram,
  resolveShell,
  buildShellSpawn,
};
