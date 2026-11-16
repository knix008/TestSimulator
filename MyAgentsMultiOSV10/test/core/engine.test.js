import test from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../../core/app.js';
import { defaultConfig } from '../../core/nodes/defs.js';
import { calculate, runCode } from '../../core/nodes/runtime.js';

const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1, samples: false });
test.after(() => core.close());

let seq = 0;
function graph(nodes, links) {
  return {
    id: `t${(seq += 1)}`, name: 'test',
    nodes: nodes.map(([id, type, config = {}, extra = {}]) => ({ id, type, name: extra.name ?? id, x: 0, y: 0, config: { ...defaultConfig(type), ...config }, ...extra })),
    edges: links.map(([from, to, fromPort = 'out'], i) => ({ id: `e${i}`, from, fromPort, to, toPort: 'in' })),
  };
}
const run = (agent, trigger = { kind: 'manual' }, options) => core.engine.runAndWait(agent, trigger, options);

test('a straight flow: trigger → template → respond', async () => {
  const r = await run(graph([['t', 'trigger.manual', { sample: '{"name":"Kim"}' }], ['x', 'logic.template', { template: 'Hi {{ input.name }}' }], ['o', 'out.respond', { value: '{{ input.text }}!' }]], [['t', 'x'], ['x', 'o']]));
  assert.equal(r.status, 'succeeded');
  assert.equal(r.output, 'Hi Kim!');
  assert.deepEqual(r.steps.map((s) => s.nodeId), ['t', 'x', 'o']);
  assert.ok(r.steps.every((s) => s.status === 'succeeded' && s.endedAt >= s.startedAt));
});

test('If sends to true or false; only that branch runs', async () => {
  const g = graph([['t', 'trigger.manual'], ['if', 'logic.if', { conditions: [{ left: '{{ input.n }}', op: 'gt', right: '10' }] }], ['big', 'logic.template', { template: 'big' }], ['small', 'logic.template', { template: 'small' }]], [['t', 'if'], ['if', 'big', 'true'], ['if', 'small', 'false']]);
  assert.equal((await run(g, { kind: 'manual', payload: { n: 50 } })).output.text, 'big');
  const r = await run(g, { kind: 'manual', payload: { n: 3 } });
  assert.equal(r.output.text, 'small');
  assert.ok(!r.steps.some((s) => s.nodeId === 'big'));
});

test('Switch routes by value, default otherwise', async () => {
  const g = graph([['t', 'trigger.manual'], ['sw', 'logic.switch', { value: '{{ input.kind }}', cases: ['a', 'b'] }], ['A', 'logic.template', { template: 'A' }], ['D', 'logic.template', { template: 'D' }]], [['t', 'sw'], ['sw', 'A', 'a'], ['sw', 'D', 'default']]);
  assert.equal((await run(g, { kind: 'manual', payload: { kind: 'A' } })).output.text, 'A');
  assert.equal((await run(g, { kind: 'manual', payload: { kind: 'zzz' } })).output.text, 'D');
});

test('Loop runs the item branch per item and collects the results on done', async () => {
  const g = graph([['t', 'trigger.manual'], ['l', 'logic.loop', { items: '{{ input.list }}' }], ['x', 'logic.template', { template: '{{ index }}:{{ item }}' }], ['o', 'out.respond', { value: '{{ input.items | pluck:"text" | join:"," }}' }]], [['t', 'l'], ['l', 'x', 'item'], ['l', 'o', 'done']]);
  const r = await run(g, { kind: 'manual', payload: { list: ['a', 'b', 'c'] } });
  assert.equal(r.status, 'succeeded');
  assert.equal(r.output, '0:a,1:b,2:c');
  assert.deepEqual(r.steps.filter((s) => s.nodeId === 'x').map((s) => s.loop.index), [0, 1, 2]);
});

test('Merge waits for every branch', async () => {
  const g = graph([['t', 'trigger.manual'], ['a', 'logic.template', { template: 'A' }, { name: 'A' }], ['b', 'logic.wait', { seconds: 0 }, { name: 'B' }], ['m', 'logic.merge', { mode: 'object' }]], [['t', 'a'], ['t', 'b'], ['a', 'm'], ['b', 'm']]);
  const r = await run(g, { kind: 'manual', payload: { z: 1 } });
  assert.deepEqual(Object.keys(r.output).sort(), ['A', 'B']);
  assert.equal(r.steps.filter((s) => s.nodeId === 'm').length, 1);
});

