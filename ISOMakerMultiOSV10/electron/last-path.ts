import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

type Store = {
  lastDirectory: string | null
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'isomaker-paths.json')
}

function readStore(): Store {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as Store
    return {
      lastDirectory:
        typeof parsed.lastDirectory === 'string' && parsed.lastDirectory
          ? parsed.lastDirectory
          : null,
    }
  } catch {
    return { lastDirectory: null }
  }
}

function writeStore(store: Store): void {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true })
    fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf8')
  } catch {
    /* ignore persistence errors */
  }
}

export function getLastDirectory(): string | null {
  const dir = readStore().lastDirectory
  if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir
  return null
}

/** Remember directory from a file or folder path the user just chose. */
export function rememberPath(selectedPath: string): void {
  try {
    const stat = fs.statSync(selectedPath)
    const dir = stat.isDirectory() ? selectedPath : path.dirname(selectedPath)
    if (dir && fs.existsSync(dir)) {
      writeStore({ lastDirectory: dir })
    }
  } catch {
    /* ignore */
  }
}

/**
 * Resolve dialog defaultPath:
 * 1) directory of hintPath if it exists
 * 2) last remembered directory
 * 3) for save: join with fileName when only a bare name is given
 */
export function dialogDefaultPath(hintPath?: string | null, fileName?: string): string | undefined {
  const fromHint = directoryFromHint(hintPath)
  const last = getLastDirectory()
  const base = fromHint ?? last

  if (fileName) {
    if (base) return path.join(base, path.basename(fileName))
    return fileName
  }
  return base ?? undefined
}

function directoryFromHint(hintPath?: string | null): string | null {
  if (!hintPath) return null
  try {
    if (fs.existsSync(hintPath)) {
      const stat = fs.statSync(hintPath)
      const dir = stat.isDirectory() ? hintPath : path.dirname(hintPath)
      return fs.existsSync(dir) ? dir : null
    }
    // Path typed but not yet created — use parent if present
    const parent = path.dirname(hintPath)
    if (parent && parent !== hintPath && fs.existsSync(parent)) return parent
  } catch {
    /* ignore */
  }
  return null
}
