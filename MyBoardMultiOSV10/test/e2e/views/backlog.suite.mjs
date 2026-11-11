// Backlog / search view E2E cases (web build with a web core). Each case opens the sample project SHOP
// (made with POST /samples the first time) in the backlog view and checks the screen against the API.
import assert from 'node:assert/strict';

/** Page prelude: core ready, samples there, SHOP open in the backlog with default view settings → `v`, `shop`. */
const OPEN = `await T.reset(); await T.until(() => A.state.core.status === 'ready', 20000, 'core');
  try { localStorage.removeItem('myboard.backlog.v1'); } catch {}
  if (A.state.settings.language !== 'ko') A.actions.updateSettings({ language: 'ko' });
  let list = await A.api.projects({ limit: 200 }); list = Array.isArray(list) ? list : list.items;
  let shop = list.find((p) => p.key === 'SHOP');
  if (!shop) { const made = await A.api.createSamples('en'); shop = made.projects.find((p) => String(p.key).startsWith('SHOP')); await A.actions.refreshProjects(); }
  await A.actions.openTarget('project', shop.id, { view: 'backlog', quiet: true });
  await T.until(() => window.__myboardBacklog?.state === 'ready' && window.__myboardBacklog.project?.id === shop.id, 20000, 'backlog ready');
  const v = window.__myboardBacklog;
  const keysOf = (items) => items.map((i) => i.key);
  const settle = () => T.until(() => v.state === 'ready' && !document.querySelector('.bl-root.busy'), 10000, 'settled');`;

/** Answers the prompt popup (a frame in the web build) with a value. */
const ANSWER_PROMPT = `async function answerPrompt(value) {
    await T.popupReady('prompt');
    const d = T.popupDoc('prompt');
    const input = d.querySelector('[data-draft="value"]');
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    d.querySelector('[data-action="prompt-apply"]').click();
  }
  async function answerConfirm(choice) {
    await T.popupReady('confirm');
    T.popupDoc('confirm').querySelector('[data-action="choice"][data-value="' + choice + '"]').click();
  }`;

