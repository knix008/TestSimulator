import { SECTOR, writeBothU16, writeBothU32, writeU16BE, writeU16LE, writeU32BE, writeU32LE } from './binary'
import type { IsoDirNode, IsoFileNode, IsoNode } from './types'

/**
 * ISO9660 (ECMA-119, level 1 names) + Joliet image from a virtual directory tree.
 *
 * Layout: 16 system sectors · PVD (16) · Joliet SVD (17) · terminator (18) · path tables
 * (primary L, primary M, Joliet L, Joliet M) · primary directories · Joliet directories ·
 * file data. Both trees point at the same file data.
 *
 * What other readers check (xorriso/libisofs, Windows' mounter, macOS, Linux):
 *  - descriptor text fields padded with spaces, dates as 16 digits + a time-zone byte,
 *    file structure version (byte 881) = 1, the type-M path table location big-endian;
 *  - path tables list every directory, parents first, children by identifier;
 *  - directory records never cross a sector boundary, sorted by identifier, the first two
 *    are "." and "..";
 *  - identifiers unique inside a directory (8.3 names are made unique with ~N).
 *
 * File payloads stay as Blob slices when possible (large-ISO friendly). This is a data image:
 * boot catalogs of the original are not kept. Files must be under 4 GiB each (single extent).
 */
export type WriteProgress = {
  phase: string
  percent: number
  message: string
}

/** Optional reader for `{ type: 'path' }` sources (desktop / Node only). */
export type PathFileReader = (absolutePath: string) => Promise<Blob>

type Entry = {
  /** ISO9660 (d-chars, ;1 for files) and Joliet (UCS-2 BE) identifiers */
  isoId: Uint8Array
  jolietId: Uint8Array
  node: IsoNode
  dir?: Dir
  file?: FileOut
}

type Dir = {
  path: string
  node: IsoDirNode
  parent: Dir | null
  entries: Entry[]
  /** 1-based number in the path table (same order for both trees) */
  number: number
  isoLba: number
  isoSize: number
  jolietLba: number
  jolietSize: number
}

type FileOut = { path: string; node: IsoFileNode; lba: number; size: number }

const MAX_FILE = 0xffffffff

export async function writeIso(
  root: IsoDirNode,
  volumeLabel: string,
  onProgress?: (p: WriteProgress) => void,
  signal?: AbortSignal,
  readPathFile?: PathFileReader,
): Promise<Blob> {
  throwIfAborted(signal)
  const label = sanitizeLabel(volumeLabel)
  const now = new Date()

  // ── Plan the trees ──
  const files: FileOut[] = []
  const rootDir = planDir(root, '', null, files)
  const dirs = pathTableOrder(rootDir)
  dirs.forEach((d, i) => (d.number = i + 1))
  for (const f of files) {
    if (f.size > MAX_FILE) throw new Error(`File too large for a single ISO9660 extent (4 GiB): ${f.path}`)
  }

  const isoPt = pathTable(dirs, false)
  const jolietPt = pathTable(dirs, true)
  const isoPtSectors = sectorsFor(isoPt.size)
  const jolietPtSectors = sectorsFor(jolietPt.size)

  let lba = 19
  const isoPtL = lba
  lba += isoPtSectors
  const isoPtM = lba
  lba += isoPtSectors
  const jolietPtL = lba
  lba += jolietPtSectors
  const jolietPtM = lba
  lba += jolietPtSectors

  for (const d of dirs) {
    d.isoSize = dirBytes(d, false)
    d.isoLba = lba
    lba += d.isoSize / SECTOR
  }
  for (const d of dirs) {
    d.jolietSize = dirBytes(d, true)
    d.jolietLba = lba
    lba += d.jolietSize / SECTOR
  }
  const metaEnd = lba
  for (const f of files) {
    if (f.size === 0) {
      f.lba = 0
      continue
    }
    f.lba = lba
    lba += sectorsFor(f.size)
  }
  const volumeSectors = lba

  onProgress?.({ phase: 'write', percent: 5, message: '볼륨 헤더 작성…' })
  throwIfAborted(signal)

  // ── Descriptors and metadata in one buffer (sectors 0 … metaEnd-1) ──
  const meta = new Uint8Array(metaEnd * SECTOR)
  const sector = (n: number) => meta.subarray(n * SECTOR, (n + 1) * SECTOR)

  writeDescriptor(sector(16), false, label, now, volumeSectors, isoPt.size, isoPtL, isoPtM, rootDir)
  writeDescriptor(sector(17), true, label, now, volumeSectors, jolietPt.size, jolietPtL, jolietPtM, rootDir)
  const term = sector(18)
  term[0] = 255
  ascii(term, 1, 'CD001')
  term[6] = 1

  meta.set(pathTableBytes(dirs, false, false, isoPt.size), isoPtL * SECTOR)
  meta.set(pathTableBytes(dirs, false, true, isoPt.size), isoPtM * SECTOR)
  meta.set(pathTableBytes(dirs, true, false, jolietPt.size), jolietPtL * SECTOR)
  meta.set(pathTableBytes(dirs, true, true, jolietPt.size), jolietPtM * SECTOR)

  for (const d of dirs) {
    writeDirectory(meta, d, false, now)
    writeDirectory(meta, d, true, now)
  }

  const parts: Blob[] = [toBlob(meta)]

  onProgress?.({ phase: 'write', percent: 20, message: '파일 데이터 연결…' })
  const data = files.filter((f) => f.size > 0).sort((a, b) => a.lba - b.lba)
  const total = Math.max(data.length, 1)
  for (let i = 0; i < data.length; i++) {
    throwIfAborted(signal)
    const file = data[i]!
    onProgress?.({ phase: 'write', percent: 20 + Math.round((i / total) * 75), message: `파일 포함: ${file.path}` })
    const payload = await filePayload(file, readPathFile)
    if (payload.size !== file.size) throw new Error(`Size changed while saving: ${file.path} (${payload.size} ≠ ${file.size})`)
    parts.push(payload)
    const pad = sectorsFor(file.size) * SECTOR - file.size
    if (pad > 0) parts.push(new Blob([new Uint8Array(pad)]))
  }

  onProgress?.({ phase: 'write', percent: 100, message: 'ISO 작성 완료' })
  return new Blob(parts, { type: 'application/x-iso9660-image' })
}

