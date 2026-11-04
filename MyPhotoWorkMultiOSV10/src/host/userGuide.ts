import { getTheme } from '../themes'

/**
 * The user guide is doc/index.html, a plain page with no part in the React app. It
 * learns the app's look and language from one localStorage key, which is shared by
 * every window of the origin, and whose `storage` event reaches an open guide at once.
 */
export const GUIDE_APPEARANCE_KEY = 'mpw-doc-appearance'

export function guideAppearance(themeId: string, language: string) {
  const theme = getTheme(themeId)
  return { vars: theme.vars, mode: theme.kind, language }
}

export function publishGuideAppearance(themeId: string, language: string) {
  try {
    window.localStorage.setItem(GUIDE_APPEARANCE_KEY, JSON.stringify(guideAppearance(themeId, language)))
  } catch { /* private mode: the guide keeps its own colours */ }
}

/** A window of its own on the desktop, a new tab in a browser. */
export async function openUserGuide(language: string) {
  if (window.hostGuideApi) {
    await window.hostGuideApi.open(language)
    return
  }
  window.open(`./doc/index.html?lang=${language === 'en' ? 'en' : 'ko'}`, 'mpw-guide')
}
