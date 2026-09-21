// Linting: runs the usual checker of a language on the document text and
// returns its findings as { line, col, endLine, endCol, severity, message,
// source }. The text is piped through stdin wherever the tool allows it (so
// the unsaved buffer is checked, and nothing is written next to the file);
// the few tools that need a file get a copy in the OS temp directory.
//
// Every tool is optional: by default the first one found in the project's
// node_modules/.bin (walking up from the file) or on PATH is used (settings
// › 정렬·검사 picks another one, or none, per language), and when none is
// installed the result says so (`tool: null`). Availability is
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
// Each PATH directory is listed once (a minute at most, so a tool installed
// while the app runs is still found) and lookups are set membership: a miss
// used to cost a stat per directory per PATHEXT extension — a second per
// listing of the formatter / linter tables on a long Windows PATH.
const PATH_INDEX_TTL = 60000;
const pathIndex = new Map();   // dir → { names: Map<lowercase name, real name> | null, at }
function dirNames(dir) {
  const hit = pathIndex.get(dir);
  if (hit && Date.now() - hit.at < PATH_INDEX_TTL) return hit.names;
  let names = null;
  try { names = new Map(fs.readdirSync(dir).map((n) => [n.toLowerCase(), n])); } catch { names = null; }
  pathIndex.set(dir, { names, at: Date.now() });
  return names;
}
function resetPathIndex() { pathIndex.clear(); }
function onPath(name) {
  const key = `path|${name}`;
  if (exeCache.has(key)) return exeCache.get(key);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  let found = null;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const names = dirNames(dir);
    if (!names) continue;
    for (const ext of exts) {
      const real = names.get((name + ext).toLowerCase());
      if (real) { found = path.join(dir, real); break; }
    }
    if (found) break;
  }
  if (found) exeCache.set(key, found);   // a miss is not cached: a tool installed while the app runs is found next time
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
  if (found) exeCache.set(key, found);
  return found;
}

