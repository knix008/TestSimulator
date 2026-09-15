// Terminal sessions for the terminal panel: a shell process per tab with
// piped stdio (no pseudo-terminal), so it behaves like a line-oriented
// console — commands typed in the panel are written to the shell's stdin,
// output is buffered and fetched by the UI (`term.read`, polled). Works the
// same in the desktop app and the web version.
//
// The shells are started so that they print neither a prompt nor an echo of
// the command (cmd: /Q and a PROMPT made of the marker below, PowerShell:
// -Command -, bash: -s): the panel draws the prompt itself, at the end of the
// output, and types the command there. After every command a marker line
// (`__MED_CWD__:<dir>`) arrives — printed by cmd as its prompt, requested
// with an extra echo for the other shells — which tells the panel the shell's
// current directory and that the shell is idle again (prompt shown); the
// marker is stripped from the output.
'use strict';

const { spawn, execFile, execFileSync } = require('child_process');
const iconv = require('iconv-lite');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARK = '__MED_CWD__:';
const MAX_CHUNKS = 4000;

// Tab completion (the shells run without a terminal, so the panel completes
// by itself): the first word of a command is completed from these builtins
// plus the executables on PATH (scanned once), every word from the files in
// the directory it names.
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

// A non-interactive sh / bash / zsh exits on a syntax error; run through
// eval the error is reported and the shell goes on (cd, variables … still
// affect the shell, as eval runs in it).
const shWrap = (line) => `eval '${line.replace(/'/g, "'\\''")}'`;

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

