// Engine plumbing of the app (no browser): the SharedArrayBuffer reply
// channel, output batching, the multi-line input rule, file:line links and
// the worker's message router driven with a stand-in session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChannel, createReplyWriter, readReply, createOutputBuffer, needsMoreInput, findFileLinks } from '../src/engine/protocol.js';
import { createEngineCore, ENGINE_MISSING, graphicsFlush } from '../src/engine/router.js';
import { createMemoryFs } from '../core/fs-memory.js';

test('reply channel: a small answer in one chunk', () => {
  const ch = createChannel(1024);
  assert.ok(ch, 'SharedArrayBuffer is available in Node');
  const w = createReplyWriter(ch);
  w.reply(7, { path: 'C:/x/y.m', n: 3 });
  assert.deepEqual(readReply(ch, 7, () => assert.fail('no second chunk')), { path: 'C:/x/y.m', n: 3 });
  w.reply(8, undefined);
  assert.equal(readReply(ch, 8, () => {}), null);
});

test('reply channel: a large answer in several chunks, UTF-8 intact', () => {
  const ch = createChannel(64);
  const w = createReplyWriter(ch);
  const text = '한글 텍스트 '.repeat(200) + 'end';
  w.reply(1, text);
  let asks = 0;
  const got = readReply(ch, 1, (id) => { asks += 1; assert.equal(id, 1); w.more(id); });
  assert.equal(got, text);
  assert.ok(asks > 10);
  assert.equal(w.busy, false);
});

test('output buffer: joins text, splits by stream, flushes on time', () => {
  const sent = [];
  let now = 0;
  const b = createOutputBuffer((m) => sent.push(m), { intervalMs: 30, now: () => now });
  b.print('a\n');
  b.print('b\n');
  b.print('oops\n', 'err');
  b.print('c\n');
  now = 100;
  b.print('d\n');
  b.flush();
  assert.deepEqual(sent, [
    { type: 'out', text: 'a\nb\n', stream: 'out' },
    { type: 'out', text: 'oops\n', stream: 'err' },
    { type: 'out', text: 'c\nd\n', stream: 'out' },
  ]);
});

test('needsMoreInput: open blocks, brackets and continuation lines', () => {
  assert.equal(needsMoreInput('x = 1'), false);
  assert.equal(needsMoreInput('for k = 1:3'), true);
  assert.equal(needsMoreInput('for k = 1:3\n  disp(k)\nend'), false);
  assert.equal(needsMoreInput('if a, b = 1; end'), false);
  assert.equal(needsMoreInput('function y = f(x)'), true);
  assert.equal(needsMoreInput('x = [1 2'), true);
  assert.equal(needsMoreInput('x = [1 2\n3 4]'), false);
  assert.equal(needsMoreInput('y = x(end)'), false);
  assert.equal(needsMoreInput("s = 'for if while'"), false);
  assert.equal(needsMoreInput('s = "end"'), false);
  assert.equal(needsMoreInput('% for loop in a comment'), false);
  assert.equal(needsMoreInput('a = 1 + ...'), true);
  assert.equal(needsMoreInput("b = a'; c = b'"), false);
  assert.equal(needsMoreInput('while true\n if x, break, end'), true);
});

test('findFileLinks: the usual error location forms', () => {
  const t1 = 'Error in myfun.m:12 something';
  const l1 = findFileLinks(t1);
  assert.equal(l1.length, 1);
  assert.equal(l1[0].file, 'myfun.m');
  assert.equal(l1[0].line, 12);
  assert.equal(t1.slice(l1[0].start, l1[0].end), 'myfun.m:12');
  assert.deepEqual(findFileLinks('Error in C:/work/a b/run_me.m (line 3)').map((l) => [l.file, l.line]), [['C:/work/a b/run_me.m', 3]]);
  assert.deepEqual(findFileLinks('see /x/plant.msim at line 40').map((l) => [l.file, l.line]), [['/x/plant.msim', 40]]);
  assert.deepEqual(findFileLinks('no links here'), []);
});

