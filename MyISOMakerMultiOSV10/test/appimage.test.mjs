// AppImage without squashfs-tools: the built-in SquashFS reader on images made by the real
// mksquashfs (fixtures, gzip and zstd with fragments), folder → AppImage through the host,
// opening an AppImage as a session, editing and saving it again.
// The runtime is a stand-in (ELF header only) unless ISOMAKER_TEST_REAL_APPIMAGE=1 (Linux CI):
// then the official type-2 runtime is downloaded and the AppImage really runs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { flatten, root, startHost } from './host-client.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isomaker-appimg-'))
const sqOut = path.join(tmp, 'squashfs.mjs')
await build({ entryPoints: [path.join(root, 'host', 'squashfs.ts')], outfile: sqOut, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const sq = await import(`file:///${sqOut.split(path.sep).join('/')}`)

const real = process.env.ISOMAKER_TEST_REAL_APPIMAGE === '1' && process.platform === 'linux'
const fakeRuntime = path.join(tmp, 'runtime')
const elf = Buffer.alloc(4096)
Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]).copy(elf)
fs.writeFileSync(fakeRuntime, elf)
process.env.ISOMAKER_APPIMAGE_RUNTIME = real ? '' : fakeRuntime
if (real) delete process.env.ISOMAKER_APPIMAGE_RUNTIME

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

for (const kind of ['gzip', 'zstd']) {
  test(`reads a real mksquashfs image (${kind}, fragments)`, () => {
    const img = sq.openSquashfs(path.join(fixtures, `fixture-${kind}.sqfs`), 0)
    try {
      assert.equal(img.superblock.compression, kind === 'gzip' ? 1 : 6)
      const files = img.list().filter((e) => e.kind === 'file').map((e) => e.path).sort()
      assert.deepEqual(files, walk(srcDir).sort())
      for (const f of files) assert.ok(img.readFile(f).equals(fs.readFileSync(path.join(srcDir, f))), f)
      const appRun = img.list().find((e) => e.path === 'AppRun')
      assert.ok(appRun.mode & 0o111, 'AppRun is executable')
    } finally {
      img.close()
    }
  })
}

test('writes a SquashFS that the reader reads back (all files, modes, empty, many, unicode)', () => {
  const out = path.join(tmp, 'rt.sqfs')
  const fd = fs.openSync(out, 'w')
  const size = sq.writeSquashfs(fd, 0, sq.sourceFromDisk(srcDir))
  fs.closeSync(fd)
  assert.equal(size % 4096, 0)
  const img = sq.openSquashfs(out, 0)
  try {
    for (const f of walk(srcDir)) assert.ok(img.readFile(f).equals(fs.readFileSync(path.join(srcDir, f))), f)
  } finally {
    img.close()
  }
  const unsq = spawnSync('unsquashfs', ['-s', out], { encoding: 'utf8' })
  if (unsq.status === 0) assert.match(unsq.stdout, /SQUASHFS 4:0/)
})

const appDir = path.join(tmp, 'MyTool')
let appImage = ''
test('folder → AppImage: runtime + SquashFS, AppRun / .desktop / icon added', async () => {
  fs.mkdirSync(path.join(appDir, 'usr', 'bin'), { recursive: true })
  fs.writeFileSync(path.join(appDir, 'usr', 'bin', 'mytool'), '#!/bin/sh\necho "hello from mytool"\n')
  if (process.platform !== 'win32') fs.chmodSync(path.join(appDir, 'usr', 'bin', 'mytool'), 0o755)
  fs.writeFileSync(path.join(appDir, 'data.txt'), 'payload')
  appImage = path.join(tmp, 'MyTool.AppImage')
  const r = await h.call('iso:createAppImage', { sourceDir: appDir, output: appImage, name: 'My Tool' })
  assert.ok(r.ok && r.offset > 0)
  const head = fs.readFileSync(appImage).subarray(0, 4)
  assert.deepEqual([...head], [0x7f, 0x45, 0x4c, 0x46], 'starts with the ELF runtime')
  const img = sq.openSquashfs(appImage, r.offset)
  try {
    const names = img.list().map((e) => e.path)
    for (const n of ['AppRun', 'My-Tool.desktop', 'My-Tool.png', '.DirIcon', 'usr/bin/mytool', 'data.txt']) assert.ok(names.includes(n), n)
    assert.match(img.readFile('My-Tool.desktop').toString(), /Name=My Tool[\s\S]*Exec=AppRun[\s\S]*Icon=My-Tool/)
    assert.equal(img.list().find((e) => e.path === 'AppRun').mode & 0o777, 0o755)
    assert.equal(img.readFile('data.txt').toString(), 'payload')
  } finally {
    img.close()
  }
  assert.ok(fs.existsSync(path.join(appDir, 'usr')) && !fs.existsSync(path.join(appDir, 'AppRun')), 'the source folder is not changed')
})

test('open the AppImage as a session (no squashfs-tools), edit, save as AppImage, reopen', async () => {
  const snap = await h.call('session:open', appImage)
  assert.equal(snap.sourceKind, 'appimage')
  let all = flatten(snap.root)
  assert.ok(all.has('usr/bin/mytool') && all.has('data.txt') && all.has('AppRun'))
  const extra = path.join(tmp, 'extra.txt')
  fs.writeFileSync(extra, 'added later')
  await h.call('session:addPaths', 'usr', [extra])
  const out = path.join(tmp, 'MyTool-edited.AppImage')
  await h.call('session:save', out)
  const again = await h.call('session:open', out)
  all = flatten(again.root)
  assert.ok(all.has('usr/extra.txt'), 'added file kept')
  const check = path.join(tmp, 'check.txt')
  await h.call('session:exportFile', 'usr/extra.txt', check)
  assert.equal(fs.readFileSync(check, 'utf8'), 'added later')
  assert.ok(fs.readFileSync(out).subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), 'runtime kept')
  await h.call('session:close')
})

test('the AppImage really runs and extracts (Linux, official runtime)', { skip: !real && 'set ISOMAKER_TEST_REAL_APPIMAGE=1 on Linux' }, () => {
  fs.chmodSync(appImage, 0o755)
  const run = spawnSync(appImage, [], { encoding: 'utf8', env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' } })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /hello from mytool/)
  const cwd = fs.mkdtempSync(path.join(tmp, 'x-'))
  execFileSync(appImage, ['--appimage-extract'], { cwd, stdio: 'ignore' })
  assert.equal(fs.readFileSync(path.join(cwd, 'squashfs-root', 'data.txt'), 'utf8'), 'payload')
  const unsq = spawnSync('unsquashfs', ['-l', '-o', String(fs.readFileSync(appImage).indexOf(Buffer.from('hsqs'))), appImage], { encoding: 'utf8' })
  if (unsq.status === 0) assert.match(unsq.stdout, /usr\/bin\/mytool/)
})
