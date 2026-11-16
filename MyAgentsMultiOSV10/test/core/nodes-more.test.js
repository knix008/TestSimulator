// The node types added for data work and developers: each one against real input (no internet).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createCore } from '../../core/app.js';
import { defaultConfig } from '../../core/nodes/defs.js';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-more-'));
const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1, samples: false });
core.settings.update({ workDir: work, allowShell: true });
const posted = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { posted.push(JSON.parse(b)); res.writeHead(200); res.end('ok'); }); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
test.after(async () => { server.close(); await core.close(); fs.rmSync(work, { recursive: true, force: true }); });

const one = (type, config, payload = {}) => core.engine.runAndWait({ id: 'm', name: 'm', nodes: [{ id: 't', type: 'trigger.manual', name: 't', config: {} }, { id: 'x', type, name: 'X', config: { ...defaultConfig(type), ...config } }], edges: [{ id: 'e', from: 't', fromPort: 'out', to: 'x' }] }, { kind: 'manual', payload });
const out = async (...a) => { const r = await one(...a); assert.equal(r.status, 'succeeded', r.error?.message); return r.steps[1]; };

const rows = [{ region: 'Seoul', amount: 10, status: 'open' }, { region: 'Busan', amount: 30, status: 'closed' }, { region: 'Seoul', amount: 5, status: 'open' }];

test('CSV parse and stringify (quotes, numbers)', async () => {
  const s = await out('data.csv', { op: 'parse', value: '{{ input.csv }}' }, { csv: 'name,qty,note\n"Kim, Minji",3,"said ""hi"""\nLee,5,' });
  assert.deepEqual(s.output.items, [{ name: 'Kim, Minji', qty: 3, note: 'said "hi"' }, { name: 'Lee', qty: 5, note: '' }]);
  const back = await out('data.csv', { op: 'stringify', value: '{{ input.rows }}' }, { rows: [{ a: 1, b: 'x,y' }] });
  assert.equal(back.output.text, 'a,b\n1,"x,y"');
});

test('filter, sort, aggregate, dedupe', async () => {
  assert.equal((await out('data.filter', { items: '{{ input.rows }}', field: 'status', op: 'equals', value: 'open' }, { rows })).output.count, 2);
  assert.deepEqual((await out('data.sort', { items: '{{ input.rows }}', field: 'amount', order: 'desc', limit: 2 }, { rows })).output.items.map((r) => r.amount), [30, 10]);
  assert.deepEqual((await out('data.aggregate', { items: '{{ input.rows }}', groupBy: 'region', valueField: 'amount', fn: 'sum' }, { rows })).output.groups, { Seoul: 15, Busan: 30 });
  assert.equal((await out('data.aggregate', { items: '{{ input.rows }}', groupBy: '', valueField: 'amount', fn: 'avg' }, { rows })).output.value, 15);
  assert.equal((await out('data.dedupe', { items: '{{ input.rows }}', field: 'region' }, { rows })).output.count, 2);
});

test('split and regex', async () => {
  assert.deepEqual((await out('data.split', { value: '{{ input.t }}', mode: 'delimiter', delimiter: ';' }, { t: 'a; b ;c' })).output.items, ['a', 'b', 'c']);
  assert.equal((await out('data.split', { value: '{{ input.t }}', mode: 'paragraphs' }, { t: 'one\n\ntwo\n\n\nthree' })).output.count, 3);
  assert.deepEqual((await out('data.regex', { value: '{{ input.t }}' }, { t: 'mail kim@a.com and lee@b.org' })).output.items, ['kim@a.com', 'lee@b.org']);
  assert.equal((await out('data.regex', { value: '{{ input.t }}', pattern: '\\d+', op: 'replace', replacement: '#' }, { t: 'a1b22' })).output.text, 'a#b#');
  assert.equal((await one('data.regex', { pattern: '(' })).error.code, 'BAD_REGEX');
});

