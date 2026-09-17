// Terminal sessions for the bottom dock: one shell process per tab with
// piped stdio (no pseudo-terminal), so it behaves like a line-oriented
// console — a command typed in the dock is written to the shell's stdin, the
// output is buffered here and fetched by the UI (`term.read`, polled). Works
// the same in the desktop app and in the web version.
//
// The shells are started so that they print neither a prompt nor an echo of
// the command (cmd: /Q and a PROMPT made of a marker that is stripped,
// PowerShell: -Command -, bash: -s): the dock draws the prompt itself, at the
// end of the output, and types the command there.
//
// Every command is written to a small script file that the shell sources
// (`. file` / `call file`), so the shell's stdin carries only that one short
// line: a program started by the command that reads stdin (Read-Host, python,
// npm init …) gets what the user types next, not the following command. After
// the command a marker line (`__CC_CWD__:<dir>;<exit code>`) is printed — by
// the script (cmd) or by the rest of the stdin line (the others) — which tells
// the dock the shell's current directory, the status of the command (the
// prompt's status segment) and that the shell is idle again (prompt shown);
// the marker is stripped from the output. While the shell is not idle, `run`
// feeds typed lines to the running command's stdin. Sourcing keeps `cd`, shell
// variables and functions in the shell, as if typed, and a syntax error in the
// script is reported without killing the shell.
//
// `read({ wait })` is a long poll: with nothing new the answer is held back
// until output arrives, the prompt comes back or the shell exits, so the dock
// sees every change at once on both hosts. Tab completion (`complete`) is done
// here too: the first word from the shell's builtins plus the executables on
// PATH, every word from the files of the directory it names.
//
// Line endings: CRLF in the output is normalised to LF here; a lone CR (a
// progress bar redrawing its line) is passed on as it is — the dock decides
// what to do with it (settings › terminal: overwrite the line like a terminal,
// break the line, or drop it). The line ending Enter sends to a running
// program is the shell's own unless `run` is told otherwise (the same
// setting).
//
// Windows notes (verified against cmd.exe / Windows PowerShell 5.1):
//   • cmd and PowerShell read and write the console's code page (CP949 on a
//     Korean Windows), so the streams are decoded — and their script files
//     written — with it (consoleCodePage). Programs they start may write UTF-8
//     all the same (node, python, the Cygwin / MSYS tools on the PATH), so a
//     chunk that is valid multibyte UTF-8 is taken as UTF-8 (mixedDecoder).
//   • cmd.exe in code page 65001 exits when it reads multibyte characters from
//     a pipe (a long-standing bug), so it is left at the native code page and
//     its marker lives inside the batch file (`%CD%` on the stdin line would
//     expand before `call` runs).
//   • PowerShell 5.1 reads a BOM-less script as ANSI, so the .ps1 gets a BOM;
//     the exit status is read inside the script (after the dot-source `$?`
//     only says the sourcing worked).
'use strict';

const { spawn, execFile, execFileSync } = require('child_process');
const iconv = require('iconv-lite');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARK = '__CC_CWD__:';
const PROMPT_MARK = '__CC_P__';   // cmd's PROMPT: printed before every read, stripped here
const MAX_CHUNKS = 4000;

// Tab completion (the shells run without a terminal, so the dock completes by
// itself): the first word of a command is completed from these builtins plus
// the executables on PATH (scanned once), every word from the files in the
// directory it names.
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

// The console's code page on Windows (what cmd and PowerShell read / write
// through a pipe), as an iconv-lite encoding name; utf8 elsewhere.
let codePage = null;
function consoleCodePage() {
  if (codePage) return codePage;
  codePage = 'utf8';
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('cmd.exe', ['/c', 'chcp'], { windowsHide: true, timeout: 3000 }).toString('latin1');
      const m = out.match(/(\d{3,5})/);
      const cp = m ? Number(m[1]) : 0;
      if (cp && cp !== 65001 && iconv.encodingExists(`cp${cp}`)) codePage = `cp${cp}`;
    } catch { /* keep utf8 */ }
  }
  return codePage;
}

