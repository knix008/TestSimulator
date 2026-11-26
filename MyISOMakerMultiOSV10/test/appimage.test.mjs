// AppImage without squashfs-tools, through the Rust engine: images made by the real mksquashfs
// (fixtures, gzip and zstd with fragments) open as sessions, folder → AppImage, opening that
// AppImage as a session, editing and saving it again.
// The runtime is a stand-in (ELF header only) unless ISOMAKER_TEST_REAL_APPIMAGE=1 (Linux CI):
// then the official type-2 runtime is downloaded and the AppImage really runs.
// (The SquashFS reader and writer themselves are tested in Rust: test/rust.test.mjs.)
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { flatten, root, startHost } from './host-client.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isomaker-appimg-'))
const real = process.env.ISOMAKER_TEST_REAL_APPIMAGE === '1' && process.platform === 'linux'
const fakeRuntime = path.join(tmp, 'runtime')
const elf = Buffer.alloc(4096)
Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]).copy(elf)
fs.writeFileSync(fakeRuntime, elf)
if (real) delete process.env.ISOMAKER_APPIMAGE_RUNTIME
else process.env.ISOMAKER_APPIMAGE_RUNTIME = fakeRuntime

const h = startHost('isomaker-appimg-host-')
test.after(async () => {
  await h.stop()
  fs.rmSync(tmp, { recursive: true, force: true })
})

const fixtures = path.join(root, 'test', 'fixtures')
const srcDir = path.join(fixtures, 'squashfs-src')
function walk(dir, rel = '', out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name
    if (d.isDirectory()) walk(path.join(dir, d.name), r, out)
    else out.push(r)
  }
  return out
}
const inspect = (file, offset = 0) => h.call('squashfs:inspect', file, offset)
const readSq = async (file, offset, rel) => Buffer.from(await h.call('squashfs:read', file, offset, rel), 'hex')

for (const kind of ['gzip', 'zstd']) {
  test(`a real mksquashfs image (${kind}, fragments) opens as an AppImage session`, async () => {
    // An AppImage = ELF runtime + this SquashFS
    const app = path.join(tmp, `fixture-${kind}.AppImage`)
    fs.writeFileSync(app, Buffer.concat([elf, fs.readFileSync(path.join(fixtures, `fixture-${kind}.sqfs`))]))
    const snap = await h.call('session:open', app)
    assert.equal(snap.sourceKind, 'appimage')
    assert.equal(snap.canSaveAppImage, true)
    const all = flatten(snap.root)
    for (const f of walk(srcDir)) {
      assert.ok(all.has(f), `${f} listed`)
      const out = path.join(tmp, `out-${kind}`, f)
      await h.call('session:exportFile', f, out)
      assert.ok(fs.readFileSync(out).equals(fs.readFileSync(path.join(srcDir, f))), `${f} bytes`)
    }
    const info = await inspect(path.join(fixtures, `fixture-${kind}.sqfs`))
    assert.equal(info.compression, kind === 'gzip' ? 1 : 6)
    assert.ok(info.entries.find((e) => e.path === 'AppRun').mode & 0o111, 'AppRun is executable')
    await h.call('session:close')
  })
}

const appDir = path.join(tmp, 'MyTool')
let appImage = ''
let offset = 0
test('folder → AppImage: runtime + SquashFS, AppRun / .desktop / icon added', async () => {
  fs.mkdirSync(path.join(appDir, 'usr', 'bin'), { recursive: true })
  fs.writeFileSync(path.join(appDir, 'usr', 'bin', 'mytool'), '#!/bin/sh\necho "hello from mytool"\n')
  if (process.platform !== 'win32') fs.chmodSync(path.join(appDir, 'usr', 'bin', 'mytool'), 0o755)
  fs.writeFileSync(path.join(appDir, 'data.txt'), 'payload')
  appImage = path.join(tmp, 'MyTool.AppImage')
  const r = await h.call('iso:createAppImage', { sourceDir: appDir, output: appImage, name: 'My Tool' })
  assert.ok(r.ok && r.offset > 0)
  offset = r.offset
  assert.equal(fs.statSync(appImage).size, r.size)
  assert.deepEqual([...fs.readFileSync(appImage).subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46], 'starts with the ELF runtime')
  const info = await inspect(appImage, offset)
  const names = info.entries.map((e) => e.path)
  for (const n of ['AppRun', 'My-Tool.desktop', 'My-Tool.png', '.DirIcon', 'usr/bin/mytool', 'data.txt']) assert.ok(names.includes(n), n)
  assert.match((await readSq(appImage, offset, 'My-Tool.desktop')).toString(), /Name=My Tool[\s\S]*Exec=AppRun[\s\S]*Icon=My-Tool/)
  assert.equal(info.entries.find((e) => e.path === 'AppRun').mode & 0o777, 0o755)
  assert.equal(info.entries.find((e) => e.path === 'usr/bin/mytool').mode & 0o777, 0o755, 'programs in bin/ are executable')
  assert.equal((await readSq(appImage, offset, 'data.txt')).toString(), 'payload')
  assert.equal(info.inodeCount, info.entries.length + 1, 'every inode reachable from the root')
  assert.ok(fs.existsSync(path.join(appDir, 'usr')) && !fs.existsSync(path.join(appDir, 'AppRun')), 'the source folder is not changed')
  assert.ok(h.events.some((e) => e.ch === 'job:progress' && e.p.phase === 'appimage'), 'progress reaches the page')
})

