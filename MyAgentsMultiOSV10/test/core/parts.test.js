import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCore } from '../../core/app.js';
import { chunkText, tokenize, htmlToText } from '../../core/knowledge.js';
import { parseCron, nextFire } from '../../core/scheduler.js';
import { planFromKeywords, buildFromDescription } from '../../core/builder.js';
import { findProblems } from '../../core/validate.js';
import { normalizeAgent } from '../../core/services.js';
import { TEMPLATES, buildTemplate } from '../../core/templates.js';
import { NODE_TYPES, outputPorts } from '../../core/nodes/defs.js';
import { EXECUTORS } from '../../core/nodes/runtime.js';
import { parseJsonAnswer, parseModelRef } from '../../core/providers/index.js';

test('every node type has an executor (notes excepted) and valid ports', () => {
  for (const d of NODE_TYPES) {
    if (d.note) continue;
    assert.equal(typeof EXECUTORS[d.type], 'function', d.type);
    assert.ok(Array.isArray(outputPorts({ type: d.type, config: {} })), d.type);
    assert.ok(d.label.ko && d.label.en && d.desc.ko && d.desc.en, `${d.type} has texts in both languages`);
  }
  assert.deepEqual(outputPorts({ type: 'ai.classify', config: { categories: ['a', 'b'] } }), ['a', 'b', 'other']);
  assert.deepEqual(outputPorts({ type: 'logic.code', config: { onError: 'branch' } }), ['out', 'error']);
});

