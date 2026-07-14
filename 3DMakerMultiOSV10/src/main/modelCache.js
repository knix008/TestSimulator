import { app, ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

function cacheRoot() {
  return join(app.getPath('userData'), 'hf-model-cache')
}

function keyToPath(key) {
  const hash = createHash('sha256').update(String(key)).digest('hex')
  return join(cacheRoot(), hash.slice(0, 2), `${hash}.bin`)
}

function countCachedFiles(dir, stats = { files: 0, bytes: 0 }) {
  if (!existsSync(dir)) return stats
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) countCachedFiles(full, stats)
    else {
      stats.files += 1
      stats.bytes += st.size
    }
  }
  return stats
}

export function registerModelCacheIpc() {
  mkdirSync(cacheRoot(), { recursive: true })

  ipcMain.handle('model-cache:match', (_event, key) => {
    const path = keyToPath(key)
    if (!existsSync(path)) return null
    return readFileSync(path)
  })

  ipcMain.handle('model-cache:put', (_event, key, data) => {
    const path = keyToPath(key)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, Buffer.from(data))
    return true
  })

  ipcMain.handle('model-cache:info', () => {
    const stats = countCachedFiles(cacheRoot())
    return {
      dir: cacheRoot(),
      fileCount: stats.files,
      bytes: stats.bytes
    }
  })
}
