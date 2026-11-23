// The scripts behind npm start, npm run dev and the installers. They are plain Node, so
// a mistake here breaks the app before a single line of the editor runs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort, isFree } from '../scripts/free-port.mjs'
import { BUILDS, currentVersion, findInstallers, ofVersion, olderCopies, rejectReason } from '../scripts/platform-build.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (name) => readFileSync(path.join(root, 'scripts', name), 'utf8')
const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const code = (name) => read(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('no launcher reaches for a .cmd shim or the npm wrapper', () => {
  // Since Node 20.12 spawning npm.cmd without a shell fails with spawn EINVAL.
  for (const name of ['start.mjs', 'dev.mjs', 'platform-build.mjs']) {
    assert.ok(!/['"][\w.-]*\.cmd['"]/.test(code(name)), `${name} names a .cmd shim`)
    assert.ok(!/['"]npm['"]/.test(code(name)), `${name} spawns npm; use process.execPath and the package's own entry`)
  }
})

test('both launchers run Vite through this Node binary on a port nobody else uses', () => {
  for (const name of ['start.mjs', 'dev.mjs']) {
    const source = read(name)
    assert.ok(source.includes('process.execPath'), `${name}: Vite is not launched with the current Node binary`)
    assert.ok(source.includes('--strictPort'), `${name}: the dev server could drift to another port`)
    assert.ok(source.includes('freePort('), `${name} could show another program's server`)
  }
})

test('the Vite and Tauri entry points the launchers use exist', () => {
  assert.ok(existsSync(path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')))
  assert.ok(existsSync(path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')))
})

test('npm start hands Tauri the port it actually chose', () => {
  const source = read('start.mjs')
  assert.match(source, /build: \{ devUrl \}/, 'tauri dev would look at the port in tauri.conf.json')
  assert.match(source, /'--config', JSON\.stringify\(config\)/, 'the port never reaches tauri dev')
  assert.match(source, /create-icons\.cjs/, 'tauri-build needs the icons to exist')
  assert.match(source, /generate-build-info\.cjs/, 'the page imports the build info')
})

test('a port another program is using is skipped, never reused', async () => {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    assert.equal(await isFree(port), false)
    assert.notEqual(await freePort(port), port)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('package.json scripts point at files that exist', () => {
  assert.equal(pkg.scripts.start, 'node scripts/start.mjs')
  assert.equal(pkg.scripts.dev, 'node scripts/dev.mjs')
  for (const script of Object.values(pkg.scripts)) {
    for (const match of String(script).matchAll(/scripts\/[\w.-]+/g)) {
      assert.ok(existsSync(path.join(root, match[0])), `${match[0]} is missing`)
    }
  }
})

test('npm test runs the suite through the harness entry point', () => {
  assert.ok(pkg.scripts.test.includes('--import ./test/helpers/setup.mjs'), 'the DOM/TS harness is not loaded')
  assert.ok(pkg.scripts.test.includes('node --test'))
})

test('clean scripts remove only their generated targets and tolerate missing files', () => {
  assert.equal(pkg.scripts.clean, 'node scripts/clean.mjs')
  assert.equal(pkg.scripts['clean:all'], 'node scripts/clean.mjs --all')
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'mpw-clean-'))
  const script = path.join(fixture, 'scripts', 'clean.mjs')
  const normal = ['dist', 'build', 'src/build-info.json', 'src-tauri/gen']
  const extra = ['src-tauri/target', 'node_modules', 'out/test-report.md', 'out/tutorial/MyPhotoWork-Tutorial.mp4']
  // The installers the build copied to the root: kept by clean, removed by clean:all.
  const installers = ['My Photo Work_1.0.1_x64-setup.exe', 'My Photo Work_1.0.1_x64_en-US.msi', 'my-photo-work_1.0.1_amd64.deb', 'My Photo Work_1.0.1_amd64.AppImage', 'My Photo Work_1.0.1_x64.dmg', 'MyPhotoWork-Tutorial.mp4', 'MyPhotoWork-Tutorial-en.mp4']
  // Sources and committed documents stay, generated or not: clean:all only removes what a script can make again.
  const retained = ['src/source.ts', 'README.md', 'tools/helper.exe', 'doc/index.html', 'doc/images/tutorial/ko/open.jpg', 'src/iconColors.css', 'samples/test01.jpg', 'demo.mp4']
  try {
    mkdirSync(path.dirname(script), { recursive: true })
    copyFileSync(path.join(root, 'scripts', 'clean.mjs'), script)
    for (const name of [...normal, ...extra, ...installers, ...retained]) {
      const target = path.join(fixture, name)
      if (path.extname(name)) {
        mkdirSync(path.dirname(target), { recursive: true })
        writeFileSync(target, 'fixture')
      } else {
        mkdirSync(target, { recursive: true })
        writeFileSync(path.join(target, 'fixture'), 'fixture')
      }
    }
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
    assert.notEqual(run('--invalid').status, 0)
    assert.ok(normal.every((name) => existsSync(path.join(fixture, name))))
    assert.equal(run().status, 0)
    assert.ok(normal.every((name) => !existsSync(path.join(fixture, name))))
    assert.ok([...extra, ...installers, ...retained].every((name) => existsSync(path.join(fixture, name))))
    assert.equal(run('--all').status, 0)
    assert.ok(extra.every((name) => !existsSync(path.join(fixture, name))))
    assert.ok(installers.every((name) => !existsSync(path.join(fixture, name))), 'clean:all leaves a built installer in the root')
    assert.ok(retained.every((name) => existsSync(path.join(fixture, name))))
    assert.equal(run('--all').status, 0)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('each installer is built on the system it runs on', () => {
  for (const name of ['build:win', 'build:mac', 'build:linux']) {
    assert.match(pkg.scripts[name], /build:icons/, `${name} could package a stale icon`)
    assert.match(pkg.scripts[name], /platform-build\.mjs/, `${name} does not go through platform-build.mjs`)
  }
  assert.equal(rejectReason('win', 'win32'), null)
  assert.match(rejectReason('mac', 'win32'), /Run this on macOS/)
  assert.match(rejectReason('nope', 'win32'), /Unknown target/)
  assert.equal(BUILDS.win.bundles, 'nsis')
  assert.deepEqual(findInstallers(path.join(root, 'no-such-folder')), [])
})

test('a build copies only the current version to the root and clears older copies', () => {
  assert.equal(currentVersion(), pkg.version)
  const files = ['/b/nsis/My Photo Work_1.0.0_x64-setup.exe', '/b/nsis/My Photo Work_1.0.1_x64-setup.exe', '/b/deb/my-photo-work_1.0.1_amd64.deb']
  assert.deepEqual(ofVersion(files, '1.0.1').map((file) => path.basename(file)), ['My Photo Work_1.0.1_x64-setup.exe', 'my-photo-work_1.0.1_amd64.deb'])
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mpw-build-'))
  try {
    for (const name of ['My Photo Work_1.0.0_x64-setup.exe', 'My Photo Work_1.0.1_x64-setup.exe', 'Other App_1.0.0_x64-setup.exe', 'notes.txt']) writeFileSync(path.join(dir, name), '')
    assert.deepEqual(olderCopies(dir, 'My Photo Work', '1.0.1').map((file) => path.basename(file)), ['My Photo Work_1.0.0_x64-setup.exe'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const script = read('platform-build.mjs')
  assert.ok(script.indexOf('fs.rmSync(file, { recursive: true, force: true })') < script.indexOf("cli, 'build'"), 'stale bundles are not cleared before the build')
})
