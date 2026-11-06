// The engine as the browser runs it, called from Node: WebAssembly, memory only. 7-Zip then checks
// what came out, and the native engine's archives go in.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { eq, ok } from '../assert.js';
import { root, scratch, assert7zOk, noise, sevenZip } from './ui.mjs';

export default async function suite(test) {
  const glue = path.join(root, 'src', 'engine', 'zipmaster_wasm.js');
  // Always: an engine older than the source would test the wrong code. Nothing to do when current.
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-wasm.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`could not build the web engine\n${r.stderr.slice(-2000)}`);
  const engine = await import(`file:///${glue.replace(/\\/g, '/')}`);
  engine.initSync({ module: fs.readFileSync(path.join(root, 'src', 'engine', 'zipmaster_wasm_bg.wasm')) });
  const dir = scratch('wasm');

  const call = (op, options, progress) => {
    const reply = JSON.parse(engine.call(op, JSON.stringify(options), progress));
    if (!reply.ok) throw Object.assign(new Error(`${reply.code}: ${reply.detail}`), { code: reply.code });
    return reply.result;
  };
  const fresh = () => {
    engine.clear();
    engine.put('/in/s/readme.txt', Buffer.from('hello web\n'.repeat(20000)), 1600000000);
    engine.put('/in/s/noise.bin', noise(400000, 3), 1600000000);
    engine.put('/in/s/한글.txt', Buffer.from('한글 내용\n'.repeat(1000)), -1);
  };
  const check = (prefix = '/ex') => {
    eq(Buffer.from(engine.read(`${prefix}/s/readme.txt`)).toString(), 'hello web\n'.repeat(20000));
    ok(Buffer.from(engine.read(`${prefix}/s/noise.bin`)).equals(noise(400000, 3)));
    eq(Buffer.from(engine.read(`${prefix}/s/한글.txt`)).toString(), '한글 내용\n'.repeat(1000));
  };
  const save = (name, file) => {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, engine.read(file));
    return p;
  };

  const formats = ['zip', '7z', 'rar', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst'];
  for (const format of formats) {
    await test(`${format}: create and extract`, () => {
      fresh();
      const r = call('create', { output: `/o/x.${format}`, format, sources: [{ path: '/in/s' }], level: 5 });
      eq(r.files, 3);
      eq(call('list', { path: `/o/x.${format}` }).format, format);
      ok(call('test', { path: `/o/x.${format}` }).ok);
      call('extract', { path: `/o/x.${format}`, dest: '/ex' });
      check();
      if (format !== 'tar.zst') assert7zOk(save(`one/x.${format}`, `/o/x.${format}`));
    });
    await test(`${format}: split to an exact size`, () => {
      fresh();
      const size = 128 * 1024;
      const r = call('create', { output: `/o/v.${format}`, format, sources: [{ path: '/in/s' }], volumeSize: size });
      ok(r.volumes.length >= 2, `${r.volumes.length} parts`);
      for (const v of r.volumes) ok(v.size <= size, `${v.path} is ${v.size}`);
      eq(call('list', { path: r.volumes[r.volumes.length - 1].path }).volumes.length, r.volumes.length);
      call('extract', { path: r.volumes[0].path, dest: '/ex' });
      check();
    });
  }

  for (const format of ['zip', '7z', 'rar']) {
    await test(`${format}: encryption`, () => {
      fresh();
      call('create', { output: `/o/p.${format}`, format, sources: [{ path: '/in/s' }], password: 'secret42' });
      let e = null;
      try { call('extract', { path: `/o/p.${format}`, dest: '/ex' }); } catch (err) { e = err; }
      eq(e?.code, 'password_required');
      e = null;
      try { call('extract', { path: `/o/p.${format}`, dest: '/ex', password: 'wrong' }); } catch (err) { e = err; }
      eq(e?.code, 'wrong_password');
      call('extract', { path: `/o/p.${format}`, dest: '/ex', password: 'secret42' });
      check();
      assert7zOk(save(`enc/p.${format}`, `/o/p.${format}`), 'secret42');
    });
  }

  await test('split 7z reads in 7-Zip', () => {
    fresh();
    const r = call('create', { output: '/o/v.7z', format: '7z', sources: [{ path: '/in/s' }], volumeSize: 100000, password: 'pw' });
    const names = r.volumes.map((v) => save(`vol/${path.posix.basename(v.path)}`, v.path));
    assert7zOk(names[0], 'pw');
  });

  await test('split ZIP reads in 7-Zip', () => {
    fresh();
    const r = call('create', { output: '/o/v.zip', format: 'zip', sources: [{ path: '/in/s' }], volumeSize: 100000 });
    const names = r.volumes.map((v) => save(`volz/${path.posix.basename(v.path)}`, v.path));
    assert7zOk(names[names.length - 1]);
  });

  await test('split RAR reads in 7-Zip', () => {
    fresh();
    const r = call('create', { output: '/o/v.rar', format: 'rar', sources: [{ path: '/in/s' }], volumeSize: 150000 });
    const names = r.volumes.map((v) => save(`volr/${path.posix.basename(v.path)}`, v.path));
    assert7zOk(names[0]);
  });

  await test('opens files made by 7-Zip', () => {
    const src = path.join(dir, 'from7z');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'a.txt'), 'from 7-zip\n'.repeat(5000));
    for (const [name, kind] of [['t.7z', '-t7z'], ['t.zip', '-tzip'], ['t.tar', '-ttar']]) {
      const out = path.join(dir, name);
      const made = sevenZip(['a', kind, out, path.join(src, 'a.txt')]);
      ok(made.ok, made.out);
      engine.clear();
      engine.put(`/a/${name}`, fs.readFileSync(out), -1);
      call('extract', { path: `/a/${name}`, dest: '/ex' });
      eq(Buffer.from(engine.read('/ex/a.txt')).toString(), 'from 7-zip\n'.repeat(5000), name);
    }
  });

  await test('opens real WinRAR files', () => {
    engine.clear();
    const rar = path.join(root, 'test', 'fixtures', 'rar');
    for (const n of ['multivol.part1.rar', 'multivol.part2.rar', 'multivol.part3.rar']) engine.put(`/r/${n}`, fs.readFileSync(path.join(rar, n)), -1);
    ok(call('test', { path: '/r/multivol.part2.rar' }).ok);
    eq(call('list', { path: '/r/multivol.part1.rar' }).volumes.length, 3);
  });

  await test('edit: add, delete, rename', () => {
    fresh();
    call('create', { output: '/o/m.7z', format: '7z', sources: [{ path: '/in/s' }] });
    engine.put('/in/new.txt', Buffer.from('new'), -1);
    const info = call('modify', {
      path: '/o/m.7z',
      add: [{ path: '/in/new.txt', name: 's/new.txt' }],
      delete: ['s/noise.bin'],
      rename: [{ from: 's/readme.txt', to: 's/README.md' }],
      mkdir: ['s/made'],
    });
    const names = info.entries.map((e) => e.path);
    ok(names.includes('s/new.txt') && names.includes('s/README.md') && names.includes('s/made'), names.join());
    ok(!names.includes('s/noise.bin'));
    assert7zOk(save('m.7z', '/o/m.7z'));
  });

  await test('repair: truncated ZIP', () => {
    fresh();
    call('create', { output: '/o/r.zip', format: 'zip', sources: [{ path: '/in/s' }] });
    const data = Buffer.from(engine.read('/o/r.zip'));
    const cd = data.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
    engine.put('/o/broken.zip', data.subarray(0, cd), -1);
    const r = call('repair', { path: '/o/broken.zip', output: '/o/fixed.zip' });
    eq(r.recovered, 4, 'three files and their folder');
    assert7zOk(save('fixed.zip', '/o/fixed.zip'));
  });

  await test('convert: tar.gz to split 7z', () => {
    fresh();
    call('create', { output: '/o/c.tar.gz', format: 'tar.gz', sources: [{ path: '/in/s' }] });
    const r = call('convert', { path: '/o/c.tar.gz', create: { output: '/o/c.7z', format: '7z', volumeSize: 150000 } });
    ok(r.volumes.length >= 2);
    call('extract', { path: r.volumes[0].path, dest: '/ex' });
    check();
  });

  await test('checksums match published values', () => {
    engine.clear();
    engine.put('/h/abc.txt', Buffer.from('abc'), -1);
    const [r] = call('hash', { paths: ['/h/abc.txt'], algorithms: ['crc32', 'md5', 'sha256', 'blake3'] });
    eq(r.hashes.crc32, '352441c2');
    eq(r.hashes.md5, '900150983cd24fb0d6963f7d28e17f72');
    eq(r.hashes.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    eq(r.hashes.blake3, '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85');
  });

  await test('split and join a file', () => {
    engine.clear();
    const data = noise(1000000, 9);
    engine.put('/s/movie.bin', data, -1);
    const parts = call('split', { path: '/s/movie.bin', volumeSize: 300000 });
    eq(parts.length, 4);
    engine.remove('/s/movie.bin');
    call('join', { path: parts[0].path });
    ok(Buffer.from(engine.read('/s/movie.bin')).equals(data));
  });

  await test('benchmark (clock comes from the browser)', () => {
    const r = call('benchmark', { megabytes: 1 });
    eq(r.length, 4);
    ok(r.every((x) => x.compressMbS > 0 && x.packed < x.size));
  });

  await test('progress callback reaches the total', () => {
    fresh();
    let last = null;
    call('create', { output: '/o/pr.zip', format: 'zip', sources: [{ path: '/in/s' }] }, (done, total) => { last = [done, total]; });
    ok(last && last[0] === last[1] && last[1] > 0, String(last));
  });

  await test('read one entry (preview)', () => {
    fresh();
    call('create', { output: '/o/e.zip', format: 'zip', sources: [{ path: '/in/s' }] });
    const b = engine.read_entry(JSON.stringify({ path: '/o/e.zip', entry: 's/한글.txt', limit: 10 }));
    eq(b.length, 10);
    let thrown = null;
    try { engine.read_entry(JSON.stringify({ path: '/o/e.zip', entry: 'none' })); } catch (e) { thrown = String(e); }
    ok(thrown?.includes('invalid'), thrown);
  });

  await test('broken input does not kill the engine', () => {
    engine.clear();
    for (const [name, data] of [['a.zip', noise(4000, 1)], ['b.7z', Buffer.concat([Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), noise(4000, 2)])], ['c.rar', Buffer.concat([Buffer.from('Rar!\x1a\x07\x01\x00', 'latin1'), noise(4000, 3)])]]) {
      engine.put(`/g/${name}`, data, -1);
      const reply = JSON.parse(engine.call('list', JSON.stringify({ path: `/g/${name}` })));
      eq(reply.ok, false, name);
    }
    engine.put('/after.txt', Buffer.from('still alive'), -1);
    eq(Buffer.from(engine.read('/after.txt')).toString(), 'still alive');
  });
}
