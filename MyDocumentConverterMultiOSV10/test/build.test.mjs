// The packaging: installer configuration, icons, the desktop shell's IPC
// surface and the bridge the renderer sees. These read files rather than run
// Electron; the GUI smoke test covers the running program.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))
const check = (category, name, fn) => test(`${category} › ${name}`, fn)
const pkg = JSON.parse(read('package.json'))

/* ----------------------------------------------------------- installer */

check('installer', 'the product name carries the version and the author is SHKWON', () => {
  assert.match(pkg.productName, /My Document Converter V\d+\.\d+/)
  assert.match(pkg.author, /SHKWON/)
  assert.match(pkg.author, /knix008@naver\.com/)
})

check('installer', 'Windows, macOS and Linux targets are configured with the same icon', () => {
  assert.equal(pkg.build.win.icon, 'build/icon.ico')
  assert.equal(pkg.build.nsis.installerIcon, 'build/icon.ico')
  assert.equal(pkg.build.nsis.uninstallerIcon, 'build/icon.ico')
  assert.equal(pkg.build.mac.icon, 'build/icon.png')
  assert.equal(pkg.build.linux.icon, 'build/icons')
  assert.ok(pkg.build.linux.target.includes('AppImage') && pkg.build.linux.target.includes('deb'))
  assert.ok(pkg.build.mac.target.includes('dmg'))
})

check('installer', 'the .mdcv project type is registered with its own icon on every platform', () => {
  const assoc = pkg.build.fileAssociations.find((item) => item.ext === 'mdcv')
  assert.ok(assoc, 'no mdcv association')
  assert.equal(assoc.icon, 'build/file-icon.ico')
  assert.ok(pkg.build.mac.fileAssociations.some((item) => item.ext === 'mdcv'))
  assert.ok(pkg.build.linux.desktop.entry.MimeType.includes('application/x-mydocumentconverter'))
  const nsh = read('build/installer.nsh')
  assert.ok(nsh.includes('Software\\Classes\\.mdcv'))
  assert.ok(nsh.includes('file-icon.ico'))
  const linux = read('build/linux/after-install.sh')
  assert.ok(linux.includes('*.mdcv') && linux.includes('update-mime-database'))
})

check('installer', 'the NSIS script removes an earlier installation completely and asks about its data', () => {
  const nsh = read('build/installer.nsh')
  assert.equal(pkg.build.nsis.include, 'build/installer.nsh')
  assert.ok(nsh.includes('ExecWait') && nsh.includes('/S _?='), 'previous uninstaller is not run')
  assert.ok(nsh.includes('RMDir /r "$PrevInstallDir"'), 'leftovers are not swept')
  assert.ok(nsh.includes('MessageBox MB_YESNO'), 'no data question')
  assert.ok(nsh.includes('$APPDATA\\${PRODUCT_NAME}'), 'user data folder not checked')
  assert.ok(nsh.includes('데이터') && nsh.includes('Delete it as well'), 'question is not bilingual')
  assert.ok(nsh.includes('customUnInstall'))
})

check('installer', 'the icons are generated for every platform and the file icon differs from the app icon', () => {
  for (const file of ['build/icon.ico', 'build/icon.png', 'build/file-icon.ico', 'build/file-icon.png', 'build/icons/16x16/icon.png', 'build/icons/256x256/icon.png', 'build/icons/512x512/icon.png', 'public/app-icon.svg', 'public/file-icon.svg']) {
    assert.ok(exists(file), `missing ${file}`)
  }
  const app = fs.readFileSync(path.join(root, 'build/icon.ico'))
  const doc = fs.readFileSync(path.join(root, 'build/file-icon.ico'))
  assert.notEqual(app.toString('base64'), doc.toString('base64'))
  // .ico header: reserved 0, type 1, count of images.
  assert.equal(app.readUInt16LE(0), 0)
  assert.equal(app.readUInt16LE(2), 1)
  assert.ok(app.readUInt16LE(4) >= 6)
})

