// Deleting a project: from the project's context menu and the File menu, always after a confirmation; Undo
// brings it back. Run by scripts/test.mjs (web stage).
import assert from 'node:assert/strict';

export const cases = [
  {
    group: 'Projects',
    name: 'Delete project: context menu entry, Cancel keeps it, Delete removes it, Undo brings it back',
    async run(app) {
      const r = await app.run(String.raw`await T.until(() => A.state.core.status === 'ready', 30000, 'core');
        await T.reset();
        const key = 'DEL' + (Date.now() % 1000);
        const made = await A.api.createProject({ key, name: 'Delete me', template: 'simple' });
        await A.api.createIssue?.({ projectId: made.id, summary: 'Survives undo' }).catch(() => null);
        await A.actions.refreshProjects();
        await A.actions.openTarget('project', made.id, { quiet: true }); await T.sleep(500);
        const has = async () => (await A.api.projects()).some((p) => p.key === key);
        const answer = async (choice) => { await T.popupReady('confirm'); const d = T.popupDoc('confirm'); const text = d.body.textContent; d.querySelector('[data-action="choice"][data-value="' + choice + '"]').click(); return text; };
        // the project's context menu has it, with its icon
        const node = document.querySelector('[data-project-node="' + made.id + '"] .nav-project-name');
        const b = node.getBoundingClientRect();
        node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 10, clientY: b.top + 5 }));
        await T.popupReady('menu'); await T.sleep(100);
        const item = T.popupDoc('menu').querySelector('.menu-item[data-id="custom:delete"]');
        const inMenu = { there: Boolean(item), icon: Boolean(item?.querySelector('.menu-icon svg')), danger: item?.classList.contains('danger') };
        item.click();
        const askText = await answer('cancel');
        await T.sleep(300);
        const kept = await has();
        // the File menu's command
        const deleting = A.run('deleteProject');
        await answer('delete'); await deleting; await T.sleep(300);
        const gone = !(await has());
        const closed = A.state.doc?.project?.id !== made.id; const others = A.state.projects.length; const nextOpen = Boolean(A.state.doc?.project) && !A.state.showStart;
        const inTree = A.state.projects.some((p) => p.id === made.id);
        await A.actions.undo(); await T.sleep(500);
        const back = await has();
        const again = (await A.api.projects()).find((p) => p.key === key);
        if (again) await A.api.deleteProject(again.id);
        await A.actions.refreshProjects();
        return { inMenu, askText, kept, gone, closed, inTree, back, others, nextOpen, fileMenu: A.menus.MENUS.file.includes('deleteProject') };`);
      assert.deepEqual(r.inMenu, { there: true, icon: true, danger: true }, 'context menu: Delete project with its icon, in red');
      assert.match(r.askText, /Delete me/, 'the confirmation names the project');
      assert.ok(r.kept, 'Cancel keeps the project');
      assert.ok(r.gone, 'Delete removes it');
      assert.ok(r.closed && !r.inTree, 'closed and gone from the tree ' + JSON.stringify([r.closed, r.inTree]));
      if (r.others > 0) assert.ok(r.nextOpen, 'another project opens (not the start page)');
      assert.ok(r.back, 'Undo brings it back');
      assert.ok(r.fileMenu, 'File menu has Delete project');
    },
  },
];

cases.push({
  group: 'Bottom panel',
  name: 'Problems tab: first tab, finds an overdue issue and an over-limit column, click opens the issue, counts in the header',
  async run(app) {
    const r = await app.run(String.raw`await T.until(() => A.state.core.status === 'ready', 30000, 'core');
      await T.reset();
      const key = 'PRB' + (Date.now() % 1000);
      const made = await A.api.createProject({ key, name: 'Problems', template: 'simple' });
      const data0 = await A.api.boardData(made.boardId);
      const first = data0.columns[0];
      const late = await A.api.post('/issues', { projectId: made.id, summary: 'Late one', typeId: data0.types[0].id, dueDate: '2020-01-02' });
      await A.api.patch('/boards/' + made.boardId + '/columns/' + first.id, { wipMax: 0, rev: first.rev }).catch((e) => null);
      await A.actions.refreshProjects();
      await A.actions.openTarget('project', made.id, { quiet: true }); await T.sleep(400);
      if (!A.state.settings.showBottomPanel) A.actions.updateSettings({ showBottomPanel: true });
      A.run('showProblems');
      await T.until(() => A.state.problems.boardId === made.boardId && !A.state.problems.loading && A.state.problems.list.length, 10000, 'problems');
      await T.frames(2);
      const tabs = [...document.querySelectorAll('[data-bottom-tab]')].map((b) => b.dataset.bottomTab);
      const rows = [...document.querySelectorAll('#bottom-panel .problems-row')];
      const kinds = A.state.problems.list.map((p) => p.kind);
      const lateRow = rows.find((row) => row.textContent.includes(late.key));
      lateRow?.click(); await T.sleep(300);
      const opened = A.state.selectedIssue === late.id;
      const counts = [...document.querySelectorAll('#bottom-panel .problems-chip')].map((c) => c.textContent.trim());
      await A.actions.closeProject?.();
      await A.api.deleteProject(made.id); await A.actions.refreshProjects();
      return { tabs, kinds, rows: rows.length, lateRow: Boolean(lateRow), opened, sel: [A.state.selectedIssue, late.id, late.key], counts };`);
    assert.equal(r.tabs[0], 'problems', 'Problems is the first tab');
    assert.ok(r.kinds.includes('overdue'), `overdue found (${r.kinds})`);
    assert.ok(r.kinds.includes('wipOver'), `over-limit column found (${r.kinds})`);
    assert.ok(r.lateRow && r.opened, 'the overdue row opens its issue ' + JSON.stringify([r.lateRow, r.opened, r.sel]));
    assert.equal(r.counts.length, 3, 'error / warning / info counts');
  },
});
