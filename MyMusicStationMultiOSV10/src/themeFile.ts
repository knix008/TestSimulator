import type { ThemeDefinition } from './themes'

export const themeFileFormat = 'my-music-station-theme'
export const themeFileExtension = 'json'

export type ThemeFile = {
  format: typeof themeFileFormat
  version: 1
  theme: {
    name: string
    vars: Record<string, string>
  }
}

export const themeVarKeys = [
  '--font-ui',
  '--bg',
  '--toolbar',
  '--panel',
  '--control',
  '--tooltip',
  '--text',
  '--text-strong',
  '--muted',
  '--line',
  '--line-strong',
  '--grid',
  '--primary',
  '--primary-soft',
  '--primary-text',
  '--active',
  '--spectrum',
  '--shadow',
] as const

export const captureThemeVars = (element: Element = document.documentElement): Record<string, string> => {
  const styles = getComputedStyle(element)
  const vars: Record<string, string> = {}

  for (const key of themeVarKeys) {
    const value = styles.getPropertyValue(key).trim()

    if (value) {
      vars[key] = value
    }
  }

  return vars
}

export const buildThemeFile = (name: string, vars: Record<string, string>): ThemeFile => ({
  format: themeFileFormat,
  version: 1,
  theme: {
    name: name.trim() || 'Custom Theme',
    vars,
  },
})

export const serializeThemeFile = (themeFile: ThemeFile) => `${JSON.stringify(themeFile, null, 2)}\n`

export const parseThemeFile = (raw: string): ThemeFile => {
  const parsed = JSON.parse(raw) as Partial<ThemeFile>

  if (parsed.format !== themeFileFormat) {
    throw new Error('invalid theme format')
  }

  if (parsed.version !== 1) {
    throw new Error('unsupported theme version')
  }

  const name = typeof parsed.theme?.name === 'string' ? parsed.theme.name.trim() : ''
  const vars = parsed.theme?.vars

  if (!name || !vars || typeof vars !== 'object' || Array.isArray(vars)) {
    throw new Error('invalid theme contents')
  }

  const normalizedVars: Record<string, string> = {}

  for (const [key, value] of Object.entries(vars)) {
    if (typeof key === 'string' && key.startsWith('--') && typeof value === 'string' && value.trim()) {
      normalizedVars[key] = value.trim()
    }
  }

  if (!Object.keys(normalizedVars).length) {
    throw new Error('theme has no variables')
  }

  return buildThemeFile(name, normalizedVars)
}

export const themeFileToDefinition = (themeFile: ThemeFile, id = `custom-${Date.now()}`): ThemeDefinition => ({
  id,
  name: themeFile.theme.name,
  builtIn: false,
  vars: themeFile.theme.vars,
})
