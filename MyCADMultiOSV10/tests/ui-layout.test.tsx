import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { AUTHOR, POPUP_SIZE } from '../src/core/buildInfo'
import { MIN_PANEL_WIDTH, PANEL_ROOM, clampLightAngles, lightAngles, lightPosition, propertyPanelWidth, raySphereDirection, toolPanelWidth } from '../src/core/viewnav'
import { LIGHT_KINDS, sanitizeLight, sanitizeSettings } from '../src/core/settings'
import { THEMES } from '../src/core/themes'
import { SETTINGS_KEY } from '../src/core/settings'
import { MENUS, MENU_SECTION_THRESHOLD, TOOLBAR_GROUPS, TOOLBAR_RIGHT, menuPopupLayout, menuRowCount, menuSections } from '../src/core/menus'

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

  it('[Layout] both side panels share one fixed width', () => {
    // Neither panel resizes any more, so the layout only has to be wide enough
    // for the widest of the two contents.
    expect(MIN_PANEL_WIDTH).toBeGreaterThanOrEqual(propertyPanelWidth())
    expect(toolPanelWidth([40, 52, 48])).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH)
  })
})

describe('menu popups', () => {
  it('[Menu] a long menu wraps into columns that fit the window', () => {
    const viewport = { viewportWidth: 1280, viewportHeight: 800 }
    const rowHeight = 29
    const fits = (layout: { columns: number; rows: number; width: number; left: number }, anchorY: number) => {
      expect(layout.rows * rowHeight + anchorY + 44).toBeLessThanOrEqual(viewport.viewportHeight)
      expect(layout.left + layout.width).toBeLessThanOrEqual(viewport.viewportWidth)
      expect(layout.left).toBeGreaterThanOrEqual(4)
    }

    // A short menu stays in one column.
    const small = menuPopupLayout({ count: 6, anchorX: 10, anchorY: 32, ...viewport })
    expect(small.columns).toBe(1)
    expect(small.rows).toBe(6)
    fits(small, 32)

    // A long one wraps, and the columns are evened out rather than filled to
    // the brim: 52 items over 3 columns is 18 rows, not 23 and then 6.
    const long = menuPopupLayout({ count: 52, anchorX: 10, anchorY: 32, ...viewport })
    expect(long.columns).toBeGreaterThan(1)
    expect(long.rows * long.columns).toBeGreaterThanOrEqual(52)
    expect(long.rows).toBe(Math.ceil(52 / long.columns))
    fits(long, 32)

    // Opening low on the screen leaves less height, so it takes more columns.
    const low = menuPopupLayout({ count: 52, anchorX: 10, anchorY: 560, ...viewport })
    expect(low.columns).toBeGreaterThanOrEqual(long.columns)
    fits(low, 560)

    // Near the right edge the popup slides back inside the window.
    const edge = menuPopupLayout({ count: 30, anchorX: 1240, anchorY: 32, ...viewport })
    fits(edge, 32)

    // And a menu longer than the screen can hold is capped by the width.
    const huge = menuPopupLayout({ count: 400, anchorX: 10, anchorY: 32, ...viewport })
    expect(huge.width).toBeLessThanOrEqual(viewport.viewportWidth - 16)
    fits(huge, 32)
  })

  it('[Menu] separators are counted as rows', () => {
    const file = MENUS.find((menu) => menu.id === 'file')!
    expect(file.breaks).toEqual(['save', 'export', 'print', 'openUrl'])
    expect(menuRowCount(file)).toBe(file.items.length + 4)
    // Every break names an item that is really in the menu, and the row count
    // covers the items, the separators and the section headings.
    for (const menu of MENUS) {
      for (const id of menu.breaks ?? []) {
        expect(menu.items.some((item) => item.id === id), `${menu.id}/${id}`).toBe(true)
      }
      const sections = menuSections(menu)
      const headings = sections.filter((section) => section.category).length
      expect(menuRowCount(menu), menu.id).toBe(menu.items.length + (menu.breaks?.length ?? 0) + headings)
      // Sections hold every item once, in the menu's own order within a group.
      expect(sections.flatMap((section) => section.items)).toHaveLength(menu.items.length)
      expect(new Set(sections.flatMap((section) => section.items.map((item) => item.id))).size).toBe(menu.items.length)
    }

    // A short menu is one plain section; a long one is split by category.
    expect(menuSections(file)).toHaveLength(1)
    expect(menuSections(file)[0].category).toBeUndefined()
    const part = MENUS.find((menu) => menu.id === 'part')!
    expect(part.items.length).toBeGreaterThan(MENU_SECTION_THRESHOLD)
    const partSections = menuSections(part)
    expect(partSections.length).toBeGreaterThan(3)
    expect(partSections.every((section) => section.category)).toBe(true)
  })

  it('[GUI] the File menu draws a line between its groups', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('menu-file'))
    const popup = screen.getByTestId('menu-popup')
    for (const id of ['save', 'export', 'print', 'openUrl']) {
      const separator = screen.getByTestId(`menu-separator-${id}`)
      const item = screen.getByTestId(`menuitem-${id}`)
      // The line comes immediately before the item that starts the group.
      expect(separator.nextElementSibling).toBe(item)
    }
    expect(popup.querySelectorAll('.menu-separator')).toHaveLength(4)
    // The items themselves are untouched: still one button per command.
    const file = MENUS.find((menu) => menu.id === 'file')!
    expect(popup.querySelectorAll('.menu-item')).toHaveLength(file.items.length)
  })
})