export const cases = [
  {
    group: '백로그',
    name: '샘플 불러오기 → 목록이 API 결과와 같음 (보드 열로 묶음, 쪽 크기, 에픽·버전 패널)',
    async run(app) {
      const r = await app.run(`${OPEN}
        const api = await A.api.issues({ jql: v.currentJql(), limit: 50 });
        const rows = [...document.querySelectorAll('.bl-row')].map((el) => el.dataset.key);
        const groups = [...document.querySelectorAll('.bl-group-head b')].map((b) => b.textContent);
        const columns = (await A.api.boardData(v.board.id)).columns.map((c) => c.name);
        return { total: v.total, apiTotal: api.total, rows: rows.length, sameSet: [...rows].sort().join() === keysOf(api.items).sort().join(), groups, columns,
          epics: document.querySelectorAll('.left-view-body [data-vs-act="epic"]').length, versions: document.querySelectorAll('.left-view-body [data-vs-act="version"]').length,
          foot: document.querySelector('.bl-total').textContent, lozenge: Boolean(document.querySelector('.bl-row .bl-lozenge')), avatar: Boolean(document.querySelector('.bl-row .bl-person .iconref')) };`);
      assert.equal(r.total, r.apiTotal, 'total = API total');
      assert.equal(r.rows, Math.min(50, r.apiTotal), 'one page of rows');
      assert.ok(r.sameSet, 'the same issues as the API');
      for (const name of r.groups.filter((g) => !/보드에 없는/.test(g))) assert.ok(r.columns.includes(name), `group ${name} is a board column`);
      assert.ok(r.epics >= 3, 'epics panel');
      assert.ok(r.versions >= 2, 'versions panel');
      assert.match(r.foot, new RegExp(`${r.apiTotal}`));
      assert.ok(r.lozenge && r.avatar, 'status lozenge and avatar');
    },
  },
  {
    group: '백로그',
    name: '끌어서 순위 바꾸기 (실제 포인터) → API 순서가 바뀜, 실행 취소로 되돌림',
    async run(app) {
      const before = await app.run(`${OPEN}
        const group = document.querySelector('.bl-group .bl-group-body');
        const rows = [...group.querySelectorAll('.bl-row')];
        const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + Math.min(320, b.width / 2), y: b.top + b.height / 2, h: b.height }; };
        return { keys: rows.map((x) => x.dataset.key), statusIds: [...new Set(v.items.filter((i) => rows.some((x) => x.dataset.id === i.id)).map((i) => i.statusId))], a: r(rows[0]), c: r(rows[2]) };`);
      assert.ok(before.keys.length >= 3, 'three rows in the first group');
      await app.main.drag({ x: before.a.x, y: before.a.y }, { x: before.a.x, y: before.c.y + before.c.h * 0.35 }, 16);
      const after = await app.run(`const v = window.__myboardBacklog; await T.until(() => A.history.undoLabel.includes(${JSON.stringify(before.keys[0])}), 8000, 'rank step');
        await T.until(() => v.state === 'ready', 5000, 'ready');
        const jql = 'project = SHOP AND status in (' + ${JSON.stringify(before.statusIds)}.map((s) => '"' + s + '"').join(',') + ') ORDER BY rank';
        const api = (await A.api.issues({ jql, limit: 10 })).items.map((i) => i.key);
        await A.actions.undo(); await T.sleep(300);
        const back = (await A.api.issues({ jql, limit: 10 })).items.map((i) => i.key);
        return { api, back };`);
      const [a, b, c] = before.keys;
      assert.deepEqual(after.api.slice(0, 3), [b, c, a], 'the dragged issue is now third');
      assert.deepEqual(after.back.slice(0, 3), [a, b, c], 'undo restores the order');
    },
  },
  {
    group: '백로그',
    name: '키보드로 순위 (Alt+↓) 와 커서 이동 (↓, Enter → 상세)',
    async run(app) {
      const r = await app.run(`${OPEN}
        const rows = [...document.querySelector('.bl-group .bl-group-body').querySelectorAll('.bl-row')];
        const first = rows[0].dataset.key, second = rows[1].dataset.key, id = rows[0].dataset.id;
        v.cursor = id; v.renderList(); v.el.list.focus();
        v.el.list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
        await T.until(() => A.history.undoLabel.includes(first), 8000, 'key rank');
        await T.until(() => document.querySelector('.bl-group .bl-group-body .bl-row')?.dataset.key === second, 8000, 'reordered');
        const order = [...document.querySelector('.bl-group .bl-group-body').querySelectorAll('.bl-row')].slice(0, 2).map((x) => x.dataset.key);
        await A.actions.undo(); await T.sleep(200);
        v.el.list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await T.frames(2);
        return { first, second, order, opened: A.state.selectedIssue === id };`);
      assert.deepEqual(r.order, [r.second, r.first]);
      assert.ok(r.opened, 'Enter opens the issue in the detail panel');
    },
  },
  {
    group: '백로그',
    name: '여러 개 고르기 (Ctrl/Shift) → 일괄 상태 바꾸기·담당자 → API 확인, 실행 취소',
    async run(app) {
      const r = await app.run(`${OPEN}
        const rows = [...document.querySelectorAll('.bl-row')];
        rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.querySelectorAll('.bl-row')[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
        const ids = [...v.selected];
        const bar = !document.querySelector('.bl-bulk').hidden;
        const before = await Promise.all(ids.map((id) => A.api.issue(id)));
        document.querySelector('[data-drop="b:transition"]').click();
        await T.until(() => document.querySelector('.mbv-pop'), 3000, 'status list');
        [...document.querySelectorAll('.mbv-pop-item')].find((x) => x.textContent.includes('In Review')).click();
        await T.until(() => A.history.undoLabel.includes('In Review'), 10000, 'bulk transition');
        const moved = await Promise.all(ids.map((id) => A.api.issue(id)));
        v.selected = new Set(ids); v.renderBulk();
        document.querySelector('[data-drop="b:assign"]').click();
        await T.until(() => document.querySelector('.mbv-pop'), 3000, 'user list');
        const user = document.querySelectorAll('.mbv-pop-item')[2];
        const userName = user.querySelector('.mbv-pop-label').textContent; user.click();
        await T.until(() => A.history.undoLabel.includes(userName), 10000, 'bulk assign');
        const assigned = await Promise.all(ids.map((id) => A.api.issue(id)));
        await A.actions.undo(); await A.actions.undo(); await T.sleep(200);
        const back = await Promise.all(ids.map((id) => A.api.issue(id)));
        return { n: ids.length, bar, inReview: moved.map((i) => v.lookups.statuses.get(i.statusId)?.name), assignees: [...new Set(assigned.map((i) => v.lookups.userName(i.assigneeId)))], userName,
          restored: back.every((i, k) => i.statusId === before[k].statusId && (i.assigneeId ?? null) === (before[k].assigneeId ?? null)) };`);
      assert.equal(r.n, 3, 'Shift selects the range');
      assert.ok(r.bar, 'bulk bar');
      assert.deepEqual(r.inReview, ['In Review', 'In Review', 'In Review']);
      assert.deepEqual(r.assignees, [r.userName]);
      assert.ok(r.restored, 'two undos restore status and assignee');
    },
  },
  {
    group: '백로그',
    name: '인라인 이슈 만들기 (Enter) → API 에 생기고 목록에 보임, 실행 취소는 삭제',
    async run(app) {
      const r = await app.run(`${OPEN}
        const total = v.total;
        document.querySelector('.bl-create-open').click();
        const input = document.querySelector('.bl-create-input');
        input.value = 'E2E 인라인 이슈 ' + Date.now();
        const summary = input.value;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await T.until(() => A.history.undoLabel.startsWith('SHOP-'), 8000, 'created');
        await T.until(() => v.total === total + 1, 8000, 'list total');
        const found = await A.api.issues({ jql: 'project = SHOP AND summary ~ "' + summary + '"', limit: 5 });
        const focused = document.activeElement?.classList.contains('bl-create-input');
        await A.actions.undo(); await T.sleep(200);
        const gone = await A.api.issues({ jql: 'project = SHOP AND summary ~ "' + summary + '"', limit: 5 });
        return { created: found.total, gone: gone.total, focused };`);
      assert.equal(r.created, 1);
      assert.ok(r.focused, 'the row stays open for the next issue');
      assert.equal(r.gone, 0, 'undo deletes it');
    },
  },
  {
    group: '백로그',
    name: '기본 검색: 유형·상태 드롭다운 + 글자 → JQL 과 개수가 API 와 같음',
    async run(app) {
      const r = await app.run(`${OPEN}
        const pick = async (drop, label) => {
          document.querySelector('[data-drop="' + drop + '"]').click();
          await T.until(() => document.querySelector('.mbv-pop'), 3000, drop);
          [...document.querySelectorAll('.mbv-pop-item')].find((x) => x.querySelector('.mbv-pop-label').textContent === label).click();
          document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          await T.sleep(250); await settle();
        };
        await pick('f:types', 'Bug');
        await pick('f:statuses', 'In Progress');
        const typed = v.currentJql();
        const api1 = await A.api.issues({ jql: typed, limit: 0 });
        const n1 = v.total;
        const text = document.querySelector('[data-input="text"]'); text.value = 'payment'; text.dispatchEvent(new Event('input', { bubbles: true }));
        await T.until(() => v.lastJql.includes('payment'), 4000, 'text'); await settle();
        const api2 = await A.api.issues({ jql: v.currentJql(), limit: 0 });
        const types = [...new Set(v.items.map((i) => v.lookups.types.get(i.typeId)?.name))];
        return { typed, n1, a1: api1.total, n2: v.total, a2: api2.total, types, label: document.querySelector('[data-drop="f:types"]').textContent.trim() };`);
      assert.match(r.typed, /type = "Bug"/);
      assert.match(r.typed, /status = "In Progress"/);
      assert.equal(r.n1, r.a1);
      assert.equal(r.n2, r.a2);
      assert.ok(r.types.every((x) => x === 'Bug'));
      assert.match(r.label, /Bug/);
    },
  },
  {
    group: '백로그',
    name: 'JQL: 올바른 질의 · 문법 오류 위치에 밑줄 · 자동 완성 (필드·값)',
    async run(app) {
      const r = await app.run(`${OPEN}
        document.querySelector('.bl-mode [data-value="jql"]').click();
        await T.until(() => v.editor, 3000, 'editor');
        const ed = v.editor; const ta = document.querySelector('.mbv-jql-input');
        ed.setValue('project = SHOP AND (status = Done OR');
        await T.until(() => document.querySelector('.mbv-jql.invalid'), 5000, 'invalid');
        const mark = document.querySelector('.mbv-jql-error');
        const error = { pos: Number(mark.dataset.pos), text: document.querySelector('.mbv-jql-status').textContent, underline: getComputedStyle(mark).textDecorationLine };
        const check = await A.api.validateJql(ed.value);
        ed.setValue('sta'); ta.focus(); ta.setSelectionRange(3, 3); ed.scheduleSuggest(0);
        await T.until(() => !document.querySelector('.mbv-jql-suggest').hidden, 5000, 'field list');
        const fields = [...document.querySelectorAll('.mbv-jql-item span')].map((s) => s.textContent);
        ed.accept(ed.items[0]);
        ta.value = ed.value + '= '; ta.setSelectionRange(ta.value.length, ta.value.length); ta.dispatchEvent(new Event('input', { bubbles: true }));
        ed.scheduleSuggest(0);
        await T.until(() => !document.querySelector('.mbv-jql-suggest').hidden && ed.context?.kind === 'value', 5000, 'value list');
        const values = ed.items.map((i) => i.label);
        ed.accept(ed.items.find((i) => i.label === 'Done'));
        const text = ed.value;
        await ed.submit();
        await T.until(() => v.lastJql.includes('Done'), 5000, 'search');
        const api = await A.api.issues({ jql: v.currentJql(), limit: 0 });
        return { error, check, fields, values, text, total: v.total, apiTotal: api.total, valid: document.querySelector('.mbv-jql-status').textContent };`);
      assert.equal(r.check.ok, false);
      assert.equal(r.error.pos, r.check.error.details.position, 'underline at the reported position');
      assert.match(r.error.text, /문법 오류/);
      assert.match(r.error.underline, /underline/);
      assert.deepEqual(r.fields.slice(0, 2), ['status', 'statusCategory']);
      assert.ok(r.values.includes('Done') && r.values.includes('In Progress'), 'status values from the database');
      assert.match(r.text, /^status = Done ?$/);
      assert.equal(r.total, r.apiTotal);
      assert.match(r.valid, /올바른 질의/);
    },
  },
  {
    group: '백로그',
    name: '열 머리글로 정렬 (ORDER BY) · 열 고르기 · 쪽 넘기기',
    async run(app) {
      const r = await app.run(`${OPEN}
        document.querySelector('[data-sort="priority"]').click(); await T.until(() => v.lastJql.includes('ORDER BY priority ASC'), 4000, 'asc'); await settle();
        document.querySelector('[data-sort="priority"]').click(); await T.until(() => v.lastJql.includes('ORDER BY priority DESC'), 4000, 'desc'); await settle();
        const jql = v.currentJql();
        const api = await A.api.issues({ jql, limit: 50 });
        v.prefs.group = 'none'; v.renderList();
        const shown = [...document.querySelectorAll('.bl-row')].map((x) => x.dataset.key);
        const rankHint = Boolean(document.querySelector('.bl-rank-hint'));
        document.querySelector('[data-drop="columns"]').click(); await T.until(() => document.querySelector('.mbv-pop'), 3000, 'columns');
        [...document.querySelectorAll('.mbv-pop-item')].find((x) => x.dataset.value === 'created').click();
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        const created = Boolean(document.querySelector('.bl-head .bl-h-created'));
        v.prefs.pageSize = 25; await v.search();
        document.querySelector('[data-act="page"][data-value="1"]').click(); await T.until(() => v.page === 1 && v.state === 'ready', 5000, 'page 2'); await settle();
        const page2 = await A.api.issues({ jql: v.currentJql(), limit: 25, offset: 25 });
        return { jql, same: shown.join() === keysOf(api.items).join(), rankHint, created, page2: keysOf(v.items).join() === keysOf(page2.items).join(), foot: document.querySelector('.bl-total').textContent };`);
      assert.match(r.jql, /ORDER BY priority DESC$/);
      assert.ok(r.same, 'the rows in the API order');
      assert.ok(r.rankHint, 'rank dragging is off while sorted by another field');
      assert.ok(r.created, 'the chosen column shows');
      assert.ok(r.page2, 'page 2 = API offset 25');
      assert.match(r.foot, /^26–/);
    },
  },
  {
    group: '백로그',
    name: '저장된 필터: 저장(이름 입력) → 목록 → 별표 → 삭제(확인) → API 에서 사라짐',
    async run(app) {
      const r = await app.run(`${OPEN}
        ${ANSWER_PROMPT}
        const name = 'E2E 필터 ' + Date.now();
        v.filters.hideDone = true; await v.search();
        document.querySelector('[data-drop="filters"]').click(); await T.until(() => document.querySelector('.mbv-pop'), 3000, 'menu');
        document.querySelector('.mbv-pop-item[data-value="saveAs"]').click();
        await answerPrompt(name);
        await T.until(() => v.filter?.name === name, 8000, 'saved');
        const saved = (await A.api.filters()).find((f) => f.name === name);
        await v.filterAction('star');
        const starred = (await A.api.filters()).find((f) => f.name === name)?.favourite;
        document.querySelector('[data-drop="filters"]').click(); await T.until(() => document.querySelector('.mbv-pop'), 3000, 'menu 2');
        await T.frames(2); const listed = [...document.querySelectorAll('.left-view-body [data-vs-act="filter"] .vs-label')].some((x) => x.textContent === name);
        document.querySelector('.mbv-pop-item[data-value="delete"]').click();
        await answerConfirm('delete');
        await T.until(() => !v.filter, 8000, 'deleted');
        const after = (await A.api.filters()).some((f) => f.name === name);
        return { jql: saved?.jql, current: v.currentJql(), listed, starred, after, button: document.querySelector('[data-drop="filters"]').textContent.trim() };`);
      assert.match(r.jql, /statusCategory != done/);
      assert.ok(r.listed, 'in the filter menu');
      assert.equal(r.starred, true);
      assert.equal(r.after, false, 'deleted in the database');
    },
  },
  {
    group: '백로그',
    name: 'CSV 내보내기: 지금 질의의 이슈가 모두 들어 있음',
    async run(app) {
      const r = await app.run(`${OPEN}
        const text0 = document.querySelector('[data-input="text"]'); text0.value = 'checkout'; text0.dispatchEvent(new Event('input', { bubbles: true }));
        await T.until(() => v.lastJql.includes('checkout'), 4000, 'text'); await settle();
        const { savedFiles } = await import('/src/views/backlog/download.js');
        const n0 = savedFiles.length;
        document.querySelector('[data-act="export"]').click();
        await T.until(() => savedFiles.length > n0, 8000, 'export');
        const text = savedFiles[0].text.replace(/^\\ufeff/, '');
        // records: newlines inside quotes do not end a record
        const records = []; let cur = ''; let q = false;
        for (const ch of text) { if (ch === '"') q = !q; if ((ch === '\\n') && !q) { records.push(cur); cur = ''; } else cur += ch; }
        if (cur.trim()) records.push(cur);
        const keys = records.slice(1).map((l) => l.split(',')[0]).sort();
        const api = await A.api.issues({ jql: v.currentJql(), limit: 500 });
        return { name: savedFiles[0].name, header: records[0].trim(), keys, apiKeys: keysOf(api.items).sort() };`);
      assert.match(r.name, /\.csv$/);
      assert.match(r.header, /^Key,Summary,Type,Status/);
      assert.ok(r.apiKeys.length > 0);
      assert.deepEqual(r.keys, r.apiKeys);
    },
  },
  {
    group: '백로그',
    name: '에픽 패널로 거르기 · Ctrl+F 는 검색 칸 · 이슈 만들기 명령은 양식 팝업',
    async run(app) {
      const r = await app.run(`${OPEN}
        const epicBtn = [...document.querySelectorAll('.left-view-body [data-vs-act="epic"]')].find((b) => b.dataset.vsValue && b.dataset.vsValue !== '*');
        epicBtn.click(); await T.until(() => v.lastJql.includes('epic = '), 4000, 'epic'); await settle();
        const epic = v.lookups.epics.get(v.items[0]?.epicId)?.key;
        const api = await A.api.issues({ jql: v.currentJql(), limit: 0 });
        const total = v.total;
        const chip = Boolean(document.querySelector('.bl-chip'));
        await A.run('find'); await T.frames(1);
        const focused = document.activeElement?.dataset.input;
        const p = A.run('createIssue');
        await T.popupReady('form');
        const d = T.popupDoc('form');
        const fields = [...d.querySelectorAll('[data-ff-row]')].map((x) => x.dataset.ffRow);
        const input = d.querySelector('[data-ff="summary"]'); input.value = 'E2E 양식 이슈'; input.dispatchEvent(new Event('input', { bubbles: true }));
        d.querySelector('[data-action="form-submit"]').click();
        await p; await T.until(() => A.history.undoLabel.startsWith('SHOP-'), 8000, 'form create');
        const made = await A.api.issues({ jql: 'project = SHOP AND summary ~ "E2E 양식 이슈"', limit: 5 });
        const epicOfNew = made.items[0]?.epicId;
        await A.actions.undo();
        return { value: epicBtn.dataset.vsValue, epic, total, apiTotal: api.total, chip, focused, fields, made: made.total, epicOfNew: Boolean(epicOfNew) };`);
      assert.equal(r.epic, r.value, 'rows of that epic');
      assert.equal(r.total, r.apiTotal);
      assert.ok(r.chip, 'a removable chip shows the epic filter');
      assert.equal(r.focused, 'text', 'Ctrl+F focuses the search box');
      assert.ok(r.fields.includes('summary') && r.fields.includes('type'));
      assert.ok(r.made >= 1, 'created from the form');
      assert.ok(r.epicOfNew, 'the epic chosen in the panel is preset');
    },
  },
  {
    group: '백로그',
    name: '영어로 바꾸면 글자가 바뀜 (ko ↔ en)',
    async run(app) {
      const r = await app.run(`${OPEN}
        const ko = document.querySelector('.bl-create-open').textContent.trim();
        A.actions.updateSettings({ language: 'en' }); await T.frames(3);
        const en = document.querySelector('.bl-create-open').textContent.trim();
        const head = document.querySelector('.bl-h-summary').textContent.trim();
        A.actions.updateSettings({ language: 'ko' }); await T.frames(2);
        return { ko, en, head };`);
      assert.equal(r.ko, '이슈 만들기');
      assert.equal(r.en, 'Create issue');
      assert.equal(r.head, 'Summary');
    },
  },
  {
    group: '백로그',
    name: '좁은 창 · 어두운 테마: 페이지 가로 스크롤 없음, 도구가 잘리지 않음',
    async run(app) {
      await app.main.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 760, deviceScaleFactor: 1, mobile: false });
      try {
        const r = await app.run(`${OPEN}
          A.actions.updateSettings({ theme: 'dark' }); await T.frames(4);
          const ws = document.querySelector('#workspace').getBoundingClientRect();
          const clipped = [...document.querySelectorAll('.bl-bar button, .bl-search button, .bl-search .search-box, .bl-foot button')].filter((b) => { const q = b.getBoundingClientRect(); return q.width > 0 && (q.right > ws.right + 1 || q.left < ws.left - 1); }).length;
          const listRect = document.querySelector('.bl-list').getBoundingClientRect();
          const out = { page: document.documentElement.scrollWidth <= document.documentElement.clientWidth, clipped, listH: Math.round(listRect.height), mode: document.documentElement.dataset.mode, cls: document.querySelector('.bl-root').className };
          A.actions.updateSettings({ theme: 'light' });
          return out;`);
        assert.ok(r.page, 'no page-level horizontal scroll');
        assert.equal(r.clipped, 0, 'no clipped tools');
        assert.ok(r.listH >= 150, `the list keeps room (${r.listH}px)`);
        assert.equal(r.mode, 'dark');
        assert.match(r.cls, /narrow/);
      } finally {
        await app.main.send('Emulation.setDeviceMetricsOverride', { width: app.width, height: app.height, deviceScaleFactor: 1, mobile: false });
      }
    },
  },
];
