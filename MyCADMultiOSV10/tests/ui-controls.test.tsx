import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { EXPORT_FORMATS, EXPORT_GROUPS, exportFileName, runExport } from '../src/core/exporters'
import { createCustomTheme, resolveTheme, sanitizeTheme, THEME_TOKENS } from '../src/core/themes'
import { SETTINGS_KEY, defaultLight, defaultSettings, newLight, sanitizeLight, sanitizeSettings, syncLights } from '../src/core/settings'
import { activeDocument, createInitialState, reducer } from '../src/core/store'
import { createDocument, createSolid } from '../src/core/model'
import { menuIcon } from '../src/core/i18n'
import { commandHelp } from '../src/core/labels'
import { MENUS, TOOLBAR } from '../src/core/menus'

function documentWithSolids() {
  const doc = createDocument('doc-1', 'Bracket')
  const box = createSolid('box', 'sol-1', 1)
  box.position = { x: 0, y: 20, z: 0 }
  const cylinder = createSolid('cylinder', 'sol-2', 2)
  cylinder.position = { x: 40, y: 24, z: 0 }
  doc.solids = [box, cylinder]
  doc.selection = [box.id]
  return doc
}

describe('export formats', () => {
  it('[Export] every format produces content and a sensible file name', () => {
    const doc = documentWithSolids()
    expect(EXPORT_FORMATS.length).toBeGreaterThanOrEqual(10)
    for (const format of EXPORT_FORMATS) {
      const result = runExport(format.id, { doc, selectedOnly: false })
      expect(result.text.length, format.id).toBeGreaterThan(10)
      expect(result.name, format.id).toBe(exportFileName(doc, format))
      expect(result.name.endsWith(`.${format.ext}`), format.id).toBe(true)
      expect(format.label.ko.length, format.id).toBeGreaterThan(0)
      expect(format.label.en.length, format.id).toBeGreaterThan(0)
    }
  })

  it('[Export] the written content matches the format', () => {
    const doc = documentWithSolids()
    expect(runExport('mycad', { doc, selectedOnly: false }).text).toContain('"format": "mycad"')
    expect(runExport('stl', { doc, selectedOnly: false }).text.startsWith('solid')).toBe(true)
    expect(runExport('obj', { doc, selectedOnly: false }).text).toContain('\nf ')
    expect(runExport('drawingSvg', { doc, selectedOnly: false }).text).toContain('<svg')
    expect(runExport('drawingDxf', { doc, selectedOnly: false }).text).toContain('ENDSEC')
    expect(runExport('ifc', { doc, selectedOnly: false }).text).toContain('IFC4')
    expect(runExport('gcode', { doc, selectedOnly: false }).text).toContain('G21')
    expect(runExport('points', { doc, selectedOnly: false }).text.split('\n').length).toBeGreaterThan(5)
    const python = runExport('python', { doc, selectedOnly: false }).text
    expect(python).toContain('Part.makeBox')
    expect(python).toContain('doc.recompute()')
    const macro = runExport('macro', { doc, selectedOnly: false }).text
    expect(macro).toContain('box(')
    expect(macro).toContain('move(')
  })

  it('[Export] selection-only writes fewer objects', () => {
    const doc = documentWithSolids()
    const all = runExport('obj', { doc, selectedOnly: false }).text
    const selected = runExport('obj', { doc, selectedOnly: true }).text
    expect(selected.split('\no ').length).toBeLessThan(all.split('\no ').length)
    expect(() => runExport('nope', { doc, selectedOnly: false })).toThrow(/알 수 없는/)
  })
})

