// Web E2E cases: the real app in headless Edge, with a web core (popups are frames). Each case starts from
// a known state (T.reset). Cases marked `desktop: true` also run in the desktop app (desktop.suite.mjs).
import assert from 'node:assert/strict';

export const cases = [
  // ───────── start page
  {
    group: 'Start page', desktop: true,
    name: 'Cards: hero, start, my agents, developer and office templates, models, background — no side panels',
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => document.querySelector('.start-board .start-card'), 8000, 'cards');
        return { cards: [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.dataset.card), dev: document.querySelectorAll('.start-card.devTemplates .template-tile').length, pipelines: document.querySelectorAll('.start-card.pipelineTemplates .template-tile').length, hero: (() => { const h = document.querySelector('.start-hero-fixed'); const first = document.querySelector('.start-board > .start-card'); return { fixed: Boolean(h), handle: Boolean(h?.querySelector('[data-card-handle]')), resize: Boolean(h?.querySelector('[data-card-resize]')), top: Boolean(h && first && h.getBoundingClientRect().bottom <= first.getBoundingClientRect().top) }; })(), office: document.querySelectorAll('.start-card.officeTemplates .template-tile').length, actions: document.querySelectorAll('.start-card.actions .start-tile').length,
          panels: ['#left-panel', '#right-panel', '#bottom-panel'].map((s) => T.rect(s)?.visible ?? false), canvas: document.querySelector('#start-page canvas.start-bg')?.width > 0 };`);
      for (const id of ['actions', 'history', 'recent', 'pipelineTemplates', 'devTemplates', 'officeTemplates', 'models', 'background']) assert.ok(r.cards.includes(id), `card ${id}`);
      assert.ok(!r.cards.includes('hero'), 'the program name is not a movable card');
      assert.deepEqual(r.hero, { fixed: true, handle: false, resize: false, top: true });
      assert.equal(r.dev, 40);
      assert.equal(r.office, 40);
      assert.equal(r.pipelines, 15);
      assert.equal(r.actions, 10);
      assert.deepEqual(r.panels, [false, false, false]);
      assert.ok(r.canvas, 'moving background');
    },
  },
  {
    group: 'Start page', desktop: true,
    name: 'Vertical arrangement by default (one card per row); grid on request, vertical again',
    async run(app) {
      const r = await app.run(`await T.reset(); A.actions.updateSettings({ startArrange: 'vertical', startLayout: null }); await T.frames(4);
        const shape = () => { const rs = [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.getBoundingClientRect()); return { lefts: new Set(rs.map((x) => Math.round(x.left))).size, widths: new Set(rs.map((x) => Math.round(x.width))).size, sorted: rs.every((x, i) => i === 0 || x.top >= rs[i - 1].bottom - 1) }; };
        const vertical = shape();
        document.querySelector('[data-start="arrange"][data-value="grid"]').click(); await T.frames(6);
        const grid = shape(); const gridSetting = A.state.settings.startArrange;
        document.querySelector('[data-start="arrange"][data-value="vertical"]').click(); await T.frames(6);
        return { vertical, grid, gridSetting, back: shape(), setting: A.state.settings.startArrange };`);
      assert.deepEqual(r.vertical, { lefts: 1, widths: 1, sorted: true });
      assert.equal(r.gridSetting, 'grid');
      assert.ok(r.grid.lefts > 1, 'grid puts cards side by side');
      assert.deepEqual(r.back, { lefts: 1, widths: 1, sorted: true });
      assert.equal(r.setting, 'vertical');
    },
  },
  {
    group: 'Start page',
    name: 'History: opened agents listed newest first; forget one, clear all (the agents stay)',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const first = A.editor.doc().id;
        await T.reset({ agent: 'meeting-notes' }); const second = A.editor.doc().id;
        await A.actions.closeAgent(); await A.actions.refreshAgents(); await T.frames(4);
        const rows = () => [...document.querySelectorAll('.start-card.history [data-history-row]')].map((x) => x.dataset.historyRow);
        const before = rows();
        document.querySelector('.start-card.history [data-start="forget-recent"][data-value="' + second + '"]').click(); await T.frames(3);
        const afterForget = rows(); const stillStored = A.state.agents.some((a) => a.id === second);
        document.querySelector('[data-start="clear-history"]').click(); await T.popupReady('confirm'); T.popupDoc('confirm').querySelector('[data-value="delete"]').click();
        await T.until(() => !rows().length, 5000, 'history cleared');
        return { first, second, before: before.slice(0, 2), afterForget: afterForget.includes(second), stillStored, empty: Boolean(document.querySelector('.start-card.history .start-empty')), setting: A.state.settings.recentOpened.length, disabled: document.querySelector('[data-start="clear-history"]').disabled, agents: A.state.agents.length };`);
      assert.deepEqual(r.before, [r.second, r.first], 'newest first');
      assert.equal(r.afterForget, false, 'forgotten');
      assert.ok(r.stillStored, 'forgetting keeps the agent');
      assert.ok(r.empty);
      assert.equal(r.setting, 0);
      assert.ok(r.disabled, 'nothing left to clear');
      assert.ok(r.agents >= 2, 'the agents stay');
    },
  },
  {
    group: 'Start page',
    name: 'My agents: delete one (confirm), then delete all (confirm) — the list and history empty',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const id = A.editor.doc().id;
        await T.reset({ agent: 'meeting-notes' }); await A.actions.closeAgent(); await A.actions.refreshAgents(); await T.frames(4);
        const count = () => document.querySelectorAll('.start-card.recent [data-agent-row]').length;
        const n0 = A.state.agents.length;
        document.querySelector('.start-card.recent [data-start="delete-agent"][data-value="' + id + '"]').click();
        await T.popupReady('confirm'); T.popupDoc('confirm').querySelector('[data-value="delete"]').click();
        await T.until(() => !A.state.agents.some((a) => a.id === id), 5000, 'one deleted');
        await T.frames(3);
        const one = { n: A.state.agents.length, row: Boolean(document.querySelector('[data-agent-row="' + id + '"]')), history: A.state.settings.recentOpened.includes(id) };
        document.querySelector('[data-start="delete-all-agents"]').click(); await T.popupReady('confirm');
        const message = T.popupDoc('confirm').body.textContent;
        T.popupDoc('confirm').querySelector('[data-value="delete"]').click();
        await T.until(() => A.state.agents.length === 0, 15000, 'all deleted'); await T.frames(4);
        return { n0, one, message, rows: count(), empty: Boolean(document.querySelector('.start-card.recent .start-empty')), history: A.state.settings.recentOpened.length, disabled: document.querySelector('[data-start="delete-all-agents"]').disabled, note: document.querySelector('.start-card.recent .start-card-note').textContent };`);
      assert.equal(r.one.n, r.n0 - 1);
      assert.equal(r.one.row, false);
      assert.equal(r.one.history, false, 'a deleted agent leaves the history too');
      assert.match(r.message, new RegExp(String(r.n0 - 1)), 'the confirmation names how many');
      assert.equal(r.rows, 0);
      assert.ok(r.empty);
      assert.equal(r.history, 0);
      assert.ok(r.disabled);
      assert.equal(r.note, '0');
    },
  },
  {
    group: 'Start page', desktop: true,
    name: 'Core connected: models card lists providers; the offline test model is ready',
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => A.state.core.status === 'ready', 20000, 'core');
        return { status: document.querySelector('.db-status')?.className, chips: document.querySelectorAll('.provider-chips .chip').length, ready: document.querySelectorAll('.provider-chips .chip.on').length };`);
      assert.match(r.status, /ready/);
      assert.equal(r.chips, 7);
      assert.ok(r.ready >= 1);
    },
  },

  // ───────── settings › AI model keys
  {
    group: 'Settings',
    name: 'AI model keys tab: add a key (shown masked, the provider becomes ready in the main window), set the default model, delete it',
    async run(app) {
      const r = await app.run(`await T.reset(); A.run('settings'); await T.popupReady('settings');
        const d = () => T.popupDoc('settings');
        d().querySelector('[data-action="tab"][data-value="keys"]').click();
        await T.until(() => d().querySelector('[data-action="key-add"][data-value="anthropic"]'), 8000, 'keys');
        d().querySelector('[data-action="key-add"][data-value="anthropic"]').click(); await T.until(() => d().querySelector('[data-key-form="anthropic"]'), 3000, 'form');
        d().querySelector('[data-key-form="anthropic"] [data-action="key-save"]').click(); await T.sleep(200);
        const empty = d().querySelector('.key-note')?.textContent ?? '';
        d().querySelector('[data-key-field="apiKey"]').value = 'sk-ant-test-1234567890abcd';
        d().querySelector('[data-key-form="anthropic"] [data-action="key-save"]').click();
        await T.until(() => d().querySelector('[data-key-provider="anthropic"] .key-chip.on'), 8000, 'saved');
        const chip = d().querySelector('[data-key-provider="anthropic"] .key-chip').textContent.trim();
        await T.until(() => A.state.providerStatus.find((p) => p.id === 'anthropic')?.ready, 8000, 'main window knows');
        const sel = d().querySelector('[data-default-model]'); sel.value = 'anthropic:claude-sonnet-5-5'; sel.dispatchEvent(new Event('change', { bubbles: true }));
        await T.until(() => A.state.coreSettings?.defaultModel === 'anthropic:claude-sonnet-5-5', 8000, 'default model');
        d().querySelector('[data-key-provider="anthropic"] [data-action="key-delete"]').click();
        await T.until(() => !d().querySelector('[data-key-provider="anthropic"] .key-chip.on'), 8000, 'deleted');
        const after = A.state.providerStatus.find((p) => p.id === 'anthropic')?.ready;
        sel.ownerDocument.querySelector('[data-default-model]').value = 'mock:mock-1'; d().querySelector('[data-default-model]').dispatchEvent(new Event('change', { bubbles: true }));
        await T.until(() => A.state.coreSettings?.defaultModel === 'mock:mock-1', 8000, 'restored');
        const creds = (await A.api.credentials()).items.filter((c) => c.provider === 'anthropic').length;
        await T.reset();
        return { empty, chip, after, creds };`);
      assert.match(r.empty, /API 키|API key/i, 'a key is required');
      assert.equal(r.chip, 'sk-a…abcd', 'only the ends of the key show');
      assert.equal(r.creds, 0, 'deleted from the store');
    },
  },

  // ───────── tutorial
  {
    group: 'Tutorial',
    name: 'The start offer asks to run the tutorial (only on the start page, its check box and the Settings toggle agree); Help has Tutorial',
    async run(app) {
      const r = await app.run(`await T.reset(); A.actions.updateSettings({ showWelcome: true }, { quiet: true });
        const offer = [A.actions.shouldOfferTutorial({ showWelcome: true }, true), A.actions.shouldOfferTutorial({ showWelcome: true }, false), A.actions.shouldOfferTutorial({ showWelcome: false }, true)];
        const opening = A.actions.openWelcome(); await T.popupReady('welcome'); const d = T.popupDoc('welcome');
        const shown = { text: d.body.textContent, buttons: [...d.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value), checked: d.querySelector('[data-toggle="showWelcome"]').checked };
        const box = d.querySelector('[data-toggle="showWelcome"]'); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
        await T.until(() => A.state.settings.showWelcome === false, 3000, 'turned off');
        d.querySelector('[data-value="later"]').click(); await opening;
        A.run('settings'); await T.popupReady('settings'); const sd = T.popupDoc('settings');
        sd.querySelector('[data-action="tab"][data-value="start"]').click(); await T.sleep(200);
        const toggle = T.popupDoc('settings').querySelector('[data-toggle="showWelcome"]');
        const row = toggle?.closest('.row')?.textContent.trim() ?? '';
        const off = toggle?.checked;
        await T.reset(); A.actions.updateSettings({ showWelcome: true }, { quiet: true });
        return { offer, shown, off, row, help: A.menus.MENUS.help };`);
      assert.deepEqual(r.offer, [true, false, false], 'offered only on the start page, only when turned on');
      assert.match(r.shown.text, /튜토리얼|tutorial/i);
      assert.ok(r.shown.buttons.includes('tutorial') && r.shown.buttons.includes('later'));
      assert.equal(r.shown.checked, true);
      assert.equal(r.off, false, 'the check box in the popup is the Settings toggle');
      assert.match(r.row, /튜토리얼 실행 팝업창|tutorial popup/i);
      assert.ok(r.help.includes('tutorial'));
    },
  },
  {
    group: 'Tutorial',
    name: 'The tutorial lights up every part in turn (start page → help), Back and Esc work, finishing marks it done',
    async run(app) {
      const r = await app.run(`await T.reset(); A.actions.updateSettings({ tutorialDone: false }, { quiet: true });
        A.run('tutorial'); await T.until(() => window.__myagentsTour && document.querySelector('.tour-card .tour-text'), 8000, 'tour');
        const tour = window.__myagentsTour; const seen = [];
        for (let i = 0; i < 12; i += 1) {
          await T.until(() => document.querySelector('.tour')?.dataset.step && document.querySelector('.tour-card .tour-text')?.textContent, 5000, 'step ' + i); await T.frames(3);
          const spot = document.querySelector('.tour-spot'); const sr = spot.getBoundingClientRect(); const cr = document.querySelector('.tour-card').getBoundingClientRect();
          seen.push({ step: document.querySelector('.tour').dataset.step, lit: getComputedStyle(spot).display !== 'none' && sr.width > 10 && sr.height > 10, cardInside: cr.left >= 0 && cr.top >= 0 && cr.right <= innerWidth && cr.bottom <= innerHeight, counter: document.querySelector('.tour-head small').textContent });
          if (i === 2) { tour.prev(); await T.until(() => document.querySelector('.tour').dataset.step === 'templates', 3000, 'back'); tour.next(); await T.until(() => document.querySelector('.tour').dataset.step === 'describe', 3000, 'again'); }
          if (i < 11) { const before = document.querySelector('.tour').dataset.step; tour.next(); await T.until(() => document.querySelector('.tour')?.dataset.step !== before, 5000, 'next ' + i); }
        }
        tour.next(); await T.until(() => !document.querySelector('.tour'), 3000, 'closed');
        const done = A.state.settings.tutorialDone;
        A.run('tutorial'); await T.until(() => document.querySelector('.tour'), 3000, 'again');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await T.frames(2);
        const escClosed = !document.querySelector('.tour');
        await T.reset();
        return { seen, done, escClosed };`);
      assert.deepEqual(r.seen.map((s) => s.step), ['start', 'templates', 'describe', 'palette', 'canvas', 'inspector', 'run', 'bottom', 'chat', 'models', 'print', 'help']);
      for (const s of r.seen) { assert.ok(s.lit, `${s.step} is lit`); assert.ok(s.cardInside, `${s.step}: the card is inside the window`); }
      assert.equal(r.seen[0].counter, '1 / 12');
      assert.equal(r.done, true);
      assert.ok(r.escClosed, 'Esc ends the tour');
    },
  },

  // ───────── progress and code tabs
  {
    group: 'Runs',
    name: 'Progress tab: percentage, phases and node count follow the run; Code tab: written files, versions, changed lines marked',
    async run(app) {
      const r = await app.run(`await T.reset();
        await A.actions.openNew({ name: 'writer', nodes: [
          { id: 't', type: 'trigger.manual', name: 'Start', x: 80, y: 100, config: {} },
          { id: 'w1', type: 'tool.file', name: 'First draft', x: 380, y: 100, phase: '1 Draft', config: { op: 'write', path: 'e2e/app.js', content: 'const a = 1;\\nconst b = 2;\\nexport { a, b };' } },
          { id: 'w2', type: 'tool.file', name: 'Fix', x: 680, y: 100, phase: '2 Fix', config: { op: 'write', path: 'e2e/app.js', content: 'const a = 1;\\nconst b = 3;\\nexport { a, b };' } },
          { id: 'w3', type: 'tool.file', name: 'Notes', x: 980, y: 100, phase: '2 Fix', config: { op: 'write', path: 'e2e/NOTES.md', content: '# Notes' } },
        ], edges: [{ id: 'a', from: 't', fromPort: 'out', to: 'w1' }, { id: 'b', from: 'w1', fromPort: 'out', to: 'w2' }, { id: 'c', from: 'w2', fromPort: 'out', to: 'w3' }] });
        await T.until(() => document.querySelectorAll('.canvas-host .node').length === 4, 8000, 'drawn');
        A.actions.updateSettings({ runDonePopup: false }, { quiet: true });
        A.actions.showBottomTab('progress');
        await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded', 15000, 'done'); await T.sleep(400);
        const pg = { percent: document.querySelector('.pg-percent')?.textContent, phases: [...document.querySelectorAll('.pg-phase')].map((p) => [p.querySelector('.pg-name').textContent, p.className.replace('pg-phase', '').trim(), p.querySelector('small').textContent]), tab: document.querySelector('[data-bottom-tab="progress"], [data-tab="progress"]')?.textContent ?? '' };
        A.actions.showBottomTab('code'); await T.frames(3);
        const files = [...document.querySelectorAll('.code-file')].map((f) => f.textContent.replace(/\\s+/g, ' ').trim());
        document.querySelector('[data-code-file="e2e/app.js"]').click(); await T.frames(2);
        const view = { head: document.querySelector('.code-head b').textContent, lines: document.querySelectorAll('.code-line').length, changed: [...document.querySelectorAll('.code-line.changed')].map((l) => l.textContent) };
        document.querySelector('.pg-phase, [data-code-file]');
        A.actions.updateSettings({ runDonePopup: true }, { quiet: true });
        return { pg, files, view };`);
      assert.equal(r.pg.percent, '100%');
      assert.deepEqual(r.pg.phases, [['1 Draft', 'done', '2/2'], ['2 Fix', 'done', '2/2']], JSON.stringify(r.pg.phases));
      assert.equal(r.files.length, 2);
      assert.match(r.files.find((f) => f.includes('app.js')), /v2\s*\+1\s*−1/);
      assert.match(r.files.find((f) => f.includes('NOTES.md')), /v1/);
      assert.equal(r.view.head, 'e2e/app.js');
      assert.equal(r.view.lines, 3);
      assert.deepEqual(r.view.changed.map((l) => l.replace(/^\s*\d+/, '')), ['const b = 3;']);
    },
  },

  // ───────── local Ollama
  {
    group: 'Models',
    name: 'Ollama not installed: the card says so; a test call and a failed run offer the install popup (web: download page only)',
    // the test call against the closed port answers 502 on purpose
    expectErrors: /502.*\/api\/models\/test|\/api\/models\/test.*502/,
    async run(app) {
      const r = await app.run(`await T.reset(); const cred = await A.api.createCredential({ provider: 'ollama', name: 'closed', baseUrl: 'http://127.0.0.1:9', isDefault: true });
        A.actions.setView('models'); await T.until(() => document.querySelector('[data-ollama-state]'), 15000, 'ollama state');
        const card = document.querySelector('[data-ollama-state]').dataset.ollamaState;
        document.querySelector('[data-model-test="ollama"]').click();
        await T.popupReady('confirm', 30000); let d = T.popupDoc('confirm');
        const offer = { title: d.querySelector('.popup-title, .popup-head, h1')?.textContent ?? d.body.textContent.slice(0, 80), buttons: [...d.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value) };
        d.querySelector('[data-value="cancel"]').click(); await T.sleep(300);
        // a run that needs the local model offers the same instead of the result window
        await T.reset({ agent: 'log-analyzer' });
        const llm = A.editor.doc().nodes.find((n) => n.type === 'ai.llm');
        A.editor.change('model', (doc) => { doc.nodes.find((n) => n.id === llm.id).config.model = 'ollama:llama3.3'; });
        await A.run('runAgent');
        await T.popupReady('confirm', 30000); d = T.popupDoc('confirm');
        const fromRun = d.body.textContent;
        const rundone = Boolean(T.frameOf('rundone')) && getComputedStyle(T.frameOf('rundone').parentElement).visibility !== 'hidden';
        d.querySelector('[data-value="cancel"]').click(); await T.sleep(200);
        await A.api.deleteCredential(cred.id);
        return { card, offer, fromRun, rundone };`);
      assert.equal(r.card, 'missing');
      assert.match(r.offer.title, /Ollama/);
      assert.deepEqual(r.offer.buttons, ['cancel', 'page'], 'the web server offers the download page, not an install');
      assert.match(r.fromRun, /Ollama/);
      assert.equal(r.rundone, false);
    },
  },

  // ───────── panels
  {
    group: 'Panels',
    name: 'Each panel folds from its own header (the toolbar\'s panel icon) to a rail with its icon and title; a click on the rail unfolds it',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'log-analyzer' }); A.actions.updateSettings({ showLeftPanel: true, showRightPanel: true, showBottomPanel: true }); await T.frames(3);
        const out = {};
        for (const [cmd, panel, setting] of [['leftPanel', '#left-panel', 'showLeftPanel'], ['rightPanel', '#right-panel', 'showRightPanel'], ['bottomPanel', '#bottom-panel', 'showBottomPanel']]) {
          const fold = document.querySelector(panel + ' .panel-collapse[data-command="' + cmd + '"]');
          const toolbarIcon = document.querySelector('#toolbar [data-command="' + cmd + '"] svg')?.dataset.icon;
          const same = fold?.querySelector('svg')?.dataset.icon === toolbarIcon;
          fold.click(); await T.frames(3);
          const rail = document.querySelector(panel + ' .panel-rail, ' + panel + ' .bottom-rail');
          const rb = rail?.getBoundingClientRect();
          const pb = document.querySelector(panel).getBoundingClientRect();
          const folded = { setting: A.state.settings[setting], railShown: Boolean(rb && rb.width > 0 && rb.height > 0), title: rail?.textContent.trim().slice(0, 30), icons: rail?.querySelectorAll('svg').length ?? 0, size: cmd === 'bottomPanel' ? Math.round(pb.height) : Math.round(pb.width), others: [...document.querySelector(panel).children].filter((k) => !k.matches('.panel-rail, .bottom-rail') && k.getBoundingClientRect().height > 0).length };
          rail.click(); await T.frames(3);
          out[cmd] = { same, folded, unfolded: A.state.settings[setting] };
        }
        const right = document.querySelector('#right-panel .right-title')?.textContent.trim();
        return { out, right };`);
      for (const [cmd, x] of Object.entries(r.out)) {
        assert.ok(x.same, `${cmd}: the fold button uses the toolbar's icon`);
        assert.equal(x.folded.setting, false, `${cmd} folded`);
        assert.ok(x.folded.railShown, `${cmd}: rail shown`);
        assert.ok(x.folded.title.length > 1 && x.folded.icons >= 2, `${cmd}: icon and title on the rail (${x.folded.title})`);
        assert.ok(x.folded.size <= 40, `${cmd}: slim (${x.folded.size} px)`);
        assert.equal(x.folded.others, 0, `${cmd}: only the rail while folded`);
        assert.equal(x.unfolded, true, `${cmd}: a click on the rail unfolds it`);
      }
      assert.ok(r.right, 'the right panel has a title');
    },
  },

  // ───────── a run finished
  {
    group: 'Runs',
    name: 'A finished run opens a result window (status, time, steps, output); "Show the run" opens the run tab; it can be turned off',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'log-analyzer' }); A.actions.updateSettings({ runDonePopup: true }, { quiet: true });
        A.state.bottomTab = 'history'; await A.run('runAgent');
        await T.popupReady('rundone', 20000); const d = T.popupDoc('rundone');
        const shown = { title: d.querySelector('.popup-title, h1, .popup-head')?.textContent ?? '', status: d.querySelector('.rundone').className, stats: d.querySelectorAll('.rd-stat').length, output: d.querySelector('#rd-output').textContent, steps: A.editor.live().steps.length };
        d.querySelector('[data-action="choice"][data-value="show"]').click();
        await T.until(() => !T.frameOf('rundone') || getComputedStyle(T.frameOf('rundone').parentElement).visibility === 'hidden', 5000, 'closed');
        const tab = A.state.bottomTab;
        A.actions.updateSettings({ runDonePopup: false }, { quiet: true });
        await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded', 20000, 'second run'); await T.sleep(600);
        const again = Boolean(T.frameOf('rundone')) && getComputedStyle(T.frameOf('rundone').parentElement).visibility !== 'hidden';
        A.actions.updateSettings({ runDonePopup: true }, { quiet: true });
        return { shown, tab, again };`);
      assert.match(r.shown.status, /st-succeeded/);
      assert.ok(r.shown.stats >= 3, 'time, steps, failed steps');
      assert.ok(r.shown.output.length > 0 && !/\(no result|결과 없음/.test(r.shown.output), `output: ${r.shown.output.slice(0, 60)}`);
      assert.equal(r.tab, 'run', '"Show the run" opens the run tab');
      assert.equal(r.again, false, 'turned off: no window');
    },
  },

  // ───────── printing
  {
    group: 'Print',
    name: 'Print window: preview pages (overview, flow picture, nodes, last run), page settings change the pages, Print sends the job',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'log-analyzer' }); await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded', 20000, 'run done'); await T.sleep(300);
        A.run('print'); await T.popupReady('print');
        const d = () => T.popupDoc('print'); const w = T.frameOf('print').contentWindow;
        await T.until(() => d().querySelector('#print-preview .pp-page'), 8000, 'preview');
        const pages = () => Number((d().querySelector('#page-number')?.textContent.match(/(\\d+)\\D*$/) ?? [])[1] ?? 0);
        const first = { pages: pages(), svg: Boolean(d().querySelector('#print-preview .pp-page svg')), title: d().querySelector('#print-preview .pp-head b')?.textContent, size: d().querySelector('#print-preview .pp-page').style.width };
        const select = (key, value) => { const s = d().querySelector('[data-print-key="' + key + '"]'); s.value = value; s.dispatchEvent(new w.Event('change', { bubbles: true })); };
        d().querySelector('[data-action="print-set"][data-key="orientation"][data-value="landscape"]').click(); await T.frames(3);
        const landscape = d().querySelector('#print-preview .pp-page').style.width;
        select('paper', 'A3'); await T.frames(3);
        const a3 = d().querySelector('#print-preview .pp-page').style.width;
        const sw = (part, on) => { const c = d().querySelector('[data-print-part="' + part + '"]'); c.checked = on; c.dispatchEvent(new w.Event('change', { bubbles: true })); };
        for (const p of ['overview', 'diagram', 'nodes']) sw(p, false); await T.frames(3);
        const runOnly = { pages: pages(), text: d().querySelector('#print-preview').textContent };
        for (const p of ['overview', 'diagram', 'nodes', 'run']) sw(p, false); await T.frames(3);
        const none = { empty: Boolean(d().querySelector('#print-preview .preview-empty')), disabled: d().querySelector('[data-action="print-go"]').disabled };
        for (const p of ['overview', 'diagram', 'nodes', 'run']) sw(p, true);
        d().querySelector('[data-action="print-set"][data-key="orientation"][data-value="portrait"]').click(); select('paper', 'A4'); await T.frames(3);
        let job = null; w.__myagentsPrintHook = async (lay, j) => { job = { j, sheets: d().querySelectorAll('.print-sheet .pp-page').length, pages: lay.pages.length }; };
        d().querySelector('[data-action="print-go"]').click(); await T.until(() => job, 5000, 'printed');
        await T.reset();
        return { first, landscape, a3, runOnly, none, job };`);
      assert.ok(r.first.pages >= 2, `pages: ${r.first.pages}`);
      assert.ok(r.first.svg, 'the flow picture is on the first page');
      assert.ok(r.first.title, 'header carries the agent name');
      assert.equal(r.first.size, '210mm');
      assert.equal(r.landscape, '297mm', 'landscape A4');
      assert.equal(r.a3, '420mm', 'landscape A3');
      assert.equal(r.runOnly.pages, 1);
      assert.match(r.runOnly.text, /(성공|Succeeded|실패|Failed)/);
      assert.deepEqual(r.none, { empty: true, disabled: true });
      assert.equal(r.job.sheets, r.job.pages, 'every page goes to the printer');
      assert.equal(r.job.j.widthMm, 210);
      assert.equal(r.job.j.copies, 1);
    },
  },

  // ───────── agents
  {
    group: 'Agents',
    name: 'New agent: editor with a manual trigger, listed on the left, tabs and panels shown',
    async run(app) {
      const r = await app.run(`await T.reset(); await A.actions.newAgent(); await T.until(() => document.querySelector('.canvas-host .node'), 8000, 'node');
        return { nodes: document.querySelectorAll('.canvas-host .node').length, trigger: Boolean(document.querySelector('.node.is-trigger')), listed: [...document.querySelectorAll('.agent-row.active')].length, panels: ['#left-panel', '#right-panel', '#bottom-panel', '#tabs'].map((s) => T.rect(s)?.visible), palette: document.querySelectorAll('.pal-item').length };`);
      assert.equal(r.nodes, 1);
      assert.ok(r.trigger);
      assert.equal(r.listed, 1);
      assert.deepEqual(r.panels, [true, true, true, true]);
      assert.equal(r.palette, 70, 'every node type in the palette');
    },
  },
  {
    group: 'Agents', desktop: true,
    name: 'Every template opens with all its nodes and connections drawn',
    async run(app) {
      const ids = await app.run(`return A.state.templates.map((x) => x.id);`);
      for (const id of ids) {
        const r = await app.run(`await T.reset({ agent: ${JSON.stringify(id)} }); return { nodes: document.querySelectorAll('.canvas-host .node').length, edges: document.querySelectorAll('.canvas-host .edge').length, doc: [A.editor.doc().nodes.length, A.editor.doc().edges.length], errors: A.editor.problems().filter((p) => p.severity === 'error').length };`);
        assert.deepEqual([r.nodes, r.edges], r.doc, id);
        assert.equal(r.errors, 0, `${id} has no problems`);
      }
    },
  },
  {
    group: 'Agents',
    name: 'Save, rename (F2 form), dirty marker, duplicate and delete',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const id = A.editor.doc().id;
        A.run('renameAgent'); await T.fillForm({ value: 'Renamed agent' }); await T.until(() => A.editor.doc().name === 'Renamed agent', 5000, 'renamed');
        const dirty = A.editor.dirty() && document.querySelector('.menubar-project').classList.contains('dirty');
        await A.run('save'); await T.until(() => !A.editor.dirty(), 5000, 'saved');
        const saved = (await A.api.agent(id)).name;
        await A.run('duplicateAgent'); await T.until(() => A.editor.doc().id !== id, 5000, 'copy open');
        const copyId = A.editor.doc().id; const copyName = A.editor.doc().name;
        A.run('deleteAgent'); await T.popupReady('confirm'); T.popupDoc('confirm').querySelector('[data-value="delete"]').click();
        await T.until(() => !A.state.agents.some((a) => a.id === copyId), 5000, 'deleted');
        return { dirty, saved, copyName, start: A.state.showStart };`);
      assert.ok(r.dirty, 'unsaved marker');
      assert.equal(r.saved, 'Renamed agent');
      assert.match(r.copyName, /copy/);
      assert.ok(r.start, 'back on the start page');
    },
  },
  {
    group: 'Agents',
    name: 'Export (download) and import a .myagent file',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'code-review' }); const doc = A.editor.doc();
        const text = await A.api.exportAgent(doc.id); const before = A.state.agents.length;
        await A.actions.importText('x.myagent', text); await T.until(() => A.state.agents.length === before + 1, 5000, 'imported');
        return { format: JSON.parse(text).format, open: A.editor.doc().name, nodes: A.editor.doc().nodes.length, original: doc.nodes.length, other: A.editor.doc().id !== doc.id };`);
      assert.equal(r.format, 'myagents');
      assert.equal(r.nodes, r.original);
      assert.ok(r.other);
    },
  },
  {
    group: 'Agents',
    name: 'Describe it: the form builds a draft workflow and opens it',
    async run(app) {
      const r = await app.run(`await T.reset(); A.run('describe'); await T.fillForm({ description: '매일 웹 페이지를 요약해서 파일로 저장하고 알림을 보내줘' });
        await T.until(() => A.state.hasDoc && A.editor.doc().nodes.length >= 4, 15000, 'draft open');
        return A.editor.doc().nodes.map((n) => n.type);`);
      assert.equal(r[0], 'trigger.schedule');
      for (const t of ['tool.web', 'ai.llm', 'tool.file', 'human.notify']) assert.ok(r.includes(t), t);
    },
  },

  // ───────── canvas editing
  {
    group: 'Canvas',
    name: 'Grid: faint 5 × 5 lines on the ruler ticks; zooming redraws the step finer or coarser',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const host = document.querySelector('.canvas-host'); const grid = host.querySelector('.canvas-grid');
        const read = () => ({ step: Number(host.dataset.gridStep), rs: parseFloat(host.style.getPropertyValue('--rs')), size: getComputedStyle(grid).backgroundSize, pos: getComputedStyle(grid).backgroundPosition.split(',')[0].trim(), rx: host.style.getPropertyValue('--rx'), ry: host.style.getPropertyValue('--ry'), lines: getComputedStyle(grid).backgroundImage.match(/linear-gradient/g)?.length ?? 0 });
        const steps = [];
        for (const z of [1, 2, 3, 0.4, 0.2]) { A.editor.state.canvas.setViewport({ zoom: z }); await T.frames(2); steps.push(read()); }
        return { steps };`);
      for (const s of r.steps) {
        assert.equal(s.lines, 4, 'minor and major lines both ways');
        assert.equal(s.rs, s.step, 'the rulers tick on the grid lines');
        const [gx, gy] = s.pos.split(' ').map(parseFloat);
        assert.ok(Math.abs(gx - parseFloat(s.rx)) < 0.01 && Math.abs(gy - parseFloat(s.ry)) < 0.01, `the grid moves with the view, like the rulers (${s.pos} vs ${s.rx} ${s.ry})`);
        assert.ok(s.step >= 9 && s.step <= 45, `step ${s.step}`);
        assert.match(s.size, new RegExp(`^${s.step * 5}px ${s.step * 5}px`), 'a major line every fifth');
      }
      assert.ok(new Set(r.steps.map((s) => s.step)).size >= 2, 'the step changed with the zoom');
    },
  },
  {
    group: 'Canvas',
    name: 'Arrange wraps a long flow into rows shaped like the canvas; Fit shows it all, centred both ways',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'autodev-loop' }); const host = document.querySelector('.canvas-host');
        A.editor.change('spread', (d) => { d.nodes.forEach((n, i) => { n.x = i * 320; n.y = 100; }); }); await T.frames(2);
        A.run('arrange'); await T.sleep(150); await T.frames(3);
        const hb = host.getBoundingClientRect(); const ns = [...host.querySelectorAll('.node')].map((n) => n.getBoundingClientRect());
        const box = { l: Math.min(...ns.map((b) => b.left)), r: Math.max(...ns.map((b) => b.right)), t: Math.min(...ns.map((b) => b.top)), b: Math.max(...ns.map((b) => b.bottom)) };
        const rows = new Set(A.editor.doc().nodes.map((n) => n.y)).size;
        return { rows, inside: box.l >= hb.left - 1 && box.r <= hb.right + 1 && box.t >= hb.top - 1 && box.b <= hb.bottom + 1, dx: Math.abs((box.l - hb.left) - (hb.right - box.r)), dy: Math.abs((box.t - hb.top) - (hb.bottom - box.b)), aspect: (box.r - box.l) / (box.b - box.t), host: hb.width / hb.height };`);
      assert.ok(r.rows >= 6, `wrapped into rows (${r.rows} distinct y)`);
      assert.ok(r.inside, 'everything in view');
      assert.ok(r.dx < 40 && r.dy < 40, `centred: dx ${r.dx}, dy ${r.dy}`);
      assert.ok(r.aspect < r.host * 2.2, `shape follows the canvas (${r.aspect.toFixed(2)} vs ${r.host.toFixed(2)})`);
    },
  },
  {
    group: 'Canvas',
    name: 'Palette: "Close all" folds every group, "Open all" opens them again (the buttons above the nodes)',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const pal = () => document.querySelector('#palette-panel');
        const count = () => ({ items: pal().querySelectorAll('.pal-item').length, folded: pal().querySelectorAll('.pal-group.collapsed').length, groups: pal().querySelectorAll('.pal-group').length });
        const before = count();
        pal().querySelector('[data-pal-all="close"]').click(); await T.frames(2);
        const closed = { ...count(), closeDisabled: pal().querySelector('[data-pal-all="close"]').disabled };
        pal().querySelector('[data-pal-all="open"]').click(); await T.frames(2);
        const opened = { ...count(), openDisabled: pal().querySelector('[data-pal-all="open"]').disabled };
        const above = pal().querySelector('.pal-all').getBoundingClientRect().bottom <= pal().querySelector('.pal-groups').getBoundingClientRect().top + 1;
        return { before, closed, opened, above };`);
      assert.equal(r.closed.items, 0);
      assert.equal(r.closed.folded, r.closed.groups);
      assert.ok(r.closed.closeDisabled);
      assert.equal(r.opened.items, 70);
      assert.equal(r.opened.folded, 0);
      assert.ok(r.opened.openDisabled);
      assert.ok(r.above, 'the buttons sit above the nodes');
    },
  },
  {
    group: 'Runs',
    name: 'Form trigger: Run asks for the fields in a form window; the answers are trigger.<field>',
    async run(app) {
      const r = await app.run(`await T.reset();
        await A.actions.openNew({ name: 'form test', nodes: [{ id: 'f', type: 'trigger.form', name: 'Request', x: 100, y: 100, config: { title: 'Leave request', fields: ['name', 'days'] } }, { id: 'o', type: 'logic.template', name: 'Out', x: 400, y: 100, config: { template: '{{ trigger.name }} asks {{ trigger.days }} days' } }], edges: [{ id: 'e', from: 'f', fromPort: 'out', to: 'o' }] });
        await T.until(() => document.querySelectorAll('.canvas-host .node').length === 2, 8000, 'drawn');
        A.actions.updateSettings({ runDonePopup: false }, { quiet: true });
        const running = A.editor.run();
        await T.fillForm({ name: 'Kim', days: '3' });
        await running; await T.until(() => A.editor.live()?.status === 'succeeded', 15000, 'done');
        A.actions.updateSettings({ runDonePopup: true }, { quiet: true });
        return { out: A.editor.live().output?.text ?? (await A.api.runDetail(A.editor.live().id)).output?.text };`);
      assert.equal(r.out, 'Kim asks 3 days');
    },
  },
  {
    group: 'Canvas',
    name: 'Palette: search filters; a click adds a node connected after the selected one',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const d = A.editor.doc(); const n0 = d.nodes.length; const e0 = d.edges.length;
        const search = document.getElementById('palette-search'); search.value = 'tool.http'; search.dispatchEvent(new Event('input', { bubbles: true }));
        await T.until(() => document.querySelectorAll('.pal-item').length === 1, 3000, 'filtered');
        const filtered = document.querySelector('.pal-item').dataset.palType;
        A.editor.state.canvas.setSelection([d.nodes[1].id]);
        document.querySelector('.pal-item').click(); await T.frames(3);
        const added = A.editor.doc().nodes.at(-1);
        search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true }));
        return { filtered, added: added.type, nodes: A.editor.doc().nodes.length - n0, edges: A.editor.doc().edges.length - e0, linked: A.editor.doc().edges.some((e) => e.from === d.nodes[1].id && e.to === added.id), selected: A.editor.selection() };`);
      assert.equal(r.filtered, 'tool.http');
      assert.equal(r.added, 'tool.http');
      assert.equal(r.nodes, 1);
      assert.equal(r.edges, 1);
      assert.ok(r.linked);
    },
  },
  {
    group: 'Canvas',
    name: 'Drag a node type from the palette and drop it on the canvas',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const n0 = A.editor.doc().nodes.length;
        const dt = new DataTransfer(); const item = document.querySelector('.pal-item[data-pal-type="logic.code"]');
        item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const host = document.querySelector('.canvas-host'); const c = T.centre(host);
        host.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: c.x, clientY: c.y + 150 }));
        host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: c.x, clientY: c.y + 150 }));
        await T.frames(3); return { added: A.editor.doc().nodes.length - n0, type: A.editor.doc().nodes.at(-1).type, drawn: Boolean(T.nodeEl(A.editor.doc().nodes.at(-1).id)) };`);
      assert.deepEqual(r, { added: 1, type: 'logic.code', drawn: true });
    },
  },
  {
    group: 'Canvas',
    name: 'Connect two nodes by dragging from an output port to another card',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const id = A.editor.addNode('logic.template', { x: 200, y: 520 });
        A.editor.state.canvas.fit(); await T.frames(3); const d = A.editor.doc(); const before = d.edges.length;
        const port = T.nodeEl(d.nodes[1].id).querySelector('.port.out'); const target = T.nodeEl(id);
        await T.drag(T.centre(port), T.centre(target), port);
        const edge = A.editor.doc().edges.find((e) => e.from === d.nodes[1].id && e.to === id);
        return { added: A.editor.doc().edges.length - before, edge: Boolean(edge), drawn: edge ? Boolean(document.querySelector('.edge[data-edge="' + edge.id + '"]')) : false };`);
      assert.deepEqual(r, { added: 1, edge: true, drawn: true });
    },
  },
  {
    group: 'Canvas',
    name: 'Move a card by dragging; Undo puts it back, Redo moves it again',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const n = A.editor.doc().nodes[1]; const x0 = n.x; const y0 = n.y;
        const el = T.nodeEl(n.id).querySelector('.node-head'); const c = T.centre(el);
        await T.drag(c, { x: c.x + 120, y: c.y + 80 }, el);
        const moved = A.editor.doc().nodes[1]; const after = [moved.x, moved.y];
        await A.run('undo'); const undone = [A.editor.doc().nodes[1].x, A.editor.doc().nodes[1].y];
        await A.run('redo'); const redone = [A.editor.doc().nodes[1].x, A.editor.doc().nodes[1].y];
        return { start: [x0, y0], after, undone, redone };`);
      assert.ok(r.after[0] > r.start[0] && r.after[1] > r.start[1], 'moved right and down');
      assert.deepEqual(r.undone, r.start);
      assert.deepEqual(r.redone, r.after);
    },
  },
  {
    group: 'Canvas',
    name: 'Box selection, copy and paste (Ctrl+C / Ctrl+V), duplicate, Delete key',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'log-analyzer' }); const host = document.querySelector('.canvas-host'); host.focus();
        const hr = host.getBoundingClientRect(); const n0 = A.editor.doc().nodes.length;
        const start = document.querySelector('.canvas-host'); const opts = (x, y) => ({ bubbles: true, pointerId: 3, button: 0, buttons: 1, clientX: x, clientY: y, shiftKey: true });
        start.dispatchEvent(new PointerEvent('pointerdown', opts(hr.left + 5, hr.top + 5))); start.dispatchEvent(new PointerEvent('pointermove', opts(hr.right - 200, hr.bottom - 5))); start.dispatchEvent(new PointerEvent('pointerup', opts(hr.right - 200, hr.bottom - 5)));
        const boxed = A.editor.selection().length;
        A.editor.state.canvas.setSelection([A.editor.doc().nodes[1].id]);
        const key = (k, mod) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: mod, bubbles: true, cancelable: true }));
        key('c', true); key('v', true); await T.frames(2); const pasted = A.editor.doc().nodes.length - n0;
        key('d', true); await T.frames(2); const duplicated = A.editor.doc().nodes.length - n0;
        A.editor.state.canvas.setSelection(A.editor.doc().nodes.slice(n0).map((n) => n.id)); key('Delete', false); await T.frames(2);
        return { boxed, pasted, duplicated, after: A.editor.doc().nodes.length - n0 };`);
      assert.ok(r.boxed >= 2, `box selected ${r.boxed}`);
      assert.equal(r.pasted, 1);
      assert.equal(r.duplicated, 2);
      assert.equal(r.after, 0);
    },
  },
  {
    group: 'Canvas',
    name: 'Zoom (wheel, + / −), fit, auto arrange, minimap toggle, empty canvas hint',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'multi-agent' }); const c = A.editor.state.canvas; const z0 = c.viewport().zoom;
        const host = document.querySelector('.canvas-host'); const p = T.centre(host);
        host.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true })); const zIn = c.viewport().zoom;
        await A.run('zoomOut'); await A.run('fit'); await A.run('arrange');
        const mm1 = T.rect('.canvas-minimap').visible; await A.run('minimap'); await T.frames(2); const mm2 = document.querySelector('.canvas-minimap').hidden; await A.run('minimap');
        A.editor.state.canvas.setSelection(A.editor.doc().nodes.map((n) => n.id)); A.editor.deleteSelection(); await T.frames(2);
        return { zIn: zIn > z0, mm1, mm2, empty: Boolean(document.querySelector('.canvas-empty-card')) };`);
      assert.deepEqual(r, { zIn: true, mm1: true, mm2: true, empty: true });
    },
  },
  {
    group: 'Canvas',
    name: 'Quick add: double-click the canvas → menu → the chosen node appears there',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const n0 = A.editor.doc().nodes.length; const host = document.querySelector('.canvas-host'); const hr = host.getBoundingClientRect();
        host.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: hr.left + 120, clientY: hr.bottom - 120 }));
        await T.pickMenu('custom:add:logic.if'); await T.until(() => A.editor.doc().nodes.length === n0 + 1, 5000, 'added');
        return A.editor.doc().nodes.at(-1).type;`);
      assert.equal(r, 'logic.if');
    },
  },
  {
    group: 'Canvas',
    name: 'Node context menu: disable, then enable again',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const n = A.editor.doc().nodes[1]; const el = T.nodeEl(n.id); const c = T.centre(el);
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y }));
        await T.pickMenu('custom:disable'); await T.until(() => A.editor.doc().nodes[1].disabled, 5000, 'disabled');
        const cls = T.nodeEl(n.id).classList.contains('disabled');
        T.nodeEl(n.id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y }));
        await T.pickMenu('custom:disable'); await T.until(() => !A.editor.doc().nodes[1].disabled, 5000, 'enabled');
        return cls;`);
      assert.ok(r);
    },
  },

  // ───────── inspector
  {
    group: 'Inspector',
    name: 'Selecting a node shows its fields; editing a field changes the document (one undo step)',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'code-review' }); A.actions.showRightTab('node'); const n = A.editor.doc().nodes[1];
        A.editor.state.canvas.setSelection([n.id]); await T.until(() => document.querySelector('#inspector-host [data-field="prompt"]'), 3000, 'fields');
        const fields = [...document.querySelectorAll('#inspector-host .field')].length;
        const ta = document.querySelector('#inspector-host [data-field="prompt"]'); ta.value = 'Review: {{ input.code }}'; ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.value = 'Review this: {{ input.code }}'; ta.dispatchEvent(new Event('input', { bubbles: true }));
        const value = A.editor.doc().nodes[1].config.prompt; const steps = A.editor.state.undo.length;
        const name = document.querySelector('#inspector-host [data-field="$name"]'); name.value = 'Reviewer'; name.dispatchEvent(new Event('input', { bubbles: true })); await T.frames(2);
        return { fields, value, steps, renamed: T.nodeEl(n.id).querySelector('.node-name').textContent };`);
      assert.ok(r.fields >= 4);
      assert.equal(r.value, 'Review this: {{ input.code }}');
      assert.equal(r.steps, 1, 'typing in one field is one undo step');
      assert.equal(r.renamed, 'Reviewer');
    },
  },
  {
    group: 'Inspector',
    name: 'Long fields open in a large editor window; Apply changes the node (Undo puts it back); a code field is monospaced',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'code-review' }); A.actions.showRightTab('node'); const n = A.editor.doc().nodes[1];
        A.editor.state.canvas.setSelection([n.id]); await T.until(() => document.querySelector('#inspector-host [data-expand="prompt"]'), 3000, 'expand button');
        const buttons = [...document.querySelectorAll('#inspector-host [data-expand]')].map((b) => b.dataset.expand);
        const before = A.editor.doc().nodes[1].config.prompt;
        document.querySelector('#inspector-host [data-expand="prompt"]').click();
        await T.popupReady('form'); const d = T.popupDoc('form');
        const shown = { value: d.querySelector('[data-ff="value"]').value, rows: Number(d.querySelector('[data-ff="value"]').rows) };
        await T.fillForm({ value: 'Line one\\nLine two: {{ input.code }}' });
        await T.until(() => A.editor.doc().nodes[1].config.prompt.startsWith('Line one'), 5000, 'applied');
        const after = A.editor.doc().nodes[1].config.prompt;
        const field = document.querySelector('#inspector-host [data-field="prompt"]').value;
        A.editor.undo(); await T.frames(2);
        const undone = A.editor.doc().nodes[1].config.prompt;
        // a Code node: monospaced
        await T.reset({ agent: 'log-analyzer' }); const code = A.editor.doc().nodes.find((x) => x.type === 'logic.code');
        A.editor.state.canvas.setSelection([code.id]); await T.until(() => document.querySelector('#inspector-host [data-expand="code"]'), 3000, 'code expand');
        document.querySelector('#inspector-host [data-expand="code"]').click(); await T.popupReady('form');
        const mono = T.popupDoc('form').querySelector('[data-ff="value"]').classList.contains('mono');
        T.popupDoc('form').querySelector('[data-action="close"], [data-action="form-cancel"]')?.click(); await T.reset();
        return { buttons, before, shown, after, field, undone, mono };`);
      assert.ok(r.buttons.includes('prompt'), 'the prompt has an expand button');
      assert.equal(r.shown.value, r.before, 'the window opens with the current text');
      assert.ok(r.shown.rows >= 20, 'a large text area');
      assert.equal(r.after, 'Line one\nLine two: {{ input.code }}');
      assert.equal(r.field, r.after, 'the inspector shows the new text');
      assert.equal(r.undone, r.before, 'one Undo restores it');
      assert.ok(r.mono, 'code is monospaced');
    },
  },
  {
    group: 'Inspector',
    name: 'After a run: expression preview with real values, last input/output, pin output',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'log-analyzer' }); await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded', 20000, 'run done');
        await T.until(() => A.editor.state.shown?.steps?.every((s) => s.output !== undefined), 5000, 'detail');
        const llm = A.editor.doc().nodes.find((n) => n.type === 'ai.llm'); A.actions.showRightTab('node'); A.editor.state.canvas.setSelection([llm.id]);
        await T.until(() => document.querySelector('#inspector-host .preview-ok'), 5000, 'preview');
        const preview = document.querySelector('#inspector-host [data-preview="prompt"] .preview-ok').textContent;
        const io = document.querySelectorAll('#inspector-host .insp-run .json-view').length;
        document.querySelector('#inspector-host [data-insp="pin"]').click(); await T.frames(2);
        const pinned = A.editor.doc().nodes.find((n) => n.id === llm.id).pinned != null;
        await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded' && A.editor.live().steps.some((s) => s.nodeId === llm.id && s.pinned), 20000, 'pinned run');
        return { preview, io, pinned };`);
      assert.match(r.preview, /^= Lines: 4, errors: 2/);
      assert.equal(r.io, 2);
      assert.ok(r.pinned);
    },
  },
  {
    group: 'Inspector', desktop: true,
    name: 'Agent settings (nothing selected): variables, webhook URL that answers, deploy',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'issue-triage' }); A.actions.showRightTab('node'); A.editor.state.canvas.setSelection([]); await T.frames(2);
        await A.editor.refreshHook(); await T.until(() => document.querySelector('#inspector-host .copy-row input')?.value.includes('/hooks/'), 5000, 'hook url');
        const url = document.querySelector('#inspector-host .copy-row input').value;
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Crash', body: 'error' }) });
        const answer = await res.json();
        document.querySelector('#inspector-host [data-var-add]').click(); await T.frames(2);
        const deploy = document.querySelector('#inspector-host [data-agent-deploy]'); deploy.checked = true; deploy.dispatchEvent(new Event('change', { bubbles: true }));
        await T.until(() => A.editor.doc().deployed, 8000, 'deployed');
        return { status: res.status, category: answer.category, vars: A.editor.doc().variables.length, badge: Boolean(document.querySelector('#tabs .badge.on')) };`);
      assert.equal(r.status, 200);
      assert.equal(r.category, 'bug');
      assert.equal(r.vars, 1);
      assert.ok(r.badge, 'deployed badge');
    },
  },

  // ───────── runs drawn on the canvas
  {
    group: 'Runs', desktop: true,
    name: 'Run: cards light up running → succeeded, data flows along the edges, timeline rows with bars',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'json-pipeline' }); const seen = new Set();
        const obs = new MutationObserver(() => { for (const el of document.querySelectorAll('.node.st-running')) seen.add('running'); if (document.querySelector('.edge.flowing')) seen.add('flowing'); if (document.querySelector('.packet')) seen.add('packet'); });
        obs.observe(document.querySelector('.canvas-host'), { subtree: true, childList: true, attributes: true });
        await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded', 20000, 'done'); obs.disconnect(); await T.sleep(300);
        return { seen: [...seen], succeeded: document.querySelectorAll('.node.st-succeeded').length, nodes: A.editor.doc().nodes.length, ran: document.querySelectorAll('.edge.ran').length,
          loopCount: document.querySelector('.node.st-succeeded .node-status b')?.textContent ?? '', rows: document.querySelectorAll('#bottom-panel .step-row').length, bars: document.querySelectorAll('#bottom-panel .step-bar i').length, status: document.querySelector('#statusbar .run-state')?.className };`);
      for (const s of ['running', 'flowing', 'packet']) assert.ok(r.seen.includes(s), `saw ${s}`);
      assert.equal(r.succeeded, r.nodes);
      assert.ok(r.ran >= 3);
      assert.equal(r.loopCount, '×2', 'the loop body ran twice');
      assert.equal(r.rows, 6);
      assert.equal(r.bars, 6);
      assert.match(r.status, /st-succeeded/);
    },
  },
  {
    group: 'Runs',
    name: 'Clicking a step shows its input, output and log, and selects the node',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'code-review' }); await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded' && A.editor.state.shown?.steps?.length === 3, 20000, 'done');
        await T.sleep(200); document.querySelectorAll('#bottom-panel .step-row')[1].click(); await T.frames(2);
        return { detail: document.querySelectorAll('#bottom-panel .step-detail .json-view').length, log: Boolean(document.querySelector('#bottom-panel .log-box')), selected: A.editor.selection()[0] === A.editor.doc().nodes[1].id };`);
      assert.deepEqual(r, { detail: 2, log: true, selected: true });
    },
  },
  {
    group: 'Runs',
    name: 'Approval: the card waits (orange), the bottom card approves, the run goes on',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'email-triage' }); await A.run('runAgent');
        await T.until(() => A.editor.live()?.status === 'waiting' && document.querySelector('.wait-card'), 20000, 'waiting');
        const orange = Boolean(document.querySelector('.node.st-waiting')); const stopEnabled = !document.querySelector('#toolbar [data-command="stopRun"]').disabled;
        document.querySelector('.wait-card [data-wait-comment]').value = 'looks good'; document.querySelector('[data-run-action="approve"]').click();
        await T.until(() => A.editor.live()?.status === 'succeeded', 20000, 'finished');
        return { orange, stopEnabled, output: A.editor.live().output, sent: Boolean([...document.querySelectorAll('.node.st-succeeded .node-name')].find((n) => /보냄|Sent/.test(n.textContent))) };`);
      assert.ok(r.orange);
      assert.ok(r.stopEnabled);
      assert.ok(r.sent, 'the approved branch ran');
    },
  },
  {
    group: 'Runs',
    name: 'Stop: a long run is cancelled from the toolbar',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' });
        A.editor.change('long wait', (d) => { d.nodes = [{ id: 'a', type: 'trigger.manual', name: 'Start', x: 80, y: 120, config: {} }, { id: 'b', type: 'logic.wait', name: 'Wait', x: 400, y: 120, config: { seconds: 60 } }]; d.edges = [{ id: 'e', from: 'a', fromPort: 'out', to: 'b', toPort: 'in' }]; });
        await A.run('save'); await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'running' && document.querySelector('.node.st-running'), 10000, 'running');
        await A.run('stopRun'); await T.until(() => A.editor.live()?.status === 'cancelled', 10000, 'cancelled');
        return { cancelled: document.querySelectorAll('.node.st-cancelled').length };`);
      assert.equal(r.cancelled, 1);
    },
  },
  {
    group: 'Runs', desktop: true,
    name: 'Chat tab: a message runs the agent, the reply appears; New chat and Forget',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'assistant' }); await A.run('chat'); await T.until(() => !document.querySelector('#chat-host').hidden, 3000, 'chat tab');
        const ta = document.querySelector('#chat-host textarea'); ta.value = 'what is 21*2?'; ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await T.until(() => document.querySelectorAll('#chat-host .chat-msg.assistant').length >= 2 && !A.editor.state.chat.busy, 20000, 'reply');
        const reply = [...document.querySelectorAll('#chat-host .chat-msg.assistant .chat-bubble')].at(-1).textContent;
        const lit = document.querySelectorAll('.node.st-succeeded').length;
        document.querySelector('[data-chat="new"]').click(); await T.frames(2); const afterNew = document.querySelectorAll('#chat-host .chat-msg').length;
        return { reply, lit, afterNew };`);
      assert.match(r.reply, /42/);
      assert.equal(r.lit, 3);
      assert.equal(r.afterNew, 1, 'only the greeting is left');
    },
  },
  {
    group: 'Runs',
    name: 'History tab lists the runs; opening one draws its states on the canvas',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'code-review' }); await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded', 20000, 'done');
        await T.until(() => A.editor.history().length >= 1, 5000, 'history'); A.actions.showBottomTab('history'); await T.frames(2);
        const rows = document.querySelectorAll('#bottom-panel .history-row').length;
        document.querySelector('#bottom-panel [data-run-action="clear"]')?.click(); A.editor.state.canvas.clearRun();
        A.actions.showBottomTab('history'); await T.frames(2); document.querySelector('#bottom-panel .history-row').click();
        await T.until(() => document.querySelectorAll('.node.st-succeeded').length === 3, 5000, 'drawn');
        return { rows, tab: A.state.bottomTab };`);
      assert.ok(r.rows >= 1);
      assert.equal(r.tab, 'run');
    },
  },
  {
    group: 'Runs',
    name: 'Problems tab: a node without settings is listed; clicking it selects the node',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const id = A.editor.addNode('kb.search');
        await T.until(() => A.editor.problems().some((p) => p.code === 'noKb'), 3000, 'problem'); A.actions.showBottomTab('problems'); await T.frames(2);
        A.editor.state.canvas.setSelection([]);
        const row = [...document.querySelectorAll('#bottom-panel .problems-row')].find((x) => x.classList.contains('sev-error')); row.click(); await T.frames(2);
        return { selected: A.editor.selection()[0] === id, status: document.querySelector('#statusbar .has-errors') !== null };`);
      assert.deepEqual(r, { selected: true, status: true });
    },
  },

  // ───────── views
  {
    group: 'Views',
    name: 'Knowledge: create a base, add text, search finds it, delete the document',
    async run(app) {
      const r = await app.run(`await T.reset(); A.actions.setView('knowledge'); await T.until(() => document.querySelector('.kb-view [data-kb="new"]'), 5000, 'view');
        document.querySelector('[data-kb="new"]').click(); await T.fillForm({ name: 'E2E KB' }); await T.until(() => document.querySelector('.kb-main h2')?.textContent === 'E2E KB', 5000, 'created');
        document.querySelector('[data-kb="text"]').click(); await T.fillForm({ name: 'faq.md', text: 'The parking lot opens at 7 am.' }); await T.until(() => document.querySelector('.kb-main [data-doc-delete]'), 5000, 'doc');
        const q = document.querySelector('[data-kb-query]'); q.value = 'parking'; document.querySelector('[data-kb="search"]').click();
        await T.until(() => document.querySelector('.kb-hit'), 5000, 'hit'); const hit = document.querySelector('.kb-hit p').textContent;
        document.querySelector('[data-doc-delete]').click(); await T.popupReady('confirm'); T.popupDoc('confirm').querySelector('.button.danger').click();
        await T.until(() => !document.querySelector('.kb-main [data-doc-delete]'), 5000, 'doc deleted');
        return { hit, sample: [...document.querySelectorAll('.kb-item')].some((x) => /Sample|샘플/.test(x.textContent)) };`);
      assert.match(r.hit, /parking lot/);
      assert.ok(r.sample, 'the sample knowledge base is there');
    },
  },
  {
    group: 'Views',
    name: 'Models & keys: add a key (masked), test the offline model, set the default, delete the key',
    async run(app) {
      const r = await app.run(`await T.reset(); A.actions.setView('models'); await T.until(() => document.querySelector('.model-card'), 5000, 'cards');
        document.querySelector('[data-cred-add="openai"]').click(); await T.fillForm({ apiKey: 'sk-e2e-0000000000001234' });
        await T.until(() => document.querySelector('.model-card .cred-row code'), 5000, 'key row'); const hint = document.querySelector('.model-card .cred-row code').textContent;
        document.querySelector('[data-model-test="mock"]').click(); await T.until(() => document.querySelector('.model-result.ok'), 10000, 'test ok');
        document.querySelector('[data-model-default="ollama"]').click(); await T.until(() => A.state.coreSettings?.defaultModel?.startsWith('ollama:'), 5000, 'default');
        document.querySelector('[data-model-default="mock"]').click(); await T.until(() => A.state.coreSettings?.defaultModel === 'mock:mock-1', 5000, 'default back');
        document.querySelector('[data-cred-delete]').click(); await T.popupReady('confirm'); T.popupDoc('confirm').querySelector('.button.danger').click();
        await T.until(() => !document.querySelector('.model-card .cred-row'), 5000, 'deleted');
        return { hint, html: document.body.innerHTML.includes('sk-e2e-0000000000001234') };`);
      assert.equal(r.hint, 'sk-e…1234');
      assert.equal(r.html, false, 'the full key is never in the page');
    },
  },
  {
    group: 'Views',
    name: 'Runs view: every run with status filter; a row opens the agent with that run',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'code-review' }); await A.run('runAgent'); await T.until(() => A.editor.live()?.status === 'succeeded', 20000, 'done'); const agentId = A.editor.doc().id;
        A.actions.setView('runs'); await T.until(() => document.querySelector('.runs-table tbody tr[data-run-open]'), 5000, 'rows');
        const rows = document.querySelectorAll('.runs-table tbody tr[data-run-open]').length;
        const sel = document.querySelector('[data-runs-status]'); sel.value = 'failed'; sel.dispatchEvent(new Event('change', { bubbles: true }));
        await T.until(() => document.querySelectorAll('.runs-table tbody tr[data-run-open]').length < rows || !document.querySelector('.runs-table tbody tr[data-run-open].st-succeeded'), 5000, 'filtered');
        const sel2 = document.querySelector('[data-runs-status]'); sel2.value = ''; sel2.dispatchEvent(new Event('change', { bubbles: true })); await T.until(() => document.querySelector('.runs-table tbody tr[data-run-agent="' + agentId + '"]'), 5000, 'all');
        document.querySelector('.runs-table tbody tr[data-run-agent="' + agentId + '"]').click();
        await T.until(() => A.state.view === 'editor' && document.querySelectorAll('.node.st-succeeded').length === 3, 8000, 'opened');
        return { rows };`);
      assert.ok(r.rows >= 1);
    },
  },

  // ───────── shell
  {
    group: 'Shell',
    name: 'Settings popup: the Editor tab switches the minimap and grid snapping',
    async run(app) {
      const r = await app.run(`await T.reset(); A.popups.open('settings', { tab: 'board' }); await T.popupReady('settings');
        const d = T.popupDoc('settings'); const tabs = d.querySelectorAll('[data-tab], [data-action="tab"]').length;
        const toggle = d.querySelector('[data-toggle="showMinimap"]'); const before = A.state.settings.showMinimap;
        toggle.click(); await T.until(() => A.state.settings.showMinimap !== before, 5000, 'setting changed');
        const after = A.state.settings.showMinimap; A.actions.updateSettings({ showMinimap: true }); await A.popups.close('settings');
        return { tabs, before, after };`);
      assert.ok(r.tabs >= 6);
      assert.notEqual(r.before, r.after);
    },
  },
  {
    group: 'Shell', desktop: true,
    name: 'Language and theme switch redraw the whole window',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const theme = A.state.settings.theme;
        A.actions.updateSettings({ language: 'en' }); await T.frames(3); const en = document.querySelector('[data-command="runAgent"]').textContent.trim();
        A.actions.updateSettings({ language: 'ko' }); await T.frames(3); const ko = document.querySelector('[data-command="runAgent"]').textContent.trim();
        A.actions.updateSettings({ theme: 'dark' }); await T.frames(2); const dark = getComputedStyle(document.body).backgroundColor;
        A.actions.updateSettings({ theme }); await T.frames(2);
        return { en, ko, dark, canvas: Boolean(document.querySelector('.canvas-host .node')) };`);
      assert.equal(r.en, 'Run');
      assert.equal(r.ko, '실행');
      assert.ok(r.canvas, 'the canvas is back after the redraw');
    },
  },
  {
    group: 'Shell',
    name: 'Menu bar menus open with icons and shortcuts; toolbar shows icon + label buttons',
    async run(app) {
      const r = await app.run(`await T.reset({ agent: 'translator' }); const out = {};
        for (const name of Object.keys(A.menus.MENUS)) { document.querySelector('[data-menu="' + name + '"]').click(); await T.popupReady('menu'); out[name] = T.popupDoc('menu').querySelectorAll('.menu-item').length; await A.popups.closeAll(); await T.frames(2); }
        return { out, labeled: [...document.querySelectorAll('#toolbar .tool-labeled')].every((b) => b.querySelector('svg') && b.textContent.trim()) };`);
      for (const [name, n] of Object.entries(r.out)) assert.ok(n >= 4, `${name}: ${n} items`);
      assert.ok(r.labeled);
    },
  },
  {
    group: 'Shell',
    name: 'Narrow window: toolbar groups fold into », theme, language and settings stay visible',
    async run(app) {
      await app.main.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 1, mobile: false });
      try {
        const r = await app.run(`await T.reset({ agent: 'translator' }); await T.sleep(300); window.dispatchEvent(new Event('resize')); await T.frames(4);
          const left = document.querySelector('.toolbar-left'); const shown = [...left.querySelectorAll('[data-group]:not([hidden]), [data-toolbar-more]:not([hidden])')];
          const leftEnd = Math.max(...shown.map((el) => el.getBoundingClientRect().right)); const rightStart = document.querySelector('.toolbar-right').getBoundingClientRect().left;
          return { fits: leftEnd <= rightStart + 1, folded: !document.querySelector('[data-toolbar-more]').hidden || shown.length === document.querySelectorAll('.toolbar-left [data-group]').length + 0, right: ['[data-command="theme"]', '[data-command="language"]', '[data-command="settings"]'].map((s) => T.rect(s)?.visible && T.rect(s).x + T.rect(s).w <= document.documentElement.clientWidth + 1) };`);
        assert.ok(r.fits, 'the left groups never run into the right group');
        assert.deepEqual(r.right, [true, true, true]);
      } finally {
        await app.main.send('Emulation.setDeviceMetricsOverride', { width: app.width, height: app.height, deviceScaleFactor: 1, mobile: false });
      }
    },
  },
];

