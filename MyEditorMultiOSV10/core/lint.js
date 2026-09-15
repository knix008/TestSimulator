// Linting: runs the usual checker of a language on the document text and
// returns its findings as { line, col, endLine, endCol, severity, message,
// source }. The text is piped through stdin wherever the tool allows it (so
// the unsaved buffer is checked, and nothing is written next to the file);
// the few tools that need a file get a copy in the OS temp directory.
//
// Every tool is optional: the first one found in the project's
// node_modules/.bin (walking up from the file) or on PATH is used, and when
// none is installed the result says so (`tool: null`). Availability is
// cached per session. A run replaces the still-running one of the same
// document (typing keeps only the latest check), and is killed after 30 s.
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TIMEOUT = 30000;
const MAX_TEXT = 2 * 1024 * 1024;

// ── finding an executable ──
const exeCache = new Map();   // "name|dir" → full path | null
function onPath(name) {
  const key = `path|${name}`;
  if (exeCache.has(key)) return exeCache.get(key);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  let found = null;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, name + ext.toLowerCase());
      if (fs.existsSync(p)) { found = p; break; }
      if (process.platform === 'win32' && fs.existsSync(path.join(dir, name + ext))) { found = path.join(dir, name + ext); break; }
    }
    if (found) break;
  }
  exeCache.set(key, found);
  return found;
}
// npm tools: the project's own copy first (node_modules/.bin, walking up from the file's folder).
function npmTool(name, dir) {
  const key = `npm|${name}|${dir || ''}`;
  if (exeCache.has(key)) return exeCache.get(key);
  let found = null;
  let d = dir;
  while (d) {
    const bin = path.join(d, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
    if (fs.existsSync(bin)) { found = bin; break; }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  found = found || onPath(name);
  exeCache.set(key, found);
  return found;
}

// ── running a tool ──
function exec(cmd, args, { cwd, input, timeout = TIMEOUT, signal, env } = {}) {
  return new Promise((resolve) => {
    let proc;
    const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
    try {
      proc = spawn(shell ? `"${cmd}"` : cmd, shell ? args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args, { cwd: cwd || undefined, stdio: 'pipe', windowsHide: true, shell, env: env || process.env });
    } catch (err) { resolve({ code: -1, stdout: '', stderr: String(err.message), error: err.message }); return; }
    let stdout = '', stderr = '';
    let done = false;
    const finish = (code, error) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, stdout, stderr, error }); };
    const timer = setTimeout(() => { try { proc.kill(); } catch { /* gone */ } finish(-1, 'timeout'); }, timeout);
    if (signal) signal.kill = () => { try { proc.kill(); } catch { /* gone */ } finish(-1, 'cancelled'); };
    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    proc.on('error', (err) => finish(-1, err.message));
    proc.on('close', (code) => finish(code == null ? -1 : code));
    if (input != null) { proc.stdin.on('error', () => {}); proc.stdin.end(input, 'utf8'); } else proc.stdin.end();
  });
}

