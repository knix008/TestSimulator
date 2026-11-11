// Board view E2E cases (views/board): the real shell in headless Edge with a web core. Every case opens a
// sample project's board (POST /samples once per page) and drives the board like a user: pointer drags,
// clicks, keys, the context menu and the form popup — and checks the result through the API.
import assert from 'node:assert/strict';

// Page helpers for these cases (defined in each case's body; cheap).
const H = String.raw`
  const B = () => window.__myboardBoard;
  const samples = async () => (window.__bs ??= await A.api.createSamples('ko'));
  async function openBoard(index = 0, { prefs = null } = {}) {
    await T.reset();
    const s = await samples();
    const p = s.projects[index];
    try { localStorage.removeItem('myboard.board.' + p.boardId); if (prefs) localStorage.setItem('myboard.board.' + p.boardId, JSON.stringify(prefs)); } catch {}
    await A.actions.openTarget('board', p.boardId, { quiet: true });
    await T.until(() => B()?.status === 'ready' && B()?.boardId === p.boardId && document.querySelector('.bv-board .bv-heads'), 20000, 'board ready');
    await T.frames(2);
    return p;
  }
  const cardEl = (id) => document.querySelector('.bv-board .mb-card[data-id="' + CSS.escape(id) + '"]');
  const cellOf = (id) => cardEl(id)?.closest('[data-cell]')?.dataset.cell ?? null;
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)]; };
  const pe = (type, x, y, target = document) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 7, isPrimary: true, pointerType: 'mouse' }));
  /** Drags a card to where target() points (worked out once the card is held: the board may scroll), like a mouse. */
  async function drag(id, target) {
    const el = cardEl(id); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await T.frames(1);
    const [sx, sy] = center(el);
    pe('pointerdown', sx, sy, el);
    pe('pointermove', sx + 8, sy + 8); await T.frames(1);
    const [x, y] = target(); await T.frames(1);
    for (let i = 1; i <= 4; i++) { pe('pointermove', x, y + i); await T.frames(1); }
    pe('pointerup', x, y + 4); await T.sleep(50);
  }
  /** A point inside a cell, below its last card (or in the empty cell), inside the visible part of the board. */
  function cellPoint(key, where = 'end') {
    const cell = document.querySelector('[data-cell="' + CSS.escape(key) + '"]'); const cards = cell.querySelectorAll(':scope > .mb-card');
    (where === 'top' && cards.length ? cards[0] : cell).scrollIntoView({ block: where === 'top' ? 'center' : 'nearest', inline: 'center' });
    const r = cell.getBoundingClientRect(); const view = document.querySelector('.bv-scroll').getBoundingClientRect();
    const bottom = Math.min(r.bottom, view.bottom) - 12;
    if (where === 'top' && cards.length) { const c = cards[0].getBoundingClientRect(); return [c.left + c.width / 2, c.top + 4]; }
    if (cards.length) { const c = cards[cards.length - 1].getBoundingClientRect(); return [c.left + c.width / 2, Math.min(bottom, c.bottom + 6)]; }
    return [r.left + r.width / 2, Math.min(bottom, Math.max(r.top, view.top + 60) + 20)];
  }
  const idle = () => T.until(() => !A.history.running && !B().drag.active, 10000, 'idle');
  const issue = (id) => A.api.issue(id);
`;

/** Opens the board, picks a card in the first non-done column and the next column; returns their ids. */
const PICK = String.raw`
  const L = B().layout; const cols = L.columns.filter((c) => !c.done && !c.backlog);
  const from = cols[0]; const to = cols[1];
  let card = null; let lane = null;
  for (const l of L.lanes) { const list = L.cells.get(l.id + '|' + from.id) ?? []; if (list.length) { card = list[0]; lane = l.id; break; } }
`;

