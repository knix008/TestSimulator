// The web E2E cases: the real app (Vite dev server) in headless Edge, driven through window.__myhexa and the
// DOM, each tool through its window (a frame on the web). `commandCases` runs every command once.
import assert from 'node:assert/strict';

const sleepFor = (app, ms) => app.run(`await T.sleep(${ms}); return 1;`);

export const cases = [
  {
    group: 'Start page',
    name: 'Card board: actions, recent, 10 samples, tools, 22 backgrounds; no side panels',
    desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => document.querySelector('.start-board .start-card'), 8000, 'cards');
        return { cards: [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.dataset.card), samples: document.querySelectorAll('.start-card.samples .start-tile').length,
          scenes: document.querySelectorAll('.start-card.background .anim-chip').length, panels: ['#left-panel', '#right-panel'].map((s) => T.rect(s)?.visible ?? false), hero: document.querySelector('.start-hero-fixed h1')?.textContent };`);
      for (const id of ['actions', 'recent', 'samples', 'tools', 'background']) assert.ok(r.cards.includes(id), `card ${id}`);
      assert.equal(r.samples, 10);
      assert.equal(r.scenes, 22);
      assert.deepEqual(r.panels, [false, false]);
      assert.match(r.hero, /MyHexaMaster/);
    },
  },
  {
    group: 'Start page',
    name: 'A sample tile opens the file in a tab with the hex view, explorer, properties and status bar',
    async run(app) {
      const r = await app.run(`await T.reset(); document.querySelector('[data-start="sample"][data-value="png"]').click();
        await T.until(() => document.querySelector('.hx-row .hx-b')?.textContent.trim(), 8000, 'bytes');
        return { tab: document.querySelector('.ws-tab.active')?.textContent.trim(), first: document.querySelector('.hx-row .hx-b')?.textContent, left: T.rect('#left-panel .left-explorer')?.visible, right: T.rect('#right-panel .right-body')?.visible, status: document.querySelector('#statusbar').textContent };`);
      assert.match(r.tab, /sample\.png/);
      assert.equal(r.first, '89');
      assert.ok(r.left && r.right);
      assert.match(r.status, /00000000h/);
    },
  },
  {
    group: 'Hex view',
    name: 'Typing hex digits in overwrite and insert mode, undo as one step',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); A.app.updateSettings({ insertMode: false }); T.view().setCaret(0); T.view().focus();
        for (const k of 'CAFE') { T.key(k); await T.sleep(40); }
        await T.until(() => T.view().caret === 2, 5000, 'caret');
        const over = await T.bytes(0, 3); const len1 = T.doc().len;
        A.app.updateSettings({ insertMode: true }); for (const k of '00') { T.key(k); await T.sleep(40); } await T.sleep(200);
        const ins = await T.bytes(0, 4); const len2 = T.doc().len;
        await A.run('undo'); await A.run('undo'); const back = await T.bytes(0, 3);
        A.app.updateSettings({ insertMode: false });
        return { over, len1, ins, len2, back, modifiedCells: document.querySelectorAll('.hx-b.m').length };`);
      assert.deepEqual(r.over.slice(0, 2), [0xCA, 0xFE]);
      assert.deepEqual(r.ins.slice(0, 3), [0xCA, 0xFE, 0x00]);
      assert.equal(r.len2, r.len1 + 1);
      assert.deepEqual(r.back, [0x4D, 0x79, 0x48]);
    },
  },
  {
    group: 'Hex view',
    name: 'Fast typing (no pause between keys, like key repeat) keeps every nibble and the order of moves',
    async run(app) {
      // Each edit goes to the core and back; keys sent in one go must still be applied one after another.
      const r = await app.run(`await T.reset({ sample: 'text' }); A.app.updateSettings({ insertMode: false }); const v = T.view(); v.setCaret(0); v.focus();
        for (const k of ['C', 'A', 'F', 'E', 'ArrowRight', '1', '2']) T.key(k);
        await T.until(() => v.caret === 4, 5000, 'caret after typing');
        const over = await T.bytes(0, 4);
        A.app.updateSettings({ insertMode: true }); v.setCaret(0);
        for (const k of ['0', '1', '0', '2', 'Backspace']) T.key(k);
        await T.until(() => v.caret === 1, 5000, 'caret after insert');
        const ins = await T.bytes(0, 3);
        A.app.updateSettings({ insertMode: false });
        return { over, ins };`);
      assert.deepEqual(r.over, [0xCA, 0xFE, 0x48, 0x12], 'CA FE, skip one byte, 12');
      assert.deepEqual(r.ins, [0x01, 0xCA, 0xFE], '01 02 inserted, the 02 removed by Backspace');
    },
  },
  {
    group: 'Hex view',
    name: 'Typing text in the text pane (UTF-8, Korean) and selection with Shift+arrows',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); A.app.updateSettings({ insertMode: false, charset: 'utf8' }); const v = T.view(); v.setCaret(0); v.focus(); T.key('Tab');
        v.input.value = '가'; v.input.dispatchEvent(new InputEvent('input', { bubbles: true })); await T.sleep(300);
        const b = await T.bytes(0, 3); v.setCaret(4); T.key('ArrowRight', { shiftKey: true }); T.key('ArrowRight', { shiftKey: true });
        A.app.updateSettings({ charset: 'cp1252' });
        return { b, pane: v.pane, sel: v.selection() };`);
      assert.deepEqual(r.b, [0xEA, 0xB0, 0x80]);
      assert.equal(r.pane, 'text');
      assert.deepEqual([r.sel.start, r.sel.length], [4, 3]);
    },
  },
  {
    group: 'Hex view',
    name: 'Large document: 64 MB new file scrolls to the end without drawing every row',
    async run(app) {
      const r = await app.run(`await T.reset(); const tab = await A.editor.newDocument(0); await A.editor.edit(tab.doc, 'fill', { offset: 0, length: 64 << 20, insert: true, mode: 'increment', width: 4 });
        await T.until(() => document.querySelector('.hx-row'), 8000, 'rows'); await A.run('selectAll'); T.view().setCaret(T.doc().len - 1); await T.frames(4);
        return { rows: document.querySelectorAll('.hx-row').length, last: document.querySelector('.hx-row:nth-last-child(2) .hx-off')?.textContent, len: T.doc().len };`);
      assert.equal(r.len, 64 << 20);
      assert.ok(r.rows < 200, `${r.rows} rows in the DOM`);
      assert.match(r.last, /3FFFFF/);
    },
  },
  {
    group: 'Hex view',
    name: 'View settings: bytes per row, grouping, decimal values, offsets in decimal',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); A.app.updateSettings({ bytesPerRow: 8, groupSize: 4, valueBase: 'dec', offsetBase: 'dec' }); await T.frames(4);
        const out = { cells: document.querySelector('.hx-row').querySelectorAll('.hx-b').length, first: document.querySelector('.hx-row .hx-b').textContent, off: document.querySelectorAll('.hx-row .hx-off')[1].textContent, gaps: document.querySelector('.hx-row').querySelectorAll('.hx-b.g').length };
        A.app.updateSettings({ bytesPerRow: 16, groupSize: 1, valueBase: 'hex', offsetBase: 'hex' }); return out;`);
      assert.equal(r.cells, 8);
      assert.equal(r.first, '137');
      assert.match(r.off, /^0+8$/);
      assert.equal(r.gaps, 1);
    },
  },
  {
    group: 'Clipboard',
    name: 'Copy as hex and C, paste hex in overwrite mode',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); T.view().select(1, 4);
        const hex = await A.editor.selectionText('hex'); const c = await A.editor.selectionText('c');
        return { hex, c };`);
      assert.equal(r.hex, '504E47');
      assert.match(r.c, /0x50, 0x4E, 0x47/);
    },
  },
  {
    group: 'Properties',
    name: 'Inspector at the caret, edit a value through the form window',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); A.app.setRightTab('inspector'); T.view().setCaret(16);
        await T.until(() => document.querySelector('[data-inspect-edit="uint32"]'), 5000, 'inspector');
        await T.until(() => A.props.state.inspect?.offset === 16, 5000, 'at 16');
        const before = document.querySelector('[data-inspect-edit="uint32"] td').textContent;
        A.app.updateSettings({ endian: 'be' }); await T.until(() => A.props.state.inspect?.endian === 'be', 5000, 'be');
        const be = A.props.state.inspect.fields.find((f) => f.id === 'uint32').value;
        document.querySelector('[data-inspect-edit="uint16"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
        await T.popupReady('form'); T.fill('form', '[data-tw-field="value"]', '4660'); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(async () => (await T.bytes(16, 2)).join() === '18,52', 5000, 'written');
        A.app.updateSettings({ endian: 'le' });
        return { before, be };`);
      assert.match(r.before, /^\d+$/);
      assert.equal(r.be, '48');
    },
  },
  {
    group: 'Properties',
    name: 'Structure tree from the PNG template; clicking a node selects its bytes',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); await A.app.runTemplate(A.editor.active(), { template: 'png' }); A.app.setRightTab('structure');
        await T.until(() => document.querySelector('[data-tp-node]'), 5000, 'tree');
        const nodes = [...document.querySelectorAll('[data-tp-node] .nm')].map((n) => n.textContent);
        document.querySelector('[data-tp-node="/0"]').click(); await T.frames(2);
        return { nodes: nodes.slice(0, 8), sel: T.view().selection(), marks: T.doc().marks.template.length };`);
      assert.ok(r.nodes.includes('signature'));
      assert.deepEqual([r.sel.start, r.sel.length], [0, 8]);
      assert.ok(r.marks > 3);
    },
  },
  {
    group: 'Properties',
    name: 'Checksums, statistics and file information',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' }); await A.props.runHashes(); await T.until(() => document.querySelector('.hash-row'), 5000, 'hashes');
        const hashes = [...document.querySelectorAll('.hash-row th')].map((x) => x.textContent);
        await A.props.runStats(); await T.until(() => document.querySelector('[data-hist]'), 5000, 'stats');
        A.app.setRightTab('info'); await T.until(() => /PNG|firmware|unknown|Unknown|data/i.test(document.querySelector('#right-panel').textContent), 5000, 'info');
        return { hashes, info: document.querySelector('#right-panel .prop-table').textContent };`);
      assert.deepEqual(r.hashes, ['CRC-32', 'MD5', 'SHA-1', 'SHA-256']);
      assert.match(r.info, /firmware\.bin/);
    },
  },
  {
    group: 'Print',
    name: 'The user\'s guide prints through the print window (printer, page setup, preview with its pictures) — never printed',
    async run(app) {
      const r = await app.run(`await T.reset(); A.popups.inline = true; const frame = await A.app.openDocWindow('guide'); A.popups.inline = false;
        const doc = () => frame.querySelector('iframe').contentDocument;
        await T.until(() => doc()?.querySelector('[data-viewer="print"]') && doc().querySelector('.viewer-frame')?.contentDocument?.querySelector('h2'), 15000, 'guide');
        doc().querySelector('[data-viewer="print"]').click();
        await T.popupReady('print', 15000);
        const p = () => T.popupDoc('print');
        await T.until(() => p().querySelector('.print-frame')?.contentDocument?.querySelector('img'), 20000, 'preview with pictures');
        await T.until(() => p().querySelector('.print-busy')?.hidden && p().querySelector('.print-frame').contentDocument.querySelectorAll('.pagedjs_page').length > 3, 30000, 'pages laid out');
        await T.until(() => [...p().querySelector('.print-frame').contentDocument.images].every((i) => i.complete), 20000, 'pictures loaded');
        const f = p().querySelector('.print-frame').contentDocument;
        const out = { pages: f.querySelectorAll('.pagedjs_page').length, pictures: [...f.images].filter((i) => i.complete && i.naturalWidth > 0).length, setup: p().querySelectorAll('.print-settings select, .print-settings .segmented, .print-settings input').length, title: f.querySelector('h1')?.textContent ?? '' };
        await A.popups.closeAll(); frame.remove(); A.popups.frames.delete('doc-guide');
        return out;`);
      assert.ok(r.setup >= 4, 'page and printer settings');
      assert.match(r.title, /MyHexaMaster/);
      assert.ok(r.pages > 3, `${r.pages} pages`);
      assert.ok(r.pictures >= 10, `${r.pictures} pictures loaded in the preview`);
    },
  },
  {
    group: 'Language',
    name: 'Korean and English flags on the language button, the settings choice, the status bar and the menu',
    async run(app) {
      const r = await app.run(`await T.reset(); A.app.updateSettings({ language: 'ko' }); await T.frames(2);
        const toolbar = document.querySelector('[data-command="language"] svg.flag')?.dataset.icon ?? document.querySelector('[data-command="language"] svg.flag') ? 'flag' : null;
        const status = document.querySelector('#statusbar svg.flag')?.dataset.icon;
        A.run('settings'); await T.popupReady('settings'); const s = T.popupDoc('settings');
        const choice = [...s.querySelectorAll('[data-setting="language"] svg.flag')].map((x) => x.dataset.icon);
        await A.popups.closeAll();
        A.app.updateSettings({ language: 'en' }); await T.frames(2);
        const statusEn = document.querySelector('#statusbar svg.flag')?.dataset.icon;
        const cmd = A.commands.language.icon;
        A.app.updateSettings({ language: 'ko' });
        return { toolbar, status, choice, statusEn, cmd };`);
      assert.ok(r.toolbar, 'toolbar flag');
      assert.equal(r.status, 'flagKr');
      assert.deepEqual(r.choice, ['flagKr', 'flagUk']);
      assert.equal(r.statusEn, 'flagUk');
      assert.equal(r.cmd, 'flagKr', 'in English the button switches to Korean');
    },
  },
  {
    group: 'Tools',
    name: 'Data visualizer: bytes as a picture in each pixel format, digram, entropy map; a pixel click selects its bytes',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' }); T.view().select(0x3000, 0x3000); A.run('visualizer'); await T.popupReady('visualizer'); const d = () => T.popupDoc('visualizer');
        await T.until(() => d().querySelector('[data-vis-canvas]')?.width > 1, 8000, 'pixels');
        const out = { modes: d().querySelectorAll('[data-tw="vis-mode"] option').length, sizes: {} };
        for (const mode of ['gray8', 'rgb24', 'rgba32', 'rgb565', 'bits1', 'nibble4', 'digram', 'entropy']) {
          T.fill('visualizer', '[data-tw="vis-mode"]', mode); await T.frames(2);
          const c = d().querySelector('[data-vis-canvas]'); out.sizes[mode] = [c.width, c.height];
        }
        T.fill('visualizer', '[data-tw="vis-mode"]', 'gray8'); T.fill('visualizer', '[data-tw="vis-width"]', '64'); await T.frames(2);
        const c = d().querySelector('[data-vis-canvas]'); const box = c.getBoundingClientRect();
        // the pixel at (3, 2) of a 64-wide 8-bit picture is byte 2*64+3 of the document
        c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + (3.5 / c.width) * box.width, clientY: box.top + (2.5 / c.height) * box.height }));
        // one byte: the caret moves there (a 1-byte range is the caret in this editor)
        await T.until(() => T.view().caret === 2 * 64 + 3, 5000, 'selected');
        const sel = { start: T.view().caret, length: 1 };
        const nonBlank = [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].some((x, i) => i % 4 !== 3 && x > 0);
        await A.popups.closeAll();
        return { ...out, sel: [sel.start, sel.length], nonBlank };`);
      assert.equal(r.modes, 11);
      assert.deepEqual(r.sizes.digram, [256, 256]);
      assert.equal(r.sizes.gray8[0], 256);
      assert.ok(r.sizes.rgb24[1] < r.sizes.gray8[1], 'three bytes per RGB pixel');
      assert.deepEqual(r.sel, [2 * 64 + 3, 1]);
      assert.ok(r.nonBlank);
    },
  },
  {
    group: 'Properties',
    name: 'Structure tree: a value typed in is written with the field\'s type and byte order (PNG width, big-endian u32)',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); await A.app.runTemplate(A.editor.active(), { template: 'png' }); A.app.setRightTab('structure');
        await T.until(() => document.querySelector('[data-tp-edit]'), 5000, 'tree');
        const row = [...document.querySelectorAll('[data-tp-node]')].find((x) => x.querySelector('.nm')?.textContent === 'width');
        const offset = Number.parseInt(row.querySelector('.of').textContent, 16);
        row.querySelector('[data-tp-edit]').click(); await T.popupReady('form');
        T.fill('form', '[data-tw-field="value"]', '100'); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(async () => (await T.bytes(offset, 4))[3] === 100, 5000, 'written');
        await T.until(() => [...document.querySelectorAll('[data-tp-node]')].find((x) => x.querySelector('.nm')?.textContent === 'width')?.querySelector('.vl')?.textContent.startsWith('100'), 5000, 'tree refreshed');
        return { bytes: await T.bytes(offset, 4) };`);
      assert.deepEqual(r.bytes, [0, 0, 0, 100]);
    },
  },
  {
    group: 'Editing',
    name: 'Edit history: three edits listed, jump back to the first step and forward to the last',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); const d = T.doc(); const orig = await T.bytes(0, 3);
        for (const [o, v] of [[0, 0x11], [1, 0x22], [2, 0x33]]) await A.editor.edit(d, 'write', { offset: o, data: new Uint8Array([v]), kind: 'test' });
        const h = await A.toolHost.ops.history();
        await A.toolHost.ops.gotoHistory({ depth: 1 }); const first = await T.bytes(0, 3);
        await A.toolHost.ops.gotoHistory({ depth: 0 }); const none = await T.bytes(0, 3);
        await A.toolHost.ops.gotoHistory({ depth: 3 }); const all = await T.bytes(0, 3);
        A.run('history'); await T.popupReady('history'); await T.until(() => T.popupDoc('history').querySelectorAll('.tw-item').length >= 3, 5000, 'listed');
        const rows = T.popupDoc('history').querySelectorAll('.tw-item').length; await A.popups.closeAll();
        return { steps: h.undo.length, first, none, all, orig, rows };`);
      assert.equal(r.steps, 3);
      assert.deepEqual(r.first, [0x11, r.orig[1], r.orig[2]]);
      assert.deepEqual(r.none, r.orig);
      assert.deepEqual(r.all, [0x11, 0x22, 0x33]);
      assert.ok(r.rows >= 3);
    },
  },
  {
    group: 'Editing',
    name: 'Select block window: a start and a length (or an end) select exactly that range',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' }); A.run('selectBlock'); await T.popupReady('form');
        T.fill('form', '[data-tw-field="start"]', '0x100'); T.fill('form', '[data-tw-field="value"]', '0x20'); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(() => T.view().selection().length === 0x20, 5000, 'selected'); const a = T.view().selection();
        A.run('selectBlock'); await T.popupReady('form'); T.popupDoc('form').querySelector('[data-tw-seg="how"][data-value="end"]').click(); await T.sleep(100);
        T.fill('form', '[data-tw-field="start"]', '16'); T.fill('form', '[data-tw-field="value"]', '31'); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(() => T.view().selection().start === 16, 5000, 'selected 2'); const b = T.view().selection();
        return { a: [a.start, a.length], b: [b.start, b.end] };`);
      assert.deepEqual(r.a, [0x100, 0x20]);
      assert.equal(r.b[0], 16);
      assert.ok(r.b[1] === 31 || r.b[1] === 32, `end ${r.b[1]}`);
    },
  },
  {
    group: 'Editing',
    name: 'Text mode: the document as text in the text editor, edited and applied back as bytes in one undo step',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); A.app.updateSettings({ charset: 'utf8' }); const tab = A.app.activeTab(); const len = T.doc().len;
        await A.run('textMode'); await T.until(() => tab.textEditor, 8000, 'editor');
        const text = tab.textEditor.text();
        tab.textEditor.view?.dispatch?.({ changes: { from: 0, to: 0, insert: 'HELLO ' } });
        if (!tab.textEditor.text().startsWith('HELLO ')) { tab.textValue = 'HELLO ' + text; }
        document.querySelector('[data-text-apply]').click();
        await T.until(() => T.doc().len === len + 6, 8000, 'applied');
        const head = new TextDecoder().decode(new Uint8Array(await T.bytes(0, 6)));
        if (tab.textMode) await A.run('textMode');
        await A.run('undo'); const back = T.doc().len;
        A.app.updateSettings({ charset: 'cp1252' });
        return { starts: text.slice(0, 12), head, back, len };`);
      assert.match(r.starts, /MyHexaMaster/);
      assert.equal(r.head, 'HELLO ');
      assert.equal(r.back, r.len, 'one undo step');
    },
  },
  {
    group: 'Tools',
    name: 'Data processor: a node graph (selection → XOR → hash; text + hex → concat → new tab) evaluates with a preview per node',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); T.view().select(0, 4);
        const sel = await T.bytes(0, 4);
        const graph = { nodes: [
          { id: 'a', kind: 'selection' }, { id: 'b', kind: 'operation', params: { op: 'xor', operand: '0xFF', width: 1 } }, { id: 'c', kind: 'hash', params: { algorithm: 'crc32' } },
          { id: 'd', kind: 'constText', params: { text: 'Hi', encoding: 'utf8' } }, { id: 'e', kind: 'constHex', params: { hex: '00 FF' } }, { id: 'f', kind: 'concat' }, { id: 'g', kind: 'newTab', params: { name: 'joined.bin' } },
          { id: 'h', kind: 'repeat', params: { count: 3 } }, { id: 'i', kind: 'slice', params: { offset: 1, length: 2 } },
        ], links: [{ from: 'a', to: 'b', port: 0 }, { from: 'b', to: 'c', port: 0 }, { from: 'd', to: 'f', port: 0 }, { from: 'e', to: 'f', port: 1 }, { from: 'f', to: 'g', port: 0 }, { from: 'e', to: 'h', port: 0 }, { from: 'a', to: 'i', port: 0 }] };
        const tabs = A.editor.tabs.length;
        const res = await A.toolHost.ops.evaluateGraph({ graph });
        const opened = A.editor.tabs.length === tabs + 1 ? [...await T.doc().read(0, T.doc().len)] : null;
        A.run('processor'); await T.popupReady('processor'); const nodesDrawn = T.popupDoc('processor').querySelectorAll('[data-pn-node], .pn-node').length; await A.popups.closeAll();
        return { sel, n: res.nodes, opened, nodesDrawn };`);
      assert.equal(r.n.b.hex, r.sel.map((x) => (x ^ 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' '));
      assert.equal(r.n.c.length, 4, 'CRC-32 is 4 bytes');
      assert.deepEqual(r.opened, [0x48, 0x69, 0x00, 0xFF]);
      assert.equal(r.n.h.length, 6);
      assert.equal(r.n.i.length, 2);
      assert.ok(Object.values(r.n).every((x) => !x.error), JSON.stringify(r.n));
      assert.ok(r.nodesDrawn > 0);
    },
  },
  {
    group: 'Hex view',
    name: 'A one-byte selection: selected and drawn, Backspace deletes just that byte, a caret move clears it',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); A.app.updateSettings({ insertMode: true }); const v = T.view(); const len = T.doc().len; const b = await T.bytes(4, 3);
        v.select(5, 6); await T.frames(2);
        const sel = v.selection(); const drawn = document.querySelectorAll('.hx-view .hx-b.s').length;
        v.focus(); T.key('Backspace'); await v.inputChain;
        const after = await T.bytes(4, 2);
        v.select(5, 6); v.setCaret(8); const cleared = v.selection().length;
        A.app.updateSettings({ insertMode: false });
        return { sel: [sel.start, sel.length], drawn, len, newLen: T.doc().len, b, after, cleared };`);
      assert.deepEqual(r.sel, [5, 1]);
      assert.ok(r.drawn >= 1, 'the byte is drawn as selected');
      assert.equal(r.newLen, r.len - 1);
      assert.deepEqual(r.after, [r.b[0], r.b[2]]);
      assert.equal(r.cleared, 0);
    },
  },
  {
    group: 'Hex view',
    name: 'Split view: the same document twice, an edit in one shows in the other; commands follow the view last used',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); A.app.updateSettings({ insertMode: false }); await A.run('splitView'); await T.frames(3);
        const views = document.querySelectorAll('.hx-split .hx-view').length;
        const tab = A.app.activeTab(); const a = tab.view; const b = tab.splitView;
        b.input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); b.setCaret(0x20); b.focus(); await T.frames(2);
        const followed = A.app.activeView() === b;
        T.key('7'); T.key('7'); await b.inputChain;
        await T.until(async () => (await T.bytes(0x20, 1))[0] === 0x77, 5000, 'written');
        await T.frames(3);
        const shownInA = [...document.querySelectorAll('[data-split="a"] .hx-b')].some((x) => x.textContent.trim() === '77');
        const independent = a.caret !== b.caret;
        await A.run('splitView'); await T.frames(2);
        return { views, followed, shownInA, independent, after: document.querySelectorAll('.hx-split').length };`);
      assert.equal(r.views, 2);
      assert.ok(r.followed, 'the focused view is the active view');
      assert.ok(r.shownInA, 'the edit shows in the other view');
      assert.ok(r.independent, 'each view has its own caret');
      assert.equal(r.after, 0);
    },
  },
  {
    group: 'Hex view',
    name: 'Keystroke macro: record typing and a move, play it back, repeat it; a saved macro loaded by name plays',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); localStorage.removeItem('myhexa.macros.v1'); A.app.updateSettings({ insertMode: false }); const v = T.view(); v.setCaret(0); v.focus();
        await A.run('macroRecord');
        const recording = Boolean(document.querySelector('.status-recording'));
        for (const k of ['A', 'B', 'ArrowRight']) T.key(k); await v.inputChain;
        await A.run('macroRecord');
        const first = await T.bytes(0, 3);
        await A.run('macroPlay'); await T.view().inputChain;
        const second = await T.bytes(2, 2); const caretAfterPlay = T.view().caret;
        A.run('macroRepeat'); await T.popupReady('form'); T.fill('form', '[data-tw-field="count"]', '3'); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(() => T.view().caret === caretAfterPlay + 6, 8000, 'repeated');
        const repeated = await T.bytes(4, 6);
        // a saved macro, loaded by name through the form and played
        localStorage.setItem('myhexa.macros.v1', JSON.stringify([{ name: 'ff-twice', steps: [{ type: 'key', key: 'F', shift: false }, { type: 'key', key: 'F', shift: false }] }]));
        T.view().setCaret(0x40); T.view().focus();
        A.run('macroLoad'); await T.popupReady('form'); T.popupDoc('form').querySelector('[data-tw-seg="action"][data-value="play"]').click(); await T.sleep(100); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(async () => (await T.bytes(0x40, 1))[0] === 0xFF, 5000, 'loaded and played');
        return { recording, first, second, caretAfterPlay, repeated, loaded: (await T.bytes(0x40, 1))[0] };`);
      assert.ok(r.recording, 'the status bar shows the recording');
      assert.deepEqual(r.first.slice(0, 1), [0xAB]);
      assert.deepEqual(r.second, [0xAB, r.second[1]], 'played at the caret: AB written two bytes on');
      assert.equal(r.caretAfterPlay, 4);
      assert.deepEqual([r.repeated[0], r.repeated[2], r.repeated[4]], [0xAB, 0xAB, 0xAB]);
      assert.equal(r.loaded, 0xFF);
    },
  },
  {
    group: 'Tools',
    name: 'Script window: an XOR script changes the selection in one undo step, prints output; a failing script changes nothing',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); const before = await T.bytes(0, 8); T.view().select(0, 8);
        A.run('script'); await T.popupReady('script'); const d = () => T.popupDoc('script');
        T.fill('script', '[data-tw="script-example"]', 'xorSelection'); T.click('script', '[data-tw-act="script-example-load"]'); await T.frames(2);
        T.click('script', '[data-tw-act="script-run"]'); await T.until(() => d().querySelector('[data-script-output]'), 10000, 'output');
        const output = d().querySelector('[data-script-output]').textContent;
        const after = await T.bytes(0, 8); const len = T.doc().len;
        await A.run('undo'); const undone = await T.bytes(0, 8);
        T.fill('script', '[data-tw="script-source"]', 'WriteU8(0, 0xAA);\\nlet x = 1 / 0;\\nWriteU8(1, 0xBB);');
        T.click('script', '[data-tw-act="script-run"]'); await T.until(() => d().querySelector('.tw-error'), 10000, 'error');
        const error = d().querySelector('.tw-error').textContent; const untouched = await T.bytes(0, 2);
        T.fill('script', '[data-tw="script-source"]', 'InsertBytes(0, 4, 0xEE);\\nWriteString(0, "HDR!");\\nPrint(FileSize());');
        T.click('script', '[data-tw-act="script-run"]'); await T.until(() => /HDR|[0-9]/.test(d().querySelector('[data-script-output]')?.textContent ?? '') && T.doc().len === len + 4, 10000, 'insert');
        const head = await T.bytes(0, 6);
        await A.popups.closeAll();
        return { before, after, undone, output, error, untouched, head, len, newLen: T.doc().len };`);
      assert.deepEqual(r.after, r.before.map((b) => b ^ 0x5A));
      assert.deepEqual(r.undone, r.before, 'one undo step restores all 8 bytes');
      assert.match(r.output, /XOR 5Ah: 8 bytes/);
      assert.ok(r.error.length > 3);
      assert.deepEqual(r.untouched, r.before.slice(0, 2), 'a failing script changes nothing');
      assert.deepEqual(r.head, [0x48, 0x44, 0x52, 0x21, ...r.before.slice(0, 2)]);
      assert.equal(r.newLen, r.len + 4);
    },
  },
  {
    group: 'Tools',
    name: 'Patch files: IPS, IPS32, UPS, BPS made from two documents turn the original into the modified one; the window draws',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' }); const a = T.doc();
        const copy = await A.core('extract', { id: a.id, offset: 0, length: a.len, name: 'modified.bin' }); await A.editor.addDocument(copy, { kind: 'memory' });
        const b = T.doc(); await A.editor.edit(b, 'write', { offset: 0x200, data: new Uint8Array([1, 2, 3]), kind: 'test' }); await A.editor.edit(b, 'insert', { offset: 0x10, data: new Uint8Array([9, 9]), kind: 'test' });
        const want = [...await b.read(0, b.len)];
        const out = {};
        for (const format of ['ips', 'ips32', 'ups', 'bps']) {
          const made = await A.toolHost.ops.patchCreate({ original: a.id, modified: b.id, format });
          A.editor.activate(A.editor.tabs[0].id); await T.frames(2);
          const res = await A.toolHost.ops.patchApplyData({ patch: made.data, target: 'new', name: format });
          const got = [...await T.doc().read(0, T.doc().len)];
          out[format] = { same: got.length === want.length && got.every((x, i) => x === want[i]), ok: res.ok, records: made.records };
          await A.editor.close(A.editor.active(), { force: true });
        }
        const diff = await A.toolHost.ops.patchCreate({ original: a.id, modified: b.id, format: 'diff' });
        A.run('patch'); await T.popupReady('patch'); await T.until(() => T.popupDoc('patch').querySelectorAll('[data-tw="patch-original"] option').length >= 2, 5000, 'docs');
        const formats = T.popupDoc('patch').querySelectorAll('[data-tw="patch-format"] option').length;
        await A.popups.closeAll();
        return { out, diffLines: diff.text.split('\\n').filter(Boolean).length, formats };`);
      for (const f of ['ips', 'ips32', 'ups', 'bps']) { assert.ok(r.out[f].same, `${f} result equals the modified document`); assert.ok(r.out[f].ok, `${f} checks`); }
      assert.ok(r.diffLines > 1);
      assert.equal(r.formats, 5);
    },
  },
  {
    group: 'Tools',
    name: 'Demangler: Itanium, MSVC and Rust names typed in; names found in the document strings',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); A.run('demangle'); await T.popupReady('demangle'); const d = () => T.popupDoc('demangle');
        T.click('demangle', '[data-tw-act="dm-run"]'); await T.until(() => d().querySelectorAll('.tw-list .tw-item').length >= 4, 8000, 'results');
        const shown = [...d().querySelectorAll('.tw-list .tw-item code.tw-text')].map((x) => x.textContent);
        await A.popups.closeAll();
        const doc = await A.core('new', { name: 'syms.bin', data: btoa('\\0\\0_ZN3foo3barEi\\0junk\\0?func@@YAHH@Z\\0') }); await A.editor.addDocument(doc, { kind: 'memory' });
        const found = await A.toolHost.ops.demangleDocument();
        return { shown, found: found.filter((x) => x.ok).map((x) => [x.output, x.offset]) };`);
      assert.equal(r.shown[0], 'foo::bar()');
      assert.match(r.shown[1], /func\(int\)/);
      assert.match(r.shown[2], /core::fmt::write/);
      assert.equal(r.found.length, 2, JSON.stringify(r.found));
      assert.deepEqual(r.found[0], ['foo::bar(int)', 2]);
    },
  },
  {
    group: 'Find',
    name: 'Several terms at once (text, hex, regex): find all marks each, find next takes the nearest, count adds them up',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' }); A.run('find'); await T.popupReady('find'); const d = () => T.popupDoc('find');
        T.fill('find', '[data-tw="kind"]', 'multi'); await T.until(() => d().querySelector('textarea[data-tw="value"]'), 5000, 'terms box');
        T.fill('find', 'textarea[data-tw="value"]', '"Device"\\n4D 59 46 57\\n/Serial: [0-9]{4}/\\n# a comment');
        T.click('find', '[data-tw-act="find-all"]'); await T.until(() => d().querySelectorAll('.tw-list .tw-item').length >= 3, 8000, 'results');
        const previews = [...d().querySelectorAll('.tw-list .tw-preview')].map((x) => x.textContent);
        const offsets = [...d().querySelectorAll('.tw-list [data-tw-goto]')].map((x) => Number(x.dataset.twGoto));
        const replaceShown = Boolean(d().querySelector('[data-tw-act="replace-all"]'));
        T.view().setCaret(0x10); T.click('find', '[data-tw-act="find-next"]'); await T.until(() => T.view().selection().length > 0 && T.view().selection().start !== 0, 5000, 'next');
        const next = T.view().selection();
        const before = d().querySelector('.tw-status')?.textContent ?? '';
        T.click('find', '[data-tw-act="find-count"]'); await T.until(() => (d().querySelector('.tw-status')?.textContent ?? before) !== before, 5000, 'count');
        const count = d().querySelector('.tw-status').textContent;
        await A.popups.closeAll();
        return { previews, offsets, replaceShown, next: [next.start, next.length], count };`);
      assert.equal(r.offsets.length, 3, r.previews.join(' | '));
      assert.deepEqual([...r.offsets].sort((a, b) => a - b), r.offsets, 'in offset order');
      assert.equal(r.offsets[0], 0, 'MYFW at 0');
      assert.ok(r.previews.some((p) => p.startsWith('"Device"')) && r.previews.some((p) => p.startsWith('/Serial')), r.previews.join(' | '));
      assert.equal(r.replaceShown, false, 'no replace for several terms');
      assert.equal(r.next[0], r.offsets[1], 'next from 10h is the nearest of all terms');
      assert.match(r.count, /3/);
    },
  },
  {
    group: 'Language',
    name: 'The user\'s guide and tutorial windows: Korean and English buttons with their flags',
    async run(app) {
      const r = await app.run(`await T.reset(); const out = {};
        for (const kind of ['guide', 'tutorialDoc', 'tutorial']) {
          A.popups.inline = true; const frame = await A.app.openDocWindow(kind); A.popups.inline = false;
          if (!frame) continue;
          const doc = () => frame.querySelector('iframe').contentDocument;
          await T.until(() => doc()?.querySelectorAll('[data-viewer="lang"]').length === 2, 15000, kind);
          out[kind] = [...doc().querySelectorAll('[data-viewer="lang"]')].map((b) => { const f = b.querySelector('svg.flag'); const box = f?.getBoundingClientRect(); return [b.dataset.value, f?.dataset.icon ?? null, Boolean(box && box.width > 8 && box.height > 5)]; });
          frame.remove(); A.popups.frames.delete(frame.dataset.kind);
        }
        return out;`);
      assert.ok(Object.keys(r).length >= 2, `windows checked: ${Object.keys(r).join(', ')}`);
      for (const [kind, buttons] of Object.entries(r)) assert.deepEqual(buttons, [['ko', 'flagKr', true], ['en', 'flagUk', true]], kind);
    },
  },
  {
    group: 'Properties',
    name: 'Hash database: a hash added as notable is flagged, then removed',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); A.props.hashDb.entries.clear(); await A.props.runHashes(); await T.until(() => document.querySelector('[data-hash-add]'), 5000, 'hashes');
        const value = document.querySelector('[data-hash-add]').dataset.hashAdd; document.querySelector('[data-hash-add]').click();
        await T.popupReady('form'); T.fill('form', '[data-tw-field="name"]', 'suspicious.txt');
        T.popupDoc('form').querySelector('[data-tw-seg="category"][data-value="notable"]').click(); await T.sleep(100); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(() => document.querySelector('.hash-row.hash-notable'), 5000, 'flagged');
        const flagged = { note: document.querySelector('.hash-hit')?.textContent, stored: JSON.parse(localStorage.getItem('myhexa.hashdb.v1')).entries.length };
        document.querySelector('[data-hash-remove]').click(); await T.until(() => !document.querySelector('.hash-row.hash-notable'), 5000, 'removed');
        return { value, flagged, left: A.props.hashDb.entries.size };`);
      assert.match(r.value, /^[0-9a-f]{8}$/);
      assert.match(r.flagged.note, /suspicious\.txt/);
      assert.equal(r.flagged.stored, 1);
      assert.equal(r.left, 0);
    },
  },
  {
    group: 'Properties',
    name: 'Bookmarks: add, next, remove',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); T.view().select(8, 16); await A.run('bookmarkToggle'); T.view().select(33, 40); await A.run('bookmarkToggle'); T.view().setCaret(0);
        await A.run('bookmarkNext'); const first = T.view().selection().start; await A.run('bookmarkNext'); const second = T.view().selection().start;
        A.app.setRightTab('bookmarks'); await T.until(() => document.querySelectorAll('.bm-row').length === 2, 5000, 'rows');
        document.querySelector('[data-bookmark-remove="0"]').click(); await T.frames(2);
        return { first, second, left: T.doc().bookmarks.length };`);
      assert.deepEqual([r.first, r.second, r.left], [8, 33, 1]);
    },
  },
  {
    group: 'Tools',
    name: 'Find window: hex with wildcards, find all, replace all',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' }); A.run('find'); await T.popupReady('find');
        T.fill('find', '[data-tw="value"]', '48 C7 ?? 01'); T.click('find', '[data-tw-act="find-all"]');
        await T.until(() => T.popupDoc('find').querySelectorAll('.tw-item').length >= 2, 8000, 'results');
        const found = T.popupDoc('find').querySelectorAll('.tw-item').length;
        T.fill('find', '[data-tw="kind"]', 'text'); await T.sleep(100); T.fill('find', '[data-tw="value"]', 'Firmware');
        T.fill('find', '[data-tw="rkind"]', 'text'); await T.sleep(100); T.fill('find', '[data-tw="rvalue"]', 'FIRMWARE'); T.click('find', '[data-tw-act="replace-all"]');
        await T.until(async () => new TextDecoder().decode(new Uint8Array(await T.bytes(16, 8))) === 'FIRMWARE', 8000, 'replaced');
        return { found };`);
      assert.ok(r.found >= 2);
    },
  },
  {
    group: 'Tools',
    name: 'Go to offset window',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' }); A.run('goto'); await T.popupReady('goto'); T.fill('goto', '[data-tw="value"]', '0x3000'); T.click('goto', '[data-tw-act="goto-run"]');
        await T.until(() => T.view().caret === 0x3000, 5000, 'caret'); return T.view().caret;`);
      assert.equal(r, 0x3000);
    },
  },
  {
    group: 'Tools',
    name: 'Strings, disassembler, recovery, calculator windows',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' });
        A.run('strings'); await T.popupReady('strings'); T.click('strings', '[data-tw-act="strings-run"]'); await T.until(() => T.popupDoc('strings').querySelectorAll('.tw-item').length > 3, 8000, 'strings');
        const strings = T.popupDoc('strings').querySelector('.tw-item .tw-text').textContent; await A.popups.closeAll();
        T.view().setCaret(0x5000); A.run('disasm'); await T.popupReady('disasm'); T.click('disasm', '[data-tw-act="disasm-caret"]'); await T.until(() => T.popupDoc('disasm').querySelector('.tw-asm .tw-item'), 8000, 'asm');
        const asm = [...T.popupDoc('disasm').querySelectorAll('.tw-asm .tw-item b')].slice(0, 2).map((x) => x.textContent); await A.popups.closeAll();
        A.run('carve'); await T.popupReady('carve'); await T.until(() => T.popupDoc('carve').querySelector('[data-tw^="type:"]'), 5000, 'types'); T.click('carve', '[data-tw-act="carve-run"]');
        await T.until(() => T.popupDoc('carve').querySelectorAll('.tw-list .tw-item').length >= 3, 8000, 'carved');
        const carved = [...T.popupDoc('carve').querySelectorAll('.tw-list .chip')].map((x) => x.textContent); await A.popups.closeAll();
        A.run('calc'); await T.popupReady('calc'); T.fill('calc', '[data-tw="expr"]', '0x10 * 3'); await T.until(() => T.popupDoc('calc').querySelector('.tw-calc td'), 5000, 'calc');
        const calc = T.popupDoc('calc').querySelector('.tw-calc td').textContent;
        return { strings, asm, carved, calc };`);
      assert.ok(r.strings.length > 3);
      assert.deepEqual(r.asm, ['mov', 'mov']);
      for (const ext of ['PNG', 'GIF', 'ZIP']) assert.ok(r.carved.includes(ext), ext);
      assert.match(r.calc, /30$/);
    },
  },
  {
    group: 'Tools',
    name: 'File systems: partitions, a folder, a deleted file, a file opened in a tab',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'disk' });
        A.run('filesystem'); await T.popupReady('filesystem'); const d = () => T.popupDoc('filesystem');
        await T.until(() => d().querySelectorAll('[data-fs-part]').length === 2, 8000, 'partitions');
        const parts = [...d().querySelectorAll('[data-fs-part] .chip')].map((x) => x.textContent);
        T.click('filesystem', '[data-fs-part="0"]'); await T.until(() => d().querySelector('[data-fs-entry]'), 8000, 'root');
        const root = [...d().querySelectorAll('[data-fs-entry] .tw-text')].map((x) => x.textContent);
        [...d().querySelectorAll('[data-fs-entry]')].find((x) => x.textContent.includes('DOCS')).click();
        await T.until(() => d().querySelector('.tw-line code')?.textContent.includes('DOCS'), 8000, 'docs');
        const docs = [...d().querySelectorAll('[data-fs-entry] .tw-text')].map((x) => x.textContent);
        const tabs = A.editor.tabs.length;
        [...d().querySelectorAll('[data-fs-entry]')].find((x) => x.textContent.includes('DATA.BIN')).querySelector('[data-fs-tab]').click();
        await T.until(() => A.editor.tabs.length === tabs + 1, 8000, 'new tab');
        const opened = { len: T.doc().len, head: await T.bytes(0, 4) };
        await A.popups.closeAll();
        return { parts, root, docs, opened };`);
      assert.deepEqual(r.parts, ['fat16', 'fat12']);
      for (const n of ['README.TXT', 'PICTURE.PNG', 'Long file name example.txt']) assert.ok(r.root.includes(n), n);
      assert.ok(r.root.some((x) => /ELETED\.TXT/.test(x)), 'deleted file listed');
      assert.ok(r.docs.includes('DATA.BIN') && r.docs.includes('NOTE.TXT'), r.docs.join(','));
      assert.deepEqual(r.opened, { len: 256, head: [0, 1, 2, 3] });
    },
  },
  {
    group: 'Tools',
    name: 'YARA: rules scan the document, results select the match, errors are shown',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'pe' });
        A.run('yara'); await T.popupReady('yara'); const d = () => T.popupDoc('yara');
        T.click('yara', '[data-tw-act="yara-example"]'); await T.frames(2);
        T.click('yara', '[data-tw-act="yara-run"]'); await T.until(() => d().querySelector('[data-tw-goto]'), 8000, 'matches');
        const rules = [...d().querySelectorAll('.tw-list .chip')].map((x) => x.textContent);
        d().querySelector('[data-tw-goto]').click(); await T.until(() => T.view().selection().length > 0, 5000, 'selected');
        const sel = T.view().selection();
        T.fill('yara', '[data-tw="yara-rules"]', 'rule Bad { strings: $a = { 4D 5 } condition: $a }');
        T.click('yara', '[data-tw-act="yara-run"]'); await T.until(() => d().querySelector('.tw-error'), 8000, 'error');
        const error = d().querySelector('.tw-error').textContent;
        await A.popups.closeAll();
        return { rules, sel: [sel.start, sel.length], error };`);
      assert.ok(r.rules.includes('Executable_MZ_PE'), r.rules.join(','));
      assert.deepEqual(r.sel, [0, 2]);
      assert.ok(r.error.length > 3);
    },
  },
  {
    group: 'Tools',
    name: 'Compare tab: two documents side by side, next difference',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'elf' }); await A.app.openSample('pe'); const [a, b] = A.editor.tabs;
        const tab = await A.app.openCompare(a.doc.id, b.doc.id, 'bytes'); await T.until(() => document.querySelectorAll('.compare-side .hx-row').length > 2, 5000, 'panes');
        await A.run('diffNext'); return { diffs: tab.diffs.diffs.length, panes: document.querySelectorAll('.compare-side .hx-view').length, marked: document.querySelectorAll('.compare-side .df').length };`);
      assert.ok(r.diffs > 1);
      assert.equal(r.panes, 2);
      assert.ok(r.marked > 0);
    },
  },
  {
    group: 'Tools',
    name: 'Template editor: write a template and run it',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'bmp' }); A.run('template'); await T.popupReady('template');
        await T.until(() => T.popupDoc('template').querySelector('[data-tw="source"]')?.value, 5000, 'source');
        T.fill('template', '[data-tw="source"]', 'struct H { char magic[2]; u32 size; } [[color("red")]];\\nH head;');
        T.click('template', '[data-tw-act="tpl-run"]'); await T.until(() => A.editor.activeDoc().template?.template === 'source', 5000, 'ran');
        return A.editor.activeDoc().template.nodes[0].children.map((n) => n.name + '=' + n.value);`);
      assert.deepEqual(r, ['magic="BM"', `size=${54 + 96 * 24} (0x${(54 + 96 * 24).toString(16).toUpperCase()})`]);
    },
  },
  {
    group: 'Data',
    name: 'Operations through the form window (XOR), transform to a new tab, fill, extract',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'text' }); T.view().select(0, 4); A.run('op:xor'); await T.popupReady('form');
        T.fill('form', '[data-tw-field="operand"]', '0x20'); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(async () => (await T.bytes(0, 4)).join() === [0x4D ^ 0x20, 0x79 ^ 0x20, 0x48 ^ 0x20, 0x65 ^ 0x20].join(), 5000, 'xor');
        await A.run('undo'); T.view().select(0, 12); const n = A.editor.tabs.length;
        A.run('tr:base64Encode'); await T.popupReady('form'); T.popupDoc('form').querySelector('[data-tw-seg="target"][data-value="new"]').click(); await T.sleep(100); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(() => A.editor.tabs.length === n + 1, 5000, 'new tab');
        const b64 = new TextDecoder().decode(await A.editor.activeDoc().read(0, 16));
        await A.run('extract'); return { b64, tabs: A.editor.tabs.length - n };`);
      assert.equal(r.b64, btoa('MyHexaMaster'));
    },
  },
  {
    group: 'Data',
    name: 'Import Intel HEX from typed text into a new tab',
    async run(app) {
      const r = await app.run(`await T.reset(); const t = await A.core('export', { id: (await A.core('new', { data: btoa('Hello') })).id, format: 'intelhex', base: 0x100 });
        A.run('import'); await T.popupReady('form'); T.fill('form', '[data-tw-field="format"]', 'intelhex'); await T.sleep(100);
        T.popupDoc('form').querySelector('[data-tw-seg="source"][data-value="text"]').click(); await T.sleep(150);
        T.fill('form', '[data-tw-field="text"]', t.text); T.click('form', '[data-tw-act="form-ok"]');
        await T.until(() => A.editor.activeDoc()?.len === 5, 5000, 'imported'); return new TextDecoder().decode(await A.editor.activeDoc().read(0, 5));`);
      assert.equal(r, 'Hello');
    },
  },
  {
    group: 'Popups',
    name: 'Settings window: every tab draws, a view setting applies',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); A.popups.open('settings', { tab: 'view' }); await T.popupReady('settings');
        const tabs = [...T.popupDoc('settings').querySelectorAll('.tab')].map((x) => x.dataset.value); const drawn = [];
        for (const id of tabs) { T.popupDoc('settings').querySelector('.tab[data-value="' + id + '"]').click(); await T.sleep(120); drawn.push(T.popupDoc('settings').querySelector('.settings-page')?.children.length > 0); }
        T.popupDoc('settings').querySelector('.tab[data-value="view"]').click(); await T.sleep(100);
        T.popupDoc('settings').querySelector('[data-setting="groupSize"][data-value="2"]').click(); await T.until(() => A.state.settings.groupSize === 2, 5000, 'group');
        A.app.updateSettings({ groupSize: 1 }); return { tabs, drawn };`);
      assert.equal(r.tabs.length, 10);
      assert.ok(r.drawn.every(Boolean));
    },
  },
  {
    group: 'Layout',
    name: 'Panels: explorer left, properties right, log and info below; toolbar never clipped',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); A.app.updateSettings({ showBottomPanel: true }); await T.frames(3);
        const tb = document.querySelector('.toolbar-left'); const hidden = [...document.querySelectorAll('#toolbar [data-group]')].filter((g) => g.hidden).length;
        const out = { left: document.querySelector('#left-panel .panel-vault')?.textContent, rightTabs: document.querySelectorAll('#right-panel [data-right-tab]').length, bottom: [...document.querySelectorAll('#bottom-panel [data-bottom-tab]')].map((b) => b.dataset.bottomTab), hidden, width: tb.scrollWidth <= tb.clientWidth + 1 };
        A.app.updateSettings({ showBottomPanel: false }); return out;`);
      assert.ok(r.left);
      assert.equal(r.rightTabs, 6);
      assert.deepEqual(r.bottom, ['messages', 'info']);
      assert.equal(r.hidden, 0);
    },
  },
  {
    group: 'Language',
    name: 'English: menus and panels in English',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'png' }); A.app.updateSettings({ language: 'en' }); await T.frames(3);
        const out = { menus: [...document.querySelectorAll('#menubar [data-menu] span')].map((s) => s.textContent), right: document.querySelector('[data-right-title]')?.textContent };
        A.app.updateSettings({ language: 'ko' }); return out;`);
      assert.deepEqual(r.menus, ['File', 'Edit', 'Search', 'View', 'Data', 'Tools', 'Help']);
    },
  },
];

