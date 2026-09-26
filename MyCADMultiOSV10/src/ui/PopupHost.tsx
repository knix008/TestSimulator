import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildInfo } from '../core/buildInfo'
import { AboutDialog, SettingsDialog } from './dialogs'
import { browserStorage, fontCss, sanitizeSettings, type Settings } from '../core/settings'
import { resolveTheme, themeVars } from '../core/themes'
import { translate, type MessageKey } from '../core/i18n'
import { detectBrowserFonts } from '../core/fonts'
import type { ShadeMode } from '../core/model'

/**
 * What a popup window renders. The window is its own renderer process, so it
 * loads the settings from disk itself and sends every change back through the
 * main process; the main window applies them as they arrive.
 */
export function PopupHost({ kind }: { kind: string }) {
  const info = buildInfo(window.mycad?.platform || 'web')
  if (kind === 'settings') return <SettingsWindow />
  return <AboutDialog platform={info.platform} onClose={() => window.close()} />
}

function SettingsWindow() {
  const store = useMemo(() => browserStorage(), [])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [shade, setShade] = useState<ShadeMode>('shaded')
  const [fonts, setFonts] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const loaded = sanitizeSettings(await store.load())
      if (alive) setSettings(loaded)
      const listed = window.mycad?.listFonts ? await window.mycad.listFonts() : await detectBrowserFonts()
      if (alive) setFonts(listed)
    })()
    return () => {
      alive = false
    }
  }, [store])

  // The main window sends its own changes here, so the two stay in step.
  useEffect(() => {
    return window.mycad?.onSyncState?.((payload) => {
      if (payload.settings) setSettings(sanitizeSettings(payload.settings))
      if (payload.shade) setShade(payload.shade as ShadeMode)
    })
  }, [])

  const t = useCallback(
    (key: MessageKey | string) => translate(settings?.language ?? 'ko', key),
    [settings?.language]
  )

  const apply = useCallback((next: Settings) => {
    setSettings(next)
    void store.save(next)
    window.mycad?.syncState?.({ settings: next })
  }, [store])

  useEffect(() => {
    if (!settings) return
    document.title = `${translate(settings.language, 'settings')} · MyCAD`
    // This window has no app shell behind it, so the page itself takes the
    // theme's surface colour and colour scheme.
    const palette = resolveTheme(settings.theme, settings.customTheme)
    document.body.style.background = palette.colors.panel
    document.body.style.color = palette.colors.text
    document.documentElement.style.colorScheme = palette.mode
  }, [settings])

  if (!settings) return null

  const theme = resolveTheme(settings.theme, settings.customTheme)
  const font = fontCss(settings.fontStyle)

  return (
    <div
      className="app popup-window"
      data-theme={settings.theme}
      data-theme-mode={theme.mode}
      style={{
        ...themeVars(theme),
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        fontWeight: font.fontWeight,
        fontStyle: font.fontStyle
      } as React.CSSProperties}
    >
      <SettingsDialog
        settings={settings}
        fonts={fonts}
        t={t}
        shade={shade}
        onShade={(next) => {
          setShade(next)
          window.mycad?.syncState?.({ shade: next })
        }}
        onChange={(patch) => apply({ ...settings, ...patch })}
        onRemoveRecent={(path) => apply({ ...settings, recentFiles: settings.recentFiles.filter((file) => file.path !== path) })}
        onClearRecent={() => apply({ ...settings, recentFiles: [] })}
        onPickBackground={(file) => {
          const reader = new FileReader()
          reader.onload = () => apply({ ...settings, backgroundImage: String(reader.result) })
          reader.readAsDataURL(file)
        }}
        onClose={() => window.close()}
      />
    </div>
  )
}
