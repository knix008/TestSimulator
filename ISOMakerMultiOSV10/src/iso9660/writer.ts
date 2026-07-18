import {
  SECTOR,
  encodeAsciiPadded,
  encodeJolietName,
  iso9660FileId,
  writeBothU16,
  writeBothU32,
  writeU8,
  writeU16LE,
} from './binary'
import type { IsoDirNode, IsoFileNode, IsoNode } from './types'

export type WriteProgress = {
  phase: string
  percent: number
  message: string
}

type PlannedFile = {
  path: string
  node: IsoFileNode
  lba: number
  size: number
}

type PlannedDir = {
  path: string
  node: IsoDirNode
  lba: number
  size: number
}

/**
 * Build an ISO9660 + Joliet image from a virtual directory tree.
 * File payloads stay as Blob slices when possible (large-ISO friendly).
 * Note: Web rebuild is a data image; boot catalogs from the original are not preserved.
 */
export async function writeIso(
  root: IsoDirNode,
  volumeLabel: string,
  onProgress?: (p: WriteProgress) => void,
): Promise<Blob> {
  const label = sanitizeLabel(volumeLabel)
  const dirs: PlannedDir[] = []
  const files: PlannedFile[] = []
  collect(root, '', dirs, files)

  let nextLba = 19

  for (const dir of dirs) {
    dir.lba = nextLba
    dir.size = estimateDirSize(dir, false)
    nextLba += sectorsFor(dir.size)
  }

  const pathTableSize = 10
  const pathTableLba = nextLba
  nextLba += 1
  const pathTableMLba = nextLba
  nextLba += 1

  const jolietDirs: PlannedDir[] = dirs.map((d) => ({
    path: d.path,
    node: d.node,
    lba: 0,
    size: estimateDirSize(d, true),
  }))
  for (const dir of jolietDirs) {
    dir.lba = nextLba
    nextLba += sectorsFor(dir.size)
  }

  const jolietPathLba = nextLba
  nextLba += 1
  const jolietPathMLba = nextLba
  nextLba += 1

  for (const file of files) {
    file.lba = nextLba
    nextLba += sectorsFor(Math.max(file.size, 1))
  }

  const volumeSectors = nextLba
  const parts: Blob[] = []

  onProgress?.({ phase: 'write', percent: 5, message: '볼륨 헤더 작성…' })

  parts.push(toBlob(new Uint8Array(16 * SECTOR)))

  const pvd = blankSector()
  writePrimaryVolume(pvd, label, dirs[0]!, pathTableLba, pathTableMLba, pathTableSize, volumeSectors)
  parts.push(toBlob(pvd))

  const svd = blankSector()
  writeJolietVolume(svd, label, jolietDirs[0]!, jolietPathLba, jolietPathMLba, pathTableSize, volumeSectors)
  parts.push(toBlob(svd))

  const term = blankSector()
  term[0] = 255
  writeAscii(term, 1, 'CD001')
  term[6] = 1
  parts.push(toBlob(term))

  // Fill directory / path-table region as one packed buffer for correct LBAs
  const metaStart = 19
  const filesStart = files[0]?.lba ?? volumeSectors
  const metaSectors = filesStart - metaStart
  const meta = new Uint8Array(metaSectors * SECTOR)

  writePathTableInto(meta, pathTableLba - metaStart, dirs[0]!.lba, false)
  writePathTableInto(meta, pathTableMLba - metaStart, dirs[0]!.lba, true)
  writePathTableInto(meta, jolietPathLba - metaStart, jolietDirs[0]!.lba, false)
  writePathTableInto(meta, jolietPathMLba - metaStart, jolietDirs[0]!.lba, true)
  writeDirectoryRecordsInto(meta, metaStart, dirs, files, false)
  writeDirectoryRecordsInto(meta, metaStart, jolietDirs, files, true)
  parts.push(toBlob(meta))

  onProgress?.({ phase: 'write', percent: 20, message: '파일 데이터 연결…' })

  const totalFiles = Math.max(files.length, 1)
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!
    onProgress?.({
      phase: 'write',
      percent: 20 + Math.round((i / totalFiles) * 75),
      message: `파일 포함: ${file.path}`,
    })
    parts.push(await filePayload(file))
    const padded = sectorsFor(Math.max(file.size, 1)) * SECTOR - Math.max(file.size, 1)
    // empty files still occupy one sector
    if (file.size === 0) {
      parts.push(toBlob(new Uint8Array(SECTOR)))
    } else if (padded > 0) {
      parts.push(toBlob(new Uint8Array(padded)))
    }
  }

  onProgress?.({ phase: 'write', percent: 100, message: 'ISO 작성 완료' })
  return new Blob(parts, { type: 'application/x-iso9660-image' })
}

