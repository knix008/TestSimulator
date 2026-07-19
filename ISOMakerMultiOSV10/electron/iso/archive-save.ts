import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { IsoDirNode } from '../../src/iso9660/types'
import { getNodeAtPath } from '../../src/iso9660/reader'
import {
  findSquashfsOffset,
  resolveMksquashfs,
  resolveTar,
  runCommand,
} from './archive-open'
import type { JobProgress } from './types'

export type AppImageRuntime = {
  runtimePath: string
  squashfsOffset: number
}

/** Write the current virtual tree to a real directory (for tar / AppImage packing). */
export async function materializeTree(
  root: IsoDirNode,
  destDir: string,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  await fs.promises.mkdir(destDir, { recursive: true })
  const files: string[] = []
  collectFilePaths(root, '', files)
  let done = 0
  await walkMaterialize(root, '', destDir, async (entryPath, absOut) => {
    throwIfAborted(signal)
    const node = getNodeAtPath(root, entryPath)
    if (!node || node.kind !== 'file') return
    if (node.source.type === 'path') {
      await fs.promises.copyFile(node.source.absolutePath, absOut)
    } else if (node.source.type === 'blob') {
      await writeBlobToFile(node.source.blob, absOut, signal)
    } else if (node.source.type === 'iso') {
      const blob = await openIsoBlobFromExtents(node.source)
      await writeBlobToFile(blob, absOut, signal)
    } else {
      throw new Error(node.source.reason)
    }
    done += 1
    const percent = files.length ? Math.min(90, Math.round((done / files.length) * 90)) : 90
    onProgress?.({
      phase: 'save',
      percent,
      message: `파일 준비 중… (${done}/${files.length})`,
    })
  })
}

export async function packDirectoryAsTar(
  sourceDir: string,
  outputPath: string,
  gzip: boolean,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  const tar = resolveTar()
  if (!tar) {
    throw new Error('tar 명령을 찾을 수 없습니다. Docker/tar로 저장하려면 OS tar가 필요합니다.')
  }
  onProgress?.({ phase: 'save', percent: 92, message: gzip ? 'tar.gz 작성 중…' : 'tar 작성 중…' })
  const args = gzip
    ? ['-czf', outputPath, '-C', sourceDir, '.']
    : ['-cf', outputPath, '-C', sourceDir, '.']
  await runCommand(tar, args, path.dirname(outputPath))
  throwIfAborted(signal)
}

/**
 * Rebuild an AppImage: original ELF runtime (bytes before squashfs) + new squashfs of the tree.
 * Requires mksquashfs and a runtime from a previously opened AppImage.
 */
