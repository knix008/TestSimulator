import type { ArchiveFormat } from './types'

/** 확장자 → 포맷 매핑. 복합 확장자(.tar.gz 등) 우선 처리. */
export function detectFormat(fileName: string): ArchiveFormat | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'gz'
  if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) return 'bz2'
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.7z')) return '7z'
  if (lower.endsWith('.rar')) return 'rar'
  if (lower.endsWith('.tar')) return 'tar'
  if (lower.endsWith('.gz')) return 'gz'
  if (lower.endsWith('.bz2')) return 'bz2'
  return null
}

/** 포맷 → 기본 확장자. */
export function extensionFor(format: ArchiveFormat): string {
  switch (format) {
    case 'zip':
      return '.zip'
    case 'tar':
      return '.tar'
    case 'gz':
      return '.tar.gz'
    case 'bz2':
      return '.tar.bz2'
    case '7z':
      return '.7z'
    case 'rar':
      return '.rar'
  }
}

/** 분할 조각 파일명 패턴: <base>.001, .002 … (참고 앱 {0}.{1:D3} 호환, 모든 확장자로 일반화). */
export const SPLIT_PART_REGEX = /^(.*)\.(\d{3})$/i

/** 파일명이 분할 조각인지 판별하고 베이스명을 반환. */
export function parseSplitPart(fileName: string): { base: string; index: number } | null {
  const m = SPLIT_PART_REGEX.exec(fileName)
  if (!m) return null
  return { base: m[1], index: parseInt(m[2], 10) }
}

/** i 번째(1-base) 분할 조각 파일명 생성. */
export function partName(base: string, index: number): string {
  return `${base}.${String(index).padStart(3, '0')}`
}

/** 포맷 라벨(UI 표시용). */
export const FORMAT_LABELS: Record<ArchiveFormat, string> = {
  zip: 'ZIP (.zip)',
  tar: 'TAR (.tar)',
  gz: 'TAR.GZ (.tar.gz)',
  bz2: 'TAR.BZ2 (.tar.bz2)',
  '7z': '7-Zip (.7z)',
  rar: 'RAR (.rar)'
}

export const ALL_FORMATS: ArchiveFormat[] = ['zip', 'tar', 'gz', 'bz2', '7z', 'rar']

/** 사람이 읽는 바이트 표기. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}
