// Terminal sessions for the bottom dock: one shell process per tab with
// piped stdio (no pseudo-terminal), so it behaves like a line-oriented
// console — a command typed in the dock is written to the shell's stdin, the
// output is buffered here and fetched by the UI (`term.read`, polled). Works
// the same in the desktop app and in the web version.
//
// Every command is written to a small script file that the shell sources
// (`. file` / `call file`), so the shell's stdin carries only that one short
// line: a program started by the command that reads stdin (Read-Host, python,
// npm init …) gets what the user types next, not the following command. After
// the command a marker line (`__CC_CWD__:<dir>`) is printed so the UI knows
// the shell's current directory (for the prompt) and that the shell is idle
// again (prompt shown) — while it is not, `run` feeds typed lines to the
// running command's stdin; the marker is stripped from the output. Sourcing
// keeps `cd`, shell variables and functions in the shell, as if typed.
// As soon as the marker arrives the git state of the new directory is read
// here and handed to the UI with the next `read` (`git`, null while it is
// being read), so the prompt comes back in one piece without a second round
// trip. Every change (output, marker, git) is announced with an 'update'
// event, which the desktop host forwards over IPC so the UI reads at once
// instead of waiting for its next poll.
// Tab completion (`complete`) is done here too, as in MyEditor: the first
// word from the shell's builtins plus the executables on PATH, every word
// from the files of the directory it names.
//
// Windows notes (all verified against cmd.exe / Windows PowerShell 5.1):
//   • PowerShell reads a redirected stdin with the console code page, so it
//     is started through `cmd /C chcp 65001 & powershell -Command -` — the
//     only way to get UTF-8 *input* without a pseudo-terminal. Its script
//     file gets a BOM (PowerShell 5.1 reads BOM-less files as ANSI); the
//     marker is sent on the stdin line after the dot-source so a parse error
//     in the script still ends the command.
//   • cmd.exe in code page 65001 exits when it reads multibyte characters
//     from a pipe (a long-standing bug), so the batch file is the only way to
//     run non-ASCII commands at all. Its marker must be inside the batch file
//     (`%CD%` on the stdin line would expand before `call` runs).
//   • cmd prints its prompt before every read; PROMPT is set to a marker
//     that is stripped, because the dock draws its own prompt.
'use strict';

const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARK = '__CC_CWD__:';
const PROMPT_MARK = '__CC_P__';
const MAX_CHUNKS = 4000;
const PS_INIT = '$__u=New-Object Text.UTF8Encoding $false; [Console]::OutputEncoding=$__u; $OutputEncoding=$__u';