// ── running a tool ──
function exec(cmd, args, { cwd, input, timeout = TIMEOUT, signal, env } = {}) {
  return new Promise((resolve) => {
    let proc;
    const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
    try {
      proc = shell
        ? spawn(`"${cmd}" ${args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')}`, { cwd: cwd || undefined, stdio: 'pipe', windowsHide: true, shell: true, env: env || process.env })
        : spawn(cmd, args, { cwd: cwd || undefined, stdio: 'pipe', windowsHide: true, env: env || process.env });
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
// Every language has an ordered list of tools: { id, label, find(ctx) → the executable (or true for a
// built-in / null when not installed), run(ctx, exe) → { tool, diagnostics, error } }. Which one runs is
// the settings' choice for the language (settings › 정렬·검사): 'auto' takes the first one installed,
// a tool id insists on that tool (a missing one is reported), 'none' switches checking off.
const T = (id, label, find, run) => ({ id, label, find, run });
const nodeExe = () => (process.execPath && /node/i.test(path.basename(process.execPath)) ? process.execPath : onPath('node'));

const ESLINT = T('eslint', 'ESLint', ({ dir }) => npmTool('eslint', dir), eslint);
const NODE_CHECK = T('node', 'node --check (문법만)', () => nodeExe(), async (ctx, node) => {
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
});
const RUFF = T('ruff', 'ruff', () => onPath('ruff'), async ({ text, file, dir, signal }, ruff) => {
  const r = await exec(ruff, ['check', '--output-format', 'json', '--stdin-filename', file || 'stdin.py', '-'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'ruff', error: r.error };
  let list = [];
  try { list = JSON.parse(r.stdout || '[]'); } catch { return { tool: 'ruff', error: r.stderr.trim() || 'unreadable output' }; }
  return { tool: 'ruff', diagnostics: list.map((d) => D(d.location && d.location.row, d.location && d.location.column, `${d.message}${d.code ? ` (${d.code})` : ''}`, /^E9|^F(63|7|82)/.test(d.code || '') ? 'error' : 'warning', { endLine: d.end_location && d.end_location.row, endCol: d.end_location && d.end_location.column, source: d.code })) };
});
const PYFLAKES = T('pyflakes', 'pyflakes', () => onPath('pyflakes') || onPath('python') || onPath('python3') || onPath('py'), async ({ text, dir, signal }, exe) => {
  // pyflakes reads stdin when given no file; through python when only the module is installed.
  const direct = /pyflakes/i.test(path.basename(exe));
  const r = direct ? await exec(exe, [], { cwd: dir, input: text, signal }) : await exec(exe, ['-m', 'pyflakes'], { cwd: dir, input: text, signal });
  if (r.error || /No module named/i.test(r.stderr)) return direct ? { tool: 'pyflakes', error: r.error || r.stderr.trim() } : null;
  return { tool: 'pyflakes', diagnostics: parseColon(r.stdout + '\n' + r.stderr, { severityOf: (l) => (/undefined name|invalid syntax|SyntaxError|unexpected indent/i.test(l) ? 'error' : 'warning') }) };
});
const PY_SYNTAX = T('python', 'python (문법만)', () => onPath('python') || onPath('python3') || onPath('py'), async ({ text, file, dir, signal }, py) => {
  const r = await exec(py, ['-c', 'import sys,ast\ntry:\n ast.parse(sys.stdin.read(), sys.argv[1] if len(sys.argv)>1 else "<stdin>")\nexcept SyntaxError as e:\n print("%d:%d: %s" % (e.lineno or 1, e.offset or 1, e.msg))', file || '<stdin>'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'python', error: r.error };
  return { tool: 'python', diagnostics: parseColon(r.stdout.split('\n').map((l) => (l.trim() ? `x:${l}` : '')).join('\n')) };
});
const JSON_BUILTIN = T('json', '내장 JSON 검사', () => true, async ({ text }) => {
  try { JSON.parse(text); return { tool: 'json', diagnostics: [] }; } catch (e) {
    // JSON.parse does not tell where; a small scanner finds the offset.
    const pos = jsonErrorOffset(text);
    const before = text.slice(0, pos);
    return { tool: 'json', diagnostics: [D(before.split('\n').length, pos - before.lastIndexOf('\n'), e.message.replace(/^JSON\.parse: /, ''))] };
  }
});
// YAML syntax through js-yaml (built in — always available), with the Kubernetes checks when the document is a
// manifest: apiVersion / kind / metadata.name present, a known kind, containers with name + image, ports numeric.
const K8S_KINDS = new Set(['Pod', 'Deployment', 'Service', 'ConfigMap', 'Secret', 'Namespace', 'Ingress', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'ReplicaSet', 'PersistentVolume', 'PersistentVolumeClaim', 'ServiceAccount', 'Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding', 'HorizontalPodAutoscaler', 'NetworkPolicy', 'StorageClass', 'LimitRange', 'ResourceQuota', 'Endpoints', 'PodDisruptionBudget', 'CustomResourceDefinition', 'Kustomization']);
function yamlCheck(text, { kube = false } = {}) {
  let yaml;
  try { yaml = require('js-yaml'); } catch { return { tool: 'yaml', error: 'js-yaml not available' }; }
  const diags = [];
  let docs = [];
  try { yaml.loadAll(text, (d) => docs.push(d)); } catch (e) {
    const m = e.mark || {};
    diags.push(D((m.line || 0) + 1, (m.column || 0) + 1, (e.reason || e.message || 'YAML error').replace(/\s+/g, ' ')));
    return { tool: kube ? 'kube' : 'yaml', diagnostics: diags };
  }
  if (!kube) return { tool: 'yaml', diagnostics: [] };
  // where a top-level key of document n sits (for the line of a finding)
  const lines = text.split('\n');
  const lineOf = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i + 1; return from + 1; };
  const starts = [0]; lines.forEach((l, i) => { if (/^---\s*$/.test(l)) starts.push(i + 1); });
  docs.forEach((d, n) => {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return;
    const at = (re) => lineOf(re, starts[n] || 0);
    const w = (line, msg, sev = 'error') => diags.push(D(line, 1, msg, sev));
    if (!d.apiVersion) w(at(/^kind\s*:/), 'apiVersion is missing');
    if (!d.kind) w(at(/^apiVersion\s*:/), 'kind is missing');
    else if (!K8S_KINDS.has(String(d.kind)) && !/^[A-Z]/.test(String(d.kind))) w(at(/^kind\s*:/), `unknown kind "${d.kind}" (kinds start with a capital: Pod, Deployment …)`, 'warning');
    else if (!K8S_KINDS.has(String(d.kind))) w(at(/^kind\s*:/), `kind "${d.kind}" is not a built-in resource (a CRD?)`, 'info');
    if (d.kind !== 'Kustomization' && (!d.metadata || !d.metadata.name) && !(d.metadata && d.metadata.generateName)) w(at(/^metadata\s*:/), 'metadata.name is missing');
    const podSpec = d.kind === 'Pod' ? d.spec : d.spec && d.spec.template && d.spec.template.spec ? d.spec.template.spec : d.kind === 'CronJob' && d.spec && d.spec.jobTemplate && d.spec.jobTemplate.spec && d.spec.jobTemplate.spec.template ? d.spec.jobTemplate.spec.template.spec : null;
    if (['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'ReplicaSet', 'CronJob'].includes(d.kind)) {
      if (!d.spec) w(at(/^kind\s*:/), 'spec is missing');
      else if (!podSpec) w(at(/^spec\s*:/), 'spec.template.spec (the pod) is missing');
      else if (!Array.isArray(podSpec.containers) || !podSpec.containers.length) w(at(/^\s*spec\s*:/), 'the pod has no containers');
      else podSpec.containers.forEach((c, i) => {
        const cl = at(new RegExp(`^\\s*-\\s*name\\s*:\\s*${c && c.name ? String(c.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '__'}`));
        if (!c || typeof c !== 'object') { w(at(/containers\s*:/), `container ${i + 1} is not a mapping`); return; }
        if (!c.name) w(at(/containers\s*:/), `container ${i + 1} has no name`);
        if (!c.image) w(cl, `container "${c.name || i + 1}" has no image`);
        else if (/:latest$/.test(String(c.image)) || !/[:@]/.test(String(c.image))) w(cl, `image "${c.image}" is not pinned to a tag or digest`, 'warning');
        if (Array.isArray(c.ports)) for (const p of c.ports) if (p && p.containerPort != null && !Number.isInteger(p.containerPort)) w(cl, `containerPort must be a number (got ${JSON.stringify(p.containerPort)})`);
        if (c.resources == null) w(cl, `container "${c.name || i + 1}" sets no resources (requests / limits)`, 'info');
      });
      if (['Deployment', 'StatefulSet', 'ReplicaSet', 'DaemonSet'].includes(d.kind) && d.spec && !d.spec.selector) w(at(/^spec\s*:/), 'spec.selector is required');
      if (['Deployment', 'StatefulSet', 'ReplicaSet'].includes(d.kind) && d.spec && d.spec.selector && d.spec.selector.matchLabels && d.spec.template && d.spec.template.metadata) {
        const ml = d.spec.selector.matchLabels, tl = d.spec.template.metadata.labels || {};
        for (const k of Object.keys(ml)) if (tl[k] !== ml[k]) w(at(/matchLabels\s*:/), `selector.matchLabels.${k} does not match the pod template's labels`);
      }
    }
    if (d.kind === 'Service' && d.spec && (!Array.isArray(d.spec.ports) || !d.spec.ports.length)) w(at(/^spec\s*:/), 'the Service has no ports', 'warning');
    if (d.kind === 'Service' && d.spec && !d.spec.selector && d.spec.type !== 'ExternalName') w(at(/^spec\s*:/), 'the Service has no selector', 'warning');
  });
  return { tool: 'kube', diagnostics: diags };
}
const isKube = (text) => /^\s*apiVersion\s*:/m.test(text) && /^\s*kind\s*:/m.test(text);
const YAML_BUILTIN = T('yaml', '내장 YAML 문법 검사', () => true, async ({ text }) => yamlCheck(text, { kube: isKube(text) }));
const KUBE_BUILTIN = T('kube', '내장 Kubernetes 검사', () => true, async ({ text }) => yamlCheck(text, { kube: true }));
const KUBECONFORM = T('kubeconform', 'kubeconform', () => onPath('kubeconform'), async ({ text, dir, signal }, kc) => {
  const r = await exec(kc, ['-output', 'json', '-summary', '-'], { cwd: dir, input: text, signal, timeout: 60000 });
  if (r.error && !r.stdout) return { tool: 'kubeconform', error: r.error };
  let j; try { j = JSON.parse(r.stdout || '{}'); } catch { return { tool: 'kubeconform', error: (r.stderr || r.stdout).trim().split('\n')[0] || 'unreadable output' }; }
  return { tool: 'kubeconform', diagnostics: (j.resources || []).filter((x) => x.status === 'statusInvalid' || x.status === 'statusError').map((x) => D(1, 1, `${x.kind || ''} ${x.name || ''}: ${x.msg || x.status}`.trim())) };
});
const KUBECTL = T('kubectl', 'kubectl apply --dry-run=client', () => onPath('kubectl'), async ({ text, dir, signal }, kubectl) => {
  const r = await exec(kubectl, ['apply', '--dry-run=client', '--validate=true', '-f', '-'], { cwd: dir, input: text, signal, timeout: 60000 });
  const err = (r.stderr || '').trim();
  if (!err) return { tool: 'kubectl', diagnostics: [] };
  const diags = [];
  for (const l of err.split('\n')) { const m = /line (\d+)/.exec(l); if (/^error|^The .* is invalid|^Error/i.test(l) || m) diags.push(D(m ? m[1] : 1, 1, l.replace(/^error(?: validating .*?)?:\s*/i, ''))); }
  return { tool: 'kubectl', diagnostics: diags.length ? diags : [D(1, 1, err.split('\n')[0])] };
});
const YAMLLINT = T('yamllint', 'yamllint', () => onPath('yamllint'), async ({ text, dir, signal }, yl) => {
  const r = await exec(yl, ['-f', 'parsable', '-'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'yamllint', error: r.error };
  return { tool: 'yamllint', diagnostics: parseColon(r.stdout, { severityOf: (l) => (/\[error\]/.test(l) ? 'error' : 'warning') }).map((d) => ({ ...d, message: d.message.replace(/^\[(error|warning)\]\s*/, '') })) };
});
const SHELLCHECK = T('shellcheck', 'shellcheck', () => onPath('shellcheck'), async ({ text, file, dir, signal }, sc) => {
  const r = await exec(sc, ['-f', 'json', ...(file && /\.(bash|zsh|ksh)$/.test(file) ? ['-s', path.extname(file).slice(1)] : []), '-'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'shellcheck', error: r.error };
  let list = [];
  try { list = JSON.parse(r.stdout || '[]'); } catch { return { tool: 'shellcheck', error: r.stderr.trim() || 'unreadable output' }; }
  return { tool: 'shellcheck', diagnostics: list.map((d) => D(d.line, d.column, `${d.message} (SC${d.code})`, d.level === 'error' ? 'error' : d.level === 'warning' ? 'warning' : 'info', { endLine: d.endLine, endCol: d.endColumn, source: `SC${d.code}` })) };
});
const PSSA = T('pssa', 'PSScriptAnalyzer', () => onPath('pwsh') || onPath('powershell'), async ({ text, dir, signal }, ps) => {
  const script = '$s=[Console]::In.ReadToEnd(); if (-not (Get-Module -ListAvailable PSScriptAnalyzer)) { Write-Output "__NO_PSSA__"; exit 0 }; $r = Invoke-ScriptAnalyzer -ScriptDefinition $s; $r | Select-Object Line,Column,Severity,Message,RuleName | ConvertTo-Json -Compress';
  const r = await exec(ps, ['-NoProfile', '-NonInteractive', '-Command', script], { cwd: dir, input: text, signal, timeout: 60000 });
  if (r.error) return { tool: 'PSScriptAnalyzer', error: r.error };
  if (/__NO_PSSA__/.test(r.stdout)) return { tool: 'PSScriptAnalyzer', error: 'PSScriptAnalyzer module not installed (Install-Module PSScriptAnalyzer)' };
  let list = [];
  try { const j = JSON.parse(r.stdout.trim() || '[]'); list = Array.isArray(j) ? j : [j]; } catch { return { tool: 'PSScriptAnalyzer', error: r.stderr.trim() || 'unreadable output' }; }
  return { tool: 'PSScriptAnalyzer', diagnostics: list.filter(Boolean).map((d) => D(d.Line, d.Column, `${d.Message} (${d.RuleName})`, d.Severity === 3 || d.Severity === 'ParseError' || d.Severity === 'Error' ? 'error' : d.Severity === 'Information' || d.Severity === 0 ? 'info' : 'warning', { source: d.RuleName })) };
});
const cCompiler = (id, lang) => T(id, `${id} -fsyntax-only`, () => onPath(id), async ({ text, dir, signal }, cc) => {
  const r = await exec(cc, ['-fsyntax-only', '-Wall', '-x', lang, '-'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: id, error: r.error };
  return { tool: id, diagnostics: parseColon(r.stderr).filter((d) => !/^In function|^In file included/i.test(d.message)) };
});
const GOFMT = T('gofmt', 'gofmt', () => onPath('gofmt'), async ({ text, dir, signal }, gofmt) => {
  const r = await exec(gofmt, ['-e', '-l'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'gofmt', error: r.error };
  return { tool: 'gofmt', diagnostics: parseColon(r.stderr) };
});
const GOVET = T('govet', 'go vet', () => onPath('go'), async ({ text, name, dir, signal }, go) => withTempFile(name && /\.go$/.test(name) ? name : 'main.go', text, async (tmp, tmpDir) => {
  const r = await exec(go, ['vet', tmp], { cwd: tmpDir, signal, timeout: 60000 });
  return { tool: 'go vet', diagnostics: parseColon(r.stderr, { file: tmp }) };
}));
const PHP_L = T('php', 'php -l', () => onPath('php'), async ({ text, dir, signal }, php) => {
  const r = await exec(php, ['-l', '-d', 'display_errors=stderr'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'php -l', error: r.error };
  const out = r.stdout + '\n' + r.stderr;
  const diags = [];
  for (const m of out.matchAll(/(?:Parse|Fatal) error:\s*(.*?) in (?:Standard input code|-|.*?) on line (\d+)/g)) diags.push(D(m[2], 1, m[1]));
  return { tool: 'php -l', diagnostics: diags };
});
const RUBOCOP = T('rubocop', 'RuboCop', () => onPath('rubocop'), async ({ text, file, dir, signal }, rc) => {
  const r = await exec(rc, ['--format', 'json', '--stdin', file || 'stdin.rb'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'rubocop', error: r.error };
  try { const j = JSON.parse(r.stdout); const off = (j.files && j.files[0] && j.files[0].offenses) || []; return { tool: 'rubocop', diagnostics: off.map((o) => D(o.location.start_line || o.location.line, o.location.start_column || o.location.column, `${o.message} (${o.cop_name})`, /error|fatal/i.test(o.severity) ? 'error' : o.severity === 'warning' ? 'warning' : 'info', { endLine: o.location.last_line, endCol: o.location.last_column, source: o.cop_name })) }; } catch { return { tool: 'rubocop', error: (r.stderr || '').trim().split('\n')[0] || 'unreadable output' }; }
});
const RUBY_C = T('ruby', 'ruby -c (문법만)', () => onPath('ruby'), async ({ text, dir, signal }, ruby) => {
  const r = await exec(ruby, ['-c', '-w'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'ruby -c', error: r.error };
  return { tool: 'ruby -c', diagnostics: parseColon(r.stderr, { severityOf: (l) => (/warning/i.test(l) ? 'warning' : 'error') }).map((d) => ({ ...d, message: d.message.replace(/^warning:\s*/i, '') })) };
});
const HADOLINT = T('hadolint', 'hadolint', () => onPath('hadolint'), async ({ text, dir, signal }, hl) => {
  const r = await exec(hl, ['-f', 'json', '-'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'hadolint', error: r.error };
  let list = [];
  try { list = JSON.parse(r.stdout || '[]'); } catch { return { tool: 'hadolint', error: 'unreadable output' }; }
  return { tool: 'hadolint', diagnostics: list.map((d) => D(d.line, d.column, `${d.message} (${d.code})`, d.level === 'error' ? 'error' : d.level === 'warning' ? 'warning' : 'info', { source: d.code })) };
});
const MARKDOWNLINT = T('markdownlint', 'markdownlint', ({ dir }) => npmTool('markdownlint', dir), async ({ text, dir, signal }, ml) => {
  const r = await exec(ml, ['--stdin', '--json'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'markdownlint', error: r.error };
  let list = [];
  try { list = JSON.parse(r.stderr.trim() || r.stdout.trim() || '[]'); } catch { return { tool: 'markdownlint', diagnostics: [] }; }
  return { tool: 'markdownlint', diagnostics: list.map((d) => D(d.lineNumber, d.errorRange ? d.errorRange[0] : 1, `${d.ruleDescription}${d.errorDetail ? ` — ${d.errorDetail}` : ''} (${(d.ruleNames || [])[0] || ''})`, 'warning', { source: (d.ruleNames || [])[0] })) };
});
const STYLELINT = T('stylelint', 'stylelint', ({ dir }) => npmTool('stylelint', dir), async ({ text, file, dir, signal }, sl) => {
  const r = await exec(sl, ['--stdin', '--stdin-filename', file || 'stdin.css', '--formatter', 'json'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'stylelint', error: r.error };
  let list;
  try { list = JSON.parse(r.stdout || r.stderr); } catch { return { tool: 'stylelint', error: (r.stderr || '').trim().split('\n')[0] || 'no configuration (.stylelintrc)' }; }
  const w = (list[0] && list[0].warnings) || [];
  return { tool: 'stylelint', diagnostics: w.map((m) => D(m.line, m.column, `${m.text}`, m.severity === 'error' ? 'error' : 'warning', { endLine: m.endLine, endCol: m.endColumn, source: m.rule })) };
});
const JAVAC = T('javac', 'javac -Xlint', () => onPath('javac'), async ({ text, dir, name, signal }, javac) => withTempFile(name || 'Main.java', text, async (tmp, tmpDir) => {
  const r = await exec(javac, ['-Xlint:all', '-proc:none', '-d', tmpDir, tmp], { cwd: dir, signal, timeout: 60000 });
  if (r.error) return { tool: 'javac', error: r.error };
  return { tool: 'javac', diagnostics: parseColon(r.stderr, { file: tmp }) };
}));

const LINTERS = {
  JavaScript: [ESLINT, NODE_CHECK],
  JSX: [ESLINT, NODE_CHECK],
  TypeScript: [ESLINT],
  TSX: [ESLINT],
  Python: [RUFF, PYFLAKES, PY_SYNTAX],
  JSON: [JSON_BUILTIN],
  YAML: [YAML_BUILTIN, KUBE_BUILTIN, KUBECONFORM, KUBECTL, YAMLLINT],
  Shell: [SHELLCHECK],
  PowerShell: [PSSA],
  C: [cCompiler('gcc', 'c'), cCompiler('clang', 'c'), cCompiler('cc', 'c')],
  'C++': [cCompiler('g++', 'c++'), cCompiler('clang++', 'c++'), cCompiler('gcc', 'c++'), cCompiler('clang', 'c++')],
  Go: [GOFMT, GOVET],
  PHP: [PHP_L],
  Ruby: [RUBOCOP, RUBY_C],
  Dockerfile: [HADOLINT],
  Markdown: [MARKDOWNLINT],
  CSS: [STYLELINT],
  SCSS: [STYLELINT],
  LESS: [STYLELINT],
  Java: [JAVAC],
};

async function eslint({ text, file, dir, signal }, es) {
  const r = await exec(es, ['--format', 'json', '--stdin', ...(file ? ['--stdin-filename', file] : []), '--no-error-on-unmatched-pattern'], { cwd: dir, input: text, signal });
  if (r.error) return { tool: 'eslint', error: r.error };
  let list;
  try { list = JSON.parse(r.stdout); } catch { return { tool: 'eslint', error: (r.stderr || r.stdout).trim().split('\n')[0] || 'unreadable output' }; }
  const msgs = (list[0] && list[0].messages) || [];
  return { tool: 'eslint', diagnostics: msgs.map((m) => D(m.line, m.column, `${m.message}${m.ruleId ? ` (${m.ruleId})` : ''}`, m.fatal || m.severity === 2 ? 'error' : 'warning', { endLine: m.endLine, endCol: m.endColumn, source: m.ruleId || undefined })) };
}

// Runs the language's checker chosen by `choice` ('auto' | tool id | 'none'); null from a tool's run means
// "not usable after all" (auto moves on to the next one).
async function lintWith(language, ctx, choice = 'auto') {
  const tools = LINTERS[language];
  if (!tools) return { tool: null, supported: false };
  if (choice === 'none') return { tool: null, off: true };
  const list = choice && choice !== 'auto' ? tools.filter((t) => t.id === choice) : tools;
  if (choice && choice !== 'auto' && !list.length) return { tool: null, error: `unknown tool: ${choice}` };
  for (const t of list) {
    const exe = resolveLintExe(t, ctx);
    if (!exe) { if (choice !== 'auto') return { tool: t.id, error: `${t.label}: not installed`, notInstalled: true, installable: installInfo(t.id).installable, hint: installInfo(t.id).hint }; continue; }
    const r = await t.run(ctx, exe);
    if (r) return r;
    if (choice !== 'auto') return { tool: t.id, error: `${t.label}: not usable` };
  }
  return { tool: null };
}
// For the settings: every language, its tools and whether each is installed (looked up from `dir`).
function recipeOf(id) {
  const rec = require('./install').RECIPES[id];
  return rec || null;
}
function appNpmBin(name, toolsDir) {
  if (!toolsDir || !name) return null;
  const bin = path.join(toolsDir, 'node', 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
  return fs.existsSync(bin) ? bin : null;
}
function inUserBins(name) {
  const dirs = [path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.cargo', 'bin'), path.join(os.homedir(), 'go', 'bin')];
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    for (const root of [path.join(roaming, 'Python'), path.join(local, 'Programs', 'Python')]) {
      try { for (const n of fs.readdirSync(root)) dirs.push(path.join(root, n, 'Scripts')); } catch { /* not there */ }
    }
  }
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const d of dirs) for (const e of exts) { const p = path.join(d, name + e); if (fs.existsSync(p)) return p; }
  return null;
}
function locateByRecipe(id, toolsDir, ctx) {
  const rec = recipeOf(id);
  if (!rec || rec.kind === 'manual') return null;
  const bin = rec.bin || (rec.kind === 'npm' ? rec.pkg : rec.module || rec.crate || id);
  if (rec.kind === 'npm') return appNpmBin(bin, toolsDir) || npmTool(bin, ctx && ctx.dir);
  if (rec.kind === 'psmodule') return null;
  return onPath(bin) || inUserBins(bin);
}
function resolveLintExe(t, ctx) {
  const hit = t.find(ctx);
  if (hit) return hit;
  return locateByRecipe(t.id, ctx && ctx.toolsDir, ctx);
}
function installInfo(id) {
  const rec = recipeOf(id);
  return { installable: !!(rec && rec.kind !== 'manual'), hint: rec && rec.hint ? rec.hint : null };
}

function lintTools(dir, toolsDir) {
  const ctx = { dir: dir || os.homedir(), toolsDir };
  const out = {};
  for (const [lang, tools] of Object.entries(LINTERS)) {
    out[lang] = tools.map((t) => {
      const info = installInfo(t.id);
      return { id: t.id, label: t.label, available: !!resolveLintExe(t, ctx), installable: info.installable, hint: info.hint };
    });
  }
  return out;
}

function createLinter({ toolsDir } = {}) {
  const running = new Map();   // doc id → { kill }
  return {
    languages: () => Object.keys(LINTERS),
    // { dir, refresh } → { language: [{ id, label, available, installable }] } — the settings' dropdowns
    tools: ({ dir, refresh: again = false } = {}) => {
      if (again) { exeCache.clear(); resetPathIndex(); }
      return lintTools(dir, toolsDir);
    },
    // { id, path, name, language, text, tool } → { tool, diagnostics, error }; `tool` is the settings' choice for the language
    async run({ id, path: file, name, language, text, tool: choice }) {
      if (!LINTERS[language]) return { tool: null, diagnostics: [], supported: false };
      if (typeof text !== 'string' || text.length > MAX_TEXT) return { tool: null, diagnostics: [], skipped: 'too large' };
      const prev = running.get(id);
      if (prev && prev.kill) prev.kill();
      const signal = {};
      running.set(id, signal);
      try {
        const r = await lintWith(language, { text, file: file || '', name: name || (file ? path.basename(file) : ''), dir: file ? path.dirname(file) : os.homedir(), signal, toolsDir }, choice || 'auto');
        if (running.get(id) !== signal) return { tool: r.tool || null, diagnostics: [], cancelled: true };
        return { tool: r.tool || null, diagnostics: (r.diagnostics || []).filter((d) => d.message).slice(0, 500), error: r.error || null, off: !!r.off };
      } catch (e) {
        return { tool: null, diagnostics: [], error: e.message };
      } finally { if (running.get(id) === signal) running.delete(id); }
    },
    cancel({ id }) { const p = running.get(id); if (p && p.kill) p.kill(); running.delete(id); return true; },
    shutdown() { for (const p of running.values()) if (p.kill) p.kill(); running.clear(); },
  };
}

module.exports = { createLinter, LINTERS, lintWith, lintTools, resolveLintExe, onPath, npmTool, resetPathIndex, exec, withTempFile };
