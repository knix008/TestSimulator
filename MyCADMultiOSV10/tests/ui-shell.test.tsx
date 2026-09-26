import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/ui/App'
import { MENUS, TOOLBAR_GROUPS, TOOLBAR_RIGHT } from '../src/core/menus'
import { toolbarMinWidth } from '../src/core/buildInfo'
import { THEMES, themeById, themeVars, themesByMode } from '../src/core/themes'
import { defaultSettings, sanitizeSettings } from '../src/core/settings'
import { axisLength, gridSpec, sceneRadius, viewDistance } from '../src/core/viewnav'
import { boundingBoxOf } from '../src/core/primitives'
import { createSolid } from '../src/core/model'
import { defaultPageSetup, layoutPage, pageSizeMm, pageToSvg, sanitizePageSetup } from '../src/core/print'

describe('themes', () => {
  it('[Theme] ships twenty dark and twenty light palettes with complete tokens', () => {
    expect(themesByMode('dark')).toHaveLength(20)
    expect(themesByMode('light')).toHaveLength(20)
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(40)
    for (const theme of THEMES) {
      expect(theme.name.ko.length, theme.id).toBeGreaterThan(0)
      expect(theme.name.en.length, theme.id).toBeGreaterThan(0)
      for (const [token, value] of Object.entries(theme.colors)) {
        expect(value, `${theme.id}.${token}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
      const vars = themeVars(theme)
      expect(vars['--bg']).toBe(theme.colors.bg)
      expect(Object.keys(vars)).toHaveLength(13)
    }
  })

  it('[Theme] the legacy ids still resolve and unknown ids fall back', () => {
    for (const id of ['dark', 'light', 'blueprint', 'graphite', 'contrast']) {
      expect(themeById(id).id).toBe(id)
    }
    expect(themeById('nope').id).toBe('dark')
    expect(sanitizeSettings({ theme: 'nord' }).theme).toBe('nord')
    expect(sanitizeSettings({ theme: 'nope' }).theme).toBe(defaultSettings().theme)
  })
})

describe('scene scaling', () => {
  it('[View] axes, grid and camera distance grow with the model', () => {
    const small = boundingBoxOf([createSolid('box', 'a', 1)])
    const wall = createSolid('box', 'b', 1)
    wall.size = { ...wall.size, x: 4000, y: 2700, z: 200 }
    wall.position = { x: 0, y: 1350, z: 0 }
    const large = boundingBoxOf([wall])

    expect(sceneRadius(large)).toBeGreaterThan(sceneRadius(small))
    expect(axisLength(0)).toBe(80)
    expect(axisLength(40)).toBe(80)
    expect(axisLength(sceneRadius(small))).toBeLessThan(200)
    expect(axisLength(sceneRadius(large))).toBeGreaterThan(2000)
    expect(gridSpec(sceneRadius(large)).size).toBeGreaterThan(gridSpec(sceneRadius(small)).size)
    expect(viewDistance(sceneRadius(large), 100)).toBeGreaterThan(viewDistance(sceneRadius(small), 100))
    // Zooming in still shortens the distance.
    expect(viewDistance(sceneRadius(large), 200)).toBeLessThan(viewDistance(sceneRadius(large), 100))
  })

  it('[View] the grid keeps a round step and a sane division count', () => {
    for (const radius of [0, 20, 120, 900, 5000, 40000]) {
      const grid = gridSpec(radius)
      expect(grid.divisions, String(radius)).toBeGreaterThanOrEqual(10)
      expect(grid.divisions, String(radius)).toBeLessThanOrEqual(60)
      expect(grid.size, String(radius)).toBeGreaterThanOrEqual(radius * 2)
      const mantissa = grid.step / Math.pow(10, Math.floor(Math.log10(grid.step)))
      expect([1, 2, 5, 10], String(radius)).toContain(Math.round(mantissa))
    }
  })
})

describe('print model', () => {
  it('[Print] paper sizes follow the orientation and sanitise unknown input', () => {
    const setup = defaultPageSetup()
    expect(pageSizeMm(setup)).toEqual({ width: 210, height: 297 })
    expect(pageSizeMm({ ...setup, orientation: 'landscape' })).toEqual({ width: 297, height: 210 })
    expect(pageSizeMm({ ...setup, paper: 'A3' }).height).toBe(420)
    expect(sanitizePageSetup({ paper: 'B5', copies: 900 })).toMatchObject({ paper: 'A4', copies: 99 })
  })

  it('[Print] a page lays out with title, header, footer and page numbers', () => {
    const page = { id: 'doc', title: 'Bracket', objectCount: 1, summary: 'Box', solids: [createSolid('box', 'a', 1)] }
    const setup = { ...defaultPageSetup(), header: 'ACME', footer: 'rev A', title: '', showDate: true }
    const layout = layoutPage(page, setup, 0, 3, new Date(0))
    expect(layout.title).toBe('Bracket')
    expect(layout.header).toContain('ACME')
    expect(layout.header).toContain('1970-01-01')
    expect(layout.footer).toContain('rev A')
    expect(layout.pageLabel).toBe('1 / 3')
    expect(layout.scale).toBeGreaterThan(0)
    expect(layout.segments.length).toBeGreaterThan(4)

    const svg = pageToSvg(page, setup, 0, 3, new Date(0))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Bracket')
    expect(svg).toContain('1 / 3')
    expect(svg).toContain('<line')

    const plain = pageToSvg(page, { ...setup, showTitle: false, showPageNumbers: false, showBorder: false }, 0, 1, new Date(0))
    expect(plain).not.toContain('Bracket')
    expect(plain).not.toContain('1 / 1')
  })

  it('[Print] manual scale overrides fit-to-page', () => {
    const page = { id: 'doc', title: 'A', objectCount: 1, summary: '', solids: [createSolid('box', 'a', 1)] }
    const fitted = layoutPage(page, { ...defaultPageSetup(), fitToPage: true }, 0, 1)
    const manual = layoutPage(page, { ...defaultPageSetup(), fitToPage: false, scalePercent: 50 }, 0, 1)
    expect(manual.scale).toBe(0.5)
    expect(fitted.scale).not.toBe(0.5)
  })
})

describe('application shell', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[GUI] the language button shows the flag of the language it switches to', async () => {
    const user = userEvent.setup()
    render(<App />)
    // Korean UI -> Union Jack.
    expect(screen.getByTestId('flag-en')).toBeTruthy()
    expect(screen.getByTestId('menu-file').textContent).toContain('파일')
    await user.click(screen.getByTestId('tb-language'))
    await waitFor(() => expect(screen.getByTestId('menu-file').textContent).toContain('File'))
    expect(screen.getByTestId('flag-ko')).toBeTruthy()
    await user.click(screen.getByTestId('tb-language'))
    await waitFor(() => expect(screen.getByTestId('flag-en')).toBeTruthy())
  })

  it('[GUI] every menu item is rendered, with an icon, however long the menu is', async () => {
    const user = userEvent.setup()
    render(<App />)
    const longest = MENUS.reduce((best, menu) => (menu.items.length > best.items.length ? menu : best), MENUS[0])
    await user.click(screen.getByTestId(`menu-${longest.id}`))
    const popup = screen.getByTestId('menu-popup')
    expect(within(popup).getAllByRole('menuitem')).toHaveLength(longest.items.length)
    expect(Number(popup.getAttribute('data-columns'))).toBeGreaterThan(1)
    expect(popup.getAttribute('data-layout')).toBe('multi-column')
    // Nothing may hang off the right edge of the window.
    const width = Number.parseFloat(popup.style.width)
    const left = Number.parseFloat(popup.style.left)
    expect(left + width).toBeLessThanOrEqual(window.innerWidth)
  })

  it('[GUI] the theme gallery applies any of the forty palettes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    await user.click(screen.getByTestId('settings-tab-theme'))
    expect(screen.getAllByTestId(/^theme-(?!mode|grid)/)).toHaveLength(20)
    await user.click(screen.getByTestId('theme-nord'))
    const app = screen.getByTestId('app')
    expect(app.getAttribute('data-theme')).toBe('nord')
    expect(app.style.getPropertyValue('--bg')).toBe(themeById('nord').colors.bg)
    expect(app.getAttribute('data-theme-mode')).toBe('dark')

    await user.click(screen.getByTestId('theme-mode-light'))
    expect(screen.getAllByTestId(/^theme-(?!mode|grid)/)).toHaveLength(20)
    await user.click(screen.getByTestId('theme-sepia'))
    expect(screen.getByTestId('app').getAttribute('data-theme-mode')).toBe('light')
  })

  it('[GUI] the toolbar theme button cycles themes and its dropdown picks one', async () => {
    const user = userEvent.setup()
    render(<App />)
    const app = screen.getByTestId('app')
    expect(app.getAttribute('data-theme')).toBe('dark')

    // Clicking the button walks through the palettes.
    await user.click(screen.getByTestId('tb-theme'))
    await waitFor(() => expect(app.getAttribute('data-theme')).toBe(THEMES[1].id))
    await user.click(screen.getByTestId('tb-theme'))
    await waitFor(() => expect(app.getAttribute('data-theme')).toBe(THEMES[2].id))

    // The caret opens the full gallery, both modes at once.
    expect(screen.queryByTestId('theme-menu')).toBeNull()
    await user.click(screen.getByTestId('tb-theme-menu'))
    const menu = screen.getByTestId('theme-menu')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(41)
    expect(screen.getByTestId('theme-menu-custom')).toBeTruthy()
    await user.click(screen.getByTestId('theme-menu-sepia'))
    await waitFor(() => expect(app.getAttribute('data-theme')).toBe('sepia'))
    expect(app.getAttribute('data-theme-mode')).toBe('light')
    expect(screen.queryByTestId('theme-menu')).toBeNull()

    // It sits directly left of the settings button.
    const toolbar = screen.getByTestId('toolbar')
    const themeButton = screen.getByTestId('tb-theme')
    const settingsButton = screen.getByTestId('tb-settings')
    expect(toolbar.contains(themeButton)).toBe(true)
    expect(themeButton.compareDocumentPosition(settingsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('[GUI] settings keeps viewport and print defaults', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    await user.click(screen.getByTestId('settings-tab-viewport'))
    await user.click(screen.getByTestId('show-axes'))
    expect((screen.getByTestId('show-axes') as HTMLInputElement).checked).toBe(false)
    await user.click(screen.getByTestId('auto-scale-axes'))
    expect((screen.getByTestId('auto-scale-axes') as HTMLInputElement).checked).toBe(false)

    await user.click(screen.getByTestId('settings-tab-printTab'))
    await user.selectOptions(screen.getByTestId('default-paper'), 'A3')
    await user.type(screen.getByTestId('default-header'), 'ACME')
    expect((screen.getByTestId('default-header') as HTMLInputElement).value).toBe('ACME')

    // The print dialog starts from those defaults.
    await user.click(screen.getByText('닫기'))
    await user.click(screen.getByTestId('tb-print'))
    await user.click(screen.getByTestId('print-tab-layout'))
    expect((screen.getByLabelText('용지') as HTMLSelectElement).value).toBe('A3')
  })

  it('[GUI] the print dialog previews the sheet and prints on demand', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<App />)
    await user.click(screen.getByTestId('tb-box'))
    await user.click(screen.getByTestId('tb-print'))
    const preview = screen.getByTestId('print-preview')
    expect(preview.querySelector('svg')).toBeTruthy()
    expect(screen.getByTestId('print-page-label').textContent).toBe('1 / 1')

    await user.click(screen.getByTestId('print-tab-texts'))
    await user.type(screen.getByTestId('print-title'), 'Cover')
    await waitFor(() => expect(screen.getByTestId('print-preview').innerHTML).toContain('Cover'))

    await user.click(screen.getByTestId('print-tab-layout'))
    await user.selectOptions(screen.getByTestId('print-view'), 'front')
    await user.click(screen.getByTestId('print-fit'))
    expect((screen.getByTestId('print-scale') as HTMLInputElement).disabled).toBe(false)

    await user.click(screen.getByTestId('print-now'))
    await waitFor(() => expect(screen.getByTestId('print-area').innerHTML).toContain('print-sheet'))
    expect(screen.getByTestId('print-area').innerHTML).toContain('Cover')
    await waitFor(() => expect(print).toHaveBeenCalled())
    print.mockRestore()
  })

  it('[GUI] the toolbar minimum width covers every button', async () => {
    render(<App />)
    const expected = toolbarMinWidth(TOOLBAR_GROUPS, TOOLBAR_RIGHT.length)
    const buttons = TOOLBAR_GROUPS.flat().length + TOOLBAR_RIGHT.length
    expect(expected).toBeGreaterThan(buttons * 30)
    await waitFor(() =>
      expect(Number(screen.getByTestId('app').getAttribute('data-min-window-width'))).toBeGreaterThanOrEqual(expected)
    )
  })
})
