// Terminal sessions for the terminal panel: a shell process per tab with
// piped stdio (no pseudo-terminal), so it behaves like a line-oriented
// console — commands typed in the panel are written to the shell's stdin,
// output is buffered and fetched by the UI (`term.read`, polled). Works the
// same in the desktop app and the web version.
//
// After every command a marker line (`__MED_CWD__:<dir>`) is requested so
// the panel knows the shell's current directory (for the git status line);
// the marker is stripped from the output.
'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARK = '__MED_CWD__:';
const MAX_CHUNKS = 4000;

function shells() {
  if (process.platform === 'win32') {
    const list = [
      { id: 'cmd', label: 'Command Prompt', cmd: 'cmd.exe', args: ['/Q', '/K', 'chcp 65001>nul'], cwdLine: `echo ${MARK}%CD%`, eol: '\r\n' },
      { id: 'powershell', label: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo', '-NoProfile'], cwdLine: `Write-Host "${MARK}$PWD"`, eol: '\r\n' },
    ];
    for (const p of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      const bash = p && path.join(p, 'Git', 'bin', 'bash.exe');
      if (bash && fs.existsSync(bash)) { list.push({ id: 'gitbash', label: 'Git Bash', cmd: bash, args: ['--norc', '-s'], cwdLine: `echo "${MARK}$PWD"`, eol: '\n' }); break; }
    }
    return list;
  }
  const sh = process.env.SHELL || '/bin/bash';
  const list = [{ id: 'default', label: path.basename(sh), cmd: sh, args: ['-s'], cwdLine: `echo "${MARK}$PWD"`, eol: '\n' }];
  if (sh !== '/bin/bash' && fs.existsSync('/bin/bash')) list.push({ id: 'bash', label: 'bash', cmd: '/bin/bash', args: ['-s'], cwdLine: `echo "${MARK}$PWD"`, eol: '\n' });
  if (fs.existsSync('/bin/sh')) list.push({ id: 'sh', label: 'sh', cmd: '/bin/sh', args: ['-s'], cwdLine: `echo "${MARK}$PWD"`, eol: '\n' });
  return list;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\r(?!\n)/g;

function createTerminals() {
  const sessions = new Map();
  let nextId = 1;

  function push(s, text) {
    // Pull the cwd markers out of the stream; everything else is output.
    let t = text.replace(ANSI, '');
    const re = new RegExp(`${MARK}([^\\r\\n]*)\\r?\\n?`, 'g');
    t = t.replace(re, (_m, dir) => { s.cwd = dir.trim() || s.cwd; return ''; });
    if (!t) return;
    s.seq++;
    s.chunks.push({ seq: s.seq, text: t });
    if (s.chunks.length > MAX_CHUNKS) s.chunks.splice(0, s.chunks.length - MAX_CHUNKS);
  }

  return {
    shells: () => shells().map(({ id, label }) => ({ id, label })),

    create({ cwd, shell } = {}) {
      const all = shells();
      const def = all.find((x) => x.id === shell) || all[0];
      let dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
      try { if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir); } catch { dir = os.homedir(); }
      const id = nextId++;
      const s = { id, shell: def.id, label: def.label, cwd: dir, chunks: [], seq: 0, exited: false, code: null, def, proc: null };
      const proc = spawn(def.cmd, def.args, { cwd: dir, stdio: 'pipe', windowsHide: true, env: { ...process.env, TERM: 'dumb', GIT_PAGER: 'cat', PAGER: 'cat', LANG: process.env.LANG || 'C.UTF-8' } });
      s.proc = proc;
      proc.stdout.on('data', (d) => push(s, d.toString('utf8')));
      proc.stderr.on('data', (d) => push(s, d.toString('utf8')));
      proc.on('error', (err) => { push(s, `\n[${err.message}]\n`); s.exited = true; });
      proc.on('exit', (code) => { s.exited = true; s.code = code; push(s, `\n[process exited with code ${code}]\n`); });
      sessions.set(id, s);
      return { id, shell: s.shell, label: s.label, cwd: s.cwd };
    },

    write({ id, data }) {
      const s = sessions.get(id);
      if (!s || s.exited) return false;
      s.proc.stdin.write(data);
      return true;
    },

    // Runs one command line and asks for the cwd afterwards.
    run({ id, line }) {
      const s = sessions.get(id);
      if (!s || s.exited) return false;
      const eol = s.def.eol;
      s.proc.stdin.write(`${line}${eol}${s.def.cwdLine}${eol}`);
      return true;
    },

    read({ id, since = 0 }) {
      const s = sessions.get(id);
      if (!s) return null;
      const chunks = since ? s.chunks.filter((c) => c.seq > since) : s.chunks;
      return { id, chunks, seq: s.seq, cwd: s.cwd, exited: s.exited, code: s.code };
    },

    kill({ id }) {
      const s = sessions.get(id);
      if (!s) return false;
      try { s.proc.kill(); } catch { /* already gone */ }
      sessions.delete(id);
      return true;
    },

    list: () => [...sessions.values()].map((s) => ({ id: s.id, shell: s.shell, label: s.label, cwd: s.cwd, exited: s.exited })),

    // Git status of a directory: { repo:false } or { repo:true, root, branch, upstream, ahead, behind, staged, changed, untracked, conflicts }
    git({ cwd }) {
      return new Promise((resolve) => {
        if (!cwd || !fs.existsSync(cwd)) return resolve({ repo: false });
        execFile('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { windowsHide: true }, (err, top) => {
          if (err) return resolve({ repo: false, error: /not a git repository/i.test(String(err.message)) ? null : err.message });
          execFile('git', ['-C', cwd, 'status', '--porcelain=v2', '--branch'], { windowsHide: true, maxBuffer: 8 << 20 }, (err2, out) => {
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

    shutdown() {
      for (const s of sessions.values()) { try { s.proc.kill(); } catch { /* gone */ } }
      sessions.clear();
    },
  };
}

module.exports = { createTerminals };
