// Code formatting: formats the whole document with the formatter chosen for
// its language (settings › 정렬), or the first one installed. Every tool is
// external and optional — the text goes in through stdin and the formatted
// text comes back through stdout, so nothing is written next to the file —
// except the built-in ones: Prettier bundled with the app (JavaScript,
// TypeScript, JSON, HTML, CSS, Markdown, YAML …), JSON and XML — which need
// nothing installed. The list of tools per language and which are installed
// is what the settings dialog shows.
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { onPath, npmTool, resetPathIndex, exec, withTempFile } = require('./lint');
const { RECIPES } = require('./install');

// Extra places tools land when installed by cargo / go / pip (not always on PATH).
const EXTRA_DIRS = [path.join(os.homedir(), '.cargo', 'bin'), path.join(os.homedir(), 'go', 'bin'), path.join(os.homedir(), '.local', 'bin')];
function inExtraDirs(name) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const d of EXTRA_DIRS) for (const e of exts) { const p = path.join(d, name + e); if (fs.existsSync(p)) return p; }
  return null;
}
// The tools are looked for once per session and the answer — installed or
// not — is kept: the executables on PATH / in the extra dirs (a miss too: the
// settings tab lists ~30 tools at once and a PATH scan per tool per listing
// added up) and the Python modules of the pip tools, which one python process
// checks together (find_spec, no import; spawning python once per module was
// what made the listing take seconds). Only refresh() looks again: the
// "다시 찾기" button and a finished install.
const exeMisses = new Set();   // name (or npm|name|dir) known to be absent
function findExe(name) {
  if (exeMisses.has(name)) return null;
  const exe = onPath(name) || inExtraDirs(name);
  if (!exe) exeMisses.add(name);
  return exe;
}
const PIP_MODULES = [...new Set(Object.values(RECIPES).filter((r) => r.kind === 'pip' && r.module).map((r) => r.module))];
let pyProbe = null;            // Promise<{ py, mods: Set }> — the modules python can find, checked once
function probePython(toolsDir) {
  if (pyProbe) return pyProbe;
  let py = null;
  try { py = require('./runtime').findPython(toolsDir); } catch { py = null; }
  if (!py) py = findExe('python') || findExe('python3') || findExe('py');
  if (!py) { pyProbe = Promise.resolve({ py: null, mods: new Set() }); return pyProbe; }
  const script = 'import importlib.util,sys\nprint(",".join(m for m in sys.argv[1:] if importlib.util.find_spec(m)))';
  pyProbe = new Promise((resolve) => {
    execFile(py, ['-c', script, ...PIP_MODULES], { windowsHide: true, timeout: 15000, encoding: 'utf-8' }, (err, stdout) => {
      const mods = new Set(err ? [] : String(stdout).trim().split(',').filter(Boolean));
      if (err) pyProbe = null;   // python failed to answer: asked again next time
      resolve({ py, mods });
    });
  });
  return pyProbe;
}
let pyKnown = { py: null, mods: new Set() };   // the last probe result, for the synchronous locate()
function refresh() { exeMisses.clear(); resetPathIndex(); pyProbe = null; }

