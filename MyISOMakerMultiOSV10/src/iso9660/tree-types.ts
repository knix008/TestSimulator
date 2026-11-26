export type IsoTreeNode = {
  name: string
  path: string
  isDir: boolean
  size: number
  children?: IsoTreeNode[]
}

export type IsoTreeResult = {
  volumeLabel: string
  totalBytes: number
  entryCount: number
  root: IsoTreeNode[]
}
