import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { IsoEditSession } from '../../src/iso9660/session'
import { getNodeAtPath, normalizeKey } from '../../src/iso9660/reader'
import type { IsoTreeResult } from '../../src/iso9660/tree-types'
import type { JobProgress } from './types'
import { openIsoBlob } from './path-blob'
import { serializeChildren } from './tree-serialize'

let session: IsoEditSession | null = null
let sourcePath: string | null = null
const dragTempFiles = new Set<string>()
/** entryPath → prepared temp file (reuse so re-drag is instant). */
const dragCache = new Map<string, { tempPath: string; name: string }>()
const dragInflight = new Map<string, Promise<{ tempPath: string; name: string }>>()

export type EditSessionSnapshot = IsoTreeResult & {
  sourcePath: string
  dirty: boolean
}

export function isEditDirty(): boolean {
  return Boolean(session?.dirty)
}

export function getEditSourcePath(): string | null {
  return sourcePath
}

export async function openEditSession(isoPath: string): Promise<EditSessionSnapshot> {
  const resolved = path.resolve(isoPath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`ISO file not found: ${resolved}`)
  }
  clearDragTemps()
  const blob = await openIsoBlob(resolved)
  session = await IsoEditSession.open(blob)
  sourcePath = resolved
  return snapshot()
}

export function closeEditSession(): void {
  session = null
  sourcePath = null
  clearDragTemps()
}

export function getEditSnapshot(): EditSessionSnapshot | null {
  if (!session || !sourcePath) return null
  return snapshot()
}

export async function addPathsToSession(
  destDir: string,
  filePaths: string[],
): Promise<EditSessionSnapshot> {
  const s = requireSession()
  for (const filePath of filePaths) {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) continue
    await addPathRecursive(s, destDir, resolved, path.basename(resolved))
  }
  // Added paths may overwrite names; drop drag cache for that folder tree.
  invalidateDragCachePrefix(destDir)
  return snapshot()
}

export function removeFromSession(entryPath: string): EditSessionSnapshot {
  requireSession().remove(entryPath)
  invalidateDragCachePrefix(entryPath)
  return snapshot()
}

export function removeManyFromSession(entryPaths: string[]): EditSessionSnapshot {
  const s = requireSession()
  const sorted = [...new Set(entryPaths)].sort(
    (a, b) => b.split('/').filter(Boolean).length - a.split('/').filter(Boolean).length,
  )
  for (const entryPath of sorted) {
    try {
      s.remove(entryPath)
      invalidateDragCachePrefix(entryPath)
    } catch {
      // skip missing / already removed parents
    }
  }
  return snapshot()
}

export function mkdirInSession(dirPath: string, name: string): EditSessionSnapshot {
  requireSession().mkdir(dirPath, name)
  return snapshot()
}

export function renameInSession(entryPath: string, newName: string): EditSessionSnapshot {
  requireSession().rename(entryPath, newName)
  invalidateDragCachePrefix(entryPath)
  return snapshot()
}

/** Write a single file from the session to an absolute disk path. */
export async function exportFileFromSession(
  entryPath: string,
  outputPath: string,
): Promise<{ ok: true; outputPath: string }> {
  const s = requireSession()
  const node = getNodeAtPath(s.root, entryPath)
  if (!node || node.kind !== 'file') {
    throw new Error(`파일이 없습니다: ${entryPath}`)
  }
  const resolved = path.resolve(outputPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  const blob = await s.readFile(entryPath)
  await writeBlobToFile(blob, resolved)
  return { ok: true, outputPath: resolved }
}

/** Export multiple files into a directory (unique names on collision). */
export async function exportFilesToDirectory(
  entryPaths: string[],
  outputDir: string,
): Promise<{ ok: true; count: number; outputDir: string }> {
  const dir = path.resolve(outputDir)
  fs.mkdirSync(dir, { recursive: true })
  let count = 0
  for (const entryPath of entryPaths) {
    const s = requireSession()
    const node = getNodeAtPath(s.root, entryPath)
    if (!node || node.kind !== 'file') continue
    const dest = uniqueDestPath(dir, node.name)
    await exportFileFromSession(entryPath, dest)
    count += 1
  }
  return { ok: true, count, outputDir: dir }
}

export async function prepareDragOutFiles(
  entryPaths: string[],
): Promise<{ tempPaths: string[]; names: string[] }> {
  const tempPaths: string[] = []
  const names: string[] = []
  for (const entryPath of entryPaths) {
    const prepared = await prepareDragOutFile(entryPath)
    tempPaths.push(prepared.tempPath)
    names.push(prepared.name)
  }
  return { tempPaths, names }
}

/** Extract a file from the session into a temp path for OS drag-out. */
export async function prepareDragOutFile(entryPath: string): Promise<{ tempPath: string; name: string }> {
  const cached = dragCache.get(entryPath)
  if (cached && fs.existsSync(cached.tempPath)) {
    return cached
  }

  const inflight = dragInflight.get(entryPath)
  if (inflight) return inflight

  const job = (async () => {
    const s = requireSession()
    const node = getNodeAtPath(s.root, entryPath)
    if (!node || node.kind !== 'file') {
      throw new Error(`파일이 없습니다: ${entryPath}`)
    }
    const name = node.name
    const blob = await s.readFile(entryPath)
    const tempPath = path.join(
      os.tmpdir(),
      `isomaker-drag-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(name)}`,
    )
    await writeBlobToFile(blob, tempPath)
    if (!fs.existsSync(tempPath)) {
      throw new Error(`임시 파일 생성 실패: ${name}`)
    }
    const result = { tempPath, name }
    dragTempFiles.add(tempPath)
    dragCache.set(entryPath, result)
    return result
  })()

  dragInflight.set(entryPath, job)
  try {
    return await job
  } finally {
    dragInflight.delete(entryPath)
  }
}

export async function saveEditSession(
  outputPath: string,
  onProgress?: (progress: JobProgress) => void,
): Promise<EditSessionSnapshot> {
  const s = requireSession()
  const resolved = path.resolve(outputPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })

  onProgress?.({ phase: 'save', percent: 0, message: 'Writing ISO…' })
  const blob = await s.exportIso((p) => {
    onProgress?.({ phase: 'save', percent: p.percent, message: p.message })
  })
  await writeBlobToFile(blob, resolved)
  s.dirty = false
  onProgress?.({ phase: 'save', percent: 100, message: 'ISO saved' })
  return snapshot()
}

