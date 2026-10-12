import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogBus } from '../src/lib/dialogBus.js';

test('open, update, submit and close notify listeners', async () => {
  const changes = [];
  const results = [];
  const closed = [];
  const offChange = dialogBus.onChange((list) => changes.push(list.map((d) => d.name)));
  const offResult = dialogBus.onResult((event) => results.push(event));
  const offClosed = dialogBus.onClosed((event) => closed.push(event.name));
  try {
    assert.equal(await dialogBus.update('missing', {}), false);
    assert.equal(await dialogBus.open('settings', { page: 'general' }), true);
    assert.equal(dialogBus.isOpen('settings'), true);
    assert.deepEqual(dialogBus.list(), [{ name: 'settings', payload: { page: 'general' } }]);
    assert.equal(await dialogBus.update('settings', { page: 'theme' }), true);
    assert.equal(dialogBus.list()[0].payload.page, 'theme');
    assert.equal(await dialogBus.submit('settings', { ok: true }, true), true);
    assert.equal(dialogBus.isOpen('settings'), true);
    assert.equal(await dialogBus.submit('settings', { ok: true }), true);
    assert.equal(dialogBus.isOpen('settings'), false);
    assert.deepEqual(results.at(-1), { name: 'settings', data: { ok: true } });
    assert.deepEqual(closed, ['settings']);
    await dialogBus.open('about', {});
    await dialogBus.close('about');
    assert.deepEqual(results.at(-1), { name: 'about', data: null });
    const watched = changes.length;
    offChange();
    await dialogBus.open('gone', {});
    assert.equal(changes.length, watched);
  } finally {
    offChange();
    offResult();
    offClosed();
    for (const dialog of dialogBus.list()) await dialogBus.close(dialog.name);
  }
});
