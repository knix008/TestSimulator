// Language: the Session API (CONTRACT §7) — evaluate, variables, completion,
// help, events, messages, interrupts, the debugger protocol, display output,
// input(), and the full library registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionWith } from '../core/lang/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { num, str, MError } from '../core/value.js';

function session(files = {}, opts = {}) {
  const out = [];
  const events = [];
  const fs = createMemoryFs(files);
  const s = createSessionWith(opts.registry || null, { fs, print: (t, st) => out.push([st, t]), onEvent: (e) => events.push(e), host: opts.host });
  return {
    s, out, events, fs,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw new Error(r.error.message); return r; },
    text(stream = 'out') { return out.filter((o) => o[0] === stream).map((o) => o[1]).join(''); },
    v(name) { const v = s.getVariable(name); if (v == null) return v; if (v.cls === 'char') return String.fromCharCode(...v.re); if (v.re) return v.re.length === 1 ? v.re[0] : Array.from(v.re); return v; },
  };
}

test('evaluate returns ok / error objects and emits events', () => {
  const h = session();
  assert.deepEqual(h.s.evaluate('a = 1;'), { ok: true });
  const r = h.s.evaluate('b = a +');
  assert.equal(r.ok, false);
  assert.equal(r.error.identifier, 'core:parse');
  const types = h.events.map((e) => e.type);
  assert.ok(types.includes('busy') && types.includes('workspace') && types.includes('history'));
  assert.deepEqual(h.events.find((e) => e.type === 'history'), { type: 'history', command: 'a = 1;' });
  h.s.evaluate('c = 3', { echo: true });
  assert.match(h.text('echo'), />> c = 3/);
});

test('listVariables, getVariable, setVariable and clear', () => {
  const h = session();
  h.run("x = [1 2 3]; s = 'abc'; n = 5; global g; g = 2; c = {1};");
  const list = h.s.listVariables();
  assert.deepEqual(list.map((v) => v.name), ['c', 'g', 'n', 's', 'x']);
  const x = list.find((v) => v.name === 'x');
  assert.deepEqual([x.cls, x.dims, x.bytes, x.summary], ['double', [1, 3], 24, '[1 2 3]']);
  assert.equal(list.find((v) => v.name === 's').summary, "'abc'");
  assert.equal(list.find((v) => v.name === 'n').summary, '5');
  assert.equal(list.find((v) => v.name === 'g').global, true);
  assert.equal(list.find((v) => v.name === 'c').summary, '1×1 cell');
  h.s.setVariable('y', num(41));
  h.run('z = y + 1;');
  assert.equal(h.v('z'), 42);
  h.s.clear(['z']);
  assert.equal(h.s.getVariable('z'), null);
  assert.throws(() => h.s.setVariable('1bad', num(1)), /Invalid variable name/);
  h.s.clear();
  assert.equal(h.s.listVariables().length, 0);
});

test('display output without semicolons, ans and format', () => {
  const h = session();
  h.run("a = 5\nb = [1 2; 3 4]\n3 + 4\nc = 'txt'\nd = \"str\"\ne = []\nf = 2.5\ng = {1, 'x'}\nst.k = 1\nfh = @(x) x + 1\nz = 1 + 2i\nlg = 1 == 1");
  const t = h.text();
  assert.match(t, /a = 5\n/);
  assert.match(t, /b =\n\n {5}1 {5}2\n {5}3 {5}4\n/);
  assert.match(t, /ans = 7\n/);
  assert.match(t, /c = 'txt'\n/);
  assert.match(t, /d = "str"\n/);
  assert.match(t, /e = \[\]\n/);
  assert.match(t, /f = 2\.5000\n/);
  assert.match(t, /1×2 cell array/);
  assert.match(t, /struct with fields:\n\n {4}k: 1/);
  assert.match(t, /@\(x\)x\+1/);
  assert.match(t, /z = 1\.0000 \+ 2\.0000i|z = 1 \+ 2i/);
  assert.match(t, /lg =\n\n {2}logical\n\n {3}1/);
  assert.equal(h.v('ans'), 7);
  h.run('x = 5; x');
  assert.match(h.text(), /x = 5\n$/);
});

