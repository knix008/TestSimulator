// Tiny static file server for the web build and for development.
//
//   npm run serve                 serves the project folder (live sources)
//   npm run serve -- dist/web     serves the web build
//   PORT=9000 npm run serve       another port (default 8642)
//
// No caching, so a reload always picks up edited modules.
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const base = path.resolve(root, process.argv[2] || '.')
const port = Number(process.env.PORT) || 8642

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mycircuit': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip'
}

if (!existsSync(base)) {
  console.error(`serve: ${base} does not exist (run npm run build:web first?)`)
  process.exit(1)
}

const server = http.createServer((req, res) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    res.writeHead(400).end('bad request')
    return
  }
  let file = path.resolve(base, `.${pathname}`)
  if (file !== base && !file.startsWith(base + path.sep)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end(`not found: ${pathname}`)
    return
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': statSync(file).size,
    'Cache-Control': 'no-store, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
})

server.listen(port, () => {
  console.log(`MyCircuit: serving ${path.relative(root, base) || '.'} at http://localhost:${port}/  (Ctrl+C to stop)`)
})
