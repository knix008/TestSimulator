// Keystroke macros (src/domain/macro.js): what is recorded, merging text, saved macros by name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder, describeSteps, loadMacros, MACROS_KEY, putMacro, saveMacros } from '../../src/domain/macro.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const key = (k, extra = {}) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...extra });

test('recording keeps typed keys, moves, text and commands — not shortcuts, macro or window commands', () => {
  const r = createRecorder();
  assert.equal(r.key(key('A')), false, 'nothing before start');
  r.start();
  r.key(key('C')); r.key(key('A')); r.key(key('ArrowRight', { shiftKey: true }));
  r.key(key('c', { ctrlKey: true })); r.key(key('F5')); r.key(key('x', { isComposing: true }));
  r.text('가'); r.text('나');
  r.command('op:not'); r.command('macroPlay'); r.command('settings');
  const steps = r.stop();
  assert.equal(r.recording, false);
  assert.deepEqual(steps, [
    { type: 'key', key: 'C', shift: false }, { type: 'key', key: 'A', shift: false }, { type: 'key', key: 'ArrowRight', shift: true },
    { type: 'text', text: '가나' }, { type: 'command', id: 'op:not' },
  ]);
  assert.deepEqual(describeSteps(steps), { key: 3, text: 1, command: 1 });
});

test('saved macros: names are unique, sorted, bad steps dropped', () => {
  const store = memory();
  let list = putMacro([], 'Zed', [{ type: 'key', key: 'A', shift: false }]);
  list = putMacro(list, 'alpha', [{ type: 'command', id: 'undo' }, { type: 'bogus' }]);
  list = putMacro(list, 'ZED', [{ type: 'text', text: 'hi' }]);
  saveMacros(list, store);
  const back = loadMacros(store);
  assert.deepEqual(back.map((m) => m.name), ['alpha', 'ZED']);
  assert.deepEqual(back[0].steps, [{ type: 'command', id: 'undo' }]);
  store.setItem(MACROS_KEY, '{broken');
  assert.deepEqual(loadMacros(store), []);
});
