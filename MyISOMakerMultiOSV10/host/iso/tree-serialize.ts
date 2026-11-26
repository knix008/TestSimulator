import type { IsoTreeNode } from '../../src/iso9660/tree-types'
import type { IsoDirNode, IsoNode } from '../../src/iso9660/types'

export function serializeChildren(dir: IsoDirNode, parentPath: string): IsoTreeNode[] {
  return [...dir.children.values()]
    .map((child) => serializeNode(child, parentPath))
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
}

function serializeNode(node: IsoNode, parentPath: string): IsoTreeNode {
  const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name
  if (node.kind === 'dir') {
    return {
      name: node.name,
      path: nodePath,
      isDir: true,
      size: 0,
      children: serializeChildren(node, nodePath),
    }
  }
  return {
    name: node.name,
    path: nodePath,
    isDir: false,
    size: node.size,
  }
}
