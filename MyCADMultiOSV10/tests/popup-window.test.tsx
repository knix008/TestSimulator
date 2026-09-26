import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { PopupHost } from '../src/ui/PopupHost'
import { POPUP_SIZE } from '../src/core/buildInfo'
import { defaultSettings } from '../src/core/settings'

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
    emit({ settings: { ...defaultSettings(), theme: 'mint', snap: 25 } })
    await waitFor(() => expect(screen.getByTestId('app').getAttribute('data-theme')).toBe('mint'))
    expect(screen.getByTestId('status-snap').textContent).toContain('25')
    emit({ shade: 'wireframe' })
    await waitFor(() => expect(screen.getByTestId('status-style').textContent).toContain('와이어'))
  })
})
