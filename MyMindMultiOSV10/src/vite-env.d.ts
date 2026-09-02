/// <reference types="vite/client" />

import type { MyMindApi } from '../electron/preload'

declare global {
  interface Window {
    mymind?: MyMindApi
  }
  /** App version, injected from package.json at build time (see vite.config.ts). */
  const __APP_VERSION__: string
  /** ISO timestamp of the build, injected at build time (see vite.config.ts). */
  const __BUILD_DATE__: string
}

export {}
