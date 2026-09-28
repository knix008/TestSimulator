import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { PopupHost } from '../src/ui/PopupHost'
import { POPUP_SIZE } from '../src/core/buildInfo'
import { defaultSettings } from '../src/core/settings'
import { createDocument } from '../src/core/model'
import { ErrorBoundary } from '../src/ui/ErrorBoundary'
import { errorHeadline, errorReport } from '../src/core/report'
import { serializeDocument } from '../src/core/serialize'

type SyncPayload = { settings?: unknown; shade?: string }

function mockDesktop(overrides: Record<string, unknown> = {}) {
  const openPopup = vi.fn(async () => undefined)
  const saveSettings = vi.fn(async (_settings: unknown) => undefined)
  const syncState = vi.fn((_payload: SyncPayload) => undefined)
  let sync: ((payload: SyncPayload) => void) | null = null
  Object.defineProperty(window, 'mycad', {
    configurable: true,
    value: {
      isElectron: true,
      platform: 'win32',
      openPopup,
      saveSettings,
      syncState,
      loadSettings: async () => defaultSettings(),
      listFonts: async () => ['Segoe UI', 'Consolas'],
      onSyncState: (cb: (payload: SyncPayload) => void) => {
        sync = cb
        return () => {
          sync = null
        }
      },
      ...overrides
    }
  })
  return { openPopup, saveSettings, syncState, emit: (payload: SyncPayload) => sync?.(payload) }
}

describe('settings window', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'mycad')
  })

  it('[GUI] the desktop build opens settings in its own window', async () => {
    const user = userEvent.setup({ delay: null })
    const { openPopup } = mockDesktop()
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    await waitFor(() => expect(openPopup).toHaveBeenCalled())
    const [payload] = openPopup.mock.calls[0] as unknown as Array<{ kind: string; width: number; height: number; title: string }>
    expect(payload.kind).toBe('settings')
    expect(payload.width).toBe(POPUP_SIZE.settings.width)
    expect(payload.height).toBe(POPUP_SIZE.settings.height)
    expect(payload.title).toContain('MyCAD')
    // No in-page dialog in that case.
    expect(screen.queryByTestId('settings-panel')).toBeNull()
  })

  it('[GUI] the browser build keeps the in-page dialog', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-settings'))
    expect(screen.getByTestId('settings-panel')).toBeTruthy()
  })

  it('[GUI] the settings window edits, saves and broadcasts', async () => {
    const user = userEvent.setup({ delay: null })
    const { saveSettings, syncState } = mockDesktop()
    render(<PopupHost kind="settings" />)
    const panel = await screen.findByTestId('settings-panel')
    expect(panel).toBeTruthy()
    // It paints itself with the theme, since it has no app shell behind it.
    const host = panel.closest('.popup-window') as HTMLElement
    expect(host).toBeTruthy()
    expect(host.style.getPropertyValue('--bg')).toMatch(/^#[0-9a-f]{6}$/i)

    await user.click(screen.getByTestId('settings-tab-viewport'))
    await user.click(screen.getByLabelText('그리드'))
    await waitFor(() => expect(saveSettings).toHaveBeenCalled())
    const saved = saveSettings.mock.calls.at(-1)?.[0] as ReturnType<typeof defaultSettings>
    expect(saved.grid).toBe(false)
    expect(syncState).toHaveBeenCalledWith({ settings: expect.objectContaining({ grid: false }) })
  })

  it('[GUI] the main window follows what the settings window sends', async () => {
    const { emit } = mockDesktop()
    render(<App />)
    const app = screen.getByTestId('app')
    await waitFor(() => expect(app.getAttribute('data-theme')).toBe('dark'))
    act(() => emit({ settings: { ...defaultSettings(), theme: 'mint', snap: 25 } }))
    await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-theme')).toBe('mint'))
    expect(screen.getByTestId('status-snap').textContent).toContain('25')
    act(() => emit({ shade: 'wireframe' }))
    await waitFor(() => expect(screen.getByTestId('status-style').textContent).toContain('와이어'))
  })
})

