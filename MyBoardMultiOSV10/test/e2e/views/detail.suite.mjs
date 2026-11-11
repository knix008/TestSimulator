// E2E cases of the issue detail view (src/views/detail): the real shell in headless Edge with a web core.
// Each case opens (or re-opens) one test issue of the sample project and drives the panel like a user:
// clicks, typing (input events), keys, pointer drags, drops, confirm popups. Run by scripts/test.mjs (web stage).
import assert from 'node:assert/strict';

/** Page helpers for every case (prepended to the case's body). */
const PRE = String.raw`
const D = () => window.__myboardDetail;
const q = (s) => document.querySelector('#detail ' + s);
const qa = (s) => [...document.querySelectorAll('#detail ' + s)];
const settle = async () => { await T.frames(2); await T.until(() => D() && !D().pending, 20000, 'detail idle'); await D().idle(); await T.frames(2); };
const typeInto = (el, text) => { el.focus(); el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); };
const press = (el, key, opts = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
const picker = () => T.until(() => document.querySelector('.dt-picker .dd-item, .dt-picker .dt-picker-empty') && document.querySelector('.dt-picker'), 8000, 'picker');
const pick = async (test) => { await picker(); const items = [...document.querySelectorAll('.dt-picker .dd-item:not(.disabled)')]; const item = items.find(test); if (!item) throw new Error('no picker item: ' + items.map((i) => i.textContent.trim()).join(' | ')); item.click(); return item.dataset.value; };
const confirmYes = async () => { await T.popupReady('confirm'); T.popupDoc('confirm').querySelector('.button.primary').click(); };
const issueNow = () => A.api.issue(window.__dt.id);
async function ensure({ fresh = false } = {}) {
  await T.until(() => A.state.core.status === 'ready', 30000, 'core');
  await A.popups.closeAll?.();
  if (!window.__dt || fresh) {
    let projects = await A.api.projects();
    if (!projects.some((p) => p.key.startsWith('SHOP'))) { await A.api.createSamples('ko'); await A.actions.refreshProjects(); projects = await A.api.projects(); }
    const shop = projects.find((p) => p.key.startsWith('SHOP'));
    const cfg = await A.api.get('/projects/' + shop.id + '/config');
    const story = cfg.types.find((x) => Number(x.level) === 0);
    const issue = await A.api.createIssue({ projectId: shop.id, typeId: story.id, summary: 'E2E 상세 테스트 이슈', description: '처음 설명' });
    window.__dt = { id: issue.id, key: issue.key, projectId: shop.id, projectKey: shop.key, cfg };
  }
  if (A.state.doc?.project?.id !== window.__dt.projectId || A.state.showStart) await A.actions.openTarget('project', window.__dt.projectId, { quiet: true });
  if (!A.state.settings.showRightPanel) A.actions.updateSettings({ showRightPanel: true });
  if (A.state.selectedIssue !== window.__dt.id || D()?.state !== 'ready') A.actions.openIssue(window.__dt.id);
  await T.until(() => D()?.state === 'ready' && D().issueId === window.__dt.id, 20000, 'detail ready');
  // Every field visible (empty ones are hidden by default; that is checked by its own case).
  if (!D().showEmpty) { D().showEmpty = true; D().render(); }
  await settle();
  return window.__dt;
}
`;

const run = (app, body, timeout = 90000) => app.run(`${PRE}\n${body}`, timeout);

/** Errors the page logged on purpose (409, 400 answers of the core): drained, and anything else rethrown. */
function expectOnly(app, pattern) {
  const errors = app.takeErrors();
  const other = errors.filter((e) => !pattern.test(e));
  assert.deepEqual(other, [], 'unexpected page errors');
}