test('errors: stop the run, continue, or go to the error port; retries', async () => {
  const bad = (onError, retries = 0) => graph([['t', 'trigger.manual'], ['c', 'logic.code', { code: 'throw new Error("boom")', onError, retries, retryDelay: 0 }], ['ok', 'logic.template', { template: 'next' }], ['err', 'logic.template', { template: 'handled {{ input.error.message }}' }]], [['t', 'c'], ['c', 'ok'], ['c', 'err', 'error']]);
  const stopped = await run(bad('stop', 2));
  assert.equal(stopped.status, 'failed');
  assert.match(stopped.error.message, /boom/);
  assert.equal(stopped.error.nodeId, 'c');
  assert.equal(stopped.steps.find((s) => s.nodeId === 'c').attempt, 2);
  const cont = await run(bad('continue'));
  assert.equal(cont.status, 'succeeded');
  assert.equal(cont.output.text, 'next');
  const branch = await run(bad('branch'));
  assert.equal(branch.output.text, 'handled CODE_ERROR'.replace('CODE_ERROR', 'Error: boom'));
});

test('disabled nodes pass their input through; pinned nodes do not run', async () => {
  const g = graph([['t', 'trigger.manual'], ['c', 'logic.code', { code: 'return 1' }, { disabled: true }], ['p', 'logic.code', { code: 'throw new Error("must not run")' }, { pinned: { fixed: true } }]], [['t', 'c'], ['c', 'p']]);
  const r = await run(g, { kind: 'manual', payload: { v: 9 } });
  assert.equal(r.status, 'succeeded');
  assert.equal(r.steps[1].status, 'skipped');
  assert.deepEqual(r.output, { fixed: true });
  assert.ok(r.steps[2].pinned);
});

test('Stop ends a run with success or failure', async () => {
  const ok = await run(graph([['t', 'trigger.manual'], ['s', 'logic.stop', { mode: 'success', message: 'done early' }], ['n', 'logic.template']], [['t', 's'], ['s', 'n']]));
  assert.equal(ok.status, 'succeeded');
  const bad = await run(graph([['t', 'trigger.manual'], ['s', 'logic.stop', { mode: 'error', message: 'nope' }]], [['t', 's']]));
  assert.equal(bad.status, 'failed');
  assert.equal(bad.error.message, 'nope');
});

test('approval pauses the run until it is answered', async () => {
  const g = graph([['t', 'trigger.manual'], ['a', 'human.approval', { message: 'ok?' }], ['y', 'logic.template', { template: 'yes {{ input.comment }}' }], ['n', 'logic.template', { template: 'no' }]], [['t', 'a'], ['a', 'y', 'approved'], ['a', 'n', 'rejected']]);
  const started = core.engine.start(g, { kind: 'manual', payload: {} });
  for (let i = 0; i < 100 && core.engine.get(started.id).status !== 'waiting'; i += 1) await new Promise((r) => setTimeout(r, 5));
  const waiting = core.engine.get(started.id);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.waiting.kind, 'approval');
  assert.throws(() => core.engine.resume('nope', {}), /not waiting/);
  core.engine.resume(started.id, { approved: true, comment: 'fine' });
  const done = await core.engine.wait(started.id);
  assert.equal(done.output.text, 'yes fine');
});

test('a run can be cancelled', async () => {
  const g = graph([['t', 'trigger.manual'], ['w', 'logic.wait', { seconds: 30 }]], [['t', 'w']]);
  const started = core.engine.start(g, { kind: 'manual' });
  await new Promise((r) => setTimeout(r, 20));
  core.engine.cancel(started.id);
  const done = await core.engine.wait(started.id);
  assert.equal(done.status, 'cancelled');
});