// Tab completion: builtins per shell kind; PATH is scanned once.
const BUILTINS = {
  cmd: ['assoc', 'call', 'cd', 'chdir', 'cls', 'color', 'copy', 'date', 'del', 'dir', 'echo', 'endlocal', 'erase', 'exit', 'findstr', 'for', 'ftype', 'goto', 'if', 'md', 'mkdir', 'mklink', 'more', 'move', 'path', 'pause', 'popd', 'prompt', 'pushd', 'rd', 'rem', 'ren', 'rename', 'rmdir', 'robocopy', 'set', 'setlocal', 'start', 'time', 'title', 'tree', 'type', 'ver', 'verify', 'vol', 'where', 'xcopy'],
  powershell: ['Add-Content', 'Clear-Host', 'Compress-Archive', 'ConvertFrom-Json', 'ConvertTo-Json', 'Copy-Item', 'Expand-Archive', 'ForEach-Object', 'Get-Alias', 'Get-ChildItem', 'Get-Command', 'Get-Content', 'Get-Date', 'Get-Help', 'Get-Item', 'Get-ItemProperty', 'Get-Location', 'Get-Member', 'Get-Module', 'Get-Process', 'Get-Service', 'Get-Variable', 'Import-Module', 'Invoke-Expression', 'Invoke-RestMethod', 'Invoke-WebRequest', 'Join-Path', 'Measure-Object', 'Move-Item', 'New-Item', 'Out-File', 'Out-String', 'Pop-Location', 'Push-Location', 'Read-Host', 'Remove-Item', 'Rename-Item', 'Resolve-Path', 'Select-Object', 'Select-String', 'Set-Alias', 'Set-Content', 'Set-Location', 'Set-Variable', 'Sort-Object', 'Split-Path', 'Start-Process', 'Stop-Process', 'Test-Path', 'Where-Object', 'Write-Host', 'Write-Output',
    'cat', 'cd', 'clear', 'cls', 'cp', 'del', 'dir', 'echo', 'exit', 'foreach', 'gc', 'gci', 'gcm', 'gi', 'gl', 'gm', 'iex', 'irm', 'iwr', 'kill', 'ls', 'md', 'measure', 'mkdir', 'mv', 'ni', 'ps', 'pwd', 'ri', 'rm', 'rmdir', 'select', 'sl', 'sls', 'sort', 'type', 'where'],
  sh: ['alias', 'bg', 'break', 'builtin', 'case', 'cd', 'command', 'continue', 'declare', 'dirs', 'do', 'done', 'echo', 'elif', 'else', 'esac', 'eval', 'exec', 'exit', 'export', 'fg', 'fi', 'for', 'function', 'getopts', 'hash', 'help', 'history', 'if', 'jobs', 'kill', 'let', 'local', 'logout', 'popd', 'printf', 'pushd', 'pwd', 'read', 'readonly', 'return', 'set', 'shift', 'source', 'test', 'then', 'time', 'times', 'trap', 'type', 'ulimit', 'umask', 'unalias', 'unset', 'until', 'wait', 'while'],
};

let pathCmds = null;
function pathCommands() {
  if (pathCmds) return pathCmds;
  const win = process.platform === 'win32';
  const exts = win ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').toLowerCase().split(';').filter(Boolean) : null;
  const set = new Set();
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.isDirectory()) continue;
      if (win) { const ext = path.extname(e.name).toLowerCase(); if (exts.includes(ext)) set.add(e.name.slice(0, -ext.length)); }
      else { try { fs.accessSync(path.join(dir, e.name), fs.constants.X_OK); set.add(e.name); } catch { /* not executable */ } }
    }
  }
  pathCmds = [...set];
  return pathCmds;
}

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

function firstExisting(candidates) {
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  return null;
}

// The shells offered in the "+ ▾" menu. `cwdLine` prints the marker, `init`
// runs once after the shell starts, `source(file)` is the stdin line that
// runs the script file (followed by the marker unless `markerInFile`).
function shells() {
  const posixSource = (f) => `. "${f.replace(/\\/g, '/')}";`;
  if (process.platform === 'win32') {
    const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')];
    const ps = (exe) => ({ cmd: 'cmd.exe', args: ['/Q', '/C', `chcp 65001>nul & "${exe}" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command -`], verbatim: true, init: PS_INIT, ext: '.ps1', bom: true, source: (f) => `. "${f}";`, cwdLine: `Write-Host "${MARK}$PWD"`, eol: '\r\n' });
    const list = [
      { id: 'powershell', label: 'PowerShell', ...ps('powershell.exe') },
      { id: 'cmd', label: 'Command Prompt', cmd: 'cmd.exe', args: ['/Q', '/K', 'chcp 65001>nul'], batch: true, ext: '.cmd', markerInFile: true, source: (f) => `call "${f}"`, cwdLine: `echo ${MARK}%CD%`, eol: '\r\n' },
    ];
    const pwsh = firstExisting(pf.map((p) => p && path.join(p, 'PowerShell', '7', 'pwsh.exe')));
    if (pwsh) list.push({ id: 'pwsh', label: 'PowerShell 7', ...ps(pwsh) });
    const bash = firstExisting(pf.map((p) => p && path.join(p, 'Git', 'bin', 'bash.exe')));
    if (bash) list.push({ id: 'gitbash', label: 'Git Bash', cmd: bash, args: ['--norc', '-s'], ext: '.sh', source: posixSource, cwdLine: `echo "${MARK}$PWD"`, eol: '\n' });
    return list;
  }
  const sh = process.env.SHELL || '/bin/bash';
  const posix = (cmd) => ({ cmd, args: ['-s'], ext: '.sh', source: posixSource, cwdLine: `echo "${MARK}$PWD"`, eol: '\n' });
  const list = [{ id: 'default', label: path.basename(sh), ...posix(sh) }];
  if (sh !== '/bin/bash' && fs.existsSync('/bin/bash')) list.push({ id: 'bash', label: 'bash', ...posix('/bin/bash') });
  if (sh !== '/bin/zsh' && fs.existsSync('/bin/zsh')) list.push({ id: 'zsh', label: 'zsh', ...posix('/bin/zsh') });
  if (fs.existsSync('/bin/sh')) list.push({ id: 'sh', label: 'sh', ...posix('/bin/sh') });
  return list;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\r(?!\n)|\ufeff/g;
const CWD_RE = new RegExp(`${MARK}([^\\r\\n]*)\\r?\\n?`, 'g');
const PROMPT_RE = new RegExp(`(\\r?\\n)?${PROMPT_MARK}`, 'g');
const MARK_AT_END = new RegExp(`${MARK}[^\\r\\n]*$`);

function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode) return;
  if (process.platform === 'win32') {
    // The PowerShell tabs run inside a cmd wrapper; /T takes the child too.
    execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => { try { proc.kill(); } catch { /* gone */ } });
  } else {
    try { proc.kill(); } catch { /* gone */ }
  }
}

