import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const files = [
  'node_modules/three-bvh-csg/src/core/Brush.js',
  'node_modules/three-bvh-csg/build/index.module.js',
  'node_modules/three-bvh-csg/build/index.umd.cjs'
]

for (const relative of files) {
  const file = path.join(root, relative)
  if (!fs.existsSync(file)) continue
  const source = fs.readFileSync(file, 'utf8')
  const next = source.replaceAll('maxLeafSize: 3', 'targetLeafSize: 3').replaceAll('maxLeafSize:3', 'targetLeafSize:3')
  if (next !== source) fs.writeFileSync(file, next)
}
