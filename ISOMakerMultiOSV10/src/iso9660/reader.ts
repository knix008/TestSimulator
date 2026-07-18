import {
  SECTOR,
  decodeAscii,
  decodeJoliet,
  readBothU32Pick,
  readBytes,
  readSector,
  readU8,
  stripVersion,
} from './binary'
import type {
  IsoDirNode,
  IsoExtent,
  IsoFlatEntry,
  IsoNode,
  OpenIsoResult,
} from './types'

const FLAG_ASSOCIATED = 0x04
const FLAG_DIRECTORY = 0x02
const FLAG_MULTI_EXTENT = 0x80

type DirRecord = {
  length: number
  lba: number
  size: number
  flags: number
  name: string
  isDir: boolean
  multiExtent: boolean
  associated: boolean
}

type VolumeChoice = {
  label: string
  rootLba: number
  rootSize: number
  joliet: boolean
  blockSize: number
  volumeBlocks: number
}

export async function openIso(iso: Blob): Promise<OpenIsoResult> {
  if (iso.size < SECTOR * 17) {
    throw new Error('파일이 ISO로 보기에는 너무 작습니다.')
  }

  const volume = await findBestVolume(iso)
  const root: IsoDirNode = { kind: 'dir', name: '', children: new Map() }
  const entries: IsoFlatEntry[] = []
  let totalBytes = 0

  await walkDirectory(iso, volume, root, '', volume.rootLba, volume.rootSize, entries, (n) => {
    totalBytes += n
  })

  entries.sort((a, b) => a.path.localeCompare(b.path))

  return {
    volumeLabel: volume.label || 'ISO',
    root,
    entries,
    totalBytes,
  }
}

export async function readIsoFile(
  iso: Blob,
  extents: IsoExtent[],
  blockSize = SECTOR,
): Promise<Blob> {
  if (!extents.length) return new Blob([])
  if (extents.length === 1) {
    const e = extents[0]!
    const data = await readBytes(iso, e.lba * blockSize, e.size)
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    return new Blob([copy.buffer])
  }
  const parts: ArrayBuffer[] = []
  for (const e of extents) {
    const data = await readBytes(iso, e.lba * blockSize, e.size)
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    parts.push(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength))
  }
  return new Blob(parts)
}

async function findBestVolume(iso: Blob): Promise<VolumeChoice> {
  let primary: VolumeChoice | null = null
  let joliet: VolumeChoice | null = null

  for (let lba = 16; lba < 32; lba++) {
    const sector = await readSector(iso, lba)
    const type = sector[0]
    const id = decodeAscii(sector.subarray(1, 6))
    if (id !== 'CD001') continue
    if (type === 255) break

    const view = new DataView(sector.buffer, sector.byteOffset, sector.byteLength)
    const maxBlocksByFile = Math.max(1, Math.floor(iso.size / SECTOR))
    const volumeBlocks = readBothU32Pick(view, 80, (n) => n > 16 && n <= maxBlocksByFile * 4)
    const blockSize = readBothU16Pick(view, 128, (n) => n === 512 || n === 1024 || n === 2048) || SECTOR
    const label = decodeAscii(sector.subarray(40, 72))
    const rootOffset = 156
    const maxDataBlocks = Math.max(1, Math.floor(iso.size / blockSize))
    const rootLba = readBothU32Pick(
      view,
      rootOffset + 2,
      (n) => n > 0 && n < Math.max(volumeBlocks, maxDataBlocks),
    )
    const maxRootSize = Math.max(blockSize, iso.size - rootLba * blockSize)
    const rootSize = readBothU32Pick(
      view,
      rootOffset + 10,
      (n) => n > 0 && n <= maxRootSize,
    )

    const choice: VolumeChoice = {
      label,
      rootLba,
      rootSize,
      joliet: false,
      blockSize,
      volumeBlocks: Math.max(volumeBlocks, maxDataBlocks),
    }

    if (type === 1) {
      primary = choice
    } else if (type === 2) {
      const esc = sector.subarray(88, 91)
      const isJoliet =
        esc[0] === 0x25 &&
        esc[1] === 0x2f &&
        (esc[2] === 0x40 || esc[2] === 0x43 || esc[2] === 0x45)
      if (isJoliet) {
        joliet = {
          ...choice,
          label: decodeJolietLabel(sector.subarray(40, 72)) || label,
          joliet: true,
        }
      }
    }
  }

  const chosen = joliet ?? primary
  if (!chosen) {
    throw new Error('ISO9660 볼륨 디스크립터를 찾지 못했습니다.')
  }
  return chosen
}

