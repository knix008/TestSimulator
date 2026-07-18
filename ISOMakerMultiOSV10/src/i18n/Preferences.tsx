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
  loadLocale,
  loadTheme,
  STORAGE_LOCALE,
  STORAGE_THEME,
  translate,
  type Locale,
  type MessageKey,
  type Theme,
} from './messages'

type PreferencesContextValue = {
  locale: Locale
  theme: Theme
  setLocale: (locale: Locale) => void
  setTheme: (theme: Theme) => void
  t: (key: MessageKey, ...args: string[]) => string
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale())
  const [theme, setThemeState] = useState<Theme>(() => loadTheme())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_LOCALE, next)
    void window.isoMaker?.setLocale?.(next)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    localStorage.setItem(STORAGE_THEME, next)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = locale === 'ko' ? 'ko' : 'en'
    document.documentElement.style.colorScheme = theme
  }, [theme, locale])

  useEffect(() => {
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

  const value = useMemo(
    () => ({ locale, theme, setLocale, setTheme, t }),
    [locale, theme, setLocale, setTheme, t],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePrefs(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('PreferencesProvider missing')
  return ctx
}
