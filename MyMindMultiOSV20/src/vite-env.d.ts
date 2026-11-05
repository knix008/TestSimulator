/// <reference types="vite/client" />

declare global {
  /** App version, injected from package.json at build time (see vite.config.ts). */
  const __APP_VERSION__: string
  /** When and from which commit this was built (see vite.config.ts). */
  const __BUILD_INFO__: { date: string; commit: string }
}

export {}
