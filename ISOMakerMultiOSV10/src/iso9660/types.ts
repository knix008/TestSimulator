export type IsoExtent = {
  lba: number
  size: number
}

export type IsoFileSource =
  | { type: 'blob'; blob: Blob }
  | { type: 'iso'; iso: Blob; extents: IsoExtent[]; blockSize: number }
  | { type: 'path'; absolutePath: string }
  | { type: 'unavailable'; reason: string }

export type IsoDirNode = {
  kind: 'dir'
  name: string
  children: Map<string, IsoNode>
}

export type IsoFileNode = {
  kind: 'file'
  name: string
  size: number
  source: IsoFileSource
}

export type IsoNode = IsoDirNode | IsoFileNode

export type IsoFlatEntry = {
  path: string
  name: string
  isDir: boolean
  size: number
}

export type OpenIsoResult = {
  volumeLabel: string
  root: IsoDirNode
  entries: IsoFlatEntry[]
  totalBytes: number
}
