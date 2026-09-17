// The launcher scripts behind `npm start`. They are plain Node, so a mistake
// here breaks the app before a single line of the editor runs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (name) => readFileSync(path.join(root, 'scripts', name), 'utf8')
const require = createRequire(import.meta.url)

test('no launcher reaches for a .cmd shim or the npm wrapper', () => {
  // Since Node 20.12 spawning `npm.cmd` without a shell fails outright on
  // Windows with `spawn EINVAL` — which is exactly how `npm start` broke. The
  // shim name can arrive through a variable, so the whole file is checked, with
  // comments stripped so an explanation of the trap does not trip the test.
  for (const name of ['electron-dev.mjs', 'start-electron.mjs']) {
    const code = read(name)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    assert.ok(!/['"][\w.-]*\.cmd['"]/.test(code), `${name} names a .cmd shim`)
    assert.ok(!/['"]npm['"]/.test(code), `${name} spawns npm; use process.execPath and the package's own entry`)
  }
})

test('the dev launcher runs Vite through this Node binary', () => {
  const source = read('electron-dev.mjs')
  assert.ok(source.includes('process.execPath'), 'Vite is not launched with the current Node binary')
  assert.ok(/vite\/package\.json/.test(source), 'the Vite entry point is not resolved from the package')
  assert.ok(source.includes('--strictPort'), 'the dev server must fail loudly rather than drift to another port')
})

test('the Vite entry the dev launcher resolves actually exists', () => {
  // Mirrors the resolution in spawnVite(); `vite/bin/vite.js` is not exported,
  // so it has to be reached through the package directory.
  const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
  assert.ok(existsSync(viteBin), `expected Vite's entry at ${viteBin}`)
  assert.equal(JSON.parse(readFileSync(path.join(root, 'node_modules/vite/package.json'), 'utf8')).bin.vite, 'bin/vite.js')
})

test('both launchers clear ELECTRON_RUN_AS_NODE before spawning', () => {
  // With that variable set, Electron behaves like plain Node and no window opens.
  for (const name of ['electron-dev.mjs', 'start-electron.mjs']) {
    assert.ok(read(name).includes('delete env.ELECTRON_RUN_AS_NODE'), `${name} does not clear ELECTRON_RUN_AS_NODE`)
  }
})

test('the dev launcher and the Electron main process agree on the dev URL', () => {
  const launcher = read('electron-dev.mjs')
  const main = readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8')
  const port = launcher.match(/const port = (\d+)/)?.[1]
  const host = launcher.match(/const host = '([\d.]+)'/)?.[1]
  assert.ok(port && host, 'the launcher does not declare a host and port')
  assert.ok(
    main.includes(`http://${host}:${port}`),
    `electron/main.cjs does not load http://${host}:${port}`,
  )
})

test('package.json start scripts point at the launchers that exist', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts.start, 'npm run electron:dev')
  assert.equal(pkg.scripts['electron:dev'], 'node scripts/electron-dev.mjs')
  assert.ok(existsSync(path.join(root, 'scripts', 'electron-dev.mjs')))
  assert.ok(existsSync(path.join(root, pkg.main)), `package.json main (${pkg.main}) is missing`)
})

test('npm test runs the suite through the harness entry point', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.ok(pkg.scripts.test.includes('--import ./test/helpers/setup.mjs'), 'the DOM/TS harness is not loaded')
  assert.ok(pkg.scripts.test.includes('node --test'))
})