test('knowledge: chunks, Korean tokens, BM25 ranking', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Sentence ${i} about topic ${i % 3}.`).join(' ');
  const chunks = chunkText(text, 200, 40);
  assert.ok(chunks.length > 3 && chunks.every((c) => c.length <= 240));
  assert.ok(tokenize('환불정책 안내').includes('§환불'));
  assert.equal(htmlToText('<p>a&amp;b</p><script>x</script>'), 'a&b');
  const core = createCore({ mode: 'test', dataDir: null, samples: false });
  const kb = core.knowledge.create({ name: 'K' });
  core.knowledge.addDocument(kb.id, { name: 'refund.md', text: '환불은 14일 이내에 가능합니다. Refunds within 14 days.' });
  core.knowledge.addDocument(kb.id, { name: 'ship.md', text: '배송은 이틀 걸립니다. Shipping takes two days.' });
  assert.equal(core.knowledge.search([kb.id], '환불 정책', 2)[0].doc, 'refund.md');
  assert.equal(core.knowledge.search([kb.id], 'shipping', 2)[0].doc, 'ship.md');
  assert.throws(() => core.knowledge.addDocument(kb.id, { name: 'x.bin', text: '\u0000\u0001\u0002' }), /not a text file/);
  core.close();
});

test('schedules: cron fields, daily and interval times', () => {
  const m = parseCron('*/15 9-17 * * 1-5');
  assert.ok(m(new Date(2026, 10, 16, 9, 30)));
  assert.ok(!m(new Date(2026, 10, 15, 9, 30)), 'Sunday');
  assert.ok(!m(new Date(2026, 10, 16, 9, 31)));
  assert.throws(() => parseCron('* * *'), /5 fields/);
  const from = new Date(2026, 10, 16, 8, 0).getTime();
  assert.equal(new Date(nextFire({ mode: 'daily', time: '09:00' }, from)).getHours(), 9);
  assert.equal(nextFire({ mode: 'interval', minutes: 30 }, from) - from, 30 * 60000);
  assert.equal(new Date(nextFire({ mode: 'weekly', time: '10:00', weekday: '3' }, from)).getDay(), 3);
});

test('the keyword planner builds runnable drafts', async () => {
  const d = planFromKeywords('매일 아침 웹 페이지를 요약해서 파일로 저장하고 알림', 'ko');
  assert.deepEqual(d.nodes.map((n) => n.type), ['trigger.schedule', 'tool.web', 'ai.llm', 'tool.file', 'human.notify', 'out.respond']);
  const chat = planFromKeywords('A support chatbot that answers from our docs and asks for approval', 'en');
  assert.equal(chat.nodes[0].type, 'trigger.chat');
  assert.ok(chat.nodes.some((n) => n.type === 'kb.search') && chat.nodes.some((n) => n.type === 'human.approval'));
  const built = await buildFromDescription('translate text', { lang: 'en', model: 'mock:mock-1' });
  assert.equal(built.via, 'keywords');
  assert.ok(built.agent.nodes.length >= 3);
});

test('problems: no trigger, unreachable, missing key, unknown node in an expression', () => {
  const doc = normalizeAgent({ nodes: [
    { id: 'a', type: 'ai.llm', name: 'A', config: { model: 'openai:gpt-5', prompt: '{{ nodes.Nope.output }}' } },
  ], edges: [] });
  const codes = findProblems(doc, { ready: { openai: false } }).map((p) => p.code);
  assert.ok(codes.includes('noTrigger'));
  assert.ok(codes.includes('unreachable'));
  assert.ok(codes.includes('noKey'));
  assert.ok(codes.includes('unknownNode'));
});

test('every template builds in both languages, has no errors and runs offline', async () => {
  const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1 });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-tpl-'));
  core.settings.update({ workDir: work, allowShell: true });
  let ran = 0;
  for (const t of TEMPLATES) {
    for (const lang of ['ko', 'en']) {
      const doc = buildTemplate(t.id, lang);
      const agent = core.agents.create(doc);
      const errors = findProblems(agent, { ready: { mock: true }, kbIds: new Set(core.store.kbs.all().map((k) => k.id)), agentIds: new Set() }).filter((p) => p.severity === 'error');
      assert.deepEqual(errors, [], `${t.id}/${lang}`);
      // every template runs to the end, commands included; only those that need the internet are left out
      if (lang === 'en' && !agent.nodes.some((n) => n.type === 'tool.http' || n.type === 'tool.web')) {
        ran += 1;
        const trig = agent.nodes.find((n) => n.type.startsWith('trigger.'));
        const kind = trig.type.split('.')[1];
        const payload = kind === 'chat' ? { message: 'hello 2+2' } : kind === 'webhook' ? { body: { title: 'crash', body: 'error' } } : undefined;
        const started = core.engine.start(agent.id, { kind, payload });
        const timer = setInterval(() => { if (core.engine.get(started.id)?.status === 'waiting') core.engine.resume(started.id, { approved: true }); }, 5);
        const r = await core.engine.wait(started.id);
        clearInterval(timer);
        assert.equal(r.status, 'succeeded', `${t.id}: ${r.error?.message ?? ''}`);
        const bad = r.steps.filter((st) => st.status === 'failed' && !st.handled);
        assert.deepEqual(bad.map((st) => st.name), [], `${t.id}: failed steps`);
      }
    }
  }
  assert.ok(ran >= 88, `ran ${ran} templates`);
  assert.deepEqual(['pipeline', 'dev', 'office'].map((g) => TEMPLATES.filter((x) => x.group === g).length), [15, 40, 40]);
  await core.close();
  fs.rmSync(work, { recursive: true, force: true });
});

test('agents are stored as files and keep their revision', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-test-'));
  const core = createCore({ mode: 'test', dataDir: dir, samples: false });
  const a = core.agents.create({ name: 'Saved', nodes: [{ id: 't', type: 'trigger.manual', name: 'T' }] });
  assert.ok(fs.existsSync(path.join(dir, 'agents', `${a.id}.json`)));
  const b = core.agents.save(a.id, { ...a, name: 'Renamed' });
  assert.equal(b.rev, 2);
  assert.throws(() => core.agents.save(a.id, { ...a, rev: 1 }), /changed elsewhere/);
  const again = createCore({ mode: 'test', dataDir: dir, samples: false });
  assert.equal(again.agents.get(a.id).name, 'Renamed');
  const exported = again.agents.exportDoc(a.id);
  assert.equal(exported.format, 'myagents');
  assert.ok(!('hookSecret' in exported.agent));
  core.close(); again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('model answers: JSON inside text, provider refs', () => {
  assert.deepEqual(parseJsonAnswer('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonAnswer('result: {"b": [1,2]} end'), { b: [1, 2] });
  assert.equal(parseJsonAnswer('no json'), null);
  assert.deepEqual(parseModelRef('anthropic:claude-opus-5-5'), { provider: 'anthropic', model: 'claude-opus-5-5' });
  assert.deepEqual(parseModelRef('ollama'), { provider: 'ollama', model: 'llama3.2' });
  assert.equal(parseModelRef(''), null);
});