// A temp copy for tools that cannot read stdin.
async function withTempFile(name, text, fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'med-lint-'));
  const file = path.join(dir, name || 'file.txt');
  try { await fs.promises.writeFile(file, text, 'utf8'); return await fn(file, dir); } finally { fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

const sev = (s) => (/err|fatal|E\d|F\d/i.test(String(s)) ? 'error' : /warn|W\d/i.test(String(s)) ? 'warning' : 'info');
const num = (v, d = 1) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const D = (line, col, message, severity = 'error', extra = {}) => ({ line: num(line), col: num(col), message: String(message || '').trim(), severity, ...extra });
// "file:line:col: message" / "file:line: message" lines (gcc, gofmt, ruby, php …)
function parseColon(out, { file = '', severityOf = () => 'error', skip = () => false } = {}) {
  const res = [];
  for (const raw of String(out).split(/\r?\n/)) {
    const m = raw.match(/^(.*?):(\d+):(?:(\d+):)?\s*(?:(fatal error|error|warning|note|info)\s*:?\s*)?(.*)$/i);
    if (!m || skip(raw)) continue;
    if (file && m[1] && !/<stdin>|<standard input>|^-$|Standard input/i.test(m[1]) && path.basename(m[1]) !== path.basename(file) && m[1] !== file) continue;
    const kind = m[4] ? m[4].toLowerCase() : '';
    if (kind === 'note') continue;
    res.push(D(m[2], m[3] || 1, m[5], kind ? (kind === 'warning' ? 'warning' : kind === 'info' ? 'info' : 'error') : severityOf(raw)));
  }
  return res;
}

// Offset of the first error in a JSON text (a strict recursive-descent scan).
function jsonErrorOffset(text) {
  let i = 0;
  const n = text.length;
  const fail = (at) => { throw at; };
  const ws = () => { while (i < n && /[ \t\r\n]/.test(text[i])) i++; };
  const value = () => {
    ws();
    if (i >= n) fail(i);
    const c = text[i];
    if (c === '{') { i++; ws(); if (text[i] === '}') { i++; return; } for (;;) { ws(); if (text[i] !== '"') fail(i); string(); ws(); if (text[i] !== ':') fail(i); i++; value(); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === '}') { i++; return; } fail(i); } }
    if (c === '[') { i++; ws(); if (text[i] === ']') { i++; return; } for (;;) { value(); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === ']') { i++; return; } fail(i); } }
    if (c === '"') { string(); return; }
    const m = /^(-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 64));
    if (!m) fail(i);
    i += m[0].length;
  };
  const string = () => { i++; while (i < n) { const c = text[i]; if (c === '"') { i++; return; } if (c === '\\') { i += 2; continue; } if (c === '\n') fail(i); i++; } fail(n); };
  try { value(); ws(); if (i < n) fail(i); } catch (at) { return typeof at === 'number' ? Math.min(at, n) : 0; }
  return 0;
}

