// The Rust tests (cargo test): the engine's pieces on their own — ISO 9660 / Joliet names,
// the SquashFS reader (real mksquashfs fixtures, gzip and zstd with fragments) and writer,
// the MSYS2 package database, dependency resolution and unpacking (with this PC's real
// msys.db and pacman cache when MSYS2 is installed), tar, dates, paths — and the program's
// own unit tests. Each Rust test shows up here as one test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { root } from './host-client.mjs'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const r = spawnSync('cargo', ['test', '--manifest-path', path.join(root, 'src-tauri', 'isohost', 'Cargo.toml'), '--', '--test-threads=4'], { cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const out = `${r.stdout}\n${r.stderr}`
const results = [...out.matchAll(/^test (\S+) \.\.\. (ok|FAILED|ignored)$/gm)].map((m) => ({ name: m[1], status: m[2] }))

test('cargo test ran', () => {
  assert.ok(results.length > 0, out.slice(-4000))
})
for (const { name, status } of results) {
  test(`rust: ${name.replace(/::tests::/, ' › ').replace(/_/g, ' ')}`, () => {
    if (status === 'FAILED') {
      const at = out.indexOf(`---- ${name} stdout ----`)
      assert.fail(at >= 0 ? out.slice(at, at + 3000) : `${name} failed`)
    }
    assert.notEqual(status, 'ignored', `${name} is ignored`)
  })
}
test('cargo test passed', () => {
  assert.equal(r.status, 0, out.slice(-4000))
})