// { id, label, npm?: name of an npm tool (project-local first), cmd?: executable on PATH,
//   args(ctx): the arguments, stdin (default true), builtin?: (text, ctx) → text }
// Prettier bundled with the app (in-process; honours a .prettierrc next to the file), and the project's own Prettier (npm).
const PRETTIER_BUILTIN = (parser) => ({ id: 'prettier-builtin', label: 'Prettier (built-in)', builtin: async (text, { file, tabSize, insertSpaces }) => {
  const prettier = require('prettier');
  const fileOpts = file ? await prettier.resolveConfig(file).catch(() => null) : null;
  const opts = { parser, tabWidth: tabSize, useTabs: !insertSpaces, ...(fileOpts || {}) };
  if (file) opts.filepath = file;
  return prettier.format(text, opts);
} });
const PRETTIER = (parser) => ({ id: 'prettier', label: 'Prettier (project / PATH)', npm: 'prettier', args: ({ file }) => ['--stdin-filepath', file || `stdin.${parser}`, ...(file ? [] : ['--parser', parser])] });
const PRETTIERS = (parser) => [PRETTIER_BUILTIN(parser), PRETTIER(parser)];
const CLANG = { id: 'clang-format', label: 'clang-format', cmd: 'clang-format', args: ({ file }) => (file ? [`--assume-filename=${file}`] : []) };
const BLACK = { id: 'black', label: 'Black', cmd: 'black', args: () => ['-q', '-'] };
const RUFF_FMT = { id: 'ruff', label: 'Ruff format', cmd: 'ruff', args: ({ file }) => ['format', '--stdin-filename', file || 'stdin.py', '-'] };
const AUTOPEP8 = { id: 'autopep8', label: 'autopep8', cmd: 'autopep8', args: () => ['-'] };
const YAPF = { id: 'yapf', label: 'YAPF', cmd: 'yapf', args: () => [] };
const SHFMT = { id: 'shfmt', label: 'shfmt', cmd: 'shfmt', args: ({ tabSize, insertSpaces }) => ['-i', insertSpaces ? String(tabSize) : '0', '-'] };
const GOFMT = { id: 'gofmt', label: 'gofmt', cmd: 'gofmt', args: () => [] };
const GOIMPORTS = { id: 'goimports', label: 'goimports', cmd: 'goimports', args: () => [] };
const RUSTFMT = { id: 'rustfmt', label: 'rustfmt', cmd: 'rustfmt', args: () => ['--emit', 'stdout', '--edition', '2021'] };
const GJF = { id: 'google-java-format', label: 'google-java-format', cmd: 'google-java-format', args: () => ['-'] };
const RUBOCOP = { id: 'rubocop', label: 'RuboCop', cmd: 'rubocop', args: ({ file }) => ['-A', '--stdin', file || 'stdin.rb', '--stderr', '--format', 'quiet'] };
const RUFO = { id: 'rufo', label: 'Rufo', cmd: 'rufo', args: () => [] };
const STYLUA = { id: 'stylua', label: 'StyLua', cmd: 'stylua', args: () => ['-'] };
const DART = { id: 'dart', label: 'dart format', cmd: 'dart', args: () => ['format', '--output', 'show', '--summary', 'none'], file: true };
const KTLINT = { id: 'ktlint', label: 'ktlint', cmd: 'ktlint', args: () => ['-F', '--stdin'] };
const SWIFTFORMAT = { id: 'swiftformat', label: 'SwiftFormat', cmd: 'swiftformat', args: () => ['stdin'] };
const PHP_CS = { id: 'php-cs-fixer', label: 'PHP CS Fixer', cmd: 'php-cs-fixer', args: () => ['fix', '--quiet', '-'], file: true };
const SQLFMT = { id: 'sql-formatter', label: 'sql-formatter', npm: 'sql-formatter', args: () => [] };
const XMLLINT = { id: 'xmllint', label: 'xmllint', cmd: 'xmllint', args: () => ['--format', '-'] };
const PSSA = { id: 'PSScriptAnalyzer', label: 'PSScriptAnalyzer (Invoke-Formatter)', cmd: process.platform === 'win32' ? 'powershell' : 'pwsh', args: () => ['-NoProfile', '-NonInteractive', '-Command', '$s=[Console]::In.ReadToEnd(); if (-not (Get-Module -ListAvailable PSScriptAnalyzer)) { exit 3 }; Invoke-Formatter -ScriptDefinition $s'] };
const JSON_BUILTIN = { id: 'builtin-json', label: 'built-in (JSON.stringify)', builtin: (text, { tabSize, insertSpaces }) => JSON.stringify(JSON.parse(text), null, insertSpaces ? tabSize : '\t') + '\n' };
const XML_BUILTIN = { id: 'builtin-xml', label: 'built-in (indent tags)', builtin: (text, ctx) => formatXml(text, ctx) };

const FORMATTERS = {
  JavaScript: PRETTIERS('babel'), JSX: PRETTIERS('babel'), TypeScript: PRETTIERS('typescript'), TSX: PRETTIERS('typescript'),
  JSON: [...PRETTIERS('json'), JSON_BUILTIN], HTML: PRETTIERS('html'), Vue: PRETTIERS('vue'), CSS: PRETTIERS('css'), SCSS: PRETTIERS('scss'), LESS: PRETTIERS('less'),
  Markdown: PRETTIERS('markdown'), YAML: PRETTIERS('yaml'),
  Python: [BLACK, RUFF_FMT, AUTOPEP8, YAPF],
  C: [CLANG], 'C++': [CLANG], 'C#': [CLANG], 'Objective-C': [CLANG], Java: [GJF, CLANG],
  Go: [GOFMT, GOIMPORTS], Rust: [RUSTFMT], Shell: [SHFMT], PowerShell: [PSSA], SQL: [SQLFMT], MySQL: [SQLFMT], PostgreSQL: [SQLFMT], SQLite: [SQLFMT],
  XML: [XMLLINT, XML_BUILTIN], Ruby: [RUBOCOP, RUFO], PHP: [PHP_CS], Lua: [STYLUA], Dart: [DART], Kotlin: [KTLINT], Swift: [SWIFTFORMAT],
};

// A small XML pretty-printer: one tag per line, nested tags indented; text content kept as it is.
function formatXml(text, { tabSize = 2, insertSpaces = true } = {}) {
  const unit = insertSpaces ? ' '.repeat(tabSize) : '\t';
  const tokens = text.replace(/>\s+</g, '><').match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g) || [];
  let depth = 0;
  const out = [];
  for (const tok of tokens) {
    if (/^<\/[^>]+>$/.test(tok)) { depth = Math.max(0, depth - 1); out.push(unit.repeat(depth) + tok); continue; }
    if (/^<[^>]+>$/.test(tok) && !/^<[?!]/.test(tok) && !/\/>$/.test(tok)) { out.push(unit.repeat(depth) + tok); depth++; continue; }
    if (/^</.test(tok)) { out.push(unit.repeat(depth) + tok); continue; }
    const t = tok.trim();
    if (!t) continue;
    // text after an opening tag: keep it on the tag's line
    if (out.length && /^<[^/!?][^>]*>$/.test(out[out.length - 1].trim()) && !t.includes('\n')) { out[out.length - 1] += t; continue; }
    out.push(unit.repeat(depth) + t);
  }
  // close tags that follow inline text go on the same line ("<a>text</a>")
  const lines = [];
  for (const l of out) {
    const prev = lines[lines.length - 1];
    if (prev && /^<\/[^>]+>$/.test(l.trim()) && /^\s*<[^/!?][^>]*>[^<]+$/.test(prev)) { lines[lines.length - 1] = prev + l.trim(); continue; }
    lines.push(l);
  }
  return lines.join('\n') + '\n';
}

