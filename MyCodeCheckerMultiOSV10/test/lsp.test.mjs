import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createConnection, createReader, encode } = require('../core/lsp/jsonrpc.js');
const { fixesFor, suppressionEdit } = require('../core/lsp/fixes.js');
const { applyRangeChange } = require('../core/lsp/index.js');
const { normalize } = require('../core/lsp/config.js');
const { profileFor, suppressedFrom } = require('../core/lsp/connected.js');
const { analyzeSources, listRules } = require('../core/analyze.js');
const { buildVsix } = require('../ide/vscode/build-vsix.js');

const uriOf = (p) => pathToFileURL(p).href;
const same = (a, b) => path.normalize(fileURLToPath(a)).toLowerCase() === path.normalize(fileURLToPath(b)).toLowerCase();

function workspace(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-lsp-')));
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}

// Starts core/lsp/server.js and speaks LSP to it over real stdio framing.
async function startServer(dir, initializationOptions = {}) {
  const child = spawn(process.execPath, [path.join(root, 'core', 'lsp', 'server.js'), '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const client = createConnection(child.stdout, child.stdin);
  const diagnostics = new Map();
  const notes = [];
  const waiters = new Set();
  const check = () => { for (const w of [...waiters]) if (w.pred()) { waiters.delete(w); clearTimeout(w.timer); w.resolve(); } };
  client.onNotification('textDocument/publishDiagnostics', (p) => {
    const key = path.normalize(fileURLToPath(p.uri)).toLowerCase();
    diagnostics.set(key, p);
    check();
  });
  for (const m of ['mycodechecker/analysisDone', 'mycodechecker/settingsChanged', 'window/logMessage']) {
    client.onNotification(m, (p) => { notes.push({ method: m, params: p }); check(); });
  }
  const waitFor = (pred, label = 'condition', ms = 15000) => new Promise((resolve, reject) => {
    if (pred()) { resolve(); return; }
    const w = { pred, resolve };
    w.timer = setTimeout(() => { waiters.delete(w); reject(new Error(`Timed out waiting for ${label}. stderr: ${stderr}`)); }, ms);
    waiters.add(w);
  });
  const diagsOf = (file) => {
    const p = diagnostics.get(path.normalize(file).toLowerCase());
    return p ? p.diagnostics : null;
  };
  const init = await client.request('initialize', {
    processId: process.pid,
    rootUri: uriOf(dir),
    workspaceFolders: [{ uri: uriOf(dir), name: path.basename(dir) }],
    capabilities: {},
    initializationOptions,
  });
  client.notify('initialized', {});
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const stop = async () => {
    await client.request('shutdown', null);
    client.notify('exit');
    return exited;
  };
  const open = (file, text, version = 1) => client.notify('textDocument/didOpen', {
    textDocument: { uri: uriOf(file), languageId: 'javascript', version, text: text ?? fs.readFileSync(file, 'utf8') },
  });
  return { child, client, init, diagnostics, diagsOf, notes, waitFor, stop, open, stderr: () => stderr };
}

const APP_JS = [
  "const express = require('express');",
  'function handler(req, res) {',
  '  if (req.query.a == 1) { res.send(1); }',
  '  var count = 0;',
  '  eval(req.query.code);',
  '  return count;',
  '}',
  'module.exports = handler;',
  '',
].join('\n');

test('the JSON-RPC reader splits concatenated and partial Content-Length frames', () => {
  const got = [];
  const feed = createReader((m) => got.push(m));
  const a = encode({ jsonrpc: '2.0', id: 1, method: 'a', params: { s: '한글' } });
  const b = encode({ jsonrpc: '2.0', method: 'b' });
  const both = Buffer.concat([a, b]);
  feed(both.slice(0, 7));
  feed(both.slice(7, a.length + 3));
  feed(both.slice(a.length + 3));
  assert.equal(got.length, 2);
  assert.equal(got[0].params.s, '한글');
  assert.equal(got[1].method, 'b');
});

test('settings normalize from initializationOptions and didChangeConfiguration shapes', () => {
  const cfg = normalize({ settings: { mycodechecker: { language: 'ko', inactiveRules: 'a:b, c:d', connected: { serverUrl: 'http://x' } } } });
  assert.equal(cfg.language, 'ko');
  assert.deepEqual(cfg.inactiveRules, ['a:b', 'c:d']);
  assert.equal(cfg.connected.enabled, true);
  const next = normalize({ debounceMs: 50 }, cfg);
  assert.equal(next.language, 'ko');
  assert.equal(next.debounceMs, 50);
});

test('incremental text changes apply to the right offsets', () => {
  const t = 'ab\ncd\nef';
  assert.equal(applyRangeChange(t, { start: { line: 1, character: 1 }, end: { line: 2, character: 0 } }, 'X'), 'ab\ncXef');
});

test('built-in quick fixes and NOMCC suppression edits', () => {
  const lines = ['if (a == b && c != d) { s = "x == y"; }  ', 'var n = 1;', 'except:', '    x = 1  # note'];
  const eq = fixesFor({ rule: 'js:eqeq', line: 1 }, lines)[0];
  assert.deepEqual(eq.edits.map((e) => [e.column, e.text]), [[7, '==='], [17, '!==']]);
  const trail = fixesFor({ rule: 'common:trailing-space', line: 1 }, lines)[0];
  assert.deepEqual([trail.edits[0].column, trail.edits[0].endColumn, trail.edits[0].text], [40, 42, '']);
  assert.equal(fixesFor({ rule: 'js:var', line: 2 }, lines)[0].edits[0].text, 'let');
  assert.equal(fixesFor({ rule: 'py:bare-except', line: 3 }, lines)[0].edits[0].text, ' Exception');
  assert.deepEqual(fixesFor({ rule: 'js:unknown', line: 1 }, lines), []);
  // Analyzer-provided fixes come first.
  const custom = { title: { en: 'X', ko: 'X' }, edits: [{ line: 1, column: 1, endLine: 1, endColumn: 2, text: 'y' }] };
  assert.equal(fixesFor({ rule: 'js:eqeq', line: 1, fix: custom }, lines)[0], custom);
  assert.equal(suppressionEdit({ rule: 'js:var', line: 2, file: 'a.js' }, lines, 'a.js').text, ' // NOMCC');
  assert.equal(suppressionEdit({ rule: 'py:x', line: 4, file: 'a.py' }, lines, 'a.py').text, ' NOMCC');
  assert.equal(suppressionEdit({ rule: 'py:x', line: 3, file: 'a.py' }, lines, 'a.py').text, ' # NOMCC');
  assert.equal(suppressionEdit({ rule: 'json:x', line: 1, file: 'a.json' }, lines, 'a.json'), null);
});

test('connected-mode helpers pick the profile and hide resolved issues', () => {
  const ws = { profiles: [
    { id: 'js-checker-way', name: 'Strict JS', language: 'js', inactive: ['js:var'], overrides: { 'js:eqeq': 'BLOCKER' } },
    { id: 'py-way', name: 'Py', language: 'py', inactive: ['py:bare-except'] },
    { id: 'all', name: 'All', language: '*', inactive: ['common:trailing-space'] },
  ] };
  const named = profileFor(ws, 'strict js');
  assert.deepEqual(named.inactive.sort(), ['common:trailing-space', 'js:var']);
  assert.equal(named.overrides['js:eqeq'], 'BLOCKER');
  assert.equal(profileFor(ws, '').inactive.length, 3);
  const s = suppressedFrom({ k1: { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' }, k2: { status: 'OPEN' }, 'cid:7': { resolution: 'WONTFIX' } });
  assert.deepEqual([...s.keys], ['k1']);
  assert.deepEqual([...s.cids], ['7']);
});

test('language server over stdio: diagnostics, hover, code actions, commands, shutdown', async (t) => {
  const dir = workspace({ 'src/app.js': APP_JS, 'gen/skip.js': 'var x = 1;\n' });
  const app = path.join(dir, 'src', 'app.js');
  const srv = await startServer(dir, { language: 'en', debounceMs: 30 });
  try {
    await t.test('initialize advertises the features', () => {
      const caps = srv.init.capabilities;
      assert.equal(caps.textDocumentSync.change, 1);
      assert.equal(caps.hoverProvider, true);
      assert.deepEqual(caps.codeActionProvider.codeActionKinds, ['quickfix']);
      assert.ok(caps.executeCommandProvider.commands.includes('mycodechecker.deactivateRule'));
      assert.equal(srv.init.serverInfo.name, 'MyCodeChecker');
    });

    await t.test('didOpen publishes diagnostics with codes, severities and taint flow steps', async () => {
      srv.open(app);
      await srv.waitFor(() => srv.diagsOf(app), 'app.js diagnostics');
      const diags = srv.diagsOf(app);
      const eq = diags.find((d) => d.code === 'js:eqeq');
      assert.ok(eq, 'js:eqeq reported');
      assert.equal(eq.range.start.line, 2);
      assert.equal(eq.severity, 2);
      assert.equal(eq.source, 'MyCodeChecker');
      assert.equal(eq.message, 'Loose equality');
      assert.ok(eq.data.key);
      const taint = diags.find((d) => d.code === 'taint:code');
      assert.ok(taint, 'taint:code reported');
      assert.equal(taint.severity, 1);
      assert.equal(taint.range.start.line, 4);
      assert.ok(taint.relatedInformation.some((r) => /^source: /.test(r.message) && r.location.range.start.line === 4));
      assert.ok(diags.find((d) => d.code === 'js:var' && d.range.start.line === 3));
    });

    await t.test('hover shows the rule description', async () => {
      const hover = await srv.client.request('textDocument/hover', { textDocument: { uri: uriOf(app) }, position: { line: 3, character: 4 } });
      assert.equal(hover.contents.kind, 'markdown');
      assert.match(hover.contents.value, /var declaration/);
      assert.match(hover.contents.value, /Why is this an issue\?/);
      const none = await srv.client.request('textDocument/hover', { textDocument: { uri: uriOf(app) }, position: { line: 7, character: 0 } });
      assert.equal(none, null);
    });

    await t.test('code actions offer a quick fix, NOMCC and rule deactivation', async () => {
      const eq = srv.diagsOf(app).find((d) => d.code === 'js:eqeq');
      const actions = await srv.client.request('textDocument/codeAction', {
        textDocument: { uri: uriOf(app) }, range: eq.range, context: { diagnostics: [eq] },
      });
      const fix = actions.find((a) => a.isPreferred);
      assert.match(fix.title, /strict equality/);
      const edits = Object.values(fix.edit.changes)[0];
      assert.deepEqual(edits, [{ range: { start: { line: 2, character: 18 }, end: { line: 2, character: 20 } }, newText: '===' }]);
      const sup = actions.find((a) => /NOMCC/.test(a.title));
      assert.equal(Object.values(sup.edit.changes)[0][0].newText, ' // NOMCC');
      const deact = actions.find((a) => a.command && a.command.command === 'mycodechecker.deactivateRule');
      assert.deepEqual(deact.command.arguments, ['js:eqeq']);
      assert.ok(actions.some((a) => a.command && a.command.command === 'mycodechecker.showRuleDescription'));
    });

    await t.test('deactivating a rule hides it and tells the client to persist the setting', async () => {
      const r = await srv.client.request('workspace/executeCommand', { command: 'mycodechecker.deactivateRule', arguments: ['js:var'] });
      assert.deepEqual(r.inactiveRules, ['js:var']);
      await srv.waitFor(() => !srv.diagsOf(app).some((d) => d.code === 'js:var'), 'js:var hidden');
      assert.ok(srv.notes.some((n) => n.method === 'mycodechecker/settingsChanged' && n.params.inactiveRules.includes('js:var')));
    });

    await t.test('didChange re-analyzes after the debounce and carries the version', async () => {
      const fixed = APP_JS.replace('req.query.a == 1', 'req.query.a === 1');
      srv.client.notify('textDocument/didChange', { textDocument: { uri: uriOf(app), version: 2 }, contentChanges: [{ text: fixed }] });
      await srv.waitFor(() => {
        const p = srv.diagnostics.get(path.normalize(app).toLowerCase());
        return p && p.version === 2;
      }, 'version 2 diagnostics');
      assert.ok(!srv.diagsOf(app).some((d) => d.code === 'js:eqeq'));
      assert.ok(srv.diagsOf(app).some((d) => d.code === 'taint:code'));
    });

    await t.test('switching to Korean changes messages and hover text', async () => {
      srv.client.notify('workspace/didChangeConfiguration', { settings: { mycodechecker: { language: 'ko', inactiveRules: ['js:var'], debounceMs: 30 } } });
      await srv.waitFor(() => (srv.diagsOf(app) || []).some((d) => /외부 입력/.test(d.message)), 'Korean diagnostics');
      const desc = await srv.client.request('mycodechecker/ruleDescription', { rule: 'js:eqeq' });
      assert.equal(desc.title, '느슨한 동등 비교');
      assert.match(desc.markdown, /고치는 방법/);
      assert.equal(desc.name.en, 'Loose equality');
    });

    await t.test('rule descriptions include standards mappings', async () => {
      const meta = listRules().find((r) => r.standards && r.standards.misraC2012);
      const desc = await srv.client.request('mycodechecker/ruleDescription', { rule: meta.key, language: 'en' });
      assert.ok(desc.known);
      assert.ok(desc.standards.some((s) => s.label === 'MISRA C:2012' && s.value === meta.standards.misraC2012));
      const unknown = await srv.client.request('mycodechecker/ruleDescription', { rule: 'nope:nothing' });
      assert.equal(unknown.known, false);
    });

    await t.test('exclusions drop a file from analysis', async () => {
      const skip = path.join(dir, 'gen', 'skip.js');
      srv.client.notify('workspace/didChangeConfiguration', { settings: { mycodechecker: { language: 'en', exclusions: ['gen/**'], debounceMs: 30 } } });
      srv.open(skip);
      await srv.client.request('mycodechecker/analyzeFile', { uri: uriOf(skip) });
      assert.ok(!(srv.diagsOf(skip) || []).length);
    });

    await t.test('unknown requests get MethodNotFound', async () => {
      await assert.rejects(srv.client.request('textDocument/definition', {}), (err) => err.code === -32601);
    });
  } finally {
    const code = await srv.stop();
    assert.equal(code, 0);
    assert.equal(srv.stderr(), '');
  }
});

test('workspace analysis finds cross-file taint, reads the settings file, and re-analyzes linked files incrementally', async () => {
  const dir = workspace({
    'util.js': "const cp = require('child_process');\nfunction run(cmd) {\n  cp.exec(cmd);\n}\nmodule.exports = { run };\n",
    'app.js': "const util = require('./util');\nfunction handler(req, res) {\n  util.run(req.query.cmd);\n}\nmodule.exports = handler;\n",
  });
  const util = path.join(dir, 'util.js');
  const app = path.join(dir, 'app.js');
  fs.mkdirSync(path.join(dir, '.mycodechecker'));
  fs.writeFileSync(path.join(dir, '.mycodechecker', 'lsp.json'), JSON.stringify({ language: 'ko' }));
  const srv = await startServer(dir, { debounceMs: 20 });
  try {
    const summary = await srv.client.request('mycodechecker/analyzeWorkspace', {});
    assert.equal(summary.files, 2);
    const cmdi = (srv.diagsOf(util) || []).find((d) => d.code === 'taint:cmdi');
    assert.ok(cmdi, 'cross-file taint reported in util.js');
    assert.ok(cmdi.relatedInformation.some((r) => same(r.location.uri, uriOf(app)) && r.location.range.start.line === 2));

    const sec = await srv.client.request('mycodechecker/securityFindings', { kind: 'taint' });
    assert.equal(sec.analyzed, true);
    const item = sec.items.find((i) => i.rule === 'taint:cmdi');
    assert.equal(item.category, 'taint');
    assert.match(item.message, /외부 입력/, 'language comes from .mycodechecker/lsp.json');
    assert.ok(item.flows.some((f) => f.file === 'app.js' && f.tag === 'source'));

    srv.open(app);
    srv.client.notify('textDocument/didChange', {
      textDocument: { uri: uriOf(app), version: 2 },
      contentChanges: [{ text: "const util = require('./util');\nfunction handler(req, res) {\n  util.run('ls');\n}\nmodule.exports = handler;\n" }],
    });
    await srv.waitFor(() => !(srv.diagsOf(util) || []).some((d) => d.code === 'taint:cmdi'), 'taint cleared in util.js');
    assert.ok((srv.diagsOf(util) || []).some((d) => d.code === 'js:child-process'), 'single-file issues of util.js stay');
  } finally {
    assert.equal(await srv.stop(), 0);
  }
});

function stubServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const out = handler(req, body);
        res.writeHead(out.status || 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out.body));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('connected mode applies the server profile and hides issues resolved on the server', async () => {
  const dir = workspace({ 'app.js': APP_JS });
  const app = path.join(dir, 'app.js');
  // The issue key the server would have computed for the same file.
  const local = analyzeSources([{ path: app, text: APP_JS }], { root: dir }).issues;
  const fpKey = local.find((i) => i.rule === 'js:eqeq').key;
  const calls = [];
  const server = await stubServer((req, body) => {
    calls.push({ url: req.url, auth: req.headers.authorization, body });
    if (req.headers.authorization !== 'Bearer secret') return { status: 401, body: { ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } } };
    if (req.url === '/api/ide.config') return { status: 404, body: { ok: false, error: { code: 'NO_METHOD', message: 'Unknown API: ide.config' } } };
    if (req.url === '/api/workspace.load') {
      return { body: { ok: true, data: {
        settings: { exclusions: [] },
        profiles: [{ id: 'all', name: 'Checker way', language: '*', inactive: ['js:var'], overrides: { 'taint:code': 'MINOR' } }],
        customRules: [],
        projects: [{ id: 'p1', key: 'demo', name: 'Demo', path: dir, issueState: { [fpKey]: { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' } } }],
      } } };
    }
    return { status: 404, body: { ok: false, error: { code: 'NO_METHOD', message: 'nope' } } };
  });
  const serverUrl = `http://127.0.0.1:${server.address().port}`;
  const srv = await startServer(dir, { language: 'en', connected: { enabled: true, serverUrl, token: 'secret' } });
  try {
    srv.open(app);
    await srv.waitFor(() => srv.diagsOf(app), 'diagnostics');
    const diags = srv.diagsOf(app);
    assert.ok(!diags.some((d) => d.code === 'js:var'), 'profile-inactive rule not reported');
    assert.ok(!diags.some((d) => d.code === 'js:eqeq'), 'false-positive issue hidden');
    const taint = diags.find((d) => d.code === 'taint:code');
    assert.equal(taint.severity, 3, 'server severity override applies');
    assert.equal(taint.codeDescription.href, `${serverUrl}/?rule=taint%3Acode`);
    assert.ok(calls.every((c) => c.auth === 'Bearer secret'));
    assert.ok(calls.some((c) => c.url === '/api/workspace.load'));

    const status = await srv.client.request('mycodechecker/connectedStatus', {});
    assert.equal(status.connected, true);
    assert.equal(status.project.key, 'demo');
    assert.equal(status.suppressedIssues, 1);
    const link = await srv.client.request('mycodechecker/issueLink', { key: fpKey });
    assert.equal(link.url, `${serverUrl}/?project=p1&issue=${fpKey}`);

    // A rule switched back on locally beats the profile.
    srv.client.notify('workspace/didChangeConfiguration', { settings: { mycodechecker: { activeRules: ['js:var'], connected: { enabled: true, serverUrl, token: 'secret' } } } });
    await srv.waitFor(() => (srv.diagsOf(app) || []).some((d) => d.code === 'js:var'), 'js:var back');

    // A wrong token reports the error and drops back to standalone.
    srv.client.notify('workspace/didChangeConfiguration', { settings: { mycodechecker: { activeRules: [], connected: { enabled: true, serverUrl, token: 'wrong' } } } });
    await srv.waitFor(() => (srv.diagsOf(app) || []).some((d) => d.code === 'js:eqeq'), 'standalone diagnostics');
    const bad = await srv.client.request('mycodechecker/connectedStatus', {});
    assert.equal(bad.connected, false);
    assert.match(bad.error, /Unauthorized/);
  } finally {
    assert.equal(await srv.stop(), 0);
    server.close();
  }
});

// Minimal zip reader for the .vsix check (central directory -> entries).
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'end of central directory');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    assert.equal(buf.readUInt32LE(off), 0x04034b50);
    const lnlen = buf.readUInt16LE(off + 26);
    const lelen = buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    assert.equal(data.length, size, name);
    entries.set(name, { data, crc, method });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}

test('the .vsix builder writes a valid zip with the extension and the bundled core', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-vsix-'));
  const result = buildVsix({ outDir: out });
  assert.match(path.basename(result.file), /^mycodechecker-\d+\.\d+\.\d+\.vsix$/);
  const zip = readZip(fs.readFileSync(result.file));
  for (const name of ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', 'extension/extension.js',
    'extension/rpc.js', 'extension/README.md', 'extension/server/core/lsp/server.js', 'extension/server/core/analyze.js']) {
    assert.ok(zip.has(name), name);
  }
  if (typeof zlib.crc32 === 'function') {
    for (const [name, e] of zip) assert.equal(zlib.crc32(e.data) >>> 0, e.crc, `crc ${name}`);
  }
  const pkg = JSON.parse(zip.get('extension/package.json').data.toString('utf8'));
  assert.equal(pkg.main, './extension.js');
  assert.ok(pkg.contributes.commands.some((c) => c.command === 'mycodechecker.toggleConnectedMode'));
  const manifest = zip.get('extension.vsixmanifest').data.toString('utf8');
  assert.match(manifest, new RegExp(`Id="mycodechecker" Version="${pkg.version}" Publisher="${pkg.publisher}"`));
  assert.match(manifest, /Microsoft\.VisualStudio\.Code\.Manifest" Path="extension\/package\.json"/);
  assert.match(zip.get('[Content_Types].xml').data.toString('utf8'), /Extension="\.js" ContentType="application\/javascript"/);
  assert.equal(zip.get('extension/extension.js').data.toString('utf8'), fs.readFileSync(path.join(root, 'ide', 'vscode', 'extension.js'), 'utf8'));
  assert.ok(![...zip.keys()].some((n) => n.endsWith('.md') && n.startsWith('extension/server/')));

  const slim = buildVsix({ outDir: path.join(out, 'slim'), bundleCore: false });
  const slimZip = readZip(fs.readFileSync(slim.file));
  assert.ok(![...slimZip.keys()].some((n) => n.startsWith('extension/server/')));
  fs.rmSync(out, { recursive: true, force: true });
});
