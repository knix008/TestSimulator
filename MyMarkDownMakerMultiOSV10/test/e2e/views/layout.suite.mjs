// Web E2E cases for the window's layout and the editing details asked for after the first version:
// Undo / Redo caret, moving pictures and files, page views, settings tabs, panel switches, status bar,
// start page, contents leaders and page numbers, logo, chapter breaks, heading sizes, print window, export.
import assert from 'node:assert/strict';

const pointer = `const fire = (type, x, y, el = window, id = 7) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: id }));`;

export const cases = [
  {
    group: 'Editing',
    name: 'Undo / Redo put the caret on the changed text, not at the top (the contents rewrite above it is ignored)',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.setCenterTab('edit'); const ed = A.editor(); await T.until(() => ed.value.length > 500, 5000, 'filled');
        const at = ed.value.indexOf('## 1.2 첫 화면') + '## 1.2 '.length; ed.setSelectionRange(at, at); ed.insert('새 '); A.actions.settleNow();
        await T.until(() => A.state.doc.text.includes('[1.2 새 첫 화면]'), 4000, 'contents followed the heading');
        ed.setSelectionRange(0, 0); A.actions.undo(); await T.frames(3);
        const afterUndo = ed.selectionStart; const undoneAt = ed.value.indexOf('## 1.2 첫 화면');
        A.actions.redo(); await T.frames(3);
        return { afterUndo, undoneAt, afterRedo: ed.selectionStart, redoneAt: ed.value.indexOf('## 1.2 새 첫 화면'), tocAt: ed.value.indexOf('<!-- mmm:toc -->') };`);
      assert.ok(r.afterUndo > r.tocAt + 100, `caret ${r.afterUndo} is below the contents (${r.tocAt})`);
      assert.ok(Math.abs(r.afterUndo - (r.undoneAt + 7)) <= 2, `undo caret ${r.afterUndo} at the change (${r.undoneAt + 7})`);
      assert.ok(Math.abs(r.afterRedo - (r.redoneAt + 7)) <= 2, `redo caret ${r.afterRedo} at the change (${r.redoneAt + 7})`);
    },
  },
  {
    group: 'Editing',
    name: 'Pictures in the editor: shown inline, dragged to another place they move there (one Undo step), a drop caret follows',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.setCenterTab('edit'); const ed = A.editor(); await T.until(() => document.querySelector('.cm-picture img'), 5000, 'picture widget');
        ${pointer}
        const pic = document.querySelector('.cm-picture'); pic.scrollIntoView({ block: 'center' }); await T.sleep(200);
        const before = A.text().indexOf('![첫 화면'); const b = pic.getBoundingClientRect();
        const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes('시작 화면에서')); const t = line.getBoundingClientRect();
        fire('pointerdown', b.left + 20, b.top + 20, pic); fire('pointermove', b.left + 40, b.top + 40); fire('pointermove', t.left + 6, t.top + t.height / 2);
        const caret = Boolean(document.querySelector('.cm-picture-drop')); fire('pointerup', t.left + 6, t.top + t.height / 2); await T.frames(2);
        const moved = A.text().indexOf('![첫 화면'); const label = A.history.undoLabel; A.actions.undo(); await T.frames(2);
        return { before, moved, line: A.text().indexOf('시작 화면에서'), caret, label, back: A.text().indexOf('![첫 화면') };`);
      assert.ok(r.caret, 'drop caret while dragging');
      assert.ok(r.moved < r.before, `moved up (${r.before} → ${r.moved})`);
      assert.equal(r.label, 'figureMove');
      assert.equal(r.back, r.before, 'Undo puts it back');
    },
  },
  {
    group: 'Panels',
    name: 'File list: dragging by the ≡ handle shows a silhouette that follows the pointer and reorders on release',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); A.actions.setLeftTab('files'); await T.frames(2); ${pointer}
        const grip = document.querySelector('[data-file-grip="0"]'); const handle = grip.querySelector('[data-icon]')?.dataset.icon; const g = grip.getBoundingClientRect(); const rows = document.querySelectorAll('.file-row'); const last = rows[2].getBoundingClientRect();
        fire('pointerdown', g.left + 5, g.top + 5, grip, 8); fire('pointermove', g.left + 5, g.top + 30, window, 8); fire('pointermove', g.left + 5, last.bottom - 4, window, 8);
        const ghost = document.querySelector('.file-ghost'); const gr = ghost?.getBoundingClientRect();
        fire('pointerup', g.left + 5, last.bottom - 4, window, 8); await T.frames(2);
        return { handle, ghost: Boolean(ghost), follows: gr ? Math.abs(gr.bottom - last.bottom) < 60 : false, gone: !document.querySelector('.file-ghost'), first: A.state.doc.files[0].name, last: A.state.doc.files[2].name };`);
      assert.equal(r.handle, 'gripLines', '≡ handle');
      assert.ok(r.ghost && r.follows, 'silhouette follows the pointer');
      assert.ok(r.gone, 'silhouette removed');
      assert.match(r.last, /^01-/);
    },
  },
  {
    group: 'Preview',
    name: 'Page views on the toolbar: page by page and two pages lay the document out as it prints; continuous goes back',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const toolbar = ['page:flow', 'page:pages', 'page:spread'].every((id) => document.querySelector('#toolbar [data-command="' + id + '"]'));
        A.run('page:pages'); const frame = document.querySelector('.paged-frame'); await T.sleep(900); await T.until(() => document.querySelector('.paged-busy').hidden && frame.contentDocument?.querySelectorAll('.pagedjs_page').length > 3, 25000, 'pages laid out');
        const pages = frame.contentDocument.querySelectorAll('.pagedjs_page').length; const oneColumn = getComputedStyle(frame.contentDocument.querySelector('.pagedjs_pages')).display;
        A.run('page:spread'); await T.frames(3); const cols = getComputedStyle(frame.contentDocument.querySelector('.pagedjs_pages')).gridTemplateColumns.split(' ').length;
        A.run('page:flow'); await T.frames(2);
        return { toolbar, pages, oneColumn, cols, flow: !document.querySelector('#preview-scroll').hidden && document.querySelector('#paged-host').hidden };`, 40000);
      assert.ok(r.toolbar, 'three buttons on the toolbar');
      assert.ok(r.pages >= 4, `${r.pages} pages`);
      assert.notEqual(r.oneColumn, 'grid');
      assert.equal(r.cols, 2, 'two pages a row');
      assert.ok(r.flow, 'continuous again');
    },
  },
  {
    group: 'Popups',
    name: 'Settings window: all 12 tabs show in two rows, icon and label at the left, nothing cut off, no tab scrolls',
    async run(app) {
      const r = await app.run(`await T.reset(); const out = [];
        for (const tab of ['general', 'pages', 'logo', 'shortcuts']) { await A.popups.closeAll(); document.querySelectorAll('.web-popup').forEach((e) => e.remove()); A.popups.frames.clear(); A.popups.open('settings', { tab }); await T.popupReady('settings'); await T.sleep(250);
          const d = T.popupDoc('settings'); const tabs = [...d.querySelectorAll('.tabs-strip .tab')]; const tops = new Set(tabs.map((x) => Math.round(x.getBoundingClientRect().top)));
          const clipped = tabs.filter((x) => { const s = x.querySelector('span'); return s.scrollWidth > s.clientWidth + 1; }).length; const body = d.querySelector('.popup-body');
          const first = tabs[0]; const left = first.querySelector('.icon').getBoundingClientRect().left - first.getBoundingClientRect().left;
          out.push({ tab, count: tabs.length, rows: tops.size, clipped, overflow: body.scrollHeight - body.clientHeight, left: Math.round(left), scrollButtons: getComputedStyle(d.querySelector('.tabs-nav')).display }); }
        return out;`);
      for (const x of r) {
        assert.equal(x.count, 12, x.tab);
        assert.equal(x.rows, 2, `${x.tab}: two rows`);
        assert.equal(x.clipped, 0, `${x.tab}: no tab name cut off`);
        assert.ok(x.overflow <= 0, `${x.tab}: no scrolling (${x.overflow})`);
        assert.ok(x.left < 20, `${x.tab}: icon at the left (${x.left}px)`);
        assert.equal(x.scrollButtons, 'none');
      }
    },
  },
  {
    group: 'Look',
    name: 'Panel switches are in the menu bar (right end, before the window buttons), not on the toolbar',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const ids = [...document.querySelectorAll('#menubar .menubar-panels [data-command]')].map((b) => b.dataset.command);
        const inToolbar = document.querySelectorAll('#toolbar [data-command$="Panel"]').length; const bar = document.querySelector('#menubar').getBoundingClientRect(); const panels = document.querySelector('.menubar-panels').getBoundingClientRect();
        document.querySelector('#menubar [data-command="leftPanel"]').click(); await T.frames(2); const hidden = !A.state.settings.showLeftPanel; document.querySelector('#menubar [data-command="leftPanel"]').click(); await T.frames(2);
        return { ids, inToolbar, nearRight: bar.right - panels.right < 200, hidden, shown: A.state.settings.showLeftPanel };`);
      assert.deepEqual(r.ids, ['leftPanel', 'bottomPanel', 'rightPanel']);
      assert.equal(r.inToolbar, 0);
      assert.ok(r.nearRight, 'at the right end of the menu bar');
      assert.ok(r.hidden && r.shown, 'they toggle the panel');
    },
  },
  {
    group: 'Look',
    name: 'Status bar shows errors · warnings · notes with their icons; a click opens Problems; the bottom panel has no second count',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.setCenterTab('edit'); const ed = A.editor(); await T.until(() => ed.value.length > 100, 5000, 'filled');
        const len = ed.value.length; ed.setSelectionRange(len, len); ed.insert('\\n\`\`\`\\nopen\\n'); A.actions.settleNow(); await T.until(() => A.state.problems.some((p) => p.kind === 'openFence'), 4000, 'problem');
        A.actions.updateSettings({ showBottomPanel: false }); const item = document.querySelector('#statusbar .status-problems'); const parts = [...item.querySelectorAll(':scope > span')].map((s) => [s.className, s.textContent]);
        item.click(); await T.frames(2); const open = A.state.settings.showBottomPanel && A.state.bottomTab === 'problems'; const chips = document.querySelectorAll('#bottom-panel .problems-counts').length;
        A.actions.undo(); A.actions.updateSettings({ showBottomPanel: false });
        return { parts, open, chips };`);
      assert.deepEqual(r.parts.map((p) => p[0].split(' ')[0]), ['sev-error', 'sev-warning', 'sev-info']);
      assert.equal(r.parts[0][1], '1', 'one error');
      assert.ok(r.open, 'Problems opened');
      assert.equal(r.chips, 0, 'no counts in the bottom panel header');
    },
  },
  {
    group: 'Start page',
    name: 'Start button toggles: with no document it opens an empty one, again it goes back; the tools row is one line',
    async run(app) {
      const r = await app.run(`await T.reset(); const tools = [...document.querySelectorAll('.start-tools > *')].map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; });
        document.querySelector('[data-home]').click(); await T.frames(2); const doc = Boolean(A.state.doc) && !A.state.showStart;
        document.querySelector('[data-home]').click(); await T.frames(2);
        return { tools, doc, back: A.state.showStart };`);
      assert.equal(new Set(r.tools.map((x) => x.join(','))).size, 1, `aligned: ${JSON.stringify(r.tools)}`);
      assert.ok(r.doc, 'an empty document');
      assert.ok(r.back, 'back to the start page');
    },
  },
  {
    group: 'Document',
    name: 'Contents in the preview: centred dot leaders and the page numbers of a layout pass',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); await A.actions.setCenterTab('preview'); A.actions.updateSettings({ previewMode: 'flow' }); A.actions.setCenterTab('preview');
        await T.until(() => [...document.querySelectorAll('#preview .toc-c-pg')].some((c) => c.textContent.trim()), 20000, 'page numbers');
        const leader = document.querySelector('#preview .toc-leader'); const cell = leader.parentElement.getBoundingClientRect(); const l = leader.getBoundingClientRect();
        return { dots: leader.textContent.startsWith('···'), centred: Math.abs((l.top + l.height / 2) - (cell.top + cell.height / 2)) < 3, numbers: [...document.querySelectorAll('#preview .toc-c-pg')].map((c) => Number(c.textContent)).filter(Boolean).length, border: getComputedStyle(leader.parentElement).borderBottomStyle };`, 30000);
      assert.ok(r.dots, 'middle dots');
      assert.ok(r.centred, 'vertically centred');
      assert.ok(r.numbers >= 5, `${r.numbers} page numbers`);
      assert.notEqual(r.border, 'dotted', 'not a dotted underline');
    },
  },
  {
    group: 'Document',
    name: 'Logo, chapter breaks and heading sizes reach the pages (header logo, cover logo, a new page per chapter, H1 size)',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); const before = A.state.settings.doc;
        const c = document.createElement('canvas'); c.width = 120; c.height = 40; c.getContext('2d').fillRect(0, 0, 120, 40);
        A.actions.updateDoc({ logoImage: c.toDataURL('image/png'), logoName: 'logo.png', logoWidth: 120, logoHeight: 40, logoHeader: true, coverLogo: true, coverLogoPosition: 'top', chapterBreak: true, headingSizes: { h1: 22, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } });
        const { toStandaloneHtml } = await import('/src/lib/markdown.js'); const html = toStandaloneHtml(A.state.doc.text, 'x', A.state.settings.doc); const word = toStandaloneHtml(A.state.doc.text, 'x', { ...A.state.settings.doc, forWord: true });
        A.run('page:pages'); const frame = document.querySelector('.paged-frame'); await T.sleep(900); await T.until(() => document.querySelector('.paged-busy').hidden && frame.contentDocument?.querySelectorAll('.pagedjs_page').length > 3, 25000, 'pages laid out');
        const pages = [...frame.contentDocument.querySelectorAll('.pagedjs_page')]; const chapterPages = pages.filter((p) => p.querySelector('.doc-content h1')).length;
        const h1 = frame.contentDocument.querySelector('.doc-content h1'); const size = h1 ? getComputedStyle(h1).fontSize : '';
        A.run('page:flow'); A.actions.updateSettings({ doc: before });
        return { header: /@top-left\\{content:url\\("data:image\\/svg\\+xml/.test(html), cover: /cover-logo-top/.test(html), wordLogo: /mso-element:header[\\s\\S]*<img/.test(word), chapterStarts: (html.match(/<h1[^>]*chapter-start/g) || []).length, chapterPages, size, coverImg: Boolean(frame.contentDocument.querySelector('.cover-logo img')) };`, 40000);
      assert.ok(r.header, 'logo in the header margin box');
      assert.ok(r.cover && r.coverImg, 'logo on the cover');
      assert.ok(r.wordLogo, 'logo in the Word header');
      assert.equal(r.chapterStarts, 2, 'chapters 2 and 3 start new pages');
      assert.equal(r.chapterPages, 3, 'one page per chapter start');
      assert.ok(Math.abs(parseFloat(r.size) - (22 * 96) / 72) < 0.1, `H1 at 22pt (${r.size})`);
    },
  },
  {
    group: 'Popups',
    name: 'Print window: printer, paper, orientation, margins, range and a live paginated preview; landscape lays out again',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); A.run('print'); await T.popupReady('print', 20000);
        const d = () => T.popupDoc('print'); await T.until(() => d().querySelector('.print-busy')?.hidden && d().querySelector('.print-frame')?.contentDocument?.querySelectorAll('.pagedjs_page').length > 3, 25000, 'preview pages laid out');
        const pages = d().querySelector('.print-frame').contentDocument.querySelectorAll('.pagedjs_page').length; const controls = ['printer', 'paper'].map((k) => Boolean(d().querySelector('[data-print="' + k + '"]') || d().querySelector('.print-settings')));
        d().querySelector('[data-print-set="orientation"][data-value="landscape"]').click(); await T.until(() => { const p = d().querySelector('.print-frame').contentDocument.querySelector('.pagedjs_page'); return d().querySelector('.print-busy')?.hidden && p && p.getBoundingClientRect().width > p.getBoundingClientRect().height; }, 25000, 'landscape pages');
        const range = d().querySelector('[data-print-set="range"][data-value="range"]'); range.click(); await T.frames(2); const input = d().querySelector('[data-print-text="rangeText"]'); input.value = '1-2'; input.dispatchEvent(new Event('change', { bubbles: true })); await T.frames(4);
        const greyed = d().querySelector('.print-frame').contentDocument.querySelectorAll('.pagedjs_page.out-of-range').length; const total = d().querySelector('.print-frame').contentDocument.querySelectorAll('.pagedjs_page').length;
        A.actions.updateSettings({ print: null }); await A.popups.closeAll();
        return { pages, controls, greyed, total };`, 80000);
      assert.ok(r.pages >= 4, `${r.pages} pages`);
      assert.ok(r.controls.every(Boolean));
      assert.equal(r.greyed, r.total - 2, 'pages outside 1-2 greyed out');
    },
  },
  {
    group: 'Popups',
    name: 'Theme drop-down has no "system setting" item',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); A.run('themeMenu'); await T.popupReady('menu'); const d = T.popupDoc('menu');
        return { system: Boolean(d.querySelector('[data-id="custom:theme:system"]')), custom: Boolean(d.querySelector('[data-id="custom:theme:custom"]')), edit: Boolean(d.querySelector('[data-id="custom:theme-edit"]')) };`);
      assert.ok(!r.system, 'no system setting');
      assert.ok(r.custom && r.edit);
    },
  },
];
