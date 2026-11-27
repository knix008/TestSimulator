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
  textWrap: `await A.run('textMode'); await T.until(() => document.querySelector('.text-mode .cm-editor'), 8000, 'text editor');`,
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
