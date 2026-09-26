import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { AUTHOR, MIN_WINDOW_HEIGHT, POPUP_SIZE } from '../src/core/buildInfo'
import { MIN_PANEL_WIDTH, PANEL_ROOM, clampLightAngles, lightAngles, lightPosition, propertyPanelWidth, raySphereDirection, toolPanelWidth } from '../src/core/viewnav'
import { LIGHT_KINDS, defaultSettings, sanitizeLight, sanitizeSettings } from '../src/core/settings'
import { THEMES } from '../src/core/themes'
import { TOOLBAR_GROUPS } from '../src/core/menus'

describe('light placement', () => {
  it('[Light] position and angles round-trip', () => {
    for (const azimuth of [-180, -90, 0, 45, 135, 179]) {
      for (const elevation of [-20, 0, 30, 60, 89]) {
        const position = lightPosition(azimuth, elevation, 300)
        expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(300, 6)
        const back = lightAngles(position)
        expect(back.azimuth).toBeCloseTo(azimuth, 4)
        expect(back.elevation).toBeCloseTo(elevation, 4)
      }
    }
    expect(lightPosition(0, 90, 100).y).toBeCloseTo(100, 6)
    expect(lightPosition(0, 0, 100).z).toBeCloseTo(100, 6)
    expect(lightPosition(90, 0, 100).x).toBeCloseTo(100, 6)
  })

  it('[Light] dragging maps a pointer ray onto the light sphere', () => {
    // A ray straight down the -Z axis meets the sphere on the +Z side.
    const hit = raySphereDirection({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, 200)
    expect(hit).toBeTruthy()
    expect(hit!.z).toBeCloseTo(1, 6)
    expect(lightAngles(hit!).azimuth).toBeCloseTo(0, 4)

    // A ray that misses still yields the nearest direction instead of null.
    const grazing = raySphereDirection({ x: 0, y: 900, z: 500 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, 200)
    expect(grazing).toBeTruthy()
    expect(grazing!.y).toBeGreaterThan(0.8)
    expect(raySphereDirection({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 10)).toBeNull()
  })

  it('[Light] angles are wrapped and clamped for the control', () => {
    expect(clampLightAngles(270, 120)).toEqual({ azimuth: -90, elevation: 90 })
    expect(clampLightAngles(-450, -80)).toEqual({ azimuth: -90, elevation: -20 })
    expect(clampLightAngles(30.4, 45.6)).toEqual({ azimuth: 30, elevation: 46 })
  })
})

describe('tool panel width', () => {
  it('[Layout] follows the widest label', () => {
    const narrow = toolPanelWidth([40, 52, 48])
    const wide = toolPanelWidth([40, 160, 48])
    expect(wide).toBeGreaterThan(narrow)
    expect(narrow).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH)
    expect(toolPanelWidth([])).toBe(MIN_PANEL_WIDTH)
    expect(toolPanelWidth([2000])).toBeLessThanOrEqual(480)
    // Two columns of a 120 px label plus the icon columns and the padding.
    expect(toolPanelWidth([120])).toBe(120 * 2 + 19 * 2 + 2 + 10)
    // One very long label ellipsizes instead of widening every button.
    expect(toolPanelWidth([40, 44, 48, 52, 300])).toBe(toolPanelWidth([40, 44, 48, 52, 56]))
  })

  it('[Layout] settings keep the chosen width', () => {
    expect(defaultSettings().leftPanelWidth).toBe(0)
    expect(sanitizeSettings({ leftPanelWidth: 380 }).leftPanelWidth).toBe(380)
    expect(sanitizeSettings({ leftPanelWidth: 5000 }).leftPanelWidth).toBe(640)
    expect(sanitizeSettings({ leftPanelWidth: 'wide' }).leftPanelWidth).toBe(0)
  })
})

describe('application chrome', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[GUI] a splitter sits on each side of the canvas', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const splitter = screen.getByTestId('panel-splitter')
    const propertySplitter = screen.getByTestId('property-splitter')
    for (const handle of [splitter, propertySplitter]) {
      expect(handle.getAttribute('role')).toBe('separator')
      expect(handle.getAttribute('aria-orientation')).toBe('vertical')
    }
    const workspace = screen.getByTestId('left-panel').parentElement as HTMLElement
    // Tool panel, splitter, canvas, splitter, and a property panel that is as
    // wide as the tool panel and never narrower than one property row.
    const columns = workspace.style.gridTemplateColumns.match(/^(\d+)px 6px minmax\(0, 1fr\) 6px (\d+)px$/)
    expect(columns, workspace.style.gridTemplateColumns).toBeTruthy()
    expect(columns![2]).toBe(columns![1])
    expect(Number(columns![2])).toBeGreaterThanOrEqual(propertyPanelWidth())
    // Each panel sits on its own side of the canvas.
    const panel = screen.getByTestId('left-panel')
    const right = screen.getByTestId('right-panel')
    expect(panel.compareDocumentPosition(splitter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(propertySplitter.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(splitter)
    await user.click(propertySplitter)
    await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-min-window-width')).toBeTruthy())
  })

  it('[GUI] the settings window is a fixed size that fits the smallest window', () => {
    // The dialog never resizes, so the window minimum has to leave room for it.
    expect(POPUP_SIZE.settings).toEqual({ width: 1040, height: 700 })
    expect(MIN_WINDOW_HEIGHT).toBeGreaterThanOrEqual(POPUP_SIZE.settings.height + 40)
    for (const popup of Object.values(POPUP_SIZE)) {
      expect(popup.height).toBeLessThanOrEqual(MIN_WINDOW_HEIGHT - 40)
    }
  })

  it('[GUI] a property row fits inside the narrowest property panel', () => {
    // Label, minus, the value and plus, inside the group box and clear of the
    // scroll bar: 38 + 4 + (20 + 2 + 62 + 2 + 20) + 14 + 16 + 16.
    expect(propertyPanelWidth()).toBe(194)
    // Both panels are held to that row plus a little room, and to the same
    // number, so neither one can be dragged past what the other one needs.
    expect(MIN_PANEL_WIDTH).toBe(propertyPanelWidth() + PANEL_ROOM)
    expect(MIN_PANEL_WIDTH).toBeGreaterThan(propertyPanelWidth())
    expect(propertyPanelWidth({ input: 100 })).toBe(propertyPanelWidth() + 38)
    expect(defaultSettings().rightPanelWidth).toBe(0)
    expect(sanitizeSettings({ rightPanelWidth: 240 }).rightPanelWidth).toBe(240)
    expect(sanitizeSettings({ rightPanelWidth: 5000 }).rightPanelWidth).toBe(640)
  })

  it('[GUI] the about window shows the mark, the build and the author on screen', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-about'))
    const icon = screen.getByTestId('about-icon') as HTMLImageElement
    expect(icon.tagName).toBe('IMG')
    expect(icon.getAttribute('src')).toContain('favicon')
    // Icon and description share the first line.
    const head = icon.parentElement as HTMLElement
    expect(head.className).toContain('about-head')
    expect(within(head).getByTestId('about-name').textContent).toBe('MyCAD')
    expect(within(head).getByTestId('about-tagline').textContent?.length).toBeGreaterThan(5)

    expect(screen.getByTestId('about-version').textContent).toBe('1.0.0')
    expect(screen.getByTestId('about-build').textContent?.length).toBeGreaterThan(8)
    expect(screen.getByTestId('about-platform').textContent?.length).toBeGreaterThan(1)
    expect(screen.getByTestId('about-author').textContent).toBe('shkwon(knix008@naver.com)')
    expect(AUTHOR).toBe('shkwon(knix008@naver.com)')
    // Room for all of it: the window is taller than the rows it has to show.
    expect(POPUP_SIZE.about.height).toBeGreaterThanOrEqual(360)
    expect(POPUP_SIZE.about.width).toBeGreaterThanOrEqual(520)
    await user.click(screen.getByTestId('about-close'))
    expect(screen.queryByTestId('about-author')).toBeNull()
  })

  it('[GUI] the about button is a ring with an i in it', async () => {
    render(<App />)
    const button = await screen.findByTestId('tb-about')
    const mark = button.querySelector('[data-testid="about-mark"]') as SVGElement
    expect(mark).toBeTruthy()
    expect(mark.tagName.toLowerCase()).toBe('svg')
    // A ring, the dot of the i and its stem.
    expect(mark.querySelectorAll('circle')).toHaveLength(2)
    expect(mark.querySelector('circle')!.getAttribute('fill')).toBe('none')
    expect(mark.querySelectorAll('rect')).toHaveLength(1)
    await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-min-window-width')).toBeTruthy())
  })

  it('[GUI] Escape closes an open menu', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('menu-view'))
    expect(screen.getByTestId('menu-popup')).toBeTruthy()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('menu-popup')).toBeNull())
  })

  it('[GUI] the toolbar resets the view and steps the text size', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-iso'))
    await user.click(screen.getByTestId('tb-zoom-in'))
    expect(screen.getByTestId('status-zoom').textContent).not.toContain('100')
    await user.click(screen.getByTestId('tb-resetView'))
    expect(screen.getByTestId('status-zoom').textContent).toContain('100')

    const size = screen.getByTestId('tb-font-value')
    expect(size.textContent).toContain('13')
    await user.click(screen.getByTestId('tb-font-inc'))
    expect(screen.getByTestId('tb-font-value').textContent).toContain('14')
    await user.click(screen.getByTestId('tb-font-dec'))
    await user.click(screen.getByTestId('tb-font-dec'))
    expect(screen.getByTestId('tb-font-value').textContent).toContain('12')
    await user.click(screen.getByTestId('tb-font-value'))
    expect(screen.getByTestId('tb-font-value').textContent).toContain('13')
  })

  it('[GUI] the tree and the specification tree mark what is selected', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-box'))
    const solidButton = screen.getAllByTestId(/^solid-/)[0]
    const solidId = solidButton.getAttribute('data-testid')!.replace('solid-', '')
    await user.click(solidButton)
    expect(solidButton.className).toContain('on')
    expect(solidButton.getAttribute('aria-pressed')).toBe('true')
    expect(within(solidButton).getByText('✓')).toBeTruthy()

    // The same solid is marked in the specification tree, and clicking a row
    // there selects it as well.
    const row = screen.getByTestId(`spec-row-solid:${solidId}`)
    expect(row.className).toContain('on')
    await user.click(screen.getByTestId('tb-select'))
    await user.click(row)
    expect(screen.getByTestId('status-selection').textContent).toContain('1')
    expect(row.getAttribute('aria-pressed')).toBe('true')
  })

  it('[GUI] the properties panel puts every value between steppers', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-box'))
    await user.click(screen.getAllByTestId(/^solid-/)[0])
    for (const id of ['prop-position-x', 'prop-rotation-y', 'prop-size-z', 'prop-scale-x', 'prop-metalness']) {
      const field = screen.getByTestId(id)
      const host = field.parentElement as HTMLElement
      expect(host.className).toContain('number-field')
      const order = [...host.children].map((node) => node.getAttribute('data-testid'))
      // minus, the value, then plus
      expect(order.indexOf(`${id}-dec`)).toBeLessThan(order.indexOf(id))
      expect(order.indexOf(id)).toBeLessThan(order.indexOf(`${id}-inc`))
    }
    const before = (screen.getByTestId('prop-position-x') as HTMLInputElement).value
    await user.click(screen.getByTestId('prop-position-x-inc'))
    expect((screen.getByTestId('prop-position-x') as HTMLInputElement).value).not.toBe(before)
  })

  it('[GUI] the light control offers every kind of source', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-light-menu'))
    for (const kind of LIGHT_KINDS) {
      expect(screen.getByTestId(`light-kind-${kind}`)).toBeTruthy()
    }
    expect(LIGHT_KINDS.length).toBeGreaterThanOrEqual(6)
    expect(screen.getByTestId('light-kind-directional').getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByTestId('light-kind-spot'))
    await waitFor(() => expect(screen.getByTestId('light-kind-spot').getAttribute('aria-pressed')).toBe('true'))
    expect(screen.getByTestId('tb-light').getAttribute('title')).toContain('스포트')
    // Presets cover the new kinds too.
    await user.click(screen.getByTestId('light-preset-threePoint'))
    await waitFor(() => expect(screen.getByTestId('light-kind-threePoint').getAttribute('aria-pressed')).toBe('true'))
    await user.click(screen.getByTestId('light-color-ffe0b0'))
    expect(sanitizeLight({ kind: 'spot', color: '#ABCDEF' })).toMatchObject({ kind: 'spot', color: '#abcdef' })
    expect(sanitizeLight({ kind: 'nope', color: 'red' })).toMatchObject({ kind: 'directional', color: '#ffffff' })
  })

  it('[GUI] the toolbar opens and closes both side panels', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const workspace = screen.getByTestId('workspace')
    const left = screen.getByTestId('left-panel')
    const right = screen.getByTestId('right-panel')
    expect(left.hidden).toBe(false)
    expect(right.hidden).toBe(false)

    await user.click(screen.getByTestId('tb-toolPanel'))
    expect(screen.getByTestId('left-panel').hidden).toBe(true)
    expect(screen.getByTestId('panel-splitter').hidden).toBe(true)
    // The closed panel takes no width, and the canvas keeps its own column.
    const rightColumn = workspace.style.gridTemplateColumns.split(' ').at(-1)
    expect(workspace.style.gridTemplateColumns).toBe(`0px 0px minmax(0, 1fr) 6px ${rightColumn}`)

    await user.click(screen.getByTestId('tb-propertyPanel'))
    expect(screen.getByTestId('right-panel').hidden).toBe(true)
    expect(screen.getByTestId('property-splitter').hidden).toBe(true)
    expect(workspace.style.gridTemplateColumns).toBe('0px 0px minmax(0, 1fr) 0px 0px')

    await user.click(screen.getByTestId('tb-toolPanel'))
    await user.click(screen.getByTestId('tb-propertyPanel'))
    expect(screen.getByTestId('left-panel').hidden).toBe(false)
    expect(screen.getByTestId('right-panel').hidden).toBe(false)
    expect(sanitizeSettings({ showToolPanel: false }).showToolPanel).toBe(false)
    expect(sanitizeSettings({}).showPropertyPanel).toBe(true)
  })

  it('[GUI] printing sits next to exporting in the toolbar', () => {
    const toolbar = TOOLBAR_GROUPS.find((group) => group.includes('print'))!
    expect(toolbar[toolbar.indexOf('print') - 1]).toBe('export')
  })

  it('[GUI] the theme gallery lives in one settings tab', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    expect(screen.queryByTestId('settings-tab-customTheme')).toBeNull()
    await user.click(screen.getByTestId('settings-tab-theme'))
    expect(screen.getAllByTestId(/^theme-mode-/)).toHaveLength(3)
    expect(screen.getAllByTestId(/^theme-(?!mode|grid)/)).toHaveLength(20)
    await user.click(screen.getByTestId('theme-mode-custom'))
    expect(screen.getByTestId('custom-colors')).toBeTruthy()
    // The custom theme can start from any of the forty presets.
    const presets = screen.getByTestId('theme-presets')
    expect(presets.querySelectorAll('button')).toHaveLength(40)
    await user.click(screen.getByTestId('preset-mint'))
    expect((screen.getByTestId('custom-bg') as HTMLInputElement).value).toBe(THEMES.find((theme) => theme.id === 'mint')!.colors.bg)
    expect(screen.queryByTestId('theme-grid')).toBeNull()
    await user.click(screen.getByTestId('theme-mode-light'))
    expect(screen.getAllByTestId(/^theme-(?!mode|grid)/)).toHaveLength(20)
    expect(THEMES).toHaveLength(40)
  })

  it('[GUI] the window minimum keeps every bar visible', async () => {
    const setMinSize = vi.fn(async () => true)
    Object.defineProperty(window, 'mycad', {
      configurable: true,
      value: { isElectron: true, platform: 'win32', setMinSize }
    })
    render(<App />)
    await waitFor(() => expect(setMinSize).toHaveBeenCalled())
    const [width] = setMinSize.mock.calls[0] as unknown as number[]
    expect(width).toBeGreaterThanOrEqual(Number(screen.getByTestId('app').getAttribute('data-min-window-width')))
    Reflect.deleteProperty(window, 'mycad')
  })
})
