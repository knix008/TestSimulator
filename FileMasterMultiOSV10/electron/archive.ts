import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import unzipper from 'unzipper'
import type { Archiver, ArchiverOptions } from 'archiver'
import type { CompressRequest, ExtractRequest, OperationProgress } from '../src/shared.js'

const require = createRequire(import.meta.url)
const createArchiver = require('archiver') as (format: 'zip', options?: ArchiverOptions) => Archiver

type ProgressReporter = (progress: OperationProgress) => void

export async function compressZip(request: CompressRequest, report?: ProgressReporter) {
  const tempDir = request.splitSizeBytes > 0 ? await fs.mkdtemp(path.join(os.tmpdir(), 'command-center-zip-work-')) : null
  const workPath = tempDir ? path.join(tempDir, `${Date.now()}.zip`) : request.destinationZip
  await fs.mkdir(path.dirname(workPath), { recursive: true })

  const sourceStats = await Promise.all(request.sources.map(async source => ({ source, stat: await fs.stat(source) })))

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(workPath)
    const archive = createArchiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    let completed = 0
    for (const { source, stat } of sourceStats) {
      report?.({ label: 'Compress', currentPath: source, completed, total: sourceStats.length, done: false })
      if (stat.isDirectory()) archive.directory(source, path.basename(source))
      else archive.file(source, { name: path.basename(source) })
      completed += 1
      report?.({ label: 'Compress', currentPath: source, completed, total: sourceStats.length, done: false })
    }
    void archive.finalize()
  })

  report?.({ label: 'Compress', currentPath: request.destinationZip, completed: sourceStats.length, total: sourceStats.length, done: true })

  if (request.splitSizeBytes > 0 && tempDir) {
    await splitFile(workPath, request.destinationZip, request.splitSizeBytes)
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

export async function extractZip(request: ExtractRequest, report?: ProgressReporter) {
  const source = isSplitPart(request.archivePath) ? baseSplitPath(request.archivePath) : request.archivePath
  report?.({ label: 'Extract', currentPath: source, completed: 0, total: 1, done: false })
  const sourceToExtract = await isSplitArchive(source) ? await reassembleParts(source) : source
  await fs.mkdir(request.destinationDir, { recursive: true })
  await extractEntriesSafely(sourceToExtract, request.destinationDir)
  if (sourceToExtract !== source) await fs.rm(sourceToExtract, { force: true })
  report?.({ label: 'Extract', currentPath: request.destinationDir, completed: 1, total: 1, done: true })
}

async function extractEntriesSafely(zipPath: string, destinationDir: string) {
  const destinationRoot = path.resolve(destinationDir)
  const directory = await unzipper.Open.file(zipPath)

  for (const entry of directory.files) {
    const targetPath = path.resolve(destinationRoot, entry.path)
    if (!targetPath.startsWith(destinationRoot + path.sep) && targetPath !== destinationRoot) continue

    if (entry.type === 'Directory') {
      await fs.mkdir(targetPath, { recursive: true })
      continue
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await pipeline(entry.stream(), createWriteStream(targetPath))
  }
}

async function splitFile(sourcePath: string, destinationBase: string, chunkSize: number) {
  const input = await fs.open(sourcePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let part = 1
    let output = await fs.open(`${destinationBase}.${String(part).padStart(3, '0')}`, 'w')
    let written = 0

    while (true) {
      const read = await input.read(buffer, 0, Math.min(buffer.length, chunkSize - written), null)
      if (read.bytesRead === 0) break
      await output.write(buffer.subarray(0, read.bytesRead))
      written += read.bytesRead
      if (written >= chunkSize) {
        await output.close()
        part += 1
        output = await fs.open(`${destinationBase}.${String(part).padStart(3, '0')}`, 'w')
        written = 0
      }
    }
    await output.close()
  } finally {
    await input.close()
  }
}

async function isSplitArchive(zipPath: string) {
  try {
    await fs.access(`${zipPath}.001`)
    return true
  } catch {
    return false
  }
}

function isSplitPart(targetPath: string) {
  return /\.zip\.\d{3}$/i.test(targetPath)
}

function baseSplitPath(partPath: string) {
  return partPath.replace(/\.\d{3}$/i, '')
}

async function reassembleParts(basePath: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'command-center-zip-join-'))
  const tempPath = path.join(tempDir, `${Date.now()}.zip`)
  const output = createWriteStream(tempPath)

  for (let part = 1; ; part += 1) {
    const partPath = `${basePath}.${String(part).padStart(3, '0')}`
    try {
      await fs.access(partPath)
    } catch {
      break
    }
    await pipeline(createReadStream(partPath), output, { end: false })
  }

  output.end()
  await new Promise<void>(resolve => output.on('finish', resolve))
  return tempPath
}
