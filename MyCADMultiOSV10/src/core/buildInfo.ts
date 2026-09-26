export const APP_NAME = 'MyCAD'
export const APP_VERSION = '1.0.0'
export const AUTHOR = 'shkwon(knix008@naver.com)'
export const FILE_EXTENSION = 'mycad'
/** Opened by Help > Homepage. */
export const PROJECT_URL = 'https://github.com/knix008/MyCAD'
export const RECENT_LIMIT = 10
/** Toolbar geometry, in CSS pixels; the window may never be narrower. */
export const TOOLBAR_BUTTON_WIDTH = 30
export const TOOLBAR_GAP = 2
export const TOOLBAR_SEPARATOR = 7
export const TOOLBAR_EDGE_PADDING = 16

/**
 * Narrowest window that still shows every toolbar button, the separators
 * between the groups and the right-aligned language, settings and about
 * buttons.
 */
export function toolbarMinWidth(groups: readonly (readonly string[])[], rightButtons = 3): number {
  const buttons = groups.reduce((acc, group) => acc + group.length, 0) + rightButtons
  const separators = Math.max(0, groups.length - 1) + 1
  return Math.ceil(
    buttons * (TOOLBAR_BUTTON_WIDTH + TOOLBAR_GAP) +
    separators * TOOLBAR_SEPARATOR +
    TOOLBAR_EDGE_PADDING
  )
}

export const MIN_WINDOW_WIDTH = 1240
export const MIN_WINDOW_HEIGHT = 760

export const POPUP_SIZE = {
  about: { width: 560, height: 400 },
  settings: { width: 1040, height: 700 },
  error: { width: 720, height: 460 },
  progress: { width: 440, height: 168 },
  confirm: { width: 460, height: 188 },
  print: { width: 860, height: 580 },
  part: { width: 520, height: 360 },
  usage: { width: 720, height: 360 },
  report: { width: 640, height: 420 },
  export: { width: 660, height: 580 }
} as const

export interface BuildInfo {
  name: string
  version: string
  author: string
  buildDate: string
  platform: string
}

export function buildInfo(platform = 'web'): BuildInfo {
  return {
    name: __APP_NAME__ || APP_NAME,
    version: __APP_VERSION__ || APP_VERSION,
    author: __AUTHOR__ || AUTHOR,
    buildDate: __BUILD_DATE__,
    platform
  }
}

export function windowTitle(version = APP_VERSION): string {
  return `${APP_NAME} ${version}`
}
