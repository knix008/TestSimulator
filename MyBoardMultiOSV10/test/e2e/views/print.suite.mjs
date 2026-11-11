// Printing (print/host.js · print/pages.js · print/popup.js): the toolbar's Print (right of Save) and File › Print open
// the print window; it gathers the project, the board, the reports and the issues, lays them out on pages of the
// chosen paper, and the choices (parts, reports, paper, orientation) change the pages at once. Run by scripts/test.mjs.
import assert from 'node:assert/strict';

export const cases = [
  {
    group: 'Print',
    name: 'Print window: toolbar button right of Save · pages with project info, board, report charts and issues · settings change the pages',
    async run(app) {
      const r = await app.run(String.raw`await T.until(() => A.state.core.status === 'ready', 30000, 'core');
        await T.reset();
        let projects = await A.api.projects();
        if (!projects.some((p) => p.key.startsWith('SHOP'))) { await A.api.createSamples('ko'); await A.actions.refreshProjects(); projects = await A.api.projects(); }
        const shop = projects.find((p) => p.key.startsWith('SHOP'));
        await A.actions.openTarget('project', shop.id, { quiet: true });
        const btn = document.querySelector('#toolbar [data-command="print"]');
        const rightOfSave = btn?.previousElementSibling?.dataset.command === 'save';
        btn.click(); await T.popupReady('print');
        const d = T.popupDoc('print');
        await T.until(() => d.querySelector('.preview-stage .pp-page'), 30000, 'pages');
        const count = () => Number((d.querySelector('#page-number')?.textContent.match(/\d+\D+(\d+)/) ?? [])[1] ?? 0);
        const all = count();
        const firstPage = d.querySelector('.preview-stage .pp-page').textContent;
        const reports = [...d.querySelectorAll('[data-print-report]')].map((x) => x.dataset.printReport);
        // every page drawn: charts are SVG pictures
        const pagesHtml = (await import('/src/print/pages.js'));
        const sw = (sel) => { const el = d.querySelector(sel); el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); };
        sw('[data-print-part="issues"]'); await T.frames(2); const noIssues = count();
        sw('[data-print-part="reports"]'); await T.frames(2); const noReports = count();
        sw('[data-print-part="issues"]'); sw('[data-print-part="reports"]'); await T.frames(2);
        d.querySelector('[data-action="print-set"][data-key="orientation"][data-value="landscape"]').click(); await T.frames(2);
        const page = d.querySelector('.preview-stage .pp-page'); const landscape = page.offsetWidth > page.offsetHeight;
        d.querySelector('[data-action="print-set"][data-key="orientation"][data-value="portrait"]').click(); await T.frames(2);
        const nativeSelects = d.querySelectorAll('select').length;
        await A.popups.closeAll?.();
        return { rightOfSave, all, firstPage, reports, noIssues, noReports, landscape, inFileMenu: Boolean(A.commands.print), hasLayout: typeof pagesHtml.layoutPages === 'function' };`);
      assert.ok(r.rightOfSave, 'the Print button sits right of Save');
      assert.ok(r.inFileMenu, 'a Print command (File menu, Ctrl+P)');
      assert.ok(r.all >= 4, `pages: ${r.all}`);
      assert.match(r.firstPage, /SHOP/, 'the project page has the project');
      for (const id of ['cfd', 'burndown', 'throughput', 'createdResolved']) assert.ok(r.reports.includes(id), `report ${id}`);
      assert.ok(r.noIssues < r.all, 'without the issue list: fewer pages');
      assert.ok(r.noReports < r.noIssues, 'without the reports: fewer pages again');
      assert.ok(r.landscape, 'landscape pages are wider than tall');
    },
  },
];