describe('application chrome', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[GUI] both panels are a fixed width and close from their own heading', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const workspace = screen.getByTestId('left-panel').parentElement as HTMLElement
    // Tool panel, canvas, property panel: no splitter between them.
    expect(screen.queryByTestId('panel-splitter')).toBeNull()
    expect(screen.queryByTestId('property-splitter')).toBeNull()
    const columns = workspace.style.gridTemplateColumns.match(/^(\d+)px minmax\(0, 1fr\) (\d+)px$/)
    expect(columns, workspace.style.gridTemplateColumns).toBeTruthy()
    expect(columns![2]).toBe(columns![1])
    expect(Number(columns![1])).toBeGreaterThanOrEqual(propertyPanelWidth())

    // The toolbar switch closes a panel and brings it back; the headings
    // carry no hide button of their own any more.
    expect(screen.queryByTestId('close-tool-panel')).toBeNull()
    expect(screen.queryByTestId('close-property-panel')).toBeNull()

    await user.click(screen.getByTestId('tb-toolPanel'))
    expect(screen.getByTestId('left-panel').hidden).toBe(true)
    expect(workspace.style.gridTemplateColumns.startsWith('0px ')).toBe(true)
    await user.click(screen.getByTestId('tb-toolPanel'))
    expect(screen.getByTestId('left-panel').hidden).toBe(false)

    await user.click(screen.getByTestId('tb-propertyPanel'))
    expect(screen.getByTestId('right-panel').hidden).toBe(true)
    expect(workspace.style.gridTemplateColumns.endsWith(' 0px')).toBe(true)
    await user.click(screen.getByTestId('tb-propertyPanel'))
    expect(screen.getByTestId('right-panel').hidden).toBe(false)
    await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-min-window-width')).toBeTruthy())
  })

  it('[GUI] each block of the tool panel folds away from its own heading', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-box'))

    const blocks = [
      { id: 'tools', body: 'tool-grid' },
      { id: 'specTree', body: 'spec-tree' }
    ]
    for (const block of blocks) {
      const heading = screen.getByTestId(`fold-${block.id}`)
      expect(heading.getAttribute('aria-expanded'), block.id).toBe('true')
      expect(screen.getByTestId(block.body), block.id).toBeTruthy()

      await user.click(heading)
      expect(screen.getByTestId(`fold-${block.id}`).getAttribute('aria-expanded'), block.id).toBe('false')
      expect(screen.queryByTestId(block.body), block.id).toBeNull()

      await user.click(screen.getByTestId(`fold-${block.id}`))
      expect(screen.getByTestId(block.body), block.id).toBeTruthy()
    }

    // The scene list folds too, and folding it leaves the others alone.
    const solid = screen.getByTestId('left-panel').querySelector('[data-testid^="solid-"]')
    expect(solid).toBeTruthy()
    await user.click(screen.getByTestId('fold-scene'))
    expect(screen.getByTestId('left-panel').querySelector('[data-testid^="solid-"]')).toBeNull()
    expect(screen.getByTestId('tool-grid')).toBeTruthy()
    expect(screen.getByTestId('fold-features')).toBeTruthy()

    // Folding a block is not the same as closing the panel.
    expect(screen.getByTestId('left-panel').hidden).toBe(false)
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

    // The right-click menu over the canvas closes the same way.
    fireEvent.contextMenu(screen.getByTestId('viewport'), { clientX: 200, clientY: 160 })
    await waitFor(() => expect(screen.getByTestId('context-menu')).toBeTruthy())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('context-menu')).toBeNull())
  })

  it('[GUI] one button shows or hides the X, Y and Z axes together', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const button = screen.getByTestId('tb-showAxes')
    const saved = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    // Axes start shown, and the button offers to hide them.
    expect(button.className).toContain('on')
    expect(button.getAttribute('title')).toContain('없음')

    await user.click(button)
    await waitFor(() => expect(saved().showAxes).toBe(false))
    expect(screen.getByTestId('tb-showAxes').className).not.toContain('on')
    expect(screen.getByTestId('tb-showAxes').getAttribute('title')).toBe('좌표축 표시')

    await user.click(screen.getByTestId('tb-showAxes'))
    await waitFor(() => expect(saved().showAxes).toBe(true))
    expect(screen.getByTestId('tb-showAxes').className).toContain('on')

    // The button draws the triad itself: an arm up, one to the lower left and
    // one to the lower right, in the axis colours while they are shown.
    const mark = screen.getByTestId('axes-on')
    const arms = [...mark.querySelectorAll('g')]
    expect(arms).toHaveLength(3)
    expect(arms.map((arm) => arm.getAttribute('stroke'))).toEqual(['#3cba54', '#3b82e2', '#e23b3b'])
    const [up, left, right] = arms.map((arm) => arm.querySelector('path')!.getAttribute('d')!)
    // Up from the origin, then down to the left, then down to the right.
    expect(up).toContain('V3.4')
    expect(left).toContain('3.5 18.1')
    expect(right).toContain('20.5 18.1')

    // The View menu and the settings window drive the same one switch.
    await user.click(screen.getByTestId('menu-view'))
    await user.click(screen.getByTestId('menuitem-showAxes'))
    await waitFor(() => expect(saved().showAxes).toBe(false))
    // Switched off, the same triad is drawn unlit.
    expect(screen.getByTestId('axes-off')).toBeTruthy()
  })

  it('[GUI] the scale marker sits on the canvas, drags and goes home', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const marker = await screen.findByTestId('scale-marker')
    // It says how long it is, in the document's units.
    expect(screen.getByTestId('scale-marker-label').textContent).toMatch(/mm$/)
    expect(Number(marker.dataset.distance)).toBeGreaterThan(0)
    const saved = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    expect(saved().scaleMarker ?? null).toBeNull()

    // Dragging moves it, and where it lands is remembered.
    fireEvent.pointerDown(marker, { clientX: 40, clientY: 400, pointerId: 1 })
    fireEvent.pointerMove(marker, { clientX: 220, clientY: 260, pointerId: 1 })
    fireEvent.pointerUp(marker, { clientX: 220, clientY: 260, pointerId: 1 })
    await waitFor(() => expect(saved().scaleMarker).toBeTruthy())

    // Resetting the view puts it back in its corner.
    await user.click(screen.getByTestId('tb-resetView'))
    await waitFor(() => expect(saved().scaleMarker).toBeNull())
  })

  it('[GUI] the scale bar starts in the top left corner and the toolbar switches it off', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const marker = await screen.findByTestId('scale-marker')
    const canvasHeight = (marker.parentElement as HTMLElement).clientHeight || 600

    // `bottom` places it, so its home is the far end of that axis: the top of
    // the canvas, not the bottom where the horizontal ruler runs.
    const bottom = Number.parseFloat(marker.style.bottom)
    expect(bottom).toBeGreaterThan(canvasHeight / 2)
    expect(Number.parseFloat(marker.style.left)).toBeLessThan(40)

    const saved = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    expect(screen.getByTestId('tb-scaleBar').className).toContain('on')
    await user.click(screen.getByTestId('tb-scaleBar'))
    await waitFor(() => expect(screen.queryByTestId('scale-marker')).toBeNull())
    expect(saved().scaleBar).toBe(false)
    expect(screen.getByTestId('tb-scaleBar').className).not.toContain('on')

    // The View menu drives the same switch.
    await user.click(screen.getByTestId('menu-view'))
    await user.click(screen.getByTestId('menuitem-scaleBar'))
    await waitFor(() => expect(screen.getByTestId('scale-marker')).toBeTruthy())
    expect(saved().scaleBar).toBe(true)
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

  it('[GUI] the toolbar and the View menu both open and close the side panels', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const workspace = screen.getByTestId('workspace')
    const left = screen.getByTestId('left-panel')
    const right = screen.getByTestId('right-panel')
    expect(left.hidden).toBe(false)
    expect(right.hidden).toBe(false)

    // The toolbar carries both switches, next to the View menu's own items.
    await user.click(screen.getByTestId('tb-toolPanel'))
    expect(screen.getByTestId('left-panel').hidden).toBe(true)
    // The closed panel takes no width, and the canvas keeps its own column.
    const rightColumn = workspace.style.gridTemplateColumns.split(' ').at(-1)
    expect(workspace.style.gridTemplateColumns).toBe(`0px minmax(0, 1fr) ${rightColumn}`)

    await user.click(screen.getByTestId('tb-propertyPanel'))
    expect(screen.getByTestId('right-panel').hidden).toBe(true)
    expect(workspace.style.gridTemplateColumns).toBe('0px minmax(0, 1fr) 0px')

    await user.click(screen.getByTestId('menu-view'))
    await user.click(screen.getByTestId('menuitem-toolPanel'))
    await user.click(screen.getByTestId('menu-view'))
    await user.click(screen.getByTestId('menuitem-propertyPanel'))
    expect(screen.getByTestId('left-panel').hidden).toBe(false)
    expect(screen.getByTestId('right-panel').hidden).toBe(false)
    expect(sanitizeSettings({ showToolPanel: false }).showToolPanel).toBe(false)
    expect(sanitizeSettings({}).showPropertyPanel).toBe(true)
  })

  it('[GUI] printing sits next to exporting on the toolbar and in the File menu', () => {
    const toolbar = TOOLBAR_GROUPS.find((group) => group.includes('print'))!
    expect(toolbar[toolbar.indexOf('print') - 1]).toBe('export')
    const file = MENUS.find((menu) => menu.id === 'file')!
    expect(file.items.map((item) => item.id)).toContain('print')
  })

  it('[GUI] every command on the toolbar can also be reached from a menu', () => {
    // A command that only exists on the toolbar is one nobody finds by
    // reading the menus: Print was missing from File for exactly that reason.
    const inMenus = new Set(MENUS.flatMap((menu) => menu.items.map((item) => item.id)))
    // The two pickers are not commands; each opens its own gallery and both
    // are settable from the settings window.
    const pickers = ['language', 'theme']
    const missing = [...TOOLBAR_GROUPS.flat(), ...TOOLBAR_RIGHT]
      .filter((id) => !inMenus.has(id) && !pickers.includes(id))
    expect(missing).toEqual([])
  })

  it('[GUI] the File menu prints from its own item', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-box'))
    await user.click(screen.getByTestId('menu-file'))
    await user.click(screen.getByTestId('menuitem-print'))
    expect(await screen.findByTestId('print-tabs')).toBeTruthy()
    expect(screen.getByTestId('print-preview')).toBeTruthy()
  })

  it('[GUI] the gallery shows dark and light as two blocks, custom on its own tab', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    await user.click(screen.getByTestId('settings-tab-theme'))

    // Both halves are on the page at once: no mode switch to click first.
    expect(screen.queryAllByTestId(/^theme-mode-/)).toHaveLength(0)
    expect(screen.getByTestId('theme-block-dark')).toBeTruthy()
    expect(screen.getByTestId('theme-block-light')).toBeTruthy()
    expect(screen.getByTestId('theme-grid-dark').querySelectorAll('button')).toHaveLength(20)
    expect(screen.getByTestId('theme-grid-light').querySelectorAll('button')).toHaveLength(20)
    expect(THEMES).toHaveLength(40)

    // The custom theme is a tab of its own, not a tile among the presets.
    expect(screen.queryByTestId('theme-custom')).toBeNull()
    expect(screen.queryByTestId('custom-colors')).toBeNull()
    await user.click(screen.getByTestId('settings-tab-customTheme'))
    expect(screen.getByTestId('custom-colors')).toBeTruthy()
    expect(screen.queryByTestId('theme-grid-dark')).toBeNull()

    // Starting from an existing palette is a dropdown, not a second grid of
    // the same forty tiles.
    expect(screen.queryByTestId('theme-presets')).toBeNull()
    await user.selectOptions(screen.getByTestId('theme-preset'), 'mint')
    expect((screen.getByTestId('custom-bg') as HTMLInputElement).value).toBe(THEMES.find((theme) => theme.id === 'mint')!.colors.bg)
  })

  it('[GUI] switching language never changes the window minimum', async () => {
    const user = userEvent.setup({ delay: null })
    const setMinSize = vi.fn(async () => true)
    Object.defineProperty(window, 'mycad', {
      configurable: true,
      value: { isElectron: true, platform: 'win32', setMinSize }
    })
    // jsdom gives everything a zero box, so widths are faked from the text:
    // the Korean and English labels then really do measure differently.
    const boxes = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const width = (this.textContent?.length ?? 0) * 7 + 20
      return { width, height: 24, top: 0, left: 0, right: width, bottom: 24, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    })

    try {
      render(<App />)
      await waitFor(() => expect(setMinSize).toHaveBeenCalled())
      const measured = Number(screen.getByTestId('app').getAttribute('data-min-window-width'))
      expect(measured).toBeGreaterThan(0)

      await user.click(screen.getByTestId('tb-language'))
      await waitFor(() => expect(screen.getByTestId('flag-ko')).toBeTruthy())
      expect(Number(screen.getByTestId('app').getAttribute('data-min-window-width'))).toBe(measured)

      await user.click(screen.getByTestId('tb-language'))
      await waitFor(() => expect(screen.getByTestId('flag-en')).toBeTruthy())
      expect(Number(screen.getByTestId('app').getAttribute('data-min-window-width'))).toBe(measured)

      // The main process is never asked to change the window once it has been
      // measured, so the window itself never moves.
      const widths = setMinSize.mock.calls.map((call) => (call as unknown as number[])[0])
      expect(widths.at(-1)).toBe(measured)
      expect(new Set(widths.slice(widths.indexOf(measured)))).toEqual(new Set([measured]))
    } finally {
      boxes.mockRestore()
      Reflect.deleteProperty(window, 'mycad')
    }
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