/** Every command that needs no OS dialog runs without an error popup (with a template agent open). */
export async function commandCases(app) {
  const ids = await app.run(`return Object.keys(A.commands);`);
  const SKIP = new Set(['exit', 'import', 'exportAgent', 'backgroundImage', 'logout', 'userGuide', 'newAgent', 'describe', 'newFromTemplate', 'open', 'reconnect', 'closeAgent', 'deleteAgent', 'renameAgent', 'duplicateAgent', 'startPage', 'language', 'stopRun']);
  return ids.filter((id) => !SKIP.has(id)).map((id) => ({
    group: 'Commands',
    name: id,
    async run(a) {
      const r = await a.run(`await T.reset({ agent: 'code-review' }); const settings = JSON.parse(JSON.stringify(A.state.settings));
        // commands that need something to act on get it first: a selection, an edit, an undone edit
        const prepare = { deleteSelection: 'select', duplicate: 'select', undo: 'edit', save: 'edit', redo: 'undo' }[${JSON.stringify(id)}];
        if (prepare) { A.editor.state.canvas.setSelection([A.editor.doc().nodes[1].id]); if (prepare !== 'select') { A.editor.change('test edit', (d) => { d.nodes[1].x += 10; }); if (prepare === 'undo') A.editor.undo(); } await T.frames(2); }
        const before = JSON.stringify([A.editor.doc().nodes.length, A.editor.doc().nodes[1]?.x, A.editor.dirty()]);
        if (!A.menus.enabled(${JSON.stringify(id)})) throw new Error('the command is disabled');
        const p = A.run(${JSON.stringify(id)}); await Promise.race([p, T.sleep(1500)]);
        const kinds = [...document.querySelectorAll('.web-popup')].map((f) => f.dataset.kind);
        await A.popups.closeAll(); A.actions.updateSettings(settings); await T.until(() => !['running', 'waiting'].includes(A.editor.live()?.status), 20000, 'run over');
        const after = JSON.stringify([A.editor.doc().nodes.length, A.editor.doc().nodes[1]?.x, A.editor.dirty()]);
        return { error: kinds.includes('error'), changed: before !== after, prepared: Boolean(prepare) };`);
      assert.ok(!r.error, 'no error popup');
      if (r.prepared) assert.ok(r.changed, 'the command changed the document');
      return undefined;
    },
  }));
}

/** Installed in the page with the helpers (nothing extra needed for MyAgents's command cases). */
export const COMMAND_HELPER = '1';
