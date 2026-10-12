const assert = require('node:assert/strict');
const { describe, it } = require('../lib/framework');
const { createBrowser } = require('../lib/browser');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const b = createBrowser({ scripts: ['lang.js', 'api.js'], lang: 'en' });
  const indicator = b.addElement('save-status');
  return { b, AutoSave: b.eval('AutoSave'), indicator };
}

describe('Auto-save', () => {
  it('does not save when the payload equals the initial payload', async () => {
    const { AutoSave } = setup();
    const saved = [];
    AutoSave.start('card:1', { collect: () => ({ title: 'A' }), save: async (p) => saved.push(p), initialPayload: { title: 'A' } });
    assert.equal(await AutoSave.flush('card:1'), true);
    assert.equal(saved.length, 0);
  });

  it('saves changed data and shows the "saved" indicator', async () => {
    const { b, AutoSave, indicator } = setup();
    const saved = [];
    let title = 'A';
    AutoSave.start('card:2', { collect: () => ({ title }), save: async (p) => saved.push(p), indicatorId: 'save-status', initialPayload: { title: 'A' } });
    title = 'B';
    assert.equal(await AutoSave.flush('card:2'), true);
    assert.deepEqual(saved, [{ title: 'B' }]);
    assert.equal(indicator.className, 'autosave-status autosave-saved');
    assert.equal(indicator.textContent, b.eval("I18n.t('autoSaved')"));
  });

  it('does not save the same payload twice', async () => {
    const { AutoSave } = setup();
    let count = 0;
    AutoSave.start('k', { collect: () => ({ v: 1 }), save: async () => { count++; } });
    await AutoSave.flush('k');
    await AutoSave.flush('k');
    assert.equal(count, 1);
  });

  it('debounces scheduled saves into a single save', async () => {
    const { AutoSave } = setup();
    let count = 0;
    let v = 0;
    AutoSave.start('k', { collect: () => ({ v }), save: async () => { count++; }, debounceMs: 25, initialPayload: { v: 0 } });
    for (let i = 1; i <= 5; i++) { v = i; AutoSave.schedule('k'); }
    await wait(80);
    assert.equal(count, 1);
  });

  it('reports failures, shows an error toast and the "failed" indicator', async () => {
    const { b, AutoSave, indicator } = setup();
    AutoSave.start('k', { collect: () => ({ v: 1 }), save: async () => { throw new Error('Network down'); }, indicatorId: 'save-status' });
    assert.equal(await AutoSave.flush('k'), false);
    assert.equal(indicator.className, 'autosave-status autosave-error');
    assert.deepEqual(b.toasts(), [{ type: 'error', text: 'Network down' }]);
  });

  it('retries after a failure on the next flush', async () => {
    const { AutoSave } = setup();
    let attempts = 0;
    AutoSave.start('k', { collect: () => ({ v: 1 }), save: async () => { attempts++; if (attempts === 1) throw new Error('x'); } });
    assert.equal(await AutoSave.flush('k'), false);
    assert.equal(await AutoSave.flush('k'), true);
    assert.equal(attempts, 2);
  });

  it('flushAll() saves every active session', async () => {
    const { AutoSave } = setup();
    const saved = [];
    AutoSave.start('a', { collect: () => ({ id: 'a' }), save: async (p) => saved.push(p.id) });
    AutoSave.start('b', { collect: () => ({ id: 'b' }), save: async (p) => saved.push(p.id) });
    assert.equal(await AutoSave.flushAll(), true);
    assert.deepEqual(saved.sort(), ['a', 'b']);
  });

  it('stop() cancels pending saves', async () => {
    const { AutoSave } = setup();
    let count = 0;
    AutoSave.start('k', { collect: () => ({ v: 1 }), save: async () => { count++; }, debounceMs: 10 });
    AutoSave.schedule('k');
    AutoSave.stop('k');
    await wait(40);
    assert.equal(count, 0);
    assert.equal(await AutoSave.flush('k'), true, 'flushing a stopped session is a no-op');
  });
});