export const cases = [
  {
    group: '보드',
    name: '샘플 보드: 열 머리(이름·개수·WIP)와 카드(키·요약·유형·우선순위·담당자)가 그려짐',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0);
        const b = B(); const data = b.data;
        const heads = [...document.querySelectorAll('.bv-col-head')].map((h) => ({ name: h.querySelector('.bv-col-name')?.textContent, count: Number(h.querySelector('.bv-col-count')?.textContent), over: h.classList.contains('over'), wip: Boolean(h.querySelector('.bv-wip')) }));
        const card = document.querySelector('.bv-board .mb-card');
        return { heads, columns: data.columns.map((c) => ({ name: c.name, total: [...data.issues, ...data.backlog].filter((i) => i.columnId === c.id).length, wipMax: c.wipMax })),
          drawn: document.querySelectorAll('.bv-board .mb-card').length, total: b.layout.total, lanes: document.querySelectorAll('.bv-lane').length,
          card: { key: Boolean(card.querySelector('.mb-key')?.textContent), summary: Boolean(card.querySelector('.mb-summary')?.textContent), type: Boolean(card.querySelector('.mb-type')), avatar: Boolean(card.querySelector('.mb-avatar, .mb-avatar-none')) },
          pageScroll: document.documentElement.scrollWidth <= innerWidth };`);
      assert.ok(r.heads.length >= 4, 'columns');
      assert.deepEqual(r.heads.map((h) => h.name), r.columns.map((c) => c.name));
      assert.deepEqual(r.heads.map((h) => h.count), r.columns.map((c) => c.total), 'header counts = cards per column');
      assert.ok(r.heads.some((h) => h.wip), 'a WIP limit is shown');
      assert.ok(r.drawn > 10 && r.total >= r.drawn, `cards drawn (${r.drawn}/${r.total})`);
      assert.ok(r.lanes > 1, 'epic swimlanes of the sample board');
      assert.deepEqual(r.card, { key: true, summary: true, type: true, avatar: true });
      assert.ok(r.pageScroll, 'no page-level horizontal scroll');
    },
  },
  {
    group: '보드',
    name: '끌어서 다른 열로 옮기기 → POST /issues/:id/move, 상태가 그 열의 상태로 바뀜',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'none' } }); ${PICK}
        await drag(card.id, () => cellPoint('all|' + to.id)); await idle();
        const after = await issue(card.id);
        return { moved: cellOf(card.id), want: 'all|' + to.id, status: after.statusId, statuses: to.statusIds, label: A.history.undoLabel };`);
      assert.equal(r.moved, r.want, 'the card is drawn in the target column');
      assert.ok(r.statuses.includes(r.status), 'the issue has the column status in the database');
      assert.ok(r.label, 'recorded for undo');
    },
  },
  {
    group: '보드',
    name: '같은 열 안에서 순서 바꾸기 (rank): 맨 아래 카드를 맨 위로 → 다시 읽어도 맨 위',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'none' } });
        const L = B().layout; const col = L.columns.find((c) => (L.cells.get('all|' + c.id) ?? []).length >= 3 && !c.collapsed && !c.backlog);
        const list = L.cells.get('all|' + col.id); const last = list[list.length - 1];
        await drag(last.id, () => cellPoint('all|' + col.id, 'top')); await idle();
        const firstNow = B().layout.cells.get('all|' + col.id)[0].id;
        const data = await A.api.boardData(B().boardId);
        const fresh = data.issues.filter((i) => i.columnId === col.id).sort((a, b) => (a.rank < b.rank ? -1 : 1));
        return { id: last.id, firstNow, firstFresh: fresh[0].id };`);
      assert.equal(r.firstNow, r.id, 'drawn at the top');
      assert.equal(r.firstFresh, r.id, 'ranked at the top in the database');
    },
  },
  {
    group: '보드',
    name: 'WIP: 최대를 넘은 열은 경고 색, 그 열로 옮기면 WIP_LIMIT 경고 알림',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'none' } });
        const L = B().layout; const over = L.columns.find((c) => c.wipMax != null && c.total > c.wipMax);
        const head = document.querySelector('.bv-col-head[data-col="' + over.id + '"]');
        const src = L.columns.find((c) => c.id !== over.id && !c.done && (L.cells.get('all|' + c.id) ?? []).length);
        const card = L.cells.get('all|' + src.id)[0];
        await drag(card.id, () => cellPoint('all|' + over.id)); await idle();
        await T.until(() => A.state.notice?.kind === 'warning', 5000, 'warning notice');
        return { overClass: head.classList.contains('over'), cellOver: Boolean(document.querySelector('.bv-cell.over')), notice: A.state.notice.text };`);
      assert.ok(r.overClass, 'header coloured');
      assert.ok(r.cellOver, 'cells tinted');
      assert.match(r.notice, /WIP/);
    },
  },
  {
    group: '보드',
    name: '워크플로가 막는 이동: 번역된 오류, 카드는 제자리로',
    async run(app) {
      const r = await app.run(`${H} await openBoard(1, { prefs: { groupBy: 'none' } });
        // Bug tracker: Open → Closed has no transition.
        const L = B().layout; const open = L.columns[0]; const closed = L.columns[L.columns.length - 1];
        const card = (L.cells.get('all|' + open.id) ?? [])[0];
        B().allowed = null; await B().moveCards([card.id], { laneId: 'all', columnId: closed.id, index: 0 }); await idle();
        const after = await issue(card.id);
        return { cell: cellOf(card.id), want: 'all|' + open.id, status: after.statusId, openStatuses: open.statusIds, notice: A.state.notice?.text ?? '', kind: A.state.notice?.kind };`);
      assert.equal(r.cell, r.want, 'rolled back');
      assert.ok(r.openStatuses.includes(r.status));
      assert.equal(r.kind, 'error');
      assert.match(r.notice, /워크플로/);
    },
  },
  {
    group: '보드',
    name: '빠른 필터와 검색: 카드가 줄고, 보드마다 기억 (localStorage)',
    async run(app) {
      const r = await app.run(`${H} const p = await openBoard(0, { prefs: { groupBy: 'none' } });
        const all = B().layout.shown;
        const chip = () => [...document.querySelectorAll('[data-quick]')].find((b) => /버그/.test(b.textContent)); chip().click();
        await T.until(() => B().prefs.quick.length && !document.querySelector('.bv.bv-reading') && B().layout.shown < all, 10000, 'quick filter');
        const quick = B().layout.shown; const bugType = B().data.types.find((t) => /버그/.test(t.name)).id; const allBugs = B().data.issues.every((i) => i.typeId === bugType);
        chip().click(); await T.until(() => B().layout.shown === all, 10000, 'unfiltered');
        const input = document.querySelector('[data-bv-search]'); const key = B().data.issues[0].key;
        input.value = key; input.dispatchEvent(new Event('input', { bubbles: true }));
        await T.until(() => B().layout.shown >= 1 && B().layout.shown < all, 10000, 'search');
        const found = [...document.querySelectorAll('.bv-board .mb-key')].map((k) => k.textContent);
        const saved = JSON.parse(localStorage.getItem('myboard.board.' + p.boardId));
        const mine = document.querySelector('[data-builtin="mine"]'); mine.click(); await T.frames(2); const mineShown = B().layout.shown; const me = A.state.core.info.user.id; const mineOk = B().layout.shown === 0 || [...B().layout.cells.values()].flat().every((c) => c.assigneeId === me);
        document.querySelector('[data-clear-filters]').click(); await T.until(() => B().layout.shown === all, 10000, 'cleared');
        return { all, quick, allBugs, found, key, saved: saved.search, mineOk, cleared: input.value };`);
      assert.ok(r.quick < r.all && r.allBugs, 'quick filter narrows to bugs');
      assert.ok(r.found.every((k) => k.startsWith(r.key)), `search: ${r.found.join(',')}`);
      assert.equal(r.saved, r.key, 'search remembered for the board');
      assert.ok(r.mineOk, 'only my issues');
      assert.equal(r.cleared, '');
    },
  },
  {
    group: '보드',
    name: '스윔레인: 없음·담당자·에픽·우선순위·유형·하위 작업 — 레인과 개수, 접기, 기억',
    async run(app) {
      const r = await app.run(`${H} const p = await openBoard(0);
        const out = {};
        for (const mode of ['none', 'assignee', 'epic', 'priority', 'type', 'subtasks']) {
          B().setGroup(mode); await T.frames(2);
          const lanes = B().layout.lanes; const drawn = document.querySelectorAll('.bv-lane').length;
          const sum = lanes.reduce((s, l) => s + l.count, 0);
          out[mode] = { lanes: lanes.length, drawn, sum, shown: B().layout.shown, heads: document.querySelectorAll('.bv-lane-head').length };
        }
        B().setGroup('assignee'); await T.frames(1);
        const first = B().layout.lanes[0].id; document.querySelector('[data-lane-toggle="' + CSS.escape(first) + '"]').click(); await T.frames(1);
        const collapsed = document.querySelector('.bv-lane[data-lane="' + CSS.escape(first) + '"]').classList.contains('collapsed');
        const saved = JSON.parse(localStorage.getItem('myboard.board.' + p.boardId));
        return { out, collapsed, saved: saved.groupBy, savedLanes: saved.collapsedLanes.length };`);
      for (const [mode, v] of Object.entries(r.out)) {
        assert.equal(v.sum, v.shown, `${mode}: lane counts add up`);
        assert.equal(v.drawn, v.lanes, `${mode}: every lane drawn`);
      }
      assert.equal(r.out.none.heads, 0, 'no lane headers without swimlanes');
      assert.ok(r.out.assignee.lanes > 1 && r.out.priority.lanes > 1 && r.out.epic.lanes > 1);
      assert.ok(r.collapsed);
      assert.equal(r.saved, 'assignee');
      assert.equal(r.savedLanes, 1);
    },
  },
  {
    group: '보드',
    name: '담당자 레인으로 끌면 담당자가 바뀜 (보드 설정이 아닌 레인: PATCH)',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'assignee' } });
        const L = B().layout; const lanes = L.lanes.filter((l) => l.id !== 'none'); const a = lanes[0]; const b = lanes[1];
        let card = null; let col = null;
        for (const c of L.columns) { const list = L.cells.get(a.id + '|' + c.id) ?? []; if (list.length && !c.collapsed) { card = list[0]; col = c; break; } }
        await drag(card.id, () => cellPoint(b.id + '|' + col.id)); await idle();
        const after = await issue(card.id);
        return { assignee: after.assigneeId, want: b.id, cell: cellOf(card.id), wantCell: b.id + '|' + col.id };`);
      assert.equal(r.assignee, r.want);
      assert.equal(r.cell, r.wantCell);
    },
  },
  {
    group: '보드',
    name: '실행 취소/다시 실행: 열 이동을 되돌리고 다시 함 (데이터베이스 상태로 확인)',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'none' } }); ${PICK}
        const before = (await issue(card.id)).statusId;
        await B().moveCards([card.id], { laneId: 'all', columnId: to.id, index: 0 }); await idle();
        const moved = (await issue(card.id)).statusId;
        await A.actions.undo(); await T.until(() => !A.history.running, 10000, 'undo'); await T.sleep(300);
        const undone = (await issue(card.id)).statusId; await T.until(() => cellOf(card.id) === 'all|' + from.id, 10000, 'drawn back');
        await A.actions.redo(); await T.until(() => !A.history.running, 10000, 'redo'); await T.sleep(300);
        const redone = (await issue(card.id)).statusId; await T.until(() => cellOf(card.id) === 'all|' + to.id, 10000, 'drawn again');
        return { before, moved, undone, redone, toStatuses: to.statusIds };`);
      assert.ok(r.toStatuses.includes(r.moved));
      assert.equal(r.undone, r.before);
      assert.equal(r.redone, r.moved);
    },
  },
  {
    group: '보드',
    name: '키보드: 화살표로 카드 이동, Enter 로 상세, Ctrl+→ 로 다음 열에 옮기기',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'none' } }); ${PICK}
        B().setFocus(card.id); const key = (k, o = {}) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
        key('ArrowDown'); const down = document.activeElement.dataset.id; key('ArrowUp'); const up = document.activeElement.dataset.id;
        key('ArrowRight'); const right = cellOf(document.activeElement.dataset.id); key('ArrowLeft');
        key('Enter'); await T.frames(2); const opened = A.state.selectedIssue;
        B().setFocus(card.id); key('ArrowRight', { ctrlKey: true }); await idle(); await T.sleep(200);
        return { down, up, right, opened, card: card.id, cell: cellOf(card.id), want: 'all|' + to.id, status: (await issue(card.id)).statusId, toStatuses: to.statusIds, focus: document.activeElement?.dataset.id };`);
      assert.notEqual(r.down, r.card);
      assert.equal(r.up, r.card);
      assert.ok(r.right && !r.right.endsWith(r.card), 'focus moved to another column');
      assert.equal(r.opened, r.card, 'Enter opens the detail panel');
      assert.equal(r.cell, r.want);
      assert.ok(r.toStatuses.includes(r.status));
      assert.equal(r.focus, r.card, 'the moved card keeps the focus');
    },
  },
  {
    group: '보드',
    name: '여러 개 고르기 (Ctrl+클릭) → 일괄 막대 → 나에게 할당 (POST /issues/bulk) → 실행 취소',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'none' } });
        const me = A.state.core.info.user.id;
        const cards = B().allCards().filter((c) => c.assigneeId && c.assigneeId !== me && cardEl(c.id)).slice(0, 2);
        for (const c of cards) cardEl(c.id).dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
        await T.frames(1); const bar = !document.querySelector('.bv-bulk').hidden; const olds = cards.map((c) => c.assigneeId);
        document.querySelector('[data-bulk="assignMe"]').click(); await idle(); await T.sleep(500);
        const now = await Promise.all(cards.map((c) => issue(c.id).then((i) => i.assigneeId)));
        await A.actions.undo(); await T.until(() => !A.history.running, 10000, 'undo'); await T.sleep(200);
        const back = await Promise.all(cards.map((c) => issue(c.id).then((i) => i.assigneeId)));
        return { bar, me, now, olds, back, selected: document.querySelectorAll('.bv-board .mb-card.selected').length };`);
      assert.ok(r.bar, 'bulk bar shown');
      assert.deepEqual(r.now, [r.me, r.me]);
      assert.deepEqual(r.back, r.olds);
    },
  },
  {
    group: '보드',
    name: '이슈 만들기 (C): form 팝업 → 요약·우선순위·라벨·스토리 포인트 → 카드가 생김 → 실행 취소로 지움',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'none' } });
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }));
        await T.popupReady('form'); const d = T.popupDoc('form');
        const rows = [...d.querySelectorAll('[data-ff-row]')].map((x) => x.dataset.ffRow);
        const nativeSelects = d.querySelectorAll('select').length;
        const summary = d.querySelector('[data-ff="summary"]'); summary.value = 'E2E 보드에서 만든 이슈'; summary.dispatchEvent(new Event('input', { bubbles: true }));
        d.querySelector('[data-ref-dd="priority"]').click(); await T.frames(1);
        const items = [...d.querySelectorAll('.mb-reflist .dd-item')]; const icons = items.every((i) => i.querySelector('.iconref, .icon')); items[0].click(); await T.frames(1);
        const sp = d.querySelector('[data-ff-row="storyPoints"] .stepper-button[data-step-dir="1"]'); sp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); sp.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        d.querySelector('[data-ref-dd="labels"]').click(); await T.frames(1); const search = d.querySelector('.mb-reflist-search input'); search.value = 'e2e-label'; search.dispatchEvent(new Event('input', { bubbles: true })); await T.frames(1);
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await T.frames(1); search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await T.frames(1);
        d.querySelector('[data-action="form-submit"]').click();
        await T.until(() => [...document.querySelectorAll('.bv-board .mb-summary')].some((s) => s.textContent === 'E2E 보드에서 만든 이슈'), 10000, 'card shown');
        const card = B().allCards().find((c) => c.summary === 'E2E 보드에서 만든 이슈'); const full = await issue(card.id);
        const prio = B().data.priorities[0].id; const label = A.history.undoLabel;
        await A.actions.undo(); await T.until(() => !A.history.running, 10000, 'undo'); await T.sleep(300);
        const fresh = await A.api.boardData(B().boardId); const gone = ![...fresh.issues, ...fresh.backlog].some((c) => c.id === card.id);
        return { rows, nativeSelects, icons, priority: full.priorityId === prio, points: full.storyPoints, labels: full.labels, label, gone };`);
      for (const f of ['type', 'summary', 'description', 'assignee', 'priority', 'labels', 'storyPoints', 'dueDate', 'icon']) assert.ok(r.rows.includes(f), `field ${f}`);
      assert.equal(r.nativeSelects, 0, 'no native select');
      assert.ok(r.icons, 'icons on every option');
      assert.ok(r.priority, 'priority chosen in the IconRef dropdown');
      assert.equal(r.points, 1, 'stepper +1');
      assert.deepEqual(r.labels, ['e2e-label'], 'a new label typed in the multi-select');
      assert.ok(r.label, 'undoable');
      assert.ok(r.gone, 'undo deletes it');
    },
  },
  {
    group: '보드',
    name: 'form 팝업 계약: 필수 칸 검사, 모든 형식(checkbox·duration·color·date·multiselect·number) 값, 취소는 null',
    async run(app) {
      const r = await app.run(`${H} await T.reset({ workspace: true });
        const fields = [
          { name: 'title', type: 'text', label: 'Title', required: true },
          { name: 'on', type: 'checkbox', label: 'On', value: true },
          { name: 'est', type: 'duration', label: 'Estimate', value: 5400 },
          { name: 'col', type: 'color', label: 'Colour' },
          { name: 'when', type: 'date', label: 'Date', value: '2026-12-01' },
          { name: 'tags', type: 'multiselect', label: 'Tags', value: ['a'], options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
          { name: 'n', type: 'number', label: 'N', value: 3, min: 0, max: 10 },
          { name: 'kind', type: 'select', label: 'Kind', value: 'x', options: [{ value: 'x', label: 'X', glyph: 'star' }, { value: 'y', label: 'Y', glyph: 'flag' }] },
          { name: 'extra', type: 'text', label: 'Extra', when: { kind: 'y' } },
        ];
        const p = A.popups.open('form', { title: 'T', icon: 'edit', fields }); await T.popupReady('form'); const d = T.popupDoc('form');
        d.querySelector('[data-action="form-submit"]').click(); await T.frames(2);
        const blocked = Boolean(d.querySelector('[data-ff-row="title"] .invalid, [data-ff-row="title"] .ff-error'));
        const hiddenExtra = !d.querySelector('[data-ff-row="extra"]');
        const t = d.querySelector('[data-ff="title"]'); t.value = ' Hello '; t.dispatchEvent(new Event('input', { bubbles: true }));
        d.querySelector('[data-ff-color="col"][data-value="#2f9e44"]').click(); await T.frames(1);
        d.querySelector('[data-ff-check="on"]').click(); await T.frames(1);
        d.querySelector('[data-ref-dd="kind"]').click(); await T.frames(1); [...d.querySelectorAll('.mb-reflist .dd-item')].find((i) => i.dataset.value === 'y').click(); await T.frames(1);
        const shownExtra = Boolean(d.querySelector('[data-ff-row="extra"]'));
        const est = d.querySelector('[data-ff-duration="est"]'); est.value = '2h 15m'; est.dispatchEvent(new Event('input', { bubbles: true }));
        d.querySelector('[data-action="form-submit"]').click(); const res = await p;
        const p2 = A.popups.open('form', { title: 'T', fields: [{ name: 'a', type: 'text' }] }); await T.popupReady('form'); T.popupDoc('form').querySelector('[data-action="close"]').click(); const cancelled = await p2;
        return { blocked, hiddenExtra, shownExtra, values: res?.values, cancelled };`);
      assert.ok(r.blocked, 'required field stops the submit');
      assert.ok(r.hiddenExtra && r.shownExtra, 'a field with when shows only then');
      assert.deepEqual(r.values, { title: 'Hello', on: false, est: 8100, col: '#2f9e44', when: '2026-12-01', tags: ['a'], n: 3, kind: 'y', extra: '' });
      assert.equal(r.cancelled, null);
    },
  },
  {
    group: '보드',
    name: '카드 컨텍스트 메뉴: 셸 메뉴 팝업, 플래그 표시 → 데이터베이스에 저장, 열로 옮기기 하위 메뉴',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0, { prefs: { groupBy: 'none' } });
        const card = B().allCards().find((c) => !c.flagged && cardEl(c.id));
        const el = cardEl(card.id); const [x, y] = center(el);
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
        await T.popupReady('menu'); const d = T.popupDoc('menu');
        const ids = [...d.querySelectorAll('.menu-item')].map((m) => m.dataset.id);
        const sub = d.querySelector('.menu-item[data-id="submenu:board-move"]'); const hasSub = Boolean(sub?.classList.contains('has-sub'));
        d.querySelector('.menu-item[data-id="custom:flag"]').click();
        await T.until(() => B().card(card.id)?.flagged && !A.history.running, 5000, 'flag'); await T.sleep(300);
        const flagged = (await issue(card.id)).flagged;
        await A.actions.undo(); await T.until(() => !A.history.running, 5000, 'undo'); await T.sleep(200);
        return { ids, hasSub, flagged, after: (await issue(card.id)).flagged, cls: cardEl(card.id)?.classList.contains('flagged') };`);
      for (const id of ['custom:open', 'submenu:board-move', 'custom:assignMe', 'custom:flag', 'submenu:board-priority', 'custom:icon', 'custom:copyKey', 'custom:clone', 'custom:delete']) assert.ok(r.ids.includes(id), `menu item ${id}`);
      assert.ok(r.hasSub, 'move-to-column submenu');
      assert.equal(r.flagged, true);
      assert.equal(r.after, false, 'undo removes the flag');
    },
  },
  {
    group: '보드',
    name: '한국어 ↔ English: 보드 글자(검색·필터·스윔레인·열 버튼)가 바뀜',
    async run(app) {
      const r = await app.run(`${H} await openBoard(0);
        const read = () => ({ search: document.querySelector('[data-bv-search]').placeholder, mine: document.querySelector('[data-builtin="mine"]').textContent.trim(), lanes: document.querySelector('.bv-tool-label').textContent.trim(), add: document.querySelector('.bv-col-add')?.title, count: document.querySelector('.bv-count').textContent });
        const ko = read(); await A.run('language'); await T.frames(3); const en = read(); await A.run('language'); await T.frames(2);
        return { ko, en };`);
      assert.equal(r.ko.search, '보드에서 찾기');
      assert.equal(r.en.search, 'Search this board');
      assert.equal(r.en.mine, 'Only my issues');
      assert.equal(r.en.lanes, 'Swimlanes');
      assert.match(r.en.count, /issues/);
      assert.notEqual(r.ko.add, r.en.add);
    },
  },
  {
    group: '보드',
    name: '실시간: 다른 클라이언트의 변경이 다시 읽지 않고 반영 (요약 바뀜, 삭제)',
    async run(app) {
      const r = await app.run(`${H} await openBoard(2, { prefs: { groupBy: 'none' } });
        if (A.live().state !== 'open') await T.until(() => A.live().state === 'open', 10000, 'live');
        await T.sleep(400);
        const { ApiClient } = await import('/src/api/client.js'); const other = new ApiClient({ base: '/api' }); other.clientId = 'e2e-other-client';
        const card = B().allCards().find((c) => cardEl(c.id)); const seq = B().seq;
        await other.updateIssue(card.id, { summary: 'Changed by someone else' });
        await T.until(() => cardEl(card.id)?.querySelector('.mb-summary')?.textContent === 'Changed by someone else', 8000, 'remote change shown');
        const sameRead = B().seq === seq;
        const victim = B().allCards().find((c) => c.id !== card.id && cardEl(c.id));
        await other.deleteIssue(victim.id);
        await T.until(() => !cardEl(victim.id), 8000, 'remote delete shown');
        return { sameRead };`);
      assert.ok(r.sameRead, 'applied from the event (no board read)');
    },
  },
  {
    group: '보드',
    name: '이 창의 다른 보기(상세 패널)가 바꾼 이슈: myboard:event 로 보드에 바로 반영',
    async run(app) {
      const r = await app.run(`${H} await openBoard(2, { prefs: { groupBy: 'none' } });
        const card = B().allCards().find((c) => cardEl(c.id));
        const updated = await A.api.updateIssue(card.id, { summary: 'Changed in the detail panel' });
        const before = cardEl(card.id).querySelector('.mb-summary').textContent;
        window.dispatchEvent(new CustomEvent('myboard:event', { detail: { type: 'issue.updated', id: card.id, rev: updated.rev, data: updated } })); await T.frames(1);
        return { before, after: cardEl(card.id).querySelector('.mb-summary').textContent, rev: B().card(card.id).rev === updated.rev };`);
      assert.notEqual(r.before, 'Changed in the detail panel', 'own changes do not come back over the live channel');
      assert.equal(r.after, 'Changed in the detail panel');
      assert.ok(r.rev, 'the new rev is kept (the next move does not conflict)');
    },
  },
  {
    group: '보드',
    name: '가장 좁은 창 · 어두운 테마: 페이지 가로 스크롤 없음, 막대가 잘리지 않음, 열은 보드 안에서 가로 스크롤',
    async run(app) {
      const min = await app.run('return A.state.minWidth || 900;');
      await app.main.send('Emulation.setDeviceMetricsOverride', { width: min, height: 600, deviceScaleFactor: 1, mobile: false });
      try {
        const r = await app.run(`${H} const theme = A.state.settings.theme; A.actions.updateSettings({ theme: 'dark' }); await openBoard(0); await T.frames(3);
          const barEl = document.querySelector('.bv-bar'); const bar = barEl.getBoundingClientRect();
          // Every bar item is either inside the bar or reachable by scrolling the bar (one line when narrow).
          const scrolls = getComputedStyle(barEl).overflowX === 'auto';
          const inside = [...document.querySelectorAll('.bv-bar > *, .bv-bar .bv-chip, .bv-bar .mb-refbutton, .bv-bar .small-button')].every((el) => { const r = el.getBoundingClientRect(); return r.width === 0 || (r.top >= bar.top - 1 && r.bottom <= bar.bottom + 1 && (scrolls || (r.left >= bar.left - 1 && r.right <= bar.right + 1))); });
          const barShort = bar.height < 120;
          const sc = document.querySelector('.bv-scroll'); const dark = document.documentElement.dataset.mode;
          const bg = getComputedStyle(document.querySelector('.bv-board .mb-card')).backgroundColor;
          const out = { page: document.documentElement.scrollWidth - innerWidth, inside, barShort, boardScroll: sc.scrollWidth > sc.clientWidth, dark, bg };
          A.actions.updateSettings({ theme }); await T.frames(2); return out;`);
        assert.ok(r.page <= 0, `page scrolls sideways by ${r.page}px`);
        assert.ok(r.inside, 'bar items inside the bar (or reachable by scrolling it)');
        assert.ok(r.barShort, 'the bar leaves the board its height');
        assert.ok(r.boardScroll, 'the columns scroll inside the board');
        assert.equal(r.dark, 'dark');
        assert.notEqual(r.bg, 'rgb(255, 255, 255)', 'cards take the dark theme');
      } finally {
        await app.main.send('Emulation.setDeviceMetricsOverride', { width: app.width, height: app.height, deviceScaleFactor: 1, mobile: false });
      }
    },
  },
  {
    group: '보드',
    name: '빈 보드: 안내와 "이슈 만들기" 버튼, 열은 그대로 보임',
    async run(app) {
      const r = await app.run(`${H} await T.reset();
        const key = 'E' + Date.now().toString(36).slice(-5).toUpperCase(); const p = await A.api.createProject({ key, name: 'Empty ' + key, template: 'simple' });
        await A.actions.openTarget('board', p.boardId, { quiet: true }); await T.until(() => B()?.status === 'ready' && B().boardId === p.boardId && document.querySelector('.bv-heads'), 15000, 'board');
        return { note: Boolean(document.querySelector('.bv-empty-note [data-bv-create]')), cols: document.querySelectorAll('.bv-col-head').length };`);
      assert.ok(r.note);
      assert.equal(r.cols, 3);
    },
  },
  {
    group: '보드',
    name: '큰 보드: 이슈 2000개 — 빨리 그리고 긴 열은 나눠서 그림 (스크롤하면 더 그림)',
    async run(app) {
      const r = await app.run(`${H} await T.reset();
        const key = 'BIG' + Date.now().toString(36).slice(-4).toUpperCase(); const p = await A.api.createProject({ key, name: 'Big ' + key, template: 'simple' });
        const rows = ['Summary,Status']; const st = ['To Do', 'Doing', 'Done'];
        for (let i = 0; i < 2000; i++) rows.push('Issue ' + i + ',' + st[i % 3]);
        const project = await A.api.project(p.id ?? p.project?.id);
        const res = await A.api.importCsv({ projectId: project.id, csv: rows.join('\\n'), mapping: { Summary: 'summary', Status: 'status' } });
        const t0 = performance.now(); await A.actions.openTarget('board', p.boardId, { quiet: true });
        await T.until(() => B()?.status === 'ready' && B().boardId === p.boardId && document.querySelector('.bv-board .mb-card'), 60000, 'board'); await T.frames(2);
        const ms = performance.now() - t0; const drawn = document.querySelectorAll('.bv-board .mb-card').length;
        const sc = document.querySelector('.bv-scroll'); const t1 = performance.now(); sc.scrollTop = sc.scrollHeight; await T.until(() => document.querySelectorAll('.bv-board .mb-card').length > drawn, 5000, 'more drawn'); const moreMs = performance.now() - t1;
        return { created: res.created, total: B().layout.total, ms: Math.round(ms), drawn, after: document.querySelectorAll('.bv-board .mb-card').length, moreMs: Math.round(moreMs), read: B().data.elapsedMs };`, 240000);
      app.note?.(`이슈 ${r.total}개: 열기 ${r.ms} ms (코어 ${r.read} ms), 처음 그린 카드 ${r.drawn}, 스크롤 뒤 ${r.after} (${r.moreMs} ms)`);
      assert.ok(r.total >= 1300, `issues on the board: ${r.total}`);
      assert.ok(r.drawn < 400, 'long columns drawn lazily');
      assert.ok(r.after > r.drawn);
      assert.ok(r.ms < 8000, `opened in ${r.ms} ms`);
    },
  },
  {
    group: '보드',
    name: '이슈 만들기: 사용자 정의 필드는 그 유형에서만 보이고 기본값이 채워짐, 담당자 없이 구성 요소 → 그 기본 담당자, 해결된 카드에 해결 방법 아이콘',
    async run(app) {
      const r = await app.run(`${H}
        const s = await samples();
        // the bug tracker sample: Environment (Bug only, default "Windows 11"), components with default assignees
        let p = null; let data = null;
        for (const x of s.projects) { const d = await A.api.boardData(x.boardId); if ((d.fields ?? []).some((f) => f.defaultValue === 'Windows 11')) { p = x; data = d; break; } }
        const env = data.fields.find((f) => f.defaultValue === 'Windows 11');
        const bug = data.types.find((t) => env.issueTypeIds.includes(t.id)); const other = data.types.find((t) => t.level === 0 && !env.issueTypeIds.includes(t.id));
        const comp = data.components.find((c) => c.defaultAssigneeId);
        await openBoard(s.projects.indexOf(p), { prefs: { groupBy: 'none' } });
        const resolvedCard = B().allCards().find((c) => c.resolutionId);
        const resIcon = resolvedCard ? Boolean(cardEl(resolvedCard.id)?.querySelector('.mb-resolution .iconref')) : null;
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }));
        await T.popupReady('form'); let d = T.popupDoc('form');
        const pickRef = async (name, value) => { d.querySelector('[data-ref-dd="' + name + '"]').click(); await T.frames(2); d.querySelector('.mb-reflist .dd-item[data-value="' + CSS.escape(value) + '"]').click(); await T.frames(2); d = T.popupDoc('form'); };
        await pickRef('type', other.id);
        const hiddenForOther = !d.querySelector('[data-ff-row="cf:' + env.id + '"]');
        await pickRef('type', bug.id);
        const envInput = d.querySelector('[data-ff-row="cf:' + env.id + '"] input');
        const shownValue = envInput?.value;
        await pickRef('components', comp.id); d.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await T.frames(2); d = T.popupDoc('form');
        const hint = d.querySelector('[data-ff-row="assignee"] .ff-hint')?.textContent ?? '';
        const summary = d.querySelector('[data-ff="summary"]'); summary.value = 'E2E 기본값 이슈'; summary.dispatchEvent(new Event('input', { bubbles: true }));
        d.querySelector('[data-action="form-submit"]').click();
        await T.until(() => B().allCards().some((c) => c.summary === 'E2E 기본값 이슈'), 10000, 'card');
        const card = B().allCards().find((c) => c.summary === 'E2E 기본값 이슈'); const full = await issue(card.id);
        await A.api.deleteIssue(card.id);
        return { resIcon, hiddenForOther, shownValue, hint, env: full.custom[env.id], assignee: full.assigneeId, want: comp.defaultAssigneeId, comps: full.componentIds, comp: comp.id };`);
      assert.equal(r.resIcon, true, 'a resolved card shows its resolution icon');
      assert.ok(r.hiddenForOther, 'the Bug-only field is hidden for another type');
      assert.equal(r.shownValue, 'Windows 11', 'the default is filled in');
      assert.ok(r.hint.length > 0, 'the assignee field explains the default');
      assert.equal(r.env, 'Windows 11');
      assert.deepEqual(r.comps, [r.comp]);
      assert.equal(r.assignee, r.want, 'the component default assignee took the issue');
    },
  },
];
