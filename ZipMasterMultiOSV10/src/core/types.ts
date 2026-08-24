// 플랫폼(웹/데스크톱) 공용 타입 정의.

/** 지원 압축 포맷. */
export type ArchiveFormat = 'zip' | 'tar' | 'gz' | 'bz2' | '7z' | 'rar'

/** 진행률 스냅샷 — 참고 앱의 ProgressSnapshot(개수/바이트/marquee) 3종을 이식. */
export interface Progress {
  /** 상태 메시지 (한국어). */
  message: string
  /** 진행률 종류. count=개수, bytes=바이트 비율, marquee=불확정. */
  kind: 'count' | 'bytes' | 'marquee'
  /** 현재 값 (count/bytes). */
  current?: number
  /** 전체 값 (count/bytes). */
  total?: number
}

export type ProgressCallback = (p: Progress) => void

/** 압축 옵션. */
export interface CompressOptions {
  format: ArchiveFormat
  /** 용량 분할 사용 여부. */
  split: boolean
  /** 분할당 크기(MB). split 이 true 일 때만 사용. */
  splitSizeMb: number
  /** 선택적 비밀번호(7z/zip). 미지원 플랫폼에서는 무시. */
  password?: string
}

/** 해제 옵션. */
export interface ExtractOptions {
  /** 덮어쓰기 여부. */
  overwrite: boolean
  password?: string
  /** 지정 시 해당 아카이브 내부 경로들만 선택적으로 해제한다(미지정=전체). */
  selection?: string[]
}

/** 아카이브 내 항목 정보. */
export interface ArchiveEntry {
  name: string
  size: number
  isDirectory: boolean
}

/** 압축/해제 작업 결과. */
export interface OperationResult {
  ok: boolean
  /** 결과 산출물 경로들(데스크톱) 또는 다운로드된 파일명들(웹). */
  outputs: string[]
  /** 분할 시 생성된 조각 수. */
  partCount?: number
  /** 접근 불가 등 경고 메시지. */
  warnings: string[]
  /** 실패 시 오류 메시지. */
  error?: string
}

/** 포맷별 기능 지원 여부 — UI 활성/비활성 판단에 사용. */
export interface FormatCaps {
  /** 각 포맷의 생성 가능 여부. */
  create: Record<ArchiveFormat, boolean>
  /** 각 포맷의 해제 가능 여부. */
  extract: Record<ArchiveFormat, boolean>
  /** 분할 압축 지원 여부. */
  split: boolean
  /** 네이티브 파일 경로 사용 가능 여부(데스크톱=true, 웹=false). */
  nativePaths: boolean
}

/** 파일 시스템 탐색 항목(왼쪽 디렉터리 트리용). */
export interface FsEntry {
  name: string
  /** 절대 경로(드라이브 포함). */
  path: string
  isDirectory: boolean
  /** 압축 파일로 인식되는지 여부. */
  isArchive: boolean
  size: number
}

/** 디렉터리 목록 결과. */
export interface DirListing {
  /** 현재 경로. */
  path: string
  /** 상위 경로(루트/드라이브 목록이면 null). */
  parent: string | null
  entries: FsEntry[]
}

/** 압축 입력 소스. 데스크톱은 경로, 웹은 File 객체를 사용. */
export interface InputSource {
  /** 데스크톱: 절대 경로. 웹: 파일명(경로 없음). */
  path: string
  /** 아카이브 내부에 기록될 상대 경로(엔트리명). */
  entryName: string
  /** 웹 전용: 실제 파일 데이터. */
  file?: File
  /** 디렉터리 여부(데스크톱 폴더 압축 시). */
  isDirectory?: boolean
}
