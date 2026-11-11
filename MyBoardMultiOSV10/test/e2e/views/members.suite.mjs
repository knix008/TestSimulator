// Members (views/settings/sections/members.js): "Create member" makes a person with just a name (a user without a
// password, so no sign-in appears) and adds them to the project; they can be assigned issues at once — on the board
// (the detail panel's assignee list) and through the API. Run by scripts/test.mjs (web stage).
import assert from 'node:assert/strict';

export const cases = [
  {
    group: 'Project settings',
    name: 'Create member by name → member of the project with the role → in the assignee list → an issue assigned to them',
    async run(app) {
      const r = await app.run(String.raw`await T.until(() => A.state.core.status === 'ready', 30000, 'core');
        await T.reset();
        let projects = await A.api.projects();
        if (!projects.some((p) => p.key.startsWith('SHOP'))) { await A.api.createSamples('ko'); await A.actions.refreshProjects(); projects = await A.api.projects(); }
        const shop = projects.find((p) => p.key.startsWith('SHOP'));
        await A.actions.openTarget('project', shop.id, { view: 'projectSettings', quiet: true });
        const V = await T.until(() => window.__myboardSettings?.data && window.__myboardSettings, 20000, 'settings');
        V.go('members'); await T.until(() => document.querySelector('[data-new-person]'), 8000, 'members');
        const name = 'E2E 구성원 ' + (Date.now() % 10000);
        const input = document.querySelector('[data-new-person]'); input.value = name; input.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-act="create-member"]').click();
        await T.until(async () => (await A.api.get('/projects/' + shop.id + '/members')).some((m) => m.displayName === name), 10000, 'member');
        const members = await A.api.get('/projects/' + shop.id + '/members');
        const member = members.find((m) => m.displayName === name);
        const needsLogin = (await A.api.info()).needsLogin;
        // assignable: on the board's user list, and an issue takes them as assignee
        const board = (await A.api.boards({ projectId: shop.id }))[0] ?? (await A.api.boards({ projectId: shop.id })).items?.[0];
        const data = await A.api.boardData(board.id);
        const listed = data.users.some((u) => u.id === member.userId);
        const issue = data.issues[0];
        const saved = await A.api.updateIssue(issue.id, { assigneeId: member.userId, rev: issue.rev });
        return { role: member.role, listed, assigned: (saved.issue ?? saved).assigneeId === member.userId, needsLogin, row: Boolean([...document.querySelectorAll('.ps-user b')].find((b) => b.textContent === name)) };`);
      assert.equal(r.role, 'member', 'added with the chosen role');
      assert.ok(r.row, 'shown in the members table');
      assert.ok(r.listed, 'in the board\'s assignee list');
      assert.ok(r.assigned, 'an issue can be assigned to them');
      assert.equal(r.needsLogin, false, 'a person without a password does not bring a sign-in');
    },
  },
];