describe('custom theme', () => {
  it('[Theme] the custom theme is editable and resolvable', () => {
    const custom = createCustomTheme()
    expect(custom.id).toBe('custom')
    expect(THEME_TOKENS).toHaveLength(13)
    for (const token of THEME_TOKENS) expect(custom.colors[token.key]).toMatch(/^#[0-9a-f]{6}$/i)

    const edited = { ...custom, colors: { ...custom.colors, accent: '#ff0066' } }
    expect(resolveTheme('custom', edited).colors.accent).toBe('#ff0066')
    expect(resolveTheme('nord', edited).id).toBe('nord')

    // Bad values fall back instead of poisoning the palette.
    const dirty = sanitizeTheme({ mode: 'light', colors: { accent: 'red', bg: '#101010' } })
    expect(dirty.colors.accent).toBe(custom.colors.accent)
    expect(dirty.colors.bg).toBe('#101010')
    expect(dirty.mode).toBe('light')
    expect(sanitizeSettings({ theme: 'custom' }).theme).toBe('custom')
  })
})

describe('light rig', () => {
  it('[Light] defaults and clamping', () => {
    expect(defaultLight()).toMatchObject({ enabled: true })
    expect(sanitizeLight({ azimuth: 999, elevation: -90, intensity: 9, ambient: -1 })).toMatchObject({
      azimuth: 360, elevation: -20, intensity: 3, ambient: 0
    })
    expect(sanitizeLight('nope')).toEqual(defaultLight())
    expect(defaultSettings().light.enabled).toBe(true)
  })
})

describe('recent files', () => {
  it('[Recent] keeps ten entries, newest first, and can be pruned', () => {
    let state = createInitialState()
    for (let index = 0; index < 13; index++) {
      state = reducer(state, { type: 'remember-recent', path: `D:/cad/part-${index}.mycad` })
    }
    expect(state.settings.recentFiles).toHaveLength(10)
    expect(state.settings.recentFiles[0].name).toBe('part-12.mycad')
    // Re-opening an older file moves it to the top without duplicating it.
    state = reducer(state, { type: 'remember-recent', path: 'D:/cad/part-5.mycad' })
    expect(state.settings.recentFiles[0].name).toBe('part-5.mycad')
    expect(state.settings.recentFiles.filter((file) => file.name === 'part-5.mycad')).toHaveLength(1)
    state = reducer(state, { type: 'remove-recent', path: 'D:/cad/part-5.mycad' })
    expect(state.settings.recentFiles.some((file) => file.name === 'part-5.mycad')).toBe(false)
    state = reducer(state, { type: 'clear-recent' })
    expect(state.settings.recentFiles).toHaveLength(0)
  })
})

describe('toolbar and dialogs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[GUI] the zoom stepper shows the percentage and steps it', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const value = screen.getByTestId('tb-zoom-value')
    expect(value.textContent).toBe('100%')
    await user.click(screen.getByTestId('tb-zoom-in'))
    await waitFor(() => expect(screen.getByTestId('tb-zoom-value').textContent).toBe('110%'))
    await user.click(screen.getByTestId('tb-zoom-out'))
    await user.click(screen.getByTestId('tb-zoom-out'))
    await waitFor(() => expect(screen.getByTestId('tb-zoom-value').textContent).toBe('90%'))
    await user.click(screen.getByTestId('tb-zoom-value'))
    await waitFor(() => expect(screen.getByTestId('tb-zoom-value').textContent).toBe('100%'))
    expect(screen.getByTestId('status-zoom').textContent).toContain('100')
  })

  it('[GUI] the light control toggles and moves the key light', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const button = screen.getByTestId('tb-light')
    expect(button.className).toContain('on')
    await user.click(button)
    await waitFor(() => expect(screen.getByTestId('tb-light').className).not.toContain('on'))
    await user.click(screen.getByTestId('tb-light'))

    await user.click(screen.getByTestId('tb-light-menu'))
    const menu = screen.getByTestId('light-menu')
    const azimuth = within(menu).getByTestId('light-azimuth') as HTMLInputElement
    expect(Number(azimuth.value)).toBe(defaultLight().azimuth)
    await user.click(screen.getByTestId('light-preset-side'))
    await waitFor(() => expect(screen.getByTestId('tb-light').getAttribute('title')).toContain('200°'))
  })

  it('[GUI] the toolbar theme button shows a palette swatch', async () => {
    render(<App />)
    const button = await screen.findByTestId('tb-theme')
    expect(button.getAttribute('data-theme-id')).toBe('dark')
    const swatch = button.querySelector('.swatch')
    expect(swatch).toBeTruthy()
    expect(swatch!.querySelectorAll('i')).toHaveLength(4)
    await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-min-window-width')).toBeTruthy())
  })

  it('[GUI] the export dialog offers every format and exports', async () => {
    const user = userEvent.setup({ delay: null })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const createObjectURL = vi.fn(() => 'blob:mock')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    render(<App />)
    await user.click(screen.getByTestId('tb-box'))
    await user.click(screen.getByTestId('tb-export'))
    const formats = screen.getByTestId('export-formats')
    expect(within(formats).getAllByRole('radio')).toHaveLength(EXPORT_FORMATS.length)
    expect(screen.getByTestId('export-filename').textContent).toContain('.mycad')
    await user.click(screen.getByTestId('export-format-stl'))
    await waitFor(() => expect(screen.getByTestId('export-filename').textContent).toContain('.stl'))
    await user.click(screen.getByTestId('export-run'))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(screen.getByTestId('statusbar').textContent).toContain('.stl')
    click.mockRestore()
  })

  it('[GUI] export is reachable from the File menu', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    expect(MENUS.find((menu) => menu.id === 'file')?.items.some((item) => item.id === 'export')).toBe(true)
    expect(TOOLBAR).toContain('export')
    await user.click(screen.getByTestId('menu-file'))
    await user.click(screen.getByTestId('menuitem-export'))
    expect(screen.getByTestId('export-formats')).toBeTruthy()
  })

  it('[GUI] the export formats are listed under what they are for', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-export'))

    // Every group that has formats gets a heading, every format lands in one
    // group, and none is listed twice.
    const sections = EXPORT_GROUPS
      .map((group) => screen.queryByTestId(`export-group-${group.id}`))
      .filter((section): section is HTMLElement => section !== null)
    expect(sections.length).toBe(EXPORT_GROUPS.length)
    const listed = sections.flatMap((section) => [...section.querySelectorAll('input[type="radio"]')])
    expect(listed).toHaveLength(EXPORT_FORMATS.length)

    // The two `.dxf` entries and the two `.svg` ones are only told apart by
    // the heading they sit under, so that is what the grouping is for.
    const drawings = screen.getByTestId('export-group-drawing')
    expect(within(drawings).getByTestId('export-format-dxf')).toBeTruthy()
    expect(within(drawings).getByTestId('export-format-drawingDxf')).toBeTruthy()
    expect(within(screen.getByTestId('export-group-mesh')).getByTestId('export-format-stl')).toBeTruthy()
    expect(within(screen.getByTestId('export-group-document')).getByTestId('export-format-mycad')).toBeTruthy()
  })

  it('[GUI] settings groups its rows in boxes and steps numbers', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    const panel = screen.getByTestId('settings-panel')
    expect(panel.querySelectorAll('fieldset.field-group').length).toBeGreaterThan(1)
    for (const box of panel.querySelectorAll('fieldset.field-group')) {
      expect(box.querySelector('legend')?.textContent?.length).toBeGreaterThan(0)
    }
    const snap = screen.getByTestId('snap') as HTMLInputElement
    expect(snap.value).toBe('10')
    await user.click(screen.getByTestId('snap-inc'))
    await waitFor(() => expect((screen.getByTestId('snap') as HTMLInputElement).value).toBe('11'))
    await user.click(screen.getByTestId('snap-dec'))
    await user.click(screen.getByTestId('snap-dec'))
    await waitFor(() => expect((screen.getByTestId('snap') as HTMLInputElement).value).toBe('9'))
  })

  it('[GUI] the custom theme tab edits and applies the palette', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    await user.click(screen.getByTestId('settings-tab-theme'))
    // The custom theme is the last tile of the gallery: picking it both
    // applies it and opens its colours, so there is no separate apply.
    expect(screen.queryByTestId('custom-colors')).toBeNull()
    await user.click(screen.getByTestId('theme-custom'))
    expect(screen.getAllByTestId(/^custom-(bg|accent|text)$/)).toHaveLength(3)
    const app = screen.getByTestId('app')
    await waitFor(() => expect(app.getAttribute('data-theme')).toBe('custom'))
    expect(app.style.getPropertyValue('--bg')).toBe(createCustomTheme().colors.bg)
  })

  it('[GUI] the parameter dialog explains the command instead of citing a reference', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.selectOptions(screen.getByTestId('workbench'), 'partDesign')
    const grid = screen.getByTestId('tool-grid')
    await user.click(within(grid).getByTitle(new RegExp('^' + '사각형 스케치')))
    const help = screen.getByTestId('part-op')
    expect(help.textContent).toBe(commandHelp('ko', 'sketchRect'))
    expect(help.textContent).not.toContain('기준')
  })

  it('[GUI] the print button uses a printer glyph', async () => {
    render(<App />)
    expect(menuIcon('print')).toContain('🖨')
    expect((await screen.findByTestId('tb-print')).textContent).toContain('🖨')
    await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-min-window-width')).toBeTruthy())
  })

  it('[GUI] recent files can be pruned from the settings dialog', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const state = activeDocument(createInitialState())
    expect(state).toBeTruthy()
    await user.click(screen.getByTestId('tb-settings'))
    await user.click(screen.getByTestId('settings-tab-recent'))
    expect(screen.getByTestId('settings-panel').textContent).toContain('/10')
  })
})

