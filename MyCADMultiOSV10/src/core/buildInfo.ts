export const APP_NAME = 'MyCAD'
export const APP_VERSION = '1.0.0'
export const AUTHOR = 'SHKWON(knix008@naver.com)'
export const FILE_EXTENSION = 'mycad'
export const RECENT_LIMIT = 10
export const MIN_WINDOW_WIDTH = 1240
export const MIN_WINDOW_HEIGHT = 680

export const POPUP_SIZE = {
  about: { width: 460, height: 280 },
  settings: { width: 680, height: 460 },
  error: { width: 520, height: 240 },
  progress: { width: 440, height: 168 },
  confirm: { width: 460, height: 188 },
  print: { width: 680, height: 500 },
  part: { width: 520, height: 360 },
  usage: { width: 720, height: 360 }
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
