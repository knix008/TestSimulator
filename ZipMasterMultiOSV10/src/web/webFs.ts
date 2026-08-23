// 브라우저 파일 입출력 헬퍼 (네이티브 경로가 없는 웹 환경).

import type { InputSource } from '@core/types'

/** 숨겨진 <input type=file> 로 파일들을 선택. webkitdirectory=true 면 폴더. */
export function pickFilesViaInput(directory: boolean, multiple: boolean): Promise<InputSource[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    if (directory) {
      // 폴더 선택 (Chromium 계열)
      ;(input as any).webkitdirectory = true
    }
    input.style.display = 'none'
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      const sources: InputSource[] = files.map((f) => ({
        // webkitRelativePath 가 있으면 폴더 구조 유지, 없으면 파일명만.
        path: f.name,
        entryName: (f as any).webkitRelativePath || f.name,
        file: f
      }))
      document.body.removeChild(input)
      resolve(sources)
    }
    // 취소 시에도 정리되도록 focus 복귀 후 비어있으면 제거는 onchange 미발생 → 방치 방지
    input.oncancel = () => {
      if (input.parentNode) document.body.removeChild(input)
      resolve([])
    }
    document.body.appendChild(input)
    input.click()
  })
}

/**
 * 아카이브 파일 선택. 분할 조각을 위해 다중 선택을 허용한다.
 * 조각(.001, .002 …) 여러 개를 선택하면 호출부에서 병합한다.
 */
export function pickArchiveViaInput(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.zip,.7z,.rar,.tar,.gz,.tgz,.bz2,.tbz2,.001,.002,.003'
    input.style.display = 'none'
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      document.body.removeChild(input)
      resolve(files)
    }
    input.oncancel = () => {
      if (input.parentNode) document.body.removeChild(input)
      resolve([])
    }
    document.body.appendChild(input)
    input.click()
  })
}

/** Blob 을 파일명으로 다운로드. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** File System Access API 사용 가능 여부. */
export function hasDirectoryPicker(): boolean {
  return typeof (window as any).showDirectoryPicker === 'function'
}

/** 폴더를 선택해 여러 파일을 기록. 미지원 시 null 반환(→ 개별 다운로드 폴백). */
export async function pickDirectoryHandle(): Promise<any | null> {
  if (!hasDirectoryPicker()) return null
  try {
    return await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  } catch {
    return null
  }
}

/** 디렉터리 핸들에 상대경로로 파일 기록(중간 폴더 자동 생성). */
export async function writeFileToDir(
  dirHandle: any,
  relativePath: string,
  data: Uint8Array | Blob
): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean)
  const fileName = parts.pop()!
  let handle = dirHandle
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part, { create: true })
  }
  const fileHandle = await handle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}
