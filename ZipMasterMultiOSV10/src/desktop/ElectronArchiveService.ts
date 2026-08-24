import { archiveBaseName } from '@core/format'
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
import type { ZipMasterApi } from './preload'

declare global {
  interface Window {
    zipmaster: ZipMasterApi
  }
}

/** 렌더러 측 서비스: preload 브리지를 통해 메인 프로세스 백엔드를 호출. */
export class ElectronArchiveService implements ArchiveService {
  private api = window.zipmaster

  capabilities(): FormatCaps {
    return {
      // 데스크톱은 7za 로 zip/7z/tar/gz/bz2 생성, rar 은 해제만.
      create: { zip: true, tar: true, gz: true, bz2: true, '7z': true, rar: false },
      extract: { zip: true, tar: true, gz: true, bz2: true, '7z': true, rar: true },
      split: true,
      nativePaths: true
    }
  }

  pickInputs(kind: 'files' | 'folder'): Promise<InputSource[]> {
    return this.api.pickInputs(kind)
  }

  pickDirectory(defaultPath?: string): Promise<string | null> {
    return this.api.pickOutputDir(defaultPath)
  }

  pickArchive(): Promise<InputSource | null> {
    return this.api.pickArchive()
  }

  async compress(
    inputs: InputSource[],
    opts: CompressOptions,
    onProgress: ProgressCallback
  ): Promise<OperationResult> {
    // 사용자가 팝업에서 지정한 이름을 우선 사용하고, 없으면 첫 파일/폴더 이름에서 유도.
    const derived = inputs.length > 0 ? archiveBaseName(inputs[0].entryName) : undefined
    const name = opts.baseName?.trim() || derived || 'archive'
    // 팝업에서 폴더를 지정했으면 그 폴더에 바로 저장(충돌 시 " (n)"), 아니면 저장 다이얼로그.
    // (구버전 preload 로 실행 중이면 resolveCompressPath 가 없을 수 있어 저장 다이얼로그로 폴백)
    const outPath =
      opts.outDir && typeof this.api.resolveCompressPath === 'function'
        ? await this.api.resolveCompressPath(opts.outDir, name, opts.format)
        : await this.api.pickSavePath(opts.format, name)
    if (!outPath) return { ok: false, outputs: [], warnings: [], error: '취소되었습니다.' }
    const unsub = this.api.onProgress(onProgress)
    try {
      return await this.api.compress(inputs, outPath, opts)
    } finally {
      unsub()
    }
  }

  async extract(
    archive: InputSource,
    opts: ExtractOptions,
    onProgress: ProgressCallback
  ): Promise<OperationResult> {
    // 폴더가 이미 정해졌으면(store 에서 먼저 선택) 다이얼로그 없이 사용.
    const outDir = opts.outDir || (await this.api.pickOutputDir(opts.defaultOutDir))
    if (!outDir) return { ok: false, outputs: [], warnings: [], error: '취소되었습니다.' }
    const unsub = this.api.onProgress(onProgress)
    try {
      return await this.api.extract(archive.path, outDir, opts)
    } finally {
      unsub()
    }
  }

  listEntries(archive: InputSource): Promise<ArchiveEntry[]> {
    return this.api.listEntries(archive.path)
  }

  canBrowse(): boolean {
    return true
  }

  listDrives(): Promise<FsEntry[]> {
    return this.api.listDrives()
  }

  listDir(path: string): Promise<DirListing> {
    return this.api.listDir(path)
  }

  listEntriesByPath(path: string): Promise<ArchiveEntry[]> {
    return this.api.listEntries(path)
  }

  deletePath(path: string): Promise<void> {
    return this.api.deletePath(path)
  }

  copyPath(src: string, destDir: string): Promise<string> {
    return this.api.copyPath(src, destDir)
  }

  movePath(src: string, destDir: string): Promise<string> {
    return this.api.movePath(src, destDir)
  }

  renamePath(target: string, newName: string): Promise<string> {
    return this.api.renamePath(target, newName)
  }

  startDrag(paths: string[]): void {
    this.api.startDrag(paths)
  }

  copyToClipboard(paths: string[]): void {
    this.api.copyFilesToClipboard(paths)
  }

  cancel(): void {
    this.api.cancel()
  }

  revealPath(target: string): Promise<void> {
    return this.api.revealPath(target)
  }
}
