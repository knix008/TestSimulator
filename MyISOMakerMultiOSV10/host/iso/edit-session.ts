import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  buildTreeFromDirectory,
  detectOpenKind,
  extractArchiveToTemp,
  isAppImageFile,
  looksLikeTarArchive,
  volumeLabelFromPath,
} from './archive-open'
import {
  materializeTree,
  packDirectoryAsAppImage,
  packDirectoryAsTar,
  type AppImageRuntime,
} from './archive-save'
import { IsoEditSession } from '../../src/iso9660/session'
import { getNodeAtPath, normalizeKey } from '../../src/iso9660/reader'
import {
  guessImageKindByName,
  isArchiveImageKind,
  isGzipTarPath,
  type OpenImageKind,
} from '../../src/iso9660/image-formats'
import type { IsoTreeResult } from '../../src/iso9660/tree-types'
import type { JobProgress } from './types'
import { openIsoBlob } from './path-blob'
import { serializeChildren } from './tree-serialize'

let session: IsoEditSession | null = null
let sourcePath: string | null = null
let sourceKind: OpenImageKind = 'unknown'
/** Runtime bytes for rebuilding AppImage (original file + squashfs offset). */
let appImageRuntime: AppImageRuntime | null = null
/** Temp dir for AppImage / Docker extract; deleted on close/reopen. */
let extractRoot: string | null = null
const dragTempFiles = new Set<string>()
/** entryPath → prepared temp file (reuse so re-drag is instant). */
const dragCache = new Map<string, { tempPath: string; name: string; owned: boolean }>()
const dragInflight = new Map<string, Promise<{ tempPath: string; name: string }>>()

export type EditSessionSnapshot = IsoTreeResult & {
  sourcePath: string
  sourceKind: OpenImageKind
  dirty: boolean
  canSaveAppImage: boolean
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
    throw new Error(`파일을 찾을 수 없습니다: ${resolved}`)
  }
  clearDragTemps()
  clearExtractRoot()
  appImageRuntime = null
  sourceKind = 'unknown'

  const hinted = guessImageKindByName(resolved)
  const kind = await detectOpenKind(resolved, hinted)

  if (isArchiveImageKind(kind)) {
    return openArchiveSession(resolved, kind)
  }

  try {
    const blob = await openIsoBlob(resolved)
    session = await IsoEditSession.open(blob)
    sourcePath = resolved
    sourceKind = kind === 'img' ? 'img' : 'iso'
    return snapshot()
  } catch (isoErr) {
    // Extension-less / misnamed files: fall back to AppImage or tar.
    if (await isAppImageFile(resolved)) {
      return openArchiveSession(resolved, 'appimage')
    }
    if (await looksLikeTarArchive(resolved)) {
      return openArchiveSession(resolved, 'docker')
    }
    throw isoErr
  }
}

async function openArchiveSession(
  resolved: string,
  kind: 'appimage' | 'docker',
): Promise<EditSessionSnapshot> {
  const { extractRoot: root, treeRoot, squashfsOffset } = await extractArchiveToTemp(
    resolved,
    kind,
  )
  extractRoot = root
  const tree = await buildTreeFromDirectory(treeRoot)
  const label = volumeLabelFromPath(resolved)
  session = IsoEditSession.fromDirectoryTree(tree, label)
  sourcePath = resolved
  sourceKind = kind
  if (kind === 'appimage' && squashfsOffset != null && squashfsOffset > 0) {
    appImageRuntime = { runtimePath: resolved, squashfsOffset }
  }
  return snapshot()
}