function shells() {
  if (process.platform === 'win32') {
    const list = [
      // cmd prints the marker itself as its prompt (preceded by the blank line cmd always emits before a prompt).
      // cmd and PowerShell read and write the console's code page (CP949 on a Korean Windows …): the text is
      // converted both ways (see consoleCodePage). cmd with code page 65001 dies on multibyte input from a
      // pipe, so it is left at the native code page.
      { id: 'cmd', label: 'Command Prompt', cmd: 'cmd.exe', args: ['/Q', '/K', 'rem'], env: { PROMPT: `${MARK}$P$_` }, cwdLine: '', blankBeforeMark: true, eol: '\r\n', encoding: consoleCodePage() },
      { id: 'powershell', label: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command', '-'], cwdLine: `Write-Host "${MARK}$PWD"`, eol: '\r\n', encoding: consoleCodePage() },
    ];
    for (const p of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      const bash = p && path.join(p, 'Git', 'bin', 'bash.exe');
      if (bash && fs.existsSync(bash)) { list.push({ id: 'gitbash', label: 'Git Bash', cmd: bash, args: ['--norc', '-s'], cwdLine: `echo "${MARK}$PWD"`, eol: '\n', wrap: shWrap }); break; }
    }
    return list;
  }
  const sh = process.env.SHELL || '/bin/bash';
  const list = [{ id: 'default', label: path.basename(sh), cmd: sh, args: ['-s'], cwdLine: `echo "${MARK}$PWD"`, eol: '\n', wrap: shWrap }];
  if (sh !== '/bin/bash' && fs.existsSync('/bin/bash')) list.push({ id: 'bash', label: 'bash', cmd: '/bin/bash', args: ['-s'], cwdLine: `echo "${MARK}$PWD"`, eol: '\n', wrap: shWrap });
  if (fs.existsSync('/bin/sh')) list.push({ id: 'sh', label: 'sh', cmd: '/bin/sh', args: ['-s'], cwdLine: `echo "${MARK}$PWD"`, eol: '\n', wrap: shWrap });
  return list;
}

// eslint-disable-next-line no-control-regex
// Colours (SGR, "\x1b[…m") are kept for the panel to render; cursor movement, OSC titles and the like are dropped.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-lnp-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[^[\]]|\r(?!\n)/g;
const MARK_RE = new RegExp(`${MARK}([^\\n]*)\\n`, 'g');
const BLANK_MARK_RE = new RegExp(`\\n?${MARK}([^\\n]*)\\n`, 'g');

function createTerminals() {
  const sessions = new Map();
  let nextId = 1;

  // Readers waiting in read({ wait }) are woken on any change of the session.
  function wake(s) { const w = s.waiters; s.waiters = []; for (const f of w) f(); }

  function push(s, text) {
    // Pull the cwd markers out of the stream; everything else is output. A
    // marker (and, for cmd, the blank line before it) may be split across
    // chunks, so the tail that could still become one is held back.
    s.pending += text.replace(/\r\n/g, '\n').replace(ANSI, '');
    s.pending = s.pending.replace(s.def.blankBeforeMark ? BLANK_MARK_RE : MARK_RE, (_m, dir) => { let d = dir.trim(); if (process.platform === 'win32') d = d.replace(/^\/([a-zA-Z])(\/|$)/, (_x, l) => `${l.toUpperCase()}:/`); s.cwd = d || s.cwd; s.idle = true; s.changed = true; return ''; });
    const nl = s.pending.lastIndexOf('\n');
    const tail = s.pending.slice(nl + 1);
    let cut = s.pending.length;
    if (tail && (tail.startsWith(MARK) || MARK.startsWith(tail))) cut = nl + 1;
    if (s.def.blankBeforeMark && !s.idle && cut > 0 && s.pending[cut - 1] === '\n') cut--;   // the blank line before the marker still to come
    const t = s.pending.slice(0, cut);
    s.pending = s.pending.slice(cut);
    if (!t) { if (s.changed) { s.changed = false; wake(s); } return; }
    s.seq++;
    s.chunks.push({ seq: s.seq, text: t });
    if (s.chunks.length > MAX_CHUNKS) s.chunks.splice(0, s.chunks.length - MAX_CHUNKS);
    s.changed = false;
    wake(s);
  }

  return {
    shells: () => shells().map(({ id, label }) => ({ id, label })),

    create({ cwd, shell } = {}) {
      const all = shells();
      const def = all.find((x) => x.id === shell) || all[0];
      let dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
      try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir); } catch { dir = os.homedir(); }
      const id = nextId++;
      const s = { id, shell: def.id, label: def.label, cwd: dir, chunks: [], seq: 0, pending: '', idle: !!def.cwdLine, waiters: [], changed: false, exited: false, code: null, def, proc: null };
      const proc = spawn(def.cmd, def.args, { cwd: dir, stdio: 'pipe', windowsHide: true, env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '1', CLICOLOR_FORCE: '1', GIT_CONFIG_PARAMETERS: "'color.ui=always'", GIT_PAGER: 'cat', PAGER: 'cat', LANG: process.env.LANG || 'C.UTF-8', ...(def.env || {}) } });
      s.proc = proc;
      const enc = def.encoding || 'utf8';
      s.enc = enc;
      const decOut = iconv.getDecoder(enc), decErr = iconv.getDecoder(enc);   // streaming: a multibyte character split across chunks survives
      proc.stdout.on('data', (d) => push(s, decOut.write(d)));
      proc.stderr.on('data', (d) => push(s, decErr.write(d)));
      proc.on('error', (err) => { push(s, `\n[${err.message}]\n`); s.exited = true; });
      proc.on('exit', (code) => { s.exited = true; s.code = code; push(s, `\n[process exited with code ${code}]\n`); wake(s); });
      sessions.set(id, s);
      return { id, shell: s.shell, label: s.label, cwd: s.cwd };
    },

    write({ id, data }) {
      const s = sessions.get(id);
      if (!s || s.exited) return false;
      s.proc.stdin.write(iconv.encode(data, s.enc || 'utf8'));
      return true;
    },

    // Runs one command line and asks for the cwd afterwards. While a command
    // is still running (no marker yet) the line is input for that command and
    // goes to stdin as it is.
    run({ id, line }) {
      const s = sessions.get(id);
      if (!s || s.exited) return false;
      const eol = s.def.eol;
      const send = (text) => s.proc.stdin.write(iconv.encode(text, s.enc || 'utf8'));
      if (!s.idle) { send(`${line}${eol}`); return true; }
      s.idle = false;
      const cmd = line.trim() && s.def.wrap ? s.def.wrap(line) : line;
      send(`${cmd}${eol}${s.def.cwdLine ? s.def.cwdLine + eol : ''}`);
      return true;
    },

    // Long poll: with `wait` (ms) and nothing new since `since` / the given
    // idle state, the answer is held back until something changes, so the
    // panel shows output and the prompt the moment they happen.
    async read({ id, since = 0, idle, wait = 0 }) {
      const s = sessions.get(id);
      if (!s) return null;
      const snapshot = () => ({ id, chunks: since ? s.chunks.filter((c) => c.seq > since) : s.chunks, seq: s.seq, cwd: s.cwd, idle: s.idle, exited: s.exited, code: s.code });
      const fresh = () => s.seq > since || (idle !== undefined && s.idle !== idle) || s.exited;
      if (!wait || fresh()) return snapshot();
      await new Promise((resolve) => { const t = setTimeout(resolve, Math.min(wait, 5000)); s.waiters.push(() => { clearTimeout(t); resolve(); }); });
      return snapshot();
    },

    kill({ id }) {
      const s = sessions.get(id);
      if (!s) return false;
      try { s.proc.kill(); } catch { /* already gone */ }
      wake(s);
      sessions.delete(id);
      return true;
    },

    list: () => [...sessions.values()].map((s) => ({ id: s.id, shell: s.shell, label: s.label, cwd: s.cwd, idle: s.idle, exited: s.exited })),

    // Git status of a directory: { repo:false } or { repo:true, root, branch, upstream, ahead, behind, staged, changed, untracked, conflicts }
    git({ cwd }) {
      return new Promise((resolve) => {
        if (!cwd || !fs.existsSync(cwd)) return resolve({ repo: false });
        execFile('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { windowsHide: true }, (err, top) => {
          if (err) return resolve({ repo: false, error: /not a git repository/i.test(String(err.message)) ? null : err.message });
          execFile('git', ['-C', cwd, '--no-optional-locks', 'status', '--porcelain=v2', '--branch'], { windowsHide: true, maxBuffer: 8 << 20 }, (err2, out) => {
            if (err2) return resolve({ repo: true, root: top.trim(), error: err2.message });
            const st = { repo: true, root: top.trim(), branch: '', upstream: '', ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, files: [] };
            for (const line of String(out).split('\n')) {
              if (!line) continue;
              if (line.startsWith('# branch.head ')) st.branch = line.slice(14).trim();
              else if (line.startsWith('# branch.upstream ')) st.upstream = line.slice(18).trim();
              else if (line.startsWith('# branch.ab ')) { const m = line.match(/\+(\d+) -(\d+)/); if (m) { st.ahead = Number(m[1]); st.behind = Number(m[2]); } }
              else if (line[0] === '1' || line[0] === '2') {
                const xy = line.slice(2, 4);
                if (xy[0] !== '.') st.staged++;
                if (xy[1] !== '.') st.changed++;
                const p = line[0] === '1' ? line.split(' ').slice(8).join(' ') : line.split('\t')[0].split(' ').slice(9).join(' ');
                st.files.push({ status: xy, path: p });
              } else if (line[0] === 'u') { st.conflicts++; st.files.push({ status: 'UU', path: line.split(' ').slice(10).join(' ') }); }
              else if (line[0] === '?') { st.untracked++; st.files.push({ status: '??', path: line.slice(2) }); }
            }
            st.files = st.files.slice(0, 200);
            resolve(st);
          });
        });
      });
    },

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
      const sep = sepIdx >= 0 ? word[sepIdx] : (s.shell === 'cmd' || s.shell === 'powershell' ? '\\' : '/');
      const match = (name) => fold(name).startsWith(fold(prefix));
      const items = [];
      if (firstWord && sepIdx < 0) {
        const kind = s.shell === 'cmd' ? 'cmd' : s.shell === 'powershell' ? 'powershell' : 'sh';
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
      for (const s of sessions.values()) { try { s.proc.kill(); } catch { /* gone */ } }
      sessions.clear();
    },
  };
}

module.exports = { createTerminals };