/** A stand-in session with the CONTRACT §7 shape. */
function fakeSession(opts) {
  const vars = new Map();
  let flag = null;
  const breakpoints = {};
  const handled = [];
  const flushed = [];
  const s = {
    registry: { builtins: { __graphics_flush__: () => {} } },
    ctx: { registry: { builtins: { __graphics_flush__: true } }, call(name) { flushed.push(name); return []; } },
    evaluate(code) {
      if (code === 'boom') return { ok: false, error: { identifier: 'test:boom', message: 'Boom.', stack: [{ file: '/w/a.m', name: 'a', line: 2 }] } };
      if (code.startsWith('ask')) { const v = opts.host.request({ type: 'input', prompt: '? ' }); vars.set('answer', { cls: 'char', dims: [1, String(v).length] }); return { ok: true }; }
      const m = /^(\w+)\s*=\s*(\d+)$/.exec(code);
      if (m) { vars.set(m[1], { cls: 'double', dims: [1, 1], re: Float64Array.of(Number(m[2])), im: null }); opts.print(`${m[1]} = ${m[2]}\n`); }
      else opts.print(`ran: ${code}\n`);
      opts.host.post({ type: 'graphics.update', n: 1 });
      return { ok: true };
    },
    runFile(p) { opts.print(`file ${p}\n`); return { ok: true }; },
    listVariables() { return [...vars.entries()].map(([name, v]) => ({ name, cls: v.cls, dims: v.dims, bytes: 8, summary: '', global: false })); },
    getVariable(n) { return vars.get(n) || null; },
    setVariable(n, v) { vars.set(n, v); },
    clear(names) { if (names) for (const n of names) vars.delete(n); else vars.clear(); },
    complete(text) { return [...vars.keys()].filter((k) => k.startsWith(text)).map((label) => ({ label, kind: 'variable' })); },
    help(name) { return name === 'sum' ? { text: 'Sum.' } : null; },
    handleMessage(msg) { handled.push(msg); },
    setInterruptFlag(f) { flag = f; },
    setBreakpoints(file, lines) { breakpoints[file] = lines; },
  };
  return { s, handled, flushed, breakpoints, getFlag: () => flag };
}

function makeCore({ request = () => null } = {}) {
  const posted = [];
  let fake = null;
  const fsys = createMemoryFs({ '/home/w/a.m': 'x = 1' });
  const interrupt = new Int32Array(new SharedArrayBuffer(4));
  const core = createEngineCore({
    post: (m) => posted.push(m),
    createSession: (o) => { fake = fakeSession(o); return fake.s; },
    fs: fsys,
    host: { post: (m) => posted.push(m), request },
    interruptFlag: interrupt,
  });
  return { core, posted, fake: () => fake, interrupt, fsys };
}

test('router: eval → out, busy events, done with variables and cwd', () => {
  const { core, posted, fake, interrupt } = makeCore();
  assert.equal(core.ready, true);
  assert.equal(fake().getFlag(), interrupt);
  Atomics.store(interrupt, 0, 1);
  core.handle({ type: 'eval', id: 1, code: 'x = 5' });
  assert.equal(Atomics.load(interrupt, 0), 0, 'the flag is reset before each run');
  const types = posted.map((m) => (m.type === 'event' ? `event:${m.event.type}` : m.type));
  assert.deepEqual(types, ['event:busy', 'out', 'graphics.update', 'event:busy', 'done']);
  const done = posted.find((m) => m.type === 'done');
  assert.equal(done.id, 1);
  assert.deepEqual(done.result, { ok: true });
  assert.deepEqual(done.variables.map((v) => v.name), ['x']);
  assert.equal(done.cwd, '/home');
  assert.equal(posted.find((m) => m.type === 'out').text, 'x = 5\n');
  assert.deepEqual(fake().flushed, ['__graphics_flush__'], 'figures are flushed after the command');
});

