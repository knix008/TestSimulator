// E2E: a copied issue link (`…#issue=KEY`, views/board/menu.js) opens that issue's board and its detail panel
// (app.js openIssueLink, on start and on hashchange). Run by scripts/test.mjs (web stage).
import assert from 'node:assert/strict';

export const cases = [
  {
    group: 'Issue links',
    name: `#issue=KEY address: opens that project's board and the issue detail even from the start page, and clears the hash`,
    async run(app) {
      const r = await app.run(String.raw`await T.until(() => A.state.core.status === 'ready', 30000, 'core');
        await T.reset();
        let projects = await A.api.projects();
        if (!projects.some((p) => p.key.startsWith('SHOP'))) { await A.api.createSamples('ko'); await A.actions.refreshProjects(); projects = await A.api.projects(); }
        const shop = projects.find((p) => p.key.startsWith('SHOP'));
        const found = await A.api.issues({ jql: 'project = "' + shop.key + '" ORDER BY key ASC', limit: 1 });
        const issue = found.items[0];
        A.actions.showStartPage(true);
        await T.frames(2);
        location.hash = 'issue=' + encodeURIComponent(issue.key);
        await T.until(() => A.state.selectedIssue === issue.id && !A.state.showStart && A.state.doc?.project?.id === shop.id, 20000, 'issue opened');
        await T.until(() => window.__myboardDetail?.state === 'ready' && window.__myboardDetail.issueId === issue.id, 20000, 'detail ready');
        return { key: issue.key, shown: document.querySelector('#detail .dt-key')?.textContent.trim(), hash: location.hash, view: A.state.doc.view };`);
      assert.equal(r.shown, r.key);
      assert.equal(r.hash, '', 'the hash is used once');
      assert.equal(r.view, 'board');
    },
  },
];