// ── the linters, by language name (as CodeMirror's language-data calls them) ──
const LINTERS = {
  async JavaScript(ctx) { return eslintOrNode(ctx); },
  async JSX(ctx) { return eslintOrNode(ctx); },
  async TypeScript(ctx) { return eslintOnly(ctx); },
  async TSX(ctx) { return eslintOnly(ctx); },

  async Python({ text, file, dir, signal }) {
    const ruff = onPath('ruff');
    if (ruff) {
      const r = await exec(ruff, ['check', '--output-format', 'json', '--stdin-filename', file || 'stdin.py', '-'], { cwd: dir, input: text, signal });
      if (r.error) return { tool: 'ruff', error: r.error };
      let list = [];
      try { list = JSON.parse(r.stdout || '[]'); } catch { return { tool: 'ruff', error: r.stderr.trim() || 'unreadable output' }; }
      return { tool: 'ruff', diagnostics: list.map((d) => D(d.location && d.location.row, d.location && d.location.column, `${d.message}${d.code ? ` (${d.code})` : ''}`, /^E9|^F(63|7|82)/.test(d.code || '') ? 'error' : 'warning', { endLine: d.end_location && d.end_location.row, endCol: d.end_location && d.end_location.column, source: d.code })) };
    }
    const flakes = onPath('pyflakes');
    const py = onPath('python') || onPath('python3') || onPath('py');
    if (flakes || py) {
      // pyflakes reads stdin when given no file.
      const r = flakes ? await exec(flakes, [], { cwd: dir, input: text, signal }) : await exec(py, ['-m', 'pyflakes'], { cwd: dir, input: text, signal });
      if (!r.error && !/No module named/i.test(r.stderr)) return { tool: 'pyflakes', diagnostics: parseColon(r.stdout + '\n' + r.stderr, { severityOf: (l) => (/undefined name|invalid syntax|SyntaxError|unexpected indent/i.test(l) ? 'error' : 'warning') }) };
    }
    if (py) {
      // Syntax only.
      const r = await exec(py, ['-c', 'import sys,ast\ntry:\n ast.parse(sys.stdin.read(), sys.argv[1] if len(sys.argv)>1 else "<stdin>")\nexcept SyntaxError as e:\n print(f"{e.lineno or 1}:{e.offset or 1}: {e.msg}")', file || 'stdin.py'], { cwd: dir, input: text, signal });
      if (r.error) return { tool: 'python', error: r.error };
      return { tool: 'python', diagnostics: parseColon(r.stdout.split('\n').map((l) => (l.trim() ? `x:${l}` : '')).join('\n')) };
    }
    return { tool: null };
  },

  async JSON({ text }) {
    try { JSON.parse(text); return { tool: 'json', diagnostics: [] }; } catch (e) {
      // JSON.parse does not tell where; a small scanner finds the offset.
      const pos = jsonErrorOffset(text);
      const before = text.slice(0, pos);
      return { tool: 'json', diagnostics: [D(before.split('\n').length, pos - before.lastIndexOf('\n'), e.message.replace(/^JSON\.parse: /, ''))] };
    }
  },

  async YAML({ text, dir, signal }) {
    const yl = onPath('yamllint');
    if (!yl) return { tool: null };
    const r = await exec(yl, ['-f', 'parsable', '-'], { cwd: dir, input: text, signal });
    if (r.error) return { tool: 'yamllint', error: r.error };
    return { tool: 'yamllint', diagnostics: parseColon(r.stdout, { severityOf: (l) => (/\[error\]/.test(l) ? 'error' : 'warning') }).map((d) => ({ ...d, message: d.message.replace(/^\[(error|warning)\]\s*/, '') })) };
  },

  async Shell({ text, file, dir, signal }) {
    const sc = onPath('shellcheck');
    if (!sc) return { tool: null };
    const r = await exec(sc, ['-f', 'json', ...(file && /\.(bash|zsh|ksh)$/.test(file) ? ['-s', path.extname(file).slice(1)] : []), '-'], { cwd: dir, input: text, signal });
    if (r.error) return { tool: 'shellcheck', error: r.error };
    let list = [];
    try { list = JSON.parse(r.stdout || '[]'); } catch { return { tool: 'shellcheck', error: r.stderr.trim() || 'unreadable output' }; }
    return { tool: 'shellcheck', diagnostics: list.map((d) => D(d.line, d.column, `${d.message} (SC${d.code})`, d.level === 'error' ? 'error' : d.level === 'warning' ? 'warning' : 'info', { endLine: d.endLine, endCol: d.endColumn, source: `SC${d.code}` })) };
  },

  async PowerShell({ text, dir, signal }) {
    const ps = onPath('pwsh') || onPath('powershell');
    if (!ps) return { tool: null };
    const script = '$s=[Console]::In.ReadToEnd(); if (-not (Get-Module -ListAvailable PSScriptAnalyzer)) { Write-Output "__NO_PSSA__"; exit 0 }; $r = Invoke-ScriptAnalyzer -ScriptDefinition $s; $r | Select-Object Line,Column,Severity,Message,RuleName | ConvertTo-Json -Compress';
    const r = await exec(ps, ['-NoProfile', '-NonInteractive', '-Command', script], { cwd: dir, input: text, signal, timeout: 60000 });
    if (r.error) return { tool: 'PSScriptAnalyzer', error: r.error };
    if (/__NO_PSSA__/.test(r.stdout)) return { tool: null };
    let list = [];
    try { const j = JSON.parse(r.stdout.trim() || '[]'); list = Array.isArray(j) ? j : [j]; } catch { return { tool: 'PSScriptAnalyzer', error: r.stderr.trim() || 'unreadable output' }; }
    return { tool: 'PSScriptAnalyzer', diagnostics: list.filter(Boolean).map((d) => D(d.Line, d.Column, `${d.Message} (${d.RuleName})`, d.Severity === 3 || d.Severity === 'ParseError' || d.Severity === 'Error' ? 'error' : d.Severity === 'Information' || d.Severity === 0 ? 'info' : 'warning', { source: d.RuleName })) };
  },

  async C(ctx) { return cLike(ctx, 'c'); },
  async 'C++'(ctx) { return cLike(ctx, 'c++'); },

  async Go({ text, dir, signal }) {
    const gofmt = onPath('gofmt');
    if (!gofmt) return { tool: null };
    const r = await exec(gofmt, ['-e', '-l'], { cwd: dir, input: text, signal });
    if (r.error) return { tool: 'gofmt', error: r.error };
    return { tool: 'gofmt', diagnostics: parseColon(r.stderr) };
  },

  async PHP({ text, dir, signal }) {
    const php = onPath('php');
    if (!php) return { tool: null };
    const r = await exec(php, ['-l', '-d', 'display_errors=stderr'], { cwd: dir, input: text, signal });
    if (r.error) return { tool: 'php -l', error: r.error };
    const out = r.stdout + '\n' + r.stderr;
    const diags = [];
    for (const m of out.matchAll(/(?:Parse|Fatal) error:\s*(.*?) in (?:Standard input code|-|.*?) on line (\d+)/g)) diags.push(D(m[2], 1, m[1]));
    return { tool: 'php -l', diagnostics: diags };
  },

  async Ruby({ text, file, dir, signal }) {
    const rc = onPath('rubocop');
    if (rc) {
      const r = await exec(rc, ['--format', 'json', '--stdin', file || 'stdin.rb'], { cwd: dir, input: text, signal });
      if (!r.error) {
        try { const j = JSON.parse(r.stdout); const off = (j.files && j.files[0] && j.files[0].offenses) || []; return { tool: 'rubocop', diagnostics: off.map((o) => D(o.location.start_line || o.location.line, o.location.start_column || o.location.column, `${o.message} (${o.cop_name})`, /error|fatal/i.test(o.severity) ? 'error' : o.severity === 'warning' ? 'warning' : 'info', { endLine: o.location.last_line, endCol: o.location.last_column, source: o.cop_name })) }; } catch { /* fall back */ }
      }
    }
    const ruby = onPath('ruby');
    if (!ruby) return { tool: null };
    const r = await exec(ruby, ['-c', '-w'], { cwd: dir, input: text, signal });
    if (r.error) return { tool: 'ruby -c', error: r.error };
    return { tool: 'ruby -c', diagnostics: parseColon(r.stderr, { severityOf: (l) => (/warning/i.test(l) ? 'warning' : 'error') }).map((d) => ({ ...d, message: d.message.replace(/^warning:\s*/i, '') })) };
  },

  async Dockerfile({ text, dir, signal }) {
    const hl = onPath('hadolint');
    if (!hl) return { tool: null };
    const r = await exec(hl, ['-f', 'json', '-'], { cwd: dir, input: text, signal });
    if (r.error) return { tool: 'hadolint', error: r.error };
    let list = [];
    try { list = JSON.parse(r.stdout || '[]'); } catch { return { tool: 'hadolint', error: 'unreadable output' }; }
    return { tool: 'hadolint', diagnostics: list.map((d) => D(d.line, d.column, `${d.message} (${d.code})`, d.level === 'error' ? 'error' : d.level === 'warning' ? 'warning' : 'info', { source: d.code })) };
  },

  async Markdown({ text, file, dir, signal }) {
    const ml = npmTool('markdownlint', dir);
    if (!ml) return { tool: null };
    const r = await exec(ml, ['--stdin', '--json'], { cwd: dir, input: text, signal });
    if (r.error) return { tool: 'markdownlint', error: r.error };
    let list = [];
    try { list = JSON.parse(r.stderr.trim() || r.stdout.trim() || '[]'); } catch { return { tool: 'markdownlint', diagnostics: [] }; }
    return { tool: 'markdownlint', diagnostics: list.map((d) => D(d.lineNumber, d.errorRange ? d.errorRange[0] : 1, `${d.ruleDescription}${d.errorDetail ? `: ${d.errorDetail}` : ''} (${d.ruleNames[0]})`, 'warning', { endCol: d.errorRange ? d.errorRange[0] + d.errorRange[1] : undefined, source: d.ruleNames[0] })) };
  },

  async CSS(ctx) { return stylelint(ctx); },
  async SCSS(ctx) { return stylelint(ctx); },
  async LESS(ctx) { return stylelint(ctx); },

  async Java({ text, file, dir, name, signal }) {
    const javac = onPath('javac');
    if (!javac) return { tool: null };
    return withTempFile(name || 'Main.java', text, async (tmp, tmpDir) => {
      const r = await exec(javac, ['-Xlint:all', '-proc:none', '-d', tmpDir, tmp], { cwd: dir, signal, timeout: 60000 });
      if (r.error) return { tool: 'javac', error: r.error };
      return { tool: 'javac', diagnostics: parseColon(r.stderr, { file: tmp }) };
    });
  },
};