// ── Planning ──────────────────────────────────────────────────

function planDir(node: IsoDirNode, path: string, parent: Dir | null, files: FileOut[]): Dir {
  const dir: Dir = { path, node, parent, entries: [], number: 0, isoLba: 0, isoSize: 0, jolietLba: 0, jolietSize: 0 }
  const children = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))
  const isoUsed = new Set<string>()
  const jolietUsed = new Set<string>()
  for (const child of children) {
    const childPath = path ? `${path}/${child.name}` : child.name
    const isDir = child.kind === 'dir'
    const entry: Entry = {
      isoId: asciiBytes(uniqueIsoName(child.name, isDir, isoUsed)),
      jolietId: ucs2(uniqueJolietName(child.name, jolietUsed)),
      node: child,
    }
    if (isDir) entry.dir = planDir(child as IsoDirNode, childPath, dir, files)
    else {
      entry.file = { path: childPath, node: child as IsoFileNode, lba: 0, size: (child as IsoFileNode).size }
      files.push(entry.file)
    }
    dir.entries.push(entry)
  }
  return dir
}

/** Path table order: by depth, then by parent number, then by identifier. */
function pathTableOrder(root: Dir): Dir[] {
  const out: Dir[] = [root]
  for (let i = 0; i < out.length; i++) {
    const subdirs = out[i]!.entries.filter((e) => e.dir).sort((a, b) => compareBytes(a.isoId, b.isoId))
    for (const e of subdirs) out.push(e.dir!)
  }
  return out
}

/** ISO9660 level 1: d-characters, 8.3 for files (with ";1"), 8 for directories; unique. */
function uniqueIsoName(name: string, isDir: boolean, used: Set<string>): string {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  let base: string
  let ext = ''
  if (isDir) base = clean(name).slice(0, 8) || '_'
  else {
    const dot = name.lastIndexOf('.')
    base = clean(dot > 0 ? name.slice(0, dot) : name).slice(0, 8) || '_'
    ext = dot > 0 ? clean(name.slice(dot + 1)).slice(0, 3) : ''
  }
  const make = (b: string) => (isDir ? b : `${b}.${ext}`)
  let candidate = make(base)
  for (let n = 1; used.has(candidate); n++) {
    const suffix = `~${n}`
    candidate = make(base.slice(0, 8 - suffix.length) + suffix)
  }
  used.add(candidate)
  return isDir ? candidate : `${candidate};1`
}