test('complete offers variables, functions, keywords, fields and files', () => {
  const h = session({ '/home/myScript.m': 'q = 1;', '/home/data/file1.txt': 'x' });
  h.run('myVar = 1; s.alpha = 1; s.beta.gamma = 2;');
  const labels = (t, c) => h.s.complete(t, c).map((x) => `${x.kind}:${x.label}`);
  assert.ok(labels('my').includes('variable:myVar'));
  assert.ok(labels('my').includes('file:myScript'));
  assert.ok(labels('ev').includes('function:eval'));
  assert.ok(labels('whi').includes('keyword:while'));
  assert.deepEqual(labels('x = s.a'), ['field:alpha']);
  assert.deepEqual(labels('s.beta.g'), ['field:gamma']);
  assert.ok(labels("load('data/fi").includes('file:data/file1.txt'));
});

test('help returns builtin help and the comment of user functions', () => {
  const h = session({ '/home/documented.m': 'function documented()\n% DOCUMENTED does a thing.\n%   More text.\nend\n' });
  const e = h.s.help('eval');
  assert.match(e.text, /Execute M code/);
  assert.ok(e.syntax.length > 0);
  assert.ok(e.ko.length > 0);
  assert.match(h.s.help('documented').text, /DOCUMENTED does a thing/);
  assert.equal(h.s.help('nothing_like_this'), null);
  h.run('help documented');
  assert.match(h.text(), /DOCUMENTED does a thing/);
});

test('handleMessage routes GUI messages to registered handlers', () => {
  const seen = [];
  const registry = { builtins: {}, help: {}, classes: {}, owner: {}, installs: [(ctx) => { ctx.onMessage('demo.', (m) => { seen.push(m.type); return 'handled'; }); }] };
  const h = session({}, { registry });
  assert.equal(h.s.handleMessage({ type: 'demo.click', x: 1 }), 'handled');
  assert.equal(h.s.handleMessage({ type: 'other.thing' }), undefined);
  assert.deepEqual(seen, ['demo.click']);
});

test('interrupt flag stops a long loop', () => {
  const h = session();
  const flag = new Int32Array(new SharedArrayBuffer(4));
  h.s.setInterruptFlag(flag);
  let calls = 0;
  const registry = null;
  void registry;
  // a host request is not needed: set the flag from inside the loop through a builtin
  h.s.interp.builtins.tickbox = () => { calls++; if (calls === 1000) Atomics.store(flag, 0, 1); return []; };
  const r = h.s.evaluate('k = 0; while 1, k = k + 1; tickbox(); end');
  assert.equal(r.ok, false);
  assert.equal(r.error.identifier, 'core:interrupted');
  assert.equal(flag[0], 0);
  assert.ok(h.v('k') >= 1000 && h.v('k') <= 1001);
});

test('cwd, clc and openFile events', () => {
  const h = session({ '/home/proj/f1.m': 'function f1()\nend\n' });
  h.run('cd proj; clc; edit f1; edit newfile');
  assert.deepEqual(h.events.find((e) => e.type === 'cwd'), { type: 'cwd', path: '/home/proj' });
  assert.ok(h.events.some((e) => e.type === 'clc'));
  const opened = h.events.filter((e) => e.type === 'openFile').map((e) => e.path);
  assert.deepEqual(opened, ['/home/proj/f1.m', '/home/proj/newfile.mym'], 'an existing .m opens as .m; a new file gets .mym');
  assert.equal(h.fs.exists('/home/proj/newfile.mym'), true);
});

test('input() asks the host; pause() without a host does not block long', () => {
  const answers = ['3 + 4', 'hello'];
  const h = session({}, { host: { post() {}, request(m) { if (m.type === 'input') return answers.shift(); return null; } } });
  h.run("a = input('Number? '); b = input('Name? ', 's'); pause(0.01);");
  assert.equal(h.v('a'), 7);
  assert.equal(h.v('b'), 'hello');
  const h2 = session();
  assert.equal(h2.s.evaluate("x = input('?')").ok, false);
});