check('installer', 'the app icon has transparent corners and a highlight at the top left', () => {
  const svg = read('public/app-icon.svg')
  assert.ok(svg.includes('rx="96"'), 'tile is not rounded (corners would not be transparent)')
  assert.ok(/radialGradient id="shine" cx="0\.2\d?" cy="0\.1\d"/.test(svg), 'no top-left shine')
  assert.ok(svg.includes('feGaussianBlur'), 'no depth')
  const png = fs.readFileSync(path.join(root, 'build/icons/256x256/icon.png'))
  assert.equal(png.readUInt8(25), 6, 'PNG is not RGBA (no alpha channel)')
})

/* ------------------------------------------------------------ electron */

check('electron', 'every channel the bridge invokes has a handler in the main process', () => {
  const preload = read('electron/preload.cjs')
  const main = read('electron/main.cjs') + read('electron/childwindows.cjs')
  const channels = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((match) => match[1])
  assert.ok(channels.length >= 30, `only ${channels.length} channels`)
  for (const channel of channels) assert.ok(main.includes(`ipcMain.handle('${channel}'`), `no handler for ${channel}`)
})

check('electron', 'every event the bridge listens to is sent by the main process', () => {
  const preload = read('electron/preload.cjs')
  const main = read('electron/main.cjs') + read('electron/childwindows.cjs')
  const events = [...preload.matchAll(/subscribe\('([^']+)'/g)].map((match) => match[1])
  assert.ok(events.length >= 9)
  for (const event of events) assert.ok(main.includes(`'${event}'`), `${event} is never sent`)
})

check('electron', 'the bridge exposes what the renderer types declare', () => {
  const preload = read('electron/preload.cjs')
  const types = read('src/types/electron-api.d.ts')
  const declared = [...types.matchAll(/^\s{2}(electron\w+Api)\?:/gm)].map((match) => match[1])
  assert.ok(declared.length >= 8)
  for (const api of declared) assert.ok(preload.includes(`exposeInMainWorld('${api}'`), `${api} not exposed`)
})

check('electron', 'the window is frameless with a sandboxed renderer and a title with the version', () => {
  const main = read('electron/main.cjs')
  assert.ok(main.includes('frame: false'))
  assert.ok(main.includes('sandbox: true') && main.includes('contextIsolation: true') && main.includes('nodeIntegration: false'))
  assert.ok(main.includes("productName = 'My Document Converter V1.0'"))
  assert.ok(main.includes('requestSingleInstanceLock'))
  assert.ok(main.includes("app.on('open-file'"), 'macOS open-file is not handled')
})

check('electron', 'popups are separate windows owned by the main window and torn down with it', () => {
  const child = read('electron/childwindows.cjs')
  assert.ok(child.includes('win.setParentWindow(parent)'))
  assert.ok(child.includes('function closeAllChildWindows'))
  assert.ok(child.includes('alwaysOnTop: true'), 'menu popup is not on top')
  const main = read('electron/main.cjs')
  assert.ok(main.includes("app.on('before-quit'") && main.includes('childWindows.closeAllChildWindows()'))
})

/* ------------------------------------------------------------ scripts */

check('scripts', 'package scripts cover build, dist per platform, icons and tests', () => {
  for (const name of ['start', 'dev', 'build', 'build:icons', 'build:info', 'dist:win', 'dist:mac', 'dist:linux', 'test', 'smoke']) assert.ok(pkg.scripts[name], `missing script ${name}`)
  assert.ok(pkg.scripts['dist:win'].includes('build:icons'), 'Windows dist does not regenerate icons')
  for (const file of ['scripts/create-icons.cjs', 'scripts/generate-build-info.cjs', 'scripts/electron-dev.mjs', 'scripts/start-electron.mjs', 'scripts/package-app.cjs', 'scripts/smoke.mjs', 'scripts/test-all.mjs']) assert.ok(exists(file), file)
})

check('scripts', 'build info records the creator, version and toolchain for the About window', () => {
  const info = JSON.parse(read('src/build-info.json'))
  assert.equal(info.version, pkg.version)
  assert.equal(info.author, 'SHKWON(knix008@naver.com)')
  assert.ok(info.buildTime && info.node && info.react && info.electron && info.vite)
})

check('scripts', 'the documentation files exist', () => {
  for (const file of ['README.md', 'ARCHITECTURE.md', 'UsersGuide.md', '.gitignore']) assert.ok(exists(file), file)
  assert.ok(read('.gitignore').includes('node_modules'))
})
