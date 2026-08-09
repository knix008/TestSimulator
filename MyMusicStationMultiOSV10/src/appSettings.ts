export type Language = 'ko' | 'en'

export type AppSettings = {
  language: Language
  themeId: string
  useSystemTray: boolean
  rememberVolume: boolean
  volume: number
  showSpectrum: boolean
  reopenLastFolderOnStart: boolean
}

export const appSettingsKey = 'myMusicStation.appSettings'

export const defaultAppSettings: AppSettings = {
  language: 'ko',
  themeId: 'dark',
  useSystemTray: true,
  rememberVolume: true,
  volume: 0.82,
  showSpectrum: true,
  reopenLastFolderOnStart: false,
}

const isLanguage = (value: unknown): value is Language => value === 'ko' || value === 'en'

export const loadAppSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(appSettingsKey)

    if (!raw) {
      return { ...defaultAppSettings }
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const volume = typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : defaultAppSettings.volume

    return {
      language: isLanguage(parsed.language) ? parsed.language : defaultAppSettings.language,
      themeId: typeof parsed.themeId === 'string' && parsed.themeId ? parsed.themeId : defaultAppSettings.themeId,
      useSystemTray: typeof parsed.useSystemTray === 'boolean' ? parsed.useSystemTray : defaultAppSettings.useSystemTray,
      rememberVolume: typeof parsed.rememberVolume === 'boolean' ? parsed.rememberVolume : defaultAppSettings.rememberVolume,
      volume,
      showSpectrum: typeof parsed.showSpectrum === 'boolean' ? parsed.showSpectrum : defaultAppSettings.showSpectrum,
      reopenLastFolderOnStart:
        typeof parsed.reopenLastFolderOnStart === 'boolean'
          ? parsed.reopenLastFolderOnStart
          : defaultAppSettings.reopenLastFolderOnStart,
    }
  } catch {
    return { ...defaultAppSettings }
  }
}

export const saveAppSettings = (settings: AppSettings) => {
  localStorage.setItem(appSettingsKey, JSON.stringify(settings))
}
