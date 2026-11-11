// E2E: the project settings view (src/views/settings) in the real web app with a core. Every case opens the
// sample project SHOP (POST /samples the first time) in the settings view and drives the editors like a user
// (inputs, dropdowns, buttons, drag and drop of status chips, steppers), then checks the core's data.
import assert from 'node:assert/strict';

const GROUP = 'Project settings';

/** Page-side prelude: the sample project open in the settings view, and small helpers. */
const PREP = String.raw`
  await T.until(() => A.state.core.status === 'ready', 30000, 'core');
  const listOf = (x) => (Array.isArray(x) ? x : x?.items ?? []);
  let shop = listOf(await A.api.projects()).find((p) => p.key === 'SHOP');
  if (!shop) { await A.api.createSamples('ko'); shop = listOf(await A.api.projects()).find((p) => p.key === 'SHOP'); }
  const board = listOf(await A.api.boards({ projectId: shop.id }))[0];
  await T.reset();
  A.actions.updateSettings({ language: 'ko', showBottomPanel: false, showRightPanel: false });
  await A.actions.openTarget('board', board.id, { view: 'projectSettings', quiet: true });
  await T.until(() => window.__myboardSettings?.data && document.querySelector('.ps-section[data-ps-section]'), 20000, 'settings view');
  const V = window.__myboardSettings;
  const idle = async () => { await T.sleep(40); await T.until(() => V.busy === 0, 15000, 'saves done'); await T.frames(2); };
  const go = async (id) => { V.go(id); await T.until(() => document.querySelector('.ps-section[data-ps-section="' + id + '"]'), 8000, 'section ' + id); await idle(); return document.querySelector('.ps-section'); };
  const $ = (sel, root = document) => { const el = root.querySelector(sel); if (!el) throw new Error('missing ' + sel); return el; };
  const set = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const press = async (sel, root) => { $(sel, root).click(); await idle(); };
  const banner = () => document.querySelector('.ps-banner')?.textContent.trim() ?? '';
  const statusId = async (name) => listOf(await A.api.projectPart(shop.id, 'statuses')).find((s) => s.name === name)?.id;
  /** The icon picker popup answers with the given ref (the next time it opens). */
  const stubIcon = (ref) => { const open = A.popups.open; A.popups.open = async (kind, ...rest) => { if (kind !== 'iconpicker') return open.call(A.popups, kind, ...rest); A.popups.open = open; return { ref }; }; };
  const dragTo = (source, target) => {
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = target.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    target.dispatchEvent(new DragEvent('dragover', at));
    target.dispatchEvent(new DragEvent('drop', at));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  };
`;

const run = (app, body, timeout = 90000) => app.run(`${PREP}\n${body}`, timeout);

/** Drops the expected failed requests (a refused save logs "Failed to load resource: … 4xx") from the page errors. */
function expectRefused(app, pattern) {
  const kept = app.takeErrors().filter((text) => !(/status of 4\d\d/.test(text) && pattern.test(text)));
  app.errors.push(...kept);
}