export async function packDirectoryAsAppImage(
  sourceDir: string,
  outputPath: string,
  runtime: AppImageRuntime,
  onProgress?: (progress: JobProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  if (!fs.existsSync(runtime.runtimePath)) {
    throw new Error(
      `AppImage 런타임을 찾을 수 없습니다: ${runtime.runtimePath}\n` +
        'AppImage로 저장하려면 원본 AppImage를 연 뒤 저장하세요.',
    )
  }
  let offset = runtime.squashfsOffset
  if (offset <= 0) {
    offset = await findSquashfsOffset(runtime.runtimePath)
  }
  if (offset <= 0) {
    throw new Error('AppImage 런타임(squashfs 오프셋)을 확인할 수 없습니다.')
  }

  const mksquashfs = resolveMksquashfs()
  if (!mksquashfs) {
    throw new Error(
      'AppImage로 저장하려면 squashfs-tools(mksquashfs)가 필요합니다.\n' +
        'Windows: MSYS2 `pacman -S squashfs-tools`\n' +
        'macOS: `brew install squashfs`\n' +
        'Linux: `sudo apt install squashfs-tools`',
    )
  }

  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isomaker-appimage-'))
  const squashPath = path.join(work, 'payload.squashfs')
  try {
    onProgress?.({ phase: 'save', percent: 92, message: 'squashfs 작성 중…' })
    await runCommand(
      mksquashfs,
      [sourceDir, squashPath, '-comp', 'gzip', '-noappend', '-all-root'],
      work,
    )
    throwIfAborted(signal)
    onProgress?.({ phase: 'save', percent: 96, message: 'AppImage 결합 중…' })
    await concatRuntimeAndSquash(runtime.runtimePath, offset, squashPath, outputPath, signal)
    if (process.platform !== 'win32') {
      try {
        await fs.promises.chmod(outputPath, 0o755)
      } catch {
        // ignore
      }
    }
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

async function concatRuntimeAndSquash(
  runtimePath: string,
  offset: number,
  squashPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  const out = await fs.promises.open(outputPath, 'w')
  try {
    const runtime = await fs.promises.open(runtimePath, 'r')
    try {
      await copyFdRange(runtime, out, 0, offset, signal)
    } finally {
      await runtime.close()
    }
    const squash = await fs.promises.open(squashPath, 'r')
    try {
      const size = (await squash.stat()).size
      await copyFdRange(squash, out, 0, size, signal)
    } finally {
      await squash.close()
    }
  } finally {
    await out.close()
  }
}

async function copyFdRange(
  src: fs.promises.FileHandle,
  dest: fs.promises.FileHandle,
  start: number,
  length: number,
  signal?: AbortSignal,
): Promise<void> {
  const CHUNK = 8 * 1024 * 1024
  const buf = Buffer.allocUnsafe(Math.min(CHUNK, Math.max(length, 1)))
  let pos = start
  let left = length
  while (left > 0) {
    throwIfAborted(signal)
    const n = Math.min(buf.length, left)
    const { bytesRead } = await src.read(buf, 0, n, pos)
    if (bytesRead <= 0) break
    await dest.write(buf, 0, bytesRead)
    pos += bytesRead
    left -= bytesRead
  }
}

function collectFilePaths(node: IsoDirNode, prefix: string, out: string[]): void {
  for (const child of node.children.values()) {
    const p = prefix ? `${prefix}/${child.name}` : child.name
    if (child.kind === 'dir') collectFilePaths(child, p, out)
    else out.push(p)
  }
}

async function walkMaterialize(
  node: IsoDirNode,
  prefix: string,
  destDir: string,
  writeFile: (entryPath: string, absOut: string) => Promise<void>,
): Promise<void> {
  for (const child of node.children.values()) {
    const entryPath = prefix ? `${prefix}/${child.name}` : child.name
    const abs = path.join(destDir, child.name)
    if (child.kind === 'dir') {
      await fs.promises.mkdir(abs, { recursive: true })
      await walkMaterialize(child, entryPath, abs, writeFile)
    } else {
      await writeFile(entryPath, abs)
    }
  }
}

async function openIsoBlobFromExtents(source: {
  iso: Blob
  extents: { lba: number; size: number }[]
  blockSize: number
}): Promise<Blob> {
  const block = source.blockSize || 2048
  if (source.extents.length === 1) {
    const e = source.extents[0]!
    return source.iso.slice(e.lba * block, e.lba * block + e.size)
  }
  const parts: Blob[] = []
  for (const e of source.extents) {
    parts.push(source.iso.slice(e.lba * block, e.lba * block + e.size))
  }
  return new Blob(parts)
}

async function writeBlobToFile(blob: Blob, filePath: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  if (blob.size < 8 * 1024 * 1024) {
    const buf = Buffer.from(await blob.arrayBuffer())
    throwIfAborted(signal)
    await fs.promises.writeFile(filePath, buf, { signal })
    return
  }
  const stream = blob.stream() as unknown as import('node:stream/web').ReadableStream
  await pipeline(Readable.fromWeb(stream), fs.createWriteStream(filePath), { signal })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('JOB_CANCELED')
}