/** Joliet: up to 64 UCS-2 characters, without * / : ; ? \ ; unique. */
function uniqueJolietName(name: string, used: Set<string>): string {
  let clean = name.replace(/[*/:;?\\]/g, '_')
  if ([...clean].length > 64) {
    const dot = clean.lastIndexOf('.')
    const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : ''
    clean = clean.slice(0, 64 - ext.length) + ext
  }
  let candidate = clean
  for (let n = 1; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`
    const dot = clean.lastIndexOf('.')
    const ext = dot > 0 ? clean.slice(dot) : ''
    const stem = dot > 0 ? clean.slice(0, dot) : clean
    candidate = stem.slice(0, 64 - ext.length - suffix.length) + suffix + ext
  }
  used.add(candidate.toLowerCase())
  return candidate
}

// ── Sizes ─────────────────────────────────────────────────────

function recordLength(idLength: number): number {
  const len = 33 + idLength
  return len % 2 === 1 ? len + 1 : len
}

function sortedEntries(dir: Dir, joliet: boolean): Entry[] {
  return [...dir.entries].sort((a, b) => compareBytes(joliet ? a.jolietId : a.isoId, joliet ? b.jolietId : b.isoId))
}

/** A directory's bytes: records never cross a sector boundary. */
function dirBytes(dir: Dir, joliet: boolean): number {
  let offset = 34 * 2
  for (const e of sortedEntries(dir, joliet)) {
    const len = recordLength((joliet ? e.jolietId : e.isoId).length)
    if ((offset % SECTOR) + len > SECTOR) offset = Math.ceil(offset / SECTOR) * SECTOR
    offset += len
  }
  return Math.max(1, Math.ceil(offset / SECTOR)) * SECTOR
}

function pathTable(dirs: Dir[], joliet: boolean): { size: number } {
  let size = 0
  for (const d of dirs) {
    const idLen = d.parent ? idOf(d, joliet).length : 1
    size += 8 + idLen + (idLen % 2)
  }
  return { size }
}

function idOf(dir: Dir, joliet: boolean): Uint8Array {
  const entry = dir.parent!.entries.find((e) => e.dir === dir)!
  return joliet ? entry.jolietId : entry.isoId
}

// ── Writing ───────────────────────────────────────────────────

function pathTableBytes(dirs: Dir[], joliet: boolean, msb: boolean, size: number): Uint8Array {
  const out = new Uint8Array(sectorsFor(size) * SECTOR)
  let o = 0
  for (const d of dirs) {
    const id = d.parent ? idOf(d, joliet) : new Uint8Array([0])
    out[o] = id.length
    out[o + 1] = 0
    const lba = joliet ? d.jolietLba : d.isoLba
    const parentNumber = d.parent ? d.parent.number : 1
    if (msb) {
      writeU32BE(out, o + 2, lba)
      writeU16BE(out, o + 6, parentNumber)
    } else {
      writeU32LE(out, o + 2, lba)
      writeU16LE(out, o + 6, parentNumber)
    }
    out.set(id, o + 8)
    o += 8 + id.length + (id.length % 2)
  }
  return out
}

function writeDirectory(meta: Uint8Array, dir: Dir, joliet: boolean, now: Date): void {
  const lba = joliet ? dir.jolietLba : dir.isoLba
  const size = joliet ? dir.jolietSize : dir.isoSize
  const buf = meta.subarray(lba * SECTOR, lba * SECTOR + size)
  const parent = dir.parent ?? dir
  let o = 0
  o += dirRecord(buf, o, lba, size, 0x02, new Uint8Array([0]), now)
  o += dirRecord(buf, o, joliet ? parent.jolietLba : parent.isoLba, joliet ? parent.jolietSize : parent.isoSize, 0x02, new Uint8Array([1]), now)
  for (const e of sortedEntries(dir, joliet)) {
    const id = joliet ? e.jolietId : e.isoId
    const len = recordLength(id.length)
    if ((o % SECTOR) + len > SECTOR) o = Math.ceil(o / SECTOR) * SECTOR
    if (e.dir) {
      const d = e.dir
      o += dirRecord(buf, o, joliet ? d.jolietLba : d.isoLba, joliet ? d.jolietSize : d.isoSize, 0x02, id, mtimeOf(e.node, now))
    } else {
      o += dirRecord(buf, o, e.file!.lba, e.file!.size, 0x00, id, mtimeOf(e.node, now))
    }
  }
}

function dirRecord(buf: Uint8Array, o: number, lba: number, size: number, flags: number, id: Uint8Array, date: Date): number {
  const len = recordLength(id.length)
  buf[o] = len
  buf[o + 1] = 0
  writeBothU32(buf, o + 2, lba)
  writeBothU32(buf, o + 10, size)
  recordDate(buf, o + 18, date)
  buf[o + 25] = flags
  buf[o + 26] = 0
  buf[o + 27] = 0
  writeBothU16(buf, o + 28, 1)
  buf[o + 32] = id.length
  buf.set(id, o + 33)
  return len
}

function writeDescriptor(
  s: Uint8Array,
  joliet: boolean,
  label: string,
  now: Date,
  volumeSectors: number,
  ptSize: number,
  ptL: number,
  ptM: number,
  root: Dir,
): void {
  s[0] = joliet ? 2 : 1
  ascii(s, 1, 'CD001')
  s[6] = 1
  const text = (offset: number, length: number, value: string) => {
    if (joliet) ucs2Field(s, offset, length, value)
    else ascii(s, offset, value.padEnd(length, ' ').slice(0, length))
  }
  text(8, 32, '')
  text(40, 32, joliet ? label.slice(0, 16) : label.toUpperCase())
  writeBothU32(s, 80, volumeSectors)
  if (joliet) {
    // UCS-2 level 3
    s[88] = 0x25
    s[89] = 0x2f
    s[90] = 0x45
  }
  writeBothU16(s, 120, 1)
  writeBothU16(s, 124, 1)
  writeBothU16(s, 128, SECTOR)
  writeBothU32(s, 132, ptSize)
  writeU32LE(s, 140, ptL)
  writeU32LE(s, 144, 0)
  writeU32BE(s, 148, ptM)
  writeU32BE(s, 152, 0)
  dirRecord(s, 156, joliet ? root.jolietLba : root.isoLba, joliet ? root.jolietSize : root.isoSize, 0x02, new Uint8Array([0]), now)
  text(190, 128, '')
  text(318, 128, '')
  text(446, 128, '')
  text(574, 128, 'MYISOMAKER')
  text(702, 37, '')
  text(739, 37, '')
  text(776, 37, '')
  descriptorDate(s, 813, now)
  descriptorDate(s, 830, now)
  descriptorDate(s, 847, null)
  descriptorDate(s, 864, null)
  s[881] = 1
}

// ── Small helpers ─────────────────────────────────────────────

function mtimeOf(node: IsoNode, fallback: Date): Date {
  const m = (node as { mtime?: Date | number | string }).mtime
  if (m instanceof Date && !Number.isNaN(m.getTime())) return m
  if (typeof m === 'number' || typeof m === 'string') {
    const d = new Date(m)
    if (!Number.isNaN(d.getTime())) return d
  }
  return fallback
}

/** 7-byte directory record date, UTC. */
function recordDate(buf: Uint8Array, o: number, d: Date): void {
  buf[o] = Math.max(0, Math.min(255, d.getUTCFullYear() - 1900))
  buf[o + 1] = d.getUTCMonth() + 1
  buf[o + 2] = d.getUTCDate()
  buf[o + 3] = d.getUTCHours()
  buf[o + 4] = d.getUTCMinutes()
  buf[o + 5] = d.getUTCSeconds()
  buf[o + 6] = 0
}

/** 17-byte descriptor date: "YYYYMMDDHHMMSScc" + time-zone byte; unset = sixteen '0' and 0. */
function descriptorDate(buf: Uint8Array, o: number, d: Date | null): void {
  const p = (n: number, w: number) => String(n).padStart(w, '0')
  const text = d
    ? `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}00`
    : '0000000000000000'
  ascii(buf, o, text)
  buf[o + 16] = 0
}

function ascii(buf: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) buf[offset + i] = text.charCodeAt(i) & 0x7f
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  ascii(out, 0, text)
  return out
}

function ucs2(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    out[i * 2] = (c >>> 8) & 0xff
    out[i * 2 + 1] = c & 0xff
  }
  return out
}

/** A Joliet text field: UCS-2 BE, padded with spaces (00 20). */
function ucs2Field(buf: Uint8Array, offset: number, length: number, text: string): void {
  for (let i = 0; i + 1 < length; i += 2) {
    const c = i / 2 < text.length ? text.charCodeAt(i / 2) : 0x20
    buf[offset + i] = (c >>> 8) & 0xff
    buf[offset + i + 1] = c & 0xff
  }
  if (length % 2 === 1) buf[offset + length - 1] = 0
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
  return a.length - b.length
}

function sectorsFor(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / SECTOR))
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('JOB_CANCELED')
}

async function filePayload(file: FileOut, readPathFile?: PathFileReader): Promise<Blob> {
  if (file.size === 0) return new Blob([])
  const src = file.node.source
  if (src.type === 'blob') return src.blob.slice(0, file.size)
  if (src.type === 'unavailable') throw new Error(src.reason)
  if (src.type === 'path') {
    if (!readPathFile) throw new Error(`경로 소스는 데스크톱에서만 저장할 수 있습니다: ${src.absolutePath}`)
    return (await readPathFile(src.absolutePath)).slice(0, file.size)
  }
  const block = src.blockSize || SECTOR
  if (src.extents.length === 1) {
    const e = src.extents[0]!
    return src.iso.slice(e.lba * block, e.lba * block + e.size)
  }
  return new Blob(src.extents.map((e) => src.iso.slice(e.lba * block, e.lba * block + e.size)))
}

function toBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer])
}

function sanitizeLabel(label: string): string {
  return (label || 'ISOMAKER').toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 32) || 'ISOMAKER'
}
