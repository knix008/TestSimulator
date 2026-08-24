// ISO9660(+Joliet) 리더. 번들된 7za(축소판)가 ISO 를 열지 못하므로 메인 프로세스에서 직접 파싱한다.
// 목록 조회(listIso)와 선택/전체 추출(extractIso)을 지원한다. 표준 ISO9660 와 Joliet(유니코드) 확장을 처리.
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import type { ArchiveEntry, OperationResult, Progress } from '@core/types'

const SECTOR = 2048

/** 파일 앞부분을 읽어 ISO9660 여부를 판별(섹터16, 오프셋 0x8001 의 'CD001'). */
export async function isIso(filePath: string): Promise<boolean> {
  let fh: fs.promises.FileHandle | null = null
  try {
    fh = await fsp.open(filePath, 'r')
    const buf = Buffer.alloc(5)
    // 첫 볼륨 디스크립터의 표준 식별자 위치: 16*2048 + 1
    const { bytesRead } = await fh.read(buf, 0, 5, 16 * SECTOR + 1)
    return bytesRead === 5 && buf.toString('latin1') === 'CD001'
  } catch {
    return false
  } finally {
    await fh?.close().catch(() => {})
  }
}

/** 디렉터리 레코드 하나(파싱 결과). */
interface Record {
  name: string
  isDir: boolean
  lba: number
  size: number
}

/** 8바이트 both-endian 정수에서 LE 값을 읽는다(ISO9660 는 LE→BE 순서로 저장). */
function bothLE32(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off)
}

/** UCS-2 Big-Endian(Joliet) 문자열 디코딩. */
function decodeJoliet(buf: Buffer): string {
  // Node 는 UTF-16LE 만 지원하므로 바이트를 뒤집어 디코딩.
  const swapped = Buffer.alloc(buf.length)
  for (let i = 0; i + 1 < buf.length; i += 2) {
    swapped[i] = buf[i + 1]
    swapped[i + 1] = buf[i]
  }
  return swapped.toString('utf16le')
}

/** 파일 식별자를 사람이 읽는 이름으로 정리(버전 ';1' 및 후행 '.' 제거). */
function cleanName(raw: string): string {
  let s = raw
  const semi = s.indexOf(';')
  if (semi >= 0) s = s.slice(0, semi)
  if (s.endsWith('.')) s = s.slice(0, -1)
  return s
}

/** 한 디렉터리 익스텐트(lba~size)의 레코드들을 파싱. '.'/'..' 는 제외. */
function parseDirRecords(buf: Buffer, joliet: boolean): Record[] {
  const out: Record[] = []
  let off = 0
  while (off < buf.length) {
    const len = buf[off]
    if (len === 0) {
      // 남은 섹터는 0 패딩 — 다음 섹터 경계로 점프.
      const next = Math.floor(off / SECTOR + 1) * SECTOR
      if (next <= off) break
      off = next
      continue
    }
    if (off + len > buf.length) break
    const flags = buf[off + 25]
    const isDir = (flags & 0x02) !== 0
    const lba = bothLE32(buf, off + 2)
    const size = bothLE32(buf, off + 10)
    const idLen = buf[off + 32]
    const idBytes = buf.subarray(off + 33, off + 33 + idLen)
    off += len

    // '.'(0x00) 과 '..'(0x01) 특수 항목은 건너뜀.
    if (idLen === 1 && (idBytes[0] === 0 || idBytes[0] === 1)) continue
    const rawName = joliet ? decodeJoliet(idBytes) : idBytes.toString('latin1')
    const name = isDir ? rawName.replace(/;\d+$/, '') : cleanName(rawName)
    if (!name) continue
    out.push({ name, isDir, lba, size })
  }
  return out
}

/** 지정한 볼륨 디스크립터(PVD/Joliet SVD)의 루트 디렉터리 레코드를 반환. */
function readRootRecord(vd: Buffer): Record {
  const off = 156 // 루트 디렉터리 레코드 위치
  return {
    name: '',
    isDir: true,
    lba: bothLE32(vd, off + 2),
    size: bothLE32(vd, off + 10)
  }
}

/** 볼륨 디스크립터들을 훑어 PVD(type 1)와 Joliet SVD(type 2, UCS-2)를 찾는다. */
async function findVolumeDescriptors(
  fh: fs.promises.FileHandle
): Promise<{ pvd: Buffer | null; joliet: Buffer | null }> {
  let pvd: Buffer | null = null
  let joliet: Buffer | null = null
  for (let i = 0; i < 32; i++) {
    const buf = Buffer.alloc(SECTOR)
    const { bytesRead } = await fh.read(buf, 0, SECTOR, (16 + i) * SECTOR)
    if (bytesRead < SECTOR) break
    if (buf.toString('latin1', 1, 6) !== 'CD001') break
    const type = buf[0]
    if (type === 255) break // 종료 디스크립터
    if (type === 1) pvd = buf
    else if (type === 2) {
      // Joliet 은 escape sequence(offset 88)가 %/@, %/C, %/E.
      const esc = buf.toString('latin1', 88, 91)
      if (esc === '%/@' || esc === '%/C' || esc === '%/E') joliet = buf
    }
  }
  return { pvd, joliet }
}

