// Web E2E cases: the real shell in headless Edge (popups are frames). Each case starts from a known
// state (T.reset). Cases marked `desktop: true` also run in the desktop app (desktop.suite.mjs).
// The core may or may not be running: cases that need it check A.state.core and skip otherwise.
import assert from 'node:assert/strict';

export const cases = [
  {
    group: '시작 화면',
    name: '카드 보드: 영웅·시작·데이터베이스·최근·템플릿·샘플·배경 카드, 움직이는 배경',
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
    group: '시작 화면',
    name: '데이터베이스 카드: 코어 상태 (연결됨 또는 "코어에 연결 안 됨" + 다시 연결)',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => A.state.core.status !== 'connecting', 20000, 'core status');
        return { status: A.state.core.status, card: document.querySelector('.db-status')?.textContent.trim(), retry: Boolean(document.querySelector('.db-card [data-start="retry-core"]')), banner: Boolean(document.querySelector('.start-banner.danger')) };`);
      if (r.status === 'ready') { assert.ok(r.card); assert.ok(!r.banner); }
      else { assert.equal(r.status, 'error'); assert.ok(r.retry, 'retry button'); assert.ok(r.banner, 'clear "core not reachable" banner'); }
    },
  },
  {
    group: '시작 화면',
    name: '카드 정렬: 다시 배치하면 기본 배치, 겹침 없음',
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
    group: '작업 화면',
    name: '레이아웃: 툴바 · 사이드바(프로젝트 트리) · #workspace · #detail · 하단 패널 3탭 · 상태 표시줄',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await T.frames(3);
        return { left: T.rect('#left-panel'), ws: T.rect('#workspace'), detail: T.rect('#detail'), bottom: T.rect('#bottom-panel'), status: T.rect('#statusbar'), toolbar: T.rect('#toolbar'),
          tabs: [...document.querySelectorAll('[data-bottom-tab]')].map((b) => b.dataset.bottomTab), nav: document.querySelectorAll('.nav-leaf').length, views: document.querySelectorAll('#tabs .seg-toggle button').length };`);
      for (const key of ['left', 'ws', 'detail', 'bottom', 'status', 'toolbar']) assert.ok(r[key]?.visible, `${key} visible`);
      assert.ok(r.left.x < r.ws.x && r.ws.x < r.detail.x, 'sidebar | workspace | detail');
      assert.ok(r.bottom.y > r.ws.y, 'bottom panel under the workspace');
      assert.deepEqual(r.tabs, ['activity', 'messages', 'info']);
      assert.ok(r.nav >= 4, 'board, backlog, reports, settings leaves');
      assert.equal(r.views, 4);
    },
  },
  {
    group: '작업 화면',
    name: '보기 전환 (보드·백로그·보고서·설정) 과 사이드바 항목',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const seen = [];
        for (const view of ['backlog', 'reports', 'projectSettings', 'board']) { await A.run('view:' + view); await T.frames(2); seen.push([A.state.doc.view, document.querySelector('.nav-leaf.active')?.textContent.trim() ?? '', document.querySelector('#tabs .seg-toggle .active') ? 1 : 0]); }
        return seen;`);
      assert.deepEqual(r.map((x) => x[0]), ['backlog', 'reports', 'projectSettings', 'board']);
      assert.ok(r.every((x) => x[1] && x[2] === 1));
    },
  },
  {
    group: '작업 화면',
    name: '패널 접기/펴기: 왼쪽·오른쪽은 레일, 하단은 숨김 (설정에 저장)',
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
    group: '작업 화면',
    name: '보드의 카드를 누르면 이슈 상세 패널에 열림 (연습용 보드)',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const card = await T.until(() => document.querySelector('#workspace .mb-card'), 8000, 'card'); card.click(); await T.frames(2); return { id: A.state.selectedIssue, card: card.dataset.id, panel: Boolean(document.querySelector('#detail')) };`);
      assert.ok(r.id);
      assert.equal(r.id, r.card);
      assert.ok(r.panel);
    },
  },
  {
    group: '툴바',
    name: '좁은 창: 왼쪽 그룹이 » 로 접히고 언어·테마·설정은 항상 보임',
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
    group: '메뉴',
    name: '메뉴 표시줄의 모든 메뉴가 팝업 메뉴로 열림 (하위 메뉴 포함)',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const out = {};
        for (const name of Object.keys(A.menus.MENUS)) { A.app.openMenubarMenu(name); await T.popupReady('menu'); const d = T.popupDoc('menu'); out[name] = { items: d.querySelectorAll('.menu-item').length, subs: d.querySelectorAll('.menu-item.has-sub').length }; await A.popups.hideMenu(); await T.frames(2); }
        return out;`);
      for (const [name, m] of Object.entries(r)) assert.ok(m.items >= 3, `${name}: ${m.items} items`);
      assert.ok(r.view.subs >= 2, 'view has submenus');
    },
  },
  {
    group: '팝업',
    name: '설정: 모든 탭 (일반·시작 화면·테마·글꼴·배경·보드·데이터베이스·최근·단축키)',
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
    group: '팝업',
    name: '아이콘 고르기: 기본 아이콘 검색(한/영)·분류, 이모지, 글자, 색 → IconRef',
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
    group: '팝업',
    name: '테마 고르기: 어두운/밝은 목록에서 고르면 바로 적용',
    async run(app) {
      const r = await app.run(`await T.reset(); const before = A.state.settings.theme; A.run('themeMenu'); await T.popupReady('theme'); const d = T.popupDoc('theme');
        const items = [...d.querySelectorAll('[data-pick-theme]')].map((b) => b.dataset.pickTheme); const target = items.find((id) => id !== before && id !== 'system' && id !== 'custom');
        d.querySelector('[data-pick-theme="' + target + '"]').click(); await T.until(() => A.state.settings.theme === target, 5000, 'theme');
        const mode = document.documentElement.dataset.mode; A.actions.updateSettings({ theme: before }); return { count: items.length, target, mode };`);
      assert.ok(r.count >= 40, `${r.count} themes`);
      assert.ok(['dark', 'light'].includes(r.mode));
    },
  },
  {
    group: '팝업',
    name: '프로그램 정보 · 환영 · 확인 · 오류 · 진행 팝업',
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
    group: '모양',
    name: '언어 전환 (한국어 ↔ English): 메뉴와 시작 화면 글자가 바뀜',
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
    group: '실행 취소',
    name: '실행 취소/다시 실행 배관: 기록 → 툴바 사용 가능 → 되돌리기 → 다시',
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
    group: '실시간',
    name: 'WsChannel: hello·구독, 끊기면 다시 연결해 다시 구독, 자기 이벤트는 무시',
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
    name: 'API 클라이언트: X-Client-Id · 오류 JSON → code/status/details · 연결 실패 → unreachable',
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
    group: '명령',
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
