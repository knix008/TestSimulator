import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/ui/App'
import { MENUS, TOOLBAR_CONTROLS, TOOLBAR_GROUPS, TOOLBAR_RIGHT } from '../src/core/menus'
import { toolbarMinWidth } from '../src/core/buildInfo'
import { THEMES, themeById, themeVars, themesByMode } from '../src/core/themes'
import { defaultSettings, sanitizeSettings } from '../src/core/settings'
import { axisLength, gridSpec, roundStep, sceneRadius, tickLabel, viewDistance, viewSpan } from '../src/core/viewnav'
import { canShiftTabs, nextTabStart, tabStartFor, visibleTabCount } from '../src/core/tabs'
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

  it('[Theme] pastel palettes stay readable', () => {
    // Relative luminance and contrast ratio, as WCAG defines them.
    const channel = (value: number) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
    }
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    for (const theme of THEMES) {
      const { bg, panel, panelAlt, text, muted, accent, line } = theme.colors
      // Body text on every surface the shell paints.
      for (const surface of [bg, panel, panelAlt]) {
        expect(ratio(text, surface), `${theme.id} text`).toBeGreaterThanOrEqual(4.5)
      }
      // Secondary text and the accent only have to stay clearly visible.
      expect(ratio(muted, panelAlt), `${theme.id} muted`).toBeGreaterThanOrEqual(3)
      expect(ratio(accent, panel), `${theme.id} accent`).toBeGreaterThanOrEqual(3)
      // Borders have to separate the surfaces they sit between.
      expect(ratio(line, panel), `${theme.id} line`).toBeGreaterThanOrEqual(1.2)
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

  it('[View] round steps climb 1, 2, 5, 10 whatever the value asked for', () => {
    expect([0.4, 1, 1.2, 2, 3, 5, 7, 10, 23, 60, 140].map(roundStep))
      .toEqual([0.5, 1, 2, 2, 5, 5, 10, 10, 50, 100, 200])
  })

  it('[View] the grid step follows the zoom, so the lines keep their spacing', () => {
    for (const radius of [0, 40, 900, 20000]) {
      for (const zoom of [10, 25, 50, 100, 200, 400, 800]) {
        const grid = gridSpec(radius, zoom)
        const where = `${radius} @ ${zoom}%`
        // Roughly the same number of lines across the view at every zoom, and
        // the sheet always reaches past the edges of what the camera sees.
        const across = viewSpan(radius, zoom) / grid.step
        expect(across, where).toBeGreaterThan(4)
        expect(across, where).toBeLessThan(30)
        expect(grid.size, where).toBeGreaterThanOrEqual(viewSpan(radius, zoom))
        const mantissa = grid.step / Math.pow(10, Math.floor(Math.log10(grid.step)))
        expect([1, 2, 5, 10], where).toContain(Math.round(mantissa))
      }
    }
    // Zooming in never coarsens the grid, and zooming out never refines it.
    const steps = [10, 25, 50, 100, 200, 400, 800].map((zoom) => gridSpec(120, zoom).step)
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1])
    expect(steps[0]).toBeGreaterThan(steps[steps.length - 1])
  })

  it('[View] the grid reaches the model however far the camera zooms in', () => {
    for (const radius of [20, 120, 900, 5000, 40000]) {
      for (const zoom of [10, 50, 100, 200, 400, 800]) {
        const grid = gridSpec(radius, zoom)
        const where = `${radius} @ ${zoom}%`
        // The solids live within ±radius of the origin, so the sheet has to be
        // at least that wide: zooming in must not leave a part on bare floor.
        expect(grid.size / 2, where).toBeGreaterThanOrEqual(radius)
        // And it still covers what the camera sees.
        expect(grid.size, where).toBeGreaterThanOrEqual(viewSpan(radius, zoom))
        expect(grid.divisions, where).toBeLessThanOrEqual(400)
      }
    }
  })

  it('[View] panning slides the grid only as far as the model can spare', () => {
    // A small model in a wide view: the grid may follow the camera a long way.
    expect(gridSpec(20, 100).panLimit).toBeGreaterThan(50)
    // Panning by the limit still leaves the whole model on the grid.
    for (const radius of [0, 20, 900, 40000]) {
      for (const zoom of [25, 100, 400]) {
        const grid = gridSpec(radius, zoom)
        const where = `${radius} @ ${zoom}%`
        expect(grid.panLimit, where).toBeGreaterThanOrEqual(0)
        expect(grid.panLimit + radius, where).toBeLessThanOrEqual(grid.size / 2 + 1e-9)
      }
    }
  })
})

