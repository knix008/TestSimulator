/**
 * MyISOMaker's Node host. The Tauri program (src-tauri) starts it with pipes and
 * forwards the page's calls here; the channel names are the ones the Electron
 * build used, so the page talks to the same handlers as before.
 *
 * Windows, dialogs, the OS file drag and the unsaved-changes guard live in Rust.
 * Everything that reads or writes images (ISO9660 session, xorriso, mounting,
 * AppImage / Docker archives) stays here.
 */
import {
  addPathsToSession,
  closeEditSession,
  exportFileFromSession,
  exportFilesToDirectory,
  getEditSnapshot,
  getEditSourcePath,
  isEditDirty,
  mkdirInSession,
  openEditSession,
  prepareDragOutFile,
  prepareDragOutFiles,
  removeFromSession,
  removeManyFromSession,
  renameInSession,
  saveEditSession,
} from './iso/edit-session'
import { createBootableIso, createIso, extractIso, getEngineInfo } from './iso/xorriso'
import type {
  CreateBootableIsoOptions,
  CreateIsoOptions,
  ExtractOptions,
  JobProgress,
} from './iso/types'
import { listIsoTree } from './iso/list-tree'
import { dialogDefaultPath, rememberPath } from './last-path'
import { mountIso, unmountIso } from './mount'
import { cancelPackageJob, missingRequired, packageStatus, runPackageJob, type PackageId } from './packages'
import { createAppImage, type CreateAppImageOptions } from './appimage'
import { fsList, fsPlaces, fsStat } from './fsx'
import { emit, handle, serve } from './rpc'

let currentJobAbort: AbortController | null = null

function sendProgress(progress: JobProgress): void {
  emit('job:progress', progress)
}

async function runCancelableJob<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (currentJobAbort) throw new Error('A job is already running')
  const controller = new AbortController()
  currentJobAbort = controller
  try {
    return await fn(controller.signal)
  } finally {
    if (currentJobAbort === controller) currentJobAbort = null
  }
}

handle('engine:info', async () => getEngineInfo())

// Dialog helpers: Rust shows the dialog, the host remembers where the user was.
handle('paths:dialogDefault', (hintPath?: string | null, fileName?: string | null) =>
  dialogDefaultPath(hintPath ?? undefined, fileName ?? undefined) ?? null,
)
handle('paths:remember', (selected?: string | null) => {
  if (selected) rememberPath(selected)
  return { ok: true }
})
handle('session:sourcePath', () => getEditSourcePath())

handle('iso:extract', async (options: ExtractOptions) => {
  await runCancelableJob((signal) => extractIso(options, sendProgress, signal))
  return { ok: true }
})
handle('iso:create', async (options: CreateIsoOptions) => {
  await runCancelableJob((signal) => createIso(options, sendProgress, signal))
  return { ok: true }
})
handle('iso:createBootable', async (options: CreateBootableIsoOptions) => {
  await runCancelableJob((signal) => createBootableIso(options, sendProgress, signal))
  return { ok: true }
})
// Folder → AppImage (runtime + built-in SquashFS writer)
handle('iso:createAppImage', async (options: CreateAppImageOptions) => {
  sendProgress({ phase: 'appimage', percent: 5, message: 'AppImage runtime…' })
  let n = 0
  const result = await createAppImage(options, (p) => {
    n += 1
    if (n % 20 === 0) sendProgress({ phase: 'appimage', percent: null, message: p })
  })
  sendProgress({ phase: 'appimage', percent: 100, message: options.output })
  return { ok: true, ...result }
})
handle('iso:cancel', async () => {
  if (!currentJobAbort) return { ok: true, canceled: false }
  currentJobAbort.abort()
  sendProgress({ phase: 'cancel', percent: null, message: 'Canceling job…' })
  return { ok: true, canceled: true }
})
handle('iso:mount', async (isoPath: string) => mountIso(isoPath))
handle('iso:unmount', async (target: string) => unmountIso(target))
handle('iso:listTree', async (isoPath: string) => listIsoTree(isoPath))

handle('session:open', async (isoPath: string) => openEditSession(isoPath))
handle('session:get', async () => getEditSnapshot())
handle('session:close', async () => {
  closeEditSession()
  return { ok: true }
})
handle('session:addPaths', async (destDir: string, filePaths: string[]) =>
  addPathsToSession(destDir, filePaths),
)
handle('session:remove', async (entryPath: string) => removeFromSession(entryPath))
handle('session:removeMany', async (entryPaths: string[]) => removeManyFromSession(entryPaths))
handle('session:mkdir', async (dirPath: string, name: string) => mkdirInSession(dirPath, name))
handle('session:rename', async (entryPath: string, newName: string) =>
  renameInSession(entryPath, newName),
)
handle('session:exportFile', async (entryPath: string, outputPath: string) =>
  exportFileFromSession(entryPath, outputPath),
)
handle('session:exportFilesToDir', async (entryPaths: string[], outputDir: string) =>
  exportFilesToDirectory(entryPaths, outputDir),
)
handle('session:prepareDragOut', async (entryPath: string) => prepareDragOutFile(entryPath))
handle('session:prepareDragOutMany', async (entryPaths: string[]) =>
  prepareDragOutFiles(entryPaths),
)
handle('session:save', async (outputPath: string) => {
  const snap = await runCancelableJob((signal) =>
    saveEditSession(outputPath, sendProgress, signal),
  )
  rememberPath(outputPath)
  return snap
})
// Settings › Packages, and the automatic install of what is missing.
handle('pkg:status', () => packageStatus())
handle('pkg:missingRequired', () => missingRequired())
handle('pkg:run', (id: PackageId, action: 'install' | 'reinstall' | 'remove') =>
  runPackageJob(id, action, (p) => emit('pkg:progress', p)),
)
handle('pkg:cancel', () => ({ canceled: cancelPackageJob() }))
// Left explorer
handle('fs:places', () => fsPlaces())
handle('fs:list', (dir: string) => fsList(dir))
handle('fs:stat', (p: string) => fsStat(p))
handle('session:isDirty', async () => ({ dirty: isEditDirty() }))

serve(() => {
  // The program closed: drop temp files of the session.
  try {
    closeEditSession()
  } catch {
    /* ignore */
  }
})