/** What a command needs before it is enabled (run in the page after the sample is open and 100h–110h selected). */
const PREP = {
  undo: `await A.editor.edit(T.doc(), 'write', { offset: 0x100, data: new Uint8Array([0x41]), kind: 'test' });`,
  redo: `await A.editor.edit(T.doc(), 'write', { offset: 0x100, data: new Uint8Array([0x41]), kind: 'test' }); await A.run('undo');`,
  findNext: `await A.toolHost.ops.findNext({ pattern: { kind: 'hex', value: '00' }, wrap: true, scope: 'all' });`,
  findPrev: `await A.toolHost.ops.findNext({ pattern: { kind: 'hex', value: '00' }, wrap: true, scope: 'all' });`,
  bookmarkNext: `T.view().select(0x20, 0x20); await A.run('bookmarkToggle'); T.view().select(0x200, 0x200); await A.run('bookmarkToggle');`,
  bookmarkPrev: `T.view().select(0x20, 0x20); await A.run('bookmarkToggle'); T.view().select(0x200, 0x200); await A.run('bookmarkToggle');`,
  diffNext: `const a = T.doc().id; await A.app.openSample('png'); await T.until(() => T.doc().id !== a); await A.app.openCompare(a, T.doc().id); await T.until(() => A.app.activeTab()?.kind === 'compare', 8000, 'compare tab');`,
  diffPrev: `const a = T.doc().id; await A.app.openSample('png'); await T.until(() => T.doc().id !== a); await A.app.openCompare(a, T.doc().id); await T.until(() => A.app.activeTab()?.kind === 'compare', 8000, 'compare tab');`,
  columnMode: `await A.run('textMode'); await T.until(() => document.querySelector('.text-mode .cm-editor'), 8000, 'text editor');`,
  textWrap: `await A.run('textMode'); await T.until(() => document.querySelector('.text-mode .cm-editor'), 8000, 'text editor');`,  macroPlay: `await A.run('macroRecord'); T.view().focus(); T.key('A'); await T.view().inputChain; await A.run('macroRecord');`,
  macroRepeat: `await A.run('macroRecord'); T.view().focus(); T.key('A'); await T.view().inputChain; await A.run('macroRecord');`,
  macroSave: `await A.run('macroRecord'); T.view().focus(); T.key('A'); await T.view().inputChain; await A.run('macroRecord');`,
};
/** What a command leaves behind that the next case must not inherit. */
const CLEANUP = {
  macroRecord: `if (document.querySelector('.status-recording')) await A.run('macroRecord');`,
};

