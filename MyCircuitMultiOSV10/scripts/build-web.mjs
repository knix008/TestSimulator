// Builds the web version into dist/web.
//
//   npm run build:web      then   npm run serve -- dist/web
//
// There is no bundler: the browser build is the very same index.html, style,
// ES modules (src, with three.js vendored in src/vendor), icons and samples the
// desktop app loads, copied as they are. Any static file server works; the page
// must be served over http(s) (ES modules do not load from file://).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'dist', 'web')
const ENTRIES = ['index.html', 'style', 'src', 'assets', 'sample', 'docs']

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

let files = 0
let bytes = 0
function count(target) {
  const st = statSync(target)
  if (st.isDirectory()) for (const name of readdirSync(target)) count(path.join(target, name))
  else { files += 1; bytes += st.size }
}

const copied = []
for (const entry of ENTRIES) {
  const from = path.join(root, entry)
  if (!existsSync(from)) continue
  cpSync(from, path.join(out, entry), {
    recursive: true,
    // Editor leftovers and test pages are not part of the site.
    filter: (src) => !/(^|[\\/])(\.DS_Store|Thumbs\.db|.*~)$/.test(src)
  })
  count(path.join(out, entry))
  copied.push(entry)
}

writeFileSync(path.join(out, 'README.txt'), [
  'MyCircuit 10.0 - web build',
  '',
  'Serve this folder with any static web server and open index.html, e.g.',
  '  npm run serve -- dist/web        (from the project folder, http://localhost:8642)',
  '  npx http-server dist/web',
  '  python -m http.server -d dist/web',
  '',
  'ES modules do not load from file:// URLs, so double-clicking index.html does not work.',
  ''
].join('\n'), 'utf8')

console.log(`build-web: ${copied.join(', ')} -> dist/web (${files} files, ${(bytes / 1048576).toFixed(1)} MB)`)
