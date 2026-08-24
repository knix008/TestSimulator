// Electron 메인 프로세스에서 동작하는 Node 아카이브 엔진.
// 7zip-bin(7za) + node-7z 로 zip/7z/tar/gz/bz2 생성·해제 및 RAR 해제를 처리하고,
// 분할/병합은 참고 앱(ZipMasterForm.cs)의 SplitFile/TryCombineSplitArchive 로직을 이식한다.
import Seven from 'node-7z'
import sevenBin from '7zip-bin'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import type {
  ArchiveEntry,
  CompressOptions,
  DirListing,
  ExtractOptions,
  FsEntry,
  InputSource,
  OperationResult,
  Progress
} from '@core/types'
import { isArchiveName, parseSplitPart, partName } from '@core/format'

// electron-builder asarUnpack 로 풀린 실제 경로 보정
const path7za = sevenBin.path7za.replace('app.asar', 'app.asar.unpacked')

type OnProgress = (p: Progress) => void

const CHUNK = 81920 // 참고 앱과 동일한 버퍼 크기

function tempFile(ext: string): string {
  return path.join(os.tmpdir(), `zipmaster-${Date.now()}-${Math.floor(performance.now())}${ext}`)
}

/** node-7z add 를 Promise 로 래핑. percent 진행률을 bytes(0~100) 스냅샷으로 전달. */
function sevenAdd(archivePath: string, sources: string[], onProgress: OnProgress, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = Seven.add(archivePath, sources, { $bin: path7za, $progress: true })
    stream.on('progress', (p: { percent: number }) =>
      onProgress({ message, kind: 'bytes', current: p.percent, total: 100 })
    )
    stream.on('end', () => resolve())
    stream.on('error', (err: Error) => reject(err))
  })
}

/** node-7z extractFull 을 Promise 로 래핑. */
function sevenExtract(
  archivePath: string,
  outDir: string,
  opts: ExtractOptions,
  onProgress: OnProgress
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = Seven.extractFull(archivePath, outDir, {
      $bin: path7za,
      $progress: true,
      // 선택 해제: 지정된 아카이브 내부 경로들만 추출(미지정 시 전체).
      $cherryPick: opts.selection && opts.selection.length > 0 ? opts.selection : undefined,
      overwrite: opts.overwrite ? 'a' : 's',
      password: opts.password
    })
    stream.on('progress', (p: { percent: number }) =>
      onProgress({ message: '압축 해제 중…', kind: 'bytes', current: p.percent, total: 100 })
    )
    stream.on('end', () => resolve())
    stream.on('error', (err: Error) => reject(err))
  })
}

/** 참고 앱 SplitFile 이식: 소스 파일을 partSize 단위로 <out>.001, .002 … 로 분할. */
async function splitFile(
  sourcePath: string,
  outputBase: string,
  partSizeBytes: number,
  onProgress: OnProgress
): Promise<number> {
  const total = (await fsp.stat(sourcePath)).size
  const fd = await fsp.open(sourcePath, 'r')
  const buffer = Buffer.alloc(CHUNK)
  let partIndex = 1
  let position = 0
  try {
    while (position < total) {
      const outPath = partName(outputBase, partIndex)
      const outFd = await fsp.open(outPath, 'w')
      try {
        let bytesToWrite = Math.min(partSizeBytes, total - position)
        while (bytesToWrite > 0) {
          const chunkSize = Math.min(buffer.length, bytesToWrite)
          const { bytesRead } = await fd.read(buffer, 0, chunkSize, position)
          if (bytesRead === 0) break
          await outFd.write(buffer, 0, bytesRead)
          position += bytesRead
          bytesToWrite -= bytesRead
          onProgress({ message: '분할 압축 중…', kind: 'bytes', current: position, total })
        }
      } finally {
        await outFd.close()
      }
      partIndex++
    }
  } finally {
    await fd.close()
  }
  return partIndex - 1
}

/**
 * 참고 앱 TryCombineSplitArchive 이식: 선택 경로가 .001 조각이면 같은 베이스의 모든 조각을
 * 정렬·연결하여 임시 파일로 병합하고 그 경로를 반환. 조각이 아니면 null.
 */
