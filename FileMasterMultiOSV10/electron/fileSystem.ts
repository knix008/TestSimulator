import { BrowserWindow, dialog, shell } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { DirectoryListing, FileEntry, FileOperationRequest, OperationProgress, PreviewResult, SearchOptions } from '../src/shared.js'

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.ico', '.tiff', '.tif', '.webp'])
const textExtensions = new Set(['.txt', '.cs', '.json', '.xml', '.html', '.htm', '.css', '.js', '.ts', '.md', '.log', '.ini', '.cfg', '.yaml', '.yml', '.py', '.java', '.cpp', '.c', '.h', '.sh', '.bat', '.ps1', '.sql', '.csv', '.tsv', '.toml', '.gitignore'])
const maxPreviewBytes = 2 * 1024 * 1024
let watcher: FSWatcher | null = null

export function getHomePath() {
  return os.homedir()
}

export async function getRoots() {
  if (process.platform === 'win32') {
    const roots: string[] = []
    for (let code = 65; code <= 90; code += 1) {
      const root = `${String.fromCharCode(code)}:\\`
      try {
        await fs.access(root)
        roots.push(root)
      } catch {
        // unavailable drive
      }
    }
    return roots.length > 0 ? roots : [path.parse(os.homedir()).root]
  }

  const roots = ['/', os.homedir()]
  roots.push(process.platform === 'darwin' ? '/Volumes' : '/mnt', process.platform === 'darwin' ? os.homedir() : '/media')
  return Array.from(new Set(roots))
}

export async function listDirectory(targetPath = os.homedir()): Promise<DirectoryListing> {
  const normalized = path.resolve(targetPath)
  const items = await fs.readdir(normalized, { withFileTypes: true })
  const entries = await Promise.all(items.map(async item => toEntry(normalized, item)))

  return {
    path: normalized,
    parentPath: path.dirname(normalized) === normalized ? null : path.dirname(normalized),
    entries: entries
      .filter((entry): entry is FileEntry => entry !== null)
      .sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name)),
  }
}

export async function readPreview(targetPath: string): Promise<PreviewResult> {
  const stat = await fs.stat(targetPath)
  if (stat.isDirectory()) return { kind: 'info', name: path.basename(targetPath), detail: `Folder\nModified: ${new Date(stat.mtimeMs).toLocaleString()}` }

  const extension = path.extname(targetPath).toLowerCase()
  if (imageExtensions.has(extension)) {
    const data = await fs.readFile(targetPath)
    return { kind: 'image', dataUrl: `data:${mimeFromExtension(extension)};base64,${data.toString('base64')}`, name: path.basename(targetPath) }
  }

  if (textExtensions.has(extension)) {
    if (stat.size > maxPreviewBytes) return { kind: 'info', name: path.basename(targetPath), detail: `File is too large for preview (${formatSize(stat.size)}).` }
    return { kind: 'text', name: path.basename(targetPath), text: await fs.readFile(targetPath, 'utf8') }
  }

  return {
    kind: 'info',
    name: path.basename(targetPath),
    detail: `Type: ${extension ? extension.slice(1).toUpperCase() : 'File'}\nSize: ${formatSize(stat.size)}\nModified: ${new Date(stat.mtimeMs).toLocaleString()}\nCreated: ${new Date(stat.birthtimeMs).toLocaleString()}`,
  }
}

export async function createFolder(parentPath: string, name: string) {
  await fs.mkdir(path.join(parentPath, sanitizeName(name)), { recursive: false })
}

export async function createFile(parentPath: string, name: string) {
  const handle = await fs.open(path.join(parentPath, sanitizeName(name)), 'wx')
  await handle.close()
}

export async function renamePath(sourcePath: string, newName: string) {
  await fs.rename(sourcePath, path.join(path.dirname(sourcePath), sanitizeName(newName)))
}

type ProgressReporter = (progress: OperationProgress) => void

export async function copyPaths(request: FileOperationRequest, report?: ProgressReporter) {
  if (!request.destinationDir) throw new Error('Destination directory is required.')
  await fs.mkdir(request.destinationDir, { recursive: true })
  let completed = 0
  for (const source of request.sources) {
    report?.({ label: 'Copy', currentPath: source, completed, total: request.sources.length, done: false })
    await fs.cp(source, path.join(request.destinationDir, path.basename(source)), { recursive: true, force: true, errorOnExist: false })
    completed += 1
    report?.({ label: 'Copy', currentPath: source, completed, total: request.sources.length, done: completed >= request.sources.length })
  }
}