/** 디렉터리 익스텐트 전체를 읽어 Buffer 로 반환. */
async function readExtent(fh: fs.promises.FileHandle, lba: number, size: number): Promise<Buffer> {
  const buf = Buffer.alloc(size)
  await fh.read(buf, 0, size, lba * SECTOR)
  return buf
}

const MAX_ENTRIES = 200000

/** ISO 내부의 전체 항목 목록(상대 경로, 폴더 포함). */
export async function listIso(filePath: string): Promise<ArchiveEntry[]> {
  const fh = await fsp.open(filePath, 'r')
  try {
    const { pvd, joliet } = await findVolumeDescriptors(fh)
    const vd = joliet ?? pvd
    if (!vd) throw new Error('유효한 ISO9660 볼륨을 찾을 수 없습니다.')
    const useJoliet = joliet !== null

    const entries: ArchiveEntry[] = []
    const root = readRootRecord(vd)
    // BFS 로 디렉터리 순회(prefix = 상대 경로).
    const queue: Array<{ rec: Record; prefix: string }> = [{ rec: root, prefix: '' }]
    while (queue.length > 0) {
      const { rec, prefix } = queue.shift()!
      const data = await readExtent(fh, rec.lba, rec.size)
      for (const child of parseDirRecords(data, useJoliet)) {
        const rel = prefix ? `${prefix}/${child.name}` : child.name
        entries.push({ name: rel, size: child.isDir ? 0 : child.size, isDirectory: child.isDir })
        if (entries.length >= MAX_ENTRIES) return entries
        if (child.isDir) queue.push({ rec: child, prefix: rel })
      }
    }
    return entries
  } finally {
    await fh.close().catch(() => {})
  }
}

/** 파일 익스텐트를 대상 경로로 스트리밍 저장. */
async function writeFile(
  fh: fs.promises.FileHandle,
  lba: number,
  size: number,
  destPath: string
): Promise<void> {
  await fsp.mkdir(path.dirname(destPath), { recursive: true })
  const out = fs.createWriteStream(destPath)
  try {
    let remaining = size
    let pos = lba * SECTOR
    const chunk = Buffer.alloc(Math.min(size, 1 << 20) || 1)
    while (remaining > 0) {
      const want = Math.min(remaining, chunk.length)
      const { bytesRead } = await fh.read(chunk, 0, want, pos)
      if (bytesRead <= 0) break
      await new Promise<void>((resolve, reject) =>
        out.write(chunk.subarray(0, bytesRead), (e) => (e ? reject(e) : resolve()))
      )
      remaining -= bytesRead
      pos += bytesRead
    }
  } finally {
    await new Promise<void>((resolve) => out.end(resolve))
  }
}

/**
 * ISO 를 outDir 로 추출. selection 이 있으면 해당 내부 경로(파일 또는 폴더 하위 전체)만 추출.
 */
export async function extractIso(
  filePath: string,
  outDir: string,
  selection: string[] | undefined,
  onProgress: (p: Progress) => void,
  isCancelled?: () => boolean
): Promise<OperationResult> {
  const fh = await fsp.open(filePath, 'r')
  try {
    const { pvd, joliet } = await findVolumeDescriptors(fh)
    const vd = joliet ?? pvd
    if (!vd) throw new Error('유효한 ISO9660 볼륨을 찾을 수 없습니다.')
    const useJoliet = joliet !== null

    // 선택 필터: 정확히 일치하거나 그 하위(폴더 선택)면 추출.
    const sel = selection && selection.length > 0 ? selection : null
    const wanted = (rel: string): boolean =>
      !sel || sel.some((s) => rel === s || rel.startsWith(s + '/'))

    // 추출 대상 파일 목록 수집.
    const files: Record[] = []
    const rels: string[] = []
    const root = readRootRecord(vd)
    const queue: Array<{ rec: Record; prefix: string }> = [{ rec: root, prefix: '' }]
    while (queue.length > 0) {
      const { rec, prefix } = queue.shift()!
      const data = await readExtent(fh, rec.lba, rec.size)
      for (const child of parseDirRecords(data, useJoliet)) {
        const rel = prefix ? `${prefix}/${child.name}` : child.name
        if (child.isDir) {
          queue.push({ rec: child, prefix: rel })
          // 빈 폴더도 만들 수 있도록 선택된 폴더는 미리 생성.
          if (wanted(rel)) await fsp.mkdir(path.join(outDir, rel), { recursive: true }).catch(() => {})
        } else if (wanted(rel)) {
          files.push(child)
          rels.push(rel)
        }
      }
    }

    const total = files.length
    for (let i = 0; i < total; i++) {
      if (isCancelled?.()) return { ok: false, outputs: [], warnings: [], error: '취소되었습니다.' }
      onProgress({ message: rels[i], kind: 'count', current: i + 1, total })
      const dest = path.join(outDir, rels[i])
      await writeFile(fh, files[i].lba, files[i].size, dest)
    }
    return { ok: true, outputs: [outDir], warnings: [] }
  } finally {
    await fh.close().catch(() => {})
  }
}