async function tryCombineParts(selectedPath: string, onProgress: OnProgress): Promise<string | null> {
  const fileName = path.basename(selectedPath)
  const meta = parseSplitPart(fileName)
  if (!meta) return null

  onProgress({ message: '분할 조각 병합 중…', kind: 'marquee' })

  const dir = path.dirname(selectedPath)
  const baseName = meta.base
  const all = await fsp.readdir(dir)
  const parts = all
    .map((n) => ({ name: n, meta: parseSplitPart(n) }))
    .filter((x) => x.meta && x.meta.base === baseName)
    .sort((a, b) => a.meta!.index - b.meta!.index)
    .map((x) => path.join(dir, x.name))

  if (parts.length === 0) return null

  let totalBytes = 0
  for (const p of parts) totalBytes += (await fsp.stat(p)).size

  const combined = tempFile(path.extname(baseName) || '.bin')
  const dest = fs.createWriteStream(combined)
  let written = 0
  try {
    for (const part of parts) {
      await new Promise<void>((resolve, reject) => {
        const src = fs.createReadStream(part)
        src.on('data', (c: string | Buffer) => {
          written += (c as Buffer).length
          onProgress({ message: '분할 조각 병합 중…', kind: 'bytes', current: written, total: totalBytes })
        })
        src.on('end', resolve)
        src.on('error', reject)
        src.pipe(dest, { end: false })
      })
    }
  } finally {
    dest.end()
  }
  return combined
}

/** 폴더 소스를 개별 파일 경로 목록으로 확장(엔트리명은 폴더명/상대경로). 반환은 압축에 넣을 실제 경로. */
async function expandSources(inputs: InputSource[]): Promise<string[]> {
  // node-7z 는 경로 목록을 받으므로 폴더는 그대로 넣어도 재귀 압축된다.
  return inputs.map((i) => i.path)
}

export async function compress(
  inputs: InputSource[],
  outPath: string,
  opts: CompressOptions,
  onProgress: OnProgress
): Promise<OperationResult> {
  const sources = await expandSources(inputs)
  if (sources.length === 0) return { ok: false, outputs: [], warnings: [], error: '압축할 파일이 없습니다.' }

  try {
    // 실제 아카이브를 만들 경로: 분할이면 임시 파일, 아니면 최종 경로
    const buildPath = opts.split ? tempFile(path.extname(outPath) || '.zip') : outPath

    if (opts.format === 'gz' || opts.format === 'bz2') {
      // tar 생성 후 gzip/bzip2 로 2단계 압축
      const tarTemp = tempFile('.tar')
      await sevenAdd(tarTemp, sources, onProgress, '압축 중… (tar)')
      const codecExt = opts.format === 'gz' ? '.gz' : '.bz2'
      // 7za 는 확장자로 코덱을 판별(.gz→gzip, .bz2→bzip2)
      const compressedTemp = tempFile(`.tar${codecExt}`)
      await sevenAdd(compressedTemp, [tarTemp], onProgress, '압축 중…')
      await fsp.rename(compressedTemp, buildPath).catch(async () => {
        await fsp.copyFile(compressedTemp, buildPath)
        await fsp.unlink(compressedTemp)
      })
      await fsp.unlink(tarTemp).catch(() => {})
    } else {
      // zip / 7z / tar 는 단일 단계
      await sevenAdd(buildPath, sources, onProgress, '압축 중…')
    }

    if (!opts.split) {
      return { ok: true, outputs: [outPath], warnings: [] }
    }

    const partSize = opts.splitSizeMb * 1024 * 1024
    const partCount = await splitFile(buildPath, outPath, partSize, onProgress)
    await fsp.unlink(buildPath).catch(() => {})
    return { ok: true, outputs: [outPath], partCount, warnings: [] }
  } catch (e) {
    return { ok: false, outputs: [], warnings: [], error: (e as Error).message }
  }
}

export async function extract(
  archivePath: string,
  outDir: string,
  opts: ExtractOptions,
  onProgress: OnProgress
): Promise<OperationResult> {
  let combined: string | null = null
  try {
    combined = await tryCombineParts(archivePath, onProgress)
    const source = combined ?? archivePath
    await sevenExtract(source, outDir, opts, onProgress)
    return { ok: true, outputs: [outDir], warnings: [] }
  } catch (e) {
    return { ok: false, outputs: [], warnings: [], error: (e as Error).message }
  } finally {
    if (combined) await fsp.unlink(combined).catch(() => {})
  }
}