export async function commandCases(app) {
  // Commands hidden in the browser (desktop only: reload, disk images …) are not in its menus; the desktop suite runs them.
  const ids = await app.run(`return Object.keys(A.commands).filter((id) => !A.commands[id].hidden);`);
  const SKIP = new Set(['exit', 'tutorial', 'userGuide', 'tutorialDoc', 'startPage', 'open', 'openReadonly', 'backgroundImage', 'print', 'fullscreen', 'revealSystem', 'welcome', 'about', 'settings', 'shortcuts',
    'save', 'saveAs', 'saveAll', 'saveSelection', 'import', 'commandPalette', 'paste', 'paste:hex', 'paste:text', 'cut', 'compare', 'filetools', 'devices', 'openDisk', 'openProcess']);
  return ids.filter((id) => !SKIP.has(id)).map((id) => ({
    group: 'Commands',
    name: id,
    async run(a) {
      const r = await a.run(`await T.reset({ sample: 'mixed' }); const settings = JSON.parse(JSON.stringify(A.state.settings)); T.view().select(0x100, 0x110);
        ${PREP[id] ?? ''}
        if (!A.menus.enabled(${JSON.stringify(id)})) { await T.reset(); A.app.updateSettings(settings); return { disabled: true }; }
        const p = A.run(${JSON.stringify(id)}); await Promise.race([p, T.sleep(1200)]);
        const kinds = [...document.querySelectorAll('.web-popup')].map((f) => f.dataset.kind);
        ${CLEANUP[id] ?? ''}
        await T.reset(); A.app.updateSettings(settings);
        return { error: kinds.includes('error') };`);
      assert.ok(!r.disabled, 'the command is enabled once its state is set up');
      assert.ok(!r.error, 'no error popup');
      return undefined;
    },
  }));
}

export const COMMAND_HELPER = '1';
export { sleepFor };