// Git status of a directory, for the prompt — one `git status` process:
//   { repo:false } or { repo:true, branch, upstream, ahead, behind, staged, changed, untracked, conflicts, stashes }
function gitStatus(cwd) {
  return new Promise((resolve) => {
    if (!cwd || !fs.existsSync(cwd)) return resolve({ repo: false });
    execFile('git', ['-C', cwd, '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '--show-stash'], { windowsHide: true, maxBuffer: 8 << 20 }, (err, out) => {
      if (err) return resolve({ repo: false, error: /not a git repository/i.test(String(err.message)) ? null : err.message });
      const st = { repo: true, branch: '', upstream: '', ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, stashes: 0 };
      for (const line of String(out).split('\n')) {
        if (!line) continue;
        if (line.startsWith('# branch.head ')) st.branch = line.slice(14).trim();
        else if (line.startsWith('# branch.upstream ')) st.upstream = line.slice(18).trim();
        else if (line.startsWith('# branch.ab ')) { const m = line.match(/\+(\d+) -(\d+)/); if (m) { st.ahead = Number(m[1]); st.behind = Number(m[2]); } }
        else if (line.startsWith('# stash ')) st.stashes = Number(line.slice(8)) || 0;
        else if (line[0] === '1' || line[0] === '2') {
          const xy = line.slice(2, 4);
          if (xy[0] !== '.') st.staged++;
          if (xy[1] !== '.') st.changed++;
        } else if (line[0] === 'u') st.conflicts++;
        else if (line[0] === '?') st.untracked++;
      }
      if (st.branch === '(detached)') {
        execFile('git', ['-C', cwd, 'rev-parse', '--short', 'HEAD'], { windowsHide: true }, (e2, sha) => { if (!e2) st.branch = `@${sha.trim()}`; resolve(st); });
      } else resolve(st);
    });
  });
}