test('open the AppImage as a session, edit, save as AppImage, reopen', async () => {
  const snap = await h.call('session:open', appImage)
  assert.equal(snap.sourceKind, 'appimage')
  let all = flatten(snap.root)
  assert.ok(all.has('usr/bin/mytool') && all.has('data.txt') && all.has('AppRun'))
  const extra = path.join(tmp, 'extra.txt')
  fs.writeFileSync(extra, 'added later')
  await h.call('session:addPaths', 'usr', [extra])
  await h.call('session:rename', 'data.txt', 'data-renamed.txt')
  const out = path.join(tmp, 'MyTool-edited.AppImage')
  const saved = await h.call('session:save', out)
  assert.equal(saved.dirty, false)
  const again = await h.call('session:open', out)
  all = flatten(again.root)
  assert.ok(all.has('usr/extra.txt'), 'added file kept')
  assert.ok(all.has('data-renamed.txt') && !all.has('data.txt'), 'rename kept')
  const check = path.join(tmp, 'check.txt')
  await h.call('session:exportFile', 'usr/extra.txt', check)
  assert.equal(fs.readFileSync(check, 'utf8'), 'added later')
  assert.ok(fs.readFileSync(out).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), 'runtime kept')
  const info = await inspect(out, offset)
  assert.equal(info.entries.find((e) => e.path === 'AppRun').mode & 0o777, 0o755, 'modes kept through open → save')
  await h.call('session:close')
})

test('a tree from an ISO saves as AppImage only when an AppImage was opened', async () => {
  const src = path.join(tmp, 'iso-src')
  fs.mkdirSync(src, { recursive: true })
  fs.writeFileSync(path.join(src, 'a.txt'), 'a')
  const iso = path.join(tmp, 'plain.iso')
  await h.call('iso:create', { sourceDir: src, outputIso: iso })
  await h.call('session:open', iso)
  await assert.rejects(h.call('session:save', path.join(tmp, 'nope.AppImage')), /AppImage/)
  await h.call('session:close')
})

test('the AppImage is valid: ELF runtime, SquashFS right after it, launcher ready (and on Linux it runs)', async () => {
  const bytes = fs.readFileSync(appImage)
  assert.deepEqual([...bytes.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46], 'ELF runtime first')
  assert.equal(bytes.indexOf(Buffer.from('hsqs')), offset, 'SquashFS after the runtime')
  const info = await inspect(appImage, offset)
  const appRun = info.entries.find((e) => e.path === 'AppRun')
  assert.ok(appRun && appRun.mode & 0o111, 'AppRun executable')
  assert.match((await readSq(appImage, offset, 'AppRun')).toString(), /^#!\/bin\/sh/)
  const desktop = info.entries.find((e) => e.path.endsWith('.desktop') && !e.path.includes('/'))
  assert.ok(desktop, '.desktop at the top')
  assert.match((await readSq(appImage, offset, desktop.path)).toString(), /^\[Desktop Entry\][\s\S]*Exec=AppRun/m)
  // squashfs-tools agree when installed (Linux CI, or WSL / MSYS2 here)
  const unsq = spawnSync('unsquashfs', ['-l', '-o', String(offset), appImage], { encoding: 'utf8' })
  if (unsq.status === 0) assert.match(unsq.stdout, /usr\/bin\/mytool/)
  if (!real) return
  fs.chmodSync(appImage, 0o755)
  const run = spawnSync(appImage, [], { encoding: 'utf8', env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' } })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /hello from mytool/)
  const cwd = fs.mkdtempSync(path.join(tmp, 'x-'))
  execFileSync(appImage, ['--appimage-extract'], { cwd, stdio: 'ignore' })
  assert.equal(fs.readFileSync(path.join(cwd, 'squashfs-root', 'data.txt'), 'utf8'), 'payload')
})
