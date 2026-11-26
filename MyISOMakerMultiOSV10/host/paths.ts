import fs from 'node:fs'
import path from 'node:path'

/**
 * Candidate roots for assets / vendor files.
 * The Tauri program passes its resource folder in ISOMAKER_RESOURCE_DIR
 * (installed: <install>/vendor/xorriso …); a test run falls back to the project.
 */
export function resourceRoots(): string[] {
  const roots: string[] = []
  const fromApp = process.env.ISOMAKER_RESOURCE_DIR
  if (fromApp) roots.push(fromApp)
  const project = process.env.ISOMAKER_PROJECT_DIR
  if (project) roots.push(project)
  roots.push(process.cwd())
  return [...new Set(roots)]
}

export function resolveResource(...parts: string[]): string | null {
  for (const root of resourceRoots()) {
    const candidate = path.join(root, ...parts)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Where the program keeps its own files (same folder the Electron build used). */
export function userDataDir(): string {
  const fromApp = process.env.ISOMAKER_USER_DATA
  if (fromApp) return fromApp
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(process.env.HOME || '.', 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '.', '.config')
  return path.join(base, 'MyISOMaker')
}