// cmd and PowerShell write the console's code page (CP949 …), but programs they run may write UTF-8 — node,
// python with PYTHONIOENCODING, and the Cygwin / MSYS tools on the PATH (`ls -al` in cmd is Cygwin's ls with
// our LANG=C.UTF-8): a chunk that is valid UTF-8 with multibyte characters is read as UTF-8, anything else
// with the code page. A UTF-8 character split across chunks waits for its rest (carry). CP949 text is not
// valid UTF-8 in practice (its trail bytes fall outside the continuation range), so cmd's own output is safe.
const utf8Strict = new TextDecoder('utf-8', { fatal: true });
function mixedDecoder(enc) {
  const dec = iconv.getDecoder(enc);
  if (enc === 'utf8' || enc === 'utf-8') return (buf) => dec.write(buf);
  let carry = null;
  return (buf) => {
    if (carry) { buf = Buffer.concat([carry, buf]); carry = null; }
    let high = false;
    for (const b of buf) if (b >= 0x80) { high = true; break; }
    if (!high) return dec.write(buf);
    // an unfinished UTF-8 sequence at the end: lead byte within the last 3 bytes with too few continuation bytes
    let cut = 0;
    for (let i = 1; i <= Math.min(3, buf.length); i++) {
      const b = buf[buf.length - i];
      if ((b & 0xc0) === 0x80) continue;
      const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (need > i) cut = i;
      break;
    }
    const head = cut ? buf.subarray(0, buf.length - cut) : buf;
    try {
      const text = utf8Strict.decode(head);
      if (cut) carry = Buffer.from(buf.subarray(buf.length - cut));
      return text;
    } catch { return dec.write(buf); }
  };
}

// Programs see a pipe, not a terminal, so they print no colour on their own: the environment (create) asks
// the ones that have a switch for it, and a posix shell gets these aliases (they expand inside the sourced
// script too). `dir` (ls -C -b) would print non-ASCII names as octal escapes — it lists like ls instead.
const POSIX_INIT = "shopt -s expand_aliases 2>/dev/null; if ls --color=always -d / >/dev/null 2>&1; then alias ls='ls --color=always'; alias dir='ls -C --color=always'; alias vdir='ls -l --color=always'; fi; alias grep='grep --color=always'; alias egrep='egrep --color=always'; alias fgrep='fgrep --color=always'; if diff --color=always /dev/null /dev/null >/dev/null 2>&1; then alias diff='diff --color=always'; fi; alias tree='tree -C'; alias ip='ip -c'";
// Colour switches of common tools (for the ones that do not honour FORCE_COLOR / CLICOLOR_FORCE).
const COLOR_ENV = { TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '1', CLICOLOR_FORCE: '1', CLICOLOR: '1', GIT_CONFIG_PARAMETERS: "'color.ui=always'", GIT_PAGER: 'cat', PAGER: 'cat', npm_config_color: 'always', PY_COLORS: '1', CARGO_TERM_COLOR: 'always', CMAKE_COLOR_DIAGNOSTICS: 'ON', GCC_COLORS: 'error=01;31:warning=01;35:note=01;36:caret=01;32:locus=01:quote=01', DOTNET_SYSTEM_CONSOLE_ALLOW_ANSI_COLOR_REDIRECTION: '1', GTEST_COLOR: '1', PYTEST_ADDOPTS: [process.env.PYTEST_ADDOPTS, '--color=yes'].filter(Boolean).join(' ') };
// A UTF-8 locale for the posix shells: with LANG=ko_KR (no charset) Git Bash writes file names in EUC-KR and
// the dock — reading UTF-8 — shows them broken; without any locale ls prints them as "?" or octal escapes.
const utf8Lang = () => { const l = process.env.LANG; return l && /utf-?8/i.test(l) ? l : 'C.UTF-8'; };

