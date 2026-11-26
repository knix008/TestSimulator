// Package installer pieces, checked offline against a local MSYS2 (C:\msys64) when present:
// the repository database parses, xorriso's dependencies resolve, a cached package unpacks.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { build } from 'esbuild'

const out = path.join(os.tmpdir(), `isomaker-pkgtest-${process.pid}.mjs`)
await build({ entryPoints: ['host/packages.ts'], outfile: out, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const pkg = await import(`file:///${out.split(path.sep).join('/')}`)
test.after(() => fs.rmSync(out, { force: true }))

const MSYS = process.env.MSYS2_ROOT || String.raw`C:\msys64`
const db = path.join(MSYS, 'var', 'lib', 'pacman', 'sync', 'msys.db')
const cache = path.join(MSYS, 'var', 'cache', 'pacman', 'pkg')

test('tar reader: ustar entries', () => {
  const header = Buffer.alloc(512)
  header.write('a/desc', 0)
  header.write('0000644\0', 100)
  header.write('00000000005\0', 124)
  header.write('0', 156)
  const body = Buffer.alloc(512)
  body.write('hello')
  const entries = pkg.readTar(Buffer.concat([header, body, Buffer.alloc(1024)]))
  assert.equal(entries.length, 1)
  assert.equal(entries[0].name, 'a/desc')
  assert.equal(entries[0].data.toString(), 'hello')
})

test('msys.db parses and xorriso resolves to its runtime libraries', { skip: !fs.existsSync(db) && 'no local MSYS2' }, () => {
  const repo = pkg.parseRepoDb(fs.readFileSync(db))
  assert.ok(repo.size > 500)
  const x = pkg.resolveDeps(repo, 'xorriso').map((p) => p.name).sort()
  for (const need of ['xorriso', 'msys2-runtime', 'libbz2', 'libreadline', 'ncurses', 'zlib', 'libiconv', 'gcc-libs']) {
    assert.ok(x.includes(need), `${need} in ${x.join(', ')}`)
  }
  assert.ok(!x.includes('bash'), 'no shell pulled in')
  const sq = pkg.resolveDeps(repo, 'squashfs-tools').map((p) => p.name)
  assert.ok(sq.includes('squashfs-tools'))
  for (const p of pkg.resolveDeps(repo, 'xorriso')) {
    assert.match(p.filename, /\.pkg\.tar\.(zst|xz)$/)
    assert.match(p.sha256, /^[0-9a-f]{64}$/)
  }
})

test('a cached xorriso package unpacks to usr/bin/xorriso.exe', { skip: !fs.existsSync(cache) && 'no pacman cache' }, (t) => {
  const file = fs.existsSync(cache) && fs.readdirSync(cache).find((f) => /^xorriso-.*\.pkg\.tar\.zst$/.test(f))
  if (!file) return t.skip('xorriso not cached')
  const entries = pkg.readTar(pkg.decompress(fs.readFileSync(path.join(cache, file))))
  const exe = entries.find((e) => e.name === 'usr/bin/xorriso.exe')
  assert.ok(exe, 'usr/bin/xorriso.exe present')
  assert.equal(exe.data.subarray(0, 2).toString('latin1'), 'MZ')
})