function readBothU16Pick(
  view: DataView,
  offset: number,
  isValid: (n: number) => boolean,
): number {
  const le = view.getUint16(offset, true)
  const be = view.getUint16(offset + 2, false)
  if (le === be) return le
  const leOk = isValid(le)
  const beOk = isValid(be)
  if (leOk && !beOk) return le
  if (beOk && !leOk) return be
  return le
}

function decodeJolietLabel(bytes: Uint8Array): string {
  return decodeJoliet(bytes).trim()
}

function extentFits(
  lba: number,
  size: number,
  isoSize: number,
  blockSize: number,
  volumeBlocks: number,
): boolean {
  if (size < 0) return false
  if (size === 0) return lba >= 0
  if (lba <= 0 || lba >= volumeBlocks) return false
  const start = lba * blockSize
  if (start >= isoSize) return false
  return start + size <= isoSize
}

async function walkDirectory(
  iso: Blob,
  volume: VolumeChoice,
  parent: IsoDirNode,
  parentPath: string,
  lba: number,
  size: number,
  entries: IsoFlatEntry[],
  onFileBytes: (n: number) => void,
): Promise<void> {
  const { blockSize, volumeBlocks } = volume
  if (!extentFits(lba, Math.min(size, blockSize), iso.size, blockSize, volumeBlocks) && size > 0) {
    // Directory extent itself is unreadable — skip quietly.
    return
  }

  const maxBytes = Math.max(0, iso.size - lba * blockSize)
  const readSize = Math.min(size, maxBytes)
  if (readSize <= 0) return

  const data = await readBytes(iso, lba * blockSize, readSize)
  let offset = 0
  let pending: { name: string; extents: IsoExtent[] } | null = null

  const flushPending = () => {
    if (!pending) return
    commitFile(parent, parentPath, pending.name, pending.extents, iso, volume, entries, onFileBytes)
    pending = null
  }

  while (offset < data.length) {
    const recLen = data[offset] ?? 0
    if (recLen === 0) {
      const next = Math.ceil((offset + 1) / blockSize) * blockSize
      if (next <= offset || next >= data.length) break
      offset = next
      continue
    }
    if (offset + recLen > data.length) break

    const record = parseDirRecord(
      data.subarray(offset, offset + recLen),
      volume.joliet,
      iso.size,
      blockSize,
      volumeBlocks,
    )
    offset += recLen

    if (!record || record.name === '.' || record.name === '..') continue
    if (record.associated) continue

    if (record.isDir) {
      flushPending()
      if (!extentFits(record.lba, Math.min(record.size, blockSize), iso.size, blockSize, volumeBlocks)) {
        continue
      }
      const path = parentPath ? `${parentPath}/${record.name}` : record.name
      const child: IsoDirNode = { kind: 'dir', name: record.name, children: new Map() }
      parent.children.set(normalizeKey(record.name), child)
      entries.push({ path, name: record.name, isDir: true, size: 0 })
      await walkDirectory(iso, volume, child, path, record.lba, record.size, entries, onFileBytes)
      continue
    }

    // Multi-extent: consecutive records share the same name; bit0x80 = more follows.
    if (pending && pending.name === record.name) {
      pending.extents.push({ lba: record.lba, size: record.size })
      if (!record.multiExtent) flushPending()
      continue
    }

    flushPending()
    if (record.multiExtent) {
      pending = { name: record.name, extents: [{ lba: record.lba, size: record.size }] }
    } else {
      commitFile(
        parent,
        parentPath,
        record.name,
        [{ lba: record.lba, size: record.size }],
        iso,
        volume,
        entries,
        onFileBytes,
      )
    }
  }

  flushPending()
}

