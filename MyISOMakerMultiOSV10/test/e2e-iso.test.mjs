// End to end through the real Rust engine (the code and channels the app uses):
// create an ISO from a folder with xorriso, open it, change single files (replace contents,
// add, rename, delete, new folder), save to a new ISO, open that again and compare every
// file's bytes; extract it with xorriso; mount it as a drive and read a file from the drive.
// Everything lives in a temp folder.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { flatten, startHost } from './host-client.mjs'

const h = startHost('isomaker-e2e-')
test.after(() => h.stop())
const { call, work, write } = h

const engine = await call('engine:info')
test('xorriso is available (the app installs it; CI installs it)', () => {
  assert.ok(engine.available, `xorriso not available: ${engine.hint}`)
})

const iso1 = path.join(work, 'made.iso')
const iso2 = path.join(work, 'edited.iso')
const big = Buffer.alloc(3 * 1024 * 1024 + 123)
for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff

test('create an ISO from a folder (xorriso)', async () => {
  write('readme.txt', 'version 1\n')
  write('docs/a.txt', 'alpha\n')
  write('docs/keep.md', '# keep\n')
  write('sub/remove-me.txt', 'bye\n')
  fs.writeFileSync(path.join(work, 'src', 'big.bin'), big)
  await call('iso:create', { sourceDir: path.join(work, 'src'), outputIso: iso1, volumeLabel: 'E2ETEST' })
  assert.ok(fs.statSync(iso1).size > 300_000, 'ISO written')
})

test('open it and see the files', async () => {
  const snap = await call('session:open', iso1)
  assert.equal(snap.volumeLabel, 'E2ETEST')
  const all = flatten(snap.root)
  for (const p of ['readme.txt', 'docs', 'docs/a.txt', 'docs/keep.md', 'sub/remove-me.txt', 'big.bin']) assert.ok(all.has(p), `${p} in the tree`)
  assert.equal(all.get('big.bin').size, big.length)
  assert.equal(snap.dirty, false)
})

test('change single files: replace, add, rename, delete, new folder', async () => {
  const repl = write('readme.txt', 'version 2 — replaced\n', path.join(work, 'new'))
  let snap = await call('session:addPaths', '', [repl])
  snap = await call('session:addPaths', 'docs', [write('new.txt', 'brand new\n', path.join(work, 'new'))])
  snap = await call('session:rename', 'docs/a.txt', 'b.txt')
  snap = await call('session:remove', 'sub/remove-me.txt')
  snap = await call('session:mkdir', '', 'extra')
  assert.equal(snap.dirty, true)
  const all = flatten(snap.root)
  assert.ok(all.has('docs/b.txt') && !all.has('docs/a.txt'), 'renamed')
  assert.ok(all.has('docs/new.txt'), 'added')
  assert.ok(!all.has('sub/remove-me.txt'), 'deleted')
  assert.ok(all.has('extra'), 'new folder')
})

test('save as a new ISO, open it again, compare every file', async () => {
  await call('session:save', iso2)
  assert.ok(fs.existsSync(iso2))
  const snap = await call('session:open', iso2)
  assert.equal(snap.dirty, false)
  const all = flatten(snap.root)
  const expect = {
    'readme.txt': 'version 2 — replaced\n',
    'docs/b.txt': 'alpha\n',
    'docs/keep.md': '# keep\n',
    'docs/new.txt': 'brand new\n',
  }
  for (const [p, text] of Object.entries(expect)) {
    assert.ok(all.has(p), `${p} in the saved image`)
    const out = path.join(work, 'check', p.replace(/\//g, '_'))
    fs.mkdirSync(path.dirname(out), { recursive: true })
    await call('session:exportFile', p, out)
    assert.equal(fs.readFileSync(out, 'utf8'), text, `${p} contents`)
  }
  const bigOut = path.join(work, 'check', 'big.bin')
  await call('session:exportFile', 'big.bin', bigOut)
  assert.ok(fs.readFileSync(bigOut).equals(big), 'big.bin byte for byte')
  assert.ok(!all.has('docs/a.txt') && !all.has('sub/remove-me.txt'))
  assert.ok(all.has('extra'))
})

test('the saved ISO extracts with xorriso (a standard tool reads it)', async () => {
  const out = path.join(work, 'extracted')
  await call('iso:extract', { isoPath: iso2, outputDir: out })
  assert.equal(fs.readFileSync(path.join(out, 'readme.txt'), 'utf8'), 'version 2 — replaced\n')
  assert.equal(fs.readFileSync(path.join(out, 'docs', 'new.txt'), 'utf8'), 'brand new\n')
  assert.ok(fs.readFileSync(path.join(out, 'big.bin')).equals(big))
})

// Windows: Mount-DiskImage · macOS: hdiutil · Linux: mount, or fuseiso without root (scripts/setup-linux.sh)
test('mount the saved ISO as a drive and read from it', async () => {
  await call('session:close')
  const res = await call('iso:mount', iso2)
  assert.ok(res.mounted, `mounted: ${res.message}`)
  assert.ok(res.mountPoint, 'a drive / mount point')
  try {
    const text = fs.readFileSync(path.join(res.mountPoint, 'readme.txt'), 'utf8')
    assert.equal(text, 'version 2 — replaced\n')
    assert.ok(fs.existsSync(path.join(res.mountPoint, 'docs', 'new.txt')))
  } finally {
    const off = await call('iso:unmount', process.platform === 'win32' ? iso2 : res.mountPoint)
    assert.equal(off.mounted, false, `unmounted: ${off.message}`)
  }
})
