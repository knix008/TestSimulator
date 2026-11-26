/**
 * The theme menu window (thememenu.html, Tauri window "thememenu"): a window of its own so it
 * can reach past the main window's edge; Rust keeps it on the screen. On top: the custom
 * theme and "Edit custom theme…"; under them two columns, 20 Dark and 20 Light. A pick is
 * written to the shared settings (localStorage): every window switches at once through the
 * `storage` event. It closes when it loses focus, on Escape or after a pick.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { translate, type Locale, type MessageKey } from '../i18n/messages'
import { THEME_NAMES_EN, THEME_NAMES_KO } from '../theme/themeNames'
import { applyTheme, CUSTOM_ID, loadThemeId, saveThemeId, themeById, themesByMode } from '../theme/themes'
import { Icons } from '../Toolbar'

function locale(): Locale {
  try {
    return localStorage.getItem('isomaker.locale') === 'en' ? 'en' : 'ko'
  } catch {
    return 'ko'
  }
}

export function ThemeMenuWindow() {
  const [lang, setLang] = useState<Locale>(locale)
  const [themeId, setThemeId] = useState(loadThemeId)
  const [, bump] = useState(0)
  const t = useCallback((k: MessageKey) => translate(lang, k), [lang])
  const names = (lang === 'ko' ? THEME_NAMES_KO : THEME_NAMES_EN) as Record<string, string>
  const box = useRef<HTMLDivElement>(null)

  const hide = () => void invoke('hide_theme_menu').catch(() => {})

  useEffect(() => {
    applyTheme(loadThemeId())
    const sync = () => {
      setThemeId(loadThemeId())
      setLang(locale())
      applyTheme(loadThemeId())
      bump((n) => n + 1)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('blur', hide)
    window.addEventListener('keydown', key)
    const off = listen('theme-menu-shown', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', hide)
      window.removeEventListener('keydown', key)
      void off.then((f) => f())
    }
  }, [])

  // The window is sized to the menu once the fonts are in (a size read too early is zero).
  useLayoutEffect(() => {
    const fit = () => {
      const r = box.current?.getBoundingClientRect()
      if (r && r.width > 0) void invoke('fit_theme_menu', { width: Math.ceil(r.width), height: Math.ceil(r.height) }).catch(() => {})
    }
    void document.fonts.ready.then(fit)
    fit()
  }, [lang])

  const pick = (id: string) => {
    saveThemeId(id)
    setThemeId(id)
    applyTheme(id)
    hide()
  }

  const item = (id: string, label: string, bars: string[]) => (
    <button
      key={id}
      type="button"
      role="menuitemradio"
      aria-checked={themeId === id}
      className={`ctx-menu-item${themeId === id ? ' on' : ''}`}
      data-theme-pick={id}
      onClick={() => pick(id)}
    >
      <span className="theme-swatch-mini" aria-hidden="true">
        {bars.map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
      </span>
      <span className="theme-v-name">{label}</span>
      {themeId === id ? (
        <span className="theme-v-check" aria-hidden="true">
          ✓
        </span>
      ) : null}
    </button>
  )

  const custom = themeById(CUSTOM_ID) as { bars: string[] }
  return (
    <div className="ctx-menu theme-menu-win" role="menu" ref={box}>
      <div className="theme-win-top">
        {item(CUSTOM_ID, t('themeCustom'), custom.bars)}
        <button type="button" role="menuitem" className="ctx-menu-item" data-testid="theme-customize" onClick={() => void invoke('theme_menu_customize').catch(() => {})}>
          <span className="ctx-menu-icon" aria-hidden="true">
            {Icons.settings}
          </span>
          <span className="theme-v-name">{t('themeCustomEdit')}</span>
        </button>
      </div>
      <div className="ctx-menu-sep" role="separator" />
      <div className="theme-win-cols">
        {(['dark', 'light'] as const).map((mode) => (
          <div key={mode} className="theme-win-col" data-theme-group={mode}>
            <div className="theme-v-head">{mode === 'dark' ? t('themeGroupDark') : t('themeGroupLight')}</div>
            {themesByMode(mode).map((th: { id: string; bars: string[] }) => item(th.id, names[th.id] ?? th.id, th.bars))}
          </div>
        ))}
      </div>
    </div>
  )
}
