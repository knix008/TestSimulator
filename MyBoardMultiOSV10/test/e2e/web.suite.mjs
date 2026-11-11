// Web E2E cases: the real shell in headless Edge (popups are frames). Each case starts from a known
// state (T.reset). Cases marked `desktop: true` also run in the desktop app (desktop.suite.mjs).
// The core may or may not be running: cases that need it check A.state.core and skip otherwise.
import assert from 'node:assert/strict';

export const cases = [
  {
    group: 'Start page',
    name: 'Card board: hero, start, database, recent, templates, samples and background cards over the moving background',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => document.querySelector('.start-board .start-card'), 8000, 'cards');
        const cards = [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.dataset.card);
        const canvas = document.querySelector('#start-page canvas.start-bg');
        return { cards, canvas: Boolean(canvas && canvas.width > 0), panels: ['#left-panel', '#right-panel', '#bottom-panel'].map((s) => T.rect(s)?.visible ?? false), templates: document.querySelectorAll('.start-card.templates .template-tile').length, samples: document.querySelectorAll('.start-card.samples .start-tile').length, actions: document.querySelectorAll('.start-card.actions .start-tile').length };`);
      for (const id of ['hero', 'actions', 'database', 'recent', 'templates', 'samples', 'background']) assert.ok(r.cards.includes(id), `card ${id}`);
      assert.ok(r.canvas, 'moving background canvas');
      assert.deepEqual(r.panels, [false, false, false], 'no side or bottom panels on the start page');
      assert.equal(r.templates, 4);
      assert.equal(r.samples, 3);
      assert.equal(r.actions, 10);
    },
  },
  {
    group: 'Start page',
    name: 'Database card: core status (connected, or "not connected to the core" + reconnect)',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => A.state.core.status !== 'connecting', 20000, 'core status');
        return { status: A.state.core.status, card: document.querySelector('.db-status')?.textContent.trim(), retry: Boolean(document.querySelector('.db-card [data-start="retry-core"]')), banner: Boolean(document.querySelector('.start-banner.danger')) };`);
      if (r.status === 'ready') { assert.ok(r.card); assert.ok(!r.banner); }
      else { assert.equal(r.status, 'error'); assert.ok(r.retry, 'retry button'); assert.ok(r.banner, 'clear "core not reachable" banner'); }
    },
  },
  {
    group: 'Start page',
    name: 'Card arrangement: auto-arrange restores the default layout without overlaps',
    async run(app) {
      const r = await app.run(`await T.reset(); document.querySelector('[data-start="arrange"]').click(); await T.frames(4);
        const rects = [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.getBoundingClientRect());
        let overlap = 0; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++; }
        return { overlap, saved: Boolean(A.state.settings.startLayout) };`);
      assert.equal(r.overlap, 0);
      assert.ok(r.saved);
    },
  },
  {
    group: 'Workspace',
    name: 'Project tree: the open project\'s arrow folds and unfolds it',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await T.frames(2);
        const pid = A.state.doc.project.id; const node = () => document.querySelector('[data-project-node="' + pid + '"]');
        const leaves = () => node().querySelectorAll('.nav-leaf').length;
        const open = leaves();
        node().querySelector('[data-nav-toggle]').click(); await T.frames(2);
        const folded = leaves(); const arrow = node().querySelector('[data-nav-toggle]').getAttribute('aria-expanded');
        const nodes = [...document.querySelectorAll('#left-panel .nav-project')]; const last = nodes[nodes.length - 1].getBoundingClientRect().bottom; const gap = document.querySelector('#left-panel > .left-split').getBoundingClientRect().top - last;
        node().querySelector('[data-nav-toggle]').click(); await T.frames(2);
        return { open, folded, arrow, gap, many: nodes.length, again: leaves() };`);
      assert.ok(r.open >= 4, 'open at first');
      assert.equal(r.folded, 0, 'folded: no leaves');
      assert.equal(r.arrow, 'false');
      if (r.many < 6) assert.ok(r.gap >= 0 && r.gap < 16, 'folded: the lower section starts right under the tree (gap ' + r.gap + ' px)');
      assert.equal(r.again, r.open, 'unfolded again');
    },
  },
  {
    group: 'Workspace',
    name: 'Layout: toolbar, sidebar (project tree), #workspace, #detail, bottom panel with 3 tabs, status bar',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await T.frames(3);
        return { left: T.rect('#left-panel'), ws: T.rect('#workspace'), detail: T.rect('#detail'), bottom: T.rect('#bottom-panel'), status: T.rect('#statusbar'), toolbar: T.rect('#toolbar'),
          tabs: [...document.querySelectorAll('[data-bottom-tab]')].map((b) => b.dataset.bottomTab), nav: document.querySelectorAll('.nav-leaf').length, views: document.querySelectorAll('#tabs .seg-toggle button').length };`);
      for (const key of ['left', 'ws', 'detail', 'bottom', 'status', 'toolbar']) assert.ok(r[key]?.visible, `${key} visible`);
      assert.ok(r.left.x < r.ws.x && r.ws.x < r.detail.x, 'sidebar | workspace | detail');
      assert.ok(r.bottom.y > r.ws.y, 'bottom panel under the workspace');
      assert.deepEqual(r.tabs, ['problems', 'activity', 'messages', 'info']);
      assert.ok(r.nav >= 4, 'board, backlog, reports, settings leaves');
      assert.equal(r.views, 4);
    },
  },
  {
    group: 'Workspace',
    name: 'View switching (board, backlog, reports, settings) and sidebar items',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const seen = [];
        for (const view of ['backlog', 'reports', 'projectSettings', 'board']) { await A.run('view:' + view); await T.frames(2); seen.push([A.state.doc.view, document.querySelector('.nav-leaf.active')?.textContent.trim() ?? '', document.querySelector('#tabs .seg-toggle .active') ? 1 : 0]); }
        return seen;`);
      assert.deepEqual(r.map((x) => x[0]), ['backlog', 'reports', 'projectSettings', 'board']);
      assert.ok(r.every((x) => x[1] && x[2] === 1));
    },
  },
  {
    group: 'Workspace',
    name: 'Collapsing panels: left and right become rails, bottom hides (saved in settings)',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true });
        await A.run('leftPanel'); await A.run('rightPanel'); await A.run('bottomPanel'); await T.frames(2);
        const folded = { leftRail: Boolean(document.querySelector('#left-panel .panel-rail')), rightRail: Boolean(document.querySelector('#right-panel .panel-rail')), bottom: document.querySelector('#bottom-panel').innerHTML === '', saved: [A.state.settings.showLeftPanel, A.state.settings.showRightPanel, A.state.settings.showBottomPanel] };
        await A.run('leftPanel'); await A.run('rightPanel'); await A.run('bottomPanel'); await T.frames(2);
        return { folded, back: Boolean(document.querySelector('#left-panel .nav-tree') && document.querySelector('#detail') && document.querySelector('#bottom-panel .problems-header')) };`);
      assert.deepEqual(r.folded, { leftRail: true, rightRail: true, bottom: true, saved: [false, false, false] });
      assert.ok(r.back);
    },
  },
  {
    group: 'Workspace',
    name: 'Clicking a board card opens the issue detail panel (practice board)',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const card = await T.until(() => document.querySelector('#workspace .mb-card'), 8000, 'card'); card.click(); await T.frames(2); return { id: A.state.selectedIssue, card: card.dataset.id, panel: Boolean(document.querySelector('#detail')) };`);
      assert.ok(r.id);
      assert.equal(r.id, r.card);
      assert.ok(r.panel);
    },
  },
  {
    group: 'Toolbar',
    name: 'Narrow window: left groups fold into », language, theme and settings always stay visible',
    async run(app) {
      await app.main.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 900, deviceScaleFactor: 1, mobile: false });
      try {
        const r = await app.run(`await T.reset({ workspace: true }); window.dispatchEvent(new Event('resize')); await T.frames(4);
          const more = document.querySelector('[data-toolbar-more]');
          return { more: more && !more.hidden, hidden: A.state.toolbarHidden?.length ?? 0, right: ['language', 'theme', 'settings'].map((id) => T.rect('#toolbar [data-command="' + id + '"]')?.visible) };`);
        assert.ok(r.more, '» shown');
        assert.ok(r.hidden > 0);
        assert.deepEqual(r.right, [true, true, true]);
      } finally {
        await app.main.send('Emulation.setDeviceMetricsOverride', { width: app.width, height: app.height, deviceScaleFactor: 1, mobile: false });
      }
    },
  },
  {
    group: 'Menus',
    name: 'Every menu bar menu opens as a popup menu (submenus included)',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const out = {};
        for (const name of Object.keys(A.menus.MENUS)) { A.app.openMenubarMenu(name); await T.popupReady('menu'); const d = T.popupDoc('menu'); out[name] = { items: d.querySelectorAll('.menu-item').length, subs: d.querySelectorAll('.menu-item.has-sub').length }; await A.popups.hideMenu(); await T.frames(2); }
        return out;`);
      for (const [name, m] of Object.entries(r)) assert.ok(m.items >= 3, `${name}: ${m.items} items`);
      assert.ok(r.view.subs >= 2, 'view has submenus');
    },
  },
  {
    group: 'Popups',
    name: 'Settings: every tab (general, start page, theme, font, background, board, database, recent, shortcuts)',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); A.popups.open('settings', { tab: 'general' }); await T.popupReady('settings');
        const d = () => T.popupDoc('settings'); const tabs = [...d().querySelectorAll('.tab')].map((t) => t.dataset.value); const seen = {};
        for (const tab of tabs) { d().querySelector('.tab[data-value="' + tab + '"]').click(); await T.until(() => d().querySelector('.settings-' + tab), 5000, tab); seen[tab] = d().querySelector('.popup-body').textContent.trim().length; }
        await A.popups.close('settings'); return { tabs, seen };`);
      assert.deepEqual(r.tabs, ['general', 'start', 'appearance', 'font', 'background', 'board', 'database', 'recent', 'shortcuts']);
      for (const [tab, length] of Object.entries(r.seen)) assert.ok(length > 10, `${tab} has content`);
    },
  },
  {
    group: 'Popups',
    name: 'Icon picker: built-in icon search (ko/en) and categories, emoji, letters, colour → IconRef',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); const result = A.actions.pickIcon('b:bug'); await T.popupReady('iconpicker'); const d = () => T.popupDoc('iconpicker');
        await T.until(() => d().querySelector('.ip-grid .ip-cell'), 8000, 'grid');
        const all = d().querySelectorAll('.ip-grid .ip-cell').length;
        const search = d().querySelector('[data-ip-search="builtin"]'); search.value = '로켓'; search.dispatchEvent(new Event('input', { bubbles: true }));
        await T.until(() => d().querySelectorAll('.ip-grid .ip-cell').length < all, 3000, 'search');
        const found = [...d().querySelectorAll('.ip-grid .ip-cell')].map((c) => c.dataset.ipRef);
        d().querySelector('[data-ip-tab="emoji"]').click(); await T.until(() => d().querySelector('.ip-cell.emoji'), 3000, 'emoji');
        const emoji = d().querySelectorAll('.ip-cell.emoji').length;
        d().querySelector('[data-ip-tab="builtin"]').click(); await T.frames(2);
        d().querySelector('.ip-grid [data-ip-ref="b:rocket"]').click();
        d().querySelector('[data-ip-color="#e5484d"]').click();
        d().querySelector('[data-ip-act="apply"]').click();
        return { all, found, emoji, ref: await result };`);
      assert.ok(r.all >= 300, `${r.all} built-in icons`);
      assert.ok(r.found.includes('b:rocket'), 'Korean search finds the rocket');
      assert.ok(r.emoji >= 600);
      assert.equal(r.ref, 'b:rocket#e5484d');
    },
  },
  {
    group: 'Popups',
    name: 'Theme drop-down: one menu level, dark and light themes side by side (all visible, with swatches); choosing applies at once',
    async run(app) {
      const r = await app.run(`await T.reset(); const before = A.state.settings.theme; A.run('themeMenu'); await T.popupReady('menu'); const d = T.popupDoc('menu');
        const top = [...d.querySelectorAll('.popup-menu[data-level="0"] .menu-item')].map((b) => b.dataset.id);
        const cols = [...d.querySelectorAll('.menu-column')].map((c) => ({ n: c.querySelectorAll('.menu-item').length, swatches: c.querySelectorAll('.menu-swatch').length }));
        const target = [...d.querySelectorAll('.menu-column')][0].querySelectorAll('.menu-item')[1].dataset.id;
        d.querySelector('.menu-item[data-id="' + target + '"]').click(); const id = target.slice('custom:theme:'.length);
        await T.until(() => A.state.settings.theme === id, 5000, 'theme');
        const mode = document.documentElement.dataset.mode; A.actions.updateSettings({ theme: before });
        return { top, cols, mode, submenus: d.querySelectorAll('.has-sub').length, levels: d.querySelectorAll('.popup-menu').length, noWindow: !document.querySelector('.web-popup-theme') };`);
      for (const id of ['custom:theme:system', 'custom:theme:custom', 'custom:theme-edit', 'custom:theme-random']) assert.ok(r.top.includes(id), `menu item ${id}`);
      assert.deepEqual(r.cols.map((c) => c.n >= 20 && c.swatches === c.n), [true, true], 'dark and light columns, every theme with its swatch');
      assert.equal(r.submenus, 0, 'no submenus');
      assert.equal(r.levels, 1, 'one level');
      assert.equal(r.mode, 'dark', 'a dark theme applied');
      assert.ok(r.noWindow, 'no theme window');
    },
  },
  {
    group: 'Popups',
    name: 'About, welcome, confirm, error and progress popups',
    async run(app) {
      const r = await app.run(`await T.reset(); const out = {};
        A.popups.open('about'); await T.popupReady('about'); out.about = T.popupDoc('about').querySelector('.about-name').textContent; await A.popups.close('about');
        A.popups.open('welcome', {}); await T.popupReady('welcome'); out.welcome = T.popupDoc('welcome').querySelectorAll('.welcome-list li').length; await A.popups.close('welcome');
        const ask = A.app.ask({ title: 'Q', message: 'M', buttons: [{ id: 'no', label: 'No' }, { id: 'yes', label: 'Yes', primary: true }] }); await T.popupReady('confirm'); T.popupDoc('confirm').querySelector('.button.primary').click(); out.confirm = await ask;
        const job = A.actions.withProgress('progress.import', 'x.csv', async (op, report) => { report({ fraction: 0.5, text: 'half' }); await T.sleep(700); return 7; }, { delay: 0 }); out.progress = await job;
        return out;`);
      assert.match(r.about, /MyBoard/);
      assert.equal(r.welcome, 3);
      assert.equal(r.confirm, 'yes');
      assert.equal(r.progress, 7);
    },
  },
  {
    group: 'Appearance',
    name: 'Language switch (Korean ↔ English): menus and start page texts change',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); const ko = document.querySelector('[data-menu="file"]').textContent.trim();
        await A.run('language'); await T.frames(3); const en = document.querySelector('[data-menu="file"]').textContent.trim(); const hero = document.querySelector('.start-hero p').textContent;
        await A.run('language'); await T.frames(2); return { ko, en, hero, lang: document.documentElement.lang };`);
      assert.notEqual(r.ko, r.en);
      assert.equal(r.en, 'File');
      assert.match(r.hero, /Kanban/);
      assert.equal(r.lang, 'ko');
    },
  },
  {
    group: 'Undo',
    name: 'Undo/redo plumbing: record → toolbar enabled → undo → redo',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const log = [];
        A.history.record({ label: 'test step', undo: async () => log.push('undo'), redo: async () => log.push('redo') }); await T.frames(1);
        const enabled = !document.querySelector('#toolbar [data-command="undo"]').disabled;
        await A.actions.undo(); await A.actions.redo(); A.history.clear(); return { enabled, log };`);
      assert.ok(r.enabled);
      assert.deepEqual(r.log, ['undo', 'redo']);
    },
  },
  {
    group: 'Realtime',
    name: 'WsChannel: hello and subscribe, reconnect and resubscribe after a drop, own events ignored',
    async run(app) {
      const r = await app.run(`const { WsChannel } = await import('/src/live/channel.js');
        const sockets = []; class Fake { constructor(url) { this.url = url; this.sent = []; this.readyState = 0; sockets.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 5); } send(t) { this.sent.push(JSON.parse(t)); } close() { this.readyState = 3; this.onclose?.(); } }
        const ch = new WsChannel({ url: 'ws://x/api/live', clientId: 'me', WebSocketImpl: Fake, pingInterval: 100000 }); const events = []; const states = [];
        ch.on('event', (e) => events.push(e.id)); ch.on('state', (s) => states.push(s.state + (s.resync ? '+resync' : '')));
        ch.subscribe(['board:1']); ch.connect(); await T.until(() => ch.state === 'open', 2000, 'open');
        sockets[0].onmessage({ data: JSON.stringify({ op: 'event', event: { id: 'a', client: 'other' } }) });
        sockets[0].onmessage({ data: JSON.stringify({ op: 'event', event: { id: 'b', client: 'me' } }) });
        sockets[0].close(); await T.until(() => sockets.length === 2 && ch.state === 'open', 5000, 'reconnect');
        ch.close(); return { first: sockets[0].sent.map((m) => m.op), second: sockets[1].sent.map((m) => m.op + (m.topics ? ':' + m.topics.join(',') : '')), events, states };`);
      assert.deepEqual(r.first, ['hello', 'sub']);
      assert.deepEqual(r.second, ['hello', 'sub:board:1']);
      assert.deepEqual(r.events, ['a']);
      assert.ok(r.states.includes('open+resync'));
    },
  },
  {
    group: 'API',
    name: 'API client: X-Client-Id, error JSON → code/status/details, connection failure → unreachable',
    async run(app) {
      const r = await app.run(`const { ApiClient } = await import('/src/api/client.js'); const seen = [];
        const fetchImpl = async (url, init) => { seen.push([url, init.headers['X-Client-Id'] ? 1 : 0, init.headers.Authorization ?? '']); if (url.includes('/boom')) return new Response(JSON.stringify({ error: { code: 'conflict', message: 'changed', details: { current: { rev: 3 } } } }), { status: 409, headers: { 'content-type': 'application/json' } }); throw new TypeError('Failed to fetch'); };
        const api = new ApiClient({ base: 'http://h/api', token: 'tok', fetchImpl });
        const a = await api.get('/boom').catch((e) => ({ code: e.code, status: e.status, rev: e.details?.current?.rev }));
        const b = await api.info().catch((e) => ({ code: e.code, status: e.status }));
        return { a, b, seen };`);
      assert.deepEqual(r.a, { code: 'conflict', status: 409, rev: 3 });
      assert.deepEqual(r.b, { code: 'unreachable', status: 0 });
      assert.deepEqual(r.seen[0], ['http://h/api/boom', 1, 'Bearer tok']);
    },
  },
];

