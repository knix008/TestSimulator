// Quitting the desktop app with changed maps asks whether to save them — however often the page
// hands in a new close callback (it does whenever its maps change). The Tauri bridge is faked:
// the close listener must stay installed, the newest callback must answer, and the window must not
// be destroyed while the question is open.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
const callbacks = new Map();
let nextId = 1;
globalThis.window = {
  __TAURI_INTERNALS__: {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    transformCallback: (cb) => { const id = nextId++; callbacks.set(id, cb); return id; },
    invoke: async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'plugin:event|listen') return calls.length;
      if (cmd === 'plugin:window|is_maximized') return false;
      if (cmd === 'plugin:window|outer_position') return { x: 0, y: 0 };
      if (cmd === 'plugin:window|inner_size' || cmd === 'plugin:window|outer_size') return { width: 1320, height: 840 };
      if (cmd === 'plugin:window|scale_factor') return 1;
      return null;
    },
  },
};
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const { onCloseRequest } = await import('../src/lib/tauri-host.js');
const tick = () => new Promise((r) => setTimeout(r, 20));

test('the close listener survives new callbacks; the newest one answers and nothing closes on its own', async () => {
  const asked = [];
  const off1 = onCloseRequest(() => asked.push('first'));
  await tick();
  // the page re-renders: the old effect is cleaned up, the new one hands in a fresh callback
  off1();
  const off2 = onCloseRequest(() => asked.push('second'));
  off2();
  onCloseRequest(() => asked.push('third'));
  await tick();
  const listens = calls.filter(([c, a]) => c === 'plugin:event|listen' && a.event === 'tauri://close-requested');
  assert.equal(listens.length, 1, 'one close listener, installed once');
  assert.equal(calls.filter(([c]) => c === 'plugin:event|unlisten').length, 0, 'never taken down');
  // the window's × / File › Exit / the OS: a close request
  const handler = callbacks.get(listens[0][1].handler);
  await handler({ event: 'tauri://close-requested', id: 1, payload: null });
  await tick();
  assert.deepEqual(asked, ['third'], 'the newest callback asks');
  assert.ok(!calls.some(([c]) => c === 'plugin:window|destroy'), 'the window stays open while the question is asked');
});
