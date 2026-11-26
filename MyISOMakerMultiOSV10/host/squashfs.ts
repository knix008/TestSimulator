/**
 * SquashFS 4.0 — reading and writing without squashfs-tools (AppImages are a runtime + SquashFS).
 *
 * Reader: gzip (zlib) and zstd compression (what AppImages use), fragments, basic and extended
 * inodes for directories, files and symlinks. Other compressions (xz, lzo, lz4, lzma) throw
 * UNSUPPORTED_COMPRESSION, and the caller falls back to unsquashfs.
 *
 * Writer: block size 128 KiB, data blocks zlib-compressed (stored when that is not smaller),
 * no fragments, metadata stored uncompressed, one id (0 = root) for uid/gid, extended directory
 * inodes. Layout: superblock · data · inode table · directory table · id table · its index.
 * All table offsets are relative to the start of the SquashFS (it follows the runtime in an
 * AppImage).
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const MAGIC = 0x73717368
const META = 8192
const NO_FRAGMENT = 0xffffffff
const UNCOMPRESSED_BLOCK = 1 << 24

// ── Reading ───────────────────────────────────────────────────

type Super = {
  inodeCount: number
  blockSize: number
  fragCount: number
  compression: number
  flags: number
  idCount: number
  rootInode: bigint
  bytesUsed: bigint
  idTable: bigint
  inodeTable: bigint
  dirTable: bigint
  fragTable: bigint
  exportTable: bigint
}

type ReadFile = { fd: number; base: number }

function readAt(f: ReadFile, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(len)
  let got = 0
  while (got < len) {
    const n = fs.readSync(f.fd, buf, got, len - got, f.base + pos + got)
    if (n <= 0) break
    got += n
  }
  return buf.subarray(0, got)
}

export class SquashError extends Error {
  constructor(public code: 'NOT_SQUASHFS' | 'UNSUPPORTED_COMPRESSION' | 'CORRUPT', message: string) {
    super(message)
  }
}

function decompressor(id: number): (b: Buffer) => Buffer {
  if (id === 1) return (b) => zlib.inflateSync(b)
  if (id === 6) {
    const z = zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer }
    if (z.zstdDecompressSync) return (b) => z.zstdDecompressSync!(b)
  }
  const names: Record<number, string> = { 2: 'lzma', 3: 'lzo', 4: 'xz', 5: 'lz4', 6: 'zstd' }
  throw new SquashError('UNSUPPORTED_COMPRESSION', `SquashFS compression "${names[id] ?? id}" is not built in`)
}

function readSuper(f: ReadFile): Super {
  const b = readAt(f, 0, 96)
  if (b.length < 96 || b.readUInt32LE(0) !== MAGIC) throw new SquashError('NOT_SQUASHFS', 'No SquashFS superblock')
  if (b.readUInt16LE(28) !== 4) throw new SquashError('CORRUPT', `SquashFS version ${b.readUInt16LE(28)} (4 expected)`)
  return {
    inodeCount: b.readUInt32LE(4),
    blockSize: b.readUInt32LE(12),
    fragCount: b.readUInt32LE(16),
    compression: b.readUInt16LE(20),
    flags: b.readUInt16LE(24),
    idCount: b.readUInt16LE(26),
    rootInode: b.readBigUInt64LE(32),
    bytesUsed: b.readBigUInt64LE(40),
    idTable: b.readBigUInt64LE(48),
    inodeTable: b.readBigUInt64LE(64),
    dirTable: b.readBigUInt64LE(72),
    fragTable: b.readBigUInt64LE(80),
    exportTable: b.readBigUInt64LE(88),
  }
}

/** A metadata table (inode / directory) read whole: offset of each block → position in `data`. */
function readMetaTable(f: ReadFile, start: number, end: number, inflate: (b: Buffer) => Buffer) {
  const parts: Buffer[] = []
  const blockPos = new Map<number, number>()
  let pos = start
  let out = 0
  while (pos < end) {
    const h = readAt(f, pos, 2)
    if (h.length < 2) break
    const header = h.readUInt16LE(0)
    const size = header & 0x7fff
    const raw = readAt(f, pos + 2, size)
    const data = header & 0x8000 ? raw : inflate(raw)
    blockPos.set(pos - start, out)
    parts.push(data)
    out += data.length
    pos += 2 + size
  }
  return { data: Buffer.concat(parts), blockPos }
}