function commitFile(
  parent: IsoDirNode,
  parentPath: string,
  name: string,
  extents: IsoExtent[],
  iso: Blob,
  volume: VolumeChoice,
  entries: IsoFlatEntry[],
  onFileBytes: (n: number) => void,
): void {
  const path = parentPath ? `${parentPath}/${name}` : name
  const totalSize = extents.reduce((sum, e) => sum + e.size, 0)
  const readable = extents.every((e) =>
    extentFits(e.lba, e.size, iso.size, volume.blockSize, volume.volumeBlocks),
  )

  const child = readable
    ? {
        kind: 'file' as const,
        name,
        size: totalSize,
        source: {
          type: 'iso' as const,
          iso,
          extents,
          blockSize: volume.blockSize,
        },
      }
    : {
        kind: 'file' as const,
        name,
        size: totalSize,
        source: {
          type: 'unavailable' as const,
          reason: `ISO 데이터가 잘렸거나 손상되어 읽을 수 없습니다: ${path}`,
        },
      }

  parent.children.set(normalizeKey(name), child)
  entries.push({ path, name, isDir: false, size: totalSize })
  if (readable) onFileBytes(totalSize)
}

function parseDirRecord(
  bytes: Uint8Array,
  joliet: boolean,
  isoSize: number,
  blockSize: number,
  volumeBlocks: number,
): DirRecord | null {
  if (bytes.length < 34) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = readU8(view, 0)
  if (length < 34) return null

  const maxLba = Math.max(1, Math.min(volumeBlocks, Math.floor(isoSize / blockSize) + 1))
  const lba = readBothU32Pick(view, 2, (n) => n < maxLba)
  const maxSize = Math.max(0, isoSize)
  const size = readBothU32Pick(view, 10, (n) => n <= maxSize)
  const flags = readU8(view, 25)
  const nameLen = readU8(view, 32)
  if (33 + nameLen > bytes.length) return null

  const nameBytes = bytes.subarray(33, 33 + nameLen)
  let name: string
  if (nameLen === 1 && nameBytes[0] === 0) name = '.'
  else if (nameLen === 1 && nameBytes[0] === 1) name = '..'
  else name = stripVersion(joliet ? decodeJoliet(nameBytes) : decodeAscii(nameBytes))

  if (!name) return null

  return {
    length,
    lba,
    size,
    flags,
    name,
    isDir: (flags & FLAG_DIRECTORY) !== 0,
    multiExtent: (flags & FLAG_MULTI_EXTENT) !== 0,
    associated: (flags & FLAG_ASSOCIATED) !== 0,
  }
}

export function normalizeKey(name: string): string {
  return name.toLowerCase()
}

export function getNodeAtPath(root: IsoDirNode, path: string): IsoNode | null {
  if (!path || path === '/') return root
  const parts = path.split('/').filter(Boolean)
  let current: IsoNode = root
  for (const part of parts) {
    if (current.kind !== 'dir') return null
    const next = current.children.get(normalizeKey(part))
    if (!next) return null
    current = next
  }
  return current
}

export function listChildren(root: IsoDirNode, dirPath: string): IsoFlatEntry[] {
  const node = getNodeAtPath(root, dirPath)
  if (!node || node.kind !== 'dir') return []
  return [...node.children.values()]
    .map((child) => ({
      path: dirPath ? `${dirPath}/${child.name}` : child.name,
      name: child.name,
      isDir: child.kind === 'dir',
      size: child.kind === 'file' ? child.size : 0,
    }))
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
}