async function filePayload(file: PlannedFile): Promise<Blob> {
  if (file.size === 0) return new Blob([])
  const src = file.node.source
  if (src.type === 'blob') {
    return src.blob.slice(0, file.size)
  }
  if (src.type === 'unavailable') {
    throw new Error(src.reason)
  }
  if (src.extents.length === 1) {
    const e = src.extents[0]!
    const block = src.blockSize || SECTOR
    return src.iso.slice(e.lba * block, e.lba * block + e.size)
  }
  const parts: Blob[] = []
  const block = src.blockSize || SECTOR
  for (const e of src.extents) {
    parts.push(src.iso.slice(e.lba * block, e.lba * block + e.size))
  }
  return new Blob(parts)
}

function toBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer])
}

function collect(
  node: IsoDirNode,
  path: string,
  dirs: PlannedDir[],
  files: PlannedFile[],
): void {
  dirs.push({ path, node, lba: 0, size: 0 })
  for (const child of sortedChildren(node)) {
    const childPath = path ? `${path}/${child.name}` : child.name
    if (child.kind === 'dir') collect(child, childPath, dirs, files)
    else files.push({ path: childPath, node: child, lba: 0, size: child.size })
  }
}

function sortedChildren(node: IsoDirNode): IsoNode[] {
  return [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function estimateDirSize(dir: PlannedDir, joliet: boolean): number {
  let size = 34 + 34
  for (const child of sortedChildren(dir.node)) {
    const id = joliet ? encodeJolietName(child.name) : iso9660FileId(child.name, child.kind === 'dir')
    let rec = 33 + id.length
    if (rec % 2 === 1) rec += 1
    size += rec
  }
  return Math.max(SECTOR, Math.ceil(size / SECTOR) * SECTOR)
}

function sectorsFor(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / SECTOR))
}

function writePrimaryVolume(
  sector: Uint8Array,
  label: string,
  root: PlannedDir,
  pathL: number,
  pathM: number,
  pathSize: number,
  volumeSectors: number,
): void {
  sector[0] = 1
  writeAscii(sector, 1, 'CD001')
  sector[6] = 1
  writeAscii(sector, 8, 'ISOMAKER')
  writeAscii(sector, 40, label.padEnd(32).slice(0, 32))
  writeBothU32(sector, 80, volumeSectors)
  writeBothU16(sector, 120, 1)
  writeBothU16(sector, 124, 1)
  writeBothU16(sector, 128, SECTOR)
  writeBothU32(sector, 132, pathSize)
  writeU32LEOnly(sector, 140, pathL)
  writeU32LEOnly(sector, 148, pathM)
  writeDirectoryRecord(sector, 156, root.lba, root.size, 0x02, new Uint8Array([0]))
  writeAscii(sector, 881, 'ISOMAKER')
}

function writeJolietVolume(
  sector: Uint8Array,
  label: string,
  root: PlannedDir,
  pathL: number,
  pathM: number,
  pathSize: number,
  volumeSectors: number,
): void {
  sector[0] = 2
  writeAscii(sector, 1, 'CD001')
  sector[6] = 1
  writeAscii(sector, 8, 'ISOMAKER')
  const jolietLabel = encodeJolietName(label.slice(0, 16))
  sector.set(jolietLabel.subarray(0, Math.min(32, jolietLabel.length)), 40)
  writeBothU32(sector, 80, volumeSectors)
  sector[88] = 0x25
  sector[89] = 0x2f
  sector[90] = 0x40
  writeBothU16(sector, 120, 1)
  writeBothU16(sector, 124, 1)
  writeBothU16(sector, 128, SECTOR)
  writeBothU32(sector, 132, pathSize)
  writeU32LEOnly(sector, 140, pathL)
  writeU32LEOnly(sector, 148, pathM)
  writeDirectoryRecord(sector, 156, root.lba, root.size, 0x02, new Uint8Array([0]))
}

