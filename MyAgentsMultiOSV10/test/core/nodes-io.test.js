// The nodes of defs-more.js against real input: Read / Save in every format, conversion, the added AI,
// knowledge, flow, transform and developer nodes, and the Folder watch and After-another-agent triggers.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCore } from '../../core/app.js';
import { defaultConfig, NODE_TYPES } from '../../core/nodes/defs.js';
import { lineDiff, problemCount } from '../../core/nodes/runtime-more.js';
import { PNG } from '../helpers/png.mjs';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-io-'));
const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1, samples: false });
core.settings.update({ workDir: work, allowShell: true });
const server = http.createServer((req, res) => {
  if (req.url === '/feed.xml') { res.writeHead(200, { 'content-type': 'application/rss+xml' }); res.end('<rss><channel><title>News</title><item><title>First &amp; best</title><link>https://a.b/1</link><pubDate>Mon, 01 Jan 2026</pubDate><description><![CDATA[<p>Hello <b>there</b></p>]]></description></item><item><title>Second</title><link>https://a.b/2</link></item></channel></rss>'); return; }
  if (req.url === '/doc.pdf') { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end(core.__pdf); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { server.close(); await core.close(); fs.rmSync(work, { recursive: true, force: true }); });

const flow = (nodes, payload = {}) => core.engine.runAndWait({ id: 'f', name: 'f', nodes: [{ id: 't', type: 'trigger.manual', name: 't', config: {} }, ...nodes.map((n, i) => ({ id: `n${i}`, name: n.name ?? `N${i}`, type: n.type, config: { ...defaultConfig(n.type), ...n.config } }))], edges: nodes.map((_, i) => ({ id: `e${i}`, from: i ? `n${i - 1}` : 't', fromPort: nodes[i - 1]?.port ?? 'out', to: `n${i}` })) }, { kind: 'manual', payload });
const ok = async (...a) => { const r = await flow(...a); assert.equal(r.status, 'succeeded', r.error?.message); return r; };
const step = (r, i) => r.steps[i + 1];

test('the palette has a node of each new kind in every group', () => {
  const by = (c) => NODE_TYPES.filter((d) => d.category === c).length;
  assert.equal(NODE_TYPES.length, 70);
  for (const [c, n] of Object.entries({ trigger: 7, ai: 11, knowledge: 4, logic: 13, transform: 12, dev: 7, data: 11 })) assert.equal(by(c), n, c);
});

test('Save then Read: PDF, Word, Excel, HTML, Markdown, CSV, JSON, text and a picture', async () => {
  const md = '# 분기 보고\n\n- 매출 증가\n- 신규 고객 31';
  for (const format of ['pdf', 'docx', 'html', 'markdown', 'text']) {
    const r = await ok([{ type: 'io.write', config: { value: '{{ input.md }}', format, path: `out/report-${format}` } }, { type: 'io.read', config: { source: 'file', path: '{{ input.file }}' } }], { md });
    const w = step(r, 0).output;
    assert.ok(fs.existsSync(w.path), format);
    assert.match(w.file, new RegExp(`^out/report-${format}\\.(pdf|docx|html|md|txt)$`));
    const read = step(r, 1).output;
    assert.equal(read.format, format);
    assert.match(read.text, /분기 보고[\s\S]*신규 고객 31/, format);
  }
  const rows = [{ name: 'Kim', qty: 2 }, { name: 'Lee', qty: 5 }];
  for (const format of ['csv', 'xlsx', 'json']) {
    const r = await ok([{ type: 'io.write', config: { value: '{{ input.rows }}', format, path: `out/rows-${format}` } }, { type: 'io.read', config: { source: 'file', path: '{{ input.file }}' } }], { rows });
    assert.deepEqual(step(r, 1).output.items ?? step(r, 1).output.data, rows, format);
  }
  const pic = await ok([{ type: 'io.write', config: { value: '{{ input.url }}', format: 'image', path: 'out/pic' } }, { type: 'io.read', config: { source: 'file', path: '{{ input.file }}' } }], { url: `data:image/png;base64,${PNG.toString('base64')}` });
  assert.equal(step(pic, 0).output.file, 'out/pic.png');
  assert.deepEqual([step(pic, 1).output.width, step(pic, 1).output.height], [2, 3]);
});

test('Read from a URL, from typed text and from the previous step; Save to the next step only', async () => {
  core.__pdf = (await import('../../core/formats.js')).writePdf('웹 문서 본문');
  const url = await ok([{ type: 'io.read', config: { source: 'url', url: `${base}/doc.pdf` } }]);
  assert.equal(step(url, 0).output.format, 'pdf');
  assert.match(step(url, 0).output.text, /웹 문서 본문/);
  const typed = await ok([{ type: 'io.read', config: { source: 'text', text: 'a,b\n1,2', format: 'csv' } }]);
  assert.deepEqual(step(typed, 0).output.items, [{ a: 1, b: 2 }]);
  const prev = await ok([{ type: 'io.read', config: { source: 'input', value: '{{ input.html }}', format: 'html' } }], { html: '<h1>Hi</h1><p>there</p>' });
  assert.equal(step(prev, 0).output.markdown, '# Hi\n\nthere');
  const mem = await ok([{ type: 'io.write', config: { value: '# T', format: 'html', target: 'output' } }]);
  assert.ok(step(mem, 0).output.dataUrl.startsWith('data:text/html;base64,'));
  assert.match(step(mem, 0).output.text, /<h1>T<\/h1>/);
  const missing = await flow([{ type: 'io.read', config: { source: 'file', path: 'nope.pdf' } }]);
  assert.equal(missing.error.code, 'FILE_NOT_FOUND');
  const outside = await flow([{ type: 'io.write', config: { value: 'x', format: 'text', path: '../escape' } }]);
  assert.equal(outside.error.code, 'PATH_OUTSIDE');
});

test('Convert, Make a table, Calculated column, Pick columns, Flatten', async () => {
  const conv = await ok([{ type: 'data.convert', config: { value: '{{ input.md }}', from: 'markdown', to: 'html' } }], { md: '## Plan\n\n- a' });
  assert.match(step(conv, 0).output.html, /<h2>Plan<\/h2>[\s\S]*<li>a<\/li>/);
  const rows = [{ item: 'pen', price: 1.5, qty: 4 }, { item: 'pad', price: 3, qty: 2 }];
  const t = await ok([{ type: 'data.table', config: { items: '{{ input.rows }}', format: 'markdown' } }], { rows });
  assert.equal(step(t, 0).output.text.split('\n')[2], '| pen | 1.5 | 4 |');
  const m = await ok([{ type: 'data.math', config: { items: '{{ input.rows }}', field: 'total', formula: 'price * qty + 1' } }], { rows });
  assert.deepEqual(step(m, 0).output.items.map((r) => r.total), [7, 7]);
  const bad = await flow([{ type: 'data.math', config: { items: '{{ input.rows }}', formula: 'price * missing' } }], { rows });
  assert.equal(bad.error.code, 'BAD_FORMULA');
  const p = await ok([{ type: 'data.pick', config: { items: '{{ input.rows }}', fields: 'item as 품목, qty' } }], { rows });
  assert.deepEqual(step(p, 0).output.items[0], { 품목: 'pen', qty: 4 });
  const f = await ok([{ type: 'data.flatten', config: { items: '{{ input.rows }}' } }], { rows: [{ a: { b: 1, c: { d: 2 } }, e: [1] }] });
  assert.deepEqual(step(f, 0).output.items[0], { 'a.b': 1, 'a.c.d': 2, e: '[1]' });
});

test('Image analysis, Rewrite, Keywords, Ask a document (offline model)', async () => {
  const v = await ok([{ type: 'io.read', config: { source: 'input', value: '{{ input.url }}', format: 'image' } }, { type: 'ai.vision', config: { image: '{{ input }}', prompt: 'What is it?' } }], { url: `data:image/png;base64,${PNG.toString('base64')}` });
  assert.match(step(v, 1).output.text, /1 picture\(s\) received \(image\/png 2×3\)/);
  assert.deepEqual(step(v, 1).output.image, { mime: 'image/png', width: 2, height: 3 });
  assert.equal((await flow([{ type: 'ai.vision', config: { image: 'no picture' } }])).error.code, 'NO_IMAGE');
  const rw = await ok([{ type: 'ai.rewrite', config: { input: '{{ input.t }}', tone: 'concise' } }], { t: 'hello   there' });
  assert.equal(step(rw, 0).output.text, 'hello there');
  const kw = await ok([{ type: 'ai.keywords', config: { input: '{{ input.t }}', count: 2 } }], { t: 'invoice invoice payment payment payment late' });
  assert.deepEqual(step(kw, 0).output.keywords, ['payment', 'invoice']);
  const qa = await ok([{ type: 'ai.qa', config: { document: '{{ input.doc }}', question: '{{ input.q }}' } }], { doc: 'The office opens at 9. Parking is free on weekends.', q: 'Is parking free?' });
  assert.match(step(qa, 0).output.text, /Parking is free on weekends/);
});

test('Chunk text, and Answer from knowledge with sources', async () => {
  const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} is here.`).join(' ');
  const c = await ok([{ type: 'kb.chunk', config: { text: '{{ input.t }}', size: 200, overlap: 40 } }], { t: text });
  const chunks = step(c, 0).output.chunks;
  assert.ok(chunks.length >= 4);
  assert.ok(chunks.every((x) => x.text.length <= 200));
  assert.ok(chunks[1].start < chunks[0].start + chunks[0].text.length, 'chunks overlap');
  const kb = core.knowledge.create({ name: 'HR' });
  core.knowledge.addDocument(kb.id, { name: 'leave.txt', text: 'Annual leave is 15 days. Sick leave needs a note after 3 days.' });
  const a = await ok([{ type: 'kb.answer', config: { kbs: [kb.id], question: '{{ input.q }}' } }], { q: 'How many days of annual leave?' });
  assert.match(step(a, 0).output.text, /Annual leave is 15 days/);
  assert.deepEqual(step(a, 0).output.sources, ['leave.txt']);
});

test('A/B split, Quality gate, Batches', async () => {
  const a = await ok([{ type: 'logic.random', config: { percentA: 100 }, port: 'a' }, { type: 'logic.template', config: { template: 'went a' } }]);
  assert.equal(a.output.text, 'went a');
  const b = await ok([{ type: 'logic.random', config: { percentA: 0 }, port: 'b' }, { type: 'logic.template', config: { template: 'went b' } }]);
  assert.equal(b.output.text, 'went b');
  const pass = await flow([{ type: 'logic.assert', config: { left: '{{ input.failed }}', op: 'equals', right: '0' } }], { failed: 0 });
  assert.equal(pass.status, 'succeeded');
  const fail = await flow([{ type: 'logic.assert', config: { left: '{{ input.failed }}', op: 'equals', right: '0', message: '테스트 실패 {{ input.failed }}건' } }], { failed: 2 });
  assert.equal(fail.status, 'failed');
  assert.match(fail.error?.message ?? '', /테스트 실패 2건/);
  const bt = await ok([{ type: 'logic.batch', config: { items: '{{ input.list }}', size: 2 } }], { list: [1, 2, 3, 4, 5] });
  assert.deepEqual(step(bt, 0).output.batches, [[1, 2], [3, 4], [5]]);
});

test('Diff (same / changed ports), Lint and Build with real commands', async () => {
  const d = lineDiff('a\nb\nc', 'a\nB\nc\nd', 'x.txt');
  assert.deepEqual([d.added, d.removed], [2, 1]);
  assert.equal(d.diff.split('\n').slice(0, 3).join('|'), '--- a/x.txt|+++ b/x.txt|@@ -1,3 +1,4 @@');
  const same = await ok([{ type: 'dev.diff', config: { before: 'x', after: 'x' }, port: 'same' }, { type: 'logic.template', config: { template: 'same' } }]);
  assert.equal(same.output.text, 'same');
  assert.equal(problemCount('✖ 4 problems (3 errors, 1 warning)'), 4);
  assert.equal(problemCount('Found 2 errors.'), 2);
  fs.mkdirSync(path.join(work, 'app'), { recursive: true });
  fs.writeFileSync(path.join(work, 'app', 'good.mjs'), 'export const a = 1;\n');
  const lint = await ok([{ type: 'dev.lint', config: { command: '"{{ env.node }}" --check good.mjs', cwd: 'app' } }]);
  assert.equal(step(lint, 0).port, 'clean');
  fs.writeFileSync(path.join(work, 'app', 'bad.mjs'), 'export const = ;\n');
  const lint2 = await ok([{ type: 'dev.lint', config: { command: '"{{ env.node }}" --check bad.mjs', cwd: 'app' } }]);
  assert.equal(step(lint2, 0).port, 'problems');
  fs.writeFileSync(path.join(work, 'app', 'build.mjs'), "import fs from 'node:fs'; fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/app.js', 'ok'); fs.writeFileSync('dist/info.json', '{}');");
  const build = await ok([{ type: 'dev.build', config: { command: '"{{ env.node }}" build.mjs', cwd: 'app', artifacts: 'dist' } }]);
  assert.equal(step(build, 0).port, 'ok');
  assert.deepEqual(step(build, 0).output.artifacts.map((x) => x.file).sort(), ['app.js', 'info.json']);
  const broken = await ok([{ type: 'dev.build', config: { command: '"{{ env.node }}" -e "process.exit(3)"', cwd: 'app' } }]);
  assert.equal(step(broken, 0).port, 'failed');
});

test('RSS feed: titles, links, dates and plain-text summaries', async () => {
  const r = await ok([{ type: 'tool.rss', config: { url: `${base}/feed.xml`, limit: 5 } }]);
  const o = step(r, 0).output;
  assert.equal(o.title, 'News');
  assert.deepEqual(o.items[0], { title: 'First & best', link: 'https://a.b/1', date: 'Mon, 01 Jan 2026', summary: 'Hello there' });
  assert.equal(o.count, 2);
});

test('Folder watch: a manual run takes the newest file; a deployed agent starts on a new file', async () => {
  fs.mkdirSync(path.join(work, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(work, 'inbox', 'old.csv'), 'a\n1');
  await new Promise((r) => setTimeout(r, 20));
  fs.writeFileSync(path.join(work, 'inbox', 'new.csv'), 'a,b\n2,3');
  const doc = { name: 'watch', nodes: [{ id: 'w', type: 'trigger.file', name: 'w', config: { ...defaultConfig('trigger.file'), folder: 'inbox', pattern: '*.csv' } }, { id: 'o', type: 'logic.template', name: 'o', config: { template: '{{ trigger.name }}:{{ trigger.count }}' } }], edges: [{ id: 'e', from: 'w', fromPort: 'out', to: 'o' }] };
  const manual = await core.engine.runAndWait(doc, { kind: 'file', payload: {} });
  assert.equal(manual.output.text, 'new.csv:1');
  const agent = core.agents.create({ ...doc, deployed: true });
  assert.deepEqual(core.fileWatch.tick(), [], 'the first look only notes what is there');
  fs.writeFileSync(path.join(work, 'inbox', 'third.csv'), 'x\n1\n2\n3');
  const started = core.fileWatch.tick();
  assert.equal(started.length, 1);
  const run = await core.engine.wait(started[0].id);
  assert.equal(run.output.text, 'third.csv:3');
  assert.equal(run.agentId, agent.id);
  assert.deepEqual(core.fileWatch.tick(), [], 'a file starts one run');
  core.agents.remove(agent.id);
});

test('After another agent: a finished run starts the deployed follower once, with its output; chains stop', async () => {
  const first = core.agents.create({ name: 'first', nodes: [{ id: 't', type: 'trigger.manual', name: 't', config: {} }, { id: 'o', type: 'logic.template', name: 'o', config: { template: 'made by first' } }], edges: [{ id: 'e', from: 't', fromPort: 'out', to: 'o' }] });
  const follower = core.agents.create({ name: 'follower', deployed: true, nodes: [{ id: 'a', type: 'trigger.agent', name: 'a', config: { agent: first.id, status: 'succeeded' } }, { id: 'o', type: 'logic.template', name: 'o', config: { template: 'got: {{ trigger.output.text }}' } }], edges: [{ id: 'e', from: 'a', fromPort: 'out', to: 'o' }] });
  // a loop back to the first agent never runs
  core.agents.save(first.id, { ...core.agents.get(first.id), deployed: true, nodes: [...core.agents.get(first.id).nodes, { id: 'b', type: 'trigger.agent', name: 'b', config: { agent: follower.id, status: 'any' } }] });
  const started = core.engine.start(first.id, { kind: 'manual', payload: {} });
  await core.engine.wait(started.id);
  await new Promise((r) => setTimeout(r, 200));
  const runs = core.engine.list ? core.engine.list({ agentId: follower.id }) : core.store.runs.all().filter((r) => r.agentId === follower.id);
  const list = Array.isArray(runs) ? runs : runs.items;
  assert.equal(list.length, 1, 'the follower ran once');
  const done = await core.engine.wait(list[0].id);
  assert.equal(done.output.text, 'got: made by first');
  await new Promise((r) => setTimeout(r, 200));
  const firstRuns = core.store.runs.all().filter((r) => r.agentId === first.id);
  assert.equal(firstRuns.length, 1, 'no loop back to the first agent');
});
