import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyTheme,
  CUSTOM_ID,
  loadCustomTheme,
  loadThemeId,
  nextThemeId,
  preferredThemeForMode,
  saveCustomTheme,
  saveThemeId,
  themeMode,
} from '../theme/themes'
import { THEME_NAMES_EN, THEME_NAMES_KO } from '../theme/themeNames'
import {
  loadLocale,
  STORAGE_LOCALE,
  translate,
  type Locale,
  type MessageKey,
  type Theme,
} from './messages'

export type CustomColors = { bg: string; panel: string; text: string; accent: string }

type PreferencesContextValue = {
  locale: Locale
  /** Brightness of the current theme. */
  theme: Theme
  /** One of the 40 themes or 'custom'. */
  themeId: string
  customColors: CustomColors
  setLocale: (locale: Locale) => void
  /** Switches to the remembered theme of that brightness. */
  setTheme: (theme: Theme) => void
  setThemeId: (id: string) => void
  /** Theme button: the next theme of the same family. */
  cycleTheme: () => void
  setCustomColors: (colors: CustomColors) => void
  themeName: (id: string) => string
  t: (key: MessageKey, ...args: string[]) => string
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale())
  const [themeId, setThemeIdState] = useState<string>(() => loadThemeId())
  const [customColors, setCustomState] = useState<CustomColors>(() => loadCustomTheme())
  const theme = themeMode(themeId) as Theme

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_LOCALE, next)
    void window.isoMaker?.setLocale?.(next)
  }, [])

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id)
    saveThemeId(id)
  }, [])

  const setTheme = useCallback(
    (mode: Theme) => setThemeId(preferredThemeForMode(mode)),
    [setThemeId],
  )

  const cycleTheme = useCallback(() => {
    setThemeIdState((cur) => {
      const next = cur === CUSTOM_ID ? preferredThemeForMode(themeMode(cur)) : nextThemeId(cur)
      saveThemeId(next)
      return next
    })
  }, [])

  const setCustomColors = useCallback((colors: CustomColors) => {
    saveCustomTheme(colors)
    setCustomState(colors)
  }, [])

  useEffect(() => {
    applyTheme(themeId)
  }, [themeId, customColors])

  // Another window (the theme menu) changed the shared settings: follow at once.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'isomaker.themeId') setThemeIdState(loadThemeId())
      if (!e.key || e.key === 'isomaker.customTheme') setCustomState(loadCustomTheme())
      if (!e.key || e.key === STORAGE_LOCALE) setLocaleState(loadLocale())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'ko' ? 'ko' : 'en'
    void window.isoMaker?.setLocale?.(locale)
  }, [locale])

  useEffect(() => {
    const api = window.isoMaker
    if (!api?.onPrefs) return
    return api.onPrefs((prefs) => {
      if (prefs.locale === 'ko' || prefs.locale === 'en') setLocale(prefs.locale)
      if (prefs.theme === 'light' || prefs.theme === 'dark') setTheme(prefs.theme)
    })
  }, [setLocale, setTheme])

  const t = useCallback((key: MessageKey, ...args: string[]) => translate(locale, key, ...args), [locale])

  const themeName = useCallback(
    (id: string) => {
      const table = (locale === 'ko' ? THEME_NAMES_KO : THEME_NAMES_EN) as Record<string, string>
      if (id === CUSTOM_ID) return t('themeCustom')
      return table[id] ?? id
    },
    [locale, t],
  )

  const value = useMemo(
    () => ({
      locale,
      theme,
      themeId,
      customColors,
      setLocale,
      setTheme,
      setThemeId,
      cycleTheme,
      setCustomColors,
      themeName,
      t,
    }),
    [locale, theme, themeId, customColors, setLocale, setTheme, setThemeId, cycleTheme, setCustomColors, themeName, t],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePrefs(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('PreferencesProvider missing')
  return ctx
}