// The shells offered in the "+ ▾" menu. `ext` / `scriptEnc` / `bom` describe
// the script file a command is written to, `source(file)` the stdin line that
// runs it, `cwdLine` prints the marker — inside the script when `markerInFile`,
// else after `source` on the same stdin line — and `rcLine` (PowerShell) reads
// the exit status inside the script.
function shells() {
  const posixSource = (f) => `. "${f.replace(/\\/g, '/')}";`;
  if (process.platform === 'win32') {
    const cp = consoleCodePage();
    const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')];
    // PowerShell 5.1 writes the console's code page through a pipe; pwsh 7 is UTF-8 whatever the console is.
    const ps = (exe, enc) => ({
      cmd: exe, args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
      ext: '.ps1', scriptEnc: 'utf8', bom: enc !== 'utf8',
      source: (f) => `$__ccrc = 1; $global:LASTEXITCODE = 0; . "${f}";`,
      rcLine: '$__ccrc = if ($?) { 0 } else { 1 }; if ($__ccrc -and $LASTEXITCODE) { $__ccrc = $LASTEXITCODE }',
      cwdLine: `Write-Host "${MARK}$PWD;$__ccrc"`, eol: '\r\n', encoding: enc,
    });
    const list = [
      { id: 'powershell', label: 'PowerShell', ...ps('powershell.exe', cp) },
      // cmd prints a prompt before every read: PROMPT is a marker that is stripped (with the blank line cmd
      // always emits before it). The batch file holds the marker too (%ERRORLEVEL% expands when that line runs,
      // after the command). `(call )` first: it resets ERRORLEVEL, which cmd otherwise keeps from an earlier
      // command (echo, cd … do not touch it).
      { id: 'cmd', label: 'Command Prompt', cmd: 'cmd.exe', args: ['/Q', '/K', 'rem'], env: { PROMPT: PROMPT_MARK }, promptMark: true, ext: '.cmd', scriptEnc: cp, markerInFile: true, preLine: '(call )', source: (f) => `call "${f}"`, cwdLine: `echo ${MARK}%CD%;%ERRORLEVEL%`, eol: '\r\n', encoding: cp },
    ];
    const pwsh = firstExisting(pf.map((p) => p && path.join(p, 'PowerShell', '7', 'pwsh.exe')));
    if (pwsh) list.push({ id: 'pwsh', label: 'PowerShell 7', ...ps(pwsh, 'utf8') });
    const bash = firstExisting(pf.map((p) => p && path.join(p, 'Git', 'bin', 'bash.exe')));
    if (bash) list.push({ id: 'gitbash', label: 'Git Bash', cmd: bash, args: ['--norc', '-s'], ext: '.sh', scriptEnc: 'utf8', source: posixSource, cwdLine: `echo "${MARK}$PWD;$?"`, eol: '\n', init: POSIX_INIT });
    return list;
  }
  const sh = process.env.SHELL || '/bin/bash';
  const posix = (cmd) => ({ cmd, args: ['-s'], ext: '.sh', scriptEnc: 'utf8', source: posixSource, cwdLine: `echo "${MARK}$PWD;$?"`, eol: '\n', init: POSIX_INIT });
  const list = [{ id: 'default', label: path.basename(sh), ...posix(sh) }];
  if (sh !== '/bin/bash' && fs.existsSync('/bin/bash')) list.push({ id: 'bash', label: 'bash', ...posix('/bin/bash') });
  if (sh !== '/bin/zsh' && fs.existsSync('/bin/zsh')) list.push({ id: 'zsh', label: 'zsh', ...posix('/bin/zsh') });
  if (fs.existsSync('/bin/sh')) list.push({ id: 'sh', label: 'sh', ...posix('/bin/sh') });
  return list;
}

// eslint-disable-next-line no-control-regex
// Colours (SGR, "\x1b[…m") are kept for the dock to render; cursor movement, OSC titles and the like are
// dropped. A lone CR stays (the dock handles it — see the header). A sequence can arrive in two chunks: the
// stream is cleaned after joining, and an unfinished sequence at the end (ESC_TAIL) waits for its rest.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-lnp-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#%][@-~]|\x1b[^[\]()#%]|\ufeff/g;
const ESC_TAIL = /\x1b(?:\[[0-9;?]*[ -/]*|\][^\x07\x1b]{0,256}\x1b?|[()#%])?$/;
const MARK_RE = new RegExp(`${MARK}([^\\n]*)\\n`, 'g');
const PROMPT_RE = new RegExp(`\\n?${PROMPT_MARK}`, 'g');

function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode) return;
  if (process.platform === 'win32') {
    // /T takes the programs the shell started with it.
    execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => { try { proc.kill(); } catch { /* gone */ } });
  } else {
    try { proc.kill(); } catch { /* gone */ }
  }
}

// The repository a directory belongs to: the nearest ancestor holding .git (a directory, or a file in a
// worktree / submodule); null outside a repository.
function repoRoot(dir) {
  let d = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}