function createTerminals() {
  const sessions = new Map();
  const events = new EventEmitter();
  let nextId = 1;

  const notify = (s) => events.emit('update', { id: s.id });

  // Reads the git state of the session's current directory; an older read
  // that finishes later is dropped.
  function refreshGit(s) {
    const dir = s.cwd, seq = ++s.gitSeq;
    s.git = null;
    gitStatus(dir).then((g) => { if (s.gitSeq === seq && sessions.get(s.id) === s) { s.git = { ...g, dir, seq }; notify(s); } });
  }

  function push(s, text) {
    // Pull the cwd / prompt markers out of the stream; everything else is output.
    let t = text.replace(ANSI, '');
    // Write-Host emits the marker and its newline as two writes; when the
    // newline arrives in the next chunk it must go with the marker.
    if (s.eatNewline) { t = t.replace(/^\r?\n/, ''); s.eatNewline = false; }
    if (MARK_AT_END.test(t)) s.eatNewline = true;
    let marked = false;
    t = t.replace(CWD_RE, (_m, dir) => { s.cwd = dir.trim() || s.cwd; s.idle = true; marked = true; return ''; });
    if (marked) refreshGit(s);
    if (s.def.batch) t = t.replace(PROMPT_RE, '');
    if (t) {
      s.seq++;
      s.chunks.push({ seq: s.seq, text: t });
      if (s.chunks.length > MAX_CHUNKS) s.chunks.splice(0, s.chunks.length - MAX_CHUNKS);
    }
    if (t || marked) notify(s);
  }

  function cleanup(s) {
    try { fs.unlinkSync(s.scriptFile); } catch { /* gone */ }
  }

  return {
    shells: () => shells().map(({ id, label }) => ({ id, label })),

    create({ cwd, shell } = {}) {
      const all = shells();
      const def = all.find((x) => x.id === shell) || all[0];
      let dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
      try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir); } catch { dir = os.homedir(); }
      const id = nextId++;
      const s = { id, shell: def.id, label: def.label, cwd: dir, chunks: [], seq: 0, exited: false, code: null, def, proc: null, eatNewline: false, idle: true, git: null, gitSeq: 0 };
      s.scriptFile = path.join(os.tmpdir(), `cc-term-${process.pid}-${id}${def.ext}`);
      const env = { ...process.env, TERM: 'dumb', GIT_PAGER: 'cat', PAGER: 'cat', LANG: process.env.LANG || 'C.UTF-8' };
      if (def.batch) env.PROMPT = PROMPT_MARK;
      const proc = spawn(def.cmd, def.args, { cwd: dir, stdio: 'pipe', windowsHide: true, windowsVerbatimArguments: !!def.verbatim, env });
      s.proc = proc;
      proc.stdout.on('data', (d) => push(s, d.toString('utf8')));
      proc.stderr.on('data', (d) => push(s, d.toString('utf8')));
      proc.stdin.on('error', () => { /* the exit handler reports it */ });
      proc.on('error', (err) => { push(s, `\n[${err.message}]\n`); s.exited = true; cleanup(s); notify(s); });
      proc.on('exit', (code) => { s.exited = true; s.code = code; push(s, `\n[process exited with code ${code}]\n`); cleanup(s); notify(s); });
      if (def.init) { try { proc.stdin.write(`${def.init}${def.eol}`); } catch { /* exited already */ } }
      sessions.set(id, s);
      refreshGit(s);
      return { id, shell: s.shell, label: s.label, cwd: s.cwd };
    },

    // Raw text to the shell's stdin, without the cwd marker.
    write({ id, data }) {
      const s = sessions.get(id);
      if (!s || s.exited) return false;
      s.proc.stdin.write(data);
      return true;
    },

    // Runs one command line (through the script file) and asks for the cwd
    // afterwards. While a command is still running (no marker yet) the line
    // is input for that command and goes to stdin as it is.
    run({ id, line }) {
      const s = sessions.get(id);
      if (!s || s.exited) return false;
      const { eol, cwdLine, bom, markerInFile, source } = s.def;
      if (!s.idle) { s.proc.stdin.write(`${line}${eol}`); return true; }
      s.idle = false;
      fs.writeFileSync(s.scriptFile, `${bom ? '\ufeff' : ''}${line}${eol}${markerInFile ? `${cwdLine}${eol}` : ''}`, 'utf8');
      s.proc.stdin.write(`${source(s.scriptFile)}${markerInFile ? '' : ` ${cwdLine}`}${eol}`);
      return true;
    },

    read({ id, since = 0 }) {
      const s = sessions.get(id);
      if (!s) return null;
      const chunks = since ? s.chunks.filter((c) => c.seq > since) : s.chunks;
      return { id, chunks, seq: s.seq, cwd: s.cwd, idle: s.idle, git: s.git, exited: s.exited, code: s.code };
    },

    kill({ id }) {
      const s = sessions.get(id);
      if (!s) return false;
      killTree(s.proc);
      cleanup(s);
      sessions.delete(id);
      return true;
    },

    list: () => [...sessions.values()].map((s) => ({ id: s.id, shell: s.shell, label: s.label, cwd: s.cwd, idle: s.idle, exited: s.exited })),

    // Git status of any directory (the UI re-reads a tab's state when it is activated).
    git: ({ cwd }) => gitStatus(cwd),

    // 'update' {id}: new output, a finished command or a git state — the desktop host forwards it over IPC.
    on: (ev, fn) => events.on(ev, fn),

    // Completions for the word at `cursor` in `line`: { start, quoted, word, lcp, items:[{ text, dir, cmd }] }.
    // `start` is where the word begins in the line, `lcp` the longest common
    // prefix of the candidates (what a Tab can safely insert).
    complete({ id, line, cursor }) {
      const s = sessions.get(id);
      if (!s) return { start: 0, quoted: false, word: '', lcp: '', items: [] };
      const head = line.slice(0, cursor == null ? line.length : cursor);
      let start = 0, q = false;
      for (let i = 0; i < head.length; i++) { const ch = head[i]; if (ch === '"') q = !q; else if (!q && (ch === ' ' || ch === '\t')) start = i + 1; }
      let word = head.slice(start);
      const quoted = word.startsWith('"');
      if (quoted) word = word.slice(1);
      const before = head.slice(0, start).trim();
      const firstWord = !before || /[|&;(]$/.test(before);
      const win = process.platform === 'win32';
      const fold = (x) => (win ? x.toLowerCase() : x);
      const sepIdx = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
      const dirPart = sepIdx >= 0 ? word.slice(0, sepIdx + 1) : '';
      const prefix = word.slice(sepIdx + 1);
      const sep = sepIdx >= 0 ? word[sepIdx] : (s.shell === 'cmd' || s.shell === 'powershell' || s.shell === 'pwsh' ? '\\' : '/');
      const match = (name) => fold(name).startsWith(fold(prefix));
      const items = [];
      if (firstWord && sepIdx < 0) {
        const kind = s.shell === 'cmd' ? 'cmd' : (s.shell === 'powershell' || s.shell === 'pwsh') ? 'powershell' : 'sh';
        for (const c of [...BUILTINS[kind], ...pathCommands()]) if (match(c)) items.push({ text: c, dir: false, cmd: true });
      }
      let base = dirPart;
      if (base.startsWith('~')) base = os.homedir() + base.slice(1);
      if (win && /^\/[a-zA-Z](\/|$)/.test(base)) base = `${base[1]}:${base.slice(2) || '/'}`;   // Git Bash style /c/…
      base = dirPart ? path.resolve(s.cwd, base) : s.cwd;
      try {
        for (const e of fs.readdirSync(base, { withFileTypes: true })) {
          if (!match(e.name) || (e.name.startsWith('.') && !prefix.startsWith('.'))) continue;
          const dir = e.isDirectory() || (e.isSymbolicLink() && isDir(path.join(base, e.name)));
          items.push({ text: dirPart + e.name + (dir ? sep : ''), dir, cmd: false });
        }
      } catch { /* not a directory */ }
      const seen = new Set();
      const out = items.filter((it) => !seen.has(fold(it.text)) && seen.add(fold(it.text))).sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })).slice(0, 500);
      let lcp = out.length ? out[0].text : '';
      for (const it of out) { let n = 0; while (n < lcp.length && n < it.text.length && fold(lcp[n]) === fold(it.text[n])) n++; lcp = lcp.slice(0, n); }
      return { start, quoted, word, lcp, items: out };
    },

    shutdown() {
      for (const s of sessions.values()) { killTree(s.proc); cleanup(s); }
      sessions.clear();
    },
  };
}

module.exports = { createTerminals, MARK };