/** Every menu command that needs no OS dialog runs without an error popup (demo workspace). */
export async function commandCases(app) {
  const ids = await app.run(`return Object.keys(A.commands);`);
  const SKIP = new Set(['exit', 'import', 'exportProject', 'backgroundImage', 'logout', 'tutorial', 'userGuide', 'tutorialDoc', 'newProject', 'newFromTemplate', 'openSample', 'open', 'database', 'iconPicker', 'reconnect', 'refresh', 'closeProject', 'exitProject', 'startPage']);
  return ids.filter((id) => !SKIP.has(id)).map((id) => ({
    group: 'Commands',
    name: id,
    async run(a) {
      const r = await a.run(`await T.reset({ workspace: true }); const settings = JSON.parse(JSON.stringify(A.state.settings));
        if (!A.menus.enabled(${JSON.stringify(id)})) return { skipped: 'disabled here' };
        const p = A.run(${JSON.stringify(id)}); await Promise.race([p, T.sleep(1500)]);
        const kinds = [...document.querySelectorAll('.web-popup')].map((f) => f.dataset.kind);
        await T.reset({ workspace: true }); A.actions.updateSettings(settings);
        return { error: kinds.includes('error') };`);
      if (r?.skipped) return { skipped: r.skipped };
      assert.ok(!r.error, 'no error popup');
      return undefined;
    },
  }));
}

/** Installed in the page with the helpers (nothing extra needed for MyBoard's command cases). */
export const COMMAND_HELPER = '1';
