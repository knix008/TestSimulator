// Discover interactive shells actually installed on this machine.
// The renderer lists these; only an id comes back to `terminal.open`.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CACHE_MS = 15_000;
let cache = null;
let cacheAt = 0;

function existsFile(p) {
  if (!p) return false;
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function firstFile(candidates) {
  for (const p of candidates) {
    if (existsFile(p)) return p;
  }
  return null;
}

function which(name) {
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (process.platform === 'win32') {
    const exts = String(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean);
    const hasExt = !!path.extname(name);
    for (const dir of dirs) {
      if (hasExt) {
        const p = path.join(dir, name);
        if (existsFile(p)) return p;
        continue;
      }
      for (const ext of exts) {
        const p = path.join(dir, name + ext);
        if (existsFile(p)) return p;
      }
    }
    return null;
  }
  for (const dir of dirs) {
    const p = path.join(dir, name);
    if (existsFile(p)) return p;
  }
  return null;
}

function shell(id, label, labelKo, file, args, extra = {}) {
  return { id, label, labelKo: labelKo || label, file, args: args || [], ...extra };
}

// UTF-16LE Base64 so `$false` / quotes survive Windows PowerShell's OEM parser.
function encodedCommand(script) {
  return Buffer.from(String(script), 'utf16le').toString('base64');
}

// Piped PowerShell is a Default Host: PathInfo.ToString() becomes a provider
// path and PSReadLine redraws over the prompt. Force a filesystem-path prompt.
const PS_START = [
  'Remove-Module PSReadLine -ErrorAction SilentlyContinue',
  'try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding = [Console]::OutputEncoding; $OutputEncoding = [Console]::OutputEncoding } catch {}',
  'if ($env:MFC_TERM_CWD) { Set-Location -LiteralPath $env:MFC_TERM_CWD }',
  'function global:prompt { return ("PS {0}> " -f (Get-Location).Path) }',
].join('; ');

const PS_ARGS = ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', encodedCommand(PS_START)];

function listWindows() {
  const sys = process.env.SystemRoot || 'C:\\Windows';
  const sys32 = path.join(sys, 'System32');
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const out = [];

  const cmd = firstFile([process.env.ComSpec, process.env.COMSPEC, path.join(sys32, 'cmd.exe')]);
  if (cmd) out.push(shell('cmd', 'Command Prompt', '명령 프롬프트', cmd, ['/d', '/k'], { preferred: true, codepage: 'cp949' }));

  const powershell = firstFile([
    path.join(sys32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    which('powershell'),
  ]);
  if (powershell) out.push(shell('powershell', 'Windows PowerShell', 'Windows PowerShell', powershell, PS_ARGS));

  const pwsh = firstFile([
    which('pwsh') && !/WindowsApps/i.test(which('pwsh')) ? which('pwsh') : null,
    path.join(pf, 'PowerShell', '7', 'pwsh.exe'),
    path.join(pf, 'PowerShell', '7-preview', 'pwsh.exe'),
  ]);
  if (pwsh) {
    out.push(shell('pwsh', 'PowerShell', 'PowerShell', pwsh, PS_ARGS));
    const cmd = out.find((s) => s.id === 'cmd');
    if (cmd) cmd.preferred = false;
    out[out.length - 1].preferred = true;
  }

  const gitBash = firstFile([
    process.env.GIT_INSTALL_ROOT && path.join(process.env.GIT_INSTALL_ROOT, 'bin', 'bash.exe'),
    path.join(pf, 'Git', 'bin', 'bash.exe'),
    path.join(pf86, 'Git', 'bin', 'bash.exe'),
    path.join(local, 'Programs', 'Git', 'bin', 'bash.exe'),
    home && path.join(home, 'AppData', 'Local', 'Programs', 'Git', 'bin', 'bash.exe'),
  ]);
  if (gitBash) out.push(shell('git-bash', 'Git Bash', 'Git Bash', gitBash, ['-l', '-i'], { env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } }));

  const msys = firstFile([
    'C:\\msys64\\usr\\bin\\bash.exe',
    path.join(pf, 'msys64', 'usr', 'bin', 'bash.exe'),
  ]);
  if (msys) out.push(shell('msys2', 'MSYS2', 'MSYS2', msys, ['-l', '-i'], { env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } }));

  const cygwin = firstFile([
    'C:\\cygwin64\\bin\\bash.exe',
    'C:\\cygwin\\bin\\bash.exe',
  ]);
  if (cygwin) out.push(shell('cygwin', 'Cygwin', 'Cygwin', cygwin, ['-l', '-i'], { env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } }));

  const nu = which('nu');
  if (nu) out.push(shell('nu', 'Nushell', 'Nushell', nu, []));

  const fish = which('fish');
  if (fish && !/msys|git|cygwin/i.test(fish)) out.push(shell('fish', 'Fish', 'Fish', fish, ['-i']));

  const wsl = firstFile([path.join(sys32, 'wsl.exe'), which('wsl')]);
  if (wsl) {
    for (const distro of listWslDistros(wsl)) {
      const id = `wsl:${distro}`;
      out.push(shell(id, `${distro} (WSL)`, `${distro} (WSL)`, wsl, ['-d', distro]));
    }
  }

  return dedupe(out);
}