function snapshot(): EditSessionSnapshot {
  const s = requireSession()
  if (!sourcePath) throw new Error('No ISO session')
  let totalBytes = 0
  for (const e of s.entries) {
    if (!e.isDir) totalBytes += e.size
  }
  return {
    sourcePath,
    dirty: s.dirty,
    volumeLabel: s.volumeLabel,
    totalBytes,
    entryCount: s.entries.length,
    root: serializeChildren(s.root, ''),
  }
}

function requireSession(): IsoEditSession {
  if (!session) throw new Error('열린 ISO가 없습니다.')
  return session
}

async function addPathRecursive(
  s: IsoEditSession,
  destDir: string,
  srcPath: string,
  name: string,
): Promise<void> {
  const st = await fs.promises.stat(srcPath)
  if (st.isDirectory()) {
    ensureDir(s, destDir, name)
    const nextDir = destDir ? `${destDir}/${name}` : name
    const children = await fs.promises.readdir(srcPath)
    for (const child of children) {
      await addPathRecursive(s, nextDir, path.join(srcPath, child), child)
    }
    return
  }

  const blob = await openIsoBlob(srcPath)
  const file = new File([blob], name, { type: 'application/octet-stream' })
  await s.addFiles(destDir, [file])
}

function ensureDir(s: IsoEditSession, parentPath: string, name: string): void {
  const parent = getNodeAtPath(s.root, parentPath)
  if (!parent || parent.kind !== 'dir') {
    throw new Error(`폴더가 없습니다: ${parentPath || '/'}`)
  }
  if (parent.children.has(normalizeKey(name))) {
    const existing = parent.children.get(normalizeKey(name))
    if (existing?.kind === 'dir') return
    throw new Error(`이미 파일이 있습니다: ${name}`)
  }
  s.mkdir(parentPath, name)
}

async function writeBlobToFile(blob: Blob, filePath: string): Promise<void> {
  // Small/empty payloads: writeFile is more reliable than streaming empty bodies.
  if (blob.size < 8 * 1024 * 1024) {
    const buf = Buffer.from(await blob.arrayBuffer())
    await fs.promises.writeFile(filePath, buf)
    return
  }
  const stream = blob.stream() as unknown as import('node:stream/web').ReadableStream
  await pipeline(Readable.fromWeb(stream), fs.createWriteStream(filePath))
}

function safeName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\.+$/g, '')
  return cleaned || 'file.bin'
}

function uniqueDestPath(dir: string, fileName: string): string {
  let dest = path.join(dir, fileName)
  if (!fs.existsSync(dest)) return dest
  const ext = path.extname(fileName)
  const base = path.basename(fileName, ext)
  let i = 2
  while (fs.existsSync(dest)) {
    dest = path.join(dir, `${base} (${i})${ext}`)
    i += 1
  }
  return dest
}

function invalidateDragCachePrefix(prefix: string): void {
  const keys = [...dragCache.keys()]
  for (const key of keys) {
    if (!prefix || key === prefix || key.startsWith(prefix + '/')) {
      const cached = dragCache.get(key)
      dragCache.delete(key)
      if (cached) {
        try {
          fs.unlinkSync(cached.tempPath)
        } catch {
          // ignore
        }
        dragTempFiles.delete(cached.tempPath)
      }
    }
  }
}

function clearDragTemps(): void {
  dragInflight.clear()
  dragCache.clear()
  for (const file of dragTempFiles) {
    try {
      fs.unlinkSync(file)
    } catch {
      // ignore
    }
  }
  dragTempFiles.clear()
}