export const cases = [
  {
    group: 'Issue detail',
    name: 'Opening an issue: header (key, type, summary, actions), status, field column, description, parts, activity tabs',
    async run(app) {
      const r = await run(app, String.raw`await ensure({ fresh: true });
        return { key: q('.dt-key')?.textContent.trim(), summary: q('.dt-summary-text')?.textContent, status: Boolean(q('.dt-status-button')), type: Boolean(q('.dt-type svg, .dt-type .iconref')),
          fields: qa('.dt-field').map((f) => f.dataset.field), sections: qa('.dt-section').map((s) => s.dataset.section), tabs: qa('.dt-tab').map((b) => b.dataset.tab),
          head: qa('.dt-head-actions [data-act]').map((b) => b.dataset.act), desc: q('.dt-description')?.textContent.trim(), noNative: qa('select').length };`);
      assert.match(r.key, /^SHOP\d*-\d+$/);
      assert.equal(r.summary, 'E2E 상세 테스트 이슈');
      assert.ok(r.status && r.type);
      for (const f of ['assignee', 'reporter', 'priority', 'labels', 'components', 'fixVersions', 'affectedVersions', 'epic', 'storyPoints', 'originalEstimate', 'remainingEstimate', 'timeSpent', 'startDate', 'dueDate', 'color', 'cover', 'icon']) assert.ok(r.fields.includes(f), `field ${f}`);
      assert.ok(r.fields.some((f) => f.startsWith('custom:')), 'custom fields');
      assert.deepEqual(r.sections, ['desc', 'checklist', 'subtasks', 'links', 'attachments', 'activity', 'fields']);
      assert.deepEqual(r.tabs, ['comments', 'history', 'worklog', 'all']);
      assert.deepEqual(r.head, ['watch', 'menu', 'wide', 'close']);
      assert.equal(r.desc, '처음 설명');
      assert.equal(r.noNative, 0, 'no native <select>');
    },
  },
  {
    group: 'Issue detail',
    name: 'Editing the summary (e, Enter saves), description editor (Markdown preview, :icon[], @mention autocomplete)',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        document.activeElement?.blur(); press(document.body, 'e'); await T.frames(2);
        const box = q('.dt-summary-input'); typeInto(box, '고친 제목 E2E'); press(box, 'Enter'); await settle();
        const summary = (await issueNow()).summary;
        q('[data-act="desc-edit"]').click(); await T.frames(2);
        const users = [...D().users.values()].filter((u) => u.username !== 'admin');
        const user = users[0];
        const area = q('textarea[data-draft="desc"]');
        typeInto(area, '**굵게** :icon[b:star] 와 @' + user.username.slice(0, 3)); area.setSelectionRange(area.value.length, area.value.length); area.dispatchEvent(new Event('input', { bubbles: true }));
        await picker(); const suggestions = [...document.querySelectorAll('.dt-picker .dd-item')].map((i) => i.dataset.value);
        press(q('textarea[data-draft="desc"]'), 'Enter'); await T.frames(2);
        const afterMention = q('textarea[data-draft="desc"]').value;
        q('[data-act="ed-fmt"][data-fmt="bold"]').click(); await T.frames(1);
        q('[data-act="ed-preview"]').click(); await T.frames(2);
        const preview = { strong: Boolean(q('.dt-ed-preview strong')), icon: Boolean(q('.dt-ed-preview .iconref-inline')), mention: q('.dt-ed-preview .md-mention')?.textContent };
        q('[data-act="ed-save"]').click(); await settle();
        return { summary, suggestions, user: user.username, afterMention, preview, shown: { strong: Boolean(q('.dt-description strong')), mention: q('.dt-description .md-mention')?.textContent, icon: Boolean(q('.dt-description .iconref-inline')) }, saved: (await issueNow()).description };`);
      assert.equal(r.summary, '고친 제목 E2E');
      assert.ok(r.suggestions.includes(r.user), 'mention suggestions list the user');
      assert.ok(r.afterMention.includes(`@${r.user} `), 'mention inserted');
      assert.deepEqual(r.preview, { strong: true, icon: true, mention: `@${r.user}` });
      assert.deepEqual(r.shown, { strong: true, mention: `@${r.user}`, icon: true });
      assert.match(r.saved, /\*\*굵게\*\* :icon\[b:star\]/);
    },
  },
  {
    group: 'Issue detail',
    name: 'Fields: assignee (incl. assign to me), priority, new label, story points −/+, dates, card colour (icon drop-downs)',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        q('[data-act="pick"][data-field="assignee"]').click();
        const assignee = await pick((i) => i.dataset.value && i.dataset.value !== A.state.core.info.user.id); await settle();
        const a1 = (await issueNow()).assigneeId;
        q('[data-act="assign-me"]').click(); await settle();
        const a2 = (await issueNow()).assigneeId;
        const before = (await issueNow()).priorityId;
        q('[data-act="pick"][data-field="priority"]').click();
        const icons = [...document.querySelectorAll('.dt-picker .dd-item')].every((i) => i.querySelector('svg, img, .iconref'));
        const priority = await pick((i) => i.dataset.value !== before); await settle();
        q('[data-act="pick"][data-field="labels"]').click(); await picker();
        const search = document.querySelector('.dt-picker-input'); search.value = 'e2e 레이블'; search.dispatchEvent(new Event('input', { bubbles: true })); await T.frames(1);
        await pick((i) => i.dataset.value === ':create:'); await settle();
        const sp0 = (await issueNow()).storyPoints ?? 0;
        const plus = q('.stepper[data-stepper="storyPoints"] [data-step-dir="1"]');
        for (let k = 0; k < 3; k++) { plus.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); plus.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 })); }
        await T.sleep(600); await settle();
        const due = q('input[data-field="dueDate"]'); due.value = '2030-05-17'; due.dispatchEvent(new Event('change', { bubbles: true })); await settle();
        q('[data-act="pick"][data-field="color"]').click(); const color = await pick((i) => i.dataset.value === '#46a758'); await settle();
        const now = await issueNow();
        return { assignee, a1, a2, me: A.state.core.info.user.id, priority, p: now.priorityId, icons, labels: now.labels, sp0, sp: now.storyPoints, due: now.dueDate, color: now.color, shownSp: q('.stepper[data-stepper="storyPoints"] .stepper-value').value, shownLabel: q('[data-field="labels"] .dt-chip')?.textContent.trim() };`);
      assert.equal(r.a1, r.assignee);
      assert.equal(r.a2, r.me);
      assert.equal(r.p, r.priority);
      assert.ok(r.icons, 'every priority item has an icon');
      assert.ok(r.labels.includes('e2e-레이블'), `labels ${r.labels}`);
      assert.equal(r.sp, r.sp0 + 3);
      assert.equal(r.shownSp, String(r.sp0 + 3));
      assert.equal(r.due, '2030-05-17');
      assert.equal(r.color, '#46a758');
      assert.equal(r.shownLabel, 'e2e-레이블');
    },
  },
  {
    group: 'Issue detail',
    name: 'Issue icon: icon picker (ctx.pickIcon) → IconRef saved and shown in the header',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        q('[data-act="pick-icon"]').click(); await T.popupReady('iconpicker'); const d = () => T.popupDoc('iconpicker');
        await T.until(() => d().querySelector('.ip-grid [data-ip-ref="b:rocket"]'), 8000, 'grid');
        d().querySelector('.ip-grid [data-ip-ref="b:rocket"]').click(); d().querySelector('[data-ip-act="apply"]').click();
        await T.until(() => D().issue.icon === 'b:rocket', 8000, 'icon'); await settle();
        return { icon: (await issueNow()).icon, header: Boolean(q('.dt-summary .dt-issue-icon svg')) };`);
      assert.equal(r.icon, 'b:rocket');
      assert.ok(r.header);
    },
  },
  {
    group: 'Issue detail',
    name: 'Transitions: to done (resolution form), back again, condition/validator failures translated by code',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const cfg = window.__dt.cfg; const done = cfg.statuses.find((s) => s.category === 'done'); const prog = cfg.statuses.find((s) => s.category === 'inprogress');
        const wf = cfg.workflows[0];
        // Two extra transitions: one only the reporter may use (admin is not the reporter of this issue? → set reporter to someone else), one that needs a comment.
        const other = [...D().users.values()].find((u) => u.id !== A.state.core.info.user.id);
        await A.api.updateIssue(window.__dt.id, { reporterId: other.id, rev: (await issueNow()).rev });
        const t1 = await A.api.post('/projects/' + window.__dt.projectId + '/transitions', { workflowId: wf.id, name: 'E2E 보고자만', fromStatusId: null, toStatusId: prog.id, rules: { conditions: [{ type: 'onlyReporter' }] } });
        const t2 = await A.api.post('/projects/' + window.__dt.projectId + '/transitions', { workflowId: wf.id, name: 'E2E 댓글 필요', fromStatusId: null, toStatusId: prog.id, rules: { validators: [{ type: 'commentRequired' }] } });
        try {
          await D().reload(); await settle();
          q('[data-act="status"]').click(); await picker();
          const blocked = [...document.querySelectorAll('.dt-picker .dd-item.disabled')].map((i) => i.textContent.trim());
          await pick((i) => i.dataset.value === t2.id); await T.frames(2);
          const formShown = Boolean(q('.dt-transition-form textarea[data-draft="tf:comment"]'));
          q('[data-act="tf-apply"]').click(); await T.frames(2);
          const commentError = q('.dt-transition-form .dt-error')?.textContent.trim();
          typeInto(q('textarea[data-draft="tf:comment"]'), '전환 댓글 E2E'); q('[data-act="tf-apply"]').click(); await settle();
          const afterComment = (await issueNow()).statusId;
          const res = cfg.resolutions[1] ?? cfg.resolutions[0];
          q('[data-act="status"]').click();
          await pick((i) => { const tr = D().transitions.find((x) => x.id === i.dataset.value); return tr && tr.toStatusId === done.id; }); await T.frames(2);
          const resForm = Boolean(q('[data-act="tf-resolution"]'));
          q('[data-act="tf-resolution"]').click(); await pick((i) => i.dataset.value === res.id); await T.frames(1);
          q('[data-act="tf-apply"]').click(); await settle();
          const closed = await issueNow();
          const shownStatus = q('.dt-status-button').textContent.trim(); const shownRes = q('.dt-chip.resolution')?.textContent.trim();
          await A.actions.undo(); await settle();
          const undone = await issueNow();
          return { blocked, formShown, commentError, afterComment, prog: prog.id, resForm, closed: [closed.statusId, closed.resolutionId], want: [done.id, res.id], shownStatus, doneName: done.name, shownRes, resName: res.name, undone: [undone.statusId, undone.resolutionId] };
        } finally {
          await A.api.del('/projects/' + window.__dt.projectId + '/transitions/' + t1.id); await A.api.del('/projects/' + window.__dt.projectId + '/transitions/' + t2.id);
          await D().reload(); await settle();
        }`);
      assert.ok(r.blocked.some((text) => text.includes('E2E 보고자만') && text.includes('보고자만 할 수 있습니다')), `blocked: ${r.blocked}`);
      assert.ok(r.formShown, 'comment form');
      assert.equal(r.commentError, '이 상태로 바꾸려면 댓글이 필요합니다');
      assert.equal(r.afterComment, r.prog);
      assert.ok(r.resForm, 'resolution choice');
      assert.deepEqual(r.closed, r.want);
      assert.equal(r.shownStatus, r.doneName);
      assert.equal(r.shownRes, r.resName);
      assert.deepEqual(r.undone, [r.prog, null], 'undo goes back to the previous status and clears the resolution');
    },
  },
  {
    group: 'Issue detail',
    name: 'Checklist: add (Enter), tick, drag to reorder, Alt+↑, edit text, delete, progress bar',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        for (const text of ['하나', '둘', '셋']) { const box = q('[data-draft="cl:new"]'); typeInto(box, text); press(box, 'Enter'); await settle(); }
        const items = () => qa('[data-cl] .dt-cl-text').map((e) => e.textContent);
        const added = items();
        q('[data-cl] input[type="checkbox"]').click(); await settle();
        const progress = q('[data-section="checklist"] .dt-progress-text')?.textContent;
        // drag "셋" above "하나"
        const rows = qa('[data-cl]'); const grip = rows[2].querySelector('.dt-grip'); const top = rows[0].getBoundingClientRect();
        grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: rows[2].getBoundingClientRect().top + 5 }));
        window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: top.top + 2 }));
        const marker = Boolean(q('.dt-drop-marker'));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: top.top + 2 }));
        await settle();
        const dragged = items(); const server1 = (await issueNow()).checklist.map((c) => c.text);
        press(qa('[data-cl] .dt-grip')[2], 'ArrowUp', { altKey: true }); await settle();
        const keyed = (await issueNow()).checklist.map((c) => c.text);
        q('[data-act="cl-edit"]').click(); await T.frames(1); const edit = q('.dt-cl-input'); typeInto(edit, '셋 (고침)'); press(edit, 'Enter'); await settle();
        const edited = (await issueNow()).checklist.map((c) => c.text);
        q('[data-act="cl-delete"]').click(); await confirmYes(); await settle();
        const final = await issueNow();
        return { added, progress, marker, dragged, server1, keyed, edited, final: final.checklist.map((c) => [c.text, c.done]) };`);
      assert.deepEqual(r.added, ['하나', '둘', '셋']);
      assert.equal(r.progress, '33%');
      assert.ok(r.marker, 'drop marker while dragging');
      assert.deepEqual(r.dragged, ['셋', '하나', '둘']);
      assert.deepEqual(r.server1, ['셋', '하나', '둘']);
      assert.deepEqual(r.keyed, ['셋', '둘', '하나']);
      assert.deepEqual(r.edited, ['셋 (고침)', '둘', '하나']);
      assert.deepEqual(r.final, [['둘', false], ['하나', true]]);
    },
  },
  {
    group: 'Issue detail',
    name: 'Subtasks: create inline, status shown, open (go to the subtask), come back',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const box = q('[data-draft="sub:new"]'); typeInto(box, 'E2E 하위 작업'); press(box, 'Enter'); await settle();
        const rows = qa('[data-sub]'); const sub = (await issueNow()).subtasks.find((s) => s.summary === 'E2E 하위 작업');
        const status = Boolean(rows.at(-1)?.querySelector('.dt-status'));
        rows.at(-1).querySelector('[data-act="open"]').click();
        await T.until(() => D().issueId === sub.id && D().state === 'ready', 10000, 'subtask open'); await settle();
        const parent = q('[data-field="parent"] .dt-fbtn')?.textContent.trim(); const crumb = Boolean(q('.dt-crumb.link'));
        const noSubSection = !q('[data-section="subtasks"]');
        q('.dt-crumb.link[data-id="' + window.__dt.id + '"]').click();
        await T.until(() => D().issueId === window.__dt.id && D().state === 'ready', 10000, 'back'); await settle();
        return { sub: Boolean(sub), status, parent, crumb, noSubSection, count: qa('[data-sub]').length };`);
      assert.ok(r.sub && r.status);
      assert.match(r.parent, /SHOP\d*-\d+/);
      assert.ok(r.crumb && r.noSubSection);
      assert.ok(r.count >= 1);
    },
  },
  {
    group: 'Issue detail',
    name: 'Links: choose kind + add by key, grouped by kind, shown on the other side too, unlink',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const other = (await A.api.issues({ jql: 'project = "' + window.__dt.projectKey + '"', limit: 5 })).items.find((i) => i.id !== window.__dt.id && !i.parentId);
        q('[data-act="link-new"]').click(); await T.frames(1);
        q('[data-act="link-kind"]').click(); await pick((i) => i.dataset.value === 'blocks:inward');
        typeInto(q('[data-draft="link:key"]'), other.key); q('[data-act="link-save"]').click(); await settle();
        const group = q('.dt-link-group h4')?.textContent; const row = q('[data-link] b')?.textContent;
        const theirs = (await A.api.issue(other.id)).links.map((l) => l.kind + ':' + l.direction + ':' + l.issue.key);
        q('[data-act="link-remove"]').click(); await confirmYes(); await settle();
        return { group, row, key: other.key, mine: window.__dt.key, theirs, after: (await issueNow()).links.length };`);
      assert.equal(r.group, '막힘');
      assert.equal(r.row, r.key);
      assert.ok(r.theirs.includes(`blocks:outward:${r.mine}`), 'the other issue blocks this one');
      assert.equal(r.after, 0);
    },
  },
  {
    group: 'Issue detail',
    name: 'Attachments: drop to upload, thumbnail, download, preview, use as cover, delete (confirm), 50 MB limit',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const canvas = Object.assign(document.createElement('canvas'), { width: 24, height: 16 }); const g = canvas.getContext('2d'); g.fillStyle = '#e5484d'; g.fillRect(0, 0, 24, 16);
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        const file = new File([blob], 'e2e 그림.png', { type: 'image/png' });
        const dt = new DataTransfer(); dt.items.add(file); dt.items.add(new File(['hello'], 'note.txt', { type: 'text/plain' }));
        q('.dt-dropzone').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        await T.until(() => (D().attachments ?? []).length >= 2, 15000, 'uploaded'); await settle();
        const img = q('.dt-att img'); await T.until(() => img.complete, 5000, 'thumb');
        const thumb = img.naturalWidth;
        const href = q('[data-att] a[download]').getAttribute('href'); const bytes = (await (await fetch(href)).arrayBuffer()).byteLength;
        q('.dt-att-thumb img').closest('button').click(); await T.frames(2);
        const preview = Boolean(q('.dt-lightbox img')); q('.dt-lightbox [data-act="preview-close"].icon-button').click(); await T.frames(1);
        const png = D().attachments.find((a) => a.mime === 'image/png');
        q('[data-act="att-cover"][data-id="' + png.id + '"]').click(); await settle();
        const cover = (await issueNow()).cover;
        const big = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'huge.bin');
        await D().uploadFiles([big]); await T.frames(1);
        const limit = q('[data-banner="notice"]')?.textContent.trim();
        q('[data-act="att-delete"][data-id="' + D().attachments.find((a) => a.mime.startsWith('text')).id + '"]').click(); await confirmYes(); await T.until(() => D().attachments.length === 1, 10000, 'deleted'); await settle();
        return { names: D().attachments.map((a) => a.fileName), thumb, bytes, size: png.size, preview, cover, png: png.id, limit, count: (await issueNow()).attachmentCount };`);
      assert.deepEqual(r.names, ['e2e 그림.png']);
      assert.equal(r.thumb, 24, 'thumbnail decoded');
      assert.equal(r.bytes, r.size, 'download returns the bytes');
      assert.ok(r.preview);
      assert.deepEqual(r.cover, { attachmentId: r.png });
      assert.match(r.limit, /50 MB.*huge\.bin/);
      assert.equal(r.count, 1);
    },
  },
  {
    group: 'Issue detail',
    name: 'Comments: m to write (@mention, :icon[]), edit, delete (confirm), newest/oldest order',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        if (D().order !== 'newest') { q('[data-act="order"]').click(); await T.frames(1); }
        const user = [...D().users.values()].find((u) => u.username !== 'admin');
        document.activeElement?.blur(); press(document.body, 'm'); await T.frames(2);
        const area = q('textarea[data-draft="comment:new"]'); const opened = Boolean(area);
        typeInto(area, '첫 댓글 @' + user.username + ' :icon[e:🎉]'); press(area, 'Enter', { ctrlKey: true }); await settle();
        typeInto((q('[data-act="comment-new"]').click(), await T.frames(1), q('textarea[data-draft="comment:new"]')), '둘째 댓글'); q('[data-act="ed-save"]').click(); await settle();
        const order1 = qa('[data-comment] .dt-comment-body').map((e) => e.textContent.trim().slice(0, 4));
        q('[data-act="order"]').click(); await T.frames(1);
        const order2 = qa('[data-comment] .dt-comment-body').map((e) => e.textContent.trim().slice(0, 4));
        const first = qa('[data-comment]').find((e) => e.textContent.includes('첫 댓글'));
        const mention = first.querySelector('.md-mention')?.textContent; const emoji = Boolean(first.querySelector('.iconref-e'));
        first.querySelector('[data-act="comment-edit"]').click(); await T.frames(1);
        typeInto(q('[data-comment] textarea'), '첫 댓글 (고침)'); q('[data-comment] [data-act="ed-save"]').click(); await settle();
        const edited = (await A.api.issuePart(window.__dt.id, 'comments')).map((c) => c.body);
        const count = D().comments.length;
        qa('[data-comment]').find((e) => e.textContent.includes('둘째'))?.querySelector('[data-act="comment-delete"]').click(); await confirmYes();
        await T.until(() => D().comments.length === count - 1, 10000, 'deleted'); await settle();
        q('[data-act="order"]').click();
        return { opened, user: user.username, order1, order2, mention, emoji, edited, left: (await A.api.issuePart(window.__dt.id, 'comments')).map((c) => c.body) };`);
      assert.ok(r.opened, 'm opens the composer');
      const mine = (list) => list.filter((x) => x === '첫 댓글' || x === '둘째 댓');
      assert.deepEqual(mine(r.order1), ['둘째 댓', '첫 댓글']);
      assert.deepEqual(mine(r.order2), ['첫 댓글', '둘째 댓']);
      assert.equal(r.order1[0], '둘째 댓', 'newest first');
      assert.equal(r.mention, `@${r.user}`);
      assert.ok(r.emoji);
      assert.ok(r.edited.includes('첫 댓글 (고침)'));
      // Other comments may be there too: the transition's own, and those automation rules of the samples add.
      assert.ok(r.left.includes('첫 댓글 (고침)'), 'the edited comment stays');
      assert.ok(!r.left.some((b) => b.startsWith('둘째 댓글')), 'the deleted comment is gone');
    },
  },
  {
    group: 'Issue detail',
    name: 'Work log: original estimate 4h → log "1h 30m" (remaining auto), set manually, invalid time, edit, delete',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        await D().setField('originalEstimate', 4 * 3600); await D().setField('remainingEstimate', null); await settle();
        q('[data-act="tab"][data-tab="worklog"]').click(); await settle();
        typeInto(q('[data-draft="wl:time"]'), 'abc'); q('[data-act="wl-add"]').click(); await T.frames(1);
        const bad = q('.dt-worklog-form .dt-error')?.textContent.trim();
        typeInto(q('[data-draft="wl:time"]'), '1h 30m'); typeInto(q('[data-draft="wl:comment"]'), '조사'); q('[data-act="wl-add"]').click(); await settle();
        const a = await issueNow();
        q('[data-act="wl-mode"][data-mode="set"]').click(); await T.frames(1);
        typeInto(q('[data-draft="wl:time"]'), '30m'); typeInto(q('[data-draft="wl:remaining"]'), '1h'); q('[data-act="wl-add"]').click(); await settle();
        const b = await issueNow();
        const entries = qa('[data-worklog]').length; const bar = q('.dt-track-bar .spent').style.width;
        q('[data-act="wl-edit"]').click(); await T.frames(1); const id = q('[data-worklog].editing').dataset.worklog;
        typeInto(q('[data-draft="wl:' + id + ':time"]'), '45m'); q('[data-act="wl-save"]').click(); await settle();
        const c = await issueNow();
        q('[data-act="wl-delete"]').click(); await confirmYes(); await T.until(() => D().worklogs.length === 1, 10000, 'deleted'); await settle();
        const d = await issueNow();
        q('[data-act="wl-mode"][data-mode="auto"]').click();
        return { bad, a: [a.timeSpent, a.remainingEstimate], b: [b.timeSpent, b.remainingEstimate], entries, bar, c: c.timeSpent, d: d.timeSpent, legend: q('.dt-track-legend').textContent };`);
      assert.match(r.bad, /1w 2d 3h 30m/);
      assert.deepEqual(r.a, [5400, 9000], '4h − 1h30m = 2h30m remaining');
      assert.deepEqual(r.b, [7200, 3600], 'remaining set to 1h');
      assert.equal(r.entries, 2);
      assert.ok(parseFloat(r.bar) > 0);
      assert.ok([7200 - 1800 + 2700, 7200 - 5400 + 2700].includes(r.c), `edited time spent ${r.c}`);
      assert.ok(r.d < r.c);
      assert.match(r.legend, /기록/);
    },
  },
  {
    group: 'Issue detail',
    name: 'History tab: readable field changes (name, from → to); the All tab mixes comments, history and work log',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        q('[data-act="tab"][data-tab="history"]').click(); await settle();
        const fields = qa('[data-history]').map((e) => e.dataset.history);
        const text = q('.dt-activity').textContent;
        const arrow = Boolean(q('[data-history="priority"] .dt-change .arrow'));
        q('[data-act="tab"][data-tab="all"]').click(); await settle();
        const kinds = new Set(qa('.dt-entries > li').map((e) => e.classList[1]));
        q('[data-act="tab"][data-tab="comments"]').click(); await settle();
        return { fields, text: text.slice(0, 2000), arrow, kinds: [...kinds] };`);
      for (const f of ['summary', 'description', 'assignee', 'priority', 'labels', 'storyPoints', 'dueDate', 'color', 'icon', 'status', 'attachment', 'link']) assert.ok(r.fields.includes(f), `history has ${f}`);
      assert.ok(r.arrow);
      assert.match(r.text, /우선순위 을\(를\) 바꿨습니다/);
      assert.match(r.text, /4h|2h 30m/, 'estimates as durations');
      assert.deepEqual(r.kinds.sort(), ['comment', 'history', 'worklog']);
    },
  },
  {
    group: 'Issue detail',
    name: 'Undo / redo: change priority → undo → redo (panel and core)',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const before = (await issueNow()).priorityId;
        q('[data-act="pick"][data-field="priority"]').click(); const chosen = await pick((i) => i.dataset.value !== before); await settle();
        const label = A.history.undoLabel;
        await A.actions.undo(); await settle();
        const undone = [(await issueNow()).priorityId, D().issue.priorityId];
        await A.actions.redo(); await settle();
        const redone = [(await issueNow()).priorityId, D().issue.priorityId];
        return { before, chosen, label, undone, redone };`);
      assert.match(r.label, /우선순위/);
      assert.deepEqual(r.undone, [r.before, r.before]);
      assert.deepEqual(r.redone, [r.chosen, r.chosen]);
    },
  },
  {
    group: 'Issue detail',
    name: `Realtime: another client's change applies without losing text being edited, viewers shown`,
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        if (A.live().state !== 'open') return { skipped: 'no realtime (' + A.live().state + ')' };
        const { ApiClient } = await import('/src/api/client.js'); const { WsChannel } = await import('/src/live/channel.js');
        const other = new ApiClient({ base: '/api' }); other.clientId = 'e2e-other-client';
        q('[data-act="desc-edit"]').click(); await T.frames(1);
        typeInto(q('textarea[data-draft="desc"]'), '내가 쓰는 중인 설명');
        const cur = await other.issue(window.__dt.id);
        await other.updateIssue(window.__dt.id, { summary: '다른 사람이 바꾼 제목', rev: cur.rev });
        await T.until(() => q('.dt-summary-text')?.textContent === '다른 사람이 바꾼 제목', 10000, 'live refresh');
        const kept = q('textarea[data-draft="desc"]')?.value; const note = Boolean(q('[data-banner="remote"]'));
        const ch = new WsChannel({ clientId: 'e2e-other-client' }); ch.connect(); await T.until(() => ch.state === 'open', 8000, 'ws');
        // The hub takes presence only after it confirmed the subscription.
        const subscribed = new Promise((resolve) => ch.on('subscribed', resolve));
        ch.subscribe(['issue:' + window.__dt.id]); await subscribed; ch.setPresence('issue:' + window.__dt.id, { view: 'issue', issueId: window.__dt.id, editing: 'description' });
        await T.until(() => q('.dt-presence'), 8000, 'presence');
        const presence = q('.dt-presence-text').textContent.trim();
        ch.close(); await T.until(() => !q('.dt-presence'), 8000, 'presence gone');
        q('[data-act="ed-cancel"]').click(); await settle();
        return { kept, note, presence };`);
      if (r?.skipped) return r;
      assert.equal(r.kept, '내가 쓰는 중인 설명', 'the edit in progress survives the refresh');
      assert.ok(r.note, '"changed by" note');
      assert.match(r.presence, /설명 고치는 중/);
      return undefined;
    },
  },
  {
    group: 'Issue detail',
    name: '409 conflict: old rev is CONFLICT, other fields merge, same field shows a banner (keep mine / take theirs)',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const { ApiClient } = await import('/src/api/client.js');
        const other = new ApiClient({ base: '/api' }); other.clientId = 'e2e-other-client';
        // 1. a PATCH with an old rev from a second client → 409 CONFLICT with the current row
        const cur = await other.issue(window.__dt.id);
        const stale = await other.updateIssue(window.__dt.id, { summary: 'x', rev: cur.rev - 1 }).then(() => null, (e) => ({ status: e.status, code: e.code, rev: e.details?.current?.rev }));
        // 2. I edit the description, they change the summary meanwhile → saved on top of theirs (merge)
        D().reload(); await settle();
        q('[data-act="desc-edit"]').click(); await T.frames(1); typeInto(q('textarea[data-draft="desc"]'), '내 설명 (병합)');
        const c1 = await other.issue(window.__dt.id); await other.updateIssue(window.__dt.id, { summary: '저쪽 제목 (병합)', rev: c1.rev });
        q('[data-act="ed-save"]').click(); await settle();
        const merged = await issueNow();
        // 3. both change the description → the conflict banner; "save mine" wins
        q('[data-act="desc-edit"]').click(); await T.frames(1); typeInto(q('textarea[data-draft="desc"]'), '내 설명 (충돌)');
        const c2 = await other.issue(window.__dt.id); await other.updateIssue(window.__dt.id, { description: '저쪽 설명', rev: c2.rev });
        q('[data-act="ed-save"]').click(); await settle();
        const banner = q('[data-banner="conflict"]')?.textContent.replace(/\s+/g, ' ').trim();
        const stillEditing = q('textarea[data-draft="desc"]')?.value;
        q('[data-act="conflict-mine"]').click(); await settle();
        const mine = await issueNow();
        // 4. again, this time "use theirs"
        q('[data-act="desc-edit"]').click(); await T.frames(1); typeInto(q('textarea[data-draft="desc"]'), '버릴 설명');
        const c3 = await other.issue(window.__dt.id); await other.updateIssue(window.__dt.id, { description: '저쪽 설명 2', rev: c3.rev });
        q('[data-act="ed-save"]').click(); await settle();
        q('[data-act="conflict-theirs"]').click(); await settle();
        q('[data-act="ed-cancel"]')?.click(); await settle();
        const theirs = await issueNow();
        return { stale, merged: [merged.summary, merged.description], banner, stillEditing, mine: mine.description, theirs: [theirs.description, q('.dt-description').textContent.trim()] };`);
      expectOnly(app, /409|Conflict/i);
      assert.deepEqual([r.stale.status, r.stale.code], [409, 'CONFLICT']);
      assert.ok(r.stale.rev > 0, 'details.current');
      assert.deepEqual(r.merged, ['저쪽 제목 (병합)', '내 설명 (병합)']);
      assert.match(r.banner, /다른 사람이 먼저 바꿨습니다.*설명/);
      assert.equal(r.stillEditing, '내 설명 (충돌)', 'unsaved text kept');
      assert.equal(r.mine, '내 설명 (충돌)');
      assert.deepEqual(r.theirs, ['저쪽 설명 2', '저쪽 설명 2']);
    },
  },
  {
    group: 'Issue detail',
    name: 'Actions menu: watch, flag, clone, open wide, delete (confirm) → deleted issue, Esc closes',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const w0 = (await issueNow()).watching;
        q('[data-act="watch"]').click(); await settle(); const w1 = (await issueNow()).watching;
        q('[data-act="menu"]').click(); await picker(); const items = [...document.querySelectorAll('.dt-picker .dd-item')].map((i) => i.dataset.value);
        const allIcons = [...document.querySelectorAll('.dt-picker .dd-item')].every((i) => i.querySelector('svg'));
        await pick((i) => i.dataset.value === 'flag'); await settle(); const flagged = (await issueNow()).flagged;
        const width0 = T.rect('#detail').w;
        q('[data-act="wide"]').click(); await T.frames(3); const wide = T.rect('#detail').w; const twoCols = getComputedStyle(q('.dt-groups')).gridTemplateColumns.split(' ').length;
        q('[data-act="wide"]').click(); await T.frames(3); const back = T.rect('#detail').w;
        q('[data-act="menu"]').click(); await pick((i) => i.dataset.value === 'clone');
        await T.until(() => D().issueId !== window.__dt.id && D().state === 'ready', 10000, 'clone opened'); await settle();
        const cloneKey = D().issue.key; const cloneLinks = D().issue.links.map((l) => l.kind);
        q('[data-act="menu"]').click(); await pick((i) => i.dataset.value === 'delete'); await confirmYes();
        await T.until(() => D().state === 'empty', 10000, 'closed after delete');
        const gone = await A.api.issue(cloneKey).then(() => false, (e) => e.status === 404);
        await ensure();
        q('[data-act="desc-edit"]').click(); await T.frames(1); const area = q('textarea[data-draft="desc"]');
        press(area, 'Escape'); await T.frames(1); const editorClosed = !q('textarea[data-draft="desc"]');
        press(q('.dt-root'), 'Escape'); await T.frames(1);
        return { w: [w0, w1], items, allIcons, flagged, widths: [width0, wide, back], twoCols, cloneKey, cloneLinks, gone, editorClosed, closed: D().state, selected: A.state.selectedIssue };`);
      expectOnly(app, /404|Not Found/i);
      assert.notEqual(r.w[0], r.w[1]);
      for (const id of ['watch', 'vote', 'flag', 'clone', 'wide', 'delete', 'close']) assert.ok(r.items.includes(id), `menu ${id}`);
      assert.ok(r.allIcons, 'every menu item has an icon');
      assert.equal(r.flagged, true);
      assert.ok(r.widths[1] >= 600 && r.widths[2] < 600, `widths ${r.widths}`);
      assert.equal(r.twoCols, 2, 'two columns of field groups when wide');
      assert.ok(r.cloneLinks.includes('clones'));
      assert.ok(r.gone, 'the clone was deleted');
      assert.ok(r.editorClosed, 'Esc closes the editor first');
      assert.equal(r.closed, 'empty', 'then Esc closes the panel');
      assert.equal(r.selected, null);
    },
  },
  {
    group: 'Issue detail',
    name: 'Read-only (viewer role): no edit buttons, numbers as disabled −/+ steppers',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const role = D().cfg.project.myRole; D().cfg.project.myRole = 'viewer'; D().render(); await T.frames(1);
        const out = { chip: Boolean(q('.dt-chip.readonly')), status: q('.dt-status-button').disabled, pickers: qa('.dt-fbtn:not(:disabled)').length, steppers: qa('.dt-stepper').every((s) => s.classList.contains('disabled')),
          editable: qa('[data-act="summary-edit"], [data-act="desc-edit"], [data-draft="cl:new"], [data-act="comment-new"], .dt-dropzone').length };
        press(document.body, 'e'); out.noEdit = !q('.dt-summary-input');
        D().cfg.project.myRole = role; D().render();
        return out;`);
      assert.deepEqual(r, { chip: true, status: true, pickers: 0, steppers: true, editable: 0, noEdit: true });
    },
  },
  {
    group: 'Issue detail',
    name: 'Missing issue and loading states, Korean/English switch',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        A.actions.openIssue('NOPE-99999'); await T.until(() => D().state === 'missing', 10000, 'missing');
        const missing = q('.dt-missing')?.textContent.trim();
        await ensure();
        const ko = { section: q('[data-section="fields"] .dt-section-toggle span').textContent, tab: q('[data-tab="history"]').textContent.trim() };
        await A.run('language'); await T.frames(3);
        const en = { section: q('[data-section="fields"] .dt-section-toggle span').textContent, tab: q('[data-tab="history"]').textContent.trim(), assignee: q('[data-field="assignee"] .dt-flabel').textContent.trim(), status: q('[data-act="status"]').title };
        await A.run('language'); await T.frames(3);
        return { missing, ko, en, back: q('[data-section="fields"] .dt-section-toggle span').textContent };`);
      expectOnly(app, /404|Not Found/i);
      assert.match(r.missing, /NOPE-99999.*찾을 수 없습니다/);
      assert.deepEqual(r.ko, { section: '세부 정보', tab: '기록' });
      assert.deepEqual(r.en, { section: 'Details', tab: 'History', assignee: 'Assignee', status: 'Change status' });
      assert.equal(r.back, '세부 정보');
    },
  },
  {
    group: 'Issue detail',
    name: 'Appearance: nothing clipped at the narrowest panel (300 px) and in a dark theme, two columns when wide',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        const settings = { rightWidth: A.state.settings.rightWidth, theme: A.state.settings.theme };
        const clipped = () => {
          const host = document.querySelector('#detail'); const box = host.getBoundingClientRect(); const bad = [];
          for (const el of host.querySelectorAll('.dt-root *')) {
            const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height || el.closest('.dt-lightbox')) continue;
            const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
            if (rc.right > box.right + 1 || rc.left < box.left - 1) bad.push((el.className?.baseVal ?? el.className) + ' ' + Math.round(rc.left) + '-' + Math.round(rc.right) + ' / ' + Math.round(box.left) + '-' + Math.round(box.right));
          }
          return { bad: bad.slice(0, 8), overflow: host.scrollWidth - host.clientWidth };
        };
        q('[data-act="tab"][data-tab="all"]').click(); await settle();
        A.actions.updateSettings({ rightWidth: 300 }); await T.frames(4);
        const narrow = { width: T.rect('#detail').w, ...clipped(), stacked: getComputedStyle(q('.dt-field')).gridTemplateColumns.split(' ').length };
        A.actions.updateSettings({ theme: 'onedark' }); await T.frames(4);
        const lum = (c) => { const m = c.replace(/^color\(srgb/, '').match(/[\d.]+/g).map(Number); const k = c.startsWith('color(') ? 1 : 255; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / k; };
        const dark = { mode: document.documentElement.dataset.mode, ...clipped(), text: lum(getComputedStyle(q('.dt-summary')).color), bg: lum(getComputedStyle(document.querySelector('#right-panel')).backgroundColor) };
        A.actions.updateSettings({ rightWidth: 720 }); await T.frames(4);
        const wide = { ...clipped(), cols: getComputedStyle(q('.dt-groups')).gridTemplateColumns.split(' ').length };
        A.actions.updateSettings(settings); await T.frames(3);
        q('[data-act="tab"][data-tab="comments"]').click(); await settle();
        return { narrow, dark, wide };`);
      assert.ok(r.narrow.width <= 300, `narrow panel ${r.narrow.width}`);
      assert.deepEqual(r.narrow.bad, [], 'nothing clipped at 300px');
      assert.ok(r.narrow.overflow <= 0, 'no horizontal scroll');
      assert.equal(r.narrow.stacked, 1, 'labels above values when narrow');
      assert.equal(r.dark.mode, 'dark');
      assert.deepEqual(r.dark.bad, []);
      assert.ok(r.dark.text - r.dark.bg > 0.4, `readable text on the dark panel (${r.dark.text} vs ${r.dark.bg})`);
      assert.deepEqual(r.wide.bad, []);
      assert.equal(r.wide.cols, 2);
    },
  },
  {
    group: 'Issue detail',
    name: 'Custom fields by issue type: hidden for other types (value kept), defaults, resolution icon chip',
    async run(app) {
      const r = await run(app, `
        const dt = await ensure();
        const cfg = dt.cfg;
        const story = cfg.types.find((x) => Number(x.level) === 0);
        const other = cfg.types.find((x) => Number(x.level) === 0 && x.id !== story.id);
        const f = await A.api.post('/projects/' + dt.projectId + '/fields', { name: 'E2E 유형 전용 ' + Date.now() % 100000, type: 'text', defaultValue: '기본 메모', issueTypeIds: [other.id] });
        const made = await A.api.createIssue({ projectId: dt.projectId, typeId: other.id, summary: 'E2E 유형 전용 필드' });
        D().configs.clear(); // this tab's own field.created event is not echoed back: drop the cached config
        A.actions.openIssue(made.id);
        await T.until(() => D()?.state === 'ready' && D().issueId === made.id, 20000, 'detail'); await settle();
        const rowShown = Boolean(q('.dt-field[data-field="custom:' + f.id + '"]'));
        const shownText = q('.dt-field[data-field="custom:' + f.id + '"] .dt-text')?.textContent ?? '';
        await A.api.updateIssue(made.id, { typeId: story.id, rev: made.rev });
        A.actions.openIssue(dt.id); await T.until(() => D()?.issueId === dt.id, 10000, 'other'); A.actions.openIssue(made.id);
        await T.until(() => D()?.state === 'ready' && D().issueId === made.id, 20000, 'detail again'); await settle();
        const hiddenAfter = !q('.dt-field[data-field="custom:' + f.id + '"]');
        const kept = (await A.api.issue(made.id)).custom[f.id];
        // resolved: the chip carries the resolution's icon
        const done = cfg.statuses.find((s) => s.category === 'done');
        await A.api.transition(made.id, { statusId: done.id });
        A.actions.openIssue(dt.id); await T.until(() => D()?.issueId === dt.id, 10000, 'other'); A.actions.openIssue(made.id);
        await T.until(() => D()?.state === 'ready' && D().issueId === made.id && q('.dt-chip.resolution'), 20000, 'resolved'); await settle();
        const chip = q('.dt-chip.resolution');
        const chipIcon = Boolean(chip.querySelector('.iconref')); const chipText = chip.textContent.trim();
        // leave the issue first: the panel would otherwise read the deleted one again (a 404 in the page)
        A.actions.openIssue(dt.id); await T.until(() => D()?.state === 'ready' && D().issueId === dt.id, 10000, 'back');
        await A.api.deleteIssue(made.id); await A.api.del('/projects/' + dt.projectId + '/fields/' + f.id);
        return { rowShown, shownText, hiddenAfter, kept, chipIcon, chipText };`);
      assert.ok(r.rowShown, 'the field shows for its type');
      assert.equal(r.shownText, '기본 메모', 'filled with its default');
      assert.ok(r.hiddenAfter, 'hidden once the issue has another type');
      assert.equal(r.kept, '기본 메모', 'the value stays stored');
      assert.ok(r.chipIcon, 'resolution chip with the resolution icon');
      assert.ok(r.chipText.length > 0);
    },
  },
  {
    group: 'Issue detail',
    name: 'Organised panel: field groups, empty fields hidden by default (toggle), section bar jumps, every control on one grid, icon row shows a name',
    async run(app) {
      const r = await run(app, String.raw`await ensure();
        await A.api.updateIssue(window.__dt.id, { icon: 'e:🔍', rev: (await issueNow()).rev });
        await D().reload(); D().showEmpty = false; D().render(); await settle();
        await T.until(async () => q('.dt-field[data-field="icon"] .dt-val')?.textContent.includes('돋보기'), 8000, 'icon name');
        const groups = qa('.dt-group').map((g) => g.dataset.group);
        const before = qa('.dt-field').length;
        const toggle = q('.dt-empty-toggle'); toggle.click(); await settle();
        const after = qa('.dt-field').length; const hiddenEmpty = after > before; const shownEmpty = after > before && qa('.dt-field').some((x) => x.querySelector('.dt-none, .dt-empty'));
        // one grid: label columns equal, control boxes share left edge, width and height
        const boxes = qa('.dt-groups .dt-group:first-child .dt-field:not(.wrap) .dt-fvalue > .dt-ctl').map((b) => b.getBoundingClientRect());
        const labels = qa('.dt-groups .dt-group:first-child .dt-flabel').map((l) => Math.round(l.getBoundingClientRect().width));
        const spread = (xs) => Math.max(...xs) - Math.min(...xs);
        const align = { left: spread(boxes.map((b) => b.left)), width: spread(boxes.map((b) => b.width)), height: spread(boxes.map((b) => b.height)), labels: spread(labels), n: boxes.length };
        const iconText = q('.dt-field[data-field="icon"]').textContent;
        q('.dt-sb-chip[data-jump="activity"]').click(); await T.sleep(500);
        const box = document.querySelector('.dt-host').getBoundingClientRect(); const act = q('[data-section="activity"]').getBoundingClientRect();
        D().showEmpty = true; D().render(); await settle();
        return { groups, hiddenEmpty, shownEmpty, align, iconText, jumped: act.top >= box.top && act.top < box.bottom - 40, scrolled: document.querySelector('.dt-host').scrollTop > 0 };`);
      for (const g of ['people', 'planning', 'dates', 'look']) assert.ok(r.groups.includes(g), `group ${g} (${r.groups})`); // an all-empty group (time here) hides with its fields
      assert.ok(r.hiddenEmpty, 'an empty field is hidden by default');
      assert.ok(r.shownEmpty, 'the toggle shows the empty fields');
      assert.ok(r.align.n >= 3, 'controls measured');
      assert.ok(r.align.left <= 1 && r.align.width <= 1 && r.align.height <= 1, `controls on one grid ${JSON.stringify(r.align)}`);
      assert.ok(r.align.labels <= 1, 'label column equal');
      assert.ok(!/e:🔍|b:/.test(r.iconText) && /돋보기/.test(r.iconText), `the icon row shows a name, not the ref (${r.iconText})`);
      assert.ok(r.jumped && r.scrolled, 'the section bar scrolls the section into view');
    },
  },
];
