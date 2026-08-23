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
} from './types'

/**
 * 플랫폼 독립 아카이브 서비스 인터페이스.
 * 웹은 WebArchiveService, 데스크톱은 ElectronArchiveService 로 구현되며
 * UI 는 이 인터페이스만 소비한다(런타임 주입).
 */
export interface ArchiveService {
  /** 이 플랫폼에서 지원되는 포맷/기능. */
  capabilities(): FormatCaps

  /**
   * 압축할 파일/폴더를 선택한다.
   * @param kind 'files' 다중 파일 선택, 'folder' 폴더 선택.
   */
  pickInputs(kind: 'files' | 'folder'): Promise<InputSource[]>

  /** 해제할 아카이브 파일을 선택한다. 웹은 File 을 InputSource.file 에 담는다. */
  pickArchive(): Promise<InputSource | null>

  /**
   * 압축을 수행한다.
   * @param inputs 압축 대상 소스들.
   * @param opts 포맷/분할 옵션.
   * @param onProgress 진행률 콜백.
   */
  compress(
    inputs: InputSource[],
    opts: CompressOptions,
    onProgress: ProgressCallback
  ): Promise<OperationResult>

  /**
   * 해제를 수행한다. 분할 조각(.001) 선택 시 자동 병합 후 해제한다.
   * @param archive 해제할 아카이브.
   * @param opts 해제 옵션.
   * @param onProgress 진행률 콜백.
   */
  extract(
    archive: InputSource,
    opts: ExtractOptions,
    onProgress: ProgressCallback
  ): Promise<OperationResult>

  /** 아카이브 내용 목록을 반환한다. */
  listEntries(archive: InputSource): Promise<ArchiveEntry[]>

  /** 파일 시스템 탐색(왼쪽 디렉터리 트리) 지원 여부. 웹은 false. */
  canBrowse(): boolean

  /** 드라이브/루트 목록. */
  listDrives(): Promise<FsEntry[]>

  /** 특정 경로의 하위 항목 목록. path 가 빈 문자열이면 드라이브 목록을 반환. */
  listDir(path: string): Promise<DirListing>

  /** 경로로부터 아카이브 내용 목록(왼쪽에서 선택된 파일의 내부 보기). */
  listEntriesByPath(path: string): Promise<ArchiveEntry[]>
}