export function closeEditSession(): void {
  session = null
  sourcePath = null
  sourceKind = 'unknown'
  appImageRuntime = null
  clearDragTemps()
  clearExtractRoot()
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
  const parent = getNodeAtPath(s.root, destDir)
  if (!parent || parent.kind !== 'dir') {
    throw new Error(`폴더가 없습니다: ${destDir || '/'}`)
  }
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
  if (node.source.type === 'path') {
    await fs.promises.copyFile(node.source.absolutePath, resolved)
  } else {
    const blob = await readSessionFile(s, entryPath)
    await writeBlobToFile(blob, resolved)
  }
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
  // Hover can fire prepare after close / HMR — do not throw (Electron logs handler errors).
  if (!session) {
    return { tempPath: '', name: '' }
  }

  const cached = dragCache.get(entryPath)
  if (cached && fs.existsSync(cached.tempPath)) {
    return { tempPath: cached.tempPath, name: cached.name }
  }

  const inflight = dragInflight.get(entryPath)
  if (inflight) return inflight

  const job = (async () => {
    if (!session) {
      return { tempPath: '', name: '' }
    }
    const s = session
    const node = getNodeAtPath(s.root, entryPath)
    if (!node || node.kind !== 'file') {
      throw new Error(`파일이 없습니다: ${entryPath}`)
    }
    const name = node.name

    // Path sources already live on disk (extract tree) — reuse without copying.
    if (node.source.type === 'path' && fs.existsSync(node.source.absolutePath)) {
      const result = { tempPath: node.source.absolutePath, name, owned: false }
      dragCache.set(entryPath, result)
      return { tempPath: result.tempPath, name: result.name }
    }

    const blob = await readSessionFile(s, entryPath)
    if (!session) {
      return { tempPath: '', name: '' }
    }
    const tempPath = path.join(
      os.tmpdir(),
      `isomaker-drag-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(name)}`,
    )
    await writeBlobToFile(blob, tempPath)
    if (!fs.existsSync(tempPath)) {
      throw new Error(`임시 파일 생성 실패: ${name}`)
    }
    const result = { tempPath, name, owned: true }
    dragTempFiles.add(tempPath)
    dragCache.set(entryPath, result)
    return { tempPath, name }
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
  signal?: AbortSignal,
): Promise<EditSessionSnapshot> {
  const s = requireSession()
  const resolved = path.resolve(outputPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })

  throwIfAborted(signal)
  const outKind = guessImageKindByName(resolved)
  const kind: OpenImageKind = outKind === 'unknown' ? 'iso' : outKind

  if (kind === 'iso' || kind === 'img') {
    onProgress?.({ phase: 'save', percent: 0, message: 'ISO/IMG 작성 중…' })
    const blob = await s.exportIso(
      (p) => {
        onProgress?.({ phase: 'save', percent: p.percent, message: p.message })
      },
      signal,
      openIsoBlob,
    )
    throwIfAborted(signal)
    await writeBlobToFile(blob, resolved, signal)
  } else if (kind === 'docker') {
    await saveAsTarArchive(s, resolved, isGzipTarPath(resolved), onProgress, signal)
  } else if (kind === 'appimage') {
    await saveAsAppImage(s, resolved, onProgress, signal)
  } else {
    throw new Error(`지원하지 않는 저장 형식: ${path.basename(resolved)}`)
  }

  throwIfAborted(signal)
  s.dirty = false
  onProgress?.({ phase: 'save', percent: 100, message: '저장 완료' })
  return snapshot()
}

async function saveAsTarArchive(
  s: IsoEditSession,
  outputPath: string,
  gzip: boolean,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isomaker-save-tar-'))
  try {
    onProgress?.({ phase: 'save', percent: 0, message: '트리 준비 중…' })
    await materializeTree(s.root, work, onProgress, signal)
    await packDirectoryAsTar(work, outputPath, gzip, onProgress, signal)
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

async function saveAsAppImage(
  s: IsoEditSession,
  outputPath: string,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!appImageRuntime) {
    throw new Error(
      'AppImage로 저장하려면 원본 AppImage를 연 상태에서 저장해야 합니다.\n' +
        '(런타임 ELF가 필요하며, ISO/IMG/tar에서 AppImage로 변환은 지원하지 않습니다.)\n' +
        '대신 .iso / .img / .tar 로 저장할 수 있습니다.',
    )
  }
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isomaker-save-app-'))
  try {
    onProgress?.({ phase: 'save', percent: 0, message: '트리 준비 중…' })
    await materializeTree(s.root, work, onProgress, signal)
    await packDirectoryAsAppImage(work, outputPath, appImageRuntime, onProgress, signal)
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('JOB_CANCELED')
}

async function readSessionFile(s: IsoEditSession, entryPath: string) {
  const node = getNodeAtPath(s.root, entryPath)
  if (node?.kind === 'file' && node.source.type === 'path') {
    return openIsoBlob(node.source.absolutePath)
  }
  return s.readFile(entryPath)
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
    sourceKind,
    dirty: s.dirty,
    canSaveAppImage: Boolean(appImageRuntime),
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

  // Keep a path reference so large files can be added into IMG/AppImage folders
  // without loading the whole payload into RAM.
  s.addFileFromPath(destDir, name, srcPath, st.size)
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

async function writeBlobToFile(blob: Blob, filePath: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  // Small/empty payloads: writeFile is more reliable than streaming empty bodies.
  if (blob.size < 8 * 1024 * 1024) {
    const buf = Buffer.from(await blob.arrayBuffer())
    throwIfAborted(signal)
    await fs.promises.writeFile(filePath, buf, { signal })
    return
  }
  const stream = blob.stream() as unknown as import('node:stream/web').ReadableStream
  await pipeline(Readable.fromWeb(stream), fs.createWriteStream(filePath), { signal })
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
      if (cached?.owned) {
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
  for (const [key, cached] of dragCache) {
    dragCache.delete(key)
    if (!cached.owned) continue
    try {
      fs.unlinkSync(cached.tempPath)
    } catch {
      // ignore
    }
    dragTempFiles.delete(cached.tempPath)
  }
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

function clearExtractRoot(): void {
  if (!extractRoot) return
  const dir = extractRoot
  extractRoot = null
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}