test('counter keeps its value in vars across a loop', async () => {
  const r = await core.engine.runAndWait({ id: 'c', name: 'c', nodes: [
    { id: 't', type: 'trigger.manual', name: 't', config: {} },
    { id: 'l', type: 'logic.loop', name: 'l', config: { ...defaultConfig('logic.loop'), items: '{{ input.list }}' } },
    { id: 'k', type: 'logic.counter', name: 'k', config: { name: 'seen', op: 'increment' } },
    { id: 'o', type: 'logic.template', name: 'o', config: { template: 'seen {{ vars.seen }}' } },
  ], edges: [{ id: 'a', from: 't', fromPort: 'out', to: 'l' }, { id: 'b', from: 'l', fromPort: 'item', to: 'k' }, { id: 'c', from: 'l', fromPort: 'done', to: 'o' }] }, { kind: 'manual', payload: { list: [1, 2, 3] } });
  assert.equal(r.output.text, 'seen 3');
});

test('summarize, translate and sentiment (offline model)', async () => {
  assert.ok((await out('ai.summarize', { input: 'First point. Second point. Third point. Fourth.' })).output.text.length > 0);
  assert.equal((await out('ai.translate', { input: 'hello', to: 'Korean' })).output.to, 'Korean');
  const s = await out('ai.sentiment', { input: '{{ input.t }}' }, { t: 'thanks, this is great' });
  assert.equal(s.port, 'positive');
});

test('run tests: pass and fail counts and the port', async () => {
  const dir = path.join(work, 'proj');
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'test', 'a.test.mjs'), "import test from 'node:test'; import assert from 'node:assert'; test('ok', () => assert.ok(true)); test('bad', () => assert.equal(1, 2));");
  const s = await out('tool.test', { command: '"{{ env.node }}" --test', cwd: 'proj', kind: 'unit' });
  assert.deepEqual([s.output.passed, s.output.failed, s.port], [1, 1, 'failed']);
  fs.writeFileSync(path.join(dir, 'test', 'a.test.mjs'), "import test from 'node:test'; test('ok', () => {});");
  const g = await out('tool.test', { command: '"{{ env.node }}" --test', cwd: 'proj' });
  assert.deepEqual([g.output.passed, g.output.failed, g.port], [1, 0, 'passed']);
});

test('read project: files with contents, node_modules skipped', async () => {
  const dir = path.join(work, 'repo');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(dir, 'README.md'), '# hi');
  fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'i.js'), 'skip');
  const s = await out('tool.project', { path: 'repo', include: 'js,md' });
  assert.deepEqual(s.output.tree.sort(), ['README.md', 'src/a.js']);
});

test('git: init, commit and log in a work folder', async (t) => {
  try { execSync('git --version', { stdio: 'ignore' }); } catch { t.skip('git is not installed'); return; }
  fs.mkdirSync(path.join(work, 'g'), { recursive: true });
  fs.writeFileSync(path.join(work, 'g', 'f.txt'), 'x');
  await out('tool.git', { op: 'init', cwd: 'g' });
  execSync('git config user.email a@b.c && git config user.name test', { cwd: path.join(work, 'g') });
  const c = await out('tool.git', { op: 'commit', cwd: 'g', message: 'feat: first' });
  assert.equal(c.output.code, 0, c.output.stderr);
  assert.match((await out('tool.git', { op: 'log', cwd: 'g' })).output.stdout, /feat: first/);
});

test('SQLite: create, insert, select in the work folder', async () => {
  const s = await out('tool.sqlite', { database: 'db/t.db', sql: "CREATE TABLE IF NOT EXISTS n (id INTEGER PRIMARY KEY, t TEXT);\nINSERT INTO n (t) VALUES ('{{ input.text }}');\nSELECT t FROM n" }, { text: 'hello' });
  assert.deepEqual(s.output.rows, [{ t: 'hello' }]);
  assert.ok(fs.existsSync(path.join(work, 'db', 't.db')));
  assert.equal((await one('tool.sqlite', { database: 'db/t.db', sql: 'SELEKT nope' })).error.code, 'SQL_ERROR');
});

test('team chat message: Slack and Discord bodies', async () => {
  const url = `http://127.0.0.1:${server.address().port}/hook`;
  await out('tool.chatops', { service: 'slack', url, text: 'build ok' });
  await out('tool.chatops', { service: 'discord', url, text: 'deployed' });
  assert.deepEqual(posted, [{ text: 'build ok' }, { content: 'deployed' }]);
});

test('the File node hands on what it wrote', async () => {
  const s = await out('tool.file', { op: 'write', path: 'out/a.txt', content: 'line 1\nline 2' });
  assert.deepEqual([s.output.file, s.output.text, s.output.op], ['out/a.txt', 'line 1\nline 2', 'write']);
});
