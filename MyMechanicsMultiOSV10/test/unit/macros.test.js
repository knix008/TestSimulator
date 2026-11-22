// Macros (src/app-macros.js, the parts without the app): the recorder keeps only the outermost call of a user action
// (not what it calls, not while a macro plays, not the macro commands themselves), notes a sketch's contents before
// the step that closes it, writes the steps as a script, and errors are traced to their line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder, stepLine, macroScript, compileMacro, errorLine } from '../../src/app-macros.js';

test('only the outermost call is recorded; nothing while playing or off; macro commands are not', () => {
  const r = createRecorder();
  r.around('run', ['extrude'], () => 1);
  assert.equal(r.steps.length, 0, 'off: nothing');
  r.on = true;
  const v = r.around('run', ['extrude'], () => r.around('select', [[{ kind: 'feat', id: 'f1' }]], () => r.around('pmSet', ['end', 'blind'], () => 42)));
  assert.equal(v, 42, 'the call\'s value comes back');
  assert.deepEqual(r.steps.map((s) => s.call), ['run']);
  r.around('run', ['macroRecord'], () => 0);
  assert.equal(r.steps.length, 1, 'the macro commands themselves are left out');
  r.playing = true; r.around('pmSet', ['depth', 5], () => 0); r.playing = false;
  assert.equal(r.steps.length, 1, 'a playing macro is not recorded');
  assert.throws(() => r.around('run', ['bad'], () => { throw new Error('boom'); }));
  assert.equal(r.depth, 0, 'a failing call leaves the depth balanced');
  r.around('pmSet', ['depth', 5], () => 0);
  assert.deepEqual(r.steps.at(-1), { call: 'pmSet', args: ['depth', 5] }, 'after a failure the next action is recorded again');
});

test('the sketch contents go before the step that closes the sketch; arguments are plain data', () => {
  const r = createRecorder(); r.on = true;
  const seen = [];
  r.listeners.add((s) => seen.push(s.call));
  r.around('pmCommand', ['ok'], () => r.note('setSketch', [{ entities: [{ id: 'p1', x: 1, y: 2 }], constraints: [] }], { before: true }));
  assert.deepEqual(r.steps.map((s) => s.call), ['setSketch', 'pmCommand']);
  r.note('cancel');
  assert.deepEqual(r.steps.map((s) => s.call), ['setSketch', 'pmCommand', 'cancel'], 'outside a call: appended');
  assert.deepEqual(seen, ['pmCommand', 'cancel'], 'listeners hear the pushed steps');
  r.around('pick', [{ kind: 'face', index: 3, point: [1, 2, 3], onClick: () => 0 }, null], () => 0);
  assert.deepEqual(r.steps.at(-1).args, [{ kind: 'face', index: 3, point: [1, 2, 3] }, null], 'functions dropped');
});

test('steps as script lines: API names, JSON arguments, trailing empty ones dropped', () => {
  assert.equal(stepLine({ call: 'run', args: ['extrude'] }), 'await mm.run("extrude");');
  assert.equal(stepLine({ call: 'pmField', args: ['depth', '25', null] }), 'await mm.field("depth", "25");');
  assert.equal(stepLine({ call: 'select', args: [[{ kind: 'feat', id: 'f1' }], null] }), 'await mm.select([{"kind":"feat","id":"f1"}]);');
  assert.equal(stepLine({ call: 'pick', args: [{ kind: 'face', index: 2 }, { ctrlKey: true }] }), 'await mm.pick({"kind":"face","index":2}, {"ctrlKey":true});');
  assert.equal(stepLine({ call: 'pmCommand', args: ['ok'] }), 'await mm.pm("ok");');
  const text = macroScript([{ call: 'run', args: ['sketch'] }, { call: 'accept', args: [] }], { title: 'Bracket', date: new Date(2026, 10, 22, 9, 5) });
  assert.equal(text, '// MyMechanics macro — Bracket\n// 2026-11-22 09:05\n\nawait mm.run("sketch");\nawait mm.accept();\n');
});

test('a recorded script runs against an API and calls it in order', async () => {
  const calls = [];
  const mm = new Proxy({}, { get: (_, name) => async (...args) => { calls.push([name, ...args]); } });
  await compileMacro(macroScript([{ call: 'run', args: ['extrude'] }, { call: 'pmSet', args: ['end', 'blind'] }, { call: 'pmField', args: ['depth', '25', null] }, { call: 'accept', args: [] }]))(mm, console);
  assert.deepEqual(calls, [['run', 'extrude'], ['set', 'end', 'blind'], ['field', 'depth', '25'], ['accept']]);
});

test('errors: syntax errors when compiled, run-time errors traced to their line', async () => {
  assert.throws(() => compileMacro('await mm.run(;'), SyntaxError);
  const fn = compileMacro('const a = 1;\nawait null;\nmm.boom();\n');
  await assert.rejects(fn({ boom() { throw new Error('x'); } }, console), (e) => errorLine(e) === 3);
  await assert.rejects(compileMacro('let z = 1;\nnull.y;')({}, console), (e) => errorLine(e) === 2);
  assert.equal(errorLine(new Error('no stack line')), null);
});