// Commands that cannot change a repository's state (cd, listings, viewers, read-only git) — every part of a
// compound line (&&, ||, ;, |) must be one; the prompt after them reuses the last git status.
const READ_ONLY = /^\s*(?:cd|chdir|pushd|popd|ls|ll|dir|pwd|echo|cat|type|less|more|head|tail|wc|clear|cls|tree|which|where|whoami|date|time|hostname|uname|ver|find|grep|rg|findstr|env|set|printenv|history|man|help|get-childitem|gci|get-content|gc|get-location|gl|set-location|sl|write-host|write-output|get-date|get-item|gi|select-string|sls|node\s+-v|npm\s+-v|python\s+--version|git\s+(?:status|log|diff|show|blame|shortlog|rev-parse|ls-files|branch\s*$|remote\s*(?:-v)?\s*$|config\s+--get|describe|tag\s*$))(?:\s|$)/i;
const isReadOnly = (line) => { const parts = String(line || '').split(/&&|\|\||;|\|/).map((p) => p.trim()).filter(Boolean); return parts.length > 0 && parts.every((p) => READ_ONLY.test(p)); };
const gitCache = new Map();   // repository root → { at, status }
const CACHE_MS = 60 * 1000;

// Git status of a directory, for the prompt — one `git status` process:
//   { repo:false } or { repo:true, branch, upstream, ahead, behind, staged, changed, untracked, conflicts, stashes }
function gitStatus(cwd) {
  return new Promise((resolve) => {
    if (!cwd || !fs.existsSync(cwd)) return resolve({ repo: false });
    // --ignore-submodules=dirty: files changed *inside* a submodule (build output, its own untracked files) do not
    // count — only a submodule pointing at another commit does; otherwise such a repository never shows clean.
    execFile('git', ['-C', cwd, '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '--show-stash', '--ignore-submodules=dirty'], { windowsHide: true, maxBuffer: 8 << 20 }, (err, out) => {
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
  // The git status for a prompt: the cache after a read-only command, a request already running for the
  // same directory and command (started when the marker arrived), or a fresh `git status`.
  const inflight = new Map();   // `${cwd}|${cmd}` → { at, promise }
  const gitFor = (cwd, cmd) => {
    const root = cwd ? repoRoot(cwd) : null;
    if (root && cmd !== undefined && isReadOnly(cmd)) {
      const c = gitCache.get(root);
      if (c && Date.now() - c.at < CACHE_MS) return Promise.resolve({ ...c.status, cached: true });
    }
    const key = `${cwd}|${cmd === undefined ? '' : cmd}`;
    const running = inflight.get(key);
    if (running && Date.now() - running.at < 3000) return running.promise;
    const promise = gitStatus(cwd).then((st) => { if (root && st && st.repo) gitCache.set(root, { at: Date.now(), status: st }); else if (root) gitCache.delete(root); return st; }).finally(() => { if (inflight.get(key) && inflight.get(key).promise === promise) inflight.delete(key); });
    inflight.set(key, { at: Date.now(), promise });
    return promise;
  };
  const prefetchGit = (cwd, cmd) => { gitFor(cwd, cmd).catch(() => {}); };
  let nextId = 1;

  // Readers waiting in read({ wait }) are woken on any change of the session.
  function wake(s) { const w = s.waiters; s.waiters = []; for (const f of w) f(); }
  function cleanup(s) { try { fs.unlinkSync(s.scriptFile); } catch { /* gone */ } }

  function push(s, text) {
    // Pull the cwd markers (and cmd's prompt marks) out of the stream;
    // everything else is output. A marker (and, for cmd, the blank line
    // before its prompt) may be split across chunks, so the tail that could
    // still become one is held back. A CR at the very end of a chunk is held
    // too: its LF may come with the next chunk.
    if (s.pendingCr) { text = '\r' + text; s.pendingCr = false; }
    if (text.endsWith('\r')) { text = text.slice(0, -1); s.pendingCr = true; }
    s.pending = (s.pending + text.replace(/\r\n/g, '\n')).replace(ANSI, '');
    const stripPrompts = (str) => (s.def.promptMark ? str.replace(PROMPT_RE, () => { s.expectPrompt = false; return ''; }) : str);
    let out = '';
    // A marker line ends the command: everything before it is complete output (flushed as it is), what
    // follows is cmd's next prompt mark (held back until it is whole — see below).
    let m;
    MARK_RE.lastIndex = 0;
    while ((m = MARK_RE.exec(s.pending))) {
      let d = m[1].trim();
      // "<dir>;<exit code>" — the status of the command, for the prompt's status segment.
      const semi = d.lastIndexOf(';');
      if (semi >= 0 && /^-?\d+$/.test(d.slice(semi + 1))) { s.rc = Number(d.slice(semi + 1)); d = d.slice(0, semi); }
      // Git Bash prints /d/Home/…; git and fs want D:/Home/…
      if (process.platform === 'win32') d = d.replace(/^\/([a-zA-Z])(\/|$)/, (_x, l) => `${l.toUpperCase()}:/`);
      s.cwd = d || s.cwd; s.idle = true; s.changed = true;
      prefetchGit(s.cwd, s.lastCmd);   // the prompt's git status starts now, not when the dock asks for it
      out += stripPrompts(s.pending.slice(0, m.index));
      s.pending = s.pending.slice(m.index + m[0].length);
      s.expectPrompt = !!s.def.promptMark;   // cmd prints "\n__CC_P__" before reading the next line
      MARK_RE.lastIndex = 0;
    }
    s.pending = stripPrompts(s.pending);
    const nl = s.pending.lastIndexOf('\n');
    const tail = s.pending.slice(nl + 1);
    let cut = s.pending.length;
    const couldBe = (mark) => tail.startsWith(mark) || mark.startsWith(tail);
    if (tail && (couldBe(MARK) || (s.def.promptMark && couldBe(PROMPT_MARK)))) cut = nl + 1;
    // The blank line cmd emits before a prompt mark, when the mark itself is still to come.
    if (s.def.promptMark && (!s.idle || s.expectPrompt) && cut > 0 && s.pending[cut - 1] === '\n') cut--;
    const esc = ESC_TAIL.exec(s.pending.slice(0, cut));
    if (esc && esc[0].length < 300) cut = esc.index;   // an escape sequence still coming (a long unterminated one is shown)
    const t = out + s.pending.slice(0, cut);
    s.pending = s.pending.slice(cut);
    if (!t) { if (s.changed) { s.changed = false; wake(s); } return; }
    s.seq++;
    s.chunks.push({ seq: s.seq, text: t });
    if (s.chunks.length > MAX_CHUNKS) s.chunks.splice(0, s.chunks.length - MAX_CHUNKS);
    s.changed = false;
    wake(s);
  }

  const api = {
    shells: () => shells().map(({ id, label }) => ({ id, label })),

    create({ cwd, shell } = {}) {
      const all = shells();
      const def = all.find((x) => x.id === shell) || all[0];
      let dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
      try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir); } catch { dir = os.homedir(); }
      const id = nextId++;
      const s = { id, shell: def.id, label: def.label, cwd: dir, chunks: [], seq: 0, pending: '', pendingCr: false, expectPrompt: !!def.promptMark, idle: true, rc: 0, waiters: [], changed: false, exited: false, code: null, def, proc: null };
      s.scriptFile = path.join(os.tmpdir(), `cc-term-${process.pid}-${id}${def.ext}`);
      const env = { ...process.env, ...COLOR_ENV, LANG: utf8Lang(), ...Object.fromEntries(['LC_ALL', 'LC_CTYPE'].filter((k) => process.env[k] && !/utf-?8/i.test(process.env[k])).map((k) => [k, utf8Lang()])), ...(def.env || {}) };
      const proc = spawn(def.cmd, def.args, { cwd: dir, stdio: 'pipe', windowsHide: true, env });
      s.proc = proc;
      const enc = def.encoding || 'utf8';
      s.enc = enc;
      const decOut = mixedDecoder(enc), decErr = mixedDecoder(enc);   // streaming: a multibyte character split across chunks survives
      proc.stdout.on('data', (d) => push(s, decOut(d)));
      proc.stderr.on('data', (d) => push(s, decErr(d)));
      proc.stdin.on('error', () => { /* the exit handler reports it */ });
      proc.on('error', (err) => { push(s, `\n[${err.message}]\n`); s.exited = true; cleanup(s); wake(s); });
      proc.on('exit', (code) => { s.exited = true; s.code = code; push(s, `\n[process exited with code ${code}]\n`); cleanup(s); wake(s); });
      if (def.init) { try { proc.stdin.write(iconv.encode(`${def.init}${def.eol}`, enc)); } catch { /* exited already */ } }   // aliases (posix) — prints nothing
      sessions.set(id, s);
      return { id, shell: s.shell, label: s.label, cwd: s.cwd };
    },

    // Raw text to the shell's stdin, without the cwd marker.
    write({ id, data }) {
      const s = sessions.get(id);
      if (!s || s.exited) return false;
      s.proc.stdin.write(iconv.encode(data, s.enc || 'utf8'));
      return true;
    },

    // Runs one command line (through the script file) and asks for the cwd
    // (and the exit status) afterwards. While a command is still running (no
    // marker yet) the line is input for that command and goes to stdin as it
    // is — ended with `eol` ('lf' | 'crlf'; settings › terminal) or, by
    // default, the shell's own.
    run({ id, line, eol }) {
      const s = sessions.get(id);
      if (!s || s.exited) return false;
      const { eol: shellEol, cwdLine, bom, markerInFile, source, rcLine, preLine, scriptEnc } = s.def;
      const send = (text) => s.proc.stdin.write(iconv.encode(text, s.enc || 'utf8'));
      if (!s.idle) { send(`${line}${eol === 'lf' ? '\n' : eol === 'crlf' ? '\r\n' : shellEol}`); return true; }
      s.idle = false;
      s.lastCmd = line;
      wake(s);   // readers see the busy phase, so the return to idle (the prompt, a fresh git status) is never missed
      // The command goes into the script file (with the exit-status / marker lines that belong there), the
      // stdin gets the one line that runs it — followed by the marker, unless the script prints it.
      const body = `${preLine ? `${preLine}${shellEol}` : ''}${line}${shellEol}${rcLine ? `${rcLine}${shellEol}` : ''}${markerInFile ? `${cwdLine}${shellEol}` : ''}`;
      const bytes = iconv.encode(body, scriptEnc || 'utf8');
      fs.writeFileSync(s.scriptFile, bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]) : bytes);
      send(`${source(s.scriptFile)}${markerInFile ? '' : ` ${cwdLine}`}${shellEol}`);
      return true;
    },

    // Long poll: with `wait` (ms) and nothing new since `since` / the given
    // idle state, the answer is held back until something changes, so the
    // dock shows output and the prompt the moment they happen.
    async read({ id, since = 0, idle, wait = 0 }) {
      const s = sessions.get(id);
      if (!s) return null;
      const snapshot = () => ({ id, chunks: since ? s.chunks.filter((c) => c.seq > since) : s.chunks, seq: s.seq, cwd: s.cwd, idle: s.idle, exited: s.exited, code: s.code, rc: s.rc });
      const fresh = () => s.seq > since || (idle !== undefined && s.idle !== idle) || s.exited;
      if (!wait || fresh()) return snapshot();
      await new Promise((resolve) => { const t = setTimeout(resolve, Math.min(wait, 5000)); s.waiters.push(() => { clearTimeout(t); resolve(); }); });
      return snapshot();
    },

    kill({ id }) {
      const s = sessions.get(id);
      if (!s) return false;
      killTree(s.proc);
      cleanup(s);
      sessions.delete(id);
      wake(s);
      return true;
    },

    list: () => [...sessions.values()].map((s) => ({ id: s.id, shell: s.shell, label: s.label, cwd: s.cwd, idle: s.idle, exited: s.exited })),

    // Git status of a directory, for the prompt.
    //
    // `cmd` is the command that just ran (for the prompt after it). `git status` scans the whole working
    // tree (~0.2 s here, more in a big repository), so it is not run again when the command could not have
    // changed the repository — a read-only command (cd, ls, cat, git log …) — and a status of the same
    // repository is at hand: the prompt then comes up at once. Anything else (or an unknown command) runs
    // git afresh. The cache is per repository root and forgotten after CACHE_MS regardless.
    git: ({ cwd, cmd }) => gitFor(cwd, cmd),
    gitFresh: ({ cwd }) => gitStatus(cwd),

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
      for (const s of sessions.values()) { killTree(s.proc); cleanup(s); wake(s); }
      sessions.clear();
    },
  };
  return api;
}

module.exports = { createTerminals, MARK, isReadOnly, repoRoot };
