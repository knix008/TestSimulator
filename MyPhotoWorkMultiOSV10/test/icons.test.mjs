// Every icon Windows, macOS and Linux shows must come from one source, so the
// installer, the executable, the taskbar and both shortcuts cannot drift apart.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const at = (relative) => fileURLToPath(new URL(relative, root))
const pkg = JSON.parse(readFileSync(at('package.json'), 'utf8'))
const conf = JSON.parse(readFileSync(at('src-tauri/tauri.conf.json'), 'utf8'))
const inTauri = (relative) => fileURLToPath(new URL(relative.replace(/^\.\.\//, ''), root))
const script = readFileSync(at('scripts/create-icons.cjs'), 'utf8')

test('every icon path the build config names actually exists', () => {
  const nsis = conf.bundle.windows.nsis
  const paths = [...conf.bundle.icon, nsis.installerIcon, nsis.uninstallerIcon]
  for (const relative of paths) {
    assert.ok(existsSync(inTauri(relative)), `${relative} does not exist — run npm run build:icons`)
    assert.ok(statSync(inTauri(relative)).size > 1000, `${relative} is suspiciously small`)
  }
  for (const needed of ['.ico', '.icns', '.png']) {
    assert.ok(conf.bundle.icon.some((name) => name.endsWith(needed)), `no ${needed} icon for the bundler`)
  }
})

test('the executable, the installer and the uninstaller share one .ico', () => {
  // The Start menu entry and the desktop shortcut both point at the exe, so
  // pinning these three is what makes all four match.
  const ico = conf.bundle.icon.find((name) => name.endsWith('.ico'))
  assert.equal(conf.bundle.windows.nsis.installerIcon, ico)
  assert.equal(conf.bundle.windows.nsis.uninstallerIcon, ico)
})


test('the identifier is kept and the macOS icon is well formed', () => {
  assert.equal(conf.identifier, 'com.shkwon.myphotoworkmultios')
  // An .icns is a list of PNGs under its own small header.
  const icns = readFileSync(at('build/icon.icns'))
  assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns')
  assert.equal(icns.readUInt32BE(4), icns.length, 'the .icns header has the wrong size')
})

test('the .ico carries the sizes Windows picks between', () => {
  const buffer = readFileSync(at('build/icon.ico'))
  assert.equal(buffer.readUInt16LE(0), 0, 'not an ICO file')
  assert.equal(buffer.readUInt16LE(2), 1, 'not an icon (type 1)')
  const count = buffer.readUInt16LE(4)
  const sizes = []
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16
    // 0 in the directory means 256.
    sizes.push(buffer[entry] === 0 ? 256 : buffer[entry])
  }
  for (const size of [16, 32, 48, 256]) {
    assert.ok(sizes.includes(size), `the .ico has no ${size}px image (has ${sizes.join(', ')})`)
  }
})

test('every icon is rendered from the one SVG', () => {
  assert.match(script, /app-icon\.svg/, 'the generator does not read the app SVG')
  assert.match(script, /const icoSizes = \[16, 24, 32, 48, 64, 128, 256\]/, 'the .ico size list changed')
  assert.match(script, /fs\.writeFileSync\(path\.join\(buildDir, 'icon\.ico'\), ico\)/, 'the .ico is not written')
  assert.match(script, /fs\.writeFileSync\(path\.join\(buildDir, 'icon\.png'\), png512\)/, 'the png is not written')
  // The in-app title bar and the browser tab use the same artwork.
})

test('the Linux icon set covers the standard sizes', () => {
  for (const size of [16, 32, 48, 128, 256, 512]) {
    const file = at(`build/icons/${size}x${size}/icon.png`)
    assert.ok(existsSync(file), `build/icons/${size}x${size}/icon.png is missing`)
  }
})


test('the installer builds the icons before packaging', () => {
  for (const target of ['build:win', 'build:mac', 'build:linux']) {
    assert.match(pkg.scripts[target], /build:icons/, `${target} could package a stale icon`)
  }
})
