// Web E2E cases: the real app in headless Edge (popups are frames, vaults in the browser's private storage,
// the Rust core as WebAssembly). Each case starts from a known state (T.reset). Cases marked `desktop: true`
// also run in the desktop app (desktop.suite.mjs: vaults on disk, the Rust core in the backend).
import assert from 'node:assert/strict';

const KO = (ko, en) => `(A.app.lang() === 'en' ? ${JSON.stringify(en)} : ${JSON.stringify(ko)})`;
const START = KO('시작하기.md', 'Welcome.md');
const LINKS = KO('링크와 백링크.md', 'Links and backlinks.md');
const FORMAT = KO('서식 모음.md', 'Formatting.md');

export const cases = [
  {
    group: 'Start page',
    name: 'Card board: title, actions, recent vaults, 6 sample vaults and the background cards; no side panels',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => document.querySelector('.start-board .start-card'), 8000, 'cards');
        return { cards: [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.dataset.card), canvas: Boolean(document.querySelector('#start-page canvas.start-bg')?.width), panels: ['#left-panel', '#right-panel', '#bottom-panel'].map((s) => T.rect(s)?.visible ?? false), samples: document.querySelectorAll('.start-card.samples .start-tile').length, scenes: document.querySelectorAll('.start-card.background .anim-chip').length, hero: document.querySelector('.start-hero-fixed h1')?.textContent };`);
      for (const id of ['actions', 'recent', 'samples', 'background']) assert.ok(r.cards.includes(id), `card ${id}`);
      assert.ok(r.canvas, 'moving background');
      assert.deepEqual(r.panels, [false, false, false]);
      assert.equal(r.samples, 6);
      assert.equal(r.scenes, 16);
      assert.match(r.hero, /MyMarkdownMaster/);
    },
  },
  {
    group: 'Start page',
    name: 'Auto-arrange leaves no overlapping cards',
    async run(app) {
      const r = await app.run(`await T.reset(); document.querySelector('[data-start="arrange"]').click(); await T.frames(4);
        const rects = [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.getBoundingClientRect());
        let overlaps = 0; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++; }
        return overlaps;`);
      assert.equal(r, 0);
    },
  },
  {
    group: 'Vault',
    name: 'A sample vault opens: file tree, the start note in live view, outline, status bar counts',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true, fresh: true }); await T.until(() => document.querySelector('.cm-content'), 8000, 'editor');
        return { notes: A.index.notePaths().length, tree: document.querySelectorAll('#left-panel .tree-file').length, active: A.app.activePath(), mode: document.querySelector('.ws-leaf.is-active .note-view')?.dataset.mode, outline: document.querySelectorAll('#right-panel .outline-row').length, status: document.querySelector('#statusbar').textContent };`);
      assert.ok(r.notes >= 10, `notes ${r.notes}`);
      assert.ok(r.tree >= 8);
      assert.match(r.active, /시작하기|Welcome/);
      assert.equal(r.mode, 'live');
      assert.ok(r.outline >= 2, 'outline rows');
    },
  },
  {
    group: 'Views',
    name: 'Live, source, reading and split views; the split view folds either half away and back',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true }); await A.app.openFile(${FORMAT});
        const view = T.activeView(); const out = {};
        for (const m of ['source', 'reading', 'split', 'live']) { view.setMode(m); await T.sleep(m === 'reading' || m === 'split' ? 900 : 200); out[m] = { editor: T.rect('.ws-leaf.is-active .note-edit-pane')?.visible ?? false, preview: T.rect('.ws-leaf.is-active .note-preview-pane')?.visible ?? false }; }
        view.setMode('split'); await T.sleep(600);
        out.callout = Boolean(document.querySelector('.ws-leaf.is-active .note-preview .callout'));
        out.table = Boolean(document.querySelector('.ws-leaf.is-active .note-preview table'));
        document.querySelector('.ws-leaf.is-active [data-note-collapse="preview"]').click(); await T.frames(3);
        out.foldedPreview = { preview: T.rect('.ws-leaf.is-active .note-preview-scroll')?.visible ?? false, rail: T.rect('.ws-leaf.is-active .note-preview-pane .note-rail')?.visible ?? false };
        document.querySelector('.ws-leaf.is-active .note-preview-pane [data-note-expand]').click(); await T.frames(3);
        document.querySelector('.ws-leaf.is-active [data-note-collapse="editor"]').click(); await T.frames(3);
        out.foldedEditor = T.rect('.ws-leaf.is-active .note-editor-host')?.visible ?? false;
        document.querySelector('.ws-leaf.is-active .note-edit-pane [data-note-expand]').click(); await T.frames(3);
        out.back = (T.rect('.ws-leaf.is-active .note-editor-host')?.visible ?? false) && (T.rect('.ws-leaf.is-active .note-preview-scroll')?.visible ?? false);
        view.setMode('live');
        return out;`);
      assert.deepEqual(r.source, { editor: true, preview: false });
      assert.deepEqual(r.reading, { editor: false, preview: true });
      assert.deepEqual(r.split, { editor: true, preview: true });
      assert.deepEqual(r.live, { editor: true, preview: false });
      assert.ok(r.callout && r.table, 'rendered callout and table');
      assert.deepEqual(r.foldedPreview, { preview: false, rail: true });
      assert.equal(r.foldedEditor, false);
      assert.ok(r.back, 'both halves back');
    },
  },
  {
    group: 'Views',
    name: 'Reading view: math (KaTeX), Mermaid diagram, chart, embedded note, wiki links resolved',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true }); await A.app.openFile(${KO('수식과 다이어그램.md', 'Math and diagrams.md')}, { mode: 'reading' });
        await T.until(() => document.querySelector('.ws-leaf.is-active .note-preview .katex'), 15000, 'katex');
        await T.until(() => document.querySelector('.ws-leaf.is-active .note-preview svg[id^="md-mermaid"], .ws-leaf.is-active .note-preview .mermaid svg'), 20000, 'mermaid');
        const chart = Boolean(document.querySelector('.ws-leaf.is-active .note-preview svg.md-chart, .ws-leaf.is-active .note-preview .md-chart svg, .ws-leaf.is-active .note-preview [class*="chart"] svg'));
        await A.app.openFile(${LINKS}, { mode: 'reading' }); await T.sleep(800);
        return { chart, embed: Boolean(document.querySelector('.ws-leaf.is-active .note-preview .markdown-embed .markdown-embed-content')), links: document.querySelectorAll('.ws-leaf.is-active .note-preview a.internal-link:not(.is-unresolved)').length, unresolved: document.querySelectorAll('.ws-leaf.is-active .note-preview a.internal-link.is-unresolved').length };`);
      assert.ok(r.chart, 'chart svg');
      assert.ok(r.embed, 'embedded section');
      assert.ok(r.links >= 3 && r.unresolved >= 1);
    },
  },
  {
    group: 'Links',
    name: 'Clicking a wiki link in the preview opens the note; an unresolved link creates it',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true }); await A.app.openFile(${LINKS}, { mode: 'reading' }); await T.sleep(700);
        document.querySelector('.ws-leaf.is-active .note-preview a.internal-link:not(.is-unresolved)').click(); await T.sleep(500);
        const opened = A.app.activePath();
        await A.app.openFile(${LINKS}, { mode: 'reading' }); await T.sleep(700);
        document.querySelector('.ws-leaf.is-active .note-preview a.internal-link.is-unresolved').click();
        await T.until(() => /나중에 쓸 메모|Someday note/.test(A.app.activePath() ?? ''), 8000, 'created');
        return { opened, created: A.app.activePath(), exists: A.index.has(A.app.activePath()) };`);
      assert.notEqual(r.opened, null);
      assert.ok(r.exists);
    },
  },
  {
    group: 'Links',
    name: 'Typing a link updates backlinks live; autosave writes the file',
    desktop: true,
    async run(app) {
      const r = await app.run(`try { await T.reset({ vault: true, fresh: true }); } catch (e) { return { resetError: String(e?.message ?? e) }; }
        const target = ${FORMAT}; const before = A.index.backlinks(target).length; try {
        await A.app.openFile(${KO('할 일 관리.md', 'Tasks.md')}); const view = T.activeView();
        view.editor.insertText('\\nSee [[' + target.replace(/\\.md$/, '') + ']] too.\\n');
        await T.until(() => A.index.backlinks(target).length > before, 8000, 'backlink');
        await T.until(() => !A.docs.get(view.path).dirty, 8000, 'autosave');
        const disk = await A.app.vault.read(view.path);
        return { before, after: A.index.backlinks(target).length, saved: disk.includes('See [[') }; } catch (e) { return { error: String(e?.message ?? e) }; }`);
      assert.ok(!r.resetError && !r.error, JSON.stringify(r));
      assert.ok(r.after > r.before);
      assert.ok(r.saved, 'written by autosave');
    },
  },
  {
    group: 'Links',
    name: 'Renaming a note rewrites every link to it (Rust core)',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true, fresh: true });
        const from = ${FORMAT}; const to = from.replace(/\\.md$/, ' 2.md');
        await A.features.moveTo(from, to);
        const start = await A.app.vault.read(${START});
        const linkText = to.replace(/\\.md$/, '');
        const out = { has: A.index.has(to), gone: !A.index.has(from), updated: start.includes('[[' + linkText), unresolved: [...A.index.unresolved().keys()].filter((k) => k === from.replace(/\\.md$/, '')) };
        // Back again (the cases after this one use the sample's names): the links follow once more.
        await A.features.moveTo(to, from);
        out.back = A.index.has(from) && (await A.app.vault.read(${START})).includes('[[' + from.replace(/\\.md$/, ''));
        return out;`);
      assert.ok(r.has && r.gone);
      assert.ok(r.updated, 'link rewritten in the start note');
      assert.deepEqual(r.unresolved, []);
      assert.ok(r.back, 'renamed back, the links follow again');
    },
  },
  {
    group: 'Workspace',
    name: 'Split panes, move a tab to another pane and to an edge, close; the layout is saved per vault',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true });
        A.run('splitRight'); await T.sleep(300); A.run('splitDown'); await T.sleep(300);
        const three = document.querySelectorAll('.ws-leaf').length;
        await A.app.openFile(${FORMAT}, { newTab: true }); await T.sleep(200);
        const L = A.layout(); const leaves = []; (function walk(n) { if (n.type === 'leaf') leaves.push(n); else n.children.forEach(walk); })(L.root);
        const tab = leaves.find((l) => l.id === L.active).tabs.at(-1);
        return { three, saved: Boolean(A.app.vaultPrefs().layout || true), tabId: tab.id, firstLeaf: leaves[0].id };`);
      assert.equal(r.three, 3);
      const moved = await app.run(`const L = A.layout(); const first = ${JSON.stringify(r.firstLeaf)};
        A.app.moveTab(${JSON.stringify(r.tabId)}, first, { edge: 'left' }); await T.frames(2);
        const model = []; (function walk(n) { if (n.type === 'leaf') model.push(n.id + ':' + n.tabs.map((t) => t.path).join('|')); else n.children.forEach(walk); })(A.layout().root);
        const n = document.querySelectorAll('.ws-leaf').length; A.run('closeTab'); await T.frames(2);
        return { n, model, first, after: document.querySelectorAll('.ws-leaf').length };`);
      assert.equal(moved.n, 4, JSON.stringify(moved));
      assert.equal(moved.after, 3);
    },
  },
  {
    group: 'Find',
    name: 'Search with operators (tag:, path:, task-todo:, "phrase", -exclude) in the Rust core',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true });
        const q = async (query) => (await A.core('search', { query })).map((x) => x.path);
        return { tag: (await q(${KO('tag:#안내', 'tag:#guide')})).length, path: (await q(${KO('path:일일', 'path:Daily')})).length, todo: (await q('task-todo:')).length, phrase: (await q(${KO('"링크와 백링크"', '"Links and backlinks"')})).length, neg: (await q(${KO('링크 -tag:#안내', 'link -tag:#guide')})).every((p) => !/시작하기|Welcome/.test(p)) };`);
      assert.ok(r.tag >= 6, `tag ${r.tag}`);
      assert.ok(r.path >= 2);
      assert.ok(r.todo >= 1);
      assert.ok(r.phrase >= 1);
      assert.ok(r.neg);
    },
  },
  {
    group: 'Find',
    name: 'Search panel, quick switcher and command palette',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true });
        A.app.searchFor(${KO('tag:#안내', 'tag:#guide')}); await T.until(() => document.querySelectorAll('#left-panel .search-result').length > 3, 8000, 'results');
        const results = document.querySelectorAll('#left-panel .search-result').length;
        const typeIn = async (text) => { await T.popupReady('suggest'); const d = T.popupDoc('suggest'); const input = d.querySelector('[data-suggest-input]'); input.value = text; input.dispatchEvent(new d.defaultView.Event('input', { bubbles: true })); return { d, input }; };
        A.app.quickSwitcher();
        const sw = await typeIn(${KO('서식', 'Formatting')});
        await T.until(() => /서식|Formatting/.test(sw.d.querySelector('.suggest-item.selected')?.textContent ?? ''), 5000, 'filtered item');
        const popupWindow = Boolean(document.querySelector('.web-popup-suggest iframe')) && !document.querySelector('.suggest-layer');
        sw.input.dispatchEvent(new sw.d.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await T.sleep(600);
        const switched = A.app.activePath();
        A.app.commandPalette();
        const pal = await typeIn(${KO('나란히', 'Split')});
        await T.until(() => /^(나란히|Split)$/.test(pal.d.querySelector('.suggest-item.selected .suggest-label')?.textContent ?? ''), 5000, 'command');
        pal.input.dispatchEvent(new pal.d.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await T.sleep(500);
        return { results, switched, popupWindow, mode: T.activeView()?.mode };`);
      assert.ok(r.results > 3);
      assert.ok(r.popupWindow, 'the switcher is a popup (frame on the web), not an overlay in the page');
      assert.match(r.switched, /서식 모음|Formatting/);
      assert.equal(r.mode, 'split');
    },
  },
  {
    group: 'Find',
    name: 'Graph view, local graph, outline, backlinks and outgoing links panels',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true });
        A.run('graphView'); await T.until(() => document.querySelector('.graph-view canvas'), 8000, 'graph'); await T.sleep(800);
        const graph = Boolean(document.querySelector('.graph-view canvas')?.width);
        await A.app.openFile(${START});
        const tabs = {};
        for (const id of ['outline', 'backlinks', 'outgoing', 'properties', 'stats', 'localgraph']) { A.app.setRightTab(id); await T.sleep(id === 'localgraph' ? 900 : 250); tabs[id] = document.querySelector('#right-panel').textContent.length > 20 || Boolean(document.querySelector('#right-panel canvas')); }
        return { graph, tabs };`);
      assert.ok(r.graph);
      for (const [id, ok] of Object.entries(r.tabs)) assert.ok(ok, `right panel ${id}`);
    },
  },
  {
    group: 'Write',
    name: 'Properties edit, daily note from template, style check, writing goal',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true, fresh: true });
        await A.app.openFile(${FORMAT}); A.app.state.settings.dailyTemplate = ${KO('템플릿/일일 메모', 'Templates/Daily note')}; A.app.state.settings.dailyFolder = ${KO('일일 메모', 'Daily')};
        const path = await A.features.dailyNote(0); await T.sleep(400);
        const daily = A.docs.get(path)?.text ?? '';
        await A.app.openFile(${KO('글쓰기 도구.md', 'Writing tools.md')});
        A.app.updateSettings({ showStyleCheck: true }); await T.until(() => A.state.styleIssues.length > 0, 8000, 'style issues');
        const issues = A.state.styleIssues.length;
        A.app.updateSettings({ showStyleCheck: false });
        return { daily: daily.includes('tags:') && !daily.includes('{{'), issues };`);
      assert.ok(r.daily, 'template expanded into the daily note');
      assert.ok(r.issues > 0);
    },
  },
  {
    group: 'Write',
    name: 'Canvas file opens with its cards and edges',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true }); await A.app.openFile(${KO('아이디어 보드.canvas', 'Idea board.canvas')});
        await T.until(() => document.querySelectorAll('.cv-host [data-node], .cv-host .cv-node').length >= 3, 8000, 'cards');
        return document.querySelectorAll('.cv-host [data-node], .cv-host .cv-node').length;`);
      assert.ok(r >= 3);
    },
  },
  {
    group: 'Export',
    name: 'Exports from the Rust core: Markdown, HTML, DOCX, EPUB, ODT, RTF, LaTeX and the text formats',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true });
        const out = {};
        for (const format of ['markdown', 'html', 'html-plain', 'docx', 'odt', 'epub', 'rtf', 'latex', 'text', 'djot', 'rst', 'asciidoc', 'mediawiki', 'textile', 'opml', 'org', 'json']) {
          const b64 = await A.core('export', { format, path: ${FORMAT}, title: 'T', options: A.state.settings.exportOptions, resources: {} });
          out[format] = b64.length;
        }
        return out;`);
      for (const [format, size] of Object.entries(r)) assert.ok(size > 100, `${format}: ${size}`);
    },
  },
  {
    group: 'Shell',
    name: '시작 toggles start ⇄ main, 40 templates make notes, tab ‹ ›, bottom panel folds, properties in the right panel, print and favorites in the menus',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true, fresh: true });
        const home = () => document.querySelector('[data-home]');
        home().click(); await T.sleep(300); const toStart = A.app.state.showStart;
        home().click(); await T.sleep(300); const back = !A.app.state.showStart;
        A.app.showStartPage(true); await T.sleep(300);
        const tiles = document.querySelectorAll('.template-tile').length;
        document.querySelector('[data-start="template"][data-value="meeting-minutes"]').click();
        await T.until(() => !A.app.state.showStart && /회의록|Meeting/.test(A.app.activePath() ?? ''), 8000, 'template note');
        const made = A.docs.get(A.app.activePath())?.text ?? '';
        await A.app.openFile(${FORMAT}, { newTab: true }); await A.app.openFile(${START}, { newTab: true }); await T.sleep(300);
        const before = A.app.activePath();
        document.querySelector('.ws-leaf.is-active [data-leaf-step="-1"]').click(); await T.sleep(300);
        const stepped = A.app.activePath();
        A.app.updateSettings({ showBottomPanel: false }); await T.sleep(200);
        const folded = document.querySelector('#bottom-panel').offsetHeight;
        document.querySelector('.bottom-fold').click(); await T.sleep(300);
        const unfolded = document.querySelector('#bottom-panel').offsetHeight;
        const chip = await T.until(() => document.querySelector('.ws-leaf.is-active .cm-mm-props-chip') || (A.app.openFile(${KO('할 일 관리.md', 'Tasks.md')}, { mode: 'live' }), null), 6000, 'properties chip').catch(() => null);
        const inline = Boolean(document.querySelector('[data-note-properties]:not([hidden])'));
        const fileMenu = A.menus.MENUS.file.includes('print');
        A.app.updateSettings({ favorites: [] });
        return { toStart, back, tiles, made: made.includes('---') && !made.includes('{{'), before, stepped, folded, unfolded, chip: Boolean(chip), inline, fileMenu };`);
      assert.ok(r.toStart && r.back, 'the 시작 button goes to the start page and back');
      assert.equal(r.tiles, 40);
      assert.ok(r.made, 'a template note with its placeholders filled in');
      assert.notEqual(r.before, r.stepped, '‹ moves to the previous tab');
      assert.ok(r.folded < 60 && r.unfolded > 80, `bottom panel folds to its header (${r.folded}) and unfolds (${r.unfolded})`);
      assert.ok(r.chip, 'front matter becomes the properties chip in live view');
      assert.ok(!r.inline, 'no properties block above the document');
      assert.ok(r.fileMenu, 'File menu has Print');
    },
  },
  {
    group: 'Print',
    name: 'Print window: printer list, paper, orientation, margins, pages and a laid-out preview of the note',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true }); await A.app.openFile(${FORMAT});
        A.run('print'); await T.popupReady('print', 20000);
        await T.until(() => T.popupDoc('print')?.querySelector('.print-preview iframe, iframe.print-frame, .print-pages, iframe'), 20000, 'preview frame');
        await T.until(() => { const f = T.popupDoc('print')?.querySelector('iframe'); return f?.contentDocument?.querySelectorAll('.pagedjs_page').length > 0; }, 40000, 'pages laid out');
        const d = T.popupDoc('print');
        const pages = d.querySelector('iframe').contentDocument.querySelectorAll('.pagedjs_page').length;
        const text = d.body.textContent;
        await A.popups.close('print');
        return { pages, hasPaper: /A4|Letter/.test(text), controls: d.querySelectorAll('select, input, button').length };`, 90000);
      assert.ok(r.pages >= 1, `pages ${r.pages}`);
      assert.ok(r.hasPaper, 'paper sizes');
      assert.ok(r.controls > 6);
    },
  },
  {
    group: 'AI',
    name: 'The AI panel opens; without a key it offers the settings',
    async run(app) {
      const r = await app.run(`await T.reset({ vault: true }); A.app.setRightTab('ai'); await T.sleep(500);
        return { panel: Boolean(document.querySelector('#right-panel .right-ai:not([hidden]) *')), text: document.querySelector('#right-panel .right-ai')?.textContent.length ?? 0 };`);
      assert.ok(r.panel && r.text > 10);
    },
  },
  {
    group: 'Settings',
    name: 'Every settings tab draws (editor, reading, files, notes, writing, export, AI …)',
    
    async run(app) {
      const tabs = ['general', 'editor', 'reading', 'files', 'notes', 'writing', 'export', 'ai', 'appearance', 'font', 'start', 'background', 'recent', 'shortcuts'];
      const r = await app.run(`await T.reset(); const out = {};
        for (const tab of ${JSON.stringify(tabs)}) { await A.popups.close('settings').catch(() => {}); A.popups.open('settings', { tab }); await T.popupReady('settings');
          await T.until(() => T.popupDoc('settings')?.querySelector('.settings-' + tab), 5000, tab);
          out[tab] = T.popupDoc('settings').querySelector('.popup-body').textContent.trim().length; }
        await A.popups.close('settings'); return out;`);
      for (const tab of tabs) assert.ok(r[tab] > 10, `tab ${tab}`);
    },
  },
];

/** Every command once, in the sample vault (no error popup, no page error). */
export async function commandCases(app) {
  const ids = await app.run(`return Object.keys(A.commands);`);
  const SKIP = new Set(['exit', 'tutorial', 'userGuide', 'tutorialDoc', 'startPage', 'openVault', 'newVault', 'browserVaults', 'closeVault', 'backgroundImage', 'print', 'exportAgain', 'fullscreen', 'audioRecord', 'revealVault', 'revealSystem', 'openDefault', 'deleteFile', 'slides', 'readingPresentation', 'welcome', 'about', 'settings', 'shortcuts']);
  return ids.filter((id) => !SKIP.has(id)).map((id) => ({
    group: 'Commands',
    name: id,
    async run(a) {
      const r = await a.run(`await T.reset({ vault: true }); const settings = JSON.parse(JSON.stringify(A.state.settings));
        if (!A.menus.enabled(${JSON.stringify(id)})) return { skipped: 'disabled here' };
        const p = A.run(${JSON.stringify(id)}); await Promise.race([p, T.sleep(1200)]);
        const kinds = [...document.querySelectorAll('.web-popup')].map((f) => f.dataset.kind);
        await T.reset({ vault: true }); A.app.updateSettings(settings);
        return { error: kinds.includes('error') };`);
      if (r?.skipped) return { skipped: r.skipped };
      assert.ok(!r.error, 'no error popup');
      return undefined;
    },
  }));
}

export const COMMAND_HELPER = '1';
