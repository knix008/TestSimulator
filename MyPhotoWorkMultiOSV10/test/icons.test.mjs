// Every icon Windows, macOS and Linux shows must come from one source, so the
// installer, the executable, the taskbar and both shortcuts cannot drift apart.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const at = (relative) => fileURLToPath(new URL(relative, root))
const pkg = JSON.parse(readFileSync(at('package.json'), 'utf8'))
const script = readFileSync(at('scripts/create-icons.cjs'), 'utf8')

test('every icon path the build config names actually exists', () => {
  const paths = [
    pkg.build.win.icon,
    pkg.build.mac.icon,
    pkg.build.nsis.installerIcon,
    pkg.build.nsis.uninstallerIcon,
    pkg.build.nsis.installerHeaderIcon,
  ]
  for (const relative of paths) {
    assert.ok(relative, 'an icon path is missing from package.json')
    assert.ok(existsSync(at(relative)), `${relative} does not exist — run npm run build:icons`)
    assert.ok(statSync(at(relative)).size > 1000, `${relative} is suspiciously small`)
  }
  assert.ok(existsSync(at(pkg.build.linux.icon)), 'the Linux icon directory is missing')
})

test('the executable, the installer and the uninstaller share one .ico', () => {
  // The Start menu entry and the desktop shortcut both point at the exe, so
  // pinning these three is what makes all four match.
  const ico = pkg.build.win.icon
  assert.equal(pkg.build.nsis.installerIcon, ico)
  assert.equal(pkg.build.nsis.uninstallerIcon, ico)
  assert.equal(pkg.build.nsis.installerHeaderIcon, ico)
})

test('the window icon Electron uses at runtime is the same file', () => {
  const main = readFileSync(at('electron/main.cjs'), 'utf8')
  assert.match(main, /build', process\.platform === 'win32' \? 'icon\.ico' : 'icon\.png'/, 'the window uses some other icon')
  assert.match(main, /icon: runtimeIcon/, 'the main window sets no icon')
  const child = readFileSync(at('electron/childwindows.cjs'), 'utf8')
  assert.match(child, /'icon\.ico' : 'icon\.png'/, 'popup windows use some other icon')
})

test('the taskbar groups the app with its shortcut', () => {
  // Without a matching AppUserModelID, Windows shows a second, generic entry.
  const main = readFileSync(at('electron/main.cjs'), 'utf8')
  assert.match(main, /app\.setAppUserModelId\(appId\)/, 'no AppUserModelID is set')
  assert.equal(pkg.build.appId, 'com.shkwon.myphotoworkmultios')
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
  assert.match(script, /favicon\.svg/, 'the favicon is not kept in step')
})

test('the Linux icon set covers the standard sizes', () => {
  for (const size of [16, 32, 48, 128, 256, 512]) {
    const file = at(`build/icons/${size}x${size}/icon.png`)
    assert.ok(existsSync(file), `build/icons/${size}x${size}/icon.png is missing`)
  }
})

test('the generated icons are all packaged', () => {
  const files = pkg.build.files
  for (const entry of ['build/icon.ico', 'build/icon.png', 'build/icons/**/*']) {
    assert.ok(files.includes(entry), `${entry} is not in build.files, so it would be left out`)
  }
})

test('the installer builds the icons before packaging', () => {
  for (const target of ['dist', 'dist:win', 'dist:mac', 'dist:linux']) {
    assert.match(pkg.scripts[target], /build:icons/, `${target} could package a stale icon`)
  }
})