describe('several lights', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[Light] a scene starts with one light and keeps it in step with the list', () => {
    const settings = defaultSettings()
    expect(settings.lights).toHaveLength(1)
    expect(settings.activeLight).toBe(0)
    expect(settings.lights[0]).toEqual(settings.light)

    // Editing the light writes through to the list it belongs to.
    const edited = syncLights({ ...settings, light: { ...settings.light, color: '#ffd9a0' } })
    expect(edited.lights[0].color).toBe('#ffd9a0')

    // Picking another light points `light` at it.
    const two = syncLights({ ...settings, lights: [settings.light, newLight([settings.light])], activeLight: 1 }, 'list')
    expect(two.lights).toHaveLength(2)
    expect(two.light).toEqual(two.lights[1])
    expect(two.light.color).not.toBe(two.lights[0].color)

    // The fill light belongs to the scene, so it is shared.
    const brighter = syncLights({ ...two, light: { ...two.light, ambient: 1.4 } })
    expect(brighter.lights.map((item) => item.ambient)).toEqual([1.4, 1.4])

    // A settings file written before lights were a list still opens.
    const legacy = sanitizeSettings({ light: { kind: 'spot', color: '#a8d8ff' } })
    expect(legacy.lights).toHaveLength(1)
    expect(legacy.lights[0].kind).toBe('spot')
    expect(legacy.light.color).toBe('#a8d8ff')
    // And one written after keeps every light in it.
    const many = sanitizeSettings({ lights: [defaultLight(), { ...defaultLight(), kind: 'point' }], activeLight: 1 })
    expect(many.lights.map((item) => item.kind)).toEqual(['directional', 'point'])
    expect(many.light.kind).toBe('point')
  })

  it('[GUI] the toolbar adds, picks and removes lights', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-light-menu'))
    expect(screen.getAllByTestId(/^light-pick-/)).toHaveLength(1)

    // Add two more, each arriving with its own colour and kind.
    await user.click(screen.getByTestId('light-add'))
    await user.click(screen.getByTestId('light-add'))
    const stored = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    await waitFor(() => expect(stored().lights).toHaveLength(3))
    expect(new Set(stored().lights.map((item: { color: string }) => item.color)).size).toBe(3)
    expect(stored().activeLight).toBe(2)

    // The controls edit whichever light is picked.
    await user.click(screen.getByTestId('light-pick-1'))
    await waitFor(() => expect(stored().activeLight).toBe(1))
    await user.click(screen.getByTestId('light-kind-spot'))
    await waitFor(() => expect(stored().lights[1].kind).toBe('spot'))
    expect(stored().lights[0].kind).toBe('directional')
    await user.click(screen.getByTestId('light-color-ffe0b0'))
    await waitFor(() => expect(stored().lights[1].color).toBe('#ffe0b0'))

    // And one can be taken away again.
    await user.click(screen.getByTestId('light-remove-1'))
    await waitFor(() => expect(stored().lights).toHaveLength(2))
    expect(stored().lights.some((item: { kind: string }) => item.kind === 'spot')).toBe(false)
  })
})
