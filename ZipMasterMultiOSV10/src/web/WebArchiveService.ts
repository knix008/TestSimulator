import { zip, gzip, type Zippable } from 'fflate'
import * as tarStream from 'tar-stream'
import { Archive } from 'libarchive.js'
// libarchive.js 워커 번들 URL (Vite 가 자산으로 처리)
import workerUrl from 'libarchive.js/dist/worker-bundle.js?url'

import type { ArchiveService } from '@core/ArchiveService'
import type {
  ArchiveEntry,
  CompressOptions,
  DirListing,
  ExtractOptions,
  FormatCaps,
  FsEntry,
  InputSource,
  OperationResult,
  ProgressCallback
} from '@core/types'
import { extensionFor, parseSplitPart, partName } from '@core/format'
import { getDict } from '@core/i18n'

// 진행률 마이크로 텍스트는 기본(한국어) 사전을 사용한다. UI 라벨/토스트는 store 에서 언어별로 처리.
const t = getDict('ko')
import {
  downloadBlob,
  pickArchiveViaInput,
  pickDirectoryHandle,
  pickFilesViaInput,
  writeFileToDir
} from './webFs'

let archiveInited = false
function ensureArchiveInit() {
  if (!archiveInited) {
    Archive.init({ workerUrl })
    archiveInited = true
  }
}

/** 브라우저 환경 아카이브 서비스. 생성: fflate + tar-stream, 해제: libarchive.js(WASM). */
export class WebArchiveService implements ArchiveService {
  capabilities(): FormatCaps {
    return {
      // 웹에서는 zip/tar/gz 생성만 지원(7z·bz2·rar 생성 불가).
      create: { zip: true, tar: true, gz: true, bz2: false, '7z': false, rar: false },
      // 해제는 libarchive.js 로 전부 지원.
      extract: { zip: true, tar: true, gz: true, bz2: true, '7z': true, rar: true },
      split: true,
      nativePaths: false
    }
  }

  async pickInputs(kind: 'files' | 'folder'): Promise<InputSource[]> {
    return pickFilesViaInput(kind === 'folder', true)
  }

  // 브라우저는 임의 경로를 노출하지 않으므로 기본 폴더 지정을 지원하지 않는다.
  async pickDirectory(): Promise<string | null> {
    return null
  }

  async pickArchive(): Promise<InputSource | null> {
    const files = await pickArchiveViaInput()
    if (files.length === 0) return null
    if (files.length === 1) {
      const f = files[0]
      return { path: f.name, entryName: f.name, file: f }
    }
    // 다중 선택 → 분할 조각 병합
    return this.mergeParts(files)
  }

  /** 분할 조각 File[] 을 순서대로 이어붙여 하나의 합쳐진 아카이브 InputSource 로 반환. */
  private mergeParts(files: File[]): InputSource {
    const parts = files
      .map((f) => ({ f, meta: parseSplitPart(f.name) }))
      .filter((x) => x.meta !== null)
      .sort((a, b) => a.meta!.index - b.meta!.index)
    if (parts.length === 0) {
      const f = files[0]
      return { path: f.name, entryName: f.name, file: f }
    }
    const base = parts[0].meta!.base
    const merged = new File(
      parts.map((p) => p.f),
      base
    )
    return { path: base, entryName: base, file: merged }
  }

  async compress(
    inputs: InputSource[],
    opts: CompressOptions,
    onProgress: ProgressCallback
  ): Promise<OperationResult> {
    const files = inputs.filter((i) => i.file)
    if (files.length === 0) {
      return { ok: false, outputs: [], warnings: [], error: t.noFiles }
    }

    onProgress({ message: t.compressing, kind: 'count', current: 0, total: files.length })

    let data: Uint8Array
    if (opts.format === 'zip') {
      data = await this.buildZip(files, onProgress)
    } else {
      // tar / tar.gz — tar 생성 후 필요 시 gzip
      const tarData = await this.buildTar(files, onProgress)
      data = opts.format === 'gz' ? await this.gzip(tarData) : tarData
    }

    const baseName = 'archive' + extensionFor(opts.format)

    if (!opts.split) {
      downloadBlob(new Blob([data as BlobPart]), baseName)
      return { ok: true, outputs: [baseName], warnings: [] }
    }

    // 분할: partSizeBytes 단위로 잘라 .001, .002 … 다운로드
    const partSize = opts.splitSizeMb * 1024 * 1024
    const partCount = Math.max(1, Math.ceil(data.length / partSize))
    for (let i = 0; i < partCount; i++) {
      const start = i * partSize
      const chunk = data.subarray(start, Math.min(start + partSize, data.length))
      onProgress({ message: t.splitting, kind: 'bytes', current: start + chunk.length, total: data.length })
      downloadBlob(new Blob([chunk as BlobPart]), partName(baseName, i + 1))
    }
    return { ok: true, outputs: [], partCount, warnings: [] }
  }

