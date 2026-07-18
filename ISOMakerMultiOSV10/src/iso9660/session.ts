import { getNodeAtPath, listChildren, normalizeKey, openIso, readIsoFile } from './reader'
import type { IsoDirNode, IsoFlatEntry, IsoNode, OpenIsoResult } from './types'
import { writeIso, type WriteProgress } from './writer'

export class IsoEditSession {
  readonly original: Blob
  volumeLabel: string
  root: IsoDirNode
  dirty = false
  private entriesCache: IsoFlatEntry[] = []

  private constructor(original: Blob, opened: OpenIsoResult) {
    this.original = original
    this.volumeLabel = opened.volumeLabel
    this.root = cloneTree(opened.root)
    this.entriesCache = opened.entries
  }

  static async open(file: Blob): Promise<IsoEditSession> {
    const opened = await openIso(file)
    return new IsoEditSession(file, opened)
  }

  get entries(): IsoFlatEntry[] {
    return this.entriesCache
  }

  list(dirPath: string): IsoFlatEntry[] {
    return listChildren(this.root, dirPath)
  }

  async readFile(path: string): Promise<Blob> {
    const node = getNodeAtPath(this.root, path)
    if (!node || node.kind !== 'file') {
      throw new Error(`파일이 없습니다: ${path}`)
    }
    if (node.source.type === 'blob') return node.source.blob
    if (node.source.type === 'unavailable') {
      throw new Error(node.source.reason)
    }
    return readIsoFile(node.source.iso, node.source.extents, node.source.blockSize)
  }

  remove(path: string): void {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) throw new Error('루트는 삭제할 수 없습니다.')
    const name = parts[parts.length - 1]!
    const parentPath = parts.slice(0, -1).join('/')
    const parent = getNodeAtPath(this.root, parentPath)
    if (!parent || parent.kind !== 'dir') throw new Error(`경로가 없습니다: ${path}`)
    if (!parent.children.delete(normalizeKey(name))) {
      throw new Error(`항목이 없습니다: ${path}`)
    }
    this.dirty = true
    this.refreshEntries()
  }

  async addFiles(dirPath: string, files: ArrayLike<{ name: string; size: number } & Blob>): Promise<void> {
    const parent = getNodeAtPath(this.root, dirPath)
    if (!parent || parent.kind !== 'dir') throw new Error(`폴더가 없습니다: ${dirPath || '/'}`)

    for (const file of Array.from(files)) {
      const name = file.name
      parent.children.set(normalizeKey(name), {
        kind: 'file',
        name,
        size: file.size,
        source: { type: 'blob', blob: file },
      })
    }
    this.dirty = true
    this.refreshEntries()
  }

  mkdir(dirPath: string, name: string): void {
    const parent = getNodeAtPath(this.root, dirPath)
    if (!parent || parent.kind !== 'dir') throw new Error(`폴더가 없습니다: ${dirPath || '/'}`)
    if (parent.children.has(normalizeKey(name))) {
      throw new Error(`이미 존재합니다: ${name}`)
    }
    parent.children.set(normalizeKey(name), {
      kind: 'dir',
      name,
      children: new Map(),
    })
    this.dirty = true
    this.refreshEntries()
  }

  rename(path: string, newName: string): void {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) throw new Error('루트 이름은 변경할 수 없습니다.')
    const oldName = parts[parts.length - 1]!
    const parentPath = parts.slice(0, -1).join('/')
    const parent = getNodeAtPath(this.root, parentPath)
    if (!parent || parent.kind !== 'dir') throw new Error(`경로가 없습니다: ${path}`)
    const node = parent.children.get(normalizeKey(oldName))
    if (!node) throw new Error(`항목이 없습니다: ${path}`)
    if (parent.children.has(normalizeKey(newName))) {
      throw new Error(`이미 존재합니다: ${newName}`)
    }
    parent.children.delete(normalizeKey(oldName))
    node.name = newName
    parent.children.set(normalizeKey(newName), node)
    this.dirty = true
    this.refreshEntries()
  }

  async exportIso(onProgress?: (p: WriteProgress) => void, signal?: AbortSignal): Promise<Blob> {
    return writeIso(this.root, this.volumeLabel, onProgress, signal)
  }

  private refreshEntries(): void {
    const entries: IsoFlatEntry[] = []
    walk(this.root, '', entries)
    entries.sort((a, b) => a.path.localeCompare(b.path))
    this.entriesCache = entries
  }
}

function walk(node: IsoDirNode, path: string, entries: IsoFlatEntry[]): void {
  for (const child of node.children.values()) {
    const childPath = path ? `${path}/${child.name}` : child.name
    if (child.kind === 'dir') {
      entries.push({ path: childPath, name: child.name, isDir: true, size: 0 })
      walk(child, childPath, entries)
    } else {
      entries.push({ path: childPath, name: child.name, isDir: false, size: child.size })
    }
  }
}

function cloneTree(node: IsoDirNode): IsoDirNode {
  const copy: IsoDirNode = { kind: 'dir', name: node.name, children: new Map() }
  for (const [key, child] of node.children) {
    copy.children.set(key, cloneNode(child))
  }
  return copy
}

function cloneNode(node: IsoNode): IsoNode {
  if (node.kind === 'dir') return cloneTree(node)
  return {
    kind: 'file',
    name: node.name,
    size: node.size,
    source: node.source,
  }
}
