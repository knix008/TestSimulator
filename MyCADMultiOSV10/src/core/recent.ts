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