/** Reads one metadata block anywhere (fragment / id tables). */
function readMetaBlock(f: ReadFile, pos: number, inflate: (b: Buffer) => Buffer): Buffer {
  const header = readAt(f, pos, 2).readUInt16LE(0)
  const raw = readAt(f, pos + 2, header & 0x7fff)
  return header & 0x8000 ? raw : inflate(raw)
}

type Inode =
  | { kind: 'dir'; mode: number; mtime: number; block: number; offset: number; size: number }
  | { kind: 'file'; mode: number; mtime: number; start: bigint; size: bigint; frag: number; fragOffset: number; blocks: number[] }
  | { kind: 'symlink'; mode: number; mtime: number; target: string }
  | { kind: 'other'; mode: number; mtime: number }

export type SquashEntry = { path: string; kind: 'dir' | 'file' | 'symlink'; size: number; mode: number; target?: string }

/** Opens the SquashFS at `offset` in `file`; `walk` lists it, `extractTo` writes it out. */
export function openSquashfs(file: string, offset = 0) {
  const f: ReadFile = { fd: fs.openSync(file, 'r'), base: offset }
  try {
    const sb = readSuper(f)
    const inflate = decompressor(sb.compression)
    const ends = [sb.dirTable, sb.fragTable, sb.exportTable, sb.idTable, sb.bytesUsed]
      .map(Number)
      .filter((v) => v > 0 && v !== 0xffffffffffffffff && Number.isFinite(v))
    const inodes = readMetaTable(f, Number(sb.inodeTable), Number(sb.dirTable), inflate)
    const dirEnd = Math.min(...ends.filter((v) => v > Number(sb.dirTable)))
    const dirs = readMetaTable(f, Number(sb.dirTable), dirEnd, inflate)

    // Fragment table: u64 pointers to metadata blocks of 16-byte entries.
    const fragments: { start: bigint; size: number }[] = []
    if (sb.fragCount > 0) {
      const blocks = Math.ceil(sb.fragCount / 512)
      const index = readAt(f, Number(sb.fragTable), blocks * 8)
      for (let i = 0; i < blocks; i++) {
        const meta = readMetaBlock(f, Number(index.readBigUInt64LE(i * 8)), inflate)
        for (let o = 0; o + 16 <= meta.length && fragments.length < sb.fragCount; o += 16) {
          fragments.push({ start: meta.readBigUInt64LE(o), size: meta.readUInt32LE(o + 8) })
        }
      }
    }

    const inodeAt = (ref: bigint): Inode => {
      const block = Number(ref >> 16n)
      const off = Number(ref & 0xffffn)
      const base = inodes.blockPos.get(block)
      if (base === undefined) throw new SquashError('CORRUPT', `Bad inode reference ${ref}`)
      const b = inodes.data
      let p = base + off
      const type = b.readUInt16LE(p)
      const mode = b.readUInt16LE(p + 2)
      const mtime = b.readUInt32LE(p + 8)
      p += 16
      const blockList = (size: bigint, frag: number) => {
        const full = frag === NO_FRAGMENT ? Math.ceil(Number(size) / sb.blockSize) : Math.floor(Number(size) / sb.blockSize)
        const list: number[] = []
        for (let i = 0; i < full; i++) list.push(b.readUInt32LE(p + i * 4))
        return list
      }
      switch (type) {
        case 1:
          return { kind: 'dir', mode, mtime, block: b.readUInt32LE(p), size: b.readUInt16LE(p + 8), offset: b.readUInt16LE(p + 10) }
        case 8:
          return { kind: 'dir', mode, mtime, size: b.readUInt32LE(p + 4), block: b.readUInt32LE(p + 8), offset: b.readUInt16LE(p + 18) }
        case 2: {
          const start = BigInt(b.readUInt32LE(p))
          const frag = b.readUInt32LE(p + 4)
          const fragOffset = b.readUInt32LE(p + 8)
          const size = BigInt(b.readUInt32LE(p + 12))
          p += 16
          return { kind: 'file', mode, mtime, start, size, frag, fragOffset, blocks: blockList(size, frag) }
        }
        case 9: {
          const start = b.readBigUInt64LE(p)
          const size = b.readBigUInt64LE(p + 8)
          const frag = b.readUInt32LE(p + 28)
          const fragOffset = b.readUInt32LE(p + 32)
          p += 40
          return { kind: 'file', mode, mtime, start, size, frag, fragOffset, blocks: blockList(size, frag) }
        }
        case 3:
        case 10: {
          const len = b.readUInt32LE(p + 4)
          return { kind: 'symlink', mode, mtime, target: b.subarray(p + 8, p + 8 + len).toString('utf8') }
        }
        default:
          return { kind: 'other', mode, mtime }
      }
    }

    const listDir = (ino: Extract<Inode, { kind: 'dir' }>): { name: string; ref: bigint }[] => {
      const base = dirs.blockPos.get(ino.block)
      if (base === undefined) throw new SquashError('CORRUPT', 'Bad directory reference')
      const b = dirs.data
      let p = base + ino.offset
      const end = p + ino.size - 3
      const out: { name: string; ref: bigint }[] = []
      while (p < end) {
        const count = b.readUInt32LE(p) + 1
        const start = b.readUInt32LE(p + 4)
        p += 12
        for (let i = 0; i < count && p < end; i++) {
          const off = b.readUInt16LE(p)
          const nameLen = b.readUInt16LE(p + 6) + 1
          const name = b.subarray(p + 8, p + 8 + nameLen).toString('utf8')
          out.push({ name, ref: (BigInt(start) << 16n) | BigInt(off) })
          p += 8 + nameLen
        }
      }
      return out
    }

    const readFileData = (ino: Extract<Inode, { kind: 'file' }>, write: (chunk: Buffer) => void) => {
      let pos = Number(ino.start)
      let left = Number(ino.size)
      for (const entry of ino.blocks) {
        const stored = (entry & UNCOMPRESSED_BLOCK) !== 0
        const len = entry & ~UNCOMPRESSED_BLOCK
        const want = Math.min(sb.blockSize, left)
        if (len === 0) {
          write(Buffer.alloc(want))
        } else {
          const raw = readAt(f, pos, len)
          const data = stored ? raw : inflate(raw)
          write(data.subarray(0, want))
          pos += len
        }
        left -= want
      }
      if (left > 0 && ino.frag !== NO_FRAGMENT) {
        const fr = fragments[ino.frag]
        if (!fr) throw new SquashError('CORRUPT', `Missing fragment ${ino.frag}`)
        const stored = (fr.size & UNCOMPRESSED_BLOCK) !== 0
        const raw = readAt(f, Number(fr.start), fr.size & ~UNCOMPRESSED_BLOCK)
        const data = stored ? raw : inflate(raw)
        write(data.subarray(ino.fragOffset, ino.fragOffset + left))
      }
    }

    const walk = (visit: (e: SquashEntry, ino: Inode) => void) => {
      const rec = (ref: bigint, rel: string) => {
        const ino = inodeAt(ref)
        if (ino.kind !== 'dir') return
        for (const child of listDir(ino)) {
          const childRel = rel ? `${rel}/${child.name}` : child.name
          const c = inodeAt(child.ref)
          if (c.kind === 'dir') {
            visit({ path: childRel, kind: 'dir', size: 0, mode: c.mode }, c)
            rec(child.ref, childRel)
          } else if (c.kind === 'file') visit({ path: childRel, kind: 'file', size: Number(c.size), mode: c.mode }, c)
          else if (c.kind === 'symlink') visit({ path: childRel, kind: 'symlink', size: 0, mode: c.mode, target: c.target }, c)
        }
      }
      rec(sb.rootInode, '')
    }

    return {
      superblock: sb,
      list(): SquashEntry[] {
        const out: SquashEntry[] = []
        walk((e) => out.push(e))
        return out
      },
      readFile(rel: string): Buffer {
        let found: Buffer | null = null
        walk((e, ino) => {
          if (found || e.path !== rel || ino.kind !== 'file') return
          const parts: Buffer[] = []
          readFileData(ino, (c) => parts.push(c))
          found = Buffer.concat(parts)
        })
        if (!found) throw new Error(`Not in the image: ${rel}`)
        return found
      },
      /** Writes the tree under `dest`. Symlinks become small text files on Windows. */
      extractTo(dest: string): number {
        let count = 0
        fs.mkdirSync(dest, { recursive: true })
        walk((e, ino) => {
          const target = path.join(dest, ...e.path.split('/'))
          if (!target.startsWith(path.resolve(dest))) return
          if (e.kind === 'dir') fs.mkdirSync(target, { recursive: true })
          else if (e.kind === 'symlink') {
            fs.mkdirSync(path.dirname(target), { recursive: true })
            if (process.platform === 'win32') fs.writeFileSync(target, `symlink → ${e.target}\n`)
            else {
              try {
                fs.symlinkSync(e.target!, target)
              } catch {
                fs.writeFileSync(target, `symlink → ${e.target}\n`)
              }
            }
          } else if (ino.kind === 'file') {
            fs.mkdirSync(path.dirname(target), { recursive: true })
            const fd = fs.openSync(target, 'w')
            try {
              readFileData(ino, (c) => fs.writeSync(fd, c))
            } finally {
              fs.closeSync(fd)
            }
            if (process.platform !== 'win32') fs.chmodSync(target, e.mode & 0o777)
          }
          count += 1
        })
        return count
      },
      close() {
        fs.closeSync(f.fd)
      },
    }
  }
  catch (err) {
    fs.closeSync(f.fd)
    throw err
  }
}