  private buildZip(files: InputSource[], onProgress: ProgressCallback): Promise<Uint8Array> {
    return new Promise(async (resolve, reject) => {
      const entries: Zippable = {}
      for (let i = 0; i < files.length; i++) {
        const buf = new Uint8Array(await files[i].file!.arrayBuffer())
        entries[files[i].entryName] = buf
        onProgress({ message: t.compressing, kind: 'count', current: i + 1, total: files.length })
      }
      zip(entries, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)))
    })
  }

  private async buildTar(files: InputSource[], onProgress: ProgressCallback): Promise<Uint8Array> {
    const pack = tarStream.pack()
    const chunks: Uint8Array[] = []
    pack.on('data', (c: Uint8Array) => chunks.push(c))
    const done = new Promise<void>((res, rej) => {
      pack.on('end', res)
      pack.on('error', rej)
    })
    for (let i = 0; i < files.length; i++) {
      const buf = new Uint8Array(await files[i].file!.arrayBuffer())
      await new Promise<void>((res, rej) =>
        pack.entry({ name: files[i].entryName }, buf as any, (e: unknown) => (e ? rej(e) : res()))
      )
      onProgress({ message: t.compressing, kind: 'count', current: i + 1, total: files.length })
    }
    pack.finalize()
    await done
    return concat(chunks)
  }

  private gzip(data: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) =>
      gzip(data, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)))
    )
  }

  async extract(
    archive: InputSource,
    _opts: ExtractOptions,
    onProgress: ProgressCallback
  ): Promise<OperationResult> {
    ensureArchiveInit()
    if (!archive.file) {
      return { ok: false, outputs: [], warnings: [], error: t.error }
    }
    onProgress({ message: t.extracting, kind: 'marquee' })

    const opened = await Archive.open(archive.file)
    const filesArray: Array<{ file: any; path: string }> = await opened.getFilesArray()
    const total = filesArray.length
    const warnings: string[] = []
    const outputs: string[] = []

    // 출력 폴더 선택 가능하면 폴더에 기록, 아니면 개별 다운로드
    const dirHandle = await pickDirectoryHandle()

    for (let i = 0; i < total; i++) {
      const entry = filesArray[i]
      onProgress({
        message: `${t.extracting} (${i + 1}/${total})`,
        kind: 'count',
        current: i + 1,
        total
      })
      try {
        const extracted: File = await entry.file.extract()
        const relPath = (entry.path || '') + extracted.name
        if (dirHandle) {
          const data = new Uint8Array(await extracted.arrayBuffer())
          await writeFileToDir(dirHandle, relPath, data)
        } else {
          downloadBlob(extracted, extracted.name)
        }
        outputs.push(relPath)
      } catch {
        warnings.push(t.accessWarning(entry.path))
      }
    }
    return { ok: true, outputs, warnings }
  }

  async listEntries(archive: InputSource): Promise<ArchiveEntry[]> {
    ensureArchiveInit()
    if (!archive.file) return []
    const opened = await Archive.open(archive.file)
    const filesArray: Array<{ file: any; path: string }> = await opened.getFilesArray()
    return filesArray.map((e) => ({
      name: (e.path || '') + (e.file?.name ?? ''),
      size: e.file?.size ?? 0,
      isDirectory: false
    }))
  }

  // 브라우저는 임의 파일 시스템 탐색을 지원하지 않는다(보안). 파일 선택 다이얼로그로 대체.
  canBrowse(): boolean {
    return false
  }

  async listDrives(): Promise<FsEntry[]> {
    return []
  }

  async listDir(_path: string): Promise<DirListing> {
    return { path: '', parent: null, entries: [] }
  }

  async listEntriesByPath(_path: string): Promise<ArchiveEntry[]> {
    return []
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}
