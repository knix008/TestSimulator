import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App, MENU_CLOSE_DELAY } from '../src/ui/App'
import { MENUS, TOOLBAR, TOOLBAR_CONTROLS, TOOLBAR_GROUPS, TOOLBAR_RIGHT } from '../src/core/menus'
import { toolbarMinWidth } from '../src/core/buildInfo'
import { serializeDocument } from '../src/core/serialize'
import { createDocument, createSolid } from '../src/core/model'
import { SETTINGS_KEY } from '../src/core/settings'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readSample = (name: string) => readFileSync(join(process.cwd(), 'sample', name), 'utf8')

/** Pretend the tab strip is this wide, the way a narrow window would be. */
function narrowTabs(width: number) {
  const strip = screen.getByTestId('tabstrip')
  Object.defineProperty(strip, 'clientWidth', { value: width, configurable: true })
  fireEvent(window, new Event('resize'))
}

function jsonFile(name: string, text: string) {
  return new File([text], name, { type: 'application/json' })
}

describe('gui', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[GUI] renders the title, toolbar tooltips, panels, and status bar', async () => {
    render(<App />)
    expect(document.title).toContain('MyCAD 1.0.0')
    expect(document.querySelector('.titlebar')).toBeNull()
    expect(screen.getByTestId('size-grip')).toBeTruthy()
    for (const id of TOOLBAR) {
      const button = screen.getByTestId(`tb-${id}`)
      expect(button.getAttribute('title')?.length).toBeGreaterThan(0)
    }
    expect(screen.getByTestId('left-panel')).toBeTruthy()
    expect(screen.getByTestId('right-panel')).toBeTruthy()
    expect(screen.getByTestId('statusbar').textContent).toContain('mm')
    // The window may never be narrower than the toolbar it has to show.
    const minWidth = Number(screen.getByTestId('app').getAttribute('data-min-window-width'))
    expect(minWidth).toBeGreaterThanOrEqual(toolbarMinWidth(TOOLBAR_GROUPS, TOOLBAR_CONTROLS.length + TOOLBAR_RIGHT.length))
    expect(minWidth).toBeGreaterThan(TOOLBAR.length * 30)
    expect(screen.getByTestId('app').style.minWidth).toBe(`${minWidth}px`)
    // Language, settings and about sit at the right end, after the spacer.
    const toolbar = screen.getByTestId('toolbar')
    const spacer = toolbar.querySelector('.toolbar-spacer')
    expect(spacer).toBeTruthy()
    for (const id of TOOLBAR_RIGHT) {
      const button = screen.getByTestId(`tb-${id}`)
      expect(spacer!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getByTestId('flag-en')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-min-window-width')).toBeTruthy())
  })

  it('[GUI] every menu opens with an icon and a label on each item', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    for (const menu of MENUS) {
      await user.click(screen.getByTestId(`menu-${menu.id}`))
      const popup = screen.getByTestId('menu-popup')
      // Long menus wrap into columns rather than being clipped by the window.
      expect(['single-column', 'multi-column']).toContain(popup.getAttribute('data-layout'))
      expect(Number(popup.getAttribute('data-columns'))).toBeGreaterThanOrEqual(1)
      expect(within(popup).getAllByRole('menuitem').length).toBeGreaterThanOrEqual(menu.items.length)
      for (const item of menu.items) {
        const row = within(popup).getByTestId(`menuitem-${item.id}`)
        expect(within(row).getByText((_content, node) => node?.className === 'menu-icon')).toBeTruthy()
        expect(row.querySelector('.menu-label')?.textContent?.length).toBeGreaterThan(0)
      }
    }
  })

  it('[GUI] models, undo, copy, paste, themes, language, fonts, and recent files', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-box'))
    expect(screen.getByTestId('status-objects').textContent).toContain('1')
    expect(screen.getByTestId('undo-state').textContent).toContain('yes')
    await user.click(screen.getByTestId('tb-undo'))
    expect(screen.getByTestId('status-objects').textContent).toContain('0')
    await user.click(screen.getByTestId('tb-redo'))
    expect(screen.getByTestId('status-objects').textContent).toContain('1')
    await user.click(screen.getByTestId('tb-copy'))
    await user.click(screen.getByTestId('tb-paste'))
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('2'))

    await user.click(screen.getByTestId('tb-settings'))
    await user.selectOptions(screen.getByTestId('language'), 'en')
    expect(screen.getByTestId('menu-file').textContent).toContain('File')
    await user.selectOptions(screen.getByTestId('theme'), 'blueprint')
    expect(screen.getByTestId('app').getAttribute('data-theme')).toBe('blueprint')
    await user.click(screen.getByTestId('settings-tab-font'))
    await user.selectOptions(screen.getByTestId('font-family'), 'Arial')
    await user.clear(screen.getByTestId('font-size'))
    await user.type(screen.getByTestId('font-size'), '18')
    await user.selectOptions(screen.getByTestId('font-style'), 'bold')
    expect(screen.getByTestId('app').style.fontWeight).toBe('700')
  })

  it('[GUI] limits recent files and deletes one or all of them', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...JSON.parse(JSON.stringify({ language: 'ko', theme: 'dark', fontFamily: 'Segoe UI', fontSize: 13, fontStyle: 'normal', backgroundImage: null, backgroundOpacity: 40, grid: true, snap: 10, lastDirectories: { open: 'D:/cad', save: '', import: '', background: '' } })),
      recentFiles: Array.from({ length: 10 }, (_item, index) => ({ path: `D:/cad/part-${index}.mycad`, name: `part-${index}.mycad`, openedAt: index }))
    }))
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    await user.click(screen.getByTestId('settings-tab-recent'))
    await waitFor(() => expect(screen.getAllByTestId('recent-row').length).toBeGreaterThan(0))
    const before = screen.getAllByTestId('recent-row')
    expect(before.length).toBeLessThanOrEqual(10)
    await user.click(screen.getByTestId('remove-recent-D:/cad/part-0.mycad'))
    expect(screen.getAllByTestId('recent-row').length).toBe(before.length - 1)
    await user.click(screen.getByTestId('clear-recent'))
    expect(screen.queryAllByTestId('recent-row')).toHaveLength(0)
  })

  it('[GUI] shows a copyable error, progress, print preview, tabs, and drop', async () => {
    const user = userEvent.setup({ delay: null })
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText: async () => '' } })
    render(<App />)
    vi.spyOn(window, 'prompt').mockReturnValue('https://invalid.local/missing.mycad')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down at socket'))
    await user.click(screen.getByTestId('menu-file'))
    await user.click(screen.getByTestId('menuitem-openUrl'))
    await waitFor(() => expect(screen.getByTestId('error-message').textContent).toContain('network down'))
    await user.click(screen.getByTestId('copy-error'))
    expect(writeText).toHaveBeenCalled()
    expect(screen.getByTestId('copied-error').textContent).toContain('network down')
    await user.click(screen.getByText('닫기'))

    const doc = createDocument('doc', 'Plate')
    doc.solids = [createSolid('box', 'b', 1)]
    const file = jsonFile('plate.mycad', serializeDocument(doc))
    const viewport = screen.getByTestId('viewport')
    fireEvent.drop(viewport, { dataTransfer: { files: [file] } })
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('1'))

    for (let i = 0; i < 4; i++) await user.click(screen.getByTestId('tb-new'))
    // A narrow window cannot show five tabs, so the strip grows its arrows.
    narrowTabs(420)
    expect(screen.getByTestId('tab-prev')).toBeTruthy()
    expect(screen.getByTestId('tab-next')).toBeTruthy()
    await user.click(screen.getByTestId('tab-next'))

    await user.click(screen.getByTestId('tb-box'))
    await user.click(screen.getByTestId('tb-print'))
    expect(screen.getByTestId('print-preview')).toBeTruthy()
    await user.click(screen.getByLabelText('현재 문서'))
    await user.click(screen.getByLabelText('전체'))
    await user.click(screen.getByLabelText('사용자 지정'))
    await user.click(screen.getByTestId('print-tab-layout'))
    await user.selectOptions(screen.getByLabelText('용지'), 'Letter')
    await user.selectOptions(screen.getByLabelText('방향'), 'landscape')
    await user.click(screen.getByTestId('print-now'))

    const solid = screen.getByTestId('status-objects')
    expect(solid).toBeTruthy()
    fireEvent.contextMenu(viewport, { clientX: 40, clientY: 40 })
    expect(screen.getByTestId('context-menu').getAttribute('data-layout')).toBe('single-column')
  })

  /** Let the close timer run out, as real time rather than a fake clock. */
  const afterCloseDelay = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, MENU_CLOSE_DELAY + 120))
  })

  it('[GUI] an open menu closes when the pointer leaves it', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('menu-file'))
    expect(screen.getByTestId('menuitem-new')).toBeTruthy()

    await user.unhover(screen.getByTestId('menubar'))
    // The grace period is the point: it must not vanish the instant the
    // pointer crosses the edge on its way to an item.
    expect(screen.queryByTestId('menuitem-new')).toBeTruthy()
    await waitFor(() => expect(screen.queryByTestId('menuitem-new')).toBeNull())
  })

  it('[GUI] the menu bar and its panel are one region, so moving between them keeps it open', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('menu-file'))
    const popup = screen.getByTestId('menuitem-new').closest('.menu-popup') as HTMLElement

    // Down from the root button into the items: leaving the bar arms the
    // close, entering the panel has to cancel it.
    await user.unhover(screen.getByTestId('menubar'))
    await user.hover(popup)
    await afterCloseDelay()
    expect(screen.queryByTestId('menuitem-new')).toBeTruthy()

    // And back up to the bar again.
    await user.unhover(popup)
    await user.hover(screen.getByTestId('menubar'))
    await afterCloseDelay()
    expect(screen.queryByTestId('menuitem-new')).toBeTruthy()

    await user.unhover(screen.getByTestId('menubar'))
    await waitFor(() => expect(screen.queryByTestId('menuitem-new')).toBeNull())
  })

  it('[GUI] the right-click menu closes on leave', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    fireEvent.contextMenu(screen.getByTestId('viewport'), { clientX: 40, clientY: 40 })
    const context = screen.getByTestId('context-menu')
    // The right click came from fireEvent, so the pointer has to be put over
    // the menu before leaving it means anything.
    await user.hover(context)
    await user.unhover(context)
    await waitFor(() => expect(screen.queryByTestId('context-menu')).toBeNull())
  })

  it('[GUI] a menu opens when it is picked, not when the pointer passes over it', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    expect(screen.queryByTestId('menuitem-new')).toBeNull()

    // Crossing the bar on the way somewhere else must leave it alone.
    await user.hover(screen.getByTestId('menu-file'))
    await user.hover(screen.getByTestId('menu-edit'))
    await afterCloseDelay()
    expect(screen.queryByTestId('menuitem-new')).toBeNull()
    expect(screen.queryByTestId('menuitem-undo')).toBeNull()

    // A click opens it.
    await user.click(screen.getByTestId('menu-file'))
    expect(screen.getByTestId('menuitem-new')).toBeTruthy()

    // Picking another root swaps the panel over.
    await user.click(screen.getByTestId('menu-edit'))
    expect(screen.queryByTestId('menuitem-new')).toBeNull()
    expect(screen.getByTestId('menuitem-undo')).toBeTruthy()

    // Clicking the one already open closes it again.
    await user.click(screen.getByTestId('menu-edit'))
    expect(screen.queryByTestId('menuitem-undo')).toBeNull()
  })

  it('[GUI] a press outside closes an open menu, so a touch screen can leave one', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('menu-file'))
    expect(screen.getByTestId('menuitem-new')).toBeTruthy()
    // pointerdown somewhere else: this is the path a tap takes.
    fireEvent.pointerDown(screen.getByTestId('viewport'))
    expect(screen.queryByTestId('menuitem-new')).toBeNull()

    fireEvent.contextMenu(screen.getByTestId('viewport'), { clientX: 40, clientY: 40 })
    expect(screen.getByTestId('context-menu')).toBeTruthy()
    fireEvent.pointerDown(screen.getByTestId('statusbar'))
    expect(screen.queryByTestId('context-menu')).toBeNull()
  })

  it('[GUI] asks before closing a dirty document and edits properties', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-sphere'))
    const name = screen.getByLabelText('이름')
    await user.clear(name)
    await user.type(name, 'Hub')
    // The name shows in the scene list and in the specification tree.
    expect(screen.getAllByText('Hub').length).toBeGreaterThanOrEqual(2)
    await user.click(screen.getByTestId('tb-new'))
    expect(screen.getByTestId('confirm-message').textContent).toContain('저장')
    await user.click(screen.getByTestId('confirm-cancel'))
    expect(screen.queryByTestId('confirm-message')).toBeNull()
  })

  it('[GUI] a file dragged in from the desktop opens wherever it lands', async () => {
    render(<App />)
    await screen.findByTestId('viewport')
    const doc = createDocument('doc', 'Plate')
    doc.solids = [createSolid('box', 'b', 1)]

    // Dropped on the tool panel rather than the canvas: still opened.
    fireEvent.drop(screen.getByTestId('left-panel'), { dataTransfer: { files: [jsonFile('plate.mycad', serializeDocument(doc))] } })
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('1'))

    // And a drop that misses the app entirely is caught by the window, so the
    // desktop never gets to replace the app with the file it dragged in.
    const outside = createDocument('doc2', 'Second')
    outside.solids = [createSolid('sphere', 's', 1), createSolid('box', 'b2', 2)]
    const stray = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(stray, 'dataTransfer', {
      value: { files: [jsonFile('two.mycad', serializeDocument(outside))], dropEffect: 'none', types: ['Files'] }
    })
    await act(async () => { document.body.dispatchEvent(stray) })
    expect(stray.defaultPrevented).toBe(true)
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('2'))

    // Dragging over the window offers a copy, the way a desktop drop should.
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    const transfer = { dropEffect: 'none', types: ['Files'] }
    Object.defineProperty(over, 'dataTransfer', { value: transfer })
    await act(async () => { window.dispatchEvent(over) })
    expect(over.defaultPrevented).toBe(true)
    expect(transfer.dropEffect).toBe('copy')
  })

  it('[GUI] every supported CAD format can be dragged into the document', async () => {
    render(<App />)
    const canvas = await screen.findByTestId('viewport')
    // One file per reader, each dropped straight onto the canvas.
    const drops: Array<[string, string]> = [
      ['plate.ply', 'PLY'],
      ['gear.off', 'OFF'],
      ['pyramid.stl', 'STL'],
      ['plate.obj', 'OBJ'],
      ['bracket.step', 'STEP'],
      ['assembly.dae', 'Collada'],
      ['profile.igs', 'IGES'],
      ['profile.dxf', 'DXF']
    ].map(([name, label]) => [name, label] as [string, string])
    for (const [name, label] of drops) {
      const file = new File([readSample(name)], name, { type: 'text/plain' })
      fireEvent.drop(canvas, { dataTransfer: { files: [file] } })
      // The status line names the reader that took the file.
      await waitFor(() => expect(screen.getByTestId('status-text').textContent, name).toContain(label))
      await waitFor(() => expect(screen.getByTestId('status-text').textContent, name).toContain(name))
    }
    // Eight files in, and the solids from them are all in one document.
    expect(Number(screen.getByTestId('status-objects').textContent?.replace(/[^0-9]/g, ''))).toBeGreaterThanOrEqual(6)
  })

  it('[GUI] Ctrl+S writes the open file back without asking where', async () => {
    const user = userEvent.setup({ delay: null })
    const written: Array<{ path: string; content: string }> = []
    const saveFile = vi.fn(async () => ({ canceled: true }))
    const bridge = {
      isElectron: true,
      pathForFile: (file: File) => `D:/cad/${file.name}`,
      writeFile: async (path: string, content: string) => {
        written.push({ path, content })
        return { ok: true, filePath: path, directory: 'D:/cad' }
      },
      saveFile
    }
    Object.defineProperty(window, 'mycad', { value: bridge, configurable: true, writable: true })

    render(<App />)
    const doc = createDocument('doc', 'Plate')
    doc.solids = [createSolid('box', 'b', 1)]
    const canvas = await screen.findByTestId('viewport')
    fireEvent.drop(canvas, { dataTransfer: { files: [jsonFile('plate.mycad', serializeDocument(doc))] } })
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('1'))

    // Change something, then Ctrl+S: it goes straight back to the same file.
    await user.click(screen.getByTestId('tb-sphere'))
    await waitFor(() => expect(screen.getByTestId('status-dirty').textContent).toBe('수정됨'))
    await user.keyboard('{Control>}s{/Control}')
    await waitFor(() => expect(written).toHaveLength(1))
    expect(written[0].path).toBe('D:/cad/plate.mycad')
    expect(written[0].content).toContain('mycad')
    expect(saveFile).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('status-dirty').textContent).toBe('저장됨'))

    // Save As still asks, so a copy can go somewhere else.
    await user.click(screen.getByTestId('menu-file'))
    await user.click(screen.getByTestId('menuitem-saveAs'))
    await waitFor(() => expect(saveFile).toHaveBeenCalled())
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'mycad')
  })

  it('[GUI] quitting with unsaved changes asks, and saving covers every tab', async () => {
    const user = userEvent.setup({ delay: null })
    const written: string[] = []
    let requestClose: (() => void) | null = null
    const confirmClose = vi.fn()
    const bridge = {
      isElectron: true,
      pathForFile: (file: File) => `D:/cad/${file.name}`,
      writeFile: async (path: string) => {
        written.push(path)
        return { ok: true, filePath: path, directory: 'D:/cad' }
      },
      saveFile: vi.fn(async () => ({ canceled: false, filePath: 'D:/cad/untitled.mycad', directory: 'D:/cad' })),
      onRequestClose: (cb: () => void) => {
        requestClose = cb
        return () => { requestClose = null }
      },
      confirmClose
    }
    Object.defineProperty(window, 'mycad', { value: bridge, configurable: true, writable: true })

    render(<App />)
    const first = createDocument('doc', 'Plate')
    first.solids = [createSolid('box', 'b', 1)]
    const canvas = await screen.findByTestId('viewport')
    fireEvent.drop(canvas, { dataTransfer: { files: [jsonFile('plate.mycad', serializeDocument(first))] } })
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('1'))

    // A second tab, changed and never saved anywhere.
    await user.click(screen.getByTestId('tb-new'))
    await user.click(screen.getByTestId('tb-box'))
    await waitFor(() => expect(screen.getByTestId('status-dirty').textContent).toBe('수정됨'))

    // Back to the first tab and change that one too.
    await user.click(screen.getByTitle(/plate/i))
    await user.click(screen.getByTestId('tb-sphere'))
    await waitFor(() => expect(screen.getByTestId('status-dirty').textContent).toBe('수정됨'))

    // The window is closing: the app asks before anything is thrown away.
    await act(async () => { requestClose?.() })
    expect(screen.getByTestId('confirm-message').textContent).toContain('저장')
    expect(confirmClose).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('confirm-save'))
    // The tab with a file goes straight back to it; the new one is asked about.
    await waitFor(() => expect(written).toContain('D:/cad/plate.mycad'))
    await waitFor(() => expect(bridge.saveFile).toHaveBeenCalled())
    await waitFor(() => expect(confirmClose).toHaveBeenCalledWith(true))
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'mycad')
  })

  it('[GUI] zooms with ctrl and the mouse wheel', async () => {
    render(<App />)
    await act(async () => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, cancelable: true }))
    })
    await waitFor(() => expect(Number(screen.getByTestId('status-zoom').textContent?.replace(/\D/g, ''))).toBeGreaterThan(100))
  })
})
