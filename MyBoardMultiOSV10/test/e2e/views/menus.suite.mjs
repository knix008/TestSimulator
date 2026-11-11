// Context menus everywhere are the app's own menu popup with an icon on every item (app.js contextMenu): a
// right-click on a view that has no menu of its own (backlog, reports, project settings) never shows the
// browser's menu. Run by scripts/test.mjs (web stage).
import assert from 'node:assert/strict';

export const cases = [
  {
    group: 'Menus',
    name: 'Right-click in the backlog, reports and project settings: the app menu, every item with an icon',
    async run(app) {
      const r = await app.run(String.raw`await T.until(() => A.state.core.status === 'ready', 30000, 'core');
        await T.reset();
        let projects = await A.api.projects();
        if (!projects.some((p) => p.key.startsWith('SHOP'))) { await A.api.createSamples('ko'); await A.actions.refreshProjects(); projects = await A.api.projects(); }
        const shop = projects.find((p) => p.key.startsWith('SHOP'));
        const out = {};
        for (const view of ['backlog', 'reports', 'projectSettings']) {
          await A.actions.openTarget('project', shop.id, { view, quiet: true }); await T.sleep(800);
          const target = document.querySelector('#workspace').querySelector('h2, .rp-head, .bl-list, .ps-head') ?? document.querySelector('#workspace');
          const b = target.getBoundingClientRect();
          const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 20, clientY: b.top + 10 });
          target.dispatchEvent(event);
          await T.popupReady('menu'); await T.sleep(150);
          const d = T.popupDoc('menu');
          const items = [...d.querySelectorAll('.menu-item')];
          out[view] = { prevented: event.defaultPrevented, n: items.length, icons: items.every((i) => i.querySelector('.menu-icon svg, .menu-icon .theme-swatch')) };
          await A.popups.closeAll?.(); await T.sleep(100);
        }
        return out;`);
      for (const view of ['backlog', 'reports', 'projectSettings']) {
        assert.ok(r[view].prevented, `${view}: no browser menu`);
        assert.ok(r[view].n >= 5, `${view}: the app menu opened (${r[view].n} items)`);
        assert.ok(r[view].icons, `${view}: every item has an icon`);
      }
    },
  },
  {
    group: 'Reports',
    name: 'Reference column chip: a menu of the board columns (rightmost by default) → the choice is saved in the board settings and the report follows',
    async run(app) {
      const r = await app.run(String.raw`await T.until(() => A.state.core.status === 'ready', 30000, 'core');
        await T.reset();
        let projects = await A.api.projects();
        if (!projects.some((p) => p.key.startsWith('SHOP'))) { await A.api.createSamples('ko'); await A.actions.refreshProjects(); projects = await A.api.projects(); }
        const shop = projects.find((p) => p.key.startsWith('SHOP'));
        await A.actions.openTarget('project', shop.id, { view: 'reports', quiet: true });
        const rv = await T.until(() => window.__myboardReports?.state === 'ready' && window.__myboardReports, 20000, 'reports');
        document.querySelector('.left-view-body [data-vs-act="report"][data-vs-value="throughput"]').click(); await T.until(() => rv.prefs.report === 'throughput' && rv.state === 'ready', 15000, 'throughput');
        const cols = rv.columns; const middle = cols[Math.floor(cols.length / 2)];
        document.querySelector('[data-act="ref-column"]').click(); await T.popupReady('menu');
        const d = T.popupDoc('menu'); const n = d.querySelectorAll('.menu-item').length;
        d.querySelector('.menu-item[data-id="custom:view-menu:' + middle.id + '"]').click();
        await T.until(async () => (await A.api.board(rv.board.id)).settings?.reportColumnId === middle.id, 8000, 'saved');
        await T.until(() => document.querySelector('[data-act="ref-column"]')?.textContent.includes(middle.name), 8000, 'chip');
        const data = await A.api.report('throughput', rv.query('throughput'));
        await rv.setReferenceColumn(null);
        return { n, cols: cols.length, ref: data.referenceColumn.id === middle.id, back: (await A.api.board(rv.board.id)).settings?.reportColumnId ?? null };`);
      assert.equal(r.n, r.cols + 1, 'rightmost (default) + every column');
      assert.ok(r.ref, 'the report uses the chosen column');
      assert.equal(r.back, null, 'reset to the rightmost');
    },
  },
];