export async function movePaths(request: FileOperationRequest, report?: ProgressReporter) {
  if (!request.destinationDir) throw new Error('Destination directory is required.')
  await fs.mkdir(request.destinationDir, { recursive: true })
  let completed = 0
  for (const source of request.sources) {
    report?.({ label: 'Move', currentPath: source, completed, total: request.sources.length, done: false })
    const destination = path.join(request.destinationDir, path.basename(source))
    await fs.rm(destination, { recursive: true, force: true })
    try {
      await fs.rename(source, destination)
    } catch (error) {
      if (!isCrossDeviceError(error)) throw error
      await fs.cp(source, destination, { recursive: true, force: true, errorOnExist: false })
      await fs.rm(source, { recursive: true, force: true })
    }
    completed += 1
    report?.({ label: 'Move', currentPath: source, completed, total: request.sources.length, done: completed >= request.sources.length })
  }
}

function isCrossDeviceError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EXDEV'
}

export async function deletePaths(paths: string[], report?: ProgressReporter) {
  let completed = 0
  for (const target of paths) {
    report?.({ label: 'Delete', currentPath: target, completed, total: paths.length, done: false })
    await fs.rm(target, { recursive: true, force: true })
    completed += 1
    report?.({ label: 'Delete', currentPath: target, completed, total: paths.length, done: completed >= paths.length })
  }
}

export async function searchFiles(options: SearchOptions): Promise<FileEntry[]> {
  const results: FileEntry[] = []
  const matcher = createMatcher(options.pattern, options)
  const contentMatcher = options.searchContent && options.contentPattern ? createMatcher(options.contentPattern, options) : null
  const pending = [options.rootPath]

  while (pending.length > 0 && results.length < 1000) {
    const current = pending.pop()!
    let listing: DirectoryListing
    try {
      listing = await listDirectory(current)
    } catch {
      continue
    }

    for (const entry of listing.entries) {
      if (entry.kind === 'directory') {
        pending.push(entry.fullPath)
        if (options.includeFolders && matcher(entry.name)) results.push(entry)
        continue
      }

      if (!matcher(entry.name)) continue
      if (contentMatcher) {
        try {
          const stat = await fs.stat(entry.fullPath)
          if (stat.size > maxPreviewBytes) continue
          if (!contentMatcher(await fs.readFile(entry.fullPath, 'utf8'))) continue
        } catch {
          continue
        }
      }
      results.push(entry)
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

export async function revealPath(targetPath: string) {
  shell.showItemInFolder(targetPath)
}

export async function openPath(targetPath: string) {
  const error = await shell.openPath(targetPath)
  if (error) throw new Error(error)
}

export async function chooseDirectory(owner: BrowserWindow) {
  const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0]
}

export async function chooseSaveZip(owner: BrowserWindow, defaultPath: string) {
  const result = await dialog.showSaveDialog(owner, { defaultPath, filters: [{ name: 'ZIP archive', extensions: ['zip'] }] })
  return result.canceled ? null : result.filePath ?? null
}

export async function watchDirectory(owner: BrowserWindow, targetPath: string) {
  await watcher?.close()
  watcher = chokidar.watch(targetPath, {
    depth: 0,
    ignoreInitial: true,
    ignored: watchedPath => /[\\/]ntuser\.dat(\.log\d+)?$/i.test(watchedPath),
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })
  watcher.on('all', () => owner.webContents.send('fs:changed', targetPath))
  watcher.on('error', () => undefined)
}

async function toEntry(parentPath: string, item: { name: string; isDirectory(): boolean }): Promise<FileEntry | null> {
  const fullPath = path.join(parentPath, item.name)
  try {
    const stat = await fs.stat(fullPath)
    return {
      name: item.name,
      fullPath,
      kind: item.isDirectory() ? 'directory' : 'file',
      size: item.isDirectory() ? 0 : stat.size,
      modifiedMs: stat.mtimeMs,
      extension: item.isDirectory() ? '' : path.extname(item.name),
    }
  } catch {
    return null
  }
}

function createMatcher(pattern: string, options: Pick<SearchOptions, 'caseSensitive' | 'useRegex'>) {
  if (options.useRegex) {
    const regex = new RegExp(pattern, options.caseSensitive ? 'u' : 'iu')
    return (value: string) => regex.test(value)
  }

  const normalizedPattern = options.caseSensitive ? pattern : pattern.toLowerCase()
  const regexPattern = normalizedPattern.includes('*') || normalizedPattern.includes('?')
    ? `^${escapeRegex(normalizedPattern).replaceAll('\\*', '.*').replaceAll('\\?', '.')}$`
    : null
  const wildcard = regexPattern ? new RegExp(regexPattern, options.caseSensitive ? 'u' : 'iu') : null

  return (value: string) => {
    const comparable = options.caseSensitive ? value : value.toLowerCase()
    return wildcard ? wildcard.test(comparable) : comparable.includes(normalizedPattern)
  }
}

function sanitizeName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) throw new Error('Invalid file name.')
  return trimmed
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function mimeFromExtension(extension: string) {
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  return `image/${extension.slice(1)}`
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
