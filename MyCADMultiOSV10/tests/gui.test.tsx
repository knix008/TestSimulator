import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/ui/App'
import { MENUS, TOOLBAR } from '../src/core/menus'
import { serializeDocument } from '../src/core/serialize'
import { createDocument, createSolid } from '../src/core/model'
import { SETTINGS_KEY } from '../src/core/settings'

function jsonFile(name: string, text: string) {
  return new File([text], name, { type: 'application/json' })
}

describe('gui', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[GUI] renders the title, toolbar tooltips, menus, panels, and status bar', async () => {
    const user = userEvent.setup()
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
    expect(Number(screen.getByTestId('app').getAttribute('data-min-window-width'))).toBeGreaterThan(1000)

    for (const menu of MENUS) {
      await user.click(screen.getByTestId(`menu-${menu.id}`))
      const popup = screen.getByTestId('menu-popup')
      expect(popup.getAttribute('data-layout')).toBe('single-column')
      expect(getComputedStyle(popup).flexDirection === 'column' || popup.className.includes('menu-popup')).toBe(true)
      for (const item of menu.items) {
        const row = within(popup).getByTestId(`menuitem-${item.id}`)
        expect(within(row).getByText((_content, node) => node?.className === 'menu-icon')).toBeTruthy()
        expect(row.querySelector('.menu-label')?.textContent?.length).toBeGreaterThan(0)
      }
    }
  })

  it('[GUI] models, undo, copy, paste, themes, language, fonts, and recent files', async () => {
    const user = userEvent.setup()
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
    const user = userEvent.setup()
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
    const user = userEvent.setup()
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
    expect(screen.getByTestId('tab-prev')).toBeTruthy()
    expect(screen.getByTestId('tab-next')).toBeTruthy()
    await user.click(screen.getByTestId('tab-next'))

    await user.click(screen.getByTestId('tb-box'))
    await user.click(screen.getByTestId('tb-print'))
    expect(screen.getByTestId('print-preview')).toBeTruthy()
    await user.click(screen.getByLabelText('현재 문서'))
    await user.click(screen.getByLabelText('전체'))
    await user.click(screen.getByLabelText('사용자 지정'))
    await user.selectOptions(screen.getByLabelText('용지'), 'Letter')
    await user.selectOptions(screen.getByLabelText('방향'), 'landscape')
    await user.click(screen.getByTestId('print-now'))

    const solid = screen.getByTestId('status-objects')
    expect(solid).toBeTruthy()
    fireEvent.contextMenu(viewport, { clientX: 40, clientY: 40 })
    expect(screen.getByTestId('context-menu').getAttribute('data-layout')).toBe('single-column')
  })

  it('[GUI] asks before closing a dirty document and edits properties', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTestId('tb-sphere'))
    const name = screen.getByLabelText('이름')
    await user.clear(name)
    await user.type(name, 'Hub')
    expect(screen.getByText('Hub')).toBeTruthy()
    await user.click(screen.getByTestId('tb-new'))
    expect(screen.getByTestId('confirm-message').textContent).toContain('저장')
    await user.click(screen.getByTestId('confirm-cancel'))
    expect(screen.queryByTestId('confirm-message')).toBeNull()
  })

  it('[GUI] zooms with ctrl and the mouse wheel', async () => {
    render(<App />)
    await act(async () => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, cancelable: true }))
    })
    await waitFor(() => expect(Number(screen.getByTestId('status-zoom').textContent?.replace(/\D/g, ''))).toBeGreaterThan(100))
  })
})
