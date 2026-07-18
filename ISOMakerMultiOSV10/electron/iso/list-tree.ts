import { openAsBlob } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import { openIso } from '../../src/iso9660/reader'
import type { IsoTreeNode, IsoTreeResult } from '../../src/iso9660/tree-types'
import { serializeChildren } from './tree-serialize'

export type { IsoTreeNode, IsoTreeResult }

export async function listIsoTree(isoPath: string): Promise<IsoTreeResult> {
  const resolved = path.resolve(isoPath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`ISO file not found: ${resolved}`)
  }

  const blob = await openAsBlob(resolved)
  const opened = await openIso(blob)
  const root = serializeChildren(opened.root, '')

  return {
    volumeLabel: opened.volumeLabel,
    totalBytes: opened.totalBytes,
    entryCount: opened.entries.length,
    root,
  }
}
