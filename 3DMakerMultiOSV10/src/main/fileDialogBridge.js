import { app, dialog, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

const FILE_DIALOG_CONFIG_FILE = 'file-dialog.json'

function configPath() {
  return join(app.getPath('userData'), FILE_DIALOG_CONFIG_FILE)
}

function normalizeDir(pathValue) {
  const text = String(pathValue || '').trim()
  if (!text) return ''
  return existsSync(text) ? text : ''
}

async function readDialogConfig() {
  const path = configPath()
  if (!existsSync(path)) {
    return { lastImageDir: '', lastModelDir: '' }
  }

  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      lastImageDir: normalizeDir(parsed?.lastImageDir),
      lastModelDir: normalizeDir(parsed?.lastModelDir)
    }
  } catch {
    return { lastImageDir: '', lastModelDir: '' }
  }
}

async function writeDialogConfig(nextConfig) {
  const safe = {
    lastImageDir: normalizeDir(nextConfig?.lastImageDir),
    lastModelDir: normalizeDir(nextConfig?.lastModelDir)
  }
  await writeFile(configPath(), JSON.stringify(safe, null, 2), 'utf8')
  return safe
}

function pickImageMime(pathValue) {
  const ext = extname(pathValue).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.webp') return 'image/webp'
  return ''
}

async function readPathAsPayload(pathValue) {
  const data = await readFile(pathValue)
  return {
    path: pathValue,
    name: basename(pathValue),
    mime: pickImageMime(pathValue),
    data: new Uint8Array(data)
  }
}

export function registerFileDialogBridge() {
  ipcMain.handle('file-dialog:open-image', async () => {
    const cfg = await readDialogConfig()
    const defaultPath =
      cfg.lastImageDir || cfg.lastModelDir || app.getPath('pictures') || app.getPath('documents')

    const result = await dialog.showOpenDialog({
      title: 'Select Image',
      defaultPath,
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'avif', 'webp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true, files: [] }
    }

    const selected = result.filePaths[0]
    const files = [await readPathAsPayload(selected)]
    await writeDialogConfig({
      ...cfg,
      lastImageDir: dirname(selected)
    })

    return {
      canceled: false,
      files
    }
  })

  ipcMain.handle('file-dialog:open-model', async () => {
    const cfg = await readDialogConfig()
    const defaultPath =
      cfg.lastModelDir || cfg.lastImageDir || app.getPath('documents') || app.getPath('home')

    const result = await dialog.showOpenDialog({
      title: 'Open 3D File',
      defaultPath,
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '3D & Assets',
          extensions: ['glb', 'gltf', 'obj', 'fbx', 'stl', 'mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'avif']
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true, files: [] }
    }

    const files = await Promise.all(result.filePaths.map((p) => readPathAsPayload(p)))
    await writeDialogConfig({
      ...cfg,
      lastModelDir: dirname(result.filePaths[0])
    })

    return {
      canceled: false,
      files
    }
  })
}