// Where a tool runs from: { exe, pre } (pre = arguments before the tool's own,
// e.g. ['-m', 'black'] for a Python module), 'builtin', or null.
function locate(tool, dir, toolsDir) {
  if (tool.builtin) return 'builtin';
  if (tool.npm) {
    const key = `npm|${tool.npm}|${dir || ''}`;
    if (exeMisses.has(key)) return null;
    const own = npmTool(tool.npm, dir);
    const app = path.join(toolsDir || '', 'node', 'node_modules', '.bin', process.platform === 'win32' ? `${tool.npm}.cmd` : tool.npm);
    const exe = own || (toolsDir && fs.existsSync(app) ? app : null);
    if (!exe) exeMisses.add(key);
    return exe ? { exe, pre: [] } : null;
  }
  const exe = findExe(tool.cmd);
  if (exe) return { exe, pre: [] };
  const recipe = RECIPES[tool.id];
  if (recipe && recipe.kind === 'pip' && recipe.module && pyKnown.py && pyKnown.mods.has(recipe.module)) return { exe: pyKnown.py, pre: ['-m', recipe.module] };
  return null;
}
const findTool = (tool, dir, toolsDir) => locate(tool, dir, toolsDir);

function createFormatter({ toolsDir } = {}) {
  return {
    languages: () => Object.keys(FORMATTERS),
    // Which tools exist for each language, and whether each is installed (project folder first for npm tools).
    async tools({ dir, refresh: again = false } = {}) {
      if (again) refresh();
      pyKnown = await probePython(toolsDir);
      const out = {};
      for (const [lang, list] of Object.entries(FORMATTERS)) out[lang] = list.map((t) => ({ id: t.id, label: t.label, available: !!findTool(t, dir, toolsDir), installable: !!(RECIPES[t.id] && RECIPES[t.id].kind !== 'manual'), hint: RECIPES[t.id] && RECIPES[t.id].hint ? RECIPES[t.id].hint : null }));
      return out;
    },
    // { path, name, language, text, tool: id | 'auto', tabSize, insertSpaces } → { text, tool } | { error, tool }
    async run({ path: file, name, language, text, tool = 'auto', tabSize = 4, insertSpaces = true }) {
      const list = FORMATTERS[language];
      if (!list) return { error: 'no formatter for this language', tool: null };
      const dir = file ? path.dirname(file) : undefined;
      pyKnown = await probePython(toolsDir);
      let chosen = null;
      if (tool && tool !== 'auto') chosen = list.find((t) => t.id === tool) || null;
      else chosen = list.find((t) => findTool(t, dir, toolsDir)) || null;
      if (!chosen) return { error: tool && tool !== 'auto' ? `${tool}: unknown formatter` : 'no formatter installed', tool: null };
      const ctx = { file: file || '', name: name || (file ? path.basename(file) : ''), dir, tabSize, insertSpaces };
      if (chosen.builtin) {
        try { return { text: await chosen.builtin(text, ctx), tool: chosen.id }; } catch (e) { return { error: String(e.message || e).split('\n')[0], tool: chosen.id }; }
      }
      const where = findTool(chosen, dir, toolsDir);
      if (!where) return { error: `${chosen.label} is not installed`, tool: chosen.id, notInstalled: true, installable: !!(RECIPES[chosen.id] && RECIPES[chosen.id].kind !== 'manual'), hint: RECIPES[chosen.id] && RECIPES[chosen.id].hint ? RECIPES[chosen.id].hint : null };
      const runIt = async (input, args) => exec(where.exe, [...where.pre, ...args], { cwd: dir, input, timeout: 60000 });
      let r;
      if (chosen.file) {
        // needs a real file: a temp copy, formatted output on stdout
        r = await withTempFile(ctx.name || 'file.txt', text, (tmp) => runIt(null, [...chosen.args(ctx), tmp]));
      } else r = await runIt(text, chosen.args(ctx));
      if (r.error) return { error: r.error, tool: chosen.id };
      if (r.code !== 0 || (!r.stdout && text.trim())) return { error: (r.stderr || r.stdout || `exit code ${r.code}`).trim().split('\n').slice(0, 3).join('\n'), tool: chosen.id };
      return { text: r.stdout, tool: chosen.id };
    },
  };
}

module.exports = { createFormatter, FORMATTERS, formatXml, refresh };
