import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = process.cwd()
const releaseDir = join(rootDir, 'release')

if (!existsSync(releaseDir)) {
  throw new Error('release folder does not exist. Run npm run build:win first.')
}

const installers = readdirSync(releaseDir)
  .filter(name => /setup.*\.exe$/i.test(name))
  .map(name => ({ name, path: join(releaseDir, name), modifiedMs: statSync(join(releaseDir, name)).mtimeMs }))
  .sort((left, right) => right.modifiedMs - left.modifiedMs)

const installer = installers[0]

if (!installer) {
  throw new Error('Windows installer was not found in the release folder.')
}

const destination = join(rootDir, installer.name)
copyFileSync(installer.path, destination)
console.log(`Copied installer to project root: ${installer.name}`)