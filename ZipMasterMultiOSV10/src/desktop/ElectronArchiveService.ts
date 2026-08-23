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

  pickArchive(): Promise<InputSource | null> {
    return this.api.pickArchive()
  }

  async compress(
    inputs: InputSource[],
    opts: CompressOptions,
    onProgress: ProgressCallback
  ): Promise<OperationResult> {
    const outPath = await this.api.pickSavePath(opts.format)
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
    const outDir = await this.api.pickOutputDir()
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
}
