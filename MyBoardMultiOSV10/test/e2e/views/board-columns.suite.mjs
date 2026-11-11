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
    group: '보드',
    name: '열 추가 ("오래된 완료 보기" 오른쪽 버튼): 이름 → 이름에 맞는 아이콘 · 맨 앞 · 새 상태 → 카드를 옮길 수 있음 → 실행 취소로 열과 상태가 사라짐',
    async run(app) {
      const r = await app.run(String.raw`${H} const p = await openBoard(0);
        const btn = document.querySelector('.bv-add-column[data-col-new]');
        const tools = [...btn.parentElement.children]; const doneBtn = tools.findIndex((x) => /오래된 완료/.test(x.textContent));
        const rightOfDone = doneBtn >= 0 && tools.indexOf(btn) === doneBtn + 1;
        const everyIcon = [...document.querySelectorAll('.bv-col-head')].every((h) => h.querySelector('.bv-col-icon, .iconref'));
        const before = B().data.columns.map((c) => c.id);
        btn.click();
        await T.popupReady('form'); const d = T.popupDoc('form');
        const rows = [...d.querySelectorAll('[data-ff-row]')].map((x) => x.dataset.ffRow);
        const nativeSelects = d.querySelectorAll('select').length;
        const name = d.querySelector('[data-ff="name"]'); name.value = 'E2E 검토'; name.dispatchEvent(new Event('input', { bubbles: true }));
        await T.frames(3);
        d.querySelector('[data-action="form-submit"]').click();
        await T.until(() => [...document.querySelectorAll('.bv-col-head .bv-col-name')].some((x) => x.textContent === 'E2E 검토'), 15000, 'column shown');
        const data = await A.api.boardData(B().boardId);
        const cols = data.columns; const idx = cols.findIndex((c) => c.name === 'E2E 검토'); const col = cols[idx];
        const status = data.statuses.find((x) => x.id === col.statusIds[0]);
        const card = data.issues.find((c) => c.columnId === before[0]) ?? data.issues[0];
        const moved = await A.api.post('/issues/' + card.id + '/move', { boardId: B().boardId, columnId: col.id });
        const movedStatus = (moved.issue ?? moved).statusId;
        await A.api.post('/issues/' + card.id + '/move', { boardId: B().boardId, columnId: card.columnId });
        const label = A.history.undoLabel;
        await A.actions.undo(); await T.until(() => !A.history.running, 15000, 'undo'); await T.sleep(300);
        const after = await A.api.boardData(B().boardId); const cfg = await A.api.get('/projects/' + p.id + '/config');
        return { rightOfDone, everyIcon, rows, nativeSelects, idx, icon: col.icon, statusCount: col.statusIds.length, category: status?.category, movedOk: movedStatus === col.statusIds[0], label,
          columnGone: !after.columns.some((c) => c.name === 'E2E 검토'), statusGone: !cfg.statuses.some((x) => x.name === 'E2E 검토'), sameColumns: after.columns.map((c) => c.id).join() === before.join() };`);
      assert.ok(r.rightOfDone, 'the button sits right of "오래된 완료 보기"');
      assert.ok(r.everyIcon, 'every column title has an icon');
      for (const f of ['name', 'icon', 'after', 'withStatus', 'category']) assert.ok(r.rows.includes(f), `field ${f}`);
      assert.equal(r.nativeSelects, 0, 'no native select');
      assert.equal(r.idx, 0, 'a new column goes first');
      assert.match(String(r.icon), /^b:/, `an icon from the name (${r.icon})`);
      assert.equal(r.statusCount, 1, 'mapped to its own new status');
      assert.ok(r.movedOk, 'a card can be moved into the new column');
      assert.ok(r.label, 'undoable');
      assert.ok(r.columnGone && r.statusGone && r.sameColumns, 'undo removes the column and its status');
    },
  },
  {
    group: '보드',
    name: '열 순서: 머리글 메뉴 "오른쪽으로" · Ctrl+Shift+← → 순서가 API 에 저장 → 실행 취소로 되돌림',
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
];
