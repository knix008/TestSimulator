import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

/** Candidate roots for assets / vendor files (dev + packaged). */
export function resourceRoots(): string[] {
  const roots: string[] = []
  if (app?.isPackaged && process.resourcesPath) {
    roots.push(process.resourcesPath)
  }
  roots.push(process.cwd())
  roots.push(path.join(moduleDir, '..'))
  roots.push(path.join(moduleDir, '..', '..'))
  return [...new Set(roots)]
}

export function resolveResource(...parts: string[]): string | null {
  for (const root of resourceRoots()) {
    const candidate = path.join(root, ...parts)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}
