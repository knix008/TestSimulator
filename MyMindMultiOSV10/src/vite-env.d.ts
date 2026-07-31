/// <reference types="vite/client" />

import type { MyMindApi } from '../electron/preload'

declare global {
  interface Window {
    mymind?: MyMindApi
  }
}

export {}