export const cases = [
  {
    group: GROUP,
    name: 'Details: name, description, icon (IconRef) saved, undo/redo, key editable',
    async run(app) {
      const r = await run(app, `
        const sec = await go('details');
        const before = (await A.api.project(shop.id)).name;
        set($('[data-field="name"]', sec), before + ' 2');
        await idle();
        set($('[data-field="description"]', document), '설명 바꿈');
        await idle();
        stubIcon('e:🛒');
        await press('[data-act="project-icon"]');
        const p1 = await A.api.project(shop.id);
        const iconShown = Boolean(document.querySelector('.ps-iconpick .iconref-e'));
        await A.actions.undo(); await idle();
        const p2 = await A.api.project(shop.id);
        await A.actions.redo(); await idle();
        const p3 = await A.api.project(shop.id);
        await A.actions.undo(); await A.actions.undo(); await A.actions.undo(); await idle();
        const p4 = await A.api.project(shop.id);
        return { before, name: p1.name, description: p1.description, icon: p1.icon, iconShown, undoIcon: p2.icon, redoIcon: p3.icon, restored: p4.name,
          keyEditable: !$('[data-field="key"]').disabled && Boolean(document.querySelector('[data-act="key-rename"]')), keyHint: document.querySelector('.ps-row .ps-hint')?.textContent ?? '', shellName: A.state.doc.project.name };`);
      assert.equal(r.name, `${r.before} 2`);
      assert.equal(r.description, '설명 바꿈');
      assert.equal(r.icon, 'e:🛒');
      assert.ok(r.iconShown, 'the emoji icon is drawn');
      assert.notEqual(r.undoIcon, 'e:🛒', 'undo puts the old icon back');
      assert.equal(r.redoIcon, 'e:🛒', 'redo sets it again');
      assert.equal(r.restored, r.before, 'three undos restore the name');
      assert.ok(r.keyEditable, 'the key can be changed (Change key button)');
      assert.match(r.keyHint, /SHOP/);
    },
  },
  {
    group: GROUP,
    name: 'Board columns: add a status → drag it into a new column → reflected in the board data',
    async run(app) {
      const r = await run(app, `
        await go('board');
        V.pending.boardTab = 'columns'; V.render(); await idle();
        const name = 'QA 확인 ' + Date.now() % 10000;
        set($('[data-new="status"]'), name);
        await press('[data-act="status-create"]');
        const sid = await statusId(name);
        const inUnmapped = Boolean(document.querySelector('[data-drop="unmapped"] [data-status-chip="' + sid + '"]'));
        set($('[data-new="column"]'), 'QA');
        await press('[data-act="col-add"]');
        const col = [...document.querySelectorAll('.ps-col')].find((c) => c.querySelector('[data-colfield="name"]').value === 'QA');
        dragTo($('[data-status-chip="' + sid + '"]'), col.querySelector('[data-drop]'));
        await idle();
        const data = await A.api.boardData(board.id);
        const qa = data.columns.find((c) => c.name === 'QA');
        const chipInColumn = Boolean(document.querySelector('[data-col="' + qa.id + '"] [data-status-chip="' + sid + '"]'));
        // keyboard: ← moves the chip back to the unmapped area
        document.querySelector('[data-status-chip="' + sid + '"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        await idle();
        const after = (await A.api.boardData(board.id)).columns.find((c) => c.id === qa.id);
        // the board's own columns show a lock instead of the bin; the added one keeps its bin
        const locks = data.columns.filter((c) => c.builtIn).map((c) => Boolean(document.querySelector('[data-col="' + c.id + '"] .ps-col-lock')) && !document.querySelector('[data-col="' + c.id + '"] [data-act="col-delete"]'));
        const qaBin = Boolean(document.querySelector('[data-col="' + qa.id + '"] [data-act="col-delete"]'));
        // clean up: delete the column (twice = confirm) and the status
        document.querySelector('[data-col="' + qa.id + '"] [data-act="col-delete"]').click();
        await T.popupReady('confirm'); const asked = T.popupDoc('confirm').body.textContent.includes('QA'); T.popupDoc('confirm').querySelector('.button.primary').click(); await idle();
        await T.until(async () => !(await A.api.boardData(board.id)).columns.some((c) => c.id === qa.id), 5000, 'column deleted');
        await A.api.del('/projects/' + shop.id + '/statuses/' + sid);
        return { sid: Boolean(sid), inUnmapped, mapped: qa?.statusIds.includes(sid), chipInColumn, left: after.statusIds.includes(sid), locks, qaBin, asked, errors: banner() };`);
      assert.ok(r.locks.length > 0 && r.locks.every(Boolean), 'default columns: a lock, no bin');
      assert.ok(r.qaBin, 'an added column can be deleted');
      assert.ok(r.asked, 'deleting a column asks first (the confirmation names it)');
      assert.ok(r.sid, 'status created');
      assert.ok(r.inUnmapped, 'a new status starts in the unmapped area');
      assert.ok(r.mapped, `the board data maps the status to the new column (${r.errors})`);
      assert.ok(r.chipInColumn);
      assert.equal(r.left, false, '← takes it out of the column again');
    },
  },
  {
    group: GROUP,
    name: 'Status order: dragging the grip saves it; deleting a used status asks for a replacement',
    async run(app) {
      const r = await run(app, `
        await go('statuses');
        const before = listOf(await A.api.projectPart(shop.id, 'statuses')).map((s) => s.id);
        const rows = [...document.querySelectorAll('.ps-tbody[data-kind="statuses"] .ps-tr[data-id]')];
        // drag the last status above the first
        dragTo(rows.at(-1).querySelector('.ps-grip'), rows[0]);
        await idle();
        const after = listOf(await A.api.projectPart(shop.id, 'statuses')).map((s) => s.id);
        await A.api.post('/projects/' + shop.id + '/statuses/order', { ids: before });
        V.render(); await idle();
        // a status with issues: the core answers IN_USE, the row asks for a replacement
        let used = null;
        for (const s of listOf(await A.api.projectPart(shop.id, 'statuses'))) { if ((await A.api.issues({ jql: 'project = SHOP AND status = "' + s.name + '"', limit: 0 })).total > 0) { used = s; break; } }
        await press('[data-id="' + used.id + '"] [data-act="delete"]');
        await press('[data-confirm="' + used.id + '"] [data-act="del-confirm"]');
        const asks = Boolean(document.querySelector('[data-confirm="' + used.id + '"] [data-field="replaceWith"]'));
        const text = document.querySelector('[data-confirm="' + used.id + '"]')?.textContent ?? '';
        await press('[data-confirm="' + used.id + '"] [data-act="del-cancel"]');
        return { before, after, asks, text, still: listOf(await A.api.projectPart(shop.id, 'statuses')).some((s) => s.id === used.id) };`);
      expectRefused(app, /\/statuses\//);
      assert.equal(r.after[0], r.before.at(-1), 'the dragged status is first now');
      assert.equal(r.after.length, r.before.length);
      assert.ok(r.asks, `replacement dropdown (${r.text})`);
      assert.ok(r.still, 'nothing deleted before a replacement is chosen');
    },
  },
  {
    group: GROUP,
    name: 'WIP limits: −/+ steppers → wipMax in the board data, steppers aligned',
    async run(app) {
      const r = await run(app, `
        await go('board');
        V.pending.boardTab = 'columns'; V.render(); await idle();
        const before = await A.api.boardData(board.id);
        const target = before.columns.find((c) => !c.backlog && !c.done) ?? before.columns[0];
        const stepperEl = $('[data-stepper="wipMax:' + target.id + '"]');
        const plus = stepperEl.querySelectorAll('.stepper-button')[1];
        for (let i = 0; i < 2; i++) { plus.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); plus.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); }
        await T.sleep(600); await idle();
        const after = (await A.api.boardData(board.id)).columns.find((c) => c.id === target.id);
        // alignment: in every column the two steppers share their right edge; every column's steppers sit at the same offset
        const cols = [...document.querySelectorAll('.ps-col')].map((col) => { const c = col.getBoundingClientRect(); return [...col.querySelectorAll('.stepper')].map((s) => { const r = s.getBoundingClientRect(); return { right: Math.round(c.right - r.right), w: Math.round(r.width), h: Math.round(r.height) }; }); });
        const shown = $('[data-stepper="wipMax:' + target.id + '"] .stepper-value').value;
        // put it back
        await A.api.patch('/boards/' + board.id + '/columns/' + target.id, { wipMax: target.wipMax ?? null });
        return { before: target.wipMax ?? 0, after: after.wipMax, cols, shown };`);
      assert.equal(r.after, r.before + 2, 'two + presses raise the maximum by 2');
      assert.equal(Number(r.shown), r.before + 2);
      const flat = r.cols.flat();
      assert.ok(flat.length >= 4);
      assert.equal(new Set(flat.map((s) => s.right)).size, 1, `steppers line up: ${JSON.stringify(r.cols)}`);
      assert.equal(new Set(flat.map((s) => s.w)).size, 1, 'steppers are equally wide');
    },
  },
  {
    group: GROUP,
    name: 'Creating swimlanes, quick filters and card colours; invalid JQL shows an error',
    async run(app) {
      const r = await run(app, `
        await go('board');
        V.pending.boardTab = 'swimlanes'; V.render(); await idle();
        set($('[data-field="lane-mode"]'), 'queries'); await idle();
        set($('[data-add="swimlanes"] [data-new="name"]'), '담당자 없음');
        set($('[data-add="swimlanes"] [data-new="jql"]'), 'assignee is EMPTY');
        await press('[data-add="swimlanes"] [data-act="add"]');
        V.pending.boardTab = 'quickfilters'; V.render(); await idle();
        // the box says what is wrong while typing
        const box = $('[data-add="quickfilters"] [data-new="jql"]');
        box.value = 'priority = = 높음'; box.dispatchEvent(new Event('input', { bubbles: true }));
        await T.until(() => box.dataset.jqlState === 'error', 5000, 'inline JQL error');
        const inline = box.closest('.ps-jql').querySelector('.ps-jql-msg').textContent.trim();
        set($('[data-add="quickfilters"] [data-new="name"]'), '잘못된 필터');
        await press('[data-add="quickfilters"] [data-act="add"]');
        const refused = banner();
        set($('[data-add="quickfilters"] [data-new="name"]'), '내 이슈');
        set($('[data-add="quickfilters"] [data-new="jql"]'), 'assignee = currentUser()');
        await press('[data-add="quickfilters"] [data-act="add"]');
        V.pending.boardTab = 'cardcolors'; V.render(); await idle();
        set($('[data-field="cc-mode"]'), 'queries'); await idle();
        set($('[data-add="cardcolors"] [data-new="jql"]'), 'assignee is EMPTY');
        await press('[data-add="cardcolors"] [data-act="add"]');
        const data = await A.api.boardData(board.id);
        return { inline, refused, lanes: data.swimlanes.map((l) => l.name), mode: data.board.settings.swimlanes, quick: data.quickFilters.map((q) => q.name), cc: data.board.settings.cardColors, colors: data.cardColors.map((c) => c.jql) };`);
      assert.ok(r.inline.length > 0, 'inline JQL message');
      expectRefused(app, /quickfilters/);
      assert.match(r.refused, /JQL/, `the core's JQL error is shown: ${r.refused}`);
      assert.equal(r.mode, 'queries');
      assert.ok(r.lanes.includes('담당자 없음'), `lanes ${r.lanes}`);
      assert.ok(r.quick.includes('내 이슈'));
      assert.ok(!r.quick.includes('잘못된 필터'));
      assert.equal(r.cc, 'queries');
      assert.ok(r.colors.includes('assignee is EMPTY'));
    },
  },
  {
    group: GROUP,
    name: 'Workflow: add a transition with a rule (comment required) → the rule refuses a move, arrow in the diagram',
    async run(app) {
      const r = await run(app, `
        await go('workflow');
        const statuses = listOf(await A.api.projectPart(shop.id, 'statuses'));
        const from = statuses.find((s) => s.category === 'inprogress');
        const to = statuses.find((s) => s.category === 'done');
        await press('[data-act="tr-new"]');
        const draft = $('[data-draft]');
        set($('[data-dfield="name"]', draft), '검토 후 완료');
        set($('[data-dfield="fromStatusId"]', draft), from.id); await idle();
        set($('[data-dfield="toStatusId"]', document.querySelector('[data-draft]')), to.id); await idle();
        await press('[data-draft] [data-act="rule-add"][data-rkind="validators"]');
        set($('[data-draft] select[data-rkind="validators"][data-rparam="type"]'), 'commentRequired'); await idle();
        await press('[data-draft] [data-act="rule-add"][data-rkind="postFunctions"]');
        set($('[data-draft] select[data-rkind="postFunctions"][data-rparam="type"]'), 'addLabel'); await idle();
        set($('[data-draft] [data-rkind="postFunctions"][data-rparam="label"]'), '검토됨');
        await press('[data-act="draft-save"]');
        const transitions = listOf(await A.api.projectPart(shop.id, 'transitions'));
        const t = transitions.find((x) => x.name === '검토 후 완료');
        const arrow = Boolean(document.querySelector('.ps-wf-edge[data-tr="' + t?.id + '"]'));
        const issue = listOf((await A.api.issues({ jql: 'project = SHOP AND status = "' + from.name + '"', limit: 1 })).items ?? [])[0]
          ?? (await A.api.createIssue({ projectId: shop.id, summary: '전환 시험', statusId: from.id }));
        let refused = null;
        try { await A.api.transition(issue.id, { statusId: to.id }); } catch (e) { refused = e.code; }
        let passed = false;
        try { await A.api.transition(issue.id, { statusId: to.id, comment: '확인했습니다' }); passed = true; } catch (e) { passed = e.code; }
        const labels = (await A.api.issue(issue.id)).labels;
        await A.api.del('/projects/' + shop.id + '/transitions/' + t.id);
        return { rules: t?.rules, arrow, refused, passed, labels };`);
      assert.equal(r.rules?.validators?.[0]?.type, 'commentRequired');
      assert.equal(r.rules?.postFunctions?.[0]?.type, 'addLabel');
      assert.ok(r.arrow, 'the diagram has an arrow for the new transition');
      expectRefused(app, /\/transition\b/);
      assert.equal(r.refused, 'VALIDATOR_COMMENT_REQUIRED', 'the rule refuses a move without a comment');
      assert.equal(r.passed, true, 'with a comment it passes');
      assert.ok(r.labels.includes('검토됨'), 'the post function added the label');
    },
  },
  {
    group: GROUP,
    name: 'Custom fields: select field + options (icon, colour), required',
    async run(app) {
      const r = await run(app, `
        await go('fields');
        const name = '고객 등급 ' + Date.now() % 10000;
        set($('[data-add="fields"] [data-new="name"]'), name);
        set($('[data-add="fields"] [data-field="new-type"]'), 'select');
        await press('[data-add="fields"] [data-act="add"]');
        await T.until(() => document.querySelector('[data-field-editor]'), 5000, 'field editor');
        for (const v of ['Gold', 'Silver']) { set($('[data-new="option"]'), v); await press('[data-act="opt-add"]'); }
        stubIcon('b:star#f59f00');
        await press('[data-opt] [data-act="opt-icon"]');
        const required = $('[data-field-editor] [data-ffield="required"]'); required.checked = true; required.dispatchEvent(new Event('change', { bubbles: true })); await idle();
        // a duplicate option is refused on the spot
        set($('[data-new="option"]'), 'gold'); await press('[data-act="opt-add"]');
        const dup = banner();
        const field = listOf(await A.api.projectPart(shop.id, 'fields')).find((f) => f.name === name);
        await A.api.del('/projects/' + shop.id + '/fields/' + field.id);
        return { type: field.type, options: field.options.map((o) => o.value), icon: field.options[0].icon, required: field.required, dup };`);
      assert.equal(r.type, 'select');
      assert.deepEqual(r.options, ['Gold', 'Silver']);
      assert.equal(r.icon, 'b:star#f59f00');
      assert.equal(r.required, true);
      assert.ok(r.dup.length > 0, 'duplicate option message');
    },
  },
  {
    group: GROUP,
    name: 'Version release: unfinished issues move to the next version',
    async run(app) {
      const r = await run(app, `
        await go('versions');
        const stamp = Date.now() % 100000;
        for (const n of ['9.' + stamp, '10.' + stamp]) { set($('[data-add="versions"] [data-new="name"]'), n); await press('[data-add="versions"] [data-act="add"]'); }
        const versions = listOf(await A.api.projectPart(shop.id, 'versions'));
        const v1 = versions.find((v) => v.name === '9.' + stamp); const v2 = versions.find((v) => v.name === '10.' + stamp);
        const issue = await A.api.createIssue({ projectId: shop.id, summary: '출시 시험', fixVersionIds: [v1.id] });
        V.render(); await idle();
        await press('[data-id="' + v1.id + '"] [data-act="release"]');
        set($('[data-release="' + v1.id + '"] [data-rel="move"]'), v2.id);
        await press('[data-release="' + v1.id + '"] [data-act="release-do"]');
        const after = listOf(await A.api.projectPart(shop.id, 'versions')).find((v) => v.id === v1.id);
        const moved = (await A.api.issue(issue.id)).fixVersionIds;
        const badge = document.querySelector('[data-id="' + v1.id + '"] .ps-chip.ok')?.textContent.trim();
        await A.api.deleteIssue(issue.id);
        for (const v of [v1, v2]) await A.api.del('/projects/' + shop.id + '/versions/' + v.id);
        return { released: after.released, date: after.releaseDate, moved: moved.includes(v2.id) && !moved.includes(v1.id), badge };`);
      assert.equal(r.released, true);
      assert.match(r.date ?? '', /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(r.moved, 'the unresolved issue moved to the next version');
      assert.ok(r.badge, 'released badge');
    },
  },
  {
    group: GROUP,
    name: 'Members: change roles; removing the last admin shows an error',
    async run(app) {
      const r = await run(app, `
        await go('members');
        const members = await A.api.projectPart(shop.id, 'members');
        const other = members.find((m) => m.role !== 'admin');
        const select = $('[data-id="' + other.userId + '"] [data-field="role"]');
        set(select, 'viewer'); await idle();
        const changed = (await A.api.projectPart(shop.id, 'members')).find((m) => m.userId === other.userId).role;
        await A.actions.undo(); await idle();
        const undone = (await A.api.projectPart(shop.id, 'members')).find((m) => m.userId === other.userId).role;
        const admins = (await A.api.projectPart(shop.id, 'members')).filter((m) => m.role === 'admin');
        let message = '';
        if (admins.length === 1) {
          await press('[data-id="' + admins[0].userId + '"] [data-act="delete"]');
          await press('[data-confirm="' + admins[0].userId + '"] [data-act="del-confirm"]');
          message = banner();
        }
        return { from: other.role, changed, undone, admins: admins.length, message, stillThere: (await A.api.projectPart(shop.id, 'members')).some((m) => m.userId === admins[0].userId) };`);
      expectRefused(app, /\/members\//);
      assert.equal(r.changed, 'viewer');
      assert.equal(r.undone, r.from, 'undo restores the role');
      if (r.admins === 1) assert.match(r.message, /관리자/, `last admin message: ${r.message}`);
      assert.ok(r.stillThere);
    },
  },
  {
    group: GROUP,
    name: 'Automation: create a rule (manual, add label) → run now result { matched, acted }',
    async run(app) {
      const r = await run(app, `
        await go('automation');
        await press('[data-act="rule-new"]');
        set($('[data-rf="name"]'), '시험 규칙');
        set($('[data-rf="trigger"]'), 'manual'); await idle();
        set($('[data-tf="jql"]'), 'project = SHOP AND statusCategory != done');
        set($('[data-ai="0"][data-af="type"]'), 'addLabel'); await idle();
        set($('[data-ai="0"][data-af="label"]'), 'auto-e2e');
        await press('[data-act="rule-save"]');
        const rule = listOf(await A.api.projectPart(shop.id, 'automation')).find((x) => x.name === '시험 규칙');
        await press('[data-id="' + rule.id + '"] [data-act="rule-run"]');
        const result = document.querySelector('[data-run-result="' + rule.id + '"]')?.textContent.trim() ?? '';
        const labelled = (await A.api.issues({ jql: 'project = SHOP AND labels = auto-e2e', limit: 0 })).total;
        const runs = listOf(await A.api.projectPart(shop.id, 'automation')).find((x) => x.id === rule.id).runCount;
        // turn it off with the switch
        const sw = $('[data-id="' + rule.id + '"] [data-field="enabled"]'); sw.checked = false; sw.dispatchEvent(new Event('change', { bubbles: true })); await idle();
        const enabled = listOf(await A.api.projectPart(shop.id, 'automation')).find((x) => x.id === rule.id).enabled;
        await A.api.del('/projects/' + shop.id + '/automation/' + rule.id);
        return { trigger: rule.trigger, actions: rule.actions, result, labelled, runs, enabled };`);
      assert.equal(r.trigger.type, 'manual');
      assert.deepEqual(r.actions, [{ type: 'addLabel', label: 'auto-e2e' }]);
      assert.match(r.result, /\d/, `run result shown: ${r.result}`);
      assert.ok(r.labelled > 0, 'issues got the label');
      assert.ok(r.runs >= 1);
      assert.equal(r.enabled, false);
    },
  },
  {
    group: GROUP,
    name: 'CSV import wizard: read columns → map → dry run (errors per row) → import',
    async run(app) {
      const r = await run(app, `
        await go('exchange');
        const types = listOf(await A.api.projectPart(shop.id, 'types'));
        const story = types.find((t) => t.level === 0).name;
        const csv = 'Summary,Type,Due date,Story points,Notes\\n"CSV 하나",' + story + ',2026-12-01,3,first\\n"CSV 둘",없는유형,not-a-date,abc,second\\n';
        set($('[data-csv-text]'), csv);
        await press('[data-act="csv-read"]');
        const rows = document.querySelectorAll('[data-csv-step="map"] [data-header]').length;
        const suggested = Object.fromEntries([...document.querySelectorAll('[data-map]')].map((s) => [s.dataset.map, s.value]));
        set($('[data-map="Notes"]'), ''); await idle();
        await press('[data-act="csv-dry"]');
        const dry = $('[data-dry]').textContent.trim();
        const problemRows = [...document.querySelectorAll('[data-problem-row]')].map((x) => Number(x.dataset.problemRow));
        await press('[data-act="csv-import"]');
        const result = $('[data-import-result]').textContent.trim();
        const made = (await A.api.issues({ jql: 'project = SHOP AND summary ~ "CSV 하나"', limit: 5 })).items;
        for (const i of made) await A.api.deleteIssue(i.id);
        return { rows, suggested, dry, problemRows, result, made: made.length };`);
      assert.equal(r.rows, 5, 'one mapping row per CSV column');
      assert.equal(r.suggested.Summary, 'summary');
      assert.equal(r.suggested.Type, 'type');
      assert.match(r.dry, /1/);
      assert.ok(r.problemRows.includes(3) && !r.problemRows.includes(2), `row 3 has the problems: ${r.problemRows}`);
      assert.match(r.result, /1/);
      assert.equal(r.made, 1, 'the good row was imported');
    },
  },
  {
    group: GROUP,
    name: 'Korean/English: no missing texts in any section, board tab or editor',
    async run(app) {
      const r = await run(app, `
        const out = {};
        const scan = (label) => { const root = document.querySelector('.ps-root'); const text = root.innerText + ' ' + [...root.querySelectorAll('[title],[placeholder],[aria-label]')].map((e) => [e.title, e.placeholder, e.getAttribute('aria-label')].join(' ')).join(' '); const miss = [...new Set(text.match(/ps\\.[A-Za-z_.]+/g) ?? [])]; if (miss.length) out[label] = miss; };
        for (const lang of ['ko', 'en']) {
          A.actions.updateSettings({ language: lang }); await T.frames(3);
          for (const id of [...document.querySelectorAll('.left-view-body [data-vs-act="section"]')].map((b) => b.dataset.vsValue)) {
            await go(id); await T.sleep(id === 'labels' ? 400 : 0); scan(lang + ':' + id);
            if (id === 'board') for (const tab of ['columns', 'swimlanes', 'quickfilters', 'cardcolors', 'layout', 'general']) { V.pending.boardTab = tab; V.render(); await idle(); scan(lang + ':board:' + tab); }
            if (id === 'workflow') { await press('[data-act="tr-new"]'); for (const k of ['conditions', 'validators', 'postFunctions']) await press('[data-draft] [data-act="rule-add"][data-rkind="' + k + '"]'); scan(lang + ':workflow:draft'); V.pending.trDraft = null; V.render(); }
            if (id === 'automation') { await press('[data-act="rule-new"]'); for (const t of ['issue.transitioned', 'issue.updated', 'scheduled']) { set($('[data-rf="trigger"]'), t); await idle(); scan(lang + ':automation:' + t); } V.pending.ruleDraft = null; V.render(); }
          }
          out[lang + ':title'] = document.querySelector('.ps-head h2').textContent;
        }
        A.actions.updateSettings({ language: 'ko' });
        return out;`, 180000);
      const missing = Object.entries(r).filter(([k]) => !k.endsWith(':title'));
      assert.deepEqual(missing, [], `missing texts: ${JSON.stringify(missing)}`);
      assert.notEqual(r['ko:title'], r['en:title'], 'the language switch changes the texts');
    },
  },
  {
    group: GROUP,
    name: 'Narrow window and dark theme: only the section editor in the centre (list in the left panel), nothing clipped or overflowing',
    async run(app) {
      // the app's minimum window (900 × 600): with the project list open (workspace ≈ 480 px) and without it
      await app.main.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
      try {
        const r = await run(app, `
          const out = { layouts: [], overflow: [] };
          const widths = { left: A.state.settings.leftWidth, right: A.state.settings.rightWidth };
          // project list only · nothing · both side panels at their minimum width (300 px each)
          for (const [left, right] of [[true, false], [false, false], [true, true]]) {
            A.actions.updateSettings({ theme: 'dark', showLeftPanel: left, showRightPanel: right, showBottomPanel: false, ...(right ? { leftWidth: 300, rightWidth: 300 } : widths) });
            await T.frames(4); await T.sleep(250);
            const ws = document.querySelector('#workspace');
            out.layouts.push({ left, width: ws.clientWidth, narrow: ws.classList.contains('ps-narrow'), tiny: ws.classList.contains('ps-tiny'), nav: document.querySelectorAll('#workspace .ps-nav').length });
            for (const id of ['details', 'members', 'types', 'statuses', 'versions', 'fields', 'workflow', 'board', 'automation', 'exchange']) {
              await go(id);
              if (id === 'workflow') await press('[data-act="tr-new"]');
              if (id === 'automation') await press('[data-act="rule-new"]');
              const content = document.querySelector('.ps-content');
              if (content.scrollWidth > content.clientWidth + 1) out.overflow.push(left + '/' + right + ':' + id + ':content ' + content.scrollWidth + '>' + content.clientWidth);
              const box = content.getBoundingClientRect();
              for (const el of document.querySelectorAll('.ps-section .ps-btn, .ps-section h2, .ps-section .ps-row-label, .ps-section .ps-input, .ps-section select, .ps-section .stepper, .ps-section .seg-toggle button')) {
                const r = el.getBoundingClientRect();
                if (r.width && (r.right > box.right + 1 || r.left < box.left - 1) && !el.closest('.ps-table, .ps-columns, .ps-wf-canvas')) out.overflow.push(left + '/' + right + ':' + id + ':' + el.className + ' ' + Math.round(r.right) + '>' + Math.round(box.right));
              }
              V.pending.trDraft = null; V.pending.ruleDraft = null;
            }
          }
          const bg = getComputedStyle(document.querySelector('.ps-root')).backgroundColor;
          const rgb = bg.match(/\\d+/g).map(Number);
          out.dark = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.35;
          A.actions.updateSettings({ theme: 'light', showLeftPanel: true, showRightPanel: false, leftWidth: widths.left, rightWidth: widths.right });
          return out;`, 180000);
        for (const layout of r.layouts) {
          assert.ok(layout.narrow, `narrow class at ${layout.width}px`);
          assert.equal(layout.nav, 0, 'the section list is in the left panel, not in the centre');
        }
        assert.deepEqual(r.overflow.slice(0, 12), []);
        assert.ok(r.dark, 'dark theme background');
      } finally {
        await app.main.send('Emulation.setDeviceMetricsOverride', { width: app.width, height: app.height, deviceScaleFactor: 1, mobile: false });
      }
    },
  },
  {
    group: GROUP,
    name: 'Permissions: read-only unless project admin (inputs and buttons disabled)',
    async run(app) {
      const r = await run(app, `
        await go('types');
        const info = A.state.core.info;
        const savedRole = info.user.role;
        const savedMy = V.data.config.project.myRole;
        info.user.role = 'user'; V.data.config.project.myRole = 'viewer'; V.render(); await T.frames(2);
        const badge = Boolean(document.querySelector('.ps-badge.readonly'));
        const enabledInputs = [...document.querySelectorAll('.ps-section input:not([disabled]), .ps-section select:not([disabled]), .ps-section [data-act="add"]:not([disabled]), .ps-section [data-act="delete"]:not([disabled])')].length;
        await T.frames(2); const users = Boolean(document.querySelector('.left-view-body [data-vs-value="users"]'));
        info.user.role = savedRole; V.data.config.project.myRole = savedMy; V.render();
        return { badge, enabledInputs, users };`);
      assert.ok(r.badge, 'read-only badge');
      assert.equal(r.enabledInputs, 0, 'nothing editable');
      assert.equal(r.users, false, 'the user accounts section is for global administrators');
    },
  },
  {
    group: GROUP,
    name: 'Resolution icons and colours, component default assignee (avatar list) — saved, undo, nothing clipped',
    async run(app) {
      const r = await run(app, `
        let sec = await go('resolutions');
        const rowOf = (name) => [...document.querySelectorAll('.ps-tr[data-kind="resolutions"]')].find((x) => x.querySelector('[data-field="name"]')?.value === name);
        const res0 = listOf(await A.api.resolutions())[0];
        const iconDrawn = Boolean(rowOf(res0.name)?.querySelector('.ps-iconpick .iconref'));
        stubIcon('b:star#f59f00');
        await press('[data-act="pick-icon"]', rowOf(res0.name));
        set($('input[type="color"][data-field="color"]', rowOf(res0.name)), '#123456'); await idle();
        const saved = listOf(await A.api.resolutions()).find((x) => x.id === res0.id);
        await A.actions.undo(); await idle(); await A.actions.undo(); await idle();
        const undone = listOf(await A.api.resolutions()).find((x) => x.id === res0.id);
        sec = await go('components');
        const comp = listOf(await A.api.projectPart(shop.id, 'components'))[0];
        const row = document.querySelector('.ps-tr[data-kind="components"][data-id="' + comp.id + '"]');
        const button = $('.ps-ref [data-ref-dd]', row);
        const cell = button.closest('.ps-td').getBoundingClientRect(); const br = button.getBoundingClientRect();
        button.click(); await T.frames(2);
        const items = [...document.querySelectorAll('.mb-reflist .dd-item')];
        const avatars = items.slice(1).every((i) => i.querySelector('.iconref'));
        const want = items[1].dataset.value; items[1].click(); await idle();
        const after = listOf(await A.api.projectPart(shop.id, 'components')).find((x) => x.id === comp.id);
        const face = document.querySelector('.ps-tr[data-id="' + comp.id + '"] .ps-ref .mb-refbutton .iconref') !== null;
        window.__psComp = comp.id;
        return { iconDrawn, saved: [saved.icon, saved.color], undone: [undone.icon, undone.color], before: [res0.icon, res0.color], avatars, want, got: after.defaultAssigneeId, face, before2: comp.defaultAssigneeId ?? null,
          clip: { cellRight: Math.round(cell.right), buttonRight: Math.round(br.right), cellLeft: Math.round(cell.left), buttonLeft: Math.round(br.left), w: Math.round(br.width) } };`);
      if (process.env.MYBOARD_E2E_SHOTS) await app.main.screenshot(`${process.env.MYBOARD_E2E_SHOTS}/settings-components.png`);
      r.reverted = await app.run(`await A.actions.undo(); await T.until(() => window.__myboardSettings.busy === 0, 15000, 'undo'); const c = (await A.api.projectPart(window.__myboardSettings.pid, 'components')); return ((Array.isArray(c) ? c : c.items).find((x) => x.id === window.__psComp).defaultAssigneeId) ?? null;`);
      assert.ok(r.iconDrawn, 'the resolution icon is drawn in the table');
      assert.deepEqual(r.saved, ['b:star#f59f00', '#123456']);
      assert.deepEqual(r.undone, r.before, 'two undos restore icon and colour');
      assert.ok(r.avatars, 'users are listed with their avatars');
      assert.equal(r.got, r.want);
      assert.ok(r.face, 'the chosen user shows with the avatar');
      assert.equal(r.reverted, r.before2, 'undo');
      assert.ok(r.clip.buttonRight <= r.clip.cellRight + 1 && r.clip.buttonLeft >= r.clip.cellLeft - 1 && r.clip.w >= 100, `dropdown fits its cell: ${JSON.stringify(r.clip)}`);
    },
  },
  {
    group: GROUP,
    name: 'Custom fields: defaults (number stepper, icon option list) and issue type chips → filled when creating issues, aligned',
    async run(app) {
      const r = await run(app, `
        await go('fields');
        const cfg = await A.api.get('/projects/' + shop.id + '/config');
        const story = cfg.types.find((t) => Number(t.level) === 0);
        const num = await A.api.post('/projects/' + shop.id + '/fields', { name: 'E2E 위험도 ' + Date.now() % 100000, type: 'number' });
        const sel = await A.api.post('/projects/' + shop.id + '/fields', { name: 'E2E 등급 ' + Date.now() % 100000, type: 'select', options: [{ value: 'A', icon: 'b:star' }, { value: 'B', icon: 'b:flag' }] });
        await V.refresh(); V.pending.field = num.id; V.render(); await idle();
        const plus = $('[data-stepper="field-default"] .stepper-button[data-step-dir="1"]');
        for (let i = 0; i < 3; i++) { plus.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); plus.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); }
        await T.sleep(700); await idle();
        const numDefault = (await A.api.get('/projects/' + shop.id + '/fields/' + num.id)).defaultValue;
        await press('[data-act="ftype-toggle"][data-type="' + story.id + '"]');
        const types1 = (await A.api.get('/projects/' + shop.id + '/fields/' + num.id)).issueTypeIds;
        const chipOn = $('[data-act="ftype-toggle"][data-type="' + story.id + '"]').classList.contains('on');
        // alignment: the stepper and the chips start where the other controls of the editor start
        const lefts = ['[data-ffield="name"]', '[data-default-row] .stepper', '[data-types-row] .ps-typechips'].map((s) => Math.round($('[data-field-editor] ' + s).getBoundingClientRect().left));
        const stepperBox = $('[data-default-row] .stepper').getBoundingClientRect(); const card = $('[data-field-editor]').getBoundingClientRect();
        const inside = stepperBox.right <= card.right && [...document.querySelectorAll('[data-types-row] .ps-typechip')].every((c) => c.getBoundingClientRect().right <= card.right + 1);
        const made = await A.api.createIssue({ projectId: shop.id, typeId: story.id, summary: 'E2E 기본값' });
        const other = cfg.types.find((t) => Number(t.level) === 0 && t.id !== story.id);
        const made2 = await A.api.createIssue({ projectId: shop.id, typeId: other.id, summary: 'E2E 기본값 아님' });
        await press('[data-act="ftype-all"]');
        const types2 = (await A.api.get('/projects/' + shop.id + '/fields/' + num.id)).issueTypeIds;
        V.pending.field = sel.id; V.render(); await idle();
        $('[data-default-row] .ps-ref [data-ref-dd]').click(); await T.frames(2);
        const items = [...document.querySelectorAll('.mb-reflist .dd-item')];
        const optionIcons = items.slice(1).every((i) => i.querySelector('.iconref'));
        items.find((i) => i.dataset.value === 'B').click(); await idle();
        const selDefault = (await A.api.get('/projects/' + shop.id + '/fields/' + sel.id)).defaultValue;
        await A.actions.undo(); await idle();
        const selUndone = (await A.api.get('/projects/' + shop.id + '/fields/' + sel.id)).defaultValue;
        const nativeSelects = document.querySelectorAll('[data-field-editor] select').length;
        for (const id of [made.id, made2.id]) await A.api.deleteIssue(id);
        for (const f of [num, sel]) await A.api.del('/projects/' + shop.id + '/fields/' + f.id);
        return { numDefault, types1, chipOn, lefts, inside, value: made.custom[num.id], value2: made2.custom[num.id], types2, optionIcons, selDefault, selUndone, nativeSelects };`);
      if (process.env.MYBOARD_E2E_SHOTS) await app.main.screenshot(`${process.env.MYBOARD_E2E_SHOTS}/settings-fields.png`);
      assert.equal(r.numDefault, 3, 'three + presses → default 3');
      assert.equal(r.chipOn, true);
      assert.equal(r.types1.length, 1);
      assert.equal(new Set(r.lefts).size, 1, `controls line up: ${r.lefts}`);
      assert.ok(r.inside, 'nothing sticks out of the editor');
      assert.equal(r.value, 3, 'a new issue of that type gets the default');
      assert.equal(r.value2, undefined, 'another type does not get the field');
      assert.equal(r.types2, null, '"all types" clears the list');
      assert.ok(r.optionIcons, 'select default lists the options with their icons');
      assert.equal(r.selDefault, 'B');
      assert.equal(r.selUndone, null, 'undo clears it again');
      assert.equal(r.nativeSelects, 0, 'no native select in the editor');
    },
  },
  {
    group: GROUP,
    name: 'Workflow diagram: dragged boxes are unsaved changes until Save (bar) → saved to the DB (rev), an old localStorage layout moves on first save, undo',
    async run(app) {
      const r = await run(app, `
        const wf0 = listOf(await A.api.projectPart(shop.id, 'workflows'))[0];
        await A.api.patch('/projects/' + shop.id + '/workflows/' + wf0.id, { layout: null, rev: wf0.rev });
        const statuses = listOf(await A.api.projectPart(shop.id, 'statuses'));
        const [s1, s2] = statuses;
        // a layout an older version left in this browser
        localStorage.setItem('myboard.workflowLayout.' + wf0.id, JSON.stringify({ [s2.id]: { x: 600, y: 200 } }));
        V.pending.wf = wf0.id; await V.refresh();
        await go('workflow');
        const legacyShown = $('.ps-wf-node[data-status="' + s2.id + '"]').getAttribute('transform');
        const node = $('.ps-wf-node[data-status="' + s1.id + '"]');
        const r0 = node.getBoundingClientRect();
        const pe = (type, x, y, target = window) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
        pe('pointerdown', r0.left + 20, r0.top + 10, node);
        for (let i = 1; i <= 5; i++) pe('pointermove', r0.left + 20 + i * 20, r0.top + 10 + i * 10);
        pe('pointerup', r0.left + 120, r0.top + 60);
        await idle();
        // an unsaved change until Save: nothing in the database yet, the bar shows it
        const beforeSave = listOf(await A.api.projectPart(shop.id, 'workflows')).find((w) => w.id === wf0.id).layout;
        const bar = Boolean($('.ps-wf-savebar [data-act="wf-save"]'));
        await press('[data-act="wf-save"]');
        const barGone = !document.querySelector('.ps-wf-savebar');
        const wf1 = listOf(await A.api.projectPart(shop.id, 'workflows')).find((w) => w.id === wf0.id);
        const migrated = localStorage.getItem('myboard.workflowLayout.' + wf0.id);
        await A.actions.undo(); await idle();
        const wf2 = listOf(await A.api.projectPart(shop.id, 'workflows')).find((w) => w.id === wf0.id);
        await press('[data-act="wf-autolayout"]'); await press('[data-act="wf-save"]');
        const wf3 = listOf(await A.api.projectPart(shop.id, 'workflows')).find((w) => w.id === wf0.id);
        return { beforeSave, bar, barGone, legacyShown, moved: wf1.layout?.[s1.id], kept: wf1.layout?.[s2.id], rev: [wf0.rev, wf1.rev], migrated, undone: wf2.layout, auto: wf3.layout };`);
      assert.match(r.legacyShown, /translate\(600 200\)/, 'the old browser layout is shown before it is saved');
      assert.equal(r.beforeSave, null, 'not written before Save');
      assert.ok(r.bar && r.barGone, 'the unsaved-changes bar with Save, gone after saving');
      assert.ok(r.moved && r.moved.x > 0 && r.moved.y > 0, `the dragged box is stored: ${JSON.stringify(r.moved)}`);
      assert.deepEqual(r.kept, { x: 600, y: 200 }, 'the old browser layout moved into the DB');
      assert.ok(r.rev[1] > r.rev[0] + 1, 'saved with rev');
      assert.equal(r.migrated, null, 'the browser copy is dropped');
      assert.deepEqual(r.undone, { [Object.keys(r.undone ?? {})[0]]: { x: 600, y: 200 } }, 'undo goes back to the migrated layout');
      assert.equal(r.auto, null, 'auto layout clears it');
    },
  },
];