describe('remembered folders', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'mycad')
  })

  it('[File] open and save start where the last file was worked on', async () => {
    const user = userEvent.setup({ delay: null })
    const openFile = vi.fn(async (_opts: { defaultPath?: string }) => ({
      canceled: false,
      filePath: 'D:/cad/projects/part.mycad',
      content: serializeDocument(createDocument('doc-1', 'part')),
      directory: 'D:/cad/projects'
    }))
    const saveFile = vi.fn(async (_opts: { defaultPath?: string }) => ({
      canceled: false,
      filePath: 'D:/cad/projects/part.mycad',
      directory: 'D:/cad/projects'
    }))
    mockDesktop({ openFile, saveFile })
    render(<App />)

    // Nothing remembered yet: the dialog opens wherever the system wants.
    await user.click(screen.getByTestId('menu-file'))
    await user.click(screen.getByTestId('menuitem-open'))
    await waitFor(() => expect(openFile).toHaveBeenCalled())
    expect(openFile.mock.calls[0][0].defaultPath).toBe('')
    await waitFor(() => expect(screen.getByTestId('status-doc').textContent).toContain('part'))

    // After that open, saving starts in the folder the file came from, with
    // the document's own name filled in.
    await user.click(screen.getByTestId('menu-file'))
    await user.click(screen.getByTestId('menuitem-saveAs'))
    await waitFor(() => expect(saveFile).toHaveBeenCalled())
    expect(saveFile.mock.calls[0][0].defaultPath).toBe('D:/cad/projects/part.mycad')

    // And the next open starts there too.
    await user.click(screen.getByTestId('menu-file'))
    await user.click(screen.getByTestId('menuitem-open'))
    await waitFor(() => expect(openFile).toHaveBeenCalledTimes(2))
    expect(openFile.mock.calls[1][0].defaultPath).toBe('D:/cad/projects')
    // Let that second open finish, so nothing is still running at teardown.
    await waitFor(() => expect(screen.getByTestId('status-doc').textContent).toContain('part'))
  })
})

describe('recent files in the File menu', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'mycad')
  })

  it('[Recent] the menu opens, removes and clears them', async () => {
    const user = userEvent.setup({ delay: null })
    const content = serializeDocument(createDocument('doc-9', 'hub'))
    const readPath = vi.fn(async (path: string) => ({ ok: true, content, filePath: path }))
    const openFile = vi.fn(async () => ({
      canceled: false,
      filePath: 'D:/cad/projects/hub.mycad',
      content,
      directory: 'D:/cad/projects'
    }))
    mockDesktop({ readPath, openFile })
    render(<App />)

    const fileMenu = async () => {
      await user.click(screen.getByTestId('menu-file'))
      return screen.findByTestId('menu-popup')
    }

    // Open a file so the list has something in it.
    await fileMenu()
    await user.click(screen.getByTestId('menuitem-open'))
    await waitFor(() => expect(screen.getByTestId('status-doc').textContent).toContain('hub'))
    await waitFor(() => expect(screen.queryByTestId('popup-progress')).toBeNull())

    // It is listed in the File menu, and opening it reads that very path.
    await fileMenu()
    const entry = screen.getAllByTestId(/^recent-(?!remove|clear)/)[0]
    expect(entry.getAttribute('title')).toBe('D:/cad/projects/hub.mycad')
    await user.click(entry)
    await waitFor(() => expect(readPath).toHaveBeenCalledWith('D:/cad/projects/hub.mycad'))
    await waitFor(() => expect(screen.queryByTestId('popup-progress')).toBeNull())

    // One entry can be dropped on its own.
    await fileMenu()
    const remove = screen.getAllByTestId(/^recent-remove-/)
    expect(remove).toHaveLength(1)
    await user.click(remove[0])
    expect(screen.queryAllByTestId(/^recent-remove-/)).toHaveLength(0)

    // And the whole list can be cleared.
    await user.click(screen.getByTestId('menuitem-open'))
    await waitFor(() => expect(openFile).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('popup-progress')).toBeNull())
    await fileMenu()
    await user.click(screen.getByTestId('recent-clear'))
    await fileMenu()
    expect(screen.queryAllByTestId(/^recent-remove-/)).toHaveLength(0)
    expect(screen.queryByTestId('recent-clear')).toBeNull()
  })
})

describe('error reporting', () => {
  it('[GUI] a failed render shows a copyable report instead of a blank window', async () => {
    const user = userEvent.setup({ delay: null })
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const Boom = () => {
      throw new Error('kernel went bang')
    }
    // React logs the caught error; the test is about what the user sees.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ErrorBoundary source="test" platform="win32">
        <Boom />
      </ErrorBoundary>
    )
    const report = screen.getByTestId('crash-report').textContent ?? ''
    expect(report).toContain('kernel went bang')
    expect(report).toContain('source    test')
    expect(report).toContain('platform  win32')
    expect(report).toContain('MyCAD 1.0.0')
    await user.click(screen.getByTestId('crash-copy'))
    expect(writeText).toHaveBeenCalledWith(report)
    quiet.mockRestore()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('[GUI] the report carries the build, the document and the stack', () => {
    const error = new Error('no solid selected')
    const text = errorReport(error, {
      source: 'command:pad',
      platform: 'linux',
      details: { document: 'Bracket', workbench: 'partDesign', solids: 3 }
    })
    expect(text.split('\n')[0]).toContain('MyCAD 1.0.0')
    expect(text).toContain('message   no solid selected')
    expect(text).toContain('source    command:pad')
    expect(text).toContain('document  Bracket')
    expect(text).toContain('workbench partDesign')
    expect(text).toContain('solids    3')
    expect(text).toContain('Error: no solid selected')
    expect(errorHeadline(error)).toBe('no solid selected')
    expect(errorHeadline('a'.repeat(300))).toHaveLength(120)
  })
})
