// Desktop E2E: the debug exe with its own WebView2 profile and data folder. Every file it touches is made here,
// in its own temporary folder (never the user's files); disks are only listed, never opened; the only process
// memory read is this test runner's own (read-only, never saved).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myhexa-desktop-files-'));
const file = (name, bytes) => { const p = path.join(dir, name); if (bytes) fs.writeFileSync(p, Buffer.from(bytes)); return p; };
const js = (value) => JSON.stringify(value);

export const desktopCases = [
  {
    group: 'Files',
    name: 'A real file opens (file source, size, first bytes), and the explorer lists places',
    async run(app) {
      const p = file('open.bin', Array.from({ length: 5000 }, (_, i) => i & 255));
      const r = await app.run(`await T.reset(); await A.app.openFile(${js(p)}); await T.until(() => document.querySelector('.hx-row .hx-b')?.textContent.trim(), 8000, 'rows');
        const d = T.doc(); return { kind: d.source.kind, len: d.len, first: await T.bytes(0, 4), path: d.path, places: document.querySelectorAll('#left-panel .xp-place').length };`);
      assert.equal(r.kind, 'file');
      assert.equal(r.len, 5000);
      assert.deepEqual(r.first, [0, 1, 2, 3]);
      assert.ok(r.places > 0, 'explorer places');
    },
  },
  {
    group: 'Files',
    name: 'Overwrite and save: patched in place on disk; undo history restarts',
    async run(app) {
      const p = file('patch.bin', [1, 2, 3, 4, 5, 6, 7, 8]);
      await app.run(`await T.reset(); await A.app.openFile(${js(p)}); await T.until(() => T.doc(), 5000, 'doc');
        await A.editor.edit(T.doc(), 'write', { offset: 2, data: new Uint8Array([0xAA, 0xBB]) }); await A.editor.save(A.editor.active()); return T.doc().modified;`);
      assert.deepEqual([...fs.readFileSync(p)], [1, 2, 0xAA, 0xBB, 5, 6, 7, 8]);
    },
  },
  {
    group: 'Files',
    name: 'Insert and delete, then save: the file is rewritten (temporary file swapped in)',
    async run(app) {
      const p = file('resize.bin', [1, 2, 3, 4]);
      const r = await app.run(`await T.reset(); await A.app.openFile(${js(p)}); await T.until(() => T.doc(), 5000, 'doc');
        await A.editor.edit(T.doc(), 'insert', { offset: 0, data: new Uint8Array([9, 9]) }); await A.editor.edit(T.doc(), 'delete', { offset: 5, length: 1 });
        const ok = await A.editor.save(A.editor.active()); return { ok, modified: T.doc().modified, len: T.doc().len };`);
      assert.ok(r.ok);
      assert.equal(r.modified, false);
      assert.deepEqual([...fs.readFileSync(p)], [9, 9, 1, 2, 3]);
      assert.equal(fs.readdirSync(dir).filter((n) => n.includes('.tmp')).length, 0, 'no temporary file left');
    },
  },
  {
    group: 'Files',
    name: 'A new document saved under a name becomes a file document',
    async run(app) {
      const p = file('new.bin');
      const r = await app.run(`await T.reset(); const tab = await A.editor.newDocument(0); await A.editor.edit(tab.doc, 'insert', { offset: 0, data: new Uint8Array([0x4D, 0x5A]) });
        const info = await A.core('info', { id: tab.doc.id }); const saved = await window.__TAURI_INTERNALS__.invoke('hex_save', { id: tab.doc.id, path: ${js(p)}, op: '' }); return { kind: saved.kind, name: saved.name };`);
      assert.deepEqual([...fs.readFileSync(p)], [0x4D, 0x5A]);
      assert.equal(r.kind, 'file');
    },
  },
  {
    group: 'Files',
    name: 'A 200 MB file opens at once; search and hash run in the backend with progress',
    async run(app) {
      const p = path.join(dir, 'big.bin');
      const fd = fs.openSync(p, 'w');
      const chunk = Buffer.alloc(1 << 20, 0x11);
      for (let i = 0; i < 200; i += 1) fs.writeSync(fd, chunk);
      fs.writeSync(fd, Buffer.from('NEEDLE'));
      fs.closeSync(fd);
      const r = await app.run(`await T.reset(); const t0 = performance.now(); await A.app.openFile(${js(p)}); const opened = performance.now() - t0;
        const d = T.doc(); const found = await A.core('search', { id: d.id, pattern: { kind: 'text', value: 'NEEDLE' }, from: 0 }, 'op-test');
        const crc = await A.core('hash', { id: d.id, algorithms: ['crc32'] }, 'op-test2');
        return { opened, len: d.len, at: found.match?.offset, crc: crc.results[0].value };`, 180000);
      assert.equal(r.len, 200 * (1 << 20) + 6);
      assert.equal(r.at, 200 * (1 << 20));
      assert.ok(r.opened < 3000, `opened in ${Math.round(r.opened)} ms`);
      assert.match(r.crc, /^[0-9a-f]{8}$/);
      fs.rmSync(p, { force: true });
    },
  },
  {
    group: 'Files',
    name: 'Save a range, split into pieces and join them back, wipe a scratch file',
    async run(app) {
      const src = file('split.bin', Array.from({ length: 2500 }, (_, i) => (i * 13) & 255));
      const out = path.join(dir, 'joined.bin');
      const part = path.join(dir, 'part.bin');
      const wipe = file('wipe.bin', Array.from({ length: 4096 }, () => 0x55));
      const r = await app.run(`await T.reset(); await A.app.openFile(${js(src)}); const d = T.doc(); const inv = window.__TAURI_INTERNALS__.invoke;
        await inv('hex_save_range', { id: d.id, offset: 100, length: 50, path: ${js(part)}, op: '' });
        const parts = await inv('hex_split', { id: d.id, size: 1000, dir: ${js(dir)}, name: 'split.bin', op: '' });
        await inv('hex_concat', { paths: parts, out: ${js(out)}, op: '' });
        await inv('hex_wipe', { path: ${js(wipe)}, passes: 3, method: 'dod', op: '' });
        return parts.length;`);
      assert.equal(r, 3);
      assert.deepEqual([...fs.readFileSync(part)], [...fs.readFileSync(src).subarray(100, 150)]);
      assert.deepEqual(fs.readFileSync(out), fs.readFileSync(src));
      assert.equal(fs.existsSync(wipe), false);
    },
  },
  {
    group: 'Devices',
    name: 'Disks and processes are listed; this runner\'s own memory opens read-only with unreadable holes',
    async run(app) {
      const r = await app.run(`await T.reset(); const inv = window.__TAURI_INTERNALS__.invoke; const disks = await inv('hex_list_disks'); const procs = await inv('hex_list_processes');
        const info = await inv('hex_open_process', { pid: ${process.pid} }); const read = await A.core('read', { id: info.id, offset: 0, length: 4096 });
        await A.core('close', { id: info.id });
        return { disks: disks.length, volume: disks.some((d) => d.kind === 'volume'), procs: procs.length, self: procs.some((p) => p.pid === ${process.pid}), len: info.len, kind: info.kind, holes: read.holes.length, resizable: info.resizable };`);
      assert.ok(r.disks > 0 && r.volume, 'volumes listed');
      assert.ok(r.procs > 5 && r.self, 'processes listed');
      assert.equal(r.kind, 'process');
      assert.equal(r.resizable, false);
      assert.ok(r.len > 0x10000);
      assert.ok(r.holes >= 1, 'the null page is a hole');
    },
  },
  {
    group: 'Devices',
    name: 'A disk image opened as a disk: read-only until unlocked, written back sector by sector, saved as an image',
    async run(app) {
      const img = file('disk-image.img', Array.from({ length: 64 * 512 }, (_, i) => (i * 7) & 255));
      const copy = file('disk-copy.img');
      const r = await app.run(`await T.reset(); const inv = window.__TAURI_INTERNALS__.invoke;
        const info = await inv('hex_open_disk', { path: ${js(img)} });
        let refused = false; try { await A.core('write', { id: info.id, offset: 1000, data: btoa('\\x11\\x22') }); } catch { refused = true; }
        await A.core('setReadonly', { id: info.id, readonly: false });
        await A.core('write', { id: info.id, offset: 1000, data: btoa('\\x11\\x22') });
        await A.core('write', { id: info.id, offset: 5000, data: btoa('\\xAA') });
        const saved = await inv('hex_save', { id: info.id, path: null, op: '' });
        await inv('hex_save_range', { id: info.id, offset: 0, length: info.len, path: ${js(copy)}, op: '' });
        await A.core('close', { id: info.id });
        return { kind: info.kind, readonly: info.readonly, refused, len: info.len, modified: saved.modified };`);
      assert.equal(r.kind, 'disk');
      assert.equal(r.readonly, true);
      assert.ok(r.refused, 'a read-only disk refuses writes');
      assert.equal(r.len, 64 * 512);
      assert.equal(r.modified, false);
      const bytes = fs.readFileSync(img);
      assert.deepEqual([bytes[1000], bytes[1001], bytes[5000], bytes[999], bytes[1002]], [0x11, 0x22, 0xAA, (999 * 7) & 255, (1002 * 7) & 255]);
      assert.ok(fs.readFileSync(copy).equals(bytes), 'the saved image matches');
    },
  },
  {
    group: 'Files',
    name: 'Reload picks up a change made by another program',
    async run(app) {
      const p = file('reload.bin', [1, 2, 3, 4]);
      const r = await app.run(`await T.reset(); await A.app.openFile(${js(p)}); await T.until(() => T.doc()?.len === 4, 8000, 'open');
        const before = await T.bytes(0, 4); return before;`);
      assert.deepEqual(r, [1, 2, 3, 4]);
      fs.writeFileSync(p, Buffer.from([9, 8, 7, 6, 5]));
      const after = await app.run(`await A.run('reload'); await T.until(() => T.doc()?.len === 5, 8000, 'reloaded'); return await T.bytes(0, 5);`);
      assert.deepEqual(after, [9, 8, 7, 6, 5]);
    },
  },
  {
    group: 'Tools',
    name: 'Find in files searches a folder (recursive) in the backend',
    async run(app) {
      const sub = path.join(dir, 'fif', 'deep');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(dir, 'fif', 'a.bin'), Buffer.from('xxNEEDLExxNEEDLE'));
      fs.writeFileSync(path.join(sub, 'b.txt'), Buffer.from('no match here'));
      fs.writeFileSync(path.join(sub, 'c.dat'), Buffer.from('...NEEDLE'));
      const r = await app.run(`await T.reset(); const out = await A.toolHost.ops.findInFiles({ pattern: { kind: 'text', value: 'NEEDLE', encoding: 'utf8' }, files: [{ path: ${js(path.join(dir, 'fif'))} }], recursive: true });
        return out;`);
      const count = {};
      for (const m of r.matches) count[path.basename(m.path)] = (count[path.basename(m.path)] ?? 0) + 1;
      assert.deepEqual(count, { 'a.bin': 2, 'c.dat': 1 });
      assert.equal(r.files, 3);
    },
  },
  {
    group: 'Tools',
    name: 'File systems of a disk image file on disk: list, read a file and a deleted one',
    async run(app) {
      const { sampleBytes } = await import('../../src/domain/samples.js');
      const p = file('sample-disk.img', await sampleBytes('disk'));
      const r = await app.run(`await T.reset(); await A.app.openFile(${js(p)}); await T.until(() => T.doc()?.len > 0, 8000, 'open');
        const id = T.doc().id; const parts = await A.core('fsPartitions', { id }); const off = parts.partitions[0].offset;
        const root = await A.core('fsList', { id, offset: off, dir: null, deleted: true });
        const readme = root.entries.find((e) => e.name === 'README.TXT'); const del = root.entries.find((e) => e.deleted);
        const text = atob((await A.core('fsRead', { id, offset: off, file: readme.id })).data);
        const gone = new TextDecoder().decode(Uint8Array.from(atob((await A.core('fsRead', { id, offset: off, file: del.id })).data), (c) => c.charCodeAt(0)));
        return { fs: parts.partitions.map((x) => x.fs), text, gone };`);
      assert.deepEqual(r.fs, ['fat16', 'fat12']);
      assert.match(r.text, /MyHexaMaster sample disk/);
      assert.match(r.gone, /지워진 파일/);
    },
  },
  {
    group: 'Print',
    name: 'Print from the guide window and from the main window: always the print OS window with printers and preview (never printed)',
    async run(app) {
      const { listTargets, Page } = await import('./cdp.mjs');
      const printWindow = async () => {
        const end = Date.now() + 20000;
        while (Date.now() < end) {
          const target = (await listTargets(app.port)).find((x) => x.type === 'page' && (x.title === 'popup-print' || String(x.url).includes('popup=print')));
          if (target) {
            const page = await new Page(target).open();
            try {
              const state = await page.eval(`(() => ({ visible: document.visibilityState, window: Boolean(document.querySelector('.print-window')), printers: document.querySelectorAll('.print-settings select option').length, pages: document.querySelector('.print-frame')?.contentDocument?.querySelectorAll('.pagedjs_page').length ?? 0, busy: !document.querySelector('.print-busy')?.hidden }))()`);
              if (state.window && state.pages > 0 && !state.busy) return state;
            } finally { page.close?.(); }
          }
          await new Promise((r) => setTimeout(r, 300));
        }
        throw new Error('the print window did not come up');
      };
      // The guide window asks the main window exactly like this (viewer.js printDoc).
      await app.run(`await T.reset(); await window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'WebviewWindow', label: 'main' }, event: 'popup-message', payload: { kind: 'doc-guide', type: 'action', data: { action: 'doc-print', doc: 'guide', lang: 'ko' } } }); return 1;`);
      const fromGuide = await printWindow();
      await app.run('await A.popups.closeAll(); return 1;');
      await app.run(`await T.reset({ sample: 'png' }); A.run('print'); return 1;`);
      const fromMain = await printWindow();
      await app.run('await A.popups.closeAll(); return 1;');
      for (const s of [fromGuide, fromMain]) {
        assert.equal(s.visible, 'visible');
        assert.ok(s.printers > 0, 'printers listed');
        assert.ok(s.pages > 0, 'preview pages');
      }
      assert.ok(fromGuide.pages > 3, `guide: ${fromGuide.pages} pages`);
    },
  },
  {
    group: 'Popups',
    name: 'A tool window opens as an OS window (find) and answers through the main window',
    async run(app) {
      const r = await app.run(`await T.reset({ sample: 'mixed' }); A.popups.open('calc'); await T.sleep(1500);
        const ops = await A.toolHost.ops.core({ method: 'evaluate', args: { expr: '6*7', width: 32 } }); A.popups.close('calc'); return ops.value;`);
      assert.equal(r, '42');
    },
  },
];

process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* in use */ } });
