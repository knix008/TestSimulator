/** Recent images on the start screen (this computer only, newest first). */
const KEY = 'isomaker.recentImages'
const MAX = 10

export type RecentImage = { path: string; at: number }

export function loadRecent(): RecentImage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((r) => r && typeof r.path === 'string' && r.path)
      .map((r) => ({ path: String(r.path), at: Number(r.at) || 0 }))
      .slice(0, MAX)
  } catch {
    return []
  }
}

function save(list: RecentImage[]): RecentImage[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* no storage */
  }
  return list
}

const same = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()

export function addRecent(path: string): RecentImage[] {
  const rest = loadRecent().filter((r) => !same(r.path, path))
  return save([{ path, at: Date.now() }, ...rest].slice(0, MAX))
}

export function removeRecent(path: string): RecentImage[] {
  return save(loadRecent().filter((r) => !same(r.path, path)))
}

export function clearRecent(): RecentImage[] {
  return save([])
}

const SHOW_KEY = 'isomaker.showStartOnLaunch'

export function loadShowOnStart(): boolean {
  try {
    return localStorage.getItem(SHOW_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveShowOnStart(on: boolean): void {
  try {
    localStorage.setItem(SHOW_KEY, on ? '1' : '0')
  } catch {
    /* no storage */
  }
}