// ── Writing ───────────────────────────────────────────────────

export type SquashSource =
  | { kind: 'dir'; name: string; children: SquashSource[]; mode?: number }
  | { kind: 'file'; name: string; path?: string; data?: Buffer; size: number; mode?: number }
  | { kind: 'symlink'; name: string; target: string }

/** A directory on disk as a SquashSource tree (Windows has no exec bits: AppRun, *.sh, bin/ get 0755). */
export function sourceFromDisk(dir: string, name = ''): Extract<SquashSource, { kind: 'dir' }> {
  const children: SquashSource[] = []
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name)
    if (d.isSymbolicLink()) {
      try {
        children.push({ kind: 'symlink', name: d.name, target: fs.readlinkSync(p) })
      } catch {
        /* unreadable link */
      }
      continue
    }
    if (d.isDirectory()) children.push(sourceFromDisk(p, d.name))
    else if (d.isFile()) {
      const st = fs.statSync(p)
      let mode = st.mode & 0o777
      if (process.platform === 'win32') {
        const exec = d.name === 'AppRun' || /\.(sh|AppImage)$/i.test(d.name) || /[\\/](s?bin)$/i.test(dir)
        mode = exec ? 0o755 : 0o644
      }
      children.push({ kind: 'file', name: d.name, path: p, size: st.size, mode })
    }
  }
  return { kind: 'dir', name, children, mode: 0o755 }
}