describe('scale ruler', () => {
  it('[View] tick labels stay short however far the camera zooms in', () => {
    // Whole millimetres while the spacing is a millimetre or more.
    expect(tickLabel(100, 50)).toBe('100')
    expect(tickLabel(-20, 10)).toBe('-20')
    expect(tickLabel(0.5, 1)).toBe('1')
    // Finer spacings show just enough decimals, and no floating-point tails.
    expect(tickLabel(0.1 + 0.2, 0.1)).toBe('0.3')
    expect(tickLabel(0.30000000000000004, 0.1)).toBe('0.3')
    expect(tickLabel(0.05, 0.05)).toBe('0.05')
    expect(tickLabel(-0, 0.1)).toBe('0.0')
    expect(tickLabel(-0.0001, 0.1)).toBe('0.0')
    // Even at an absurd zoom the label is a handful of characters.
    for (const zoom of [100, 1000, 10000, 100000]) {
      const step = roundStep(viewSpan(0, zoom) / 12)
      const label = tickLabel(step * 3, step)
      expect(label.length, `${zoom}%`).toBeLessThanOrEqual(8)
      expect(label, `${zoom}%`).not.toMatch(/\d{4,}$/)
    }
  })
})

describe('tab strip', () => {
  it('[Tabs] the row shows as many tabs as the window has room for', () => {
    // Wide enough for everything: no arrows, every document on screen.
    expect(visibleTabCount(1200, 5)).toBe(5)
    expect(visibleTabCount(1200, 6)).toBe(6)
    // 900 px holds five 180 px tabs exactly; the sixth pushes the arrows out
    // and the row keeps whole tabs only.
    expect(visibleTabCount(900, 5)).toBe(5)
    expect(visibleTabCount(900, 9)).toBe(4)
    expect(visibleTabCount(420, 9)).toBe(2)
    // Never fewer than one, however cramped, and unmeasured means show all.
    expect(visibleTabCount(60, 9)).toBe(1)
    expect(visibleTabCount(0, 9)).toBe(9)
  })

  it('[Tabs] the strip scrolls to whichever document is active', () => {
    // Four visible out of nine: activating one further along moves the window.
    expect(tabStartFor(0, 0, 9, 4)).toBe(0)
    expect(tabStartFor(3, 0, 9, 4)).toBe(0)
    expect(tabStartFor(4, 0, 9, 4)).toBe(1)
    expect(tabStartFor(8, 0, 9, 4)).toBe(5)
    // Going back scrolls the other way, and never past the ends.
    expect(tabStartFor(1, 5, 9, 4)).toBe(1)
    expect(tabStartFor(8, 5, 9, 4)).toBe(5)
    expect(tabStartFor(0, 9, 9, 4)).toBe(0)
  })

  it('[Tabs] the arrows step one tab at a time and stop at the ends', () => {
    expect(canShiftTabs('prev', 0, 9, 4)).toBe(false)
    expect(canShiftTabs('next', 0, 9, 4)).toBe(true)
    expect(nextTabStart('next', 0, 9, 4)).toBe(1)
    expect(nextTabStart('prev', 0, 9, 4)).toBe(0)
    expect(nextTabStart('next', 5, 9, 4)).toBe(5)
    // Everything fits: the arrows do nothing because they are not there.
    expect(canShiftTabs('next', 0, 3, 4)).toBe(false)
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
    const user = userEvent.setup({ delay: null })
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
    const user = userEvent.setup({ delay: null })
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
    const user = userEvent.setup({ delay: null })
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
    const user = userEvent.setup({ delay: null })
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
    const user = userEvent.setup({ delay: null })
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
    const user = userEvent.setup({ delay: null })
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
    const expected = toolbarMinWidth(TOOLBAR_GROUPS, TOOLBAR_CONTROLS.length + TOOLBAR_RIGHT.length)
    const buttons = TOOLBAR_GROUPS.flat().length + TOOLBAR_RIGHT.length
    expect(expected).toBeGreaterThan(buttons * 30)
    await waitFor(() =>
      expect(Number(screen.getByTestId('app').getAttribute('data-min-window-width'))).toBeGreaterThanOrEqual(expected)
    )
  })
})