function listWslDistros(wsl) {
  try {
    const raw = execFileSync(wsl, ['-l', '-q'], { windowsHide: true, timeout: 4000, encoding: 'buffer' });
    let text;
    if (raw.length >= 2 && (raw[1] === 0 || raw[0] === 0xFF || raw[0] === 0xFE)) {
      text = raw.toString('utf16le');
    } else {
      text = raw.toString('utf8');
    }
    text = text.replace(/^\uFEFF/, '').replace(/\u0000/g, '');
    return text.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !/^docker-desktop-data$/i.test(s));
  } catch {
    return [];
  }
}

function prettyUnixName(file) {
  const base = path.basename(file).replace(/\.exe$/i, '');
  const names = {
    bash: ['Bash', 'Bash'],
    zsh: ['Zsh', 'Zsh'],
    sh: ['sh', 'sh'],
    dash: ['Dash', 'Dash'],
    fish: ['Fish', 'Fish'],
    ksh: ['Ksh', 'Ksh'],
    tcsh: ['Tcsh', 'Tcsh'],
    csh: ['Csh', 'Csh'],
    pwsh: ['PowerShell', 'PowerShell'],
    nu: ['Nushell', 'Nushell'],
    elvish: ['Elvish', 'Elvish'],
  };
  return names[base] || [base, base];
}

function listUnix() {
  const files = new Set();
  try {
    const text = fs.readFileSync('/etc/shells', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const p = line.trim();
      if (!p || p.startsWith('#')) continue;
      if (/nologin|\/false$/i.test(p)) continue;
      if (existsFile(p)) files.add(path.normalize(p));
    }
  } catch { /* no /etc/shells */ }

  const extra = [
    process.env.SHELL,
    process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash',
    '/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/bash', '/usr/bin/zsh',
    '/usr/local/bin/bash', '/usr/local/bin/zsh', '/opt/homebrew/bin/bash',
    '/opt/homebrew/bin/zsh', '/usr/bin/fish', '/usr/local/bin/fish',
    '/opt/homebrew/bin/fish', which('pwsh'), which('nu'), which('fish'),
  ];
  for (const p of extra) {
    if (p && existsFile(p)) files.add(path.normalize(p));
  }

  const preferredFile = process.env.SHELL && existsFile(process.env.SHELL)
    ? path.normalize(process.env.SHELL)
    : null;
  const out = [];
  for (const file of files) {
    const base = path.basename(file);
    const [label, labelKo] = prettyUnixName(file);
    const id = file;
    const args = base === 'sh' || base === 'dash' ? [] : ['-i'];
    out.push(shell(id, label, labelKo, file, args, { preferred: preferredFile === file }));
  }
  if (out.length && !out.some((s) => s.preferred)) out[0].preferred = true;
  return dedupe(out);
}

function fallback() {
  if (process.platform === 'win32') {
    const file = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
    return [shell('cmd', 'Command Prompt', '명령 프롬프트', file, ['/d', '/k'], { preferred: true, codepage: 'cp949' })];
  }
  const file = process.env.SHELL || '/bin/sh';
  return [shell(file, path.basename(file), path.basename(file), file, ['-i'], { preferred: true })];
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const key = path.normalize(s.file).toLowerCase() + '\0' + (s.args || []).join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  const counts = {};
  for (const s of out) counts[s.label] = (counts[s.label] || 0) + 1;
  for (const s of out) {
    if (counts[s.label] > 1) s.meta = path.dirname(s.file);
  }
  return out;
}

function discover() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  let list;
  try {
    list = process.platform === 'win32' ? listWindows() : listUnix();
  } catch {
    list = [];
  }
  if (!list.length) list = fallback();
  cache = list;
  cacheAt = now;
  return list;
}

function listShells() {
  return discover().map((s) => ({
    id: s.id,
    label: s.label,
    labelKo: s.labelKo,
    path: s.file,
    meta: s.meta || '',
    preferred: !!s.preferred,
  }));
}

function resolveShell(id) {
  const all = discover();
  if (id) {
    const hit = all.find((s) => s.id === id);
    if (!hit) {
      const e = new Error('That terminal is not installed');
      e.code = 'ENOENT';
      throw e;
    }
    return hit;
  }
  return all.find((s) => s.preferred) || all[0] || fallback()[0];
}

module.exports = { listShells, resolveShell };
