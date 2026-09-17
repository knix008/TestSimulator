// Records what went into this build so the About window can show it.
//
// Run before every build; the result is imported by the renderer, so the
// information travels with the bundle rather than being guessed at runtime.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    // A source drop with no repository is perfectly valid.
    return ''
  }
}

const info = {
  name: pkg.productName ?? pkg.name,
  version: pkg.version,
  description: pkg.description ?? '',
  author: pkg.author ?? '',
  buildTime: new Date().toISOString(),
  commit: git('rev-parse', '--short', 'HEAD'),
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  // The toolchain the bundle was produced with.
  node: process.versions.node,
  electron: pkg.devDependencies?.electron?.replace(/^[^\d]*/, '') ?? '',
  react: pkg.dependencies?.react?.replace(/^[^\d]*/, '') ?? '',
  vite: pkg.devDependencies?.vite?.replace(/^[^\d]*/, '') ?? '',
}

const target = path.join(root, 'src', 'build-info.json')
fs.writeFileSync(target, `${JSON.stringify(info, null, 2)}\n`)
console.log(`Build info written to ${path.relative(root, target)} (${info.version}${info.commit ? ` @ ${info.commit}` : ''}).`)