type WNode = {
  src: SquashSource
  number: number
  ref: bigint
  children: WNode[]
  parent: WNode | null
  // files
  blocksStart?: number
  blocks?: number[]
  // dirs
  listing?: Buffer
  dirPos?: number
}

/**
 * Writes `root` as a SquashFS into `fd` at `base` (file offset); returns its size in bytes
 * (padded to 4 KiB). Data goes out as it is read, so large trees need little memory.
 */
export function writeSquashfs(fd: number, base: number, root: Extract<SquashSource, { kind: 'dir' }>, onFile?: (p: string) => void): number {
  const BLOCK = 128 * 1024
  const now = Math.floor(Date.now() / 1000)
  let pos = 96 // after the superblock
  const put = (b: Buffer) => {
    fs.writeSync(fd, b, 0, b.length, base + pos)
    pos += b.length
  }

  // Tree with post-order numbering (children before parents, root last).
  const nodes: WNode[] = []
  const build = (src: SquashSource, parent: WNode | null): WNode => {
    const n: WNode = { src, number: 0, ref: 0n, children: [], parent }
    if (src.kind === 'dir') {
      const sorted = [...src.children].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))
      n.children = sorted.map((c) => build(c, n))
    }
    nodes.push(n)
    n.number = nodes.length
    return n
  }
  const rootNode = build(root, null)

  // Data blocks
  for (const n of nodes) {
    if (n.src.kind !== 'file') continue
    n.blocksStart = pos
    n.blocks = []
    const src = n.src
    let fdIn = -1
    try {
      if (src.path) fdIn = fs.openSync(src.path, 'r')
      for (let off = 0; off < src.size; off += BLOCK) {
        const len = Math.min(BLOCK, src.size - off)
        let chunk: Buffer
        if (src.data) chunk = src.data.subarray(off, off + len)
        else {
          chunk = Buffer.alloc(len)
          fs.readSync(fdIn, chunk, 0, len, off)
        }
        const packed = zlib.deflateSync(chunk, { level: 6 })
        if (packed.length < chunk.length) {
          put(packed)
          n.blocks.push(packed.length)
        } else {
          put(chunk)
          n.blocks.push(chunk.length | UNCOMPRESSED_BLOCK)
        }
      }
    } finally {
      if (fdIn >= 0) fs.closeSync(fdIn)
    }
    onFile?.(src.path ?? src.name)
  }

  // Inode sizes → references (uncompressed metadata blocks: 2-byte header + 8192 bytes)
  const inodeSize = (n: WNode): number => {
    const s = n.src
    if (s.kind === 'dir') return 16 + 24
    if (s.kind === 'symlink') return 16 + 8 + Buffer.byteLength(s.target)
    const big = (n.blocksStart ?? 0) > 0xffffffff || s.size > 0xffffffff
    return 16 + (big ? 40 : 16) + 4 * (n.blocks?.length ?? 0)
  }
  const refOf = (streamPos: number) => (BigInt(Math.floor(streamPos / META) * (META + 2)) << 16n) | BigInt(streamPos % META)
  let ip = 0
  for (const n of nodes) {
    n.ref = refOf(ip)
    ip += inodeSize(n)
  }

  // Directory listings (headers group entries of one inode block, max 256 each)
  let dp = 0
  for (const n of nodes) {
    if (n.src.kind !== 'dir') continue
    const parts: Buffer[] = []
    let i = 0
    while (i < n.children.length) {
      const start = Number(n.children[i]!.ref >> 16n)
      const baseNumber = n.children[i]!.number
      const group: WNode[] = []
      while (
        i < n.children.length &&
        group.length < 256 &&
        Number(n.children[i]!.ref >> 16n) === start &&
        Math.abs(n.children[i]!.number - baseNumber) < 32767
      ) {
        group.push(n.children[i]!)
        i++
      }
      const h = Buffer.alloc(12)
      h.writeUInt32LE(group.length - 1, 0)
      h.writeUInt32LE(start, 4)
      h.writeUInt32LE(baseNumber, 8)
      parts.push(h)
      for (const c of group) {
        const name = Buffer.from(c.src.name)
        const e = Buffer.alloc(8)
        e.writeUInt16LE(Number(c.ref & 0xffffn), 0)
        e.writeInt16LE(c.number - baseNumber, 2)
        e.writeUInt16LE(c.src.kind === 'dir' ? 1 : c.src.kind === 'symlink' ? 3 : 2, 4)
        e.writeUInt16LE(name.length - 1, 6)
        parts.push(e, name)
      }
    }
    n.listing = Buffer.concat(parts)
    n.dirPos = dp
    dp += n.listing.length
  }

  // Inode table bytes
  const inodeBuf = Buffer.alloc(ip)
  let o = 0
  for (const n of nodes) {
    const s = n.src
    const type = s.kind === 'dir' ? 8 : s.kind === 'symlink' ? 3 : (n.blocksStart ?? 0) > 0xffffffff || (s as { size: number }).size > 0xffffffff ? 9 : 2
    const mode = s.kind === 'dir' ? 0o40000 | (s.mode ?? 0o755) : s.kind === 'symlink' ? 0o120000 | 0o777 : 0o100000 | (s.mode ?? 0o644)
    inodeBuf.writeUInt16LE(type, o)
    inodeBuf.writeUInt16LE(mode & 0xffff, o + 2)
    inodeBuf.writeUInt16LE(0, o + 4)
    inodeBuf.writeUInt16LE(0, o + 6)
    inodeBuf.writeUInt32LE(now, o + 8)
    inodeBuf.writeUInt32LE(n.number, o + 12)
    let p = o + 16
    if (s.kind === 'dir') {
      const dirBlock = Math.floor(n.dirPos! / META) * (META + 2)
      inodeBuf.writeUInt32LE(2 + n.children.filter((c) => c.src.kind === 'dir').length, p)
      inodeBuf.writeUInt32LE(n.listing!.length + 3, p + 4)
      inodeBuf.writeUInt32LE(dirBlock, p + 8)
      inodeBuf.writeUInt32LE(n.parent ? n.parent.number : nodes.length + 1, p + 12)
      inodeBuf.writeUInt16LE(0, p + 16)
      inodeBuf.writeUInt16LE(n.dirPos! % META, p + 18)
      inodeBuf.writeUInt32LE(0xffffffff, p + 20)
      p += 24
    } else if (s.kind === 'symlink') {
      const t = Buffer.from(s.target)
      inodeBuf.writeUInt32LE(1, p)
      inodeBuf.writeUInt32LE(t.length, p + 4)
      t.copy(inodeBuf, p + 8)
      p += 8 + t.length
    } else if (type === 9) {
      inodeBuf.writeBigUInt64LE(BigInt(n.blocksStart!), p)
      inodeBuf.writeBigUInt64LE(BigInt(s.size), p + 8)
      inodeBuf.writeBigUInt64LE(0n, p + 16)
      inodeBuf.writeUInt32LE(1, p + 24)
      inodeBuf.writeUInt32LE(NO_FRAGMENT, p + 28)
      inodeBuf.writeUInt32LE(0, p + 32)
      inodeBuf.writeUInt32LE(0xffffffff, p + 36)
      p += 40
      for (const b of n.blocks!) {
        inodeBuf.writeUInt32LE(b >>> 0, p)
        p += 4
      }
    } else {
      inodeBuf.writeUInt32LE(n.blocksStart!, p)
      inodeBuf.writeUInt32LE(NO_FRAGMENT, p + 4)
      inodeBuf.writeUInt32LE(0, p + 8)
      inodeBuf.writeUInt32LE(s.size, p + 12)
      p += 16
      for (const b of n.blocks!) {
        inodeBuf.writeUInt32LE(b >>> 0, p)
        p += 4
      }
    }
    o = p
  }

  const metaBlocks = (data: Buffer) => {
    const parts: Buffer[] = []
    for (let i = 0; i < data.length; i += META) {
      const chunk = data.subarray(i, i + META)
      const h = Buffer.alloc(2)
      h.writeUInt16LE(0x8000 | chunk.length, 0)
      parts.push(h, chunk)
    }
    return Buffer.concat(parts)
  }

  const inodeTable = pos
  put(metaBlocks(inodeBuf))
  const dirTable = pos
  put(metaBlocks(Buffer.concat(nodes.filter((n) => n.listing).map((n) => n.listing!))))
  const fragTable = pos // no fragments: an empty index
  const idBlock = pos
  const ids = Buffer.alloc(4)
  put(metaBlocks(ids))
  const idTable = pos
  const idIndex = Buffer.alloc(8)
  idIndex.writeBigUInt64LE(BigInt(idBlock), 0)
  put(idIndex)
  const bytesUsed = pos

  const sb = Buffer.alloc(96)
  sb.writeUInt32LE(MAGIC, 0)
  sb.writeUInt32LE(nodes.length, 4)
  sb.writeUInt32LE(now, 8)
  sb.writeUInt32LE(BLOCK, 12)
  sb.writeUInt32LE(0, 16)
  sb.writeUInt16LE(1, 20) // gzip (zlib)
  sb.writeUInt16LE(17, 22) // log2(128 KiB)
  // UNCOMPRESSED_INODES | NO_FRAGMENTS | NO_XATTRS | UNCOMPRESSED_IDS (0x0800)
  sb.writeUInt16LE(0x0001 | 0x0010 | 0x0200 | 0x0800, 24)
  sb.writeUInt16LE(1, 26)
  sb.writeUInt16LE(4, 28)
  sb.writeUInt16LE(0, 30)
  sb.writeBigUInt64LE(rootNode.ref, 32)
  sb.writeBigUInt64LE(BigInt(bytesUsed), 40)
  sb.writeBigUInt64LE(BigInt(idTable), 48)
  sb.writeBigUInt64LE(0xffffffffffffffffn, 56)
  sb.writeBigUInt64LE(BigInt(inodeTable), 64)
  sb.writeBigUInt64LE(BigInt(dirTable), 72)
  sb.writeBigUInt64LE(BigInt(fragTable), 80)
  sb.writeBigUInt64LE(0xffffffffffffffffn, 88)
  fs.writeSync(fd, sb, 0, 96, base)

  // Pad to 4 KiB like mksquashfs (the padding is not part of bytes_used).
  const padded = Math.ceil(bytesUsed / 4096) * 4096
  if (padded > bytesUsed) fs.writeSync(fd, Buffer.alloc(padded - bytesUsed), 0, padded - bytesUsed, base + bytesUsed)
  return padded
}
