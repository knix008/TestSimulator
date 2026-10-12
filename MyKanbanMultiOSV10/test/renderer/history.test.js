const assert = require('node:assert/strict');
const { describe, it } = require('../lib/framework');
const { createBrowser } = require('../lib/browser');

function setup(fetchHandler) {
  let nextId = 100;
  const b = createBrowser({
    scripts: ['lang.js', 'api.js', 'history.js'],
    lang: 'en',
    fetch: fetchHandler || ((url, opts) => (opts.method === 'POST' && /\/cards$|\/columns$/.test(url)
      ? { status: 200, body: { id: nextId++ } }
      : { status: 200, body: { ok: true } })),
  });
  ['btn-undo', 'btn-redo', 'mb-undo', 'mb-redo'].forEach((id) => b.addElement(id));
  const History = b.eval('History');
  History.setBoard(1);
  return { b, History, calls: () => b.fetchCalls.map((c) => `${c.method} ${c.url}`) };
}

describe('Undo / Redo history', () => {
  it('starts empty with disabled toolbar buttons', () => {
    const { b, History } = setup();
    History.updateMenuState();
    assert.equal(History.canUndo(), false);
    assert.equal(History.canRedo(), false);
    assert.ok(b.elements['btn-undo'].classList.contains('disabled'));
    assert.ok(b.elements['mb-redo'].classList.contains('disabled'));
  });

  it('undoes and redoes a card move', async () => {
    const { b, History, calls } = setup();
    History.recordCardMove(1, 5, 10, 0, 11, 2);
    assert.ok(!b.elements['btn-undo'].classList.contains('disabled'));

    assert.equal(await History.undo(), true);
    assert.deepEqual(b.fetchCalls.at(-1).body, { targetColumnId: 10, position: 0 });
    assert.equal(History.canRedo(), true);

    assert.equal(await History.redo(), true);
    assert.deepEqual(b.fetchCalls.at(-1).body, { targetColumnId: 11, position: 2 });
    assert.deepEqual(calls(), ['POST /api/boards/1/cards/5/move', 'POST /api/boards/1/cards/5/move']);
  });

  it('ignores card edits that did not change anything', () => {
    const { History } = setup();
    History.recordCardUpdate(1, 5, { title: 'A', dueDate: '2026-01-01T00:00:00' }, { title: 'A', dueDate: '2026-01-01' });
    assert.equal(History.canUndo(), false);
  });

  it('undoes a card edit by restoring the previous values', async () => {
    const { b, History } = setup();
    History.recordCardUpdate(1, 5, { title: 'Old', assigneeId: 3 }, { title: 'New', assigneeId: '' });
    await History.undo();
    const last = b.fetchCalls.at(-1);
    assert.equal(last.method, 'PUT');
    assert.equal(last.url, '/api/boards/1/cards/5');
    assert.equal(last.body.title, 'Old');
    assert.equal(last.body.assigneeId, '3');
  });

  it('undoes card creation and tracks the new id after redo', async () => {
    const { History, calls } = setup();
    History.recordCardCreate(1, 7, { columnId: 10, title: 'Task' });
    await History.undo();
    await History.redo();
    await History.undo();
    assert.deepEqual(calls(), [
      'DELETE /api/boards/1/cards/7',
      'POST /api/boards/1/cards',
      'DELETE /api/boards/1/cards/100',
    ]);
  });

  it('restores a deleted card (including its position) on undo', async () => {
    const { b, History, calls } = setup();
    History.recordCardDelete(1, { id: 9, column_id: 10, title: 'Gone', position: 2, due_date: '2026-05-01T00:00:00Z' });
    await History.undo();
    assert.deepEqual(calls(), ['POST /api/boards/1/cards', 'POST /api/boards/1/cards/100/move']);
    assert.equal(b.fetchCalls[0].body.dueDate, '2026-05-01');
    await History.redo();
    assert.equal(calls().at(-1), 'DELETE /api/boards/1/cards/100');
  });

  it('records column rename, color, move, add and delete', async () => {
    const { History, calls } = setup();
    History.recordColumnRename(1, 3, 'Old', 'New');
    History.recordColumnColorChange(1, 3, '', '#fff');
    History.recordColumnMove(1, 3, 0, 2);
    History.recordColumnAdd(1, 4, 'Added');
    History.recordColumnDelete(1, { id: 5, title: 'Removed', cards: [{ id: 1, title: 'c', position: 0 }] });
    for (let i = 0; i < 5; i++) await History.undo();
    assert.deepEqual(calls(), [
      'POST /api/boards/1/columns',
      'POST /api/boards/1/cards',
      'DELETE /api/boards/1/columns/4',
      'POST /api/boards/1/columns/3/move',
      'PUT /api/boards/1/columns/3',
      'PUT /api/boards/1/columns/3',
    ]);
    assert.equal(History.canUndo(), false);
  });

  it('skips no-op column and board changes', () => {
    const { History } = setup();
    History.recordColumnRename(1, 3, 'Same', 'Same');
    History.recordColumnColorChange(1, 3, null, '');
    History.recordColumnMove(1, 3, 1, 1);
    History.recordBoardUpdate(1, { title: 'T', description: 'D' }, { title: 'T', description: 'D' });
    assert.equal(History.canUndo(), false);
  });

  it('undoes a project (board) edit', async () => {
    const { b, History } = setup();
    History.recordBoardUpdate(1, { title: 'Before', description: '' }, { title: 'After', description: '' });
    await History.undo();
    assert.equal(b.fetchCalls.at(-1).method, 'PUT');
    assert.equal(b.fetchCalls.at(-1).body.title, 'Before');
  });

  it('clears the redo stack when a new action is recorded', async () => {
    const { History } = setup();
    History.recordColumnRename(1, 3, 'A', 'B');
    await History.undo();
    assert.equal(History.canRedo(), true);
    History.recordColumnRename(1, 3, 'A', 'C');
    assert.equal(History.canRedo(), false);
  });

  it('clears history when switching to another project', () => {
    const { History } = setup();
    History.recordColumnRename(1, 3, 'A', 'B');
    History.setBoard(1);
    assert.equal(History.canUndo(), true, 'same project keeps history');
    History.setBoard(2);
    assert.equal(History.canUndo(), false);
  });

  it('keeps at most 100 entries', async () => {
    const { History } = setup();
    for (let i = 0; i < 120; i++) History.recordColumnRename(1, 3, `t${i}`, `t${i + 1}`);
    let undone = 0;
    while (History.canUndo()) { await History.undo(); undone++; }
    assert.equal(undone, 100);
  });

  it('shows an info toast when there is nothing to undo or redo', async () => {
    const { b, History } = setup();
    assert.equal(await History.undo(), false);
    assert.equal(await History.redo(), false);
    assert.deepEqual(b.toasts().map((t) => t.text), [b.eval("I18n.t('nothingToUndo')"), b.eval("I18n.t('nothingToRedo')")]);
  });

  it('keeps the entry and shows an error toast when undo fails', async () => {
    const { b, History } = setup(() => ({ status: 400, body: { error: 'Rejected by server' } }));
    History.recordColumnRename(1, 3, 'A', 'B');
    assert.equal(await History.undo(), false);
    assert.equal(History.canUndo(), true);
    assert.ok(b.toasts().some((t) => t.type === 'error' && t.text === 'Rejected by server'));
  });
});