/** 드라이브(Windows) 또는 루트(posix) 목록. */
export async function listDrives(): Promise<FsEntry[]> {
  if (process.platform === 'win32') {
    const drives: FsEntry[] = []
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c)
      const root = `${letter}:\\`
      try {
        await fsp.access(root)
        drives.push({ name: `${letter}:`, path: root, isDirectory: true, isArchive: false, size: 0 })
      } catch {
        // 드라이브 없음
      }
    }
    return drives
  }
  return [{ name: '/', path: '/', isDirectory: true, isArchive: false, size: 0 }]
}

/** 경로 하위 항목 목록. path 가 비어있으면 드라이브 목록. */
export async function listDir(dirPath: string): Promise<DirListing> {
  if (!dirPath) {
    return { path: '', parent: null, entries: await listDrives() }
  }

  const entries: FsEntry[] = []
  const dirents = await fsp.readdir(dirPath, { withFileTypes: true })
  for (const d of dirents) {
    const full = path.join(dirPath, d.name)
    let isDir = d.isDirectory()
    let size = 0
    let modified: number | undefined
    try {
      if (d.isSymbolicLink()) {
        const st = await fsp.stat(full)
        isDir = st.isDirectory()
        size = st.size
        modified = st.mtimeMs
      } else if (!isDir) {
        const st = await fsp.stat(full)
        size = st.size
        modified = st.mtimeMs
      }
    } catch {
      continue // 접근 불가 항목은 건너뜀
    }
    entries.push({
      name: d.name,
      path: full,
      isDirectory: isDir,
      isArchive: !isDir && isArchiveName(d.name),
      size,
      modified
    })
  }

  // 폴더 먼저, 그 다음 이름순
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // 상위 경로 계산(드라이브 루트면 드라이브 목록으로)
  const parent = path.dirname(dirPath)
  const atRoot = parent === dirPath
  return { path: dirPath, parent: atRoot ? '' : parent, entries }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}

/** destDir 아래에서 name 이 충돌하면 "name (2)", "name (3)" … 로 비충돌 경로를 만든다. */
async function uniqueDest(destDir: string, name: string): Promise<string> {
  const ext = path.extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  let candidate = path.join(destDir, name)
  let i = 2
  while (await pathExists(candidate)) {
    candidate = path.join(destDir, `${stem} (${i})${ext}`)
    i++
  }
  return candidate
}

/** 파일/폴더를 destDir 아래로 복사(재귀). 이름 충돌 시 자동으로 " (n)" 을 붙인다. */
export async function copyPath(src: string, destDir: string): Promise<void> {
  const dest = await uniqueDest(destDir, path.basename(src))
  await fsp.cp(src, dest, { recursive: true })
}

/** 파일/폴더를 destDir 아래로 이동. 같은 위치면 무시, 자기 하위로는 금지, 이름 충돌 시 오류. */
export async function movePath(src: string, destDir: string): Promise<void> {
  const dest = path.join(destDir, path.basename(src))
  if (path.resolve(dest) === path.resolve(src)) return
  const rel = path.relative(src, dest)
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error('폴더를 자기 자신의 하위로 이동할 수 없습니다.')
  }
  if (await pathExists(dest)) throw new Error('대상 위치에 같은 이름의 항목이 이미 있습니다.')
  try {
    await fsp.rename(src, dest)
  } catch {
    // 다른 드라이브 등으로 rename 이 실패하면 복사 후 원본 삭제로 대체
    await fsp.cp(src, dest, { recursive: true })
    await fsp.rm(src, { recursive: true, force: true })
  }
}

export async function listEntries(archivePath: string): Promise<ArchiveEntry[]> {
  let combined: string | null = null
  try {
    combined = await tryCombineParts(archivePath, () => {})
    const source = combined ?? archivePath
    return await new Promise<ArchiveEntry[]>((resolve, reject) => {
      const entries: ArchiveEntry[] = []
      // -sccUTF-8: 7za 콘솔 출력을 UTF-8 로 강제. 미지정 시 Windows 는 OEM 코드페이지(한국어=CP949)로
      // 파일명을 내보내는데 node-7z 가 이를 UTF-8 로 디코딩해 한글이 깨진다.
      const stream = Seven.list(source, { $bin: path7za, $raw: ['-sccUTF-8'] })
      stream.on('data', (e: { file: string; size?: number; attributes?: string }) => {
        const isDir = (e.attributes ?? '').includes('D')
        entries.push({ name: e.file, size: Number(e.size ?? 0), isDirectory: isDir })
      })
      stream.on('end', () => resolve(entries))
      stream.on('error', reject)
    })
  } finally {
    if (combined) await fsp.unlink(combined).catch(() => {})
  }
}
