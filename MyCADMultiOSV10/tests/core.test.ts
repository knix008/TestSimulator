import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { AUTHOR, MIN_WINDOW_WIDTH, RECENT_LIMIT, windowTitle } from '../src/core/buildInfo'
import { decodeClipboard, encodeClipboard } from '../src/core/clipboard'
import { mergeFonts } from '../src/core/fonts'
import { translate } from '../src/core/i18n'
import { MENUS, menuIsSingleColumn, TOOLBAR } from '../src/core/menus'
import { createSolid, distance } from '../src/core/model'
import { buildPrintPages, defaultPageSetup, pagePixelSize } from '../src/core/print'
import { directoryOf, lastDirectory, rememberRecent, removeRecent, suggestedPath } from '../src/core/recent'
import { parseDocument, serializeDocument } from '../src/core/serialize'
import { cameraFromOrbit, panOrbit, rotateOrbit } from '../src/core/viewnav'
import { clampOpacity, defaultSettings, sanitizeSettings } from '../src/core/settings'
import { activeDocument, canRedo, canUndo, createInitialState, reducer } from '../src/core/store'
import { parseStl, toAsciiStl } from '../src/core/stl'
import { nextTabStart, tabsOverflow } from '../src/core/tabs'
import { createDocument } from '../src/core/model'

describe('model', () => {
  it('[Document] creates a box solid', () => {
    const solid = createSolid('box', 'sol-1', 1)
    expect(solid.kind).toBe('box')
    expect(solid.size.x).toBeGreaterThan(0)
  })

  it('[Document] measures distance between positions', () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5)
  })

  it('[History] undo and redo restore solids', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'add-solid', kind: 'sphere' })
    expect(activeDocument(state).solids).toHaveLength(1)
    expect(canUndo(state)).toBe(true)
    state = reducer(state, { type: 'undo' })
    expect(activeDocument(state).solids).toHaveLength(0)
    expect(canRedo(state)).toBe(true)
    state = reducer(state, { type: 'redo' })
    expect(activeDocument(state).solids[0].kind).toBe('sphere')
  })

  it('[File] round-trips a document', () => {
    let state = reducer(createInitialState(), { type: 'add-solid', kind: 'cone' })
    const text = serializeDocument(activeDocument(state))
    const loaded = parseDocument(text, 'doc-x')
    expect(loaded.solids[0].kind).toBe('cone')
    expect(loaded.dirty).toBe(false)
  })

  it('[File] rejects a foreign file with a specific error', () => {
    expect(() => parseDocument('{ "format": "other" }', 'doc-x')).toThrow(/MyCAD/)
  })

  it('[Clipboard] copies and pastes solids', () => {
    let state = reducer(createInitialState(), { type: 'add-solid', kind: 'torus' })
    state = reducer(state, { type: 'copy' })
    const decoded = decodeClipboard(state.clipboardText)
    expect(decoded?.[0].kind).toBe('torus')
    state = reducer(state, { type: 'paste' })
    expect(activeDocument(state).solids).toHaveLength(2)
    expect(encodeClipboard(decoded || [])).toContain('mycad-solids')
  })

  it('[STL] exports and imports a mesh', () => {
    const solid = createSolid('box', 'sol-1', 1)
    const stl = toAsciiStl([solid])
    expect(stl.startsWith('solid mycad')).toBe(true)
    const mesh = parseStl(stl, 'mesh-1')
    expect(mesh.kind).toBe('mesh')
    expect(mesh.mesh?.positions.length).toBeGreaterThan(8)
  })

  it('[Recent] keeps ten files and can remove them', () => {
    let list = rememberRecent([], { path: '', name: 'skip' })
    expect(list).toHaveLength(0)
    for (let i = 0; i < 12; i++) list = rememberRecent(list, { path: `C:/work/file-${i}.mycad`, name: `file-${i}.mycad` })
    expect(list).toHaveLength(RECENT_LIMIT)
    expect(list[0].name).toBe('file-11.mycad')
    list = removeRecent(list, list[0].path)
    expect(list).toHaveLength(9)
    list = rememberRecent(list, { path: 'C:/work/file-1.mycad', name: 'file-1.mycad' })
    expect(list.filter((item) => item.path.endsWith('file-1.mycad'))).toHaveLength(1)
  })

  it('[Settings] restores sanitized values', () => {
    expect(clampOpacity(140)).toBe(100)
    expect(clampOpacity(-4)).toBe(0)
    const settings = sanitizeSettings({ language: 'en', theme: 'blueprint', backgroundOpacity: 80, fontSize: 18, fontStyle: 'bold' })
    expect(settings.language).toBe('en')
    expect(settings.theme).toBe('blueprint')
    expect(settings.backgroundOpacity).toBe(80)
    expect(sanitizeSettings(null)).toEqual(defaultSettings())
  })

  it('[I18n] translates Korean and English', () => {
    expect(translate('ko', 'file')).toBe('파일')
    expect(translate('en', 'file')).toBe('File')
    expect(translate('ko', 'about')).toContain('정보')
  })

  it('[Menu] keeps every item on one line with an icon and label', () => {
    for (const menu of MENUS) expect(menuIsSingleColumn(menu.items)).toBe(true)
    expect(TOOLBAR.length).toBeGreaterThan(10)
  })

  it('[Print] builds all, current, and custom pages', () => {
    const first = createDocument('doc-1', 'A')
    const second = createDocument('doc-2', 'B')
    first.solids = [createSolid('box', 'a', 1)]
    second.solids = [createSolid('sphere', 'b', 1), createSolid('plane', 'c', 2)]
    expect(buildPrintPages([first, second], 'doc-1', 'all', [], false)).toHaveLength(2)
    expect(buildPrintPages([first, second], 'doc-1', 'current', [], false)).toHaveLength(1)
    expect(buildPrintPages([first, second], 'doc-1', 'custom', ['doc-2'], false)[0].objectCount).toBe(2)
    expect(pagePixelSize({ ...defaultPageSetup(), paper: 'A4', orientation: 'landscape', marginMm: 10 }).width).toBeGreaterThan(1000)
  })

  it('[Tabs] shows chevrons only after the strip overflows', () => {
    expect(tabsOverflow(4, 4)).toBe(false)
    expect(tabsOverflow(5, 4)).toBe(true)
    expect(nextTabStart('next', 0, 6, 4)).toBe(1)
    expect(nextTabStart('prev', 0, 6, 4)).toBe(0)
  })

  it('[Fonts] merges system fonts without duplicates', () => {
    const fonts = mergeFonts(['Arial', 'arial', 'Malgun Gothic'])
    expect(fonts.filter((font) => font.toLowerCase() === 'arial')).toHaveLength(1)
    expect(fonts).toContain('Malgun Gothic')
  })

  it('[Build] title contains the name and version and credits the author', () => {
    expect(windowTitle()).toBe('MyCAD 1.0.0')
    expect(AUTHOR).toBe('shkwon(knix008@naver.com)')
    expect(MIN_WINDOW_WIDTH).toBeGreaterThanOrEqual(1000)
  })

  it('[Zoom] changes only when ctrl is held', () => {
    const state = createInitialState()
    expect(reducer(state, { type: 'wheel-zoom', deltaY: -100, ctrl: false }).zoom).toBe(100)
    expect(reducer(state, { type: 'wheel-zoom', deltaY: -100, ctrl: true }).zoom).toBeGreaterThan(100)
    const start = { azimuth: 0.5, polar: 1, tx: 0, ty: 0, tz: 0 }
    const turned = rotateOrbit(start, 40, 10)
    expect(turned.azimuth).not.toBe(start.azimuth)
    expect(turned.polar).not.toBe(start.polar)
    const shifted = panOrbit(start, 30, 0, 280)
    expect(shifted.tx).not.toBe(0)
    const eye = cameraFromOrbit(turned, 280)
    expect(Math.hypot(eye.x, eye.y, eye.z)).toBeGreaterThan(200)
  })
})