async function eslint({ text, file, dir, signal }) {
  const es = npmTool('eslint', dir);
  if (!es) return null;
  const r = await exec(es, ['--format', 'json', '--stdin', ...(file ? ['--stdin-filename', file] : []), '--no-error-on-unmatched-pattern'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'eslint', error: r.error };
  let list;
  try { list = JSON.parse(r.stdout); } catch { return { tool: 'eslint', error: (r.stderr || r.stdout).trim().split('\n')[0] || 'unreadable output' }; }
  const msgs = (list[0] && list[0].messages) || [];
  return { tool: 'eslint', diagnostics: msgs.map((m) => D(m.line, m.column, `${m.message}${m.ruleId ? ` (${m.ruleId})` : ''}`, m.fatal || m.severity === 2 ? 'error' : 'warning', { endLine: m.endLine, endCol: m.endColumn, source: m.ruleId || undefined })) };
}
async function eslintOnly(ctx) { return (await eslint(ctx)) || { tool: null }; }
async function eslintOrNode(ctx) {
  const r = await eslint(ctx);
  if (r) return r;
  const node = process.execPath && /node/i.test(path.basename(process.execPath)) ? process.execPath : onPath('node');
  if (!node) return { tool: null };
  // Syntax only: `node --check` on a temp copy (module or script by extension).
  const ext = ctx.file && /\.(mjs|cjs)$/i.test(ctx.file) ? path.extname(ctx.file) : '.js';
  return withTempFile(`check${ext}`, ctx.text, async (tmp) => {
    const r2 = await exec(node, ['--check', tmp], { cwd: ctx.dir, signal: ctx.signal, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    if (r2.error) return { tool: 'node --check', error: r2.error };
    const m = r2.stderr.match(/:(\d+)\r?\n([^\n]*)\r?\n(\s*)\^+\r?\n\r?\n(?:\w*Error): (.*)/) || r2.stderr.match(/:(\d+)\r?\n[\s\S]*?(?:\w+Error): (.*)/);
    if (!m) return { tool: 'node --check', diagnostics: [] };
    const col = m.length === 5 ? m[3].length + 1 : 1;
    return { tool: 'node --check', diagnostics: [D(m[1], col, m[m.length - 1])] };
  });
}
async function cLike({ text, file, dir, signal }, lang) {
  const cc = onPath('gcc') || onPath('clang') || onPath('cc');
  if (!cc) return { tool: null };
  const r = await exec(cc, ['-fsyntax-only', '-Wall', '-x', lang, '-'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: path.basename(cc), error: r.error };
  return { tool: path.basename(cc).replace(/\.exe$/i, ''), diagnostics: parseColon(r.stderr).filter((d) => !/^In function|^In file included/i.test(d.message)) };
}
async function stylelint({ text, file, dir, signal }) {
  const sl = npmTool('stylelint', dir);
  if (!sl) return { tool: null };
  const r = await exec(sl, ['--stdin', '--stdin-filename', file || 'stdin.css', '--formatter', 'json'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'stylelint', error: r.error };
  let list;
  try { list = JSON.parse(r.stdout || r.stderr); } catch { return { tool: 'stylelint', error: (r.stderr || '').trim().split('\n')[0] || 'no configuration' }; }
  const w = (list[0] && list[0].warnings) || [];
  return { tool: 'stylelint', diagnostics: w.map((m) => D(m.line, m.column, `${m.text}`, m.severity === 'error' ? 'error' : 'warning', { endLine: m.endLine, endCol: m.endColumn, source: m.rule })) };
}

function createLinter() {
  const running = new Map();   // doc id → { kill }
  return {
    languages: () => Object.keys(LINTERS),
    // { id, path, name, language, text } → { tool, diagnostics, error }
    async run({ id, path: file, name, language, text }) {
      const fn = LINTERS[language];
      if (!fn) return { tool: null, diagnostics: [], supported: false };
      if (typeof text !== 'string' || text.length > MAX_TEXT) return { tool: null, diagnostics: [], skipped: 'too large' };
      const prev = running.get(id);
      if (prev && prev.kill) prev.kill();
      const signal = {};
      running.set(id, signal);
      try {
        const r = await fn({ text, file: file || '', name: name || (file ? path.basename(file) : ''), dir: file ? path.dirname(file) : os.homedir(), signal });
        if (running.get(id) !== signal) return { tool: r.tool || null, diagnostics: [], cancelled: true };
        return { tool: r.tool || null, diagnostics: (r.diagnostics || []).filter((d) => d.message).slice(0, 500), error: r.error || null };
      } catch (e) {
        return { tool: null, diagnostics: [], error: e.message };
      } finally { if (running.get(id) === signal) running.delete(id); }
    },
    cancel({ id }) { const p = running.get(id); if (p && p.kill) p.kill(); running.delete(id); return true; },
    shutdown() { for (const p of running.values()) if (p.kill) p.kill(); running.clear(); },
  };
}

module.exports = { createLinter, LINTERS };
