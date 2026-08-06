import fs from 'node:fs/promises'
import path from 'node:path'
import type { FileEntry, IndexStatus, SearchOptions } from '../src/shared.js'
import { listDirectory } from './fileSystem.js'

export class SearchIndexService {
  private entries = new Map<string, FileEntry>()
  private abortController: AbortController | null = null
  private indexedCount = 0
  private state: IndexStatus['state'] = 'not-built'
  private lastBuiltMs: number | null = null

  constructor(private readonly rootsProvider: () => Promise<string[]>) {}

  getStatus(): IndexStatus {
    return {
      state: this.state,
      count: this.entries.size,
      indexedCount: this.state === 'building' ? this.indexedCount : this.entries.size,
      lastBuiltMs: this.lastBuiltMs,
    }
  }

  cancel() {
    this.abortController?.abort()
  }

  async rebuild(onStatus?: (status: IndexStatus) => void) {
    this.cancel()
    const abortController = new AbortController()
    this.abortController = abortController
    this.state = 'building'
    this.indexedCount = 0
    onStatus?.(this.getStatus())

    const nextEntries = new Map<string, FileEntry>()
    try {
      for (const root of await this.rootsProvider()) {
        if (abortController.signal.aborted) break
        await this.scanRoot(root, nextEntries, abortController.signal, onStatus)
      }

      if (!abortController.signal.aborted) {
        this.entries = nextEntries
        this.lastBuiltMs = Date.now()
      }
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null
        this.state = this.entries.size > 0 ? 'ready' : 'not-built'
        onStatus?.(this.getStatus())
      }
    }
  }

  search(options: SearchOptions) {
    const matcher = createMatcher(options.pattern, options)
    const rootPrefix = path.resolve(options.rootPath)
    const results: FileEntry[] = []

    for (const entry of this.entries.values()) {
      if (results.length >= 2000) break
      if (entry.kind === 'directory' && !options.includeFolders) continue
      if (!path.resolve(entry.fullPath).startsWith(rootPrefix)) continue
      if (matcher(entry.name)) results.push(entry)
    }

    return results.sort((a, b) => a.name.localeCompare(b.name))
  }

  private async scanRoot(root: string, target: Map<string, FileEntry>, signal: AbortSignal, onStatus?: (status: IndexStatus) => void) {
    const pending = [root]
    while (pending.length > 0 && !signal.aborted) {
      const current = pending.pop()!
      let listing
      try {
        listing = await listDirectory(current)
      } catch {
        continue
      }

      for (const entry of listing.entries) {
        if (signal.aborted) break
        target.set(entry.fullPath, entry)
        this.indexedCount += 1
        if (entry.kind === 'directory' && !(await isSymbolicLink(entry.fullPath))) pending.push(entry.fullPath)
        if ((this.indexedCount & 0x0fff) === 0) onStatus?.(this.getStatus())
      }
    }
  }
}

async function isSymbolicLink(targetPath: string) {
  try {
    return (await fs.lstat(targetPath)).isSymbolicLink()
  } catch {
    return true
  }
}

function createMatcher(pattern: string, options: Pick<SearchOptions, 'caseSensitive' | 'useRegex'>) {
  if (options.useRegex) {
    const regex = new RegExp(pattern, options.caseSensitive ? 'u' : 'iu')
    return (value: string) => regex.test(value)
  }

  const normalizedPattern = options.caseSensitive ? pattern : pattern.toLowerCase()
  const regexPattern = normalizedPattern.includes('*') || normalizedPattern.includes('?')
    ? `^${escapeRegex(normalizedPattern).replaceAll('\\*', '.*').replaceAll('\\?', '.')}$`
    : null
  const wildcard = regexPattern ? new RegExp(regexPattern, options.caseSensitive ? 'u' : 'iu') : null

  return (value: string) => {
    const comparable = options.caseSensitive ? value : value.toLowerCase()
    return wildcard ? wildcard.test(comparable) : comparable.includes(normalizedPattern)
  }
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}