test('the AI agent calls built-in tools and nodes on its tools port (offline model)', async () => {
  const g = graph([['t', 'trigger.chat'], ['ag', 'ai.agent', { tools: ['calculator'], memory: false }], ['tool', 'logic.template', { template: 'looked up: {{ input.text }}' }, { name: 'lookup' }]], [['t', 'ag'], ['ag', 'tool', 'tools']]);
  const calc = await run(g, { kind: 'chat', payload: { message: 'what is 12*3?' } });
  assert.equal(calc.status, 'succeeded');
  assert.match(calc.output.text, /36/);
  assert.equal(calc.output.toolCalls[0].name, 'calculator');
  const viaNode = await run(g, { kind: 'chat', payload: { message: 'please lookup cats' } });
  assert.match(viaNode.output.text, /looked up: please lookup cats/);
  assert.ok(viaNode.steps.some((s) => s.nodeId === 'tool' && s.toolOf === 'ag'));
});

test('agent memory keeps the conversation of a session', async () => {
  const g = { ...graph([['t', 'trigger.chat'], ['ag', 'ai.agent', { tools: [], memory: true, memoryWindow: 10 }]], [['t', 'ag']]), id: 'mem-agent' };
  await run(g, { kind: 'chat', payload: { message: 'first' } }, { sessionId: 's1' });
  await run(g, { kind: 'chat', payload: { message: 'second' } }, { sessionId: 's1' });
  assert.equal(core.memory.get('mem-agent', 's1').length, 4);
  assert.equal(core.memory.get('mem-agent', 's2').length, 0);
});

test('classifier picks a category port; extractor returns the fields', async () => {
  const g = graph([['t', 'trigger.manual'], ['c', 'ai.classify', { input: '{{ input.text }}', categories: ['bug', 'feature'] }], ['b', 'logic.template', { template: 'B' }], ['o', 'logic.template', { template: 'O' }]], [['t', 'c'], ['c', 'b', 'bug'], ['c', 'o', 'other']]);
  assert.equal((await run(g, { kind: 'manual', payload: { text: 'app crash error' } })).output.text, 'B');
  assert.equal((await run(g, { kind: 'manual', payload: { text: 'hello there' } })).output.text, 'O');
  const e = graph([['t', 'trigger.manual'], ['x', 'ai.extract', { input: '{{ input.text }}', fields: [{ key: 'email', value: 'email' }, { key: 'amount', value: 'number' }] }]], [['t', 'x']]);
  const r = await run(e, { kind: 'manual', payload: { text: 'mail kim@example.com, amount: 1200' } });
  assert.deepEqual(r.output, { email: 'kim@example.com', amount: '1200' });
});

test('a missing API key fails the step with NO_API_KEY', async () => {
  const keyless = createCore({ mode: 'test', dataDir: null, env: {}, samples: false });
  const g = graph([['t', 'trigger.manual'], ['l', 'ai.llm', { model: 'anthropic:claude-opus-5-5' }]], [['t', 'l']]);
  const r = await keyless.engine.runAndWait(g, { kind: 'manual' });
  assert.equal(r.status, 'failed');
  assert.equal(r.error.code, 'NO_API_KEY');
  await keyless.close();
});

test('sub-agents run as their own runs', async () => {
  const child = core.agents.create(graph([['t', 'trigger.manual'], ['x', 'logic.template', { template: 'child got {{ input.text }}' }]], [['t', 'x']]));
  const parent = graph([['t', 'trigger.manual'], ['s', 'tool.subagent', { agent: child.id, input: '{{ input.text }}' }]], [['t', 's']]);
  const r = await run(parent, { kind: 'manual', payload: { text: 'hi' } });
  assert.equal(r.output.text, 'child got hi');
});

test('the code sandbox and the calculator', async () => {
  assert.equal(calculate('(2 + 3) * 4 ^ 2'), 80);
  assert.equal(calculate('sqrt(16) + pi * 0'), 4);
  assert.throws(() => calculate('process.exit()'), /Not an arithmetic/);
  assert.deepEqual(await runCode('return { n: input.a + 1 }', { input: { a: 1 } }), { n: 2 });
  await assert.rejects(() => runCode('while (true) {}', {}, { timeout: 50 }), /Script execution timed out|longer than/);
});

test('a graph with no trigger cannot start', () => {
  assert.throws(() => core.engine.start(graph([['x', 'logic.template']], []), { kind: 'manual' }), /no trigger/i);
});
