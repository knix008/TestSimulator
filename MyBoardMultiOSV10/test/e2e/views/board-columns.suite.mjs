// Board columns on the board (views/board/addcolumn.js, columns.js): "열 추가" in the board's tool row (right of
// "오래된 완료 보기") opens the form popup; the column gets a new status of its own (reachable from any status),
// an icon (suggested from its name, chosen from the "columns" icon category) and is placed first; undo removes
// both. Columns move left/right from the header menu / Ctrl+Shift+←/→, undoable. Run by scripts/test.mjs (web).
import assert from 'node:assert/strict';

const H = String.raw`
  const B = () => window.__myboardBoard;
  const samples = async () => (window.__bs ??= await A.api.createSamples('ko'));
  async function openBoard(index = 0) {
    await T.reset();
    const s = await samples();
    const p = s.projects[index];
    try { localStorage.setItem('myboard.board.' + p.boardId, JSON.stringify({ groupBy: 'none' })); } catch {}
    await A.actions.openTarget('board', p.boardId, { quiet: true });
    await T.until(() => B()?.status === 'ready' && B()?.boardId === p.boardId && document.querySelector('.bv-board .bv-heads'), 20000, 'board ready');
    await T.frames(2);
    return p;
  }
`;

export const cases = [
  {
    group: 'Board',
    name: 'Add column (main toolbar and board tool row): own status name, placed after the first column → workflow first ⇄ new ⇄ next, status order follows, cards move in → undo removes column, status and transitions',
    async run(app) {
      const r = await app.run(String.raw`${H} const p = await openBoard(0);
        const btn = document.querySelector('.bv-add-column[data-col-new]');
        const tools = [...btn.parentElement.children]; const doneBtn = tools.findIndex((x) => /오래된 완료/.test(x.textContent));
        const rightOfDone = doneBtn >= 0 && tools.indexOf(btn) === doneBtn + 1;
        const inToolbar = Boolean(document.querySelector('#toolbar [data-command="addColumn"]'));
        const everyIcon = [...document.querySelectorAll('.bv-col-head')].every((h) => h.querySelector('.bv-col-icon, .iconref'));
        const before = B().data.columns.map((c) => c.id);
        const first = B().data.columns[0]; const second = B().data.columns[1];
        const workflows = await A.api.get('/projects/' + p.id + '/workflows');
        btn.click();
        await T.popupReady('form'); const d = T.popupDoc('form');
        const rows = [...d.querySelectorAll('[data-ff-row]')].map((x) => x.dataset.ffRow);
        const nativeSelects = d.querySelectorAll('select').length;
        const type = (field, value) => { const el = d.querySelector('[data-ff="' + field + '"]'); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
        type('name', 'E2E 검토');
        // position: after the first column
        d.querySelector('[data-ref-dd="after"]').click(); await T.frames(2);
        [...d.querySelectorAll('.mb-reflist .dd-item')].find((i) => i.dataset.value === first.id).click(); await T.frames(2);
        type('statusName', 'E2E 검토 대기');
        await T.frames(2);
        d.querySelector('[data-action="form-submit"]').click();
        await T.until(() => [...document.querySelectorAll('.bv-col-head .bv-col-name')].some((x) => x.textContent === 'E2E 검토'), 15000, 'column shown');
        const data = await A.api.boardData(B().boardId);
        const cols = data.columns; const idx = cols.findIndex((c) => c.name === 'E2E 검토'); const col = cols[idx];
        const status = data.statuses.find((x) => x.id === col.statusIds[0]);
        // the workflow follows the place: first ⇄ new ⇄ second, in every workflow
        const links = [];
        for (const wf of [].concat(workflows.items ?? workflows)) {
          const trs = [].concat(((await A.api.get('/projects/' + p.id + '/transitions', { workflowId: wf.id })).items) ?? (await A.api.get('/projects/' + p.id + '/transitions', { workflowId: wf.id })));
          const has = (a, b) => trs.some((t) => t.fromStatusId === a && t.toStatusId === b);
          links.push(has(first.statusIds[0], status.id) && has(status.id, first.statusIds[0]) && has(status.id, second.statusIds[0]) && has(second.statusIds[0], status.id));
        }
        const order = [].concat((await A.api.get('/projects/' + p.id + '/statuses')).items ?? (await A.api.get('/projects/' + p.id + '/statuses'))).map((x) => x.id);
        const afterFirst = order.indexOf(status.id) === order.indexOf(first.statusIds[0]) + 1;
        const card = data.issues.find((c) => c.columnId === first.id) ?? data.issues[0];
        const moved = await A.api.post('/issues/' + card.id + '/move', { boardId: B().boardId, columnId: col.id });
        const movedStatus = (moved.issue ?? moved).statusId;
        await A.api.post('/issues/' + card.id + '/move', { boardId: B().boardId, columnId: card.columnId });
        const label = A.history.undoLabel;
        await A.actions.undo(); await T.until(() => !A.history.running, 15000, 'undo'); await T.sleep(300);
        const after = await A.api.boardData(B().boardId); const cfg = await A.api.get('/projects/' + p.id + '/config');
        const leftover = cfg.workflows.some((w) => (w.transitions ?? []).some((t) => t.toStatusId === status.id || t.fromStatusId === status.id));
        return { rightOfDone, inToolbar, everyIcon, rows, nativeSelects, idx, icon: col.icon, statusName: status?.name, statusCount: col.statusIds.length, links, afterFirst, movedOk: movedStatus === col.statusIds[0], label,
          columnGone: !after.columns.some((c) => c.name === 'E2E 검토'), statusGone: !cfg.statuses.some((x) => x.name === 'E2E 검토 대기'), leftover, sameColumns: after.columns.map((c) => c.id).join() === before.join() };`);
      assert.ok(r.rightOfDone, 'the button sits right of "오래된 완료 보기"');
      assert.ok(r.inToolbar, 'also in the main toolbar');
      assert.ok(r.everyIcon, 'every column title has an icon');
      for (const f of ['name', 'icon', 'after', 'status', 'statusName', 'category']) assert.ok(r.rows.includes(f), `field ${f}`);
      assert.equal(r.nativeSelects, 0, 'no native select');
      assert.equal(r.idx, 1, 'placed right after the first column');
      assert.match(String(r.icon), /^b:/, `an icon from the name (${r.icon})`);
      assert.equal(r.statusName, 'E2E 검토 대기', 'the status has the name the user gave');
      assert.equal(r.statusCount, 1, 'mapped to its own new status');
      assert.ok(r.links.length && r.links.every(Boolean), `workflow first ⇄ new ⇄ next in every workflow (${r.links})`);
      assert.ok(r.afterFirst, 'the status order puts it after the first column\'s status');
      assert.ok(r.movedOk, 'a card can be moved into the new column');
      assert.ok(r.label, 'undoable');
      assert.ok(r.columnGone && r.statusGone && r.sameColumns && !r.leftover, 'undo removes the column, its status and its transitions');
    },
  },
  {
    group: 'Board',
    name: 'Column order: header menu "Move right", Ctrl+Shift+← → order saved in the API → undo restores it',
    async run(app) {
      const r = await app.run(String.raw`${H} await openBoard(0);
        const order = async () => (await A.api.boardData(B().boardId)).columns.map((c) => c.id);
        const start = await order();
        const first = start[0];
        const head = () => document.querySelector('.bv-col-head[data-col="' + CSS.escape(first) + '"]');
        head().focus();
        head().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
        await T.until(async () => (await order())[1] === first, 10000, 'moved right');
        const afterRight = await order();
        await A.actions.undo(); await T.until(() => !A.history.running, 10000, 'undo'); await T.sleep(300);
        const afterUndo = await order();
        return { start, afterRight, afterUndo };`);
      assert.equal(r.afterRight[1], r.start[0], 'moved one place right');
      assert.equal(r.afterRight[0], r.start[1]);
      assert.deepEqual(r.afterUndo, r.start, 'undo restores the order');
    },
  },
  {
    group: 'Board',
    name: 'Double-clicking a card opens its edit form (filled), saving patches only what changed → undo restores it',
    async run(app) {
      const r = await app.run(String.raw`${H} await openBoard(0);
        const card = B().data.issues.find((c) => B().cardEl(c.id));
        const el = B().cardEl(card.id); el.scrollIntoView({ block: 'center' });
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        await T.popupReady('form'); const d = T.popupDoc('form');
        const summary = d.querySelector('[data-ff="summary"]'); const filled = summary.value;
        const rows = [...d.querySelectorAll('[data-ff-row]')].map((x) => x.dataset.ffRow);
        summary.value = filled + ' (편집)'; summary.dispatchEvent(new Event('input', { bubbles: true }));
        d.querySelector('[data-action="form-submit"]').click();
        await T.until(async () => (await A.api.issue(card.id)).summary === filled + ' (편집)', 10000, 'saved');
        const label = A.history.undoLabel;
        await A.actions.undo(); await T.until(() => !A.history.running, 10000, 'undo');
        const back = (await A.api.issue(card.id)).summary;
        return { filled, original: card.summary, rows, label, back };`);
      assert.equal(r.filled, r.original, 'the form is filled with the issue');
      for (const f of ['summary', 'description', 'assignee', 'priority', 'labels', 'storyPoints', 'dueDate', 'icon']) assert.ok(r.rows.includes(f), `field ${f}`);
      assert.ok(!r.rows.includes('project') && !r.rows.includes('status'), 'no project or status in the edit form');
      assert.ok(r.label, 'undoable');
      assert.equal(r.back, r.original, 'undo restores the summary');
    },
  },
];
