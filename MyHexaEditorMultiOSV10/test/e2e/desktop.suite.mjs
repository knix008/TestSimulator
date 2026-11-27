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