test('router: errors come back in done; replies for the other calls', () => {
  const { core, posted } = makeCore();
  core.handle({ type: 'eval', id: 1, code: 'boom' });
  const done = posted.find((m) => m.type === 'done');
  assert.equal(done.result.ok, false);
  assert.equal(done.result.error.message, 'Boom.');
  assert.equal(done.result.error.stack[0].line, 2);
  core.handle({ type: 'eval', id: 2, code: 'abc = 3' });
  posted.length = 0;
  core.handle({ type: 'complete', id: 3, text: 'ab' });
  core.handle({ type: 'variables', id: 4 });
  core.handle({ type: 'variable.get', id: 5, name: 'abc' });
  core.handle({ type: 'help', id: 6, name: 'sum' });
  const replies = Object.fromEntries(posted.filter((m) => m.type === 'reply').map((m) => [m.id, m]));
  assert.deepEqual(replies[3].data, [{ label: 'abc', kind: 'variable' }]);
  assert.deepEqual(replies[4].data.map((v) => v.name), ['abc']);
  assert.equal(replies[5].data.re[0], 3);
  assert.equal(replies[6].data.text, 'Sum.');
});

test('router: variable.set / clear send a workspace event; cwd changes folder', () => {
  const { core, posted, fsys } = makeCore();
  core.handle({ type: 'variable.set', id: 1, name: 'q', value: { cls: 'double', dims: [1, 1], re: Float64Array.of(2), im: null } });
  assert.ok(posted.some((m) => m.type === 'event' && m.event.type === 'workspace'));
  assert.deepEqual(posted.find((m) => m.type === 'reply').data.map((v) => v.name), ['q']);
  posted.length = 0;
  core.handle({ type: 'clear', id: 2, names: ['q'] });
  assert.deepEqual(posted.find((m) => m.type === 'reply').data, []);
  posted.length = 0;
  fsys.mkdir('/home/w');
  core.handle({ type: 'cwd', id: 3, path: '/home/w' });
  assert.equal(fsys.cwd(), '/home/w');
  assert.ok(posted.some((m) => m.type === 'event' && m.event.type === 'cwd' && m.event.path === '/home/w'));
  core.handle({ type: 'cwd', id: 4, path: '/nope' });
  assert.equal(posted.find((m) => m.id === 4).error.message.includes('not found'), true);
});

test('router: host.request answers reach the session (input)', () => {
  const asked = [];
  const { core, fake } = makeCore({ request: (msg) => { asked.push(msg); return 'yes'; } });
  core.handle({ type: 'eval', id: 1, code: 'ask' });
  assert.deepEqual(asked, [{ type: 'input', prompt: '? ' }]);
  assert.deepEqual(fake().s.getVariable('answer').dims, [1, 3]);
});

test('router: graphics/sim messages go to handleMessage; breakpoints to the session', () => {
  const { core, fake } = makeCore();
  core.handle({ type: 'graphics.click', figure: 1 });
  core.handle({ type: 'sim.run', path: '/m.msim' });
  core.handle({ type: 'breakpoints', file: '/w/a.m', lines: [3, 7] });
  assert.deepEqual(fake().handled.map((m) => m.type), ['graphics.click', 'sim.run']);
  assert.deepEqual(fake().breakpoints['/w/a.m'], [3, 7]);
});

test('router: without a session every run says why', () => {
  const posted = [];
  const core = createEngineCore({ post: (m) => posted.push(m), createSession: null, fs: createMemoryFs(), host: { post() {}, request: () => null } });
  assert.equal(core.ready, false);
  assert.equal(core.error, ENGINE_MISSING);
  core.handle({ type: 'eval', id: 9, code: 'disp(1)' });
  const done = posted.find((m) => m.type === 'done');
  assert.equal(done.result.ok, false);
  assert.equal(done.result.error.identifier, 'app:noEngine');
  core.handle({ type: 'variables', id: 10 });
  assert.deepEqual(posted.find((m) => m.id === 10).data, []);
});

test('graphicsFlush: quiet when the builtin is missing', () => {
  let called = 0;
  graphicsFlush({ ctx: { registry: { builtins: {} }, call() { called += 1; } } });
  graphicsFlush({});
  assert.equal(called, 0);
});