function writePathTableInto(meta: Uint8Array, sectorIndex: number, rootDirLba: number, msb: boolean): void {
  const buf = meta.subarray(sectorIndex * SECTOR, sectorIndex * SECTOR + SECTOR)
  buf[0] = 1
  buf[1] = 0
  if (msb) {
    buf[2] = (rootDirLba >>> 24) & 0xff
    buf[3] = (rootDirLba >>> 16) & 0xff
    buf[4] = (rootDirLba >>> 8) & 0xff
    buf[5] = rootDirLba & 0xff
    buf[6] = 0
    buf[7] = 1
  } else {
    writeU32LEOnly(buf, 2, rootDirLba)
    writeU16LE(buf, 6, 1)
  }
  buf[8] = 0
}

function writeDirectoryRecordsInto(
  meta: Uint8Array,
  metaStartLba: number,
  dirs: PlannedDir[],
  files: PlannedFile[],
  joliet: boolean,
): void {
  const byPath = new Map(dirs.map((d) => [d.path, d]))

  for (const dir of dirs) {
    const local = (dir.lba - metaStartLba) * SECTOR
    const buf = meta.subarray(local, local + dir.size)
    let offset = 0
    const parentPath = parentOf(dir.path)
    const parent = parentPath === null ? dir : (byPath.get(parentPath) ?? dir)

    offset = putDirRecord(buf, offset, dir.lba, dir.size, 0x02, new Uint8Array([0]))
    offset = putDirRecord(buf, offset, parent.lba, parent.size, 0x02, new Uint8Array([1]))

    for (const child of sortedChildren(dir.node)) {
      const childPath = dir.path ? `${dir.path}/${child.name}` : child.name
      if (child.kind === 'dir') {
        const planned = byPath.get(childPath)
        if (!planned) continue
        const id = joliet ? encodeJolietName(child.name) : iso9660FileId(child.name, true)
        offset = putDirRecord(buf, offset, planned.lba, planned.size, 0x02, id)
      } else {
        const planned = files.find((f) => f.path === childPath)
        if (!planned) continue
        const id = joliet ? encodeJolietName(child.name) : iso9660FileId(child.name, false)
        offset = putDirRecord(buf, offset, planned.lba, planned.size, 0x00, id)
      }
    }
  }
}

function putDirRecord(
  buf: Uint8Array,
  offset: number,
  lba: number,
  size: number,
  flags: number,
  id: Uint8Array,
): number {
  let recLen = 33 + id.length
  if (recLen % 2 === 1) recLen += 1
  if (offset + recLen > buf.length) return offset
  writeDirectoryRecord(buf, offset, lba, size, flags, id)
  return offset + recLen
}

function writeDirectoryRecord(
  buf: Uint8Array,
  offset: number,
  lba: number,
  size: number,
  flags: number,
  id: Uint8Array,
): void {
  let recLen = 33 + id.length
  if (recLen % 2 === 1) recLen += 1
  writeU8(buf, offset, recLen)
  writeU8(buf, offset + 1, 0)
  writeBothU32(buf, offset + 2, lba)
  writeBothU32(buf, offset + 10, size)
  writeU8(buf, offset + 25, flags)
  writeBothU16(buf, offset + 28, 1)
  writeU8(buf, offset + 32, id.length)
  buf.set(id, offset + 33)
}

function blankSector(): Uint8Array {
  return new Uint8Array(SECTOR)
}

function writeAscii(buf: Uint8Array, offset: number, text: string): void {
  buf.set(encodeAsciiPadded(text, text.length, 0), offset)
}

function writeU32LEOnly(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >>> 8) & 0xff
  buf[offset + 2] = (value >>> 16) & 0xff
  buf[offset + 3] = (value >>> 24) & 0xff
}

function sanitizeLabel(label: string): string {
  return (label || 'ISOMAKER').replace(/[^\w.-]+/g, '_').slice(0, 32)
}

function parentOf(path: string): string | null {
  if (!path) return null
  const idx = path.lastIndexOf('/')
  if (idx < 0) return ''
  return path.slice(0, idx)
}
