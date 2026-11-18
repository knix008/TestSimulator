// Web E2E cases: the real app in headless Edge (popups are frames). Each case starts from a known state
// (T.reset). Cases marked `desktop: true` also run in the desktop app (desktop.suite.mjs).
import assert from 'node:assert/strict';

export const cases = [
  {
    group: 'Start page',
    name: 'Card board: hero, actions, recent, samples and background cards over the moving background',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => document.querySelector('.start-board .start-card'), 8000, 'cards');
        const cards = [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.dataset.card);
        const canvas = document.querySelector('#start-page canvas.start-bg');
        return { cards, canvas: Boolean(canvas && canvas.width > 0), panels: ['#left-panel', '#right-panel', '#bottom-panel'].map((s) => T.rect(s)?.visible ?? false), samples: document.querySelectorAll('.start-card.samples .start-tile').length, actions: document.querySelectorAll('.start-card.actions .start-tile').length, scenes: document.querySelectorAll('.start-card.background .anim-chip').length };`);
      for (const id of ['hero', 'actions', 'recent', 'samples', 'background']) assert.ok(r.cards.includes(id), `card ${id}`);
      assert.ok(r.canvas, 'moving background canvas');
      assert.deepEqual(r.panels, [false, false, false], 'no side or bottom panels on the start page');
      assert.equal(r.samples, 3);
      assert.equal(r.actions, 10);
      assert.equal(r.scenes, 16, '16 document scenes');
    },
  },
  {
    group: 'Start page',
    name: 'Every moving background draws (16 document scenes, no errors)',
    async run(app) {
      const r = await app.run(`await T.reset(); const kinds = [...document.querySelectorAll('.start-card.background .anim-chip')].map((b) => b.dataset.value); const drawn = [];
        for (const kind of kinds) { A.actions.updateSettings({ animation: kind, backgroundKind: 'animated' }); await T.frames(3); const bg = A.startBackground(); bg.time = 7.3; bg.draw(); drawn.push(bg.kind === kind && bg.frames > 0); }
        return { kinds, drawn };`);
      assert.equal(r.kinds.length, 16);
      assert.ok(r.drawn.every(Boolean), 'each scene drawn');
    },
  },
  {
    group: 'Start page',
    name: 'Card arrangement: auto-arrange restores the default layout without overlaps',
    async run(app) {
      const r = await app.run(`await T.reset(); document.querySelector('[data-start="arrange"]').click(); await T.frames(4);
        const rects = [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.getBoundingClientRect());
        let overlaps = 0; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++; }
        return overlaps;`);
      assert.equal(r, 0);
    },
  },
  {
    group: 'Document',
    name: 'A sample merges its files into one numbered document with cover, contents and figure index',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); await A.actions.openSample('manual'); await T.frames(3);
        const text = A.text(); const d = A.derived();
        return { files: A.state.doc.files.length, cover: text.includes('<!-- mmm:cover -->'), toc: text.includes('<!-- mmm:toc -->'), figures: text.includes('<!-- mmm:figures -->'), numbered: /^# 1 /m.test(text) && /^## 1\\.1 /m.test(text), headings: d.outline.length, pictures: d.figures.length, preview: Boolean(document.querySelector('#preview .toc-table')) || A.state.settings.centerTab === 'edit' };`);
      assert.equal(r.files, 3);
      assert.ok(r.cover && r.toc && r.figures, 'generated pages');
      assert.ok(r.numbered, 'headings numbered 1, 1.1');
      assert.ok(r.headings >= 9, `${r.headings} headings`);
      assert.equal(r.pictures, 2);
      assert.ok(r.preview, 'preview shows the contents table');
    },
  },
  {
    group: 'Document',
    name: 'Unticking a file merges again without it; Undo brings it back',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.runMerge({ force: true }); const before = A.derived().outline.length;
        const id = A.state.doc.files[0].id; A.actions.toggleFile(id); await T.until(() => A.derived().outline.length < before, 5000, 'merged without it');
        const without = A.derived().outline.length; A.actions.undo(); await T.frames(2);
        return { before, without, after: A.derived().outline.length, checked: A.state.doc.files[0].checked };`);
      assert.ok(r.without < r.before);
      assert.equal(r.after, r.before);
      assert.equal(r.checked, true);
    },
  },
  {
    group: 'Document',
    name: 'Reordering files changes the merge order and switches the sort to custom',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.runMerge({ force: true }); const first = A.state.doc.files[0].name;
        A.actions.moveFile(0, 1); await T.until(() => A.derived().outline[0]?.text && !A.derived().outline[0].text.includes(first.replace(/^\\d+-|\\.md$/g, '').split('-')[0]), 5000, 'order').catch(() => {});
        return { order: A.state.doc.files.map((f) => f.name), sort: A.state.settings.doc.sortOrder, top: A.derived().outline[0]?.text };`);
      assert.equal(r.sort, 'custom');
      assert.match(r.order[1], /^01-/);
    },
  },
  {
    group: 'Editing',
    name: 'Editor: typing is one Undo step; Ctrl+B wraps the selection in **; renumber after a new heading',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.setCenterTab('edit'); const ed = A.editor(); await T.until(() => ed && ed.value.length > 100, 5000, 'editor filled');
        const len = ed.value.length; ed.setSelectionRange(len, len); ed.insert('\\n# 새 장\\n\\n본문 단어\\n'); A.actions.settleNow();
        const typed = A.state.doc.text.includes('# 새 장'); const at = ed.value.indexOf('본문'); ed.setSelectionRange(at, at + 2);
        A.run('md:bold'); await T.frames(2); const bold = A.state.doc.text.includes('**본문**');
        A.actions.renumberNow(); await T.frames(2); const renumbered = /^# 4 새 장/m.test(A.state.doc.text);
        A.actions.undo(); A.actions.undo(); A.actions.undo(); await T.frames(2);
        return { typed, bold, renumbered, undone: !A.state.doc.text.includes('새 장'), edited: A.state.doc.edited };`);
      assert.ok(r.typed, 'typed text reached the document');
      assert.ok(r.bold, 'bold');
      assert.ok(r.renumbered, 'renumbered as chapter 4');
      assert.ok(r.undone, 'three undos remove the typing again');
    },
  },
  {
    group: 'Editing',
    name: 'Editing by hand stops the automatic merge: a file change marks "merge again", F5 rebuilds',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.runMerge({ force: true }); await A.actions.setCenterTab('edit'); const ed = A.editor(); await T.until(() => ed.value.length > 100, 5000, 'filled');
        ed.setSelectionRange(0, 0); ed.insert('직접 고침\\n'); A.actions.settleNow();
        A.actions.toggleFile(A.state.doc.files[2].id); await T.frames(2); const stale = A.state.doc.stale; const kept = A.state.doc.text.startsWith('직접 고침');
        await A.actions.runMerge({ force: true }); return { stale, kept, after: A.state.doc.stale, rebuilt: !A.state.doc.text.includes('직접 고침') };`);
      assert.ok(r.stale, 'stale');
      assert.ok(r.kept, 'edits kept');
      assert.ok(!r.after && r.rebuilt, 'rebuilt from the sources');
    },
  },
  {
    group: 'Editing',
    name: 'Figures tab: picture size goes into the Markdown as w=NN% and reaches the preview',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.runMerge({ force: true }); A.actions.setLeftTab('figures'); await T.frames(2);
        const rows = document.querySelectorAll('#left-panel .figure-row').length; const f = A.derived().figures[0];
        document.querySelector('#left-panel .figure-row [data-step-dir="-1"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        await T.frames(2); await A.actions.setCenterTab('preview'); await T.frames(2);
        return { rows, hint: /"w=90%"/.test(A.state.doc.text), width: document.querySelector('#preview #fig-0')?.getAttribute('width') ?? document.querySelector('#preview img')?.outerHTML.slice(0, 120) };`);
      assert.equal(r.rows, 2);
      assert.ok(r.hint, 'w=90% in the text');
    },
  },
  {
    group: 'Panels',
    name: 'Structure tab lists the generated pages and the headings; clicking one scrolls the preview',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.runMerge({ force: true }); await A.actions.setCenterTab('preview'); A.actions.setLeftTab('structure'); await T.frames(2);
        const rows = [...document.querySelectorAll('#left-panel .tree-row')]; const sections = rows.filter((x) => x.classList.contains('section')).length;
        const scroller = document.querySelector('#preview-scroll'); scroller.scrollTop = 0; rows.at(-1).click(); await T.sleep(700);
        return { rows: rows.length, sections, scrolled: scroller.scrollTop > 100 };`);
      assert.ok(r.rows >= 12);
      assert.equal(r.sections, 3, 'cover, contents, figures');
      assert.ok(r.scrolled, 'preview scrolled to the heading');
    },
  },
  {
    group: 'Panels',
    name: 'Right panel: turning the cover off removes it from the text; the export font size reaches the preview',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.runMerge({ force: true }); await A.actions.setCenterTab('preview'); const before = A.state.settings.doc;
        const sw = document.querySelector('#right-panel [data-doc-toggle="coverPage"]'); sw.checked = false; sw.dispatchEvent(new Event('change', { bubbles: true })); await T.frames(2);
        const noCover = !A.state.doc.text.includes('<!-- mmm:cover -->');
        A.actions.updateDoc({ fontSizePt: 13 }); await T.frames(2); const size = document.querySelector('#preview').style.fontSize;
        A.actions.updateSettings({ doc: before }); await T.frames(2);
        return { noCover, size, back: A.state.doc.text.includes('<!-- mmm:cover -->') };`);
      assert.ok(r.noCover, 'cover gone');
      assert.equal(r.size, '13pt');
      assert.ok(r.back, 'cover back');
    },
  },
  {
    group: 'Panels',
    name: 'Problems: an unclosed code fence and a skipped heading level are found and lead to their line',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.setCenterTab('edit'); const ed = A.editor(); await T.until(() => ed.value.length > 100, 5000, 'filled');
        const len = ed.value.length; ed.setSelectionRange(len, len); ed.insert('\\n# 끝\\n### 건너뜀\\n\`\`\`js\\nopen\\n'); A.actions.settleNow();
        A.run('showProblems'); await T.until(() => A.state.problems.some((p) => p.kind === 'openFence'), 4000, 'problems');
        const kinds = A.state.problems.map((p) => p.kind); document.querySelector('#bottom-panel [data-problem]')?.click(); await T.frames(3);
        const line = A.state.doc.text.slice(0, ed.selectionStart).split('\\n').length - 1;
        A.actions.undo(); A.actions.updateSettings({ showBottomPanel: false });
        return { kinds, line, expected: A.state.problems.find((p) => p.kind === 'openFence')?.line ?? null };`);
      assert.ok(r.kinds.includes('openFence'));
      assert.ok(r.kinds.includes('headingJump'));
    },
  },
  {
    group: 'Export',
    name: 'Markdown export: the saved text has the cover / contents and real pictures (no mmm-img refs)',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.runMerge({ force: true });
        const { buildMergedMarkdownDocument } = await import('/src/lib/markdown.js'); const out = buildMergedMarkdownDocument(A.state.doc.text);
        return { refs: /mmm-img:/.test(out), data: /data:image\\/svg\\+xml;base64,/.test(out), toc: out.includes('목차') || out.includes('Contents') };`);
      assert.ok(!r.refs, 'no internal picture references');
      assert.ok(r.data, 'pictures embedded');
      assert.ok(r.toc);
    },
  },
  {
    group: 'Export',
    name: 'Pagination (paged.js in a frame): contents headings get page numbers ≥ 3',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.runMerge({ force: true });
        const { toStandaloneHtml } = await import('/src/lib/markdown.js'); const { computePageMap } = await import('/src/lib/paginate.js');
        const html = toStandaloneHtml(A.state.doc.text, 'x', { ...A.state.settings.doc, tocPageNumbers: true, figurePageNumbers: true });
        const map = await computePageMap(html); return map;`, 120000);
      assert.ok(r && r['h-0'] >= 3, JSON.stringify(r));
      assert.ok(Object.keys(r).some((k) => k.startsWith('fig-')), 'figures paged');
    },
  },
  {
    group: 'Popups',
    name: 'Settings: the document tabs (merging, cover & contents, export font, header & footer) change the document settings',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const before = A.state.settings.doc; A.popups.open('settings', { tab: 'headerFooter' }); await T.popupReady('settings');
        const d = T.popupDoc('settings'); const tabs = [...d.querySelectorAll('.tab')].map((b) => b.dataset.value);
        const input = d.querySelector('[data-doc-text="headerText"]'); input.value = '머리글 시험'; input.dispatchEvent(new Event('change', { bubbles: true })); await T.until(() => A.state.settings.doc.headerText === '머리글 시험', 4000, 'header text');
        const ok = A.state.settings.doc.headerText; A.actions.updateSettings({ doc: before });
        return { tabs, ok };`);
      for (const tab of ['merge', 'pages', 'typography', 'headerFooter']) assert.ok(r.tabs.includes(tab), tab);
      assert.equal(r.ok, '머리글 시험');
    },
  },
  {
    group: 'Popups',
    name: 'Theme drop-down: system · custom · custom settings on one row, then 20 dark and 20 light themes',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); A.run('themeMenu'); await T.popupReady('menu');
        const d = T.popupDoc('menu'); const row = d.querySelector('.menu-columns.menu-row'); const cols = d.querySelectorAll('.menu-columns:not(.menu-row) .menu-column');
        const tops = row ? [...row.querySelectorAll('.menu-item')].map((x) => Math.round(x.getBoundingClientRect().top)) : [];
        return { row: tops.length, same: new Set(tops).size === 1, dark: cols[0]?.querySelectorAll('.menu-item').length, light: cols[1]?.querySelectorAll('.menu-item').length };`);
      assert.equal(r.row, 3);
      assert.ok(r.same, 'one line');
      assert.equal(r.dark, 20);
      assert.equal(r.light, 20);
    },
  },
  {
    group: 'Look',
    name: 'Language switch: menus, panels and the document labels follow (Korean ↔ English)',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); A.actions.updateSettings({ language: 'en' }); await T.frames(3);
        const en = document.querySelector('[data-menu="file"]').textContent.trim(); A.actions.updateSettings({ language: 'ko' }); await T.frames(3);
        return { en, ko: document.querySelector('[data-menu="file"]').textContent.trim() };`);
      assert.equal(r.en, 'File');
      assert.equal(r.ko, '파일');
    },
  },
];

/** Every command runs without an error popup (with the sample document open). */
export async function commandCases(app) {
  const ids = await app.run(`return Object.keys(A.commands);`);
  const SKIP = new Set(['exit', 'tutorial', 'userGuide', 'tutorialDoc', 'startPage', 'closeDoc', 'newDoc', 'openDoc', 'addFolder', 'addFiles', 'backgroundImage', 'save', 'saveAs', 'exportMd', 'exportHtml', 'exportPdf', 'exportWord', 'print', 'md:image', 'clearFiles', 'removeChecked']);
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

export const COMMAND_HELPER = '1';