describe('packaging', () => {
  it('[Build] one command per target, for the web and every desktop OS', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
    const scripts = pkg.scripts as Record<string, string>
    for (const name of ['build:web', 'build:win', 'build:mac', 'build:linux', 'build:all']) {
      expect(scripts[name], name).toBeTruthy()
    }
    // The web build typechecks before it bundles.
    expect(scripts['build:web']).toContain('tsc --noEmit')
    expect(scripts['build:web']).toContain('vite build')
    // Each desktop target asks for that platform only, through the wrapper that
    // clears release/ first and retries a locked packaging step.
    expect(scripts['build:win']).toBe('npm run dist:win')
    for (const name of ['dist', 'dist:win', 'dist:mac', 'dist:linux', 'build:all']) {
      expect(scripts[name], name).toContain('scripts/package.mjs')
      expect(scripts[name], name).toContain('build:clean')
    }
    expect(scripts['dist:win']).toContain('--win nsis')
    expect(scripts['dist:mac']).toContain('--mac')
    expect(scripts['dist:linux']).toContain('--linux')
    expect(scripts['build:all']).toContain('-mwl')
    // The Windows installer needs the generated association include.
    expect(scripts['dist:win']).toContain('build:installer')
    // Packaging uses the Electron that npm installed, so nothing is extracted
    // into release/ and renamed while the scanner still holds it.
    expect(pkg.build.electronDist).toBe('node_modules/electron/dist')
  })

  it('[File] dialogs reuse the folder that was last worked in', () => {
    const dirs = { open: '', save: '', import: '', background: '' }
    // With nothing remembered yet a dialog just gets the file name.
    expect(lastDirectory(dirs, 'save')).toBe('')
    expect(suggestedPath('', 'part.mycad')).toBe('part.mycad')

    // Opening a file makes the next save start in that same folder.
    const opened = { ...dirs, open: 'D:/cad/projects' }
    expect(lastDirectory(opened, 'save')).toBe('D:/cad/projects')
    expect(lastDirectory(opened, 'import')).toBe('D:/cad/projects')
    expect(suggestedPath('D:/cad/projects', 'part.mycad')).toBe('D:/cad/projects/part.mycad')

    // Each kind still prefers its own folder once it has one.
    const both = { ...opened, save: 'D:/cad/out', import: 'D:/cad/meshes' }
    expect(lastDirectory(both, 'save')).toBe('D:/cad/out')
    expect(lastDirectory(both, 'open')).toBe('D:/cad/projects')
    expect(lastDirectory(both, 'import')).toBe('D:/cad/meshes')
    expect(lastDirectory(both, 'background')).toBe('D:/cad/projects')

    // Windows separators survive, and a trailing one is not doubled.
    expect(suggestedPath('C:\\Users\\me\\cad', 'part.mycad')).toBe('C:\\Users\\me\\cad\\part.mycad')
    expect(suggestedPath('C:\\Users\\me\\cad\\', 'part.mycad')).toBe('C:\\Users\\me\\cad\\part.mycad')
    expect(suggestedPath('D:/cad/', 'part.stl')).toBe('D:/cad/part.stl')
    expect(directoryOf('D:/cad/projects/part.mycad')).toBe('D:/cad/projects')

    // The reducer keeps what it is told, and settings carry it across runs.
    let state = createInitialState()
    state = reducer(state, { type: 'remember-dir', key: 'save', directory: 'D:/cad/out' })
    expect(state.settings.lastDirectories.save).toBe('D:/cad/out')
    expect(sanitizeSettings(state.settings).lastDirectories.save).toBe('D:/cad/out')
  })

  it('[Electron] only one instance runs, and the installer asks before removing', () => {
    const main = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8')
    expect(main).toContain('requestSingleInstanceLock')
    expect(main).toContain("app.on('second-instance'")
    // The second launch hands over its file and exits instead of opening a window.
    expect(main).toMatch(/if \(!gotLock\) \{[^}]*app\.quit\(\)/)
    expect(main).toContain('MIN_HEIGHT = 760')

    const nsis = fs.readFileSync(path.resolve('build/installer.nsh'), 'utf8')
    expect(nsis).toContain('MB_YESNO')
    expect(nsis).toContain('removeOld')
    expect(nsis).toContain('keepOld')
    // The uninstaller only runs on the branch the user chose.
    const removal = nsis.slice(nsis.indexOf('removeOld:'), nsis.indexOf('keepOld:'))
    expect(removal).toContain("ExecWait '$R0'")
    expect(nsis.slice(0, nsis.indexOf('MB_YESNO'))).not.toContain("ExecWait '$R0'")
  })

  it('[Installer] supports Korean and English and replaces an existing install', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
    const script = fs.readFileSync(path.resolve('build/installer.nsh'), 'utf8')
    expect(pkg.build.nsis.displayLanguageSelector).toBe(true)
    expect(pkg.build.nsis.installerLanguages).toEqual(['en_US', 'ko_KR'])
    expect(pkg.build.win.icon).toBe('assets/icon.ico')
    expect(pkg.build.nsis.installerIcon).toBe('assets/icon.ico')
    expect(pkg.build.fileAssociations[0].ext).toBe('mycad')
    expect(pkg.build.fileAssociations[0].icon).toBe('assets/file-icon.ico')
    expect(script).toContain('QuietUninstallString')
    expect(script).toContain('1042')
    expect(script).toContain('삭제하시겠습니까')
    expect(script).toContain('RMDir /r "$INSTDIR"')
    expect(pkg.build.linux.icon).toBe('assets/icons')
    // Everything the shell shows comes out of assets/, and the executable has
    // to carry the icon or every shortcut falls back to Electron's own.
    // buildResources stays on build/, where the NSIS include lives.
    expect(pkg.build.directories.buildResources).toBe('build')
    expect(pkg.build.win.signAndEditExecutable).toBeUndefined()
    for (const entry of pkg.build.extraResources as Array<{ from: string }>) {
      expect(entry.from.startsWith('assets/') || entry.from === 'sample').toBe(true)
    }
    for (const file of ['assets/icon.ico', 'assets/icon.png', 'assets/file-icon.ico', 'assets/icons/256x256.png']) {
      expect(fs.existsSync(path.resolve(file)), file).toBe(true)
    }
    expect(pkg.build.mac.icon).toBe('assets/icon.png')
  })

  it('[Electron] uses one icon, child popups, and a minimum width that fits the toolbar', () => {
    const main = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8')
    expect(main).toContain('minWidth: MIN_WIDTH')
    expect(main).toContain('resizable: false')
    expect(main).toContain('parent')
    expect(main).toContain('MyCAD 1.0.0')
    expect(main).toContain('setIcon')
    expect(main).toContain('request-close')
  })
})
