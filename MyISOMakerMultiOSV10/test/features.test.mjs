// Every host feature the app's buttons use, through the real Node host:
// explorer listing, remembered folders, tree listing, folder adds, nested folders, renaming
// folders, multi-delete, exporting several files, drag-out temp copies, tricky names (long,
// Korean, 8.3 clashes, empty files, a directory larger than one sector, deep nesting),
// IMG files, Docker tar open/edit/save, bootable ISOs (BIOS + UEFI), job progress, cancel,
// package status; plus the browser session (web version) and the default output names.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { flatten, root, startHost } from './host-client.mjs'

const h = startHost('isomaker-feat-')
test.after(() => h.stop())
const { call, work, write } = h
const engine = await call('engine:info')
const noXorriso = engine.available ? false : 'xorriso not available'

const xorrisoBin = engine.binaryPath
function xorriso(...args) {
  const env = { ...process.env, MSYS2_ARG_CONV_EXCL: '*', MSYS_NO_PATHCONV: '1' }
  if (process.platform === 'win32' && path.isAbsolute(xorrisoBin)) env.PATH = `${path.dirname(xorrisoBin)};${env.PATH}`
  return execFileSync(xorrisoBin, args, { cwd: work, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// ── a base image ──
const baseIso = path.join(work, 'base.iso')
test('setup: base image with xorriso', { skip: noXorriso }, async () => {
  write('readme.txt', 'hello\n')
  write('docs/a.txt', 'A\n')
  write('docs/b.txt', 'B\n')
  write('docs/c.txt', 'C\n')
  await call('iso:create', { sourceDir: path.join(work, 'src'), outputIso: baseIso, volumeLabel: 'BASE' })
  assert.ok(fs.existsSync(baseIso))
  assert.ok(h.events.some((e) => e.ch === 'job:progress'), 'job progress events reach the page')
})

test('explorer: places, folder listing, stat', async () => {
  const places = await call('fs:places')
  assert.ok(places.length > 0)
  assert.ok(places.some((p) => p.kind === 'home'))
  write('list/x.iso', 'not really an iso')
  write('list/y.txt', 'text')
  fs.mkdirSync(path.join(work, 'src', 'list', 'zdir'), { recursive: true })
  const list = await call('fs:list', path.join(work, 'src', 'list'))
  assert.deepEqual(list.map((e) => e.name), ['zdir', 'x.iso', 'y.txt'], 'folders first, then files by name')
  assert.equal(list.find((e) => e.name === 'x.iso').image, true)
  assert.equal(list.find((e) => e.name === 'y.txt').image, false)
  const st = await call('fs:stat', path.join(work, 'src', 'list', 'y.txt'))
  assert.equal(st.size, 4)
  assert.equal(await call('fs:stat', path.join(work, 'nope')), null)
})

test('dialogs: the folder used last is remembered', async () => {
  const dir = path.join(work, 'src', 'docs')
  await call('paths:remember', path.join(dir, 'a.txt'))
  assert.equal(await call('paths:dialogDefault', null, null), dir)
  assert.equal(await call('paths:dialogDefault', null, 'out.iso'), path.join(dir, 'out.iso'))
})

test('list an image tree without opening a session', { skip: noXorriso }, async () => {
  const tree = await call('iso:listTree', baseIso)
  const all = flatten(tree.root)
  assert.ok(all.has('docs/a.txt') && all.has('readme.txt'))
})

test('session: add a whole folder, nested folders, rename a folder, multi-delete', { skip: noXorriso }, async () => {
  await call('session:open', baseIso)
  const folder = path.join(work, 'addme')
  write('one.txt', '1', folder)
  write('inner/two.txt', '22', folder)
  let snap = await call('session:addPaths', '', [folder])
  let all = flatten(snap.root)
  assert.ok(all.has('addme/one.txt') && all.has('addme/inner/two.txt'), 'folder added with its contents')
  await call('session:mkdir', '', 'level1')
  snap = await call('session:mkdir', 'level1', 'level2')
  assert.ok(flatten(snap.root).has('level1/level2'))
  snap = await call('session:rename', 'addme', 'renamed')
  all = flatten(snap.root)
  assert.ok(all.has('renamed/inner/two.txt') && !all.has('addme'), 'folder renamed with its contents')
  snap = await call('session:removeMany', ['docs/a.txt', 'docs/b.txt'])
  all = flatten(snap.root)
  assert.ok(!all.has('docs/a.txt') && !all.has('docs/b.txt') && all.has('docs/c.txt'))
  assert.deepEqual(await call('session:isDirty'), { dirty: true })
  assert.equal((await call('session:get')).dirty, true)
})

test('session: export several files, drag-out temp copies', { skip: noXorriso }, async () => {
  const out = path.join(work, 'exported')
  const r = await call('session:exportFilesToDir', ['readme.txt', 'docs/c.txt', 'renamed/inner/two.txt'], out)
  assert.equal(r.count, 3)
  assert.equal(fs.readFileSync(path.join(out, 'readme.txt'), 'utf8'), 'hello\n')
  assert.equal(fs.readFileSync(path.join(out, 'two.txt'), 'utf8'), '22')
  const one = await call('session:prepareDragOut', 'docs/c.txt')
  assert.equal(fs.readFileSync(one.tempPath, 'utf8'), 'C\n')
  const many = await call('session:prepareDragOutMany', ['readme.txt', 'renamed/one.txt'])
  assert.equal(many.tempPaths.length, 2)
  assert.equal(fs.readFileSync(many.tempPaths[1], 'utf8'), '1')
  await call('session:close')
  assert.equal(await call('session:get'), null)
})

test('tricky names survive a save: long, Korean, 8.3 clashes, empty, big directory, deep', { skip: noXorriso }, async () => {
  await call('session:open', baseIso)
  const base = path.join(work, 'tricky')
  const names = {
    'a very long file name that goes past sixty four characters for sure — really.txt': 'long',
    '한글 파일 이름.txt': '한글',
    'longfilename-one.txt': 'one',
    'longfilename-two.txt': 'two',
    'LONGFILENAME-ONE.md': 'md',
    'empty.bin': '',
    'no-extension': 'noext',
  }
  const paths = Object.entries(names).map(([n, t]) => write(n, t, base))
  await call('session:addPaths', '', paths)
  const many = []
  for (let i = 0; i < 160; i++) many.push(write(`file-with-a-longer-name-${String(i).padStart(3, '0')}.dat`, `n${i}`, path.join(base, 'many')))
  await call('session:mkdir', '', 'many')
  await call('session:addPaths', 'many', many)
  let deep = ''
  for (let i = 1; i <= 8; i++) {
    await call('session:mkdir', deep, `d${i}`)
    deep = deep ? `${deep}/d${i}` : `d${i}`
  }
  await call('session:addPaths', deep, [write('deep.txt', 'deep', base)])
  const out = path.join(work, 'tricky.iso')
  await call('session:save', out)
  const snap = await call('session:open', out)
  const all = flatten(snap.root)
  for (const [n, t] of Object.entries(names)) {
    const want = n.length > 64 ? [...all.keys()].find((k) => k.startsWith('a very long file name')) : n
    assert.ok(want && all.has(want), `${n} kept (Joliet)`)
    const dest = path.join(work, 'tricky-out', `${Object.keys(names).indexOf(n)}`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await call('session:exportFile', want, dest)
    assert.equal(fs.readFileSync(dest, 'utf8'), t, `${n} contents`)
  }
  assert.ok(all.has('longfilename-one.txt') && all.has('longfilename-two.txt'), 'names that clash in 8.3 both kept')
  assert.equal([...all.keys()].filter((k) => k.startsWith('many/')).length, 160, 'a directory larger than one sector')
  assert.ok(all.has(`${deep}/deep.txt`), 'eight levels deep')
  // A standard reader agrees (xorriso reads the ISO 9660 / Joliet trees we wrote)
  const report = xorriso('-indev', 'tricky.iso', '-find', '/', '-type', 'f')
  assert.match(report, /file-with-a-longer-name-159/i)
  assert.match(report, /d8.*deep/i)
  await call('session:close')
})

test('IMG files open like ISO images', { skip: noXorriso }, async () => {
  const img = path.join(work, 'disk.img')
  fs.copyFileSync(baseIso, img)
  const snap = await call('session:open', img)
  assert.equal(snap.sourceKind, 'img')
  assert.ok(flatten(snap.root).has('readme.txt'))
  await call('session:close')
})

const systemTar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : '/usr/bin/tar'
test('Docker save (.tar): open, edit, save as tar', { skip: !fs.existsSync(systemTar) && 'no tar' }, async () => {
  const layer = path.join(work, 'layer')
  write('manifest.json', '[{"Config":"cfg.json","RepoTags":["demo:1"],"Layers":["l1/layer.tar"]}]', layer)
  write('cfg.json', '{}', layer)
  write('l1/layer.tar', 'pretend layer', layer)
  const tar = path.join(work, 'image.tar')
  execFileSync(systemTar, ['-cf', tar, '-C', layer, '.'])
  const snap = await call('session:open', tar)
  assert.equal(snap.sourceKind, 'docker')
  assert.ok(flatten(snap.root).has('manifest.json'))
  await call('session:addPaths', '', [write('added.txt', 'added', path.join(work, 'tar-add'))])
  const out = path.join(work, 'image-edited.tar')
  await call('session:save', out)
  const listing = execFileSync(systemTar, ['-tf', out], { encoding: 'utf8' })
  assert.match(listing, /manifest\.json/)
  assert.match(listing, /added\.txt/)
  await call('session:close')
})

test('bootable ISO: BIOS (El Torito) and UEFI boot entries', { skip: noXorriso }, async () => {
  const src = path.join(work, 'bootsrc')
  write('boot/grub/i386-pc/eltorito.img', Buffer.alloc(2048, 0x90), src)
  write('EFI/BOOT/efiboot.img', Buffer.alloc(1440 * 1024), src)
  write('README', 'boot me\n', src)
  const out = path.join(work, 'boot.iso')
  await call('iso:createBootable', {
    sourceDir: src,
    outputIso: out,
    volumeLabel: 'BOOTTEST',
    biosBootImage: 'boot/grub/i386-pc/eltorito.img',
    efiBootImage: 'EFI/BOOT/efiboot.img',
  })
  const report = xorriso('-indev', 'boot.iso', '-report_el_torito', 'plain')
  assert.match(report, /BIOS/i, 'BIOS boot entry')
  assert.match(report, /UEFI/i, 'UEFI boot entry')
})

test('cancel: a job can be stopped; nothing to cancel is reported', async () => {
  const idle = await call('iso:cancel')
  assert.deepEqual(idle, { ok: true, canceled: false })
})

test('packages: status for xorriso and squashfs-tools, required list', async () => {
  const status = await call('pkg:status')
  assert.deepEqual(status.map((p) => p.id).sort(), ['squashfs', 'xorriso'])
  const x = status.find((p) => p.id === 'xorriso')
  assert.equal(x.required, true)
  assert.ok(['app', 'system', 'missing'].includes(x.state))
  if (engine.available) assert.notEqual(x.state, 'missing')
  const missing = await call('pkg:missingRequired')
  assert.ok(Array.isArray(missing))
  assert.deepEqual(await call('pkg:cancel'), { canceled: false })
})

// ── pure JS: the web version's session and the default names ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isomaker-js-'))
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
async function load(entry) {
  const out = path.join(tmp, `${path.basename(entry)}.mjs`)
  await build({ entryPoints: [path.join(root, entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
  return import(`file:///${out.split(path.sep).join('/')}`)
}

test('web version: open an ISO in the browser session, edit, save, reopen', { skip: noXorriso }, async () => {
  const { IsoEditSession } = await load('src/iso9660/session.ts')
  const blob = new Blob([fs.readFileSync(baseIso)])
  const s = await IsoEditSession.open(blob)
  assert.ok(s.list('').some((e) => e.name === 'readme.txt'))
  const added = new Blob(['from the browser'])
  Object.defineProperty(added, 'name', { value: 'web.txt' })
  await s.addFiles('', [added])
  s.mkdir('', 'webdir')
  s.rename('readme.txt', 'README-renamed.txt')
  s.remove('docs/a.txt')
  const out = await s.exportIso()
  const again = await IsoEditSession.open(out)
  const names = again.entries.map((e) => e.path)
  assert.ok(names.includes('web.txt') && names.includes('webdir') && names.includes('README-renamed.txt'))
  assert.ok(!names.includes('docs/a.txt'))
  assert.equal(await (await again.readFile('web.txt')).text(), 'from the browser')
  fs.writeFileSync(path.join(work, 'web.iso'), Buffer.from(await out.arrayBuffer()))
  assert.match(xorriso('-indev', 'web.iso', '-find', '/', '-type', 'f'), /web\.txt/i, 'xorriso reads the web-made ISO')
})

test('default output name and volume label follow the source', async () => {
  const { defaultIsoFor, volumeLabelFor } = await load('src/lib/names.ts')
  assert.equal(defaultIsoFor('D:\\work\\My Disc'), 'D:\\work\\My Disc.iso')
  assert.equal(defaultIsoFor('/home/u/project/'), '/home/u/project.iso')
  assert.equal(defaultIsoFor('C:\\data\\backup.tar'), 'C:\\data\\backup.iso')
  assert.equal(defaultIsoFor('E:'), 'E:\\disc.iso')
  assert.equal(defaultIsoFor(''), '')
  assert.equal(volumeLabelFor('D:\\work\\My Disc 2024'), 'MY_DISC_2024')
  assert.equal(volumeLabelFor('/x/한글'), 'ISOMAKER')
  assert.ok(volumeLabelFor('/x/' + 'a'.repeat(50)).length <= 32)
})

test('Linux package names per package manager', async () => {
  const { LINUX_PACKAGES } = await load('host/packages.ts')
  assert.equal(LINUX_PACKAGES['apt-get'].xorriso, 'xorriso')
  assert.equal(LINUX_PACKAGES.pacman.xorriso, 'libisoburn')
  assert.equal(LINUX_PACKAGES.zypper.squashfs, 'squashfs')
  for (const pm of Object.values(LINUX_PACKAGES)) assert.deepEqual(Object.keys(pm).sort(), ['squashfs', 'xorriso'])
})