test('debugger: breakpoints pause with stack and variables; step, eval and continue', () => {
  const files = { '/home/dbg1.m': 'function r = dbg1(x)\na = x + 1;\nb = a * 2;\nr = helper(b);\nend\nfunction y = helper(z)\ny = z - 1;\nend\n' };
  const pauses = [];
  const replies = [{ eval: 'a = 100;' }, 'step', 'stepIn', 'continue'];
  const host = {
    post() {},
    request(m) {
      if (m.type !== 'debug.paused') return null;
      pauses.push({ line: m.line, stack: m.stack.map((s) => s.name), vars: m.vars.map((v) => v.name) });
      return replies.shift() || 'continue';
    },
  };
  const h = session(files, { host });
  h.s.setBreakpoints('/home/dbg1.m', [3]);
  h.run('out = dbg1(1);');
  assert.deepEqual(pauses.map((p) => p.line), [3, 3, 4, 7]);
  assert.deepEqual(pauses[0].stack, ['dbg1', 'base']);
  assert.ok(pauses[0].vars.includes('a') && pauses[0].vars.includes('x'));
  assert.deepEqual(pauses[3].stack[0], 'helper');
  // a was changed to 100 at the breakpoint: b = 200, r = 199
  assert.equal(h.v('out'), 199);
});

test('debugger: stop aborts execution; keyboard pauses; dbstop and dbclear', () => {
  const files = { '/home/dbg2.m': 'x = 1;\nkeyboard;\ny = 2;\n' };
  let n = 0;
  const host = { post() {}, request(m) { if (m.type === 'debug.paused') { n++; return 'stop'; } return null; } };
  const h = session(files, { host });
  const r = h.s.evaluate('dbg2');
  assert.equal(r.ok, false);
  assert.equal(r.error.identifier, 'core:debugQuit');
  assert.equal(n, 1);
  assert.equal(h.v('x'), 1);
  assert.equal(h.v('y'), null);
  h.run('dbstop in dbg2 at 3; s = dbstatus;');
  assert.deepEqual([...h.s.interp.breakpoints.get('/home/dbg2.m')], [3]);
  h.run('dbclear all');
  assert.equal(h.s.interp.breakpoints.size, 0);
});

test('runFile runs scripts in the base workspace', () => {
  const h = session({ '/home/scr.m': 'v1 = 10;\nv2 = v1 * 2;\n' });
  assert.deepEqual(h.s.runFile('/home/scr.m'), { ok: true });
  assert.equal(h.v('v2'), 20);
  const r = h.s.runFile('/home/missing.m');
  assert.equal(r.ok, false);
});

test('ctx for library code: call, getVar/setVar, evalString, warning', () => {
  let ctxSeen = null;
  const registry = {
    builtins: {
      libprobe(args, nargout, ctx) {
        ctxSeen = ctx;
        const v = ctx.getVar('probeIn');
        ctx.setVar('probeOut', num(v.re[0] * 10));
        const r = ctx.call(args[0], [num(2)], 1)[0];
        const e = ctx.evalString('probeIn + 1')[0];
        ctx.warning('lib:probe', 'Probe warning.');
        return [r, e];
      },
    },
    help: { libprobe: { en: 'Probe.', ko: '탐침.', syntax: ['libprobe(f)'] } }, classes: {}, owner: { libprobe: 'test' }, installs: [],
  };
  const h = session({}, { registry });
  h.run('probeIn = 4; [r, e] = libprobe(@(x) x^3);');
  assert.equal(h.v('probeOut'), 40);
  assert.equal(h.v('r'), 8);
  assert.equal(h.v('e'), 5);
  assert.match(h.text('warn'), /Probe warning/);
  assert.equal(ctxSeen.format.numeric, 'short');
  assert.equal(h.s.help('libprobe').en, 'Probe.');
  assert.throws(() => ctxSeen.call('nope_nothing', [], 1), (e) => e instanceof MError && /nope_nothing/.test(e.message));
});

test('errors from library builtins name the builtin', () => {
  const registry = { builtins: { libfail() { throw new MError('lib:fail', 'Library failure.'); } }, help: {}, classes: {}, owner: {}, installs: [] };
  const h = session({}, { registry });
  const r = h.s.evaluate('libfail()');
  assert.equal(r.error.identifier, 'lib:fail');
  assert.match(h.text('err'), /Error using libfail\nLibrary failure\./);
});

test('library operator builtins are used when present', () => {
  const registry = { builtins: { plus(args) { return str('lib-plus'); } }, help: {}, classes: {}, owner: {}, installs: [] };
  const h = session({}, { registry });
  h.run('a = 1 + 2; b = [1 2] + [3 4];');
  assert.equal(h.v('a'), 3); // scalar fast path
  assert.equal(h.v('b'), 'lib-plus');
});
