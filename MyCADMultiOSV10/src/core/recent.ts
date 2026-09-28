import { RECENT_LIMIT } from './buildInfo'
import type { RecentFile as Recent } from './settings'

export type { RecentFile } from './settings'

export function rememberRecent(list: Recent[], entry: { path: string; name: string; openedAt?: number }): Recent[] {
  const path = entry.path.trim()
  if (!path) return list.slice(0, RECENT_LIMIT)
  const next: Recent = {
    path,
    name: entry.name || path.split(/[/\\]/).pop() || path,
    openedAt: entry.openedAt ?? Date.now()
  }
  const filtered = list.filter((item) => item.path !== path)
  return [next, ...filtered].slice(0, RECENT_LIMIT)
}

export function removeRecent(list: Recent[], path: string): Recent[] {
  return list.filter((item) => item.path !== path)
}

export function clearRecent(): Recent[] {
  return []
}

export function directoryOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return ''
  return filePath.slice(0, index)
}

/**
 * Folder a dialog should open in. Each kind of dialog remembers its own folder,
 * and falls back to the nearest related one, so the first save after opening a
 * file lands next to that file instead of in the home directory.
 */
export function lastDirectory(
  dirs: { open: string; save: string; import: string; background: string },
  key: 'open' | 'save' | 'import' | 'background'
): string {
  const chain: Record<typeof key, Array<'open' | 'save' | 'import' | 'background'>> = {
    open: ['open', 'save', 'import'],
    save: ['save', 'open', 'import'],
    import: ['import', 'open', 'save'],
    background: ['background', 'open', 'save']
  }
  for (const candidate of chain[key]) {
    const value = dirs[candidate]?.trim()
    if (value) return value
  }
  return ''
}

/** Join a remembered folder and a file name into a dialog's default path. */
export function suggestedPath(directory: string, fileName: string): string {
  const dir = directory.trim().replace(/[/\\]+$/, '')
  if (!dir) return fileName
  if (!fileName) return dir
  const separator = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return `${dir}${separator}${fileName}`
}
